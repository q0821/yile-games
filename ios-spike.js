// ios-spike.js — Capacitor iOS 可行性 spike 的「載入即自動執行」診斷頁。
//
// 目的：在 iOS WKWebView（離線、Capacitor 打包）內，用 App 實際使用的引擎封裝
//   （katago-service.js / xiangqi-engine.js）驗證：
//     1. crossOriginIsolated 是否為 true、SharedArrayBuffer 是否可用
//     2. 圍棋 KataGo 能否啟動並算出一手
//     3. 象棋 fairy-stockfish 能否啟動並算出一手
//   全部自動跑、結果同時輸出到 DOM（供截圖）與 console.log（前綴 [SPIKE]，供 log stream 擷取）。
//
// ⚠️ throwaway 診斷頁，spike 結束後移除（見 SPIKE-capacitor-ios.md）。
import { BLACK, WHITE, EMPTY } from './rules.js';
import { genmove as katagoGenmove } from './katago-service.js';
import { bestMove as xiangqiBestMove } from './xiangqi-engine.js';

const bannerEl = document.getElementById('banner');
const isoEl = document.getElementById('iso');
const goEl = document.getElementById('go');
const xqEl = document.getElementById('xq');
const logEl = document.getElementById('log');

function log(msg) {
  const line = typeof msg === 'string' ? msg : JSON.stringify(msg);
  logEl.textContent += line + '\n';
  // eslint-disable-next-line no-console
  console.log('[SPIKE] ' + line);
}

// 全域錯誤攔截：把 worker/引擎丟出的 ReferenceError 來源（檔名:行:列 + stack）印清楚。
window.addEventListener('error', (ev) => {
  const d = ev.error && ev.error.stack ? ev.error.stack : `${ev.message} @ ${ev.filename}:${ev.lineno}:${ev.colno}`;
  log('WINDOW_ERROR ' + d);
});
window.addEventListener('unhandledrejection', (ev) => {
  const r = ev.reason;
  log('UNHANDLED_REJECTION ' + (r && r.stack ? r.stack : String(r)));
});

/** 為單一測試套用逾時，避免某引擎 hang（worker 未 reject）時擋住其他測試與最終結論。 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 逾時 ${ms}ms`)), ms)),
  ]);
}

function setBanner(text, ok) {
  bannerEl.textContent = text;
  bannerEl.style.background = ok ? '#1b7d3b' : '#a11d1d';
}

// 象棋起始局面 FEN（紅先）。
const XIANGQI_STARTPOS = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

function emptyBoard(n) {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => EMPTY));
}

async function checkIsolation() {
  const iso = self.crossOriginIsolated === true;
  const sab = typeof SharedArrayBuffer !== 'undefined';
  log('location.origin = ' + location.origin);
  log('crossOriginIsolated = ' + iso);
  log('typeof SharedArrayBuffer = ' + (sab ? 'function' : 'undefined'));
  isoEl.textContent =
    `crossOriginIsolated: ${iso ? '✅ true' : '❌ false'}   |   ` +
    `SharedArrayBuffer: ${sab ? '✅ 可用' : '❌ 不可用'}`;
  isoEl.style.color = iso && sab ? '#1b7d3b' : '#a11d1d';
  return iso && sab;
}

async function testGo() {
  goEl.textContent = '圍棋 KataGo：載入中…';
  const t0 = performance.now();
  try {
    const state = {
      board: emptyBoard(9),
      size: 9,
      currentPlayer: BLACK,
      moveHistory: [],
      komi: 7.5,
      gameRules: 'chinese',
      onStatus: (m) => log('KataGo: ' + m),
    };
    const mv = await katagoGenmove(state, { visits: 12, maxTimeMs: 30000 });
    const ms = Math.round(performance.now() - t0);
    log(`KataGo genmove 回傳 ${JSON.stringify(mv)}（${ms}ms）`);
    const ok = mv && (mv.pass === true || (Number.isInteger(mv.x) && Number.isInteger(mv.y)));
    goEl.textContent = ok
      ? `圍棋 KataGo：✅ 下出一手 ${JSON.stringify(mv)}（${ms}ms）`
      : `圍棋 KataGo：❌ 回傳異常 ${JSON.stringify(mv)}`;
    goEl.style.color = ok ? '#1b7d3b' : '#a11d1d';
    return ok;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    log('KataGo 失敗：' + msg);
    goEl.textContent = '圍棋 KataGo：❌ ' + msg;
    goEl.style.color = '#a11d1d';
    return false;
  }
}

async function testXiangqi() {
  xqEl.textContent = '象棋 fairy-stockfish：載入中…';
  const t0 = performance.now();
  try {
    const mv = await xiangqiBestMove({ fen: XIANGQI_STARTPOS, level: 5, movetimeMs: 1500, variant: 'xiangqi' });
    const ms = Math.round(performance.now() - t0);
    log(`fairy-stockfish bestMove 回傳 ${mv}（${ms}ms）`);
    const ok = typeof mv === 'string' && /^[a-i]\d[a-i]\d$/.test(mv);
    xqEl.textContent = ok
      ? `象棋 fairy-stockfish：✅ 下出一手 ${mv}（${ms}ms）`
      : `象棋 fairy-stockfish：❌ 回傳異常 ${mv}`;
    xqEl.style.color = ok ? '#1b7d3b' : '#a11d1d';
    return ok;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    log('fairy-stockfish 失敗：' + msg);
    xqEl.textContent = '象棋 fairy-stockfish：❌ ' + msg;
    xqEl.style.color = '#a11d1d';
    return false;
  }
}

async function main() {
  log('=== iOS Capacitor spike 開始 ===');
  const isoOk = await checkIsolation();
  if (!isoOk) {
    setBanner('❌ 未 cross-origin isolated — 多執行緒引擎無法啟動', false);
    // 仍繼續嘗試，讓錯誤訊息完整呈現
  }
  // 象棋先跑：純 WASM 多執行緒（就是驗收要的 fairy-stockfish），不依賴 WebGPU；
  // 且各自套逾時，KataGo 若在某環境 hang 也不會擋住象棋結果與最終結論。
  let xqOk = false, goOk = false;
  try { xqOk = await withTimeout(testXiangqi(), 60000, '象棋'); }
  catch (e) { log('象棋逾時/失敗：' + e.message); xqEl.textContent = '象棋 fairy-stockfish：❌ ' + e.message; xqEl.style.color = '#a11d1d'; }
  try { goOk = await withTimeout(testGo(), 90000, '圍棋'); }
  catch (e) { log('圍棋逾時/失敗：' + e.message); goEl.textContent = '圍棋 KataGo：❌ ' + e.message; goEl.style.color = '#a11d1d'; }

  const allOk = isoOk && goOk && xqOk;
  setBanner(
    allOk
      ? '✅ 通過：WKWebView 離線可跑 KataGo + fairy-stockfish'
      : '❌ 失敗：見下方各項',
    allOk,
  );
  log(`=== 結論 iso=${isoOk} go=${goOk} xq=${xqOk} → ${allOk ? 'PASS' : 'FAIL'} ===`);
  // 讓外部（log stream / 自動化）好抓的單行結果
  log(`RESULT ${JSON.stringify({ iso: isoOk, go: goOk, xq: xqOk, pass: allOk })}`);
  document.title = allOk ? 'SPIKE_PASS' : 'SPIKE_FAIL';
}

main();
