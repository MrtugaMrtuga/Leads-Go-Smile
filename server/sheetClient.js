/**
 * Server-side proxy to the bound Apps Script web app.
 * The secret stays in the Mini environment and is never sent to the browser.
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCarlaEmail, projectLead, shouldNotifyCarla } from '../shared/carlaEmail.js';
import { SHEET_TAB, filterLeadsForApp, leadFromSheetRow, mapDataToLeads } from '../shared/inboundMeta.js';
import { leadPatchToFields, PipelineError } from '../shared/sheetWrite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLACEHOLDER = /replace_with|changeme|your[-_ ]?secret/i;

export class SheetError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'SheetError';
    this.statusCode = statusCode;
  }
}

export function appsScriptConfig(env = process.env) {
  const url = String(env.APPS_SCRIPT_URL || '').trim();
  const secret = String(env.APPS_SCRIPT_SECRET || '').trim();
  const configured = url.startsWith('https://') && secret.length >= 8 && !PLACEHOLDER.test(url) && !PLACEHOLDER.test(secret);
  return { url, secret, configured };
}

function redact(value) {
  return String(value || '').replace(/([?&]secret=)[^&\s]+/gi, '$1***');
}

function leadsFromPayload(payload) {
  // The list is the built leads. Raw rows are only a fallback for an older /exec
  // that still sends headers+rows and an empty leads array.
  if (Array.isArray(payload?.leads) && payload.leads.length > 0) {
    return mapDataToLeads(payload.leads);
  }
  if (Array.isArray(payload?.headers) && Array.isArray(payload?.rows)) {
    return payload.rows
      .map((row) => leadFromSheetRow(payload.headers, row.values || [], Number(row?.row)))
      .filter(Boolean);
  }
  return mapDataToLeads(payload?.leads || payload?.data || []);
}

function leadFromPayload(payload) {
  if (payload?.headers && payload?.row && Array.isArray(payload.row.values)) {
    return leadFromSheetRow(payload.headers, payload.row.values, Number(payload.row.row));
  }
  const leads = leadsFromPayload(payload);
  if (leads.length === 1 && !Array.isArray(payload?.rows)) return leads[0];
  if (payload?.lead) {
    const [lead] = mapDataToLeads([payload.lead]);
    return lead || null;
  }
  return leads[0] || null;
}

const GAS_TIMEOUT_MS = Number(process.env.APPS_SCRIPT_TIMEOUT_MS || 55000);
const GAS_RETRIES = Number(process.env.APPS_SCRIPT_RETRIES || 2);
const DEFAULT_LIST_TTL_MS = 45_000;

function isTransientFetchError(error) {
  const name = String(error?.name || '');
  const msg = String(error?.message || error || '');
  return name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted|fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(msg);
}

function isTransientSheetMessage(message) {
  return /HTML|indisponível|indisponivel|timeout|aborted|HTTP 5\d\d|Demasiados redireccionamentos/i.test(String(message || ''));
}

/**
 * Writes (update, create, sync) stay in one queue. Parallel calls to the same
 * /exec often come back as an HTML 404 page.
 * Reads (leads, ping, health) do not wait for that queue, so a refresh is not
 * stuck behind Daniel sync. If a read still gets HTML while a write is in
 * flight, it waits for the write and retries.
 * A warm ping never joins the read queue: the next refresh does not wait for it.
 */
let readChain = Promise.resolve();
let writeChain = Promise.resolve();
let readPending = 0;
let readActive = 0;
let writePending = 0;
let writesInFlight = 0;

function settle(promise) {
  return promise.then(
    () => undefined,
    () => undefined
  );
}

function enqueueRead(task) {
  readPending += 1;
  const run = readChain.then(async () => {
    readActive += 1;
    try {
      return await task();
    } finally {
      readActive -= 1;
      readPending -= 1;
    }
  });
  readChain = settle(run);
  return run;
}

