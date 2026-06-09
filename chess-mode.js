// chess-mode.js — 西洋棋模式控制器（比照 shogi-mode，無持駒/打入；升變為四選一）。
//
// 自管狀態與事件，畫面顯隱由 main.js 路由統一管理。棋規用 chess-game（ffish），
// AI 用 chess-engine（共用 Fairy-Stockfish，變體 chess）。兩個 WASM 延遲載入：
// 進模式先載 ffish 顯示盤面，引擎在第一手 AI 才載。
import * as Game from './chess-game.js';
import * as Engine from './chess-engine.js';
import { resizeChessCanvas, drawChess } from './chess-ui.js';

const SETTINGS_KEY = 'chess-settings-v1';

let initialized = false;
let wired = false;
let dom = {};
let deps = null;

// ——— 對局狀態 ———
let selected = null;       // 選取的 square
let legalTargets = null;   // 目的 square 陣列
let lastMove = null;       // [from, to]
let checkRC = null;        // 被將王 {row,col}
let aiBusy = false;
let moving = false;
let gameOver = false;
let boardReady = false;
let promoResolve = null;   // 升變選子 promise 的 resolver

// ——— 設定 ———
let mode = 'pvc';          // 'pvc' | 'pvp'
let playerWhite = true;    // pvc 時玩家是否執白（先手）
let level = 2;             // 1..3

const $ = (id) => document.getElementById(id);

function cacheDom() {
  dom = {
    screen: $('chessScreen'), canvas: $('chessBoard'), status: $('chessStatus'),
    restart: $('chessRestart'), undo: $('chessUndo'), home: $('chessHome'),
    mode: $('chessMode'), color: $('chessColor'), level: $('chessLevel'),
    thinking: $('chessThinking'), checkBanner: $('chessCheck'),
    endOverlay: $('chessEnd'), endTitle: $('chessEndTitle'), endSub: $('chessEndSub'), endBtn: $('chessEndBtn'),
    promo: $('chessPromo'), promoBtns: $('chessPromoBtns'),
  };
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.mode === 'pvp' || s.mode === 'pvc') mode = s.mode;
      if (typeof s.playerWhite === 'boolean') playerWhite = s.playerWhite;
      if (s.level >= 1 && s.level <= 3) level = s.level;
    }
  } catch { /* ignore */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, playerWhite, level })); } catch { /* ignore */ }
}

function isActive() { return dom.screen && dom.screen.style.display !== 'none'; }
function isPlayerTurn() { return mode === 'pvp' || Game.turn() === playerWhite; }

// ——— 渲染 ———

function view() {
  return {
    grid: Game.piecesGrid(),
    selected, legalTargets, lastMove, checkRC,
    rc: (sq) => Game.squareToRC(sq),
  };
}

function render() {
  if (!boardReady) return;
  const avail = (dom.screen?.clientWidth || window.innerWidth) - 24;
  const w = Math.min(avail, window.innerWidth - 32, 460);
  resizeChessCanvas(deps, w);
  drawChess(deps, view());
}

function draw(extra) {
  if (!boardReady) return;
  drawChess(deps, { ...view(), ...(extra || {}) });
}

function pixelCenterOf(sq) {
  const { row, col } = Game.squareToRC(sq);
  return { x: deps.padding + col * deps.cellSize + deps.cellSize / 2, y: deps.padding + row * deps.cellSize + deps.cellSize / 2 };
}

function updateCheck() {
  if (!gameOver && Game.isCheck()) {
    const sq = Game.checkedSquares()[0];
    checkRC = sq ? Game.squareToRC(sq) : null;
  } else {
    checkRC = null;
  }
}

function showThinking(b) { if (dom.thinking) dom.thinking.style.display = b ? 'inline-flex' : 'none'; }

function flashCheck() {
  if (!dom.checkBanner) return;
  dom.checkBanner.classList.remove('show');
  void dom.checkBanner.offsetWidth;
  dom.checkBanner.classList.add('show');
}

