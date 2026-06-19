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
  'unitPrice',
  'minLot',
  'orderQuantity',
  'isOrdered',
  'orderedBy',
  'orderedAt',
  'leadDays',
  'createdAt',
  'updatedAt'
];

const DEFAULTS = {
  category:'未分類',name:'未分類',material:'名称未設定',
  size:'',length:'',unit:'個',supplier:'',maker:'',
  projectNumber:'',projectName:'',remarks:'',modelCode:'',
  quantity:0,unitPrice:0,minLot:0,orderQuantity:1,
  isOrdered:false,orderedBy:'',orderedAt:'',leadDays:0,createdAt:'',updatedAt:''
};

function doGet(e) {
  const sheet = getSheet_();
  if (e && e.parameter && e.parameter.id) {
    return serveItemPage_(sheet, e.parameter.id);
  }
  if (e && e.parameter && e.parameter.debug === '1') {
    return json_(getDebugInfo_(sheet), e.parameter.callback);
  }
  ensureHeaders_(sheet);
  ensureIds_(sheet);
  const items = readItems_(sheet);
  return json_(items, e && e.parameter && e.parameter.callback);
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
  } else if (action === 'addIn') {
    addIn_(sheet, payload);
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

function getDebugInfo_(sheet) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const previewRowCount = Math.min(lastRow, 5);
  const previewColumnCount = Math.min(Math.max(lastColumn, 1), FIELDS.length);
  return {
    spreadsheetName: spreadsheet.getName(),
    spreadsheetId: spreadsheet.getId(),
    sheetName: sheet.getName(),
    allSheetNames: spreadsheet.getSheets().map(function(s) { return s.getName(); }),
    lastRow: lastRow,
    lastColumn: lastColumn,
    preview: previewRowCount > 0 ? sheet.getRange(1,1,previewRowCount,previewColumnCount).getValues() : []
  };
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,FIELDS.length).setValues([FIELDS]);
    return;
  }
  const existing = sheet.getRange(1,1,1,Math.max(sheet.getLastColumn(),FIELDS.length)).getValues()[0];
  const missing = FIELDS.filter(function(field) { return existing.indexOf(field) === -1; });
  if (missing.length === 0) return;
  sheet.getRange(1, sheet.getLastColumn()+1, 1, missing.length).setValues([missing]);
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
    const hasAnyValue = row.some(function(v) { return v !== '' && v !== null; });
    if (!hasAnyValue) return;
    const item = rowToItem_(row, headers, sheetRow);
    const normalized = normalizeItem_(item);
    let changed = false;
    if (!item.id) { normalized.id = Utilities.getUuid(); changed = true; }
    FIELDS.forEach(function(field) {
      if (indexes[field] === undefined) return;
      if ((row[indexes[field]] === '' || row[indexes[field]] === null) && normalized[field] !== '') changed = true;
    });
    if (!item.createdAt) { normalized.createdAt = now; changed = true; }
    if (changed) updates.push({ row: sheetRow, item: normalized });
  });
  updates.forEach(function(u) { writeItemToRow_(sheet, u.row, u.item); });
}

