import React, { useState } from 'react';
import { Lead } from '../types';

interface DashboardProps {
  leads: Lead[];
  monthLabel: string;
}

const Dashboard: React.FC<DashboardProps> = ({ leads, monthLabel }) => {
  const total = leads.length;
  const scheduled = leads.filter((l) => l.status === 'scheduled').length;
  const contacted = leads.filter((l) => l.status === 'contacted' || l.status === 'new').length;
  const lixo = leads.filter((l) => l.status === 'discarded').length;
  const [metric, setMetric] = useState<'inbox' | 'marcadas' | 'lixo'>('marcadas');

  const byOrigin = leads.reduce<Record<string, number>>((acc, lead) => {
    const key = lead.source || 'Local';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <p className="hero-kicker">{monthLabel}</p>
      <p className="hero-num">{total}</p>
      <p className="hero-foot">leads</p>

      <div className="circles">
        <button
          type="button"
          className={`circle-btn${metric === 'inbox' ? ' is-on' : ''}`}
          onClick={() => setMetric('inbox')}
        >
          <span className="circle">{contacted}</span>
          <span className="circle-label">Inbox</span>
        </button>
        <button
          type="button"
          className={`circle-btn${metric === 'marcadas' ? ' is-on' : ''}`}
          onClick={() => setMetric('marcadas')}
        >
          <span className="circle">{scheduled}</span>
          <span className="circle-label">Marcadas</span>
        </button>
        <button
          type="button"
          className={`circle-btn${metric === 'lixo' ? ' is-on' : ''}`}
          onClick={() => setMetric('lixo')}
        >
          <span className="circle">{lixo}</span>
          <span className="circle-label">Lixo</span>
        </button>
      </div>

      <h2 className="section-label">Por origem</h2>
      <div className="list">
        {Object.keys(byOrigin).length === 0 ? (
          <p className="center-note">Sem leads neste mês.</p>
        ) : (
          Object.entries(byOrigin)
            .sort((a, b) => b[1] - a[1])
            .map(([origin, count]) => (
              <div key={origin} className="row">
                <span className="row-main">
                  <span className="row-title">{origin}</span>
                </span>
                <span className="row-value">{count}</span>
              </div>
            ))
        )}
      </div>
    </div>
  );
};

export default Dashboard;
