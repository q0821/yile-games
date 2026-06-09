// xiangqi-engine.js — Fairy-Stockfish AI 服務（封裝 WASM，UCI 協定）。
//
// 比照 katago-service：lazy-load（進對弈模式才載）、ensureReady 只初始化一次、
// 出錯可 reset 重建。難度用 UCI_Elo（引擎自我降棋力），比限時的難度曲線平滑。
// ⚠️ 多執行緒 build 需頁面 cross-origin isolated（COOP/COEP，見 vite.config.js）。
// 引擎與 ffish 共用 UCI 著法字串，毋須座標轉換。
//
// 多變體：Fairy-Stockfish 同一份 WASM 支援多種棋（xiangqi、shogi…）。bestMove/analyze
// 接 `variant` 參數，每次求手前 `setoption UCI_Variant` + `ucinewgame` 隔離，預設 xiangqi
// 保持象棋相容（將棋傳 'shogi'，見 shogi-engine.js）。單例引擎共用，因每手都重設變體故無污染。

const ENGINE_DIR = '/engine/xiangqi/';

// 難度 → 搜尋設定。
// ⚠️ 不用 UCI_LimitStrength：它降棋力的方式是「在候選著法裡刻意挑次佳手」，
//    而保持攻勢的往往是唯一的最佳手（棄子搶攻、緊著），次佳手多半是安全退守 →
//    結果是「防守穩、進攻軟」。改用『限制搜尋深度的全力引擎』：牠永遠下自己在
//    該深度看得到的最佳手（含攻擊），棋風自然、有企圖心，深度即難度旋鈕。
// 變化性：固定深度的全力引擎是確定性的（同局面永遠同一手）→ 每局雷同。故配
//    MultiPV 取出數個候選，在「距最佳 window 分（centipawn）內」的著法間隨機選一手；
//    window 越大越多變、偶有鬆手但仍主動，越小越接近最佳。困難級 window=0 即純最佳。
const LEVEL_PROFILE = {
  1: { depth: 4,  window: 150, multipv: 4 }, // 簡單：淺算、變化大，主動但偶有鬆手
  2: { depth: 8,  window: 60,  multipv: 3 }, // 普通：俱樂部級，保有先手
  3: { depth: 13, window: 0,   multipv: 1 }, // 困難：全力最佳手
};

let _factoryPromise = null;
let _engine = null;
let _readyPromise = null;
const _waiters = new Set();

/** 動態注入 stockfish.js（UMD 全域 window.Stockfish），只載一次。 */
function loadFactory() {
  if (_factoryPromise) return _factoryPromise;
  _factoryPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Stockfish) return resolve(window.Stockfish);
    const s = document.createElement('script');
    s.src = ENGINE_DIR + 'stockfish.js';
    s.onload = () => (window.Stockfish ? resolve(window.Stockfish) : reject(new Error('Stockfish 全域未定義')));
    s.onerror = () => reject(new Error('載入 stockfish.js 失敗'));
    document.head.appendChild(s);
  }).catch((e) => { _factoryPromise = null; throw e; });
  return _factoryPromise;
}

let _tap = null; // 分析時暫接所有輸出行（收 info 的 score/pv）

function onLine(line) {
  if (_tap) _tap(line);
  for (const w of [..._waiters]) {
    if (w.pred(line)) { _waiters.delete(w); w.resolve(line); }
  }
}

function send(cmd) { _engine.postMessage(cmd); }

function waitFor(pred, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const w = { pred, resolve };
    _waiters.add(w);
    setTimeout(() => { if (_waiters.has(w)) { _waiters.delete(w); reject(new Error('引擎回應逾時')); } }, timeoutMs);
  });
}

/** 載入並初始化引擎（變體設為 xiangqi）。可重複呼叫，只初始化一次。 */
export function ensureReady(onStatus) {
  if (_readyPromise) return _readyPromise;
  _readyPromise = (async () => {
    onStatus?.('AI 載入中…（首次需下載約 1.6MB）');
    const Stockfish = await loadFactory();
    if (typeof self !== 'undefined' && !self.crossOriginIsolated) {
      throw new Error('需 cross-origin isolated（COOP/COEP 標頭）才能載入多執行緒引擎');
    }
    _engine = await Stockfish({ locateFile: (p) => ENGINE_DIR + p });
    _engine.addMessageListener(onLine);
    send('uci');
    await waitFor((l) => l === 'uciok');
    send('isready');                    // 變體於每次 bestMove/analyze 才設（支援多變體共用引擎）
    await waitFor((l) => l === 'readyok');
    return true;
  })().catch((e) => { _readyPromise = null; throw e; });
  return _readyPromise;
}

/** 候選著法的可比較分數（mate 壓過任何 cp，越快將死越高；輪到下的一方視角）。 */
function candScore(c) {
  if (c.mate != null) return c.mate > 0 ? 1e7 - c.mate : -1e7 - c.mate;
  return c.cp == null ? 0 : c.cp;
}

