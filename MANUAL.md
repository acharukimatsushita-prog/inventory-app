# AC-STOCK Inventory System マニュアル

## 1. 概要

AC-STOCK Inventory System は、FA 部材の在庫をブラウザで管理する React + Vite 製の在庫管理アプリです。

主な機能は次のとおりです。

- 部材の登録、編集、複製、削除
- 在庫の入庫、出庫
- 最小ロット以下の部材の発注アラート表示
- 発注対象部材の Excel 出力
- QR コードの発行、印刷、画像保存
- カメラによる QR スキャン
- 棚卸モードによる在庫数の一括更新
- Google Apps Script Web アプリとのデータ連携
- ダーク/ライトテーマ切り替え
- PWA 対応

## 2. 起動方法

### 2.1 必要なもの

- Node.js
- npm
- Google Apps Script の Web アプリ URL
- `public/template.xlsx`

依存パッケージは `package-lock.json` と `node_modules` が存在するため、通常はそのまま起動できます。再構築する場合は `npm install` を実行します。

### 2.2 開発サーバー

```bash
npm run dev
```

Vite の開発サーバーが起動します。`vite.config.js` で `@vitejs/plugin-basic-ssl` を利用しているため、HTTPS のローカルサーバーとして動きます。

### 2.3 ビルド

```bash
npm run build
```

本番用ファイルを `dist` に生成します。

### 2.4 プレビュー

```bash
npm run preview
```

ビルド後の成果物をローカルで確認します。

## 3. 初期設定

初回起動時、または GAS URL が保存されていない場合は設定画面が開きます。

1. Google Apps Script を Web アプリとしてデプロイします。
2. 発行された URL を「Web アプリ URL」に入力します。
3. 保存します。

URL はブラウザの `localStorage` に `gas_api_url` として保存されます。

## 4. 画面構成

### 4.1 ヘッダー

ヘッダーには次の操作があります。

- 要発注フィルタ: 最小ロット以下の部材だけを表示
- 発注リスト出力: 発注対象を Excel/ZIP で出力
- 棚卸: 在庫数の一括修正モードを開始
- 金額集計: 棚卸モード中に在庫合計金額と部材別金額をモーダルで表示
- テーマ切り替え: ダーク/ライトを切り替え
- 設定: GAS URL 設定を開く
- 新規登録: 部材登録モーダルを開く

### 4.2 サイドバー

部材の `category` と `name` からカテゴリーツリーを自動生成します。

- 大分類: `category`
- 中分類: `name`
- 未設定の `category` は「未分類」として扱われます。

### 4.3 一覧テーブル

一覧には次の情報が表示されます。

- 状態: 適正、要発注、発注済
- 部材名/材質
- 規格/サイズ
- 仕様/詳細
- 入庫/出庫ボタン、または棚卸入力欄
- 現在庫
- 単位
- 編集、QR、複製、削除

検索欄では `material`、`name`、`size`、`supplier` が検索対象です。

## 5. 基本操作

### 5.1 部材を登録する

1. 「新規登録」を押します。
2. 大分類、中分類、具体的な部材名/材質を入力します。
3. 在庫数、最小ロット、単位、税抜単価を入力します。
4. 必要に応じて工番、案件名、発注先、メーカー、型式、備考、発注数量を入力します。
5. 登録します。

登録時に `id` と `createdAt` が自動付与されます。

### 5.2 部材を編集する

一覧右端の編集ボタンから登録内容を変更します。更新時に `updatedAt` が付与されます。

### 5.3 部材を複製する

一覧右端の複製ボタンから既存部材をもとに新規登録できます。複製時の初期在庫数は `0` になります。

### 5.4 部材を削除する

一覧右端の削除ボタンから削除します。削除は GAS に `delete` アクションとして送信されます。

### 5.5 出庫する

1. 一覧の「出庫」を押します。
2. 出庫数を入力します。
3. 確定します。

在庫数は `0` 未満にならないように補正されます。出庫後に在庫数が最小ロット以下へ下がった場合、画面上でアラートが表示されます。

### 5.6 入庫する

