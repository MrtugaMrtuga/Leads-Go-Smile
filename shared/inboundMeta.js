/**
 * Inbound META column map (sheet tab "Inbound META") and lead mapping.
 * Values stay raw here; the UI humanizes snake_case for display.
 *
 * SHEET_ID is the sheet bound to the live Apps Script /exec.
 * Daniel's sheet 1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w (Constant Circle)
 * is the Meta inbound / sync source, not this ID. Nothing in the Node server reads SHEET_ID.
 */

export const SHEET_ID = '1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8';
export const SHEET_TAB = 'Inbound META';

export const COLUMN_DEFS = [
  { key: 'data_contacto', header: 'Data Contacto' },
  { key: 'nome', header: 'Nome Paciente' },
  { key: 'telefone', header: 'Telefone' },
  { key: 'email', header: 'E-mail' },
  { key: 'melhorar_sorriso', header: 'O que gostaria de melhorar no seu sorriso?', meta: true },
  { key: 'tipo_tratamento', header: 'Que tipo de tratamento está a considerar?', meta: true },
  { key: 'fase', header: 'Em que fase está neste momento?', meta: true },
  { key: 'quando', header: 'Quando gostaria de avançar?', meta: true },
  { key: 'conhece', header: 'Já conhece ou foi acompanhado na Go Smile?', meta: true },
  { key: 'preferencia_contacto', header: 'Como prefere que a equipa entre em contacto consigo?', meta: true },
  { key: 'primeiro_contacto', header: '1º Contacto' },
  { key: 'data_segundo_contacto', header: 'Data 2º Contacto' },
  { key: 'segundo_contacto', header: '2º Contacto' },
  { key: 'observacoes', header: 'Observações', occurrence: 1 },
  { key: 'data_primeira_consulta', header: 'Data Primeira Consulta' },
  { key: 'data_proxima_consulta', header: 'Data Próxima Consulta' },
  { key: 'numero_paciente', header: 'Nº paciente' },
  { key: 'localizacao', header: 'Localização' },
  { key: 'idade', header: 'Idade' },
  { key: 'realizada', header: 'Realizada' },
  { key: 'medico_orcamento', header: 'Médico Orçamento Médico Tratamento' },
  { key: 'orcamentado', header: 'Orçamentado' },
  { key: 'pagamento', header: 'Pagamento' },
  { key: 'financiamento', header: 'Financiamento' },
  { key: 'valor_real_bruto', header: 'Valor Real Bruto' },
  { key: 'legenda', header: 'Legenda' },
  { key: 'facebook', header: 'Facebook', channel: true },
  { key: 'google_ads', header: 'Google Ads', channel: true },
  { key: 'instagram', header: 'Instagram', channel: true },
  { key: 'messenger', header: 'Messenger', channel: true },
  { key: 'website', header: 'Website', channel: true },
  { key: 'observacoes_final', header: 'Observações', occurrence: 2 },
  { key: 'data_fecho', header: 'Data fecho' },
];

const CHANNELS = [
  ['facebook', 'Facebook'],
  ['google_ads', 'Google Ads'],
  ['instagram', 'Instagram'],
  ['messenger', 'Messenger'],
  ['website', 'Website'],
];

/** CRM columns that the app may write. Meta question columns stay read-only. */
export const CRM_KEYS = [
  'primeiro_contacto',
  'data_segundo_contacto',
  'segundo_contacto',
  'observacoes',
  'data_primeira_consulta',
  'data_proxima_consulta',
  'numero_paciente',
  'localizacao',
  'idade',
  'realizada',
  'medico_orcamento',
  'orcamentado',
  'pagamento',
  'financiamento',
  'valor_real_bruto',
  'legenda',
  'facebook',
  'google_ads',
  'instagram',
  'messenger',
  'website',
  'observacoes_final',
  'data_fecho',
];

const LEAD_STATUSES = ['new', 'contacted', 'processing', 'discarded', 'scheduled', 'positive', 'completed', 'paid'];
const STATUS_NOTE = /^\[status:(new|contacted|processing|discarded|scheduled|positive|completed|paid)\]\s*/i;
const MOTIVO_NOTE = /^\[motivo:([^\]]*)\]\s*/i;
const FECHO_NOTE = /^\[fecho:([^\]]*)\]\s*/i;

