# Sync Daniel → EVOB

O sync vive neste repositório: [`backend-gas/SyncDaniel.gs`](./backend-gas/SyncDaniel.gs) mais `action=sync` em [`backend-gas/Code.gs`](./backend-gas/Code.gs). Cola-se no projecto **já ligado** à folha EVOB, «Leads Inbound META evob» (`1aAKXH7TnV17uCemEol56X_0NNs6ZVAF3LrBpZHf9ZoaRlw8rn26t1_mo`). Não se cria outro Apps Script, projecto Google Cloud, conta de serviço nem billing. O corte continua **2026-09-01** (`CONTACT_CUTOFF_DAY`).

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

## Porque a EVOB ficou em 8

Em 28 Set 2026 o projecto «Leads Inbound META evob» tinha **0 gatilhos**. `syncDanielToEvob` nunca foi agendado: nada copiava o Daniel para a EVOB. A execução falhada `doGet` (Execution API, Head, ~22:44 PT) não é uma corrida de sync. Pode ignorar-se.

A conta **evobtob** tem permissão de editor na folha de Daniel, por isso `SpreadsheetApp.openById` funciona quando o script corre como essa conta. Não faz falta conta de serviço.

## Setup para o MacMiner

Abra este projecto, não um novo:

[Leads Inbound META evob](https://script.google.com/d/1aAKXH7TnV17uCemEol56X_0NNs6ZVAF3LrBpZHf9ZoaRlw8rn26t1_mo/edit)

ID `1aAKXH7TnV17uCemEol56X_0NNs6ZVAF3LrBpZHf9ZoaRlw8rn26t1_mo`, ligado à folha EVOB `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8`. Autorize com a conta que edita as duas folhas (evobtob já edita o Daniel).

1. **Colar.** Substitua o `Code.gs` pelo de [`backend-gas/Code.gs`](./backend-gas/Code.gs) (traz `action=sync` e mantém `CONTACT_CUTOFF_DAY = '2026-09-01'`). **Ficheiro → Novo → Ficheiro de script**, nome `SyncDaniel`, cole [`backend-gas/SyncDaniel.gs`](./backend-gas/SyncDaniel.gs). Guarde. Não crie outro projecto.
2. **Autorizar.** No selector, escolha `syncDanielToEvob` → **Executar**. Aceite o acesso a folhas de cálculo (as duas folhas). Não é um projecto Cloud.
3. **Gatilho.** **Accionadores → Adicionar accionador**. Função `syncDanielToEvob`, origem **Orientado por tempo**, temporizador de minutos, **a cada 15 minutos** (ou 30). Hoje há zero; este passo é o que faltava. Em alternativa, corra `installDanielSyncTrigger` uma vez (15 minutos; se já existir um gatilho com esse nome, não cria outro).
4. **Correr uma vez.** Execute `syncDanielToEvob` no editor (se o passo 2 já tiver terminado a corrida, esta segunda mostra `inserted: 0` e `skipped` igual a `scanned` — é o resultado certo). Em **Execuções**, o registo traz `cutoff: "2026-09-01"` e `danielTab: "Leads (2024 - 2026)"`. `errors` a 0. A EVOB com coluna A ≥ 2026-09-01 deve aproximar-se das 29 do Daniel. Na primeira corrida com a EVOB ainda em 8, espere algo como `{"ok":true,"scanned":29,"inserted":21,"skipped":8,"errors":0}`.
5. **Republicar** a aplicação web, porque o código acrescenta `action=sync`: **Implementar → Gerir implementações → lápis → Nova versão**. O URL `/exec` mantém-se. O gatilho e o Executar do editor usam o código gravado e já escreveram na folha no passo 4. A versão nova só é precisa para o Mini chamar `action=sync`. `action=leads`, `update`, `create` e `health` não mudam. O `/exec` que já está no ar lista as linhas novas mesmo antes desta versão, porque lê a mesma aba.

No Mini, depois do pull: `POST /api/leads/sync` corre o sync e apaga a cache da lista. Sem esse endpoint, um refresh da PWA chega, desde que o passo 4 já tenha corrido: o refresh lê a EVOB.

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

Checklist: colar em «Leads Inbound META evob», autorizar, criar o gatilho de `syncDanielToEvob` (15–30 min), correr uma vez, republicar a web app por causa de `action=sync`. A EVOB ≥ 2026-09-01 aproxima-se das 29 do Daniel e o Mini mostra ~29 depois de refrescar.
