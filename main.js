// main.js — entry point; wires modules together and manages shared game state.

import { EMPTY, BLACK, WHITE, opponent, inBounds as _inBounds, getNeighbors as _getNeighbors, getGroup as _getGroup, getLegalMoves as _getLegalMoves, tryPlaceStone as _tryPlaceStone, calculateScore, placeHandicap, handicapPoints } from './rules.js';
import * as GameStateModule from './game-state.js';
import { GoUI } from './ui.js';
import { GoSound } from './sound.js';
import { GoTimer } from './timer.js';
import { GoHints } from './hints.js';
import { GoReview } from './review.js';
import { buildSGF } from './sgf.js';
import { openGoSettings, closeGoSettings, toggleGoSettings } from './go-settings.js';
import { makeAiController } from './ai-controller.js';
import { registerEventHandlers } from './event-handlers.js';
import { enterTsumegoMode, tsumegoSolvedTotal } from './tsumego-mode.js';
import { enterGomokuMode } from './gomoku-mode.js';
import { enterXiangqiMode } from './xiangqi-mode.js';
import { enterShogiMode } from './shogi-mode.js';
import { enterChessMode } from './chess-mode.js';
import { enterOthelloMode } from './othello-mode.js';
import { enterXiangqiPuzzleMode } from './xiangqi-puzzle-mode.js';
import { playTitleReveal, startAmbient, playTransition } from './ink-fx.js';
import * as KataGo from './katago-service.js';
import { nextLevel, kyuLabel, levelConfig, MIN_LEVEL } from './adaptive-difficulty.js';
import { initAudio, loadSfxPack, playSfx } from './audio-manager.js';
import { renderAudioControls, initAudioMuteButtons } from './audio-settings-ui.js';

// ==================== CONSTANTS ====================
const AI_MOVE_DELAY_MS       = 100;
const AI_INIT_DELAY_MS       = 300;
const COORD_LETTERS = 'ABCDEFGHJKLMNOPQRST';

const VALID_BOARD_SIZES = [9, 13, 19];
const VALID_GAME_MODES  = ['pvc', 'pvp'];

const STAR_POINTS = {
  9:  [[2,2],[2,6],[4,4],[6,2],[6,6]],
  13: [[3,3],[3,6],[3,9],[6,3],[6,6],[6,9],[9,3],[9,6],[9,9]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]]
};

// ==================== GAME STATE ====================
let komi = 7.5;
let gameRules = 'chinese';

let size = 19;
let board = [];
let currentPlayer = BLACK;
let captures = { [BLACK]: 0, [WHITE]: 0 };
let moveHistory = [];
let boardHistory = [];
let koPoint = null;
let passCount = 0;
let gameOver = false;
let gameMode = 'pvc';
let playerColor = BLACK;
// 自適應難度：aiLevel 現在是「電腦等級」(1..MAX)，依戰績自動升降，獨立存於 localStorage。
const AI_LEVEL_KEY = 'gogame_ai_level';
let aiLevel = loadAiLevel();
let isAIThinking = false;

let timerEnabled = false;
let timerSeconds = { [BLACK]: 600, [WHITE]: 600 };

let isReviewing = false;
let currentReviewMove = 0;

let isScoring = false;
let deadStones = new Set();
let showingHint = false;
let suggestMove = null; // KataGo 建議走法 [row,col]，null=不顯示
let _suggestBusy = false;

let invalidFlash = null; // 禁著點落子失敗時短暫閃現的紅 X [x,y]，null=不顯示
let _invalidFlashTimer = null;

let emotionEnabled = false;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
let cellSize = 30;
let padding = 40;
let lastMove = null;
let hoverPos = null;

// ==================== GameState proxy ====================
const GameState = GameStateModule;

// ==================== BOARD / RULES ENGINE ====================
function inBounds(x, y)          { return _inBounds(size, x, y); }
function getNeighbors(x, y)      { return _getNeighbors(size, x, y); }
function getGroup(b, x, y)       { return _getGroup(b, size, x, y); }
function tryPlaceStone(b, x, y, player, ko) { return _tryPlaceStone(b, size, x, y, player, ko); }
function getLegalMoves(b, player, ko)       { return _getLegalMoves(b, size, player, ko); }

function isGameBlocked() { return gameOver || isReviewing || isScoring; }
function isGameBusy()    { return isGameBlocked() || isAIThinking; }

// ==================== APP CONTEXT (shared with sub-modules) ====================
// The `app` object provides sub-modules with access to mutable state and helpers.
const app = {
  // Constants
  EMPTY, BLACK, WHITE,
  AI_MOVE_DELAY_MS, AI_INIT_DELAY_MS,
  COORD_LETTERS, STAR_POINTS,

  // State getters (re-read live values)
  get size()              { return size; },
  get board()             { return board; },
  get currentPlayer()     { return currentPlayer; },
  get captures()          { return captures; },
  get moveHistory()       { return moveHistory; },
  get koPoint()           { return koPoint; },
  get passCount()         { return passCount; },
  get gameOver()          { return gameOver; },
  get gameMode()          { return gameMode; },
  get playerColor()       { return playerColor; },
  get aiLevel()           { return aiLevel; },
  get isAIThinking()      { return isAIThinking; },
  get timerEnabled()      { return timerEnabled; },
  get timerSeconds()      { return timerSeconds; },
  get gameRules()         { return gameRules; },
  get komi()              { return komi; },
  get isReviewing()       { return isReviewing; },
  get currentReviewMove() { return currentReviewMove; },
  get isScoring()         { return isScoring; },
  get deadStones()        { return deadStones; },
  get showingHint()       { return showingHint; },
  get emotionEnabled()    { return emotionEnabled; },
  get canvas()            { return canvas; },
  get padding()           { return padding; },
  get cellSize()          { return cellSize; },
  get hoverPos()          { return hoverPos; },

  // State setters
  set emotionEnabled(v)   { emotionEnabled = v; },
  set hoverPos(v)         { hoverPos = v; },

  // References to modules
  GameState,
  GoUI, GoSound, GoTimer, GoHints, GoReview,

  // Functions (bound below)
  inBounds, getGroup,
  isGameBlocked, isGameBusy,
  placeStone: (...args) => placeStone(...args),
  doPass: (...args) => doPass(...args),
  applyStateFromStore: () => applyStateFromStore(),
  updateUI: () => updateUI(),
  updateScoringDisplay: () => updateScoringDisplay(),
  syncStatus: (...args) => syncStatus(...args),
  setStatus: (msg) => setStatus(msg),
  drawBoard: () => drawBoard(),
  reviewGo: (n) => reviewGo(n),
  closeGoSettings,
};

// ==================== AI CONTROLLER ====================
const aiController = makeAiController(app);
app.aiController = aiController;

// ==================== CAPTURE HINTS ====================
function showHintOnce() {
  if (isGameBusy()) return;
  showingHint = true;
  drawBoard();
}

