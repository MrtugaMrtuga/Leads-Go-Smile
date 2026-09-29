import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CARLA_EMAIL_TO,
  buildCarlaEmail,
  fillCarlaTemplate,
  projectLead,
  shouldNotifyCarla,
  splitAppointmentDate,
} from './carlaEmail.js';
import { leadFromSheetRow, mergeObservacoes } from './inboundMeta.js';

test('Lisbon date and time split keeps a wall-clock datetime-local and converts instants', () => {
  assert.deepEqual(splitAppointmentDate('2026-09-22T10:00'), { data: '22/09/2026', hora: '10:00' });
  assert.deepEqual(splitAppointmentDate('2026-09-22T10:00:00'), { data: '22/09/2026', hora: '10:00' });
  assert.deepEqual(splitAppointmentDate('2026-09-22'), { data: '22/09/2026', hora: '' });
  assert.deepEqual(splitAppointmentDate('2026-09-22T09:00:00.000Z'), { data: '22/09/2026', hora: '10:00' });
  assert.deepEqual(splitAppointmentDate('2026-01-15T10:30:00.000Z'), { data: '15/01/2026', hora: '10:30' });
  assert.deepEqual(splitAppointmentDate('22/09/2026 15:05'), { data: '22/09/2026', hora: '15:05' });
  assert.deepEqual(splitAppointmentDate(''), { data: '', hora: '' });
});

