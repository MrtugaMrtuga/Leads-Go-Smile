import React, { useMemo, useState } from 'react';
import LeadName from '../components/LeadName';
import LeadPhone from '../components/LeadPhone';
import LeadRowMain from '../components/LeadRowMain';
import StatusChoices, { HypothesisStatus } from '../components/StatusChoices';
import { Lead } from '../types';
import { filledLeadFields, listBucket, listStatusCopy, sortLeadsNewestFirst } from '../utils';

interface InboxProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onCreateLead: (input: Pick<Lead, 'name' | 'phone' | 'email' | 'notes'>) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
  isLoading?: boolean;
  listSettled?: boolean;
}

type Filter = 'inbox' | 'descartadas';
type ModalType = 'none' | 'comment' | 'discard' | 'schedule' | 'create';

const Inbox: React.FC<InboxProps> = ({ leads, onUpdateStatus, onCreateLead, isSyncing, isLoading, listSettled }) => {
  const [filter, setFilter] = useState<Filter>('inbox');
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', notes: '' });
  const [comment, setComment] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [isOrto, setIsOrto] = useState(false);

  const visible = useMemo(
    () => sortLeadsNewestFirst(leads.filter((lead) => listBucket(lead.status) === filter)),
    [leads, filter]
  );

  const statusLabel = (status: Lead['status']) => {
    if (status === 'new') return 'Novo';
    if (status === 'processing') return 'Não atendeu';
    if (status === 'contacted') return 'Contactada';
    if (status === 'positive') return 'Pré-qualificado';
    if (status === 'scheduled') return 'Marcada';
    if (status === 'discarded') return 'Descartada';
    return status;
  };

  const timeAgo = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return `há ${days} d`;
  };

  const open = (type: ModalType, lead?: Lead) => {
    setSelectedLead(lead || null);
    setComment('');
    setAppointmentDate('');
    setSelectedDoctor('');
    setIsOrto(false);
    setActiveModal(type);
  };

  const close = () => setActiveModal('none');

  const patchLead = (lead: Lead, patch: Partial<Lead>) => {
    setSelectedLead((current) => (current && current.id === lead.id ? { ...current, ...patch } : current));
  };

  const chooseStatus = (lead: Lead, next: HypothesisStatus) => {
    if (next === 'scheduled') {
      open('schedule', lead);
      return;
    }
    if (next === 'discarded') {
      open('discard', lead);
      return;
    }
    onUpdateStatus(lead.id, { status: next, isContacted: true }, { status: next });
    setSelectedLead((current) => (current && current.id === lead.id ? { ...current, status: next, isContacted: true } : current));
    setActiveModal((current) => (selectedLead && selectedLead.id === lead.id && current !== 'none' ? 'comment' : current));
  };

  const submitDiscard = () => {
    if (!selectedLead) return;
    const motivo = comment.trim();
    if (!motivo) return;
    onUpdateStatus(
      selectedLead.id,
      { status: 'discarded', discardReason: motivo },
      { status: 'discarded', motivo }
    );
    patchLead(selectedLead, { status: 'discarded', discardReason: motivo });
    setActiveModal('comment');
  };

  const submitSchedule = () => {
    if (!selectedLead || !selectedDoctor || !appointmentDate) return;
    onUpdateStatus(
      selectedLead.id,
      { status: 'scheduled', doctor: selectedDoctor, appointmentDate, notes: comment },
      { medico: selectedDoctor, data_consulta: appointmentDate, status: 'scheduled', comentario: comment }
    );
    patchLead(selectedLead, { status: 'scheduled', doctor: selectedDoctor, appointmentDate, isContacted: true });
    setActiveModal('comment');
  };

  return (
    <div>
      <div className="filters">
        <button type="button" className={`filter${filter === 'inbox' ? ' is-on' : ''}`} onClick={() => setFilter('inbox')}>
          Inbox
        </button>
        <button type="button" className={`filter${filter === 'descartadas' ? ' is-on' : ''}`} onClick={() => setFilter('descartadas')}>
          Descartadas
        </button>
      </div>

      <div className="tools">
        <button type="button" onClick={() => open('create')}>
          Nova lead
        </button>
      </div>

      {isLoading && visible.length > 0 ? <p className="updating">A atualizar…</p> : null}
      {visible.length === 0 ? (
        <p className="center-note">
          {listStatusCopy(
            isLoading,
            listSettled,
            filter === 'descartadas' ? 'Nenhuma lead descartada.' : 'Nenhuma lead na inbox.'
          )}
        </p>
      ) : (
        <div className="list">
          {visible.map((lead) => (
            <div key={lead.id} className="row stack">
              <div className="row-line">
                <LeadRowMain
                  lead={lead}
                  onOpen={() => open('comment', lead)}
                  sub={
                    lead.status === 'discarded' && lead.discardReason
                      ? lead.discardReason
                      : `${lead.source || 'Local'} · ${timeAgo(lead.timestamp)}`
                  }
                />
                <span className="row-status">{statusLabel(lead.status)}</span>
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

      {selectedLead && activeModal !== 'none' && activeModal !== 'create' && (
        <div className="sheet open">
          <div className="inner">
            <button
              type="button"
              className="back"
              onClick={() => (activeModal === 'comment' ? close() : setActiveModal('comment'))}
            >
              ← Voltar
            </button>
            <h1 className="page-title">
              <LeadName lead={selectedLead} className="name-line" />
            </h1>
            <LeadPhone phone={selectedLead.phone} className="detail-phone" />
            {selectedLead.email ? <p className="sub">{selectedLead.email}</p> : null}
            {selectedLead.discardReason ? <p className="sub">Motivo: {selectedLead.discardReason}</p> : null}
            <LeadFormFields lead={selectedLead} />

            {activeModal === 'comment' && (
              <StatusChoices
                status={selectedLead.status}
                disabled={isSyncing}
                onChoose={(next) => chooseStatus(selectedLead, next)}
              />
            )}

            {activeModal === 'discard' && (
              <>
                <label className="field">
                  Motivo
                  <textarea className="field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Porque vai descartar?" />
                </label>
                <button type="button" className="cta" disabled={!comment.trim() || isSyncing} onClick={submitDiscard}>
                  Confirmar descarte
                </button>
              </>
            )}

            {activeModal === 'schedule' && (
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
                    <>
                      {['Bruno Aires', 'Joana Amaral'].map((doc) => (
                        <button
                          key={doc}
                          type="button"
                          className={`choice${selectedDoctor === doc ? ' is-on' : ''}`}
                          onClick={() => setSelectedDoctor(doc)}
                        >
                          {doc}
                        </button>
                      ))}
                    </>
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

      {activeModal === 'create' && (
        <div className="sheet open">
          <div className="inner">
            <button type="button" className="back" onClick={close}>
              ← Voltar
            </button>
            <h1 className="page-title">Nova lead</h1>
            <label className="field">
              Nome
              <input className="field" value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} />
            </label>
            <label className="field">
              Telefone
              <input className="field" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
            </label>
            <label className="field">
              Email
              <input className="field" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} />
            </label>
            <label className="field">
              Notas
              <textarea className="field" value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })} />
            </label>
            <button
              type="button"
              className="cta"
              disabled={!newLead.name.trim() || isSyncing}
              onClick={() => {
                onCreateLead(newLead);
                setNewLead({ name: '', phone: '', email: '', notes: '' });
                close();
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function LeadFormFields({ lead }: { lead: Lead }) {
  const fields = filledLeadFields(lead);
  if (!fields.length) return null;
  return (
    <div className="meta-fields">
      {fields.map((field) => (
        <div key={`${field.key}:${field.label}`} className="meta-field">
          <span className="meta-field-label">{field.label}</span>
          <span className="meta-field-value">{field.value}</span>
        </div>
      ))}
    </div>
  );
}

export default Inbox;