function readItems_(sheet) {
  const values = getTableValues_(sheet);
  if (values.rows.length === 0) return [];
  return values.rows.map(function(row, rowOffset) {
    const sheetRow = rowOffset + 2;
    const hasAnyValue = row.some(function(v) { return v !== '' && v !== null; });
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
  if (!row) {
    Logger.log('updateItem_: 行が見つかりません。id=' + item.id);
    return;
  }
  item.updatedAt = item.updatedAt || new Date().toISOString();
  writeItemToRow_(sheet, row, item);
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
  if (indexes.quantity !== undefined) sheet.getRange(row, indexes.quantity+1).setValue(item.quantity);
  if (indexes.updatedAt !== undefined) sheet.getRange(row, indexes.updatedAt+1).setValue(item.updatedAt);
}

function addIn_(sheet, payload) {
  const row = findRow_(sheet, payload);
  if (!row) return;
  const values = getTableValues_(sheet);
  const headers = values.headers;
  const indexes = getIndexes_(headers);
  const currentRow = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const item = normalizeItem_(rowToItem_(currentRow, headers, row));
  const amount = toNumber_(payload.amount, 0);
  item.quantity = toNumber_(item.quantity, 0) + amount;
  item.updatedAt = new Date().toISOString();
  if (indexes.quantity !== undefined) sheet.getRange(row, indexes.quantity+1).setValue(item.quantity);
  if (indexes.updatedAt !== undefined) sheet.getRange(row, indexes.updatedAt+1).setValue(item.updatedAt);
}

function takeOutFromHtml(itemId, amount) {
  var sheet = getSheet_();
  takeOut_(sheet, { id: itemId, amount: Number(amount) });
  return getItemById_(sheet, itemId);
}

function addInFromHtml(itemId, amount) {
  var sheet = getSheet_();
  addIn_(sheet, { id: itemId, amount: Number(amount) });
  return getItemById_(sheet, itemId);
}

function getItemById_(sheet, itemId) {
  var items = readItems_(sheet);
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === itemId) return items[i];
  }
  return null;
}

function serveItemPage_(sheet, itemId) {
  ensureHeaders_(sheet);
  var item = getItemById_(sheet, itemId);
  if (!item) {
    return HtmlService.createHtmlOutput(
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<p style="padding:2rem;font-family:sans-serif">部材が見つかりません。</p>'
    );
  }
  var details = [
    item.size && item.size !== '-' ? item.size : '',
    item.length && item.length !== '-' ? item.length : ''
  ].filter(function(v){return v;}).join(' ');

  var html =
    '<!DOCTYPE html><html><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc_(item.name) + '</title>' +
    '<style>' +
    '*{box-sizing:border-box}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:1.25rem;background:#0f172a;color:#e2e8f0;max-width:420px;margin:0 auto}' +
    'h1{font-size:1.2rem;margin:0 0 0.25rem}' +
    '.sub{color:#94a3b8;font-size:0.9rem;margin-bottom:1.5rem}' +
    '.qty-box{font-size:2.5rem;font-weight:bold;text-align:center;padding:1.25rem;background:#1e293b;border-radius:12px;margin:0 0 1.25rem}' +
    '.unit{font-size:1rem;color:#94a3b8}' +
    'label{font-size:0.85rem;color:#94a3b8;display:block;margin-bottom:0.4rem}' +
    '.amt-row{display:grid;grid-template-columns:3.5rem 1fr 3.5rem;gap:0.5rem;margin-bottom:1rem}' +
    '.amt-row input{width:100%;padding:0.875rem;font-size:1.5rem;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:8px;text-align:center}' +
    '.btn-pm{background:#1e293b;color:#e2e8f0;font-size:1.8rem;border:1px solid #334155;border-radius:8px;cursor:pointer;line-height:1}' +
    '.btn-row{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem}' +
    'button{padding:1rem;font-size:1.1rem;font-weight:bold;border:none;border-radius:10px;cursor:pointer}' +
    'button:disabled{opacity:0.4}' +
    '.btn-out{background:#dc2626;color:#fff}' +
    '.btn-in{background:#16a34a;color:#fff}' +
    '.msg{text-align:center;padding:0.875rem;border-radius:8px;margin-top:1rem;font-weight:bold;display:none}' +
    '.ok{background:#166534;color:#bbf7d0;display:block}' +
    '.err{background:#7f1d1d;color:#fecaca;display:block}' +
    '</style></head><body>' +
    '<h1>' + esc_(item.name) + '</h1>' +
    '<div class="sub">' + esc_(item.material || '') + (details ? ' / ' + esc_(details) : '') + '</div>' +
    '<div class="qty-box" id="qtyBox">' + Number(item.quantity||0) + '<span class="unit"> ' + esc_(item.unit||'個') + '</span></div>' +
    '<label>数量</label>' +
    '<div class="amt-row">' +
    '<button class="btn-pm" onclick="adj(-1)">－</button>' +
    '<input type="number" id="amt" value="1" min="1" max="9999">' +
    '<button class="btn-pm" onclick="adj(1)">＋</button>' +
    '</div>' +
    '<div class="btn-row">' +
    '<button class="btn-out" id="btnOut" onclick="doTx(\'out\')">出庫する</button>' +
    '<button class="btn-in" id="btnIn" onclick="doTx(\'in\')">入庫する</button>' +
    '</div>' +
    '<div class="msg" id="msg"></div>' +
    '<script>' +
    'var ID="' + esc_(item.id) + '";' +
    'function adj(d){var el=document.getElementById("amt");var v=parseInt(el.value)||1;el.value=Math.max(1,v+d);}' +
    'function doTx(t){' +
      'var a=parseInt(document.getElementById("amt").value)||1;' +
      'document.getElementById("btnOut").disabled=true;' +
      'document.getElementById("btnIn").disabled=true;' +
      'google.script.run' +
        '.withSuccessHandler(function(u){' +
          'if(u)document.getElementById("qtyBox").innerHTML=u.quantity+\'<span class="unit"> ' + esc_(item.unit||'個') + '</span>\';' +
          'show(t==="out"?"出庫しました ✓":"入庫しました ✓",true);' +
          'document.getElementById("btnOut").disabled=false;' +
          'document.getElementById("btnIn").disabled=false;' +
        '}).withFailureHandler(function(e){' +
          'show("エラー: "+e.message,false);' +
          'document.getElementById("btnOut").disabled=false;' +
          'document.getElementById("btnIn").disabled=false;' +
        '})[t==="out"?"takeOutFromHtml":"addInFromHtml"](ID,a);' +
    '}' +
    'function show(t,ok){var e=document.getElementById("msg");e.textContent=t;e.className="msg "+(ok?"ok":"err");}' +
    '<\/script>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(item.name)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function esc_(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function findRow_(sheet, payload) {
  const values = getTableValues_(sheet);
  const headers = values.headers;
  const indexes = getIndexes_(headers);
  // IDが存在する場合はID検索を優先（_rowIndexより確実）
  if (payload.id && indexes.id !== undefined) {
    for (let i = 0; i < values.rows.length; i++) {
      if (String(values.rows[i][indexes.id]||'') === String(payload.id)) return i + 2;
    }
  }
  // IDで見つからない場合のみ_rowIndexにフォールバック
  if (!payload.id && payload._rowIndex && Number(payload._rowIndex) >= 2) return Number(payload._rowIndex);
  return null;
}

