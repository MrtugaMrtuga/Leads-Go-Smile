import React from 'react';
import LeadName from '../components/LeadName';
import { Lead } from '../types';
import { formatCurrency, sortLeadsNewestFirst } from '../utils';

interface AccountsProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
}

const Accounts: React.FC<AccountsProps> = ({ leads, onUpdateStatus, monthLabel, isSyncing }) => {
  return (
    <div>
      {leads.length === 0 ? (
        <p className="center-note">Nenhuma conta em {monthLabel.toLowerCase()}.</p>
      ) : (
        <div className="list">
          {sortLeadsNewestFirst(leads).map((lead) => (
            <div key={lead.id} className="row">
              <span className="row-main">
                    <LeadName lead={lead} className="row-title" />
                <span className="row-sub">{lead.status === 'paid' ? 'Pago' : 'Pendente'} · {formatCurrency(lead.value || 0)}</span>
              </span>
              {lead.status !== 'paid' && (
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => onUpdateStatus(lead.id, { status: 'paid' }, { status: 'paid', estado: 'PAGO' })}
                >
                  Pago
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Accounts;
