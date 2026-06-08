// xiangqi-ui.js — 象棋盤 canvas 渲染（純畫圖，無狀態）。
//
// 棋子畫在「交叉點」上（非格子內），9 直線 x 10 橫線。河界處內側直線斷開，九宮畫斜線。
// view = { grid, selected, legalTargets, lastMove }；座標 row 0=上、col 0=左（與 xiangqi-game 一致）。
import { COLUMNS, ROWS } from './xiangqi-game.js';

const BG = '#e9c987';
const LINE = '#5b4423';
const SEL = '#c0392b';
const HINT = 'rgba(43,90,40,0.55)';
const LAST = 'rgba(192,57,43,0.5)';

/** 依容器寬度算 cellSize 並設定 canvas 尺寸（含 DPR）。回傳幾何資訊。 */
export function resizeXiangqiCanvas(deps, maxWidthPx) {
  const { canvas } = deps;
  const cols = COLUMNS - 1;            // 8 水平間隔
  const rows = ROWS - 1;               // 9 垂直間隔
  const pad = deps.padding;
  // 以寬度為主算 cellSize，限制最大避免桌機過大
  const usableW = Math.min(maxWidthPx || 360, 460) - pad * 2;
  const cell = Math.max(28, Math.floor(usableW / cols));
  deps.cellSize = cell;
  const w = pad * 2 + cols * cell;
  const h = pad * 2 + rows * cell;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  deps.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  deps._w = w; deps._h = h;
  return { w, h, cell };
}

function ix(deps, col) { return deps.padding + col * deps.cellSize; }
function iy(deps, row) { return deps.padding + row * deps.cellSize; }

function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

export function drawXiangqi(deps, view) {
  const { ctx } = deps;
  const cell = deps.cellSize;
  ctx.clearRect(0, 0, deps._w, deps._h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, deps._w, deps._h);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.4;

  // 橫線：10 條
  for (let r = 0; r < ROWS; r++) line(ctx, ix(deps, 0), iy(deps, r), ix(deps, COLUMNS - 1), iy(deps, r));
  // 直線：邊線(0,8)整條；內側(1..7)在河界斷開
  for (let c = 0; c < COLUMNS; c++) {
    if (c === 0 || c === COLUMNS - 1) {
      line(ctx, ix(deps, c), iy(deps, 0), ix(deps, c), iy(deps, ROWS - 1));
    } else {
      line(ctx, ix(deps, c), iy(deps, 0), ix(deps, c), iy(deps, 4));
      line(ctx, ix(deps, c), iy(deps, 5), ix(deps, c), iy(deps, ROWS - 1));
    }
  }
  // 九宮斜線（上 row0-2、下 row7-9，cols 3-5）
  line(ctx, ix(deps, 3), iy(deps, 0), ix(deps, 5), iy(deps, 2));
  line(ctx, ix(deps, 5), iy(deps, 0), ix(deps, 3), iy(deps, 2));
  line(ctx, ix(deps, 3), iy(deps, 7), ix(deps, 5), iy(deps, 9));
  line(ctx, ix(deps, 5), iy(deps, 7), ix(deps, 3), iy(deps, 9));

  // 河界字
  ctx.fillStyle = 'rgba(91,68,35,0.55)';
  ctx.font = `${Math.round(cell * 0.5)}px "Noto Serif TC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riverY = (iy(deps, 4) + iy(deps, 5)) / 2;
  ctx.fillText('楚 河', ix(deps, 1.5), riverY);
  ctx.fillText('漢 界', ix(deps, 6.5), riverY);

  // 最後一手標記
  if (view.lastMove) {
    for (const sq of view.lastMove) {
      const p = view.rc(sq);
      ctx.fillStyle = LAST;
      ctx.beginPath();
      ctx.arc(ix(deps, p.col), iy(deps, p.row), cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 棋子
  const grid = view.grid;
  const radius = cell * 0.42;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const piece = grid[r][c];
      if (!piece) continue;
      const x = ix(deps, c), y = iy(deps, r);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f3e2bd';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = piece.red ? '#b03a2e' : '#2c2417';
      ctx.stroke();
      ctx.fillStyle = piece.red ? '#b03a2e' : '#2c2417';
      ctx.font = `700 ${Math.round(cell * 0.5)}px "Noto Serif TC", serif`;
      ctx.fillText(piece.char, x, y + 1);
    }
  }

  // 選取環
  if (view.selected) {
    const p = view.rc(view.selected);
    ctx.strokeStyle = SEL;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ix(deps, p.col), iy(deps, p.row), radius + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 合法目的點
  if (view.legalTargets) {
    ctx.fillStyle = HINT;
    for (const sq of view.legalTargets) {
      const p = view.rc(sq);
      const occupied = view.grid[p.row][p.col];
      ctx.beginPath();
      if (occupied) {
        // 可吃子 → 畫環
        ctx.lineWidth = 3; ctx.strokeStyle = HINT;
        ctx.arc(ix(deps, p.col), iy(deps, p.row), radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.arc(ix(deps, p.col), iy(deps, p.row), cell * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
