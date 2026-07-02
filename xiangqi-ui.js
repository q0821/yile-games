// xiangqi-ui.js — 象棋盤 canvas 渲染（純畫圖，無狀態）。
//
// 棋子畫在「交叉點」上（非格子內），9 直線 x 10 橫線。河界處內側直線斷開，九宮畫斜線。
// 棋子為實體立體感（徑向漸層凸面 + 投影 + 描邊 + 高光）。
// view = { grid, selected, legalTargets, lastMove, checkRC, anim }；座標 row 0=上、col 0=左。
//   anim = { hideRow, hideCol, piece:{char,red}, x, y }：動畫中隱藏某格、改畫浮動棋子於 (x,y)。
import { COLUMNS, ROWS } from './xiangqi-game.js';
import { paintWoodGrain, paintVignette } from './board-texture.js';

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

/** 兵卒位（rows 3,6 cols 0,2,4,6,8）與炮位（rows 2,7 cols 1,7）的傳統直角標線；邊列只畫內側。 */
function drawPositionMarks(deps) {
  const ctx = deps.ctx, cell = deps.cellSize;
  const g = cell * 0.10, len = cell * 0.16;
  ctx.strokeStyle = LINE; ctx.lineWidth = 1.2;
  const pts = [];
  for (const c of [0, 2, 4, 6, 8]) { pts.push([3, c]); pts.push([6, c]); }
  for (const c of [1, 7]) { pts.push([2, c]); pts.push([7, c]); }
  for (const [r, c] of pts) {
    const x = ix(deps, c), y = iy(deps, r);
    for (const dx of [-1, 1]) {
      if ((dx < 0 && c === 0) || (dx > 0 && c === COLUMNS - 1)) continue; // 邊列省略外側
      for (const dy of [-1, 1]) {
        const px = x + dx * g, py = y + dy * g;
        ctx.beginPath();
        ctx.moveTo(px + dx * len, py); ctx.lineTo(px, py); ctx.lineTo(px, py + dy * len);
        ctx.stroke();
      }
    }
  }
}

/** 畫一顆實體立體棋子（投影 + 凸面漸層 + 描邊 + 高光 + 字）。 */
function drawPiece(ctx, x, y, r, piece, lifted) {
  // 防護：座標/半徑非有限值時跳過（createRadialGradient 收到 NaN 會拋例外凍住整盤）
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) return;
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
  // 3b) 內圈淺浮雕：右下內陰影 + 左上邊緣高光，營造陰刻圓底質感（幅度小，不影響文字辨識）
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.80, 0, Math.PI * 2);
  ctx.clip();
  const shade = ctx.createRadialGradient(x + r * 0.3, y + r * 0.32, r * 0.3, x, y, r * 0.82);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, piece.red ? 'rgba(120,38,25,0.18)' : 'rgba(30,20,8,0.18)');
  ctx.fillStyle = shade;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const rim = ctx.createRadialGradient(x - r * 0.32, y - r * 0.36, 0, x - r * 0.32, y - r * 0.36, r * 0.95);
  rim.addColorStop(0, 'rgba(255,255,255,0.32)');
  rim.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
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

// ——— 棋盤背景 offscreen 快取（底色＋木紋＋格線＋九宮＋標線＋河界字＋vignette，只在尺寸變動時重算） ———
let _bg = null;
let _bgKey = '';

