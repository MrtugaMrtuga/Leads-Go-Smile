import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filledDetailFields,
  humanizeMetaValue,
  mapDataToLeads,
  mergeInboundLead,
  patchesFromCsv,
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

const IDA = [
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
  '',
];

function csvLine(cells) {
  return cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
}

test('humanize snake_case Meta answers into readable Portuguese', () => {
  assert.equal(humanizeMetaValue('substituir_dentes_em_falta'), 'Substituir dentes em falta');
  assert.equal(humanizeMetaValue('outro_tratamento'), 'Outro tratamento');
  assert.equal(humanizeMetaValue('quero_marcar_uma_consulta'), 'Quero marcar uma consulta');
  assert.equal(humanizeMetaValue('o_mais_rapidamente_possível'), 'O mais rapidamente possível');
  assert.equal(humanizeMetaValue('não,_seria_a_primeira_vez'), 'Não, seria a primeira vez');
  assert.equal(humanizeMetaValue('whatsapp'), 'Whatsapp');
  assert.equal(humanizeMetaValue('cristina.oliveira.consult@gmail.com'), 'cristina.oliveira.consult@gmail.com');
  assert.equal(humanizeMetaValue('351962852158'), '351962852158');
});

test('Ida Cristina row keeps every filled Meta answer and hides empty cells', () => {
  const [patch] = patchesFromCsv(`${csvLine(HEADERS)}\n${csvLine(IDA)}\n`);
  const lead = {
    id: '2001',
    externalId: '2001',
    status: 'new',
    isContacted: false,
    ...patch,
  };
  const fields = filledDetailFields(lead);
  const byLabel = Object.fromEntries(fields.map((field) => [field.label, field.value]));

  assert.equal(lead.name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
  assert.equal(lead.phone, '351962852158');
  assert.equal(lead.email, 'cristina.oliveira.consult@gmail.com');
  assert.equal(lead.source, 'Inbound META');
  assert.equal(byLabel['Telefone'], '351962852158');
  assert.equal(byLabel['E-mail'], 'cristina.oliveira.consult@gmail.com');
  assert.equal(byLabel['O que gostaria de melhorar no seu sorriso?'], 'Substituir dentes em falta');
  assert.equal(byLabel['Que tipo de tratamento está a considerar?'], 'Outro tratamento');
  assert.equal(byLabel['Em que fase está neste momento?'], 'Quero marcar uma consulta');
  assert.equal(byLabel['Quando gostaria de avançar?'], 'O mais rapidamente possível');
  assert.equal(byLabel['Já conhece ou foi acompanhado na Go Smile?'], 'Não, seria a primeira vez');
  assert.equal(byLabel['Como prefere que a equipa entre em contacto consigo?'], 'Whatsapp');
  assert.equal(byLabel.Origem, 'Inbound META');
  assert.ok(byLabel['Data Contacto']);
  assert.equal(byLabel['1º Contacto'], undefined);
  assert.equal(byLabel['Localização'], undefined);
  assert.equal(byLabel['Valor Real Bruto'], undefined);
  assert.equal(byLabel.Facebook, undefined);
  assert.equal(byLabel.Observações, undefined);
  assert.equal(fields.some((field) => String(field.value).includes('_')), false);
});

test('mapDataToLeads keeps Apps Script keys and an already stored lead', () => {
  const [fromGas] = mapDataToLeads([
    {
      row_number: '2',
      name: 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
      phone: '351962852158',
      email: 'cristina.oliveira.consult@gmail.com',
      date: '2026-09-20T17:14:04.000Z',
      status: 'new',
      smile_goal: 'substituir_dentes_em_falta',
      treatment_type: 'outro_tratamento',
      current_stage: 'quero_marcar_uma_consulta',
      timing: 'o_mais_rapidamente_possível',
      knows_clinic: 'não,_seria_a_primeira_vez',
      contact_preference: 'whatsapp',
    },
  ]);
  const labels = Object.fromEntries(filledDetailFields(fromGas).map((field) => [field.label, field.value]));
  assert.equal(fromGas.id, '2');
  assert.equal(fromGas.status, 'new');
  assert.equal(labels['O que gostaria de melhorar no seu sorriso?'], 'Substituir dentes em falta');
  assert.equal(labels['Como prefere que a equipa entre em contacto consigo?'], 'Whatsapp');
  assert.equal(labels['1º Contacto'], undefined);

  const [stored] = mapDataToLeads([
    {
      id: '1104',
      externalId: '1104',
      name: 'Sofia Mendes',
      phone: '351967889900',
      email: 'sofia.mendes@outlook.pt',
      timestamp: '2026-09-05T11:05:00.000Z',
      status: 'contacted',
      isContacted: true,
      notes: 'Não atendeu.',
      source: 'Facebook',
    },
  ]);
  assert.equal(stored.status, 'contacted');
  assert.equal(stored.notes, 'Não atendeu.');
  assert.equal(stored.meta, undefined);
  assert.equal(filledDetailFields(stored).some((field) => field.kind === 'form'), false);
});

test('merge keeps local CRM edits and still refreshes form answers', () => {
  const [patch] = patchesFromCsv(`${csvLine(HEADERS)}\n${csvLine(IDA)}\n`);
  const merged = mergeInboundLead(
    {
      id: '9',
      externalId: '9',
      name: 'Ida',
      phone: '962852158',
      email: 'old@example.com',
      timestamp: '2026-09-01T00:00:00.000Z',
      status: 'scheduled',
      isContacted: true,
      notes: 'Ligar depois das 18h',
      doctor: 'Bruno Aires',
      appointmentDate: '2026-09-25T10:00',
      value: 1800,
      source: 'Manual',
    },
    patch
  );

  assert.equal(merged.status, 'scheduled');
  assert.equal(merged.isContacted, true);
  assert.equal(merged.notes, 'Ligar depois das 18h');
  assert.equal(merged.doctor, 'Bruno Aires');
  assert.equal(merged.appointmentDate, '2026-09-25T10:00');
  assert.equal(merged.value, 1800);
  assert.equal(merged.meta.smileGoal, 'substituir_dentes_em_falta');
  assert.equal(merged.name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
});
