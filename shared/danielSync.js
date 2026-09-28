/**
 * Pure Daniel → EVOB append plan.
 * The Apps Script copy is backend-gas/SyncDaniel.gs (same rules, Code.gs helpers).
 *
 * A candidate has Nome filled and column A (timestamp) on or after CONTACT_CUTOFF_DAY
 * in Europe/Lisbon. Data Contacto does not qualify a row.
 * Existing EVOB rows are never updated. A match on syncLeadKey is skipped.
 */

import {
  COLUMN_DEFS,
  CONTACT_CUTOFF_DAY,
  DANIEL_SHEET_ID,
  DANIEL_SHEET_TAB,
  DANIEL_SHEET_TAB_FALLBACK,
  SHEET_ID,
  SHEET_TAB,
  contactDayFromRaw,
  headerIndexForDef,
  rawFieldsFromSheetRow,
  syncLeadKey,
} from './inboundMeta.js';

function defByKey(key) {
  return COLUMN_DEFS.find((def) => def.key === key);
}

function rowValues(row) {
  if (Array.isArray(row)) return row;
  if (row && Array.isArray(row.values)) return row.values;
  return [];
}

function rowNumber(row, index) {
  if (row && !Array.isArray(row) && Number(row.row) > 0) return Number(row.row);
  return index + 2;
}

function emptySummary() {
  return {
    ok: true,
    scanned: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    errorSamples: [],
    cutoff: CONTACT_CUTOFF_DAY,
    timeZone: 'Europe/Lisbon',
    danielSheetId: DANIEL_SHEET_ID,
    danielTab: DANIEL_SHEET_TAB,
    danielTabFallback: DANIEL_SHEET_TAB_FALLBACK,
    evobSheetId: SHEET_ID,
    evobTab: SHEET_TAB,
    append: [],
  };
}

/**
 * @returns {{
 *   ok: boolean,
 *   scanned: number,
 *   inserted: number,
 *   skipped: number,
 *   errors: number,
 *   errorSamples: string[],
 *   append: string[][],
 *   error?: string,
 * }}
 */
export function planDanielSync({ danielHeaders = [], danielRows = [], evobHeaders = [], evobRows = [] } = {}) {
  const summary = emptySummary();
  const fail = (message) => {
    summary.ok = false;
    summary.errors += 1;
    summary.error = message;
    summary.errorSamples.push(message);
    return summary;
  };

  const nomeDef = defByKey('nome');
  const stampDef = defByKey('timestamp_col');
  if (headerIndexForDef(danielHeaders, nomeDef) < 0 || headerIndexForDef(danielHeaders, stampDef) < 0) {
    return fail('A aba de Daniel não tem Nome ou a coluna de timestamp (cabeçalho 4).');
  }
  if (headerIndexForDef(evobHeaders, nomeDef) < 0 || headerIndexForDef(evobHeaders, stampDef) < 0) {
    return fail('A aba EVOB não tem Nome ou a coluna de timestamp (cabeçalho 4).');
  }

  const seen = new Set();
  evobRows.forEach((row) => {
    const raw = rawFieldsFromSheetRow(evobHeaders, rowValues(row));
    if (!String(raw.nome || '').trim()) return;
    const day = contactDayFromRaw(raw);
    seen.add(syncLeadKey({ nome: raw.nome, telefone: raw.telefone, email: raw.email, contactDay: day }));
  });

  const width = evobHeaders.length;
  const nomeIndex = headerIndexForDef(evobHeaders, nomeDef);
  const stampIndex = headerIndexForDef(evobHeaders, stampDef);

  danielRows.forEach((row, index) => {
    let raw;
    try {
      raw = rawFieldsFromSheetRow(danielHeaders, rowValues(row));
    } catch (error) {
      summary.errors += 1;
      if (summary.errorSamples.length < 8) {
        summary.errorSamples.push(`linha ${rowNumber(row, index)}: ${error.message || error}`);
      }
      return;
    }

    if (!String(raw.nome || '').trim()) return;
    const day = contactDayFromRaw(raw);
    if (!day || day < CONTACT_CUTOFF_DAY) return;

    summary.scanned += 1;
    const key = syncLeadKey({
      nome: raw.nome,
      telefone: raw.telefone,
      email: raw.email,
      contactDay: day,
    });
    if (seen.has(key)) {
      summary.skipped += 1;
      return;
    }

    const out = evobHeaders.map(() => '');
    COLUMN_DEFS.forEach((def) => {
      const value = String(raw[def.key] || '').trim();
      if (!value) return;
      const col = headerIndexForDef(evobHeaders, def);
      if (col < 0 || col >= width) return;
      out[col] = value;
    });

    if (!String(out[nomeIndex] || '').trim() || !String(out[stampIndex] || '').trim()) {
      summary.errors += 1;
      if (summary.errorSamples.length < 8) {
        summary.errorSamples.push(`linha ${rowNumber(row, index)}: Nome ou timestamp não mapeou para a EVOB`);
      }
      return;
    }

    summary.append.push(out);
    seen.add(key);
    summary.inserted += 1;
  });

  return summary;
}
