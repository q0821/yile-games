// xiangqi-puzzle-mode.js — 象棋殘局練習控制器。
//
// 給殘局（FEN），玩家執先手方求殺/求勝；引擎（Fairy-Stockfish）一人分飾三角：
// 解答（提示最佳手）、對手（防守方最佳手）、裁判（判定勝勢是否保住 / 是否將死）。
// 重用 xiangqi-game 的獨立 board 與純工具、xiangqi-engine 的 analyze、xiangqi-ui 的 drawXiangqi。
import * as Game from './xiangqi-game.js';
import * as Engine from './xiangqi-engine.js';
import * as Progress from './xiangqi-puzzle-progress.js';
import { resizeXiangqiCanvas, drawXiangqi } from './xiangqi-ui.js';
import { loadSfxPack, playSfx } from './audio-manager.js';

const WIN_CP = 150;     // 起始 ≥ 此值視為「求勝」題
const FAIL_CP = 0;      // 求勝題：玩家走後己方評估掉到 < 此值 → 視為丟失勝勢

let initialized = false;
let wired = false;
let dom = {};
let deps = null;

// ——— 題庫 ———
let index = null;        // [{key,title,count}]
let catKey = null;
let puzzles = [];        // 目前分類題目 [{fen,name}]
let pIdx = 0;

// ——— 單題狀態 ———
let board = null;        // 獨立 ffish board
let playerRed = true;    // 玩家方（= 題目 FEN 先手方）
let objective = 'win';   // 'win' | 'draw'
let selected = null;
let legalTargets = null;
let lastMove = null;
let checkRC = null;
let hintMove = null;     // [from,to]
let busy = false;        // 載入/思考/判定中，鎖操作
let finished = false;    // 本題已解出或判失敗

const $ = (id) => document.getElementById(id);

function cacheDom() {
  dom = {
    screen: $('xqpScreen'), canvas: $('xqpBoard'), status: $('xqpStatus'), thinking: $('xqpThinking'),
    category: $('xqpCategory'), info: $('xqpInfo'),
    prev: $('xqpPrev'), next: $('xqpNext'), random: $('xqpRandom'), reset: $('xqpReset'), hint: $('xqpHint'), home: $('xqpHome'),
    end: $('xqpEnd'), endTitle: $('xqpEndTitle'), endSub: $('xqpEndSub'), endBtn: $('xqpEndBtn'),
  };
}

function evalCp(a) {
  if (a.mate != null) return a.mate > 0 ? 30000 - a.mate * 100 : -30000 - a.mate * 100;
  return a.cp == null ? 0 : a.cp;
}

// ——— 渲染 ———

function view() {
  return {
    grid: Game.gridFromFen(board.fen()),
    selected, legalTargets, lastMove, checkRC,
    pv: hintMove ? [{ from: hintMove[0], to: hintMove[1] }] : null,
    rc: (sq) => Game.squareToRC(sq),
  };
}
function render() {
  if (!board) return;
  const w = Math.min((dom.screen?.clientWidth || window.innerWidth) - 24, window.innerWidth - 32, 480);
  resizeXiangqiCanvas(deps, w);
  drawXiangqi(deps, view());
}
const PMOVE_MS = 260;
function pixelOf(sq) { const { row, col } = Game.squareToRC(sq); return { x: deps.padding + col * deps.cellSize, y: deps.padding + row * deps.cellSize }; }

/** 走子滑動動畫（落子前以目前局面 + 隱藏起點 + 浮動棋子插值）。 */
function animateMove(uci) {
  return new Promise((resolve) => {
    const { from, to } = Game.splitMove(uci);
    const fromRC = Game.squareToRC(from);
    const grid = Game.gridFromFen(board.fen());
    const piece = grid[fromRC.row] && grid[fromRC.row][fromRC.col];
    if (!piece) { resolve(); return; }
    const p0 = pixelOf(from), p1 = pixelOf(to);
    let start = null, done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const step = (ts) => {
      if (done) return;
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / PMOVE_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      drawXiangqi(deps, {
        grid, selected: null, legalTargets: null, lastMove: null, checkRC: null,
        rc: (sq) => Game.squareToRC(sq),
        anim: { hideRow: fromRC.row, hideCol: fromRC.col, piece, x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e },
      });
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, PMOVE_MS + 400); // rAF 分頁背景會停 → 保險
  });
}

function setStatus(msg) { if (dom.status) dom.status.textContent = msg; }
function showThinking(b) { if (dom.thinking) dom.thinking.style.display = b ? 'inline-flex' : 'none'; }
function updateInfo() {
  if (!dom.info) return;
  if (!puzzles.length) { dom.info.textContent = ''; return; }
  const done = Progress.solvedCount(puzzles.map((p) => p.fen));
  const mark = Progress.isSolved(puzzles[pIdx].fen) ? '　✓已解' : '';
  dom.info.textContent = `${puzzles[pIdx].name}　(${pIdx + 1}/${puzzles.length}・已解 ${done})${mark}`;
}

