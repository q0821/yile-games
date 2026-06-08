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
let checkRC = null;        // 被將將帥的 {row,col}（將軍高亮）
let aiBusy = false;        // AI 思考中
let moving = false;        // 棋子移動動畫中（鎖操作避免競態）
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
    restart: $('xiangqiRestart'), undo: $('xiangqiUndo'), home: $('xiangqiHome'),
    mode: $('xiangqiMode'), color: $('xiangqiColor'), level: $('xiangqiLevel'),
    thinking: $('xiangqiThinking'), checkBanner: $('xiangqiCheck'),
    endOverlay: $('xiangqiEnd'), endTitle: $('xiangqiEndTitle'), endSub: $('xiangqiEndSub'), endBtn: $('xiangqiEndBtn'),
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
    selected, legalTargets, lastMove, checkRC,
    rc: (sq) => Game.squareToRC(sq),
  };
}

/** 重算尺寸 + 重畫（一般用）。
 *  寬度量測來源用 screen 容器（非 canvas 的 inline-block wrap，否則會回饋縮小）。 */
function render() {
  if (!boardReady) return;
  const avail = (dom.screen?.clientWidth || window.innerWidth) - 24;
  const w = Math.min(avail, window.innerWidth - 32, 480);
  resizeXiangqiCanvas(deps, w);
  drawXiangqi(deps, view());
}

/** 只重畫（不重算尺寸），可帶覆寫（動畫用，避免每幀 resize 抖動）。 */
function draw(extra) {
  if (!boardReady) return;
  drawXiangqi(deps, { ...view(), ...(extra || {}) });
}

function pixelOf(sq) {
  const { row, col } = Game.squareToRC(sq);
  return { x: deps.padding + col * deps.cellSize, y: deps.padding + row * deps.cellSize };
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
  void dom.checkBanner.offsetWidth; // reflow 重啟動畫
  dom.checkBanner.classList.add('show');
}

function showEnd() {
  if (!dom.endOverlay) return;
  const r = Game.result();
  const title = r === '1-0' ? '紅方勝' : r === '0-1' ? '黑方勝' : '和局';
  let sub = '';
  if (mode === 'pvc' && r !== '1/2-1/2') sub = ((r === '1-0') === playerRed) ? '你贏了！' : '電腦獲勝';
  if (dom.endTitle) dom.endTitle.textContent = title;
  if (dom.endSub) dom.endSub.textContent = sub;
  dom.endOverlay.style.display = 'flex';
}
function hideEnd() { if (dom.endOverlay) dom.endOverlay.style.display = 'none'; }

/** 更新悔棋按鈕可用狀態（思考/動畫/無手/結束時不可悔）。 */
function updateUndoBtn() {
  if (!dom.undo) return;
  dom.undo.disabled = !boardReady || aiBusy || moving || gameOver || Game.gamePly() === 0;
}

/** 悔棋：pvc 退回玩家可下的時機（連 AI 那手一起退）。 */
function undoMove() {
  if (aiBusy || moving || !boardReady || Game.gamePly() === 0) return;
  Game.undo();
  // pvc 若退完仍非玩家回合（剛退掉的是玩家手、輪到玩家對手）→ 再退一手回到玩家
  if (mode === 'pvc' && Game.gamePly() > 0 && Game.turn() !== playerRed) Game.undo();
  gameOver = false;
  hideEnd();
  clearSelection();
  const lm = Game.lastMoveUci();
  lastMove = lm ? [Game.splitMove(lm).from, Game.splitMove(lm).to] : null;
  updateCheck();
  setStatus();
  render();
  // 玩家執黑、退到開局（輪到紅=AI）→ 讓 AI 重新先手
  if (mode === 'pvc' && !gameOver && Game.turn() !== playerRed) maybeAiMove();
}

function setStatus(msg) {
  updateUndoBtn();
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

const MOVE_ANIM_MS = 280;

/** 以「目前（落子前）局面 + 隱藏起點格 + 浮動棋子」插值滑動。 */
function animateMove(uci) {
  return new Promise((resolve) => {
    const { from: fromSq, to: toSq } = Game.splitMove(uci);
    const fromRC = Game.squareToRC(fromSq);
    const grid = Game.piecesGrid();
    const piece = grid[fromRC.row] && grid[fromRC.row][fromRC.col];
    if (!piece) { resolve(); return; }
    const p0 = pixelOf(fromSq), p1 = pixelOf(toSq);
    let start = null;
    const step = (ts) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / MOVE_ANIM_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      drawXiangqi(deps, {
        grid, selected: null, legalTargets: null, lastMove: null, checkRC: null,
        rc: (sq) => Game.squareToRC(sq),
        anim: { hideRow: fromRC.row, hideCol: fromRC.col, piece, x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e },
      });
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function doMove(uci) {
  moving = true;
  clearSelection();
  draw();                 // 先清掉選取/合法點視覺再滑動
  await animateMove(uci);
  const ok = Game.move(uci);
  moving = false;
  if (!ok) { render(); return false; }
  const parts = Game.splitMove(uci);
  lastMove = [parts.from, parts.to];
  gameOver = Game.isGameOver();
  updateCheck();
  setStatus();
  render();
  if (gameOver) showEnd();
  else if (Game.isCheck()) flashCheck();
  return true;
}

async function onPoint(row, col) {
  if (gameOver || aiBusy || moving || !boardReady) return;
  if (mode === 'pvc' && !isPlayerTurn()) return;
  const sq = Game.rcToSquare(row, col);
  // 已選子 → 點到合法目的就走
  if (selected && legalTargets && legalTargets.includes(sq)) {
    await doMove(selected + sq);
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
  showThinking(true);
  setStatus('電腦思考中…');
  // 思考總時間 1.1–2.5 秒：引擎實算不足的差額補等待，讓 AI 有「在想」的感覺。
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
  dom.undo?.addEventListener('click', () => undoMove());
  dom.endBtn?.addEventListener('click', () => newGame());
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