function enqueueWrite(task) {
  writePending += 1;
  const run = writeChain.then(async () => {
    writesInFlight += 1;
    try {
      return await task();
    } finally {
      writesInFlight -= 1;
      writePending -= 1;
    }
  });
  writeChain = settle(run);
  return run;
}

function sheetBusy() {
  return readPending > 0 || readActive > 0 || writePending > 0 || writesInFlight > 0;
}

function enqueueGas(task, lane = 'write') {
  if (lane === 'warm') {
    if (sheetBusy()) return Promise.resolve({ ok: true, skipped: true, reason: 'busy' });
    return task();
  }
  if (lane === 'read') return enqueueRead(task);
  return enqueueWrite(task);
}

const READ_ACTIONS = new Set(['leads', 'getLeads', 'ping', 'health']);

/** Last good sheet list. Not the source of truth — the sheet is. */
let listCache = null;
let revision = 0;
let revalidateFlight = null;
let hydrateFlight = null;
let persistQueue = Promise.resolve();

function dataDir() {
  return process.env.LEADS_DATA_DIR || join(__dirname, '..', 'data');
}

function cacheFile() {
  return join(dataDir(), 'leads-cache.json');
}

function cacheTtlMs() {
  const raw = Number(process.env.LEADS_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_LIST_TTL_MS;
}

function isFresh(cache) {
  return Boolean(cache && Array.isArray(cache.leads) && Date.now() - cache.at < cacheTtlMs());
}

async function hydrateFromDisk() {
  if (listCache) return;
  if (!hydrateFlight) {
    const seen = revision;
    const flight = (async () => {
      try {
        const raw = JSON.parse(await readFile(cacheFile(), 'utf8'));
        const at = Number(raw?.at);
        if (seen !== revision) return;
        if (!listCache && raw && Array.isArray(raw.leads) && Number.isFinite(at)) {
          listCache = { at, leads: raw.leads };
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') console.error('leads-cache', error.message);
      } finally {
        if (hydrateFlight === flight) hydrateFlight = null;
      }
    })();
    hydrateFlight = flight;
  }
  await hydrateFlight;
}

function persistCache(snapshot) {
  const file = cacheFile();
  persistQueue = persistQueue
    .then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(
        tmp,
        `${JSON.stringify({ at: snapshot.at, savedAt: new Date(snapshot.at).toISOString(), leads: snapshot.leads })}\n`,
        'utf8'
      );
      await rename(tmp, file);
    })
    .catch((error) => {
      console.error('leads-cache', error.message);
    });
}

function commitCache(leads, meta = {}) {
  const snapshot = {
    at: Date.now(),
    leads,
    gasMs: meta.gasMs ?? null,
    gasCache: meta.gasCache || '',
    sheetRead: meta.sheetRead || '',
    readMs: meta.readMs ?? null,
    readRows: meta.readRows ?? null,
    scannedRows: meta.scannedRows ?? null,
    gasCacheAgeMs: meta.gasCacheAgeMs ?? null,
    columns: meta.columns ?? null,
    sheetColumns: meta.sheetColumns ?? null,
  };
  listCache = snapshot;
  persistCache(snapshot);
  return snapshot;
}

function metaFromPayload(payload, gasMs) {
  const readMs = Number(payload?.readMs);
  const readRows = Number(payload?.readRows);
  const scannedRows = Number(payload?.scannedRows);
  const gasCacheAgeMs = Number(payload?.gasCacheAgeMs);
  const columns = Number(payload?.columns);
  const sheetColumns = Number(payload?.sheetColumns);
  return {
    gasMs,
    gasCache: String(payload?.gasCache || ''),
    sheetRead: String(payload?.sheetRead || ''),
    readMs: Number.isFinite(readMs) ? readMs : null,
    readRows: Number.isFinite(readRows) ? readRows : null,
    scannedRows: Number.isFinite(scannedRows) ? scannedRows : null,
    gasCacheAgeMs: Number.isFinite(gasCacheAgeMs) ? gasCacheAgeMs : null,
    columns: Number.isFinite(columns) ? columns : null,
    sheetColumns: Number.isFinite(sheetColumns) ? sheetColumns : null,
  };
}

