// chess-mode.js — 西洋棋模式控制器（比照 shogi-mode，無持駒/打入；升變為四選一）。
//
// 自管狀態與事件，畫面顯隱由 main.js 路由統一管理。棋規用 chess-game（ffish），
// AI 用 chess-engine（共用 Fairy-Stockfish，變體 chess）。兩個 WASM 延遲載入：
// 進模式先載 ffish 顯示盤面，引擎在第一手 AI 才載。
import * as Game from './chess-game.js';
import * as Engine from './chess-engine.js';
import * as Review from './chess-review.js';
import * as Adaptive from './adaptive-chess.js';
import { resizeChessCanvas, drawChess } from './chess-ui.js';
import { prefersReducedMotion } from './motion.js';
import { loadSfxPack, playSfx, playVoice } from './audio-manager.js';
import { renderAudioControls } from './audio-settings-ui.js';
import { recordGame, totals, formatRecord, loadStats, saveStats } from './stats.js';

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

// ——— 建議走法（AI 建議按鈕，教學用途，固定高強度）———
let hintMove = null;        // { from, to } 供箭頭 overlay；null=無顯示
let hintBusy = false;       // 建議請求進行中
let hintReq = null;         // 目前 in-flight 的 Engine.hint() 控制物件（{promise, cancel}）

// ——— 覆盤 ———
let reviewMode = false;
let reviewMoves = [];
let reviewFens = [];
let reviewPly = 0;
let reviewNodes = null;     // analyzeGame 結果（null = 尚未分析）
let reviewAnalyzing = false;

// ——— 設定 ———
let mode = 'pvc';          // 'pvc' | 'pvp'
let playerWhite = true;    // pvc 時玩家是否執白（先手）
let level = 2;             // 手動難度下拉 1=簡單 2=普通 3=困難
let autoMode = false;      // 自動調整難度（電腦連敗升級・連勝降級）
let autoLevel = Adaptive.DEFAULT_LEVEL; // 自動模式目前連續等級
let streak = 0;            // 連勝/連敗計數（>0 電腦連敗朝升級、<0 連勝朝降級）
let adaptiveApplied = false; // 本局是否已套用升降（避免同局重複）

const $ = (id) => document.getElementById(id);

function cacheDom() {
  dom = {
    screen: $('chessScreen'), canvas: $('chessBoard'), status: $('chessStatus'),
    restart: $('chessRestart'), undo: $('chessUndo'), home: $('chessHome'),
    mode: $('chessMode'), color: $('chessColor'), level: $('chessLevel'),
    auto: $('chessAuto'), autoLevelGroup: $('chessAutoLevelGroup'),
    autoLevelLabel: $('chessAutoLevel'), autoReset: $('chessAutoReset'),
    settingsBtn: $('chessSettingsBtn'), settingsModal: $('chessSettingsModal'),
    thinking: $('chessThinking'), checkBanner: $('chessCheck'),
    endOverlay: $('chessEnd'), endTitle: $('chessEndTitle'), endSub: $('chessEndSub'), endBtn: $('chessEndBtn'),
    endStats: $('chessEndStats'),
    promo: $('chessPromo'), promoBtns: $('chessPromoBtns'), hint: $('chessHint'),
    reviewBtn: $('chessReviewBtn'), controls: $('chessControls'),
    review: $('chessReview'), rvSlider: $('chessReviewSlider'), rvInfo: $('chessReviewInfo'),
    rvFirst: $('csRvFirst'), rvPrev: $('csRvPrev'), rvNext: $('csRvNext'), rvLast: $('csRvLast'),
    rvAnalyze: $('csRvAnalyze'), rvExit: $('csRvExit'), evalGraph: $('chessEvalGraph'),
    audioSettings: $('chessAudioSettings'),
    infobar: $('chessInfobar'), turnBadge: $('chessTurnBadge'), moveCount: $('chessMoveCount'),
    whiteLost: $('chessWhiteLost'), blackLost: $('chessBlackLost'),
  };
  dom.settings = dom.screen?.querySelector('.gomoku-settings');
  dom.statusrow = dom.screen?.querySelector('.xiangqi-statusrow');
}

