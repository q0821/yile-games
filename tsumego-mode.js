/**
 * 死活練習模式控制器。
 *
 * 與對弈完全獨立：自己管狀態、自己的 #tsumegoScreen 畫面與 #tsumegoBoard canvas。
 * 重用純邏輯 tsumego.js（解析／判定／裁切）、tsumego-ui.js（裁切渲染）、
 * tsumego-progress.js（進度）。
 *
 * 題庫資料由 build-tsumego.js 產生於 public/tsumego/（index.json + 各級別檔）。
 */
import { BLACK, WHITE, EMPTY, opponent, cloneBoard, tryPlaceStone } from './rules.js';
import { parseProblem, buildBoardFromProblem, checkAnswer, computeViewport } from './tsumego.js';
import { resizeTsumegoCanvas, drawTsumego } from './tsumego-ui.js';
import { analyzeLocal } from './katago-service.js';
import { loadSfxPack, playSfx } from './audio-manager.js';
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
let status = 'playing';    // playing | correct | wrong | revealed | playout
let wrongThisProblem = false;
let markers = [];
let hover = null;

// ——— 後續手 play-out（S7）狀態：解對第一手後，opt-in 對 KataGo 在局部走完，顯示誠實評估 ———
const PLAYOUT_MAX_PLIES = 40;
let playoutOn = false;        // 是否在 play-out 中
let playoutSeq = 0;           // 序號 guard：切題/退出後讓未回的 analyze 作廢
let playoutTurn = BLACK;      // 目前該誰下（BLACK/WHITE）
let playoutHistory = [];      // [{ x:row, y:col, player }]，給 KataGo recent-move 特徵
let playoutStartBoard = null; // 進 play-out 當下（解對第一手）的盤面快照，退出可還原
let playoutKo = null;         // 劫爭點 [row,col]
let playoutPlies = 0;
let aiBusy = false;           // AI 思考中，鎖玩家落子
let evalWinrate = null;       // KataGo rootWinRate（黑勝率 0..1）；全局值不顯示，保留除錯
let evalOwnership = null;     // KataGo ownership（index = row*size+col）或 null
let playoutHintShown = false; // ownership 說明只在第一個玩家回合提示一次

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
    playout: $('tsumegoPlayout'),
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
  return {
    board: curBoard, size: curProblem.size, viewport, toPlayColor, markers, hover,
    // play-out 才帶 ownership 覆蓋層；非 play-out 為 null（不畫）
    ownership: playoutOn ? evalOwnership : null,
  };
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
  updatePlayoutBtn();
}

/** 後續手按鈕：解對後顯示「試著走完」；play-out 中顯示「停手」；其餘隱藏。 */
function updatePlayoutBtn() {
  if (!dom.playout) return;
  if (status === 'playout') {
    dom.playout.style.display = '';
    dom.playout.textContent = '停手';
    dom.playout.disabled = aiBusy;
  } else if (status === 'correct') {
    dom.playout.style.display = '';
    dom.playout.textContent = '試著走完';
    dom.playout.disabled = false;
  } else {
    dom.playout.style.display = 'none';
  }
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
  resetPlayout();

  progress = setLastIndex(progress, curLevelId, curIndex);
  saveProgress(progress);

  updateMeta();
  defaultStatusMsg();
  render();
}

