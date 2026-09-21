import React, { useState } from 'react';
import { Lead } from '../types';
import { pipelineStats } from '../utils';

interface DashboardProps {
  leads: Lead[];
  allLeads: Lead[];
  monthLabel: string;
}

function formatPct(value: number) {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
  return `${text}%`;
}

const Dashboard: React.FC<DashboardProps> = ({ leads, allLeads, monthLabel }) => {
  const total = leads.length;
  const novos = leads.filter((l) => l.status === 'new').length;
  const contactos = leads.filter((l) => l.status === 'contacted' || l.status === 'processing').length;
  const marcados = leads.filter((l) => l.status === 'scheduled').length;
  const perdidos = leads.filter((l) => l.status === 'discarded').length;
  const [metric, setMetric] = useState<'novos' | 'contactos' | 'marcados' | 'perdidos'>('novos');
  const stats = pipelineStats(allLeads);

  const byOrigin = leads.reduce<Record<string, number>>((acc, lead) => {
    const key = lead.source || 'Local';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const circles = [
    { id: 'novos' as const, value: novos, label: 'Novos' },
    { id: 'contactos' as const, value: contactos, label: 'Contactos' },
    { id: 'marcados' as const, value: marcados, label: 'Marcados' },
    { id: 'perdidos' as const, value: perdidos, label: 'Perdidos' },
  ];

  return (
    <div>
      <p className="hero-num">{total}</p>
      <p className="hero-foot">leads · {monthLabel.toLowerCase()}</p>

      <div className="circles">
        {circles.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`circle-btn${metric === item.id ? ' is-on' : ''}`}
            onClick={() => setMetric(item.id)}
          >
            <span className="circle">{item.value}</span>
            <span className="circle-label">{item.label}</span>
          </button>
        ))}
      </div>

      <h2 className="section-label">Estatísticas</h2>
      <p className="sub">Percentagem de todas as leads ({stats.total})</p>
      <div className="list">
        <div className="row">
          <span className="row-main">
            <span className="row-title">Descartadas</span>
          </span>
          <span className="row-value">{formatPct(stats.discardedPct)}</span>
        </div>
        <div className="row">
          <span className="row-main">
            <span className="row-title">Marcadas</span>
          </span>
          <span className="row-value">{formatPct(stats.bookedPct)}</span>
        </div>
        <div className="row">
          <span className="row-main">
            <span className="row-title">Em processamento</span>
          </span>
          <span className="row-value">{formatPct(stats.processingPct)}</span>
        </div>
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
                <span className="chevron">›</span>
              </div>
            ))
        )}
      </div>
    </div>
  );
};

export default Dashboard;
