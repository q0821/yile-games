// chess-ui.js — 西洋棋 8×8 棋盤 canvas 渲染（純畫圖，無狀態）。
//
// 暖色棋盤格（淺＝宣紙暖白、深＝暖棕）、細框；棋子為 Unicode 水墨剪影
// （黑方深墨、白方象牙底＋細描邊、柔焦投影）。風格沿用通過的示意稿。
// view = { grid, selected, legalTargets, lastMove, checkRC, anim, hint, rc }；座標 row 0=上、col 0=左。
//   hint = { from, to }：建議走法箭頭（AI 建議按鈕，見 chess-mode.js）。
import { COLUMNS, ROWS } from './chess-game.js';
import { paintWoodGrain, paintVignette } from './board-texture.js';

// 棋子用系統西洋棋符號字型（macOS/iOS=Apple Symbols；其餘退回）
const PIECEFONT = '"Apple Symbols","Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",sans-serif';

const LIGHT = '#f0dcab';    // 淺格（宣紙暖白）
const DARK = '#c79a59';     // 深格（暖棕）
const MARGIN = '#efe1c0';   // 細框底
const FRAMELINE = '#7a5a31';
const EDGE = '#5b4222';     // 白方描邊
const SEL = '#c0392b';
const HINT = 'rgba(43,90,40,0.55)';
const LAST = 'rgba(201,140,40,0.34)';
const CHECK = '#d23b3b';
const HINT_ARROW = 'rgba(30,111,192,0.9)'; // 建議走法箭頭色，與象棋 PV 箭頭一致

