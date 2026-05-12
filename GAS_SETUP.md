# GAS Setup

このアプリで Google スプレッドシートを直接編集しても安全に使うための Google Apps Script 設定手順です。

## 1. スプレッドシートを準備

シート名は既定で `Inventory` です。別の名前を使う場合は、`gas/Code.gs` の先頭にある `SHEET_NAME` を変更してください。

1行目はヘッダー行です。`gas/Code.gs` は不足している列があれば自動で右側に追加します。

主な列名:

```text
id, category, name, material, size, length, unit, supplier, maker,
projectNumber, projectName, remarks, modelCode, quantity, minLot,
orderQuantity, isOrdered, orderedBy, orderedAt, createdAt, updatedAt
```

## 2. Apps Script にコードを貼り付け

1. Google スプレッドシートを開く
2. `拡張機能` → `Apps Script`
3. `Code.gs` に、このリポジトリの [gas/Code.gs](gas/Code.gs) の内容を貼り付け
4. 保存

## 3. Web アプリとしてデプロイ

1. Apps Script 画面右上の `デプロイ` → `新しいデプロイ`
2. 種類は `ウェブアプリ`
3. 実行ユーザーは `自分`
4. アクセスできるユーザーは運用に合わせて選択
5. デプロイ後に表示される Web アプリ URL をコピー
6. AC-STOCK の設定画面に貼り付け

## 4. id 自動補完の動き

スプレッドシートで直接部材行を追加する場合、`id` は空欄でかまいません。

アプリが GAS URL にアクセスすると、GAS 側の `doGet()` が以下を行います。

- `id` 空欄行に `Utilities.getUuid()` で ID を書き込み
- `createdAt` 空欄なら現在日時を補完
- `category`, `name`, `material`, `unit` などの空欄に既定値を補完
- `quantity`, `minLot`, `orderQuantity` を数値として扱える値に補正
- 補完済みのデータをアプリへ返す

つまり、スプレッドシートで直接追加するときは最低限、部材名や在庫数など必要な列だけ入力すれば、ID は GAS が補完します。

## 5. 動作確認

1. スプレッドシートに `id` 空欄の行を追加
2. アプリを再読み込み
3. スプレッドシートの `id` 列に UUID が入ることを確認
4. アプリで入庫、出庫、編集、QR 表示ができることを確認

## 6. 注意

- 既に別の GAS コードを使っている場合は、丸ごと置き換える前にバックアップしてください。
- 既存コードがある場合は、`ensureIds_()` と `normalizeItem_()` の考え方だけ統合するのが安全です。
- `doPost()` はフロント側の `add`, `update`, `delete`, `takeOut` に対応しています。
- アプリ側は `no-cors` で POST するため、フロントでは GAS の詳細エラーを直接読めません。GAS 側でエラーが出た場合は Apps Script の実行ログを確認してください。
