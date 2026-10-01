import { filledLeadFields, listBucket } from './inboundMeta.js';
import { formatPhoneDisplay } from './phone.js';

/** Labels shown on the lead row. Search uses these words, not the raw status key. */
const STATUS_LABEL = {
  new: 'Novo',
  contacted: 'Em processamento',
  processing: 'Em processamento',
  scheduled: 'Marcada',
  discarded: 'Descartada',
  positive: 'Positivo',
  completed: 'Concluída',
  paid: 'Pago',
};

function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function searchableParts(lead) {
  const phone = String(lead?.phone || '');
  const parts = [
    lead?.name,
    phone,
    phone ? formatPhoneDisplay(phone) : '',
    lead?.email,
    lead?.source,
    lead?.notes,
    lead?.discardReason,
    lead?.doctor,
    STATUS_LABEL[lead?.status] || '',
  ];
  for (const field of filledLeadFields(lead)) {
    parts.push(field.label, field.value);
  }
  return parts;
}

/** True when `query` is empty or matches name, phone, or another visible field. */
export function leadMatchesQuery(lead, query) {
  const raw = String(query ?? '').trim();
  if (!raw) return true;

  const needle = fold(raw);
  if (!needle) return true;

  const hay = fold(searchableParts(lead).join(' '));
  if (hay.includes(needle)) return true;

  const queryDigits = digits(raw);
  if (queryDigits.length >= 3) {
    const phoneDigits = digits(searchableParts(lead).join(' '));
    if (phoneDigits.includes(queryDigits)) return true;
  }
  return false;
}

/** Current Inbox / Descartadas list, narrowed by the search box. Empty query keeps the list. */
export function filterListedLeads(leads, bucket, query) {
  const list = Array.isArray(leads) ? leads : [];
  const inBucket = list.filter((lead) => listBucket(lead?.status) === bucket);
  const q = String(query ?? '').trim();
  if (!q) return inBucket;
  return inBucket.filter((lead) => leadMatchesQuery(lead, q));
}
