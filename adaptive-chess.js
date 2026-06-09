// adaptive-chess.js — 象棋／將棋／西洋棋共用的難度等級表與自適應升降（連勝連敗階梯）。
//
// 設計（使用者拍板）：
//  - 連續等級 1..MAX_LEVEL，取代內部「簡單/普通/困難」三段；手動下拉仍在，映射到固定等級
//    （MANUAL_TO_LEVEL），自動模式則讓等級在 1..MAX 之間浮動。
//  - 自動：電腦連敗 STREAK_TO_CHANGE 盤 → 升一級；連勝 STREAK_TO_CHANGE 盤 → 降一級；
//    和棋或一勝一負 → 連續計數歸零、等級不動（避免單盤僥倖造成抖動）。
//  - 弱化沿用 Fairy-Stockfish：限搜尋深度（depth）＋ MultiPV 在「距最佳 window centipawn」內
//    隨機挑一手（見 xiangqi-engine.js 的 bestMove / pickFromWindow）。
//  - 純邏輯、無 DOM，可單元測試。
//
// 等級表：depth 越高越強；window 越大越笨（容許離最佳手越遠）；multipv 為候選手數（≥窗需要的量）。
// 錨點：L2≈舊「簡單」(d4/w150)、L5≈舊「普通」(d8/w60)、L9≈舊「困難」(d13/w0)，保留任務 1 驗過的手感。
const LEVELS = [
  { depth: 3,  window: 200, multipv: 5 },
  { depth: 4,  window: 150, multipv: 4 }, // ≈ 簡單
  { depth: 5,  window: 110, multipv: 4 },
  { depth: 6,  window: 85,  multipv: 3 },
  { depth: 8,  window: 60,  multipv: 3 }, // ≈ 普通
  { depth: 9,  window: 45,  multipv: 3 },
  { depth: 10, window: 30,  multipv: 2 },
  { depth: 11, window: 15,  multipv: 2 },
  { depth: 13, window: 0,   multipv: 1 }, // ≈ 困難
  { depth: 16, window: 0,   multipv: 1 },
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = LEVELS.length;
export const DEFAULT_LEVEL = 3;       // 自動模式起始等級（不會太弱、仍有往上空間）

// 手動下拉「簡單(1)/普通(2)/困難(3)」→ 連續等級。
export const MANUAL_TO_LEVEL = { 1: 2, 2: 5, 3: 9 };

const STREAK_TO_CHANGE = 2;           // 連勝／連敗幾盤才升降

/** 夾到合法等級範圍。 */
export function clampLevel(level) {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level | 0));
}

/** 某等級的引擎搜尋設定（depth/window/multipv）。 */
export function levelConfig(level) {
  return LEVELS[clampLevel(level) - 1];
}

/** 等級文字，例如「第 3 級」。 */
export function levelLabel(level) {
  return `第 ${clampLevel(level)} 級`;
}

/**
 * 依對局結果與目前連勝/連敗計數，算新等級與新計數。
 * @param {number} level   目前等級
 * @param {number} streak  連續計數：>0 = 電腦連敗（朝升級）、<0 = 電腦連勝（朝降級）
 * @param {'ai-lost'|'ai-won'|'draw'} outcome  ai-lost = 玩家贏、ai-won = 玩家輸
 * @returns {{ level:number, streak:number, change:'up'|'down'|'same' }}
 */
export function nextLevel(level, streak, outcome) {
  const cur = clampLevel(level);
  if (outcome === 'draw') return { level: cur, streak: 0, change: 'same' };
  const dir = outcome === 'ai-lost' ? 1 : -1;                 // ai 輸→朝升、ai 贏→朝降
  let s = (Math.sign(streak) === dir) ? streak + dir : dir;   // 同向累加、反向則從這次重新起算
  if (s >= STREAK_TO_CHANGE && cur < MAX_LEVEL) return { level: cur + 1, streak: 0, change: 'up' };
  if (s <= -STREAK_TO_CHANGE && cur > MIN_LEVEL) return { level: cur - 1, streak: 0, change: 'down' };
  // 已達等級邊界：計數封頂、等級不動（持續贏/輸也不會溢位）
  s = Math.max(-STREAK_TO_CHANGE, Math.min(STREAK_TO_CHANGE, s));
  return { level: cur, streak: s, change: 'same' };
}
