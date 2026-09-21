import {
  matchInboundIndex,
  mergeInboundLead,
  newLeadFromInbound,
  patchesFromCsv,
  sheetCsvUrl,
  leadFromRecord,
} from '../shared/inboundMeta.js';
import { listLeads, nextLeadId, writeLeads } from './store.js';

function rowsFromScriptPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.leads)) return payload.leads;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  return null;
}

export async function fetchInboundPatches(env = process.env) {
  if (env.SCRIPT_URL) {
    const response = await fetch(env.SCRIPT_URL);
    if (!response.ok) {
      throw new Error(`SCRIPT_URL respondeu ${response.status}`);
    }
    const payload = await response.json();
    const rows = rowsFromScriptPayload(payload);
    if (!rows) throw new Error('SCRIPT_URL não devolveu uma lista de leads');
    return rows.map(leadFromRecord).filter(Boolean);
  }

  const response = await fetch(sheetCsvUrl(env));
  if (!response.ok) {
    throw new Error(`Sheet CSV respondeu ${response.status}`);
  }
  const text = await response.text();
  if (text.trim().startsWith('<')) {
    throw new Error('A Sheet não devolveu CSV. Defina SCRIPT_URL com um Apps Script web app, ou META_SHEET_CSV_URL.');
  }
  return patchesFromCsv(text);
}

export function applyInboundPatches(leads, patches) {
  const next = leads.map((lead) => ({ ...lead }));
  let created = 0;
  let updated = 0;

  for (const patch of patches) {
    if (!patch) continue;
    const index = matchInboundIndex(next, patch);
    if (index === -1) {
      next.unshift(newLeadFromInbound(patch, nextLeadId(next)));
      created += 1;
    } else {
      next[index] = mergeInboundLead(next[index], patch);
      updated += 1;
    }
  }

  return { leads: next, created, updated };
}

export async function syncInboundMeta({ csv, rows, env = process.env } = {}) {
  let patches;
  if (typeof csv === 'string') patches = patchesFromCsv(csv);
  else if (Array.isArray(rows)) patches = rows.map(leadFromRecord).filter(Boolean);
  else patches = await fetchInboundPatches(env);

  const current = await listLeads();
  const result = applyInboundPatches(current, patches);
  await writeLeads(result.leads);
  return {
    ok: true,
    created: result.created,
    updated: result.updated,
    count: result.leads.length,
    leads: result.leads,
  };
}
