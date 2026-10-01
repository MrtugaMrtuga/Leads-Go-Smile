import React, { useState } from 'react';
import LeadName from '../components/LeadName';
import LeadPhone from '../components/LeadPhone';
import LeadRowMain from '../components/LeadRowMain';
import StatusChoices, { HypothesisStatus } from '../components/StatusChoices';
import { Lead } from '../types';
import { formatCurrency, listStatusCopy, sortMarcacoesChronological } from '../utils';

interface AgendaProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onSendReminder: (lead: Lead) => void;
  onSync: () => void;
  isSyncing?: boolean;
  isLoading?: boolean;
  listSettled?: boolean;
}

type SheetMode = 'detail' | 'discard' | 'schedule';

const Agenda: React.FC<AgendaProps> = ({ leads, onUpdateStatus, onSendReminder, isSyncing, isLoading, listSettled }) => {
  const [selected, setSelected] = useState<Lead | null>(null);
  const [mode, setMode] = useState<SheetMode>('detail');
  const [budget, setBudget] = useState('');
  const [motivo, setMotivo] = useState('');
  const [comment, setComment] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [isOrto, setIsOrto] = useState(false);

  const formatWhen = (value?: string) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  };

  const openLead = (lead: Lead, nextMode: SheetMode = 'detail') => {
    setSelected(lead);
    setMode(nextMode);
    setBudget('');
    setMotivo('');
    setComment('');
    setAppointmentDate('');
    setSelectedDoctor('');
    setIsOrto(false);
  };

  const patchLead = (lead: Lead, patch: Partial<Lead>) => {
    setSelected((current) => (current && current.id === lead.id ? { ...current, ...patch } : current));
  };

  const chooseStatus = (lead: Lead, next: HypothesisStatus) => {
    if (next === 'scheduled') {
      openLead(lead, 'schedule');
      return;
    }
    if (next === 'discarded') {
      openLead(lead, 'discard');
      return;
    }
    onUpdateStatus(lead.id, { status: next, isContacted: true }, { status: next });
    setSelected((current) => (current && current.id === lead.id ? { ...current, status: next, isContacted: true } : current));
    if (selected && selected.id === lead.id) setMode('detail');
  };

  const submitDiscard = () => {
    if (!selected) return;
    const reason = motivo.trim();
    if (!reason) return;
    onUpdateStatus(selected.id, { status: 'discarded', discardReason: reason }, { status: 'discarded', motivo: reason });
    patchLead(selected, { status: 'discarded', discardReason: reason });
    setMode('detail');
  };

  const submitSchedule = () => {
    if (!selected || !selectedDoctor || !appointmentDate) return;
    onUpdateStatus(
      selected.id,
      { status: 'scheduled', doctor: selectedDoctor, appointmentDate, notes: comment },
      { medico: selectedDoctor, data_consulta: appointmentDate, status: 'scheduled', comentario: comment }
    );
    patchLead(selected, { status: 'scheduled', doctor: selectedDoctor, appointmentDate, isContacted: true });
    setMode('detail');
  };

  const unbook = () => {
    if (!selected) return;
    onUpdateStatus(
      selected.id,
      { status: 'discarded', doctor: '', appointmentDate: '', discardReason: 'Desmarcada' },
      { status: 'discarded', medico: '', data_consulta: '', motivo: 'Desmarcada' }
    );
    setSelected(null);
  };

  return (
    <div>
      {isLoading && leads.length > 0 ? <p className="updating">A atualizar…</p> : null}
      {leads.length === 0 ? (
        <p className="center-note">
          {listStatusCopy(isLoading, listSettled, 'Nenhuma lead marcada.')}
        </p>
      ) : (
        <div>
          {sortMarcacoesChronological(leads).map((lead) => (
            <div key={lead.id} className="day-block">
              <div className="day-line">
                <button type="button" className="day-line-when row-hit" onClick={() => openLead(lead)}>
                  {formatWhen(lead.appointmentDate)}
                </button>
                <LeadRowMain
                  lead={lead}
                  nameClassName="day-line-act"
                  mark={<span className="chevron">›</span>}
                  onOpen={() => openLead(lead)}
                  sub={lead.doctor || 'Médico a definir'}
                />
              </div>
              <StatusChoices
                status={lead.status}
                disabled={isSyncing}
                variant="row"
                onChoose={(next) => chooseStatus(lead, next)}
              />
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="sheet open">
          <div className="inner">
            <button type="button" className="back" onClick={() => (mode === 'detail' ? setSelected(null) : setMode('detail'))}>
              ← Voltar
            </button>
            <h1 className="page-title">
              <LeadName lead={selected} className="name-line" />
            </h1>
            <LeadPhone phone={selected.phone} className="detail-phone" />
            <p className="sub">
              {selected.appointmentDate || 'Data a definir'} · {selected.doctor || 'Sem médico'}
            </p>

            {mode === 'detail' && (
              <>
                <StatusChoices
                  status={selected.status}
                  disabled={isSyncing}
                  onChoose={(next) => chooseStatus(selected, next)}
                />
                {selected.notes && <p className="sub">{selected.notes}</p>}
                <button type="button" className="cta sec" disabled={isSyncing} onClick={unbook}>
                  Desmarcar
                </button>
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
              </>
            )}

            {mode === 'discard' && (
              <>
                <label className="field">
                  Motivo
                  <textarea className="field" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Porque vai descartar?" />
                </label>
                <button type="button" className="cta" disabled={!motivo.trim() || isSyncing} onClick={submitDiscard}>
                  Confirmar descarte
                </button>
              </>
            )}

            {mode === 'schedule' && (
              <>
                <div className="filters">
                  <button type="button" className={`filter${!isOrto ? ' is-on' : ''}`} onClick={() => { setIsOrto(false); setSelectedDoctor(''); }}>
                    1ª Consulta
                  </button>
                  <button
                    type="button"
                    className={`filter${isOrto ? ' is-on' : ''}`}
                    onClick={() => { setIsOrto(true); setSelectedDoctor('Dra. Mariana Rocha'); }}
                  >
                    Ortodontia
                  </button>
                </div>
                <p className="section-label">Médico</p>
                <div className="choice-grid">
                  {!isOrto ? (
                    ['Bruno Aires', 'Joana Amaral'].map((doc) => (
                      <button
                        key={doc}
                        type="button"
                        className={`choice${selectedDoctor === doc ? ' is-on' : ''}`}
                        onClick={() => setSelectedDoctor(doc)}
                      >
                        {doc}
                      </button>
                    ))
                  ) : (
                    <button type="button" className="choice is-on">
                      Dra. Mariana Rocha
                    </button>
                  )}
                </div>
                <label className="field">
                  Data e hora
                  <input className="field" type="datetime-local" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
                </label>
                <label className="field">
                  Notas
                  <textarea className="field" value={comment} onChange={(e) => setComment(e.target.value)} />
                </label>
                <button type="button" className="cta" disabled={!selectedDoctor || !appointmentDate || isSyncing} onClick={submitSchedule}>
                  Confirmar marcação
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Agenda;
