// stone.js — 共用棋子（石頭）繪製：柔邊投影 + 三段暖漸層 + 左上高光弧。
//
// 圍棋、五子棋、黑白棋共用同一份視覺（單一來源；改這裡三邊一起變）。
// 純像素介面：(ctx, x, y, r, black)，x,y = 圓心像素、r = 半徑、black = 是否黑子。
// 死子 X、最後手標記、hover 半透明等由各 UI 自行疊加（呼叫端設 globalAlpha/縮放後再呼叫此函式）。

/** 畫一顆立體棋子。座標/半徑非有限值時跳過（避免 createRadialGradient 收到 NaN 拋例外）。 */
export function drawStonePixel(ctx, x, y, r, black) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) return;
  // 1) 柔邊投影（只在實心填色時開 shadow，畫完即關，避免漸層/高光被糊掉）
  ctx.save();
  ctx.shadowColor = 'rgba(40,28,12,0.4)';
  ctx.shadowBlur = r * 0.34;
  ctx.shadowOffsetY = r * 0.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = black ? '#2b2b30' : '#efe6d2';
  ctx.fill();
  ctx.restore();
  // 2) 凸面三段漸層（左上亮 → 右下暗；白子用象牙暖白貼合宣紙底）
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.15, x, y, r);
  if (black) { g.addColorStop(0, '#6a6a72'); g.addColorStop(0.5, '#34343a'); g.addColorStop(1, '#161618'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f3ead4'); g.addColorStop(1, '#d8cbac'); }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  // 3) 左上高光弧（凸面光澤）
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.2, r * 0.6, Math.PI * 1.05, Math.PI * 1.6);
  ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.strokeStyle = black ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.65)';
  ctx.stroke(); ctx.lineCap = 'butt';
}
