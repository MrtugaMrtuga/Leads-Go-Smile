import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filledLeadFields,
  humanizeMetaValue,
  listBucket,
  mapDataToLeads,
  mapSheetCsv,
  pipelineStats,
  pipelineTone,
} from './inboundMeta.js';

const HEADERS = [
  'Data Contacto',
  'Nome Paciente',
  'Telefone',
  'E-mail',
  'O que gostaria de melhorar no seu sorriso?',
  'Que tipo de tratamento está a considerar?',
  'Em que fase está neste momento?',
  'Quando gostaria de avançar?',
  'Já conhece ou foi acompanhado na Go Smile?',
  'Como prefere que a equipa entre em contacto consigo?',
  '1º Contacto',
  'Data 2º Contacto',
  '2º Contacto',
  'Observações',
  'Data Primeira Consulta',
  'Data Próxima Consulta',
  'Nº paciente',
  'Localização',
  'Idade',
  'Realizada',
  'Médico Orçamento Médico Tratamento',
  'Orçamentado',
  'Pagamento',
  'Financiamento',
  'Valor Real Bruto',
  'Legenda',
  '',
  'Facebook',
  'Google Ads',
  'Instagram',
  'Messenger',
  'Website',
  'Observações',
];

const EXAMPLE = [
  '2026-09-20T17:14:04.000Z',
  'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
  '351962852158',
  'cristina.oliveira.consult@gmail.com',
  'substituir_dentes_em_falta',
  'outro_tratamento',
  'quero_marcar_uma_consulta',
  'o_mais_rapidamente_possível',
  'não,_seria_a_primeira_vez',
  'whatsapp',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'nota final da clínica',
];

function toCsv(rows) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

test('humanize turns Meta snake_case into readable Portuguese', () => {
  assert.equal(humanizeMetaValue('substituir_dentes_em_falta'), 'Substituir dentes em falta');
  assert.equal(humanizeMetaValue('outro_tratamento'), 'Outro tratamento');
  assert.equal(humanizeMetaValue('quero_marcar_uma_consulta'), 'Quero marcar uma consulta');
  assert.equal(humanizeMetaValue('o_mais_rapidamente_possível'), 'O mais rapidamente possível');
  assert.equal(humanizeMetaValue('não,_seria_a_primeira_vez'), 'Não, seria a primeira vez');
  assert.equal(humanizeMetaValue('whatsapp'), 'Whatsapp');
  assert.equal(humanizeMetaValue('cristina.oliveira.consult@gmail.com'), 'cristina.oliveira.consult@gmail.com');
  assert.equal(humanizeMetaValue('351962852158'), '351962852158');
});

