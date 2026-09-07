import { AdminSettings, Lead } from './types';

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

export function fetchLeads() {
  return request<Lead[]>('/api/leads');
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
  return request<{ ok: boolean; app: string; host: string }>('/api/health');
}
