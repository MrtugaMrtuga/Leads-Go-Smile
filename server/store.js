import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.LEADS_DATA_DIR || join(__dirname, '..', 'data');

const FILES = {
  leads: join(DATA_DIR, 'leads.json'),
  settings: join(DATA_DIR, 'settings.json'),
  reminders: join(DATA_DIR, 'reminders.json'),
};

const DEFAULT_SETTINGS = {
  commissionPercent: 3,
};

let writeQueue = Promise.resolve();

function enqueue(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function readJson(path, fallback) {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

export async function retireLeadsJson() {
  await mkdir(DATA_DIR, { recursive: true });
  let current = null;
  try {
    current = JSON.parse(await readFile(FILES.leads, 'utf8'));
  } catch (error) {
    if (!error || error.code !== 'ENOENT') current = { invalid: true };
  }
  if (Array.isArray(current) && current.length === 0) return false;
  await writeJson(FILES.leads, []);
  return true;
}

export async function ensureDataFiles() {
  await mkdir(DATA_DIR, { recursive: true });
  await retireLeadsJson();
  const settings = await readJson(FILES.settings, null);
  if (!settings || typeof settings !== 'object') {
    await writeJson(FILES.settings, DEFAULT_SETTINGS);
  }
  const reminders = await readJson(FILES.reminders, null);
  if (!Array.isArray(reminders)) {
    await writeJson(FILES.reminders, []);
  }
}

export async function getSettings() {
  await ensureDataFiles();
  const settings = await readJson(FILES.settings, DEFAULT_SETTINGS);
  return {
    commissionPercent: Number(settings.commissionPercent) || DEFAULT_SETTINGS.commissionPercent,
  };
}

export async function saveSettings(updates) {
  return enqueue(async () => {
    const current = await getSettings();
    const next = {
      commissionPercent:
        updates.commissionPercent !== undefined
          ? Number(updates.commissionPercent) || 0
          : current.commissionPercent,
    };
    await writeJson(FILES.settings, next);
    return next;
  });
}

export async function listReminders() {
  await ensureDataFiles();
  const reminders = await readJson(FILES.reminders, []);
  return Array.isArray(reminders) ? reminders : [];
}

export async function addReminder(payload) {
  return enqueue(async () => {
    const reminders = await listReminders();
    const reminder = {
      id: `rem-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...payload,
    };
    reminders.unshift(reminder);
    await writeJson(FILES.reminders, reminders);
    return reminder;
  });
}