// ——— 資訊列：雙方被吃子摘要（PRD §7）———
// 直接解析 FEN 子力字元計數，和開局標準子力數比對算損失，不需引擎/game.js 額外介面。
const CHESS_INITIAL_PIECES = { K: 1, Q: 1, R: 2, B: 2, N: 2, P: 8, k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };
function countFenPieces(fenStr) {
  const counts = {};
  for (const ch of fenStr.split(' ')[0]) { if (/[a-zA-Z]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1; }
  return counts;
}
/** 回傳 { whiteLost, blackLost }：白方被吃掉幾子、黑方被吃掉幾子。 */
function capturedCounts() {
  const counts = countFenPieces(Game.fen());
  let whiteLost = 0, blackLost = 0;
  for (const [ch, init] of Object.entries(CHESS_INITIAL_PIECES)) {
    const lost = Math.max(0, init - (counts[ch] || 0));
    if (ch === ch.toUpperCase()) whiteLost += lost; else blackLost += lost;
  }
  return { whiteLost, blackLost };
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.mode === 'pvp' || s.mode === 'pvc') mode = s.mode;
      if (typeof s.playerWhite === 'boolean') playerWhite = s.playerWhite;
      if (s.level >= 1 && s.level <= 3) level = s.level;
      if (typeof s.autoMode === 'boolean') autoMode = s.autoMode;
      if (Number.isFinite(s.autoLevel)) autoLevel = Adaptive.clampLevel(s.autoLevel);
      if (Number.isFinite(s.streak)) streak = s.streak;
    }
  } catch { /* ignore */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, playerWhite, level, autoMode, autoLevel, streak })); } catch { /* ignore */ }
}

function isActive() { return dom.screen && dom.screen.style.display !== 'none'; }
function isPlayerTurn() { return mode === 'pvp' || Game.turn() === playerWhite; }

// ——— 渲染 ———

