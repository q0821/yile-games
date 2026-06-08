// 毛筆標題圖的 base64 data URI（避免外部請求被 CDN 快取成 HTML）。
// 2026-06-08 暫時清空：品牌改名為「弈樂」、標題改用思源宋體文字呈現。
// 待用 gpt 生成「弈樂」毛筆書法圖後，放 public/img/title-ink.webp 並重跑
// scripts/inline-title.sh 重新內嵌，即可恢復水墨揭示動畫（ink-fx.js 偵測非空字串才播放）。
export const TITLE_DATA_URI = '';
