// shogi-mode.js — 將棋模式控制器（比照 xiangqi-mode，新增持駒/打入/升變/規則說明）。
//
// 自管狀態與事件，畫面顯隱由 main.js 路由統一管理。棋規用 shogi-game（ffish），
// AI 用 shogi-engine（共用 Fairy-Stockfish，變體 shogi）。兩個 WASM 延遲載入：
// 進模式先載 ffish 顯示盤面，引擎在第一手 AI 才載。
import * as Game from './shogi-game.js';
import * as Engine from './shogi-engine.js';
import { resizeShogiCanvas, drawShogi } from './shogi-ui.js';

const SETTINGS_KEY = 'shogi-settings-v1';

let initialized = false;
let wired = false;
let dom = {};
let deps = null;

// ——— 對局狀態 ———
let selected = null;       // 選取的盤上 square（移動用）
let selectedDrop = null;   // 選取的持駒駒字（打入用，大寫）
let legalTargets = null;   // 目的／落點 square 陣列
let lastMove = null;       // [from|null, to]
let checkRC = null;        // 被王手的王 {row,col}
let aiBusy = false;
let moving = false;
let gameOver = false;
let boardReady = false;
let promoResolve = null;   // 升變選擇 promise 的 resolver

// ——— 設定 ———
let mode = 'pvc';          // 'pvc' | 'pvp'
let playerSente = true;    // pvc 時玩家是否執先手
let level = 2;             // 1..3

const $ = (id) => document.getElementById(id);

function cacheDom() {
  dom = {
    screen: $('shogiScreen'), canvas: $('shogiBoard'), status: $('shogiStatus'),
    restart: $('shogiRestart'), undo: $('shogiUndo'), home: $('shogiHome'),
    mode: $('shogiMode'), color: $('shogiColor'), level: $('shogiLevel'),
    thinking: $('shogiThinking'), checkBanner: $('shogiCheck'),
    handGote: $('shogiHandGote'), handSente: $('shogiHandSente'),
    endOverlay: $('shogiEnd'), endTitle: $('shogiEndTitle'), endSub: $('shogiEndSub'), endBtn: $('shogiEndBtn'),
    promo: $('shogiPromo'), promoYes: $('shogiPromoYes'), promoNo: $('shogiPromoNo'),
    rulesBtn: $('shogiRulesBtn'), rulesModal: $('shogiRulesModal'),
  };
  dom.settings = dom.screen?.querySelector('.gomoku-settings');
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.mode === 'pvp' || s.mode === 'pvc') mode = s.mode;
      if (typeof s.playerSente === 'boolean') playerSente = s.playerSente;
      if (s.level >= 1 && s.level <= 3) level = s.level;
    }
  } catch { /* ignore */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, playerSente, level })); } catch { /* ignore */ }
}

function isActive() { return dom.screen && dom.screen.style.display !== 'none'; }
function isPlayerTurn() { return mode === 'pvp' || Game.turn() === playerSente; }

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
  resizeShogiCanvas(deps, w);
  drawShogi(deps, view());
  renderHands();
}

function draw(extra) {
  if (!boardReady) return;
  drawShogi(deps, { ...view(), ...(extra || {}) });
}

function pixelCenterOf(sq) {
  const { row, col } = Game.squareToRC(sq);
  return { x: deps.padding + col * deps.cellSize + deps.cellSize / 2, y: deps.padding + row * deps.cellSize + deps.cellSize / 2 };
}

// ——— 持駒區（DOM）———

/** 某方是否可在此刻選持駒打入（必須是該方走、且 pvc 時為玩家）。 */
function canSelectHand(sideSente) {
  return boardReady && !gameOver && !aiBusy && !moving
    && Game.turn() === sideSente && isPlayerTurn();
}

function fillHand(container, handObj, sideSente) {
  if (!container) return;
  container.innerHTML = '';
  const selectable = canSelectHand(sideSente);
  let any = false;
  for (const p of Game.HAND_ORDER) {
    const n = handObj[p];
    if (!n) continue;
    any = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shogi-hand-piece' + (sideSente ? '' : ' gote')
      + (selectedDrop === p && Game.turn() === sideSente ? ' sel' : '');
    btn.disabled = !selectable;
    const ch = document.createElement('span');
    ch.className = 'shogi-hand-char';
    ch.textContent = Game.handChar(p);
    btn.appendChild(ch);
    if (n > 1) {
      const badge = document.createElement('span');
      badge.className = 'shogi-hand-count';
      badge.textContent = String(n);
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => onHandPiece(p, sideSente));
    container.appendChild(btn);
  }
  if (!any) {
    const empty = document.createElement('span');
    empty.className = 'shogi-hand-empty';
    empty.textContent = '無持駒';
    container.appendChild(empty);
  }
}

function renderHands() {
  if (!boardReady) return;
  const h = Game.hands();
  fillHand(dom.handGote, h.gote, false);
  fillHand(dom.handSente, h.sente, true);
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
  const title = r === '1-0' ? '先手勝' : r === '0-1' ? '後手勝' : '和局';
  let sub = '';
  if (mode === 'pvc' && r !== '1/2-1/2') sub = ((r === '1-0') === playerSente) ? '你贏了！' : '電腦獲勝';
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
  if (mode === 'pvc' && Game.gamePly() > 0 && Game.turn() !== playerSente) Game.undo();
  gameOver = false;
  hideEnd();
  clearSelection();
  const lm = Game.lastMoveUci();
  lastMove = lm ? endpointsArr(lm) : null;
  updateCheck();
  setStatus();
  render();
  if (mode === 'pvc' && !gameOver && Game.turn() !== playerSente) maybeAiMove();
}

function endpointsArr(uci) { const e = Game.moveEndpoints(uci); return [e.from, e.to]; }

