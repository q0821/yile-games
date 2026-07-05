// scripts/make-test-photos.mjs — Spike A：合成測試照片產生器
//
// 背景：docs/PRD-photo-scoring.md「拍照數子」spike，第一步先用合成資料驗證管線
// （真實照片使用者稍後才提供）。流程：
//   1) 純數學產生「隨機但像終局」的 19x19 盤面（大塊連通棋串 + 空點集中於眼位/公氣，
//      不追求規則合法性）。
//   2) 開 headless Chromium 載 scripts/spike-board-render.html（純函式模組
//      board-texture.js / stone.js 畫盤面＋棋子，不碰 main.js），用 CSS 3D transform
//      做透視、疊光照不均與雜訊 canvas、部分加 CSS blur 模擬失焦。
//   3) 輸出 photo-XX.png + photo-XX.truth.json + manifest.json 到 spike-photos/（gitignore）。
//
// 確定性：全部亂數源自單一 GLOBAL_SEED（mulberry32），同 seed 重跑會產生同一組
// 盤面內容與變形參數（Chromium 渲染本身的次像素/字型平滑不保證跨機器 byte-for-byte
// 相同 PNG，但邏輯輸出——盤面陣列、每張照片的變形參數——完全一致，可重生成）。

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'spike-photos');
const DEV_PORT = 5199;
const BASE_URL = `http://localhost:${DEV_PORT}`;
const RENDER_PAGE = `${BASE_URL}/scripts/spike-board-render.html`;

const GLOBAL_SEED = 424620; // 固定：改這個數字＝換一整組照片；其餘全由此推導
const BOARD_SIZE = 19;
const PHOTO_COUNT = 10;
const STAGE_W = 1200;
const STAGE_H = 900;

const DESK_COLORS = ['#8a7355', '#5b5449', '#c9c0aa', '#3f3a33', '#a68a63'];

/** 確定性亂數（mulberry32）——與 board-texture.js 內部同款實作，未 export 故各自帶一份。 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------------------------------------------------------------------------
// 1) 終局盤面產生器：兩塊 Voronoi-like 連通陣營 + territory 空塊（眼位/公氣感）+ 少量 dame。
// ---------------------------------------------------------------------------

/** 平滑但確定性的邊界擾動（純數學函式，僅依賴座標與 seed offset，不消耗 rng stream）。 */
function boundaryWobble(r, c, offset) {
  return Math.sin(r * 0.42 + offset) * 1.6 + Math.sin(c * 0.37 + offset * 1.31) * 1.6;
}

function countFilled(grid, size) {
  let n = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c]) n++;
  return n;
}

function hasEmptyNeighbor(grid, r, c, size) {
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of deltas) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 0) return true;
  }
  return false;
}

function filledNeighborColor(grid, r, c, size) {
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of deltas) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc]) return grid[nr][nc];
  }
  return 0;
}

/** 把填滿率調整到 [minRatio, maxRatio] 區間內，維持鄰接連通性（不產生孤立單子/單點）。 */
function adjustFillRatio(grid, rng, size, minRatio, maxRatio) {
  const total = size * size;
  let filled = countFilled(grid, size);
  let guard = 0;
  while (filled / total > maxRatio && guard < 4000) {
    const r = Math.floor(rng() * size), c = Math.floor(rng() * size);
    if (grid[r][c] !== 0 && hasEmptyNeighbor(grid, r, c, size)) { grid[r][c] = 0; filled--; }
    guard++;
  }
  guard = 0;
  while (filled / total < minRatio && guard < 4000) {
    const r = Math.floor(rng() * size), c = Math.floor(rng() * size);
    if (grid[r][c] === 0) {
      const color = filledNeighborColor(grid, r, c, size);
      if (color) { grid[r][c] = color; filled++; }
    }
    guard++;
  }
}

/**
 * 產生一盤「視覺上像終局」的陣列：不追求死活規則合法性，只求
 * 大塊連通棋串（黑白各佔一方陣營，邊界帶自然擾動）+ 空點集中在領地內側（眼位/公氣感）。
 */