function getTableValues_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), FIELDS.length);
  if (lastRow < 1) return { headers: [], rows: [] };
  const headers = sheet.getRange(1,1,1,lastColumn).getValues()[0].map(function(h){ return String(h||'').trim(); });
  const rows = lastRow > 1 ? sheet.getRange(2,1,lastRow-1,lastColumn).getValues() : [];
  return { headers: headers, rows: rows };
}

function getIndexes_(headers) {
  const indexes = {};
  headers.forEach(function(h,i){ if(h) indexes[h]=i; });
  return indexes;
}

function rowToItem_(row, headers, sheetRow) {
  const item = {};
  headers.forEach(function(h,i){ if(h) item[h]=row[i]; });
  item._rowIndex = sheetRow;
  return item;
}

function writeItemToRow_(sheet, rowNumber, item) {
  const values = getTableValues_(sheet);
  const indexes = getIndexes_(values.headers);
  const row = rowNumber <= sheet.getLastRow()
    ? sheet.getRange(rowNumber,1,1,values.headers.length).getValues()[0]
    : new Array(values.headers.length).fill('');
  const normalized = normalizeItem_(item);
  Object.keys(indexes).forEach(function(field){
    if (normalized[field] !== undefined) row[indexes[field]] = normalized[field];
  });
  sheet.getRange(rowNumber,1,1,row.length).setValues([row]);
}

