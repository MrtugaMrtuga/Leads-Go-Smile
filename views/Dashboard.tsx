import React, { useState } from 'react';
import { Lead } from '../types';
import { closeEvolution, pipelineBreakdown } from '../utils';

type ClosePeriod = ReturnType<typeof closeEvolution>[number];

interface DashboardProps {
  leads: Lead[];
  allLeads: Lead[];
  monthLabel: string;
}

function formatPct(value: number | null) {
  if (value == null) return '—';
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
  return `${text}%`;
}

function chartLabel(period: ClosePeriod, grain: 'day' | 'week') {
  if (grain === 'day') {
    const [, month, day] = period.key.split('-');
    return `${day}/${month}`;
  }
  return period.label.replace(/\/\d{4}/g, '').replace(' a ', ' – ');
}

const CloseChart: React.FC<{ periods: ClosePeriod[]; grain: 'day' | 'week' }> = ({ periods, grain }) => {
  if (!periods.length) return null;
  const max = Math.max(1, ...periods.map((period) => Math.max(period.positivo, period.totalFecho)));

  return (
    <figure className="chart" aria-label="Evolução de fecho positivo e fecho total">
      <figcaption className="chart-legend">
        <span className="chart-key">
          <span className="chart-swatch positivo" />
          Fecho positivo
        </span>
        <span className="chart-key">
          <span className="chart-swatch total" />
          Fecho total
        </span>
      </figcaption>
      {periods.map((period) => {
        const when = chartLabel(period, grain);
        return (
          <div
            key={period.key}
            className="chart-block"
            aria-label={`${when}: fecho positivo ${period.positivo}, fecho total ${period.totalFecho}`}
          >
            <div className="chart-head">
              <span>{when}</span>
              <span className="chart-count">
                {period.positivo} · {period.totalFecho}
              </span>
            </div>
            <div className="chart-track">
              <span className="chart-bar positivo" style={{ width: `${(period.positivo / max) * 100}%` }} />
            </div>
            <div className="chart-track">
              <span className="chart-bar total" style={{ width: `${(period.totalFecho / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </figure>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ leads, allLeads, monthLabel }) => {
  const total = leads.length;
  const novos = leads.filter((l) => l.status === 'new').length;
  const contactos = leads.filter((l) => l.status === 'contacted' || l.status === 'processing').length;
  const marcados = leads.filter((l) => l.status === 'scheduled').length;
  const perdidos = leads.filter((l) => l.status === 'discarded').length;
  const [metric, setMetric] = useState<'novos' | 'contactos' | 'marcados' | 'perdidos'>('novos');
  const [grain, setGrain] = useState<'day' | 'week'>('day');
  const stats = pipelineBreakdown(allLeads);
  const evolution = closeEvolution(allLeads, grain);

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
      <p className="sub">Quantidade e percentagem de todas as leads.</p>
      <div className="list">
        {stats.buckets.map((bucket) => (
          <div key={bucket.key} className="row">
            <span className="row-main">
              <span className="row-title">{bucket.label}</span>
            </span>
            <span className="stat-figures">
              <span className="row-value">{bucket.count}</span>
              <span className="stat-pct">{formatPct(bucket.pct)}</span>
            </span>
          </div>
        ))}
      </div>

      <h2 className="section-label">Evolução temporal</h2>
      <p className="sub">Fecho positivo: só marcadas. Fecho total: marcadas + descartadas.</p>
      <p className="sub">A percentagem é face às entradas do mesmo dia ou semana (Data Contacto). A data do fecho é Data fecho.</p>
      <div className="filters">
        <button type="button" className={`filter${grain === 'day' ? ' is-on' : ''}`} onClick={() => setGrain('day')}>
          Por dia
        </button>
        <button type="button" className={`filter${grain === 'week' ? ' is-on' : ''}`} onClick={() => setGrain('week')}>
          Por semana
        </button>
      </div>
      {evolution.length === 0 ? (
        <p className="center-note">Ainda não há datas para a evolução.</p>
      ) : (
        <>
          <CloseChart periods={evolution} grain={grain} />
          {evolution.map((period) => (
            <div key={period.key}>
              <h2 className="section-label">{period.label}</h2>
              <div className="list">
                <div className="row">
                  <span className="row-main">
                    <span className="row-title">Entradas</span>
                    <span className="row-sub">Data Contacto</span>
                  </span>
                  <span className="row-value">{period.entradas}</span>
                </div>
                <div className="row">
                  <span className="row-main">
                    <span className="row-title">Fecho positivo</span>
                    <span className="row-sub">Só marcadas</span>
                  </span>
                  <span className="stat-figures">
                    <span className="row-value">{period.positivo}</span>
                    <span className="stat-pct">{formatPct(period.positivoPct)}</span>
                  </span>
                </div>
                <div className="row">
                  <span className="row-main">
                    <span className="row-title">Fecho total</span>
                    <span className="row-sub">Marcadas + descartadas</span>
                  </span>
                  <span className="stat-figures">
                    <span className="row-value">{period.totalFecho}</span>
                    <span className="stat-pct">{formatPct(period.totalPct)}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

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
