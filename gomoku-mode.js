// gomoku-mode.js — 五子棋模式控制器。
//
// 與對弈完全獨立：自管狀態、自己的 #gomokuScreen 畫面與 #gomokuBoard canvas、
// 自綁事件（不碰 event-handlers.js）。重用純邏輯 gomoku-rules.js、AI gomoku-ai.js、
// 渲染 gomoku-ui.js，以及 rules.js 的盤面常數。畫面顯隱由 main.js 路由統一管理。
import { BLACK, WHITE, EMPTY, createBoard, opponent } from './rules.js';
import { SIZE, canPlace, checkWin, isBoardFull } from './gomoku-rules.js';
import { resizeGomokuCanvas, drawGomoku } from './gomoku-ui.js';
import { bestMove } from './gomoku-ai.js';

const SETTINGS_KEY = 'gomoku-settings-v1'; // 只存設定，不與圍棋 SAVE_KEY 相撞

let initialized = false;
let dom = {};
let deps = null;

// ——— 對局狀態 ———
const size = SIZE;
let board = null;
let currentPlayer = BLACK;
let gameOver = false;
let winner = null;        // BLACK | WHITE | null（和局或進行中）
let winningLine = null;
let history = [];         // [{ r, c, player }]
let hover = null;
let aiBusy = false;

// ——— 設定 ———
let mode = 'pvc';         // 'pvp' | 'pvc'
let playerColor = BLACK;  // pvc 時玩家執子
let aiLevel = 2;          // 1..3

function $(id) { return document.getElementById(id); }

function cacheDom() {
  dom = {
    screen: $('gomokuScreen'),
    canvas: $('gomokuBoard'),
    status: $('gomokuStatus'),
    restart: $('gomokuRestart'),
    undo: $('gomokuUndo'),
    home: $('gomokuHome'),
    mode: $('gomokuMode'),
    color: $('gomokuColor'),
    level: $('gomokuLevel'),
    end: $('gomokuEnd'), endTitle: $('gomokuEndTitle'), endSub: $('gomokuEndSub'), endBtn: $('gomokuEndBtn'),
  };
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.mode === 'pvp' || s.mode === 'pvc') mode = s.mode;
      if (s.playerColor === BLACK || s.playerColor === WHITE) playerColor = s.playerColor;
      if (s.aiLevel >= 1 && s.aiLevel <= 3) aiLevel = s.aiLevel;
    }
  } catch (_) { /* ignore */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, playerColor, aiLevel })); } catch (_) { /* ignore */ }
}

function isActive() {
  return dom.screen && dom.screen.style.display !== 'none';
}

// ——— 畫面 ———

function view() {
  const last = history.length ? history[history.length - 1] : null;
  return {
    board, size, currentPlayer, toPlayColor: currentPlayer, hover,
    lastMove: last ? [last.r, last.c] : null,
    winningLine,
  };
}

function render() {
  if (!board) return;
  resizeGomokuCanvas(deps, view());
  drawGomoku(deps, view());
}

function setStatus(msg) {
  if (!dom.status) return;
  if (msg) { dom.status.textContent = msg; return; }
  if (gameOver) {
    dom.status.textContent = winner === null
      ? '和局 — 棋盤已滿'
      : `${winner === BLACK ? '黑方' : '白方'}勝！`;
    showEnd();
  } else {
    dom.status.textContent = `${currentPlayer === BLACK ? '黑方' : '白方'}回合`;
  }
  if (dom.undo) dom.undo.disabled = aiBusy || history.length === 0;
}

/** 結束覆蓋卡片（與象棋一致的 .board-end）。 */
function showEnd() {
  if (!dom.end) return;
  const title = winner === null ? '和局' : (winner === BLACK ? '黑方勝' : '白方勝');
  let sub = '';
  if (mode === 'pvc' && winner !== null) sub = (winner === playerColor) ? '你贏了！' : '電腦獲勝';
  if (dom.endTitle) dom.endTitle.textContent = title;
  if (dom.endSub) dom.endSub.textContent = sub;
  dom.end.style.display = 'flex';
}
function hideEnd() { if (dom.end) dom.end.style.display = 'none'; }

// ——— 對局邏輯 ———

function place(r, c, player) {
  board[r][c] = player;
  history.push({ r, c, player });
  const w = checkWin(board, size, r, c, player);
  if (w.won) { gameOver = true; winner = player; winningLine = w.line; }
  else if (isBoardFull(board, size)) { gameOver = true; winner = null; }
  else currentPlayer = opponent(player);
}

function newGame() {
  hideEnd();
  board = createBoard(size);
  currentPlayer = BLACK;
  gameOver = false;
  winner = null;
  winningLine = null;
  history = [];
  hover = null;
  aiBusy = false;
  setStatus();
  render();
  maybeAiMove(); // pvc 玩家執白時，AI（黑）先手
}

