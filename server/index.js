import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEET_TAB } from '../shared/inboundMeta.js';
import {
  appsScriptConfig,
  createInboundLead,
  getInboundLead,
  listInboundLeads,
  SheetError,
  updateInboundLead,
} from './sheetClient.js';
import { addReminder, getSettings, listReminders, retireLeadsJson, saveSettings } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3040;
const isProd = process.env.NODE_ENV === 'production';

const ALLOWED_STATUSES = new Set([
  'new',
  'contacted',
  'processing',
  'discarded',
  'scheduled',
  'positive',
  'completed',
  'paid',
]);

const ESTADO_TO_STATUS = {
  pago: 'paid',
  fechado: 'completed',
  'não interessada': 'discarded',
  'nao interessada': 'discarded',
  descartada: 'discarded',
  descartado: 'discarded',
  faltou: 'contacted',
  'em processamento': 'processing',
  'não atendeu': 'processing',
  'nao atendeu': 'processing',
  marcada: 'scheduled',
  marcado: 'scheduled',
};

function normalizeBody(body = {}) {
  const name = body.name ?? body.Nome ?? body.nome;
  const phone = body.phone ?? body.Telefone ?? body.telefone;
  const email = body.email ?? body.Email;
  const notes = body.notes ?? body.Comentários ?? body.comentario ?? body.message;
  const doctor = body.doctor ?? body.Médico ?? body.medico;
  const appointmentDate = body.appointmentDate ?? body['Data Primeira Consulta'] ?? body.data_consulta;
  const timestamp = body.timestamp ?? body.Data ?? body.created_at ?? body.date;
  const value = body.value ?? body['Valor Real Bruto'] ?? body.valor_fechado;
  const source = body.source ?? body.Origem;
  const rawStatus = body.status ?? body.estado;
  const status = rawStatus
    ? ESTADO_TO_STATUS[String(rawStatus).toLowerCase()] || rawStatus
    : undefined;

  const out = { ...body };
  if (name !== undefined) out.name = name;
  if (phone !== undefined) out.phone = phone;
  if (email !== undefined) out.email = email;
  if (notes !== undefined) out.notes = notes;
  if (doctor !== undefined) out.doctor = doctor;
  if (appointmentDate !== undefined) out.appointmentDate = appointmentDate;
  if (timestamp !== undefined) out.timestamp = timestamp;
  if (value !== undefined) out.value = value;
  if (source !== undefined) out.source = source;
  if (status !== undefined) out.status = status;
  if (body.isContacted !== undefined) out.isContacted = Boolean(body.isContacted);
  else if (body['Data Contacto'] || body['Responsável']) out.isContacted = true;
  return out;
}

function sanitizeLeadInput(raw = {}) {
  const body = normalizeBody(raw);
  const out = {};
  if (body.name !== undefined) out.name = String(body.name);
  if (body.phone !== undefined) out.phone = String(body.phone);
  if (body.email !== undefined) out.email = String(body.email);
  if (body.timestamp !== undefined) out.timestamp = String(body.timestamp);
  if (body.notes !== undefined) out.notes = String(body.notes);
  if (body.doctor !== undefined) out.doctor = String(body.doctor);
  if (body.appointmentDate !== undefined) out.appointmentDate = String(body.appointmentDate);
  if (body.source !== undefined) out.source = String(body.source);
  if (body.value !== undefined) out.value = Number(body.value) || 0;
  if (body.isContacted !== undefined) out.isContacted = Boolean(body.isContacted);
  if (body.status !== undefined) {
    const status = String(body.status);
    if (ALLOWED_STATUSES.has(status)) out.status = status;
  }
  if (body.comentario !== undefined && out.notes === undefined) {
    out.notes = String(body.comentario);
    out.noteSet = true;
  }
  if (body.notes !== undefined) out.noteSet = true;
  if (body.medico !== undefined && out.doctor === undefined) out.doctor = String(body.medico);
  if (body.data_consulta !== undefined && out.appointmentDate === undefined) {
    out.appointmentDate = String(body.data_consulta);
  }
  if (body.valor_fechado !== undefined && out.value === undefined) {
    out.value = Number(body.valor_fechado) || 0;
  }
  if (Array.isArray(body.formFields)) {
    out.formFields = body.formFields
      .filter((field) => field && String(field.value ?? '').trim() !== '')
      .map((field) => ({
        key: String(field.key || ''),
        label: String(field.label || ''),
        value: String(field.value).trim(),
      }));
  }
  if (body.sourceTab !== undefined) out.sourceTab = String(body.sourceTab);
  if (body.externalId !== undefined) out.externalId = String(body.externalId);
  if (body.crm && typeof body.crm === 'object' && !Array.isArray(body.crm)) out.crm = body.crm;
  if (body.fields && typeof body.fields === 'object') out.fields = body.fields;
  if (body.motivo !== undefined) out.motivo = String(body.motivo);
  else if (body.discardReason !== undefined) out.motivo = String(body.discardReason);
  return out;
}

