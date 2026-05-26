
import React, { useState } from 'react';
import { Lock, Settings, Users, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { Lead } from '../types';
import { formatCurrency } from '../utils';

interface AdminProps {
  settings: { commissionPercent: number, dataUrl: string };
  onUpdateSettings: (newSettings: any) => void;
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
}

const Admin: React.FC<AdminProps> = ({ settings, onUpdateSettings, leads, onUpdateStatus }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminTab, setAdminTab] = useState<'settings' | 'payments'>('settings');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      setIsLoggedIn(true);
    } else {
      alert('Credenciais inválidas');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="py-12 flex flex-col items-center">
        <div className="w-20 h-20 bg-[#2D3748] rounded-[30px] flex items-center justify-center shadow-2xl mb-8">
          <Lock className="text-yellow-400" size={32} />
        </div>
        <h2 className="text-xl font-bold text-[#2D3748] uppercase tracking-widest mb-12">Painel Admin</h2>
        
        <form onSubmit={handleLogin} className="w-full space-y-4">
          <input
            type="text"
            placeholder="Utilizador"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full h-16 bg-white border border-gray-100 rounded-2xl px-6 font-medium text-gray-700 outline-none ios-shadow"
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-16 bg-white border border-gray-100 rounded-2xl px-6 font-medium text-gray-700 outline-none ios-shadow"
          />
          <button 
            type="submit"
            className="w-full h-16 bg-black text-white font-bold rounded-2xl uppercase tracking-widest transition-all active:scale-95"
          >
            Aceder
          </button>
        </form>
      </div>
    );
  }

  const completedLeads = leads.filter(l => l.status === 'completed');
  const paidLeads = leads.filter(l => l.status === 'paid');

  const calculateTotalCommission = (list: Lead[]) => {
    return list.reduce((acc, lead) => acc + ((lead.value || 0) * (settings.commissionPercent / 100)), 0);
  };

  return (
    <div className="py-4 space-y-6">
      {/* Tab Navigation */}
      <div className="flex bg-slate-200/50 p-1.5 rounded-[24px]">
        <button 
          onClick={() => setAdminTab('settings')}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all ${adminTab === 'settings' ? 'bg-white shadow-sm text-black' : 'text-slate-500'}`}
        >
          <Settings size={14} /> Definições
        </button>
        <button 
          onClick={() => setAdminTab('payments')}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all ${adminTab === 'payments' ? 'bg-white shadow-sm text-black' : 'text-slate-500'}`}
        >
          <CreditCard size={14} /> Pagamentos
          {(completedLeads.length > 0) && (
            <span className="w-4 h-4 bg-red-500 text-white text-[9px] flex items-center justify-center rounded-full">{completedLeads.length}</span>
          )}
        </button>
      </div>

      {adminTab === 'settings' ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] ios-shadow border border-gray-50 p-8 space-y-8">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600"><Users size={20} /></div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Comissões</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Angariação Go Smile</p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#A0AEC0] uppercase tracking-widest block mb-3">Percentagem Angariadora (%)</label>
              <div className="relative">
                <input
                  type="number"
                  value={settings.commissionPercent}
                  onChange={(e) => onUpdateSettings({ ...settings, commissionPercent: Number(e.target.value) })}
                  className="w-full h-16 bg-[#F8F9FB] rounded-2xl px-6 font-bold text-2xl text-gray-700 outline-none border border-transparent focus:border-blue-100"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
              </div>
              <p className="mt-3 text-[11px] text-slate-400 leading-relaxed italic">Este valor será aplicado automaticamente sobre o orçamento fechado de cada consulta finalizada.</p>
            </div>

            <div className="pt-4 border-t border-slate-50">
              <label className="text-[10px] font-bold text-[#A0AEC0] uppercase tracking-widest block mb-3">N8N Webhook Endpoint</label>
              <input
                type="text"
                value={settings.dataUrl}
                onChange={(e) => onUpdateSettings({ ...settings, dataUrl: e.target.value })}
                className="w-full h-14 bg-[#F8F9FB] rounded-2xl px-6 font-medium text-[10px] text-gray-500 outline-none border border-transparent focus:border-blue-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-[32px] ios-shadow border border-gray-50 p-6">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Pendente</span>
              <span className="text-xl font-bold text-red-500">{formatCurrency(calculateTotalCommission(completedLeads))}</span>
            </div>
            <div className="bg-white rounded-[32px] ios-shadow border border-gray-50 p-6">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Pago</span>
              <span className="text-xl font-bold text-green-600">{formatCurrency(calculateTotalCommission(paidLeads))}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="space-y-4">
            <h4 className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle size={12} className="text-red-400" /> Pendentes de Pagamento
            </h4>
            
            {completedLeads.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-[32px] text-slate-400 text-sm font-medium border border-dashed border-slate-200">
                Não existem pagamentos pendentes.
              </div>
            ) : completedLeads.map(lead => {
              const commission = (lead.value || 0) * (settings.commissionPercent / 100);
              return (
                <div key={lead.id} className="bg-white rounded-[32px] ios-shadow p-6 border border-gray-50">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-slate-800">{lead.name}</span>
                    <span className="text-[10px] font-bold text-slate-400">{lead.appointmentDate}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[9px] font-bold text-slate-300 uppercase block">Comissão ({settings.commissionPercent}%)</span>
                      <span className="text-xl font-bold text-slate-800">{formatCurrency(commission)}</span>
                    </div>
                    <button 
                      onClick={() => onUpdateStatus(lead.id, { status: 'paid' }, { status: 'paid', estado: 'PAGO' })}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all"
                    >
                      Marcar Pago
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-4 pt-4">
            <h4 className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 size={12} className="text-green-500" /> Histórico de Pagos
            </h4>
            
            <div className="bg-white rounded-[32px] ios-shadow divide-y divide-slate-50 overflow-hidden">
              {paidLeads.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-[12px]">Sem histórico de pagamentos.</div>
              ) : paidLeads.map(lead => (
                <div key={lead.id} className="p-4 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold text-slate-700">{lead.name}</span>
                    <span className="text-[9px] text-slate-400">{lead.appointmentDate}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[13px] font-bold text-green-600">
                      {formatCurrency((lead.value || 0) * (settings.commissionPercent / 100))}
                    </span>
                    <span className="text-[8px] font-bold text-slate-300 uppercase block">Recebido</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button 
        onClick={() => setIsLoggedIn(false)}
        className="w-full h-16 bg-slate-100 text-slate-500 font-bold rounded-2xl uppercase tracking-widest transition-all active:scale-95"
      >
        Encerrar Sessão
      </button>
    </div>
  );
};

export default Admin;