function clearHint() {
  if (showingHint) { showingHint = false; drawBoard(); }
}

// 棋盤中央短暫浮現的醒目提示（如「電腦虛手」），約 1.8 秒後淡出。
// 樣式以 inline 設定（不依賴 style.css），確保任何部署狀態都能正確顯示。
let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('goToast');
  if (!el) return;
  el.textContent = msg;
  Object.assign(el.style, {
    display: 'block',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '14px 26px',
    background: 'rgba(178, 58, 46, 0.95)',
    color: '#fff',
    fontSize: '18px',
    fontWeight: '700',
    letterSpacing: '1px',
    borderRadius: '12px',
    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
    zIndex: '70',
    pointerEvents: 'none',
    // .board-wrap 有 line-height:0（消 canvas 間隙），不覆寫的話文字換行會兩行疊在一起；
    // width:max-content 修正絕對定位＋left:50% 造成「可用寬度只剩容器一半、字多必換行」的問題。
    lineHeight: '1.5',
    width: 'max-content',
    maxWidth: '88vw',
    textAlign: 'center',
  });
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 1800);
}

// 走法提示：用 KataGo 算「現在這手該下哪」+ 數據理由（值幾目）。
// 注意：此處用全力最佳手、不套用對弈的隨機弱化，所以建議與對手強度無關。
async function requestMoveHint() {
  if (isGameBusy() || _suggestBusy) return;
  if (gameMode === 'pvc' && currentPlayer !== playerColor) return; // 只在輪到你時
  _suggestBusy = true;
  setStatus('AI 思考建議走法中…');
  try {
    const r = await KataGo.suggest({
      board, size, currentPlayer, moveHistory, komi, gameRules, onStatus: setStatus,
    }, { visits: 24 });
    if (r.move) {
      suggestMove = [r.move.x, r.move.y];
      setStatus(describeSuggestion(r));
    } else {
      suggestMove = null;
      setStatus('AI 建議虛手（pass）');
    }
    drawBoard();
  } catch (err) {
    console.error('move hint error:', err);
    setStatus('建議走法失敗，請稍候再試');
  } finally {
    _suggestBusy = false;
  }
}

// 把 KataGo 數據翻成白話（誠實、只用真實數值）：座標、領先目數、後續手數。
function describeSuggestion(r) {
  const coord = `${COORD_LETTERS[r.move.y]}${size - r.move.x}`;
  // scoreLead 是黑領先目數；換成「當前玩家」視角
  let leadTxt = '';
  if (typeof r.scoreLead === 'number') {
    const mine = currentPlayer === BLACK ? r.scoreLead : -r.scoreLead;
    leadTxt = mine >= 0 ? `下了約領先 ${mine.toFixed(0)} 目` : `下了仍落後約 ${(-mine).toFixed(0)} 目`;
  }
  return `建議走法：${coord}（藍圈）${leadTxt ? '，' + leadTxt : ''}`;
}

function clearSuggest() {
  suggestMove = null;
}

// 禁著點/無效點擊回饋：該交叉點紅 X 閃現約 600ms（見 ui.js drawBoard 的 invalidFlash）。
function flashInvalid(x, y) {
  invalidFlash = [x, y];
  drawBoard();
  if (_invalidFlashTimer) clearTimeout(_invalidFlashTimer);
  _invalidFlashTimer = setTimeout(() => {
    invalidFlash = null;
    drawBoard();
  }, 600);
}

// 落子失敗原因 → 使用者看得懂的中文提示。
function invalidMoveReasonText(reason) {
  if (reason === 'occupied') return '此處已有棋子';
  if (reason === 'suicide') return '禁著點：自殺手';
  if (reason === 'ko') return '打劫禁著點，需先在他處下一手';
  return '此處不能下子';
}

function getCaptureHints(b, player) {
  return GoHints.getCaptureHints(b, size, player, koPoint);
}

// ==================== RENDERING ====================
function getCurrentStateSnapshot() {
  return {
    size, board, currentPlayer, captures, moveHistory, boardHistory,
    koPoint, passCount, gameOver, lastMove, gameMode, playerColor,
    aiLevel, timerEnabled, timerSeconds, gameRules, komi, isReviewing,
    currentReviewMove, isScoring, deadStones, isAIThinking
  };
}

function buildBoardViewState() {
  const state = getCurrentStateSnapshot();
  const displayBoard = isReviewing ? GoReview.getReviewBoard(moveHistory, currentReviewMove, size) : board;
  const scoreData = isScoring ? calculateScore(board, size, deadStones, captures, gameRules, komi) : null;
  const captureHints = showingHint && !gameOver && !isReviewing && !isScoring && !isAIThinking
    ? getCaptureHints(board, currentPlayer)
    : [];
  const lastMoveToShow = isReviewing ? GoReview.getReviewLastMove(moveHistory, currentReviewMove) : lastMove;

  return {
    ...state,
    displayBoard,
    deadStones,
    lastMove: lastMoveToShow,
    scoreData,
    showingHint,
    captureHints,
    suggestMove,
    emotionEnabled,
    hoverPos,
    invalidFlash,
    ownership: (isReviewing && reviewOwnershipOn && reviewAnalysis && reviewAnalysis[currentReviewMove])
      ? reviewAnalysis[currentReviewMove].ownership : null,
  };
}

let _drawRaf = null;
function drawBoard() {
  if (_drawRaf) return;
  _drawRaf = requestAnimationFrame(() => {
    _drawRaf = null;
    // scheduleRedraw：借給 ui.js 的落子 scale-in / 提子淡出動畫用，動畫進行中才會被呼叫
    // （drawBoard 本身已有 _drawRaf 節流 guard，不會疊加出常駐 loop）。
    const deps = { canvas, ctx, padding, cellSize, starPoints: STAR_POINTS, scheduleRedraw: drawBoard };
    GoUI.drawBoard(deps, buildBoardViewState());
    cellSize = deps.cellSize;
    padding = deps.padding;
  });
}

// ==================== GAME ACTIONS ====================
function placeStone(x, y) {
  if (isGameBlocked()) return false;
  if (isAIThinking && gameMode === 'pvc') return false;

  const result = GameState.applyMove(x, y);
  if (!result.ok) {
    flashInvalid(x, y);
    showToast(invalidMoveReasonText(result.reason));
    playSfx('invalid-move');
    return false;
  }
  applyStateFromStore();

  showingHint = false;
  suggestMove = null;

  updateUI();
  const willRequestAI = gameMode === 'pvc' && currentPlayer !== playerColor && !gameOver;
  const previousIsAIThinking = isAIThinking;
  isAIThinking = willRequestAI ? true : previousIsAIThinking;
  syncStatus();
  isAIThinking = previousIsAIThinking;
  drawBoard();
  playSfx('stone-place');
  if (result.captured > 0) setTimeout(() => playSfx('stone-capture'), 80);

  if (timerEnabled) switchTimer();
  saveGame();

  if (willRequestAI) {
    setTimeout(() => aiController.requestAIMove(), AI_MOVE_DELAY_MS);
  }

  return true;
}