const OTHER_STATUS_LABELS = {
  new: 'Novas',
  positive: 'Positivas',
  completed: 'Concluídas',
  paid: 'Pagas',
};

export function cleanMotivo(value) {
  return String(value ?? '')
    .replace(/[\r\n\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanFecho(value) {
  const text = String(value ?? '').replace(/[\r\n\]]/g, '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return '';
  return text;
}

export function splitStatusNote(value) {
  let text = String(value ?? '').replace(/^\uFEFF/, '').trim();
  let status = '';
  let motivo = '';
  let fecho = '';
  for (let guard = 0; guard < 8; guard += 1) {
    const statusMatch = text.match(STATUS_NOTE);
    if (statusMatch) {
      status = statusMatch[1].toLowerCase();
      text = text.slice(statusMatch[0].length).trim();
      continue;
    }
    const motivoMatch = text.match(MOTIVO_NOTE);
    if (motivoMatch) {
      motivo = cleanMotivo(motivoMatch[1]);
      text = text.slice(motivoMatch[0].length).trim();
      continue;
    }
    const fechoMatch = text.match(FECHO_NOTE);
    if (fechoMatch) {
      fecho = cleanFecho(fechoMatch[1]);
      text = text.slice(fechoMatch[0].length).trim();
      continue;
    }
    break;
  }
  return { status, motivo, fecho, note: text };
}

export function formatStatusNote(note, status, motivo, fecho) {
  const parsed = splitStatusNote(note);
  const clean = parsed.note;
  const normalized = String(status || '').trim().toLowerCase();
  const reason = cleanMotivo(motivo === undefined ? parsed.motivo : motivo);
  const closed = fecho === undefined ? parsed.fecho : cleanFecho(fecho);
  const lines = [];
  if (LEAD_STATUSES.includes(normalized)) lines.push(`[status:${normalized}]`);
  if (reason) lines.push(`[motivo:${reason}]`);
  if (closed) lines.push(`[fecho:${closed}]`);
  if (!lines.length) return clean;
  return clean ? `${lines.join('\n')}\n${clean}` : lines.join('\n');
}

export function mergeObservacoes(
  currentCell,
  { status = '', note = '', noteSet = false, motivo = '', motivoSet = false, fecho = '', fechoSet = false, fechoClear = false } = {}
) {
  const parsed = splitStatusNote(currentCell);
  const incoming = splitStatusNote(note);
  const nextNote = noteSet ? incoming.note : parsed.note;
  const nextStatus = status || parsed.status;
  const nextMotivo = motivoSet ? cleanMotivo(motivo || incoming.motivo) : incoming.motivo || parsed.motivo;
  let nextFecho = parsed.fecho || incoming.fecho || '';
  if (fechoClear) nextFecho = '';
  else if (fechoSet) nextFecho = parsed.fecho || cleanFecho(fecho);
  return formatStatusNote(nextNote, nextStatus, nextMotivo, nextFecho);
}

/** Legenda values the UI filters on. Empty means a new lead with no pipeline colour. */
export function statusFromLegenda(value) {
  const folded = foldHeader(value);
  if (folded === 'em processamento') return 'processing';
  if (folded === 'marcada' || folded === 'marcado') return 'scheduled';
  if (folded === 'descartada' || folded === 'descartado') return 'discarded';
  return '';
}

export function legendaForStatus(status) {
  if (status === 'processing' || status === 'contacted') return 'Em processamento';
  if (status === 'scheduled') return 'Marcada';
  if (status === 'discarded') return 'Descartada';
  if (status === 'new') return '';
  return null;
}

export function listBucket(status) {
  if (status === 'scheduled') return 'marcadas';
  if (status === 'discarded') return 'descartadas';
  if (status === 'new' || status === 'contacted' || status === 'processing') return 'inbox';
  return 'other';
}

/** One tap between Marcada and Em processamento. Other statuses are not part of this move. */
export function nextPipelineStatus(status) {
  if (status === 'scheduled') return 'processing';
  if (status === 'processing' || status === 'contacted') return 'scheduled';
  return '';
}

export function pipelineTone(status) {
  if (status === 'discarded') return 'red';
  if (status === 'scheduled') return 'green';
  if (status === 'processing' || status === 'contacted') return 'yellow';
  return '';
}

function pctOf(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

export function pipelineBreakdown(leads) {
  const list = Array.isArray(leads) ? leads : [];
  const total = list.length;
  const countStatus = (status) => list.filter((lead) => lead?.status === status).length;
  const discarded = countStatus('discarded');
  const booked = countStatus('scheduled');
  const processing = list.filter((lead) => lead?.status === 'processing' || lead?.status === 'contacted').length;
  const covered = new Set(['discarded', 'scheduled', 'processing', 'contacted']);
  const present = [];
  list.forEach((lead) => {
    const status = String(lead?.status || '');
    if (!status || covered.has(status) || present.includes(status)) return;
    present.push(status);
  });
  const preferred = ['new', 'positive', 'completed', 'paid'];
  const extras = [];
  preferred.forEach((status) => {
    const count = countStatus(status);
    if (!count) return;
    extras.push({ key: status, label: OTHER_STATUS_LABELS[status] || status, count, pct: pctOf(count, total) });
  });
  present.forEach((status) => {
    if (preferred.includes(status)) return;
    const count = countStatus(status);
    if (!count) return;
    extras.push({ key: status, label: OTHER_STATUS_LABELS[status] || status, count, pct: pctOf(count, total) });
  });
  return {
    total,
    buckets: [
      { key: 'total', label: 'Total', count: total, pct: total ? 100 : 0 },
      { key: 'discarded', label: 'Descartadas', count: discarded, pct: pctOf(discarded, total) },
      { key: 'booked', label: 'Marcadas', count: booked, pct: pctOf(booked, total) },
      { key: 'processing', label: 'Em processamento', count: processing, pct: pctOf(processing, total) },
      ...extras,
    ],
  };
}

export function pipelineStats(leads) {
  const breakdown = pipelineBreakdown(leads);
  const bucket = (key) => breakdown.buckets.find((row) => row.key === key) || { count: 0, pct: 0 };
  return {
    total: breakdown.total,
    discarded: bucket('discarded').count,
    booked: bucket('booked').count,
    processing: bucket('processing').count,
    discardedPct: bucket('discarded').pct,
    bookedPct: bucket('booked').pct,
    processingPct: bucket('processing').pct,
    buckets: breakdown.buckets,
  };
}

export function lisbonDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dayLabel(ymd) {
  const [year, month, day] = ymd.split('-');
  return `${day}/${month}/${year}`;
}

function shiftDay(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function weekStartKey(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return shiftDay(ymd, delta);
}

function contactDay(lead) {
  return lisbonDayKey(lead?.timestamp || lead?.dataContacto);
}

function fechoDay(lead) {
  if (lead?.status !== 'scheduled' && lead?.status !== 'discarded') return '';
  return lisbonDayKey(lead?.closedAt) || contactDay(lead);
}

export function closeEvolution(leads, grain = 'day') {
  const list = Array.isArray(leads) ? leads : [];
  const weekly = grain === 'week';
  const limit = weekly ? 12 : 21;
  const rows = new Map();

  const ensure = (day) => {
    if (!day) return null;
    const key = weekly ? weekStartKey(day) : day;
    if (!rows.has(key)) {
      const label = weekly ? `${dayLabel(key)} a ${dayLabel(shiftDay(key, 6))}` : dayLabel(key);
      rows.set(key, { key, label, entradas: 0, positivo: 0, totalFecho: 0 });
    }
    return rows.get(key);
  };

  list.forEach((lead) => {
    const entrada = ensure(contactDay(lead));
    if (entrada) entrada.entradas += 1;
    const fecho = ensure(fechoDay(lead));
    if (!fecho) return;
    if (lead.status === 'scheduled') fecho.positivo += 1;
    if (lead.status === 'scheduled' || lead.status === 'discarded') fecho.totalFecho += 1;
  });

  return [...rows.values()]
    .filter((row) => row.entradas || row.positivo || row.totalFecho)
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    .slice(0, limit)
    .map((row) => ({
      ...row,
      positivoPct: row.entradas ? Math.round((row.positivo / row.entradas) * 1000) / 10 : null,
      totalPct: row.entradas ? Math.round((row.totalFecho / row.entradas) * 1000) / 10 : null,
    }));
}

function emptyDayCounts() {
  return { entradas: 0, marcacoes: 0, fecho: 0, descartadas: 0 };
}

export function closeWindow(leads, spanDays = 30, now = new Date()) {
  const list = Array.isArray(leads) ? leads : [];
  const span = spanDays === 7 || spanDays === 90 ? spanDays : 30;
  const end = lisbonDayKey(now);
  const start = end ? shiftDay(end, -(span - 1)) : '';
  const byDay = new Map();
  const touch = (day) => {
    if (!byDay.has(day)) byDay.set(day, emptyDayCounts());
    return byDay.get(day);
  };

  if (start && end) {
    list.forEach((lead) => {
      const entrada = contactDay(lead);
      if (entrada && entrada >= start && entrada <= end) touch(entrada).entradas += 1;
      const closed = fechoDay(lead);
      if (!closed || closed < start || closed > end) return;
      const row = touch(closed);
      if (lead.status === 'scheduled') row.marcacoes += 1;
      if (lead.status === 'discarded') row.descartadas += 1;
      if (lead.status === 'scheduled' || lead.status === 'discarded') row.fecho += 1;
    });
  }

  const points = [];
  const pushPoint = (key, label, from, to) => {
    const point = { key, label, ...emptyDayCounts() };
    if (from && to) {
      for (let day = from; day <= to; day = shiftDay(day, 1)) {
        const row = byDay.get(day);
        if (!row) continue;
        point.entradas += row.entradas;
        point.marcacoes += row.marcacoes;
        point.fecho += row.fecho;
        point.descartadas += row.descartadas;
      }
    }
    points.push(point);
  };

  if (start && end && span === 90) {
    for (let week = weekStartKey(start); week <= end; week = shiftDay(week, 7)) {
      const from = week < start ? start : week;
      const to = shiftDay(week, 6) > end ? end : shiftDay(week, 6);
      pushPoint(from, dayLabel(from).slice(0, 5), from, to);
    }
  } else if (start && end) {
    for (let day = start; day <= end; day = shiftDay(day, 1)) {
      pushPoint(day, dayLabel(day).slice(0, 5), day, day);
    }
  }

  const totals = points.reduce((sum, point) => {
    sum.entradas += point.entradas;
    sum.marcacoes += point.marcacoes;
    sum.fecho += point.fecho;
    sum.descartadas += point.descartadas;
    return sum;
  }, emptyDayCounts());

  return {
    spanDays: span,
    timezone: 'Europe/Lisbon',
    weekStartsOn: 'monday',
    grain: span === 90 ? 'week' : 'day',
    start,
    end,
    points,
    totals: {
      ...totals,
      marcacoesPct: totals.entradas ? pctOf(totals.marcacoes, totals.entradas) : null,
      fechoPct: totals.entradas ? pctOf(totals.fecho, totals.entradas) : null,
      descartadasPct: totals.entradas ? pctOf(totals.descartadas, totals.entradas) : null,
    },
  };
}

const MARKS = new Set(['x', 'sim', 'yes', '1', 'true', '✓', '✔', '✅']);

export function foldHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function humanizeMetaValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.includes('@')) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('pt-PT', {
        timeZone: 'Europe/Lisbon',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
  }

  const hasSnake = text.includes('_');
  const isLowerWord = text === text.toLowerCase() && /[a-zà-ÿ]/i.test(text) && !/\d/.test(text);
  if (!hasSnake && !isLowerWord) return text;

  const spaced = text.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced.charAt(0).toLocaleUpperCase('pt-PT') + spaced.slice(1);
}

export function filledLeadFields(lead) {
  const fields = Array.isArray(lead?.formFields) ? lead.formFields : [];
  return fields
    .map((field) => {
      const note = splitStatusNote(field?.value).note;
      return {
        key: String(field?.key || field?.label || ''),
        label: String(field?.label || field?.key || ''),
        value: humanizeMetaValue(note),
      };
    })
    .filter((field) => field.value.trim() !== '');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text ?? '').replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => String(value).trim() !== ''));
}

function isFilled(value) {
  return String(value ?? '').trim() !== '';
}

function indexHeaders(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const label = String(header ?? '').trim();
    const folded = foldHeader(label);
    const occurrence = (seen.get(folded) || 0) + 1;
    seen.set(folded, occurrence);
    return { index, label, folded, occurrence };
  });
}