test('mapSheetCsv keeps every filled Inbound META field and hides empties', () => {
  const [lead] = mapSheetCsv(toCsv([HEADERS, EXAMPLE]));
  assert.ok(lead);
  assert.equal(lead.sourceTab, 'Inbound META');
  assert.equal(lead.name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
  assert.equal(lead.phone, '351962852158');
  assert.equal(lead.email, 'cristina.oliveira.consult@gmail.com');
  assert.equal(lead.id, '2');
  assert.equal(lead.nome, lead.name);
  assert.equal(lead.telefone, lead.phone);
  assert.equal(lead.dataContacto, lead.timestamp);
  assert.equal(lead.notes, 'nota final da clínica');
  assert.equal(lead.crm.observacoes_final, 'nota final da clínica');

  const labels = lead.formFields.map((field) => field.label);
  assert.ok(labels.includes('O que gostaria de melhorar no seu sorriso?'));
  assert.ok(labels.includes('Que tipo de tratamento está a considerar?'));
  assert.ok(labels.includes('Em que fase está neste momento?'));
  assert.ok(labels.includes('Quando gostaria de avançar?'));
  assert.ok(labels.includes('Já conhece ou foi acompanhado na Go Smile?'));
  assert.ok(labels.includes('Como prefere que a equipa entre em contacto consigo?'));
  assert.equal(labels.filter((label) => label === 'Observações').length, 1);
  assert.equal(lead.formFields.some((field) => field.value === ''), false);
  assert.equal(lead.formFields.some((field) => field.key === 'facebook'), false);

  const visible = filledLeadFields(lead);
  const byLabel = Object.fromEntries(visible.map((field) => [field.label, field.value]));
  assert.equal(byLabel['O que gostaria de melhorar no seu sorriso?'], 'Substituir dentes em falta');
  assert.equal(byLabel['Que tipo de tratamento está a considerar?'], 'Outro tratamento');
  assert.equal(byLabel['Em que fase está neste momento?'], 'Quero marcar uma consulta');
  assert.equal(byLabel['Quando gostaria de avançar?'], 'O mais rapidamente possível');
  assert.equal(byLabel['Já conhece ou foi acompanhado na Go Smile?'], 'Não, seria a primeira vez');
  assert.equal(byLabel['Como prefere que a equipa entre em contacto consigo?'], 'Whatsapp');
  assert.match(byLabel['Data Contacto'], /20\/09\/2026/);
  assert.match(byLabel['Data Contacto'], /18:14/);
  assert.equal(byLabel['Observações'], 'Nota final da clínica');
});

test('mapDataToLeads reads sheet objects and preserves stored leads', () => {
  const [mapped] = mapDataToLeads([
    {
      'Nome Paciente': 'Ana Exemplo',
      Telefone: '351910000000',
      'E-mail': 'ana@example.com',
      'Data Contacto': '2026-09-01T10:00:00.000Z',
      'O que gostaria de melhorar no seu sorriso?': 'branquear_dentes',
      'Que tipo de tratamento está a considerar?': '',
    },
  ]);
  assert.equal(mapped.formFields.length, 5);
  assert.equal(
    filledLeadFields(mapped).find((field) => field.key === 'melhorar_sorriso').value,
    'Branquear dentes'
  );

  const stored = mapDataToLeads([
    {
      id: '1106',
      externalId: '1106',
      name: 'Ana Rita Costa',
      phone: '351912334455',
      email: 'ana.costa@email.pt',
      timestamp: '2026-09-07T09:15:00.000Z',
      status: 'new',
      isContacted: false,
      source: 'Facebook',
    },
  ]);
  assert.equal(stored[0].name, 'Ana Rita Costa');
  assert.equal(stored[0].formFields, undefined);
  assert.deepEqual(filledLeadFields(stored[0]), []);
});

test('status marker is authoritative and hidden from the detail fields', () => {
  const row = [...EXAMPLE];
  row[13] = '[status:contacted]\nliguei hoje';
  const [lead] = mapSheetCsv(toCsv([HEADERS, row]));
  assert.equal(lead.status, 'contacted');
  assert.equal(lead.notes, 'liguei hoje');
  assert.equal(lead.crm.observacoes, 'liguei hoje');
  const visible = filledLeadFields(lead);
  assert.equal(visible.find((field) => field.key === 'observacoes').value, 'Liguei hoje');
  assert.equal(visible.some((field) => String(field.value).includes('[status:')), false);
});

test('pipeline markers survive reload and stay off the Meta detail', () => {
  const row = [...EXAMPLE];
  row[13] = '[status:discarded]\n[motivo:não interessa]\nliguei ontem';
  row[25] = 'Descartada';
  const [lead] = mapSheetCsv(toCsv([HEADERS, row]));
  assert.equal(lead.status, 'discarded');
  assert.equal(lead.discardReason, 'não interessa');
  assert.equal(lead.notes, 'liguei ontem');
  assert.equal(listBucket(lead.status), 'descartadas');
  assert.equal(pipelineTone(lead.status), 'red');
  const visible = filledLeadFields(lead);
  assert.equal(visible.some((field) => String(field.value).includes('[status:')), false);
  assert.equal(visible.some((field) => String(field.value).includes('[motivo:')), false);
  assert.equal(visible.find((field) => field.key === 'observacoes').value, 'Liguei ontem');
});

test('Legenda and não atendeu stay in the inbox as processing', () => {
  const [fromLegenda] = mapSheetCsv(
    toCsv([
      ['Nome Paciente', 'Legenda'],
      ['Ana Sem Atender', 'Em processamento'],
    ])
  );
  assert.equal(fromLegenda.status, 'processing');
  assert.equal(listBucket(fromLegenda.status), 'inbox');
  assert.equal(pipelineTone(fromLegenda.status), 'yellow');

  const [fromNote] = mapSheetCsv(
    toCsv([
      ['Nome Paciente', 'Observações'],
      ['Bruno Não Atendeu', 'não atendeu à primeira chamada'],
    ])
  );
  assert.equal(fromNote.status, 'processing');
  assert.equal(listBucket(fromNote.status), 'inbox');

  const [booked] = mapSheetCsv(
    toCsv([
      ['Nome Paciente', 'Legenda'],
      ['Carla Marcada', 'Marcada'],
    ])
  );
  assert.equal(booked.status, 'scheduled');
  assert.equal(listBucket(booked.status), 'marcadas');
  assert.equal(pipelineTone(booked.status), 'green');
});

test('estatísticas are percentages of every lead', () => {
  const stats = pipelineStats([
    { status: 'new' },
    { status: 'processing' },
    { status: 'contacted' },
    { status: 'scheduled' },
    { status: 'discarded' },
    { status: 'paid' },
    { status: 'completed' },
    { status: 'new' },
    { status: 'scheduled' },
    { status: 'discarded' },
  ]);
  assert.equal(stats.total, 10);
  assert.equal(stats.discardedPct, 20);
  assert.equal(stats.bookedPct, 20);
  assert.equal(stats.processingPct, 20);
  assert.equal(listBucket('processing'), 'inbox');
  assert.equal(listBucket('scheduled') === 'inbox', false);
});

test('portuguese sheet dates stay on the contact day', () => {
  const [lead] = mapSheetCsv(
    toCsv([
      ['Data Contacto', 'Nome Paciente'],
      ['20/09/2026 18:14', 'Ida Cristina'],
    ])
  );
  const date = new Date(lead.timestamp);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 20);
});