function doPass() {
  if (isGameBusy()) return;

  showingHint = false;
  suggestMove = null;

  const result = GameState.applyPass();
  if (!result.ok) return;
  applyStateFromStore();
  playSfx('pass');

  if (result.endedByDoublePass) {
    endGameByScoring();
    return;
  }

  updateUI();
  const willRequestAI = gameMode === 'pvc' && currentPlayer !== playerColor && !gameOver;
  const previousIsAIThinking = isAIThinking;
  isAIThinking = willRequestAI ? true : previousIsAIThinking;
  // In pvc, if after this pass it's the player's turn and no AI move is queued,
  // the AI was the one that just passed — guide the player on how to finish.
  const aiJustPassed = gameMode === 'pvc' && !willRequestAI && currentPlayer === playerColor && !gameOver;
  if (aiJustPassed) {
    setStatus('AI 虛手了 — 你也虛手即可數目，或按「申請數目」直接計算結果');
    showToast('電腦虛手（Pass）');   // 醒目提示，避免誤以為電腦還沒下
  } else {
    syncStatus();
    // 虛手預警：這手是「單次虛手」（非雙虛手終局，上面已提早 return），提醒再一次就進數目。
    // AI 虛手已在上面分支顯示過提示，這裡只在非 AI 虛手時顯示，避免同一時刻兩個 toast。
    if (!result.endedByDoublePass && passCount === 1) {
      showToast('再虛手一次將進入數目');
    }
  }
  isAIThinking = previousIsAIThinking;
  drawBoard();

  if (timerEnabled) switchTimer();
  saveGame();

  if (willRequestAI) {
    setTimeout(() => aiController.requestAIMove(), AI_MOVE_DELAY_MS);
  }
}

function doUndo() {
  if (isGameBlocked()) return;
  showingHint = false;
  suggestMove = null;
  if (!document.getElementById('undoToggle').checked) {
    setStatus('悔棋功能已關閉，可在設定中開啟');
    return;
  }
  if (boardHistory.length === 0) return;

  const result = GameState.undo({ gameMode });
  if (!result.ok) return;
  applyStateFromStore();

  updateUI();
  syncStatus();
  drawBoard();
  setStatus('已退回一手');
  saveGame();
}

function doResign() {
  if (isGameBlocked()) return;
  const winner = opponent(currentPlayer);
  // 認輸視為大敗/大勝：認輸者的對手贏。以人類視角換算 margin 給自適應難度。
  const humanWon = (winner === playerColor);
  applyResultToLevel(humanWon ? 30 : -30);
  endGame(`${winner === BLACK ? '黑方' : '白方'}勝`, `${currentPlayer === BLACK ? '黑' : '白'}方認輸`, outcomeFor(winner));
}

// 依對局模式與人類執子換算終局音效結果：PvP 一律視為「勝」音（無輸家視角）；
// PvC 依人類是否為贏家算 win/lose，winnerColor 為 null 代表和局。
function outcomeFor(winnerColor) {
  if (gameMode !== 'pvc') return 'win';
  if (winnerColor === null) return 'draw';
  return winnerColor === playerColor ? 'win' : 'lose';
}

// ——— 自適應難度（電腦等級依戰績升降） ———
function loadAiLevel() {
  try {
    const v = parseInt(localStorage.getItem(AI_LEVEL_KEY));
    if (Number.isFinite(v)) return Math.max(MIN_LEVEL, v);
  } catch (_) {}
  return MIN_LEVEL; // 預設從最低級開始往上爬
}

function saveAiLevel() {
  try { localStorage.setItem(AI_LEVEL_KEY, String(aiLevel)); } catch (_) {}
}

// 更新設定面板的「電腦等級」顯示。
function updateAiLevelDisplay() {
  const el = document.getElementById('aiLevelDisplay');
  if (el) el.textContent = `第 ${aiLevel} 級（${kyuLabel(aiLevel)}）`;
}

let _pendingLevelMsg = null; // 升降訊息，於結束彈窗顯示

// 依「人類視角勝負目數」調整等級，回傳是否有變動，並備妥明示訊息。
function applyResultToLevel(humanMargin) {
  if (gameMode !== 'pvc') return; // 只在人機對局調整
  const before = aiLevel;
  const r = nextLevel(before, humanMargin);
  aiLevel = r.level;
  saveAiLevel();
  updateAiLevelDisplay();
  if (r.change === 'up') _pendingLevelMsg = `🎉 你贏得漂亮！電腦升到第 ${aiLevel} 級（${kyuLabel(aiLevel)}）`;
  else if (r.change === 'down') _pendingLevelMsg = `電腦降到第 ${aiLevel} 級（${kyuLabel(aiLevel)}），調整步調再來`;
  else _pendingLevelMsg = `電腦維持第 ${aiLevel} 級（${kyuLabel(aiLevel)}）`;
}

function resetAiLevel() {
  aiLevel = MIN_LEVEL;
  saveAiLevel();
  updateAiLevelDisplay();
  setStatus(`已重設：電腦回到第 ${aiLevel} 級（${kyuLabel(aiLevel)}）`);
}

// End the game by counting territory, without needing the double-pass dance.
// Lets the player settle the result and see who won by how many points.
function finishGame() {
  if (isGameBusy()) return;
  if (moveHistory.length === 0) {
    setStatus('還沒有落子，無法數目');
    return;
  }
  endGameByScoring();
}

// 用 KataGo 的 ownership 推導死子：盤上某顆棋子若所在點被對方明確佔有（|own| 夠大且歸對方），
// 即判為死子。ownership：+1 黑佔 / -1 白佔，黑視角，index = row*size+col。
function deadStonesFromOwnership(ownership) {
  const dead = new Set();
  if (!ownership) return dead;
  const TH = 0.5; // 歸屬信心門檻；> 0.5 視為該方明確佔有
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const v = board[x][y];
      if (v === EMPTY) continue;
      const own = ownership[x * size + y]; // +黑 / -白
      // 黑子落在白佔區 → 黑子死；白子落在黑佔區 → 白子死
      if (v === BLACK && own < -TH) dead.add(x * size + y);
      else if (v === WHITE && own > TH) dead.add(x * size + y);
    }
  }
  return dead;
}

