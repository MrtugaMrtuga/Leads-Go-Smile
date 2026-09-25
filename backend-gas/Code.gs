/**
 * Leads Go Smile — web app da aba «Leads (2024 - 2026)».
 *
 * Folha ligada ao Apps Script (live /exec): 1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8
 * A folha de Daniel 1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w (Constant Circle)
 * não está ligada a este script. Sync e população da aba ficam fora deste projecto.
 * Só lê e escreve a aba «Leads (2024 - 2026)».
 *
 * A lista (action=leads) inclui só linhas cuja coluna A (cabeçalho literal «4»,
 * timestamp ISO) é >= 2026-09-01 (dia de calendário Europe/Lisbon).
 * Data Contacto é texto de CRM e não decide a lista. update/create não aplicam este corte.
 *
 * Segredo: propriedade do script APPS_SCRIPT_SECRET, igual à env do Mini.
 * O mapeamento de colunas espelha shared/inboundMeta.js.
 */

var SHEET_ID = '1tayieZBzhif_WP1FSJGs_hCoBkbkqN4yWlPfw1N96y8';
var SHEET_TAB = 'Leads (2024 - 2026)';
var CONTACT_CUTOFF_DAY = '2026-09-01';

var COLUMN_DEFS = [
  { key: 'timestamp_col', header: 'timestamp', aliases: ['4', 'Timestamp', 'Data', 'Carimbo de data/hora'] },
  { key: 'origem', header: 'Origem' },
  { key: 'nome', header: 'Nome', aliases: ['Nome Paciente', 'Nome do paciente'] },
  { key: 'email', header: 'Email', aliases: ['E-mail', 'E-Mail'] },
  { key: 'telefone', header: 'Telefone' },
  { key: 'responsavel', header: 'Responsável', aliases: ['Responsavel'], crm: true },
  { key: 'data_contacto', header: 'Data Contacto', aliases: ['Data de contacto'] },
  { key: 'observacoes', header: 'Comentários', aliases: ['Comentarios', 'Observações', 'Observacoes'], occurrence: 1, crm: true },
  { key: 'data_primeira_consulta', header: 'Data Primeira Consulta', crm: true },
  { key: 'medico_orcamento', header: 'Médico', aliases: ['Medico', 'Médico Orçamento Médico Tratamento'], crm: true },
  { key: 'numero_paciente', header: 'Nº Paciente Definitivo', aliases: ['Nº paciente', 'Nº Paciente', 'Numero Paciente Definitivo'], crm: true },
  { key: 'estado', header: 'Estado', aliases: ['Legenda'], crm: true },
  { key: 'data_proxima_consulta', header: 'Data Próxima Consulta', crm: true },
  { key: 'orcamentado', header: 'Orçamentado', crm: true },
  { key: 'pagamento', header: 'Pagamento', crm: true },
  { key: 'financiamento', header: 'Financiamento', crm: true },
  { key: 'valor_real_bruto', header: 'Valor Real Bruto', crm: true },
  { key: 'data_fecho', header: 'Data fecho', crm: true }
];

