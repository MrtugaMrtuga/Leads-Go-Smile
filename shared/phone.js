/**
 * Dial links for the lead list.
 * Portuguese numbers become E.164 (+351…). The href is always a native tel: URI.
 * This module never builds wa.me, api.whatsapp.com, or any other messenger URL.
 */

const SEPARATORS = /[\s()./-]/g;

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function portugalFromNational(national) {
  const body = String(national || '');
  if (/^[29]\d{8}$/.test(body)) return `+351${body}`;
  return '';
}

export function toE164(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  let compact = text.replace(SEPARATORS, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;

  if (compact.startsWith('+')) {
    const body = digits(compact.slice(1));
    if (!body) return '';
    if (body.startsWith('351')) {
      const national = body.slice(3).replace(/^0/, '');
      return portugalFromNational(national);
    }
    if (/^[1-9]\d{7,14}$/.test(body)) return `+${body}`;
    return '';
  }

  const only = digits(compact);
  if (only.startsWith('351')) {
    const national = only.slice(3).replace(/^0/, '');
    const local = portugalFromNational(national);
    if (local) return local;
  }
  return portugalFromNational(only);
}

export function toTelHref(raw) {
  const e164 = toE164(raw);
  if (e164) return `tel:${e164}`;
  const only = digits(raw);
  if (only.length < 6) return '';
  return `tel:${only}`;
}

export function formatPhoneDisplay(raw) {
  const e164 = toE164(raw);
  if (e164.startsWith('+351') && e164.length === 13) {
    const national = e164.slice(4);
    return `+351 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  if (e164) return e164;
  return String(raw || '').trim();
}
