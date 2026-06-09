// go-settings.js — 圍棋遊戲設定 modal 開關（取代舊的滑出式 sidebar）。
//
// 設定（棋盤大小／規則／讓子／計時／開關…）收進 #goSettingsModal，對弈功能列另在盤下永遠可見。
const MODAL_ID = 'goSettingsModal';

export function openGoSettings() {
  document.getElementById(MODAL_ID)?.classList.add('show');
}

export function closeGoSettings() {
  document.getElementById(MODAL_ID)?.classList.remove('show');
}

export function toggleGoSettings() {
  document.getElementById(MODAL_ID)?.classList.toggle('show');
}
