// xiangqi-spike.js — 象棋 AI spike：驗證 Fairy-Stockfish WASM 在瀏覽器能載入、
// 設成象棋變體、回傳合法手，並用「思考時間」slider 當難度旋鈕。棋盤先不接。
//
// 引擎：fairy-stockfish-nnue.wasm v1.1.11（GPL-3，vendored 於 /engine/xiangqi/）。
// 載入方式：HTML 先用 <script> 引入 stockfish.js → 全域 Stockfish 工廠；本檔負責 UCI 流程。
// ⚠️ 該 build 是 pthread 多執行緒版，需頁面 cross-origin isolated（COOP+COEP，見 vite.config.js）。
//    未載入 NNUE → 用古典評估，棋力偏弱但「回合法手」這件事不受影響，足以驗證可行性。

const ENGINE_DIR = '/engine/xiangqi/';

let engine = null;          // Emscripten module instance
let ready = false;          // 是否已完成 uci + isready 初始化
const waiters = new Set();  // 等待特定輸出行的 predicate→resolve

// ——— DOM ———
const $ = (id) => document.getElementById(id);
const out = () => $('out');

function log(line, dir = '') {
  const el = out();
  const prefix = dir === 'in' ? '« ' : dir === 'out' ? '» ' : '  ';
  el.textContent += prefix + line + '\n';
  el.scrollTop = el.scrollHeight;
}

// ——— 引擎輸出分流：每行同時餵給所有等待者 + log ———
function onEngineLine(line) {
  log(line, 'in');
  for (const w of [...waiters]) {
    if (w.predicate(line)) { waiters.delete(w); w.resolve(line); }
  }
}

function send(cmd) {
  log(cmd, 'out');
  engine.postMessage(cmd);
}

/** 等待第一行符合 predicate 的引擎輸出。 */
function waitFor(predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const w = { predicate, resolve };
    waiters.add(w);
    setTimeout(() => {
      if (waiters.has(w)) { waiters.delete(w); reject(new Error('等待引擎輸出逾時')); }
    }, timeoutMs);
  });
}

// ——— 初始化（只跑一次）———
async function ensureReady() {
  if (ready) return;
  if (!engine) {
    if (typeof Stockfish !== 'function') throw new Error('Stockfish 工廠未載入（stockfish.js 未就緒）');
    log('crossOriginIsolated = ' + self.crossOriginIsolated);
    if (!self.crossOriginIsolated) {
      log('⚠ 非 cross-origin isolated：SharedArrayBuffer 不可用，多執行緒引擎會起不來（檢查 COOP/COEP 標頭）');
    }
    log('載入 WASM 引擎中…');
    engine = await Stockfish({ locateFile: (p) => ENGINE_DIR + p });
    engine.addMessageListener(onEngineLine);
  }
  send('uci');
  await waitFor((l) => l === 'uciok');
  send('setoption name UCI_Variant value xiangqi');
  send('isready');
  await waitFor((l) => l === 'readyok');
  ready = true;
  log('引擎就緒（變體：xiangqi）');
}

// ——— 對局狀態（spike：只記 UCI 著法字串列表）———
let moves = [];

function renderMoves() {
  $('moves').textContent = moves.length ? moves.join(' ') : '(初始局面 startpos)';
  $('plyCount').textContent = String(moves.length);
}

function positionCmd() {
  return 'position startpos' + (moves.length ? ' moves ' + moves.join(' ') : '');
}

/** 從目前局面求一手（movetime = 難度旋鈕）。回傳 UCI 著法或 null（無手可走/結束）。 */
async function askBestMove() {
  await ensureReady();
  const movetime = Number($('movetime').value);
  send('ucinewgame');
  send(positionCmd());
  send('isready');
  await waitFor((l) => l === 'readyok');
  send('go movetime ' + movetime);
  const line = await waitFor((l) => l.startsWith('bestmove'), Math.max(20000, movetime + 5000));
  const mv = line.split(/\s+/)[1];
  if (!mv || mv === '(none)') return null;
  return mv;
}

// ——— 按鈕行為 ———
function setBusy(b) {
  for (const id of ['loadBtn', 'stepBtn', 'selfplayBtn', 'resetBtn']) $(id).disabled = b;
}

async function withBusy(fn) {
  setBusy(true);
  try { await fn(); }
  catch (err) { log('✗ 錯誤：' + (err && err.message ? err.message : err)); }
  finally { setBusy(false); }
}

async function doLoad() {
  await withBusy(async () => {
    const t0 = performance.now();
    await ensureReady();
    log(`✓ 載入+初始化完成（${Math.round(performance.now() - t0)}ms）`);
  });
}

async function doStep() {
  await withBusy(async () => {
    const mv = await askBestMove();
    if (!mv) { log('✓ 引擎回報無手可走（將死/和局/結束）'); return; }
    moves.push(mv);
    renderMoves();
    log(`✓ 第 ${moves.length} 手：${mv}（合法手由引擎產生）`);
  });
}

async function doSelfplay() {
  await withBusy(async () => {
    log('— 自走 10 手（驗證連續回合法手）—');
    for (let i = 0; i < 10; i++) {
      const mv = await askBestMove();
      if (!mv) { log('✓ 對局提前結束（第 ' + moves.length + ' 手後無手可走）'); break; }
      moves.push(mv);
      renderMoves();
    }
    log('✓ 自走結束，共 ' + moves.length + ' 手，全部被引擎接受為合法局面');
  });
}

function doReset() {
  moves = [];
  renderMoves();
  log('— 局面重置為 startpos —');
}

// ——— 綁定 ———
$('movetime').addEventListener('input', () => { $('movetimeVal').textContent = $('movetime').value + ' ms'; });
$('loadBtn').addEventListener('click', doLoad);
$('stepBtn').addEventListener('click', doStep);
$('selfplayBtn').addEventListener('click', doSelfplay);
$('resetBtn').addEventListener('click', doReset);

renderMoves();
$('movetimeVal').textContent = $('movetime').value + ' ms';
log('就緒。點「載入引擎」開始（首次需下載約 1.6MB WASM）。');
