import React, { useMemo, useState } from 'react';
import { Lead } from '../types';

interface InboxProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onCreateLead: (input: Pick<Lead, 'name' | 'phone' | 'email' | 'notes'>) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
}

type Filter = 'todos' | 'novos' | 'contactados';
type ModalType = 'none' | 'comment' | 'discard' | 'schedule' | 'create';

const Inbox: React.FC<InboxProps> = ({ leads, onUpdateStatus, onCreateLead, isSyncing }) => {
  const [filter, setFilter] = useState<Filter>('todos');
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', notes: '' });
  const [comment, setComment] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [isOrto, setIsOrto] = useState(false);

  const visible = useMemo(() => {
    if (filter === 'novos') return leads.filter((l) => l.status === 'new');
    if (filter === 'contactados') return leads.filter((l) => l.status === 'contacted');
    return leads;
  }, [leads, filter]);

  const statusLabel = (status: Lead['status']) => {
    if (status === 'new') return 'Novo';
    if (status === 'contacted') return 'Contactado';
    if (status === 'scheduled') return 'Marcado';
    if (status === 'discarded') return 'Perdido';
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

  const submitComment = () => {
    if (!selectedLead) return;
    onUpdateStatus(selectedLead.id, { status: 'contacted', notes: comment }, { comentario: comment });
    close();
  };

  const submitDiscard = () => {
    if (!selectedLead) return;
    onUpdateStatus(selectedLead.id, { status: 'discarded', notes: comment }, { estado: 'NÃO INTERESSADA', comentario: comment });
    close();
  };

  const submitSchedule = () => {
    if (!selectedLead || !selectedDoctor || !appointmentDate) return;
    onUpdateStatus(
      selectedLead.id,
      { status: 'scheduled', doctor: selectedDoctor, appointmentDate, notes: comment },
      { medico: selectedDoctor, data_consulta: appointmentDate, status: 'scheduled', comentario: comment }
    );
    close();
  };

  return (
    <div>
      <div className="filters">
        <button type="button" className={`filter${filter === 'todos' ? ' is-on' : ''}`} onClick={() => setFilter('todos')}>
          Todos
        </button>
        <button type="button" className={`filter${filter === 'novos' ? ' is-on' : ''}`} onClick={() => setFilter('novos')}>
          Novos
        </button>
        <button type="button" className={`filter${filter === 'contactados' ? ' is-on' : ''}`} onClick={() => setFilter('contactados')}>
          Contactados
        </button>
      </div>

      <div className="tools">
        <button type="button" onClick={() => open('create')}>
          Nova lead
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="center-note">Nenhuma lead nesta lista.</p>
      ) : (
        <div className="list">
          {visible.map((lead) => (
            <button key={lead.id} type="button" className="row" onClick={() => open('comment', lead)}>
              <span className="row-main">
                <span className="row-title">{lead.name}</span>
                <span className="row-sub">
                  {lead.source || 'Local'} · {timeAgo(lead.timestamp)}
                </span>
              </span>
              <span className="row-status">{statusLabel(lead.status)}</span>
            </button>
          ))}
        </div>
      )}

      {selectedLead && activeModal !== 'none' && activeModal !== 'create' && (
        <div className="sheet open">
          <div className="inner">
            <button type="button" className="back" onClick={close}>
              ← Voltar
            </button>
            <h1 className="page-title">{selectedLead.name}</h1>
            <p className="sub">{selectedLead.email || selectedLead.phone}</p>

            {activeModal === 'comment' && (
              <>
                <label className="field">
                  Nota
                  <textarea className="field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="O que foi acordado?" />
                </label>
                <button type="button" className="cta" onClick={submitComment}>
                  Marcar contactada
                </button>
                <button type="button" className="cta sec" onClick={() => setActiveModal('schedule')}>
                  Agendar
                </button>
                <button type="button" className="cta sec" onClick={() => setActiveModal('discard')}>
                  Descartar
                </button>
              </>
            )}

            {activeModal === 'discard' && (
              <>
                <label className="field">
                  Motivo
                  <textarea className="field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Porque vai descartar?" />
                </label>
                <button type="button" className="cta" onClick={submitDiscard}>
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
                <button type="button" className="cta" disabled={!selectedDoctor || !appointmentDate} onClick={submitSchedule}>
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

export default Inbox;