function normalizeItem_(source) {
  const item = source || {};
  const now = new Date().toISOString();
  return {
    id: String(item.id||'').trim(),
    category: String(item.category||DEFAULTS.category).trim(),
    name: String(item.name||DEFAULTS.name).trim(),
    material: String(item.material||DEFAULTS.material).trim(),
    size: String(item.size||'').trim(),
    length: String(item.length||'').trim(),
    unit: String(item.unit||DEFAULTS.unit).trim(),
    supplier: String(item.supplier||'').trim(),
    maker: String(item.maker||'').trim(),
    projectNumber: String(item.projectNumber||'').trim(),
    projectName: String(item.projectName||'').trim(),
    remarks: String(item.remarks||'').trim(),
    modelCode: String(item.modelCode||'').trim(),
    quantity: toNumber_(item.quantity, DEFAULTS.quantity),
    unitPrice: Math.max(0, toNumber_(item.unitPrice, DEFAULTS.unitPrice)),
    minLot: toNumber_(item.minLot, DEFAULTS.minLot),
    orderQuantity: Math.max(1, toNumber_(item.orderQuantity, DEFAULTS.orderQuantity)),
    isOrdered: toBoolean_(item.isOrdered),
    orderedBy: String(item.orderedBy||'').trim(),
    orderedAt: String(item.orderedAt||'').trim(),
    leadDays: toNumber_(item.leadDays, 0),
    createdAt: String(item.createdAt||now).trim(),
    updatedAt: String(item.updatedAt||'').trim(),
    _rowIndex: item._rowIndex || item.rowIndex || ''
  };
}

function addBusinessDays_(days) {
  if (!days || days <= 0) return '';
  var date = new Date();
  var added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    var dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return (date.getMonth() + 1) + '/' + date.getDate();
}

