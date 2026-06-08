// build-xiangqi-puzzles.js — 從棋弈江湖（MIT）抓象棋殘局題庫，瘦身（只留 fen/name）+
// 簡轉繁（OpenCC twp），輸出到 public/xiangqi-puzzles/。可重跑（需網路）。
//
// 來源：https://github.com/dffge552/xiangqi-pwa-offline （MIT，作者 dffge552）
// 古譜本身屬公共領域；JSON 編纂為該專案 MIT 授權，已於「關於與授權」標注。
//
// 用法：node scripts/build-xiangqi-puzzles.js
const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');

const RAW = 'https://raw.githubusercontent.com/dffge552/xiangqi-pwa-offline/main';
const CATS = [
  { key: 'basic', title: '基本殺法', src: 'basic-checkmates.json' },
  { key: 'jianghu', title: '江湖殘局', src: 'jianghu-endgames.json' },
  { key: 'mengru', title: '夢入神機', src: 'meng-ru-shen-ji.json' },
  { key: 'shiqing', title: '適情雅趣', src: 'shi-qing-ya-qu.json' },
];

const toTW = OpenCC.Converter({ from: 'cn', to: 'twp' });
const outDir = path.join(__dirname, '..', 'public', 'xiangqi-puzzles');

function cleanName(name, title) {
  let n = toTW(String(name || '')).trim();
  n = n.replace(/\s*[-–]\s*[^-–]*$/, '').trim();   // 去掉結尾「 - 分類」
  return n || title;
}
/** 補齊省略的 FEN 結尾欄位（有些題只給到 side-to-move，如「… w」）。 */
function normalizeFen(fen) {
  let f = String(fen || '').trim();
  if (/\s[wb]$/.test(f)) f += ' - - 0 1';
  return f;
}
function validFen(fen) { return typeof fen === 'string' && /\s[wb]\s/.test(fen); }

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const index = [];
  for (const cat of CATS) {
    const res = await fetch(`${RAW}/${cat.src}`);
    const raw = await res.json();
    const seen = new Set();
    const puzzles = [];
    for (const p of raw) {
      const fen = normalizeFen(p.fen);
      if (!validFen(fen) || seen.has(fen)) continue;
      seen.add(fen);
      puzzles.push({ fen, name: cleanName(p.name, cat.title) });
    }
    fs.writeFileSync(path.join(outDir, `${cat.key}.json`), JSON.stringify(puzzles));
    index.push({ key: cat.key, title: cat.title, count: puzzles.length });
    console.log(`${cat.title}: ${puzzles.length} 題`);
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log('總計', index.reduce((s, c) => s + c.count, 0), '題 →', outDir);
})();