function onCellClick(r, c) {
  if (gameOver || aiBusy) return;
  if (!canPlace(board, size, r, c)) return;
  // 回合 guard：pvc 模式只有「輪到玩家」才允許手動落子（記取圍棋出錯時點棋盤幫 AI 下子的教訓）。
  if (mode === 'pvc' && currentPlayer !== playerColor) return;
  hover = null;
  place(r, c, currentPlayer);
  setStatus();
  render();
  maybeAiMove();
}

function maybeAiMove() {
  if (mode !== 'pvc' || gameOver) return;
  if (currentPlayer === playerColor) return; // 不是 AI 回合
  aiBusy = true;
  setStatus('電腦思考中…');
  // 給點延遲避免瞬間落子；放進 timeout 也讓 UI 先更新。
  setTimeout(() => {
    if (!isActive() || gameOver || currentPlayer === playerColor) { aiBusy = false; return; }
    const m = bestMove(board, size, currentPlayer, aiLevel);
    aiBusy = false;
    if (m) place(m.r, m.c, currentPlayer);
    else { gameOver = true; winner = null; } // 無手可下
    setStatus();
    render();
  }, 350);
}

function undo() {
  if (aiBusy || !history.length) return;
  if (mode === 'pvc') {
    // 退到並包含「玩家最後落的子」，把它之後的 AI 手一起退掉 → 回到玩家可下的時機。
    let removedPlayerMove = false;
    while (history.length && !removedPlayerMove) {
      const last = history.pop();
      board[last.r][last.c] = EMPTY;
      if (last.player === playerColor) removedPlayerMove = true;
    }
  } else {
    const last = history.pop();
    board[last.r][last.c] = EMPTY;
  }
  gameOver = false;
  winner = null;
  winningLine = null;
  currentPlayer = history.length ? opponent(history[history.length - 1].player) : BLACK;
  setStatus();
  render();
  // pvc 退空後若仍非玩家回合（玩家執白）→ 讓 AI 補先手
  if (mode === 'pvc' && !gameOver && currentPlayer !== playerColor) maybeAiMove();
}

// ——— 設定變更 ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = String(playerColor);
  if (dom.level) dom.level.value = String(aiLevel);
  // 人人對局時，執子／難度選項無意義 → 隱藏
  const pvc = mode === 'pvc';
  if (dom.color) dom.color.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  if (dom.level) dom.level.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
}

// ——— 事件 ———

function cellFromEvent(e) {
  const rect = dom.canvas.getBoundingClientRect();
  const pt = e.touches?.[0] || e.changedTouches?.[0] || e;
  const scaleX = rect.width > 0 ? dom.canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? dom.canvas.height / rect.height : 1;
  const mx = (pt.clientX - rect.left) * scaleX;
  const my = (pt.clientY - rect.top) * scaleY;
  const col = Math.round((mx - deps.padding) / deps.cellSize);
  const row = Math.round((my - deps.padding) / deps.cellSize);
  return { row, col };
}

let wired = false;
let lastTouchAt = 0;

function wireEvents() {
  if (wired) return;
  wired = true;

  dom.canvas.addEventListener('click', (e) => {
    if (Date.now() - lastTouchAt < 500) return; // 避免 touch 後又觸發 click
    const { row, col } = cellFromEvent(e);
    onCellClick(row, col);
  });
  dom.canvas.addEventListener('touchend', (e) => {
    lastTouchAt = Date.now();
    hover = null;
    e.preventDefault();
    const { row, col } = cellFromEvent(e);
    onCellClick(row, col);
  }, { passive: false });

  let moveRaf = null;
  dom.canvas.addEventListener('mousemove', (e) => {
    const canHover = !gameOver && !aiBusy && !(mode === 'pvc' && currentPlayer !== playerColor);
    if (!canHover) { if (hover) { hover = null; render(); } return; }
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null;
      hover = cellFromEvent(e);
      render();
    });
  });
  dom.canvas.addEventListener('mouseleave', () => { if (hover) { hover = null; render(); } });

  dom.restart?.addEventListener('click', () => newGame());
  dom.undo?.addEventListener('click', () => undo());
  dom.endBtn?.addEventListener('click', () => newGame());
  dom.home?.addEventListener('click', () => { location.hash = '#home'; });

  dom.mode?.addEventListener('change', () => { mode = dom.mode.value === 'pvp' ? 'pvp' : 'pvc'; saveSettings(); applySettingsToControls(); newGame(); });
  dom.color?.addEventListener('change', () => { playerColor = Number(dom.color.value) === WHITE ? WHITE : BLACK; saveSettings(); newGame(); });
  dom.level?.addEventListener('change', () => { aiLevel = Math.min(3, Math.max(1, Number(dom.level.value) || 2)); saveSettings(); });

  window.addEventListener('resize', () => { if (isActive()) render(); });
}

// ——— 進入（畫面顯隱由 main.js 路由統一管理）———

export async function enterGomokuMode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 24, cellSize: 30 };
    applySettingsToControls();
    wireEvents();
    initialized = true;
  }
  if (!board) newGame();
  else render();
}

export const GomokuMode = { enterGomokuMode };