async function endGameByScoring() {
  GameState.beginScoring();
  applyStateFromStore();
  stopTimer();
  document.getElementById('scoringPanel').style.display = 'block';
  // 先用舊估算顯示「計算中」基準，再用 KataGo ownership 覆蓋成準確結果。
  updateScoringDisplay();
  setStatus('AI 數目中…');
  drawBoard();

  try {
    const { ownership } = await KataGo.scoreGame({
      board, size, currentPlayer, moveHistory, komi, gameRules, onStatus: setStatus,
    });
    if (ownership) {
      const dead = deadStonesFromOwnership(ownership);
      GameState.sync({ deadStones: Array.from(dead) });
      applyStateFromStore();
      _lastOwnership = ownership;
    }
  } catch (err) {
    console.error('KataGo scoring failed, fallback to JS estimate:', err);
    // 失敗則沿用 beginScoring 的純 JS 估算（已在 deadStones 內）
  }

  updateScoringDisplay();
  applyUnfinishedWarning();
  drawBoard();
}
let _lastOwnership = null;

function updateScoringDisplay() {
  const score = calculateScore(board, size, deadStones, captures, gameRules, komi);
  GoUI.updateScoringDisplay({ gameRules, komi }, score);
}

// 數「中立空點」＝空且不屬任一方領地的點。多 → 邊界沒收完、尚未終局。純規則。
function countNeutralEmpty(score) {
  if (!score || !score.territory) return 0;
  let n = 0;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] === EMPTY && score.territory[x][y] === 0) n++;
    }
  }
  return n;
}

// 數目時若還有很多中立空點，提示尚未終局（避免拿過早的比分當定局）。
function applyUnfinishedWarning() {
  const score = calculateScore(board, size, deadStones, captures, gameRules, komi);
  const neutral = countNeutralEmpty(score);
  const warnEl = document.getElementById('scoringWarn');
  const mHint = document.getElementById('mobileScoringHint');
  const defaultHint = '已自動估算死子；點棋盤上的死子可修正';
  if (neutral > size) {
    const msg = `尚未終局？還有 ${neutral} 個雙方交界的空點未圍定，建議先收完官子再數目，目前結果可能不準。`;
    if (warnEl) { warnEl.textContent = msg; warnEl.style.display = 'block'; }
    if (mHint) mHint.textContent = msg;
    setStatus(msg);
  } else {
    if (warnEl) warnEl.style.display = 'none';
    if (mHint) mHint.textContent = defaultHint;
    setStatus('已自動估算死子，可點擊修正，然後確認結果');
  }
}

function confirmScoring() {
  const score = calculateScore(board, size, deadStones, captures, gameRules, komi);
  const diff = score.black - score.white;
  const winner = diff > 0 ? '黑方' : '白方';
  const detail = `黑 ${score.black.toFixed(1)} vs 白 ${score.white.toFixed(1)}（含貼目 ${komi}）`;
  // 人類視角的勝負目數（人執 playerColor）：正=人贏 N 目、負=人輸 N 目。
  const humanMargin = playerColor === BLACK ? diff : -diff;
  applyResultToLevel(humanMargin);
  GameState.confirmScoring();
  applyStateFromStore();
  document.getElementById('scoringPanel').style.display = 'none';
  const winnerColor = diff > 0 ? BLACK : diff < 0 ? WHITE : null;
  endGame(`${winner}勝`, detail, outcomeFor(winnerColor));
}

function cancelScoring() {
  GameState.cancelScoring();
  applyStateFromStore();
  document.getElementById('scoringPanel').style.display = 'none';
  setStatus('已取消數目');
  drawBoard();
}

function endGame(title, detail, outcome) {
  gameOver = true;
  stopTimer();
  document.getElementById('modalTitle').textContent = '遊戲結束';
  document.getElementById('modalResult').textContent = title;
  document.getElementById('modalDetail').textContent = detail;
  // 客觀對局摘要（純規則，不做形勢/勝率臆測）
  const sm = document.getElementById('modalSummary');
  if (sm) {
    const s = GoReview.summarizeGame(moveHistory, size);
    let txt = `全 ${s.totalMoves} 手・黑提 ${s.blackCaptured} 子、白提 ${s.whiteCaptured} 子`;
    if (s.biggest) {
      txt += `・最大一次：第 ${s.biggest.moveNumber} 手${s.biggest.byPlayer === BLACK ? '黑' : '白'}提 ${s.biggest.count} 子`;
    }
    sm.textContent = txt;
  }
  // 自適應難度：明示電腦升/降級
  if (_pendingLevelMsg) {
    const sm2 = document.getElementById('modalSummary');
    if (sm2) sm2.textContent = (sm2.textContent ? sm2.textContent + '\n' : '') + _pendingLevelMsg;
    _pendingLevelMsg = null;
  }
  const reviewOn = document.getElementById('reviewToggle').checked;
  document.getElementById('modalReviewBtn').style.display = reviewOn ? 'block' : 'none';
  document.getElementById('resultModal').classList.add('show');
  if (reviewOn) {
    document.getElementById('reviewBtn').style.display = 'block';
  }
  document.getElementById('exportSgfBtn').style.display = 'block';
  setStatus(`遊戲結束 - ${title}`);
  drawBoard();
  playSfx(`game-${outcome || 'win'}`);
}

function exportSGF() {
  const handicapStones = GameState.getState().handicap >= 2 ? handicapPoints(size, GameState.getState().handicap) : [];
  const sgf = buildSGF(moveHistory, size, komi, handicapStones);
  const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `gogame_${date}_${size}x${size}.sgf`;
  a.click();
  URL.revokeObjectURL(url);
}

function closeModal() {
  document.getElementById('resultModal').classList.remove('show');
}

// ==================== TIMER ====================
function _timerOnTimeout(losingPlayer) {
  const winner = opponent(losingPlayer);
  applyResultToLevel(winner === playerColor ? 30 : -30);
  endGame(`${winner === BLACK ? '黑方' : '白方'}勝`, `${losingPlayer === BLACK ? '黑' : '白'}方超時`, outcomeFor(winner));
}

function initTimer() {
  const minutes = parseInt(document.getElementById('timerMinutes').value);
  GoTimer.init(timerSeconds, minutes);
}

function startTimer() {
  if (!timerEnabled) return;
  GoTimer.start(timerSeconds, () => currentPlayer, _timerOnTimeout);
}

function switchTimer() {
  if (!timerEnabled) return;
  GoTimer.switch(timerSeconds, () => currentPlayer, _timerOnTimeout);
}

function stopTimer() { GoTimer.stop(); }

function updateTimerDisplay() { GoTimer.updateDisplay(timerSeconds); }

// ==================== REVIEW ====================
function enterReview() {
  if (!document.getElementById('reviewToggle').checked) return;
  const result = GameState.enterReview();
  if (!result.ok) return;
  applyStateFromStore();
  document.getElementById('reviewBar').style.display = 'block';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'block';
  updateReviewInfo();
  drawBoard();
}

function exitReview() {
  const result = GameState.exitReview();
  if (!result.ok) return;
  applyStateFromStore();
  document.getElementById('reviewBar').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'none';
  if (gameOver) document.getElementById('reviewBtn').style.display = 'block';
  drawBoard();
}

