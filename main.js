// main.js — entry point; wires modules together and manages shared game state.

import { EMPTY, BLACK, WHITE, opponent, inBounds as _inBounds, getNeighbors as _getNeighbors, getGroup as _getGroup, getLegalMoves as _getLegalMoves, tryPlaceStone as _tryPlaceStone, calculateScore } from './rules.js';
import * as GameStateModule from './game-state.js';
import { GoUI } from './ui.js';
import { GoSound } from './sound.js';
import { GoTimer } from './timer.js';
import { GoHints } from './hints.js';
import { GoReview } from './review.js';
import { GnuGoService } from './gnugo-service.js';
import { toggleSidebar, openSidebar, closeSidebar } from './sidebar.js';
import { makeAiController } from './ai-controller.js';
import { registerEventHandlers } from './event-handlers.js';

// ==================== CONSTANTS ====================
const GUIDANCE_HINT_DELAY_MS = 150;
const AI_MOVE_DELAY_MS       = 100;
const AI_INIT_DELAY_MS       = 300;
const ANALYSIS_STEP_DELAY_MS = 10;
const ANALYSIS_GOOD_DIST     = 3;
const ANALYSIS_BAD_DIST      = 7;
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
let aiLevel = 10;
let isAIThinking = false;

let timerEnabled = false;
let timerSeconds = { [BLACK]: 600, [WHITE]: 600 };

let isReviewing = false;
let currentReviewMove = 0;

let analysisData = null;
let isAnalyzing = false;
let analysisProgress = 0;

let isScoring = false;
let deadStones = new Set();
let showingHint = false;

let guidanceEnabled = false;
let emotionEnabled = false;
let guidanceHints = [];
let guidanceTooltip = null;
let guidanceLoading = false;

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
  GUIDANCE_HINT_DELAY_MS, AI_MOVE_DELAY_MS, AI_INIT_DELAY_MS,
  ANALYSIS_STEP_DELAY_MS, ANALYSIS_GOOD_DIST, ANALYSIS_BAD_DIST,
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
  get guidanceEnabled()   { return guidanceEnabled; },
  get emotionEnabled()    { return emotionEnabled; },
  get guidanceHints()     { return guidanceHints; },
  get guidanceTooltip()   { return guidanceTooltip; },
  get guidanceLoading()   { return guidanceLoading; },
  get analysisData()      { return analysisData; },
  get isAnalyzing()       { return isAnalyzing; },
  get analysisProgress()  { return analysisProgress; },
  get canvas()            { return canvas; },
  get padding()           { return padding; },
  get cellSize()          { return cellSize; },
  get hoverPos()          { return hoverPos; },

  // State setters
  set guidanceHints(v)    { guidanceHints = v; },
  set guidanceTooltip(v)  { guidanceTooltip = v; },
  set guidanceLoading(v)  { guidanceLoading = v; },
  set guidanceEnabled(v)  { guidanceEnabled = v; },
  set emotionEnabled(v)   { emotionEnabled = v; },
  set isAnalyzing(v)      { isAnalyzing = v; },
  set analysisData(v)     { analysisData = v; },
  set analysisProgress(v) { analysisProgress = v; },
  set hoverPos(v)         { hoverPos = v; },

  // References to modules
  GameState,
  GoUI, GoSound, GoTimer, GoHints, GoReview, GnuGoService,

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
  renderGuidanceLegend: () => renderGuidanceLegend(),
  hideGuidanceTooltip: () => hideGuidanceTooltip(),
  showGuidanceTooltipAt: (hint) => showGuidanceTooltipAt(hint),
  clearGuidance: () => clearGuidance(),
  reviewGo: (n) => reviewGo(n),
  showCoachTip: (info) => showCoachTip(info),
  closeSidebar,
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

function getCaptureHints(b, player) {
  return GoHints.getCaptureHints(b, size, player, koPoint);
}

