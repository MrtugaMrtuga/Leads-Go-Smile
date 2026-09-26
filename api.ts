import { AdminSettings, Lead } from './types';

export type LeadsCacheHeader = 'hit' | 'stale' | 'miss' | 'unconfigured';

export interface InboundMetaSyncResult {
  ok: boolean;
  sheetId?: string;
  sheetTab?: string;
  imported?: number;
  updated?: number;
  count?: number;
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Erro ${response.status} em ${path}`);
  }
  return data as T;
}

export async function fetchLeads(options?: { fresh?: boolean }): Promise<{ leads: Lead[]; cache: LeadsCacheHeader }> {
  const path = options?.fresh ? '/api/leads?fresh=1' : '/api/leads';
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String(data.error) : '';
    throw new Error(message || `Erro ${response.status} em ${path}`);
  }
  const header = response.headers.get('X-Leads-Cache') || '';
  const cache: LeadsCacheHeader =
    header === 'hit' || header === 'stale' || header === 'miss' || header === 'unconfigured' ? header : 'miss';
  return { leads: data as Lead[], cache };
}

export function syncInboundMeta() {
  return request<InboundMetaSyncResult>('/api/sync/inbound-meta', { method: 'POST' });
}

export function fetchLead(id: string) {
  return request<Lead>(`/api/leads/${encodeURIComponent(id)}`);
}

export function createLead(payload: Partial<Lead>) {
  return request<Lead>('/api/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateLead(id: string, payload: Partial<Lead> & Record<string, unknown>) {
  return request<Lead>(`/api/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteLead(id: string) {
  return request<void>(`/api/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchSettings() {
  return request<AdminSettings>('/api/settings');
}

export function saveSettings(payload: AdminSettings) {
  return request<AdminSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function sendReminder(lead: Lead) {
  return request<{ id: string }>(`/api/reminders`, {
    method: 'POST',
    body: JSON.stringify({ leadId: lead.id }),
  });
}

export function fetchHealth() {
  return request<{ ok: boolean; app: string; host: string; storage?: string; configured?: boolean; sheetTab?: string }>('/api/health');
}