function setStatus(msg) {
  updateUndoBtn();
  if (!dom.status) return;
  if (msg) { dom.status.textContent = msg; return; }
  if (gameOver) {
    const r = Game.result();
    dom.status.textContent = r === '1-0' ? '先手勝！' : r === '0-1' ? '後手勝！' : '和局';
    return;
  }
  const who = Game.turn() ? '先手' : '後手';
  dom.status.textContent = Game.isCheck() ? `${who}回合 — 王手！` : `${who}回合`;
}

// ——— 對局邏輯 ———

function clearSelection() { selected = null; selectedDrop = null; legalTargets = null; }

const MOVE_ANIM_MS = 280;

/** 盤上移動的滑動動畫（打入不走此路徑）。 */
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
      drawShogi(deps, {
        grid, selected: null, legalTargets: null, lastMove: null, checkRC: null,
        rc: (sq) => Game.squareToRC(sq),
        anim: { hideRow: fromRC.row, hideCol: fromRC.col, piece, x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e },
      });
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, MOVE_ANIM_MS + 400);  // 分頁背景 rAF 暫停的保險
  });
}

async function doMove(uci) {
  const parts = Game.splitMove(uci);
  moving = true;
  clearSelection();
  draw();
  if (!parts.drop) await animateMove(parts.from, parts.to);
  const ok = Game.move(uci);
  moving = false;
  if (!ok) { render(); return false; }
  lastMove = endpointsArr(uci);
  gameOver = Game.isGameOver();
  updateCheck();
  setStatus();
  render();
  if (gameOver) showEnd();
  else if (Game.isCheck()) flashCheck();
  return true;
}

/** 顯示「成る／不成」選擇，回傳是否升變。 */
function askPromotion() {
  return new Promise((resolve) => {
    promoResolve = resolve;
    if (dom.promo) dom.promo.style.display = 'flex';
  });
}
function resolvePromotion(yes) {
  if (dom.promo) dom.promo.style.display = 'none';
  const r = promoResolve; promoResolve = null;
  if (r) r(yes);
}

async function tryBoardMove(from, to) {
  const ps = Game.promotionState(from, to);
  let uci;
  if (ps.must) uci = from + to + '+';
  else if (ps.can) uci = from + to + (await askPromotion() ? '+' : '');
  else uci = from + to;
  if (!isActive()) return;
  await doMove(uci);
  maybeAiMove();
}

async function onPoint(row, col) {
  if (gameOver || aiBusy || moving || !boardReady) return;
  if (mode === 'pvc' && !isPlayerTurn()) return;
  if (promoResolve) return;  // 升變選擇進行中，先別接受盤面點擊
  const sq = Game.rcToSquare(row, col);
  // 打入：已選持駒 + 點到合法落點
  if (selectedDrop) {
    if (legalTargets && legalTargets.includes(sq)) { await doMove(selectedDrop + '@' + sq); maybeAiMove(); return; }
    clearSelection(); render(); return;
  }
  // 移動：已選盤上駒 + 點到合法目的
  if (selected && legalTargets && legalTargets.includes(sq)) { await tryBoardMove(selected, sq); return; }
  // 否則嘗試選取盤上駒
  const targets = Game.legalTargetsFrom(sq);
  if (targets.length) { selected = sq; selectedDrop = null; legalTargets = targets; }
  else { clearSelection(); }
  render();
}

function onHandPiece(pieceUpper, sideSente) {
  if (!canSelectHand(sideSente) || promoResolve) return;
  if (selectedDrop === pieceUpper) { clearSelection(); render(); return; }
  selected = null;
  selectedDrop = pieceUpper;
  legalTargets = Game.legalDropTargets(pieceUpper);
  render();
}

function maybeAiMove() {
  if (mode !== 'pvc' || gameOver || isPlayerTurn()) return;
  aiBusy = true;
  showThinking(true);
  setStatus('電腦思考中…');
  renderHands();   // 反映持駒禁用態
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
  resolvePromotion(false);
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
  maybeAiMove(); // pvc 玩家執後手時，先手（AI）先走
}

// ——— 設定 UI ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = playerSente ? 'sente' : 'gote';
  if (dom.level) dom.level.value = String(level);
  const pvc = mode === 'pvc';
  dom.color?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  dom.level?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
}

// ——— 規則說明 ———

function openRules() { dom.rulesModal?.classList.add('show'); }
function closeRules() { dom.rulesModal?.classList.remove('show'); }

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
  dom.promoYes?.addEventListener('click', () => resolvePromotion(true));
  dom.promoNo?.addEventListener('click', () => resolvePromotion(false));
  dom.rulesBtn?.addEventListener('click', () => openRules());
  dom.rulesModal?.addEventListener('click', (e) => { if (e.target === dom.rulesModal) closeRules(); });
  dom.rulesModal?.querySelector('[data-close-rules]')?.addEventListener('click', () => closeRules());
  dom.mode?.addEventListener('change', () => { mode = dom.mode.value === 'pvp' ? 'pvp' : 'pvc'; saveSettings(); applySettingsToControls(); newGame(); });
  dom.color?.addEventListener('change', () => { playerSente = dom.color.value !== 'gote'; saveSettings(); newGame(); });
  dom.level?.addEventListener('change', () => { level = Math.min(3, Math.max(1, Number(dom.level.value) || 2)); saveSettings(); });
  window.addEventListener('resize', () => { if (isActive()) render(); });
}

// ——— 進入 ———

export async function enterShogiMode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 12, cellSize: 32 };
    applySettingsToControls();
    wireEvents();
    initialized = true;
  }
  if (!boardReady) await newGame();
  else render();
}

export const ShogiMode = { enterShogiMode };
