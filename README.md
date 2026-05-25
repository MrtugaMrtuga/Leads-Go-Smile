# Go Smile Leads

Webapp mobile-first para gerir leads da Go Smile a partir de uma Google Sheet via n8n/webhooks.

## Stack

- React 19
- Vite 6
- TypeScript
- Tailwind via CDN
- `lucide-react` para ícones

## Funcionalidades

- Resumo mensal de leads
- Inbox de leads novas/contactadas
- Descarte com motivo
- Agendamento de consulta com médico/data/comentário
- Visitas agendadas com lembrete
- Fecho de consulta com valor de orçamento
- Contas/comissões e marcação de pagamento
- Painel admin simples

## Configuração

Cria `.env.local` se quiseres trocar endpoints sem mexer no código:

```bash
VITE_LEADS_FETCH_URL="https://..."
VITE_LEADS_UPDATE_URL="https://..."
VITE_LEADS_REMINDER_URL="https://..."
```

A leitura de leads usa `POST` com:

```json
{ "action": "list_leads" }
```

As actualizações enviam `POST` com `row_number`, `nome`, `status`, `estado`, `comentario`, `medico`, `data_consulta`, `valor_fechado` e `data_tratamento`.

## Correr localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notas operacionais

- Em preview local, se a folha/webhook falhar, a app usa dados de exemplo para permitir testar a UI.
- Em produção, se a folha/webhook falhar, mostra erro de sincronização em vez de mascarar o problema com dados mock.
- O webhook actual está a responder `403 Forbidden` fora do contexto autorizado; é preciso confirmar permissões/CORS no n8n antes de publicar.
