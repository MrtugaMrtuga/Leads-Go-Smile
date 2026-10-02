# GoSmile Leads

PWA de CRM para **https://leads.evob.org**, look **GoSmile V2-pt**, a correr no **Mac Mini** (Node na porta **3040**).

A fonte de verdade é a Google Sheet `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8`, aba **Leads (2024 - 2026)** (nome exacto, com espaços), via Apps Script grátis (`/exec`). A folha de Daniel `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w` não é a folha ligada ao script. Não há projecto Google Cloud, conta de serviço nem billing. A aba «Inbound META» não é lida nem escrita. O histórico que estava em `data/leads.json` deixa de contar: no arranque o ficheiro fica `[]` e não volta a ser carregado.

A lista da app (`GET /api/leads`) só inclui leads cuja **coluna A** (cabeçalho literal `4`, timestamp ISO) é em ou depois de **2026-09-01** (dia de calendário Europe/Lisbon). **Data Contacto** é texto de CRM e não decide a lista. Uma gravação por id de linha não depende deste corte. O sync Daniel → EVOB está em [SYNC-DANIEL-EVOB.md](./SYNC-DANIEL-EVOB.md) (`backend-gas/SyncDaniel.gs`, corte na mesma data). Etiqueta sugerida: `MacMini-daniel-sync-v1`.

O browser só fala com `/api` no mesmo origin. O segredo do Apps Script fica no Mini (`APPS_SCRIPT_SECRET`) e não entra no frontend.

PIN de acesso: **2000** (sessionStorage `gosmile-leads-unlocked`).

## Cache (stale-while-revalidate)

A Google Sheet continua a ser a única fonte de verdade. `data/leads.json` não é lido. Etiqueta sugerida: `MacMini-leads-swr-v1`.

`GET /api/leads` guarda a última lista boa em memória durante **5 min** (`LEADS_CACHE_TTL_MS`, omissão 300000) e, em paralelo, em `data/leads-cache.json`. Esse ficheiro só acelera o arranque: não se restaura como base e pode apagar-se. Se a cache está dentro do TTL, a resposta sai logo (`X-Leads-Cache: hit`). Se está velha, a resposta sai logo com esses dados (`stale`) e o Mini pede a folha em fundo. Só sem cache nenhuma (arranque a frio) o pedido espera pelo Apps Script (`miss`). A segunda chamada com a cache quente fica abaixo de 1s. `GET /api/leads?fresh=1` espera pela revalidação que já está a correr e, dentro do TTL, continua a ser um `hit`.

`POST /api/leads/refresh` relê a folha mesmo dentro do TTL do Mini e responde com a lista e `X-Leads-Cache: refresh`. Não apaga a cache antes do pedido: se já houver uma leitura da folha a correr, espera por essa (uma ida ao Apps Script, não duas) e depois substitui a memória. `data/leads-cache.json` grava-se depois da resposta. Se a folha falhar, a lista anterior mantém-se. No cabeçalho o controlo é um ícone de setas circulares (`aria-label="Atualizar"`), desactivado e a rodar enquanto o pedido vai; esse estado pinta-se no toque, antes do `await`. A lista no browser (`gosmile-leads-swr-v1`) escreve-se depois do paint. O corte mantém-se `2026-09-01`. Etiqueta sugerida: `MacMini-leads-refresh-v3`.

## Latência do Actualizar

Dois fumos no Mini, sem sync no meio:

| Chamada | Tempo | O que era |
| --- | --- | --- |
| `POST /api/leads/refresh` a frio | **~79s** | `/exec` frio. O Mini corta aos 55s e tenta outra vez. |
| `POST /api/leads/refresh` #1, `/exec` já quente | **3,5s** | Leitura da folha no Apps Script. |
| `POST /api/leads/refresh` #2, quente | **7,5s** | A mesma leitura outra vez (o botão pedia `fresh=1` e ignorava a cache). |
| `action=leads` directo ao `/exec` | **6,3s** | O salto é o script, não o Mini. |
| `GET /api/leads` com a cache do Mini | **0,002s** | Já está bem. Não é o alvo. |