function reviewGo(n) {
  const result = GameState.reviewGo(n);
  if (!result.ok) return;
  applyStateFromStore();
  updateReviewInfo();
  drawBoard();
}

function updateReviewInfo() {
  GoUI.updateReviewInfo({ currentReviewMove, moveHistory, size });
  if (reviewAnalysis) {
    GoUI.updateReviewAnalysisInfo({ currentReviewMove, moveHistory, analysis: reviewAnalysis });
    GoUI.drawWinrateGraph(document.getElementById('winrateGraph'), reviewAnalysis, currentReviewMove);
  }
}

// ==================== LEARNING MODE ====================
let savedOriginalGame = null;

// 覆盤分析（2c）：每個位置（第 0..N 手後）的黑方勝率/分數，由 KataGo 逐手算出。
// reviewAnalysis[k] = { wr: 黑勝率 0..1, lead: 黑領先目數 }。null = 尚未分析。
let reviewAnalysis = null;
let reviewAnalyzing = false;
let reviewOwnershipOn = false;

function clearReviewAnalysis() {
  reviewAnalysis = null;
  reviewOwnershipOn = false;
  const g = document.getElementById('winrateGraph');
  if (g) g.style.display = 'none';
  const info = document.getElementById('reviewAnalysisInfo');
  if (info) info.textContent = '';
  const ob = document.getElementById('ownershipBtn');
  if (ob) { ob.style.display = 'none'; ob.classList.remove('active'); }
}

function toggleReviewOwnership() {
  if (!reviewAnalysis) return;
  reviewOwnershipOn = !reviewOwnershipOn;
  const ob = document.getElementById('ownershipBtn');
  if (ob) ob.classList.toggle('active', reviewOwnershipOn);
  drawBoard();
}

// 用 KataGo 誠實逐手分析本局（opt-in；低 visits；黑方觀點，不宣稱精確目數）。
async function analyzeReview() {
  if (!isReviewing || reviewAnalyzing) return;
  reviewAnalyzing = true;
  const btn = document.getElementById('analyzeReviewBtn');
  if (btn) btn.disabled = true;
  const N = moveHistory.length;
  const results = new Array(N + 1).fill(null);
  try {
    await KataGo.ensureReady(setStatus);
    for (let k = 0; k <= N; k++) {
      setStatus(`分析中… ${k}/${N}`);
      const b = GoReview.getReviewBoard(moveHistory, k, size);
      const player = (k % 2 === 0) ? BLACK : WHITE; // 第 k 手後輪到誰
      const a = await KataGo.evaluate({
        board: b, size, currentPlayer: player,
        moveHistory: moveHistory.slice(0, k), komi, gameRules,
      }, { visits: 12 });
      results[k] = { wr: a.rootWinRate, lead: a.rootScoreLead, ownership: a.ownership };
    }
    reviewAnalysis = results;
    setStatus('分析完成 — 逐手切換看勝率與失分，或點曲線跳手');
    const g = document.getElementById('winrateGraph');
    if (g) g.style.display = 'block';
    const ob = document.getElementById('ownershipBtn');
    if (ob) ob.style.display = '';
    updateReviewInfo();
  } catch (err) {
    console.error('Review analysis error:', err);
    setStatus('分析失敗：' + (err && err.message ? err.message : String(err)));
  } finally {
    reviewAnalyzing = false;
    if (btn) btn.disabled = false;
  }
}

function onWinrateGraphClick(e) {
  if (!reviewAnalysis) return;
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  const N = moveHistory.length;
  reviewGo(Math.max(0, Math.min(N, Math.round(frac * N))));
}

// Branch the game from the current review position so the player can try a
// different move and keep playing the AI, without losing the original record.
function replayFromHere() {
  if (!isReviewing) return;
  const cut = currentReviewMove;
  savedOriginalGame = GameState.getSnapshot();
  const original = savedOriginalGame;
  const movesToReplay = original.moveHistory.slice(0, cut);
  const sideToMove = (cut % 2 === 0) ? BLACK : WHITE;

  GameState.exitReview();
  GameState.startGame({
    size: original.size,
    gameMode: 'pvc',
    playerColor: sideToMove,
    aiLevel: original.aiLevel,
    timerEnabled: false,
    timerSeconds: { [BLACK]: 600, [WHITE]: 600 },
    gameRules: original.gameRules,
    komi: original.komi,
  });
  for (const m of movesToReplay) {
    if (m.pass) GameState.applyPass();
    else GameState.applyMove(m.x, m.y);
  }
  applyStateFromStore();

  document.getElementById('reviewBar').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'none';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('returnOriginalBtn').style.display = 'block';
  clearReviewAnalysis();

  setStatus('練習模式：換個下法試試，再與 AI 繼續對弈');
  updateUI();
  drawBoard();
  if (gameMode === 'pvc' && currentPlayer !== playerColor && !gameOver) {
    setTimeout(() => aiController.requestAIMove(), AI_MOVE_DELAY_MS);
  }
}

function returnToOriginal() {
  if (!savedOriginalGame) return;
  GameState.restoreSnapshot(savedOriginalGame);
  savedOriginalGame = null;
  applyStateFromStore();
  document.getElementById('returnOriginalBtn').style.display = 'none';
  if (gameOver && document.getElementById('reviewToggle').checked) {
    document.getElementById('reviewBtn').style.display = 'block';
  }
  setStatus('已返回原始棋譜');
  updateUI();
  drawBoard();
}

// ==================== UI ====================
function updateUI() {
  const overlay = document.getElementById('aiThinkingOverlay');
  if (overlay) overlay.style.display = isAIThinking ? 'flex' : 'none';
  GoUI.updateHUD({ gameOver, isAIThinking, currentPlayer, captures, moveHistory });
}

function setStatus(msg) { GoUI.setStatus(msg); }

function syncStatus(message = '') {
  const state = { currentPlayer, gameOver, isScoring, isReviewing, isAIThinking };
  GoUI.syncStatus(state, message);
}

// ==================== NEW GAME ====================
// 進行中對局誤觸保護：有落子且尚未結束時，先確認再開新局，避免清掉進度。
function newGame() {
  if (moveHistory.length > 0 && !gameOver) {
    if (!window.confirm('目前有進行中的對局，開新局會清掉它。確定要重新開始嗎？')) return;
  }
  startNewGame();
}

