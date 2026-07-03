// connect6-mode.js — 連六棋模式控制器。
//
// 與五子棋獨立：自管狀態、自己的 #connect6Screen 與 #connect6Board canvas、自綁事件。
// 重用純邏輯 connect6-rules.js、AI connect6-ai.js、渲染 connect6-ui.js。畫面顯隱由 main.js
// 路由統一管理。核心差異＝「每手兩子」：以 pending（本回合未提交的子）＋ history（每回合一筆）
// 驅動回合結構；整局第一回合（黑）只下 1 子，其餘每回合 2 子。
import { BLACK, WHITE, EMPTY, createBoard, opponent } from './rules.js';
import { SIZE, canPlace, checkWin, isBoardFull } from './connect6-rules.js';
import { resizeConnect6Canvas, drawConnect6 } from './connect6-ui.js';
import { bestTurn } from './connect6-ai.js';
import { loadSfxPack, playSfx } from './audio-manager.js';
import { renderAudioControls } from './audio-settings-ui.js';
import { showBoardToast } from './ui.js';

const SETTINGS_KEY = 'connect6-settings-v1';

let initialized = false;
let dom = {};
let deps = null;

// ——— 對局狀態 ———
const size = SIZE;
let board = null;
let currentPlayer = BLACK;
let gameOver = false;
let winner = null;         // BLACK | WHITE | null（和局或進行中）
let winningLine = null;
let history = [];          // [{ player, stones:[{r,c}] }] 每筆＝一個已提交的回合
let pending = [];          // [{r,c}] 本回合已落、尚未提交（可收回）的子
let hover = null;
let aiBusy = false;

// ——— 設定 ———
let mode = 'pvc';          // 'pvp' | 'pvc'
let playerColor = BLACK;   // pvc 時玩家執子
let aiLevel = 2;           // 1..3

// 本回合可下子數：整局第一回合（history 為空）＝1，其餘＝2。
function quota() { return history.length === 0 ? 1 : 2; }
// 本回合還可下幾子。
function remaining() { return quota() - pending.length; }

function $(id) { return document.getElementById(id); }

