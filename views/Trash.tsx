
import React from 'react';
import { Lead } from '../types';
import { RefreshCw } from 'lucide-react';

interface TrashProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
}

const Trash: React.FC<TrashProps> = ({ leads, onUpdateStatus, onSync, monthLabel, isSyncing }) => {
  return (
    <div className="py-4">
      <div className="flex justify-between items-center mb-4 px-1">
        <span className="text-[11px] font-bold text-[#A0AEC0] uppercase tracking-wider">
          {leads.length} Leads em {monthLabel}
        </span>
        <button 
          onClick={onSync} 
          disabled={isSyncing}
          className="text-[11px] font-bold text-[#718096] uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
        >
          {isSyncing && <RefreshCw size={10} className="animate-spin" />}
          Sincronizar
        </button>
      </div>

      <div className="space-y-4">
        {leads.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-medium">Nenhum item no lixo para {monthLabel.toLowerCase()}.</div>
        ) : leads.map((lead) => (
          <div key={lead.id} className="bg-white rounded-[32px] ios-shadow border border-gray-50 p-6">
            <div className="flex justify-between items-start mb-1">
              <h3 className="text-xl font-bold text-[#2D3748] leading-tight lowercase">{lead.name}</h3>
              <span className="px-3 py-1 bg-[#FFF5F5] rounded-full text-[10px] font-bold text-[#C53030] uppercase">Descartada</span>
            </div>
            <div className="flex gap-2 text-[11px] font-bold text-[#CBD5E0] mb-6">
              <span>#{lead.externalId}</span>
              <span>•</span>
              <span>{new Date(lead.timestamp).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              <span>•</span>
              <span>{new Date(lead.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className="bg-[#F8F9FB] rounded-2xl p-4 border border-gray-100 mb-4">
               <p className="text-[12px] text-slate-500 italic">"{lead.notes || 'Sem notas explicativas.'}"</p>
            </div>
            <button
              onClick={() => onUpdateStatus(lead.id, { status: 'new' })}
              disabled={isSyncing}
              className="w-full py-3 rounded-2xl bg-slate-100 text-slate-600 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
            >
              Restaurar para Inbox
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Trash;
