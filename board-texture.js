// board-texture.js — 六棋共用棋盤 procedural 材質（榧木色底 + 多層木紋 + 光影/vignette）。
//
// 純函式：畫到傳入 ctx 的 (0,0,w,h) 區域，供各 *-ui.js 在建立 offscreen 背景快取時呼叫一次
// （見各檔 renderXxxBackground/buildBackground），不在每 frame 重算。使用確定性亂數（同尺寸、
// 同 seed 每次視覺一致），避免動畫或重繪時紋理抖動。
//
// 疊層順序（呼叫端）：paintBoardBase → paintWoodGrain → 格線/星位/座標 → paintVignette
// （paintVignette 內含頂部斜射光、底部沉色與內緣 bevel，格線畫完再疊不會被洗淡——各層 alpha 皆極低）。

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
 * 榧木色底：垂直三段暖漸層（頂部受光較亮、底部沉穩），取代單色 fillRect。
 * othello 等想要不同色調的棋種可傳自訂 stops。
 */
export function paintBoardBase(ctx, w, h, opts = {}) {
  const { top = '#e9c478', mid = '#deb161', bottom = '#cd9d4c' } = opts;
  if (!(w > 0) || !(h > 0)) return;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * 多層木紋：寬幅明暗色帶（木板深淺變化）＋ 長纖維走線 ＋ 細纖維弧線 ＋ 木孔斑點。
 * 全部低對比，疊在 paintBoardBase（或任何底色）之上。
 * @param {object} [opts]
 * @param {number} [opts.seed]        紋理形狀種子（不同棋種用不同 seed 避免視覺完全相同）
 * @param {string} [opts.grainColor]  纖維線條顏色（含 alpha）
 * @param {string} [opts.speckColor]  木孔斑點顏色（含 alpha）
 * @param {number} [opts.density]     纖維密度倍率，預設 1
 */
export function paintWoodGrain(ctx, w, h, opts = {}) {
  const { seed = 1, grainColor = 'rgba(90,68,32,0.10)', speckColor = 'rgba(255,247,225,0.12)', density = 1 } = opts;
  if (!(w > 0) || !(h > 0)) return;
  const rnd = mulberry32(seed);
  ctx.save();

  // 0) 寬幅明暗色帶：模擬木板不同部位的深淺，給底色呼吸感（上下羽化的水平帶）
  const bands = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < bands; i++) {
    const yB = h * ((i + rnd() * 0.6) / bands);
    const bh = (h / bands) * (0.7 + rnd() * 0.7);
    const dark = rnd() > 0.5;
    const a = 0.025 + rnd() * 0.03;
    const col = dark ? `rgba(122,86,38,${a.toFixed(3)})` : `rgba(255,238,196,${a.toFixed(3)})`;
    const bg = ctx.createLinearGradient(0, yB, 0, yB + bh);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(0.5, col);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, yB, w, bh);
  }

  // 0.5) 長纖維走線：貫穿整寬的緩弧，粗細/深淺不一（木紋的「主線條」）
  const streaks = Math.max(6, Math.round((h / 60) * density));
  for (let i = 0; i < streaks; i++) {
    const y0 = rnd() * h;
    const amp = h * (0.004 + rnd() * 0.012);
    const cpY = y0 + (rnd() - 0.5) * amp * 6;
    ctx.strokeStyle = `rgba(104,74,32,${(0.03 + rnd() * 0.045).toFixed(3)})`;
    ctx.lineWidth = 0.7 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.quadraticCurveTo(w * (0.3 + rnd() * 0.4), cpY, w, y0 + (rnd() - 0.5) * amp * 4);
    ctx.stroke();
  }

  // 1) 細纖維弧線（原有層，保留：短波動的密集細線）
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

  // 2) 紙纖維／木孔細斑（極低對比小點，密度依面積）
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
 * 環境光影收尾層：頂部斜射光 + 底部沉色 + 內緣 bevel + 外圍柔和 vignette。
 * 低對比，不影響棋子與格線辨識度。呼叫端維持原本「最後呼叫 paintVignette」的慣例即可。
 */
export function paintVignette(ctx, w, h, opts = {}) {
  const { color = 'rgba(32,20,8,0.22)', innerRatio = 0.34, outerRatio = 0.74 } = opts;
  if (!(w > 0) || !(h > 0)) return;
  ctx.save();

  // a) 頂部斜射光：像有一盞暖燈從上前方打下來
  const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sheen.addColorStop(0, 'rgba(255,248,224,0.10)');
  sheen.addColorStop(1, 'rgba(255,248,224,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h * 0.55);

  // b) 底部沉色：下緣略暗，增加盤面厚重感
  const sink = ctx.createLinearGradient(0, h * 0.6, 0, h);
  sink.addColorStop(0, 'rgba(70,44,16,0)');
  sink.addColorStop(1, 'rgba(70,44,16,0.10)');
  ctx.fillStyle = sink;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  // c) 內緣 bevel：上/左受光細亮線、下/右背光細暗線（模擬盤面微凸的邊稜）
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,244,214,0.20)';
  ctx.beginPath();
  ctx.moveTo(0.75, h - 0.75); ctx.lineTo(0.75, 0.75); ctx.lineTo(w - 0.75, 0.75);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(58,36,12,0.24)';
  ctx.beginPath();
  ctx.moveTo(w - 0.75, 0.75); ctx.lineTo(w - 0.75, h - 0.75); ctx.lineTo(0.75, h - 0.75);
  ctx.stroke();

  // d) 外圍柔和 vignette（角落微暗，營造實木棋盤置於桌面的立體感）
  const cx = w / 2, cy = h / 2;
  const r0 = Math.min(w, h) * innerRatio;
  const r1 = Math.max(w, h) * outerRatio;
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
