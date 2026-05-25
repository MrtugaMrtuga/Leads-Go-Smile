
import { Lead } from './types';

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
  const notes = String(item.Comentários || item.Comentarios || '').toLowerCase();
  const appointment = item["Data Primeira Consulta"] || item.DataConsulta;
  const estado = String(item.Estado || item.estado || item.Status || '').toLowerCase();
  const hasValue = parseFloat(String(item["Valor Real Bruto"] || item.Valor || '0').replace(',', '.')) > 0;
  
  if (estado.includes('pago') || estado.includes('paid')) return 'paid';
  if (estado.includes('fechado') || estado.includes('completed') || hasValue) return 'completed';
  if ((appointment && String(appointment).length > 2) || notes.includes('marcado') || estado.includes('agend')) {
    return 'scheduled';
  }
  
  const discardKeywords = ['engano', 'não atende', 'nao atende', 'não interessa', 'nao interessa', 'desligou', 'longe', 'errado', 'incorrecto', 'falecido'];
  if (estado.includes('não interessada') || estado.includes('nao interessada') || discardKeywords.some(key => notes.includes(key))) {
    return 'discarded';
  }
  
  if (item["Data Contacto"] || item["Responsável"] || item.Responsavel || estado.includes('contact')) return 'contacted';

  return 'new';
};
