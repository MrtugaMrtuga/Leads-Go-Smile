/**
 * Inbound META — Sheet column → lead field → UI label.
 * Sheet: 1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w
 * Tab: Inbound META
 *
 * `kind: 'form'` answers are the Meta form. They are always shown when filled.
 * Empty cells are omitted. Unknown filled columns are kept as extras.
 */

export const META_SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w';
export const META_SHEET_TAB = 'Inbound META';

/** @type {Array<{ id: string, header: string, label: string, kind: 'contact' | 'form' | 'crm', target?: string, occurrence?: number }>} */
export const INBOUND_META_COLUMNS = [
  { id: 'contactDate', header: 'Data Contacto', label: 'Data Contacto', kind: 'contact', target: 'timestamp' },
  { id: 'name', header: 'Nome Paciente', label: 'Nome', kind: 'contact', target: 'name' },
  { id: 'phone', header: 'Telefone', label: 'Telefone', kind: 'contact', target: 'phone' },
  { id: 'email', header: 'E-mail', aliases: ['Email'], label: 'E-mail', kind: 'contact', target: 'email' },
  { id: 'smileGoal', header: 'O que gostaria de melhorar no seu sorriso?', label: 'O que gostaria de melhorar no seu sorriso?', kind: 'form' },
  { id: 'treatment', header: 'Que tipo de tratamento está a considerar?', label: 'Que tipo de tratamento está a considerar?', kind: 'form' },
  { id: 'stage', header: 'Em que fase está neste momento?', label: 'Em que fase está neste momento?', kind: 'form' },
  { id: 'timing', header: 'Quando gostaria de avançar?', label: 'Quando gostaria de avançar?', kind: 'form' },
  { id: 'knowsClinic', header: 'Já conhece ou foi acompanhado na Go Smile?', label: 'Já conhece ou foi acompanhado na Go Smile?', kind: 'form' },
  { id: 'contactPreference', header: 'Como prefere que a equipa entre em contacto consigo?', label: 'Como prefere que a equipa entre em contacto consigo?', kind: 'form' },
  { id: 'firstContact', header: '1º Contacto', label: '1º Contacto', kind: 'crm' },
  { id: 'secondContactDate', header: 'Data 2º Contacto', label: 'Data 2º Contacto', kind: 'crm' },
  { id: 'secondContact', header: '2º Contacto', label: '2º Contacto', kind: 'crm' },
  { id: 'observations', header: 'Observações', label: 'Observações', kind: 'crm', target: 'notes', occurrence: 0 },
  { id: 'firstAppointment', header: 'Data Primeira Consulta', label: 'Data Primeira Consulta', kind: 'crm', target: 'appointmentDate' },
  { id: 'nextAppointment', header: 'Data Próxima Consulta', label: 'Data Próxima Consulta', kind: 'crm' },
  { id: 'patientNumber', header: 'Nº paciente', label: 'Nº paciente', kind: 'crm' },
  { id: 'location', header: 'Localização', label: 'Localização', kind: 'crm' },
  { id: 'age', header: 'Idade', label: 'Idade', kind: 'crm' },
  { id: 'done', header: 'Realizada', label: 'Realizada', kind: 'crm' },
  { id: 'budgetDoctor', header: 'Médico Orçamento Médico Tratamento', label: 'Médico Orçamento Médico Tratamento', kind: 'crm', target: 'doctor' },
  { id: 'quoted', header: 'Orçamentado', label: 'Orçamentado', kind: 'crm' },
  { id: 'payment', header: 'Pagamento', label: 'Pagamento', kind: 'crm' },
  { id: 'financing', header: 'Financiamento', label: 'Financiamento', kind: 'crm' },
  { id: 'grossValue', header: 'Valor Real Bruto', label: 'Valor Real Bruto', kind: 'crm', target: 'value' },
  { id: 'legend', header: 'Legenda', label: 'Legenda', kind: 'crm' },
  { id: 'channelFacebook', header: 'Facebook', label: 'Facebook', kind: 'crm' },
  { id: 'channelGoogle', header: 'Google Ads', label: 'Google Ads', kind: 'crm' },
  { id: 'channelInstagram', header: 'Instagram', label: 'Instagram', kind: 'crm' },
  { id: 'channelMessenger', header: 'Messenger', label: 'Messenger', kind: 'crm' },
  { id: 'channelWebsite', header: 'Website', label: 'Website', kind: 'crm' },
  { id: 'observationsFinal', header: 'Observações', label: 'Observações', kind: 'crm', occurrence: 1 },
];

const COLUMN_BY_HEADER = new Map();
for (const column of INBOUND_META_COLUMNS) {
  const key = `${normalizeHeader(column.header)}#${column.occurrence || 0}`;
  COLUMN_BY_HEADER.set(key, column);
}

