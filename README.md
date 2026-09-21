# GoSmile Leads

PWA local de CRM de leads para **https://leads.evob.org**, look **GoSmile V2-pt** (o mesmo de gosmile.evob.org /v2 /recepcao /implantes), a correr sozinha num **Mac Mini**.

Não usa APIs pagas nem serviços externos: sem Gemini, sem Google Apps Script, sem Firebase, sem Google Sheets em directo, sem n8n. Os dados ficam em JSON em `./data/` e o frontend só fala com `/api` no mesmo origin.

PIN de acesso: **2000** (sessionStorage `gosmile-leads-unlocked`). O ecrã de PIN é HTML/CSS/JS clássico (G 144px + 4 caixas + Entrar), para o iPhone não ficar ecrã branco.

## Arranque local

**Pré-requisitos:** Node.js 20+

```bash
npm install
npm run dev
```

- UI (Vite): http://localhost:3000  
- API (Express): http://127.0.0.1:3040/api  
- O Vite faz proxy de `/api` para a porta 3040.

## Produção (Mac Mini)

```bash
npm install
npm run build
PORT=3040 npm start
```

O servidor Express serve `dist/` e `/api` na mesma porta. Ver [DEPLOY.md](./DEPLOY.md) para launchd, **Cloudflare Tunnel** (`leads.evob.org`) e Caddy.

## API

| Método | Caminho | Descrição |
| --- | --- | --- |
| GET | `/api/health` | Estado do serviço |
| GET | `/api/leads` | Lista leads |
| POST | `/api/leads` | Cria lead (`name` obrigatório) |
| GET | `/api/leads/:id` | Lê uma lead |
| PATCH / PUT | `/api/leads/:id` | Actualiza lead (também aceita campos PT: Nome, Telefone, …) |
| DELETE | `/api/leads/:id` | Apaga lead |
| GET / PUT | `/api/settings` | Comissão local |
| GET / POST | `/api/reminders` | Lembretes só em disco (sem email) |

Ficheiros: `data/leads.json`, `data/settings.json`, `data/reminders.json`. Se `leads.json` não existir, o servidor copia `data/seed-leads.json`.

## Inbound META

O detalhe da lead mostra todas as respostas preenchidas do formulário Meta (e os campos CRM da mesma linha). O mapa coluna da Sheet → etiqueta está em `shared/inboundMeta.js`. Valores `snake_case` passam a texto legível (`substituir_dentes_em_falta` → `Substituir dentes em falta`). Campos vazios não aparecem.

A app lê a aba **Inbound META** da Sheet `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w` e grava em `data/leads.json` (telefone ou email identificam a mesma pessoa; o estado, as notas, o médico, a consulta e o valor já editados na app mantêm-se).

`POST /api/sync/meta` corre ao abrir a app e no botão **Actualizar**. Sem service account e sem faturação Google Cloud.

Por omissão usa o CSV público:

`https://docs.google.com/spreadsheets/d/1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w/gviz/tq?tqx=out:csv&sheet=Inbound%20META`

Se a Sheet deixar de estar legível por link, defina um destes:

| Variável | Uso |
| --- | --- |
| `SCRIPT_URL` | Web app Apps Script (gratuito) que faz `GET` e devolve JSON: uma lista, ou `{ "data": [ ... ] }` / `{ "leads": [ ... ] }` com os nomes das colunas. Tem prioridade sobre o CSV. |
| `META_SHEET_CSV_URL` | URL CSV alternativa |
| `META_SHEET_ID` | Id da Sheet (omissão: o id acima) |
| `META_SHEET_TAB` | Nome da aba (omissão: `Inbound META`) |

Também aceita `POST /api/sync/meta` com `{ "csv": "..." }` ou `{ "rows": [ { "Nome Paciente": "..." } ] }` para importar sem rede.

Não é preciso Apps Script enquanto o CSV público responder.