function view() {
  return {
    grid: Game.piecesGrid(),
    selected, legalTargets, lastMove, checkRC,
    hint: hintMove,
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
  playVoice('voice-chess-check');
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
  const adaptMsg = maybeApplyAdaptive(r);   // 自動難度升降（每局僅一次）
  if (adaptMsg) sub = sub ? `${sub}　${adaptMsg}` : adaptMsg;
  if (dom.endTitle) dom.endTitle.textContent = title;
  if (dom.endSub) dom.endSub.textContent = sub;
  dom.endOverlay.style.display = 'flex';
}
function hideEnd() { if (dom.endOverlay) dom.endOverlay.style.display = 'none'; }

/** PvP 一律播「勝」音；PvC 依人類是否為贏家算 win/lose；和局播 draw。 */
function playEndSound(r) {
  if (mode !== 'pvc') { playSfx('game-win'); return; }
  if (r === '1/2-1/2') { playSfx('game-draw'); return; }
  playSfx(((r === '1-0') === playerWhite) ? 'game-win' : 'game-lose');
}

/** 局面剛結束（gameOver 由 false→true 那一刻）才呼叫一次：終局音效＋將死語音，再顯示結束卡片。
 *  和 showEnd() 分開，避免覆盤結束後 exitReview() 重顯結束卡片時重播音效/語音。 */
function onGameOver() {
  const r = Game.result();
  playEndSound(r);
  // Checkmate 語音：僅在真正被將死（終局時仍處於被將軍狀態）才播；和局／無子可動（stalemate）不播。
  if (r !== '1/2-1/2' && Game.isCheck()) playVoice('voice-chess-mate');
  showEnd();
  recordStats(r);
}

/** 只記 pvc；pvp 結束卡片的戰績行清空。難度：自動模式取階梯當下等級（autoLevel），手動取下拉值（level）。 */
function recordStats(r) {
  if (mode !== 'pvc') {
    if (dom.endStats) dom.endStats.textContent = '';
    return;
  }
  const outcome = r === '1/2-1/2' ? 'draw' : (((r === '1-0') === playerWhite) ? 'win' : 'loss');
  const diff = `L${autoMode ? autoLevel : level}`;
  const s = recordGame(loadStats(), 'chess', diff, outcome);
  saveStats(s);
  if (dom.endStats) dom.endStats.textContent = formatRecord(totals(s, 'chess'));
}

// ——— 自動難度（連勝連敗階梯，見 adaptive-chess.js）———

/** pvc + 自動模式時，依本局結果升降等級；回傳升降提示字（無變動回空字）。每局僅套用一次。 */
function maybeApplyAdaptive(r) {
  if (mode !== 'pvc' || !autoMode || adaptiveApplied || !r) return '';
  adaptiveApplied = true;
  const outcome = r === '1/2-1/2' ? 'draw' : ((r === '1-0') === playerWhite ? 'ai-lost' : 'ai-won');
  const res = Adaptive.nextLevel(autoLevel, streak, outcome);
  autoLevel = res.level; streak = res.streak;
  saveSettings();
  updateAutoLevelDisplay();
  if (res.change === 'up') return `電腦升級 → ${Adaptive.levelLabel(autoLevel)}`;
  if (res.change === 'down') return `電腦降級 → ${Adaptive.levelLabel(autoLevel)}`;
  return '';
}

function updateAutoLevelDisplay() {
  if (dom.autoLevelLabel) dom.autoLevelLabel.textContent = Adaptive.levelLabel(autoLevel);
}

function resetAutoLevel() {
  autoLevel = Adaptive.DEFAULT_LEVEL;
  streak = 0;
  saveSettings();
  updateAutoLevelDisplay();
}

/** 實際送進引擎的難度等級：自動模式用浮動等級，否則手動下拉映射到固定等級。 */
function effectiveLevel() {
  return autoMode ? autoLevel : (Adaptive.MANUAL_TO_LEVEL[level] ?? Adaptive.DEFAULT_LEVEL);
}

function updateUndoBtn() {
  if (!dom.undo) return;
  dom.undo.disabled = !boardReady || aiBusy || moving || gameOver || Game.gamePly() === 0;
}

/** 更新「建議走法」按鈕可用狀態：AI 思考中／覆盤分析中／覆盤模式中／升變對話框開啟中／終局後皆不可按。 */
function updateHintBtn() {
  if (!dom.hint) return;
  dom.hint.disabled = !boardReady || hintBusy || aiBusy || reviewAnalyzing || reviewMode || !!promoResolve || gameOver;
}

/** 更新「覆盤」按鈕可用狀態：常駐於功能列，終局前 disabled（title 已註明「終局後可用」）。 */
function updateReviewBtn() {
  if (!dom.reviewBtn) return;
  dom.reviewBtn.disabled = !boardReady || !gameOver;
}

/** 資訊列：回合徽章 + 手數 + 雙方被吃子摘要（PRD §7）。 */
function updateInfobar() {
  if (!boardReady || !dom.turnBadge) return;
  const white = Game.turn();
  dom.turnBadge.textContent = white ? '白方' : '黑方';
  dom.turnBadge.className = 'turn-badge ' + (white ? 'white' : 'black');
  if (dom.moveCount) dom.moveCount.textContent = String(Game.gamePly());
  const c = capturedCounts();
  if (dom.whiteLost) dom.whiteLost.textContent = String(c.whiteLost);
  if (dom.blackLost) dom.blackLost.textContent = String(c.blackLost);
}

/** 清除目前顯示的建議走法箭頭，並取消尚在等待中的建議請求（引擎仍會跑完，但結果會被丟棄）。 */
function clearHint() {
  if (hintReq) { hintReq.cancel(); hintReq = null; }
  hintMove = null;
}

/** 按下「建議走法」：固定 movetime、引擎全力（不吃 adaptive 難度削弱），教學用途。 */
async function requestHint() {
  if (!dom.hint || dom.hint.disabled) return;
  clearHint();
  hintBusy = true;
  updateHintBtn();
  showThinking(true);
  const fenAtRequest = Game.fen();
  const req = Engine.hint({ fen: fenAtRequest, movetime: 1500 });
  hintReq = req;
  try {
    const result = await req.promise;
    if (hintReq !== req) return; // 這期間已被 clearHint() 取消或被新請求取代，共用狀態不再歸這次請求管
    hintReq = null;
    hintBusy = false;
    showThinking(false);
    updateHintBtn();
    if (!isActive() || Game.fen() !== fenAtRequest) return; // 局面已變，丟棄不畫
    if (result) { hintMove = { from: result.from, to: result.to }; draw(); }
  } catch (err) {
    if (hintReq !== req) return; // 同上：晚到的 settle，共用狀態已不歸這次請求管
    hintReq = null;
    hintBusy = false;
    showThinking(false);
    updateHintBtn();
    if (err?.cancelled) return; // 使用者取消／局面已變導致的取消，靜默
    console.error('hint error:', err);
    setStatus('建議走法失敗，請稍候再試');
  }
}

function undoMove() {
  if (aiBusy || moving || !boardReady || Game.gamePly() === 0) return;
  clearHint();
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
  updateHintBtn();
  updateReviewBtn();
  updateInfobar();
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
    if (!piece || prefersReducedMotion()) { resolve(); return; }
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
  // 落子前先看目的格是否已有子：吃子 vs 落子音效判斷。
  // 註：吃過路兵（en passant）目的格本身是空的，此簡化判斷會漏判為「落子」音而非「吃子」音，
  // 屬罕見邊界情況、不影響遊戲邏輯，先接受此音效小瑕疵。
  const toRC = Game.squareToRC(parts.to);
  const preGrid = Game.piecesGrid();
  const captured = !!(preGrid[toRC.row] && preGrid[toRC.row][toRC.col]);
  moving = true;
  clearSelection();
  clearHint();
  draw();
  await animateMove(parts.from, parts.to);
  const ok = Game.move(uci);
  moving = false;
  if (!ok) { render(); return false; }
  lastMove = [parts.from, parts.to];
  playSfx(captured ? 'chess-capture' : 'chess-place');
  gameOver = Game.isGameOver();
  updateCheck();
  setStatus();
  render();
  if (gameOver) onGameOver();
  else if (Game.isCheck()) flashCheck();
  return true;
}

/** 顯示升變四選一（后/車/象/馬），回傳所選 code（q/r/b/n）。 */
function askPromotion() {
  return new Promise((resolve) => {
    promoResolve = resolve;
    if (dom.promo) dom.promo.style.display = 'flex';
    updateHintBtn();
  });
}
function resolvePromotion(code) {
  if (dom.promo) dom.promo.style.display = 'none';
  const r = promoResolve; promoResolve = null;
  updateHintBtn();
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
  if (reviewMode || gameOver || aiBusy || moving || !boardReady) return;
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
      const mv = await Engine.bestMove({ fen: Game.fen(), level: effectiveLevel() });
      const rest = minDelay - (performance.now() - t0);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      showThinking(false);
      aiBusy = false;
      if (!isActive() || gameOver) return;
      if (mv) await doMove(mv);
      else { gameOver = true; setStatus(); onGameOver(); }
    } catch (err) {
      showThinking(false);
      aiBusy = false;
      setStatus('AI 出錯：' + (err?.message || err) + '（請重新開始）');
      Engine.reset();
    }
  })();
}

