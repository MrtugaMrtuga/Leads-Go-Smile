import React, { useMemo, useState } from 'react';
import { Lead } from '../types';
import { closeWindow, listStatusCopy } from '../utils';

interface DashboardProps {
  leads: Lead[];
  allLeads?: Lead[];
  monthLabel: string;
  isLoading?: boolean;
  listSettled?: boolean;
}

type Span = 7 | 30 | 90;
type Mode = 'line' | 'bars';
type Point = ReturnType<typeof closeWindow>['points'][number];

const SPANS: Span[] = [7, 30, 90];

function formatPct(value: number | null) {
  if (value == null) return '—';
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
  return `${text}%`;
}

function labelIndexes(count: number) {
  if (count <= 7) return new Set(pointsRange(count));
  const slots = 5;
  const indexes = new Set<number>();
  for (let slot = 0; slot < slots; slot += 1) {
    indexes.add(Math.round((slot * (count - 1)) / (slots - 1)));
  }
  return indexes;
}

function pointsRange(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

const EvolutionChart: React.FC<{ points: Point[]; mode: Mode }> = ({ points, mode }) => {
  const width = 360;
  const height = 196;
  const plotTop = 14;
  const plotBottom = 164;
  const plotLeft = 6;
  const plotRight = 354;
  const max = Math.max(1, ...points.map((point) => Math.max(point.marcacoes, point.fecho)));
  const labels = labelIndexes(points.length);

  const xAt = (index: number) => {
    if (points.length <= 1) return (plotLeft + plotRight) / 2;
    return plotLeft + (index / (points.length - 1)) * (plotRight - plotLeft);
  };
  const yAt = (value: number) => plotBottom - (value / max) * (plotBottom - plotTop);

  const line = (key: 'marcacoes' | 'fecho') =>
    points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)},${yAt(point[key]).toFixed(1)}`)
      .join(' ');

  const groupWidth = points.length ? (plotRight - plotLeft) / points.length : 0;
  const barWidth = Math.max(2, Math.min(10, groupWidth * 0.28));

  return (
    <svg className="evo-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Marcações a preto e fecho a madeira">
      <line className="evo-base" x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} />
      {mode === 'line' ? (
        <>
          <path className="evo-line wood" d={line('fecho')} />
          <path className="evo-line ink" d={line('marcacoes')} />
          {points.map((point, index) => (
            <g key={point.key}>
              <circle className="evo-dot wood" cx={xAt(index)} cy={yAt(point.fecho)} r="3" />
              <circle className="evo-dot ink" cx={xAt(index)} cy={yAt(point.marcacoes)} r="3" />
            </g>
          ))}
        </>
      ) : (
        points.map((point, index) => {
          const center = plotLeft + groupWidth * index + groupWidth / 2;
          const marcacoesHeight = (point.marcacoes / max) * (plotBottom - plotTop);
          const fechoHeight = (point.fecho / max) * (plotBottom - plotTop);
          return (
            <g key={point.key}>
              <rect
                className="evo-col ink"
                x={center - barWidth - 1}
                y={plotBottom - marcacoesHeight}
                width={barWidth}
                height={marcacoesHeight}
              />
              <rect
                className="evo-col wood"
                x={center + 1}
                y={plotBottom - fechoHeight}
                width={barWidth}
                height={fechoHeight}
              />
            </g>
          );
        })
      )}
      {points.map((point, index) =>
        labels.has(index) ? (
          <text key={`${point.key}-label`} className="evo-label" x={xAt(index)} y="188" textAnchor="middle">
            {point.label}
          </text>
        ) : null
      )}
    </svg>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ allLeads, isLoading, listSettled }) => {
  const [span, setSpan] = useState<Span>(30);
  const [mode, setMode] = useState<Mode>('line');
  const series = useMemo(() => closeWindow(allLeads || [], span), [allLeads, span]);
  const { totals } = series;

  const kpis = [
    { key: 'marcacoes', label: 'Marcações', count: totals.marcacoes, pct: totals.marcacoesPct },
    { key: 'fecho', label: 'Fecho', count: totals.fecho, pct: totals.fechoPct },
    { key: 'descartadas', label: 'Descartadas', count: totals.descartadas, pct: totals.descartadasPct },
  ];

  return (
    <div className="stats-screen">
      <div className="period" role="tablist" aria-label="Período">
        {SPANS.map((days, index) => (
          <React.Fragment key={days}>
            {index > 0 ? <span className="period-dot" aria-hidden="true">·</span> : null}
            <button
              type="button"
              className={`filter${span === days ? ' is-on' : ''}`}
              onClick={() => setSpan(days)}
            >
              {days} dias
            </button>
          </React.Fragment>
        ))}
      </div>

      <p className="hero-num">{totals.marcacoes}</p>
      <p className="hero-foot">marcações</p>

      <div className="evo-top">
        <p className="evo-legend">
          <span><i className="evo-mark ink" /> Marcações</span>
          <span><i className="evo-mark wood" /> Fecho</span>
        </p>
        <div className="period evo-mode" role="tablist" aria-label="Tipo de gráfico">
          <button type="button" className={`filter${mode === 'line' ? ' is-on' : ''}`} onClick={() => setMode('line')}>
            Linha
          </button>
          <button type="button" className={`filter${mode === 'bars' ? ' is-on' : ''}`} onClick={() => setMode('bars')}>
            Barras
          </button>
        </div>
      </div>

      {isLoading && series.points.length > 0 ? <p className="updating">A atualizar…</p> : null}
      {series.points.length === 0 ? (
        <p className="center-note">
          {listStatusCopy(isLoading, listSettled, 'Ainda não há datas para a evolução.')}
        </p>
      ) : (
        <EvolutionChart points={series.points} mode={mode} />
      )}

      <div className="list evo-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="row">
            <span className="row-main">
              <span className="row-title">{kpi.label}</span>
            </span>
            <span className="stat-figures">
              <span className="row-value">{kpi.count}</span>
              <span className="stat-pct">{formatPct(kpi.pct)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
