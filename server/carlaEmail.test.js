import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dataDir = await mkdtemp(join(tmpdir(), 'leads-carla-'));
process.env.LEADS_DATA_DIR = dataDir;
process.env.EVAULT_NO_LISTEN = '1';
process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
process.env.APPS_SCRIPT_SECRET = 'mini-only-secret-value';

const { createApp } = await import('./index.js');
const { clearLeadsListCache } = await import('./sheetClient.js');

const HEADERS = [
  '4',
  'Origem',
  'Nome',
  'Email',
  'Telefone',
  'Data Contacto',
  'Comentários',
  'Estado',
  'Data Primeira Consulta',
  'Médico',
];

function call(app, method, path, body) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    server.once('listening', () => {
      const { port } = server.address();
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: body ? { 'content-type': 'application/json' } : {},
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            server.close(() => {
              const text = Buffer.concat(chunks).toString('utf8');
              resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null });
            });
          });
        }
      );
      req.on('error', (error) => server.close(() => reject(error)));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

function sheetState(seed = {}) {
  return {
    name: 'Ida Cristina',
    phone: '351962852158',
    email: 'ida@example.com',
    source: 'Meta',
    status: '',
    note: '',
    estado: '',
    appointmentDate: '',
    doctor: '',
    sent: false,
    ...seed,
  };
}

function valuesFor(state) {
  const lines = [];
  if (state.status) lines.push(`[status:${state.status}]`);
  if (state.sent) lines.push('[carla-email:sent]');
  if (state.note) lines.push(state.note);
  return [
    '2026-09-20T17:14:04.000Z',
    state.source,
    state.name,
    state.email,
    state.phone,
    '2026-09-20T17:14:04.000Z',
    lines.join('\n'),
    state.estado,
    state.appointmentDate,
    state.doctor,
  ];
}

function payload(state) {
  return {
    ok: true,
    headers: HEADERS,
    rows: [{ row: 2, values: valuesFor(state) }],
    row: { row: 2, values: valuesFor(state) },
    leads: [],
  };
}

async function withSheet(seed, fn) {
  const state = sheetState(seed);
  const posts = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      posts.push(body);
      if (body.status) state.status = body.status;
      const date = (body.fields || []).find((field) => field.header === 'Data Primeira Consulta');
      if (date) state.appointmentDate = date.value;
      const doctor = (body.fields || []).find((field) => field.header === 'Médico');
      if (doctor) state.doctor = doctor.value;
      if (body.noteSet) state.note = body.note || '';
      if (body.status === 'scheduled') state.estado = 'Marcada';
      const wantsMail = Boolean(body.carlaEmail);
      const dated = String(state.appointmentDate || '').trim() !== '';
      if (wantsMail && !state.sent && state.status === 'scheduled' && dated) state.sent = true;
    }
    return new Response(JSON.stringify(payload(state)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    return await fn(posts);
  } finally {
    globalThis.fetch = previous;
  }
}

test('PATCH scheduled with a date asks Apps Script to email Carla once', async () => {
  await clearLeadsListCache();
  const app = createApp();
  await withSheet({}, async (posts) => {
    const first = await call(app, 'PATCH', '/api/leads/2', {
      status: 'scheduled',
      appointmentDate: '2026-09-22T10:00',
      doctor: 'Bruno Aires',
    });
    assert.equal(first.status, 200);
    assert.equal(first.json.status, 'scheduled');
    assert.equal(first.json.carlaEmailSent, true);
    assert.equal(first.json.notes.includes('carla-email'), false);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].carlaEmail.to, 'geral@gosmile.pt');
    assert.equal(posts[0].carlaEmail.subject, 'ALERTA · Nova 1ª consulta — Ida Cristina — 22/09/2026');
    assert.match(posts[0].carlaEmail.html, /Agendar o paciente · confirmar a ida com o paciente no dia anterior\./);
    assert.doesNotMatch(posts[0].carlaEmail.html, /meter na agenda/i);
    assert.doesNotMatch(posts[0].carlaEmail.html, /Olá|Obrigado|por favor|abraço|Carla, nova marcação/);
    assert.match(posts[0].carlaEmail.html, /Ida Cristina/);
    assert.match(posts[0].carlaEmail.html, /22\/09\/2026 · 10:00/);
    assert.match(posts[0].carlaEmail.html, /Bruno Aires/);
    assert.match(posts[0].carlaEmail.html, /Meta/);
    assert.doesNotMatch(posts[0].carlaEmail.html, /Notas:/);
    assert.equal(posts[0].carlaEmail.html.includes('{{'), false);

    const second = await call(app, 'PATCH', '/api/leads/2', {
      appointmentDate: '2026-10-01T09:30',
      doctor: 'Nia',
    });
    assert.equal(second.status, 200);
    assert.equal(posts.length, 2);
    assert.equal(posts[1].carlaEmail, undefined);
    assert.equal(second.json.carlaEmailSent, true);
  });
});

test('PATCH scheduled without a date does not email Carla', async () => {
  await clearLeadsListCache();
  const app = createApp();
  await withSheet({ status: 'processing', estado: 'Em processamento' }, async (posts) => {
    const response = await call(app, 'PATCH', '/api/leads/2', { status: 'scheduled' });
    assert.equal(response.status, 200);
    assert.equal(response.json.appointmentDate, '');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].carlaEmail, undefined);
    assert.equal(response.json.carlaEmailSent, false);
  });
});

test('a date added to an already scheduled lead emails once, and a sent lead does not', async () => {
  await clearLeadsListCache();
  const app = createApp();
  await withSheet(
    { status: 'scheduled', estado: 'Marcada', appointmentDate: '', note: 'Ligar seg depois das 18:30' },
    async (posts) => {
      const dated = await call(app, 'PATCH', '/api/leads/2', {
        appointmentDate: '2026-09-22T16:00',
        notes: '',
      });
      assert.equal(dated.status, 200);
      assert.equal(posts[0].carlaEmail.to, 'geral@gosmile.pt');
      assert.match(posts[0].carlaEmail.subject, /22\/09\/2026$/);
      assert.match(posts[0].carlaEmail.html, /16:00/);
      assert.match(posts[0].carlaEmail.html, /<strong>Notas:<\/strong> Ligar seg depois das 18:30/);
      assert.doesNotMatch(posts[0].carlaEmail.html, /meter na agenda/i);
    }
  );

  await clearLeadsListCache();
  await withSheet(
    {
      status: 'scheduled',
      estado: 'Marcada',
      appointmentDate: '2026-09-22T10:00',
      doctor: 'Bruno Aires',
      sent: true,
      note: 'consulta',
    },
    async (posts) => {
      const response = await call(app, 'PATCH', '/api/leads/2', { doctor: 'Nia' });
      assert.equal(response.status, 200);
      assert.equal(response.json.carlaEmailSent, true);
      assert.equal(response.json.notes, 'consulta');
      assert.equal(posts.length, 1);
      assert.equal(posts[0].carlaEmail, undefined);
    }
  );
});
