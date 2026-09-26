import React from 'react';
import LeadRowMain from '../components/LeadRowMain';
import { Lead } from '../types';
import { listStatusCopy, sortLeadsNewestFirst } from '../utils';

interface TrashProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
  isLoading?: boolean;
  listSettled?: boolean;
}

const Trash: React.FC<TrashProps> = ({ leads, onUpdateStatus, monthLabel, isSyncing, isLoading, listSettled }) => {
  return (
    <div>
      {isLoading && leads.length > 0 ? <p className="updating">A atualizar…</p> : null}
      {leads.length === 0 ? (
        <p className="center-note">
          {listStatusCopy(isLoading, listSettled, `Nenhuma lead descartada em ${monthLabel.toLowerCase()}.`)}
        </p>
      ) : (
        <div className="list">
          {sortLeadsNewestFirst(leads).map((lead) => (
            <div key={lead.id} className="row">
              <LeadRowMain lead={lead} sub={lead.discardReason || lead.notes || 'Sem motivo'} />
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => onUpdateStatus(lead.id, { status: 'new' })}
              >
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Trash;
