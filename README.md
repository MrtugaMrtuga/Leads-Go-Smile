# eVault Leads

PWA local de CRM de leads para **https://leads.evob.org**, pensada para correr sozinha num **Mac Mini**.

Não usa APIs pagas nem serviços externos: sem Gemini, sem Google Apps Script, sem Firebase, sem Google Sheets em direto, sem n8n. Os dados ficam em JSON em `./data/` e o frontend só fala com `/api` no mesmo origin.

PIN de acesso: **2000** (guardado em `sessionStorage` até fechar o separador).

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