function revalidate(gasOptions) {
  const seen = revision;
  if (revalidateFlight) {
    return revalidateFlight.then(() => {
      if (seen !== revision) return revalidate(gasOptions);
      return listCache;
    });
  }

  const task = (async () => {
    try {
      const started = Date.now();
      const payload = await gasRequest({
        action: 'leads',
        method: 'GET',
        ...gasOptions,
        fresh: Boolean(gasOptions.sheetFresh),
        lane: 'read',
      });
      const leads = filterLeadsForApp(leadsFromPayload(payload));
      if (seen !== revision) return listCache;
      return commitCache(leads, metaFromPayload(payload, Date.now() - started));
    } finally {
      if (revalidateFlight === task) revalidateFlight = null;
    }
  })();

  revalidateFlight = task;
  return task;
}

export async function clearLeadsListCache() {
  revision += 1;
  listCache = null;
  hydrateFlight = null;
  revalidateFlight = null;
  await persistQueue;
  await rm(cacheFile(), { force: true });
}

async function mergeColdCache(lead, seen) {
  if (seen !== revision) return;
  if (listCache && Array.isArray(listCache.leads)) return;
  let raw = null;
  try {
    raw = JSON.parse(await readFile(cacheFile(), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('leads-cache', error.message);
      await rm(cacheFile(), { force: true }).catch(() => {});
    }
    return;
  }
  if (seen !== revision || (listCache && Array.isArray(listCache.leads))) return;
  if (!raw || !Array.isArray(raw.leads)) {
    await rm(cacheFile(), { force: true }).catch(() => {});
    return;
  }
  const without = raw.leads.filter((item) => String(item?.id) !== String(lead.id));
  const leads = filterLeadsForApp([...without, lead]);
  if (seen !== revision) return;
  const snapshot = { at: Date.now(), leads };
  listCache = snapshot;
  const file = cacheFile();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(
    tmp,
    `${JSON.stringify({ at: snapshot.at, savedAt: new Date(snapshot.at).toISOString(), leads })}\n`,
    'utf8'
  );
  await rename(tmp, file);
}

/**
 * Fold a sheet write into the warm list so the next GET is not the pre-write
 * snapshot. A cold process still patches leads-cache.json before the response.
 * revision bumps so an in-flight list read cannot commit the older sheet payload.
 */
export async function rememberInboundLead(lead) {
  if (!lead || typeof lead !== 'object') return;
  revision += 1;
  const seen = revision;
  if (listCache && Array.isArray(listCache.leads)) {
    const without = listCache.leads.filter((item) => String(item.id) !== String(lead.id));
    commitCache(filterLeadsForApp([...without, lead]));
    return;
  }
  const job = persistQueue.then(() => mergeColdCache(lead, seen));
  persistQueue = job.then(
    () => undefined,
    () => undefined
  );
  try {
    await job;
  } catch (error) {
    console.error('leads-cache', error.message);
  }
}

async function fetchFollowing(url, { method = 'GET', body, fetchImpl }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const upper = String(method || 'GET').toUpperCase();

  // GET: let undici follow redirects (same as curl -L). Manual hop for POST
  // so we never lose the body on Apps Script's 302→echo (GET-only) hop.
  if (upper === 'GET' && !body) {
    return fetchFn(String(url), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    });
  }

  let currentUrl = String(url);
  let currentMethod = upper;
  let currentBody = body;

  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetchFn(currentUrl, {
      method: currentMethod,
      redirect: 'manual',
      cache: 'no-store',
      headers: currentBody
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body: currentBody,
      signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new SheetError('Redireccionamento do Apps Script sem destino');
      currentUrl = new URL(location, currentUrl).toString();
      // After the first hop, Apps Script echo endpoints only allow GET.
      currentMethod = 'GET';
      currentBody = undefined;
      continue;
    }

    return response;
  }

  throw new SheetError('Demasiados redireccionamentos do Apps Script');
}