function showEnd() {
  if (!dom.endOverlay) return;
  const r = Game.result();
  const title = r === '1-0' ? '白方勝' : r === '0-1' ? '黑方勝' : '和局';
  let sub = '';
  if (mode === 'pvc' && r !== '1/2-1/2') sub = ((r === '1-0') === playerWhite) ? '你贏了！' : '電腦獲勝';
  else if (r === '1/2-1/2') sub = Game.isCheck() ? '' : '無子可動，和局';
  if (dom.endTitle) dom.endTitle.textContent = title;
  if (dom.endSub) dom.endSub.textContent = sub;
  dom.endOverlay.style.display = 'flex';
}
function hideEnd() { if (dom.endOverlay) dom.endOverlay.style.display = 'none'; }

function updateUndoBtn() {
  if (!dom.undo) return;
  dom.undo.disabled = !boardReady || aiBusy || moving || gameOver || Game.gamePly() === 0;
}

function undoMove() {
  if (aiBusy || moving || !boardReady || Game.gamePly() === 0) return;
  Game.undo();
  if (mode === 'pvc' && Game.gamePly() > 0 && Game.turn() !== playerWhite) Game.undo();
  gameOver = false;
  hideEnd();
  clearSelection();
  const lm = Game.lastMoveUci();
  lastMove = lm ? endpointsArr(lm) : null;
  updateCheck();
  setStatus();
  render();
  if (mode === 'pvc' && !gameOver && Game.turn() !== playerWhite) maybeAiMove();
}

function endpointsArr(uci) { const e = Game.moveEndpoints(uci); return [e.from, e.to]; }

function setStatus(msg) {
  updateUndoBtn();
  if (!dom.status) return;
  if (msg) { dom.status.textContent = msg; return; }
  if (gameOver) {
    const r = Game.result();
    dom.status.textContent = r === '1-0' ? '白方勝！' : r === '0-1' ? '黑方勝！' : '和局';
    return;
  }
  const who = Game.turn() ? '白方' : '黑方';
  dom.status.textContent = Game.isCheck() ? `${who}回合 — 將軍！` : `${who}回合`;
}

// ——— 對局邏輯 ———

function clearSelection() { selected = null; legalTargets = null; }

const MOVE_ANIM_MS = 280;

/** 盤上移動的滑動動畫（王車易位只動王、車由引擎走完後 render 補上）。 */
function animateMove(fromSq, toSq) {
  return new Promise((resolve) => {
    const fromRC = Game.squareToRC(fromSq);
    const grid = Game.piecesGrid();
    const piece = grid[fromRC.row] && grid[fromRC.row][fromRC.col];
    if (!piece) { resolve(); return; }
    const p0 = pixelCenterOf(fromSq), p1 = pixelCenterOf(toSq);
    let start = null, done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const step = (ts) => {
      if (done) return;
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / MOVE_ANIM_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      drawChess(deps, {
        grid, selected: null, legalTargets: null, lastMove: null, checkRC: null,
        rc: (sq) => Game.squareToRC(sq),
        anim: { hideRow: fromRC.row, hideCol: fromRC.col, piece, x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e },
      });
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, MOVE_ANIM_MS + 400);
  });
}

async function doMove(uci) {
  const parts = Game.splitMove(uci);
  moving = true;
  clearSelection();
  draw();
  await animateMove(parts.from, parts.to);
  const ok = Game.move(uci);
  moving = false;
  if (!ok) { render(); return false; }
  lastMove = [parts.from, parts.to];
  gameOver = Game.isGameOver();
  updateCheck();
  setStatus();
  render();
  if (gameOver) showEnd();
  else if (Game.isCheck()) flashCheck();
  return true;
}

/** 顯示升變四選一（后/車/象/馬），回傳所選 code（q/r/b/n）。 */
function askPromotion() {
  return new Promise((resolve) => {
    promoResolve = resolve;
    if (dom.promo) dom.promo.style.display = 'flex';
  });
}
function resolvePromotion(code) {
  if (dom.promo) dom.promo.style.display = 'none';
  const r = promoResolve; promoResolve = null;
  if (r) r(code);
}

async function tryMove(from, to) {
  let uci = from + to;
  if (Game.isPromotion(from, to)) {
    const code = await askPromotion();
    if (!code) return;                 // 取消升變
    uci = from + to + code;
  }
  if (!isActive()) return;
  await doMove(uci);
  maybeAiMove();
}