/** 從 MultiPV 候選中，挑「距最佳 window 分內」的著法隨機選一手（window=0 → 純最佳）。 */
function pickFromWindow(cand, window) {
  const list = [...cand.values()].filter((c) => c.move && c.move !== '(none)');
  if (!list.length) return null;
  const best = Math.max(...list.map(candScore));
  const pool = list.filter((c) => candScore(c) >= best - Math.max(0, window));
  return (pool[Math.floor(Math.random() * pool.length)] || list[0]).move;
}

/**
 * 求一手（全力引擎、限深度，依難度保留攻擊性，見 LEVEL_PROFILE 註解）。
 * @param {object} o
 * @param {string} o.fen     目前局面（FEN，由 ffish 提供）
 * @param {number} o.level   1=簡單 2=普通 3=困難（對應搜尋深度與選手窗）
 * @param {number} o.movetimeMs 思考時間安全上限（深度為主，此值防高深度久候）
 * @param {string} o.variant 棋類變體（預設 xiangqi；將棋傳 shogi）
 * @returns {Promise<string|null>} UCI 著法（如 'h2e2'），無手可走回 null
 */
export async function bestMove({ fen, level = 2, movetimeMs = 2000, variant = 'xiangqi' }) {
  await ensureReady();
  const prof = LEVEL_PROFILE[level] ?? LEVEL_PROFILE[2];
  send('setoption name UCI_Variant value ' + variant);
  send('setoption name UCI_LimitStrength value false');     // 全力下牠看得到的最佳手
  send('setoption name MultiPV value ' + prof.multipv);
  send('ucinewgame');
  send('position fen ' + fen);
  send('isready');
  await waitFor((l) => l === 'readyok');

  // 暫接搜尋輸出，逐 multipv 記錄「該分支最深一筆」的首著與分數
  const cand = new Map();
  _tap = (line) => {
    if (line.lastIndexOf('info', 0) !== 0) return;
    const pvM = line.match(/ pv (\S+)/);
    if (!pvM) return;
    const idx = (line.match(/ multipv (\d+)/) || [, '1'])[1];
    const cpM = line.match(/score cp (-?\d+)/);
    const mateM = line.match(/score mate (-?\d+)/);
    cand.set(idx, {
      move: pvM[1],
      cp: cpM ? parseInt(cpM[1], 10) : null,
      mate: mateM ? parseInt(mateM[1], 10) : null,
    });
  };
  send('go depth ' + prof.depth + ' movetime ' + movetimeMs); // 深度為主、movetime 為安全上限
  const line = await waitFor((l) => l.startsWith('bestmove'), movetimeMs + 20000);
  _tap = null;
  const fallback = line.split(/\s+/)[1];                     // 候選收集失敗時的保底
  const mv = pickFromWindow(cand, prof.window) || fallback;
  return (!mv || mv === '(none)') ? null : mv;
}

/**
 * 分析一個局面（滿血、不限棋力），供覆盤評估。
 * @returns {Promise<{cp:number|null, mate:number|null, pv:string[]|null, bestmove:string|null}>}
 *   cp/mate 為「輪到下的一方」視角（正=該方有利）。pv 為最佳變化（UCI 著法陣列）。
 */
export async function analyze({ fen, movetimeMs = 600, variant = 'xiangqi' }) {
  await ensureReady();
  send('setoption name UCI_Variant value ' + variant);
  send('setoption name UCI_LimitStrength value false'); // 分析用全力
  send('setoption name MultiPV value 1');               // 復位：bestMove 可能留下 MultiPV>1，否則會吃到次佳變化
  send('ucinewgame');
  send('position fen ' + fen);
  send('isready');
  await waitFor((l) => l === 'readyok');
  let cp = null, mate = null, pv = null;
  _tap = (line) => {
    if (line.lastIndexOf('info', 0) !== 0) return;
    const mpvM = line.match(/ multipv (\d+)/);
    if (mpvM && mpvM[1] !== '1') return; // 雙重保險：只採最佳分支（multipv 1）
    const pvM = line.match(/ pv (.+)$/);
    if (!pvM) return; // 只採有 pv 的搜尋行（最終最深的會留下）
    const cpM = line.match(/score cp (-?\d+)/);
    const mateM = line.match(/score mate (-?\d+)/);
    // 取該行的分數型別；互斥清掉另一個，避免 cp/mate 並存矛盾（淺層 cp、深層 mate）
    if (cpM) { cp = parseInt(cpM[1], 10); mate = null; }
    else if (mateM) { mate = parseInt(mateM[1], 10); cp = null; }
    pv = pvM[1].trim().split(/\s+/);
  };
  send('go movetime ' + movetimeMs);
  const bmLine = await waitFor((l) => l.startsWith('bestmove'), movetimeMs + 15000);
  _tap = null;
  const bm = bmLine.split(/\s+/)[1];
  return { cp, mate, pv, bestmove: (bm && bm !== '(none)') ? bm : null };
}

/** terminate 引擎並清狀態，讓下次 ensureReady 重建乾淨引擎（出錯後用）。 */
export function reset() {
  try { _engine?.postMessage?.('quit'); } catch { /* 忽略 */ }
  _engine = null;
  _readyPromise = null;
  _waiters.clear();
  _tap = null;
}

export function isReady() { return !!_engine; }
