import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeObservacoes } from './inboundMeta.js';
import { leadPatchToFields } from './sheetWrite.js';

const NOW = new Date('2026-09-21T22:00:00.000Z');

test('patch maps notes and status onto existing CRM columns only', () => {
  const patch = leadPatchToFields(
    { status: 'contacted', notes: 'liguei hoje', doctor: 'Bruno Aires' },
    NOW
  );
  assert.equal(patch.noteSet, true);
  assert.equal(patch.note, 'liguei hoje');
  assert.equal(patch.status, 'contacted');
  const headers = patch.fields.map((field) => field.header);
  assert.ok(headers.includes('Médico Orçamento Médico Tratamento'));
  assert.ok(headers.includes('1º Contacto'));
  assert.equal(headers.includes('O que gostaria de melhorar no seu sorriso?'), false);
  assert.equal(headers.includes('Observações'), false);
  const contact = patch.fields.find((field) => field.header === '1º Contacto');
  assert.equal(contact.ifBlank, true);
  assert.equal(contact.value, NOW.toISOString());
});

test('status without a new note does not replace Observações', () => {
  const patch = leadPatchToFields({ status: 'paid', estado: 'PAGO' }, NOW);
  assert.equal(patch.noteSet, false);
  assert.equal(patch.status, 'paid');
  assert.equal(patch.fields.find((field) => field.header === 'Pagamento').value, 'Pago');
});

test('unknown and meta columns are dropped; explicit CRM keys pass', () => {
  const patch = leadPatchToFields({
    fields: {
      Descartadas: 'x',
      'O que gostaria de melhorar no seu sorriso?': 'branquear_dentes',
      'Nº paciente': '42',
      'Observações#2': 'nota final',
    },
  });
  const headers = patch.fields.map((field) => `${field.header}#${field.occurrence}`);
  assert.deepEqual(headers, ['Nº paciente#1', 'Observações#2']);
  assert.equal(patch.noteSet, false);
});

test('merge keeps the previous note when the UI only changes status', () => {
  assert.equal(
    mergeObservacoes('[status:scheduled]\nconsulta marcada', {
      status: 'paid',
      note: '',
      noteSet: false,
    }),
    '[status:paid]\nconsulta marcada'
  );
});