1. 一覧の「入庫」を押します。
2. 入庫数を入力します。
3. 確定します。

入庫時は在庫数が加算され、`isOrdered`、`orderedBy`、`orderedAt` がクリアされます。

### 5.7 在庫金額を確認する

棚卸モードを開始し、「在庫数を確定」の横に表示される「金額集計」を押すと、在庫合計金額と部材別の在庫金額を確認できます。
金額は `単価 × 現在庫数` で都度計算され、通常の在庫一覧や集計欄には表示されません。
単価未入力の部材は `0円` として扱われます。

## 6. 発注管理

### 6.1 要発注の判定

次の条件を満たす部材が発注対象です。

```js
quantity <= minLot
```

在庫が `0` の場合も要発注表示になります。

### 6.2 発注リストを出力する

1. 「発注リスト出力」を押します。
2. 発注担当者名を入力します。
3. Excel 出力を開始します。

出力処理では `public/template.xlsx` を読み込み、発注対象部材を `projectNumber` と `projectName` ごとにグループ化します。

### 6.3 出力されるファイル

ZIP ファイル名:

```text
発注リスト一式_YYYYMMDD.zip
```

ZIP 内の Excel ファイル名:

```text
発注書_工番_案件名_YYYYMMDD.xlsx
```

### 6.4 Excel への書き込み位置

`src/utils/excelExport.js` では、テンプレートの 1 枚目シートに以下を書き込みます。

| セル/列 | 内容 |
| --- | --- |
| B3 | 工番 |
| D3 | 案件名 |
| M3 | 発注担当者 |
| B5 以降 | 連番 |
| C5 以降 | 発注先 |
| D5 以降 | メーカー |
| E5 以降 | 名称 |
| F5 以降 | 型式 |
| H5 以降 | 数量 |
| I5 以降 | 備考 |

5 行目から 30 行目、B 列から O 列の既存値は出力前にクリアされます。

### 6.5 発注済みにする

Excel 出力後、対象部材を発注済みにできます。発注済みにすると次の値が更新されます。

- `isOrdered: true`
- `orderedBy: 発注担当者`
- `orderedAt: 現在日時`

一覧の状態バッジをクリックして、手動で発注済み/未発注を切り替えることもできます。

## 7. QR コード

### 7.1 QR を発行する

一覧右端の QR ボタンから QR コードを表示します。QR コードには部材の `id` が入ります。
QR コード本体は、ねじ棚の約 3 cm 角のスペースに収まるよう、印刷時に縦横 30 mm で出力されます。

可能な操作:

- 印刷
- PNG 画像として保存

### 7.2 QR をスキャンする

1. 「QR スキャン」を押します。
2. カメラ許可をします。
3. QR コードを枠内に入れます。
4. 一致する `id` の部材が見つかると、入庫/出庫モーダルが開きます。

QR 読み取りには `react-webcam` と `jsqr` を使用しています。

## 8. 棚卸

1. 「棚卸」を押します。
2. 一覧の在庫数欄に実在庫を入力します。
3. 「在庫数を確定」を押します。
4. 確認後、変更された在庫数が一括更新されます。

一括更新中は進捗モーダルが表示されます。処理中は画面を閉じないでください。

## 9. データ構造

部材データは概ね次のフィールドを持ちます。

| フィールド | 内容 |
| --- | --- |
| `id` | 部材 ID。新規登録時に `crypto.randomUUID()` で生成 |
| `category` | 大分類 |
| `name` | 中分類/部材種別 |
| `material` | 具体的な部材名、材質、品名 |
| `size` | 規格/サイズ |
| `length` | 仕様/詳細 |
| `unit` | 単位 |
| `supplier` | 発注先 |
| `maker` | メーカー |
| `projectNumber` | 工番 |
| `projectName` | 案件名 |
| `remarks` | 備考 |
| `modelCode` | 注文コード/型式 |
| `quantity` | 現在庫 |
| `unitPrice` | 税抜単価（円） |
| `minLot` | 発注点/最小ロット |
| `orderQuantity` | 発注数量 |
| `isOrdered` | 発注済みフラグ |
| `orderedBy` | 発注担当者 |
| `orderedAt` | 発注日時 |
| `createdAt` | 登録日時 |
| `updatedAt` | 更新日時 |

