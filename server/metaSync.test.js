import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dataDir = await mkdtemp(join(tmpdir(), 'gosmile-leads-'));
process.env.DATA_DIR = dataDir;
process.env.EVAULT_NO_LISTEN = '1';

const { createApp } = await import('./index.js');

const csv = [
  '"Data Contacto","Nome Paciente","Telefone","E-mail","O que gostaria de melhorar no seu sorriso?","Que tipo de tratamento está a considerar?","Em que fase está neste momento?","Quando gostaria de avançar?","Já conhece ou foi acompanhado na Go Smile?","Como prefere que a equipa entre em contacto consigo?"',
  '"2026-09-20T17:14:04.000Z","Ida Cristina Albuquerque Malho Rodrigues de Oliveira","351962852158","cristina.oliveira.consult@gmail.com","substituir_dentes_em_falta","outro_tratamento","quero_marcar_uma_consulta","o_mais_rapidamente_possível","não,_seria_a_primeira_vez","whatsapp"',
].join('\n');

test('POST /api/sync/meta stores Inbound META answers on the lead', async (t) => {
  const app = createApp();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });

  const synced = await fetch(`http://127.0.0.1:${port}/api/sync/meta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv }),
  });
  assert.equal(synced.status, 200);
  const body = await synced.json();
  assert.equal(body.created, 1);

  const listed = await fetch(`http://127.0.0.1:${port}/api/leads`);
  const leads = await listed.json();
  const ida = leads.find((lead) => lead.email === 'cristina.oliveira.consult@gmail.com');
  assert.ok(ida);
  assert.equal(ida.meta.smileGoal, 'substituir_dentes_em_falta');
  assert.equal(ida.meta.treatment, 'outro_tratamento');
  assert.equal(ida.meta.stage, 'quero_marcar_uma_consulta');
  assert.equal(ida.meta.timing, 'o_mais_rapidamente_possível');
  assert.equal(ida.meta.knowsClinic, 'não,_seria_a_primeira_vez');
  assert.equal(ida.meta.contactPreference, 'whatsapp');
  assert.equal(ida.source, 'Inbound META');
  assert.equal(ida.status, 'new');
});
