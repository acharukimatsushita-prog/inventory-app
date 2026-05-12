const SHEET_NAME = 'Inventory';

const FIELDS = [
  'id',
  'category',
  'name',
  'material',
  'size',
  'length',
  'unit',
  'supplier',
  'maker',
  'projectNumber',
  'projectName',
  'remarks',
  'modelCode',
  'quantity',
  'minLot',
  'orderQuantity',
  'isOrdered',
  'orderedBy',
  'orderedAt',
  'createdAt',
  'updatedAt'
];

const DEFAULTS = {
  category: '未分類',
  name: '未分類',
  material: '名称未設定',
  size: '',
  length: '',
  unit: '個',
  supplier: '',
  maker: '',
  projectNumber: '',
  projectName: '',
  remarks: '',
  modelCode: '',
  quantity: 0,
  minLot: 0,
  orderQuantity: 1,
  isOrdered: false,
  orderedBy: '',
  orderedAt: '',
  createdAt: '',
  updatedAt: ''
};

function doGet() {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
  ensureIds_(sheet);
  const items = readItems_(sheet);
  return json_(items);
}

function doPost(e) {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
  ensureIds_(sheet);

  const request = parseRequest_(e);
  const action = request.action;
  const payload = request.payload || {};

  if (action === 'add') {
    addItem_(sheet, payload);
  } else if (action === 'update') {
    updateItem_(sheet, payload);
  } else if (action === 'delete') {
    deleteItem_(sheet, payload);
  } else if (action === 'takeOut') {
    takeOut_(sheet, payload);
  } else {
    throw new Error('Unknown action: ' + action);
  }

  return json_({ ok: true });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, FIELDS.length).setValues([FIELDS]);
    return;
  }

  const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), FIELDS.length)).getValues()[0];
  const missing = FIELDS.filter(function(field) {
    return existing.indexOf(field) === -1;
  });

  if (missing.length === 0) return;

  const nextColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, nextColumn, 1, missing.length).setValues([missing]);
}

function ensureIds_(sheet) {
  const values = getTableValues_(sheet);
  if (values.rows.length === 0) return;

  const headers = values.headers;
  const indexes = getIndexes_(headers);
  const now = new Date().toISOString();
  const updates = [];

  values.rows.forEach(function(row, rowOffset) {
    const sheetRow = rowOffset + 2;
    const hasAnyValue = row.some(function(value) {
      return value !== '' && value !== null;
    });
    if (!hasAnyValue) return;

    const item = rowToItem_(row, headers, sheetRow);
    const normalized = normalizeItem_(item);
    let changed = false;

    if (!item.id) {
      normalized.id = Utilities.getUuid();
      changed = true;
    }

    FIELDS.forEach(function(field) {
      if (indexes[field] === undefined) return;
      if ((row[indexes[field]] === '' || row[indexes[field]] === null) && normalized[field] !== '') {
        changed = true;
      }
    });

    if (!item.createdAt) {
      normalized.createdAt = now;
      changed = true;
    }

    if (changed) {
      updates.push({ row: sheetRow, item: normalized });
    }
  });

  updates.forEach(function(update) {
    writeItemToRow_(sheet, update.row, update.item);
  });
}

function readItems_(sheet) {
  const values = getTableValues_(sheet);
  if (values.rows.length === 0) return [];

  return values.rows.map(function(row, rowOffset) {
    const sheetRow = rowOffset + 2;
    const hasAnyValue = row.some(function(value) {
      return value !== '' && value !== null;
    });
    if (!hasAnyValue) return null;
    return normalizeItem_(rowToItem_(row, values.headers, sheetRow));
  }).filter(Boolean);
}

function addItem_(sheet, payload) {
  const item = normalizeItem_(payload);
  item.id = item.id || Utilities.getUuid();
  item.createdAt = item.createdAt || new Date().toISOString();
  writeItemToRow_(sheet, sheet.getLastRow() + 1, item);
}

function updateItem_(sheet, payload) {
  const item = normalizeItem_(payload);
  const row = findRow_(sheet, item);
  item.id = item.id || Utilities.getUuid();
  item.updatedAt = item.updatedAt || new Date().toISOString();

  if (row) {
    writeItemToRow_(sheet, row, item);
  } else {
    item.createdAt = item.createdAt || new Date().toISOString();
    writeItemToRow_(sheet, sheet.getLastRow() + 1, item);
  }
}

