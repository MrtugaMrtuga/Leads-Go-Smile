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
  'timestamp',
  'Origem',
  'Nome',
  'Email',
  'Telefone',
  'Data Contacto',
  'Comentários',
  'Estado',
];
const IDA_VALUES = [
  '2026-09-20T17:14:04.000Z',
  'Meta',
  'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
  'cristina.oliveira.consult@gmail.com',
  '351962852158',
  '2026-09-20T17:14:04.000Z',
  '',
  '',
];

function sheetPayload(values = IDA_VALUES, row = 2) {
  return {
    ok: true,
    sheetTab: 'Leads (2024 - 2026)',
    contactCutoff: '2026-09-01',
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
  assert.equal(health.json.sheetTab, 'Leads (2024 - 2026)');
  assert.equal(health.json.contactCutoff, '2026-09-01');
  assert.equal(health.json.contactCutoffTimeZone, 'Europe/Lisbon');
  assert.equal(health.json.host, 'leads.evob.org');
  assert.equal(health.json.configured, false);
  const leads = await call(app, 'GET', '/api/leads');
  assert.deepEqual(leads.json, []);
});

test('listing uses Leads (2024 - 2026) rows on or after the cutoff and ignores leads.json', async () => {
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
    const old = [...IDA_VALUES];
    old[0] = '2026-08-15T10:00:00.000Z';
    old[2] = 'Lead Antiga';
    old[5] = '2026-08-15';
    const stampOnly = [...IDA_VALUES];
    stampOnly[0] = '2026-09-03T00:30:00.000Z';
    stampOnly[2] = 'Só Timestamp';
    stampOnly[5] = '';
    const preferredOld = [...IDA_VALUES];
    preferredOld[0] = '2026-09-20T10:00:00.000Z';
    preferredOld[2] = 'Contacto Antigo';
    preferredOld[5] = '2026-08-20';
    return new Response(JSON.stringify({
      ...sheetPayload(),
      rows: [
        { row: 2, values: IDA_VALUES },
        { row: 3, values: old },
        { row: 4, values: stampOnly },
        { row: 5, values: preferredOld },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await call(app, 'GET', '/api/leads');
    assert.equal(response.status, 200);
    assert.equal(response.json.length, 3);
    assert.deepEqual(
      response.json.map((lead) => lead.name),
      ['Ida Cristina Albuquerque Malho Rodrigues de Oliveira', 'Só Timestamp', 'Contacto Antigo']
    );
    assert.equal(response.json[2].contactDay, '2026-09-20');
    assert.equal(response.json[0].id, '2');
    assert.equal(response.json[0].sourceTab, 'Leads (2024 - 2026)');
    assert.equal(response.json[0].source, 'Meta');
    assert.equal(response.json[0].contactDay, '2026-09-20');
    assert.equal(response.json[1].contactDay, '2026-09-03');
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
  const updated = [...IDA_VALUES];
  updated[6] = '[status:contacted]\nliguei hoje';

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

  // Apps Script runs doPost on the first hop, then 302→echo (GET-only) for the JSON body.
  const first = calls.find((callItem) => callItem.method === 'POST' && String(callItem.url).includes('script.google.com'));
  assert.ok(first);
  const body = JSON.parse(first.body);
  assert.equal(body.action, 'update');
  assert.equal(body.id, '2');
  assert.equal(body.note, 'liguei hoje');
  assert.equal(body.noteSet, true);
  assert.equal(JSON.stringify(body).includes('O que gostaria de melhorar'), false);
  assert.equal(body.secret, undefined);
  const echo = calls.find((callItem) => String(callItem.url).includes('googleusercontent'));
  assert.ok(echo);
  assert.equal(echo.method, 'GET');
  assert.equal(echo.body, undefined);
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

test('não atendeu posts processing and Estado without leaving a secret', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let posted = null;
  const app = createApp();
  const values = [...IDA_VALUES];
  values[6] = '[status:processing]';
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
  assert.equal(posted.fields.find((field) => field.header === 'Estado').value, 'Em processamento');
  assert.equal(posted.fields.some((field) => field.header === '1º Contacto'), false);
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

test('discard with motivo is posted to Estado and Comentários', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let posted = null;
  const app = createApp();
  const values = [...IDA_VALUES];
  values[6] = '[status:discarded]\n[motivo:não interessa]';
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
  assert.equal(posted.fields.find((field) => field.header === 'Estado').value, 'Descartada');
});

test('updates by row id still post when the contact date is before the cutoff', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let posted = null;
  const app = createApp();
  const old = [...IDA_VALUES];
  old[0] = '2026-08-01T10:00:00.000Z';
  old[2] = 'Lead Antiga';
  old[5] = '2026-08-01';
  old[6] = '[status:processing]';
  await withFetch(async (_url, init) => {
    if (init.method === 'POST') posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 9, values: old } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await call(app, 'PATCH', '/api/leads/9', { status: 'processing' });
    assert.equal(response.status, 200);
    assert.equal(response.json.name, 'Lead Antiga');
    assert.equal(response.json.contactDay, '2026-08-01');
    assert.equal(response.json.id, '9');
  });
  assert.equal(posted.action, 'update');
  assert.equal(posted.id, '9');
  assert.equal(posted.status, 'processing');
});

test('sheet rows are not deleted through the API', async () => {
  const app = createApp();
  const response = await call(app, 'DELETE', '/api/leads/2');
  assert.equal(response.status, 405);
});

test('apps script is bound to Leads (2024 - 2026) and the client bundle has no secret', () => {
  const gas = readFileSync(new URL('../backend-gas/Code.gs', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('../backend-gas/SyncDaniel.gs', import.meta.url), 'utf8');
  const syncDoc = readFileSync(new URL('../SYNC-DANIEL-EVOB.md', import.meta.url), 'utf8');
  const client = `${readFileSync(new URL('../api.ts', import.meta.url), 'utf8')}\n${readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')}\n${readFileSync(new URL('../public/pin.js', import.meta.url), 'utf8')}`;
  assert.match(gas, /var SHEET_ID = '1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8'/);
  assert.match(gas, /1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w/);
  assert.doesNotMatch(gas, /var SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w'/);
  assert.match(gas, /var SHEET_TAB = 'Leads \(2024 - 2026\)'/);
  assert.match(gas, /var CONTACT_CUTOFF_DAY = '2026-09-01'/);
  assert.match(gas, /passesContactCutoff_/);
  assert.match(gas, /Comentários/);
  assert.match(gas, /Nº Paciente Definitivo/);
  assert.doesNotMatch(gas, /FORBIDDEN_TAB/);
  assert.doesNotMatch(gas, /var SHEET_TAB = 'Inbound META'/);
  assert.doesNotMatch(gas, /1LMcABX/);
  assert.doesNotMatch(gas, /getSheets\(\)\[0\]/);
  assert.match(sync, /DANIEL_SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w'/);
  assert.match(sync, /appendRow/);
  assert.match(sync, /CONTACT_CUTOFF_DAY/);
  assert.match(sync, /Leads \(2024 - 2026\)/);
  assert.doesNotMatch(sync, /function doGet|function doPost/);
  assert.match(syncDoc, /2026-09-01/);
  assert.match(syncDoc, /append-only|Append-only/);
  assert.match(client, /PIN = '2000'/);
  assert.doesNotMatch(client, /APPS_SCRIPT_SECRET\s*=/);
  assert.doesNotMatch(client, /script\.google\.com/);
});

test('the close chart is in the client source that the production bundle builds', () => {
  const dashboard = readFileSync(new URL('../views/Dashboard.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const dock = readFileSync(new URL('../constants.tsx', import.meta.url), 'utf8');
  const bundledCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const look = readFileSync(new URL('../public/look.css', import.meta.url), 'utf8');
  assert.match(dashboard, /\[7, 30, 90\]/);
  assert.match(dashboard, /\{days\} dias/);
  assert.match(dashboard, /Linha/);
  assert.match(dashboard, /Barras/);
  assert.match(dashboard, /mode === 'line'/);
  assert.match(dashboard, /Marcações/);
  assert.match(dashboard, /Fecho/);
  assert.match(dashboard, /evo-line wood/);
  assert.match(dashboard, /evo-line ink/);
  assert.match(app, /Estatísticas/);
  assert.match(dock, /Inbox/);
  assert.match(dock, /Estatísticas/);
  assert.match(dock, /Marcações/);
  assert.match(bundledCss, /\.evo-line\.ink/);
  assert.match(bundledCss, /stroke: var\(--wood\)/);
  assert.match(bundledCss, /#000000|#000|var\(--ink\)/);
  assert.doesNotMatch(bundledCss, /fill:\s*url\(/);
  assert.match(look, /\.evo-line\.ink/);
  assert.match(look, /\.evo-line\.wood/);
});

test('inbox menu keeps Descartadas and leaves scheduled leads on the dock', () => {
  const inbox = readFileSync(new URL('../views/Inbox.tsx', import.meta.url), 'utf8');
  const dock = readFileSync(new URL('../constants.tsx', import.meta.url), 'utf8');
  assert.match(inbox, />\s*Inbox\s*</);
  assert.match(inbox, />\s*Descartadas\s*</);
  assert.doesNotMatch(inbox, /Agendadas/);
  assert.doesNotMatch(inbox, /Marcadas/);
  assert.match(dock, /label: 'Inbox'/);
  assert.match(dock, /label: 'Estatísticas'/);
  assert.match(dock, /label: 'Marcações'/);
});
