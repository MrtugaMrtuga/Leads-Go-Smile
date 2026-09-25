/**
 * Sync append-only: Daniel → EVOB, aba «Leads (2024 - 2026)».
 *
 * Corre à mão no editor (syncDanielToEvob). Não é uma acção do /exec.
 * Não apaga nem sobrescreve células já gravadas na EVOB.
 *
 * Corte: data de contacto >= CONTACT_CUTOFF_DAY (2026-09-01, Europe/Lisbon).
 * Preferir Data Contacto; se vazia, timestamp. A chave e o dia espelham
 * syncLeadKey / contactDayFromText em shared/inboundMeta.js.
 *
 * A aba tem de existir na folha EVOB. Se faltar, o MacMiner cria-a com o nome exacto.
 * Depende das funções globais de Code.gs (mesmo projecto Apps Script).
 */

var DANIEL_SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w';

function syncKeyFromRaw_(raw, day) {
  var phone = String((raw && raw.telefone) || '').replace(/\D/g, '');
  var email = String((raw && raw.email) || '').trim().toLowerCase();
  var name = foldHeader_((raw && raw.nome) || '');
  var contactDay = String(day || contactDayFromRaw_(raw) || '');
  return (phone || email || name) + '|' + name + '|' + contactDay;
}

function headerIsBlank_(headers) {
  for (var i = 0; i < headers.length; i += 1) {
    if (String(headers[i] || '').trim()) return false;
  }
  return true;
}

function sameLogicalHeader_(a, b) {
  if (foldHeader_(a) === foldHeader_(b)) return true;
  var defA = findDefByHeader_(a, 1);
  var defB = findDefByHeader_(b, 1);
  return Boolean(defA && defB && defA.key === defB.key);
}

function ensureDestHeaders_(dest, sourceHeaders) {
  var lastRow = dest.getLastRow();
  var lastColumn = Math.max(dest.getLastColumn(), 1);
  var current = lastRow < 1 ? [] : trimRow_(dest.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
  if (lastRow < 1 || headerIsBlank_(current)) {
    var headers = [];
    sourceHeaders.forEach(function (header) {
      if (String(header || '').trim()) headers.push(header);
    });
    if (!headers.length) return;
    dest.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var nextCol = Math.max(dest.getLastColumn(), current.length) + 1;
  sourceHeaders.forEach(function (header) {
    if (!String(header || '').trim()) return;
    for (var i = 0; i < current.length; i += 1) {
      if (sameLogicalHeader_(current[i], header)) return;
    }
    dest.getRange(1, nextCol).setValue(header);
    current.push(header);
    nextCol += 1;
  });
}

function findLogicalSource_(sourceIndexed, destHeader) {
  var direct = findColumn_(sourceIndexed, destHeader, 1);
  if (direct) return direct;
  var def = findDefByHeader_(destHeader, 1);
  if (!def) return null;
  return findDefColumn_(sourceIndexed, def);
}

function alignRow_(sourceHeaders, sourceValues, destHeaders) {
  var sourceIndexed = indexHeaders_(sourceHeaders);
  var row = [];
  for (var i = 0; i < destHeaders.length; i += 1) {
    var header = destHeaders[i];
    var value = '';
    if (String(header || '').trim()) {
      var sourceCol = findLogicalSource_(sourceIndexed, header);
      if (sourceCol) value = sourceValues[sourceCol.index] || '';
    }
    row.push(value);
  }
  return row;
}

function syncDanielToEvob() {
  return withLock_(function () {
    var source = SpreadsheetApp.openById(DANIEL_SHEET_ID).getSheetByName(SHEET_TAB);
    if (!source) throw new Error('Aba «' + SHEET_TAB + '» não encontrada na folha de Daniel.');
    var dest = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    if (!dest) {
      throw new Error(
        'Aba «' + SHEET_TAB + '» não encontrada na folha EVOB. Crie a aba com este nome exacto antes de sincronizar.'
      );
    }

    var sourceTable = readTable_(source);
    if (!sourceTable.headers.length) {
      var empty = { tab: SHEET_TAB, cutoff: CONTACT_CUTOFF_DAY, appended: 0, reason: 'Daniel sem cabeçalhos' };
      Logger.log(JSON.stringify(empty));
      return empty;
    }

    ensureDestHeaders_(dest, sourceTable.headers);
    var destTable = readTable_(dest);
    var seen = {};
    destTable.rows.forEach(function (row) {
      var raw = rawFromRow_(destTable.headers, row.values);
      if (!raw.nome) return;
      var day = contactDayFromRaw_(raw);
      if (!day) return;
      seen[syncKeyFromRaw_(raw, day)] = true;
    });

    var appended = 0;
    var skippedDate = 0;
    var skippedExisting = 0;
    var skippedNameless = 0;

    sourceTable.rows.forEach(function (row) {
      var raw = rawFromRow_(sourceTable.headers, row.values);
      if (!raw.nome) {
        skippedNameless += 1;
        return;
      }
      var day = contactDayFromRaw_(raw);
      if (!day || day < CONTACT_CUTOFF_DAY) {
        skippedDate += 1;
        return;
      }
      var key = syncKeyFromRaw_(raw, day);
      if (seen[key]) {
        skippedExisting += 1;
        return;
      }
      dest.appendRow(alignRow_(sourceTable.headers, row.values, destTable.headers));
      seen[key] = true;
      appended += 1;
    });

    var summary = {
      tab: SHEET_TAB,
      cutoff: CONTACT_CUTOFF_DAY,
      appended: appended,
      skippedDate: skippedDate,
      skippedExisting: skippedExisting,
      skippedNameless: skippedNameless
    };
    Logger.log(JSON.stringify(summary));
    return summary;
  });
}
