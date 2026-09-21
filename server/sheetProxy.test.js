import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const dataDir = await mkdtemp(join(tmpdir(), 'leads-sheet-'));
process.env.LEADS_DATA_DIR = dataDir;
process.env.EVAULT_NO_LISTEN = '1';
process.env.APPS_SCRIPT_URL = '';
process.env.APPS_SCRIPT_SECRET = '';

const { createApp } = await import('./index.js');

const SECRET = 'mini-only-secret-value';
const HEADERS = [
  'Data Contacto',
  'Nome Paciente',
  'Telefone',
  'E-mail',
  'O que gostaria de melhorar no seu sorriso?',
  'Observações',
];
const IDA_VALUES = [
  '2026-09-20T17:14:04.000Z',
  'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
  '351962852158',
  'cristina.oliveira.consult@gmail.com',
  'substituir_dentes_em_falta',
  '',
];

function sheetPayload(values = IDA_VALUES, row = 2) {
  return {
    ok: true,
    sheetTab: 'Inbound META',
    headers: HEADERS,
    rows: [{ row, values }],
    leads: [],
  };
}

async function withFetch(impl, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

function call(app, method, path, body) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    const fail = (error) => {
      server.close(() => reject(error));
    };
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
            let json = null;
            if (text) json = JSON.parse(text);
            resolve({ status: res.statusCode, text, json });
          });
        });
      }
    );
    req.on('error', fail);
    if (body) req.write(JSON.stringify(body));
    req.end();
    });
  });
}

test('health reports the sheet proxy and an unconfigured Mini stays empty', async () => {
  process.env.APPS_SCRIPT_URL = '';
  process.env.APPS_SCRIPT_SECRET = '';
  const app = createApp();
  const health = await call(app, 'GET', '/api/health');
  assert.equal(health.json.storage, 'apps-script');
  assert.equal(health.json.sheetId, '1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8');
  assert.equal(health.json.sheetTab, 'Inbound META');
  assert.equal(health.json.host, 'leads.evob.org');
  assert.equal(health.json.configured, false);
  const leads = await call(app, 'GET', '/api/leads');
  assert.deepEqual(leads.json, []);
  const stats = await call(app, 'GET', '/api/stats');
  assert.equal(stats.status, 200);
  assert.equal(stats.json.total, 0);
  assert.equal(stats.json.timezone, 'Europe/Lisbon');
  assert.equal(stats.json.weekStartsOn, 'monday');
  assert.deepEqual(stats.json.day, []);
  assert.deepEqual(stats.json.week, []);
});

test('listing uses Inbound META rows and ignores leads.json', async () => {
  await writeFile(
    join(dataDir, 'leads.json'),
    `${JSON.stringify([{ id: '1106', name: 'Ana Rita Costa', phone: '351912334455' }])}\n`
  );
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const calls = [];
  const app = createApp();

  await withFetch(async (url, init) => {
    calls.push({ url: String(url), method: init.method, redirect: init.redirect });
    return new Response(JSON.stringify(sheetPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await call(app, 'GET', '/api/leads');
    assert.equal(response.status, 200);
    assert.equal(response.json.length, 1);
    assert.equal(response.json[0].name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
    assert.equal(response.json[0].id, '2');
    assert.equal(response.json[0].sourceTab, 'Inbound META');
    assert.equal(
      response.json[0].formFields.some((field) => field.label === 'O que gostaria de melhorar no seu sorriso?'),
      true
    );
    assert.equal(JSON.stringify(response.json).includes('Ana Rita'), false);
    assert.equal(response.text.includes(SECRET), false);
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp(`secret=${SECRET}`));
  const wiped = JSON.parse(await readFile(join(dataDir, 'leads.json'), 'utf8'));
  assert.deepEqual(wiped, []);
});

test('CRM patch is posted to Apps Script and keeps the secret off the response', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const calls = [];
  const app = createApp();
  const updated = [
    '2026-09-20T17:14:04.000Z',
    'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
    '351962852158',
    'cristina.oliveira.consult@gmail.com',
    'substituir_dentes_em_falta',
    '[status:contacted]\nliguei hoje',
  ];

  await withFetch(async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body, redirect: init.redirect });
    if (!String(url).includes('googleusercontent')) {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://script.googleusercontent.com/macros/echo?user_content_key=abc' },
      });
    }
    return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 2, values: updated } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await call(app, 'PATCH', '/api/leads/2', {
      status: 'contacted',
      notes: 'liguei hoje',
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.notes, 'liguei hoje');
    assert.equal(response.json.status, 'contacted');
    assert.equal(response.text.includes(SECRET), false);
    assert.equal(response.json.formFields.some((field) => String(field.value).includes('[status:')), false);
  });

  const post = calls.find((callItem) => callItem.method === 'POST' && String(callItem.url).includes('googleusercontent'));
  assert.ok(post);
  const body = JSON.parse(post.body);
  assert.equal(body.action, 'update');
  assert.equal(body.id, '2');
  assert.equal(body.note, 'liguei hoje');
  assert.equal(body.noteSet, true);
  assert.equal(JSON.stringify(body).includes('O que gostaria de melhorar'), false);
  assert.equal(body.secret, undefined);
});

