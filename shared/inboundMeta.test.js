import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTACT_CUTOFF_DAY,
  SHEET_TAB,
  closeEvolution,
  closeWindow,
  contactDayFromText,
  filledLeadFields,
  filterLeadsForApp,
  humanizeMetaValue,
  listBucket,
  mapDataToLeads,
  mapSheetCsv,
  nextPipelineStatus,
  pipelineBreakdown,
  pipelineStats,
  pipelineTone,
  sortLeadsNewestFirst,
  syncLeadKey,
} from './inboundMeta.js';

const HEADERS = [
  'timestamp',
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
  'O que gostaria de melhorar no seu sorriso?',
];

const IDA = {
  timestamp: '2026-09-20T16:14:04.000Z',
  Origem: 'Meta',
  Nome: 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
  Email: 'cristina.oliveira.consult@gmail.com',
  Telefone: '351962852158',
  'Data Contacto': '2026-09-20T17:14:04.000Z',
  Comentários: 'nota da clínica',
  'O que gostaria de melhorar no seu sorriso?': 'substituir_dentes_em_falta',
};

function rowFrom(cells) {
  const row = HEADERS.map(() => '');
  Object.entries(cells).forEach(([header, value]) => {
    const index = HEADERS.indexOf(header);
    if (index < 0) throw new Error(`Cabeçalho em falta: ${header}`);
    row[index] = value;
  });
  return row;
}

const EXAMPLE = rowFrom(IDA);

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

