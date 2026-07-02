// board-texture.js — 六棋共用棋盤 procedural 材質（低對比木紋/紙纖維 + 外圍 vignette）。
//
// 純函式：畫到傳入 ctx 的 (0,0,w,h) 區域，供各 *-ui.js 在建立 offscreen 背景快取時呼叫一次
// （見各檔 renderXxxBackground/buildBackground），不在每 frame 重算。使用確定性亂數（同尺寸、
// 同 seed 每次視覺一致），避免動畫或重繪時紋理抖動。

/** 確定性亂數（mulberry32）。 */
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
 * 畫低對比木紋纖維弧線 + 紙纖維斑點，疊在既有底色上（呼叫前需已 fillRect 底色）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {object} [opts]
 * @param {number} [opts.seed] 決定紋理形狀的種子（同尺寸不同棋種可用不同 seed 避免視覺完全相同）
 * @param {string} [opts.grainColor] 纖維線條顏色（含 alpha）
 * @param {string} [opts.speckColor] 紙纖維斑點顏色（含 alpha）
 * @param {number} [opts.density] 纖維密度倍率，預設 1
 */
export function paintWoodGrain(ctx, w, h, opts = {}) {
  const { seed = 1, grainColor = 'rgba(90,68,32,0.10)', speckColor = 'rgba(255,247,225,0.12)', density = 1 } = opts;
  if (!(w > 0) || !(h > 0)) return;
  const rnd = mulberry32(seed);
  ctx.save();
  const lines = Math.max(5, Math.round((h / 24) * density));
  ctx.lineWidth = 1;
  for (let i = 0; i < lines; i++) {
    const y0 = (i + 0.5) * (h / lines) + (rnd() - 0.5) * (h / lines) * 0.35;
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = 0.35 + rnd() * 0.45;
    ctx.beginPath();
    const segs = 6;
    ctx.moveTo(0, y0);
    for (let s = 1; s <= segs; s++) {
      const x = (w * s) / segs;
      const y = y0 + Math.sin(s * 1.7 + seed * 0.7 + i) * (h * 0.008) + (rnd() - 0.5) * (h * 0.012);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 紙纖維／木孔細斑（極低對比小點，密度依面積）
  const specks = Math.min(900, Math.round(w * h * 0.0009 * density));
  ctx.globalAlpha = 1;
  for (let i = 0; i < specks; i++) {
    const x = rnd() * w, y = rnd() * h;
    ctx.fillStyle = rnd() > 0.55 ? grainColor : speckColor;
    ctx.globalAlpha = 0.05 + rnd() * 0.08;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

/**
 * 外圍柔和 vignette（角落微暗，營造實木棋盤置於桌面的立體感）。低對比，不影響棋子辨識度。
 */
export function paintVignette(ctx, w, h, opts = {}) {
  const { color = 'rgba(32,20,8,0.22)', innerRatio = 0.34, outerRatio = 0.74 } = opts;
  if (!(w > 0) || !(h > 0)) return;
  const cx = w / 2, cy = h / 2;
  const r0 = Math.min(w, h) * innerRatio;
  const r1 = Math.max(w, h) * outerRatio;
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