export async function gasRequest({
  action,
  method = 'GET',
  body,
  fetchImpl,
  env = process.env,
  fresh = false,
  lane,
} = {}) {
  const { url, secret, configured } = appsScriptConfig(env);
  if (!configured) throw new SheetError('Apps Script não configurado', 503);

  const endpoint = new URL(url);
  endpoint.searchParams.set('secret', secret);
  endpoint.searchParams.set('action', action);
  if (fresh) endpoint.searchParams.set('fresh', '1');

  const attempts = Math.max(1, GAS_RETRIES + 1);
  const laneName = lane || (READ_ACTIONS.has(action) ? 'read' : 'write');

  return enqueueGas(async () => {
    const started = Date.now();
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await fetchFollowing(endpoint, {
          method,
          body: body ? JSON.stringify({ ...body, action }) : undefined,
          fetchImpl,
        });
      } catch (error) {
        if (error instanceof SheetError) {
          lastError = error;
          if (attempt < attempts && isTransientSheetMessage(error.message)) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          throw error;
        }
        lastError = error;
        if (attempt < attempts && isTransientFetchError(error)) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw new SheetError(`Folha «${SHEET_TAB}» indisponível (${redact(error.message || error)})`);
      }

      const textBody = await response.text();
      const trimmed = textBody.trim();
      if (!trimmed || trimmed.startsWith('<')) {
        lastError = new SheetError('O Apps Script devolveu HTML. Publique como aplicação web «Qualquer pessoa» com URL /exec.');
        if (attempt < attempts) {
          // A read that raced a sync/update got the HTML page. Wait out the
          // write, then retry, instead of failing the refresh or queueing
          // every refresh behind the sync from the start.
          if (laneName === 'read' && (writesInFlight > 0 || writePending > 0)) await writeChain;
          else await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        lastError = new SheetError(`Resposta inválida da folha «${SHEET_TAB}»`);
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      if (!payload || payload.ok === false) {
        const message = String(payload?.error || `Folha «${SHEET_TAB}» HTTP ${response.status}`);
        const statusCode = /não encontrada|nao encontrada/i.test(message) ? 404 : 502;
        lastError = new SheetError(message, statusCode);
        if (attempt < attempts && statusCode >= 500) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      console.log(
        `gas action=${action} lane=${laneName} ms=${Date.now() - started} attempts=${attempt} cache=${payload?.gasCache || '-'} sheet=${payload?.sheetRead || '-'} readRows=${payload?.readRows ?? '-'} scannedRows=${payload?.scannedRows ?? '-'}`
      );
      return payload;
    }

    console.error(`gas action=${action} lane=${laneName} fail ms=${Date.now() - started} attempts=${attempts}`);
    throw lastError || new SheetError(`Folha «${SHEET_TAB}» indisponível`);
  }, laneName);
}

function leadFromMemory(id) {
  if (!listCache || !Array.isArray(listCache.leads)) return undefined;
  return listCache.leads.find((lead) => String(lead.id) === String(id)) || null;
}

/** A list read is only needed when this patch might email Carla and the lead is not cached. */
function patchMightEmailCarla(updates = {}) {
  const status = String(updates.status || '').trim().toLowerCase();
  const date = updates.appointmentDate ?? updates.data_consulta;
  if (status && status !== 'scheduled') return false;
  if (status === 'scheduled') return true;
  return date !== undefined && String(date).trim() !== '';
}

export async function listInboundLeads(options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) return { leads: [], configured: false, cache: 'unconfigured' };

  await persistQueue;
  const { fresh = false, bypassCache = false, sheetFresh = false, ...gasOptions } = options;

  // A forced refresh must not wipe memory or the cache file first. Wiping
  // waits on the disk queue and forgets an in-flight sheet read while that
  // call is still on the gas queue, so the next read waits for it and then
  // starts a second one. revalidate() joins the flight already in progress.
  // The file is replaced after the response; a failed read leaves the
  // previous list in place.
  if (!bypassCache) await hydrateFromDisk();
  const hadCache = Boolean(listCache && Array.isArray(listCache.leads));

  if (!bypassCache && hadCache && isFresh(listCache)) {
    return { leads: listCache.leads, configured: true, cache: 'hit' };
  }

  if (!bypassCache && hadCache && !fresh) {
    void revalidate(gasOptions).catch((error) => {
      console.error('leads revalidate', error?.message || error);
    });
    return { leads: listCache.leads, configured: true, cache: 'stale' };
  }

  try {
    const snapshot = await revalidate({ ...gasOptions, sheetFresh: Boolean(sheetFresh) });
    if (!snapshot || !Array.isArray(snapshot.leads)) {
      throw new SheetError(`Folha «${SHEET_TAB}» indisponível`);
    }
    const cache = bypassCache ? 'refresh' : hadCache ? 'hit' : 'miss';
    return {
      leads: snapshot.leads,
      configured: true,
      cache,
      gasMs: snapshot.gasMs ?? null,
      gasCache: snapshot.gasCache || '',
      sheetRead: snapshot.sheetRead || '',
      readMs: snapshot.readMs ?? null,
      readRows: snapshot.readRows ?? null,
      scannedRows: snapshot.scannedRows ?? null,
      gasCacheAgeMs: snapshot.gasCacheAgeMs ?? null,
      columns: snapshot.columns ?? null,
      sheetColumns: snapshot.sheetColumns ?? null,
    };
  } catch (error) {
    if (!bypassCache && hadCache && listCache && Array.isArray(listCache.leads)) {
      return { leads: listCache.leads, configured: true, cache: 'stale' };
    }
    throw error;
  }
}

