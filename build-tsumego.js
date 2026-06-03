#!/usr/bin/env node
/**
 * 把 sanderland/tsumego 題庫（外部目錄）轉成 App 用的精簡 JSON，
 * 按級別拆檔輸出到 public/tsumego/。
 *
 * 範圍：只取死活三級 1a / 1b / 1c（不含 1d 橋本、不含 2x 手筋）。
 * 難度由「所屬資料夾」決定（不信任 JSON 的 C 欄）。
 *
 * 每題精簡為 { id, AB, AW, SZ, C, SOL }：
 *   - SOL 只留 [color, coord]（去掉題庫的註解/空欄），與 tsumego.js 的 parseProblem 相容。
 *   - id = 來源相對路徑（去副檔名），給進度記錄當穩定 key。
 *
 * 用法：node build-tsumego.js [題庫 problems 目錄]
 *   預設讀 ../tsumego/problems（相對於本 repo）。可用 TSUMEGO_SRC 環境變數覆寫。
 */
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2]
  || process.env.TSUMEGO_SRC
  || path.resolve(__dirname, '../tsumego/problems');
const SRC_ROOT = path.resolve(SRC, '..'); // 題庫 repo 根（為了複製 LICENSE）
const OUT_DIR = path.resolve(__dirname, 'public/tsumego');

// 資料夾 → 級別。順序即由易到難。
const LEVELS = [
  { id: 'beginner', name: '入門', folder: '1a. Tsumego Beginner' },
  { id: 'intermediate', name: '中級', folder: '1b. Tsumego Intermediate' },
  { id: 'advanced', name: '進階', folder: '1c. Tsumego Advanced' }
];

/** 數字感知的自然排序（001 < 002 < ... < 010；Prob0174 < Prob0898）。 */
function natCmp(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** 遞迴列出某資料夾下所有 .json，並依「子集合資料夾 → 檔名」自然排序。 */
function listProblemFiles(dir) {
  const out = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
    }
  }
  walk(dir);
  // 用相對路徑做自然排序，保留題庫的集合與題號順序
  return out.sort((a, b) => natCmp(path.relative(dir, a), path.relative(dir, b)));
}

const LETTERS = 'abcdefghijklmnopqrs';

/** 座標是否為盤內合法 SGF 字母（擋掉空字串、pass、越界）。 */
function isValidCoord(coord, size) {
  if (typeof coord !== 'string' || coord.length < 2) return false;
  const col = LETTERS.indexOf(coord[0]);
  const row = LETTERS.indexOf(coord[1]);
  return col >= 0 && col < size && row >= 0 && row < size;
}

/** 精簡單題；無效則回傳 null（壞檔不靜默放行，回報計數）。 */
function compact(file, srcFolderDir) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const size = parseInt(raw.SZ, 10) || 19;
  // 只留座標合法的正解；題庫有少數 SOL coord 為空字串（無答案），整題作廢。
  const sol = (raw.SOL || [])
    .filter(row => isValidCoord(row[1], size))
    .map(row => [row[0], row[1]]);
  if (!sol.length) return null;
  const id = path.relative(srcFolderDir, file).replace(/\.json$/, '');
  return {
    id,
    AB: raw.AB || [],
    AW: raw.AW || [],
    SZ: String(raw.SZ || '19'),
    C: raw.C || '',
    SOL: sol
  };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`[build-tsumego] 找不到題庫目錄：${SRC}`);
    console.error('  用法：node build-tsumego.js [題庫 problems 目錄]');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = { source: 'sanderland/tsumego', license: 'MIT', levels: [] };

  for (const level of LEVELS) {
    const folderDir = path.join(SRC, level.folder);
    if (!fs.existsSync(folderDir)) {
      console.error(`[build-tsumego] 缺資料夾：${folderDir}`);
      process.exit(1);
    }
    const files = listProblemFiles(folderDir);
    const problems = [];
    let skipped = 0;
    for (const f of files) {
      const p = compact(f, folderDir);
      if (p) problems.push(p);
      else skipped++;
    }
    const outFile = path.join(OUT_DIR, `${level.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(problems));
    index.levels.push({ id: level.id, name: level.name, file: `${level.id}.json`, count: problems.length });
    console.log(`[build-tsumego] ${level.name.padEnd(2)} (${level.folder}) → ${problems.length} 題` + (skipped ? `（略過 ${skipped} 筆無 SOL）` : ''));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  // MIT 署名義務：複製題庫 LICENSE
  const srcLicense = path.join(SRC_ROOT, 'LICENSE');
  if (fs.existsSync(srcLicense)) {
    fs.copyFileSync(srcLicense, path.join(OUT_DIR, 'LICENSE'));
    console.log('[build-tsumego] 已複製題庫 LICENSE（MIT 署名）');
  } else {
    console.warn(`[build-tsumego] ⚠ 找不到題庫 LICENSE：${srcLicense}（MIT 署名義務，請手動補上）`);
  }

  const total = index.levels.reduce((s, l) => s + l.count, 0);
  console.log(`[build-tsumego] 完成，共 ${total} 題 → ${OUT_DIR}`);
}

main();
