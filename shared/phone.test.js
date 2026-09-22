import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatPhoneDisplay, toE164, toTelHref } from './phone.js';

test('Portuguese mobiles and landlines become tel:+351', () => {
  for (const raw of ['912345678', '351912345678', '+351 912 345 678', '00351912345678', '91 234 56 78']) {
    assert.equal(toE164(raw), '+351912345678');
    assert.equal(toTelHref(raw), 'tel:+351912345678');
    assert.equal(formatPhoneDisplay(raw), '+351 912 345 678');
  }
  assert.equal(toE164('212345678'), '+351212345678');
  assert.equal(toTelHref('(351) 212 345 678'), 'tel:+351212345678');
});

test('a foreign E.164 number stays foreign and still dials with tel:', () => {
  assert.equal(toE164('+33 6 12 34 56 78'), '+33612345678');
  assert.equal(toTelHref('+33 6 12 34 56 78'), 'tel:+33612345678');
  assert.equal(toTelHref('+33612345678').includes('351'), false);
});

test('phone links never point at WhatsApp', () => {
  for (const raw of ['912345678', '+351912345678', 'whatsapp', 'https://wa.me/351912345678', '']) {
    const href = toTelHref(raw);
    assert.equal(/wa\.me|whatsapp|api\.whatsapp/i.test(href), false);
    if (href) assert.equal(href.startsWith('tel:'), true);
  }
  assert.equal(toTelHref(''), '');
  assert.equal(formatPhoneDisplay(''), '');
});

test('lead list screens link the phone with tel and never WhatsApp', () => {
  const files = [
    '../views/Inbox.tsx',
    '../views/Agenda.tsx',
    '../views/Trash.tsx',
    '../views/Accounts.tsx',
    '../views/Admin.tsx',
    '../components/LeadPhone.tsx',
    '../components/StatusMove.tsx',
  ];
  const source = files.map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  assert.match(source, /LeadPhone/);
  assert.match(source, /nextPipelineStatus|Passar a/);
  assert.doesNotMatch(source, /wa\.me|api\.whatsapp|whatsapp:/i);
});