export async function getInboundLead(id, options = {}) {
  const { leads } = await listInboundLeads(options);
  return leads.find((lead) => String(lead.id) === String(id)) || null;
}

async function loadPreviousLead(id, options) {
  try {
    const { leads } = await listInboundLeads({ env: options.env, fetchImpl: options.fetchImpl });
    return leads.find((lead) => String(lead.id) === String(id)) || null;
  } catch (error) {
    console.error('carla previous', error?.message || error);
    return null;
  }
}

export async function updateInboundLead(id, updates, options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) throw new SheetError('Apps Script não configurado', 503);
  let patch;
  try {
    patch = leadPatchToFields(updates, options.now);
  } catch (error) {
    if (error instanceof PipelineError) throw new SheetError(error.message, 400);
    throw error;
  }
  if (!patch.fields.length && !patch.noteSet && !patch.noteAppend && !patch.status && !patch.motivoSet && !patch.fechoSet) {
    throw new SheetError('Nada para actualizar', 400);
  }
  let previous = options.previous;
  if (previous === undefined) {
    const cached = leadFromMemory(String(id));
    if (cached !== undefined) previous = cached;
    else if (patchMightEmailCarla(updates)) previous = await loadPreviousLead(id, options);
    else previous = null;
  }
  const projected = projectLead(previous, updates);
  let carlaEmail;
  if (options.carlaEmail !== undefined) carlaEmail = options.carlaEmail;
  else if (shouldNotifyCarla(previous, projected)) carlaEmail = buildCarlaEmail(projected);
  const body = {
    id: String(id),
    status: patch.status,
    note: patch.note,
    noteSet: patch.noteSet,
    noteAppend: patch.noteAppend,
    noteClear: patch.noteClear,
    motivo: patch.motivo,
    motivoSet: patch.motivoSet,
    fecho: patch.fecho,
    fechoSet: patch.fechoSet,
    fechoClear: patch.fechoClear,
    fields: patch.fields,
  };
  if (carlaEmail) {
    body.carlaEmail = { to: carlaEmail.to, subject: carlaEmail.subject, html: carlaEmail.html };
  }
  const payload = await gasRequest({
    ...options,
    action: 'update',
    method: 'POST',
    body,
  });
  if (payload?.carlaEmail === 'failed') console.error('carla email', payload.carlaEmailError || 'failed');
  else if (payload?.carlaEmail === 'sent') console.log('carla email sent', id);
  const lead = leadFromPayload(payload);
  if (!lead) throw new SheetError('Lead não encontrada', 404);
  await rememberInboundLead(lead);
  return lead;
}

