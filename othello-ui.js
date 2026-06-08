// othello-ui.js — 黑白棋盤 canvas 渲染（純畫圖，無狀態）。
//
// 棋子落在「格子中心」（非交叉點）。8×8 格、暖色盤、黑白立體圓子。
// view = { board, size, legalMoves, lastMove, hover }；座標 board[row][col]。
import { EMPTY, BLACK } from './rules.js';

const BG = '#e6c98a';
const LINE = 'rgba(91,68,35,0.55)';
const HINT = 'rgba(43,90,40,0.45)';
const LAST = '#c0392b';

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
  deps._w = w;
  return { w, cell };
}

function cx(deps, col) { return deps.padding + col * deps.cellSize + deps.cellSize / 2; }
function cy(deps, row) { return deps.padding + row * deps.cellSize + deps.cellSize / 2; }

/** 立體圓子（投影 + 凸面漸層 + 高光）。black=true 黑子。 */
function drawStone(deps, x, y, r, black) {
  const ctx = deps.ctx;
  ctx.save();
  ctx.shadowColor = 'rgba(40,28,12,0.4)';
  ctx.shadowBlur = r * 0.34;
  ctx.shadowOffsetY = r * 0.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = black ? '#2b2b30' : '#efe6d2';
  ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.15, x, y, r);
  if (black) { g.addColorStop(0, '#6a6a72'); g.addColorStop(0.5, '#34343a'); g.addColorStop(1, '#161618'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f3ead4'); g.addColorStop(1, '#d8cbac'); }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.2, r * 0.6, Math.PI * 1.05, Math.PI * 1.6);
  ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.strokeStyle = black ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.65)';
  ctx.stroke(); ctx.lineCap = 'butt';
}

export function drawOthello(deps, view) {
  const { ctx } = deps;
  const size = deps.size, cell = deps.cellSize, pad = deps.padding;
  ctx.clearRect(0, 0, deps._w, deps._w);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, deps._w, deps._w);

  // 格線（9×9 邊界）
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  for (let i = 0; i <= size; i++) {
    const p = pad + i * cell;
    ctx.beginPath(); ctx.moveTo(pad, p); ctx.lineTo(pad + size * cell, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, pad); ctx.lineTo(p, pad + size * cell); ctx.stroke();
  }
  // 8×8 盤的四個定位點（小圓點，標準黑白棋有）
  if (size === 8) {
    ctx.fillStyle = LINE;
    for (const [r, c] of [[2, 2], [2, 6], [6, 2], [6, 6]]) {
      ctx.beginPath(); ctx.arc(pad + r * cell, pad + c * cell, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  const radius = cell * 0.42;
  // 合法手提示（輪到的一方）
  if (view.legalMoves) {
    ctx.fillStyle = HINT;
    for (const [r, c] of view.legalMoves) {
      ctx.beginPath(); ctx.arc(cx(deps, c), cy(deps, r), cell * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 棋子
  const board = view.board;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) continue;
      drawStone(deps, cx(deps, c), cy(deps, r), radius, board[r][c] === BLACK);
    }
  }
  // 最後一手標記
  if (view.lastMove) {
    const [r, c] = view.lastMove;
    ctx.strokeStyle = LAST; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx(deps, c), cy(deps, r), radius + 3, 0, Math.PI * 2); ctx.stroke();
  }
}
