// othello-mode.js — 黑白棋模式控制器（比照 gomoku-mode + 象棋那輪 UX：結束卡片、思考延遲、悔棋）。
//
// 自管狀態與事件；畫面顯隱由 main.js 路由統一管理。重用 othello-rules（規則）、othello-ai（AI）、
// othello-ui（渲染）、共用 .board-end 結束卡片。
import { BLACK, WHITE, opponent } from './rules.js';
import { SIZE, newBoard, flips, legalMoves, hasLegalMove, applyMove, score, isGameOver } from './othello-rules.js';
import { bestMove } from './othello-ai.js';
import { resizeOthelloCanvas, drawOthello } from './othello-ui.js';
import { prefersReducedMotion } from './motion.js';
import { loadSfxPack, playSfx } from './audio-manager.js';
import { renderAudioControls } from './audio-settings-ui.js';
import { showBoardToast } from './ui.js';
import { recordGame, totals, formatRecord, loadStats, saveStats } from './stats.js';

const SETTINGS_KEY = 'othello-settings-v1';

let initialized = false;
let wired = false;
let dom = {};
let deps = null;

// ——— 對局狀態 ———
const size = SIZE;
let board = null;
let currentPlayer = BLACK;
let gameOver = false;
let winner = null;          // BLACK | WHITE | null
let lastMove = null;        // [r,c]
let passNotice = null;
let aiBusy = false;
let animating = false;      // 翻子動畫中（鎖操作）
let history = [];           // 狀態快照堆疊（悔棋用）

// ——— 設定 ———
let mode = 'pvc';           // 'pvc' | 'pvp'
let playerColor = BLACK;    // pvc 玩家執子
let level = 2;              // 1..3

const $ = (id) => document.getElementById(id);

function cacheDom() {
  dom = {
    screen: $('othelloScreen'), canvas: $('othelloBoard'), status: $('othelloStatus'),
    thinking: $('othelloThinking'), restart: $('othelloRestart'), undo: $('othelloUndo'), home: $('othelloHome'),
    mode: $('othelloMode'), color: $('othelloColor'), level: $('othelloLevel'),
    end: $('othelloEnd'), endTitle: $('othelloEndTitle'), endSub: $('othelloEndSub'), endBtn: $('othelloEndBtn'),
    endStats: $('othelloEndStats'),
    audioSettings: $('othelloAudioSettings'),
    settingsBtn: $('othelloSettingsBtn'), settingsModal: $('othelloSettingsModal'),
    turnBadge: $('othelloTurnBadge'), blackCount: $('othelloBlackCount'), whiteCount: $('othelloWhiteCount'),
  };
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.mode === 'pvp' || s.mode === 'pvc') mode = s.mode;
      if (s.playerColor === BLACK || s.playerColor === WHITE) playerColor = s.playerColor;
      if (s.level >= 1 && s.level <= 3) level = s.level;
    }
  } catch { /* ignore */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, playerColor, level })); } catch { /* ignore */ }
}

function isActive() { return dom.screen && dom.screen.style.display !== 'none'; }
function isPlayerTurn() { return mode === 'pvp' || currentPlayer === playerColor; }

// ——— 渲染 ———

function view() {
  return {
    board, size, lastMove,
    legalMoves: gameOver || aiBusy ? null : (isPlayerTurn() ? legalMoves(board, size, currentPlayer) : null),
  };
}
function render() {
  if (!board) return;
  const w = Math.min((dom.screen?.clientWidth || window.innerWidth) - 24, window.innerWidth - 32, 480);
  resizeOthelloCanvas(deps, w);
  drawOthello(deps, view());
}

/** 資訊列：回合徽章 + 雙方子數（PRD §7：黑白棋子數從狀態文字移入資訊列）。 */
function updateInfobar() {
  const s = score(board, size);
  if (dom.turnBadge) {
    dom.turnBadge.textContent = currentPlayer === BLACK ? '黑方' : '白方';
    dom.turnBadge.className = 'turn-badge ' + (currentPlayer === BLACK ? 'black' : 'white');
  }
  if (dom.blackCount) dom.blackCount.textContent = String(s.black);
  if (dom.whiteCount) dom.whiteCount.textContent = String(s.white);
}

function setStatus(msg) {
  updateInfobar();
  if (!dom.status) return;
  if (msg) { dom.status.textContent = msg; return; }
  if (gameOver) {
    dom.status.textContent = winner === null ? '和局' : (winner === BLACK ? '黑方勝' : '白方勝');
  } else {
    const who = currentPlayer === BLACK ? '黑方' : '白方';
    dom.status.textContent = `${who}回合` + (passNotice ? `（${passNotice}）` : '');
  }
  if (dom.undo) dom.undo.disabled = aiBusy || history.length === 0;
}

function showThinking(b) { if (dom.thinking) dom.thinking.style.display = b ? 'inline-flex' : 'none'; }

