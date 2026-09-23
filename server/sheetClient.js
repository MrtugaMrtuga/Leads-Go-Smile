/**
 * Server-side proxy to the bound Apps Script web app.
 * The secret stays in the Mini environment and is never sent to the browser.
 */

import { leadFromSheetRow, mapDataToLeads } from '../shared/inboundMeta.js';
import { leadPatchToFields, PipelineError } from '../shared/sheetWrite.js';

const PLACEHOLDER = /replace_with|changeme|your[-_ ]?secret/i;

export class SheetError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'SheetError';
    this.statusCode = statusCode;
  }
}

export function appsScriptConfig(env = process.env) {
  const url = String(env.APPS_SCRIPT_URL || '').trim();
  const secret = String(env.APPS_SCRIPT_SECRET || '').trim();
  const configured = url.startsWith('https://') && secret.length >= 8 && !PLACEHOLDER.test(url) && !PLACEHOLDER.test(secret);
  return { url, secret, configured };
}

function redact(value) {
  return String(value || '').replace(/([?&]secret=)[^&\s]+/gi, '$1***');
}

function leadsFromPayload(payload) {
  if (Array.isArray(payload?.headers) && Array.isArray(payload?.rows)) {
    return payload.rows
      .map((row) => leadFromSheetRow(payload.headers, row.values || [], Number(row?.row)))
      .filter(Boolean);
  }
  return mapDataToLeads(payload?.leads || payload?.data || []);
}

function leadFromPayload(payload) {
  if (payload?.headers && payload?.row && Array.isArray(payload.row.values)) {
    return leadFromSheetRow(payload.headers, payload.row.values, Number(payload.row.row));
  }
  const leads = leadsFromPayload(payload);
  if (leads.length === 1 && !Array.isArray(payload?.rows)) return leads[0];
  if (payload?.lead) {
    const [lead] = mapDataToLeads([payload.lead]);
    return lead || null;
  }
  return leads[0] || null;
}

const GAS_TIMEOUT_MS = Number(process.env.APPS_SCRIPT_TIMEOUT_MS || 55000);
const GAS_RETRIES = Number(process.env.APPS_SCRIPT_RETRIES || 2);
const LIST_CACHE_MS = Number(process.env.APPS_SCRIPT_LIST_CACHE_MS || 8000);

function isTransientFetchError(error) {
  const name = String(error?.name || '');
  const msg = String(error?.message || error || '');
  return name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted|fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(msg);
}

function isTransientSheetMessage(message) {
  return /HTML|indisponível|indisponivel|timeout|aborted|HTTP 5\d\d|Demasiados redireccionamentos/i.test(String(message || ''));
}

/** Serialize Apps Script calls — parallel stampede returns HTML 404 pages. */
let gasQueue = Promise.resolve();
function enqueueGas(task) {
  const run = gasQueue.then(task, task);
  gasQueue = run.then(() => undefined, () => undefined);
  return run;
}

let listCache = { at: 0, value: null };
let listInflight = null;

async function fetchFollowing(url, { method = 'GET', body, fetchImpl }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const upper = String(method || 'GET').toUpperCase();

  // GET: let undici follow redirects (same as curl -L). Manual hop for POST
  // so we never lose the body on Apps Script's 302→echo (GET-only) hop.
  if (upper === 'GET' && !body) {
    return fetchFn(String(url), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    });
  }

  let currentUrl = String(url);
  let currentMethod = upper;
  let currentBody = body;

  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetchFn(currentUrl, {
      method: currentMethod,
      redirect: 'manual',
      cache: 'no-store',
      headers: currentBody
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body: currentBody,
      signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new SheetError('Redireccionamento do Apps Script sem destino');
      currentUrl = new URL(location, currentUrl).toString();
      // After the first hop, Apps Script echo endpoints only allow GET.
      currentMethod = 'GET';
      currentBody = undefined;
      continue;
    }

    return response;
  }

  throw new SheetError('Demasiados redireccionamentos do Apps Script');
}

