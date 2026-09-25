# Apps Script — Leads (2024 - 2026)

Web app grátis, ligada à folha **Leads - Go Smile**. Não há projecto Google Cloud, conta de serviço nem billing.

- Folha ligada ao Apps Script (live `/exec`): `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8`
- Folha de Daniel (Constant Circle), não ligada a este script: `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w`
- Aba única: **Leads (2024 - 2026)** (nome exacto, com espaços)
- A aba «Inbound META» não é lida nem escrita
- Lista da app: data de contacto **>= 2026-09-01** (Europe/Lisbon)
- Sync e população da aba ficam fora deste PR ([SYNC-DANIEL-EVOB.md](../SYNC-DANIEL-EVOB.md)). Etiqueta sugerida: `MacMini-leads-tab-2024-v1`

O `/exec` em produção já está ligado à folha de cima. Este ficheiro regista esse ID. Não crie outra implementação por cima do URL live só para alinhar o repositório.

O Mini (Node, porta 3040) chama este `/exec` com o segredo. O browser nunca recebe o segredo.

## 1. Ligar o script à folha

1. A folha ligada é `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8` (conta que a edita, de preferência brunoairesaugusto@gmail.com). A de daniel@constantcircle.co (`1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w`) não é a folha deste script. Criar e encher a aba **Leads (2024 - 2026)** fica fora deste PR.
2. **Extensões → Apps Script**.
3. Apague o `Code.gs` de exemplo e cole [`Code.gs`](./Code.gs).
4. Em **Definições do projecto → Mostrar ficheiro de manifesto**, confirme o [`appsscript.json`](./appsscript.json) (fuso `Europe/Lisbon`, runtime V8).
5. Guarde.

O código abre `1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8` pelo `SHEET_ID`. Mesmo assim o projecto tem de ficar **ligado a esta folha** (criado a partir dela), para a autorização ser a de Apps Script e não um projecto Cloud.

## 2. Segredo

1. No editor: **Definições do projecto → Propriedades do script → Adicionar propriedade**.
2. Propriedade: `APPS_SCRIPT_SECRET`
3. Valor: uma frase longa, por exemplo `openssl rand -hex 24`.
4. O mesmo valor vai para o Mini em `APPS_SCRIPT_SECRET`. Não o ponha no frontend, no `pin.js`, nem num commit.

Se a propriedade estiver vazia, o `/exec` recusa todos os pedidos.

## 3. Implementar a aplicação web

1. **Implementar → Nova implementação → Tipo: Aplicação web**.
2. **Executar como: Eu** (a conta que edita a folha).
3. **Quem tem acesso: Qualquer pessoa** (Anyone, anonymous).

O Mini não tem sessão Google. «Só eu» devolve a página de login e a app fica vazia. O segredo é o que impede o uso público do `/exec`.

4. Autorize o acesso à folha quando o Google pedir (âmbito de folhas de cálculo, sem conta de serviço).
5. Copie o URL que termina em `/exec`.

Para actualizar o código mais tarde: **Implementar → Gerir implementações → lápis → Nova versão**. O URL `/exec` mantém-se.

## 4. Mini

No launchd de https://leads.evob.org (porta 3040), sem commitar o segredo:

```
APPS_SCRIPT_URL=https://script.google.com/macros/s/…/exec
APPS_SCRIPT_SECRET=<o mesmo valor da propriedade do script>
```

Reinicie o serviço. `GET /api/health` deve mostrar `"storage":"apps-script","configured":true`.

## Contrato

`GET /exec?secret=…&action=leads`

Devolve JSON com `leads` (objectos com `id` = número da linha, `nome`, `telefone`, `email`, `dataContacto`, `formFields` das colunas preenchidas com o rótulo em português, e `crm`) e também `headers` + `rows` para o Mini normalizar.

`POST /exec?secret=…` com JSON:

