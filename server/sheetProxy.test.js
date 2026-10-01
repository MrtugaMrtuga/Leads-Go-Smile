import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const dataDir = await mkdtemp(join(tmpdir(), 'leads-sheet-'));
process.env.LEADS_DATA_DIR = dataDir;
process.env.EVAULT_NO_LISTEN = '1';
process.env.APPS_SCRIPT_URL = '';
process.env.APPS_SCRIPT_SECRET = '';

const { createApp } = await import('./index.js');
const { clearLeadsListCache } = await import('./sheetClient.js');

const SECRET = 'mini-only-secret-value';
const HEADERS = [
  '4',
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
    sheetRead: 'tail',
    gasCache: 'miss',
    readMs: 1,
    readRows: 1,
    scannedRows: 40,
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
            resolve({ status: res.statusCode, text, json, headers: res.headers });
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
    const crmSeptember = [...IDA_VALUES];
    crmSeptember[0] = '2024-10-03 22:15:37';
    crmSeptember[2] = 'CRM Setembro';
    crmSeptember[5] = '02.09.26 - 9h';
    return new Response(JSON.stringify({
      ...sheetPayload(),
      rows: [
        { row: 2, values: IDA_VALUES },
        { row: 3, values: old },
        { row: 4, values: stampOnly },
        { row: 5, values: preferredOld },
        { row: 6, values: crmSeptember },
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

test('empty notes are not posted as a wipe, and an explicit clear is', async () => {
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const posted = [];
  const app = createApp();
  await withFetch(async (_url, init) => {
    if (init?.method === 'POST') posted.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 2, values: IDA_VALUES } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const kept = await call(app, 'PATCH', '/api/leads/2', { status: 'contacted', notes: '' });
    assert.equal(kept.status, 200);
    const wiped = await call(app, 'PATCH', '/api/leads/2', { status: 'contacted', notes: '', noteClear: true });
    assert.equal(wiped.status, 200);
    const appended = await call(app, 'PATCH', '/api/leads/2', {
      status: 'contacted',
      notes: 'FALTOU',
      noteAppend: true,
    });
    assert.equal(appended.status, 200);
  });
  assert.equal(posted[0].noteSet, false);
  assert.equal(posted[0].noteAppend, false);
  assert.equal(posted[0].note, '');
  assert.equal(posted[1].noteSet, true);
  assert.equal(posted[1].noteClear, true);
  assert.equal(posted[1].note, '');
  assert.equal(posted[2].noteSet, false);
  assert.equal(posted[2].noteAppend, true);
  assert.equal(posted[2].note, 'FALTOU');
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
  const syncDoc = readFileSync(new URL('../SYNC-DANIEL-EVOB.md', import.meta.url), 'utf8').trim();
  const client = `${readFileSync(new URL('../api.ts', import.meta.url), 'utf8')}\n${readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')}\n${readFileSync(new URL('../public/pin.js', import.meta.url), 'utf8')}`;
  assert.match(gas, /var SHEET_ID = '1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8'/);
  assert.match(gas, /1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w/);
  assert.doesNotMatch(gas, /var SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w'/);
  assert.match(gas, /aliases: \['4', 'Timestamp'/);
  assert.match(gas, /var SHEET_TAB = 'Leads \(2024 - 2026\)'/);
  assert.match(gas, /var CONTACT_CUTOFF_DAY = '2026-09-01'/);
  assert.match(gas, /passesContactCutoff_/);
  assert.match(gas, /Comentários/);
  assert.match(gas, /Nº Paciente Definitivo/);
  assert.doesNotMatch(gas, /FORBIDDEN_TAB/);
  assert.doesNotMatch(gas, /var SHEET_TAB = 'Inbound META'/);
  assert.doesNotMatch(gas, /1LMcABX/);
  assert.doesNotMatch(gas, /getSheets\(\)\[0\]/);
  assert.match(gas, /action === 'sync'/);
  assert.match(gas, /syncDanielToEvob\(\)/);
  const syncGas = readFileSync(new URL('../backend-gas/SyncDaniel.gs', import.meta.url), 'utf8');
  assert.match(syncGas, /function syncDanielToEvob\(/);
  assert.match(syncGas, /function installDanielSyncTrigger\(/);
  assert.match(syncGas, /everyMinutes\(15\)/);
  assert.match(syncGas, /1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w/);
  assert.match(syncGas, /var DANIEL_SHEET_TAB = 'Leads \(2024 - 2026\)'/);
  assert.match(syncGas, /var DANIEL_SHEET_TAB_FALLBACK = 'Leads - Go Smile'/);
  assert.match(syncGas, /passesContactCutoff_/);
  assert.match(syncGas, /CONTACT_CUTOFF_DAY/);
  assert.match(syncGas, /\(phone \|\| mail \|\| name\) \+ '\|' \+ name \+ '\|' \+ day/);
  assert.match(syncGas, /getLastRow\(\) \+ 1/);
  assert.match(syncGas, /1aAKXH7TnV17uCemEol56X_0NNs6ZVAF3LrBpZHf9ZoaRlw8rn26t1_mo/);
  assert.doesNotMatch(syncGas, /getSheetByName\('Inbound META'\)/);
  assert.doesNotMatch(syncGas, /service_account|private_key|cloud-platform/);
  assert.doesNotMatch(syncGas, /clearContent\(|deleteRow\(|\.clear\(/);
  assert.match(syncDoc, /syncDanielToEvob/);
  assert.match(syncDoc, /2026-09-01/);
  assert.match(syncDoc, /29/);
  assert.match(syncDoc, /Leads Inbound META evob/);
  assert.match(syncDoc, /1aAKXH7TnV17uCemEol56X_0NNs6ZVAF3LrBpZHf9ZoaRlw8rn26t1_mo/);
  assert.doesNotMatch(syncDoc, /fora deste PR/);
  assert.match(client, /PIN = '2000'/);
  assert.doesNotMatch(client, /APPS_SCRIPT_SECRET\s*=/);
  assert.doesNotMatch(client, /script\.google\.com/);
});

test('POST /api/leads/sync runs action=sync and drops the list cache', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let listCalls = 0;
  let posted = null;
  const app = createApp();

  await withFetch(async (url, init) => {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method === 'POST') {
      posted = JSON.parse(init.body);
      assert.match(String(url), /action=sync/);
      assert.equal(String(url).includes(SECRET), true);
      return new Response(JSON.stringify({
        ok: true,
        scanned: 29,
        inserted: 21,
        skipped: 8,
        errors: 0,
        cutoff: '2026-09-01',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    listCalls += 1;
    return new Response(JSON.stringify(sheetPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    assert.equal(listCalls, 1);
    const sync = await call(app, 'POST', '/api/leads/sync');
    assert.equal(sync.status, 200);
    assert.equal(sync.json.scanned, 29);
    assert.equal(sync.json.inserted, 21);
    assert.equal(sync.json.skipped, 8);
    assert.equal(sync.json.errors, 0);
    assert.equal(sync.json.cacheCleared, true);
    assert.equal(sync.text.includes(SECRET), false);
    assert.equal(posted.action, 'sync');
    const again = await call(app, 'GET', '/api/leads');
    assert.equal(again.headers['x-leads-cache'], 'miss');
    assert.equal(listCalls, 2);
  });
});

test('a failed Daniel sync keeps the warm list cache', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let listCalls = 0;
  const app = createApp();

  await withFetch(async (_url, init) => {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method === 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Sync Daniel falhou' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    listCalls += 1;
    return new Response(JSON.stringify(sheetPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    const sync = await call(app, 'POST', '/api/leads/sync');
    assert.equal(sync.status, 502);
    assert.match(sync.json.error, /Daniel/);
    const warm = await call(app, 'GET', '/api/leads');
    assert.equal(warm.headers['x-leads-cache'], 'hit');
    assert.equal(listCalls, 1);
  });
});

test('POST /api/leads/sync without Apps Script is 503', async () => {
  process.env.APPS_SCRIPT_URL = '';
  process.env.APPS_SCRIPT_SECRET = '';
  const app = createApp();
  const response = await call(app, 'POST', '/api/leads/sync');
  assert.equal(response.status, 503);
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

test('second GET /api/leads stays under a second when the memory cache is warm', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let calls = 0;
  const app = createApp();

  await withFetch(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return new Response(JSON.stringify(sheetPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.status, 200);
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    assert.equal(cold.json[0].name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
    const started = Date.now();
    const warm = await call(app, 'GET', '/api/leads');
    const elapsed = Date.now() - started;
    assert.equal(warm.status, 200);
    assert.equal(warm.headers['x-leads-cache'], 'hit');
    assert.equal(warm.json.length, cold.json.length);
    assert.equal(warm.json[0].id, cold.json[0].id);
    assert.ok(elapsed < 1000, `warm GET took ${elapsed}ms`);
    assert.equal(calls, 1);
  });
});

test('stale GET returns the cache immediately and fresh=1 waits for the sheet', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '30';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let calls = 0;
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const app = createApp();
  const updated = [...IDA_VALUES];
  updated[2] = 'Lead Actualizada';

  await withFetch(async () => {
    calls += 1;
    if (calls > 1) await gate;
    return new Response(JSON.stringify(sheetPayload(calls > 1 ? updated : IDA_VALUES)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    assert.equal(calls, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();
    const stale = await call(app, 'GET', '/api/leads');
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `stale GET took ${elapsed}ms`);
    assert.equal(stale.headers['x-leads-cache'], 'stale');
    assert.equal(stale.json[0].name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(calls, 2);
    const pending = call(app, 'GET', '/api/leads?fresh=1');
    release();
    const fresh = await pending;
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers['x-leads-cache'], 'hit');
    assert.equal(fresh.json[0].name, 'Lead Actualizada');
    assert.equal(calls, 2);
  });
});

test('fresh=1 and POST /api/leads/refresh bypass a warm TTL and reread the sheet', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let calls = 0;
  const app = createApp();

  await withFetch(async (url) => {
    calls += 1;
    if (calls === 1) assert.doesNotMatch(String(url), /[?&]fresh=1/);
    if (calls === 2) assert.doesNotMatch(String(url), /[?&]fresh=1/);
    const values = [...IDA_VALUES];
    if (calls > 1) values[2] = 'Lead Depois do Refresh';
    return new Response(JSON.stringify(sheetPayload(values)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    assert.equal(cold.json[0].name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
    assert.equal(calls, 1);

    const started = Date.now();
    const warm = await call(app, 'GET', '/api/leads');
    assert.ok(Date.now() - started < 1000, 'warm GET should stay on the TTL cache');
    assert.equal(warm.headers['x-leads-cache'], 'hit');
    assert.equal(warm.json[0].name, cold.json[0].name);
    assert.equal(calls, 1);

    const fresh = await call(app, 'GET', '/api/leads?fresh=1');
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers['x-leads-cache'], 'hit');
    assert.equal(fresh.json[0].name, cold.json[0].name);
    assert.equal(calls, 1);

    const refreshed = await call(app, 'POST', '/api/leads/refresh');
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers['x-leads-cache'], 'refresh');
    assert.equal(refreshed.headers['cache-control'], 'no-store');
    assert.equal(refreshed.headers['x-leads-sheet-read'], 'tail');
    assert.equal(refreshed.headers['x-leads-gas-cache'], 'miss');
    assert.equal(refreshed.headers['x-leads-read-rows'], '1');
    assert.equal(refreshed.headers['x-leads-scanned-rows'], '40');
    assert.ok(Number(refreshed.headers['x-leads-gas-ms']) >= 0);
    assert.equal(refreshed.json[0].name, 'Lead Depois do Refresh');
    assert.equal(calls, 2);

    const after = await call(app, 'GET', '/api/leads');
    assert.equal(after.headers['x-leads-cache'], 'hit');
    assert.equal(after.json[0].name, 'Lead Depois do Refresh');
    assert.equal(calls, 2);
  });

  let saved = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      saved = JSON.parse(await readFile(join(dataDir, 'leads-cache.json'), 'utf8'));
      if (saved?.leads?.[0]?.name === 'Lead Depois do Refresh') break;
    } catch {
      /* persist is queued after the response */
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(saved?.leads?.[0]?.name, 'Lead Depois do Refresh');
});

test('the header refresh is an icon, one sheet read, and keeps the contact cutoff', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../api.ts', import.meta.url), 'utf8');
  const cache = readFileSync(new URL('../leadCache.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const client = readFileSync(new URL('./sheetClient.js', import.meta.url), 'utf8');
  const meta = readFileSync(new URL('../shared/inboundMeta.js', import.meta.url), 'utf8');
  const gas = readFileSync(new URL('../backend-gas/Code.gs', import.meta.url), 'utf8');
  const syncGas = readFileSync(new URL('../backend-gas/SyncDaniel.gs', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const look = readFileSync(new URL('../public/look.css', import.meta.url), 'utf8');
  const refreshFn = app.slice(app.indexOf('const refreshFromSheet'), app.indexOf('const handleLeadAction'));
  const listFn = client.slice(client.indexOf('export async function listInboundLeads'), client.indexOf('export async function getInboundLead'));
  assert.match(layout, /aria-label="Atualizar"/);
  assert.doesNotMatch(layout, /Atualizar leads/);
  assert.doesNotMatch(layout, /A atualizar/);
  assert.doesNotMatch(layout, />\s*Atualizar\s*</);
  assert.match(layout, /aria-busy=\{isRefreshing/);
  assert.match(layout, /disabled=\{isRefreshing\}/);
  assert.match(layout, /className="refresh-icon"/);
  assert.match(layout, /logo_Gosmilesimple\.png/);
  assert.match(css, /\.refresh-icon/);
  assert.match(css, /stroke:\s*currentColor/);
  assert.match(css, /refresh-spin/);
  assert.match(look, /\.refresh-icon/);
  assert.match(look, /refresh-spin/);
  assert.match(refreshFn, /flushSync/);
  assert.match(refreshFn, /refreshLeads\(/);
  assert.match(refreshFn, /deferPersist:\s*true/);
  assert.doesNotMatch(refreshFn, /fetchLeads/);
  assert.doesNotMatch(refreshFn, /clearCachedLeads/);
  assert.match(app, /onRefresh=\{refreshFromSheet\}/);
  assert.match(app, /isRefreshing=\{isRefreshing\}/);
  assert.doesNotMatch(app, /isRefreshing \|\| isLoading/);
  assert.match(api, /\/api\/leads\/refresh/);
  assert.match(cache, /gosmile-leads-swr-v1/);
  assert.match(server, /\/leads\/refresh/);
  assert.match(server, /bypassCache: true/);
  assert.match(server, /\/leads\/sync/);
  assert.match(listFn, /bypassCache/);
  assert.doesNotMatch(listFn, /clearLeadsListCache/);
  assert.match(client, /clearLeadsListCache/);
  assert.match(meta, /export const CONTACT_CUTOFF_DAY = '2026-09-01'/);
  assert.match(gas, /var CONTACT_CUTOFF_DAY = '2026-09-01'/);
  assert.match(syncGas, /syncDanielToEvob|function sync/);
  assert.match(readme, /MacMini-leads-refresh-v3/);
  assert.match(readme, /2026-09-01/);
  assert.match(vite, /bypass\(req\)/);
  assert.match(vite, /\[a-z0-9\]/);
});

test('POST /api/leads/refresh joins an in-flight sheet read instead of starting a second one', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let calls = 0;
  let releaseGate = () => {};
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  let markStarted = () => {};
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const app = createApp();

  await withFetch(async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify(sheetPayload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    markStarted();
    await gate;
    const values = [...IDA_VALUES];
    values[2] = 'Lead Depois do Refresh';
    return new Response(JSON.stringify(sheetPayload(values)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    assert.equal(calls, 1);

    process.env.LEADS_CACHE_TTL_MS = '1';
    await new Promise((resolve) => setTimeout(resolve, 15));
    const stale = await call(app, 'GET', '/api/leads');
    assert.equal(stale.headers['x-leads-cache'], 'stale');
    assert.equal(stale.json[0].name, cold.json[0].name);
    await Promise.race([
      started,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('in-flight sheet read did not start')), 2000);
      }),
    ]);

    const startedAt = Date.now();
    const refreshPromise = call(app, 'POST', '/api/leads/refresh');
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(calls, 2, 'refresh must not open a second Apps Script read');
    releaseGate();
    const refreshed = await refreshPromise;
    const elapsed = Date.now() - startedAt;
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers['x-leads-cache'], 'refresh');
    assert.equal(refreshed.json[0].name, 'Lead Depois do Refresh');
    assert.equal(calls, 2);
    assert.ok(elapsed < 500, `joined refresh took ${elapsed}ms; a second sheet read would wait again`);

    process.env.LEADS_CACHE_TTL_MS = '45000';
    const after = await call(app, 'GET', '/api/leads');
    assert.equal(after.headers['x-leads-cache'], 'hit');
    assert.equal(after.json[0].name, 'Lead Depois do Refresh');
    assert.equal(calls, 2);
  });
});

test('a failed refresh keeps the warm list and does not delete the cache file', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let calls = 0;
  const app = createApp();

  await withFetch(async () => {
    calls += 1;
    if (calls > 1) {
      return new Response(JSON.stringify({ ok: false, error: 'Folha em baixo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(sheetPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    const refreshed = await call(app, 'POST', '/api/leads/refresh');
    assert.equal(refreshed.status, 502);
    const warm = await call(app, 'GET', '/api/leads');
    assert.equal(warm.headers['x-leads-cache'], 'hit');
    assert.equal(warm.json[0].name, cold.json[0].name);
    // One cold read, then the default two retries of a 502. The list stays cached.
    assert.equal(calls, 4);
  });

  let saved = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      saved = JSON.parse(await readFile(join(dataDir, 'leads-cache.json'), 'utf8'));
      if (saved?.leads?.[0]?.name) break;
    } catch {
      /* persist is queued after the cold response */
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(saved?.leads?.[0]?.name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
});

test('POST /api/leads/refresh waits for one sheet read, not a wiped cache plus another', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const sheetMs = 200;
  let calls = 0;
  const app = createApp();

  await withFetch(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, sheetMs));
    const values = [...IDA_VALUES];
    if (calls > 1) values[2] = 'Lead Depois do Refresh';
    return new Response(JSON.stringify(sheetPayload(values)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    const startedAt = Date.now();
    const refreshed = await call(app, 'POST', '/api/leads/refresh');
    const elapsed = Date.now() - startedAt;
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers['x-leads-cache'], 'refresh');
    assert.equal(refreshed.json[0].name, 'Lead Depois do Refresh');
    assert.equal(calls, 2);
    assert.ok(elapsed >= sheetMs - 30, `refresh returned in ${elapsed}ms before the sheet`);
    assert.ok(elapsed < sheetMs + 500, `refresh took ${elapsed}ms for one ${sheetMs}ms sheet read`);
  });
});

test('leads-cache.json is served on a cold process and leads.json is not the list', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '60000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  await writeFile(
    join(dataDir, 'leads.json'),
    `${JSON.stringify([{ id: '9', name: 'From Leads Json', timestamp: '2026-09-20T00:00:00.000Z' }])}\n`
  );
  await writeFile(
    join(dataDir, 'leads-cache.json'),
    `${JSON.stringify({
      at: Date.now(),
      leads: [
        {
          id: '2',
          name: 'From Cache File',
          phone: '351962852158',
          email: 'a@b.c',
          timestamp: '2026-09-20T17:14:04.000Z',
          contactDay: '2026-09-20',
          status: 'new',
          isContacted: false,
        },
      ],
    })}\n`
  );
  let calls = 0;
  const app = createApp();
  await withFetch(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return new Response(JSON.stringify(sheetPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const started = Date.now();
    const response = await call(app, 'GET', '/api/leads');
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `file cache GET took ${elapsed}ms`);
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-leads-cache'], 'hit');
    assert.equal(response.json[0].name, 'From Cache File');
    assert.equal(JSON.stringify(response.json).includes('From Leads Json'), false);
    assert.equal(calls, 0);
  });
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'leads.json'), 'utf8')), []);
});

test('a status write does not read the list first, and a cold cache file is patched', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const stale = {
    id: '2',
    name: 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
    phone: '351962852158',
    email: 'cristina.oliveira.consult@gmail.com',
    timestamp: '2026-09-20T17:14:04.000Z',
    contactDay: '2026-09-20',
    status: 'new',
    notes: 'nota antiga',
    source: 'Meta',
  };
  await writeFile(join(dataDir, 'leads-cache.json'), `${JSON.stringify({ at: Date.now(), leads: [stale] })}\n`);
  const actions = [];
  const values = [...IDA_VALUES];
  values[6] = '[status:contacted]\nliguei hoje';
  const app = createApp();
  await withFetch(async (url, init) => {
    const action = new URL(String(url)).searchParams.get('action');
    actions.push(`${action}:${String(init?.method || 'GET').toUpperCase()}`);
    return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 2, values } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const patched = await call(app, 'PATCH', '/api/leads/2', { status: 'contacted', notes: 'liguei hoje' });
    assert.equal(patched.status, 200);
    const listed = await call(app, 'GET', '/api/leads');
    assert.equal(listed.headers['x-leads-cache'], 'hit');
    assert.equal(listed.json[0].notes, 'liguei hoje');
    assert.equal(listed.json[0].status, 'contacted');
    assert.equal(JSON.stringify(listed.json).includes('nota antiga'), false);
  });
  assert.deepEqual(actions, ['update:POST']);
});

test('the default warmer refills the Mini leads cache without fresh=1', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  delete process.env.LEADS_WARM_ACTION;
  let leadsCalls = 0;
  const app = createApp();
  try {
    await withFetch(async (url) => {
      const endpoint = new URL(String(url));
      const action = endpoint.searchParams.get('action');
      if (action !== 'leads') throw new Error(`unexpected warm action ${action}`);
      leadsCalls += 1;
      assert.equal(endpoint.searchParams.get('fresh'), null);
      return new Response(JSON.stringify(sheetPayload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }, async () => {
      const warm = await call(app, 'POST', '/api/leads/warm');
      assert.equal(warm.status, 200);
      assert.equal(warm.json.skipped, false);
      const listed = await call(app, 'GET', '/api/leads');
      assert.equal(listed.headers['x-leads-cache'], 'hit');
      assert.equal(listed.json[0].name, 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira');
      assert.equal(leadsCalls, 1);
    });
  } finally {
    delete process.env.LEADS_WARM_ACTION;
  }
});

test('a sheet write is visible on the next warm GET without another list round-trip', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  let listCalls = 0;
  const app = createApp();
  const values = [...IDA_VALUES];
  values[6] = '[status:contacted]\nliguei hoje';

  await withFetch(async (_url, init) => {
    if (String(init?.method || 'GET').toUpperCase() === 'POST') {
      return new Response(JSON.stringify({ ok: true, headers: HEADERS, row: { row: 2, values } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    listCalls += 1;
    return new Response(JSON.stringify(sheetPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const cold = await call(app, 'GET', '/api/leads');
    assert.equal(cold.headers['x-leads-cache'], 'miss');
    assert.equal(cold.json[0].status, 'new');
    const patched = await call(app, 'PATCH', '/api/leads/2', { status: 'contacted', notes: 'liguei hoje' });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.status, 'contacted');
    const started = Date.now();
    const warm = await call(app, 'GET', '/api/leads');
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `warm GET after write took ${elapsed}ms`);
    assert.equal(warm.headers['x-leads-cache'], 'hit');
    assert.equal(warm.json[0].status, 'contacted');
    assert.equal(warm.json[0].notes, 'liguei hoje');
    assert.equal(listCalls, 1);
  });
});

test('the inbox hydrates a saved list and does not treat the first paint as empty', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const inbox = readFileSync(new URL('../views/Inbox.tsx', import.meta.url), 'utf8');
  const cache = readFileSync(new URL('../leadCache.ts', import.meta.url), 'utf8');
  const copy = readFileSync(new URL('../utils.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./sheetClient.js', import.meta.url), 'utf8');
  assert.match(app, /useState\(true\)/);
  assert.match(app, /readCachedLeads/);
  assert.match(app, /writeCachedLeads/);
  assert.match(app, /fetchLeads\(\{ fresh: true \}\)/);
  assert.match(cache, /gosmile-leads-swr-v1/);
  assert.match(cache, /localStorage/);
  assert.match(copy, /A atualizar…/);
  assert.match(copy, /if \(isLoading\) return 'A atualizar…'/);
  assert.match(inbox, /listStatusCopy/);
  assert.match(inbox, /Nenhuma lead na inbox\./);
  assert.match(server, /leads-cache\.json/);
  assert.doesNotMatch(server, /leads\.json/);
  assert.match(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /MacMini-leads-swr-v1/);
});

test('refresh uses the Apps Script cache, the warmer refills leads, and sync does not block it', async () => {
  await clearLeadsListCache();
  process.env.LEADS_CACHE_TTL_MS = '45000';
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const gas = readFileSync(new URL('../backend-gas/Code.gs', import.meta.url), 'utf8');
  const syncGas = readFileSync(new URL('../backend-gas/SyncDaniel.gs', import.meta.url), 'utf8');
  const client = readFileSync(new URL('./sheetClient.js', import.meta.url), 'utf8');
  const leadsBranch = gas.slice(gas.indexOf("if (action === 'leads'"), gas.indexOf("if (action === 'update'"));
  const updateFn = gas.slice(gas.indexOf('function updateLead_'), gas.indexOf('function blankRow_'));
  const createFn = gas.slice(gas.indexOf('function createLead_'), gas.indexOf('function handle_'));
  const listPayload = gas.slice(gas.indexOf('function tablePayload_'), gas.indexOf('function applyFields_'));
  assert.match(leadsBranch, /loadLeadsPayload_/);
  assert.doesNotMatch(leadsBranch, /readTable_/);
  const readFn = gas.slice(gas.indexOf('function readLeadsTable_'), gas.indexOf('function readHeaderAndRow_'));
  assert.match(gas, /function readLeadsTable_/);
  assert.match(gas, /LEADS_CACHE_TTL_SEC = 60/);
  assert.match(gas, /function listColumnCount_/);
  assert.match(gas, /rowsOmitted: true/);
  assert.doesNotMatch(gas, /leadsOmitted/);
  assert.doesNotMatch(gas, /tablePayload_\(table, true\)/);
  assert.match(listPayload, /leads: leads/);
  assert.doesNotMatch(listPayload, /headers:/);
  assert.match(gas, /doctor: raw\.medico_orcamento/);
  assert.match(gas, /function money_/);
  assert.match(readFn, /listColumnCount_/);
  assert.match(gas, /CacheService\.getScriptCache/);
  assert.match(gas, /bumpLeadsCache_/);
  assert.match(gas, /sheetRead = 'tail'/);
  assert.match(gas, /action === 'ping'/);
  assert.match(readFn, /getDisplayValues\(\)/);
  assert.equal(readFn.split('getDisplayValues()').length - 1, 3);
  assert.doesNotMatch(readFn, /getRange\(1, 1, height, lastColumn\)/);
  assert.doesNotMatch(updateFn, /readTable_\(/);
  assert.match(updateFn, /bumpLeadsCache_/);
  assert.match(updateFn, /readHeaderAndRow_/);
  assert.doesNotMatch(createFn, /readTable_\(/);
  assert.match(syncGas, /readTable_/);
  assert.match(syncGas, /bumpLeadsCache_/);
  assert.match(syncGas, /CONTACT_CUTOFF_DAY/);
  assert.match(client, /lane === 'read'/);
  assert.match(client, /lane === 'warm'/);
  assert.match(client, /sheetFresh/);
  assert.match(client, /writesInFlight/);
  assert.match(client, /DEFAULT_WARM_MS = 180_000/);
  assert.match(client, /LEADS_WARM_ACTION \|\| 'leads'/);
  assert.match(client, /noteAppend: patch.noteAppend/);
  assert.match(gas, /noteAppend/);
  assert.match(gas, /body\.noteClear/);
  assert.match(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), /gosmile-leads-refresh-v3/);
  const inbox = readFileSync(new URL('../views/Inbox.tsx', import.meta.url), 'utf8');
  const agenda = readFileSync(new URL('../views/Agenda.tsx', import.meta.url), 'utf8');
  assert.match(inbox, /lead\?\.notes/);
  assert.match(inbox, /noteDirty/);
  assert.match(inbox, /noteClear: true/);
  assert.doesNotMatch(inbox, /setComment\(''\)/);
  assert.match(agenda, /noteAppend: true/);
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /leadsEpoch/);
  assert.match(appSource, /A guardar na folha/);
  assert.match(appSource, /A atualizar a lista/);
  assert.match(appSource, /Lead marcada\. Está em Marcações/);
  assert.match(appSource, /aria-live/);
  const actionFn = appSource.slice(appSource.indexOf('const handleLeadAction'), appSource.indexOf('const handleCreateLead'));
  assert.doesNotMatch(actionFn, /loadLeads\(/);
  assert.match(actionFn, /leadsEpoch/);
  assert.match(client, /payload\?\.leads\) && payload\.leads\.length > 0/);

  let releaseSync = () => {};
  const syncGate = new Promise((resolve) => {
    releaseSync = resolve;
  });
  let markSync = () => {};
  const syncStarted = new Promise((resolve) => {
    markSync = resolve;
  });
  const urls = [];
  const app = createApp();
  try {
    await withFetch(async (url) => {
      const href = String(url);
      urls.push(href);
      const action = new URL(href).searchParams.get('action');
      if (action === 'sync') {
        markSync();
        await syncGate;
        return new Response(
          JSON.stringify({ ok: true, scanned: 1, inserted: 0, skipped: 1, errors: 0, cutoff: '2026-09-01' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (action === 'ping') {
        return new Response(JSON.stringify({ ok: true, pong: true, contactCutoff: '2026-09-01' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(sheetPayload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }, async () => {
      process.env.LEADS_WARM_ACTION = 'ping';
      const ping = await call(app, 'POST', '/api/leads/warm');
      assert.equal(ping.status, 200);
      assert.equal(ping.json.ok, true);
      assert.equal(ping.json.skipped, false);
      assert.equal(ping.json.contactCutoff, '2026-09-01');
      assert.match(urls[0], /action=ping/);
      assert.doesNotMatch(urls[0], /action=leads/);
      assert.doesNotMatch(urls[0], /[?&]fresh=1/);

      delete process.env.LEADS_WARM_ACTION;
      const warm = await call(app, 'POST', '/api/leads/warm');
      assert.equal(warm.status, 200);
      assert.match(urls[1], /action=leads/);
      assert.doesNotMatch(urls[1], /[?&]fresh=1/);

      const syncPromise = call(app, 'POST', '/api/leads/sync');
      await syncStarted;
      const started = Date.now();
      const refreshed = await Promise.race([
        call(app, 'POST', '/api/leads/refresh'),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('refresh waited behind sync')), 1500);
        }),
      ]);
      const elapsed = Date.now() - started;
      assert.equal(refreshed.status, 200);
      assert.equal(refreshed.headers['x-leads-cache'], 'refresh');
      assert.equal(refreshed.headers['x-leads-sheet-read'], 'tail');
      assert.ok(elapsed < 1000, `refresh took ${elapsed}ms while sync was in flight`);
      const leadUrls = urls.filter((href) => href.includes('action=leads'));
      assert.equal(leadUrls.length, 2);
      assert.doesNotMatch(leadUrls[0], /[?&]fresh=1/);
      assert.doesNotMatch(leadUrls[1], /[?&]fresh=1/);
      releaseSync();
      const sync = await syncPromise;
      assert.equal(sync.status, 200);
      assert.equal(sync.json.cacheCleared, true);
    });
  } finally {
    delete process.env.LEADS_WARM_ACTION;
    releaseSync();
  }
});

test('a leads-only list keeps doctor, value and the contact cutoff', async () => {
  await clearLeadsListCache();
  process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy/exec';
  process.env.APPS_SCRIPT_SECRET = SECRET;
  const app = createApp();
  await withFetch(async () => new Response(JSON.stringify({
    ok: true,
    sheetTab: 'Leads (2024 - 2026)',
    contactCutoff: '2026-09-01',
    rowsOmitted: true,
    sheetRead: 'tail',
    gasCache: 'hit',
    readMs: 12,
    gasCacheAgeMs: 400,
    leads: [
      {
        id: '12',
        row: 12,
        name: 'Ida Cristina',
        phone: '351962852158',
        email: 'ida@example.com',
        timestamp: '2026-09-20T17:14:04.000Z',
        contactDay: '2026-09-20',
        status: 'scheduled',
        doctor: 'Bruno Aires',
        appointmentDate: '2026-09-22',
        value: 1500,
        notes: 'marcada',
      },
      {
        id: '3',
        name: 'Lead Antiga',
        phone: '351900000000',
        timestamp: '2024-05-01T10:00:00.000Z',
        contactDay: '2024-05-01',
        status: 'new',
        doctor: 'Nia',
        value: 10,
      },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } }), async () => {
    const refreshed = await call(app, 'POST', '/api/leads/refresh');
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers['x-leads-gas-cache'], 'hit');
    assert.equal(refreshed.json.length, 1);
    assert.equal(refreshed.json[0].name, 'Ida Cristina');
    assert.equal(refreshed.json[0].doctor, 'Bruno Aires');
    assert.equal(refreshed.json[0].appointmentDate, '2026-09-22');
    assert.equal(refreshed.json[0].value, 1500);
    assert.equal(refreshed.json[0].contactDay, '2026-09-20');
    assert.equal(refreshed.json[0].status, 'scheduled');
    assert.equal(refreshed.json.some((lead) => lead.name === 'Lead Antiga'), false);
  });
});

test('inbox and marcações list every loaded lead, not the selected month', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const agenda = readFileSync(new URL('../views/Agenda.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
  const inbox = app.slice(app.indexOf("case 'inbox'"), app.indexOf("case 'lixo'"));
  const visitas = app.slice(app.indexOf("case 'visitas'"), app.indexOf("case 'contas'"));
  assert.match(inbox, /leads=\{leads\}/);
  assert.doesNotMatch(inbox, /currentLeads/);
  assert.match(visitas, /leads\.filter\(\(l\) => l\.status === 'scheduled'\)/);
  assert.doesNotMatch(visitas, /currentLeads/);
  assert.match(agenda, /sortMarcacoesChronological/);
  assert.doesNotMatch(agenda, /monthLabel|sortLeadsNewestFirst/);
  assert.match(layout, /activeView !== 'visitas'/);
  assert.match(app, /<Trash[\s\S]*?currentLeads/);
  assert.match(app, /<Accounts[\s\S]*?currentLeads/);
  assert.match(app, /allLeads=\{leads\}/);
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
