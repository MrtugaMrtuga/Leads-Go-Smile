# GoSmile Leads

PWA de CRM para **https://leads.evob.org**, look **GoSmile V2-pt**, a correr no **Mac Mini** (Node na porta **3040**).

A fonte de verdade é a Google Sheet `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8`, aba **Leads (2024 - 2026)** (nome exacto, com espaços), via Apps Script grátis (`/exec`). A folha de Daniel `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w` não é a folha ligada ao script. Não há projecto Google Cloud, conta de serviço nem billing. A aba «Inbound META» não é lida nem escrita. O histórico que estava em `data/leads.json` deixa de contar: no arranque o ficheiro fica `[]` e não volta a ser carregado.

A lista da app (`GET /api/leads`) só inclui leads cuja **coluna A** (cabeçalho literal `4`, timestamp ISO) é em ou depois de **2026-09-01** (dia de calendário Europe/Lisbon). **Data Contacto** é texto de CRM e não decide a lista. Uma gravação por id de linha não depende deste corte. O sync Daniel → EVOB está em [SYNC-DANIEL-EVOB.md](./SYNC-DANIEL-EVOB.md) (`backend-gas/SyncDaniel.gs`, corte na mesma data). Etiqueta sugerida: `MacMini-daniel-sync-v1`.

O browser só fala com `/api` no mesmo origin. O segredo do Apps Script fica no Mini (`APPS_SCRIPT_SECRET`) e não entra no frontend.

PIN de acesso: **2000** (sessionStorage `gosmile-leads-unlocked`).

## Cache (stale-while-revalidate)

A Google Sheet continua a ser a única fonte de verdade. `data/leads.json` não é lido. Etiqueta sugerida: `MacMini-leads-swr-v1`.

`GET /api/leads` guarda a última lista boa em memória durante **45s** (`LEADS_CACHE_TTL_MS`; no Mini, 30–60s) e, em paralelo, em `data/leads-cache.json`. Esse ficheiro só acelera o arranque: não se restaura como base e pode apagar-se. Se a cache está dentro do TTL, a resposta sai logo (`X-Leads-Cache: hit`). Se está velha, a resposta sai logo com esses dados (`stale`) e o Mini pede a folha em fundo. Só sem cache nenhuma (arranque a frio) o pedido espera pelo Apps Script (`miss`). A segunda chamada com a cache quente fica abaixo de 1s. `GET /api/leads?fresh=1` espera pela revalidação que já está a correr e, dentro do TTL, continua a ser um `hit`.

`POST /api/leads/refresh` relê a folha mesmo dentro do TTL do Mini e responde com a lista e `X-Leads-Cache: refresh`. Não apaga a cache antes do pedido: se já houver uma leitura da folha a correr, espera por essa (uma ida ao Apps Script, não duas) e depois substitui a memória. `data/leads-cache.json` grava-se depois da resposta. Se a folha falhar, a lista anterior mantém-se. No cabeçalho o controlo é um ícone de setas circulares (`aria-label="Atualizar"`), desactivado e a rodar enquanto o pedido vai; esse estado pinta-se no toque, antes do `await`. A lista no browser (`gosmile-leads-swr-v1`) escreve-se depois do paint. O corte mantém-se `2026-09-01`. Etiqueta sugerida: `MacMini-leads-refresh-v3`.

## Latência do Actualizar

No Mini, um `POST /api/leads/refresh` mediu **~79,3s** (HTTP 200, 29 leads). O alvo da clínica, com o `/exec` já quente, é **menos de 2–3s**. Um arranque a frio do Apps Script continua acima disso. Esta alteração não finge o contrário.

O que gastava esse tempo, visto no código (não é uma medição nova contra a folha):

| Hipótese | Veredito |
| --- | --- |
| Arranque a frio do `/exec` e o retry do Mini | É o que fecha os ~79s. O Mini aborta aos **55s** (`APPS_SCRIPT_TIMEOUT_MS`) e tenta outra vez. Um primeiro pedido que não responde antes do corte, mais uma leitura que depois acaba, fica à volta de 55s + a leitura (~24s no fumo). |
| Ler a aba inteira em cada `action=leads` | Era o custo fixo com o script já quente. `getDisplayValues` lia todas as linhas e colunas de «Leads (2024 - 2026)» e só depois deitava fora o que é anterior a 2026-09-01. 29 leads não precisam dessa grelha. Sozinho não explica 79s, mas explica vários segundos em cada Actualizar. |
| Fila no Mini | A v2 já junta dois refreshes à mesma leitura. A mesma fila punha o refresh **atrás** de `action=sync` (duas abas inteiras, com lock). Isso já não acontece. |
| Redirect e segredo em cada `/exec` | Cada chamada passa por `script.googleusercontent.com`. É uma ida extra, não dezenas de segundos. |
| Tamanho do JSON | A resposta já era o conjunto filtrado (29 leads) mais um array `leads` repetido. O `JSON.stringify` disso é milissegundos. Não é o fumo. |

