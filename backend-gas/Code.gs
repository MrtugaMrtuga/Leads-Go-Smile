/**
 * Leads Go Smile — web app da aba «Inbound META».
 *
 * Sheet: 1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w
 * Ligar este projecto a essa folha (Extensões → Apps Script no documento).
 * Só lê e escreve a aba «Inbound META». A aba histórica não é usada.
 *
 * Segredo: propriedade do script APPS_SCRIPT_SECRET, igual à env do Mini.
 * O mapeamento de colunas espelha shared/inboundMeta.js.
 */

var SHEET_ID = '1qTEfJTz_m5x7TMil8MGeqZuTGAJD4oGbGmfCuWYZa7w';
var SHEET_TAB = 'Inbound META';
var FORBIDDEN_TAB = 'Leads (2024 - 2026)';

var COLUMN_DEFS = [
  { key: 'data_contacto', header: 'Data Contacto' },
  { key: 'nome', header: 'Nome Paciente' },
  { key: 'telefone', header: 'Telefone' },
  { key: 'email', header: 'E-mail' },
  { key: 'melhorar_sorriso', header: 'O que gostaria de melhorar no seu sorriso?', meta: true },
  { key: 'tipo_tratamento', header: 'Que tipo de tratamento está a considerar?', meta: true },
  { key: 'fase', header: 'Em que fase está neste momento?', meta: true },
  { key: 'quando', header: 'Quando gostaria de avançar?', meta: true },
  { key: 'conhece', header: 'Já conhece ou foi acompanhado na Go Smile?', meta: true },
  { key: 'preferencia_contacto', header: 'Como prefere que a equipa entre em contacto consigo?', meta: true },
  { key: 'primeiro_contacto', header: '1º Contacto', crm: true },
  { key: 'data_segundo_contacto', header: 'Data 2º Contacto', crm: true },
  { key: 'segundo_contacto', header: '2º Contacto', crm: true },
  { key: 'observacoes', header: 'Observações', occurrence: 1, crm: true },
  { key: 'data_primeira_consulta', header: 'Data Primeira Consulta', crm: true },
  { key: 'data_proxima_consulta', header: 'Data Próxima Consulta', crm: true },
  { key: 'numero_paciente', header: 'Nº paciente', crm: true },
  { key: 'localizacao', header: 'Localização', crm: true },
  { key: 'idade', header: 'Idade', crm: true },
  { key: 'realizada', header: 'Realizada', crm: true },
  { key: 'medico_orcamento', header: 'Médico Orçamento Médico Tratamento', crm: true },
  { key: 'orcamentado', header: 'Orçamentado', crm: true },
  { key: 'pagamento', header: 'Pagamento', crm: true },
  { key: 'financiamento', header: 'Financiamento', crm: true },
  { key: 'valor_real_bruto', header: 'Valor Real Bruto', crm: true },
  { key: 'legenda', header: 'Legenda', crm: true },
  { key: 'facebook', header: 'Facebook', crm: true },
  { key: 'google_ads', header: 'Google Ads', crm: true },
  { key: 'instagram', header: 'Instagram', crm: true },
  { key: 'messenger', header: 'Messenger', crm: true },
  { key: 'website', header: 'Website', crm: true },
  { key: 'observacoes_final', header: 'Observações', occurrence: 2, crm: true }
];

var STATUS_NOTE = /^\[status:(new|contacted|discarded|scheduled|positive|completed|paid)\]\s*/i;

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

function splitStatusNote_(value) {
  var text = String(value || '').replace(/^\uFEFF/, '').trim();
  var match = text.match(STATUS_NOTE);
  if (!match) return { status: '', note: text };
  return { status: String(match[1]).toLowerCase(), note: text.slice(match[0].length).trim() };
}

function formatStatusNote_(note, status) {
  var clean = splitStatusNote_(note).note;
  var normalized = String(status || '').trim().toLowerCase();
  var allowed = { new: 1, contacted: 1, discarded: 1, scheduled: 1, positive: 1, completed: 1, paid: 1 };
  if (!allowed[normalized]) return clean;
  return clean ? '[status:' + normalized + ']\n' + clean : '[status:' + normalized + ']';
}