// ——— 結束畫面（共用 .board-end）———

function showEnd() {
  if (!dom.end) return;
  const s = score(board, size);
  dom.endTitle.textContent = winner === null ? '和局' : (winner === BLACK ? '黑方勝' : '白方勝');
  let sub = `黑 ${s.black}：白 ${s.white}`;
  if (mode === 'pvc' && winner !== null) sub += '　' + (winner === playerColor ? '你贏了！' : '電腦獲勝');
  dom.endSub.textContent = sub;
  dom.end.style.display = 'flex';
}
function hideEnd() { if (dom.end) dom.end.style.display = 'none'; }

// ——— 對局邏輯 ———

function snapshot() { return { board: board.map((r) => r.slice()), player: currentPlayer, last: lastMove ? lastMove.slice() : null }; }
function restore(s) { board = s.board.map((r) => r.slice()); currentPlayer = s.player; lastMove = s.last; gameOver = false; winner = null; passNotice = null; }

/** PvP 一律播「勝」音（無輸家視角）；PvC 依人類玩家是否為贏家算 win/lose，winner 為 null 代表和局
 *  （winner 已依終局子數多寡判定，見 advanceTurn）。
 *  終局單次觸發點（每局只會經此函式一次）：一併記錄對電腦累計戰績並更新結束卡片文字。 */
function playEndSound(w) {
  if (mode !== 'pvc') {
    playSfx('game-win');
    if (dom.endStats) dom.endStats.textContent = '';
    return;
  }
  const outcome = w === null ? 'draw' : (w === playerColor ? 'win' : 'loss');
  playSfx(outcome === 'draw' ? 'game-draw' : (outcome === 'win' ? 'game-win' : 'game-lose'));
  const s = recordGame(loadStats(), 'othello', outcome);
  saveStats(s);
  if (dom.endStats) dom.endStats.textContent = formatRecord(totals(s, 'othello'));
}

/** 一方剛走完後決定下一回合（含 pass / 終局）。 */
function advanceTurn(justMoved) {
  const opp = opponent(justMoved);
  passNotice = null;
  if (hasLegalMove(board, size, opp)) {
    currentPlayer = opp;
  } else if (hasLegalMove(board, size, justMoved)) {
    currentPlayer = justMoved;
    passNotice = (opp === BLACK ? '黑方' : '白方') + '無合法手，跳過';
    playSfx('pass');
  } else {
    gameOver = true;
    const s = score(board, size);
    winner = s.black > s.white ? BLACK : s.white > s.black ? WHITE : null;
    playEndSound(winner);
  }
}

const FLIP_ANIM_MS = 300;

/** 翻子動畫：被翻子水平縮放換色、落子 pop-in；board 已更新。 */
function animateFlips(flipped, place, player) {
  return new Promise((resolve) => {
    // prefers-reduced-motion：跳過翻子/落子過場，board 已是終態，呼叫端隨後會 render() 畫出來
    if (prefersReducedMotion()) { resolve(); return; }
    const set = new Set(flipped.map(([r, c]) => r + ',' + c));
    const black = player === BLACK;
    let start = null, done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const step = (ts) => {
      if (done) return;
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / FLIP_ANIM_MS);
      drawOthello(deps, { board, size, lastMove: null, legalMoves: null, anim: { set, place, black, t } });
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    // 保險：rAF 在分頁背景會暫停，timeout 確保流程一定能繼續（不卡死）
    setTimeout(finish, FLIP_ANIM_MS + 400);
  });
}

async function makeMove(r, c, player) {
  history.push(snapshot());
  const flipped = applyMove(board, size, r, c, player);
  lastMove = [r, c];
  playSfx('stone-place'); // 使用者偏好：沿用圍棋落子音（原 othello-flip 棄用）
  animating = true;
  await animateFlips(flipped, [r, c], player);
  animating = false;
  advanceTurn(player);
}

async function onCellClick(r, c) {
  if (gameOver || aiBusy || animating || !board) return;
  if (mode === 'pvc' && !isPlayerTurn()) return;
  if (!flips(board, size, r, c, currentPlayer).length) {
    // 非合法手：黑白棋最常見的無聲失敗（點了不能翻子的格）
    showBoardToast(dom.canvas?.parentElement, '此處無法落子（不能翻子）');
    playSfx('invalid-move');
    return;
  }
  await makeMove(r, c, currentPlayer);
  setStatus();
  render();
  if (gameOver) { showEnd(); return; }
  maybeAiMove();
}