/** 依容器寬度算 cellSize 並設定 canvas 尺寸（含 DPR）。細框：padding 取 cell 小比例。 */
export function resizeChessCanvas(deps, maxWidthPx) {
  const { canvas } = deps;
  const usableW = Math.min(maxWidthPx || 360, 480);
  const PAD_RATIO = 0.16;
  const cell = Math.max(32, Math.floor(usableW / (COLUMNS + 2 * PAD_RATIO)));
  const pad = Math.max(7, Math.round(cell * PAD_RATIO));
  deps.cellSize = cell;
  deps.padding = pad;
  const w = pad * 2 + COLUMNS * cell;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(w * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = w + 'px';
  deps.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  deps._w = w;
  return { w, cell };
}

function gx(deps, col) { return deps.padding + col * deps.cellSize; }
function gy(deps, row) { return deps.padding + row * deps.cellSize; }
function cx(deps, col) { return gx(deps, col) + deps.cellSize / 2; }
function cy(deps, row) { return gy(deps, row) + deps.cellSize / 2; }

// ——— 玻璃質感 glyph offscreen 合成 layer（依 size 建立、重繪重用，避免每 frame 重新配置 canvas） ———
let _pieceLayer = null;
let _pieceLayerSize = 0;
function getPieceLayer(size) {
  const s = Math.ceil(size * 1.6);
  if (!_pieceLayer || _pieceLayerSize !== s) {
    _pieceLayer = document.createElement('canvas');
    _pieceLayer.width = s; _pieceLayer.height = s;
    _pieceLayerSize = s;
  }
  return _pieceLayer;
}

/** 一顆玻璃半透明剪影駒（漸層透明填色＋斜向高光＋柔和橢圓投影）。size = 格邊長。piece = { glyph, white }。 */
function drawPiece(ctx, x, y, size, piece) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return;
  const g = piece.glyph;

  // 1) 柔和橢圓投影（落地感；offset 小、blur 適中，與字形本身分開處理）
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.34, size * 0.30, size * 0.11, 0, 0, Math.PI * 2);
  const footGrad = ctx.createRadialGradient(x, y + size * 0.34, 0, x, y + size * 0.34, size * 0.30);
  footGrad.addColorStop(0, 'rgba(35,24,10,0.34)');
  footGrad.addColorStop(1, 'rgba(35,24,10,0)');
  ctx.fillStyle = footGrad;
  ctx.fill();
  ctx.restore();

  // 2) glyph 本體：offscreen 合成，先畫實心剪影當遮罩，再用 source-in／source-atop 疊漸層與高光
  //    （疊到主畫布時會與底下棋格顏色混合，呈現半透明玻璃感）
  const layer = getPieceLayer(size);
  const lctx = layer.getContext('2d');
  const ls = layer.width;
  const lcx = ls / 2, lcy = ls / 2;
  lctx.clearRect(0, 0, ls, ls);
  lctx.font = `${Math.round(size * 0.82)}px ${PIECEFONT}`;
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.fillStyle = '#000';
  lctx.fillText(g, lcx, lcy + size * 0.02);
  if (piece.white) {
    lctx.lineWidth = Math.max(1.4, size * 0.035);
    lctx.strokeStyle = '#000';
    lctx.strokeText(g, lcx, lcy + size * 0.02);
  }
  lctx.globalCompositeOperation = 'source-in';
  const grad = lctx.createLinearGradient(0, lcy - size * 0.42, 0, lcy + size * 0.42);
  if (piece.white) {
    grad.addColorStop(0, 'rgba(255,253,246,0.60)');
    grad.addColorStop(0.5, 'rgba(243,234,212,0.82)');
    grad.addColorStop(1, 'rgba(214,197,159,0.88)');
  } else {
    grad.addColorStop(0, 'rgba(80,68,52,0.74)');
    grad.addColorStop(0.5, 'rgba(44,36,23,0.88)');
    grad.addColorStop(1, 'rgba(18,14,8,0.93)');
  }
  lctx.fillStyle = grad;
  lctx.fillRect(0, 0, ls, ls);
  // 斜向玻璃高光窄帶（clip 於字形剪影內，模擬反光）
  lctx.globalCompositeOperation = 'source-atop';
  lctx.save();
  lctx.translate(lcx, lcy);
  lctx.rotate(-0.55);
  const hl = lctx.createLinearGradient(-size * 0.55, 0, size * 0.55, 0);
  hl.addColorStop(0.40, 'rgba(255,255,255,0)');
  hl.addColorStop(0.50, piece.white ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.30)');
  hl.addColorStop(0.60, 'rgba(255,255,255,0)');
  lctx.fillStyle = hl;
  lctx.fillRect(-ls, -ls, ls * 2, ls * 2);
  lctx.restore();
  lctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.shadowColor = 'rgba(30,20,8,0.30)';
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetY = size * 0.04;
  ctx.drawImage(layer, x - lcx, y - lcy);
  ctx.restore();

  // 3) 描邊維持辨識度：白子沿用原本暖褐描邊；黑子加極細亮邊避免在深格上糊成一片
  ctx.save();
  ctx.font = `${Math.round(size * 0.82)}px ${PIECEFONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (piece.white) {
    ctx.lineWidth = Math.max(1.4, size * 0.035);
    ctx.strokeStyle = EDGE;
    ctx.strokeText(g, x, y + size * 0.02);
  } else {
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.strokeStyle = 'rgba(255,250,235,0.18)';
    ctx.strokeText(g, x, y + size * 0.02);
  }
  ctx.restore();
}

// ——— 棋盤背景 offscreen 快取（底色＋棋格＋木紋＋細框＋座標＋vignette，只在尺寸變動時重算） ———
let _bg = null;
let _bgKey = '';

function buildBackground(deps) {
  const key = `${deps._w}_${deps.cellSize}`;
  if (_bg && _bgKey === key) return _bg;
  const off = document.createElement('canvas');
  off.width = deps._w; off.height = deps._w;
  const ctx = off.getContext('2d');
  const cell = deps.cellSize;
  const W = deps._w;

  ctx.fillStyle = MARGIN; ctx.fillRect(0, 0, W, W);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLUMNS; c++) {
    ctx.fillStyle = ((r + c) % 2 === 0) ? LIGHT : DARK;
    ctx.fillRect(gx(deps, c), gy(deps, r), cell, cell);
  }
  paintWoodGrain(ctx, W, W, { seed: 25, grainColor: 'rgba(70,50,20,0.08)', speckColor: 'rgba(255,244,214,0.08)' });

  ctx.strokeStyle = FRAMELINE; ctx.lineWidth = 2;
  ctx.strokeRect(gx(deps, 0) - 1, gy(deps, 0) - 1, COLUMNS * cell + 2, ROWS * cell + 2);

  ctx.fillStyle = 'rgba(91,68,35,0.55)';
  ctx.font = `600 ${Math.max(8, Math.round(cell * 0.18))}px "Noto Serif TC","Songti TC",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let c = 0; c < COLUMNS; c++) ctx.fillText('abcdefgh'[c], cx(deps, c), W - deps.padding / 2);
  for (let r = 0; r < ROWS; r++) ctx.fillText(String(8 - r), deps.padding / 2, cy(deps, r));

  paintVignette(ctx, W, W);

  _bg = off; _bgKey = key;
  return off;
}

