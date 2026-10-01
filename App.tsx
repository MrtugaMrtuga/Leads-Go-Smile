import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import Inbox from './views/Inbox';
import Trash from './views/Trash';
import Agenda from './views/Agenda';
import Accounts from './views/Accounts';
import Admin from './views/Admin';
import { AppView, Lead, AdminSettings, LeadUpdatePayload } from './types';
import { formatMonthYear, getLeadsByMonth, mapDataToLeads, sortLeadsNewestFirst } from './utils';
import { createLead, fetchHealth, fetchLeads, fetchSettings, refreshLeads, saveSettings, sendReminder, updateLead } from './api';
import { readCachedLeads, writeCachedLeads } from './leadCache';

function leadsFromCache(): Lead[] {
  const cached = readCachedLeads();
  return cached ? sortLeadsNewestFirst(mapDataToLeads(cached)) : [];
}

let leadsPersistGeneration = 0;

function writeCachedLeadsNow(leads: Lead[]) {
  leadsPersistGeneration += 1;
  writeCachedLeads(leads);
}

/** Let the new list paint before localStorage. A newer write cancels this one. */
function persistLeadsAfterPaint(leads: Lead[]) {
  const generation = ++leadsPersistGeneration;
  const write = () => {
    if (generation !== leadsPersistGeneration) return;
    writeCachedLeads(leads);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      setTimeout(write, 0);
    });
  } else {
    setTimeout(write, 0);
  }
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('inbox');
  const [leads, setLeads] = useState<Lead[]>(leadsFromCache);
  const [isLoading, setIsLoading] = useState(true);
  const [listSettled, setListSettled] = useState(() => readCachedLeads() !== null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [settings, setSettings] = useState<AdminSettings>({ commissionPercent: 3 });

  const applyLeads = useCallback((nextLeads: Lead[], options?: { deferPersist?: boolean }) => {
    const mapped = sortLeadsNewestFirst(mapDataToLeads(nextLeads));
    setLeads(mapped);
    setListSettled(true);
    if (options?.deferPersist) persistLeadsAfterPaint(mapped);
    else writeCachedLeadsNow(mapped);
    return mapped;
  }, []);

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [next, nextSettings, health] = await Promise.all([fetchLeads(), fetchSettings(), fetchHealth()]);
      setSettings(nextSettings);
      if (next.cache === 'unconfigured' || health.configured === false) {
        setFetchError('Defina APPS_SCRIPT_URL e APPS_SCRIPT_SECRET no Mini');
        if (readCachedLeads() === null) applyLeads(next.leads);
      } else {
        applyLeads(next.leads);
        if (next.cache === 'stale') {
          const fresh = await fetchLeads({ fresh: true });
          applyLeads(fresh.leads);
        }
      }
    } catch (error) {
      console.error(error);
      setFetchError(error instanceof Error ? error.message : 'API local indisponível');
    } finally {
      setIsLoading(false);
    }
  }, [applyLeads]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const refreshFromSheet = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    // Paint the spinning icon before the sheet request starts.
    flushSync(() => {
      setIsRefreshing(true);
      setFetchError(null);
    });
    void (async () => {
      try {
        const next = await refreshLeads();
        if (next.cache === 'unconfigured') {
          setFetchError('Defina APPS_SCRIPT_URL e APPS_SCRIPT_SECRET no Mini');
          return;
        }
        applyLeads(next.leads, { deferPersist: true });
      } catch (error) {
        console.error(error);
        setFetchError(error instanceof Error ? error.message : 'API local indisponível');
        setTimeout(() => setFetchError(null), 3000);
      } finally {
        refreshingRef.current = false;
        setIsRefreshing(false);
      }
    })();
  }, [applyLeads]);

  const handleLeadAction = async (id: string, updates: Partial<Lead>, extraData?: Partial<LeadUpdatePayload>) => {
    const motivo = extraData?.motivo ?? updates.discardReason;
    const payload: Partial<Lead> & Record<string, unknown> = {
      ...updates,
      notes: extraData?.comentario ?? updates.notes,
      doctor: extraData?.medico ?? updates.doctor,
      appointmentDate: extraData?.data_consulta ?? updates.appointmentDate,
      value: extraData?.valor_fechado !== undefined ? extraData.valor_fechado : updates.value,
      status: extraData?.status || updates.status,
    };
    if (motivo !== undefined) {
      payload.motivo = motivo;
      payload.discardReason = motivo;
    }

    setLeads((prev) => {
      const next = prev.map((lead) => (lead.id === id ? { ...lead, ...payload } as Lead : lead));
      writeCachedLeadsNow(next);
      return next;
    });
    setIsSyncing(true);
    try {
      const saved = await updateLead(id, payload);
      setLeads((prev) => {
        const next = prev.map((lead) => (lead.id === id ? saved : lead));
        writeCachedLeadsNow(next);
        return next;
      });
    } catch (error) {
      console.error('Failed to sync:', error);
      setFetchError('Erro ao guardar lead');
      setTimeout(() => setFetchError(null), 3000);
      await loadLeads();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateLead = async (input: Pick<Lead, 'name' | 'phone' | 'email' | 'notes'>) => {
    setIsSyncing(true);
    try {
      const lead = await createLead({ ...input, status: 'new', source: 'Manual' });
      setLeads((prev) => {
        const next = sortLeadsNewestFirst([lead, ...prev.filter((item) => item.id !== lead.id)]);
        writeCachedLeadsNow(next);
        return next;
      });
    } catch (error) {
      console.error(error);
      setFetchError('Erro ao criar lead');
      setTimeout(() => setFetchError(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendReminder = async (lead: Lead) => {
    setIsSyncing(true);
    try {
      await sendReminder(lead);
      alert(`Lembrete registado localmente para ${lead.name}`);
    } catch (error) {
      console.error('Reminder failed:', error);
      alert('Erro ao registar lembrete.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateSettings = async (next: AdminSettings) => {
    setSettings(next);
    try {
      setSettings(await saveSettings(next));
    } catch (error) {
      console.error(error);
      setFetchError('Erro ao guardar definições');
      setTimeout(() => setFetchError(null), 3000);
    }
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setSelectedDate(newDate);
  };

  const monthLabel = formatMonthYear(selectedDate);
  const currentLeads = getLeadsByMonth(leads, selectedDate.getMonth(), selectedDate.getFullYear());

  const renderView = () => {
    switch (activeView) {
      case 'resumo':
        return (
          <Dashboard
            leads={currentLeads}
            allLeads={leads}
            monthLabel={monthLabel}
            isLoading={isLoading}
            listSettled={listSettled}
          />
        );
      case 'inbox':
        return (
          <Inbox
            leads={leads}
            onUpdateStatus={handleLeadAction}
            onCreateLead={handleCreateLead}
            onSync={loadLeads}
            monthLabel={monthLabel}
            isSyncing={isSyncing}
            isLoading={isLoading}
            listSettled={listSettled}
          />
        );
      case 'lixo':
        return (
          <Trash
            leads={currentLeads.filter((l) => l.status === 'discarded')}
            onUpdateStatus={handleLeadAction}
            onSync={loadLeads}
            monthLabel={monthLabel}
            isSyncing={isSyncing}
            isLoading={isLoading}
            listSettled={listSettled}
          />
        );
      case 'visitas':
        return (
          <Agenda
            leads={leads.filter((l) => l.status === 'scheduled')}
            onUpdateStatus={handleLeadAction}
            onSendReminder={handleSendReminder}
            onSync={loadLeads}
            isSyncing={isSyncing}
            isLoading={isLoading}
            listSettled={listSettled}
          />
        );
      case 'contas':
        return (
          <Accounts
            leads={currentLeads.filter((l) => l.status === 'completed' || l.status === 'paid')}
            onUpdateStatus={handleLeadAction}
            onSync={loadLeads}
            monthLabel={monthLabel}
            isSyncing={isSyncing}
            isLoading={isLoading}
            listSettled={listSettled}
          />
        );
      case 'admin':
        return (
          <Admin
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            leads={leads}
            onUpdateStatus={handleLeadAction}
            onOpenTrash={() => setActiveView('lixo')}
            onOpenAccounts={() => setActiveView('contas')}
            isLoading={isLoading}
            listSettled={listSettled}
          />
        );
      default:
        return (
          <Dashboard
            leads={currentLeads}
            allLeads={leads}
            monthLabel={monthLabel}
            isLoading={isLoading}
            listSettled={listSettled}
          />
        );
    }
  };

  return (
    <Layout
      activeView={activeView}
      setActiveView={setActiveView}
      title={
        activeView === 'resumo'
          ? 'Estatísticas'
          : activeView === 'visitas'
            ? 'Marcações'
            : activeView === 'lixo'
              ? 'Descartadas'
              : activeView === 'contas'
                ? 'Contas'
                : activeView === 'admin'
                  ? 'Admin'
                  : 'Inbox'
      }
      subtitle={undefined}
      currentMonthLabel={monthLabel}
      onPrevMonth={() => changeMonth(-1)}
      onNextMonth={() => changeMonth(1)}
      onSync={loadLeads}
      isSyncing={isLoading || isSyncing}
      onRefresh={refreshFromSheet}
      isRefreshing={isRefreshing}
    >
      {(fetchError || isSyncing) && (
        <div className="toast">{isSyncing ? 'A processar…' : fetchError}</div>
      )}
      {renderView()}
    </Layout>
  );
};

export default App;
