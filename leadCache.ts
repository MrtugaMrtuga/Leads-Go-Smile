import { Lead } from './types';

const KEY = 'gosmile-leads-swr-v1';

export function readCachedLeads(): Lead[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { leads?: unknown };
    if (!parsed || !Array.isArray(parsed.leads)) return null;
    return parsed.leads as Lead[];
  } catch {
    return null;
  }
}

export function writeCachedLeads(leads: Lead[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), leads }));
  } catch {
    /* private mode or quota — the sheet stays the source of truth */
  }
}
