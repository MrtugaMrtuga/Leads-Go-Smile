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
  const leadsEpoch = useRef(0);
  const loadSerial = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [settings, setSettings] = useState<AdminSettings>({ commissionPercent: 3 });

  const applyLeads = useCallback((nextLeads: Lead[], options?: { deferPersist?: boolean; epoch?: number }) => {
    if (options && options.epoch !== undefined && options.epoch !== leadsEpoch.current) return null;
    const mapped = sortLeadsNewestFirst(mapDataToLeads(nextLeads));
    setLeads(mapped);
    setListSettled(true);
    if (options?.deferPersist) persistLeadsAfterPaint(mapped);
    else writeCachedLeadsNow(mapped);
    return mapped;
  }, []);

  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  };

  const loadLeads = useCallback(async () => {
    const serial = ++loadSerial.current;
    const epoch = leadsEpoch.current;
    setIsLoading(true);
    setFetchError(null);
    try {
      const [next, nextSettings, health] = await Promise.all([fetchLeads(), fetchSettings(), fetchHealth()]);
      if (epoch !== leadsEpoch.current) return;
      setSettings(nextSettings);
      if (next.cache === 'unconfigured' || health.configured === false) {
        setFetchError('Defina APPS_SCRIPT_URL e APPS_SCRIPT_SECRET no Mini');
        if (readCachedLeads() === null) applyLeads(next.leads, { epoch });
      } else {
        applyLeads(next.leads, { epoch });
        if (next.cache === 'stale') {
          const fresh = await fetchLeads({ fresh: true });
          if (epoch !== leadsEpoch.current) return;
          applyLeads(fresh.leads, { epoch });
        }
      }
    } catch (error) {
      console.error(error);
      if (epoch === leadsEpoch.current) {
        setFetchError(error instanceof Error ? error.message : 'API local indisponível');
      }
    } finally {
      if (serial === loadSerial.current) setIsLoading(false);
    }
  }, [applyLeads]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const refreshFromSheet = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const epoch = leadsEpoch.current;
    // Paint the spinning icon before the sheet request starts.
    flushSync(() => {
      setIsRefreshing(true);
      setFetchError(null);
    });
    void (async () => {
      try {
        const next = await refreshLeads();
        if (epoch !== leadsEpoch.current) return;
        if (next.cache === 'unconfigured') {
          setFetchError('Defina APPS_SCRIPT_URL e APPS_SCRIPT_SECRET no Mini');
          return;
        }
        applyLeads(next.leads, { deferPersist: true, epoch });
      } catch (error) {
        console.error(error);
        if (epoch !== leadsEpoch.current) return;
        setFetchError(error instanceof Error ? error.message : 'Não foi possível atualizar a lista');
        setTimeout(() => setFetchError(null), 5000);
      } finally {
        refreshingRef.current = false;
        setIsRefreshing(false);
      }
    })();
  }, [applyLeads]);

  const handleLeadAction = async (id: string, updates: Partial<Lead>, extraData?: Partial<LeadUpdatePayload>) => {
    const motivo = extraData?.motivo ?? updates.discardReason;
    const nextStatus = extraData?.status || updates.status;
    const optimistic: Partial<Lead> = { ...updates };
    if (extraData?.medico !== undefined) optimistic.doctor = extraData.medico;
    if (extraData?.data_consulta !== undefined) optimistic.appointmentDate = extraData.data_consulta;
    if (extraData?.valor_fechado !== undefined) optimistic.value = extraData.valor_fechado;
    if (nextStatus) optimistic.status = nextStatus;
    if (extraData?.comentario !== undefined && !extraData.noteAppend && extraData.noteClear !== true) {
      optimistic.notes = extraData.comentario;
    }
    if (motivo !== undefined) optimistic.discardReason = motivo;

    const serverPayload: Record<string, unknown> = { ...optimistic };
    if (extraData?.noteAppend) {
      serverPayload.noteAppend = true;
      serverPayload.noteSet = false;
      serverPayload.notes = extraData.comentario ?? '';
    } else if (extraData?.noteClear) {
      serverPayload.noteClear = true;
      serverPayload.noteSet = true;
      serverPayload.notes = extraData.comentario ?? '';
    } else if (extraData?.comentario !== undefined) {
      serverPayload.notes = extraData.comentario;
      serverPayload.noteSet = true;
    } else if (!Object.prototype.hasOwnProperty.call(updates, 'notes')) {
      delete serverPayload.notes;
    }
    if (motivo !== undefined) serverPayload.motivo = motivo;

    const writeEpoch = ++leadsEpoch.current;
    const snapshot = leads.find((lead) => lead.id === id);
    setLeads((prev) => {
      const next = prev.map((lead) => (lead.id === id ? { ...lead, ...optimistic } as Lead : lead));
      writeCachedLeadsNow(next);
      return next;
    });
    const movedToAgenda = nextStatus === 'scheduled' && !!snapshot && snapshot.status !== 'scheduled';
    if (movedToAgenda) showNotice('Lead marcada. Está em Marcações.');
    setIsSyncing(true);
    setFetchError(null);
    try {
      const saved = await updateLead(id, serverPayload);
      if (writeEpoch !== leadsEpoch.current) return;
      setLeads((prev) => {
        const next = prev.map((lead) => (lead.id === id ? saved : lead));
        writeCachedLeadsNow(next);
        return next;
      });
    } catch (error) {
      console.error('Failed to sync:', error);
      if (writeEpoch !== leadsEpoch.current) return;
      if (movedToAgenda) setNotice(null);
      if (snapshot) {
        const previous = snapshot;
        setLeads((prev) => {
          const next = prev.map((lead) => (lead.id === id ? previous : lead));
          writeCachedLeadsNow(next);
          return next;
        });
      }
      setFetchError('Erro ao guardar na folha. A alteração não ficou gravada.');
      setTimeout(() => setFetchError(null), 5000);
    } finally {
      if (writeEpoch === leadsEpoch.current) setIsSyncing(false);
    }
  };

  const handleCreateLead = async (input: Pick<Lead, 'name' | 'phone' | 'email' | 'notes'>) => {
    const writeEpoch = ++leadsEpoch.current;
    setIsSyncing(true);
    try {
      const lead = await createLead({ ...input, status: 'new', source: 'Manual' });
      if (writeEpoch !== leadsEpoch.current) return;
      setLeads((prev) => {
        const next = sortLeadsNewestFirst([lead, ...prev.filter((item) => item.id !== lead.id)]);
        writeCachedLeadsNow(next);
        return next;
      });
    } catch (error) {
      console.error(error);
      if (writeEpoch !== leadsEpoch.current) return;
      setFetchError('Erro ao criar lead');
      setTimeout(() => setFetchError(null), 5000);
    } finally {
      if (writeEpoch === leadsEpoch.current) setIsSyncing(false);
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

  const syncLine = isSyncing
    ? { tone: 'busy' as const, text: 'A guardar na folha…' }
    : isRefreshing
      ? { tone: 'busy' as const, text: 'A atualizar a lista…' }
      : fetchError
        ? { tone: 'error' as const, text: fetchError }
        : null;

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
      {syncLine ? (
        <p
          className={`sync-line${syncLine.tone === 'error' ? ' is-error' : ''}`}
          role="status"
          aria-live={syncLine.tone === 'error' ? 'assertive' : 'polite'}
        >
          {syncLine.text}
        </p>
      ) : null}
      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
      {renderView()}
    </Layout>
  );
};

export default App;