function goalText() {
  const who = playerRed ? '紅方' : '黑方';
  return objective === 'win' ? `${who}先行，求殺取勝` : `${who}先行，守和不敗`;
}

// ——— 結束卡片（共用 .board-end）———
function showEnd(ok, msg) {
  if (ok && puzzles[pIdx]) { Progress.markSolved(puzzles[pIdx].fen); updateInfo(); }
  playSfx(ok ? 'game-win' : 'game-lose'); // 殘局為單人求殺/守和練習，無 PvP／和局概念：解出=win，失敗=lose
  if (!dom.end) return;
  dom.endTitle.textContent = ok ? '解出！' : '再接再厲';
  dom.endSub.textContent = msg || '';
  dom.endBtn.textContent = ok ? '下一題' : '重試本題';
  dom.end._ok = ok;
  dom.end.style.display = 'flex';
}
function hideEnd() { if (dom.end) dom.end.style.display = 'none'; }

// ——— 載入 ———

async function loadIndex() {
  if (index) return;
  index = await (await fetch('/xiangqi-puzzles/index.json')).json();
  if (dom.category) {
    dom.category.textContent = '';
    for (const c of index) {
      const o = document.createElement('option');
      o.value = c.key; o.textContent = `${c.title}（${c.count}）`;
      dom.category.append(o);
    }
  }
}

async function loadCategory(key) {
  catKey = key;
  if (dom.category) dom.category.value = key;
  puzzles = await (await fetch(`/xiangqi-puzzles/${key}.json`)).json();
  pIdx = 0;
  await loadPuzzle(0);
}

function clearSel() { selected = null; legalTargets = null; }

async function loadPuzzle(i) {
  busy = true;
  finished = false;
  hideEnd();
  hintMove = null;
  clearSel();
  lastMove = null;
  checkRC = null;
  pIdx = Math.max(0, Math.min(puzzles.length - 1, i | 0));
  updateInfo();
  setStatus('載入中…');
  showThinking(true);
  if (board) { try { board.delete(); } catch { /* ignore */ } board = null; }
  board = await Game.newRawBoard(puzzles[pIdx].fen);
  playerRed = board.turn();
  // 定目標：分析起始局面（玩家視角）
  try {
    const a = await Engine.analyze({ fen: board.fen(), movetimeMs: 500 });
    objective = evalCp(a) >= WIN_CP ? 'win' : 'draw';
  } catch { objective = 'win'; }
  showThinking(false);
  busy = false;
  setStatus(goalText());
  render();
}

// ——— 對局邏輯 ———

function legalTargetsFrom(sq) {
  return board.legalMoves().split(/\s+/).filter(Boolean).map(Game.splitMove).filter((m) => m.from === sq).map((m) => m.to);
}
function updateCheck() {
  if (board.isCheck()) { const sq = board.checkedPieces().split(/\s+/).filter(Boolean)[0]; checkRC = sq ? Game.squareToRC(sq) : null; }
  else checkRC = null;
}

function onPoint(row, col) {
  if (busy || finished || !board) return;
  if (board.turn() !== playerRed) return; // 只在玩家回合
  const sq = Game.rcToSquare(row, col);
  if (selected && legalTargets && legalTargets.includes(sq)) {
    playerMove(selected + sq);
    return;
  }
  const targets = legalTargetsFrom(sq);
  if (targets.length) { selected = sq; legalTargets = targets; hintMove = null; }
  else clearSel();
  render();
}

function isWinResult() { const r = board.result(); return (playerRed && r === '1-0') || (!playerRed && r === '0-1'); }

/** 落子前先看目的格是否已有子：吃子 vs 落子音效判斷（走子本身不會改變盤面，可安全先查）。 */
function playMoveSound(uci) {
  const { to } = Game.splitMove(uci);
  const toRC = Game.squareToRC(to);
  const grid = Game.gridFromFen(board.fen());
  const captured = !!(grid[toRC.row] && grid[toRC.row][toRC.col]);
  playSfx(captured ? 'wood-capture' : 'wood-place');
}

