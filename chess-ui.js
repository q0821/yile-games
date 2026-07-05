// chess-ui.js — 西洋棋 8×8 棋盤 canvas 渲染（純畫圖，無狀態）。
//
// 暖色棋盤格（淺＝宣紙暖白、深＝暖棕）、細框；棋子為 Unicode 剪影，套「實體材質」：
// 白子象牙白、黑子黑檀黑，三段漸層＋潤光＋斜向高光 sweep＋描邊，質感向圍棋棋石
// （stone.js）看齊——不透明、格色不透出。sprite 依 glyph／棋色／格邊長快取，與棋盤
// 背景像素無關，靜止與移動中的棋子皆可命中同一張快取。
// view = { grid, selected, legalTargets, lastMove, checkRC, anim, hint, rc }；座標 row 0=上、col 0=左。
//   hint = { from, to }：建議走法箭頭（AI 建議按鈕，見 chess-mode.js）。
import { COLUMNS, ROWS } from './chess-game.js';
import { paintBoardBase, paintWoodGrain, paintVignette } from './board-texture.js';

// 棋子用系統西洋棋符號字型（macOS/iOS=Apple Symbols；其餘退回）
const PIECEFONT = '"Apple Symbols","Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",sans-serif';

const LIGHT = '#f0dcab';    // 淺格（宣紙暖白）
const DARK = '#c79a59';     // 深格（暖棕）
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

// ——— 棋子 sprite 快取：key 只依「glyph／棋色／格邊長」，與棋盤背景像素完全無關，
// 故靜止棋子與移動中的浮動棋子都能命中同一張快取，換格、換高亮狀態都不影響。
// resize 換 cellSize 才會產生新 key；size 防呆上限 64（正常 12 glyph×2 色×1 尺寸遠用不到）。
const _pieceSpriteCache = new Map();

/** 建立（或取快取）一顆實體材質棋子 sprite：glyph 剪影 fill 不透明三段漸層＋潤光＋高光 sweep。
 *  sprite 以裝置像素解析度繪製（off.width = s*dpr、繪圖前 scale(dpr)），貼回主畫布時用邏輯尺寸
 *  drawImage，確保 Retina 清晰。回傳 { canvas, half, s }（s = sprite 邊長之邏輯像素）。 */
