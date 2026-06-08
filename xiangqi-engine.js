// xiangqi-engine.js — 象棋 AI 服務（封裝 Fairy-Stockfish WASM，UCI 協定）。
//
// 比照 katago-service：lazy-load（進象棋模式才載）、ensureReady 只初始化一次、
// 出錯可 reset 重建。難度用 UCI_Elo（引擎自我降棋力），比限時的難度曲線平滑。
// ⚠️ 多執行緒 build 需頁面 cross-origin isolated（COOP/COEP，見 vite.config.js）。
// 引擎與 ffish 共用 UCI 著法字串，毋須座標轉換。

const ENGINE_DIR = '/engine/xiangqi/';

// 難度 → 目標 Elo（引擎 UCI_Elo 範圍 500–2850）
const ELO_BY_LEVEL = { 1: 800, 2: 1500, 3: 2500 };

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

function onLine(line) {
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
    send('setoption name UCI_Variant value xiangqi');
    send('isready');
    await waitFor((l) => l === 'readyok');
    return true;
  })().catch((e) => { _readyPromise = null; throw e; });
  return _readyPromise;
}

/**
 * 求一手。
 * @param {object} o
 * @param {string} o.fen     目前局面（象棋 FEN，由 ffish 提供）
 * @param {number} o.level   1=簡單 2=普通 3=困難（對應 UCI_Elo）
 * @param {number} o.movetimeMs 思考時間上限
 * @returns {Promise<string|null>} UCI 著法（如 'h2e2'），無手可走回 null
 */
export async function bestMove({ fen, level = 2, movetimeMs = 800 }) {
  await ensureReady();
  const elo = ELO_BY_LEVEL[level] ?? 1500;
  send('setoption name UCI_LimitStrength value true');
  send('setoption name UCI_Elo value ' + elo);
  send('ucinewgame');
  send('position fen ' + fen);
  send('isready');
  await waitFor((l) => l === 'readyok');
  send('go movetime ' + movetimeMs);
  const line = await waitFor((l) => l.startsWith('bestmove'), movetimeMs + 15000);
  const mv = line.split(/\s+/)[1];
  return (!mv || mv === '(none)') ? null : mv;
}

/** terminate 引擎並清狀態，讓下次 ensureReady 重建乾淨引擎（出錯後用）。 */
export function reset() {
  try { _engine?.postMessage?.('quit'); } catch { /* 忽略 */ }
  _engine = null;
  _readyPromise = null;
  _waiters.clear();
}

export function isReady() { return !!_engine; }
