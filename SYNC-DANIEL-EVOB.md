# Sync Daniel → EVOB

O sync vive neste repositório: [`backend-gas/SyncDaniel.gs`](./backend-gas/SyncDaniel.gs), no mesmo projecto Apps Script da EVOB. Não há projecto Google Cloud, conta de serviço nem billing. O corte continua **2026-09-01** (`CONTACT_CUTOFF_DAY`).

Etiqueta sugerida: `MacMini-daniel-sync-v1`.

## Folhas (verificadas)

| | ID | Nome |
| --- | --- | --- |
| EVOB (script + `/exec`) | `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8` | aba **Leads (2024 - 2026)** |
| Daniel (Constant Circle) | `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w` | ficheiro **Leads - Go Smile**, aba **Leads (2024 - 2026)** |

«Leads - Go Smile» é o **título do ficheiro** de Daniel, não o nome da aba. A aba com as leads chama-se exactamente **Leads (2024 - 2026)** (a mesma da EVOB). O script só usa «Leads - Go Smile» como aba se a aba verificada não existir.

A aba «Inbound META» da folha de Daniel não entra no sync. Em 28 Set 2026 tinha 2 linhas e cabeçalhos diferentes (Nome Paciente, Data Contacto na coluna A). Não é a fonte das 29 leads.

Contagens em 28 Set 2026 (Europe/Lisbon), coluna A ≥ 2026-09-01: Daniel **29**, EVOB **8**, API **8**. A app está certa face à EVOB. A EVOB é que está atrás do Daniel.

## O que o sync faz

1. Lê a aba de Daniel. Uma linha candidata tem **Nome** preenchido e a **coluna A** (cabeçalho `4`, timestamp) com dia de calendário Europe/Lisbon **≥ 2026-09-01**. Data Contacto não conta.
2. Compara com **todas** as linhas com Nome na EVOB. A chave é a de `syncLeadKey`: `{telefone só com dígitos, senão email em minúsculas, senão nome dobrado}|{nome dobrado}|{dia}`.
3. Se a chave já existe, **ignora**. Não altera Estado, Comentários, Data fecho nem qualquer outra célula dessa linha.
4. Se a chave é nova, **acrescenta** uma linha no fim da EVOB. Copia as colunas mapeadas que o Daniel tiver preenchidas, incluindo CRM (Estado, Comentários, …) **nessa linha nova**. Não cria cabeçalhos. Não apaga duplicados que já estejam na EVOB.
5. Uma segunda execução das mesmas linhas devolve `inserted: 0`.
6. Devolve e regista `{ scanned, inserted, skipped, errors }`.

Duas linhas iguais no Daniel: entra a primeira, as seguintes contam como `skipped`.

## Mapa de colunas

Cabeçalhos lidos na aba de Daniel em 28 Set 2026, da coluna A à Q. O match é pelo nome dobrado (sem acentos, minúsculas), com os aliases de `shared/inboundMeta.js` / `COLUMN_DEFS` em `Code.gs`. A ordem das colunas pode diferir.

| Daniel (verificado) | Chave | EVOB (cabeçalho ou alias) |
| --- | --- | --- |
| `4` | timestamp | `4`, Timestamp, Data, Carimbo de data/hora |
| Origem | origem | Origem |
| Nome | nome | Nome, Nome Paciente, Nome do paciente |
| Email | email | Email, E-mail |
| Telefone | telefone | Telefone |
| Responsável | responsavel | Responsável |
| Data Contacto | data_contacto | Data Contacto, Data de contacto |
| Comentários | observacoes | Comentários, Observações (texto cru, com `[status:…]` se existir) |
| Data Primeira Consulta | data_primeira_consulta | Data Primeira Consulta |
| Médico | medico_orcamento | Médico, Médico Orçamento Médico Tratamento |
| Nº Paciente Definitivo | numero_paciente | Nº Paciente Definitivo, Nº paciente |
| Estado | estado | Estado, Legenda |
| Data Próxima Consulta | data_proxima_consulta | Data Próxima Consulta |
| Orçamentado | orcamentado | Orçamentado |
| Pagamento | pagamento | Pagamento |
| Financiamento | financiamento | Financiamento |
| Valor Real Bruto | valor_real_bruto | Valor Real Bruto |
| (não existe) | data_fecho | Data fecho — o sync não escreve nesta coluna e não a cria |

