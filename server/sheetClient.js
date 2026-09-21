/**
 * Server-side proxy to the bound Apps Script web app.
 * The secret stays in the Mini environment and is never sent to the browser.
 */

import { leadFromSheetRow, mapDataToLeads } from '../shared/inboundMeta.js';
import { leadPatchToFields } from '../shared/sheetWrite.js';

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

async function fetchFollowing(url, { method = 'GET', body, fetchImpl }) {
  let currentUrl = String(url);
  let currentMethod = method;
  let currentBody = body;
  const fetchFn = fetchImpl || globalThis.fetch;

  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetchFn(currentUrl, {
      method: currentMethod,
      redirect: 'manual',
      cache: 'no-store',
      headers: currentBody
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body: currentBody,
      signal: AbortSignal.timeout(25000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new SheetError('Redireccionamento do Apps Script sem destino');
      currentUrl = new URL(location, currentUrl).toString();
      if (response.status === 303) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
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

  let response;
  try {
    response = await fetchFollowing(endpoint, {
      method,
      body: body ? JSON.stringify({ ...body, action }) : undefined,
      fetchImpl,
    });
  } catch (error) {
    if (error instanceof SheetError) throw error;
    throw new SheetError(`Folha Inbound META indisponível (${redact(error.message || error)})`);
  }

  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('<')) {
    throw new SheetError('O Apps Script devolveu HTML. Publique como aplicação web «Qualquer pessoa» com URL /exec.');
  }

  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new SheetError('Resposta inválida da folha Inbound META');
  }

  if (!payload || payload.ok === false) {
    const message = String(payload?.error || `Folha Inbound META HTTP ${response.status}`);
    const statusCode = /não encontrada|nao encontrada/i.test(message) ? 404 : 502;
    throw new SheetError(message, statusCode);
  }

  return payload;
}

export async function listInboundLeads(options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) return { leads: [], configured: false };
  const payload = await gasRequest({ action: 'leads', method: 'GET', ...options });
  return { leads: leadsFromPayload(payload), configured: true };
}

export async function getInboundLead(id, options = {}) {
  const { leads } = await listInboundLeads(options);
  return leads.find((lead) => String(lead.id) === String(id)) || null;
}

export async function updateInboundLead(id, updates, options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) throw new SheetError('Apps Script não configurado', 503);
  const patch = leadPatchToFields(updates, options.now);
  if (!patch.fields.length && !patch.noteSet && !patch.status) {
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
