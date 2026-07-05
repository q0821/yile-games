// piece-texture.js — 象棋／將棋共用棋子材質：陰刻字（letterpress）＋ 棋面木紋。
//
// 象棋（xiangqi-ui.js）、將棋（shogi-ui.js）棋子外形不同（圓面 vs 楔形），但字的刻痕畫法與
// 木紋疊層邏輯共用同一份實作，避免兩邊各自維護一套視覺（見 stone.js／board-texture.js 的既有
// 分拆慣例）。純函式：不持狀態、不碰 DOM（除了呼叫端傳入的 ctx），呼叫端自行負責：
//   - clip 到棋子形狀（圓／楔形）再呼叫 paintPieceGrain，避免木紋線條外溢。
//   - 將棋駒已 translate 到駒中心的局部座標（(0,0) 為中心）；象棋維持棋盤絕對座標。
//
// 材質以「位置」為種子做確定性變化（沿用 stone.js 的 posHash 精神）：同一顆棋子每 frame 長
// 一樣（重繪不抖動），不同位置的子彼此略有差異。

/** 以座標算 0..1 的確定性雜湊（經典 sin-hash，與 stone.js 的 posHash 同式）。 */
export function posHash01(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 確定性亂數（mulberry32，同 board-texture.js 的實作；本模組獨立一份避免跨檔耦合）。 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 陰刻（雕刻凹陷）文字。光源假設在上：凹痕下緣受光留一道亮邊、上緣積影加深，
 * 主字置中疊在最上層。偏移幅度刻意壓在 ±5% 字高內——辨識度優先，不用 shadowBlur
 * （效能與清晰度都比陰影模糊好）。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} char       要畫的單一漢字
 * @param {number} x          文字中心 x（呼叫端座標系）
 * @param {number} y          文字中心 y
 * @param {number} fontPx     字級（px）
 * @param {object} [opts]
 * @param {string} opts.ink          主字顏色（必填）
 * @param {string} [opts.font]       完整 font-family 字串（呼叫端傳各自的 SERIF stack）
 * @param {number} [opts.weight]     字重，預設 700
 * @param {string} [opts.lightColor] 亮邊顏色，預設 'rgba(255,255,255,0.30)'
 * @param {string} [opts.shadowColor] 刻痕陰影顏色，預設 'rgba(0,0,0,0.28)'
 */
export function engraveText(ctx, char, x, y, fontPx, opts = {}) {
  // 防護：座標/字級非有限值或字級非正時跳過（同 repo 既有 NaN 防護慣例）
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fontPx) || fontPx <= 0) return;
  const {
    ink,
    font,
    weight = 700,
    lightColor = 'rgba(255,255,255,0.30)',
    shadowColor = 'rgba(0,0,0,0.28)',
  } = opts;
  // 防護：ink 未傳時不畫——否則主字會靜默沿用呼叫前殘留的 fillStyle，顏色不可預期
  if (!ink) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${Math.round(fontPx)}px ${font}`;
  // 1) 亮邊：向下偏移一點點，模擬凹痕下緣被上方光源掃到的反光
  ctx.fillStyle = lightColor;
  ctx.fillText(char, x, y + fontPx * 0.045);
  // 2) 刻痕加深：向上偏移，模擬凹痕上緣積影
  ctx.fillStyle = shadowColor;
  ctx.fillText(char, x, y - fontPx * 0.03);
  // 3) 主字：置中疊在最上層
  ctx.fillStyle = ink;
  ctx.fillText(char, x, y);
  ctx.restore();
}

/** 象棋圓面年輪：2–3 道以「圓外某點」為圓心的同心弧（手法同 stone.js 蛤紋）。 */
function paintRingGrain(ctx, seed, dims) {
  const { x, y, r } = dims;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) return;
  const rnd = mulberry32(Math.floor(seed * 1e4) >>> 0);
  const cx = x - r * (1.6 + seed * 0.5);
  const cy = y + r * (seed - 0.5) * 0.6;
  const arcs = 2 + (rnd() > 0.5 ? 1 : 0);
  for (let i = 0; i < arcs; i++) {
    const rr = r * (1.9 + i * 0.45 + rnd() * 0.3);
    const spread = 0.55 + rnd() * 0.1;
    const a = 0.05 + rnd() * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, -spread, spread);
    ctx.lineWidth = r * (0.05 + rnd() * 0.04);
    ctx.strokeStyle = `rgba(120,88,40,${a.toFixed(3)})`;
    ctx.stroke();
  }
}

/** 將棋黃楊直紋：3–5 條由 −h 到 +h 的縱向緩弧細線。 */
function paintStraightGrain(ctx, seed, dims) {
  const { w, h } = dims;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
  const rnd = mulberry32(Math.floor(seed * 1e4) >>> 0);
  const lines = 3 + Math.floor(rnd() * 3); // 3..5
  for (let i = 0; i < lines; i++) {
    const x0 = -w * 0.7 + ((i + rnd() * 0.6) * (w * 1.4)) / lines;
    const bow = w * (0.06 + rnd() * 0.1) * (rnd() > 0.5 ? 1 : -1);
    const a = 0.04 + rnd() * 0.04;
    ctx.beginPath();
    ctx.moveTo(x0, -h);
    ctx.quadraticCurveTo(x0 + bow, 0, x0 - bow * 0.4, h);
    ctx.lineWidth = 0.6 + rnd() * 0.5;
    ctx.strokeStyle = `rgba(120,88,40,${a.toFixed(3)})`;
    ctx.stroke();
  }
}

/**
 * 棋面木紋。呼叫端負責 clip 到棋子形狀（並在將棋case translate 到局部座標）——本函式只管畫線，
 * 不做 clip 也不管座標系轉換。完全確定性：同 seed 同 dims 每次畫完全相同（禁止 Math.random）。
 * 低對比（α 上限見各分支），疊上去不影響 engraveText 的字辨識度。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {'ring'|'straight'} kind
 * @param {number} seed  0..1 的確定性種子（通常傳 posHash01(x,y) 的結果）
 * @param {object} dims
 *   kind==='ring'：{x,y,r} 絕對座標圓心與半徑。
 *   kind==='straight'：{w,h} 局部座標（中心 (0,0)）的半寬/半高。
 */
export function paintPieceGrain(ctx, kind, seed, dims) {
  if (!Number.isFinite(seed)) return;
  const d = dims || {};
  ctx.save();
  if (kind === 'ring') paintRingGrain(ctx, seed, d);
  else if (kind === 'straight') paintStraightGrain(ctx, seed, d);
  ctx.restore();
}
