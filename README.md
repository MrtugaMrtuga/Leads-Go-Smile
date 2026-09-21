# GoSmile Leads

PWA de CRM para **https://leads.evob.org**, look **GoSmile V2-pt**, a correr no **Mac Mini** (Node na porta **3040**).

A fonte de verdade é a Google Sheet `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8`, aba **Inbound META**, via Apps Script grátis (`/exec`). Não há projecto Google Cloud, conta de serviço nem billing. A aba «Leads (2024 - 2026)» não é lida nem escrita. O histórico que estava em `data/leads.json` deixa de contar: no arranque o ficheiro fica `[]` e não volta a ser carregado. A folha anterior (`1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w`) já não é usada.

O browser só fala com `/api` no mesmo origin. O segredo do Apps Script fica no Mini (`APPS_SCRIPT_SECRET`) e não entra no frontend.

PIN de acesso: **2000** (sessionStorage `gosmile-leads-unlocked`).

## Pipeline (Inbox, Marcadas, Descartadas)

A cor ao lado do nome e as listas vêm da coluna **Legenda** e do prefixo em **Observações**. Não há variável nova no Mini. A única coluna que o script pode acrescentar é **Data fecho**.

| UI | Legenda | Observações |
| --- | --- | --- |
| Amarelo, inbox, «Não atendeu» ou contactada | `Em processamento` | `[status:processing]` ou `[status:contacted]` |
| Verde, Marcadas (agendada) | `Marcada` | `[status:scheduled]` |
| Vermelho, Descartadas | `Descartada` | `[status:discarded]` e `[motivo:…]` obrigatório |
| Data em que saiu da inbox | **Data fecho** (o script cria a coluna se não existir) | `[fecho:…]` com a mesma data ISO |

O separador do fundo chama-se **Estatísticas** (já não «Dashboard»). Mostra quantidade e percentagem de todas as leads: total, descartadas, marcadas, em processamento, e cada outro estado que exista. **Evolução temporal** (por dia e por semana, Europe/Lisbon, semana à segunda) mostra entradas pela Data Contacto, fecho positivo (só marcadas) e fecho total (marcadas + descartadas), em lista e num gráfico de barras. A percentagem é face às entradas do mesmo período. A data do fecho é **Data fecho**; se uma lead antiga não a tiver, conta pela Data Contacto.

A vista pede `GET /api/stats` (os mesmos totais, calculados no servidor a partir da folha). Enquanto a resposta não chega, usa as leads já carregadas com as mesmas funções.

O mapa completo está em [backend-gas/README.md](./backend-gas/README.md).

Publicar uma versão nova do Apps Script depois deste código. `APPS_SCRIPT_URL` e `APPS_SCRIPT_SECRET` não mudam.

## Arranque local

**Pré-requisitos:** Node.js 20+

```bash
npm install
cp .env.example .env   # APPS_SCRIPT_URL e APPS_SCRIPT_SECRET
npm run dev
```

- UI (Vite): http://localhost:3000
- API (Express): http://127.0.0.1:3040/api
- O Vite faz proxy de `/api` para a porta 3040.

Sem as duas variáveis, `GET /api/leads` devolve `[]` (não lê JSON antigo).

## Produção (Mac Mini)

```bash
npm install
npm run build
PORT=3040 APPS_SCRIPT_URL='https://script.google.com/macros/s/…/exec' APPS_SCRIPT_SECRET='…' npm start
```

O servidor Express serve `dist/` e `/api` na mesma porta. Ver [DEPLOY.md](./DEPLOY.md) e [backend-gas/README.md](./backend-gas/README.md) para ligar o script à folha, publicar o `/exec` e pôr as variáveis no launchd.

## API

| Método | Caminho | Descrição |
| --- | --- | --- |
| GET | `/api/health` | Estado. `storage` é `apps-script`; `configured` diz se o Mini tem URL e segredo |
| GET | `/api/leads` | Leads da aba Inbound META (proxy server-side) |
| GET | `/api/stats` | Totais (qty e %), fecho por dia e por semana. Mesmas regras da UI. `sheetId` confirma a folha |
| POST | `/api/sync/inbound-meta` | Já não importa CSV nem JSON. Devolve a contagem actual da folha |
| POST | `/api/leads` | Acrescenta uma linha (nome, telefone, email, notas) |
| GET | `/api/leads/:id` | Lê uma lead (`id` = número da linha) |
| PATCH / PUT | `/api/leads/:id` | Grava CRM na mesma linha (observações, Legenda, motivo, contactos, consultas, médico, valor, pagamento). Descartar sem `motivo` responde 400 |
| DELETE | `/api/leads/:id` | Recusado (405). As linhas da folha não se apagam por aqui |
| GET / PUT | `/api/settings` | Comissão local |
| GET / POST | `/api/reminders` | Lembretes só em disco |

`data/settings.json` e `data/reminders.json` continuam locais. `data/leads.json` e `data/seed-leads.json` são um stub `[]`.