function deleteItem_(sheet, payload) {
  const row = findRow_(sheet, payload);
  if (row) sheet.deleteRow(row);
}

function takeOut_(sheet, payload) {
  const row = findRow_(sheet, payload);
  if (!row) return;

  const values = getTableValues_(sheet);
  const headers = values.headers;
  const indexes = getIndexes_(headers);
  const currentRow = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const item = normalizeItem_(rowToItem_(currentRow, headers, row));
  const amount = toNumber_(payload.amount, 0);
  item.quantity = Math.max(0, toNumber_(item.quantity, 0) - amount);
  item.updatedAt = new Date().toISOString();

  if (indexes.quantity !== undefined) {
    sheet.getRange(row, indexes.quantity + 1).setValue(item.quantity);
  }
  if (indexes.updatedAt !== undefined) {
    sheet.getRange(row, indexes.updatedAt + 1).setValue(item.updatedAt);
  }
}

function findRow_(sheet, payload) {
  const values = getTableValues_(sheet);
  const headers = values.headers;
  const indexes = getIndexes_(headers);

  if (payload._rowIndex && Number(payload._rowIndex) >= 2) {
    return Number(payload._rowIndex);
  }

  if (!payload.id || indexes.id === undefined) return null;

  for (let i = 0; i < values.rows.length; i++) {
    if (String(values.rows[i][indexes.id] || '') === String(payload.id)) {
      return i + 2;
    }
  }

  return null;
}

function getTableValues_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), FIELDS.length);
  if (lastRow < 1) return { headers: [], rows: [] };

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return String(header || '').trim();
  });
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
  return { headers: headers, rows: rows };
}

function getIndexes_(headers) {
  const indexes = {};
  headers.forEach(function(header, index) {
    if (header) indexes[header] = index;
  });
  return indexes;
}

function rowToItem_(row, headers, sheetRow) {
  const item = {};
  headers.forEach(function(header, index) {
    if (header) item[header] = row[index];
  });
  item._rowIndex = sheetRow;
  return item;
}

function writeItemToRow_(sheet, rowNumber, item) {
  const values = getTableValues_(sheet);
  const indexes = getIndexes_(values.headers);
  const row = rowNumber <= sheet.getLastRow()
    ? sheet.getRange(rowNumber, 1, 1, values.headers.length).getValues()[0]
    : new Array(values.headers.length).fill('');
  const normalized = normalizeItem_(item);

  Object.keys(indexes).forEach(function(field) {
    if (normalized[field] !== undefined) {
      row[indexes[field]] = normalized[field];
    }
  });

  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function normalizeItem_(source) {
  const item = source || {};
  const now = new Date().toISOString();

  return {
    id: String(item.id || '').trim(),
    category: String(item.category || DEFAULTS.category).trim(),
    name: String(item.name || DEFAULTS.name).trim(),
    material: String(item.material || DEFAULTS.material).trim(),
    size: String(item.size || '').trim(),
    length: String(item.length || '').trim(),
    unit: String(item.unit || DEFAULTS.unit).trim(),
    supplier: String(item.supplier || '').trim(),
    maker: String(item.maker || '').trim(),
    projectNumber: String(item.projectNumber || '').trim(),
    projectName: String(item.projectName || '').trim(),
    remarks: String(item.remarks || '').trim(),
    modelCode: String(item.modelCode || '').trim(),
    quantity: toNumber_(item.quantity, DEFAULTS.quantity),
    minLot: toNumber_(item.minLot, DEFAULTS.minLot),
    orderQuantity: Math.max(1, toNumber_(item.orderQuantity, DEFAULTS.orderQuantity)),
    isOrdered: toBoolean_(item.isOrdered),
    orderedBy: String(item.orderedBy || '').trim(),
    orderedAt: String(item.orderedAt || '').trim(),
    createdAt: String(item.createdAt || now).trim(),
    updatedAt: String(item.updatedAt || '').trim(),
    _rowIndex: item._rowIndex || item.rowIndex || ''
  };
}

function toNumber_(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return isFinite(number) ? number : fallback;
}

function toBoolean_(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', '済', '発注済', '発注済み'].indexOf(normalized) !== -1;
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