function sendSheetError(res, error) {
  const status = error instanceof SheetError ? error.statusCode : 502;
  const message = error?.message || 'Folha Inbound META indisponível';
  res.status(status).json({ error: message });
}

export function createApiRouter() {
  const api = express.Router();

  api.get('/health', (_req, res) => {
    const config = appsScriptConfig();
    res.json({
      ok: true,
      app: 'GoSmile Leads',
      host: 'leads.evob.org',
      storage: 'apps-script',
      sheetTab: SHEET_TAB,
      configured: config.configured,
    });
  });

  api.get('/leads', async (_req, res) => {
    try {
      const { leads } = await listInboundLeads();
      res.json(leads);
    } catch (error) {
      sendSheetError(res, error);
    }
  });

  api.post('/sync/inbound-meta', async (_req, res) => {
    try {
      const { leads, configured } = await listInboundLeads();
      res.json({
        ok: true,
        storage: 'apps-script',
        configured,
        sheetTab: SHEET_TAB,
        count: leads.length,
        imported: 0,
        updated: 0,
      });
    } catch (error) {
      res.status(error.statusCode || 502).json({ ok: false, error: error.message || String(error) });
    }
  });

  api.get('/leads/:id', async (req, res) => {
    try {
      const lead = await getInboundLead(req.params.id);
      if (!lead) return res.status(404).json({ error: 'Lead não encontrada' });
      res.json(lead);
    } catch (error) {
      sendSheetError(res, error);
    }
  });

  api.post('/leads', async (req, res) => {
    const input = sanitizeLeadInput(req.body);
    if (!String(input.name || '').trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    try {
      const lead = await createInboundLead(input);
      res.status(201).json(lead);
    } catch (error) {
      sendSheetError(res, error);
    }
  });

  async function patchLead(req, res) {
    const updates = sanitizeLeadInput(req.body);
    try {
      const lead = await updateInboundLead(req.params.id, updates);
      if (!lead) return res.status(404).json({ error: 'Lead não encontrada' });
      res.json(lead);
    } catch (error) {
      sendSheetError(res, error);
    }
  }

  api.patch('/leads/:id', patchLead);
  api.put('/leads/:id', patchLead);

  api.delete('/leads/:id', (_req, res) => {
    res.status(405).json({ error: 'As linhas de Inbound META não se apagam por aqui.' });
  });

  api.get('/settings', async (_req, res) => {
    res.json(await getSettings());
  });

  api.put('/settings', async (req, res) => {
    res.json(await saveSettings(req.body || {}));
  });

  api.get('/reminders', async (_req, res) => {
    res.json(await listReminders());
  });

  api.post('/reminders', async (req, res) => {
    const leadId = String(req.body?.leadId || req.body?.id || '');
    let lead = null;
    try {
      lead = leadId ? await getInboundLead(leadId) : null;
    } catch (error) {
      return sendSheetError(res, error);
    }
    if (!lead) return res.status(404).json({ error: 'Lead não encontrada' });
    const reminder = await addReminder({
      leadId: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      doctor: lead.doctor,
      appointmentDate: lead.appointmentDate,
      notes: lead.notes,
      status: lead.status,
    });
    res.status(201).json(reminder);
  });

  return api;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(async (_req, _res, next) => {
    try {
      await retireLeadsJson();
    } catch (error) {
      console.error('leads.json', error.message);
    }
    next();
  });
  app.use('/api', createApiRouter());

  if (isProd && existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(join(DIST, 'index.html'));
    });
  }

  return app;
}

const app = createApp();

if (process.env.EVAULT_NO_LISTEN !== '1') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GoSmile Leads listening on http://0.0.0.0:${PORT}`);
    console.log(`API: http://127.0.0.1:${PORT}/api  ·  PWA: https://leads.evob.org`);
  });
}
