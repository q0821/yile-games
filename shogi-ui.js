// shogi-ui.js — 將棋 9×9 格盤 canvas 渲染（純畫圖，無狀態）。
//
// 駒畫在「格子內」（非交叉點），為五角楔形（將棋駒外形）。先手駒正向、後手駒整顆 180°
// 倒置（含漢字），升變駒漢字用紅字。持駒區由 shogi-mode 以 DOM 另渲染（易點擊與計數）。
// view = { grid, selected, legalTargets, lastMove, checkRC, anim, hint }；座標 row 0=上、col 0=左。
//   anim = { hideRow, hideCol, piece, x, y }：動畫中隱藏某格、改畫浮動駒於 (x,y)。
//   hint = { isDrop:false, from, to } 一般手箭頭 或 { isDrop:true, to } 打入目的地高亮
//   （建議走法按鈕，見 shogi-mode.js；打入無起點，持駒列對應駒高亮另由 shogi-mode.js 的 DOM 渲染負責）。
import { COLUMNS, ROWS } from './shogi-game.js';
import { paintWoodGrain, paintVignette } from './board-texture.js';

const SERIF = '"Noto Serif TC","Noto Serif CJK TC","Songti TC","Songti SC","STSong","PMingLiU","MingLiU","SimSun",serif';

const BG = '#f0d9a8';       // 暖木盤底
const FRAME = '#6b4f2a';
const LINE = '#7a5a31';
const SEL = '#c0392b';
const HINT = 'rgba(43,90,40,0.55)';
const LAST = 'rgba(201,140,40,0.32)';
const CHECK = '#d23b3b';
const PIECE_FACE = '#f7e4b6';
const PIECE_EDGE = '#5b4222';
const PROMO_INK = '#b23a2e';
const HINT_ARROW = 'rgba(30,111,192,0.9)';   // 建議走法箭頭色，與象棋/西洋棋一致
const HINT_DROP_FILL = 'rgba(30,111,192,0.22)';
const HINT_DROP_STROKE = 'rgba(30,111,192,0.9)';

/** 依容器寬度算 cellSize 並設定 canvas 尺寸（含 DPR）。 */
export function resizeShogiCanvas(deps, maxWidthPx) {
  const { canvas } = deps;
  const usableW = Math.min(maxWidthPx || 360, 460);
  const PAD_RATIO = 0.22;     // 邊框占一格的比例
  const cell = Math.max(28, Math.floor(usableW / (COLUMNS + 2 * PAD_RATIO)));
  const pad = Math.round(cell * PAD_RATIO);
  deps.cellSize = cell;
  deps.padding = pad;
  const w = pad * 2 + COLUMNS * cell;
  const h = pad * 2 + ROWS * cell;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  deps.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  deps._w = w; deps._h = h;
  return { w, h, cell };
}

/** 格 (row,col) 的像素中心。 */
function cx(deps, col) { return deps.padding + col * deps.cellSize + deps.cellSize / 2; }
function cy(deps, row) { return deps.padding + row * deps.cellSize + deps.cellSize / 2; }
function gx(deps, col) { return deps.padding + col * deps.cellSize; }
function gy(deps, row) { return deps.padding + row * deps.cellSize; }

/** 五角楔形駒路徑（指向上方；後手會由呼叫端旋轉）。中心 (0,0)，半寬 w、半高 h。 */
function komaPath(ctx, w, h) {
  const rw = w * 0.58, roof = h * 0.46;
  ctx.beginPath();
  ctx.moveTo(0, -h);              // 頂尖
  ctx.lineTo(rw, -h + roof);      // 右肩
  ctx.lineTo(w, h);              // 右下
  ctx.lineTo(-w, h);             // 左下
  ctx.lineTo(-rw, -h + roof);    // 左肩
  ctx.closePath();
}

