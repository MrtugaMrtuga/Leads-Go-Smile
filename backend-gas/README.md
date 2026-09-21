# Apps Script — Inbound META

Web app grátis, ligada à folha **Leads - Go Smile**. Não há projecto Google Cloud, conta de serviço nem billing.

- Sheet: `1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w`
- Aba única: **Inbound META**
- A aba «Leads (2024 - 2026)» não é lida nem escrita.

O Mini (Node, porta 3040) chama este `/exec` com o segredo. O browser nunca recebe o segredo.

## 1. Ligar o script à folha

1. Abra a folha com uma conta que a possa editar (de preferência brunoairesaugusto@gmail.com; a folha é de daniel@constantcircle.co e está partilhada).
2. **Extensões → Apps Script**.
3. Apague o `Code.gs` de exemplo e cole [`Code.gs`](./Code.gs).
4. Em **Definições do projecto → Mostrar ficheiro de manifesto**, confirme o [`appsscript.json`](./appsscript.json) (fuso `Europe/Lisbon`, runtime V8).
5. Guarde.

O código abre a folha pelo ID acima. Mesmo assim o projecto tem de ficar **ligado a esta folha** (criado a partir dela), para a autorização ser a de Apps Script e não um projecto Cloud.

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
    { "header": "1º Contacto", "occurrence": 1, "value": "2026-09-21T22:00:00.000Z", "ifBlank": true }
  ]
}
```

Só grava cabeçalhos que já existem na linha 1. Não cria colunas.

## Colunas do pipeline

Não há colunas novas nem variáveis novas no Mini. `APPS_SCRIPT_URL` e `APPS_SCRIPT_SECRET` chegam.

| O quê | Onde na aba Inbound META | Valores |
| --- | --- | --- |
| Lista e cor | **Legenda** (já existia) | `Em processamento` (amarelo, fica na inbox), `Marcada` (verde, lista Marcadas), `Descartada` (vermelho, lista Descartadas). Vazio = nova, sem bola |
| Estado da app | **Observações** (a primeira), prefixo `[status:…]` | `new`, `contacted`, `processing`, `discarded`, `scheduled`, `positive`, `completed`, `paid`. A UI não mostra o prefixo |
| Motivo do descarte | **Observações** (a primeira), linha `[motivo:…]` | Obrigatório para passar a `discarded`. Sobrevive ao reload. A UI mostra o texto, não o marcador |
| Contacto | **1º Contacto** | Data ISO na primeira vez que o estado deixa de ser `new`, incluindo «Não atendeu» |
| Marcação | **Data Primeira Consulta** e **Médico Orçamento Médico Tratamento** | Já usados por Agendar, em conjunto com Legenda `Marcada` |

«Não atendeu» grava `[status:processing]`, Legenda `Em processamento` e 1º Contacto. A lead continua na inbox. Descartar sem motivo é recusado (`Motivo é obrigatório para descartar`) e a linha não muda.

Depois de colar este `Code.gs`: **Implementar → Gerir implementações → lápis → Nova versão**. O URL `/exec` mantém-se. Sem essa versão nova, o prefixo `processing` e o `[motivo:…]` não ficam gravados.

`Observações` (primeira) guarda a nota e, quando há estado da app, o prefixo `[status:…]`, que a UI não mostra. O motivo, quando existe, fica na linha seguinte.

`action=create` acrescenta uma linha com Data Contacto, Nome Paciente, Telefone, E-mail e Observações.
