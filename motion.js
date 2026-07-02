// motion.js — 共用「降低動態效果」判斷（prefers-reduced-motion）。
//
// 六棋各自的落子/翻子/滑動動畫、棋盤材質的 vignette 呼吸等效果，皆應在使用者
// 開啟系統「減少動態效果」時直接跳過動畫、呈現終態。單一來源避免各檔各自 query。
export function prefersReducedMotion() {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}
