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
  solvedCount, isSolved, firstTryRate, streak, bestStreak, dailyCount,
  reviewIds, reviewCount, totalSolved
} from './tsumego-progress.js';

/** 本地日期 yyyy-mm-dd（給「今日題數」用；放在這層而非純 reducer，保 reducer 可測）。 */
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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

// 練習模式與播放清單（order = 要走訪的題目 index 陣列；sequential 時為 0..total-1）
let practiceMode = 'sequential';   // sequential | random | unsolved | review
let order = [];
let orderPos = 0;

let dom = {};
let deps = null;

function $(id) { return document.getElementById(id); }

function cacheDom() {
  dom = {
    screen: $('tsumegoScreen'),
    levels: $('tsumegoLevels'),
    practice: $('tsumegoPractice'),
    stats: $('tsumegoStats'),
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

const PRACTICE_MODES = [
  { id: 'sequential', label: '順序' },
  { id: 'random',     label: '隨機' },
  { id: 'unsolved',   label: '只練未解' },
  { id: 'review',     label: '複習錯題' },
];

function renderPractice() {
  if (!dom.practice) return;
  dom.practice.innerHTML = '';
  for (const m of PRACTICE_MODES) {
    const btn = document.createElement('button');
    btn.className = 'tsumego-practice-btn' + (m.id === practiceMode ? ' active' : '');
    const count = m.id === 'review' && curLevelId ? reviewCount(progress, curLevelId) : 0;
    btn.textContent = m.id === 'review' && count > 0 ? `${m.label}（${count}）` : m.label;
    btn.addEventListener('click', () => setPractice(m.id));
    dom.practice.appendChild(btn);
  }
}

/** 更新統計列：本級一次過率、全域連勝、今日題數。 */
function updateStats() {
  if (!dom.stats || !curLevelId) return;
  const rate = Math.round(firstTryRate(progress, curLevelId) * 100);
  const sk = streak(progress);
  const best = bestStreak(progress);
  const today = dailyCount(progress, todayStr());
  const skText = best > 0 ? `連勝 ${sk}（最佳 ${best}）` : `連勝 ${sk}`;
  dom.stats.textContent = `本級一次過 ${rate}%　・　${skText}　・　今日 ${today} 題`;
}

/** 依練習模式建立要走訪的題目 index 清單。回傳 [] 表示該模式目前沒有題（例如沒有錯題）。 */
function buildOrder(mode) {
  const arr = levelCache[curLevelId] || [];
  const total = arr.length;
  if (mode === 'unsolved') {
    return arr.map((p, i) => i).filter(i => !isSolved(progress, curLevelId, arr[i].id));
  }
  if (mode === 'review') {
    const ids = new Set(reviewIds(progress, curLevelId));
    return arr.map((p, i) => i).filter(i => ids.has(arr[i].id));
  }
  const seq = arr.map((p, i) => i);
  if (mode === 'random') {
    // Fisher–Yates；隨機性放在這層、不進純 reducer
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
  }
  return seq;
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
  const total = order.length;
  const levelTotal = levelCache[curLevelId].length;
  // 順序模式顯示題號即題庫序；其他模式顯示在本清單的進度
  const label = practiceMode === 'sequential'
    ? `第 ${curIndex + 1} / ${levelTotal} 題`
    : `第 ${orderPos + 1} / ${total} 題（${labelOf(practiceMode)}）`;
  dom.problemNo.textContent = label;
  dom.toPlay.textContent = curProblem.toPlay === 'B' ? '黑先' : '白先';
  dom.solvedTag.textContent = isSolved(progress, curLevelId, curRaw.id) ? '已解出' : '';
  dom.prev.disabled = orderPos <= 0;
  dom.next.disabled = orderPos >= total - 1;
  updateStats();
}

function labelOf(mode) {
  return (PRACTICE_MODES.find(m => m.id === mode) || {}).label || '';
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
  practiceMode = 'sequential';
  order = buildOrder('sequential');
  const total = order.length;
  const resumeIdx = resume ? Math.min(getLastIndex(progress, levelId), total - 1) : 0;
  orderPos = resumeIdx >= 0 ? resumeIdx : 0;   // sequential 時 order 為 identity，pos == index
  curIndex = order[orderPos] ?? 0;
  renderLevelButtons();
  renderPractice();
  showProblem();
}

/** 切換練習模式：重建播放清單並跳到第一題；清單為空（如無錯題）時提示、不換題。 */
function setPractice(mode) {
  if (!curLevelId) return;
  const next = buildOrder(mode);
  if (next.length === 0) {
    const msg = mode === 'review'
      ? '目前沒有要複習的錯題，太好了'
      : (mode === 'unsolved' ? '這個級別已全部解出' : '沒有可練習的題目');
    setStatusMsg(msg, 'correct');
    return;
  }
  practiceMode = mode;
  order = next;
  orderPos = 0;
  curIndex = order[0];
  renderPractice();
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
    const wasSolved = isSolved(progress, curLevelId, curRaw.id);
    curBoard[row][col] = toPlayColor;
    markers = [{ row, col, type: 'correct' }];
    status = 'correct';
    progress = recordResult(progress, curLevelId, curRaw.id, 'correct',
      { clean: !wrongThisProblem, today: todayStr() });
    saveProgress(progress);
    setStatusMsg(wrongThisProblem ? '正解！' : '正解！一次就對', 'correct');
    renderLevelButtons();
    renderPractice();
    updateMeta();
    // 里程碑：本級全部解出（剛好在這手解完最後一題時提示）
    if (!wasSolved && solvedCount(progress, curLevelId) === levelCache[curLevelId].length) {
      const lvName = (levels.find(l => l.id === curLevelId) || {}).name || '本級';
      setStatusMsg(`太好了，${lvName} 全部解出！`, 'correct');
    }
  } else {
    markers = [{ row, col, type: 'wrong' }];
    status = 'wrong';
    if (!wrongThisProblem) {
      wrongThisProblem = true;
      progress = recordResult(progress, curLevelId, curRaw.id, 'attempted');
      saveProgress(progress);
      renderPractice();   // 進複習佇列 → 更新「複習錯題（N）」
      updateStats();      // 連勝歸零
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
    renderPractice();
    updateStats();
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
  const next = orderPos + delta;
  if (next < 0 || next >= order.length) return;
  orderPos = next;
  curIndex = order[orderPos];
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
  return totalSolved(loadProgress());
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
