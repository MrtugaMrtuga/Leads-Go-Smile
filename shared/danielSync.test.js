import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_CUTOFF_DAY, DANIEL_SHEET_TAB, DANIEL_SHEET_TAB_FALLBACK, SHEET_TAB } from './inboundMeta.js';
import { planDanielSync } from './danielSync.js';

const DANIEL_HEADERS = [
  '4',
  'Origem',
  'Nome',
  'Email',
  'Telefone',
  'Responsável',
  'Data Contacto',
  'Comentários',
  'Data Primeira Consulta',
  'Médico',
  'Nº Paciente Definitivo',
  'Estado',
  'Data Próxima Consulta',
  'Orçamentado',
  'Pagamento',
  'Financiamento',
  'Valor Real Bruto',
];

const EVOB_HEADERS = [
  'Timestamp',
  'Nome Paciente',
  'E-mail',
  'Telefone',
  'Observações',
  'Legenda',
  'Médico Orçamento Médico Tratamento',
  'Nº paciente',
  'Data de contacto',
  'Origem',
  'Responsavel',
  'Data Primeira Consulta',
  'Data Próxima Consulta',
  'Orçamentado',
  'Pagamento',
  'Financiamento',
  'Valor Real Bruto',
  'Data fecho',
  'Notas internas',
];

function danielRow(overrides = {}) {
  const cells = DANIEL_HEADERS.map(() => '');
  const set = (header, value) => {
    cells[DANIEL_HEADERS.indexOf(header)] = value;
  };
  set('4', '2026-09-12 09:30:00');
  set('Origem', 'Facebook');
  set('Nome', 'Ana Costa');
  set('Email', 'Ana@Example.com');
  set('Telefone', '+351 910 000 000');
  set('Responsável', 'Carla');
  set('Data Contacto', '12.09.26');
  set('Comentários', '[status:processing]\nnão atendeu');
  set('Estado', 'Em processamento');
  set('Médico', 'Dra Joana');
  set('Valor Real Bruto', '1.250,00');
  Object.entries(overrides).forEach(([header, value]) => set(header, value));
  return cells;
}

function evobIndex(header) {
  return EVOB_HEADERS.indexOf(header);
}

test('cutoff stays 2026-09-01 and Daniel tab name is the verified leads tab', () => {
  assert.equal(CONTACT_CUTOFF_DAY, '2026-09-01');
  assert.equal(DANIEL_SHEET_TAB, 'Leads (2024 - 2026)');
  assert.equal(DANIEL_SHEET_TAB, SHEET_TAB);
  assert.equal(DANIEL_SHEET_TAB_FALLBACK, 'Leads - Go Smile');
});