var STATUS_NOTE = /^\[status:(new|contacted|processing|discarded|scheduled|positive|completed|paid)\]\s*/i;
var MOTIVO_NOTE = /^\[motivo:([^\]]*)\]\s*/i;
var FECHO_NOTE = /^\[fecho:([^\]]*)\]\s*/i;

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function foldHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanMotivo_(value) {
  return String(value || '')
    .replace(/[\r\n\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFecho_(value) {
  var text = String(value || '').replace(/[\r\n\]]/g, '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return '';
  return text;
}

function splitStatusNote_(value) {
  var text = String(value || '').replace(/^\uFEFF/, '').trim();
  var status = '';
  var motivo = '';
  var fecho = '';
  for (var guard = 0; guard < 8; guard += 1) {
    var statusMatch = text.match(STATUS_NOTE);
    if (statusMatch) {
      status = String(statusMatch[1]).toLowerCase();
      text = text.slice(statusMatch[0].length).trim();
      continue;
    }
    var motivoMatch = text.match(MOTIVO_NOTE);
    if (motivoMatch) {
      motivo = cleanMotivo_(motivoMatch[1]);
      text = text.slice(motivoMatch[0].length).trim();
      continue;
    }
    var fechoMatch = text.match(FECHO_NOTE);
    if (fechoMatch) {
      fecho = cleanFecho_(fechoMatch[1]);
      text = text.slice(fechoMatch[0].length).trim();
      continue;
    }
    break;
  }
  return { status: status, motivo: motivo, fecho: fecho, note: text };
}

function formatStatusNote_(note, status, motivo, fecho) {
  var parsed = splitStatusNote_(note);
  var clean = parsed.note;
  var normalized = String(status || '').trim().toLowerCase();
  var allowed = { new: 1, contacted: 1, processing: 1, discarded: 1, scheduled: 1, positive: 1, completed: 1, paid: 1 };
  var reason = cleanMotivo_(motivo === undefined ? parsed.motivo : motivo);
  var closed = fecho === undefined ? parsed.fecho : cleanFecho_(fecho);
  var lines = [];
  if (allowed[normalized]) lines.push('[status:' + normalized + ']');
  if (reason) lines.push('[motivo:' + reason + ']');
  if (closed) lines.push('[fecho:' + closed + ']');
  if (!lines.length) return clean;
  return clean ? lines.join('\n') + '\n' + clean : lines.join('\n');
}

function mergeObservacoes_(currentCell, status, note, noteSet, motivo, motivoSet, fecho, fechoSet, fechoClear) {
  var parsed = splitStatusNote_(currentCell);
  var incoming = splitStatusNote_(note);
  var nextNote = noteSet ? incoming.note : parsed.note;
  var nextStatus = status || parsed.status;
  var nextMotivo = motivoSet ? cleanMotivo_(motivo || incoming.motivo) : incoming.motivo || parsed.motivo;
  var nextFecho = parsed.fecho || incoming.fecho || '';
  if (fechoClear) nextFecho = '';
  else if (fechoSet) nextFecho = parsed.fecho || cleanFecho_(fecho);
  return formatStatusNote_(nextNote, nextStatus, nextMotivo, nextFecho);
}

function statusFromLegenda_(value) {
  var folded = foldHeader_(value);
  if (folded === 'em processamento') return 'processing';
  if (folded === 'marcada' || folded === 'marcado') return 'scheduled';
  if (folded === 'descartada' || folded === 'descartado') return 'discarded';
  return '';
}

function statusFromEstado_(value) {
  var fromPipeline = statusFromLegenda_(value);
  if (fromPipeline) return fromPipeline;
  var folded = foldHeader_(value);
  if (folded === 'pago' || folded === 'paga' || folded === 'paid') return 'paid';
  if (folded === 'fechado' || folded === 'fechada' || folded === 'concluida' || folded === 'concluido') return 'completed';
  if (folded === 'nova' || folded === 'novo' || folded === 'new') return 'new';
  if (folded === 'contactada' || folded === 'contactado' || folded === 'contacted') return 'contacted';
  if (folded === 'positiva' || folded === 'positivo' || folded === 'positive') return 'positive';
  return '';
}

function fullYear_(token) {
  var text = String(token || '');
  if (text.length === 4) return text;
  var year = Number(text);
  return String(year >= 70 ? 1900 + year : 2000 + year);
}

function contactDayFromText_(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  var isoPrefix = text.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (isoPrefix) {
    var rest = isoPrefix[4] || '';
    var hasZone = /[zZ]$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(rest);
    if (!hasZone) return isoPrefix[1] + '-' + isoPrefix[2] + '-' + isoPrefix[3];
    var zoned = new Date(text);
    if (isNaN(zoned.getTime())) return '';
    return Utilities.formatDate(zoned, 'Europe/Lisbon', 'yyyy-MM-dd');
  }
  var pt = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/);
  if (pt) {
    var dayNum = Number(pt[1]);
    var monthNum = Number(pt[2]);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return '';
    var day = ('0' + pt[1]).slice(-2);
    var month = ('0' + pt[2]).slice(-2);
    return fullYear_(pt[3]) + '-' + month + '-' + day;
  }
  var fallback = new Date(text);
  if (isNaN(fallback.getTime())) return '';
  return Utilities.formatDate(fallback, 'Europe/Lisbon', 'yyyy-MM-dd');
}

function contactDayFromRaw_(raw) {
  return contactDayFromText_((raw && raw.timestamp_col) || '');
}

function contactSourceText_(raw) {
  return String((raw && raw.timestamp_col) || '').trim();
}

function claimTimestampColumn_(indexed, values, raw) {
  if (String((raw && raw.timestamp_col) || '').trim()) return;
  var named = null;
  var first = null;
  for (var i = 0; i < indexed.length; i += 1) {
    var col = indexed[i];
    if (col.index === 0) first = col;
    if (col.label && (col.folded === 'timestamp' || col.folded === 'data') && col.occurrence === 1) named = col;
  }
  var column = named;
  if (!column && first) {
    var loose = !first.folded || first.folded === 'timestamp' || first.folded === 'data' || /^\d+$/.test(first.folded);
    var other = false;
    if (!loose) {
      for (var d = 0; d < COLUMN_DEFS.length; d += 1) {
        var def = COLUMN_DEFS[d];
        if (def.key === 'timestamp_col') continue;
        var names = [def.header].concat(def.aliases || []);
        for (var n = 0; n < names.length; n += 1) {
          if (foldHeader_(names[n]) === first.folded) other = true;
        }
      }
    }
    if (loose || !other) column = first;
  }
  if (!column) return;
  raw.timestamp_col = String(values[column.index] || '').trim();
}

function passesContactCutoff_(raw) {
  var day = contactDayFromRaw_(raw);
  return Boolean(day) && day >= CONTACT_CUTOFF_DAY;
}

function secretsMatch_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET') || '';
  if (!expected) return false;
  provided = String(provided || '');
  if (provided.length !== expected.length) return false;
  var mismatch = 0;
  for (var i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

function requestSecret_(e, body) {
  var fromQuery = e && e.parameter ? e.parameter.secret : '';
  var fromBody = body && body.secret ? body.secret : '';
  return String(fromQuery || fromBody || '');
}

function parseBody_(e) {
  var payload = e && e.parameter ? e.parameter.payload : '';
  if (payload) {
    try {
      return JSON.parse(payload);
    } catch (error) {
      throw new Error('JSON inválido no payload.');
    }
  }
  var raw = e && e.postData && e.postData.contents;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('JSON inválido no POST.');
  }
}

function getLeadsSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  var sheet = spreadsheet.getSheetByName(SHEET_TAB);
  if (!sheet) {
    throw new Error('Aba «' + SHEET_TAB + '» não encontrada na folha EVOB. Crie a aba com este nome exacto.');
  }
  if (sheet.getName() !== SHEET_TAB) {
    throw new Error('Só é permitida a aba «' + SHEET_TAB + '».');
  }
  return sheet;
}

function indexHeaders_(headers) {
  var seen = {};
  return headers.map(function (header, index) {
    var label = String(header || '').trim();
    var folded = foldHeader_(label);
    var occurrence = (seen[folded] || 0) + 1;
    seen[folded] = occurrence;
    return { index: index, label: label, folded: folded, occurrence: occurrence };
  });
}

function findColumn_(indexed, header, occurrence) {
  var folded = foldHeader_(header);
  var target = occurrence || 1;
  for (var i = 0; i < indexed.length; i += 1) {
    var column = indexed[i];
    if (column.label && column.folded === folded && column.occurrence === target) return column;
  }
  return null;
}

function findDefByHeader_(header, occurrence) {
  var folded = foldHeader_(header);
  var target = occurrence || 1;
  for (var i = 0; i < COLUMN_DEFS.length; i += 1) {
    var def = COLUMN_DEFS[i];
    if ((def.occurrence || 1) !== target) continue;
    var names = [def.header].concat(def.aliases || []);
    for (var n = 0; n < names.length; n += 1) {
      if (foldHeader_(names[n]) === folded) return def;
    }
  }
  return null;
}

function findDefColumn_(indexed, def) {
  if (!def) return null;
  var names = [def.header].concat(def.aliases || []);
  var occurrence = def.occurrence || 1;
  for (var n = 0; n < names.length; n += 1) {
    var column = findColumn_(indexed, names[n], occurrence);
    if (column) return column;
  }
  return null;
}

function findHeader_(indexed, header, occurrence) {
  var def = findDefByHeader_(header, occurrence);
  if (def) return findDefColumn_(indexed, def);
  return findColumn_(indexed, header, occurrence);
}

function defByKey_(key) {
  for (var i = 0; i < COLUMN_DEFS.length; i += 1) {
    if (COLUMN_DEFS[i].key === key) return COLUMN_DEFS[i];
  }
  return null;
}

function findNotesColumn_(indexed) {
  return findDefColumn_(indexed, defByKey_('observacoes'));
}

function trimRow_(row) {
  return row.map(function (cell) {
    return String(cell == null ? '' : cell).trim();
  });
}

function readTable_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return { headers: [], rows: [] };
  var height = Math.max(lastRow, 1);
  var values = sheet.getRange(1, 1, height, lastColumn).getDisplayValues();
  var headers = trimRow_(values[0] || []);
  var rows = [];
  for (var r = 1; r < values.length; r += 1) {
    rows.push({ row: r + 1, values: trimRow_(values[r]) });
  }
  return { headers: headers, rows: rows };
}