function mergeObservacoes_(currentCell, status, note, noteSet) {
  var parsed = splitStatusNote_(currentCell);
  var nextNote = noteSet ? splitStatusNote_(note).note : parsed.note;
  var nextStatus = status || parsed.status;
  return formatStatusNote_(nextNote, nextStatus);
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

function getInboundSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  var sheet = spreadsheet.getSheetByName(SHEET_TAB);
  if (!sheet) throw new Error('Aba «Inbound META» não encontrada.');
  if (sheet.getName() !== SHEET_TAB || sheet.getName() === FORBIDDEN_TAB) {
    throw new Error('Só é permitida a aba Inbound META.');
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
  var pagamento = foldHeader_(raw.pagamento);
  if (pagamento === 'pago' || pagamento === 'paga' || pagamento === 'paid') return 'paid';
  var notes = (primary.note + ' ' + (raw.observacoes_final || '')).toLowerCase();
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
    notes.indexOf('engano') !== -1 ||
    notes.indexOf('não interessa') !== -1 ||
    notes.indexOf('nao interessa') !== -1 ||
    notes.indexOf('não atende') !== -1 ||
    notes.indexOf('nao atende') !== -1
  ) {
    return 'discarded';
  }
  if (String(raw.primeiro_contacto || '').trim() || notes.indexOf('contactad') !== -1) return 'contacted';
  return 'new';
}

function rawFromRow_(headers, values) {
  var indexed = indexHeaders_(headers);
  var raw = {};
  COLUMN_DEFS.forEach(function (def) {
    var column = findColumn_(indexed, def.header, def.occurrence || 1);
    raw[def.key] = column ? String(values[column.index] || '').trim() : '';
  });
  return raw;
}

function buildLead_(headers, values, sheetRow) {
  var raw = rawFromRow_(headers, values);
  if (!raw.nome) return null;
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
    dataContacto: raw.data_contacto || '',
    name: raw.nome,
    phone: raw.telefone || '',
    timestamp: raw.data_contacto || '',
    notes: primary.note || raw.observacoes_final || '',
    status: status,
    isContacted: status !== 'new',
    sourceTab: SHEET_TAB,
    formFields: formFields,
    crm: crm
  };
}

function tablePayload_(table) {
  var leads = [];
  table.rows.forEach(function (row) {
    var lead = buildLead_(table.headers, row.values, row.row);
    if (lead) leads.push(lead);
  });
  return {
    ok: true,
    sheetId: SHEET_ID,
    sheetTab: SHEET_TAB,
    count: leads.length,
    headers: table.headers,
    rows: table.rows,
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
    var column = findColumn_(indexed, field.header, Number(field.occurrence || 1));
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

function writeObservacoes_(sheet, rowNumber, status, note, noteSet) {
  if (!noteSet && !status) return null;
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
  var column = findColumn_(indexHeaders_(headers), 'Observações', 1);
  if (!column) return null;
  var cell = sheet.getRange(rowNumber, column.index + 1);
  var next = mergeObservacoes_(cell.getDisplayValue(), status, note, Boolean(noteSet));
  cell.setValue(next);
  return next;
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
    var sheet = getInboundSheet_();
    if (rowNumber > sheet.getLastRow()) throw new Error('Lead não encontrada');
    var status = String(body.status || '').trim().toLowerCase();
    applyFields_(sheet, rowNumber, body.fields || []);
    writeObservacoes_(sheet, rowNumber, status, body.note || '', Boolean(body.noteSet));
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
    var sheet = getInboundSheet_();
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = trimRow_(sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]);
    var indexed = indexHeaders_(headers);
    var row = blankRow_(headers.length);

    function put(header, occurrence, value) {
      var column = findColumn_(indexed, header, occurrence);
      if (!column || value == null || String(value) === '') return;
      row[column.index] = value;
    }

    put('Data Contacto', 1, body.dataContacto || new Date().toISOString());
    put('Nome Paciente', 1, name);
    put('Telefone', 1, body.phone || body.telefone || '');
    put('E-mail', 1, body.email || '');
    put('Observações', 1, formatStatusNote_(body.notes || body.note || '', 'new'));
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
      return jsonResponse_({ ok: true, sheetId: SHEET_ID, sheetTab: SHEET_TAB });
    }
    if (action === 'leads' || action === 'getLeads') {
      return jsonResponse_(tablePayload_(readTable_(getInboundSheet_())));
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