test('marking paid writes Pagamento and keeps the existing note', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let posted = null;
  const app = createApp();
  await withFetch(async (url, init) => {
    if (init.method === 'POST') posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 2, values: IDA_VALUES } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await call(app, 'PATCH', '/api/leads/2', { status: 'paid', estado: 'PAGO' });
    assert.equal(response.status, 200);
  });
  assert.equal(posted.noteSet, false);
  assert.equal(posted.status, 'paid');
  assert.equal(posted.fields.find((field) => field.header === 'Pagamento').value, 'Pago');
});

test('não atendeu posts processing and Legenda without leaving a secret', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let posted = null;
  const app = createApp();
  const values = [...IDA_VALUES];
  values[5] = '[status:processing]';
  await withFetch(async (_url, init) => {
    if (init.method === 'POST') posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 2, values } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await call(app, 'PATCH', '/api/leads/2', { status: 'processing', isContacted: true });
    assert.equal(response.status, 200);
    assert.equal(response.json.status, 'processing');
    assert.equal(response.text.includes(SECRET), false);
  });
  assert.equal(posted.status, 'processing');
  assert.equal(posted.fields.find((field) => field.header === 'Legenda').value, 'Em processamento');
  assert.equal(posted.fields.find((field) => field.header === '1º Contacto').ifBlank, true);
});

test('discard without motivo is rejected before the sheet write', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let called = false;
  const app = createApp();
  await withFetch(async () => {
    called = true;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const response = await call(app, 'PATCH', '/api/leads/2', { status: 'discarded', notes: '   ' });
    assert.equal(response.status, 400);
    assert.match(response.json.error, /Motivo/);
  });
  assert.equal(called, false);
});

test('discard with motivo is posted to Legenda and Observações', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let posted = null;
  const app = createApp();
  const values = [...IDA_VALUES];
  values[5] = '[status:discarded]\n[motivo:não interessa]';
  await withFetch(async (_url, init) => {
    if (init.method === 'POST') posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 2, values } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await call(app, 'PATCH', '/api/leads/2', { status: 'discarded', motivo: 'não interessa' });
    assert.equal(response.status, 200);
    assert.equal(response.json.status, 'discarded');
    assert.equal(response.json.discardReason, 'não interessa');
    assert.equal(response.json.formFields.some((field) => String(field.value).includes('[motivo:')), false);
  });
  assert.equal(posted.motivo, 'não interessa');
  assert.equal(posted.motivoSet, true);
  assert.equal(posted.fields.find((field) => field.header === 'Legenda').value, 'Descartada');
});

