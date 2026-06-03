/**
 * 死活練習模式控制器。
 *
 * 與對弈完全獨立：自己管狀態、自己的 #tsumegoScreen 畫面與 #tsumegoBoard canvas。
 * 重用純邏輯 tsumego.js（解析／判定／裁切）、tsumego-ui.js（裁切渲染）、
 * tsumego-progress.js（進度）。
 *
 * 題庫資料由 build-tsumego.js 產生於 public/tsumego/（index.json + 各級別檔）。
 */
import { BLACK, WHITE, EMPTY } from './rules.js';
import { parseProblem, buildBoardFromProblem, checkAnswer, computeViewport } from './tsumego.js';
import { resizeTsumegoCanvas, drawTsumego } from './tsumego-ui.js';
import {
  loadProgress, saveProgress, recordResult, setLastIndex, getLastIndex,
  solvedCount, isSolved
} from './tsumego-progress.js';

const VIEWPORT_MARGIN = 2;

let initialized = false;
let levels = [];          // index.json 的 levels
const levelCache = {};    // levelId -> 該級別題目陣列（lazy fetch）
let progress = {};

// 目前題目狀態
let curLevelId = null;
let curIndex = 0;
let curRaw = null;
let curProblem = null;
let curBoard = null;
let viewport = null;
let toPlayColor = BLACK;
let status = 'playing';    // playing | correct | wrong | revealed
let wrongThisProblem = false;
let markers = [];
let hover = null;

let dom = {};
let deps = null;

function $(id) { return document.getElementById(id); }

function cacheDom() {
  dom = {
    screen: $('tsumegoScreen'),
    levels: $('tsumegoLevels'),
    problemNo: $('tsumegoProblemNo'),
    toPlay: $('tsumegoToPlay'),
    solvedTag: $('tsumegoSolvedTag'),
    canvas: $('tsumegoBoard'),
    statusEl: $('tsumegoStatus'),
    prev: $('tsumegoPrev'),
    next: $('tsumegoNext'),
    redo: $('tsumegoRedo'),
    reveal: $('tsumegoReveal'),
    home: $('tsumegoHome')
  };
}

async function ensureInit() {
  if (initialized) return;
  cacheDom();
  progress = loadProgress();
  const res = await fetch('tsumego/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('無法載入題庫索引');
  const index = await res.json();
  levels = index.levels || [];
  deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 30, cellSize: 30 };
  renderLevelButtons();
  wireEvents();
  initialized = true;
}

