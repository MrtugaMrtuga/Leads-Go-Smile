import React from 'react';
import { DOCK_ITEMS } from '../constants';
import { AppView } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  title: string;
  subtitle?: string;
  currentMonthLabel: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  activeView,
  setActiveView,
  title,
  subtitle,
  currentMonthLabel,
  onPrevMonth,
  onNextMonth,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="app">
      <header className="header">
        <span className="word">GoSmile</span>
        <div className="header-tools">
          {onRefresh && (
            <button
              type="button"
              className={`refresh-btn${isRefreshing ? ' is-busy' : ''}`}
              aria-label="Atualizar"
              aria-busy={isRefreshing || undefined}
              disabled={isRefreshing}
              onClick={onRefresh}
            >
              <svg className="refresh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
            </button>
          )}
          <button type="button" className="header-right" aria-label="Admin" onClick={() => setActiveView('admin')}>
            <img className="logo-img" src="/logo_Gosmilesimple.png" alt="" />
          </button>
        </div>
      </header>

      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="sub">{subtitle}</p>}

      {activeView !== 'admin' && activeView !== 'inbox' && activeView !== 'resumo' && activeView !== 'visitas' && (
        <div className="month-nav">
          <button type="button" onClick={onPrevMonth} aria-label="Mês anterior">
            ←
          </button>
          <span>{currentMonthLabel}</span>
          <button type="button" onClick={onNextMonth} aria-label="Mês seguinte">
            →
          </button>
        </div>
      )}

      <main>{children}</main>

      <nav className="dock" aria-label="Navegação">
        {DOCK_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`dock-item${activeView === item.id ? ' is-on' : ''}`}
            onClick={() => setActiveView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
