// canvas-dpr.js — HiDPI（Retina）canvas 共用設定。
//
// 問題根因：canvas 內部解析度若等於 CSS 像素，在 2x/3x 螢幕上會被放大顯示 → 棋盤模糊。
// 解法：內部解析度乘上 devicePixelRatio（上限 2：3x 螢幕人眼已難辨差異，省記憶體與功耗，
// 與 chess/shogi/xiangqi UI 既有做法一致），CSS 尺寸維持邏輯像素，繪圖端以
// setTransform(dpr) 讓所有繪圖與點擊座標計算留在 CSS 像素座標系——呼叫端邏輯完全不變。

export function hidpiScale() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

/** 設定 canvas 為 HiDPI：內部尺寸 × dpr、CSS 尺寸維持邏輯像素。回傳 dpr 供繪圖端 setTransform。 */
export function setupHiDPICanvas(canvas, cssW, cssH) {
  const dpr = hidpiScale();
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  return dpr;
}

/** 建 HiDPI offscreen canvas（背景快取用）：ctx 已 scale(dpr)，可直接用 CSS 座標作畫。 */
export function makeHiDPIOffscreen(cssW, cssH) {
  const dpr = hidpiScale();
  const off = document.createElement('canvas');
  off.width = Math.round(cssW * dpr);
  off.height = Math.round(cssH * dpr);
  const ctx = off.getContext('2d');
  ctx.scale(dpr, dpr);
  return { off, ctx };
}
