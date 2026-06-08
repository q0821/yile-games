// xiangqi-ui.js — 象棋盤 canvas 渲染（純畫圖，無狀態）。
//
// 棋子畫在「交叉點」上（非格子內），9 直線 x 10 橫線。河界處內側直線斷開，九宮畫斜線。
// 棋子為實體立體感（徑向漸層凸面 + 投影 + 描邊 + 高光）。
// view = { grid, selected, legalTargets, lastMove, checkRC, anim }；座標 row 0=上、col 0=左。
//   anim = { hideRow, hideCol, piece:{char,red}, x, y }：動畫中隱藏某格、改畫浮動棋子於 (x,y)。
import { COLUMNS, ROWS } from './xiangqi-game.js';

// 與 style.css --font-serif 同步（canvas 無法吃 CSS 變數，故重複一份系統宋體 stack）
const SERIF = '"Noto Serif TC","Noto Serif CJK TC","Songti TC","Songti SC","STSong","PMingLiU","MingLiU","SimSun",serif';

const BG = '#e9c987';
const LINE = '#5b4423';
const SEL = '#c0392b';
const HINT = 'rgba(43,90,40,0.55)';
const LAST = 'rgba(201,140,40,0.30)';
const CHECK = '#d23b3b';

/** 依容器寬度算 cellSize 並設定 canvas 尺寸（含 DPR）。padding 留足棋子半徑+陰影避免切邊。 */
export function resizeXiangqiCanvas(deps, maxWidthPx) {
  const { canvas } = deps;
  const cols = COLUMNS - 1;            // 8 水平間隔
  const rows = ROWS - 1;               // 9 垂直間隔
  // 先依寬度估 cell（padding 取 cell 的比例，故聯立求解）
  const usableW = Math.min(maxWidthPx || 360, 480);
  // w = pad*2 + cols*cell，pad = cell*PAD_RATIO → w = cell*(cols + 2*PAD_RATIO)
  const PAD_RATIO = 0.62;
  const cell = Math.max(30, Math.floor(usableW / (cols + 2 * PAD_RATIO)));
  const pad = Math.round(cell * PAD_RATIO);
  deps.cellSize = cell;
  deps.padding = pad;
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

/** 畫一顆實體立體棋子（投影 + 凸面漸層 + 描邊 + 高光 + 字）。 */
function drawPiece(ctx, x, y, r, piece, lifted) {
  const edge = piece.red ? '#a8392e' : '#2c2417';
  // 1) 投影（只在底盤填色時開 shadow，畫完即關，避免描邊/字糊掉）
  ctx.save();
  ctx.shadowColor = 'rgba(60,40,15,0.40)';
  ctx.shadowBlur = lifted ? r * 0.6 : r * 0.34;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = lifted ? r * 0.34 : r * 0.20;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#e9d3a4';
  ctx.fill();
  ctx.restore();
  // 2) 凸面漸層（左上亮 → 右下暗）
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.15, x, y, r);
  g.addColorStop(0, '#fbf3df');
  g.addColorStop(0.55, '#f0e0bc');
  g.addColorStop(1, '#dcc295');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // 3) 外描邊 + 內圈
  ctx.lineWidth = Math.max(2, r * 0.10);
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.80, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = piece.red ? 'rgba(168,57,46,0.5)' : 'rgba(44,36,23,0.45)';
  ctx.stroke();
  // 4) 左上高光弧
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.20, r * 0.62, Math.PI * 1.05, Math.PI * 1.62);
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
  // 5) 字
  ctx.fillStyle = edge;
  ctx.font = `700 ${Math.round(r * 1.12)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(piece.char, x, y + r * 0.04);
}

export function drawXiangqi(deps, view) {
  const { ctx } = deps;
  const cell = deps.cellSize;
  ctx.clearRect(0, 0, deps._w, deps._h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, deps._w, deps._h);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.4;

  // 橫線
  for (let r = 0; r < ROWS; r++) line(ctx, ix(deps, 0), iy(deps, r), ix(deps, COLUMNS - 1), iy(deps, r));
  // 直線：邊線整條，內側在河界斷開
  for (let c = 0; c < COLUMNS; c++) {
    if (c === 0 || c === COLUMNS - 1) {
      line(ctx, ix(deps, c), iy(deps, 0), ix(deps, c), iy(deps, ROWS - 1));
    } else {
      line(ctx, ix(deps, c), iy(deps, 0), ix(deps, c), iy(deps, 4));
      line(ctx, ix(deps, c), iy(deps, 5), ix(deps, c), iy(deps, ROWS - 1));
    }
  }
  // 九宮斜線
  line(ctx, ix(deps, 3), iy(deps, 0), ix(deps, 5), iy(deps, 2));
  line(ctx, ix(deps, 5), iy(deps, 0), ix(deps, 3), iy(deps, 2));
  line(ctx, ix(deps, 3), iy(deps, 7), ix(deps, 5), iy(deps, 9));
  line(ctx, ix(deps, 5), iy(deps, 7), ix(deps, 3), iy(deps, 9));

  // 河界字
  ctx.fillStyle = 'rgba(91,68,35,0.5)';
  ctx.font = `${Math.round(cell * 0.46)}px ${SERIF}`;
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

  // 將軍：被將將帥紅色高亮環
  if (view.checkRC) {
    ctx.strokeStyle = CHECK;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(ix(deps, view.checkRC.col), iy(deps, view.checkRC.row), cell * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  const radius = cell * 0.40;

  // 棋子（動畫時隱藏起點格）
  const grid = view.grid;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const piece = grid[r][c];
      if (!piece) continue;
      if (view.anim && view.anim.hideRow === r && view.anim.hideCol === c) continue;
      drawPiece(ctx, ix(deps, c), iy(deps, r), radius, piece, false);
    }
  }

  // 選取環
  if (view.selected) {
    const p = view.rc(view.selected);
    ctx.strokeStyle = SEL;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ix(deps, p.col), iy(deps, p.row), radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 合法目的點
  if (view.legalTargets) {
    for (const sq of view.legalTargets) {
      const p = view.rc(sq);
      const occupied = view.grid[p.row][p.col];
      if (occupied) {
        ctx.strokeStyle = HINT;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ix(deps, p.col), iy(deps, p.row), radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = HINT;
        ctx.beginPath();
        ctx.arc(ix(deps, p.col), iy(deps, p.row), cell * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 浮動（移動中）棋子畫最上層，帶 lifted 陰影
  if (view.anim && view.anim.piece) {
    drawPiece(ctx, view.anim.x, view.anim.y, radius, view.anim.piece, true);
  }
}