function isFilled_(value) {
  return String(value || '').trim() !== '';
}

function inferStatus_(raw) {
  var primary = splitStatusNote_(raw.observacoes);
  if (primary.status) return primary.status;
  var fromEstado = statusFromEstado_(raw.estado);
  if (fromEstado) return fromEstado;
  var pagamento = foldHeader_(raw.pagamento);
  if (pagamento === 'pago' || pagamento === 'paga' || pagamento === 'paid') return 'paid';
  var notes = String(primary.note || '').toLowerCase();
  var orcamento = foldHeader_(raw.orcamentado);
  if (
    notes.indexOf('venda fechada') !== -1 ||
    notes.indexOf('fechado no valor') !== -1 ||
    orcamento === 'fechado' ||
    orcamento === 'fechada'
  ) {
    return 'completed';
  }
  var appointment = String(raw.data_primeira_consulta || '').trim();
  if (appointment.length > 2 || notes.indexOf('marcado') !== -1 || notes.indexOf('marcada') !== -1) return 'scheduled';
  if (
    notes.indexOf('não atendeu') !== -1 ||
    notes.indexOf('nao atendeu') !== -1 ||
    notes.indexOf('não atende') !== -1 ||
    notes.indexOf('nao atende') !== -1
  ) {
    return 'processing';
  }
  if (
    notes.indexOf('engano') !== -1 ||
    notes.indexOf('não interessa') !== -1 ||
    notes.indexOf('nao interessa') !== -1
  ) {
    return 'discarded';
  }
  if (String(raw.responsavel || '').trim() || notes.indexOf('contactad') !== -1) return 'contacted';
  return 'new';
}