O alvo de **menos de 2–3s** é um Actualizar com **hit** no `CacheService` (`X-Leads-Gas-Cache: hit`). A leitura da folha, mesmo quente, ficou em 3–8s e não cabe nesse alvo.

O que o script faz agora (publicar **versão nova** do `/exec`, senão o Mini muda e a folha não):

- `action=leads` sem `fresh=1` devolve o JSON filtrado (≥ 2026-09-01) do `CacheService` durante **300s** (5 min). Um hit não abre a grelha. `update`, `create` e um sync que inseriu linhas chamam `bumpLeadsCache_`.
- O Actualizar **não** manda `fresh=1`. Passa pelo Mini (não usa a memória dos 5 min) e usa essa cache. `POST /api/leads/refresh?fresh=1` força a leitura, para medir o miss.
- A leitura, quando acontece, é a coluna do timestamp e depois só as colunas mapeadas do bloco do corte (`X-Leads-Columns` vs `X-Leads-Sheet-Columns`). A lista devolve só `leads` (`rowsOmitted`): médico, data da consulta, valor e `contactDay` já vêm no objecto. O Mini usa esse array. `update` e `create` continuam a devolver `headers` + `row`.
- O Node, a cada **60s** (`LEADS_WARM_MS`, omissão 60000; mínimo aceite 60000; `0` desliga), chama `action=leads` **sem** `fresh=1`. O intervalo fica abaixo do TTL de 300s do `CacheService`, por isso o `/exec` costuma responder com hit. Se a cache expirou, o script relê a folha e o Mini guarda essa lista, para o GET seguinte não esperar pelo `/exec`. `LEADS_WARM_ACTION=ping` só acorda o script e não enche a cache. O LaunchAgent [deploy/org.evault.leads.warm.plist](./deploy/org.evault.leads.warm.plist) é opcional e só entra se o intervalo do Node estiver desligado.
- A leitura não espera pelo sync de Daniel. A fila de leitura é outra. Um refresh não fica atrás de `action=sync`.

Como medir, depois do pull, do restart e da versão nova:

```bash
# Hit: X-Leads-Gas-Cache: hit e X-Leads-Gas-Ms por baixo de 3000.
# Acontece dentro de 300s depois de uma leitura da folha (refresh?fresh=1, ou o warm action=leads quando a cache expirou).
# O warm por omissão corre a cada 60s, antes desse TTL.
# LEADS_WARM_ACTION=ping não enche a cache. O warm por omissão é action=leads sem fresh=1.
curl -sS -D - -o /tmp/leads.json -X POST http://127.0.0.1:3040/api/leads/refresh

# Miss, a leitura de ~3–8s já medida. Não é o alvo de 2–3s.
curl -sS -D - -o /dev/null -X POST 'http://127.0.0.1:3040/api/leads/refresh?fresh=1'

# Frio: LEADS_WARM_MS=0, esperar mais de 10 min, repetir o primeiro curl.
# Pode voltar às dezenas de segundos. Não contar isso como o alvo.
```

`X-Leads-Gas-Age-Ms` é a idade do JSON em cache. Uma gravação pela app zera a cache. Uma edição feita à mão na folha aparece no próximo `fresh=1` ou quando os 300s passam. `X-Leads-Sheet-Read: unknown` quer dizer que o `/exec` ainda é a versão antiga.

| Estado | Esperado |
| --- | --- |
| Quente, cache do script ainda válida | menos de 2–3s (`X-Leads-Gas-Cache: hit`) |
| Quente, cache vazia (`?fresh=1` ou TTL a passar) | 3–8s, como no fumo (3,5s / 7,5s / 6,3s) |
| `/exec` frio | pode voltar aos ~79s |