function onCellClick(row, col) {
  if (!curProblem) return;
  if (status === 'playout') { onPlayoutClick(row, col); return; }
  if (status === 'correct') return;
  if (!inViewport(row, col)) return;
  if (curBoard[row][col] !== EMPTY) return;

  if (checkAnswer(curProblem, row, col)) {
    const wasSolved = isSolved(progress, curLevelId, curRaw.id);
    curBoard[row][col] = toPlayColor;
    markers = [{ row, col, type: 'correct' }];
    status = 'correct';
    playSfx('stone-place');
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
    playSfx('invalid-move');
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
  // play-out 進行中按「看答案」：先收掉 play-out（還原盤面、停掉在途 AI），再顯示正解
  if (playoutOn) {
    if (playoutStartBoard) curBoard = buildBoardFromProblem(curProblem);
    resetPlayout();
  }
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
  updatePlayoutBtn();
  render();
}

function redo() {
  if (!curProblem) return;
  resetPlayout();
  curBoard = buildBoardFromProblem(curProblem);
  status = 'playing';
  markers = [];
  hover = null;
  defaultStatusMsg();
  updatePlayoutBtn();
  render();
}

// ——— 後續手 play-out（S7）———

/** 退出 / 切題時把 play-out 狀態歸零（讓在途 analyze 作廢）。 */
function resetPlayout() {
  playoutOn = false;
  playoutSeq++;            // 讓尚未回來的 analyze 認出自己過期
  aiBusy = false;
  playoutHistory = [];
  playoutStartBoard = null;
  playoutKo = null;
  playoutPlies = 0;
  evalWinrate = null;
  evalOwnership = null;
  playoutHintShown = false;
}

const OWNERSHIP_HINT = '陰影＝KataGo 估的地盤歸屬（深＝黑、淺＝白）。看你的目標棋串歸誰';

/** 進入 play-out：以解對第一手的盤面為起點，KataGo 當對手先應手。 */
function startPlayout() {
  if (status !== 'correct' || !curProblem) return;
  playoutOn = true;
  status = 'playout';
  playoutSeq++;
  const seq = playoutSeq;
  playoutStartBoard = cloneBoard(curBoard);
  playoutKo = null;
  playoutPlies = 0;
  evalWinrate = null;
  evalOwnership = null;
  markers = [];
  // 把玩家的正解第一手放進 history（給 KataGo recent-move 特徵）
  const first = (curProblem.answers || [])[0];
  playoutHistory = first ? [{ x: first.row, y: first.col, player: toPlayColor }] : [];
  playoutTurn = opponent(toPlayColor);  // 玩家已下第一手，換對手
  setStatusMsg('AI 應手中…', '');
  updatePlayoutBtn();
  render();
  playoutStep(seq);
}

/** 退出 play-out，盤面還原到解對第一手。 */
function exitPlayout() {
  if (curProblem && playoutStartBoard) curBoard = playoutStartBoard;
  resetPlayout();
  status = 'correct';
  markers = [];
  setStatusMsg('已收手。可「重做」或下一題', 'correct');
  updatePlayoutBtn();
  render();
}

function synthState(player) {
  return {
    board: curBoard,
    size: curProblem.size,
    currentPlayer: player,
    moveHistory: playoutHistory,
    komi: 7.5,
    gameRules: 'chinese',
    onStatus: (m) => { if (playoutOn) setStatusMsg(m, ''); },
  };
}

/**
 * 一步推進：分析目前盤面 → 顯示誠實評估（勝率＋ownership）。
 * 若輪到 AI（對手），下出局部最佳手後遞迴（再分析玩家面對的盤面、顯示新評估）。
 * seq guard：切題/退出後過期的回呼直接丟棄。
 */
async function playoutStep(seq) {
  if (!playoutOn || seq !== playoutSeq) return;
  const aiToMove = playoutTurn !== toPlayColor;
  aiBusy = aiToMove;
  if (aiToMove) { setStatusMsg('AI 思考中…', ''); updatePlayoutBtn(); render(); }

  let result;
  try {
    result = await analyzeLocal(synthState(playoutTurn), viewport, { visits: 32 });
  } catch (err) {
    console.error('Tsumego play-out analyze failed:', err);
    if (seq === playoutSeq) {
      resetPlayout();
      status = 'correct';
      setStatusMsg('AI 載入/分析失敗，已收手，稍後再試', 'wrong');
      updatePlayoutBtn();
      render();
    }
    return;
  }
  if (!playoutOn || seq !== playoutSeq) return;  // 已切題/退出

  evalWinrate = result.winrate;       // 全局勝率不顯示（空盤主導、會誤導）；保留供除錯
  evalOwnership = result.ownership;    // 逐點領地＝唯一誠實的局部訊號，畫成覆蓋層
  const youColor = toPlayColor === BLACK ? '黑' : '白';

  if (!aiToMove) {
    // 玩家面對的盤面：畫出 ownership 覆蓋層，等玩家落子
    aiBusy = false;
    setStatusMsg(playoutHintShown ? `輪到你（${youColor}）` : OWNERSHIP_HINT, 'answer');
    playoutHintShown = true;
    updatePlayoutBtn();
    render();
    return;
  }

  // AI（對手）回合：下局部最佳手；局部已底定（pass）或超過上限 → 收手交還玩家
  if (result.move.pass || playoutPlies >= PLAYOUT_MAX_PLIES) {
    aiBusy = false;
    playoutTurn = toPlayColor;
    // playoutPlies===0 代表 AI 第一手就收手＝這題一手即定、沒有需要驗證的後續攻防
    const msg = playoutPlies === 0
      ? '這題一手即定生死，沒有需要驗證的後續手（看陰影即結果，可按停手）'
      : '局部大致底定，AI 收手——可繼續落子或按停手';
    setStatusMsg(msg, 'answer');
    updatePlayoutBtn();
    render();
    return;
  }
  const res = tryPlaceStone(curBoard, curProblem.size, result.move.x, result.move.y, playoutTurn, playoutKo);
  if (!res.valid) {
    // KataGo 理論上只給合法手；保險起見視為收手
    aiBusy = false;
    playoutTurn = toPlayColor;
    setStatusMsg('換你', 'answer');
    updatePlayoutBtn();
    render();
    return;
  }
  curBoard = res.newBoard;
  playoutKo = res.newKo;
  playoutPlies++;
  playoutHistory.push({ x: result.move.x, y: result.move.y, player: playoutTurn });
  markers = [{ row: result.move.x, col: result.move.y, type: 'aimove' }];
  playSfx('stone-place');
  if (res.captured > 0) playSfx('stone-capture');
  playoutTurn = toPlayColor;
  // 遞迴：分析玩家面對的新盤面、顯示新評估
  return playoutStep(seq);
}

/** play-out 中玩家落子（走真實規則，提子/自殺/劫由 tryPlaceStone 處理）。 */
function onPlayoutClick(row, col) {
  if (!playoutOn || aiBusy) return;
  if (!inViewport(row, col)) return;
  if (curBoard[row][col] !== EMPTY) return;
  const res = tryPlaceStone(curBoard, curProblem.size, row, col, toPlayColor, playoutKo);
  if (!res.valid) {
    setStatusMsg('不能下在這裡（自殺或劫）', 'wrong');
    render();
    return;
  }
  curBoard = res.newBoard;
  playoutKo = res.newKo;
  playoutPlies++;
  playoutHistory.push({ x: row, y: col, player: toPlayColor });
  markers = [];
  playSfx('stone-place');
  if (res.captured > 0) playSfx('stone-capture');
  playoutTurn = opponent(toPlayColor);
  const seq = playoutSeq;
  playoutStep(seq);
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
  // HiDPI 後 canvas.width 是裝置解析度；點擊需換算到 CSS 邏輯座標（cellSize/padding 所在座標系）
  const logicalW = parseFloat(dom.canvas.style.width) || dom.canvas.width;
  const logicalH = parseFloat(dom.canvas.style.height) || dom.canvas.height;
  const scaleX = rect.width > 0 ? logicalW / rect.width : 1;
  const scaleY = rect.height > 0 ? logicalH / rect.height : 1;
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
    const canHover = status === 'playing' || (status === 'playout' && !aiBusy);
    if (!canHover) { if (hover) { hover = null; render(); } return; }
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
  dom.playout.addEventListener('click', () => {
    if (status === 'playout') exitPlayout();
    else if (status === 'correct') startPlayout();
  });
  dom.home.addEventListener('click', () => { location.hash = '#home'; });

  window.addEventListener('resize', () => { if (isActive()) render(); });
}

function isActive() {
  return dom.screen && dom.screen.style.display !== 'none';
}

// ——— 進入（畫面顯隱由 main.js 的路由統一管理）———

export async function enterTsumegoMode() {
  loadSfxPack('go'); // 死活沿用圍棋落子/提子音效包，未另立 pack
  loadSfxPack('common');
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
