
import React from 'react';
import { LayoutGrid, Activity, Trash2, Calendar, PlusCircle, Settings } from 'lucide-react';
import { AppView } from './types';

export const NAVIGATION_ITEMS = [
  { id: 'resumo' as AppView, label: 'RESUMO', icon: <LayoutGrid size={22} /> },
  { id: 'inbox' as AppView, label: 'INBOX', icon: <Activity size={22} /> },
  { id: 'lixo' as AppView, label: 'LIXO', icon: <Trash2 size={22} /> },
  { id: 'visitas' as AppView, label: 'VISITAS', icon: <Calendar size={22} /> },
  { id: 'contas' as AppView, label: 'CONTAS', icon: <PlusCircle size={22} /> },
  { id: 'admin' as AppView, label: 'ADMIN', icon: <Settings size={22} /> },
];

