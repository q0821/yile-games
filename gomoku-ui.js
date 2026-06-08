// gomoku-ui.js — 五子棋全盤渲染（重用 ui.js 的 drawStone，保持與圍棋一致的視覺）。
//
// 五子棋下在交叉點（同圍棋），故格線／棋子畫法沿用圍棋風格；額外畫「勝利連線高亮」。
import { EMPTY, WHITE, inBounds } from './rules.js';
import { drawStone } from './ui.js';

// 15 路盤的星位（天元 + 四星）。
const STAR_15 = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];

/** 依視窗大小調整 canvas，寫入 deps.padding / deps.cellSize，回傳 cellSize。 */
export function resizeGomokuCanvas(deps, view) {
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
  const cellSize = Math.max(14, Math.floor((maxSize - padding * 2) / span));
  const wh = cellSize * span + padding * 2;
  deps.canvas.width = wh;
  deps.canvas.height = wh;
  deps.canvas.style.width = `${wh}px`;
  deps.canvas.style.height = `${wh}px`;
  deps.padding = padding;
  deps.cellSize = cellSize;
  return cellSize;
}

export function drawGomoku(deps, view) {
  const ctx = deps.ctx;
  const size = view.size;
  const cs = deps.cellSize;
  const pad = deps.padding;
  const w = deps.canvas.width;
  const h = deps.canvas.height;
  const sx = (c) => pad + c * cs;
  const sy = (r) => pad + r * cs;

  // 木紋底（與對弈 / 死活同色）
  ctx.fillStyle = '#dcb35c';
  ctx.fillRect(0, 0, w, h);

  // 格線
  ctx.strokeStyle = '#5a4420';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i++) {
    ctx.beginPath(); ctx.moveTo(sx(0), sy(i)); ctx.lineTo(sx(size - 1), sy(i)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(i), sy(0)); ctx.lineTo(sx(i), sy(size - 1)); ctx.stroke();
  }

  // 星位
  ctx.fillStyle = '#5a4420';
  for (const [r, c] of STAR_15) {
    ctx.beginPath();
    ctx.arc(sx(c), sy(r), cs * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // 棋子（重用 ui.js 的 drawStone）
  const sd = { ctx, canvas: deps.canvas, padding: pad, cellSize: cs };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = view.board[r][c];
      if (v !== EMPTY) drawStone(sd, r, c, v, false);
    }
  }

  // hover 預覽（輪到玩家、空點）
  if (view.hover && inBounds(size, view.hover.row, view.hover.col) &&
      view.board[view.hover.row][view.hover.col] === EMPTY) {
    ctx.globalAlpha = 0.4;
    drawStone(sd, view.hover.row, view.hover.col, view.toPlayColor, false);
    ctx.globalAlpha = 1;
  }

  // 最後一手標記（棋子中央對比色小點）
  if (view.lastMove) {
    const [r, c] = view.lastMove;
    const isWhite = view.board[r][c] === WHITE;
    ctx.fillStyle = isWhite ? '#000' : '#fff';
    ctx.beginPath();
    ctx.arc(sx(c), sy(r), cs * 0.12, 0, Math.PI * 2);
    ctx.fill();
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

export const GomokuUI = { resizeGomokuCanvas, drawGomoku };
