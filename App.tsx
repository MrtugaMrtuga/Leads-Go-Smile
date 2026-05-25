
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import Inbox from './views/Inbox';
import Trash from './views/Trash';
import Agenda from './views/Agenda';
import Accounts from './views/Accounts';
import Admin from './views/Admin';
import { AppView, Lead, AdminSettings, LeadUpdatePayload } from './types';
import { formatMonthYear, getLeadsByMonth, inferStatus } from './utils';
import { MOCK_LEADS_DATA } from './constants';

const WEBHOOK_URL = import.meta.env.VITE_LEADS_FETCH_URL || 'https://n8n.evob.org/webhook/997a304a-2dc7-4c4e-b935-bd19ce7f87de';
const UPDATE_WEBHOOK_URL = import.meta.env.VITE_LEADS_UPDATE_URL || 'https://n8n.evob.org/webhook/2f28ed96-5ed8-48af-b009-1d519cf07f9b';
const REMINDER_WEBHOOK_URL = import.meta.env.VITE_LEADS_REMINDER_URL || 'https://n8n.evob.org/webhook/reminder-email-gosmile';
const IS_LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('resumo');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [settings, setSettings] = useState<AdminSettings>({
    commissionPercent: 3,
    dataUrl: WEBHOOK_URL
  });

  const mapDataToLeads = (data: any[]): Lead[] => {
    return data
      .filter(item => item.Data && String(item.Data).length > 3 && item.Data !== 'z')
      .map((item: any) => {
        let timestamp: string;
        try {
          const rawDate = String(item.Data).trim();
          const [datePart, timePart = '00:00:00'] = rawDate.split(/\s+/);
          const sep = datePart.includes('/') ? '/' : '-';
          const dateParts = datePart.split(sep).map((part: string) => parseInt(part, 10));
          const [hours = 0, minutes = 0, seconds = 0] = timePart.split(':').map((part: string) => parseInt(part, 10));
          const [year, month, day] = dateParts[0] > 31
            ? [dateParts[0], dateParts[1], dateParts[2]]
            : [dateParts[2], dateParts[1], dateParts[0]];
          const localDate = new Date(year, month - 1, day, hours, minutes, seconds || 0);
          timestamp = isNaN(localDate.getTime()) ? new Date().toISOString() : localDate.toISOString();
        } catch (e) {
          timestamp = new Date().toISOString();
        }
        
        return {
          id: String(item.row_number || item.Row || item.ID || Math.random()),
          externalId: String(item.row_number || item.Row || item.ID || '0'),
          name: String(item.Nome || item.Name || 'Sem Nome'),
          phone: String(item.Telefone || item.Phone || ''),
          email: item.Email || '',
          timestamp: timestamp,
          status: inferStatus(item),
          isContacted: !!(item["Data Contacto"] || item["Responsável"] || item.Responsavel),
          notes: item.Comentários || item.Comentarios || '',
          doctor: item.Médico || item.Medico || '',
          appointmentDate: item["Data Primeira Consulta"] || item.DataConsulta || '',
          value: parseFloat(String(item["Valor Real Bruto"] || item.Valor || '0').replace(',', '.')) || 0
        };
      });
  };

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(settings.dataUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ action: 'list_leads' })
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setLeads(mapDataToLeads(data));
          return;
        }
      }
      throw new Error("Erro de rede");
    } catch (error) {
      const offlineMessage = error instanceof Error && error.name === 'AbortError'
        ? 'Tempo de ligação esgotado'
        : 'Sem ligação à folha';
      setFetchError(offlineMessage);
      if (leads.length === 0 && IS_LOCAL_PREVIEW) setLeads(mapDataToLeads(MOCK_LEADS_DATA));
    } finally {
      setIsLoading(false);
    }
  }, [leads.length, settings.dataUrl]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleLeadAction = async (id: string, updates: Partial<Lead>, extraData?: Partial<LeadUpdatePayload>) => {
    setLeads(prev => prev.map(lead => lead.id === id ? { ...lead, ...updates } : lead));
    
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    setIsSyncing(true);
    const now = new Date();
    const formattedNow = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    try {
      const payload: LeadUpdatePayload = {
        row_number: lead.externalId,
        nome: lead.name,
        status: updates.status || lead.status,
        estado: extraData?.estado,
        comentario: extraData?.comentario || updates.notes,
        medico: extraData?.medico || updates.doctor,
        data_consulta: extraData?.data_consulta || updates.appointmentDate,
        valor_fechado: extraData?.valor_fechado !== undefined ? extraData.valor_fechado : updates.value,
        data_tratamento: formattedNow
      };

      const response = await fetch(UPDATE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Sync falhou");
    } catch (error) {
      console.error('Failed to sync:', error);
      setFetchError("Erro na sincronização");
      setTimeout(() => setFetchError(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendReminder = async (lead: Lead) => {
    setIsSyncing(true);
    try {
      // Incluindo todos os campos conforme solicitado para garantir que o n8n tenha toda a informação
      const payload = {
        row_number: lead.externalId,
        nome: lead.name,
        telefone: lead.phone,
        email: lead.email,
        medico: lead.doctor,
        data_consulta: lead.appointmentDate,
        comentarios: lead.notes,
        status: lead.status,
        timestamp_envio: new Date().toISOString()
      };

      const response = await fetch(REMINDER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error("Falha ao enviar lembrete");
      alert(`Lembrete enviado com sucesso para ${lead.name}`);
    } catch (error) {
      console.error('Reminder failed:', error);
      alert("Erro ao enviar lembrete de e-mail.");
    } finally {
      setIsSyncing(false);
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
      case 'resumo': return <Dashboard leads={currentLeads} monthLabel={monthLabel} />;
      case 'inbox': return (
        <Inbox 
          leads={currentLeads.filter(l => l.status === 'new' || l.status === 'contacted')} 
          onUpdateStatus={handleLeadAction} 
          onSync={fetchLeads} 
          monthLabel={monthLabel}
          isSyncing={isSyncing}
        />
      );
      case 'lixo': return <Trash leads={currentLeads.filter(l => l.status === 'discarded')} onSync={fetchLeads} monthLabel={monthLabel} isSyncing={isSyncing} />;
      case 'visitas': return (
        <Agenda 
          leads={currentLeads.filter(l => l.status === 'scheduled')} 
          onUpdateStatus={handleLeadAction} 
          onSendReminder={handleSendReminder}
          onSync={fetchLeads} 
          monthLabel={monthLabel} 
          isSyncing={isSyncing} 
        />
      );
      case 'contas': return (
        <Accounts 
          leads={currentLeads.filter(l => l.status === 'completed' || l.status === 'paid')} 
          onUpdateStatus={handleLeadAction} 
          onSync={fetchLeads} 
          monthLabel={monthLabel} 
          isSyncing={isSyncing} 
        />
      );
      case 'admin': return <Admin settings={settings} onUpdateSettings={setSettings} leads={leads} onUpdateStatus={handleLeadAction} />;
      default: return <Dashboard leads={currentLeads} monthLabel={monthLabel} />;
    }
  };

  return (
    <Layout 
      activeView={activeView} 
      setActiveView={setActiveView} 
      title={activeView === 'resumo' ? 'Resumo' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
      subtitle={activeView === 'resumo' ? 'GOSMILE CLINIC' : undefined}
      currentMonthLabel={monthLabel}
      onPrevMonth={() => changeMonth(-1)}
      onNextMonth={() => changeMonth(1)}
      onSync={fetchLeads}
      isSyncing={isLoading || isSyncing}
    >
      {(fetchError || isSyncing) && (
        <div className={`px-4 py-2 text-[10px] font-bold text-center uppercase tracking-tight transition-all fixed top-[110px] left-0 right-0 z-50 shadow-md ${isSyncing ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'}`}>
          {isSyncing ? "A processar..." : fetchError}
        </div>
      )}
      {renderView()}
    </Layout>
  );
};

export default App;