function buildPieceSprite(deps, size, piece) {
  const key = `${piece.glyph}_${piece.white ? 1 : 0}_${size}`;
  const cached = _pieceSpriteCache.get(key);
  if (cached) return cached;
  if (_pieceSpriteCache.size > 64) _pieceSpriteCache.clear();

  const s = Math.ceil(size * 1.6);           // 邏輯像素邊長，與主畫布座標系一致
  const half = s / 2;
  const dpr = (deps.canvas.width / deps._w) || 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(s * dpr));
  canvas.height = Math.max(1, Math.round(s * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 1) glyph 遮罩：白子加描邊撐開字形範圍，避免材質貼上去時邊緣過細
  ctx.font = `${Math.round(size * 0.82)}px ${PIECEFONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(piece.glyph, half, half + size * 0.02);
  if (piece.white) {
    ctx.lineWidth = Math.max(1.4, size * 0.035);
    ctx.strokeStyle = '#000';
    ctx.strokeText(piece.glyph, half, half + size * 0.02);
  }

  // 2) 材質：source-in 疊三段漸層——白子象牙白、黑子黑檀黑（色票同 stone.js 白/黑石）
  ctx.globalCompositeOperation = 'source-in';
  const grad = ctx.createLinearGradient(0, half - size * 0.42, 0, half + size * 0.42);
  if (piece.white) {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#f3ead4');
    grad.addColorStop(1, '#d6c8a8');
  } else {
    grad.addColorStop(0, '#4a4038');
    grad.addColorStop(0.55, '#2a2320');
    grad.addColorStop(1, '#14100c');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);

  // 2b) 黑檀潤光：右下一抹極淡冷色回光，手法同 stone.js 玄石（source-atop，clip 已在字形內）
  if (!piece.white) {
    ctx.globalCompositeOperation = 'source-atop';
    const sheen = ctx.createRadialGradient(
      half + size * 0.14, half + size * 0.18, 0,
      half + size * 0.08, half + size * 0.10, size * 0.5
    );
    sheen.addColorStop(0, 'rgba(96,118,140,0.12)');
    sheen.addColorStop(1, 'rgba(96,118,140,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, s, s);
  }

  // 3) 斜向高光 sweep（實體感比毛玻璃收斂：白子 α 約 0.5、黑子約 0.25）
  ctx.globalCompositeOperation = 'source-atop';
  ctx.save();
  ctx.translate(half, half);
  ctx.rotate(-0.55);
  const hl = ctx.createLinearGradient(-size * 0.55, 0, size * 0.55, 0);
  hl.addColorStop(0.40, 'rgba(255,255,255,0)');
  hl.addColorStop(0.50, piece.white ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)');
  hl.addColorStop(0.60, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  const sprite = { canvas, half, s };
  _pieceSpriteCache.set(key, sprite);
  return sprite;
}

/**
 * 一顆實體材質棋子（象牙白／黑檀黑，不透明）。size = 格邊長。piece = { glyph, white }。
 */
function drawPiece(deps, x, y, size, piece) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return;
  const ctx = deps.ctx;
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

  // 2) glyph 本體：實體材質 sprite（快取命中直接貼，miss 才重建一次）
  const sprite = buildPieceSprite(deps, size, piece);
  ctx.save();
  ctx.shadowColor = 'rgba(30,20,8,0.30)';
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetY = size * 0.04;
  ctx.drawImage(sprite.canvas, x - sprite.half, y - sprite.half, sprite.s, sprite.s);
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
    // 深格上黑子單靠材質漸層不夠跳，故亮邊拉高到 0.45（辨識度紅線：深色格上的黑子要能一眼認出）。
    ctx.lineWidth = Math.max(1.1, size * 0.024);
    ctx.strokeStyle = 'rgba(255,250,235,0.45)';
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

  paintBoardBase(ctx, W, W, { top: '#f4e7c8', mid: '#efe1c0', bottom: '#e2cfa4' });

  const gx0 = gx(deps, 0), gy0 = gy(deps, 0);
  const gw = COLUMNS * cell, gh = ROWS * cell;

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLUMNS; c++) {
    const x = gx(deps, c), y = gy(deps, r);
    ctx.fillStyle = ((r + c) % 2 === 0) ? LIGHT : DARK;
    ctx.fillRect(x, y, cell, cell);
    // 逐格微凸感：頂部一抹極淡受光、底部一抹極淡沉色（成本只在背景快取建立時發生一次）
    const cellTop = ctx.createLinearGradient(x, y, x, y + cell * 0.12);
    cellTop.addColorStop(0, 'rgba(255,255,255,0.05)');
    cellTop.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cellTop;
    ctx.fillRect(x, y, cell, cell * 0.12);
    const cellBottom = ctx.createLinearGradient(x, y + cell * 0.90, x, y + cell);
    cellBottom.addColorStop(0, 'rgba(0,0,0,0)');
    cellBottom.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = cellBottom;
    ctx.fillRect(x, y + cell * 0.90, cell, cell * 0.10);
  }

  // 棋盤整體受光：由棋格區頂到底一道極淡漸層，給全盤統一光照方向（逐格對比不變）
  const boardLight = ctx.createLinearGradient(0, gy0, 0, gy0 + gh);
  boardLight.addColorStop(0, 'rgba(255,250,230,0.07)');
  boardLight.addColorStop(1, 'rgba(70,45,15,0.05)');
  ctx.fillStyle = boardLight;
  ctx.fillRect(gx0, gy0, gw, gh);

  paintWoodGrain(ctx, W, W, { seed: 25, grainColor: 'rgba(70,50,20,0.08)', speckColor: 'rgba(255,244,214,0.08)' });

  ctx.strokeStyle = FRAMELINE; ctx.lineWidth = 2;
  ctx.strokeRect(gx0 - 1, gy0 - 1, gw + 2, gh + 2);

  // 外框 bevel：緊貼外側加上/左細亮線、下/右細暗線，模擬外框微凸邊稜（手法同 board-texture.js paintVignette）
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,244,214,0.35)';
  ctx.beginPath();
  ctx.moveTo(gx0 - 2.75, gy0 + gh + 2.75); ctx.lineTo(gx0 - 2.75, gy0 - 2.75); ctx.lineTo(gx0 + gw + 2.75, gy0 - 2.75);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(58,36,12,0.30)';
  ctx.beginPath();
  ctx.moveTo(gx0 + gw + 2.75, gy0 - 2.75); ctx.lineTo(gx0 + gw + 2.75, gy0 + gh + 2.75); ctx.lineTo(gx0 - 2.75, gy0 + gh + 2.75);
  ctx.stroke();

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
    drawPiece(deps, cx(deps, c), cy(deps, r), cell, piece);
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

  // 浮動（移動中）駒畫最上層：位置每 frame 都在變，直接重畫（sprite 快取仍命中）
  if (view.anim && view.anim.piece) {
    drawPiece(deps, view.anim.x, view.anim.y, cell, view.anim.piece);
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
