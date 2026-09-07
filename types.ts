export type LeadStatus = 'new' | 'contacted' | 'discarded' | 'scheduled' | 'positive' | 'completed' | 'paid';

export interface Lead {
  id: string;
  externalId: string;
  name: string;
  phone: string;
  email: string;
  timestamp: string;
  status: LeadStatus;
  isContacted: boolean;
  value?: number;
  commission?: number;
  notes?: string;
  doctor?: string;
  appointmentDate?: string;
  source?: string;
}

export type AppView = 'resumo' | 'inbox' | 'lixo' | 'visitas' | 'contas' | 'admin';

export interface AdminSettings {
  commissionPercent: number;
}

export interface LeadUpdatePayload {
  row_number?: string;
  nome?: string;
  name?: string;
  lead_id?: string;
  estado?: string;
  comentario?: string;
  medico?: string;
  data_consulta?: string;
  valor_fechado?: number;
  status?: LeadStatus;
  data_tratamento?: string;
}
