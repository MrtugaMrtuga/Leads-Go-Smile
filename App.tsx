import React, { useCallback, useEffect, useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import Inbox from './views/Inbox';
import Trash from './views/Trash';
import Agenda from './views/Agenda';
import Accounts from './views/Accounts';
import Admin from './views/Admin';
import { AppView, Lead, AdminSettings, LeadUpdatePayload } from './types';
import { formatMonthYear, getLeadsByMonth } from './utils';
import { createLead, fetchLeads, fetchSettings, saveSettings, sendReminder, updateLead } from './api';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('inbox');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [settings, setSettings] = useState<AdminSettings>({ commissionPercent: 3 });

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [nextLeads, nextSettings] = await Promise.all([fetchLeads(), fetchSettings()]);
      setLeads(nextLeads);
      setSettings(nextSettings);
    } catch (error) {
      console.error(error);
      setFetchError('API local indisponível');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleLeadAction = async (id: string, updates: Partial<Lead>, extraData?: Partial<LeadUpdatePayload>) => {
    const payload: Partial<Lead> & Record<string, unknown> = {
      ...updates,
      notes: extraData?.comentario ?? updates.notes,
      doctor: extraData?.medico ?? updates.doctor,
      appointmentDate: extraData?.data_consulta ?? updates.appointmentDate,
      value: extraData?.valor_fechado !== undefined ? extraData.valor_fechado : updates.value,
      status: extraData?.status || updates.status,
    };

    setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, ...payload } as Lead : lead)));
    setIsSyncing(true);
    try {
      const saved = await updateLead(id, payload);
      setLeads((prev) => prev.map((lead) => (lead.id === id ? saved : lead)));
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
      setLeads((prev) => [lead, ...prev.filter((item) => item.id !== lead.id)]);
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
        return <Dashboard leads={currentLeads} monthLabel={monthLabel} />;
      case 'inbox':
        return (
          <Inbox
            leads={currentLeads.filter((l) => l.status === 'new' || l.status === 'contacted')}
            onUpdateStatus={handleLeadAction}
            onCreateLead={handleCreateLead}
            onSync={loadLeads}
            monthLabel={monthLabel}
            isSyncing={isSyncing}
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
          />
        );
      case 'visitas':
        return (
          <Agenda
            leads={currentLeads.filter((l) => l.status === 'scheduled')}
            onUpdateStatus={handleLeadAction}
            onSendReminder={handleSendReminder}
            onSync={loadLeads}
            monthLabel={monthLabel}
            isSyncing={isSyncing}
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
          />
        );
      default:
        return <Dashboard leads={currentLeads} monthLabel={monthLabel} />;
    }
  };

  return (
    <Layout
      activeView={activeView}
      setActiveView={setActiveView}
      title={
        activeView === 'resumo'
          ? 'Dashboard'
          : activeView === 'visitas'
            ? 'Marcações'
            : activeView === 'lixo'
              ? 'Lixo'
              : activeView === 'contas'
                ? 'Contas'
                : activeView === 'admin'
                  ? 'Admin'
                  : 'Inbox'
      }
      subtitle={activeView === 'resumo' ? 'leads.evob.org' : undefined}
      currentMonthLabel={monthLabel}
      onPrevMonth={() => changeMonth(-1)}
      onNextMonth={() => changeMonth(1)}
      onSync={loadLeads}
      isSyncing={isLoading || isSyncing}
    >
      {(fetchError || isSyncing) && (
        <div className="toast">{isSyncing ? 'A processar…' : fetchError}</div>
      )}
      {renderView()}
    </Layout>
  );
};

export default App;