export async function syncDanielLeads(options = {}) {
  const summary = await gasRequest({
    action: 'sync',
    method: 'POST',
    body: {},
    ...options,
  });
  await clearLeadsListCache();
  const counts = {
    scanned: summary?.scanned,
    inserted: summary?.inserted,
    skipped: summary?.skipped,
    errors: summary?.errors,
  };
  console.log('daniel sync', JSON.stringify(counts));
  return summary;
}

export async function createInboundLead(input, options = {}) {
  const cfg = appsScriptConfig(options.env);
  if (!cfg.configured) throw new SheetError('Apps Script não configurado', 503);
  const name = String(input.name || input.nome || '').trim();
  if (!name) throw new SheetError('Nome é obrigatório', 400);
  const payload = await gasRequest({
    action: 'create',
    method: 'POST',
    body: {
      name,
      phone: input.phone || input.telefone || '',
      email: input.email || '',
      notes: input.notes || '',
      dataContacto: input.timestamp || new Date().toISOString(),
    },
    ...options,
  });
  const lead = leadFromPayload(payload);
  if (!lead) throw new SheetError('A folha não devolveu a lead criada');
  await rememberInboundLead(lead);
  return lead;
}

const DEFAULT_WARM_MS = 180_000;

export function sheetWarmerConfig(env = process.env) {
  const raw = env.LEADS_WARM_MS;
  const intervalMs = raw === undefined || raw === '' ? DEFAULT_WARM_MS : Number(raw);
  const enabled = Number.isFinite(intervalMs) && intervalMs >= 60_000;
  const action = String(env.LEADS_WARM_ACTION || 'leads').trim() || 'leads';
  return { enabled, intervalMs: enabled ? intervalMs : 0, action };
}

/**
 * Wake /exec and refill the leads cache when CacheService missed.
 * Default action=leads does not send fresh=1: a hit is cheap, a miss reads
 * the sheet and the Mini keeps that list. LEADS_WARM_ACTION=ping only wakes.
 */
export async function warmAppsScript() {
  const { configured } = appsScriptConfig();
  if (!configured) throw new SheetError('Apps Script não configurado', 503);
  const { action } = sheetWarmerConfig();
  if (action !== 'ping' && action !== 'leads' && action !== 'health') {
    throw new SheetError('LEADS_WARM_ACTION inválida', 500);
  }
  const seen = revision;
  const started = Date.now();
  const payload = await gasRequest({ action, method: 'GET', lane: 'warm', fresh: false });
  if (action === 'leads' && payload && !payload.skipped && seen === revision) {
    const leads = filterLeadsForApp(leadsFromPayload(payload));
    if (leads.length) commitCache(leads, metaFromPayload(payload, Date.now() - started));
  }
  return payload;
}

export function startSheetWarmer() {
  const config = sheetWarmerConfig();
  if (!config.enabled || !appsScriptConfig().configured) {
    return { started: false, intervalMs: 0, action: config.action };
  }
  const tick = () => {
    warmAppsScript().catch((error) => {
      console.error('gas warm', error?.message || error);
    });
  };
  const first = setTimeout(tick, 10_000);
  const timer = setInterval(tick, config.intervalMs);
  if (typeof first.unref === 'function') first.unref();
  if (typeof timer.unref === 'function') timer.unref();
  return { started: true, intervalMs: config.intervalMs, action: config.action };
}
