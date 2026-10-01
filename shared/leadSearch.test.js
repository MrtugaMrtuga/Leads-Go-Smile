import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { filterListedLeads, leadMatchesQuery } from './leadSearch.js';

const ana = {
  id: '1',
  name: 'Ana Silva',
  phone: '912345678',
  email: 'ana.silva@gosmile.pt',
  source: 'Instagram',
  status: 'new',
  notes: 'quer branqueamento',
  formFields: [{ key: 'cidade', label: 'Cidade', value: 'Coimbra' }],
};

const joao = {
  id: '2',
  name: 'João Mendes',
  phone: '+351 934 000 111',
  email: 'joao@example.pt',
  source: 'Site',
  status: 'processing',
  doctor: 'Bruno Aires',
  notes: 'ligar à tarde',
};

const discarded = {
  id: '3',
  name: 'Rita Costa',
  phone: '211234567',
  status: 'discarded',
  discardReason: 'não interessa',
  source: 'Indicação',
};

test('an empty search keeps every lead', () => {
  assert.equal(leadMatchesQuery(ana, ''), true);
  assert.equal(leadMatchesQuery(ana, '   '), true);
  assert.equal(leadMatchesQuery(joao, '\n'), true);
});

test('search matches name, ignoring case and accents', () => {
  assert.equal(leadMatchesQuery(joao, 'joao'), true);
  assert.equal(leadMatchesQuery(joao, 'JOÃO'), true);
  assert.equal(leadMatchesQuery(joao, 'mendes'), true);
  assert.equal(leadMatchesQuery(ana, 'joao'), false);
});

test('search matches the phone as shown and as digits', () => {
  assert.equal(leadMatchesQuery(ana, '912 345 678'), true);
  assert.equal(leadMatchesQuery(ana, '912345678'), true);
  assert.equal(leadMatchesQuery(ana, '+351 912 345 678'), true);
  assert.equal(leadMatchesQuery(ana, '351912345678'), true);
  assert.equal(leadMatchesQuery(ana, '934000111'), false);
  assert.equal(leadMatchesQuery(joao, '934 000 111'), true);
  assert.equal(leadMatchesQuery(joao, '934000111'), true);
});

test('search matches other visible fields', () => {
  assert.equal(leadMatchesQuery(ana, 'instagram'), true);
  assert.equal(leadMatchesQuery(ana, 'ana.silva@gosmile.pt'), true);
  assert.equal(leadMatchesQuery(ana, 'branqueamento'), true);
  assert.equal(leadMatchesQuery(ana, 'coimbra'), true);
  assert.equal(leadMatchesQuery(ana, 'cidade'), true);
  assert.equal(leadMatchesQuery(joao, 'aires'), true);
  assert.equal(leadMatchesQuery(joao, 'processamento'), true);
  assert.equal(leadMatchesQuery(ana, 'novo'), true);
  assert.equal(leadMatchesQuery(discarded, 'nao interessa'), true);
  assert.equal(leadMatchesQuery(discarded, 'descartada'), true);
  assert.equal(leadMatchesQuery(ana, 'rita'), false);
});

test('the inbox search filters the current list and restores it when cleared', () => {
  const leads = [ana, joao, discarded];
  assert.deepEqual(filterListedLeads(leads, 'inbox', '').map((lead) => lead.id), ['1', '2']);
  assert.deepEqual(filterListedLeads(leads, 'inbox', '   ').map((lead) => lead.id), ['1', '2']);
  assert.deepEqual(filterListedLeads(leads, 'inbox', 'joao').map((lead) => lead.id), ['2']);
  assert.deepEqual(filterListedLeads(leads, 'inbox', 'rita').map((lead) => lead.id), []);
  assert.deepEqual(filterListedLeads(leads, 'descartadas', 'rita').map((lead) => lead.id), ['3']);
  assert.deepEqual(filterListedLeads(leads, 'descartadas', '').map((lead) => lead.id), ['3']);
});

test('the first page exposes the search field above the inbox list', () => {
  const inbox = readFileSync(new URL('../views/Inbox.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const look = readFileSync(new URL('../public/look.css', import.meta.url), 'utf8');
  assert.match(inbox, /filterListedLeads/);
  assert.match(inbox, /sortLeadsNewestFirst\(filterListedLeads/);
  assert.match(inbox, /placeholder="Pesquisar"/);
  assert.match(inbox, /type="search"/);
  assert.match(inbox, /aria-label="Pesquisar leads"/);
  assert.match(inbox, /Limpar pesquisa/);
  assert.match(inbox, /Nenhuma lead corresponde à pesquisa\./);
  assert.match(inbox, /role="search"/);
  assert.match(css, /\.lead-search-input/);
  assert.match(look, /\.lead-search-input/);
});
