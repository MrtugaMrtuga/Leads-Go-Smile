# Evobtob Apps Script — Inbound META

This fork (`MrtugaMrtuga/Leads-Go-Smile`) has no `backend-gas/`. The Apps Script that reads the sheet lives in **Evobtob/Leads-Go-Smile**, file `backend-gas/Code.gs`. Do not add a second sheet client here.

The PWA already maps those fields in `mapDataToLeads` (`shared/inboundMeta.js`) and lists every filled answer on the lead detail. Gas must emit them. Patch below is against Evobtob `backend-gas/Code.gs` as of commit `cb6bd7e` (2026-07-17).

## 1. Point at the Inbound META tab

Replace the sheet id and stop using the first tab.

```javascript
const SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w';
const INBOUND_META_TAB = 'Inbound META';
```

```javascript
function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheet = spreadsheet.getSheetByName(INBOUND_META_TAB);
  if (!sheet) throw new Error('Aba "Inbound META" não encontrada.');
  return sheet;
}
```

`getSheets()[0]` is the wrong tab selector even if Inbound META happens to be first.

## 2. Aliases so the new headers are not dropped

`getLeads_()` only copies keys listed in `FIELD_ALIASES`. `normalizeKey` lowercases, strips accents, and turns other characters into `_`.

Add these aliases (existing `phone` / `email` / `value` / `location` / `appointment_date` / `notes` already match Telefone, E-mail, Valor Real Bruto, Localização, Data Primeira Consulta, and the first Observações).

```javascript
name: ['name', 'nome', 'nome_paciente', 'lead_name', 'full_name', 'cliente', 'contact_name'],
```

`Nome Paciente` becomes `nome_paciente`. Without that alias, `REQUIRED_FIELDS` fails and the tab returns no leads.

Form answers (these must be on the JSON or the detail stays empty):

```javascript
smile_goal: ['o_que_gostaria_de_melhorar_no_seu_sorriso', 'smile_goal'],
treatment_type: ['que_tipo_de_tratamento_esta_a_considerar', 'treatment_type'],
current_stage: ['em_que_fase_esta_neste_momento', 'current_stage'],
timing: ['quando_gostaria_de_avancar', 'timing'],
knows_clinic: ['ja_conhece_ou_foi_acompanhado_na_go_smile', 'knows_clinic'],
contact_preference: ['como_prefere_que_a_equipa_entre_em_contacto_consigo', 'contact_preference'],
```

Other columns on the same tab, when filled:

```javascript
first_contact: ['1_contacto', 'primeiro_contacto'],
second_contact_date: ['data_2_contacto'],
second_contact: ['2_contacto'],
next_appointment: ['data_proxima_consulta'],
patient_number: ['n_paciente', 'numero_paciente'],
age: ['idade'],
done_flag: ['realizada'],
budget_doctor: ['medico_orcamento_medico_tratamento'],
quoted: ['orcado', 'orcamentado'],
payment: ['pagamento'],
financing: ['financiamento'],
legend: ['legenda'],
channel_facebook: ['facebook'],
channel_google: ['google_ads'],
channel_instagram: ['instagram'],
channel_messenger: ['messenger'],
channel_website: ['website']
```

`Data Contacto` already matches `contact_date` (`data_contacto`). On this tab that cell is the form timestamp. After building each item in `getLeads_()`:

```javascript
if (!firstValue_(item.date) && firstValue_(item.contact_date)) item.date = item.contact_date;
```

The second `Observações` column normalizes to the same key as the first (`observacoes`), so only the first one is returned. That matches the current alias matcher.

`getLeads_()` already copies every `FIELD_ALIASES` key onto the object. No other response shape is required. Empty cells can stay `""`; the PWA hides them.

## 3. What the PWA reads

`mapDataToLeads` accepts either the sheet headers or these script keys:

| Script key | Detail label |
| --- | --- |
| `smile_goal` | O que gostaria de melhorar no seu sorriso? |
| `treatment_type` | Que tipo de tratamento está a considerar? |
| `current_stage` | Em que fase está neste momento? |
| `timing` | Quando gostaria de avançar? |
| `knows_clinic` | Já conhece ou foi acompanhado na Go Smile? |
| `contact_preference` | Como prefere que a equipa entre em contacto consigo? |

Values such as `substituir_dentes_em_falta` are shown as `Substituir dentes em falta`.

Deploy the script as the same web app (new version). No Google Cloud project and no service account.