function cacheDom() {
  dom = {
    screen: $('connect6Screen'),
    canvas: $('connect6Board'),
    status: $('connect6Status'),
    restart: $('connect6Restart'),
    undo: $('connect6Undo'),
    home: $('connect6Home'),
    mode: $('connect6Mode'),
    color: $('connect6Color'),
    level: $('connect6Level'),
    end: $('connect6End'), endTitle: $('connect6EndTitle'), endSub: $('connect6EndSub'), endBtn: $('connect6EndBtn'),
    audioSettings: $('connect6AudioSettings'),
    settingsBtn: $('connect6SettingsBtn'), settingsModal: $('connect6SettingsModal'),
    turnBadge: $('connect6TurnBadge'), moveCount: $('connect6MoveCount'), remaining: $('connect6Remaining'),
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

/** 最後落下的一子：優先取本回合 pending 尾端，否則取上一個已提交回合的最後一子。 */
function lastPlaced() {
  if (pending.length) { const p = pending[pending.length - 1]; return [p.r, p.c]; }
  if (history.length) {
    const t = history[history.length - 1];
    const s = t.stones[t.stones.length - 1];
    return [s.r, s.c];
  }
  return null;
}

function view() {
  return {
    board, size, currentPlayer, toPlayColor: currentPlayer, hover,
    lastMove: lastPlaced(),
    pending,
    winningLine,
  };
}

function render() {
  if (!board) return;
  resizeConnect6Canvas(deps, view());
  drawConnect6(deps, view());
}

function updateInfobar() {
  if (dom.turnBadge) {
    dom.turnBadge.textContent = currentPlayer === BLACK ? '黑方' : '白方';
    dom.turnBadge.className = 'turn-badge ' + (currentPlayer === BLACK ? 'black' : 'white');
  }
  if (dom.remaining) dom.remaining.textContent = gameOver ? '0' : String(remaining());
  if (dom.moveCount) dom.moveCount.textContent = String(history.length);
}

function setStatus(msg) {
  updateInfobar();
  if (!dom.status) return;
  if (msg) { dom.status.textContent = msg; return; }
  if (gameOver) {
    dom.status.textContent = winner === null
      ? '和局 — 棋盤已滿'
      : `${winner === BLACK ? '黑方' : '白方'}勝！`;
    showEnd();
  } else {
    const who = currentPlayer === BLACK ? '黑方' : '白方';
    dom.status.textContent = `${who}回合 — 還可下 ${remaining()} 子`;
  }
  if (dom.undo) dom.undo.disabled = aiBusy || (history.length === 0 && pending.length === 0);
}

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

function playEndSound(w) {
  if (mode !== 'pvc') { playSfx('game-win'); return; }
  if (w === null) { playSfx('game-draw'); return; }
  playSfx(w === playerColor ? 'game-win' : 'game-lose');
}

/** 把 pending 收成一筆已提交回合。 */
function commitTurn() {
  history.push({ player: currentPlayer, stones: pending.slice() });
  pending = [];
}

/** 人類在自己回合落一子。回傳 true 表示這一手讓回合結束（提交/勝負）。 */
function placeStone(r, c, player) {
  board[r][c] = player;
  pending.push({ r, c });
  playSfx('stone-place');

  const w = checkWin(board, size, r, c, player);
  if (w.won) {
    commitTurn();
    gameOver = true; winner = player; winningLine = w.line;
    playEndSound(winner);
    return true;
  }
  if (pending.length >= quota()) {
    commitTurn();
    if (isBoardFull(board, size)) {
      gameOver = true; winner = null; playEndSound(winner);
    } else {
      currentPlayer = opponent(player);
    }
    return true;
  }
  return false; // 本回合還要再下一子
}

function newGame() {
  hideEnd();
  board = createBoard(size);
  currentPlayer = BLACK;
  gameOver = false;
  winner = null;
  winningLine = null;
  history = [];
  pending = [];
  hover = null;
  aiBusy = false;
  setStatus();
  render();
  maybeAiMove(); // pvc 玩家執白時，AI（黑）先手
}

function onCellClick(r, c) {
  if (gameOver || aiBusy) return;
  // pvc 回合 guard：只有輪到玩家才允許手動落子。
  if (mode === 'pvc' && currentPlayer !== playerColor) return;

  // 點到本回合已放的 pending 子 → 收回。
  const idx = pending.findIndex((p) => p.r === r && p.c === c);
  if (idx >= 0) {
    board[r][c] = EMPTY;
    pending.splice(idx, 1);
    playSfx('invalid-move');
    hover = null;
    setStatus();
    render();
    return;
  }

  if (!canPlace(board, size, r, c)) {
    showBoardToast(dom.canvas?.parentElement, '此處已有棋子');
    playSfx('invalid-move');
    return;
  }

  hover = null;
  const turnEnded = placeStone(r, c, currentPlayer);
  setStatus();
  render();
  if (turnEnded) maybeAiMove();
}

function maybeAiMove() {
  if (mode !== 'pvc' || gameOver) return;
  if (currentPlayer === playerColor) return; // 不是 AI 回合
  if (aiBusy) return;                        // 已排程／思考中，勿重複排（重入畫面時的防呆）
  aiBusy = true;
  setStatus('電腦思考中…');
  setTimeout(() => {
    if (!isActive() || gameOver || currentPlayer === playerColor) { aiBusy = false; return; }
    const aiPlayer = currentPlayer;
    const q = quota();
    const moves = bestTurn(board, size, aiPlayer, aiLevel, q);
    aiBusy = false;

    if (!moves.length) { // 無手可下
      gameOver = true; winner = null; playEndSound(winner);
      setStatus(); render();
      return;
    }

    // 依序落子；過程中若成六則提早結束（該回合僅提交已落的子）。
    const placed = [];
    for (const m of moves) {
      board[m.r][m.c] = aiPlayer;
      placed.push({ r: m.r, c: m.c });
      playSfx('stone-place');
      const w = checkWin(board, size, m.r, m.c, aiPlayer);
      if (w.won) {
        history.push({ player: aiPlayer, stones: placed });
        gameOver = true; winner = aiPlayer; winningLine = w.line;
        playEndSound(winner);
        setStatus(); render();
        return;
      }
    }
    history.push({ player: aiPlayer, stones: placed });
    if (isBoardFull(board, size)) { gameOver = true; winner = null; playEndSound(winner); }
    else currentPlayer = opponent(aiPlayer);
    setStatus();
    render();
  }, 350);
}

function undo() {
  if (aiBusy) return;
  // 回合進行中（有 pending）：先把本回合已落的子全收回。
  if (pending.length) {
    for (const p of pending) board[p.r][p.c] = EMPTY;
    pending = [];
    setStatus();
    render();
    return;
  }
  if (!history.length) return;

  if (mode === 'pvc') {
    // 退到並包含「玩家最後的回合」，把其後的 AI 回合一起退掉 → 回到玩家可下的時機。
    let removedPlayerTurn = false;
    while (history.length && !removedPlayerTurn) {
      const t = history.pop();
      for (const s of t.stones) board[s.r][s.c] = EMPTY;
      if (t.player === playerColor) removedPlayerTurn = true;
    }
  } else {
    const t = history.pop();
    for (const s of t.stones) board[s.r][s.c] = EMPTY;
  }

  gameOver = false;
  winner = null;
  winningLine = null;
  currentPlayer = history.length ? opponent(history[history.length - 1].player) : BLACK;
  setStatus();
  render();
  // pvc 退空後若仍非玩家回合（玩家執白）→ 讓 AI 補先手。
  if (mode === 'pvc' && !gameOver && currentPlayer !== playerColor) maybeAiMove();
}

// ——— 設定變更 ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = String(playerColor);
  if (dom.level) dom.level.value = String(aiLevel);
  const pvc = mode === 'pvc';
  if (dom.color) dom.color.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  if (dom.level) dom.level.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
}

function openSettings() { applySettingsToControls(); dom.settingsModal?.classList.add('show'); }
function closeSettings() { dom.settingsModal?.classList.remove('show'); }

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
    if (Date.now() - lastTouchAt < 500) return;
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
  dom.settingsBtn?.addEventListener('click', () => openSettings());
  dom.settingsModal?.addEventListener('click', (e) => { if (e.target === dom.settingsModal) closeSettings(); });
  dom.settingsModal?.querySelector('[data-close-settings]')?.addEventListener('click', () => closeSettings());

  window.addEventListener('resize', () => { if (isActive()) render(); });
}

// ——— 進入（畫面顯隱由 main.js 路由統一管理）———

export async function enterConnect6Mode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 24, cellSize: 24, scheduleRedraw: () => render() };
    applySettingsToControls();
    wireEvents();
    renderAudioControls(dom.audioSettings);
    initialized = true;
  }
  loadSfxPack('gomoku');
  loadSfxPack('common');
  if (!board) newGame();
  else { render(); maybeAiMove(); } // 重入既有對局：若在 AI 思考中離開過（timeout 已放棄該回合），回來時續排 AI，避免卡死
}

export const Connect6Mode = { enterConnect6Mode };
