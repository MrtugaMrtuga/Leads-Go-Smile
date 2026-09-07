import React, { useState } from 'react';
import { Lead } from '../types';
import { formatCurrency } from '../utils';

interface AgendaProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onSendReminder: (lead: Lead) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
}

const Agenda: React.FC<AgendaProps> = ({ leads, onUpdateStatus, onSendReminder, monthLabel, isSyncing }) => {
  const [selected, setSelected] = useState<Lead | null>(null);
  const [budget, setBudget] = useState('');

  const formatWhen = (value?: string) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div>
      {leads.length === 0 ? (
        <p className="center-note">Nenhuma marcação em {monthLabel.toLowerCase()}.</p>
      ) : (
        <div>
          {leads.map((lead) => (
            <button key={lead.id} type="button" className="day-line" onClick={() => { setSelected(lead); setBudget(''); }}>
              <span className="day-line-when">{formatWhen(lead.appointmentDate)}</span>
              <span>
                <span className="day-line-act">{lead.name}</span>
                <span className="day-line-sub">{lead.doctor || 'Médico a definir'}</span>
              </span>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="sheet open">
          <div className="inner">
            <button type="button" className="back" onClick={() => setSelected(null)}>
              ← Voltar
            </button>
            <h1 className="page-title">{selected.name}</h1>
            <p className="sub">
              {selected.appointmentDate || 'Data a definir'} · {selected.doctor || 'Sem médico'}
            </p>
            {selected.notes && <p className="sub">{selected.notes}</p>}
            <button
              type="button"
              className="cta sec"
              disabled={isSyncing}
              onClick={() => {
                onUpdateStatus(selected.id, { status: 'contacted' }, { estado: 'FALTOU', status: 'contacted', comentario: 'FALTOU' });
                setSelected(null);
              }}
            >
              Faltou
            </button>
            <button type="button" className="cta sec" disabled={isSyncing} onClick={() => onSendReminder(selected)}>
              Lembrete local
            </button>
            <label className="field">
              Valor do orçamento (€)
              <input className="field" type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" />
            </label>
            <button
              type="button"
              className="cta"
              disabled={!budget || parseFloat(budget) < 0 || isSyncing}
              onClick={() => {
                const value = parseFloat(budget) || 0;
                onUpdateStatus(selected.id, { status: 'completed', value }, {
                  valor_fechado: value,
                  status: 'completed',
                  estado: 'FECHADO',
                  comentario: `Venda fechada no valor de ${formatCurrency(value)}`,
                });
                setSelected(null);
              }}
            >
              Finalizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Agenda;
