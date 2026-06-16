// ホーム画面アイコン・スプラッシュ画面用PNG生成スクリプト
// node generate-icons.js で実行

const sharp = require('sharp');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

// Lucide Package icon paths (24x24 viewBox)
const PKG = `
  <path d="M16.5 9.4 7.55 4.24" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <polyline points="3.29 7 12 12 20.71 7" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="12" y1="22" x2="12" y2="12" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
`;

// フルブリード（maskable用）: 全面ブルーグラデーション + Packageアイコン
function makeMaskableSvg(size) {
  const pad = Math.round(size * 0.2);
  const iconSize = size - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1D4E9E"/>
      <stop offset="100%" stop-color="#0A1E4A"/>
    </linearGradient>
    <radialGradient id="gl" cx="50%" cy="38%" r="52%">
      <stop offset="0%" stop-color="#4B82F6" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#1D4E9E" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <ellipse cx="${size / 2}" cy="${size * 0.42}" rx="${size * 0.42}" ry="${size * 0.36}" fill="url(#gl)"/>
  <svg x="${pad}" y="${pad}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24">${PKG}</svg>
</svg>`;
}

// 通常アイコン（any用）: 濃紺背景 + ブルーグラデーションの角丸カード + Packageアイコン
function makeRegularSvg(size) {
  const pad = Math.round(size * 0.11);
  const card = size - pad * 2;
  const rx = Math.round(card * 0.22);
  const iconPad = Math.round(size * 0.225);
  const iconSize = size - iconPad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#153C7A"/>
    </linearGradient>
    <radialGradient id="gl" cx="50%" cy="35%" r="55%">
      <stop offset="0%" stop-color="#60A5FA" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#1D4E9E" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="cc">
      <rect x="${pad}" y="${pad}" width="${card}" height="${card}" rx="${rx}"/>
    </clipPath>
  </defs>
  <!-- 濃紺背景 -->
  <rect width="${size}" height="${size}" fill="#09090B"/>
  <!-- ブルーカード -->
  <rect x="${pad}" y="${pad}" width="${card}" height="${card}" rx="${rx}" fill="url(#card)"/>
  <!-- 上半分のハイライト -->
  <rect x="${pad}" y="${pad}" width="${card}" height="${Math.round(card * 0.48)}" clip-path="url(#cc)" fill="rgba(255,255,255,0.09)"/>
  <!-- グロー -->
  <ellipse cx="${size / 2}" cy="${size * 0.38}" rx="${size * 0.28}" ry="${size * 0.24}" clip-path="url(#cc)" fill="url(#gl)"/>
  <!-- Packageアイコン -->
  <svg x="${iconPad}" y="${iconPad}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24">${PKG}</svg>
</svg>`;
}

// ファビコン用SVG（32x32相当、ブルーグラデーション背景 + Packageアイコン）
function makeFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#153C7A"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#bg)"/>
  <svg x="4" y="4" width="24" height="24" viewBox="0 0 24 24">
    <path d="M16.5 9.4 7.55 4.24" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <polyline points="3.29 7 12 12 20.71 7" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <line x1="12" y1="22" x2="12" y2="12" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</svg>`;
}

async function generateAll() {
  // maskable アイコン（Android等がどんな形にも切り抜ける）
  for (const size of [512, 192]) {
    await sharp(Buffer.from(makeMaskableSvg(size)))
      .png()
      .toFile(path.join(publicDir, `icon-maskable-${size}.png`));
    console.log(`✓ icon-maskable-${size}.png`);
  }

  // 通常アイコン（ホーム画面 / PWAアイコン）
  for (const size of [512, 192]) {
    await sharp(Buffer.from(makeRegularSvg(size)))
      .png()
      .toFile(path.join(publicDir, `icon-${size}.png`));
    console.log(`✓ icon-${size}.png`);
  }

  // apple-touch-icon（iOS ホーム画面用、180x180 フルブリード）
  await sharp(Buffer.from(makeMaskableSvg(180)))
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png');

  // ファビコン SVG を更新
  const fs = require('fs');
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), makeFaviconSvg(), 'utf8');
  console.log('✓ favicon.svg');

  console.log('\nアイコン生成完了！');
}

generateAll().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