O que mudou no script (é preciso **publicar uma versão nova** do `/exec`; sem isso o Mini muda e a folha não):

- `action=leads` lê **só a coluna do timestamp** com `getDisplayValues` (o mesmo texto que o corte já usava, não um `Date`), fica com as linhas em ou depois de 2026-09-01 e só aí faz `getDisplayValues` desse bloco (`sheetRead: "tail"`). Uma folha por ordem cronológica (linhas acrescentadas ao fundo) lê um bloco curto, não o histórico desde 2024.
- `CacheService` guarda esse JSON **30s**. `update`, `create` e um sync que inseriu linhas invalidam-no (`bumpLeadsCache_`). O Actualizar manda `fresh=1`: volta a ler a folha. Não responde com a cache do script, nem com a memória do Mini, como se fosse a folha agora.
- `action=ping` não toca na folha. O Node chama-o a cada **3 minutos** (`LEADS_WARM_MS`; `0` desliga) para o `/exec` não arrefecer. O LaunchAgent [deploy/org.evault.leads.warm.plist](./deploy/org.evault.leads.warm.plist) é opcional e só entra se esse intervalo estiver desligado.
- A leitura não espera pelo sync. Se o Google devolver HTML porque os dois pedidos se cruzaram, a leitura espera que a escrita acabe e tenta de novo.

Como medir no Mini, depois do pull, do restart do Node e da **nova versão** do Apps Script:

```bash
# Tem de aparecer X-Leads-Sheet-Read: tail.
# unknown quer dizer que o /exec ainda é a versão antiga (aba inteira).
curl -sS -D - -o /tmp/leads.json -X POST http://127.0.0.1:3040/api/leads/refresh

# Quente: repetir com o ping dos 3 min já a correr, ou logo a seguir à primeira.
# X-Leads-Gas-Cache: miss     o botão relê a folha
# X-Leads-Sheet-Read: tail
# X-Leads-Gas-Ms              ida ao Apps Script, pelo relógio do Mini. Alvo < 3000 quente.
# X-Leads-Read-Ms             só a leitura dentro do script (vem no JSON quando o script é novo)
# X-Leads-Read-Rows           linhas cujo ecrã foi lido (à volta das 29, não desde 2024)
# X-Leads-Scanned-Rows        altura da coluna do timestamp

# Frio: LEADS_WARM_MS=0, esperar mais de 10 min sem pedidos, repetir o curl.
# Esse número pode passar dos 3s. Não é o alvo da clínica.

# Cache do script (não é o botão): um GET, dentro de 30s, sem gravações.
curl -sS -D - -o /dev/null http://127.0.0.1:3040/api/leads
```

O log do Node (`/tmp/evault-leads.out.log`) escreve uma linha `gas action=… ms=… cache=… readRows=… scannedRows=…` por chamada.

Tempos esperados — não foram medidos nesta alteração contra a folha viva:

| Estado | O que acontece | Esperado |
| --- | --- | --- |
| Quente, Actualizar | `/exec` acordado, `fresh=1`, bloco do corte | à volta de 1–3s |
| Quente, cache do script | `GET` sem `fresh=1`, menos de 30s, sem update/create/sync com inserções | muitas vezes abaixo de 1s (é a rede) |
| Frio | primeira chamada depois de vários minutos sem ping | muitas vezes acima de 3s; pode bater nos 55s e no retry |

Se `X-Leads-Read-Rows` for quase igual a `X-Leads-Scanned-Rows`, as linhas do corte não estão juntas no fundo da aba e a leitura volta a ser grande. A folha continua a ser a fonte de verdade.

No browser, a última lista boa fica em `localStorage` (`gosmile-leads-swr-v1`). Ao abrir, a inbox mostra essa lista e «A atualizar…». «Nenhuma lead na inbox.» só aparece depois de uma leitura concluída com zero leads.

## Pipeline (Inbox, Marcadas, Descartadas)

A cor ao lado do nome e as listas vêm da coluna **Estado** e do prefixo em **Comentários**. Não há variável nova no Mini. A única coluna que o script pode acrescentar é **Data fecho**.

