/**
 * Sync Daniel → EVOB. Cole no projecto já ligado à folha EVOB
 * «Leads Inbound META evob» (1aAKXH7TnV17uCemEol56X_0NNs6ZVAF3LrBpZHf9ZoaRlw8rn26t1_mo).
 * Não crie outro projecto Apps Script.
 *
 * Daniel: 1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w
 *   título da folha: «Leads - Go Smile»
 *   aba verificada: «Leads (2024 - 2026)»
 *   fallback só se essa aba não existir: «Leads - Go Smile»
 * EVOB: SHEET_ID / SHEET_TAB em Code.gs
 *   1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8 / «Leads (2024 - 2026)»
 *
 * Corte: CONTACT_CUTOFF_DAY (2026-09-01), coluna A, Europe/Lisbon, via passesContactCutoff_.
 * Data Contacto não qualifica a linha. Não abre outras abas da folha de Daniel.
 * Não apaga linhas e não reescreve CRM de linhas que já estão na EVOB.
 * A decisão espelha shared/danielSync.js.
 *
 * Correr no editor: syncDanielToEvob
 * Gatilho opcional: installDanielSyncTrigger (15 minutos)
 * Web app (com segredo): action=sync
 */

var DANIEL_SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w';
var DANIEL_SHEET_TAB = 'Leads (2024 - 2026)';
var DANIEL_SHEET_TAB_FALLBACK = 'Leads - Go Smile';

function syncLeadKey_(nome, telefone, email, contactDay) {
  var phone = String(telefone || '').replace(/\D/g, '');
  var mail = String(email || '').trim().toLowerCase();
  var name = foldHeader_(nome);
  var day = String(contactDay || '').trim();
  return (phone || mail || name) + '|' + name + '|' + day;
}

function plainCell_(value) {
  var text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function openDanielSpreadsheet_() {
  return SpreadsheetApp.openById(DANIEL_SHEET_ID);
}

function getDanielSheet_(spreadsheet) {
  var book = spreadsheet || openDanielSpreadsheet_();
  var preferred = [DANIEL_SHEET_TAB, DANIEL_SHEET_TAB_FALLBACK];
  for (var i = 0; i < preferred.length; i += 1) {
    var sheet = book.getSheetByName(preferred[i]);
    if (sheet) return sheet;
  }
  var names = book.getSheets().map(function (sheet) {
    return sheet.getName();
  });
  throw new Error(
    'Aba de Daniel não encontrada. Esperada «' +
      DANIEL_SHEET_TAB +
      '» (o ficheiro chama-se «' +
      DANIEL_SHEET_TAB_FALLBACK +
      '»). Abas: ' +
      names.join(', ')
  );
}

function pushSample_(summary, message) {
  if (summary.errorSamples.length >= 8) return;
  summary.errorSamples.push(String(message || ''));
}

function emptySyncSummary_() {
  return {
    ok: true,
    scanned: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    errorSamples: [],
    cutoff: CONTACT_CUTOFF_DAY,
    timeZone: 'Europe/Lisbon',
    danielSheetId: DANIEL_SHEET_ID,
    danielTab: '',
    danielTitle: '',
    evobSheetId: SHEET_ID,
    evobTab: SHEET_TAB,
    evobTitle: ''
  };
}

function requireMappedColumn_(indexed, key, label) {
  var column = findDefColumn_(indexed, defByKey_(key));
  if (!column) throw new Error('Falta a coluna ' + label + '.');
  return column;
}

function runDanielSync_(summary) {
  var danielSpreadsheet = openDanielSpreadsheet_();
  var daniel = getDanielSheet_(danielSpreadsheet);
  summary.danielTitle = danielSpreadsheet.getName();
  summary.danielTab = daniel.getName();

  var evob = getLeadsSheet_();
  summary.evobTitle = evob.getParent().getName();
  summary.evobTab = evob.getName();

  var danielTable = readTable_(daniel);
  var evobTable = readTable_(evob);
  var danielIndexed = indexHeaders_(danielTable.headers);
  var evobIndexed = indexHeaders_(evobTable.headers);
  requireMappedColumn_(danielIndexed, 'nome', 'Nome na aba de Daniel');
  requireMappedColumn_(danielIndexed, 'timestamp_col', 'timestamp (cabeçalho 4) na aba de Daniel');
  requireMappedColumn_(evobIndexed, 'nome', 'Nome na aba EVOB');
  requireMappedColumn_(evobIndexed, 'timestamp_col', 'timestamp (cabeçalho 4) na aba EVOB');

  var seen = Object.create(null);
  evobTable.rows.forEach(function (row) {
    var raw = rawFromRow_(evobTable.headers, row.values);
    if (!raw.nome) return;
    var key = syncLeadKey_(raw.nome, raw.telefone, raw.email, contactDayFromRaw_(raw));
    seen[key] = 1;
  });

  var width = evobTable.headers.length;
  var planned = [];
  danielTable.rows.forEach(function (row) {
    try {
      var raw = rawFromRow_(danielTable.headers, row.values);
      if (!raw.nome) return;
      if (!passesContactCutoff_(raw)) return;
      summary.scanned += 1;
      var key = syncLeadKey_(raw.nome, raw.telefone, raw.email, contactDayFromRaw_(raw));
      if (seen[key]) {
        summary.skipped += 1;
        return;
      }
      var out = blankRow_(width);
      COLUMN_DEFS.forEach(function (def) {
        var value = raw[def.key];
        if (!isFilled_(value)) return;
        var column = findDefColumn_(evobIndexed, def);
        if (!column || column.index >= width) return;
        out[column.index] = plainCell_(value);
      });
      var nomeCol = findDefColumn_(evobIndexed, defByKey_('nome'));
      var stampCol = findDefColumn_(evobIndexed, defByKey_('timestamp_col'));
      if (!isFilled_(out[nomeCol.index]) || !isFilled_(out[stampCol.index])) {
        summary.errors += 1;
        pushSample_(summary, 'linha ' + row.row + ': Nome ou timestamp não mapeou para a EVOB');
        return;
      }
      planned.push(out);
      seen[key] = 1;
    } catch (error) {
      summary.errors += 1;
      pushSample_(summary, 'linha ' + row.row + ': ' + (error.message || error));
    }
  });

  if (!planned.length) return;

  try {
    var start = evob.getLastRow() + 1;
    evob.getRange(start, 1, planned.length, width).setValues(planned);
    SpreadsheetApp.flush();
    summary.inserted = planned.length;
  } catch (error) {
    summary.ok = false;
    summary.inserted = 0;
    summary.errors += planned.length;
    summary.error = error.message || String(error);
    pushSample_(summary, summary.error);
  }
}

function syncDanielToEvob() {
  var summary = emptySyncSummary_();
  try {
    withLock_(function () {
      runDanielSync_(summary);
    });
  } catch (error) {
    summary.ok = false;
    summary.errors += 1;
    summary.error = error.message || String(error);
    pushSample_(summary, summary.error);
  }
  Logger.log(JSON.stringify(summary));
  return summary;
}

function installDanielSyncTrigger() {
  var handler = 'syncDanielToEvob';
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i += 1) {
    if (existing[i].getHandlerFunction() === handler) {
      var already = { ok: true, created: false, handler: handler };
      Logger.log(JSON.stringify(already));
      return already;
    }
  }
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(15).create();
  var created = { ok: true, created: true, handler: handler, everyMinutes: 15 };
  Logger.log(JSON.stringify(created));
  return created;
}
