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
  const ROW_H = 142;       // 50mm in points (1ラベル = 1行)
  const QR_PX = 61;        // 16mm at 96dpi

  for (let c = 1; c <= COLS; c++) {
    ws.getColumn(c).width = COL_WIDTH;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowIndex = Math.floor(i / COLS) + 1;  // 1行 = 1ラベル
    const col = (i % COLS) + 1;

    ws.getRow(rowIndex).height = ROW_H;

    // QR画像をセル上部に固定サイズで配置
    const qrDataUrl = await QRCode.toDataURL(item.id, {
      width: 160, margin: 1, errorCorrectionLevel: 'M',
    });
    const base64 = qrDataUrl.split(',')[1];
    const imageId = workbook.addImage({ base64, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: col - 1, row: rowIndex - 1 },
      ext: { width: QR_PX, height: QR_PX },
      editAs: 'oneCell',
    });

    // テキストをセル下部に配置
    const lines = [item.name];
    if (item.size && item.size !== '-') lines.push(item.size);
    if (item.length && item.length !== '-') lines.push(item.length + 'mm');

    const cell = ws.getRow(rowIndex).getCell(col);
    cell.value = lines.join('\n');
    cell.alignment = { wrapText: true, vertical: 'bottom', horizontal: 'center' };
    cell.font = { size: 11, bold: true };
    cell.border = {
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
