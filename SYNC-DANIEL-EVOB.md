# Sync Daniel → EVOB

Copia leads da aba **Leads (2024 - 2026)** (nome exacto, com espaços) na folha de Daniel para a mesma aba na folha EVOB ligada ao Apps Script. Append-only: linhas em falta, sem apagar nem sobrescrever células já gravadas.

| Papel | Folha | ID |
| --- | --- | --- |
| Destino (live `/exec`) | EVOB | `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8` |
| Fonte Meta | Daniel (Constant Circle) | `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w` |
| Aba nos dois lados | Leads (2024 - 2026) | |

Não há projecto Google Cloud nem conta de serviço. O script corre com a conta que edita a EVOB e que consegue ler a folha de Daniel.

A app (`GET /api/leads`, `tablePayload_` no Apps Script e `filterLeadsForApp` no Mini) aplica o mesmo corte. A aba «Inbound META» não entra na app nem neste sync.

## Corte de data

Só se acrescentam linhas cuja data de contacto é **>= 2026-09-01**, dia de calendário **Europe/Lisbon** (inclusive).

1. Se a coluna **timestamp** (coluna A, mesmo com cabeçalho vazio, `Data`, `Timestamp` ou um número tipo `4`) tiver um dia **>= 2026-09-01**, esse dia ganha. É o instante das leads Meta novas.
2. Senão, usar **Data Contacto** quando a célula for legível: ISO, `YYYY-MM-DD`, `DD.MM.YY` (`04.10.24 - 12h`), `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY`.
3. Se **Data Contacto** estiver vazia ou ilegível, usar o timestamp na mesma.
4. Sem uma data legível, a linha não entra no sync nem na lista da app.

Um instante com `Z` ou desfasamento numérico converte-se para Lisboa. `2024-10-03 22:15:37`, `dd.mm.aa`, `dd/mm/aaaa` e `aaaa-mm-dd` sem fuso ficam no dia escrito (é o dia da folha).

`PATCH /api/leads/:id` continua a gravar pelo número da linha, mesmo que essa linha seja anterior ao corte ou já não apareça na lista. O corte é da população da app, não um bloqueio de escrita por id.

## Chave (append-only)

`telefone|nome|dia` em que:

- `telefone` são só os dígitos; se não houver, usa-se o e-mail em minúsculas; se também não houver, o nome dobrado;
- `nome` é o nome dobrado (minúsculas, sem acentos);
- `dia` é o dia de contacto em Lisboa (`aaaa-mm-dd`).

Se a chave já existe na EVOB, a linha de Daniel é ignorada. Dias diferentes são chaves diferentes. Nada do que já está na EVOB é reescrito.

## Cabeçalhos

O mapeamento é o de [`shared/inboundMeta.js`](shared/inboundMeta.js) (o mesmo em `Code.gs`): `Nome` aceita `Nome Paciente`, `Email` aceita `E-mail`, `Comentários` aceita `Observações`, `Estado` aceita `Legenda`, `Médico` aceita `Médico Orçamento Médico Tratamento`, `Nº Paciente Definitivo` aceita `Nº paciente`.

- Se a aba EVOB não existir, `syncDanielToEvob` pára. O MacMiner cria a aba **Leads (2024 - 2026)** na folha `1tayieZB…` (pode copiar a linha 1 de Daniel).
- Se a aba existir vazia, a primeira execução copia os cabeçalhos de Daniel.
- Um cabeçalho que exista em Daniel e não tenha coluna equivalente na EVOB é acrescentado uma vez no fim da linha 1. Células já preenchidas não mudam.

## Como correr

1. No projecto Apps Script ligado à folha EVOB, manter [`backend-gas/Code.gs`](backend-gas/Code.gs) e [`backend-gas/SyncDaniel.gs`](backend-gas/SyncDaniel.gs) no mesmo projecto.
2. A conta de execução precisa de leitura em Daniel e de edição na EVOB.
3. No editor, escolher a função `syncDanielToEvob` e **Executar**.
4. O registo devolve `appended`, `skippedDate`, `skippedExisting`, `skippedNameless`.

`syncDanielToEvob` não está ligada a `doGet` / `doPost`. O `/exec` público não dispara o sync.

## MacMiner

Etiqueta sugerida depois de publicado: `MacMini-leads-tab-2024-v1`.

1. Confirmar que a folha EVOB `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8` tem a aba **Leads (2024 - 2026)**. Se faltar, criá-la com esse nome exacto antes de publicar.
2. Colar `Code.gs` (e `SyncDaniel.gs` se o sync for correr neste projecto).
3. **Implementar → Gerir implementações → lápis → Nova versão**. O URL `/exec` mantém-se. Sem esta versão, o Mini continua a falar com o script antigo.
4. No Mini: actualizar o código, `npm ci && npm run build` se a build mudou, e reiniciar o serviço (`launchctl kickstart -k gui/$(id -u)/org.evault.leads`).
5. `GET /api/health` deve mostrar `"sheetTab":"Leads (2024 - 2026)"` e `"contactCutoff":"2026-09-01"`.