```json
{
  "action": "update",
  "id": "2",
  "status": "contacted",
  "note": "liguei hoje",
  "noteSet": true,
  "fields": [
    { "header": "Estado", "occurrence": 1, "value": "Em processamento" }
  ]
}
```

As outras gravações só usam cabeçalhos que já existem. A excepção é **Data fecho**, criada no fim da linha 1 quando ainda não está lá.

## Colunas do pipeline

Não há variáveis novas no Mini. `APPS_SCRIPT_URL` e `APPS_SCRIPT_SECRET` chegam. A única coluna nova possível é **Data fecho**.

| O quê | Onde na aba Leads (2024 - 2026) | Valores |
| --- | --- | --- |
| Lista e cor | **Estado** (aceita **Legenda** se for esse o cabeçalho) | `Em processamento` (amarelo, fica na inbox), `Marcada` (verde, lista Marcadas), `Descartada` (vermelho, lista Descartadas). Vazio = nova, sem bola |
| Estado da app | **Comentários** (aceita **Observações**), prefixo `[status:…]` | `new`, `contacted`, `processing`, `discarded`, `scheduled`, `positive`, `completed`, `paid`. A UI não mostra o prefixo |
| Motivo do descarte | **Comentários**, linha `[motivo:…]` | Obrigatório para passar a `discarded`. Sobrevive ao reload. A UI mostra o texto, não o marcador |
| Nome, email, telefone, origem | **Nome** (ou Nome Paciente), **Email** (ou E-mail), **Telefone**, **Origem** | Leitura. O create grava a coluna A (cabeçalho `4`), Nome, Email, Telefone e Comentários |
| Marcação | **Data Primeira Consulta** e **Médico** | Já usados por Agendar, em conjunto com Estado `Marcada` |
| Corte da lista | **Coluna A** (cabeçalho literal `4`, timestamp ISO) com dia >= `2026-09-01` (Europe/Lisbon) | Só essas linhas entram em `action=leads`. Data Contacto não decide a lista. O update por id não usa este corte |
| Data do fecho | **Data fecho** (criada na primeira gravação se a coluna não existir) e, na mesma célula de Comentários, `[fecho:…]` | ISO de quando a lead saiu da inbox (marcada ou descartada). A primeira data mantém-se. Voltar à inbox apaga-a. Se faltar nas linhas antigas, a evolução usa a Data Contacto |

Na primeira vez que uma lead passa a marcada ou descartada, o script acrescenta o cabeçalho **Data fecho** no fim da linha 1, se ele ainda não existir. Não mexe nas outras colunas.

«Não atendeu» grava `[status:processing]` e Estado `Em processamento`. A lead continua na inbox. Descartar sem motivo é recusado (`Motivo é obrigatório para descartar`) e a linha não muda.

O toque **Marcada ↔ Em processamento** usa o mesmo `action: "update"`. Não cria colunas e não envia mensagem. `status: "scheduled"` grava Estado `Marcada`, `[status:scheduled]` e **Data fecho** se ainda estiver vazia. `status: "processing"` grava Estado `Em processamento`, `[status:processing]` e apaga **Data fecho**. A nota que já estava em Comentários mantém-se (`noteSet` falso). Médico e data da consulta só mudam quando o pedido os traz (o fluxo Agendar).

Depois de colar este `Code.gs`: **Implementar → Gerir implementações → lápis → Nova versão**. O URL `/exec` mantém-se. Sem essa versão nova, a app continua na aba antiga.

`Comentários` guarda a nota e, quando há estado da app, o prefixo `[status:…]`, que a UI não mostra. O motivo, quando existe, fica na linha seguinte. Se a folha ainda tiver **Observações** e não **Comentários**, a gravação cai nessa coluna.

`action=create` acrescenta uma linha com o timestamp na coluna A (cabeçalho `4`), Nome, Telefone, Email e Comentários.

`action=leads` omite linhas anteriores a 2026-09-01. `action=update` grava o id pedido na mesma.
