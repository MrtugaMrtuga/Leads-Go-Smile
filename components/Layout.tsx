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
        <button type="button" className="header-right" aria-label="Admin" onClick={() => setActiveView('admin')}>
          <img className="logo-img" src="/logo_Gosmilesimple.png" alt="" />
        </button>
      </header>

      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="sub">{subtitle}</p>}

      {activeView !== 'admin' && activeView !== 'inbox' && activeView !== 'resumo' && (
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
