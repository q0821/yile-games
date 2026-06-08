// xiangqi-mode.js — 象棋模式控制器（比照 gomoku-mode）。
//
// 自管狀態與事件，畫面顯隱由 main.js 路由統一管理。棋規用 xiangqi-game（ffish），
// AI 用 xiangqi-engine（Fairy-Stockfish）。兩個 WASM 延遲載入：進模式先載 ffish 顯示盤面，
// 引擎在第一手 AI 才載（省首次進場等待）。
import * as Game from './xiangqi-game.js';
import * as Engine from './xiangqi-engine.js';
import { resizeXiangqiCanvas, drawXiangqi } from './xiangqi-ui.js';

const SETTINGS_KEY = 'xiangqi-settings-v1';

let initialized = false;
let wired = false;
let dom = {};
let deps = null;

// ——— 對局狀態 ———
let selected = null;       // 選取的 square
let legalTargets = null;   // 目的 square 陣列
let lastMove = null;       // [from, to]
let aiBusy = false;
let gameOver = false;
let boardReady = false;

// ——— 設定 ———
let mode = 'pvc';          // 'pvc' | 'pvp'
let playerRed = true;      // pvc 時玩家是否執紅（先手）
let level = 2;             // 1..3

const $ = (id) => document.getElementById(id);

function cacheDom() {
  dom = {
    screen: $('xiangqiScreen'), canvas: $('xiangqiBoard'), status: $('xiangqiStatus'),
    restart: $('xiangqiRestart'), home: $('xiangqiHome'),
    mode: $('xiangqiMode'), color: $('xiangqiColor'), level: $('xiangqiLevel'),
  };
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.mode === 'pvp' || s.mode === 'pvc') mode = s.mode;
      if (typeof s.playerRed === 'boolean') playerRed = s.playerRed;
      if (s.level >= 1 && s.level <= 3) level = s.level;
    }
  } catch { /* ignore */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, playerRed, level })); } catch { /* ignore */ }
}

function isActive() { return dom.screen && dom.screen.style.display !== 'none'; }
function isPlayerTurn() { return mode === 'pvp' || Game.turn() === playerRed; }

// ——— 渲染 ———

function view() {
  return {
    grid: Game.piecesGrid(),
    selected, legalTargets, lastMove,
    rc: (sq) => Game.squareToRC(sq),
  };
}

function render() {
  if (!boardReady) return;
  const w = Math.min((dom.canvas.parentElement?.clientWidth || window.innerWidth) - 8, window.innerWidth - 32);
  resizeXiangqiCanvas(deps, w);
  drawXiangqi(deps, view());
}

function setStatus(msg) {
  if (!dom.status) return;
  if (msg) { dom.status.textContent = msg; return; }
  if (gameOver) {
    const r = Game.result();
    dom.status.textContent = r === '1-0' ? '紅方勝！' : r === '0-1' ? '黑方勝！' : '和局';
    return;
  }
  const who = Game.turn() ? '紅方' : '黑方';
  dom.status.textContent = Game.isCheck() ? `${who}回合 — 將軍！` : `${who}回合`;
}

// ——— 對局邏輯 ———

function clearSelection() { selected = null; legalTargets = null; }

function doMove(uci) {
  if (!Game.move(uci)) return false;
  lastMove = [uci.slice(0, 2), uci.slice(2, 4)];
  clearSelection();
  gameOver = Game.isGameOver();
  setStatus();
  render();
  return true;
}

function onPoint(row, col) {
  if (gameOver || aiBusy || !boardReady) return;
  if (mode === 'pvc' && !isPlayerTurn()) return;
  const sq = Game.rcToSquare(row, col);
  // 已選子 → 點到合法目的就走
  if (selected && legalTargets && legalTargets.includes(sq)) {
    doMove(selected + sq);
    maybeAiMove();
    return;
  }
  // 否則嘗試選取（只有「輪到的一方」且有合法手的子能選）
  const targets = Game.legalTargetsFrom(sq);
  if (targets.length) { selected = sq; legalTargets = targets; }
  else { clearSelection(); }
  render();
}

function maybeAiMove() {
  if (mode !== 'pvc' || gameOver || isPlayerTurn()) return;
  aiBusy = true;
  setStatus('電腦思考中…');
  setTimeout(async () => {
    try {
      if (!isActive() || gameOver) { aiBusy = false; return; }
      const mv = await Engine.bestMove({ fen: Game.fen(), level });
      aiBusy = false;
      if (mv) doMove(mv);
      else { gameOver = true; setStatus(); }
    } catch (err) {
      aiBusy = false;
      setStatus('AI 出錯：' + (err?.message || err) + '（請重新開始）');
      Engine.reset();
    }
  }, 180);
}

async function newGame() {
  setStatus('載入棋盤中…');
  await Game.ensureReady();
  await Game.newGame();
  boardReady = true;
  clearSelection();
  lastMove = null;
  aiBusy = false;
  gameOver = false;
  setStatus();
  render();
  maybeAiMove(); // pvc 玩家執黑時，紅（AI）先手
}

// ——— 設定 UI ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = playerRed ? 'red' : 'black';
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
  const col = Math.round((mx - deps.padding) / deps.cellSize);
  const row = Math.round((my - deps.padding) / deps.cellSize);
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
  dom.home?.addEventListener('click', () => { location.hash = '#home'; });
  dom.mode?.addEventListener('change', () => { mode = dom.mode.value === 'pvp' ? 'pvp' : 'pvc'; saveSettings(); applySettingsToControls(); newGame(); });
  dom.color?.addEventListener('change', () => { playerRed = dom.color.value !== 'black'; saveSettings(); newGame(); });
  dom.level?.addEventListener('change', () => { level = Math.min(3, Math.max(1, Number(dom.level.value) || 2)); saveSettings(); });
  window.addEventListener('resize', () => { if (isActive()) render(); });
}

// ——— 進入 ———

export async function enterXiangqiMode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 22, cellSize: 32 };
    applySettingsToControls();
    wireEvents();
    initialized = true;
  }
  if (!boardReady) await newGame();
  else render();
}

export const XiangqiMode = { enterXiangqiMode };