/**
 * Keys Evobtob `getLeads_()` should emit after the Inbound META patch.
 * See docs/evobtob-gas-inbound-meta.md.
 */
const GAS_KEY_TO_COLUMN = {
  nome_paciente: 'name',
  smile_goal: 'smileGoal',
  treatment_type: 'treatment',
  current_stage: 'stage',
  timing: 'timing',
  knows_clinic: 'knowsClinic',
  contact_preference: 'contactPreference',
  first_contact: 'firstContact',
  second_contact_date: 'secondContactDate',
  second_contact: 'secondContact',
  next_appointment: 'nextAppointment',
  patient_number: 'patientNumber',
  done_flag: 'done',
  budget_doctor: 'budgetDoctor',
  contact_date: 'contactDate',
};

const LEAD_STATUSES = new Set(['new', 'contacted', 'discarded', 'scheduled', 'positive', 'completed', 'paid']);

const CANONICAL_TARGETS = {
  name: 'name',
  nome: 'name',
  phone: 'phone',
  telefone: 'phone',
  email: 'email',
  timestamp: 'timestamp',
  data: 'timestamp',
  date: 'timestamp',
  notes: 'notes',
  comentarios: 'notes',
  doctor: 'doctor',
  medico: 'doctor',
  appointmentdate: 'appointmentDate',
  data_consulta: 'appointmentDate',
  value: 'value',
  valor_fechado: 'value',
  source: 'source',
  origem: 'source',
};

const SKIP_KEYS = new Set([
  'id',
  'externalid',
  'status',
  'estado',
  'iscontacted',
  'commission',
  'row_number',
  'lead_id',
  'meta',
  'metaextras',
  'comentario',
  'data_tratamento',
]);

const MARK_VALUES = new Set(['x', '✓', '✔', '✅', 'sim', 'yes', 'true', 'verdadeiro']);

export function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/º/g, 'o')
    .replace(/ª/g, 'a');
}

export function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

export function humanizeMetaValue(value) {
  const text = cellText(value);
  if (!text) return '';
  if (MARK_VALUES.has(text.toLowerCase())) return 'Sim';
  if (text.includes('@')) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  if (/^[+\d][\d\s().-]{5,}$/.test(text)) return text;
  if (!text.includes('_')) {
    if (/^[a-zà-ÿ0-9]+$/i.test(text) && text === text.toLowerCase()) {
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    return text;
  }
  const spaced = text.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function phoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

export function emailKey(value) {
  return String(value || '').trim().toLowerCase();
}

function columnFor(header, occurrence) {
  const direct = COLUMN_BY_HEADER.get(`${normalizeHeader(header)}#${occurrence || 0}`);
  if (direct) return direct;
  const wanted = normalizeHeader(header);
  return (
    INBOUND_META_COLUMNS.find((column) => {
      if ((column.occurrence || 0) !== (occurrence || 0)) return false;
      const names = [column.header, ...(column.aliases || [])];
      return names.some((name) => normalizeHeader(name) === wanted);
    }) || null
  );
}

function assignTarget(lead, target, value) {
  if (!target || !value) return;
  if (target === 'value') {
    const amount = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(amount) && amount > 0) lead.value = amount;
    return;
  }
  lead[target] = target === 'phone' ? String(value) : value;
}

function blankPatch() {
  return { meta: {}, metaExtras: [] };
}

/**
 * Map header/value pairs (duplicates allowed) into a partial lead.
 * Only non-empty cells are kept.
 */
export function leadFromPairs(pairs, seed = {}) {
  const lead = blankPatch();
  const seen = {};

  if (seed.meta && typeof seed.meta === 'object' && !Array.isArray(seed.meta)) {
    for (const [key, raw] of Object.entries(seed.meta)) {
      const value = cellText(raw);
      if (value) lead.meta[key] = value;
    }
  }

  for (const pair of pairs) {
    const key = pair?.[0];
    const raw = pair?.[1];
    const headerNorm = normalizeHeader(key);
    const compact = headerNorm.replace(/[^a-z0-9]+/g, '');
    if (!headerNorm || SKIP_KEYS.has(compact)) continue;

    const occurrence = seen[headerNorm] || 0;
    seen[headerNorm] = occurrence + 1;
    const value = cellText(raw);
    const column = columnFor(key, occurrence);
    const underscored = headerNorm.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const gasColumnId = GAS_KEY_TO_COLUMN[underscored];
    const gasColumn = gasColumnId ? INBOUND_META_COLUMNS.find((item) => item.id === gasColumnId) : null;
    const resolved = column || gasColumn;
    if (resolved) {
      if (value && resolved.kind !== 'contact') lead.meta[resolved.id] = value;
      assignTarget(lead, resolved.target, value);
      continue;
    }

    const canonical = CANONICAL_TARGETS[underscored];
    if (canonical) {
      assignTarget(lead, canonical, value);
      continue;
    }

    if (value) lead.metaExtras.push({ label: String(key).trim(), value });
  }

  if (Array.isArray(seed.metaExtras)) {
    for (const extra of seed.metaExtras) {
      const label = cellText(extra?.label);
      const value = cellText(extra?.value);
      if (label && value) lead.metaExtras.push({ label, value });
    }
  }

  if (!lead.source && (Object.keys(lead.meta).length || lead.metaExtras.length)) lead.source = 'Inbound META';
  if (!Object.keys(lead.meta).length) delete lead.meta;
  if (!lead.metaExtras.length) delete lead.metaExtras;
  if (!lead.source) delete lead.source;

  const hasIdentity = Boolean(lead.name || lead.phone || lead.email || lead.meta || lead.metaExtras);
  if (!hasIdentity) return null;
  return lead;
}

/**
 * Map one sheet row (header → cell) into a partial lead.
 * Only non-empty cells are kept.
 */
export function leadFromRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const pairs = Object.entries(record).filter(([key]) => key !== 'meta' && key !== 'metaExtras');
  return leadFromPairs(pairs, record);
}

