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
  assert.equal(patch.fields.find((field) => field.header === 'Legenda').value, 'Em processamento');
});

test('status without a new note does not replace Observações', () => {
  const patch = leadPatchToFields({ status: 'paid', estado: 'PAGO' }, NOW);
  assert.equal(patch.noteSet, false);
  assert.equal(patch.status, 'paid');
  assert.equal(patch.fields.find((field) => field.header === 'Pagamento').value, 'Pago');
  assert.equal(patch.fields.some((field) => field.header === 'Legenda'), false);
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

test('não atendeu marks processing, stamps first contact, and writes Legenda', () => {
  const patch = leadPatchToFields({ status: 'processing', isContacted: true }, NOW);
  assert.equal(patch.status, 'processing');
  assert.equal(patch.noteSet, false);
  assert.equal(patch.fields.find((field) => field.header === 'Legenda').value, 'Em processamento');
  assert.equal(patch.fields.find((field) => field.header === '1º Contacto').ifBlank, true);
  assert.equal(patch.fechoClear, true);
  assert.equal(patch.fields.find((field) => field.header === 'Data fecho').value, '');
});

test('free move Marcada ↔ Em processamento writes only the pipeline columns', () => {
  const back = leadPatchToFields({ status: 'processing' }, NOW);
  assert.equal(back.status, 'processing');
  assert.equal(back.noteSet, false);
  assert.equal(back.motivoSet, false);
  assert.equal(back.fields.find((field) => field.header === 'Legenda').value, 'Em processamento');
  assert.equal(back.fechoClear, true);
  assert.equal(back.fields.find((field) => field.header === 'Data fecho').value, '');
  assert.equal(back.fields.some((field) => field.header === 'Data Primeira Consulta'), false);

  const forward = leadPatchToFields({ status: 'scheduled' }, NOW);
  assert.equal(forward.status, 'scheduled');
  assert.equal(forward.noteSet, false);
  assert.equal(forward.fields.find((field) => field.header === 'Legenda').value, 'Marcada');
  assert.equal(forward.fields.some((field) => field.header === 'Data Primeira Consulta'), false);
  assert.equal(forward.fields.find((field) => field.header === 'Data fecho').ifBlank, true);
  assert.equal(
    mergeObservacoes('[status:processing]\nliguei ontem', {
      status: forward.status,
      note: forward.note,
      noteSet: forward.noteSet,
      fecho: forward.fecho,
      fechoSet: forward.fechoSet,
    }),
    `[status:scheduled]\n[fecho:${NOW.toISOString()}]\nliguei ontem`
  );
});

test('booking writes Legenda Marcada', () => {
  const patch = leadPatchToFields({ status: 'scheduled', appointmentDate: '2026-09-22T10:00' }, NOW);
  assert.equal(patch.fields.find((field) => field.header === 'Legenda').value, 'Marcada');
  assert.equal(patch.fields.find((field) => field.header === 'Data Primeira Consulta').value, '2026-09-22T10:00');
  const fecho = patch.fields.find((field) => field.header === 'Data fecho');
  assert.equal(fecho.value, NOW.toISOString());
  assert.equal(fecho.ifBlank, true);
  assert.equal(patch.fecho, NOW.toISOString());
});

test('discard requires a motivo and stores it beside Legenda', () => {
  assert.throws(() => leadPatchToFields({ status: 'discarded', notes: '   ' }, NOW), /Motivo é obrigatório/);
  const patch = leadPatchToFields({ status: 'discarded', motivo: 'não interessa' }, NOW);
  assert.equal(patch.status, 'discarded');
  assert.equal(patch.motivo, 'não interessa');
  assert.equal(patch.motivoSet, true);
  assert.equal(patch.noteSet, false);
  assert.equal(patch.fields.find((field) => field.header === 'Legenda').value, 'Descartada');
  assert.equal(patch.fields.find((field) => field.header === 'Data fecho').ifBlank, true);
  assert.equal(
    mergeObservacoes('[status:contacted]\nliguei ontem', {
      status: 'discarded',
      note: patch.note,
      noteSet: patch.noteSet,
      motivo: patch.motivo,
      motivoSet: patch.motivoSet,
      fecho: patch.fecho,
      fechoSet: patch.fechoSet,
    }),
    `[status:discarded]\n[motivo:não interessa]\n[fecho:${NOW.toISOString()}]\nliguei ontem`
  );
  assert.equal(
    mergeObservacoes(`[status:discarded]\n[motivo:não interessa]\n[fecho:${NOW.toISOString()}]\nliguei ontem`, {
      status: 'scheduled',
      fecho: '2026-09-22T10:00:00.000Z',
      fechoSet: true,
    }),
    `[status:scheduled]\n[motivo:não interessa]\n[fecho:${NOW.toISOString()}]\nliguei ontem`
  );
});
