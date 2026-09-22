import React, { useState } from 'react';
import LeadName from '../components/LeadName';
import LeadPhone from '../components/LeadPhone';
import LeadRowMain from '../components/LeadRowMain';
import StatusMove from '../components/StatusMove';
import { Lead } from '../types';
import { formatCurrency, sortLeadsNewestFirst } from '../utils';

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

  const moveStatus = (lead: Lead, next: 'processing' | 'scheduled') => {
    onUpdateStatus(lead.id, { status: next, isContacted: true }, { status: next });
    setSelected((current) => (current && current.id === lead.id ? { ...current, status: next, isContacted: true } : current));
  };

  return (
    <div>
      {leads.length === 0 ? (
        <p className="center-note">Nenhuma lead marcada em {monthLabel.toLowerCase()}.</p>
      ) : (
        <div>
          {sortLeadsNewestFirst(leads).map((lead) => (
            <div key={lead.id} className="day-line">
              <button type="button" className="day-line-when row-hit" onClick={() => { setSelected(lead); setBudget(''); }}>
                {formatWhen(lead.appointmentDate)}
              </button>
              <LeadRowMain
                lead={lead}
                nameClassName="day-line-act"
                mark={<span className="chevron">›</span>}
                onOpen={() => { setSelected(lead); setBudget(''); }}
                sub={lead.doctor || 'Médico a definir'}
              />
              <StatusMove status={lead.status} disabled={isSyncing} onMove={(next) => moveStatus(lead, next)} />
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="sheet open">
          <div className="inner">
            <button type="button" className="back" onClick={() => setSelected(null)}>
              ← Voltar
            </button>
            <h1 className="page-title">
              <LeadName lead={selected} className="name-line" />
            </h1>
            <LeadPhone phone={selected.phone} className="detail-phone" />
            <p className="sub">
              {selected.appointmentDate || 'Data a definir'} · {selected.doctor || 'Sem médico'}
            </p>
            <StatusMove
              status={selected.status}
              disabled={isSyncing}
              className="cta sec"
              phrase
              onMove={(next) => moveStatus(selected, next)}
            />
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