function rawFromRow_(headers, values) {
  var indexed = indexHeaders_(headers);
  var raw = {};
  COLUMN_DEFS.forEach(function (def) {
    var column = findDefColumn_(indexed, def);
    raw[def.key] = column ? String(values[column.index] || '').trim() : '';
  });
  claimTimestampColumn_(indexed, values, raw);
  return raw;
}

function buildLead_(headers, values, sheetRow) {
  var raw = rawFromRow_(headers, values);
  if (!raw.nome) return null;
  var contactText = contactSourceText_(raw);
  var primary = splitStatusNote_(raw.observacoes);
  var status = inferStatus_(raw);
  var formFields = [];
  COLUMN_DEFS.forEach(function (def) {
    var value = def.key === 'observacoes' ? primary.note : raw[def.key];
    if (!isFilled_(value)) return;
    formFields.push({ key: def.key, label: def.header, value: value });
  });
  var crm = {};
  COLUMN_DEFS.forEach(function (def) {
    if (!def.crm) return;
    crm[def.key] = def.key === 'observacoes' ? primary.note : raw[def.key] || '';
  });
  return {
    id: String(sheetRow),
    row: sheetRow,
    nome: raw.nome,
    telefone: raw.telefone || '',
    email: raw.email || '',
    dataContacto: contactText,
    contactDay: contactDayFromRaw_(raw),
    name: raw.nome,
    phone: raw.telefone || '',
    timestamp: contactText,
    notes: primary.note || '',
    status: status,
    discardReason: primary.motivo || '',
    closedAt: raw.data_fecho || primary.fecho || '',
    isContacted: status !== 'new',
    source: raw.origem || '',
    sourceTab: SHEET_TAB,
    formFields: formFields,
    crm: crm
  };
}

