import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export const exportOrderList = async (itemsToOrder, requesterName = '') => {
  if (!itemsToOrder || itemsToOrder.length === 0) {
    alert('発注が必要な部材がありません。');
    return;
  }

  // 1. 部材を「工番＋案件名」でグループ化する
  const groups = {};
  itemsToOrder.forEach(item => {
    const pNumber = item.projectNumber || '未設定工番';
    const pName = item.projectName || '未設定案件';
    const key = `${pNumber}_${pName}`;
    
    if (!groups[key]) {
      groups[key] = {
        projectNumber: pNumber,
        projectName: pName,
        items: []
      };
    }
    groups[key].items.push(item);
  });

  // 2. テンプレートファイルの読み込みを試みる
  let templateBuffer;
  try {
    // キャッシュを回避するためにタイムスタンプを付与
    const response = await fetch('/template.xlsx?t=' + Date.now());
    if (!response.ok) throw new Error('Template not found');
    templateBuffer = await response.arrayBuffer();
  } catch {
    alert('フォーマットファイル (template.xlsx) が読み込めませんでした。\npublicフォルダ内に正しく配置されているか確認してください。');
    return;
  }

  // 3. ZIPの準備
  const zip = new JSZip();
  const today = new Date();
  const dateStr = `${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,'0')}${today.getDate().toString().padStart(2,'0')}`;

  // 4. グループごとにExcelファイルを作成
  for (const [, group] of Object.entries(groups)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);
    
    // 強制的に1枚目のシートを最初に表示するように設定
    workbook.views = [
      {
        activeTab: 0,
        firstSheet: 0,
        x: 0, y: 0, width: 20000, height: 20000,
        visibility: 'visible'
      }
    ];

    const sheet = workbook.worksheets[0]; // 1枚目のシートを使用
    sheet.name = `${today.getFullYear()}.${(today.getMonth()+1).toString().padStart(2,'0')}.${today.getDate().toString().padStart(2,'0')}`;

    // もともと入っているダミーデータを5行目から消去しておく（レイアウト維持のため）
    for(let r = 5; r <= 30; r++) {
      for(let c = 2; c <= 15; c++) {
        sheet.getCell(r, c).value = null;
      }
    }

    // ヘッダー情報（工番・案件名・担当者）の書き込み
    // 3行B列 (B3), 3行D列 (D3), 3行L列 (L3)
    sheet.getCell('B3').value = group.projectNumber !== '未設定工番' ? group.projectNumber : '';
    sheet.getCell('D3').value = group.projectName !== '未設定案件' ? group.projectName : '';
    if (requesterName) {
      sheet.getCell('M3').value = requesterName;
    }

    // データ行の書き込み (5行目からスタート)
    let currentRow = 5;
    group.items.forEach((item, index) => {
      // B列に連番(No.)を入れる
      sheet.getCell(`B${currentRow}`).value = index + 1;
      
      const mat = (item.material && item.material !== '-') ? String(item.material).trim() : '';
      const itemName = String(item.name || '').trim();
      const name = mat || itemName;

      sheet.getCell(`C${currentRow}`).value = item.supplier || '';        // 発注先
      sheet.getCell(`D${currentRow}`).value = item.maker || '';           // メーカー
      sheet.getCell(`E${currentRow}`).value = name;                       // 名称（第3階層）
      sheet.getCell(`F${currentRow}`).value = item.modelCode || '';       // 型式
      sheet.getCell(`H${currentRow}`).value = item.orderQuantity || 1;    // 数量
      sheet.getCell(`I${currentRow}`).value = item.remarks || '';         // 備考
      
      // K列(追加工), L列(納期), M列(非該当証明) は手入力のため空欄のままにしておく
      
      currentRow++;
    });

    // バッファに書き出してZIPに追加
    const buffer = await workbook.xlsx.writeBuffer();
    // ファイル名に使用できない文字を除外
    const safeName = group.projectName.replace(/[\\/:*?"<>|]/g, '_');
    const safeNumber = group.projectNumber.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `発注書_${safeNumber}_${safeName}_${dateStr}.xlsx`;
    
    zip.file(fileName, buffer);
  }

  // 5. ZIPファイルの生成とダウンロード
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `発注リスト一式_${dateStr}.zip`);
};
