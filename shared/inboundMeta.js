/**
 * Inbound META column map (sheet tab "Inbound META") and lead mapping.
 * Values stay raw here; the UI humanizes snake_case for display.
 */

export const SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w';
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
];

const LEAD_STATUSES = ['new', 'contacted', 'discarded', 'scheduled', 'positive', 'completed', 'paid'];
const STATUS_NOTE = /^\[status:(new|contacted|discarded|scheduled|positive|completed|paid)\]\s*/i;

export function splitStatusNote(value) {
  const text = String(value ?? '').replace(/^\uFEFF/, '').trim();
  const match = text.match(STATUS_NOTE);
  if (!match) return { status: '', note: text };
  return {
    status: match[1].toLowerCase(),
    note: text.slice(match[0].length).trim(),
  };
}

export function formatStatusNote(note, status) {
  const clean = splitStatusNote(note).note;
  const normalized = String(status || '').trim().toLowerCase();
  if (!LEAD_STATUSES.includes(normalized)) return clean;
  return clean ? `[status:${normalized}]\n${clean}` : `[status:${normalized}]`;
}

export function mergeObservacoes(currentCell, { status = '', note = '', noteSet = false } = {}) {
  const parsed = splitStatusNote(currentCell);
  const nextNote = noteSet ? splitStatusNote(note).note : parsed.note;
  const nextStatus = status || parsed.status;
  return formatStatusNote(nextNote, nextStatus);
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
    notes.includes('engano') ||
    notes.includes('não interessa') ||
    notes.includes('nao interessa') ||
    notes.includes('não atende') ||
    notes.includes('nao atende')
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
    source: item.source || item.Origem || '',
    sourceTab: item.sourceTab || '',
  };

  if (formFields.length) lead.formFields = formFields;
  else delete lead.formFields;
  return lead;
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