function tablePayload_(table) {
  var leads = [];
  var rows = [];
  table.rows.forEach(function (row) {
    var raw = rawFromRow_(table.headers, row.values);
    if (!passesContactCutoff_(raw)) return;
    var lead = buildLead_(table.headers, row.values, row.row);
    if (!lead) return;
    leads.push(lead);
    rows.push(row);
  });
  return {
    ok: true,
    sheetId: SHEET_ID,
    sheetTab: SHEET_TAB,
    contactCutoff: CONTACT_CUTOFF_DAY,
    contactCutoffTimeZone: 'Europe/Lisbon',
    count: leads.length,
    headers: table.headers,
    rows: rows,
    leads: leads
  };
}

function applyFields_(sheet, rowNumber, fields) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
  var indexed = indexHeaders_(headers);
  var applied = [];
  (fields || []).forEach(function (field) {
    if (!field || !field.header) return;
    var column = findHeader_(indexed, field.header, Number(field.occurrence || 1));
    if (!column) return;
    var cell = sheet.getRange(rowNumber, column.index + 1);
    if (field.ifBlank && String(cell.getDisplayValue() || '').trim() !== '') return;
    var value = field.value == null ? '' : field.value;
    if (foldHeader_(field.header) === foldHeader_('Valor Real Bruto')) {
      var numeric = Number(String(value).replace(/\s/g, '').replace(',', '.'));
      cell.setValue(String(value).trim() !== '' && isFinite(numeric) ? numeric : value);
    } else {
      cell.setValue(value);
    }
    applied.push({ header: column.label, occurrence: column.occurrence, value: String(value) });
  });
  return applied;
}

function ensureHeader_(sheet, header) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
  if (findColumn_(indexHeaders_(headers), header, 1)) return;
  sheet.getRange(1, lastColumn + 1).setValue(header);
}

function currentObservacoes_(sheet, rowNumber) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
  var column = findNotesColumn_(indexHeaders_(headers));
  if (!column) return '';
  return sheet.getRange(rowNumber, column.index + 1).getDisplayValue();
}

function stampFechoField_(fields, value, clear) {
  var list = fields || [];
  var found = false;
  for (var i = 0; i < list.length; i += 1) {
    var field = list[i];
    if (!field || foldHeader_(field.header) !== foldHeader_('Data fecho')) continue;
    field.value = value;
    if (clear) delete field.ifBlank;
    else field.ifBlank = true;
    found = true;
  }
  if (!found) {
    var item = { header: 'Data fecho', occurrence: 1, value: value };
    if (!clear) item.ifBlank = true;
    list.push(item);
  }
  return list;
}

function writeObservacoes_(sheet, rowNumber, status, note, noteSet, motivo, motivoSet, fecho, fechoSet, fechoClear) {
  if (!noteSet && !status && !motivoSet && !fechoSet && !fechoClear) return null;
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
  var column = findNotesColumn_(indexHeaders_(headers));
  if (!column) return null;
  var cell = sheet.getRange(rowNumber, column.index + 1);
  var next = mergeObservacoes_(
    cell.getDisplayValue(),
    status,
    note,
    Boolean(noteSet),
    motivo,
    Boolean(motivoSet),
    fecho,
    Boolean(fechoSet),
    Boolean(fechoClear)
  );
  cell.setValue(next);
  return next;
}