function toNumber_(value, fallback) {
  if (value===''||value===null||value===undefined) return fallback;
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

function toBoolean_(value) {
  if (typeof value==='boolean') return value;
  return ['true','1','yes','y','済','発注済','発注済み'].indexOf(String(value||'').trim().toLowerCase()) !== -1;
}

function parseRequest_(e) {
  if (!e||!e.postData||!e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function json_(value, callback) {
  const output = callback ? callback+'('+JSON.stringify(value)+');' : JSON.stringify(value);
  const mimeType = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(output).setMimeType(mimeType);
}

// ===== 発注点以下 メール通知 =====
// メール通知を一時停止する場合は false に変更し、GASにデプロイする
// 再開する場合は true に戻してデプロイする
var NOTIFY_ENABLED = false;

function checkLowStockAndNotify() {
  if (!NOTIFY_ENABLED) {
    Logger.log('メール通知は停止中です（NOTIFY_ENABLED = false）。');
    return;
  }

  var props = PropertiesService.getScriptProperties();
  var email = props.getProperty('NOTIFY_EMAIL');
  if (!email) {
    Logger.log('通知先メールが未設定です。setNotifyEmail() を実行してください。');
    return;
  }

  var sheet = getSheet_();
  var items = readItems_(sheet);

  var lowStock = items.filter(function(item) {
    var qty = Number(item.quantity || 0);
    var min = Number(item.minLot || 0);
    return min > 0 && qty <= min && !toBoolean_(item.isOrdered);
  });

  if (lowStock.length === 0) {
    Logger.log('発注点以下の部材はありません。');
    return;
  }

  var lines = lowStock.map(function(item) {
    var name = [item.name, item.material, item.size].filter(function(v){return v && v !== '-';}).join(' ');
    return '・' + name + '\n  現在庫: ' + item.quantity + item.unit + '　発注点: ' + item.minLot + item.unit + '　発注数: ' + (item.orderQuantity || 1) + item.unit;
  });

  var subject = '【在庫管理】発注点以下の部材が ' + lowStock.length + ' 件あります';
  var body =
    '以下の部材が発注点以下になっています。\n\n' +
    lines.join('\n\n') +
    '\n\n発注リスト（Excel）を添付しています。\n\n---\nFA部材在庫管理システム';

  var blobs = createOrderListExcel_(lowStock);

  var mailOptions = { to: email, subject: subject, body: body };
  if (blobs.length > 0) mailOptions.attachments = blobs;

  MailApp.sendEmail(mailOptions);
  Logger.log('通知メール送信完了: ' + lowStock.length + '件 / Excel添付: ' + blobs.length + 'ファイル');
}

function createOrderListExcel_(items) {
  var TEMPLATE_ID = '1otwxaJanQ5Q8IYhde_WmKBe3pX1q14nwBC9A0xm8gy8';
  var templateSs;
  try {
    templateSs = SpreadsheetApp.openById(TEMPLATE_ID);
  } catch(e) {
    Logger.log('テンプレートを開けません。ID: ' + TEMPLATE_ID + ' / ' + e.message);
    return [];
  }
  var today    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  var dateLabel = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy.MM.dd');

  // 工番＋案件名でグループ化（excelExport.js と同じキー）
  var groups = {};
  items.forEach(function(item) {
    var pNum  = item.projectNumber || '未設定工番';
    var pName = item.projectName   || '未設定案件';
    var key = pNum + '_' + pName;
    if (!groups[key]) groups[key] = { projectNumber: pNum, projectName: pName, rows: [] };
    groups[key].rows.push(item);
  });

  var blobs = [];
  Object.keys(groups).forEach(function(key) {
    var g = groups[key];

    // Spreadsheet.copy() で Google Sheets として複製（xlsx バイナリではなくシートとして操作可能）
    var ss = templateSs.copy('_発注リスト_tmp_' + key);
    var ws = ss.getSheets()[0];
    ws.setName(dateLabel);

    // ヘッダー（B3=工番, D3=案件名）
    ws.getRange('B3').setValue(g.projectNumber !== '未設定工番' ? g.projectNumber : '');
    ws.getRange('D3').setValue(g.projectName   !== '未設定案件' ? g.projectName   : '');

    // 既存データクリア（5〜30行目、B〜N列）
    ws.getRange(5, 2, 26, 13).clearContent();

    // データ行（excelExport.js と同じ列配置）
    g.rows.forEach(function(item, i) {
      var row  = 5 + i;
      var mat = (item.material && item.material !== '-') ? String(item.material).trim() : '';
      var itemName = String(item.name || '').trim();
      var name = mat || itemName;
      ws.getRange(row, 2).setValue(i + 1);                            // B: No.
      ws.getRange(row, 3).setValue(item.supplier  || '');             // C: 発注先
      ws.getRange(row, 4).setValue(item.maker     || '');             // D: メーカー
      ws.getRange(row, 5).setValue(name           || '');             // E: 名称
      ws.getRange(row, 6).setValue(item.modelCode || '');             // F: 型式
      ws.getRange(row, 8).setValue(Number(item.orderQuantity) || 1);   // H: 数量
      ws.getRange(row, 9).setValue(item.remarks || '');               // I: 備考
      ws.getRange(row, 12).setValue(addBusinessDays_(item.leadDays)); // L: 納期
    });

    SpreadsheetApp.flush();

    // .xlsx として取得（DriveApp.getAs は Google Sheets→xlsx 非対応のため UrlFetchApp を使用）
    var safeNum  = g.projectNumber.replace(/[\\/:*?"<>|]/g, '_');
    var safeName = g.projectName.replace(/[\\/:*?"<>|]/g, '_');
    var fileName = '発注書_' + safeNum + '_' + safeName + '_' + today + '.xlsx';

    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
    var token = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    var blob = response.getBlob().setName(fileName);

    blobs.push(blob);
    DriveApp.getFileById(ss.getId()).setTrashed(true);
  });

  return blobs;
}

function setNotifyEmail() {
  var email = 'h-matsushita@asia-create.jp,ac.seizo.team@gmail.com,y-hishida@asia-create.jp,y-hayashi@asia-create.jp,otsubo@asia-create.jp';
  PropertiesService.getScriptProperties().setProperty('NOTIFY_EMAIL', email);
  Logger.log('通知先を設定しました: ' + email);
}
// ==========================================
