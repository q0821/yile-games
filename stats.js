/**
 * 對電腦（pvc）累計戰績記錄。與死活進度（tsumego-progress.js）分開存。
 *
 * 純函式 reducer（recordGame / totals / formatRecord）不碰 localStorage，方便測試；
 * loadStats() / saveStats() 是薄薄的 I/O 包裝。
 *
 * 只記錄 pvc（人機對弈）的結果；pvp（同機雙人）不呼叫 recordGame，由呼叫端自行判斷。
 *
 * 資料結構：
 *   {
 *     [gameId]: {                     // 'go'|'gomoku'|'connect6'|'othello'|'xiangqi'|'shogi'|'chess'
 *       [difficultyKey]: { w, l, d }  // 難度字串（各棋自報，見下），值為累計局數
 *     }
 *   }
 *
 * difficultyKey 慣例：
 *   圍棋 'L1'–'L13'；其餘六棋 'L1'–'L3'（皆取「終局當下」實際等級，
 *   象棋/西洋棋自動難度模式取自適應階梯當下等級，不是設定頁的手動值）。
 *   difficulty 未提供／空字串時記入 'unknown'（容錯，理論上不應發生）。
 *
 * 呼叫端契約：只在「終局發生的那一刻」呼叫一次 recordGame → saveStats（單次記錄保證）——
 *   象棋/將棋/西洋棋掛 onGameOver()；圍棋掛 main.js 的 endGame()（含認輸/數子/中盤勝）；
 *   五子棋/連六/黑白棋掛終局音效觸發點。三者皆保證單次觸發，覆盤重顯結束卡不會重播。
 *   嚴禁掛在 showEnd()（它會被覆盤流程重複呼叫，導致重複計數）。
 *
 * outcome 一律是「人類視角」的 'win' | 'loss' | 'draw'；其他值視為非法，
 * recordGame 會原樣（同一參考）回傳傳入的 stats，不記錄也不拋錯。
 */
export const STATS_KEY = 'gogame_stats';

export function emptyStats() {
  return {};
}

function normalizeRecord(entry) {
  return entry ? { w: entry.w || 0, l: entry.l || 0, d: entry.d || 0 } : { w: 0, l: 0, d: 0 };
}

/**
 * 記錄一局結果，回傳新的 stats（不可變更新；原 stats 不被修改）。
 * outcome：人類視角 'win' | 'loss' | 'draw'；其他值原樣回傳 stats（防禦性忽略，不記錄）。
 * difficulty：字串；空字串／undefined 記入 'unknown'。
 */
export function recordGame(stats, gameId, difficulty, outcome) {
  if (outcome !== 'win' && outcome !== 'loss' && outcome !== 'draw') return stats;

  const key = difficulty || 'unknown';
  const next = { ...stats };
  const game = { ...(next[gameId] || {}) };
  const rec = normalizeRecord(game[key]);

  if (outcome === 'win') rec.w += 1;
  else if (outcome === 'loss') rec.l += 1;
  else rec.d += 1;

  game[key] = rec;
  next[gameId] = game;
  return next;
}

/** 某棋種跨難度累計 { w, l, d }；查無棋種回全 0。 */
export function totals(stats, gameId) {
  const game = stats && stats[gameId];
  const result = { w: 0, l: 0, d: 0 };
  if (!game) return result;
  for (const key of Object.keys(game)) {
    const rec = game[key] || {};
    result.w += rec.w || 0;
    result.l += rec.l || 0;
    result.d += rec.d || 0;
  }
  return result;
}

/**
 * 顯示字串：「對電腦累計 12 勝 8 敗 1 和」；為 0 的項省略（如「對電腦累計 3 勝」）；
 * 全 0（不該被呼叫到，防禦）回空字串。
 */
export function formatRecord(totalsObj) {
  const { w, l, d } = totalsObj || {};
  const parts = [];
  if (w) parts.push(`${w} 勝`);
  if (l) parts.push(`${l} 敗`);
  if (d) parts.push(`${d} 和`);
  if (!parts.length) return '';
  return `對電腦累計 ${parts.join(' ')}`;
}

// ——— localStorage I/O（瀏覽器端） ———

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return emptyStats();
  } catch (_) {
    return emptyStats();
  }
}

export function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (_) { /* 無痕模式等寫入失敗就忽略 */ }
}

export const GameStats = {
  STATS_KEY, emptyStats, recordGame, totals, formatRecord, loadStats, saveStats
};