export function drawChess(deps, view) {
  const { ctx } = deps;
  const cell = deps.cellSize;
  const W = deps._w;
  ctx.clearRect(0, 0, W, W);
  ctx.drawImage(buildBackground(deps), 0, 0);

  // 最後一手底色（from + to）
  if (view.lastMove) {
    ctx.fillStyle = LAST;
    for (const sq of view.lastMove) {
      if (!sq) continue;
      const p = view.rc(sq);
      ctx.fillRect(gx(deps, p.col), gy(deps, p.row), cell, cell);
    }
  }

  // 將軍：被將王格紅框
  if (view.checkRC) {
    ctx.strokeStyle = CHECK; ctx.lineWidth = 3;
    ctx.strokeRect(gx(deps, view.checkRC.col) + 1.5, gy(deps, view.checkRC.row) + 1.5, cell - 3, cell - 3);
  }

  // 棋子（動畫時隱藏起點格）
  const grid = view.grid;
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) {
    const piece = grid[r][c];
    if (!piece) continue;
    if (view.anim && view.anim.hideRow === r && view.anim.hideCol === c) continue;
    drawPiece(ctx, cx(deps, c), cy(deps, r), cell, piece);
  }

  // 選取格
  if (view.selected) {
    const p = view.rc(view.selected);
    ctx.strokeStyle = SEL; ctx.lineWidth = 3;
    ctx.strokeRect(gx(deps, p.col) + 1.5, gy(deps, p.row) + 1.5, cell - 3, cell - 3);
  }
  // 合法目的
  if (view.legalTargets) {
    for (const sq of view.legalTargets) {
      const p = view.rc(sq);
      const occupied = view.grid[p.row][p.col];
      if (occupied) {
        ctx.strokeStyle = HINT; ctx.lineWidth = 3;
        ctx.strokeRect(gx(deps, p.col) + 1.5, gy(deps, p.row) + 1.5, cell - 3, cell - 3);
      } else {
        ctx.fillStyle = HINT;
        ctx.beginPath(); ctx.arc(cx(deps, p.col), cy(deps, p.row), cell * 0.16, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // 建議走法箭頭（AI 建議，from→to；現無 pv 支援，故獨立畫一支箭頭）
  if (view.hint) {
    const a = view.rc(view.hint.from), b = view.rc(view.hint.to);
    drawArrow(ctx, cx(deps, a.col), cy(deps, a.row), cx(deps, b.col), cy(deps, b.row), HINT_ARROW, Math.max(2.5, cell * 0.09), cell * 0.30);
  }

  // 浮動（移動中）駒畫最上層
  if (view.anim && view.anim.piece) {
    drawPiece(ctx, view.anim.x, view.anim.y, cell, view.anim.piece);
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
