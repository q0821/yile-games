// connect6-ui.js — 連六棋全盤渲染（19 路；重用 ui.js 的 drawStone，與圍棋一致視覺）。
//
// 與 gomoku-ui 幾乎相同，兩處差異：(1) 19 路星位 STAR_19；(2) 本回合已放、尚可收回的
// pending 子畫一圈細環提示。offscreen 背景快取以 (寬,高,size) 為 key，與五子棋各自獨立。
import { EMPTY, WHITE, inBounds } from './rules.js';
import { drawStone } from './ui.js';
import { paintBoardBase, paintWoodGrain, paintVignette } from './board-texture.js';
import { prefersReducedMotion } from './motion.js';
import { setupHiDPICanvas, makeHiDPIOffscreen } from './canvas-dpr.js';

// 19 路盤星位（圍棋標準九星）。
const STAR_19 = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15],
];

// ——— 棋盤背景 offscreen 快取（底色＋木紋＋格線＋星位＋vignette）———
let _bgCache = null;
let _bgKey = '';

function buildBackground(deps, size) {
  const w = deps._cssW || deps.canvas.width, h = deps._cssW || deps.canvas.height;
  const key = `${w}_${h}_${size}_${deps.dpr || 1}`;
  if (_bgCache && _bgKey === key) return _bgCache;
  const { off, ctx } = makeHiDPIOffscreen(w, h);
  const cs = deps.cellSize, pad = deps.padding;
  const sx = (c) => pad + c * cs;
  const sy = (r) => pad + r * cs;

  paintBoardBase(ctx, w, h);
  paintWoodGrain(ctx, w, h, { seed: 9, grainColor: 'rgba(90,64,24,0.12)', speckColor: 'rgba(255,244,214,0.10)' });

  ctx.strokeStyle = '#5a4420';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i++) {
    ctx.beginPath(); ctx.moveTo(sx(0), sy(i)); ctx.lineTo(sx(size - 1), sy(i)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(i), sy(0)); ctx.lineTo(sx(i), sy(size - 1)); ctx.stroke();
  }
  ctx.fillStyle = '#5a4420';
  for (const [r, c] of STAR_19) {
    ctx.beginPath(); ctx.arc(sx(c), sy(r), cs * 0.1, 0, Math.PI * 2); ctx.fill();
  }

  paintVignette(ctx, w, h);

  _bgCache = off;
  _bgKey = key;
  return off;
}

// ——— 落子 scale-in 動畫（事件觸發才跑；prefers-reduced-motion 時跳過） ———
const PLACE_ANIM_MS = 150;
const _easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
let _placeAnimKey = null;
let _placeAnimStart = 0;
let _placeAnimRunning = false;

/** 依視窗大小調整 canvas，寫入 deps.padding / deps.cellSize，回傳 cellSize。 */
export function resizeConnect6Canvas(deps, view) {
  const span = view.size - 1;
  const isMobile = window.innerWidth <= 900;
  let maxSize;
  if (isMobile) {
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 200; // 留給 header / 狀態 / 控制鈕
    maxSize = Math.max(300, Math.min(maxW, maxH));
  } else {
    maxSize = Math.max(420, Math.min(window.innerWidth - 360, window.innerHeight - 180, 640));
  }
  const padding = Math.max(20, Math.round(maxSize * 0.04));
  const cellSize = Math.max(12, Math.floor((maxSize - padding * 2) / span));
  const wh = cellSize * span + padding * 2;
  deps._cssW = wh;
  deps.dpr = setupHiDPICanvas(deps.canvas, wh, wh);
  deps.padding = padding;
  deps.cellSize = cellSize;
  return cellSize;
}

export function drawConnect6(deps, view) {
  const ctx = deps.ctx;
  const size = view.size;
  const cs = deps.cellSize;
  const pad = deps.padding;
  const sx = (c) => pad + c * cs;
  const sy = (r) => pad + r * cs;

  const dpr = deps.dpr || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bgW = deps._cssW || deps.canvas.width;
  ctx.drawImage(buildBackground(deps, size), 0, 0, bgW, bgW);

  // 落子 scale-in 偵測（事件觸發：lastMove 座標變動才起動畫）
  const reduceMotion = prefersReducedMotion();
  const lmKey = view.lastMove ? `${view.lastMove[0]},${view.lastMove[1]}` : null;
  if (lmKey !== _placeAnimKey) {
    _placeAnimKey = lmKey;
    _placeAnimRunning = !!(lmKey && !reduceMotion);
    _placeAnimStart = performance.now();
  }
  const now = performance.now();
  let animActive = false;

  // 棋子（重用 ui.js 的 drawStone）
  const sd = { ctx, canvas: deps.canvas, padding: pad, cellSize: cs };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = view.board[r][c];
      if (v === EMPTY) continue;
      let scale = 1;
      if (_placeAnimRunning && view.lastMove && view.lastMove[0] === r && view.lastMove[1] === c) {
        const elapsed = now - _placeAnimStart;
        if (elapsed < PLACE_ANIM_MS) {
          scale = Math.max(0.05, _easeOutBack(Math.min(1, elapsed / PLACE_ANIM_MS)));
          animActive = true;
        } else {
          _placeAnimRunning = false;
        }
      }
      drawStone(sd, r, c, v, false, scale);
    }
  }
  if (animActive && deps.scheduleRedraw) requestAnimationFrame(() => deps.scheduleRedraw());

  // 本回合可收回的 pending 子：畫一圈金色細環提示「點一下可收回」
  if (view.pending && view.pending.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,180,60,0.95)';
    ctx.lineWidth = Math.max(1.5, cs * 0.06);
    for (const p of view.pending) {
      ctx.beginPath();
      ctx.arc(sx(p.c), sy(p.r), cs * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // hover 預覽（輪到玩家、空點）
  if (view.hover && inBounds(size, view.hover.row, view.hover.col) &&
      view.board[view.hover.row][view.hover.col] === EMPTY) {
    ctx.globalAlpha = 0.4;
    drawStone(sd, view.hover.row, view.hover.col, view.toPlayColor, false);
    ctx.globalAlpha = 1;
  }

  // 最後一手標記（對比色實心點 + 細圈，與圍棋語彙一致）
  if (view.lastMove) {
    const [r, c] = view.lastMove;
    const isWhite = view.board[r][c] === WHITE;
    const mx = sx(c), my = sy(r);
    ctx.save();
    ctx.strokeStyle = isWhite ? 'rgba(178,58,46,0.6)' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, cs * 0.035);
    ctx.beginPath(); ctx.arc(mx, my, cs * 0.22, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = isWhite ? '#b23a2e' : '#fff';
    ctx.beginPath(); ctx.arc(mx, my, cs * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 勝利連線高亮
  if (view.winningLine && view.winningLine.length >= 2) {
    const line = view.winningLine;
    const [r0, c0] = line[0];
    const [r1, c1] = line[line.length - 1];
    ctx.strokeStyle = 'rgba(220,40,40,0.92)';
    ctx.lineWidth = Math.max(3, cs * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx(c0), sy(r0));
    ctx.lineTo(sx(c1), sy(r1));
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

export const Connect6UI = { resizeConnect6Canvas, drawConnect6 };