/**
 * Front mapper: sheet row, Apps Script lead, or a lead already stored in JSON
 * → Lead with `meta` for every filled Inbound META answer.
 */
export function mapDataToLead(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const mapped = leadFromRecord(row) || {};
  const name = cellText(row.name) || cellText(mapped.name);
  const phone = cellText(row.phone) || cellText(mapped.phone);
  const email = cellText(row.email) || cellText(mapped.email);
  if (!name && !phone && !email) return null;

  const status = LEAD_STATUSES.has(row.status) ? row.status : 'new';
  const lead = {
    id: cellText(row.id || row.row_number || row.lead_id || row.externalId),
    externalId: cellText(row.externalId || row.row_number || row.lead_id || row.id),
    name: name || 'Sem Nome',
    phone: String(phone),
    email,
    timestamp: cellText(row.timestamp) || cellText(mapped.timestamp),
    status,
    isContacted: row.isContacted !== undefined ? Boolean(row.isContacted) : status !== 'new',
    notes: cellText(row.notes) || cellText(mapped.notes),
    doctor: cellText(row.doctor) || cellText(mapped.doctor),
    appointmentDate: cellText(row.appointmentDate) || cellText(mapped.appointmentDate),
    value: Number(row.value) || Number(mapped.value) || 0,
    source: cellText(row.source) || cellText(mapped.source),
  };
  if (!lead.id) lead.id = lead.externalId;
  if (!lead.source) delete lead.source;
  if (mapped.meta) lead.meta = mapped.meta;
  if (mapped.metaExtras) lead.metaExtras = mapped.metaExtras;
  return lead;
}

