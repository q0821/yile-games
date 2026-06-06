// adaptive-difficulty.js — 對弈自適應難度（階梯式進度指標）。
//
// 設計（使用者拍板）：
//  - 依「贏幾目」升降：贏夠多才升、小贏原地、輸了原地或小降（階梯式、傾向往上爬）。
//  - 明示告知升降。
//  - 直接取代舊的初/中/高三段，改成連續等級。
//  - 低等級用「隨機弱化」（故意挑差一點的手）讓 KataGo 真的變弱，否則它太強、低階升不上去。
//  - 每級附「約業餘級位」估計（標示為估計，非正式定級）。
//
// 純邏輯、無 DOM，可單元測試。

// 等級表：level 1..N。
//  visits：KataGo 搜尋量（越高越強）。
//  maxPointsLost：選手時容許「比最佳手差幾目」的上限（越大＝越笨；0＝只選最佳手）。
//    引擎候選手有 pointsLost 欄位，挑「pointsLost <= maxPointsLost」中隨機一手 → 真・弱化。
//  kyu：約當業餘級位（估計值，僅供參考）。級位數字越小越強（1 級 > 30 級）。
const LEVELS = [
  { level: 1,  visits: 2,   maxPointsLost: 14, kyu: 25 },
  { level: 2,  visits: 2,   maxPointsLost: 11, kyu: 22 },
  { level: 3,  visits: 4,   maxPointsLost: 9,  kyu: 19 },
  { level: 4,  visits: 4,   maxPointsLost: 7,  kyu: 16 },
  { level: 5,  visits: 8,   maxPointsLost: 5,  kyu: 13 },
  { level: 6,  visits: 8,   maxPointsLost: 4,  kyu: 11 },
  { level: 7,  visits: 16,  maxPointsLost: 3,  kyu: 9 },
  { level: 8,  visits: 24,  maxPointsLost: 2,  kyu: 7 },
  { level: 9,  visits: 32,  maxPointsLost: 1.5, kyu: 5 },
  { level: 10, visits: 48,  maxPointsLost: 1,  kyu: 4 },
  { level: 11, visits: 64,  maxPointsLost: 0.6, kyu: 3 },
  { level: 12, visits: 96,  maxPointsLost: 0.3, kyu: 2 },
  { level: 13, visits: 160, maxPointsLost: 0,  kyu: 1 },
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = LEVELS.length;

/** 取得某等級的設定（會夾在合法範圍內）。 */
export function levelConfig(level) {
  const i = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level | 0)) - 1;
  return LEVELS[i];
}

/** 約業餘級位文字，例如「約 13 級」。 */
export function kyuLabel(level) {
  return `約 ${levelConfig(level).kyu} 級`;
}

// 升降門檻（以「我方贏幾目」judge；margin = 我贏的目數，負=我輸的目數）。
const PROMOTE_MARGIN = 10;  // 贏 >= 10 目 → 升一級（游刃有餘）
const DEMOTE_MARGIN  = -20; // 輸 >= 20 目 → 降一級（階梯式：要輸很多才降）

/**
 * 依對局結果算新等級。
 * @param {number} level   目前等級
 * @param {number} margin  人類視角的勝負目數（>0 我贏 N 目、<0 我輸 N 目）
 * @returns {{ level:number, change:'up'|'down'|'same' }}
 */
export function nextLevel(level, margin) {
  const cur = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level | 0));
  if (margin >= PROMOTE_MARGIN && cur < MAX_LEVEL) return { level: cur + 1, change: 'up' };
  if (margin <= DEMOTE_MARGIN && cur > MIN_LEVEL) return { level: cur - 1, change: 'down' };
  return { level: cur, change: 'same' };
}

/**
 * 從 KataGo 候選手中，依等級挑一手（含隨機弱化）。
 * @param {Array<{x,y,pointsLost,order}>} moves  引擎候選手（本專案座標 x=row,y=col）
 * @param {number} level
 * @param {() => number} rng  隨機源（預設 Math.random），測試可注入
 * @returns {{x:number,y:number}|null}
 */
export function pickMove(moves, level, rng = Math.random) {
  if (!moves || !moves.length) return null;
  const cfg = levelConfig(level);
  // 候選：pointsLost 在容許範圍內的手（pointsLost 可能為 undefined → 視為 0=最佳手）
  const pool = moves.filter((m) => (m.pointsLost ?? 0) <= cfg.maxPointsLost);
  const cand = pool.length ? pool : [moves.find((m) => m.order === 0) || moves[0]];
  return cand[Math.floor(rng() * cand.length)] || cand[0];
}