test('HTML fill uses the locked Carla template and escapes values', () => {
  const template = readFileSync(new URL('../templates/email-carla-marcacao.html', import.meta.url), 'utf8');
  assert.match(template, /ALERTA · Nova 1ª consulta/);
  assert.match(template, /<strong style="font-weight:700;">Acção:<\/strong> Agendar o paciente · confirmar a ida com o paciente no dia anterior\./);
  assert.doesNotMatch(template, /meter na agenda/i);
  assert.match(template, /Automático · Leads · leads\.evob\.org/);
  assert.ok(template.indexOf('Acção:') < template.indexOf('<strong>Nome:</strong>'));
  assert.doesNotMatch(template, /Olá|Obrigado|por favor|abraço|Carla, nova marcação/);
  assert.match(template, /background-color:#e0c8a8/);
  assert.match(template, /background-color:#fff7ed/);
  assert.doesNotMatch(template, /background:/);

  const message = buildCarlaEmail(
    {
      name: 'Ana <Silva>',
      phone: '351910000000',
      email: 'ana@example.com',
      appointmentDate: '2026-09-22T10:00',
      doctor: 'Bruno Aires',
      source: 'META',
    },
    template
  );
  assert.equal(message.to, CARLA_EMAIL_TO);
  assert.equal(message.subject, 'ALERTA · Nova 1ª consulta — Ana <Silva> — 22/09/2026');
  assert.doesNotMatch(message.html, /Olá|Obrigado|por favor|abraço|Carla, nova marcação/);
  assert.equal(message.html.includes('{{'), false);
  assert.match(message.html, /Ana &lt;Silva&gt;/);
  assert.match(message.html, /351910000000/);
  assert.match(message.html, /ana@example.com/);
  assert.match(message.html, /22\/09\/2026 · 10:00/);
  assert.match(message.html, /Bruno Aires/);
  assert.match(message.html, /META/);
  assert.match(message.html, /Agendar o paciente · confirmar a ida com o paciente no dia anterior\./);
  assert.doesNotMatch(message.html, /meter na agenda/i);
  assert.ok(message.html.indexOf('Acção:') < message.html.indexOf('Ana &lt;Silva&gt;'));
  assert.equal(fillCarlaTemplate('{{nome}}', { nome: 'A & B' }), 'A &amp; B');
  assert.doesNotMatch(message.html, /Notas:/);
});

test('Vanessa notes are a field, and a blank note omits the Notas line', () => {
  const template = readFileSync(new URL('../templates/email-carla-marcacao.html', import.meta.url), 'utf8');
  const withNotes = buildCarlaEmail(
    {
      name: 'Manuel Cunha',
      phone: '351910000000',
      email: 'manuel@example.com',
      appointmentDate: '2026-09-22T18:30',
      doctor: 'Bruno Aires',
      source: 'META',
      notes: 'Ligar seg depois das 18:30',
    },
    template
  );
  assert.equal(withNotes.subject, 'ALERTA · Nova 1ª consulta — Manuel Cunha — 22/09/2026');
  assert.match(withNotes.html, /Agendar o paciente · confirmar a ida com o paciente no dia anterior\./);
  assert.match(withNotes.html, /<strong>Notas:<\/strong> Ligar seg depois das 18:30/);
  assert.ok(withNotes.html.indexOf('<strong>Origem:</strong>') < withNotes.html.indexOf('<strong>Notas:</strong>'));
  assert.doesNotMatch(withNotes.html, /meter na agenda/i);

  const blank = buildCarlaEmail(
    {
      name: 'Manuel Cunha',
      appointmentDate: '2026-09-22T18:30',
      notes: '   ',
    },
    template
  );
  assert.doesNotMatch(blank.html, /Notas:/);
  assert.doesNotMatch(blank.html, /\{\{notas\}\}/);
  assert.equal(blank.html.includes('{{'), false);

  const marked = buildCarlaEmail(
    {
      name: 'Manuel Cunha',
      appointmentDate: '2026-09-22T18:30',
      notes: '[status:scheduled]\n[carla-email:sent]\nLigar seg depois das 18:30',
    },
    template
  );
  assert.match(marked.html, /<strong>Notas:<\/strong> Ligar seg depois das 18:30/);
  assert.doesNotMatch(marked.html, /carla-email|\[status:/);

  const escaped = buildCarlaEmail(
    { name: 'Manuel Cunha', appointmentDate: '2026-09-22T18:30', notes: 'A & B <c>' },
    template
  );
  assert.match(escaped.html, /<strong>Notas:<\/strong> A &amp; B &lt;c&gt;/);

  const kept = projectLead(
    { name: 'Manuel Cunha', status: 'processing', notes: 'Ligar seg depois das 18:30', carlaEmailSent: false },
    { status: 'scheduled', appointmentDate: '2026-09-22T18:30', notes: '' }
  );
  assert.equal(kept.notes, 'Ligar seg depois das 18:30');
  assert.match(buildCarlaEmail(kept, template).html, /<strong>Notas:<\/strong> Ligar seg depois das 18:30/);
});

test('Carla mail fires once when scheduled with a date, and not without one', () => {
  const fresh = { status: 'processing', appointmentDate: '', name: 'Ana', carlaEmailSent: false };
  const booked = projectLead(fresh, {
    status: 'scheduled',
    appointmentDate: '2026-09-22T10:00',
    doctor: 'Bruno Aires',
  });
  assert.equal(shouldNotifyCarla(fresh, booked), true);

  const noDate = projectLead(fresh, { status: 'scheduled' });
  assert.equal(String(noDate.appointmentDate || '').trim(), '');
  assert.equal(shouldNotifyCarla(fresh, noDate), false);

  const later = projectLead(
    { status: 'scheduled', appointmentDate: '', name: 'Ana', carlaEmailSent: false },
    { appointmentDate: '2026-09-23T15:30' }
  );
  assert.equal(later.status, 'scheduled');
  assert.equal(shouldNotifyCarla({ status: 'scheduled', appointmentDate: '', carlaEmailSent: false }, later), true);
});

test('Carla mail does not fire again after the marker, even if the date changes', () => {
  const sent = {
    status: 'scheduled',
    appointmentDate: '2026-09-22T10:00',
    name: 'Ana',
    carlaEmailSent: true,
    notes: 'consulta',
  };
  const moved = projectLead(sent, { appointmentDate: '2026-10-01T09:00' });
  assert.equal(moved.carlaEmailSent, true);
  assert.equal(shouldNotifyCarla(sent, moved), false);

  const fromNotes = {
    status: 'scheduled',
    appointmentDate: '2026-09-22T10:00',
    notes: '[status:scheduled]\n[carla-email:sent]\nconsulta',
  };
  assert.equal(shouldNotifyCarla(fromNotes, projectLead(fromNotes, { doctor: 'Nia' })), false);
});

test('the sheet marker stays out of the visible note and survives a later edit', () => {
  const lead = leadFromSheetRow(
    ['Nome', 'Comentários', 'Estado', 'Data Primeira Consulta'],
    ['Ana', '[status:scheduled]\n[carla-email:sent]\nconsulta', 'Marcada', '2026-09-22T10:00'],
    4
  );
  assert.equal(lead.carlaEmailSent, true);
  assert.equal(lead.status, 'scheduled');
  assert.equal(lead.notes, 'consulta');
  assert.equal(lead.formFields.some((field) => String(field.value).includes('carla-email')), false);
  assert.equal(
    mergeObservacoes('[status:scheduled]\n[fecho:2026-09-21T22:00:00.000Z]\n[carla-email:sent]\nconsulta', {
      status: 'scheduled',
      note: 'nova nota',
      noteSet: true,
    }),
    '[status:scheduled]\n[fecho:2026-09-21T22:00:00.000Z]\n[carla-email:sent]\nnova nota'
  );
});

test('Apps Script sends with MailApp to Carla and stamps the marker only after send', () => {
  const gas = readFileSync(new URL('../backend-gas/Code.gs', import.meta.url), 'utf8');
  assert.match(gas, /MailApp\.sendEmail/);
  assert.match(gas, /to: CARLA_EMAIL_TO/);
  assert.match(gas, /var CARLA_EMAIL_TO = 'geral@gosmile\.pt'/);
  assert.match(gas, /\[carla-email:sent\]/);
  assert.match(gas, /function authorizeCarlaMail/);
  assert.doesNotMatch(gas, /service_account|private_key|cloud-platform/);
  const gate = gas.slice(gas.indexOf('function maybeSendCarlaEmail_'), gas.indexOf('function authorizeCarlaMail'));
  assert.ok(gate.indexOf('sendCarlaEmail_') < gate.indexOf('stampCarlaSent_'));
  assert.match(gate, /lead\.status !== 'scheduled'/);
  assert.match(gate, /carlaEmailSent/);
});
