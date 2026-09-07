import React, { useState } from 'react';
import { Lead } from '../types';
import { formatCurrency } from '../utils';

interface AdminProps {
  settings: { commissionPercent: number };
  onUpdateSettings: (newSettings: { commissionPercent: number }) => void;
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onOpenTrash: () => void;
  onOpenAccounts: () => void;
}

const Admin: React.FC<AdminProps> = ({
  settings,
  onUpdateSettings,
  leads,
  onUpdateStatus,
  onOpenTrash,
  onOpenAccounts,
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<'settings' | 'payments'>('settings');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') setIsLoggedIn(true);
    else alert('Credenciais inválidas');
  };

  if (!isLoggedIn) {
    return (
      <form onSubmit={handleLogin}>
        <label className="field">
          Utilizador
          <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          Senha
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="cta">
          Aceder
        </button>
      </form>
    );
  }

  const completedLeads = leads.filter((l) => l.status === 'completed');
  const paidLeads = leads.filter((l) => l.status === 'paid');
  const commission = (list: Lead[]) =>
    list.reduce((acc, lead) => acc + ((lead.value || 0) * (settings.commissionPercent / 100)), 0);

  return (
    <div>
      <div className="filters">
        <button type="button" className={`filter${tab === 'settings' ? ' is-on' : ''}`} onClick={() => setTab('settings')}>
          Definições
        </button>
        <button type="button" className={`filter${tab === 'payments' ? ' is-on' : ''}`} onClick={() => setTab('payments')}>
          Pagamentos
        </button>
      </div>

      {tab === 'settings' ? (
        <>
          <label className="field">
            Comissão (%)
            <input
              className="field"
              type="number"
              value={settings.commissionPercent}
              onChange={(e) => onUpdateSettings({ commissionPercent: Number(e.target.value) })}
            />
          </label>
          <p className="sub">JSON local em ./data · API /api · leads.evob.org</p>
          <div className="list">
            <div className="row">
              <span className="row-main">
                <span className="row-title">Pendente</span>
              </span>
              <span className="row-value">{formatCurrency(commission(completedLeads))}</span>
            </div>
            <div className="row">
              <span className="row-main">
                <span className="row-title">Pago</span>
              </span>
              <span className="row-value">{formatCurrency(commission(paidLeads))}</span>
            </div>
          </div>
          <button type="button" className="cta sec" onClick={onOpenTrash}>
            Ver lixo
          </button>
          <button type="button" className="cta sec" onClick={onOpenAccounts}>
            Ver contas
          </button>
        </>
      ) : (
        <div className="list">
          {completedLeads.length === 0 && paidLeads.length === 0 ? (
            <p className="center-note">Sem pagamentos.</p>
          ) : (
            <>
              {completedLeads.map((lead) => (
                <div key={lead.id} className="row">
                  <span className="row-main">
                    <span className="row-title">{lead.name}</span>
                    <span className="row-sub">Pendente · {formatCurrency((lead.value || 0) * (settings.commissionPercent / 100))}</span>
                  </span>
                  <button type="button" onClick={() => onUpdateStatus(lead.id, { status: 'paid' }, { status: 'paid', estado: 'PAGO' })}>
                    Pago
                  </button>
                </div>
              ))}
              {paidLeads.map((lead) => (
                <div key={lead.id} className="row">
                  <span className="row-main">
                    <span className="row-title">{lead.name}</span>
                    <span className="row-sub">Recebido · {formatCurrency((lead.value || 0) * (settings.commissionPercent / 100))}</span>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <button type="button" className="cta sec" onClick={() => setIsLoggedIn(false)}>
        Encerrar sessão
      </button>
    </div>
  );
};

export default Admin;