async function loadLevel(levelId) {
  if (levelCache[levelId]) return levelCache[levelId];
  const meta = levels.find(l => l.id === levelId);
  if (!meta) throw new Error(`未知級別：${levelId}`);
  const res = await fetch(`tsumego/${meta.file}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`無法載入級別：${levelId}`);
  levelCache[levelId] = await res.json();
  return levelCache[levelId];
}

// ——— 畫面更新 ———

function renderLevelButtons() {
  dom.levels.innerHTML = '';
  for (const lv of levels) {
    const btn = document.createElement('button');
    btn.className = 'tsumego-level' + (lv.id === curLevelId ? ' active' : '');
    const solved = solvedCount(progress, lv.id);
    btn.textContent = `${lv.name}（${solved}/${lv.count}）`;
    btn.addEventListener('click', () => selectLevel(lv.id, true));
    dom.levels.appendChild(btn);
  }
}

function view() {
  return { board: curBoard, size: curProblem.size, viewport, toPlayColor, markers, hover };
}

function render() {
  if (!curProblem) return;
  resizeTsumegoCanvas(deps, view());
  drawTsumego(deps, view());
}

function updateMeta() {
  const total = levelCache[curLevelId].length;
  dom.problemNo.textContent = `第 ${curIndex + 1} / ${total} 題`;
  dom.toPlay.textContent = curProblem.toPlay === 'B' ? '⚫ 黑先' : '⚪ 白先';
  dom.solvedTag.textContent = isSolved(progress, curLevelId, curRaw.id) ? '已解出' : '';
  dom.prev.disabled = curIndex <= 0;
  dom.next.disabled = curIndex >= total - 1;
}

function setStatusMsg(msg, kind) {
  dom.statusEl.textContent = msg;
  dom.statusEl.className = 'tsumego-status' + (kind ? ' ' + kind : '');
}

function defaultStatusMsg() {
  setStatusMsg(curProblem.toPlay === 'B' ? '輪到黑方，找出關鍵點' : '輪到白方，找出關鍵點', '');
}

// ——— 流程 ———

async function selectLevel(levelId, resume) {
  await loadLevel(levelId);
  curLevelId = levelId;
  const total = levelCache[levelId].length;
  curIndex = resume ? Math.min(getLastIndex(progress, levelId), total - 1) : 0;
  if (curIndex < 0) curIndex = 0;
  renderLevelButtons();
  showProblem();
}

function showProblem() {
  curRaw = levelCache[curLevelId][curIndex];
  curProblem = parseProblem(curRaw);
  curBoard = buildBoardFromProblem(curProblem);
  viewport = computeViewport(curProblem, VIEWPORT_MARGIN);
  toPlayColor = curProblem.toPlay === 'B' ? BLACK : WHITE;
  status = 'playing';
  wrongThisProblem = false;
  markers = [];
  hover = null;

  progress = setLastIndex(progress, curLevelId, curIndex);
  saveProgress(progress);

  updateMeta();
  defaultStatusMsg();
  render();
}

function onCellClick(row, col) {
  if (!curProblem || status === 'correct') return;
  if (!inViewport(row, col)) return;
  if (curBoard[row][col] !== EMPTY) return;

  if (checkAnswer(curProblem, row, col)) {
    curBoard[row][col] = toPlayColor;
    markers = [{ row, col, type: 'correct' }];
    status = 'correct';
    progress = recordResult(progress, curLevelId, curRaw.id, 'correct');
    saveProgress(progress);
    setStatusMsg(wrongThisProblem ? '正解！' : '正解！一次就對', 'correct');
    renderLevelButtons();
    updateMeta();
  } else {
    markers = [{ row, col, type: 'wrong' }];
    status = 'wrong';
    if (!wrongThisProblem) {
      wrongThisProblem = true;
      progress = recordResult(progress, curLevelId, curRaw.id, 'attempted');
      saveProgress(progress);
    }
    setStatusMsg('不是這手，再試試（可按「看答案」）', 'wrong');
  }
  render();
}

function reveal() {
  if (!curProblem) return;
  markers = curProblem.answers.map(a => ({ row: a.row, col: a.col, type: 'answer' }));
  status = 'revealed';
  if (!isSolved(progress, curLevelId, curRaw.id)) {
    progress = recordResult(progress, curLevelId, curRaw.id, 'revealed');
    saveProgress(progress);
    renderLevelButtons();
  }
  const n = curProblem.answers.length;
  setStatusMsg(n > 1 ? `正解（藍圈，共 ${n} 個關鍵點任一即可）` : '正解（藍圈處）', 'answer');
  render();
}

function redo() {
  if (!curProblem) return;
  curBoard = buildBoardFromProblem(curProblem);
  status = 'playing';
  markers = [];
  hover = null;
  defaultStatusMsg();
  render();
}

function go(delta) {
  const total = levelCache[curLevelId].length;
  const next = curIndex + delta;
  if (next < 0 || next >= total) return;
  curIndex = next;
  showProblem();
}

// ——— 互動 ———

function inViewport(row, col) {
  return row >= viewport.minRow && row <= viewport.maxRow &&
         col >= viewport.minCol && col <= viewport.maxCol;
}

function cellFromEvent(e) {
  const rect = dom.canvas.getBoundingClientRect();
  const pt = e.touches?.[0] || e.changedTouches?.[0] || e;
  const scaleX = rect.width > 0 ? dom.canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? dom.canvas.height / rect.height : 1;
  const mx = (pt.clientX - rect.left) * scaleX;
  const my = (pt.clientY - rect.top) * scaleY;
  const col = viewport.minCol + Math.round((mx - deps.padding) / deps.cellSize);
  const row = viewport.minRow + Math.round((my - deps.padding) / deps.cellSize);
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
    if (status !== 'playing') { if (hover) { hover = null; render(); } return; }
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null;
      hover = cellFromEvent(e);
      render();
    });
  });
  dom.canvas.addEventListener('mouseleave', () => { hover = null; render(); });

  dom.prev.addEventListener('click', () => go(-1));
  dom.next.addEventListener('click', () => go(1));
  dom.redo.addEventListener('click', redo);
  dom.reveal.addEventListener('click', reveal);
  dom.home.addEventListener('click', () => { location.hash = '#home'; });

  window.addEventListener('resize', () => { if (isActive()) render(); });
}

function isActive() {
  return dom.screen && dom.screen.style.display !== 'none';
}

// ——— 進入（畫面顯隱由 main.js 的路由統一管理）———

export async function enterTsumegoMode() {
  try {
    await ensureInit();
  } catch (err) {
    console.error('Tsumego init failed:', err);
    alert('死活題庫載入失敗，請重新整理頁面再試。');
    location.hash = '#home';
    return;
  }
  dom.screen.style.display = 'flex';

  if (!curLevelId) {
    await selectLevel(resumeLevelId(), true);
  } else {
    render();
  }
}

/** 目前死活進度（給首頁顯示用）：回傳已解總題數。 */
export function tsumegoSolvedTotal() {
  const p = loadProgress();
  return Object.keys(p).reduce((sum, lvId) => sum + solvedCount(p, lvId), 0);
}

/** 解過最多題的級別優先當「繼續上次」，否則入門。 */
function resumeLevelId() {
  let best = levels[0]?.id || 'beginner';
  let bestN = -1;
  for (const lv of levels) {
    const n = solvedCount(progress, lv.id) + getLastIndex(progress, lv.id);
    if (n > bestN) { bestN = n; best = lv.id; }
  }
  return best;
}

export const TsumegoMode = { enterTsumegoMode, tsumegoSolvedTotal };