function generateEndgameBoard(rng, size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(0));

  const half = Math.floor(size / 2);
  const cornerPairs = [
    [[0, 0], [size - 1, size - 1]],
    [[0, size - 1], [size - 1, 0]],
    [[0, half], [size - 1, half]],
    [[half, 0], [half, size - 1]],
  ];
  const pair = cornerPairs[Math.floor(rng() * cornerPairs.length)];
  const jitter = () => Math.round((rng() - 0.5) * size * 0.3);
  const blackSeed = [clamp(pair[0][0] + jitter(), 0, size - 1), clamp(pair[0][1] + jitter(), 0, size - 1)];
  const whiteSeed = [clamp(pair[1][0] + jitter(), 0, size - 1), clamp(pair[1][1] + jitter(), 0, size - 1)];
  const wobbleA = rng() * 1000;
  const wobbleB = rng() * 1000;

  // 兩陣營：以到各自種子點距離（加邊界擾動）分區，形成大塊連通棋串。
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const db = Math.hypot(r - blackSeed[0], c - blackSeed[1]) - boundaryWobble(r, c, wobbleA);
      const dw = Math.hypot(r - whiteSeed[0], c - whiteSeed[1]) - boundaryWobble(r, c, wobbleB);
      grid[r][c] = db <= dw ? 1 : 2;
    }
  }

  // territory：各陣營內挖 2–4 塊空洞（眼位/大空的視覺感），不吃到對方棋串。
  for (const region of [1, 2]) {
    const blobCount = 2 + Math.floor(rng() * 3);
    for (let b = 0; b < blobCount; b++) {
      const cr = Math.floor(rng() * size), cc = Math.floor(rng() * size);
      if (grid[cr][cc] !== region) continue;
      const radius = 1 + rng() * 2.4;
      const rr0 = Math.max(0, cr - 4), rr1 = Math.min(size - 1, cr + 4);
      const cc0 = Math.max(0, cc - 4), cc1 = Math.min(size - 1, cc + 4);
      for (let r = rr0; r <= rr1; r++) {
        for (let c = cc0; c <= cc1; c++) {
          if (grid[r][c] !== region) continue;
          const d = Math.hypot(r - cr, c - cc);
          if (d <= radius && rng() > 0.15) grid[r][c] = 0;
        }
      }
    }
  }

  // dame：邊界附近少量中性空點。
  const dameCount = 1 + Math.floor(rng() * 5);
  for (let i = 0; i < dameCount; i++) {
    const r = Math.floor(rng() * size), c = Math.floor(rng() * size);
    grid[r][c] = 0;
  }

  adjustFillRatio(grid, rng, size, 0.60, 0.75);
  return grid;
}

// ---------------------------------------------------------------------------
// 2) 每張照片的變形參數（角度分佈依 brief：3 近正拍 <5°／4 中等 10–20°／3 較斜 25–30°）
// ---------------------------------------------------------------------------

function angleBucketFor(index) {
  // index: 0-based, 0..9
  if (index < 3) return { name: 'near-straight', min: 1, max: 5 };
  if (index < 7) return { name: 'medium', min: 10, max: 20 };
  return { name: 'steep', min: 25, max: 30 };
}

function buildPhotoParams(index, rng) {
  const bucket = angleBucketFor(index);
  const tiltDeg = bucket.min + rng() * (bucket.max - bucket.min);
  const theta = rng() * Math.PI * 2;
  const rotX = +(Math.sin(theta) * tiltDeg).toFixed(2);
  const rotY = +(Math.cos(theta) * tiltDeg).toFixed(2);

  const boardFrac = 0.70 + rng() * 0.15; // 70–85% of the shorter frame edge
  const boardDisplayPx = Math.round(Math.min(STAGE_W, STAGE_H) * boardFrac);
  const maxOffsetX = STAGE_W - boardDisplayPx;
  const maxOffsetY = STAGE_H - boardDisplayPx;
  const offsetX = Math.round(maxOffsetX * (0.15 + rng() * 0.7));
  const offsetY = Math.round(maxOffsetY * (0.15 + rng() * 0.7));

  const lightAngleDeg = Math.round(rng() * 360);
  const lightAlpha = +(0.06 + rng() * 0.12).toFixed(3);
  const lightDark = rng() > 0.5;

  const noiseSeed = Math.floor(rng() * 1e9);
  const noiseAlpha = +(0.05 + rng() * 0.05).toFixed(3);

  // 1–2 張輕微失焦：固定挑第 5、9 張（index 4, 8）；模糊量仍由 rng 決定，維持確定性。
  const blurPx = (index === 4 || index === 8) ? +(0.5 + rng() * 0.5).toFixed(2) : 0;

  const boardSeed = Math.floor(rng() * 1e9);
  const deskColor = DESK_COLORS[Math.floor(rng() * DESK_COLORS.length)];
  const perspective = Math.round(1100 + rng() * 500);

  return {
    stageW: STAGE_W, stageH: STAGE_H,
    boardDisplayPx, offsetX, offsetY,
    rotX, rotY, perspective,
    deskColor, lightAngleDeg, lightAlpha, lightDark,
    noiseSeed, noiseAlpha, blurPx, boardSeed,
    _meta: { angleBucket: bucket.name, tiltDeg: +tiltDeg.toFixed(2), boardFrac: +boardFrac.toFixed(3) },
  };
}