async function onPoint(row, col) {
  if (gameOver || aiBusy || moving || !boardReady) return;
  if (mode === 'pvc' && !isPlayerTurn()) return;
  if (promoResolve) return;            // 升變選子進行中
  const sq = Game.rcToSquare(row, col);
  // 已選子 + 點到合法目的 → 走（含升變判斷）
  if (selected && legalTargets && legalTargets.includes(sq)) { await tryMove(selected, sq); return; }
  // 否則嘗試選取
  const targets = Game.legalTargetsFrom(sq);
  if (targets.length) { selected = sq; legalTargets = targets; }
  else { clearSelection(); }
  render();
}

function maybeAiMove() {
  if (mode !== 'pvc' || gameOver || isPlayerTurn()) return;
  aiBusy = true;
  showThinking(true);
  setStatus('電腦思考中…');
  const minDelay = 1100 + Math.floor(Math.random() * 1400);
  const t0 = performance.now();
  (async () => {
    try {
      const mv = await Engine.bestMove({ fen: Game.fen(), level });
      const rest = minDelay - (performance.now() - t0);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      showThinking(false);
      aiBusy = false;
      if (!isActive() || gameOver) return;
      if (mv) await doMove(mv);
      else { gameOver = true; setStatus(); showEnd(); }
    } catch (err) {
      showThinking(false);
      aiBusy = false;
      setStatus('AI 出錯：' + (err?.message || err) + '（請重新開始）');
      Engine.reset();
    }
  })();
}

async function newGame() {
  hideEnd();
  resolvePromotion(null);
  showThinking(false);
  setStatus('載入棋盤中…');
  await Game.ensureReady();
  await Game.newGame();
  boardReady = true;
  clearSelection();
  lastMove = null;
  checkRC = null;
  aiBusy = false;
  moving = false;
  gameOver = false;
  setStatus();
  render();
  maybeAiMove(); // pvc 玩家執黑時，白（AI）先走
}

// ——— 設定 UI ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = playerWhite ? 'white' : 'black';
  if (dom.level) dom.level.value = String(level);
  const pvc = mode === 'pvc';
  dom.color?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  dom.level?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
}

// ——— 事件 ———

function pointFromEvent(e) {
  const rect = dom.canvas.getBoundingClientRect();
  const pt = e.changedTouches?.[0] || e.touches?.[0] || e;
  const mx = pt.clientX - rect.left;
  const my = pt.clientY - rect.top;
  const col = Math.floor((mx - deps.padding) / deps.cellSize);
  const row = Math.floor((my - deps.padding) / deps.cellSize);
  if (col < 0 || col >= Game.COLUMNS || row < 0 || row >= Game.ROWS) return null;
  return { row, col };
}

function wireEvents() {
  if (wired) return;
  wired = true;
  let lastTouchAt = 0;
  dom.canvas.addEventListener('click', (e) => {
    if (Date.now() - lastTouchAt < 500) return;
    const p = pointFromEvent(e); if (p) onPoint(p.row, p.col);
  });
  dom.canvas.addEventListener('touchend', (e) => {
    lastTouchAt = Date.now(); e.preventDefault();
    const p = pointFromEvent(e); if (p) onPoint(p.row, p.col);
  }, { passive: false });

  dom.restart?.addEventListener('click', () => newGame());
  dom.undo?.addEventListener('click', () => undoMove());
  dom.endBtn?.addEventListener('click', () => newGame());
  dom.home?.addEventListener('click', () => { location.hash = '#home'; });
  // 升變四選一：按鈕 data-promo 帶 q/r/b/n
  dom.promoBtns?.querySelectorAll('[data-promo]')?.forEach((btn) => {
    btn.addEventListener('click', () => resolvePromotion(btn.getAttribute('data-promo')));
  });
  dom.mode?.addEventListener('change', () => { mode = dom.mode.value === 'pvp' ? 'pvp' : 'pvc'; saveSettings(); applySettingsToControls(); newGame(); });
  dom.color?.addEventListener('change', () => { playerWhite = dom.color.value !== 'black'; saveSettings(); newGame(); });
  dom.level?.addEventListener('change', () => { level = Math.min(3, Math.max(1, Number(dom.level.value) || 2)); saveSettings(); });
  window.addEventListener('resize', () => { if (isActive()) render(); });
}

// ——— 進入 ———

export async function enterChessMode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 8, cellSize: 40 };
    applySettingsToControls();
    wireEvents();
    initialized = true;
  }
  if (!boardReady) await newGame();
  else render();
}

export const ChessMode = { enterChessMode };