export function mapDataToLeads(data) {
  if (!Array.isArray(data)) return [];
  return data.map(mapDataToLead).filter(Boolean);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
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

export function patchesFromCsv(csvText) {
  const table = parseCsv(csvText);
  if (table.length < 2) return [];
  const headers = table[0];
  const patches = [];

  for (const cells of table.slice(1)) {
    const pairs = [];
    headers.forEach((header, index) => {
      const label = String(header || '').trim();
      if (!label) return;
      pairs.push([label, cells[index] ?? '']);
    });
    const patch = leadFromPairs(pairs);
    if (patch) patches.push(patch);
  }

  return patches;
}

function formatContactDate(value) {
  const text = cellText(value);
  if (!text) return '';
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return humanizeMetaValue(text);
  return date.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

function pushField(fields, seen, field) {
  if (!field?.value || seen.has(field.id)) return;
  seen.add(field.id);
  fields.push(field);
}

/**
 * Filled fields for the lead detail, in sheet order.
 * Empty Meta answers are omitted. Filled form answers are never dropped.
 */
export function filledDetailFields(lead) {
  const source = lead || {};
  const meta = source.meta && typeof source.meta === 'object' ? source.meta : {};
  const fields = [];
  const seen = new Set();

  const phone = cellText(meta.phone || source.phone);
  const email = cellText(meta.email || source.email);
  const contact = cellText(meta.contactDate || source.timestamp);

  pushField(fields, seen, phone ? { id: 'phone', label: 'Telefone', value: phone, href: `tel:${phone}`, kind: 'contact' } : null);
  pushField(fields, seen, email ? { id: 'email', label: 'E-mail', value: email, href: `mailto:${email}`, kind: 'contact' } : null);
  pushField(fields, seen, contact ? { id: 'contactDate', label: 'Data Contacto', value: formatContactDate(contact), kind: 'contact' } : null);

  for (const column of INBOUND_META_COLUMNS) {
    if (column.kind === 'contact') continue;
    const raw = cellText(meta[column.id]);
    if (!raw) continue;
    const value = column.id === 'grossValue' ? raw : humanizeMetaValue(raw);
    pushField(fields, seen, { id: column.id, label: column.label, value, kind: column.kind });
  }

  const extras = Array.isArray(source.metaExtras) ? source.metaExtras : [];
  extras.forEach((extra, index) => {
    const label = cellText(extra?.label);
    const value = humanizeMetaValue(extra?.value);
    if (!label || !value) return;
    pushField(fields, seen, { id: `extra-${index}`, label, value, kind: 'form' });
  });

  const notes = cellText(source.notes);
  const observation = cellText(meta.observations);
  if (notes && notes !== observation) {
    pushField(fields, seen, { id: 'notes', label: 'Notas', value: notes, kind: 'crm' });
  }

  const doctor = cellText(source.doctor);
  if (doctor && doctor !== cellText(meta.budgetDoctor)) {
    pushField(fields, seen, { id: 'doctor', label: 'Médico', value: doctor, kind: 'crm' });
  }

  const appointment = cellText(source.appointmentDate);
  if (appointment && appointment !== cellText(meta.firstAppointment)) {
    pushField(fields, seen, { id: 'appointmentDate', label: 'Data Primeira Consulta', value: appointment, kind: 'crm' });
  }

  const amount = Number(source.value);
  if (Number.isFinite(amount) && amount > 0 && !cellText(meta.grossValue)) {
    pushField(fields, seen, { id: 'value', label: 'Valor Real Bruto', value: String(amount), kind: 'crm' });
  }

  const origin = cellText(source.source);
  if (origin) {
    pushField(fields, seen, { id: 'source', label: 'Origem', value: origin, kind: 'crm' });
  }

  return fields;
}

export function smileGoalLabel(lead) {
  const raw = cellText(lead?.meta?.smileGoal);
  return raw ? humanizeMetaValue(raw) : '';
}

export function mergeInboundLead(current, incoming) {
  const next = {
    ...current,
    meta: { ...(current.meta || {}) },
  };

  for (const [key, raw] of Object.entries(incoming.meta || {})) {
    const value = cellText(raw);
    if (value) next.meta[key] = value;
  }
  if (!Object.keys(next.meta).length) delete next.meta;

  if (incoming.metaExtras?.length) next.metaExtras = incoming.metaExtras;

  if (incoming.name) next.name = incoming.name;
  if (incoming.phone) next.phone = String(incoming.phone);
  if (incoming.email) next.email = incoming.email;
  if (incoming.timestamp) next.timestamp = incoming.timestamp;
  if (incoming.source) next.source = incoming.source;

  if (!cellText(current.doctor) && incoming.doctor) next.doctor = incoming.doctor;
  if (!cellText(current.appointmentDate) && incoming.appointmentDate) next.appointmentDate = incoming.appointmentDate;
  if (!(Number(current.value) > 0) && Number(incoming.value) > 0) next.value = Number(incoming.value);
  if (!cellText(current.notes) && incoming.notes) next.notes = incoming.notes;

  next.status = current.status;
  next.isContacted = current.isContacted;
  next.id = current.id;
  next.externalId = current.externalId || current.id;
  return next;
}

export function newLeadFromInbound(incoming, id) {
  const lead = {
    id: String(id),
    externalId: String(id),
    name: incoming.name || 'Sem Nome',
    phone: String(incoming.phone || ''),
    email: incoming.email || '',
    timestamp: incoming.timestamp || new Date().toISOString(),
    status: 'new',
    isContacted: Boolean(cellText(incoming.meta?.firstContact)),
    notes: incoming.notes || '',
    doctor: incoming.doctor || '',
    appointmentDate: incoming.appointmentDate || '',
    value: Number(incoming.value) || 0,
    source: incoming.source || 'Inbound META',
  };
  if (incoming.meta && Object.keys(incoming.meta).length) lead.meta = { ...incoming.meta };
  if (incoming.metaExtras?.length) lead.metaExtras = incoming.metaExtras;
  return lead;
}

export function matchInboundIndex(leads, incoming) {
  const phone = phoneKey(incoming.phone);
  const email = emailKey(incoming.email);
  return leads.findIndex((lead) => {
    if (phone && phoneKey(lead.phone) === phone) return true;
    if (email && emailKey(lead.email) === email) return true;
    return false;
  });
}
