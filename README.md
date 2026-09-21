# GoSmile Leads

PWA local de CRM de leads para **https://leads.evob.org**, look **GoSmile V2-pt** (o mesmo de gosmile.evob.org /v2 /recepcao /implantes), a correr sozinha num **Mac Mini**.

Não usa APIs pagas: sem Gemini, sem Google Apps Script, sem Firebase, sem Service Account e sem n8n. As leads do formulário Meta entram por CSV público da aba **Inbound META** para `./data/leads.json`. O frontend só fala com `/api` no mesmo origin.

Folha: `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w`, aba por nome `Inbound META`. O dono (daniel@constantcircle.co) tem de manter a partilha por link com permissão de ver — não há conta de serviço nem billing. `POST /api/sync/inbound-meta` corre ao abrir a app.

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
| POST | `/api/sync/inbound-meta` | Importa a aba Inbound META (CSV público) para `data/leads.json` |
| POST | `/api/leads` | Cria lead (`name` obrigatório) |
| GET | `/api/leads/:id` | Lê uma lead |
| PATCH / PUT | `/api/leads/:id` | Actualiza lead (também aceita campos PT: Nome, Telefone, …) |
| DELETE | `/api/leads/:id` | Apaga lead |
| GET / PUT | `/api/settings` | Comissão local |
| GET / POST | `/api/reminders` | Lembretes só em disco (sem email) |

Ficheiros: `data/leads.json`, `data/settings.json`, `data/reminders.json`. Se `leads.json` não existir, o servidor copia `data/seed-leads.json`.