function startNewGame() {
  const rawSize = parseInt(document.getElementById('boardSize').value);
  size = VALID_BOARD_SIZES.includes(rawSize) ? rawSize : 19;

  const rawMode = document.getElementById('gameMode').value;
  gameMode = VALID_GAME_MODES.includes(rawMode) ? rawMode : 'pvc';

  playerColor = parseInt(document.getElementById('playerColor').value);
  // aiLevel 由自適應系統管理（不再從下拉讀取），沿用目前等級。
  aiLevel = loadAiLevel();
  updateAiLevelDisplay();
  timerEnabled = document.getElementById('timerToggle').checked;
  gameRules = document.getElementById('gameRules').value;
  komi = gameRules === 'japanese' ? 6.5 : 7.5;

  // 讓子（S6）：只在 PvC 生效。讓子＝人執黑（拿讓子）、AI 執白先下、白貼 0.5 目。
  const handicapEl = document.getElementById('handicap');
  let handicap = handicapEl ? parseInt(handicapEl.value) || 0 : 0;
  if (gameMode !== 'pvc' || handicap < 2) handicap = 0;
  let handicapBoard, handicapFirstPlayer;
  if (handicap >= 2) {
    playerColor = BLACK;                          // 人固定執黑
    handicapBoard = placeHandicap(size, handicap); // 預置黑讓子
    handicapFirstPlayer = WHITE;                    // 白（AI）先下
    komi = 0.5;
  }

  GameState.startGame({
    size, gameMode, playerColor, aiLevel, timerEnabled, timerSeconds, gameRules, komi,
    handicap, board: handicapBoard, currentPlayer: handicapFirstPlayer,
  });
  applyStateFromStore();

  emotionEnabled  = document.getElementById('emotionToggle').checked;

  document.getElementById('scoringPanel').style.display = 'none';
  document.getElementById('reviewBar').style.display = 'none';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'none';
  document.getElementById('exportSgfBtn').style.display = 'none';
  document.getElementById('resultModal').classList.remove('show');
  clearReviewAnalysis();

  stopTimer();
  if (timerEnabled) { initTimer(); startTimer(); }

  // AI 先手 = PvC 且開局輪到的不是玩家（含讓子局：白＝AI 先下）。
  const aiStartsGame = gameMode === 'pvc' && currentPlayer !== playerColor && !gameOver;
  updateUI();
  syncStatus(aiStartsGame ? 'AI 思考中...' : '');
  drawBoard();
  clearSave();
  saveGame();

  // 不預載引擎；AI 先手時才求手（KataGo lazy 載入，模型約一次性下載 3.8MB）。
  if (aiStartsGame) {
    setTimeout(() => aiController.requestAIMove(), AI_INIT_DELAY_MS);
  }
}

// ==================== SAVE / RESTORE ====================
const SAVE_KEY = 'gogame_state';

function applyStateFromStore() {
  const s = GameState.getState();
  size = s.size;
  board = s.board.map(r => [...r]);
  currentPlayer = s.currentPlayer;
  captures = { ...s.captures };
  moveHistory = (s.moveHistory || []).map(m => ({ ...m }));
  boardHistory = (s.boardHistory || []).map(h => ({
    board: h.board.map(r => [...r]),
    captures: { ...h.captures },
    koPoint: h.koPoint,
    currentPlayer: h.currentPlayer,
    lastMove: h.lastMove,
    passCount: h.passCount
  }));
  koPoint = s.koPoint;
  passCount = s.passCount;
  gameOver = s.gameOver;
  lastMove = s.lastMove;
  gameMode = s.gameMode;
  playerColor = s.playerColor;
  aiLevel = s.aiLevel;
  timerEnabled = s.timerEnabled;
  timerSeconds = { ...s.timerSeconds };
  gameRules = s.gameRules;
  komi = s.komi;
  isReviewing = s.isReviewing;
  currentReviewMove = s.currentReviewMove;
  isScoring = s.isScoring;
  deadStones = new Set(s.deadStones || []);
  isAIThinking = !!s.isAIThinking;
  syncStatus();
}

function saveGame() {
  if (isReviewing || isScoring) return;
  GameState.sync({ timerSeconds });
  const snapshot = GameState.getSnapshot();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot)); } catch(e) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || !s.board) return false;

    GameState.restoreSnapshot(s);
    applyStateFromStore();

    document.getElementById('boardSize').value = size;
    document.getElementById('gameMode').value = gameMode;
    document.getElementById('playerColor').value = playerColor;
    aiLevel = loadAiLevel();
    updateAiLevelDisplay();
    document.getElementById('timerToggle').checked = timerEnabled;
    document.getElementById('gameRules').value = gameRules;
    document.getElementById('playerColorGroup').style.display = gameMode === 'pvc' ? 'block' : 'none';
    document.getElementById('aiStrengthGroup').style.display = gameMode === 'pvc' ? 'block' : 'none';
    const handicapState = GameState.getState().handicap || 0;
    const hg = document.getElementById('handicapGroup');
    if (hg) hg.style.display = gameMode === 'pvc' ? 'block' : 'none';
    const hSel = document.getElementById('handicap');
    if (hSel) hSel.value = String(handicapState);
    document.getElementById('playerColor').disabled = handicapState >= 2;
    document.getElementById('timerSettings').style.display = timerEnabled ? 'block' : 'none';
    document.getElementById('timerArea').style.display = timerEnabled ? 'block' : 'none';
    if (timerEnabled) updateTimerDisplay();
    if (gameOver && document.getElementById('reviewToggle').checked) {
      document.getElementById('reviewBtn').style.display = 'block';
    }

    updateUI();
    drawBoard();
    syncStatus(gameOver ? '遊戲結束 — 可覆盤或開始新局' : `已恢復棋局（第 ${moveHistory.length} 手）`);

    // 不預載引擎；若恢復後輪到 AI，直接求手（KataGo 優先、lazy）。
    if (gameMode === 'pvc' && !gameOver && currentPlayer !== playerColor) {
      setTimeout(() => aiController.requestAIMove(), AI_INIT_DELAY_MS);
    }
    return true;
  } catch(e) {
    console.error('Failed to load game:', e);
    return false;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch(e) {}
}

// Wrap doPass/doUndo to also save
const _origDoPass = doPass;
function doPassAndSave() { _origDoPass(); saveGame(); }
const _origDoUndo = doUndo;
function doUndoAndSave() { _origDoUndo(); saveGame(); }

// ==================== PWA ====================
const VERSION_INFO_URL = 'version.json?t=' + Date.now();
const VERSION_FALLBACK = 'dev';

let _currentVersion = VERSION_FALLBACK;