function previewObservacoes_(sheet, rowNumber, status, note, noteSet, motivo, motivoSet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
  var column = findNotesColumn_(indexHeaders_(headers));
  if (!column) return '';
  var cell = sheet.getRange(rowNumber, column.index + 1);
  return mergeObservacoes_(cell.getDisplayValue(), status, note, Boolean(noteSet), motivo, Boolean(motivoSet));
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function updateLead_(body) {
  var rowNumber = Number(body.id || body.row || body.row_number);
  if (!rowNumber || rowNumber < 2) throw new Error('Lead não encontrada');
  return withLock_(function () {
    var sheet = getLeadsSheet_();
    if (rowNumber > sheet.getLastRow()) throw new Error('Lead não encontrada');
    var status = String(body.status || '').trim().toLowerCase();
    var noteSet = Boolean(body.noteSet);
    var motivoSet = Boolean(body.motivoSet);
    var fechoSet = Boolean(body.fechoSet);
    var fechoClear = Boolean(body.fechoClear);
    if (status === 'discarded') {
      var preview = previewObservacoes_(sheet, rowNumber, status, body.note || '', noteSet, body.motivo || '', true);
      if (!splitStatusNote_(preview).motivo) throw new Error('Motivo é obrigatório para descartar');
    }
    var fields = body.fields || [];
    if (fechoSet || fechoClear) {
      var kept = fechoClear ? '' : (splitStatusNote_(currentObservacoes_(sheet, rowNumber)).fecho || body.fecho || '');
      ensureHeader_(sheet, 'Data fecho');
      fields = stampFechoField_(fields, kept, fechoClear || !kept);
    }
    applyFields_(sheet, rowNumber, fields);
    writeObservacoes_(sheet, rowNumber, status, body.note || '', noteSet, body.motivo || '', motivoSet, body.fecho || '', fechoSet, fechoClear);
    SpreadsheetApp.flush();
    var table = readTable_(sheet);
    var match = null;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (table.rows[i].row === rowNumber) match = table.rows[i];
    }
    if (!match) throw new Error('Lead não encontrada');
    return {
      ok: true,
      sheetId: SHEET_ID,
      sheetTab: SHEET_TAB,
      headers: table.headers,
      row: match,
      lead: buildLead_(table.headers, match.values, match.row)
    };
  });
}

function blankRow_(width) {
  var row = [];
  for (var i = 0; i < width; i += 1) row.push('');
  return row;
}

function createLead_(body) {
  var name = String(body.name || body.nome || '').trim();
  if (!name) throw new Error('Nome é obrigatório');
  return withLock_(function () {
    var sheet = getLeadsSheet_();
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
    var indexed = indexHeaders_(headers);
    var row = blankRow_(headers.length);

    function put(header, occurrence, value) {
      var column = findHeader_(indexed, header, occurrence);
      if (!column || value == null || String(value) === '') return;
      row[column.index] = value;
    }

    var stamp = body.dataContacto || new Date().toISOString();
    var stampColumn = findDefColumn_(indexed, defByKey_('timestamp_col'));
    if (stampColumn) row[stampColumn.index] = stamp;
    else put('Data Contacto', 1, stamp);
    put('Nome', 1, name);
    put('Telefone', 1, body.phone || body.telefone || '');
    put('Email', 1, body.email || '');
    put('Comentários', 1, formatStatusNote_(body.notes || body.note || '', 'new'));
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    var table = readTable_(sheet);
    var created = table.rows.length ? table.rows[table.rows.length - 1] : null;
    if (!created) throw new Error('A folha não devolveu a lead criada');
    return {
      ok: true,
      sheetId: SHEET_ID,
      sheetTab: SHEET_TAB,
      headers: table.headers,
      row: created,
      lead: buildLead_(table.headers, created.values, created.row)
    };
  });
}

function handle_(e) {
  var body = {};
  try {
    body = parseBody_(e);
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message || String(error) });
  }

  if (!PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET')) {
    return jsonResponse_({ ok: false, error: 'Defina a propriedade APPS_SCRIPT_SECRET no script.' });
  }
  if (!secretsMatch_(requestSecret_(e, body))) {
    return jsonResponse_({ ok: false, error: 'Segredo inválido.' });
  }

  var action = String((body && body.action) || (e && e.parameter && e.parameter.action) || 'leads');
  try {
    if (action === 'health') {
      return jsonResponse_({
        ok: true,
        sheetId: SHEET_ID,
        sheetTab: SHEET_TAB,
        contactCutoff: CONTACT_CUTOFF_DAY,
        contactCutoffTimeZone: 'Europe/Lisbon'
      });
    }
    if (action === 'leads' || action === 'getLeads') {
      return jsonResponse_(tablePayload_(readTable_(getLeadsSheet_())));
    }
    if (action === 'update' || action === 'updateLead') return jsonResponse_(updateLead_(body));
    if (action === 'create' || action === 'createLead') return jsonResponse_(createLead_(body));
    return jsonResponse_({ ok: false, error: 'Ação inválida.' });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message || String(error) });
  }
}

function doGet(e) {
  return handle_(e);
}

function doPost(e) {
  return handle_(e);
}