function findColumn(indexed, def) {
  const folded = foldHeader(def.header);
  const occurrence = def.occurrence || 1;
  return indexed.find((column) => column.label && column.folded === folded && column.occurrence === occurrence);
}

function parseMoney(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  let normalized = text.replace(/€/g, '').replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function parseTimestamp(value) {
  const text = String(value ?? '').trim();
  if (!text) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const iso = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
    if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  }
  const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const local = new Date(year, month - 1, day, hour, minute);
    if (local.getFullYear() === year && local.getMonth() === month - 1 && local.getDate() === day) {
      return local.toISOString();
    }
  }
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return text;
}

function metaExternalId(phone, email, timestamp) {
  const phoneKey = String(phone || '').replace(/\D/g, '');
  const emailKey = String(email || '').trim().toLowerCase();
  return `meta:${phoneKey || emailKey || 'sem-contacto'}:${timestamp}`;
}

function channelSource(raw) {
  for (const [key, label] of CHANNELS) {
    const value = String(raw[key] || '').trim();
    if (!value) continue;
    if (MARKS.has(value.toLowerCase())) return label;
    return value;
  }
  return 'Inbound META';
}

function inferInboundStatus(raw) {
  const primary = splitStatusNote(raw.observacoes);
  if (LEAD_STATUSES.includes(primary.status)) return primary.status;

  const fromLegenda = statusFromLegenda(raw.legenda);
  if (fromLegenda) return fromLegenda;

  const pagamento = foldHeader(raw.pagamento);
  if (pagamento === 'pago' || pagamento === 'paga' || pagamento === 'paid') return 'paid';

  const notes = `${primary.note} ${raw.observacoes_final || ''}`.toLowerCase();
  const orcamento = foldHeader(raw.orcamentado);
  if (
    notes.includes('venda fechada') ||
    notes.includes('fechado no valor') ||
    orcamento === 'fechado' ||
    orcamento === 'fechada'
  ) {
    return 'completed';
  }

  const appointment = String(raw.data_primeira_consulta || '').trim();
  if (appointment.length > 2 || notes.includes('marcado') || notes.includes('marcada')) return 'scheduled';
  if (
    notes.includes('não atendeu') ||
    notes.includes('nao atendeu') ||
    notes.includes('não atende') ||
    notes.includes('nao atende')
  ) {
    return 'processing';
  }
  if (
    notes.includes('engano') ||
    notes.includes('não interessa') ||
    notes.includes('nao interessa')
  ) {
    return 'discarded';
  }
  if (String(raw.primeiro_contacto || '').trim() || notes.includes('contactad')) return 'contacted';
  return 'new';
}