## 10. GAS 連携仕様

`src/hooks/useInventory.js` が GAS との通信を担当します。

### 10.1 取得

アプリ起動時に GAS URL へ `GET` します。

```js
fetch(gasUrl)
```

レスポンスは JSON 配列を想定しています。

### 10.2 更新

更新系は GAS URL へ `POST` します。本文は次の形式です。

```json
{
  "action": "add | update | delete | takeOut",
  "payload": {}
}
```

通常更新は `mode: 'no-cors'` で送信されるため、フロント側では GAS のレスポンス本文を読みません。画面は optimistic UI として先に更新されます。

### 10.3 アクション

| action | 用途 |
| --- | --- |
| `add` | 部材追加 |
| `update` | 部材更新、入庫、棚卸、発注済み更新 |
| `delete` | 部材削除 |
| `takeOut` | 出庫 |

GAS 側には上記アクションを処理し、スプレッドシートへ反映する実装が必要です。
`gas/Code.gs` には貼り付け用の GAS 実装例があります。Google スプレッドシートを直接編集して追加した行は、GAS 側で `id` や不足項目を自動補完できます。セットアップ手順は `GAS_SETUP.md` を参照してください。

## 11. コード構成

```text
inventory-app/
  index.html
  package.json
  vite.config.js
  GAS_SETUP.md
  gas/
    Code.gs
  public/
    template.xlsx
    logo.png
    icons.svg
    favicon.svg
  src/
    main.jsx
    App.jsx
    index.css
    App.css
    hooks/
      useInventory.js
    utils/
      excelExport.js
```

### 11.1 `src/main.jsx`

React のエントリーポイントです。`App` を `#root` に描画します。

### 11.2 `src/App.jsx`

画面全体と主要操作を担当します。

含まれる主なコンポーネント:

- `App`: 全体状態、検索、フィルタ、モーダル制御
- `QrScannerModal`: カメラで QR 読み取り
- `QrPrintModal`: QR 表示、印刷、PNG 保存
- `SettingsModal`: GAS URL 設定
- `InventoryValueModal`: 在庫合計金額と部材別金額の表示
- `TransactionModal`: 入庫/出庫
- `ItemModal`: 部材登録/編集/複製

### 11.3 `src/hooks/useInventory.js`

在庫データの取得、ローカル状態更新、GAS 同期を担当します。

公開している関数:

- `addItem`
- `updateItem`
- `deleteItem`
- `takeOutItem`
- `restockItem`
- `batchUpdateItems`

### 11.4 `src/utils/excelExport.js`

発注対象部材を Excel テンプレートへ書き込み、ZIP としてダウンロードします。

使用ライブラリ:

- `exceljs`
- `jszip`
- `file-saver`

### 11.5 `src/index.css`

全体のスタイルを管理します。ダーク/ライトテーマ、ボタン、フォーム、テーブル、モーダル、レスポンシブ、印刷用 CSS が含まれます。

### 11.6 `vite.config.js`

Vite、React、HTTPS、PWA の設定です。

PWA manifest:

- name: `FA部材在庫管理システム`
- short_name: `在庫管理`
- display: `standalone`
- icon: `public/logo.png`

## 12. localStorage

ブラウザには次の値が保存されます。

| キー | 内容 |
| --- | --- |
| `gas_api_url` | GAS Web アプリ URL |
| `theme` | `dark` または `light` |
| `last_requester` | 最後に入力した発注担当者名 |

## 13. 注意事項

- GAS URL が未設定の場合、在庫データは取得されません。
- 更新系通信は `no-cors` のため、GAS 側で失敗してもフロント側では詳細なレスポンスを取得できません。
- Excel 出力には `public/template.xlsx` が必須です。
- QR スキャンにはカメラ権限と HTTPS 環境が必要です。
- 発注済みフラグは入庫時に自動で解除されます。
- README は Vite 初期テンプレートの内容のままで、現状のアプリ説明はこのマニュアルを参照してください。