/** 畫一顆楔形漢字駒。sente=false 時整顆（含字）180° 倒置。lifted 加重陰影。 */
function drawPiece(ctx, x, y, size, piece, lifted) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return;
  size *= 0.88; // 縮到格子約 88%，讓格與駒之間留出呼吸空隙（原尺寸太滿）
  const w = size * 0.42, h = size * 0.46;
  ctx.save();
  ctx.translate(x, y);
  if (!piece.sente) ctx.rotate(Math.PI);   // 後手駒倒置（朝向對方）
  // 投影
  ctx.save();
  ctx.shadowColor = 'rgba(60,40,15,0.40)';
  ctx.shadowBlur = lifted ? size * 0.30 : size * 0.16;
  ctx.shadowOffsetY = lifted ? size * 0.16 : size * 0.09;
  komaPath(ctx, w, h);
  ctx.fillStyle = PIECE_FACE;
  ctx.fill();
  ctx.restore();
  // 面漸層（上亮下暗，沿駒朝向）
  const g = ctx.createLinearGradient(0, -h, 0, h);
  g.addColorStop(0, '#fbeecb');
  g.addColorStop(0.6, '#f2dca8');
  g.addColorStop(1, '#e3c386');
  komaPath(ctx, w, h);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, size * 0.045);
  ctx.strokeStyle = PIECE_EDGE;
  ctx.stroke();
  // 內線
  komaPath(ctx, w * 0.82, h * 0.8);
  ctx.lineWidth = Math.max(0.8, size * 0.022);
  ctx.strokeStyle = 'rgba(91,66,34,0.4)';
  ctx.stroke();
  // 淺浮雕：內線範圍內下方內陰影 + 上方邊緣高光，營造木駒陰刻字底質感（幅度小）
  ctx.save();
  komaPath(ctx, w * 0.82, h * 0.8);
  ctx.clip();
  const shade = ctx.createLinearGradient(0, -h * 0.2, 0, h * 0.8);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(60,40,15,0.16)');
  ctx.fillStyle = shade;
  ctx.fillRect(-w, -h, w * 2, h * 2);
  const rim = ctx.createLinearGradient(0, -h, 0, -h * 0.1);
  rim.addColorStop(0, 'rgba(255,255,255,0.30)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(-w, -h, w * 2, h * 2);
  ctx.restore();
  // 字（升變駒用紅）
  ctx.fillStyle = piece.promoted ? PROMO_INK : PIECE_EDGE;
  ctx.font = `700 ${Math.round(size * 0.5)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(piece.char, 0, size * 0.06);
  ctx.restore();
}

/** 盤上星位點（將棋四星：3·6 線交點）。 */
function drawStars(deps) {
  const ctx = deps.ctx;
  ctx.fillStyle = 'rgba(91,66,34,0.7)';
  for (const r of [3, 6]) for (const c of [3, 6]) {
    ctx.beginPath();
    ctx.arc(gx(deps, c), gy(deps, r), Math.max(1.6, deps.cellSize * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ——— 棋盤背景 offscreen 快取（外框＋底色＋木紋＋格線＋星位＋vignette，只在尺寸變動時重算） ———
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

  ctx.fillStyle = FRAME;
  ctx.fillRect(0, 0, deps._w, deps._h);
  ctx.fillStyle = BG;
  ctx.fillRect(gx(bg, 0), gy(bg, 0), COLUMNS * cell, ROWS * cell);
  paintWoodGrain(ctx, deps._w, deps._h, { seed: 21, grainColor: 'rgba(80,58,26,0.10)', speckColor: 'rgba(255,244,214,0.10)' });

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.2;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(gx(bg, 0), gy(bg, r)); ctx.lineTo(gx(bg, COLUMNS), gy(bg, r)); ctx.stroke();
  }
  for (let c = 0; c <= COLUMNS; c++) {
    ctx.beginPath(); ctx.moveTo(gx(bg, c), gy(bg, 0)); ctx.lineTo(gx(bg, c), gy(bg, ROWS)); ctx.stroke();
  }
  drawStars(bg);

  paintVignette(ctx, deps._w, deps._h);

  _bg = off; _bgKey = key;
  return off;
}

export function drawShogi(deps, view) {
  const { ctx } = deps;
  const cell = deps.cellSize;
  ctx.clearRect(0, 0, deps._w, deps._h);
  ctx.drawImage(buildBackground(deps), 0, 0);

  // 最後一手底色（from + to 格）
  if (view.lastMove) {
    ctx.fillStyle = LAST;
    for (const sq of view.lastMove) {
      if (!sq) continue;
      const p = view.rc(sq);
      ctx.fillRect(gx(deps, p.col), gy(deps, p.row), cell, cell);
    }
  }

  // 王手：被將王格紅框
  if (view.checkRC) {
    ctx.strokeStyle = CHECK;
    ctx.lineWidth = 3;
    ctx.strokeRect(gx(deps, view.checkRC.col) + 1.5, gy(deps, view.checkRC.row) + 1.5, cell - 3, cell - 3);
  }

  const size = cell;

  // 駒（動畫時隱藏起點格）
  const grid = view.grid;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const piece = grid[r][c];
      if (!piece) continue;
      if (view.anim && view.anim.hideRow === r && view.anim.hideCol === c) continue;
      drawPiece(ctx, cx(deps, c), cy(deps, r), size, piece, false);
    }
  }

  // 選取格
  if (view.selected) {
    const p = view.rc(view.selected);
    ctx.strokeStyle = SEL;
    ctx.lineWidth = 3;
    ctx.strokeRect(gx(deps, p.col) + 1.5, gy(deps, p.row) + 1.5, cell - 3, cell - 3);
  }
  // 合法目的／落點
  if (view.legalTargets) {
    for (const sq of view.legalTargets) {
      const p = view.rc(sq);
      const occupied = view.grid[p.row][p.col];
      if (occupied) {
        ctx.strokeStyle = HINT;
        ctx.lineWidth = 3;
        ctx.strokeRect(gx(deps, p.col) + 1.5, gy(deps, p.row) + 1.5, cell - 3, cell - 3);
      } else {
        ctx.fillStyle = HINT;
        ctx.beginPath();
        ctx.arc(cx(deps, p.col), cy(deps, p.row), cell * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 建議走法：一般手畫箭頭；打入沒有起點，改為目的地高亮（對應持駒列高亮見 shogi-mode.js renderHands）
  if (view.hint) {
    if (view.hint.isDrop) {
      const p = view.rc(view.hint.to);
      ctx.fillStyle = HINT_DROP_FILL;
      ctx.fillRect(gx(deps, p.col), gy(deps, p.row), cell, cell);
      ctx.strokeStyle = HINT_DROP_STROKE;
      ctx.lineWidth = 3;
      ctx.strokeRect(gx(deps, p.col) + 1.5, gy(deps, p.row) + 1.5, cell - 3, cell - 3);
    } else {
      const a = view.rc(view.hint.from), b = view.rc(view.hint.to);
      drawArrow(ctx, cx(deps, a.col), cy(deps, a.row), cx(deps, b.col), cy(deps, b.row), HINT_ARROW, Math.max(2.5, cell * 0.10), cell * 0.28);
    }
  }

  // 浮動（移動中）駒畫最上層
  if (view.anim && view.anim.piece) {
    drawPiece(ctx, view.anim.x, view.anim.y, size, view.anim.piece, true);
  }
}

/** 由 (x1,y1) 指向 (x2,y2) 的箭頭；shrink 為兩端內縮（避免蓋住棋子中心）。風格與象棋 PV 箭頭一致。 */
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
