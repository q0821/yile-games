#!/usr/bin/env node
/**
 * strip-ios-assets.mjs — iOS App Store build 的資產剝除＋合規驗證。
 *
 * `vite build --mode ios` 只會把 GPL 模組（Fairy-Stockfish / ffish）從 JS bundle DCE 掉，
 * 但 public/ 內的靜態資產（引擎 WASM、題庫、GPL 授權全文）仍被原樣複製進 dist。
 * 本腳本於 build 後移除這些資產，並「驗證」bundle 內確實無 GPL 引擎殘留——
 * 若驗證失敗（DCE 沒生效、GPL 碼漏進包）即以非零退出，讓 build 失敗，不會出貨含 GPL 的包。
 *
 * 拔除對象與原因：
 *   engine/            Fairy-Stockfish + ffish 的 WASM/JS（GPL-3.0）→ 象棋/將棋/西洋棋 AI
 *   xiangqi-puzzles/   象棋殘局題庫（隨 GPL 棋種一併拔）
 *   tsumego/           死活題庫（iOS 版不收錄死活練習）
 *   licenses/gpl-3.0.txt        GPL 全文（已無 GPL 內容隨附，不需保留）
 *   licenses/tsumego-LICENSE.txt 死活題庫授權（題庫已移除）
 */
import { existsSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('✖ 找不到 dist/，請先執行 vite build --mode ios');
  process.exit(1);
}

// ── 1. 移除 web-only 資產 ─────────────────────────────────────────
const TARGETS = [
  'engine',
  'xiangqi-puzzles',
  'tsumego',
  'licenses/gpl-3.0.txt',
  'licenses/tsumego-LICENSE.txt',
  'img/cards/tsumego.webp',
  'img/cards/xiangqi.webp',
  'img/cards/xqpuzzle.webp',
  'img/cards/shogi.webp',
  'img/cards/chess.webp',
];

let removed = 0;
for (const rel of TARGETS) {
  const abs = join(DIST, rel);
  if (existsSync(abs)) {
    rmSync(abs, { recursive: true, force: true });
    console.log(`  ✂  移除 dist/${rel}`);
    removed++;
  }
}
console.log(`已移除 ${removed} 項 web-only 資產。`);

// ── 2. 合規驗證：bundle 內不得殘留 GPL 引擎 ──────────────────────────
// 掃描所有打包後的 JS（含 assets/ 與根目錄），比對 GPL 引擎特徵字串。
// 注意：只掃「程式碼」——index.html / CHANGELOG.md 內的授權署名文字非 GPL 程式，不列入。
const FORBIDDEN = /ffish|stockfish/i;
const offenders = [];

function scanJs(dir) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      scanJs(abs);
    } else if (name.endsWith('.js') || name.endsWith('.mjs')) {
      const text = readFileSync(abs, 'utf8');
      if (FORBIDDEN.test(text)) offenders.push(abs.replace(DIST + '/', 'dist/'));
    }
  }
}
scanJs(DIST);

// 引擎 WASM 也不得殘留（雙保險：tfjs 的 wasm backend 合法保留，僅擋象棋引擎兩支）。
for (const wasm of ['engine/xiangqi/stockfish.wasm', 'engine/xiangqi/ffish.wasm']) {
  if (existsSync(join(DIST, wasm))) offenders.push(`dist/${wasm}`);
}

if (offenders.length) {
  console.error('\n✖ 合規驗證失敗：iOS bundle 仍含 GPL 引擎特徵，DCE 未生效：');
  for (const f of offenders) console.error(`    ${f}`);
  console.error('  請確認 main.js 的動態 import 以 `if (!__IOS_STORE__)` 直接守衛（勿經中間 const）。');
  process.exit(1);
}

console.log('✓ 合規驗證通過：bundle 無 ffish / Stockfish 殘留，iOS 版不含 GPL 引擎。');