test('sheet rows are not deleted through the API', async () => {
  const app = createApp();
  const response = await call(app, 'DELETE', '/api/leads/2');
  assert.equal(response.status, 405);
});

test('GET /api/stats aggregates every sheet lead with day and week close rates', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const app = createApp();
  await withFetch(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        leads: [
          { id: '2', name: 'Ana', status: 'scheduled', timestamp: '2026-09-21T10:00:00.000Z', closedAt: '2026-09-21T18:00:00.000Z' },
          { id: '3', name: 'Bia', status: 'discarded', timestamp: '2026-09-21T11:00:00.000Z', closedAt: '2026-09-22T11:00:00.000Z' },
          { id: '4', name: 'Cia', status: 'processing', timestamp: '2026-09-21T13:00:00.000Z' },
          { id: '5', name: 'Dia', status: 'new', timestamp: '2026-09-21T12:00:00.000Z' },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }, async () => {
    const response = await call(app, 'GET', '/api/stats');
    assert.equal(response.status, 200);
    assert.equal(response.json.sheetId, '1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8');
    assert.equal(response.json.sheetTab, 'Inbound META');
    assert.equal(response.json.total, 4);
    const byLabel = Object.fromEntries(response.json.buckets.map((row) => [row.label, row]));
    assert.equal(byLabel.Total.count, 4);
    assert.equal(byLabel.Total.pct, 100);
    assert.equal(byLabel.Descartadas.count, 1);
    assert.equal(byLabel.Descartadas.pct, 25);
    assert.equal(byLabel.Marcadas.count, 1);
    assert.equal(byLabel.Marcadas.pct, 25);
    assert.equal(byLabel['Em processamento'].count, 1);
    assert.equal(byLabel['Em processamento'].pct, 25);
    assert.equal(byLabel.Novas.count, 1);
    const monday = response.json.day.find((row) => row.key === '2026-09-21');
    const tuesday = response.json.day.find((row) => row.key === '2026-09-22');
    assert.equal(monday.entradas, 4);
    assert.equal(monday.positivo, 1);
    assert.equal(monday.totalFecho, 1);
    assert.equal(monday.positivoPct, 25);
    assert.equal(tuesday.entradas, 0);
    assert.equal(tuesday.totalFecho, 1);
    assert.equal(tuesday.totalPct, null);
    const week = response.json.week.find((row) => row.key === '2026-09-21');
    assert.equal(week.positivo, 1);
    assert.equal(week.totalFecho, 2);
    assert.equal(week.totalPct, 50);
  });
});

test('apps script is bound to Inbound META and the client bundle has no secret', () => {
  const gas = readFileSync(new URL('../backend-gas/Code.gs', import.meta.url), 'utf8');
  const client = [
    '../api.ts',
    '../App.tsx',
    '../constants.tsx',
    '../views/Dashboard.tsx',
    '../views/Inbox.tsx',
    '../public/pin.js',
    '../index.css',
  ]
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');
  const server = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(gas, /1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8/);
  assert.doesNotMatch(gas, /1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w/);
  assert.match(gas, /Inbound META/);
  assert.match(gas, /Leads \(2024 - 2026\)/);
  assert.doesNotMatch(gas, /1LMcABX/);
  assert.doesNotMatch(gas, /getSheets\(\)\[0\]/);
  assert.match(client, /PIN = '2000'/);
  assert.match(client, /Estatísticas/);
  assert.match(client, /fetchStats/);
  assert.match(client, /\/api\/stats/);
  assert.match(client, /Não atendeu/);
  assert.match(client, /Confirmar descarte/);
  assert.match(client, /Fecho positivo/);
  assert.match(client, /Fecho total/);
  assert.match(client, /chart-bar positivo/);
  assert.match(server, /api\.get\('\/stats'/);
  assert.doesNotMatch(client, /APPS_SCRIPT_SECRET\s*=/);
  assert.doesNotMatch(client, /script\.google\.com/);
  assert.doesNotMatch(client, /1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w/);
});
