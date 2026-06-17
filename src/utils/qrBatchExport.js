import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import QRCode from 'qrcode';

// 1ラベル = 60mm×18mm（横長）
// QR列(16mm) + テキスト列(44mm) の2列構成
// A4(200mm usable) ÷ 60mm = 3ラベル/行

export async function exportQrLabels(items, gasUrl) {
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

  const LABELS_PER_ROW = 3;   // A4横に3ラベル
  const QR_COL_W  = 7.9;      // ~16mm
  const TXT_COL_W = 23.0;     // ~44mm
  const ROW_H     = 51;       // 18mm in pt
  const QR_PX     = 61;       // 16mm at 96dpi

  // 列幅設定（QR列・テキスト列を交互に3セット = 6列）
  for (let label = 0; label < LABELS_PER_ROW; label++) {
    ws.getColumn(label * 2 + 1).width = QR_COL_W;   // QR列
    ws.getColumn(label * 2 + 2).width = TXT_COL_W;  // テキスト列
  }

  for (let i = 0; i < items.length; i++) {
    const item      = items[i];
    const labelRow  = Math.floor(i / LABELS_PER_ROW);
    const labelCol  = i % LABELS_PER_ROW;
    const excelRow  = labelRow + 1;
    const qrCol     = labelCol * 2 + 1;   // 1,3,5
    const txtCol    = labelCol * 2 + 2;   // 2,4,6

    ws.getRow(excelRow).height = ROW_H;

    // QR画像生成・配置
    const qrValue = gasUrl ? `${gasUrl}?id=${item.id}` : item.id;
    const qrDataUrl = await QRCode.toDataURL(qrValue, {
      width: 160, margin: 1, errorCorrectionLevel: 'L',
    });
    const base64  = qrDataUrl.split(',')[1];
    const imageId = workbook.addImage({ base64, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: qrCol - 1, row: excelRow - 1 },
      ext: { width: QR_PX, height: QR_PX },
      editAs: 'oneCell',
    });

    // QR列の罫線（上・左・下）
    ws.getRow(excelRow).getCell(qrCol).border = {
      top:    { style: 'thin' },
      left:   { style: 'thin' },
      bottom: { style: 'thin' },
    };

    // テキスト列（名称 + 規格・仕様）
    const details = [
      item.size   && item.size   !== '-' ? item.size   : '',
      item.length && item.length !== '-' ? item.length : '',
    ].filter(Boolean).join('　');

    const txtCell = ws.getRow(excelRow).getCell(txtCol);
    txtCell.value = {
      richText: [
        { text: item.name + '\n', font: { bold: true, size: 8 } },
        ...(details ? [{ text: details, font: { bold: true, size: 14 } }] : []),
      ],
    };
    txtCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    txtCell.border = {
      top:    { style: 'thin' },
      right:  { style: 'thin' },
      bottom: { style: 'thin' },
    };
  }

  const buf = await workbook.xlsx.writeBuffer();
  const today = new Date().toLocaleDateString('ja-JP').replace(/\//g, '');
  saveAs(new Blob([buf]), `QRラベル一括_${today}.xlsx`);
}
