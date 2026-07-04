/**
 * 死活練習的「局部裁切」棋盤渲染。
 *
 * 與對弈的 drawBoard 不同：只畫 viewport（含棋子的角落／邊區），並區分
 *   - 真實盤邊（row/col == 0 或 size-1）：格線停在盤邊，並加粗強調。
 *   - 內部裁切邊：格線延伸到 canvas 邊緣（bleed），暗示棋盤往外延續。
 *
 * 棋子沿用 ui.js 的 drawStone（透過 deps.originRow/originCol 偏移），保持視覺一致。
 */
import { EMPTY, WHITE } from './rules.js';
import { drawStone } from './ui.js';
import { setupHiDPICanvas } from './canvas-dpr.js';
import { paintBoardBase } from './board-texture.js';

const STAR_19 = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15]
];

/** 依 viewport 調整 canvas 尺寸，回傳 cellSize。寫入 deps.padding / deps.cellSize。 */
export function resizeTsumegoCanvas(deps, view) {
  const vp = view.viewport;
  const cols = Math.max(1, vp.maxCol - vp.minCol); // 水平方向的間隔數
  const rows = Math.max(1, vp.maxRow - vp.minRow);
  const span = Math.max(cols, rows);

  const isMobile = window.innerWidth <= 900;
  let maxSize;
  if (isMobile) {
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 240; // 留給 header / meta / 控制鈕
    maxSize = Math.max(260, Math.min(maxW, maxH));
  } else {
    maxSize = Math.max(360, Math.min(window.innerWidth - 80, window.innerHeight - 220, 620));
  }

  const padding = Math.max(24, Math.round(maxSize * 0.06));
  const cellSize = Math.max(12, Math.floor((maxSize - padding * 2) / span));
  const w = cellSize * cols + padding * 2;
  const h = cellSize * rows + padding * 2;

  deps._cssW = w;
  deps._cssH = h;
  deps.dpr = setupHiDPICanvas(deps.canvas, w, h);
  deps.padding = padding;
  deps.cellSize = cellSize;
  return cellSize;
}

export function drawTsumego(deps, view) {
  const ctx = deps.ctx;
  const vp = view.viewport;
  const size = view.size;
  const cs = deps.cellSize;
  const pad = deps.padding;
  const dpr = deps.dpr || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = deps._cssW || deps.canvas.width;
  const h = deps._cssH || deps.canvas.height;

  const sx = (col) => pad + (col - vp.minCol) * cs;
  const sy = (row) => pad + (row - vp.minRow) * cs;

  // ——— 木紋底 ———
  paintBoardBase(ctx, w, h);

  // ——— 格線（真實盤邊 vs 內部裁切邊）———
  const leftEdge = vp.minCol === 0;
  const rightEdge = vp.maxCol === size - 1;
  const topEdge = vp.minRow === 0;
  const botEdge = vp.maxRow === size - 1;

  const xLeft = leftEdge ? sx(vp.minCol) : 0;
  const xRight = rightEdge ? sx(vp.maxCol) : w;
  const yTop = topEdge ? sy(vp.minRow) : 0;
  const yBot = botEdge ? sy(vp.maxRow) : h;

  ctx.strokeStyle = '#5a4420';
  ctx.lineWidth = 1;
  for (let r = vp.minRow; r <= vp.maxRow; r++) {
    const y = sy(r);
    ctx.beginPath();
    ctx.moveTo(xLeft, y);
    ctx.lineTo(xRight, y);
    ctx.stroke();
  }
  for (let c = vp.minCol; c <= vp.maxCol; c++) {
    const x = sx(c);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
  }

  // 真實盤邊加粗
  ctx.lineWidth = 2.5;
  if (leftEdge) { ctx.beginPath(); ctx.moveTo(sx(0), yTop); ctx.lineTo(sx(0), yBot); ctx.stroke(); }
  if (rightEdge) { ctx.beginPath(); ctx.moveTo(sx(size - 1), yTop); ctx.lineTo(sx(size - 1), yBot); ctx.stroke(); }
  if (topEdge) { ctx.beginPath(); ctx.moveTo(xLeft, sy(0)); ctx.lineTo(xRight, sy(0)); ctx.stroke(); }
  if (botEdge) { ctx.beginPath(); ctx.moveTo(xLeft, sy(size - 1)); ctx.lineTo(xRight, sy(size - 1)); ctx.stroke(); }
  ctx.lineWidth = 1;

  // ——— 星位（落在 viewport 內者）———
  if (size === 19) {
    ctx.fillStyle = '#5a4420';
    for (const [r, c] of STAR_19) {
      if (r >= vp.minRow && r <= vp.maxRow && c >= vp.minCol && c <= vp.maxCol) {
        ctx.beginPath();
        ctx.arc(sx(c), sy(r), cs * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ——— KataGo 領地覆蓋層（後續手 play-out，重用 2c-2 配色）：畫在棋子下方 ———
  // ownership index = row*size+col（+1 黑、-1 白），與 ui.js / katago-service 一致。
  if (view.ownership) {
    const own = view.ownership;
    const sq = cs * 0.52;
    for (let r = vp.minRow; r <= vp.maxRow; r++) {
      for (let c = vp.minCol; c <= vp.maxCol; c++) {
        const o = own[r * size + c];
        if (o == null) continue;
        const a = Math.min(0.5, Math.abs(o) * 0.5);
        if (a < 0.06) continue;
        ctx.fillStyle = o > 0 ? `rgba(20,16,12,${a})` : `rgba(250,248,242,${a})`;
        ctx.fillRect(sx(c) - sq / 2, sy(r) - sq / 2, sq, sq);
      }
    }
  }

  // ——— 棋子（重用 drawStone，帶 origin 偏移）———
  const stoneDeps = { ctx, canvas: deps.canvas, padding: pad, cellSize: cs, originRow: vp.minRow, originCol: vp.minCol };
  for (let r = vp.minRow; r <= vp.maxRow; r++) {
    for (let c = vp.minCol; c <= vp.maxCol; c++) {
      const v = view.board[r][c];
      if (v !== EMPTY) drawStone(stoneDeps, r, c, v, false);
    }
  }

  // ——— hover 預覽（作答中、空點）———
  if (view.hover &&
      view.hover.row >= vp.minRow && view.hover.row <= vp.maxRow &&
      view.hover.col >= vp.minCol && view.hover.col <= vp.maxCol &&
      view.board[view.hover.row][view.hover.col] === EMPTY) {
    ctx.globalAlpha = 0.4;
    drawStone(stoneDeps, view.hover.row, view.hover.col, view.toPlayColor, false);
    ctx.globalAlpha = 1;
  }

  // ——— 標記（正解／錯誤／看答案）———
  for (const m of view.markers || []) {
    const x = sx(m.col);
    const y = sy(m.row);
    if (m.type === 'correct') {
      ctx.strokeStyle = '#27c93f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, cs * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.type === 'wrong') {
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 3;
      const d = cs * 0.24;
      ctx.beginPath();
      ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
      ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d);
      ctx.stroke();
    } else if (m.type === 'answer') {
      ctx.strokeStyle = '#3aa0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, cs * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.type === 'aimove') {
      // AI 最後一手：在棋子中央點一個對比色小圓（黑子上白點、白子上黑點）
      const isWhiteStone = view.board[m.row] && view.board[m.row][m.col] === WHITE;
      ctx.fillStyle = isWhiteStone ? '#000' : '#fff';
      ctx.beginPath();
      ctx.arc(x, y, cs * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineWidth = 1;
}

export const TsumegoUI = { resizeTsumegoCanvas, drawTsumego };
