import { mapSheetCsv, SHEET_ID, SHEET_TAB } from '../shared/inboundMeta.js';

export { SHEET_ID, SHEET_TAB };

export function sheetCsvUrl(sheetId = process.env.INBOUND_META_SHEET_ID || SHEET_ID, sheetTab = process.env.INBOUND_META_SHEET_TAB || SHEET_TAB) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', sheetTab);
  return url.toString();
}

export async function fetchInboundMetaLeads(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(sheetCsvUrl(), {
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`Folha Inbound META HTTP ${response.status}`);
  }
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('<')) {
    throw new Error('A folha Inbound META não devolveu CSV. A partilha por link (ver) tem de estar activa.');
  }
  return mapSheetCsv(text);
}