| UI | Estado | Comentários |
| --- | --- | --- |
| Amarelo, inbox, «Não atendeu» ou contactada | `Em processamento` | `[status:processing]` ou `[status:contacted]` |
| Verde, Marcadas (agendada) | `Marcada` | `[status:scheduled]` |
| Vermelho, Descartadas | `Descartada` | `[status:discarded]` e `[motivo:…]` obrigatório |
| Data em que saiu da inbox | **Data fecho** (o script cria a coluna se não existir) | `[fecho:…]` com a mesma data ISO |

Em cada lista (Inbox, Marcadas, Descartadas e as outras) a lead com a Data Contacto mais recente fica na primeira linha. Cada linha mostra o nome e o telefone sem abrir a ficha. O telefone é um link `tel:` (número português em E.164, `+351…`, quando dá para o reconhecer). Não há WhatsApp nem `wa.me`.

### Mover Marcada ↔ Em processamento

Na lista e na ficha, **Marcada** e **Em processamento** trocam nos dois sentidos com um toque. Não pede médico, data, nota nem mensagem. «Não atendeu» fica como está: amarelo, na inbox.

O browser faz `PATCH /api/leads/:id` com `{ "status": "scheduled" }` ou `{ "status": "processing" }`. O Mini traduz isso no Apps Script (`action: "update"` na aba **Leads (2024 - 2026)**):

| Toque | `status` | Estado | Comentários | Data fecho |
| --- | --- | --- | --- | --- |
| Em processamento → Marcada | `scheduled` | `Marcada` | o prefixo passa a `[status:scheduled]`; a nota anterior mantém-se | ISO de agora, só se a célula estiver vazia (`ifBlank`) |
| Marcada → Em processamento | `processing` | `Em processamento` | o prefixo passa a `[status:processing]`; a nota anterior mantém-se | a célula é limpa, como quando a lead volta à inbox |

Agendar pela ficha continua a gravar também **Data Primeira Consulta** e **Médico**. O toque livre não mexe nessas colunas.

O separador **Estatísticas** mostra a evolução de marcações e fecho. O gráfico é uma linha (preto = marcações, madeira = fecho) para 7, 30 ou 90 dias em Europe/Lisbon; 90 dias agrupa por semana, à segunda. **Linha** ou **Barras**. Por baixo, três linhas: Marcações, Fecho (marcadas + descartadas) e Descartadas, com quantidade e percentagem face às entradas do período. A data do fecho é **Data fecho**; se uma lead antiga não a tiver, conta pela Data Contacto.

O mapa completo está em [backend-gas/README.md](./backend-gas/README.md).

Publicar uma versão nova do Apps Script depois deste código (`/exec`, nova versão). `APPS_SCRIPT_URL` e `APPS_SCRIPT_SECRET` não mudam. Reiniciar o Mini depois do pull.

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
| GET | `/api/leads` | Leads da aba Leads (2024 - 2026) com data de contacto >= 2026-09-01. Cache curta no Mini (memória + `data/leads-cache.json`); `?fresh=1` espera a revalidação |
| POST | `/api/leads/sync` | Corre `action=sync` no Apps Script (Daniel → EVOB) e apaga a cache da lista. O segredo fica no Mini |
| POST | `/api/leads/refresh` | Relê a folha (`fresh=1` no Apps Script; junta-se a uma leitura já em curso) e responde `X-Leads-Cache: refresh` mais `X-Leads-Gas-Ms` / `X-Leads-Sheet-Read` |
| POST | `/api/leads/warm` | `action=ping` para o `/exec` não arrefecer. Não lê a lista. O Node também o faz a cada 3 min |
| POST | `/api/sync/inbound-meta` | Já não importa CSV nem JSON. Devolve a contagem actual da folha |
| POST | `/api/leads` | Acrescenta uma linha (nome, telefone, email, notas) |
| GET | `/api/leads/:id` | Lê uma lead (`id` = número da linha) |
| PATCH / PUT | `/api/leads/:id` | Grava CRM na mesma linha (Comentários, Estado, motivo, consultas, médico, valor, pagamento). Descartar sem `motivo` responde 400. O id é o número da linha, também para linhas fora da lista |
| DELETE | `/api/leads/:id` | Recusado (405). As linhas da folha não se apagam por aqui |
| GET / PUT | `/api/settings` | Comissão local |
| GET / POST | `/api/reminders` | Lembretes só em disco |

`data/settings.json` e `data/reminders.json` continuam locais. `data/leads.json` e `data/seed-leads.json` são um stub `[]`. `data/leads-cache.json` é só a cópia stale-while-revalidate.