// ==================== BEGINNER GUIDANCE ====================
function requestGuidanceHints() {
  aiController.requestGuidanceHints();
}

function renderGuidanceLegend() {
  GoHints.renderGuidanceLegend(guidanceHints, { guidanceEnabled, gameOver, isReviewing, isScoring, size });
}

function clearGuidance() {
  guidanceHints = [];
  guidanceTooltip = null;
  hideGuidanceTooltip();
  renderGuidanceLegend();
}

function hideGuidanceTooltip() { GoUI.hideGuidanceTooltip(); }
function showGuidanceTooltipAt(hint) {
  GoUI.showGuidanceTooltipAt({ canvas, padding, cellSize }, hint);
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
    analysisData,
    isAnalyzing,
    showingHint,
    captureHints,
    guidanceEnabled,
    guidanceLoading,
    guidanceHints,
    emotionEnabled,
    hoverPos
  };
}

let _drawRaf = null;
function drawBoard() {
  if (_drawRaf) return;
  _drawRaf = requestAnimationFrame(() => {
    _drawRaf = null;
    const deps = { canvas, ctx, padding, cellSize, starPoints: STAR_POINTS };
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
  if (!result.ok) return false;
  applyStateFromStore();

  showingHint = false;
  clearGuidance();

  updateUI();
  const willRequestAI = gameMode === 'pvc' && currentPlayer !== playerColor && !gameOver;
  const previousIsAIThinking = isAIThinking;
  isAIThinking = willRequestAI ? true : previousIsAIThinking;
  syncStatus();
  isAIThinking = previousIsAIThinking;
  drawBoard();
  GoSound.playSound('place');
  if (result.captured > 0) setTimeout(() => GoSound.playSound('capture'), 80);

  if (timerEnabled) switchTimer();
  saveGame();

  if (willRequestAI) {
    if (document.getElementById('realtimeCoach')?.checked) {
      setTimeout(() => aiController.checkLastMoveQuality(), 0);
    }
    setTimeout(() => aiController.requestAIMove(), AI_MOVE_DELAY_MS);
  }

  if (guidanceEnabled && !gameOver) {
    if (gameMode !== 'pvc' || currentPlayer === playerColor) {
      setTimeout(() => requestGuidanceHints(), GUIDANCE_HINT_DELAY_MS);
    }
  }

  return true;
}

function doPass() {
  if (isGameBusy()) return;

  showingHint = false;
  clearGuidance();

  const result = GameState.applyPass();
  if (!result.ok) return;
  applyStateFromStore();

  if (result.endedByDoublePass) {
    endGameByScoring();
    return;
  }

  updateUI();
  const willRequestAI = gameMode === 'pvc' && currentPlayer !== playerColor && !gameOver;
  const previousIsAIThinking = isAIThinking;
  isAIThinking = willRequestAI ? true : previousIsAIThinking;
  syncStatus();
  isAIThinking = previousIsAIThinking;
  drawBoard();

  if (timerEnabled) switchTimer();
  saveGame();

  if (willRequestAI) {
    setTimeout(() => aiController.requestAIMove(), AI_MOVE_DELAY_MS);
  }

  if (guidanceEnabled && !gameOver) {
    if (gameMode !== 'pvc' || currentPlayer === playerColor) {
      setTimeout(() => requestGuidanceHints(), GUIDANCE_HINT_DELAY_MS);
    }
  }
}

function doUndo() {
  if (isGameBlocked()) return;
  showingHint = false;
  clearGuidance();
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

  if (guidanceEnabled && !gameOver) {
    setTimeout(() => requestGuidanceHints(), GUIDANCE_HINT_DELAY_MS);
  }
}

function doResign() {
  if (isGameBlocked()) return;
  const winner = opponent(currentPlayer);
  endGame(`${winner === BLACK ? '⚫ 黑方' : '⚪ 白方'}勝`, `${currentPlayer === BLACK ? '黑' : '白'}方認輸`);
}

function endGameByScoring() {
  GameState.beginScoring();
  applyStateFromStore();
  stopTimer();
  document.getElementById('scoringPanel').style.display = 'block';
  setStatus('已自動估算死子，可點擊修正，然後確認結果');
  updateScoringDisplay();
  drawBoard();
}

function updateScoringDisplay() {
  const score = calculateScore(board, size, deadStones, captures, gameRules, komi);
  GoUI.updateScoringDisplay({ gameRules, komi }, score);
}

function confirmScoring() {
  const score = calculateScore(board, size, deadStones, captures, gameRules, komi);
  const diff = score.black - score.white;
  const winner = diff > 0 ? '⚫ 黑方' : '⚪ 白方';
  const detail = `黑 ${score.black.toFixed(1)} vs 白 ${score.white.toFixed(1)}（含貼目 ${komi}）`;
  GameState.confirmScoring();
  applyStateFromStore();
  document.getElementById('scoringPanel').style.display = 'none';
  endGame(`${winner}勝`, detail);
}

function cancelScoring() {
  GameState.cancelScoring();
  applyStateFromStore();
  document.getElementById('scoringPanel').style.display = 'none';
  setStatus('已取消數目');
  drawBoard();
}

function endGame(title, detail) {
  gameOver = true;
  stopTimer();
  document.getElementById('modalTitle').textContent = '遊戲結束';
  document.getElementById('modalResult').textContent = title;
  document.getElementById('modalDetail').textContent = detail;
  const reviewOn = document.getElementById('reviewToggle').checked;
  document.getElementById('modalReviewBtn').style.display = reviewOn ? 'block' : 'none';
  document.getElementById('resultModal').classList.add('show');
  if (reviewOn) {
    document.getElementById('reviewBtn').style.display = 'block';
  }
  document.getElementById('exportSgfBtn').style.display = 'block';
  setStatus(`遊戲結束 - ${title}`);
  drawBoard();
  GoSound.playSound('gameend');
}

function exportSGF() {
  const sgf = GnuGoService.buildSGF(moveHistory, size, komi);
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
  endGame(`${winner === BLACK ? '⚫ 黑方' : '⚪ 白方'}勝`, `${losingPlayer === BLACK ? '黑' : '白'}方超時`);
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
// On mobile the right info panel is hidden, so move the analysis results panel
// directly under the review bar (within board-wrapper) during review, and put
// it back afterwards. Desktop keeps the panel in the info panel as before.
let _analysisPanelHome = null;
function moveAnalysisPanelToBoard() {
  if (window.innerWidth > 900) return; // desktop: panel stays in the info panel
  const panel = document.getElementById('analysisPanel');
  const reviewBar = document.getElementById('reviewBar');
  const wrapper = document.querySelector('.board-wrapper');
  if (!panel || !reviewBar || !wrapper || panel.parentNode === wrapper) return;
  _analysisPanelHome = { parent: panel.parentNode, next: panel.nextSibling };
  panel.style.width = '100%';
  panel.style.maxWidth = '500px';
  // Insert right after the review bar so progress + results sit where the
  // player is already looking (above the Pass/undo action row).
  wrapper.insertBefore(panel, reviewBar.nextSibling);
}
function restoreAnalysisPanel() {
  const panel = document.getElementById('analysisPanel');
  if (!panel || !_analysisPanelHome) return;
  panel.style.width = '';
  panel.style.maxWidth = '';
  _analysisPanelHome.parent.insertBefore(panel, _analysisPanelHome.next);
  _analysisPanelHome = null;
}

function enterReview() {
  if (!document.getElementById('reviewToggle').checked) return;
  const result = GameState.enterReview();
  if (!result.ok) return;
  applyStateFromStore();
  moveAnalysisPanelToBoard();
  document.getElementById('reviewBar').style.display = 'block';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'block';
  document.getElementById('analysisBtn').style.display = 'block';
  const reviewAnalysisBtn = document.getElementById('reviewAnalysisBtn');
  if (analysisData) {
    document.getElementById('analysisPanel').style.display = 'block';
    document.getElementById('analysisBtn').style.display = 'none';
    if (reviewAnalysisBtn) reviewAnalysisBtn.style.display = 'none';
  } else if (reviewAnalysisBtn) {
    reviewAnalysisBtn.style.display = 'inline-block';
  }
  updateReviewInfo();
  drawBoard();
}

function exitReview() {
  const result = GameState.exitReview();
  if (!result.ok) return;
  applyStateFromStore();
  document.getElementById('reviewBar').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'none';
  document.getElementById('analysisBtn').style.display = 'none';
  document.getElementById('analysisPanel').style.display = 'none';
  restoreAnalysisPanel();
  if (gameOver) document.getElementById('reviewBtn').style.display = 'block';
  drawBoard();
}

function reviewGo(n) {
  const result = GameState.reviewGo(n);
  if (!result.ok) return;
  applyStateFromStore();
  updateReviewInfo();
  if (analysisData && !isAnalyzing) {
    aiController.updateAnalysisMoveInfo();
  }
  drawBoard();
}

function updateReviewInfo() {
  GoUI.updateReviewInfo({ currentReviewMove, moveHistory, size });
}

// ==================== AI REVIEW ANALYSIS ====================
function startAnalysis() {
  aiController.startAnalysis();
}

// ==================== LEARNING MODE ====================
let savedOriginalGame = null;
let _coachTipTimer = null;

// Non-blocking in-game coaching tip: warns when the move just played put its
// own group in atari (one liberty) — a concrete, certain danger signal.
function showCoachTip(info) {
  const el = document.getElementById('coachTip');
  if (!el) return;
  el.innerHTML = `⚠️ ${info.coord} 這塊只剩 1 氣，下一手可能被吃。`
    + ` <button onclick="doUndo()" style="margin-left:6px">重下</button>`
    + ` <button onclick="dismissCoachTip()" style="margin-left:4px">忽略</button>`;
  el.style.display = 'block';
  if (_coachTipTimer) clearTimeout(_coachTipTimer);
  _coachTipTimer = setTimeout(() => { el.style.display = 'none'; }, 8000);
}

function dismissCoachTip() {
  const el = document.getElementById('coachTip');
  if (el) el.style.display = 'none';
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

  isAnalyzing = false;
  analysisData = null;
  document.getElementById('analysisPanel').style.display = 'none';
  document.getElementById('analysisBtn').style.display = 'none';
  document.getElementById('reviewBar').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'none';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('returnOriginalBtn').style.display = 'block';

  setStatus('🔁 練習模式：換個下法試試，再與 AI 繼續對弈');
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
function startNewGame() {
  const rawSize = parseInt(document.getElementById('boardSize').value);
  size = VALID_BOARD_SIZES.includes(rawSize) ? rawSize : 19;

  const rawMode = document.getElementById('gameMode').value;
  gameMode = VALID_GAME_MODES.includes(rawMode) ? rawMode : 'pvc';

  playerColor = parseInt(document.getElementById('playerColor').value);
  aiLevel = parseInt(document.getElementById('aiStrength').value);
  timerEnabled = document.getElementById('timerToggle').checked;
  gameRules = document.getElementById('gameRules').value;
  komi = gameRules === 'japanese' ? 6.5 : 7.5;

  GameState.startGame({ size, gameMode, playerColor, aiLevel, timerEnabled, timerSeconds, gameRules, komi });
  applyStateFromStore();

  analysisData = null;
  isAnalyzing = false;
  guidanceEnabled = document.getElementById('guidanceToggle').checked;
  emotionEnabled  = document.getElementById('emotionToggle').checked;
  guidanceHints = [];
  guidanceTooltip = null;
  guidanceLoading = false;
  hideGuidanceTooltip();

  document.getElementById('scoringPanel').style.display = 'none';
  document.getElementById('reviewBar').style.display = 'none';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'none';
  document.getElementById('analysisBtn').style.display = 'none';
  document.getElementById('analysisPanel').style.display = 'none';
  restoreAnalysisPanel();
  document.getElementById('exportSgfBtn').style.display = 'none';
  document.getElementById('resultModal').classList.remove('show');

  stopTimer();
  if (timerEnabled) { initTimer(); startTimer(); }

  const aiStartsGame = gameMode === 'pvc' && playerColor === WHITE && !gameOver;
  updateUI();
  syncStatus(aiStartsGame ? '🤔 GnuGo 思考中...' : '');
  drawBoard();
  clearSave();
  saveGame();
  GnuGoService.clearPlayCache();

  if (gameMode === 'pvc') {
    aiController.initGnuGo()
      .then(() => {
        if (playerColor === WHITE && !gameOver) {
          setTimeout(() => aiController.requestAIMove(), AI_INIT_DELAY_MS);
        }
      })
      .catch((err) => {
        console.error('GnuGo init failed:', err);
        setStatus('⚠️ AI 引擎載入失敗，請重新整理頁面');
      });
  }

  if (guidanceEnabled) {
    setTimeout(() => requestGuidanceHints(), 200);
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
    document.getElementById('aiStrength').value = aiLevel;
    document.getElementById('timerToggle').checked = timerEnabled;
    document.getElementById('gameRules').value = gameRules;
    document.getElementById('playerColorGroup').style.display = gameMode === 'pvc' ? 'block' : 'none';
    document.getElementById('aiStrengthGroup').style.display = gameMode === 'pvc' ? 'block' : 'none';
    document.getElementById('timerSettings').style.display = timerEnabled ? 'block' : 'none';
    document.getElementById('timerArea').style.display = timerEnabled ? 'block' : 'none';
    if (timerEnabled) updateTimerDisplay();
    if (gameOver && document.getElementById('reviewToggle').checked) {
      document.getElementById('reviewBtn').style.display = 'block';
    }

    updateUI();
    drawBoard();
    syncStatus(gameOver ? '遊戲結束 — 可覆盤或開始新局' : `已恢復棋局（第 ${moveHistory.length} 手）`);

    if (gameMode === 'pvc' && !gameOver) {
      aiController.initGnuGo()
        .then(() => {
          if (currentPlayer !== playerColor) {
            setTimeout(() => aiController.requestAIMove(), AI_INIT_DELAY_MS);
          }
        })
        .catch((err) => {
          console.error('GnuGo init failed:', err);
          setStatus('⚠️ AI 引擎載入失敗，請重新整理頁面');
        });
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

// ==================== GLOBAL ERROR HANDLING ====================
window.addEventListener('error', (e) => {
  if (!e.filename || !e.filename.includes(location.hostname)) return;
  console.error('Uncaught error:', e.error || e.message);
  setStatus(`⚠️ 操作失敗：${e.message || '未知錯誤'}。遊戲已自動儲存，可重新整理頁面。`);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  const msg = e.reason?.message || String(e.reason) || '未知錯誤';
  setStatus(`⚠️ 操作失敗：${msg}。遊戲已自動儲存，可重新整理頁面。`);
});

// ==================== EXPOSE TO HTML onclick handlers ====================
// index.html uses onclick="..." so we expose top-level names on window.
Object.assign(window, {
  startNewGame,
  doPass: doPassAndSave,
  doUndo: doUndoAndSave,
  doResign,
  showHintOnce,
  enterReview,
  exitReview,
  reviewGo,
  startAnalysis,
  exportSGF,
  closeModal,
  openChangelog,
  closeChangelog,
  confirmScoring,
  cancelScoring,
  toggleSidebar,
  openSidebar,
  closeSidebar,
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
applyAppVersion();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js?v=v2026.03.15-9c49be6').catch(() => {});
}

if (!loadGame()) {
  startNewGame();
}
