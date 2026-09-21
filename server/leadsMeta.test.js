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

test('POST /api/leads keeps Inbound META answers from a sheet-shaped row', async (t) => {
  const app = createApp();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });

  const created = await fetch(`http://127.0.0.1:${port}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'Nome Paciente': 'Ida Cristina Albuquerque Malho Rodrigues de Oliveira',
      Telefone: '351962852158',
      'E-mail': 'cristina.oliveira.consult@gmail.com',
      'Data Contacto': '2026-09-20T17:14:04.000Z',
      'O que gostaria de melhorar no seu sorriso?': 'substituir_dentes_em_falta',
      'Que tipo de tratamento está a considerar?': 'outro_tratamento',
      'Em que fase está neste momento?': 'quero_marcar_uma_consulta',
      'Quando gostaria de avançar?': 'o_mais_rapidamente_possível',
      'Já conhece ou foi acompanhado na Go Smile?': 'não,_seria_a_primeira_vez',
      'Como prefere que a equipa entre em contacto consigo?': 'whatsapp',
    }),
  });
  assert.equal(created.status, 201);
  const lead = await created.json();
  assert.equal(lead.meta.smileGoal, 'substituir_dentes_em_falta');
  assert.equal(lead.meta.contactPreference, 'whatsapp');
  assert.equal(lead.meta.location, undefined);
});
