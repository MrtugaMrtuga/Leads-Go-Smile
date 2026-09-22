
import { Lead, LeadFormField } from './types';
import {
  closeEvolution as closeEvolutionJs,
  closeWindow as closeWindowJs,
  filledLeadFields as filledLeadFieldsJs,
  humanizeMetaValue as humanizeMetaValueJs,
  listBucket as listBucketJs,
  mapDataToLeads as mapDataToLeadsJs,
  pipelineBreakdown as pipelineBreakdownJs,
  pipelineStats as pipelineStatsJs,
  pipelineTone as pipelineToneJs,
} from './shared/inboundMeta.js';

export function humanizeMetaValue(value: unknown): string {
  return humanizeMetaValueJs(value);
}

export function mapDataToLeads(data: unknown[]): Lead[] {
  return mapDataToLeadsJs(data) as Lead[];
}

export function filledLeadFields(lead: Lead): LeadFormField[] {
  return filledLeadFieldsJs(lead) as LeadFormField[];
}

export function listBucket(status: Lead['status']) {
  return listBucketJs(status) as 'inbox' | 'marcadas' | 'descartadas' | 'other';
}

export function pipelineTone(status: Lead['status']) {
  return pipelineToneJs(status) as '' | 'yellow' | 'green' | 'red';
}

export function pipelineStats(leads: Lead[]) {
  return pipelineStatsJs(leads) as {
    total: number;
    discarded: number;
    booked: number;
    processing: number;
    discardedPct: number;
    bookedPct: number;
    processingPct: number;
    buckets: { key: string; label: string; count: number; pct: number }[];
  };
}

export function pipelineBreakdown(leads: Lead[]) {
  return pipelineBreakdownJs(leads) as {
    total: number;
    buckets: { key: string; label: string; count: number; pct: number }[];
  };
}

export function closeWindow(leads: Lead[], spanDays: 7 | 30 | 90, now = new Date()) {
  return closeWindowJs(leads, spanDays, now) as {
    spanDays: number;
    timezone: string;
    weekStartsOn: string;
    grain: 'day' | 'week';
    start: string;
    end: string;
    points: {
      key: string;
      label: string;
      entradas: number;
      marcacoes: number;
      fecho: number;
      descartadas: number;
    }[];
    totals: {
      entradas: number;
      marcacoes: number;
      fecho: number;
      descartadas: number;
      marcacoesPct: number | null;
      fechoPct: number | null;
      descartadasPct: number | null;
    };
  };
}

export function closeEvolution(leads: Lead[], grain: 'day' | 'week') {
  return closeEvolutionJs(leads, grain) as {
    key: string;
    label: string;
    entradas: number;
    positivo: number;
    totalFecho: number;
    positivoPct: number | null;
    totalPct: number | null;
  }[];
}

export const formatMonthYear = (date: Date): string => {
  const months = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
  ];
  return `${months[date.getMonth()]} DE ${date.getFullYear()}`;
};

export const getLeadsByMonth = (leads: Lead[], month: number, year: number): Lead[] => {
  return leads
    .filter(lead => {
      const d = new Date(lead.timestamp);
      if (isNaN(d.getTime())) return false;
      // Usamos getMonth e getFullYear que respeitam a hora local definida no parsing
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .sort((a, b) => {
      // Ordenação decrescente: o timestamp maior (mais recente) vem primeiro
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
};

export const inferStatus = (item: any): any => {
  const rawStatus = String(item.status || item.estado || '').toLowerCase();
  const notes = String(item.Comentários || item.message || item.notes || '').toLowerCase();
  const appointment = item['Data Primeira Consulta'] || item.data_consulta || item.appointment_date;

  // Respeita status explícito quando vem da nova tabela
  if (['paid', 'completed', 'positive', 'scheduled', 'discarded', 'processing', 'contacted', 'new'].includes(rawStatus)) {
    return rawStatus;
  }

  if ((appointment && String(appointment).length > 2) || notes.includes('marcado') || notes.includes('marcada')) {
    return 'scheduled';
  }

  if (notes.includes('não atende') || notes.includes('nao atende') || notes.includes('não atendeu') || notes.includes('nao atendeu')) {
    return 'processing';
  }

  const discardKeywords = [
    'engano', 'não interessa', 'nao interessa',
    'desligou', 'longe', 'errado', 'não precisa', 'nao precisa', 'incorrecto', 'falecido'
  ];

  if (discardKeywords.some((key) => notes.includes(key))) {
    return 'discarded';
  }

  if (notes.includes('contactado') || notes.includes('contatado') || notes.includes('ligar')) {
    return 'contacted';
  }

  return 'new';
};
