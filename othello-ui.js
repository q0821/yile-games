// othello-ui.js — 黑白棋盤 canvas 渲染（純畫圖，無狀態）。
//
// 棋子落在「格子中心」（非交叉點）。8×8 格、暖色盤、黑白立體圓子。
// view = { board, size, legalMoves, lastMove, hover }；座標 board[row][col]。
import { EMPTY, BLACK } from './rules.js';
import { drawStonePixel } from './stone.js';
import { paintBoardBase, paintWoodGrain, paintVignette } from './board-texture.js';
import { makeHiDPIOffscreen } from './canvas-dpr.js';

const BG = '#e6c98a';
const LINE = 'rgba(91,68,35,0.55)';
const HINT = 'rgba(43,90,40,0.45)';
const LAST = '#c0392b';

// ——— 棋盤背景 offscreen 快取（底色＋木紋＋格線＋定位點＋vignette，只在尺寸變動時重算） ———
let _bg = null;
let _bgKey = '';

function buildBackground(deps) {
  const key = `${deps._w}_${deps.size}_${deps.dpr || 1}`;
  if (_bg && _bgKey === key) return _bg;
  const { off, ctx } = makeHiDPIOffscreen(deps._w, deps._w);
  const size = deps.size, cell = deps.cellSize, pad = deps.padding;

  paintBoardBase(ctx, deps._w, deps._w, { top: '#f0d79c', mid: '#e6c98a', bottom: '#d6b370' });
  paintWoodGrain(ctx, deps._w, deps._w, { seed: 13, grainColor: 'rgba(80,58,26,0.10)', speckColor: 'rgba(255,244,214,0.10)' });

  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  for (let i = 0; i <= size; i++) {
    const p = pad + i * cell;
    ctx.beginPath(); ctx.moveTo(pad, p); ctx.lineTo(pad + size * cell, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, pad); ctx.lineTo(p, pad + size * cell); ctx.stroke();
  }
  if (size === 8) {
    ctx.fillStyle = LINE;
    for (const [r, c] of [[2, 2], [2, 6], [6, 2], [6, 6]]) {
      ctx.beginPath(); ctx.arc(pad + r * cell, pad + c * cell, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  paintVignette(ctx, deps._w, deps._w);

  _bg = off; _bgKey = key;
  return off;
}

/** 依容器寬度算 cellSize、設定 canvas 尺寸（含 DPR）。 */
export function resizeOthelloCanvas(deps, maxWidthPx) {
  const { canvas, size } = deps;
  const pad = 10;
  const usableW = Math.min(maxWidthPx || 360, 480) - pad * 2;
  const cell = Math.max(30, Math.floor(usableW / size));
  deps.cellSize = cell;
  deps.padding = pad;
  const w = pad * 2 + size * cell;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(w * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = w + 'px';
  deps.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  deps.dpr = dpr;
  deps._w = w;
  return { w, cell };
}

function cx(deps, col) { return deps.padding + col * deps.cellSize + deps.cellSize / 2; }
function cy(deps, row) { return deps.padding + row * deps.cellSize + deps.cellSize / 2; }

/** 立體圓子（共用 stone.js 的視覺，三棋種一致）。black=true 黑子。 */
function drawStone(deps, x, y, r, black) {
  drawStonePixel(deps.ctx, x, y, r, black);
}

export function drawOthello(deps, view) {
  const { ctx } = deps;
  const size = deps.size, cell = deps.cellSize, pad = deps.padding;
  ctx.clearRect(0, 0, deps._w, deps._w);
  ctx.drawImage(buildBackground(deps), 0, 0, deps._w, deps._w);

  const radius = cell * 0.42;
  const anim = view.anim;
  // 合法手提示（輪到的一方；動畫中不顯示）
  if (view.legalMoves && !anim) {
    ctx.fillStyle = HINT;
    for (const [r, c] of view.legalMoves) {
      ctx.beginPath(); ctx.arc(cx(deps, c), cy(deps, r), cell * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 棋子（動畫中跳過正在翻/落的格，改由動畫畫）
  const board = view.board;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) continue;
      if (anim && (anim.set.has(r + ',' + c) || (anim.place && anim.place[0] === r && anim.place[1] === c))) continue;
      drawStone(deps, cx(deps, c), cy(deps, r), radius, board[r][c] === BLACK);
    }
  }
  // 翻子動畫：水平縮放 1→0→1，中途換色；落子 pop-in
  if (anim) {
    const t = anim.t;
    const scaleX = Math.abs(Math.cos(Math.PI * t));
    const showNew = t >= 0.5;
    for (const key of anim.set) {
      const [r, c] = key.split(',').map(Number);
      drawStoneScaled(deps, cx(deps, c), cy(deps, r), radius, showNew ? anim.black : !anim.black, scaleX);
    }
    if (anim.place) {
      const [r, c] = anim.place;
      const s = 0.4 + 0.6 * Math.min(1, t * 1.4);
      drawStoneScaled(deps, cx(deps, c), cy(deps, r), radius * s, anim.black, 1);
    }
  }
  // 最後一手標記
  if (view.lastMove) {
    const [r, c] = view.lastMove;
    ctx.strokeStyle = LAST; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx(deps, c), cy(deps, r), radius + 3, 0, Math.PI * 2); ctx.stroke();
  }
}

/** 以水平縮放畫棋子（翻轉效果）。 */
function drawStoneScaled(deps, x, y, r, black, scaleX) {
  const ctx = deps.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.02, scaleX), 1);
  ctx.translate(-x, -y);
  drawStone(deps, x, y, r, black);
  ctx.restore();
}
