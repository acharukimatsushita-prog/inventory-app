import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import QRCode from 'qrcode';

export async function exportQrLabels(items) {
  if (!items || items.length === 0) {
    alert('登録されている部材がありません。');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('QRラベル');

  ws.pageSetup.paperSize = 9; // A4
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.margins = {
    left: 0.197, right: 0.197,
    top: 0.197, bottom: 0.197,
    header: 0, footer: 0,
  };

  const COLS = 11;
  const COL_WIDTH = 9.5;  // ~18mm
  const ROW_QR_H = 45;    // ~16mm in pt
  const ROW_TXT_H = 96;   // ~34mm in pt

  for (let c = 1; c <= COLS; c++) {
    ws.getColumn(c).width = COL_WIDTH;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const blockRow = Math.floor(i / COLS);
    const col = (i % COLS) + 1;
    const qrExcelRow = blockRow * 2 + 1;
    const txtExcelRow = blockRow * 2 + 2;

    ws.getRow(qrExcelRow).height = ROW_QR_H;
    ws.getRow(txtExcelRow).height = ROW_TXT_H;

    const qrDataUrl = await QRCode.toDataURL(item.id, {
      width: 160, margin: 1, errorCorrectionLevel: 'M',
    });
    const base64 = qrDataUrl.split(',')[1];
    const imageId = workbook.addImage({ base64, extension: 'png' });

    ws.addImage(imageId, {
      tl: { col: col - 1, row: qrExcelRow - 1 },
      br: { col: col, row: qrExcelRow },
      editAs: 'oneCell',
    });

    const qrCell = ws.getRow(qrExcelRow).getCell(col);
    qrCell.border = {
      top:    { style: 'thin' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
      bottom: { style: 'thin' },
    };

    const lines = [item.name];
    if (item.size && item.size !== '-') lines.push(item.size);
    if (item.length && item.length !== '-') lines.push(item.length + 'mm');

    const txtCell = ws.getRow(txtExcelRow).getCell(col);
    txtCell.value = lines.join('\n');
    txtCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'center' };
    txtCell.font = { size: 9 };
    txtCell.border = {
      top:    { style: 'thin' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
      bottom: { style: 'thin' },
    };
  }

  const buf = await workbook.xlsx.writeBuffer();
  const today = new Date().toLocaleDateString('ja-JP').replace(/\//g, '');
  saveAs(new Blob([buf]), `QRラベル一括_${today}.xlsx`);
}