Colunas extra de um lado ou do outro ficam de fora. O sync não acrescenta cabeçalhos.

## Setup para o MacMiner

A conta que corre o script (a do «Executar como: Eu») tem de conseguir **editar as duas folhas**. O script continua **ligado à folha EVOB**. `SpreadsheetApp.openById` abre a de Daniel. Na primeira execução o Google pede autorização de folhas de cálculo. Isso não é um projecto Cloud.

1. Abra a folha EVOB `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8` → **Extensões → Apps Script**.
2. Confirme que [`Code.gs`](./backend-gas/Code.gs) está colado (inclui `action=sync` e o corte `2026-09-01`).
3. **Ficheiro → Novo → Ficheiro de script**. Nome: `SyncDaniel`. Apague o exemplo e cole [`backend-gas/SyncDaniel.gs`](./backend-gas/SyncDaniel.gs). Guarde os dois.
4. No selector de funções, escolha `syncDanielToEvob` → **Executar**. Autorize com a conta que edita as duas folhas. Não crie projecto Google Cloud nem conta de serviço.
5. **Execuções** (ou Registos): o retorno é JSON, por exemplo `{"ok":true,"scanned":29,"inserted":21,"skipped":8,"errors":0,"cutoff":"2026-09-01","danielTab":"Leads (2024 - 2026)"}`. `errors` deve ser 0. `danielTab` deve ser `Leads (2024 - 2026)`.
6. Gatilho: **Accionadores → Adicionar accionador**. Função `syncDanielToEvob`, origem **Orientado por tempo**, tipo **Temporizador de minutos**, intervalo **A cada 15 minutos** (ou 30). Falha de notificação: diária, para o seu email.
   Em alternativa, corra uma vez `installDanielSyncTrigger` no editor. Se já existir um gatilho para `syncDanielToEvob`, não cria outro. Para mudar de 30 para 15, apague o antigo e volte a criar.
7. **Implementar → Gerir implementações → lápis → Nova versão**. O URL `/exec` mantém-se. Sem versão nova, o Mini não tem `action=sync`. O gatilho e o «Executar» do editor usam o código gravado, não a versão publicada: a corrida manual do passo 4 já escreve na EVOB.
8. No Mini, depois do pull: `POST /api/leads/sync` (ou só refrescar a lista). O endpoint chama `action=sync` e apaga a cache da lista (`clearLeadsListCache`). O segredo não sai do Mini.

`action=leads`, `update`, `create` e `health` mantêm-se. O `/exec` antigo, mesmo antes da versão nova, passa a listar as linhas que o passo 4 acrescentou, porque lê a mesma aba.

## Como verificar Daniel vs EVOB

Conte à mão, nas duas folhas, aba **Leads (2024 - 2026)**:

- Nome preenchido
- Coluna A (cabeçalho `4`) com dia ≥ **2026-09-01** em Europe/Lisbon
- Data Contacto não entra na conta

Em 28 Set 2026 o Daniel tinha **29** e a EVOB **8**. Depois de uma corrida, a EVOB deve aproximar-se de 29 (`inserted` cerca de 21, `skipped` cerca de 8, se ninguém tiver acrescentado linhas entretanto). A segunda corrida: `inserted: 0`, `skipped` igual a `scanned`.

No Mini:

```bash
curl -s -X POST http://127.0.0.1:3040/api/leads/sync
curl -s http://127.0.0.1:3040/api/leads | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).length))"
```

O `POST` devolve `scanned`, `inserted`, `skipped`, `errors` e `cacheCleared: true`. A lista a seguir deve andar à volta de **29**. Se o PWA só refrescar a EVOB, o número sobe na mesma depois do sync do editor ou do gatilho — o refresh lê a EVOB, não o Daniel.

Checklist: publicar versão nova do Apps Script, criar ou corrigir o gatilho (15–30 min), correr o sync uma vez, confirmar que a EVOB ≥ 2026-09-01 se aproxima das 29 do Daniel, e que o Mini mostra ~29 depois de refrescar.