function mapRow(indexed, cells, sheetRow) {
  const raw = {};
  const used = new Set();

  COLUMN_DEFS.forEach((def) => {
    const column = findColumn(indexed, def);
    const value = column ? String(cells[column.index] ?? '').trim() : '';
    raw[def.key] = value;
    if (column) used.add(column.index);
  });

  const name = raw.nome;
  if (!name) return null;

  const timestamp = parseTimestamp(raw.data_contacto);
  const primary = splitStatusNote(raw.observacoes);
  const formFields = [];

  COLUMN_DEFS.forEach((def) => {
    const value = def.key === 'observacoes' ? primary.note : raw[def.key];
    if (!isFilled(value)) return;
    formFields.push({ key: def.key, label: def.header, value });
  });

  indexed.forEach((column) => {
    if (!column.label || used.has(column.index)) return;
    const value = String(cells[column.index] ?? '').trim();
    if (!isFilled(value)) return;
    formFields.push({
      key: `${foldHeader(column.label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'campo'}_${column.occurrence}`,
      label: column.label,
      value,
    });
  });

  const status = inferInboundStatus(raw);
  const notes = primary.note || raw.observacoes_final || '';
  const crm = {};
  CRM_KEYS.forEach((key) => {
    crm[key] = key === 'observacoes' ? primary.note : raw[key] || '';
  });
  const discardReason = primary.motivo || '';
  const closedAt = String(raw.data_fecho || primary.fecho || '').trim();

  const externalId = metaExternalId(raw.telefone, raw.email, timestamp);
  const id = sheetRow ? String(sheetRow) : externalId;

  return {
    id,
    row: sheetRow || null,
    externalId,
    nome: name,
    telefone: raw.telefone || '',
    email: raw.email || '',
    dataContacto: timestamp,
    name,
    phone: raw.telefone || '',
    timestamp,
    status,
    isContacted: status !== 'new',
    discardReason,
    closedAt,
    notes,
    doctor: raw.medico_orcamento || '',
    appointmentDate: raw.data_primeira_consulta || '',
    value: parseMoney(raw.valor_real_bruto),
    source: channelSource(raw),
    sourceTab: SHEET_TAB,
    formFields,
    crm,
  };
}

