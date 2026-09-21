/**
 * Maps an app patch onto existing Inbound META headers.
 * Unknown headers are dropped. Meta form questions are not overwritten.
 */

import { COLUMN_DEFS, CRM_KEYS, splitStatusNote } from './inboundMeta.js';

const WRITABLE = new Set(CRM_KEYS);
const STATUSES = new Set(['new', 'contacted', 'discarded', 'scheduled', 'positive', 'completed', 'paid']);

const STATUS_ALIASES = {
  pago: 'paid',
  paga: 'paid',
  fechado: 'completed',
  fechada: 'completed',
  'não interessada': 'discarded',
  'nao interessada': 'discarded',
  descartada: 'discarded',
  descartado: 'discarded',
  faltou: 'contacted',
};

function writableByKey(key) {
  if (!WRITABLE.has(key)) return null;
  return COLUMN_DEFS.find((def) => def.key === key) || null;
}

function writableByHeader(token) {
  const match = String(token || '').match(/^(.*)#(\d+)$/);
  const header = (match ? match[1] : String(token || '')).trim();
  const occurrence = match ? Number(match[2]) : 1;
  return (
    COLUMN_DEFS.find(
      (def) => def.header === header && (def.occurrence || 1) === occurrence && WRITABLE.has(def.key)
    ) || null
  );
}

function normalizeStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  if (STATUSES.has(key)) return key;
  return STATUS_ALIASES[key] || '';
}

export function leadPatchToFields(updates = {}, now = new Date()) {
  const fields = [];
  const seen = new Map();

  const push = (def, value, extra = {}) => {
    if (!def) return;
    const item = {
      header: def.header,
      occurrence: def.occurrence || 1,
      value: value == null ? '' : String(value),
    };
    if (extra.ifBlank) item.ifBlank = true;
    seen.set(`${item.header}#${item.occurrence}`, item);
  };

  let noteSet = Boolean(updates.noteSet) || updates.notes !== undefined || updates.comentario !== undefined;
  let note = updates.notes ?? updates.comentario ?? '';

  if (updates.doctor !== undefined || updates.medico !== undefined) {
    push(writableByKey('medico_orcamento'), updates.doctor ?? updates.medico ?? '');
  }
  if (updates.appointmentDate !== undefined || updates.data_consulta !== undefined) {
    push(writableByKey('data_primeira_consulta'), updates.appointmentDate ?? updates.data_consulta ?? '');
  }
  if (updates.value !== undefined || updates.valor_fechado !== undefined) {
    const amount = updates.value !== undefined ? updates.value : updates.valor_fechado;
    push(writableByKey('valor_real_bruto'), amount == null || amount === '' ? '' : amount);
  }

  const status = normalizeStatus(updates.status || updates.estado);

  if (status && status !== 'new') {
    const stamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
    push(writableByKey('primeiro_contacto'), stamp, { ifBlank: true });
  }
  if (status === 'paid') push(writableByKey('pagamento'), 'Pago');
  if (status === 'completed') push(writableByKey('orcamentado'), 'Fechado', { ifBlank: true });

  const crm = updates.crm && typeof updates.crm === 'object' && !Array.isArray(updates.crm) ? updates.crm : null;
  if (crm) {
    Object.entries(crm).forEach(([key, value]) => {
      if (key === 'observacoes') {
        noteSet = true;
        note = value;
        return;
      }
      push(writableByKey(key), value);
    });
  }

  const direct = updates.fields;
  if (Array.isArray(direct)) {
    direct.forEach((field) => {
      const def = writableByHeader(field?.header) || writableByKey(field?.key);
      if (!def) return;
      if (def.key === 'observacoes') {
        noteSet = true;
        note = field?.value ?? '';
        return;
      }
      const occurrence = field?.occurrence || def.occurrence || 1;
      if (occurrence !== (def.occurrence || 1) && def.key !== 'observacoes_final') return;
      push(def, field?.value ?? '', field?.ifBlank ? { ifBlank: true } : {});
    });
  } else if (direct && typeof direct === 'object') {
    Object.entries(direct).forEach(([header, value]) => {
      const def = writableByHeader(header);
      if (!def) return;
      if (def.key === 'observacoes') {
        noteSet = true;
        note = value;
        return;
      }
      push(def, value);
    });
  }

  seen.forEach((item) => fields.push(item));

  return {
    status,
    note: splitStatusNote(note).note,
    noteSet: Boolean(noteSet),
    fields,
  };
}