async function newGame() {
  if (reviewMode) setReviewUI(false);
  reviewNodes = null;
  adaptiveApplied = false;
  clearHint();
  hintBusy = false;
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

// ——— 覆盤 ———
// 與象棋覆盤同法（見 xiangqi-mode）；白方視角分用 p1Cp。盤上不畫 PV 箭頭（與將棋對稱），
// 最佳手以文字呈現。

function setReviewUI(on) {
  reviewMode = on;
  if (dom.infobar) dom.infobar.style.display = on ? 'none' : '';
  if (dom.settings) dom.settings.style.display = on ? 'none' : '';
  if (dom.statusrow) dom.statusrow.style.display = on ? 'none' : '';
  if (dom.controls) dom.controls.style.display = on ? 'none' : '';
  if (dom.review) dom.review.style.display = on ? 'flex' : 'none';
  updateHintBtn();
}

async function enterReview() {
  await Game.ensureReady();
  reviewMoves = Game.moveStackList();
  if (!reviewMoves.length) return;
  reviewFens = Game.fensForMoves(reviewMoves);
  reviewNodes = null;
  hideEnd();
  if (dom.evalGraph) dom.evalGraph.style.display = 'none';
  if (dom.rvSlider) dom.rvSlider.max = String(reviewMoves.length);
  setReviewUI(true);
  reviewGoTo(reviewMoves.length);
}

function exitReview() {
  setReviewUI(false);
  render();                 // 回到實際對局（結束）局面
  if (gameOver) showEnd();
}

function reviewGoTo(ply) {
  reviewPly = Math.max(0, Math.min(reviewMoves.length, ply | 0));
  if (dom.rvSlider) dom.rvSlider.value = String(reviewPly);
  renderReview();
  updateReviewInfo();
  if (reviewNodes) drawEvalGraph();
}

function renderReview() {
  const avail = (dom.screen?.clientWidth || window.innerWidth) - 24;
  const w = Math.min(avail, window.innerWidth - 32, 460);
  resizeChessCanvas(deps, w);
  const grid = Game.gridFromFen(reviewFens[reviewPly]);
  const last = reviewPly > 0 ? Game.moveEndpoints(reviewMoves[reviewPly - 1]) : null;
  drawChess(deps, {
    grid, selected: null, legalTargets: null, checkRC: null,
    lastMove: last ? [last.from, last.to] : null,
    rc: (sq) => Game.squareToRC(sq),
  });
}

/** 優勢曲線：每手白方視角評估分，白優正、黑優負；標目前手。 */
function drawEvalGraph() {
  const cv = dom.evalGraph;
  if (!cv || !reviewNodes) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, pad = 5, mid = H / 2, CLAMP = 800;
  const N = reviewMoves.length;
  const xOf = (k) => pad + (N ? k / N : 0) * (W - 2 * pad);
  const yOf = (cp) => mid - (Math.max(-CLAMP, Math.min(CLAMP, cp)) / CLAMP) * (H / 2 - pad);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(192,57,43,0.10)'; ctx.fillRect(0, 0, W, mid);       // 上半=白優
  ctx.fillStyle = 'rgba(44,36,23,0.12)'; ctx.fillRect(0, mid, W, H - mid);  // 下半=黑優
  ctx.strokeStyle = 'rgba(91,68,35,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
  ctx.strokeStyle = '#7a5a18'; ctx.lineWidth = 1.8; ctx.beginPath();
  reviewNodes.forEach((n, k) => { const x = xOf(k), y = yOf(n.p1Cp); k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  const cx = xOf(reviewPly);
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.arc(cx, yOf(reviewNodes[reviewPly].p1Cp), 3.5, 0, Math.PI * 2); ctx.fill();
}

function onGraphClick(e) {
  if (!reviewNodes) return;
  const r = dom.evalGraph.getBoundingClientRect();
  const frac = r.width > 0 ? (e.clientX - r.left) / r.width : 0;
  reviewGoTo(Math.round(Math.max(0, Math.min(1, frac)) * reviewMoves.length));
}

/** 白方視角評估分（centipawn）→ 友善文字。 */
function fmtEval(p1Cp) {
  if (p1Cp >= 20000) return '白方勝勢';
  if (p1Cp <= -20000) return '黑方勝勢';
  const v = p1Cp / 100;
  if (Math.abs(v) < 0.2) return '均勢';
  return (v > 0 ? '白優 +' : '黑優 +') + Math.abs(v).toFixed(1);
}

/** UCI 著法 → 顯示字串（含升變，如 e7e8q → e7→e8=Q）。 */
function sqArrow(uci) {
  const m = Game.splitMove(uci);
  return `${m.from}→${m.to}${m.promo ? '=' + m.promo.toUpperCase() : ''}`;
}

function updateReviewInfo() {
  const el = dom.rvInfo;
  if (!el) return;
  el.textContent = '';
  const N = reviewMoves.length;
  const l1 = document.createElement('div');
  l1.append('第 ');
  const b = document.createElement('b'); b.textContent = String(reviewPly); l1.append(b);
  l1.append(` / ${N} 手`);
  if (reviewPly > 0) {
    const mover = (reviewPly % 2 === 1) ? '白方' : '黑方'; // 第 ply 手：ply1=白
    l1.append(`　${mover} ${sqArrow(reviewMoves[reviewPly - 1])}`);
  }
  el.append(l1);
  if (reviewNodes) {
    const l2 = document.createElement('div');
    l2.textContent = '局面評估：' + fmtEval(reviewNodes[reviewPly].p1Cp);
    el.append(l2);
    if (reviewPly > 0) {
      const m = reviewNodes[reviewPly - 1]; // 描述「這手」的損失
      const l3 = document.createElement('div');
      l3.append('這手 ');
      const span = document.createElement('span');
      span.className = 'xq-cls ' + m.cls.key; // key 為內部常數，非外部輸入
      span.textContent = m.cls.label;
      l3.append(span);
      if (m.loss >= 30) l3.append(`（丟約 ${(m.loss / 100).toFixed(1)} 分）`);
      if (m.bestmove) l3.append('・最佳 ' + sqArrow(m.bestmove));
      el.append(l3);
    }
  } else {
    const hint = document.createElement('div');
    hint.style.color = 'var(--text-muted)';
    hint.textContent = '按「分析本局」評估每手好壞';
    el.append(hint);
  }
}

async function analyzeReview() {
  if (reviewAnalyzing || !reviewMoves.length) return;
  reviewAnalyzing = true;
  updateHintBtn();
  if (dom.rvAnalyze) dom.rvAnalyze.disabled = true;
  try {
    reviewNodes = await Review.analyzeGame(reviewMoves, {
      movetimeMs: 400,
      onProgress: (k, n) => { if (dom.rvInfo) dom.rvInfo.textContent = `分析中… ${k}/${n}`; },
    });
    if (dom.evalGraph) dom.evalGraph.style.display = 'block';
    drawEvalGraph();
    renderReview();
    updateReviewInfo();
  } catch (err) {
    if (dom.rvInfo) dom.rvInfo.textContent = 'AI 分析失敗：' + (err?.message || err);
    Engine.reset();
  } finally {
    reviewAnalyzing = false;
    updateHintBtn();
    if (dom.rvAnalyze) dom.rvAnalyze.disabled = false;
  }
}

// ——— 設定 UI ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = playerWhite ? 'white' : 'black';
  if (dom.level) dom.level.value = String(level);
  if (dom.auto) dom.auto.value = autoMode ? 'on' : 'off';
  const pvc = mode === 'pvc';
  dom.color?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  dom.level?.closest('.control-group')?.style.setProperty('display', (pvc && !autoMode) ? '' : 'none'); // 自動時隱藏手動難度
  dom.auto?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  dom.autoLevelGroup?.style.setProperty('display', (pvc && autoMode) ? '' : 'none');
  updateAutoLevelDisplay();
}

// ——— 設定彈窗 ———
function openSettings() { applySettingsToControls(); dom.settingsModal?.classList.add('show'); }
function closeSettings() { dom.settingsModal?.classList.remove('show'); }

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
  dom.hint?.addEventListener('click', () => requestHint());
  dom.endBtn?.addEventListener('click', () => newGame());
  dom.home?.addEventListener('click', () => { location.hash = '#home'; });
  // 升變四選一：按鈕 data-promo 帶 q/r/b/n
  dom.promoBtns?.querySelectorAll('[data-promo]')?.forEach((btn) => {
    btn.addEventListener('click', () => resolvePromotion(btn.getAttribute('data-promo')));
  });
  // 覆盤
  dom.reviewBtn?.addEventListener('click', () => enterReview());
  dom.rvExit?.addEventListener('click', () => exitReview());
  dom.rvFirst?.addEventListener('click', () => reviewGoTo(0));
  dom.rvPrev?.addEventListener('click', () => reviewGoTo(reviewPly - 1));
  dom.rvNext?.addEventListener('click', () => reviewGoTo(reviewPly + 1));
  dom.rvLast?.addEventListener('click', () => reviewGoTo(reviewMoves.length));
  dom.rvSlider?.addEventListener('input', () => reviewGoTo(Number(dom.rvSlider.value)));
  dom.rvAnalyze?.addEventListener('click', () => analyzeReview());
  dom.evalGraph?.addEventListener('click', onGraphClick);
  dom.mode?.addEventListener('change', () => { mode = dom.mode.value === 'pvp' ? 'pvp' : 'pvc'; saveSettings(); applySettingsToControls(); newGame(); });
  dom.color?.addEventListener('change', () => { playerWhite = dom.color.value !== 'black'; saveSettings(); newGame(); });
  dom.level?.addEventListener('change', () => { level = Math.min(3, Math.max(1, Number(dom.level.value) || 2)); saveSettings(); });
  dom.auto?.addEventListener('change', () => { autoMode = dom.auto.value === 'on'; saveSettings(); applySettingsToControls(); });
  dom.autoReset?.addEventListener('click', () => resetAutoLevel());
  dom.settingsBtn?.addEventListener('click', () => openSettings());
  dom.settingsModal?.addEventListener('click', (e) => { if (e.target === dom.settingsModal) closeSettings(); });
  dom.settingsModal?.querySelector('[data-close-settings]')?.addEventListener('click', () => closeSettings());
  window.addEventListener('resize', () => { if (isActive()) (reviewMode ? renderReview() : render()); });
}

// ——— 進入 ———

export async function enterChessMode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 8, cellSize: 40 };
    applySettingsToControls();
    wireEvents();
    renderAudioControls(dom.audioSettings);
    initialized = true;
  }
  loadSfxPack('chess');
  loadSfxPack('common');
  if (!boardReady) await newGame();
  else render();
}

export const ChessMode = { enterChessMode };
