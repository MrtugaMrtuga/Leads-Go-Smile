
import React, { useState } from 'react';
import { Lead } from '../types';
import { Phone, Mail, X, Check, Calendar as CalendarIcon, User, Trash2, MessageSquare } from 'lucide-react';

interface InboxProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onCreateLead: (input: Pick<Lead, 'name' | 'phone' | 'email' | 'notes'>) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
}

type ModalType = 'none' | 'comment' | 'discard' | 'schedule';

const Inbox: React.FC<InboxProps> = ({ leads, onUpdateStatus, onCreateLead, onSync, monthLabel, isSyncing }) => {
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', notes: '' });
  
  // Modal States
  const [comment, setComment] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [isOrto, setIsOrto] = useState(false);

  const openCommentModal = (lead: Lead) => {
    setSelectedLead(lead);
    setComment('');
    setActiveModal('comment');
  };

  const openDiscardModal = (lead: Lead) => {
    setSelectedLead(lead);
    setComment('');
    setActiveModal('discard');
  };

  const openScheduleModal = (lead: Lead) => {
    setSelectedLead(lead);
    setAppointmentDate('');
    setSelectedDoctor('');
    setComment(''); // Reset comment for schedule
    setIsOrto(false);
    setActiveModal('schedule');
  };

  const submitComment = () => {
    if (!selectedLead) return;
    onUpdateStatus(selectedLead.id, { status: 'contacted', notes: comment }, { comentario: comment });
    setActiveModal('none');
  };

  const submitDiscard = () => {
    if (!selectedLead) return;
    onUpdateStatus(selectedLead.id, 
      { status: 'discarded', notes: comment }, 
      { estado: 'NÃO INTERESSADA', comentario: comment }
    );
    setActiveModal('none');
  };

  const submitSchedule = () => {
    if (!selectedLead || !selectedDoctor || !appointmentDate) return;
    onUpdateStatus(selectedLead.id, 
      { status: 'scheduled', doctor: selectedDoctor, appointmentDate, notes: comment }, 
      { 
        medico: selectedDoctor, 
        data_consulta: appointmentDate, 
        status: 'scheduled',
        comentario: comment
      }
    );
    setActiveModal('none');
  };

  return (
    <div className="py-4 relative">
      <div className="flex justify-between items-center mb-6 px-1">
        <span className="text-[11px] font-bold text-[#A0AEC0] uppercase tracking-wider">
          {leads.length} Leads Ativas
        </span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowCreate(true)}
            className="text-[11px] font-bold text-slate-800 uppercase tracking-wider"
          >
            Nova
          </button>
          <button onClick={onSync} className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Atualizar</button>
        </div>
      </div>

      <div className="space-y-6">
        {leads.length === 0 ? (
          <div className="text-center py-20 text-gray-400">Nenhuma lead pendente.</div>
        ) : leads.map((lead) => (
          <div key={lead.id} className="bg-white rounded-[32px] ios-shadow border border-gray-50 p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="max-w-[70%]">
                <h3 className="text-xl font-bold text-[#2D3748] leading-tight mb-1">{lead.name}</h3>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px] font-bold uppercase tracking-wider">{lead.source || 'Local'}</span>
              </div>
              <div className="flex flex-col items-end text-[#CBD5E0]">
                 <span className="text-[10px] font-bold uppercase">{new Date(lead.timestamp).toLocaleDateString('pt-PT')}</span>
                 <span className="text-[9px] font-medium">{new Date(lead.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-6">
               <a href={`tel:${lead.phone}`} className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl text-[12px] font-bold text-slate-600 active:bg-slate-100 transition-colors">
                  <Phone size={14} /> {lead.phone.toString().slice(-9)}
               </a>
               <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl text-[12px] font-bold text-slate-600 truncate">
                  <Mail size={14} /> <span className="truncate">{lead.email}</span>
               </div>
            </div>

            {lead.notes && (
              <div className="bg-[#F8F9FB] rounded-2xl p-4 mb-6 border border-gray-100">
                <p className="text-[12px] text-slate-500 italic">"{lead.notes}"</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={() => openDiscardModal(lead)}
                className="py-3 rounded-2xl bg-red-50 text-red-500 text-[10px] font-bold uppercase active:scale-95 transition-transform"
              >
                Descartar
              </button>
              <button 
                onClick={() => openCommentModal(lead)}
                className="py-3 rounded-2xl bg-green-50 text-green-600 text-[10px] font-bold uppercase active:scale-95 transition-transform"
              >
                Contactada
              </button>
              <button 
                onClick={() => openScheduleModal(lead)}
                className="py-3 rounded-2xl bg-black text-white text-[10px] font-bold uppercase active:scale-95 transition-transform"
              >
                Agendar
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden">
            <div className="p-8 space-y-5">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">Nova Lead</h2>
                <button onClick={() => setShowCreate(false)} className="p-2 bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <input
                value={newLead.name}
                onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                placeholder="Nome"
                className="w-full h-14 bg-slate-50 rounded-2xl px-5 outline-none font-medium"
              />
              <input
                value={newLead.phone}
                onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                placeholder="Telefone"
                className="w-full h-14 bg-slate-50 rounded-2xl px-5 outline-none font-medium"
              />
              <input
                value={newLead.email}
                onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                placeholder="Email"
                className="w-full h-14 bg-slate-50 rounded-2xl px-5 outline-none font-medium"
              />
              <textarea
                value={newLead.notes}
                onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                placeholder="Notas"
                className="w-full h-24 bg-slate-50 rounded-2xl p-5 outline-none font-medium"
              />
              <button
                disabled={!newLead.name.trim() || isSyncing}
                onClick={() => {
                  onCreateLead(newLead);
                  setNewLead({ name: '', phone: '', email: '', notes: '' });
                  setShowCreate(false);
                }}
                className="w-full h-16 bg-black text-white font-bold rounded-2xl active:scale-95 disabled:opacity-30"
              >
                Guardar Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OVERLAY */}
      {activeModal !== 'none' && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10 bg-black/40 backdrop-blur-sm transition-all animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="p-8 max-h-[85vh] overflow-y-auto hide-scrollbar">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800">
                  {activeModal === 'comment' ? 'Registar Contacto' : 
                   activeModal === 'discard' ? 'Descartar Lead' : 'Agendar Consulta'}
                </h2>
                <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {(activeModal === 'comment' || activeModal === 'discard') ? (
                <div className="space-y-6">
                   <p className="text-slate-500 text-sm">
                     {activeModal === 'discard' 
                      ? `Indique o motivo pelo qual vai descartar a lead de ${selectedLead?.name}:`
                      : `O que foi acordado com ${selectedLead?.name}?`}
                   </p>
                   <textarea 
                     value={comment}
                     onChange={(e) => setComment(e.target.value)}
                     placeholder={activeModal === 'discard' ? "Ex: Contacto errado, não tem interesse no momento..." : "Ex: Não atendeu, ligo amanhã às 15h..."}
                     className={`w-full h-32 rounded-3xl p-6 outline-none border border-transparent transition-all font-medium text-slate-700 ${activeModal === 'discard' ? 'bg-red-50 focus:border-red-200' : 'bg-slate-50 focus:border-blue-200'}`}
                   />
                   <button 
                     onClick={activeModal === 'discard' ? submitDiscard : submitComment}
                     className={`w-full h-16 text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform ${activeModal === 'discard' ? 'bg-red-600' : 'bg-green-600'}`}
                   >
                     {activeModal === 'discard' ? <Trash2 size={20} /> : <Check size={20} />}
                     {activeModal === 'discard' ? 'Confirmar Descarte' : 'Guardar Contacto'}
                   </button>
                </div>
              ) : (
                <div className="space-y-6">
                   <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                      <button 
                        onClick={() => {setIsOrto(false); setSelectedDoctor('')}}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${!isOrto ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                      >
                        1ª Consulta
                      </button>
                      <button 
                        onClick={() => {setIsOrto(true); setSelectedDoctor('Dra. Mariana Rocha')}}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${isOrto ? 'bg-white shadow-sm text-purple-600' : 'text-slate-500'}`}
                      >
                        Ortodontia
                      </button>
                   </div>

                   <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Selecionar Médico</label>
                      <div className="grid grid-cols-2 gap-3">
                        {!isOrto ? (
                          <>
                            <button 
                              onClick={() => setSelectedDoctor('Bruno Aires')}
                              className={`p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${selectedDoctor === 'Bruno Aires' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-slate-50'}`}
                            >
                               <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm"><User size={16} className="text-blue-500" /></div>
                               <span className="text-[12px] font-bold text-slate-700">Bruno Aires</span>
                            </button>
                            <button 
                              onClick={() => setSelectedDoctor('Joana Amaral')}
                              className={`p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${selectedDoctor === 'Joana Amaral' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-slate-50'}`}
                            >
                               <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm"><User size={16} className="text-blue-500" /></div>
                               <span className="text-[12px] font-bold text-slate-700">Joana Amaral</span>
                            </button>
                          </>
                        ) : (
                          <button 
                            className="col-span-2 p-4 rounded-2xl border-2 border-purple-500 bg-purple-50 flex items-center gap-3"
                          >
                             <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm"><User size={16} className="text-purple-500" /></div>
                             <span className="text-[12px] font-bold text-slate-700">Dra. Mariana Rocha</span>
                          </button>
                        )}
                      </div>
                   </div>

                   <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Data e Hora</label>
                      <div className="relative">
                        <CalendarIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="datetime-local" 
                          value={appointmentDate}
                          onChange={(e) => setAppointmentDate(e.target.value)}
                          className="w-full h-16 bg-slate-50 rounded-2xl pl-16 pr-6 outline-none border border-transparent focus:border-blue-200 font-bold text-slate-700"
                        />
                      </div>
                   </div>

                   <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Comentários Adicionais</label>
                      <div className="relative">
                        <MessageSquare className="absolute left-6 top-6 text-slate-400" size={18} />
                        <textarea 
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Notas sobre o agendamento..."
                          className="w-full h-32 bg-slate-50 rounded-2xl pl-16 pr-6 pt-5 outline-none border border-transparent focus:border-blue-200 font-medium text-slate-700"
                        />
                      </div>
                   </div>

                   <button 
                     disabled={!selectedDoctor || !appointmentDate}
                     onClick={submitSchedule}
                     className="w-full h-16 bg-black text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30"
                   >
                     Confirmar Marcação
                   </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inbox;
