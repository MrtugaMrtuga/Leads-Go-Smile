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
  onSync,
  isSyncing,
}) => {
  return (
    <div className="app">
      <header className="header">
        <span className="word">GoSmile</span>
        <div className="header-right">
          <button
            type="button"
            className="gear-btn"
            aria-label="Admin"
            onClick={() => setActiveView('admin')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81a.49.49 0 0 0-.48-.41h-3.84a.49.49 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.11.2-.06.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.47.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
            </svg>
          </button>
          <img className="logo-img" src="/logo_Gosmilesimple.png" alt="" />
        </div>
      </header>

      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="sub">{subtitle}</p>}

      {activeView !== 'admin' && (
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

      {onSync && activeView !== 'admin' && (
        <div className="tools">
          <button type="button" onClick={onSync} disabled={isSyncing}>
            {isSyncing ? 'A actualizar…' : 'Actualizar'}
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