function buildBackground(deps) {
  const key = `${deps._w}_${deps._h}_${deps.cellSize}`;
  if (_bg && _bgKey === key) return _bg;
  const off = document.createElement('canvas');
  off.width = deps._w; off.height = deps._h;
  const ctx = off.getContext('2d');
  const bg = { ctx, cellSize: deps.cellSize, padding: deps.padding };
  const cell = deps.cellSize;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, deps._w, deps._h);
  paintWoodGrain(ctx, deps._w, deps._h, { seed: 17, grainColor: 'rgba(80,58,26,0.10)', speckColor: 'rgba(255,244,214,0.10)' });

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.4;

  // 橫線
  for (let r = 0; r < ROWS; r++) line(ctx, ix(bg, 0), iy(bg, r), ix(bg, COLUMNS - 1), iy(bg, r));
  // 直線：邊線整條，內側在河界斷開
  for (let c = 0; c < COLUMNS; c++) {
    if (c === 0 || c === COLUMNS - 1) {
      line(ctx, ix(bg, c), iy(bg, 0), ix(bg, c), iy(bg, ROWS - 1));
    } else {
      line(ctx, ix(bg, c), iy(bg, 0), ix(bg, c), iy(bg, 4));
      line(ctx, ix(bg, c), iy(bg, 5), ix(bg, c), iy(bg, ROWS - 1));
    }
  }
  // 九宮斜線
  line(ctx, ix(bg, 3), iy(bg, 0), ix(bg, 5), iy(bg, 2));
  line(ctx, ix(bg, 5), iy(bg, 0), ix(bg, 3), iy(bg, 2));
  line(ctx, ix(bg, 3), iy(bg, 7), ix(bg, 5), iy(bg, 9));
  line(ctx, ix(bg, 5), iy(bg, 7), ix(bg, 3), iy(bg, 9));

  // 兵卒位、炮位的傳統直角標線
  drawPositionMarks(bg);

  // 河界字
  ctx.fillStyle = 'rgba(91,68,35,0.5)';
  ctx.font = `${Math.round(cell * 0.46)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riverY = (iy(bg, 4) + iy(bg, 5)) / 2;
  ctx.fillText('楚 河', ix(bg, 1.5), riverY);
  ctx.fillText('漢 界', ix(bg, 6.5), riverY);

  paintVignette(ctx, deps._w, deps._h);

  _bg = off; _bgKey = key;
  return off;
}

export function drawXiangqi(deps, view) {
  const { ctx } = deps;
  const cell = deps.cellSize;
  ctx.clearRect(0, 0, deps._w, deps._h);
  ctx.drawImage(buildBackground(deps), 0, 0);

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

  // 最佳變化預想（PV）：箭頭 + 序號（覆盤分析後）
  if (view.pv && view.pv.length) {
    view.pv.forEach((mv, i) => {
      const a = view.rc(mv.from), b = view.rc(mv.to);
      const op = i === 0 ? 0.92 : i === 1 ? 0.62 : 0.4;
      drawArrow(ctx, ix(deps, a.col), iy(deps, a.row), ix(deps, b.col), iy(deps, b.row), `rgba(30,111,192,${op})`, Math.max(2.5, cell * 0.11), radius * 0.62);
      // 序號徽章於終點
      const bx = ix(deps, b.col), by = iy(deps, b.row);
      ctx.beginPath();
      ctx.arc(bx + radius * 0.5, by - radius * 0.5, radius * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(30,111,192,${op})`;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(radius * 0.42)}px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), bx + radius * 0.5, by - radius * 0.5 + 1);
    });
  }

  // 浮動（移動中）棋子畫最上層，帶 lifted 陰影
  if (view.anim && view.anim.piece) {
    drawPiece(ctx, view.anim.x, view.anim.y, radius, view.anim.piece, true);
  }
}

/** 由 (x1,y1) 指向 (x2,y2) 的箭頭；shrink 為兩端內縮（避免蓋住棋子中心）。 */
function drawArrow(ctx, x1, y1, x2, y2, color, width, shrink) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const sx = x1 + Math.cos(ang) * shrink, sy = y1 + Math.sin(ang) * shrink;
  const ex = x2 - Math.cos(ang) * shrink, ey = y2 - Math.sin(ang) * shrink;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  const head = width * 2.6;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(ang - Math.PI / 6), ey - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(ex - head * Math.cos(ang + Math.PI / 6), ey - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath(); ctx.fill();
  ctx.lineCap = 'butt';
}
