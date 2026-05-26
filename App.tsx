
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

const WEBHOOK_URL = 'https://n8n.evob.org/webhook/LandingPage';
const READ_WEBHOOK_FALLBACK_URL = 'https://n8n.evob.org/webhook/997a304a-2dc7-4c4e-b935-bd19ce7f87de';
const UPDATE_WEBHOOK_URL = 'https://n8n.evob.org/webhook/2f28ed96-5ed8-48af-b009-1d519cf07f9b';
const REMINDER_WEBHOOK_URL = 'https://n8n.evob.org/webhook/reminder-email-gosmile'; // URL sugerida para lembretes

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
    const parseTimestamp = (item: any): string => {
      const raw = item.Data || item.created_at || item.timestamp || item.date;
      if (!raw) return new Date().toISOString();

      try {
        // Suporta ISO e também formato "YYYY-MM-DD HH:mm:ss"
        const normalized = String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T');
        const d = new Date(normalized);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch (_) {}

      return new Date().toISOString();
    };

    return data
      .filter((item: any) => !!(item?.Data || item?.created_at || item?.timestamp || item?.date || item?.name || item?.Nome))
      .map((item: any, index: number) => {
        const externalId = String(item.row_number || item.id || item.lead_id || index + 1);

        return {
          id: externalId,
          externalId,
          name: String(item.Nome || item.name || 'Sem Nome'),
          phone: String(item.Telefone || item.phone || ''),
          email: item.Email || item.email || '',
          timestamp: parseTimestamp(item),
          status: inferStatus(item),
          isContacted: !!(item['Data Contacto'] || item['Responsável'] || item.contacted_at || item.contacted_by),
          notes: item.Comentários || item.message || item.notes || '',
          doctor: item.Médico || item.medico || item.doctor || '',
          appointmentDate: item['Data Primeira Consulta'] || item.data_consulta || item.appointment_date || '',
          value: Number(item['Valor Real Bruto'] || item.valor_fechado || item.value || 0) || 0
        };
      });
  };

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const sourceUrl = settings.dataUrl || WEBHOOK_URL;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(sourceUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setLeads(mapDataToLeads(data));
          return;
        }
      }

      // Fallback de leitura: o webhook /LandingPage é de intake (escrita) e pode não devolver lista.
      const fallbackResponse = await fetch(READ_WEBHOOK_FALLBACK_URL);
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (Array.isArray(fallbackData)) {
          setLeads(mapDataToLeads(fallbackData));
          setFetchError("Leitura em fallback (endpoint novo sem API de leitura)");
          return;
        }
      }

      throw new Error("Erro de rede");
    } catch (error) {
      setFetchError("Modo Offline");
      if (leads.length === 0) setLeads(mapDataToLeads(MOCK_LEADS_DATA));
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
        lead_id: lead.externalId,
        nome: lead.name,
        name: lead.name,
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