function maybeAiMove() {
  if (mode !== 'pvc' || gameOver || isPlayerTurn()) return;
  if (aiBusy) return;                         // 已排程／思考中，勿重複排（重入畫面時的防呆）
  aiBusy = true;
  showThinking(true);
  setStatus('電腦思考中…');
  const minDelay = 700 + Math.floor(Math.random() * 1100); // 0.7–1.8s
  const t0 = performance.now();
  // 放 setTimeout 讓 UI 先更新；AI 計算同步但 Othello 夠快
  setTimeout(() => {
    if (!isActive() || gameOver || isPlayerTurn()) { aiBusy = false; showThinking(false); return; }
    let mv = null;
    try { mv = bestMove(board, size, currentPlayer, level); } catch { mv = null; }
    const finish = async () => {
      aiBusy = false;
      showThinking(false);
      if (mv) {
        await makeMove(mv.r, mv.c, currentPlayer);
        setStatus();
        render();
        if (gameOver) { showEnd(); return; }
        maybeAiMove(); // 玩家被迫 pass → AI 連走
      } else {
        setStatus();
      }
    };
    const rest = minDelay - (performance.now() - t0);
    if (rest > 0) setTimeout(finish, rest); else finish();
  }, 40);
}

function undo() {
  if (aiBusy || animating || !history.length) return;
  restore(history.pop());
  if (mode === 'pvc') {
    // 退到玩家可下的時機（連電腦那手一起退）
    while (history.length && currentPlayer !== playerColor) restore(history.pop());
  }
  hideEnd();
  setStatus();
  render();
  // pvc 退到開局後若仍非玩家回合（玩家執白）→ 讓 AI 補先手
  if (mode === 'pvc' && !gameOver && currentPlayer !== playerColor) maybeAiMove();
}

function newGame() {
  hideEnd();
  showThinking(false);
  board = newBoard(size);
  currentPlayer = BLACK;
  gameOver = false;
  winner = null;
  lastMove = null;
  passNotice = null;
  aiBusy = false;
  history = [];
  setStatus();
  render();
  maybeAiMove(); // pvc 玩家執白時，黑（AI）先手
}

// ——— 設定 UI ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = String(playerColor);
  if (dom.level) dom.level.value = String(level);
  const pvc = mode === 'pvc';
  dom.color?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  dom.level?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
}

// ——— 設定彈窗（比照三棋，沿用同一份 .go-settings-modal 樣式） ———
function openSettings() { applySettingsToControls(); dom.settingsModal?.classList.add('show'); }
function closeSettings() { dom.settingsModal?.classList.remove('show'); }

// ——— 事件 ———

function cellFromEvent(e) {
  const rect = dom.canvas.getBoundingClientRect();
  const pt = e.changedTouches?.[0] || e.touches?.[0] || e;
  const mx = pt.clientX - rect.left - deps.padding;
  const my = pt.clientY - rect.top - deps.padding;
  const col = Math.floor(mx / deps.cellSize);
  const row = Math.floor(my / deps.cellSize);
  if (col < 0 || col >= size || row < 0 || row >= size) return null;
  return { row, col };
}

function wireEvents() {
  if (wired) return;
  wired = true;
  let lastTouchAt = 0;
  dom.canvas.addEventListener('click', (e) => {
    if (Date.now() - lastTouchAt < 500) return;
    const p = cellFromEvent(e); if (p) onCellClick(p.row, p.col);
  });
  dom.canvas.addEventListener('touchend', (e) => {
    lastTouchAt = Date.now(); e.preventDefault();
    const p = cellFromEvent(e); if (p) onCellClick(p.row, p.col);
  }, { passive: false });

  dom.restart?.addEventListener('click', () => newGame());
  dom.undo?.addEventListener('click', () => undo());
  dom.endBtn?.addEventListener('click', () => newGame());
  dom.home?.addEventListener('click', () => { location.hash = '#home'; });
  dom.mode?.addEventListener('change', () => { mode = dom.mode.value === 'pvp' ? 'pvp' : 'pvc'; saveSettings(); applySettingsToControls(); newGame(); });
  dom.color?.addEventListener('change', () => { playerColor = Number(dom.color.value) === WHITE ? WHITE : BLACK; saveSettings(); newGame(); });
  dom.level?.addEventListener('change', () => { level = Math.min(3, Math.max(1, Number(dom.level.value) || 2)); saveSettings(); });
  dom.settingsBtn?.addEventListener('click', () => openSettings());
  dom.settingsModal?.addEventListener('click', (e) => { if (e.target === dom.settingsModal) closeSettings(); });
  dom.settingsModal?.querySelector('[data-close-settings]')?.addEventListener('click', () => closeSettings());
  window.addEventListener('resize', () => { if (isActive()) render(); });
}

// ——— 進入 ———

export async function enterOthelloMode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), size, padding: 10, cellSize: 40 };
    applySettingsToControls();
    wireEvents();
    renderAudioControls(dom.audioSettings);
    initialized = true;
  }
  loadSfxPack('othello');
  loadSfxPack('common');
  if (!board) newGame();
  else { render(); maybeAiMove(); } // 重入既有對局：若在 AI 思考中離開過（timeout 已放棄該回合），回來時續排 AI，避免卡死
}

export const OthelloMode = { enterOthelloMode };
