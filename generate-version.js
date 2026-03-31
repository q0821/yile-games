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

// 將版本號注入 sw.js，讓瀏覽器每次部署都偵測到 sw.js 內容有變化
const swPath = fs.existsSync('public/sw.js') ? 'public/sw.js' : 'sw.js';
let swContent = fs.readFileSync(swPath, 'utf8');
swContent = swContent.replace(/^const VERSION = '.*?';/m, `const VERSION = '${version}';`);
fs.writeFileSync(swPath, swContent);

console.log(version);