export function leadFromSheetRow(headers, values, sheetRow) {
  if (!Array.isArray(headers)) return null;
  return mapRow(indexHeaders(headers), Array.isArray(values) ? values : [], sheetRow);
}

export function mapSheetTable(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  const indexed = indexHeaders(matrix[0]);
  const leads = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const lead = mapRow(indexed, matrix[rowIndex] || [], rowIndex + 1);
    if (lead) leads.push(lead);
  }
  return leads;
}

export function mapSheetCsv(csvText) {
  return mapSheetTable(parseCsv(csvText));
}

function normalizeStoredLead(item, index) {
  const formFields = Array.isArray(item.formFields)
    ? item.formFields
        .filter((field) => field && String(field.value ?? '').trim() !== '')
        .map((field) => ({
          key: String(field.key || ''),
          label: String(field.label || field.key || ''),
          value: String(field.value).trim(),
        }))
    : [];

  const lead = {
    ...item,
    id: String(item.id || item.externalId || index + 1),
    externalId: String(item.externalId || item.id || index + 1),
    name: String(item.name || item.Nome || 'Sem Nome'),
    phone: String(item.phone ?? item.Telefone ?? ''),
    email: String(item.email ?? item.Email ?? ''),
    timestamp: item.timestamp || item.Data || new Date().toISOString(),
    status: item.status || 'new',
    isContacted: Boolean(item.isContacted),
    discardReason: item.discardReason ? String(item.discardReason) : '',
    closedAt: item.closedAt ? String(item.closedAt) : '',
    source: item.source || item.Origem || '',
    sourceTab: item.sourceTab || '',
  };

  if (formFields.length) lead.formFields = formFields;
  else delete lead.formFields;
  return lead;
}

function leadSortTime(lead) {
  const raw = lead?.timestamp || lead?.dataContacto || '';
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function leadSortRow(lead) {
  const row = Number(lead?.row ?? lead?.id);
  return Number.isFinite(row) ? row : 0;
}

export function compareLeadsNewestFirst(a, b) {
  const byTime = leadSortTime(b) - leadSortTime(a);
  if (byTime) return byTime;
  const byRow = leadSortRow(b) - leadSortRow(a);
  if (byRow) return byRow;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
}

export function sortLeadsNewestFirst(leads) {
  return [...(Array.isArray(leads) ? leads : [])].sort(compareLeadsNewestFirst);
}

export function mapDataToLeads(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const isSheetRow =
        Object.prototype.hasOwnProperty.call(item, 'Nome Paciente') ||
        Object.prototype.hasOwnProperty.call(item, 'O que gostaria de melhorar no seu sorriso?');
      if (isSheetRow) {
        const headers = Object.keys(item);
        const cells = headers.map((key) => item[key]);
        return mapSheetTable([headers, cells])[0] || null;
      }
      if (item.name || item.Nome || item.id) return normalizeStoredLead(item, index);
      return null;
    })
    .filter(Boolean);
}
