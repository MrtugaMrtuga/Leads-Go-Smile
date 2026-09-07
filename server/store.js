import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');

const FILES = {
  leads: join(DATA_DIR, 'leads.json'),
  settings: join(DATA_DIR, 'settings.json'),
  reminders: join(DATA_DIR, 'reminders.json'),
};

const DEFAULT_SETTINGS = {
  commissionPercent: 3,
};

const writeQueue = Promise.resolve();

function enqueue(task) {
  const next = writeQueue.then(task, task);
  return next;
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

export async function ensureDataFiles() {
  await mkdir(DATA_DIR, { recursive: true });
  const leads = await readJson(FILES.leads, null);
  if (!Array.isArray(leads)) {
    const seed = await readJson(join(DATA_DIR, 'seed-leads.json'), []);
    await writeJson(FILES.leads, seed);
  }
  const settings = await readJson(FILES.settings, null);
  if (!settings || typeof settings !== 'object') {
    await writeJson(FILES.settings, DEFAULT_SETTINGS);
  }
  const reminders = await readJson(FILES.reminders, null);
  if (!Array.isArray(reminders)) {
    await writeJson(FILES.reminders, []);
  }
}

export async function listLeads() {
  await ensureDataFiles();
  const leads = await readJson(FILES.leads, []);
  return Array.isArray(leads) ? leads : [];
}

export async function getLead(id) {
  const leads = await listLeads();
  return leads.find((lead) => String(lead.id) === String(id)) || null;
}

function nextId(leads) {
  const nums = leads
    .map((lead) => Number.parseInt(String(lead.id), 10))
    .filter((n) => Number.isFinite(n));
  return String((nums.length ? Math.max(...nums) : 1000) + 1);
}

export async function createLead(input) {
  return enqueue(async () => {
    const leads = await listLeads();
    const now = new Date().toISOString();
    const id = nextId(leads);
    const lead = {
      id,
      externalId: id,
      name: String(input.name || '').trim() || 'Sem Nome',
      phone: String(input.phone || '').trim(),
      email: String(input.email || '').trim(),
      timestamp: input.timestamp || now,
      status: input.status || 'new',
      isContacted: Boolean(input.isContacted) || input.status === 'contacted',
      notes: input.notes || '',
      doctor: input.doctor || '',
      appointmentDate: input.appointmentDate || '',
      value: Number(input.value) || 0,
      source: input.source || 'Manual',
    };
    leads.unshift(lead);
    await writeJson(FILES.leads, leads);
    return lead;
  });
}

export async function updateLead(id, updates) {
  return enqueue(async () => {
    const leads = await listLeads();
    const index = leads.findIndex((lead) => String(lead.id) === String(id));
    if (index === -1) return null;

    const current = leads[index];
    const next = {
      ...current,
      ...updates,
      id: current.id,
      externalId: current.externalId || current.id,
    };

    if (updates.value !== undefined) next.value = Number(updates.value) || 0;
    if (updates.status === 'contacted' || updates.isContacted) next.isContacted = true;
    if (updates.status === 'new') next.isContacted = false;

    leads[index] = next;
    await writeJson(FILES.leads, leads);
    return next;
  });
}

export async function deleteLead(id) {
  return enqueue(async () => {
    const leads = await listLeads();
    const index = leads.findIndex((lead) => String(lead.id) === String(id));
    if (index === -1) return false;
    leads.splice(index, 1);
    await writeJson(FILES.leads, leads);
    return true;
  });
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
