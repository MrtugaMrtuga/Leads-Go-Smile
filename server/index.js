import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addReminder,
  createLead,
  deleteLead,
  getLead,
  getSettings,
  listLeads,
  listReminders,
  saveSettings,
  updateLead,
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3040;
const isProd = process.env.NODE_ENV === 'production';

const ALLOWED_STATUSES = new Set([
  'new',
  'contacted',
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
  faltou: 'contacted',
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
  if (body.comentario !== undefined && out.notes === undefined) out.notes = String(body.comentario);
  if (body.medico !== undefined && out.doctor === undefined) out.doctor = String(body.medico);
  if (body.data_consulta !== undefined && out.appointmentDate === undefined) {
    out.appointmentDate = String(body.data_consulta);
  }
  if (body.valor_fechado !== undefined && out.value === undefined) {
    out.value = Number(body.valor_fechado) || 0;
  }
  return out;
}

export function createApiRouter() {
  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'GoSmile Leads',
      host: 'leads.evob.org',
      storage: 'local-json',
    });
  });

  api.get('/leads', async (_req, res) => {
    res.json(await listLeads());
  });

  api.get('/leads/:id', async (req, res) => {
    const lead = await getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrada' });
    res.json(lead);
  });

  api.post('/leads', async (req, res) => {
    const input = sanitizeLeadInput(req.body);
    if (!String(input.name || '').trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    const lead = await createLead(input);
    res.status(201).json(lead);
  });

  async function patchLead(req, res) {
    const updates = sanitizeLeadInput(req.body);
    const lead = await updateLead(req.params.id, updates);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrada' });
    res.json(lead);
  }

  api.patch('/leads/:id', patchLead);
  api.put('/leads/:id', patchLead);

  api.delete('/leads/:id', async (req, res) => {
    const ok = await deleteLead(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Lead não encontrada' });
    res.status(204).end();
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
    const lead = leadId ? await getLead(leadId) : null;
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
