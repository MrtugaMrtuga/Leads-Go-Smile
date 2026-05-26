
export type LeadStatus = 'new' | 'contacted' | 'discarded' | 'scheduled' | 'positive' | 'completed' | 'paid';

export interface Lead {
  id: string;
  externalId: string;
  name: string; // Corresponde à Coluna C
  phone: string;
  email: string;
  timestamp: string; // ISO format
  status: LeadStatus;
  isContacted: boolean;
  value?: number; // Valor do orçamento fechado
  commission?: number;
  notes?: string;
  doctor?: string;
  appointmentDate?: string;
}

export type AppView = 'resumo' | 'inbox' | 'lixo' | 'visitas' | 'contas' | 'admin';

export interface AdminSettings {
  commissionPercent: number;
  dataUrl: string;
}

export interface LeadUpdatePayload {
  row_number: string;
  nome: string; // Compatibilidade fluxo antigo
  name?: string; // Compatibilidade tabela nova
  lead_id?: string;
  estado?: string;
  comentario?: string;
  medico?: string;
  data_consulta?: string;
  valor_fechado?: number;
  status: LeadStatus;
  data_tratamento?: string; // Data e hora da ação na app
}