async function applyAppVersion() {
  try {
    const response = await fetch(VERSION_INFO_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('version fetch failed');
    const data = await response.json();
    const version = data?.version || VERSION_FALLBACK;
    _currentVersion = version;
    document.getElementById('versionFooter').textContent = `版本：${version}`;
    return version;
  } catch (_) {
    document.getElementById('versionFooter').textContent = `版本：${VERSION_FALLBACK}`;
    return VERSION_FALLBACK;
  }
}

// ==================== CHANGELOG ====================
// Minimal, escaped Markdown → HTML for the changelog modal (no deps).
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  const lines = md.split('\n');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line))      { closeList(); html += `<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`; }
    else if (/^##\s+/.test(line))  { closeList(); html += `<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`; }
    else if (/^#\s+/.test(line))   { closeList(); html += `<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`; }
    else if (/^---+$/.test(line))  { closeList(); html += '<hr>'; }
    else if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
    }
    else if (line === '')          { closeList(); }
    else                           { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html;
}

let _changelogLoaded = false;
async function loadChangelog() {
  if (_changelogLoaded) return;
  const body = document.getElementById('changelogBody');
  try {
    const res = await fetch('CHANGELOG.md?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('changelog fetch failed');
    const md = await res.text();
    body.innerHTML = renderMarkdown(md);
    _changelogLoaded = true;
  } catch (_) {
    body.textContent = '無法載入版本紀錄。';
  }
}

function openChangelog() {
  document.getElementById('changelogVersion').textContent = `目前版本：${_currentVersion}`;
  document.getElementById('changelogModal').classList.add('show');
  loadChangelog();
}

function closeChangelog() {
  document.getElementById('changelogModal').classList.remove('show');
}

function openAbout() {
  document.getElementById('aboutModal').classList.add('show');
}

function closeAbout() {
  document.getElementById('aboutModal').classList.remove('show');
}

// ==================== 全域音訊設定 modal（首頁「設定」鈕）====================
function openAudioSettings() {
  document.getElementById('audioSettingsModal').classList.add('show');
}

function closeAudioSettings() {
  document.getElementById('audioSettingsModal').classList.remove('show');
}

// ==================== GLOBAL ERROR HANDLING ====================
window.addEventListener('error', (e) => {
  if (!e.filename || !e.filename.includes(location.hostname)) return;
  console.error('Uncaught error:', e.error || e.message);
  setStatus(`操作失敗：${e.message || '未知錯誤'}。遊戲已自動儲存，可重新整理頁面。`);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  const msg = e.reason?.message || String(e.reason) || '未知錯誤';
  setStatus(`操作失敗：${msg}。遊戲已自動儲存，可重新整理頁面。`);
});

// ==================== EXPOSE TO HTML onclick handlers ====================
// index.html uses onclick="..." so we expose top-level names on window.
Object.assign(window, {
  startNewGame,
  newGame,
  doPass: doPassAndSave,
  doUndo: doUndoAndSave,
  doResign,
  finishGame,
  resetAiLevel,
  showHintOnce,
  requestMoveHint,
  enterReview,
  exitReview,
  reviewGo,
  replayFromHere,
  returnToOriginal,
  analyzeReview,
  onWinrateGraphClick,
  toggleReviewOwnership,
  exportSGF,
  closeModal,
  openChangelog,
  closeChangelog,
  openAbout,
  closeAbout,
  openAudioSettings,
  closeAudioSettings,
  confirmScoring,
  cancelScoring,
  openGoSettings,
  closeGoSettings,
  toggleGoSettings,
  currentReviewMove: undefined, // overwritten via getter below
  moveHistory: undefined,       // overwritten via getter below
});
// Keep window.currentReviewMove and window.moveHistory in sync for inline onclick
// handlers in index.html (e.g. reviewGo(currentReviewMove-1)).
Object.defineProperty(window, 'currentReviewMove', {
  get() { return currentReviewMove; },
  configurable: true
});
Object.defineProperty(window, 'moveHistory', {
  get() { return moveHistory; },
  configurable: true
});

// ==================== INIT ====================
registerEventHandlers(app);
updateAiLevelDisplay();

// 全域音訊：掛一次性解鎖手勢＋背景/前景生命週期監聽；設定 UI 容器在頁面載入時就存在
// （各棋畫面雖隱藏但 DOM 已渲染），可一次性渲染，靠 audio-settings-ui.js 的
// audio-settings-changed 監聽自動與其他實例同步，不必等使用者進到該棋種畫面才建立。
initAudio();
renderAudioControls(document.getElementById('homeAudioSettings'));
renderAudioControls(document.getElementById('goAudioSettings'));
// 快捷靜音鈕（首頁 header／六棋 mode-header）：一次掃描整份 document 就好，
// 各棋畫面雖隱藏但按鈕 DOM 已存在，不必等進入該畫面才掛 listener。
initAudioMuteButtons();

// App 版（iOS/Android 內嵌 server，port 3333）不顯示 GitHub 連結（使用者要求）：
// 自家「原始碼」行整行移除、作者改純文字；第三方授權標註保留文字但去連結化（GPL/MIT 署名合規）。
if (location.port === '3333') {
  const src = document.getElementById('aboutSourceLine');
  if (src) src.remove();
  const author = document.getElementById('aboutAuthorLine');
  if (author) author.textContent = '作者：Jackie Yeh';
  document.querySelectorAll('#aboutModal a[href*="github.com"]').forEach((a) => {
    const span = document.createElement('span');
    span.textContent = a.textContent;
    a.replaceWith(span);
  });
}

const _isLocalDev = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && _isLocalDev) {
  // 開發環境不註冊 SW，並清掉既有註冊與快取，避免一直吃到舊資源
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
}

// 先取得當前版本，再以「帶當前版號的 query」註冊 SW。
// 舊版寫死 'sw.js?v=v2026.03.15-9c49be6'：query 永不改變 → 瀏覽器更新檢查時被 HTTP 快取
// 餵回舊 sw.js bytes，新 SW 永遠裝不上去。舊 SW 會把 /img/* 漏接成 fallback HTML，
// 導致標題圖載入失敗、首頁毛筆字消失。改用 version.json 的當前版號，每次部署 query 都變，
// 強制瀏覽器抓新 sw.js，新 SW 才能接管（skipWaiting + clients.claim）。
applyAppVersion().then((version) => {
  if ('serviceWorker' in navigator && !_isLocalDev) {
    navigator.serviceWorker.register('sw.js?v=' + version).catch(() => {});
  }
});

// ==================== HOME / ROUTING ====================
// 以 location.hash 為單一路由來源：
//   ''/'#home' → 首頁、'#play' → 對弈、'#tsumego' → 死活練習。
// 對弈只在首次進入「對弈」時初始化（保留 loadGame 自動恢復未完成對局）。
// desc 寫成「上句，下句」對句（意象＋氣勢），renderHome 會固定在逗號處斷成兩行（對聯感、不孤字）。
const HOME_ITEMS = [
  { id: 'play',    title: '圍棋對弈', desc: '黑白手談，方圓論天地', hash: '#play' },
  { id: 'tsumego', title: '死活練習', desc: '方寸之間，一子定生死', hash: '#tsumego' },
  { id: 'xiangqi', title: '象棋對弈', desc: '楚河漢界，車馬論英雄', hash: '#xiangqi' },
  { id: 'xqpuzzle',title: '象棋殘局', desc: '古譜殘局，絕處覓殺機', hash: '#xqpuzzle' },
  { id: 'shogi',   title: '日本將棋', desc: '升變打入，俘子再成軍', hash: '#shogi' },
  { id: 'gomoku',  title: '五子棋',   desc: '縱橫連珠，先連者為王', hash: '#gomoku' },
  { id: 'othello', title: '黑白棋',   desc: '黑白翻覆，一夾定乾坤', hash: '#othello' },
  { id: 'chess',   title: '西洋棋',   desc: '兩軍對壘，將死擒敵王', hash: '#chess' },
];

let playInited = false;

function hasUnfinishedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    return !!(s && s.board && !s.gameOver && (s.moveHistory || []).length > 0);
  } catch (_) { return false; }
}

