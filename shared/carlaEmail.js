/**
 * Email to Carla (geral@gosmile.pt) when a lead becomes a booked first visit.
 * The sheet marker [carla-email:sent] is the durable "already sent" flag.
 * Sending itself is MailApp inside the bound Apps Script (the evobtob account).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStatusNote } from './inboundMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CARLA_EMAIL_TO = 'geral@gosmile.pt';
export const CARLA_EMAIL_MARKER = '[carla-email:sent]';
export const CARLA_TEMPLATE_PATH = join(__dirname, '..', 'templates', 'email-carla-marcacao', 'template.html');
const NOTAS_LINE = '<br>\n            <strong>Notas:</strong> {{notas}}';

const LISBON = 'Europe/Lisbon';

function plain(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return text || '—';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function lisbonParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    data: `${get('day')}/${get('month')}/${get('year')}`,
    hora: `${hour}:${get('minute')}`,
  };
}

/**
 * Split Data Primeira Consulta into a Lisbon calendar date and a clock time.
 * A datetime-local value (no offset) is already a Lisbon wall time.
 * An instant with Z or an offset is converted to Europe/Lisbon.
 */
export function splitAppointmentDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return { data: '', hora: '' };

  const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (iso && !zoned) {
    return {
      data: `${iso[3]}/${iso[2]}/${iso[1]}`,
      hora: iso[4] ? `${iso[4]}:${iso[5]}` : '',
    };
  }

  const pt = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/);
  if (pt) {
    return {
      data: `${pad(pt[1])}/${pad(pt[2])}/${pt[3]}`,
      hora: pt[4] ? `${pad(pt[4])}:${pt[5]}` : '',
    };
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    const parts = lisbonParts(date);
    const hasTime = /[T\s]\d{1,2}:\d{2}/.test(text);
    return { data: parts.data, hora: hasTime ? parts.hora : '' };
  }

  return { data: text, hora: '' };
}

function notesHtml(value) {
  return escapeHtml(String(value ?? '').replace(/\r\n/g, '\n').trim()).replace(/\n/g, '<br>');
}

export function fillCarlaTemplate(template, vars = {}) {
  const notas = notesHtml(vars.notas);
  let html = String(template ?? '');
  if (!notas) {
    if (html.includes(NOTAS_LINE)) html = html.replace(NOTAS_LINE, '');
    else html = html.replace(/<br>\s*<strong>Notas:<\/strong>\s*\{\{notas\}\}/gi, '');
  }
  const safe = {
    nome: escapeHtml(vars.nome ?? ''),
    telefone: escapeHtml(vars.telefone ?? ''),
    email: escapeHtml(vars.email ?? ''),
    data: escapeHtml(vars.data ?? ''),
    hora: escapeHtml(vars.hora ?? ''),
    medico: escapeHtml(vars.medico ?? ''),
    origem: escapeHtml(vars.origem ?? ''),
    notas,
  };
  return html.replace(
    /\{\{(nome|telefone|email|data|hora|medico|origem|notas)\}\}/g,
    (_, key) => safe[key]
  );
}

export function loadCarlaTemplate(path = CARLA_TEMPLATE_PATH) {
  return readFileSync(path, 'utf8');
}

export function buildCarlaEmail(lead, template = loadCarlaTemplate()) {
  const when = splitAppointmentDate(lead?.appointmentDate);
  const nome = plain(lead?.name || lead?.nome);
  const data = when.data || '—';
  const hora = when.hora || '—';
  const vars = {
    nome,
    telefone: plain(lead?.phone || lead?.telefone),
    email: plain(lead?.email),
    data,
    hora,
    medico: plain(lead?.doctor || lead?.medico),
    origem: plain(lead?.source || lead?.origem),
    notas: splitStatusNote(lead?.notes).note,
  };
  return {
    to: CARLA_EMAIL_TO,
    subject: `ALERTA · Nova 1ª consulta — ${nome} — ${data}`,
    html: fillCarlaTemplate(template, vars),
    vars,
  };
}

function markedSent(lead) {
  if (!lead || typeof lead !== 'object') return false;
  if (lead.carlaEmailSent) return true;
  return Boolean(splitStatusNote(lead.notes).carlaEmailSent);
}

/**
 * True when this PATCH leaves the lead scheduled, with a first-visit date,
 * and the Carla mail has not been sent yet. A later date edit does not re-send.
 */
export function shouldNotifyCarla(previous, next) {
  if (!next || next.status !== 'scheduled') return false;
  if (!String(next.appointmentDate ?? '').trim()) return false;
  if (markedSent(previous) || markedSent(next)) return false;
  return true;
}

/** Apply a PATCH onto the lead the Mini already has, without writing the sheet. */
export function projectLead(previous, updates = {}) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const next = { ...prev };
  if (updates.name !== undefined) next.name = updates.name;
  if (updates.phone !== undefined) next.phone = updates.phone;
  if (updates.email !== undefined) next.email = updates.email;
  if (updates.doctor !== undefined) next.doctor = updates.doctor;
  if (updates.source !== undefined) next.source = updates.source;
  if (updates.notes !== undefined) {
    const incoming = splitStatusNote(updates.notes).note.trim();
    if (incoming) next.notes = incoming;
  }
  if (updates.status) next.status = updates.status;
  if (updates.appointmentDate !== undefined) next.appointmentDate = updates.appointmentDate;
  next.carlaEmailSent = markedSent(prev) || Boolean(splitStatusNote(updates.notes).carlaEmailSent);
  return next;
}
