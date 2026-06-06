#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

function getShortSha() {
  const envSha =
    process.env.ZEABUR_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.CF_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    '';
  if (envSha) return envSha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (_) {
    const now = new Date();
    return now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  }
}

const shortSha = getShortSha();
const now = new Date();
const yyyy = now.getUTCFullYear();
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
const dd = String(now.getUTCDate()).padStart(2, '0');
const version = `v${yyyy}.${mm}.${dd}-${shortSha}`;

// 寫入 version.json（輸出到 public/ 供 Vite 複製到 dist/）
const payload = {
  version,
  updatedAt: now.toISOString(),
  commit: shortSha
};
const versionPath = fs.existsSync('public') ? 'public/version.json' : 'version.json';
fs.writeFileSync(versionPath, JSON.stringify(payload, null, 2) + '\n');

// 將 CHANGELOG.md 複製到 public/，讓網頁可在執行時 fetch 並顯示
try {
  if (fs.existsSync('CHANGELOG.md') && fs.existsSync('public')) {
    fs.copyFileSync('CHANGELOG.md', 'public/CHANGELOG.md');
  }
} catch (_) { /* changelog is optional */ }

// 將版本號注入 sw.js，讓瀏覽器每次部署都偵測到 sw.js 內容有變化
const swPath = fs.existsSync('public/sw.js') ? 'public/sw.js' : 'sw.js';
let swContent = fs.readFileSync(swPath, 'utf8');
swContent = swContent.replace(/^const VERSION = '.*?';/m, `const VERSION = '${version}';`);
fs.writeFileSync(swPath, swContent);

// 根治 cache-busting：把 index.html 裡資產的版本 query（?v=...）改寫成當前版本。
// 否則寫死的 ?v=（如 ?v=v2026.03.15-9c49be6）永不變，瀏覽器/Cloudflare 會一直對
// style.css 等資產發舊快取，新樣式進不來（曾導致版面跑掉、標題消失）。
const htmlPath = 'index.html';
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const updated = html.replace(/(\?v=)v?[0-9][^"'\s>]*/g, `$1${version}`);
  if (updated !== html) fs.writeFileSync(htmlPath, updated);
}

console.log(version);