function homeItemHint(id) {
  if (id === 'play') return hasUnfinishedGame() ? '有對局可續弈' : '';
  if (id === 'tsumego') {
    const n = tsumegoSolvedTotal();
    return n > 0 ? `已解 ${n} 題` : '';
  }
  return '';
}

function renderHome() {
  const menu = document.getElementById('homeMenu');
  menu.innerHTML = '';
  for (const item of HOME_ITEMS) {
    const card = document.createElement('button');
    card.className = 'home-card';
    card.type = 'button';

    const title = document.createElement('span');
    title.className = 'home-card-title';
    title.textContent = item.title;
    card.appendChild(title);

    const desc = document.createElement('span');
    desc.className = 'home-card-desc';
    // 對句固定在首個逗號／頓號處斷成上下兩行（避免 CJK 逐字斷行的孤字）
    const parts = item.desc.split(/[，、]/);
    if (parts.length === 2) {
      const top = document.createElement('span'); top.textContent = parts[0];
      const bottom = document.createElement('span'); bottom.textContent = parts[1];
      desc.append(top, bottom);
    } else {
      desc.textContent = item.desc;
    }
    card.appendChild(desc);

    const hint = homeItemHint(item.id);
    if (hint) {
      const tag = document.createElement('span');
      tag.className = 'home-card-hint';
      tag.textContent = hint;
      card.appendChild(tag);
    }

    card.addEventListener('click', () => { location.hash = item.hash; });
    menu.appendChild(card);
  }
}

function showScreen(name) {
  document.getElementById('homeScreen').style.display = name === 'home' ? 'flex' : 'none';
  document.getElementById('goScreen').style.display = name === 'play' ? 'flex' : 'none';
  document.getElementById('tsumegoScreen').style.display = name === 'tsumego' ? 'flex' : 'none';
  document.getElementById('gomokuScreen').style.display = name === 'gomoku' ? 'flex' : 'none';
  document.getElementById('xiangqiScreen').style.display = name === 'xiangqi' ? 'flex' : 'none';
  document.getElementById('shogiScreen').style.display = name === 'shogi' ? 'flex' : 'none';
  document.getElementById('chessScreen').style.display = name === 'chess' ? 'flex' : 'none';
  document.getElementById('othelloScreen').style.display = name === 'othello' ? 'flex' : 'none';
  document.getElementById('xqpScreen').style.display = name === 'xqpuzzle' ? 'flex' : 'none';
  const playHeader = document.getElementById('playHeader');
  if (playHeader) playHeader.style.display = name === 'play' ? 'flex' : 'none';
}

function enterPlayMode() {
  loadSfxPack('go');
  loadSfxPack('common');
  if (!playInited) {
    playInited = true;
    if (!loadGame()) startNewGame();
  }
}

function goHome() { location.hash = '#home'; }

// 各路由的分頁標題（供瀏覽器分頁顯示，也讓 GA4「網頁標題」報表能區分各棋類——
// hash SPA 的 page_path 會被去掉 hash，否則各棋種在報表裡長一樣）。
const SITE_TITLE = '弈樂 · 多棋類線上對弈';
const ROUTE_TITLES = {
  '#tsumego': '圍棋死活', '#gomoku': '五子棋', '#xiangqi': '象棋對弈',
  '#shogi': '日本將棋', '#chess': '西洋棋', '#othello': '黑白棋',
  '#xqpuzzle': '象棋殘局', '#play': '圍棋對弈',
};

/** 對弈中切換棋種會送一次自訂事件 `spa_pageview`。Zaraz 的自動 Pageview 只記首次載入，
 *  hash SPA 換頁不會自動算，故在此補送。用獨立事件名（非 'Pageview'）避免與內建自動 Pageview
 *  撞名而重複計數；後台需建一個「Event Name equals spa_pageview」的觸發器掛到 GA 的 Pageview。
 *  用 optional chaining：Zaraz 未載入（含尚未在 Cloudflare 設好）時為 no-op、零風險。 */
function trackPageview() {
  try { window.zaraz?.track('spa_pageview'); } catch { /* 追蹤失敗不可影響對弈 */ }
}

function applyRoute(animateTitle) {
  const hash = location.hash;
  document.title = ROUTE_TITLES[hash] ? `${ROUTE_TITLES[hash]} · 弈樂` : SITE_TITLE;
  const title = document.querySelector('h1');
  if (hash === '#tsumego') {
    showScreen('tsumego');
    if (title) title.style.visibility = 'visible';
    enterTsumegoMode();
  } else if (hash === '#gomoku') {
    showScreen('gomoku');
    if (title) title.style.visibility = 'visible';
    enterGomokuMode();
  } else if (hash === '#xiangqi') {
    showScreen('xiangqi');
    if (title) title.style.visibility = 'visible';
    enterXiangqiMode();
  } else if (hash === '#shogi') {
    showScreen('shogi');
    if (title) title.style.visibility = 'visible';
    enterShogiMode();
  } else if (hash === '#chess') {
    showScreen('chess');
    if (title) title.style.visibility = 'visible';
    enterChessMode();
  } else if (hash === '#othello') {
    showScreen('othello');
    if (title) title.style.visibility = 'visible';
    enterOthelloMode();
  } else if (hash === '#xqpuzzle') {
    showScreen('xqpuzzle');
    if (title) title.style.visibility = 'visible';
    enterXiangqiPuzzleMode();
  } else if (hash === '#play') {
    showScreen('play');
    if (title) title.style.visibility = 'visible';
    enterPlayMode();
  } else {
    showScreen('home');
    renderHome();
    // 首次載入進首頁時標題水墨暈開；經由過渡切換進來則直接靜態顯示（過渡本身已是揭示）
    if (animateTitle) playTitleReveal(title, { force: true });
    else if (title) title.style.visibility = 'visible';
  }
}

window.goHome = goHome;
// 畫面切換用墨暈過渡；過渡覆蓋到中點時才換 DOM。換頁後補送一次 page_view
// （只在 hashchange 觸發＝不含初次載入，避免與 Zaraz 自動 Pageview 雙重計數）。
window.addEventListener('hashchange', () => playTransition(() => { applyRoute(false); trackPageview(); }));
applyRoute(true);   // 初始載入：標題暈開、不走過渡（page_view 由 Zaraz 自動 Pageview 記）
startAmbient();     // 背景墨雲飄動（桌機）