O log está em `/tmp/evault-leads.out.log` (`gas action=… cache=hit|miss`). A folha continua a ser a fonte de verdade: o hit é uma leitura dessa folha com menos de 300s, invalidada quando a app escreve. O Horário é instantâneo porque lê uma célula (`Config!A1`). A lista de leads não cabe numa célula; o caminho curto é este hit.

Sync Daniel → EVOB continua a ler a aba inteira (`readTable_` em `SyncDaniel.gs`). Um delta por timestamp não entrou: a chave da lead é telefone + nome + dia e a folha de Daniel não tem uma coluna de revisão. O Actualizar já não espera por esse sync.

No browser, a última lista boa fica em `localStorage` (`gosmile-leads-swr-v1`). Ao abrir, se essa cache existe, a inbox aparece logo e o pedido à rede corre em fundo, sem o ecrã «A atualizar…». Sem cache, o primeiro ecrã fica em «A atualizar…». «Nenhuma lead na inbox.» só aparece depois de uma leitura concluída com zero leads, ou se a cache gravada já era uma lista vazia.

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

### Email à Carla (nova marcação)

Quando um `PATCH` deixa a lead em `scheduled` **e** com **Data Primeira Consulta** preenchida, o Mini pede ao Apps Script para enviar **um** email a `geral@gosmile.pt`. O HTML está em [templates/email-carla-marcacao/template.html](./templates/email-carla-marcacao/template.html) (Marahas re-lock 29 set 2026): título, caixa «Agendar o paciente · confirmar a ida com o paciente no dia anterior.», campos (incluindo Notas, omitida se `notes` vier vazio), rodapé curto. Assunto: `ALERTA · Nova 1ª consulta — {{nome}} — {{data}}`. A hora é Europe/Lisbon: um `datetime-local` já é hora de parede; um instante com `Z` converte-se.

O envio é `MailApp` no script ligado à folha (a conta que o implementa, em regra `evobtob@gmail.com`). Não há cliente Gmail no Mini, nem chave nova, nem projecto Cloud. O marcador `[carla-email:sent]` fica em **Comentários**, ao lado de `[status:]`, e não aparece na ficha. Uma segunda gravação, mesmo que a data mude, não reenvia. Se a data ainda estiver vazia, não envia; quando a data chega mais tarde, envia nessa altura.

Etiqueta sugerida: `MacMini-leads-carla-email-v1`. Publicar uma versão nova do `/exec` e autorizar o `MailApp` (correr `authorizeCarlaMail` uma vez no editor) antes do restart. Sem variáveis novas.

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
| POST | `/api/leads/refresh` | Pede a lista ao Apps Script (não usa a memória do Mini). Com a cache do script ainda válida responde `X-Leads-Gas-Cache: hit`. `?fresh=1` força a leitura da folha |
| POST | `/api/leads/warm` | Por omissão `action=leads` sem `fresh=1` (enche a cache se o hit expirou e o Mini fica com essa lista). `LEADS_WARM_ACTION=ping` só acorda o `/exec`. O Node repete a cada 60s |
| POST | `/api/sync/inbound-meta` | Já não importa CSV nem JSON. Devolve a contagem actual da folha |
| POST | `/api/leads` | Acrescenta uma linha (nome, telefone, email, notas) |
| GET | `/api/leads/:id` | Lê uma lead (`id` = número da linha) |
| PATCH / PUT | `/api/leads/:id` | Grava CRM na mesma linha (Comentários, Estado, motivo, consultas, médico, valor, pagamento). Descartar sem `motivo` responde 400. O id é o número da linha, também para linhas fora da lista |
| DELETE | `/api/leads/:id` | Recusado (405). As linhas da folha não se apagam por aqui |
| GET / PUT | `/api/settings` | Comissão local |
| GET / POST | `/api/reminders` | Lembretes só em disco |

`data/settings.json` e `data/reminders.json` continuam locais. `data/leads.json` e `data/seed-leads.json` são um stub `[]`. `data/leads-cache.json` é só a cópia stale-while-revalidate.
