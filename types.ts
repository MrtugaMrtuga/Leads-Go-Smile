export type LeadStatus = 'new' | 'contacted' | 'processing' | 'discarded' | 'scheduled' | 'positive' | 'completed' | 'paid';

export interface LeadFormField {
  key: string;
  label: string;
  value: string;
}

export interface Lead {
  id: string;
  externalId: string;
  name: string;
  phone: string;
  email: string;
  timestamp: string;
  status: LeadStatus;
  isContacted: boolean;
  discardReason?: string;
  closedAt?: string;
  value?: number;
  commission?: number;
  notes?: string;
  doctor?: string;
  appointmentDate?: string;
  source?: string;
  sourceTab?: string;
  formFields?: LeadFormField[];
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
  /** Add comentario under the existing free text. Does not replace it. */
  noteAppend?: boolean;
  /** User cleared the note box. Empty comentario then wipes the free text. */
  noteClear?: boolean;
  noteSet?: boolean;
  medico?: string;
  data_consulta?: string;
  valor_fechado?: number;
  status?: LeadStatus;
  data_tratamento?: string;
  motivo?: string;
}