test('appends a new Daniel lead onto EVOB headers and leaves existing CRM rows untouched', () => {
  const existing = EVOB_HEADERS.map(() => '');
  existing[evobIndex('Timestamp')] = '2026-09-02 10:00:00';
  existing[evobIndex('Nome Paciente')] = 'José Silva';
  existing[evobIndex('Telefone')] = '351911111111';
  existing[evobIndex('E-mail')] = 'jose@evob.pt';
  existing[evobIndex('Observações')] = 'nota já na EVOB';
  existing[evobIndex('Legenda')] = 'Marcada';
  existing[evobIndex('Data fecho')] = '2026-09-03T10:00:00.000Z';
  const existingCopy = existing.slice();

  const plan = planDanielSync({
    danielHeaders: DANIEL_HEADERS,
    danielRows: [
      danielRow(),
      danielRow({ Nome: 'José Silva', Telefone: '+351 911 111 111', Email: 'outro@example.com', '4': '2026-09-02 10:00:00' }),
      danielRow({ Nome: '', Telefone: '351900000000' }),
      danielRow({ Nome: 'Antes do corte', '4': '2026-08-31 23:30:00', 'Data Contacto': '15.09.26' }),
    ],
    evobHeaders: EVOB_HEADERS,
    evobRows: [existing],
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.cutoff, '2026-09-01');
  assert.equal(plan.scanned, 2);
  assert.equal(plan.inserted, 1);
  assert.equal(plan.skipped, 1);
  assert.equal(plan.errors, 0);
  assert.equal(plan.append.length, 1);
  assert.deepEqual(existing, existingCopy);

  const appended = plan.append[0];
  assert.equal(appended[evobIndex('Timestamp')], '2026-09-12 09:30:00');
  assert.equal(appended[evobIndex('Nome Paciente')], 'Ana Costa');
  assert.equal(appended[evobIndex('E-mail')], 'Ana@Example.com');
  assert.equal(appended[evobIndex('Telefone')], '+351 910 000 000');
  assert.equal(appended[evobIndex('Observações')], '[status:processing]\nnão atendeu');
  assert.equal(appended[evobIndex('Legenda')], 'Em processamento');
  assert.equal(appended[evobIndex('Médico Orçamento Médico Tratamento')], 'Dra Joana');
  assert.equal(appended[evobIndex('Origem')], 'Facebook');
  assert.equal(appended[evobIndex('Responsavel')], 'Carla');
  assert.equal(appended[evobIndex('Valor Real Bruto')], '1.250,00');
  assert.equal(appended[evobIndex('Data de contacto')], '12.09.26');
  assert.equal(appended[evobIndex('Data fecho')], '');
  assert.equal(appended[evobIndex('Notas internas')], '');
  assert.equal(appended.length, EVOB_HEADERS.length);
});

test('the same phone and folded name on the cutoff day is one lead, even with a second Daniel copy', () => {
  const first = danielRow({ '4': '2026-09-01 00:05:00', Nome: 'José  Silva', Comentários: 'primeira' });
  const second = danielRow({ '4': '2026-09-01 00:05:00', Nome: 'jose silva', Comentários: 'segunda', Estado: 'Marcada' });
  const laterDay = danielRow({ '4': '2026-09-02 00:05:00', Nome: 'José Silva', Telefone: '+351 910 000 000' });
  const plan = planDanielSync({
    danielHeaders: DANIEL_HEADERS,
    danielRows: [first, second, laterDay],
    evobHeaders: DANIEL_HEADERS,
    evobRows: [],
  });
  assert.equal(plan.scanned, 3);
  assert.equal(plan.inserted, 2);
  assert.equal(plan.skipped, 1);
  assert.equal(plan.append[0][DANIEL_HEADERS.indexOf('Comentários')], 'primeira');
  assert.equal(plan.append[1][DANIEL_HEADERS.indexOf('4')], '2026-09-02 00:05:00');
});

test('a Lisbon instant just before midnight UTC on 31 Aug is on the cutoff day', () => {
  const plan = planDanielSync({
    danielHeaders: ['4', 'Nome', 'Telefone', 'Email'],
    danielRows: [
      ['2026-08-31T23:30:00Z', 'Noite UTC', '351920000001', 'noite@example.com'],
      ['2026-08-31 23:30:00', 'Noite escrita', '351920000002', 'escrita@example.com'],
    ],
    evobHeaders: ['4', 'Nome', 'Telefone', 'Email'],
    evobRows: [],
  });
  assert.deepEqual(
    plan.append.map((row) => row[1]),
    ['Noite UTC']
  );
  assert.equal(plan.scanned, 1);
  assert.equal(plan.inserted, 1);
});

test('Data Contacto in September does not qualify a row whose column A is older', () => {
  const plan = planDanielSync({
    danielHeaders: DANIEL_HEADERS,
    danielRows: [danielRow({ '4': '2024-10-03 22:15:37', 'Data Contacto': '02.09.26 - 9h', Nome: 'CRM Setembro' })],
    evobHeaders: DANIEL_HEADERS,
    evobRows: [],
  });
  assert.equal(plan.scanned, 0);
  assert.equal(plan.inserted, 0);
  assert.deepEqual(plan.append, []);
});

test('phone wins the key, so a different email still matches and a phone-less row does not', () => {
  const evob = DANIEL_HEADERS.map(() => '');
  evob[DANIEL_HEADERS.indexOf('4')] = '2026-09-10 08:00:00';
  evob[DANIEL_HEADERS.indexOf('Nome')] = 'Ana Costa';
  evob[DANIEL_HEADERS.indexOf('Telefone')] = '351910000000';
  evob[DANIEL_HEADERS.indexOf('Email')] = 'ana@evob.pt';
  evob[DANIEL_HEADERS.indexOf('Comentários')] = 'crm evob';
  evob[DANIEL_HEADERS.indexOf('Estado')] = 'Marcada';

  const plan = planDanielSync({
    danielHeaders: DANIEL_HEADERS,
    danielRows: [
      danielRow({ '4': '2026-09-10 08:00:00', Email: 'outra@example.com', Comentários: 'não copiar por cima' }),
      danielRow({
        '4': '2026-09-10 08:00:00',
        Nome: 'Ana Costa',
        Telefone: '',
        Email: 'ana@evob.pt',
        Comentários: 'só email',
      }),
    ],
    evobHeaders: DANIEL_HEADERS,
    evobRows: [evob],
  });

  assert.equal(plan.skipped, 1);
  assert.equal(plan.inserted, 1);
  assert.equal(plan.append[0][DANIEL_HEADERS.indexOf('Comentários')], 'só email');
  assert.equal(evob[DANIEL_HEADERS.indexOf('Comentários')], 'crm evob');
  assert.equal(evob[DANIEL_HEADERS.indexOf('Estado')], 'Marcada');
});

test('a second plan after the append inserts nothing', () => {
  const seed = planDanielSync({
    danielHeaders: DANIEL_HEADERS,
    danielRows: [danielRow(), danielRow({ Nome: 'Bruno Melo', Telefone: '351911734604', Email: 'bruno@example.com' })],
    evobHeaders: DANIEL_HEADERS,
    evobRows: [],
  });
  assert.equal(seed.inserted, 2);
  const again = planDanielSync({
    danielHeaders: DANIEL_HEADERS,
    danielRows: [danielRow(), danielRow({ Nome: 'Bruno Melo', Telefone: '351911734604', Email: 'bruno@example.com' })],
    evobHeaders: DANIEL_HEADERS,
    evobRows: seed.append,
  });
  assert.equal(again.scanned, 2);
  assert.equal(again.inserted, 0);
  assert.equal(again.skipped, 2);
  assert.equal(again.errors, 0);
  assert.deepEqual(again.append, []);
});

test('a Daniel tab without Nome or timestamp fails closed', () => {
  const plan = planDanielSync({
    danielHeaders: ['Data Contacto', 'Nome Paciente', 'E-mail'],
    danielRows: [['2026-09-20T17:14:04.000Z', 'Ida', 'ida@example.com']],
    evobHeaders: DANIEL_HEADERS,
    evobRows: [],
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.inserted, 0);
  assert.equal(plan.scanned, 0);
  assert.equal(plan.errors, 1);
  assert.match(plan.error, /timestamp/);
});