async function playerMove(uci) {
  busy = true;
  clearSel();
  hintMove = null;
  await animateMove(uci);
  playMoveSound(uci);
  board.push(uci);
  const sp = Game.splitMove(uci);
  lastMove = [sp.from, sp.to];
  updateCheck();
  render();
  // 玩家直接將死 → 解出
  if (board.isGameOver()) {
    const win = isWinResult();
    finished = true; busy = false;
    setStatus(win ? '將死對方，解出！' : '對局結束');
    showEnd(win, win ? goalLabelDone() : '本題結束');
    return;
  }
  // 判定 + 取防守手（一次 analyze 兼得）
  showThinking(true); setStatus('電腦思考中…');
  try {
    const a = await Engine.analyze({ fen: board.fen(), movetimeMs: 600 });
    const playerEval = -evalCp(a);      // a 為對手視角 → 取負為玩家視角
    showThinking(false);
    if (objective === 'win' && playerEval < FAIL_CP) {
      finished = true; busy = false;
      setStatus('這手把勝勢走丟了');
      showEnd(false, '可惜，這手丟了勝勢，再試一次');
      return;
    }
    if (objective === 'draw' && playerEval < -200) {
      finished = true; busy = false;
      setStatus('這手落入敗勢');
      showEnd(false, '守和失敗，再試一次');
      return;
    }
    // 引擎防守（用 analyze 的最佳手＝全強度）
    if (a.bestmove) {
      await animateMove(a.bestmove);
      playMoveSound(a.bestmove);
      board.push(a.bestmove);
      const d = Game.splitMove(a.bestmove);
      lastMove = [d.from, d.to];
      updateCheck();
    }
    busy = false;
    if (board.isGameOver()) {
      const win = isWinResult();
      finished = true;
      setStatus(win ? '解出！' : '對局結束');
      showEnd(win, win ? goalLabelDone() : '本題結束');
      return;
    }
    setStatus(goalText());
    render();
  } catch (err) {
    showThinking(false); busy = false;
    setStatus('AI 出錯：' + (err?.message || err));
    Engine.reset();
  }
}

function goalLabelDone() { return objective === 'win' ? '成功求勝' : '成功守和'; }

async function showHint() {
  if (busy || finished || !board || board.turn() !== playerRed) return;
  busy = true; showThinking(true); setStatus('提示計算中…');
  try {
    const a = await Engine.analyze({ fen: board.fen(), movetimeMs: 600 });
    showThinking(false); busy = false;
    if (a.bestmove) { const m = Game.splitMove(a.bestmove); hintMove = [m.from, m.to]; setStatus('提示：藍色箭頭為建議走法'); render(); }
    else setStatus(goalText());
  } catch { showThinking(false); busy = false; setStatus(goalText()); }
}

// ——— 事件 ———

function pointFromEvent(e) {
  const rect = dom.canvas.getBoundingClientRect();
  const pt = e.changedTouches?.[0] || e.touches?.[0] || e;
  const col = Math.round((pt.clientX - rect.left - deps.padding) / deps.cellSize);
  const row = Math.round((pt.clientY - rect.top - deps.padding) / deps.cellSize);
  if (col < 0 || col >= Game.COLUMNS || row < 0 || row >= Game.ROWS) return null;
  return { row, col };
}

function wireEvents() {
  if (wired) return;
  wired = true;
  let lastTouchAt = 0;
  dom.canvas.addEventListener('click', (e) => { if (Date.now() - lastTouchAt < 500) return; const p = pointFromEvent(e); if (p) onPoint(p.row, p.col); });
  dom.canvas.addEventListener('touchend', (e) => { lastTouchAt = Date.now(); e.preventDefault(); const p = pointFromEvent(e); if (p) onPoint(p.row, p.col); }, { passive: false });

  dom.home?.addEventListener('click', () => { location.hash = '#home'; });
  dom.category?.addEventListener('change', () => loadCategory(dom.category.value));
  dom.prev?.addEventListener('click', () => { if (!busy && pIdx > 0) loadPuzzle(pIdx - 1); });
  dom.next?.addEventListener('click', () => { if (!busy && pIdx < puzzles.length - 1) loadPuzzle(pIdx + 1); });
  dom.random?.addEventListener('click', () => { if (!busy && puzzles.length) loadPuzzle(Math.floor((performance.now() * 7919) % puzzles.length)); });
  dom.reset?.addEventListener('click', () => { if (!busy) loadPuzzle(pIdx); });
  dom.hint?.addEventListener('click', () => showHint());
  dom.endBtn?.addEventListener('click', () => {
    const ok = dom.end._ok;
    hideEnd();
    if (ok) loadPuzzle(Math.min(pIdx + 1, puzzles.length - 1));
    else loadPuzzle(pIdx);
  });
  window.addEventListener('resize', () => { if (dom.screen && dom.screen.style.display !== 'none') render(); });
}

// ——— 進入 ———

export async function enterXiangqiPuzzleMode() {
  loadSfxPack('xiangqi'); // 殘局沿用象棋落子/吃子音效包，未另立 pack
  loadSfxPack('common');
  if (!initialized) {
    cacheDom();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 22, cellSize: 32 };
    wireEvents();
    await loadIndex();
    await loadCategory(index[0].key);
    initialized = true;
  } else {
    render();
  }
}

export const XiangqiPuzzleMode = { enterXiangqiPuzzleMode };
