// stone.js — 共用棋子（石頭）繪製：柔邊投影 + 三段暖漸層 + 左上高光弧 + 材質細節。
//
// 圍棋、五子棋、連六棋、黑白棋、死活共用同一份視覺（單一來源；改這裡全部一起變）。
// 純像素介面：(ctx, x, y, r, black)，x,y = 圓心像素、r = 半徑、black = 是否黑子。
// 死子 X、最後手標記、hover 半透明等由各 UI 自行疊加（呼叫端設 globalAlpha/縮放後再呼叫此函式）。
//
// 材質細節（白子蛤紋、黑子玄石潤光）以棋子「位置」為種子做確定性變化：同一顆子每 frame
// 長一樣（動畫重繪不抖動），不同位置的子彼此略有差異（像真的一盒棋子）。

/** 以座標算 0..1 的確定性雜湊（經典 sin-hash；只求視覺變化，不求統計品質）。 */
function posHash(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * 畫一顆立體棋子。座標/半徑非有限值時跳過（避免 createRadialGradient 收到 NaN 拋例外）。
 * @param {number} [alpha] 全域透明度（0-1），供落子 scale-in / 提子淡出動畫套用，預設 1（不影響既有呼叫端）。
 */
export function drawStonePixel(ctx, x, y, r, black, alpha = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) return;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
  // 1) 柔邊投影（只在實心填色時開 shadow，畫完即關，避免漸層/高光被糊掉）
  ctx.save();
  ctx.shadowColor = 'rgba(40,28,12,0.40)';
  ctx.shadowBlur = r * 0.45;
  ctx.shadowOffsetY = r * 0.24;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = black ? '#2b2b30' : '#efe6d2';
  ctx.fill();
  ctx.restore();
  // 2) 凸面三段漸層（左上亮 → 右下暗；白子用象牙暖白貼合宣紙底）
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.15, x, y, r);
  if (black) { g.addColorStop(0, '#6d6d76'); g.addColorStop(0.5, '#33333a'); g.addColorStop(1, '#121214'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f3ead4'); g.addColorStop(1, '#d6c8a8'); }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();

  // 2.5) 材質細節（裁到棋子圓內，不外溢）
  const ph = posHash(x, y);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (black) {
    // 玄石潤光：右下一抹極淡的冷色回光，讓黑子有「濕潤石頭」的深度
    const sheen = ctx.createRadialGradient(x + r * 0.35, y + r * 0.4, r * 0.1, x + r * 0.2, y + r * 0.25, r * 1.05);
    sheen.addColorStop(0, `rgba(96,118,140,${0.10 + ph * 0.05})`);
    sheen.addColorStop(1, 'rgba(96,118,140,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  } else {
    // 蛤碁石細條紋：以棋子左外側為圓心的 2–3 道同心弧（每顆子相位略異）
    const cxs = x - r * (1.5 + ph * 0.5);
    const cys = y + r * (ph - 0.5) * 0.8;
    const arcs = 2 + (ph > 0.5 ? 1 : 0);
    for (let i = 0; i < arcs; i++) {
      const rr = r * (1.75 + i * 0.42 + ph * 0.25);
      ctx.beginPath();
      ctx.arc(cxs, cys, rr, -0.7, 0.7);
      ctx.lineWidth = r * (0.05 + (i % 2) * 0.03);
      ctx.strokeStyle = `rgba(196,176,138,${(0.10 + ph * 0.05).toFixed(3)})`;
      ctx.stroke();
    }
  }
  ctx.restore();

  // 3) 左上高光弧（凸面光澤）
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.2, r * 0.6, Math.PI * 1.05, Math.PI * 1.6);
  ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.strokeStyle = black ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.7)';
  ctx.stroke(); ctx.lineCap = 'butt';
  // 4) 底緣柔和反光（極低對比，加深凸面厚度感，幅度小不影響辨識度）
  ctx.beginPath();
  ctx.arc(x + r * 0.12, y + r * 0.32, r * 0.5, Math.PI * 0.15, Math.PI * 0.55);
  ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
  ctx.strokeStyle = black ? 'rgba(255,255,255,0.09)' : 'rgba(120,90,40,0.10)';
  ctx.stroke(); ctx.lineCap = 'butt';
  ctx.restore();
}