test('mapSheetCsv keeps filled Leads (2024 - 2026) fields and hides empties', () => {
  const [lead] = mapSheetCsv(toCsv([HEADERS, EXAMPLE]));
  assert.ok(lead);
  assert.equal(SHEET_TAB, 'Leads (2024 - 2026)');
  assert.equal(lead.sourceTab, 'Leads (2024 - 2026)');
  assert.equal(lead.source, 'Meta');
  assert.equal(lead.name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
  assert.equal(lead.phone, '351962852158');
  assert.equal(lead.email, 'cristina.oliveira.consult@gmail.com');
  assert.equal(lead.id, '2');
  assert.equal(lead.nome, lead.name);
  assert.equal(lead.telefone, lead.phone);
  assert.equal(lead.contactDay, '2026-09-20');
  assert.equal(lead.notes, 'nota da clínica');
  assert.equal(lead.crm.observacoes, 'nota da clínica');
  assert.equal(lead.crm.estado, '');

  const labels = lead.formFields.map((field) => field.label);
  assert.ok(labels.includes('O que gostaria de melhorar no seu sorriso?'));
  assert.ok(labels.includes('Origem'));
  assert.ok(labels.includes('Comentários'));
  assert.equal(labels.includes('Observações'), false);
  assert.equal(lead.formFields.some((field) => field.value === ''), false);

  const visible = filledLeadFields(lead);
  const byLabel = Object.fromEntries(visible.map((field) => [field.label, field.value]));
  assert.equal(byLabel['O que gostaria de melhorar no seu sorriso?'], 'Substituir dentes em falta');
  assert.equal(byLabel.Origem, 'Meta');
  assert.match(byLabel['Data Contacto'], /20\/09\/2026/);
  assert.match(byLabel['Data Contacto'], /18:14/);
  assert.equal(byLabel['Comentários'], 'Nota da clínica');
});

test('mapDataToLeads reads sheet objects and preserves stored leads', () => {
  const [mapped] = mapDataToLeads([
    {
      Nome: 'Ana Exemplo',
      Telefone: '351910000000',
      Email: 'ana@example.com',
      'Data Contacto': '2026-09-01T10:00:00.000Z',
      'O que gostaria de melhorar no seu sorriso?': 'branquear_dentes',
    },
  ]);
  assert.equal(mapped.formFields.length, 5);
  assert.equal(mapped.contactDay, '2026-09-01');
  assert.equal(
    filledLeadFields(mapped).find((field) => field.label === 'O que gostaria de melhorar no seu sorriso?').value,
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
  const row = rowFrom({ ...IDA, Comentários: '[status:contacted]\nliguei hoje' });
  const [lead] = mapSheetCsv(toCsv([HEADERS, row]));
  assert.equal(lead.status, 'contacted');
  assert.equal(lead.notes, 'liguei hoje');
  assert.equal(lead.crm.observacoes, 'liguei hoje');
  const visible = filledLeadFields(lead);
  assert.equal(visible.find((field) => field.key === 'observacoes').value, 'Liguei hoje');
  assert.equal(visible.some((field) => String(field.value).includes('[status:')), false);
});

test('pipeline markers survive reload and stay off the detail', () => {
  const row = rowFrom({
    ...IDA,
    Comentários: '[status:discarded]\n[motivo:não interessa]\nliguei ontem',
    Estado: 'Descartada',
  });
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

test('Estado and não atendeu stay in the inbox as processing', () => {
  const [fromEstado] = mapSheetCsv(
    toCsv([
      ['Nome', 'Estado'],
      ['Ana Sem Atender', 'Em processamento'],
    ])
  );
  assert.equal(fromEstado.status, 'processing');
  assert.equal(listBucket(fromEstado.status), 'inbox');
  assert.equal(pipelineTone(fromEstado.status), 'yellow');

  const [fromNote] = mapSheetCsv(
    toCsv([
      ['Nome', 'Comentários'],
      ['Bruno Não Atendeu', 'não atendeu à primeira chamada'],
    ])
  );
  assert.equal(fromNote.status, 'processing');
  assert.equal(listBucket(fromNote.status), 'inbox');

  const [booked] = mapSheetCsv(
    toCsv([
      ['Nome', 'Estado'],
      ['Carla Marcada', 'Marcada'],
    ])
  );
  assert.equal(booked.status, 'scheduled');
  assert.equal(listBucket(booked.status), 'marcadas');
  assert.equal(pipelineTone(booked.status), 'green');
});

test('old Inbound META headers still map onto the historical columns', () => {
  const [lead] = mapSheetCsv(
    toCsv([
      ['Nome Paciente', 'E-mail', 'Telefone', 'Observações', 'Legenda', 'Médico Orçamento Médico Tratamento', 'Nº paciente', 'Data Contacto'],
      ['Ana Antiga', 'ana@example.com', '351910000000', 'liguei', 'Marcada', 'Bruno Aires', '42', '2026-09-02'],
    ])
  );
  assert.equal(lead.name, 'Ana Antiga');
  assert.equal(lead.email, 'ana@example.com');
  assert.equal(lead.notes, 'liguei');
  assert.equal(lead.status, 'scheduled');
  assert.equal(lead.doctor, 'Bruno Aires');
  assert.equal(lead.crm.numero_paciente, '42');
  assert.equal(lead.contactDay, '2026-09-02');
  assert.equal(lead.formFields.find((field) => field.key === 'nome').label, 'Nome');
  assert.equal(lead.formFields.find((field) => field.key === 'observacoes').label, 'Comentários');
  assert.equal(lead.formFields.find((field) => field.key === 'estado').label, 'Estado');
});

test('estatísticas are percentages of every lead', () => {
  const leads = [
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
  ];
  const stats = pipelineStats(leads);
  assert.equal(stats.total, 10);
  assert.equal(stats.discardedPct, 20);
  assert.equal(stats.bookedPct, 20);
  assert.equal(stats.processingPct, 20);
  const breakdown = pipelineBreakdown(leads);
  const byLabel = Object.fromEntries(breakdown.buckets.map((row) => [row.label, row]));
  assert.equal(byLabel.Total.count, 10);
  assert.equal(byLabel.Total.pct, 100);
  assert.equal(byLabel.Descartadas.count, 2);
  assert.equal(byLabel.Marcadas.count, 2);
  assert.equal(byLabel['Em processamento'].count, 2);
  assert.equal(byLabel.Novas.count, 2);
  assert.equal(byLabel.Novas.pct, 20);
  assert.equal(byLabel.Pagas.count, 1);
  assert.equal(byLabel.Concluídas.count, 1);
  assert.equal(byLabel.Contactadas, undefined);
  assert.equal(listBucket('processing'), 'inbox');
  assert.equal(listBucket('scheduled') === 'inbox', false);
  assert.equal(nextPipelineStatus('scheduled'), 'processing');
  assert.equal(nextPipelineStatus('processing'), 'scheduled');
  assert.equal(nextPipelineStatus('contacted'), 'scheduled');
  assert.equal(nextPipelineStatus('new'), '');
  assert.equal(nextPipelineStatus('discarded'), '');
});

test('fecho date is read from the column or the Comentários marker', () => {
  const row = rowFrom({
    ...IDA,
    Comentários: '[status:scheduled]\n[fecho:2026-09-21T22:00:00.000Z]\nconsulta',
  });
  const [fromMarker] = mapSheetCsv(toCsv([HEADERS, row]));
  assert.equal(fromMarker.closedAt, '2026-09-21T22:00:00.000Z');
  assert.equal(fromMarker.notes, 'consulta');
  assert.equal(filledLeadFields(fromMarker).some((field) => String(field.value).includes('[fecho:')), false);

  const headers = [...HEADERS, 'Data fecho'];
  const values = [...row, '2026-09-18T09:00:00.000Z'];
  const [fromColumn] = mapSheetCsv(toCsv([headers, values]));
  assert.equal(fromColumn.closedAt, '2026-09-18T09:00:00.000Z');
});

test('close rate by day and week uses Data Contacto and Data fecho', () => {
  const leads = [
    { status: 'scheduled', timestamp: '2026-09-21T10:00:00.000Z', closedAt: '2026-09-21T18:00:00.000Z' },
    { status: 'discarded', timestamp: '2026-09-21T11:00:00.000Z', closedAt: '2026-09-22T11:00:00.000Z' },
    { status: 'new', timestamp: '2026-09-21T12:00:00.000Z' },
    { status: 'processing', timestamp: '2026-09-21T13:00:00.000Z' },
    { status: 'scheduled', timestamp: '2026-09-14T10:00:00.000Z', closedAt: '2026-09-14T10:00:00.000Z' },
  ];
  const days = closeEvolution(leads, 'day');
  const monday = days.find((row) => row.key === '2026-09-21');
  const tuesday = days.find((row) => row.key === '2026-09-22');
  assert.equal(monday.entradas, 4);
  assert.equal(monday.positivo, 1);
  assert.equal(monday.totalFecho, 1);
  assert.equal(monday.positivoPct, 25);
  assert.equal(monday.totalPct, 25);
  assert.equal(tuesday.entradas, 0);
  assert.equal(tuesday.positivo, 0);
  assert.equal(tuesday.totalFecho, 1);
  assert.equal(tuesday.totalPct, null);
  const weeks = closeEvolution(leads, 'week');
  const thisWeek = weeks.find((row) => row.key === '2026-09-21');
  const prevWeek = weeks.find((row) => row.key === '2026-09-14');
  assert.equal(thisWeek.entradas, 4);
  assert.equal(thisWeek.positivo, 1);
  assert.equal(thisWeek.totalFecho, 2);
  assert.equal(thisWeek.totalPct, 50);
  assert.equal(prevWeek.positivo, 1);
  assert.match(thisWeek.label, /21\/09\/2026 a 27\/09\/2026/);
});

test('close window is a Lisbon range of 7, 30, or 90 days', () => {
  const leads = [
    { status: 'scheduled', timestamp: '2026-09-21T10:00:00.000Z', closedAt: '2026-09-21T18:00:00.000Z' },
    { status: 'discarded', timestamp: '2026-09-21T11:00:00.000Z', closedAt: '2026-09-22T11:00:00.000Z' },
    { status: 'new', timestamp: '2026-09-21T12:00:00.000Z' },
    { status: 'processing', timestamp: '2026-09-21T13:00:00.000Z' },
    { status: 'scheduled', timestamp: '2026-09-14T10:00:00.000Z', closedAt: '2026-09-14T10:00:00.000Z' },
  ];
  const now = new Date('2026-09-22T12:00:00.000Z');
  const week = closeWindow(leads, 7, now);
  assert.equal(week.timezone, 'Europe/Lisbon');
  assert.equal(week.grain, 'day');
  assert.equal(week.points.length, 7);
  assert.equal(week.points[0].key, '2026-09-16');
  assert.equal(week.points.at(-1).key, '2026-09-22');
  const monday = week.points.find((point) => point.key === '2026-09-21');
  const tuesday = week.points.find((point) => point.key === '2026-09-22');
  assert.equal(monday.marcacoes, 1);
  assert.equal(monday.fecho, 1);
  assert.equal(tuesday.fecho, 1);
  assert.equal(tuesday.descartadas, 1);
  assert.equal(week.totals.marcacoes, 1);
  assert.equal(week.totals.fecho, 2);
  assert.equal(week.totals.entradas, 4);
  assert.equal(week.totals.marcacoesPct, 25);
  assert.equal(week.totals.fechoPct, 50);
  assert.equal(week.points.some((point) => point.key === '2026-09-14'), false);

  const quarter = closeWindow(leads, 90, now);
  assert.equal(quarter.grain, 'week');
  assert.equal(quarter.weekStartsOn, 'monday');
  assert.ok(quarter.points.length < 20);
  assert.equal(quarter.totals.marcacoes, 2);
  assert.equal(quarter.points[0].key <= '2026-09-14', true);
});

test('lead lists put the newest Data Contacto first', () => {
  const sorted = sortLeadsNewestFirst([
    { id: '2', timestamp: '2026-09-20T10:00:00.000Z', name: 'Antiga' },
    { id: '4', dataContacto: '2026-09-21T10:00:00.000Z', name: 'Mesmo instante, linha menor' },
    { id: '9', timestamp: '2026-09-21T10:00:00.000Z', name: 'Mais recente' },
    { id: '3', timestamp: '2026-09-21T09:00:00.000Z', name: 'Mais cedo no dia' },
    { id: '1', timestamp: '', name: 'Sem data' },
  ]);
  assert.deepEqual(
    sorted.map((lead) => lead.name),
    ['Mais recente', 'Mesmo instante, linha menor', 'Mais cedo no dia', 'Antiga', 'Sem data']
  );
});

test('portuguese sheet dates stay on the contact day', () => {
  const [lead] = mapSheetCsv(
    toCsv([
      ['Data Contacto', 'Nome'],
      ['20/09/2026 18:14', 'Ida Cristina'],
    ])
  );
  const date = new Date(lead.timestamp);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 20);
  assert.equal(lead.contactDay, '2026-09-20');
  assert.equal(contactDayFromText('31/08/2026 23:30'), '2026-08-31');
  assert.equal(contactDayFromText('2026-08-31T23:30:00.000Z'), '2026-09-01');
  assert.equal(contactDayFromText('2026-08-31T22:00:00.000Z'), '2026-08-31');
});

test('app list keeps contact days on or after 2026-09-01 and prefers Data Contacto', () => {
  assert.equal(CONTACT_CUTOFF_DAY, '2026-09-01');
  const leads = mapSheetCsv(
    toCsv([
      ['timestamp', 'Nome', 'Data Contacto'],
      ['2026-09-20T10:00:00.000Z', 'Dentro pelo timestamp e pela data', '2026-09-02'],
      ['2026-09-15T10:00:00.000Z', 'Timestamp novo mas contacto antigo', '2026-08-20'],
      ['2026-09-03T00:30:00.000Z', 'Só timestamp', ''],
      ['2026-08-01T10:00:00.000Z', 'Antes do corte', ''],
      ['', 'Sem data', ''],
      ['2026-08-31T23:30:00.000Z', 'Véspera em UTC já é 1 de Setembro em Lisboa', ''],
      ['2026-09-01', 'Dia do corte', ''],
    ])
  );
  const names = filterLeadsForApp(leads).map((lead) => lead.name);
  assert.deepEqual(names, [
    'Dentro pelo timestamp e pela data',
    'Só timestamp',
    'Véspera em UTC já é 1 de Setembro em Lisboa',
    'Dia do corte',
  ]);
  const preferred = leads.find((lead) => lead.name === 'Timestamp novo mas contacto antigo');
  assert.equal(preferred.contactDay, '2026-08-20');
  assert.equal(filterLeadsForApp([preferred]).length, 0);
});

test('sync key ignores phone punctuation and keeps the Lisbon day', () => {
  assert.equal(
    syncLeadKey({ nome: 'Ana', telefone: '+351 910 000 000', email: 'A@B.pt', contactDay: '2026-09-01' }),
    '351910000000|ana|2026-09-01'
  );
  assert.equal(
    syncLeadKey({ nome: 'Ana', telefone: '', email: 'A@B.pt', contactDay: '2026-09-01' }),
    'a@b.pt|ana|2026-09-01'
  );
});