// ---------------------------------------------------------------------------
// 3) dev server 啟停
// ---------------------------------------------------------------------------

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url).then((res) => {
        if (res.ok || res.status < 500) resolve();
        else retry();
      }).catch(retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) { reject(new Error(`dev server 逾時未啟動：${url}`)); return; }
      setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[make-test-photos] 啟動 vite dev server（port ${DEV_PORT}）…`);
  const vite = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let viteErr = '';
  vite.stderr.on('data', (d) => { viteErr += d.toString(); });

  const cleanup = () => { try { vite.kill(); } catch { /* noop */ } };
  process.on('exit', cleanup);

  try {
    await waitForServer(BASE_URL, 20000);
  } catch (e) {
    cleanup();
    console.error(viteErr);
    throw e;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: STAGE_W, height: STAGE_H } });

  try {
    await page.goto(RENDER_PAGE, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });

    const topRng = mulberry32(GLOBAL_SEED);
    const manifest = { seed: GLOBAL_SEED, size: BOARD_SIZE, stageW: STAGE_W, stageH: STAGE_H, photos: [] };

    for (let i = 0; i < PHOTO_COUNT; i++) {
      const photoSeed = Math.floor(topRng() * 1e9);
      const rng = mulberry32(photoSeed);

      const grid = generateEndgameBoard(rng, BOARD_SIZE);
      const params = buildPhotoParams(i, rng);

      await page.evaluate((p) => window.__renderPhoto(p), { grid, size: BOARD_SIZE, ...params });
      // 等一次 layout+paint（3D transform/漸層/canvas 疊層都需要真的畫完才截圖）
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      const idx = String(i + 1).padStart(2, '0');
      const pngPath = path.join(OUT_DIR, `photo-${idx}.png`);
      const truthPath = path.join(OUT_DIR, `photo-${idx}.truth.json`);

      await page.locator('#stage').screenshot({ path: pngPath });
      writeFileSync(truthPath, JSON.stringify({ size: BOARD_SIZE, grid }, null, 2));

      const filled = countFilled(grid, BOARD_SIZE);
      manifest.photos.push({
        file: `photo-${idx}.png`,
        truth: `photo-${idx}.truth.json`,
        seed: photoSeed,
        fillRatio: +(filled / (BOARD_SIZE * BOARD_SIZE)).toFixed(3),
        angleBucket: params._meta.angleBucket,
        tiltDeg: params._meta.tiltDeg,
        rotX: params.rotX,
        rotY: params.rotY,
        boardFrac: params._meta.boardFrac,
        boardDisplayPx: params.boardDisplayPx,
        offsetX: params.offsetX,
        offsetY: params.offsetY,
        deskColor: params.deskColor,
        lightAngleDeg: params.lightAngleDeg,
        lightAlpha: params.lightAlpha,
        lightDark: params.lightDark,
        noiseAlpha: params.noiseAlpha,
        blurPx: params.blurPx,
      });

      console.log(`[make-test-photos] ${pngPath}（${params._meta.angleBucket}, tilt=${params._meta.tiltDeg}°, fill=${manifest.photos[i].fillRatio}）`);
    }

    writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`[make-test-photos] 完成，共 ${PHOTO_COUNT} 張，輸出於 ${OUT_DIR}`);
  } finally {
    await browser.close();
    cleanup();
  }
}

main().catch((err) => {
  console.error('[make-test-photos] 失敗：', err);
  process.exitCode = 1;
});
