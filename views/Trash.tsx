import React from 'react';
import { Lead } from '../types';

interface TrashProps {
  leads: Lead[];
  onUpdateStatus: (id: string, updates: Partial<Lead>, extraData?: any) => void;
  onSync: () => void;
  monthLabel: string;
  isSyncing?: boolean;
}

const Trash: React.FC<TrashProps> = ({ leads, onUpdateStatus, monthLabel, isSyncing }) => {
  return (
    <div>
      {leads.length === 0 ? (
        <p className="center-note">Nenhum item no lixo em {monthLabel.toLowerCase()}.</p>
      ) : (
        <div className="list">
          {leads.map((lead) => (
            <div key={lead.id} className="row">
              <span className="row-main">
                <span className="row-title">{lead.name}</span>
                <span className="row-sub">{lead.notes || 'Sem notas'}</span>
              </span>
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