export async function gasRequest({ action, method = 'GET', body, fetchImpl, env = process.env } = {}) {
  const { url, secret, configured } = appsScriptConfig(env);
  if (!configured) throw new SheetError('Apps Script não configurado', 503);

  const endpoint = new URL(url);
  endpoint.searchParams.set('secret', secret);
  endpoint.searchParams.set('action', action);

  const attempts = Math.max(1, GAS_RETRIES + 1);

  return enqueueGas(async () => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await fetchFollowing(endpoint, {
          method,
          body: body ? JSON.stringify({ ...body, action }) : undefined,
          fetchImpl,
        });
      } catch (error) {
        if (error instanceof SheetError) {
          lastError = error;
          if (attempt < attempts && isTransientSheetMessage(error.message)) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          throw error;
        }
        lastError = error;
        if (attempt < attempts && isTransientFetchError(error)) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw new SheetError(`Folha Inbound META indisponível (${redact(error.message || error)})`);
      }

      const textBody = await response.text();
      const trimmed = textBody.trim();
      if (!trimmed || trimmed.startsWith('<')) {
        lastError = new SheetError('O Apps Script devolveu HTML. Publique como aplicação web «Qualquer pessoa» com URL /exec.');
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        lastError = new SheetError('Resposta inválida da folha Inbound META');
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      if (!payload || payload.ok === false) {
        const message = String(payload?.error || `Folha Inbound META HTTP ${response.status}`);
        const statusCode = /não encontrada|nao encontrada/i.test(message) ? 404 : 502;
        lastError = new SheetError(message, statusCode);
        if (attempt < attempts && statusCode >= 500) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      return payload;
    }

    throw lastError || new SheetError('Folha Inbound META indisponível');
  });
}

export async function listInboundLeads(options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) return { leads: [], configured: false };

  const now = Date.now();
  if (!options.bypassCache && listCache.value && now - listCache.at < LIST_CACHE_MS) {
    return { leads: listCache.value, configured: true };
  }
  if (!options.bypassCache && listInflight) {
    return listInflight;
  }

  const task = (async () => {
    const payload = await gasRequest({ action: 'leads', method: 'GET', ...options });
    const leads = leadsFromPayload(payload);
    listCache = { at: Date.now(), value: leads };
    return { leads, configured: true };
  })();

  listInflight = task.finally(() => {
    listInflight = null;
  });
  return listInflight;
}

export async function getInboundLead(id, options = {}) {
  const { leads } = await listInboundLeads(options);
  return leads.find((lead) => String(lead.id) === String(id)) || null;
}

export async function updateInboundLead(id, updates, options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) throw new SheetError('Apps Script não configurado', 503);
  let patch;
  try {
    patch = leadPatchToFields(updates, options.now);
  } catch (error) {
    if (error instanceof PipelineError) throw new SheetError(error.message, 400);
    throw error;
  }
  if (!patch.fields.length && !patch.noteSet && !patch.status && !patch.motivoSet && !patch.fechoSet) {
    throw new SheetError('Nada para actualizar', 400);
  }
  const payload = await gasRequest({
    action: 'update',
    method: 'POST',
    body: {
      id: String(id),
      status: patch.status,
      note: patch.note,
      noteSet: patch.noteSet,
      motivo: patch.motivo,
      motivoSet: patch.motivoSet,
      fecho: patch.fecho,
      fechoSet: patch.fechoSet,
      fechoClear: patch.fechoClear,
      fields: patch.fields,
    },
    ...options,
  });
  const lead = leadFromPayload(payload);
  if (!lead) throw new SheetError('Lead não encontrada', 404);
  return lead;
}

export async function createInboundLead(input, options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) throw new SheetError('Apps Script não configurado', 503);
  const name = String(input.name || input.nome || '').trim();
  if (!name) throw new SheetError('Nome é obrigatório', 400);
  const payload = await gasRequest({
    action: 'create',
    method: 'POST',
    body: {
      name,
      phone: input.phone || input.telefone || '',
      email: input.email || '',
      notes: input.notes || '',
      dataContacto: input.timestamp || new Date().toISOString(),
    },
    ...options,
  });
  const lead = leadFromPayload(payload);
  if (!lead) throw new SheetError('A folha não devolveu a lead criada');
  return lead;
}
