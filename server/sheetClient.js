/**
 * Server-side proxy to the bound Apps Script web app.
 * The secret stays in the Mini environment and is never sent to the browser.
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEET_TAB, filterLeadsForApp, leadFromSheetRow, mapDataToLeads } from '../shared/inboundMeta.js';
import { leadPatchToFields, PipelineError } from '../shared/sheetWrite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const DEFAULT_LIST_TTL_MS = 45_000;

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

/** Last good sheet list. Not the source of truth — the sheet is. */
let listCache = null;
let revision = 0;
let revalidateFlight = null;
let hydrateFlight = null;
let persistQueue = Promise.resolve();

function dataDir() {
  return process.env.LEADS_DATA_DIR || join(__dirname, '..', 'data');
}

function cacheFile() {
  return join(dataDir(), 'leads-cache.json');
}

function cacheTtlMs() {
  const raw = Number(process.env.LEADS_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_LIST_TTL_MS;
}

function isFresh(cache) {
  return Boolean(cache && Array.isArray(cache.leads) && Date.now() - cache.at < cacheTtlMs());
}

async function hydrateFromDisk() {
  if (listCache) return;
  if (!hydrateFlight) {
    hydrateFlight = (async () => {
      try {
        const raw = JSON.parse(await readFile(cacheFile(), 'utf8'));
        const at = Number(raw?.at);
        if (!listCache && raw && Array.isArray(raw.leads) && Number.isFinite(at)) {
          listCache = { at, leads: raw.leads };
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') console.error('leads-cache', error.message);
      }
    })();
  }
  await hydrateFlight;
}

function persistCache(snapshot) {
  const file = cacheFile();
  persistQueue = persistQueue
    .then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(
        tmp,
        `${JSON.stringify({ at: snapshot.at, savedAt: new Date(snapshot.at).toISOString(), leads: snapshot.leads })}\n`,
        'utf8'
      );
      await rename(tmp, file);
    })
    .catch((error) => {
      console.error('leads-cache', error.message);
    });
}

function commitCache(leads) {
  const snapshot = { at: Date.now(), leads };
  listCache = snapshot;
  persistCache(snapshot);
  return snapshot;
}

function revalidate(gasOptions) {
  const seen = revision;
  if (revalidateFlight) {
    return revalidateFlight.then(() => {
      if (seen !== revision) return revalidate(gasOptions);
      return listCache;
    });
  }

  const task = (async () => {
    try {
      const payload = await gasRequest({ action: 'leads', method: 'GET', ...gasOptions });
      const leads = filterLeadsForApp(leadsFromPayload(payload));
      if (seen !== revision) return listCache;
      return commitCache(leads);
    } finally {
      revalidateFlight = null;
    }
  })();

  revalidateFlight = task;
  return task;
}

export async function clearLeadsListCache() {
  revision += 1;
  listCache = null;
  hydrateFlight = null;
  revalidateFlight = null;
  await persistQueue;
  await rm(cacheFile(), { force: true });
}

/** Fold a sheet write into the warm list so the next GET does not serve the pre-write snapshot. */
export function rememberInboundLead(lead) {
  if (!lead || typeof lead !== 'object') return;
  revision += 1;
  if (!listCache || !Array.isArray(listCache.leads)) return;
  const without = listCache.leads.filter((item) => String(item.id) !== String(lead.id));
  commitCache(filterLeadsForApp([...without, lead]));
}

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
        throw new SheetError(`Folha «${SHEET_TAB}» indisponível (${redact(error.message || error)})`);
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
        lastError = new SheetError(`Resposta inválida da folha «${SHEET_TAB}»`);
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      if (!payload || payload.ok === false) {
        const message = String(payload?.error || `Folha «${SHEET_TAB}» HTTP ${response.status}`);
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

    throw lastError || new SheetError(`Folha «${SHEET_TAB}» indisponível`);
  });
}

export async function listInboundLeads(options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) return { leads: [], configured: false, cache: 'unconfigured' };

  const { fresh = false, bypassCache = false, ...gasOptions } = options;
  await hydrateFromDisk();
  const hadCache = Boolean(listCache && Array.isArray(listCache.leads));

  if (!bypassCache && hadCache && isFresh(listCache)) {
    return { leads: listCache.leads, configured: true, cache: 'hit' };
  }

  if (!bypassCache && hadCache && !fresh) {
    void revalidate(gasOptions).catch((error) => {
      console.error('leads revalidate', error?.message || error);
    });
    return { leads: listCache.leads, configured: true, cache: 'stale' };
  }

  try {
    const snapshot = await revalidate(gasOptions);
    if (!snapshot || !Array.isArray(snapshot.leads)) {
      throw new SheetError(`Folha «${SHEET_TAB}» indisponível`);
    }
    return { leads: snapshot.leads, configured: true, cache: hadCache ? 'hit' : 'miss' };
  } catch (error) {
    if (hadCache && listCache && Array.isArray(listCache.leads)) {
      return { leads: listCache.leads, configured: true, cache: 'stale' };
    }
    throw error;
  }
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
