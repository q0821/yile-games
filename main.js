// ==================== CONSTANTS ====================
const { EMPTY, BLACK, WHITE } = GoRules;
let komi = 7.5;
let gameRules = 'chinese'; // 'chinese' or 'japanese'

const STAR_POINTS = {
  9:  [[2,2],[2,6],[4,4],[6,2],[6,6]],
  13: [[3,3],[3,6],[3,9],[6,3],[6,6],[6,9],[9,3],[9,6],[9,9]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]]
};

// ==================== GAME STATE ====================
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

// Timer
let timerEnabled = false;
let timerSeconds = { [BLACK]: 600, [WHITE]: 600 };

// Review
let isReviewing = false;
let currentReviewMove = 0;

// AI Analysis
let analysisData = null;  // array of { move, aiSuggestion, rating }
let isAnalyzing = false;
let analysisProgress = 0;

// Scoring
let isScoring = false;
let deadStones = new Set();

// Hint
let showingHint = false;

// Beginner Guidance
let guidanceEnabled = false;
let guidanceHints = [];       // [{x, y, rank, label}]
let guidanceTooltip = null;   // {x, y, label} currently showing tooltip
let guidanceLoading = false;

// Canvas
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
let cellSize = 30;
let padding = 40;
let lastMove = null;
let hoverPos = null;

// ==================== BOARD / RULES ENGINE ====================
const opponent = GoRules.opponent;

function inBounds(x, y) {
  return GoRules.inBounds(size, x, y);
}

function getNeighbors(x, y) {
  return GoRules.getNeighbors(size, x, y);
}

function getGroup(b, x, y) {
  return GoRules.getGroup(b, size, x, y);
}

function tryPlaceStone(b, x, y, player, currentKo) {
  return GoRules.tryPlaceStone(b, size, x, y, player, currentKo);
}

function getLegalMoves(b, player, ko) {
  return GoRules.getLegalMoves(b, size, player, ko);
}

/** Game is in a terminal or special mode — no moves accepted at all. */
function isGameBlocked() {
  return gameOver || isReviewing || isScoring;
}

/** isGameBlocked + AI is currently calculating (UI interactions fully paused). */
function isGameBusy() {
  return isGameBlocked() || isAIThinking;
}

// ==================== CAPTURE HINTS ====================
function showHintOnce() {
  if (isGameBusy()) return;
  showingHint = true;
  drawBoard();
}

function clearHint() {
  if (showingHint) {
    showingHint = false;
    drawBoard();
  }
}

function getCaptureHints(b, player) {
  return GoHints.getCaptureHints(b, size, player, koPoint);
}

// ==================== BEGINNER GUIDANCE ====================
function requestGuidanceHints() {
  if (!guidanceEnabled || isGameBusy()) return;
  if (gameMode === 'pvc' && currentPlayer !== playerColor) return;

  guidanceHints = [];
  guidanceTooltip = null;
  hideGuidanceTooltip();

  if (!GnuGoService.isReady()) {
    guidanceLoading = true;
    drawBoard();
    initGnuGo().then(() => {
      guidanceLoading = false;
      if (guidanceEnabled) requestGuidanceHints();
    }).catch(() => {
      guidanceLoading = false;
    });
    return;
  }

  guidanceLoading = true;
  drawBoard();

  setTimeout(() => {
    try {
      const phase = GoHints.getGamePhase(moveHistory.length, size);
      const labelCtx = { board, size, currentPlayer };
      const hints = [];
      const topMoves = GnuGoService.getTopMoves(moveHistory, size, komi, currentPlayer, 3);

      topMoves.forEach((move, index) => {
        const label = GoHints.getGuidanceLabel(move[0], move[1], index, phase, labelCtx);
        hints.push({ x: move[0], y: move[1], rank: index, label });
      });

      guidanceHints = hints;
    } catch (e) {
      console.error('Guidance hint error:', e);
      guidanceHints = [];
    }
    guidanceLoading = false;
    renderGuidanceLegend();
    drawBoard();
  }, 10);
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

function hideGuidanceTooltip() {
  GoUI.hideGuidanceTooltip();
}

function showGuidanceTooltipAt(hint) {
  GoUI.showGuidanceTooltipAt({ canvas, padding, cellSize }, hint);
}

// ==================== RENDERING ====================
function getCurrentStateSnapshot() {
  return {
    size,
    board,
    currentPlayer,
    captures,
    moveHistory,
    boardHistory,
    koPoint,
    passCount,
    gameOver,
    lastMove,
    gameMode,
    playerColor,
    aiLevel,
    timerEnabled,
    timerSeconds,
    gameRules,
    komi,
    isReviewing,
    currentReviewMove,
    isScoring,
    deadStones,
    isAIThinking
  };
}

function buildBoardViewState() {
  const state = getCurrentStateSnapshot();
  const displayBoard = isReviewing ? getReviewBoard() : board;
  const scoreData = isScoring ? GoRules.calculateScore(board, size, deadStones, captures, gameRules, komi) : null;
  const captureHints = showingHint && !gameOver && !isReviewing && !isScoring && !isAIThinking
    ? getCaptureHints(board, currentPlayer)
    : [];
  const lastMoveToShow = isReviewing ? getReviewLastMove() : lastMove;

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
    guidanceHints
  };
}

let _drawRaf = null;
function drawBoard() {
  if (_drawRaf) return;
  _drawRaf = requestAnimationFrame(() => {
    _drawRaf = null;
    const deps = {
      canvas,
      ctx,
      padding,
      cellSize,
      starPoints: STAR_POINTS
    };
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
  playSound('place');
  if (result.captured > 0) setTimeout(() => playSound('capture'), 80);

  if (timerEnabled) switchTimer();

  if (willRequestAI) {
    setTimeout(() => requestAIMove(), 100);
  }

  if (guidanceEnabled && !gameOver) {
    if (gameMode !== 'pvc' || currentPlayer === playerColor) {
      setTimeout(() => requestGuidanceHints(), 150);
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

  if (willRequestAI) {
    setTimeout(() => requestAIMove(), 100);
  }

  if (guidanceEnabled && !gameOver) {
    if (gameMode !== 'pvc' || currentPlayer === playerColor) {
      setTimeout(() => requestGuidanceHints(), 150);
    }
  }
}

function doUndo() {
  if (isGameBlocked()) return;
  showingHint = false;
  clearGuidance();
  if (!document.getElementById('undoToggle').checked) {
    setStatus('悔棋功能已關閉');
    return;
  }
  if (boardHistory.length === 0) return;

  const result = GameState.undo({ gameMode });
  if (!result.ok) return;
  applyStateFromStore();

  updateUI();
  drawBoard();
  setStatus('已悔棋');

  if (guidanceEnabled && !gameOver) {
    setTimeout(() => requestGuidanceHints(), 150);
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
  const score = GoRules.calculateScore(board, size, deadStones, captures, gameRules, komi);
  GoUI.updateScoringDisplay({ gameRules, komi }, score);
}

function confirmScoring() {
  const score = GoRules.calculateScore(board, size, deadStones, captures, gameRules, komi);
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
  document.getElementById('resultModal').classList.add('show');
  if (document.getElementById('reviewToggle').checked) {
    document.getElementById('reviewBtn').style.display = 'block';
  }
  document.getElementById('exportSgfBtn').style.display = 'block';
  setStatus(`遊戲結束 - ${title}`);
  drawBoard();
  playSound('gameend');
}

function exportSGF() {
  const sgf = buildSGF();
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

function stopTimer() {
  GoTimer.stop();
}

function updateTimerDisplay() {
  GoTimer.updateDisplay(timerSeconds);
}

// ==================== REVIEW ====================
function enterReview() {
  if (!document.getElementById('reviewToggle').checked) return;
  const result = GameState.enterReview();
  if (!result.ok) return;
  applyStateFromStore();
  document.getElementById('reviewBar').style.display = 'block';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'block';
  document.getElementById('analysisBtn').style.display = 'block';
  if (analysisData) {
    document.getElementById('analysisPanel').style.display = 'block';
    document.getElementById('analysisBtn').style.display = 'none';
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
  if (gameOver) document.getElementById('reviewBtn').style.display = 'block';
  drawBoard();
}

function reviewGo(n) {
  const result = GameState.reviewGo(n);
  if (!result.ok) return;
  applyStateFromStore();
  updateReviewInfo();
  if (analysisData && !isAnalyzing) updateAnalysisMoveInfo();
  drawBoard();
}

function getReviewBoard() {
  return GoReview.getReviewBoard(moveHistory, currentReviewMove, size);
}

function getReviewLastMove() {
  return GoReview.getReviewLastMove(moveHistory, currentReviewMove);
}

function updateReviewInfo() {
  GoUI.updateReviewInfo({
    currentReviewMove,
    moveHistory,
    size
  });
}

// ==================== AI REVIEW ANALYSIS ====================
function buildSGFUpTo(n) {
  return GoReview.buildSGFUpTo(n, moveHistory, size, komi);
}

function startAnalysis() {
  if (isAnalyzing || !gameOver || moveHistory.length === 0) return;

  initGnuGo().then(() => {
    isAnalyzing = true;
    analysisData = [];
    analysisProgress = 0;

    document.getElementById('analysisBtn').style.display = 'none';
    document.getElementById('analysisPanel').style.display = 'block';
    document.getElementById('analysisProgressBar').style.display = 'block';
    document.getElementById('analysisSummary').style.display = 'none';
    document.getElementById('analysisMoveInfo').style.display = 'none';

    analyzeStep(0);
  }).catch(() => {
    setStatus('⚠️ AI 引擎未就緒，無法分析');
  });
}

function analyzeStep(moveIndex) {
  if (moveIndex >= moveHistory.length) {
    finishAnalysis();
    return;
  }

  const m = moveHistory[moveIndex];

  // Skip pass moves
  if (m.pass) {
    analysisData.push({ move: m, aiSuggestion: null, rating: 'neutral' });
    analysisProgress = Math.round(((moveIndex + 1) / moveHistory.length) * 100);
    updateAnalysisProgress();
    setTimeout(() => analyzeStep(moveIndex + 1), 10);
    return;
  }

  // Build SGF up to this move (not including it), ask GnuGo what it would play
  const sgf = buildSGFUpTo(moveIndex);

  setTimeout(() => {
    try {
      const level = 10; // always use max level for analysis
      const aiMove = GnuGoService.play(level, sgf, moveIndex, size).move;

      let rating = 'good';
      if (aiMove) {
        const dist = Math.abs(aiMove[0] - m.x) + Math.abs(aiMove[1] - m.y);
        if (dist === 0) {
          rating = 'good';       // Same as AI
        } else if (dist <= 3) {
          rating = 'good';       // Close enough
        } else if (dist <= 7) {
          rating = 'question';   // Questionable
        } else {
          rating = 'bad';        // Very different
        }
      }

      analysisData.push({
        move: m,
        aiSuggestion: aiMove,
        rating: rating
      });
    } catch (e) {
      analysisData.push({ move: m, aiSuggestion: null, rating: 'neutral' });
    }

    analysisProgress = Math.round(((moveIndex + 1) / moveHistory.length) * 100);
    updateAnalysisProgress();
    setTimeout(() => analyzeStep(moveIndex + 1), 10);
  }, 10);
}

function updateAnalysisProgress() {
  document.getElementById('analysisProgressFill').style.width = analysisProgress + '%';
  document.getElementById('analysisProgressText').textContent =
    `分析中... ${analysisProgress}%（${analysisData.length} / ${moveHistory.length} 手）`;
}

function finishAnalysis() {
  isAnalyzing = false;
  document.getElementById('analysisProgressBar').style.display = 'none';
  document.getElementById('analysisSummary').style.display = 'block';
  document.getElementById('analysisMoveInfo').style.display = 'block';

  let good = 0, question = 0, bad = 0;
  for (const d of analysisData) {
    if (d.rating === 'good') good++;
    else if (d.rating === 'question') question++;
    else if (d.rating === 'bad') bad++;
  }
  document.getElementById('goodCount').textContent = good;
  document.getElementById('questionCount').textContent = question;
  document.getElementById('badCount').textContent = bad;

  updateAnalysisMoveInfo();
  drawBoard();
}

function updateAnalysisMoveInfo() {
  const el = document.getElementById('analysisMoveInfo');
  if (!analysisData || currentReviewMove === 0) {
    el.textContent = '';
    return;
  }
  const d = analysisData[currentReviewMove - 1];
  if (!d || d.move.pass) {
    el.textContent = 'Pass';
    return;
  }
  const letters = 'ABCDEFGHJKLMNOPQRST';
  const ratingText = d.rating === 'good' ? '✅ 好手' : d.rating === 'question' ? '⚠️ 疑問手' : d.rating === 'bad' ? '❌ 惡手' : '';
  let text = `${ratingText}`;
  if (d.aiSuggestion && d.rating !== 'good') {
    text += `　AI 建議：${letters[d.aiSuggestion[1]]}${size - d.aiSuggestion[0]}`;
  }
  el.textContent = text;
}

// ==================== AI (GnuGo WASM) ====================

function buildSGF() {
  return GnuGoService.buildSGF(moveHistory, size, komi);
}

function parseGnuGoMove(sgfResponse, expectedMoveCount) {
  const expected = expectedMoveCount !== undefined ? expectedMoveCount : moveHistory.length;
  return GnuGoService.parseMoveFromSgfResponse(sgfResponse, expected, size);
}

function initGnuGo() {
  return GnuGoService.ensureReady(setStatus);
}


function requestAIMove() {
  if (gameOver || isAIThinking) return;
  if (!GnuGoService.isReady()) {
    initGnuGo().then(() => requestAIMove()).catch(() => {
      setStatus('⚠️ AI 引擎未就緒');
      GameState.sync({ isAIThinking: false });
      applyStateFromStore();
      updateUI();
    });
    return;
  }
  GameState.sync({ isAIThinking: true });
  applyStateFromStore();
  syncStatus();
  updateUI();

  // Use setTimeout to avoid blocking UI
  setTimeout(() => {
    try {
      const sgf = buildSGF();
      const move = GnuGoService.play(aiLevel, sgf, moveHistory.length, size).move;
      GameState.sync({ isAIThinking: false });
      applyStateFromStore();
      updateUI();
      if (move) {
        placeStone(move[0], move[1]);
      } else {
        doPass();
      }
      if (!gameOver && !isAIThinking) {
        applyStateFromStore();
        updateUI();
      }
      // Guidance after AI move
      if (guidanceEnabled && !gameOver && currentPlayer === playerColor) {
        setTimeout(() => requestGuidanceHints(), 150);
      }
    } catch (err) {
      console.error('GnuGo error:', err);
      GameState.sync({ isAIThinking: false });
      applyStateFromStore();
      updateUI();
      setStatus('⚠️ AI 出錯，請重新開始');
    }
  }, 50);
}

const playSound = GoSound.playSound;

// ==================== UI ====================
function updateUI() {
  const overlay = document.getElementById('aiThinkingOverlay');
  if (overlay) overlay.style.display = isAIThinking ? 'flex' : 'none';
  GoUI.updateHUD({
    gameOver,
    isAIThinking,
    currentPlayer,
    captures,
    moveHistory
  });
}

function setStatus(msg) {
  GoUI.setStatus(msg);
}

function syncStatus(message = '') {
  const state = { currentPlayer, gameOver, isScoring, isReviewing, isAIThinking };
  GoUI.syncStatus(state, message);
}

function startNewGame() {
  // Read settings
  size = parseInt(document.getElementById('boardSize').value);
  gameMode = document.getElementById('gameMode').value;
  playerColor = parseInt(document.getElementById('playerColor').value);
  aiLevel = parseInt(document.getElementById('aiStrength').value);
  timerEnabled = document.getElementById('timerToggle').checked;
  gameRules = document.getElementById('gameRules').value;
  komi = gameRules === 'japanese' ? 6.5 : 7.5;

  GameState.startGame({
    size,
    gameMode,
    playerColor,
    aiLevel,
    timerEnabled,
    timerSeconds,
    gameRules,
    komi
  });
  applyStateFromStore();

  analysisData = null;
  isAnalyzing = false;
  guidanceEnabled = document.getElementById('guidanceToggle').checked;
  guidanceHints = [];
  guidanceTooltip = null;
  guidanceLoading = false;
  hideGuidanceTooltip();

  // UI reset
  document.getElementById('scoringPanel').style.display = 'none';
  document.getElementById('reviewBar').style.display = 'none';
  document.getElementById('reviewBtn').style.display = 'none';
  document.getElementById('exitReviewBtn').style.display = 'none';
  document.getElementById('analysisBtn').style.display = 'none';
  document.getElementById('analysisPanel').style.display = 'none';
  document.getElementById('exportSgfBtn').style.display = 'none';
  document.getElementById('resultModal').classList.remove('show');

  // Timer
  stopTimer();
  if (timerEnabled) {
    initTimer();
    startTimer();
  }

  const aiStartsGame = gameMode === 'pvc' && playerColor === WHITE && !gameOver;
  updateUI();
  syncStatus(aiStartsGame ? '🤔 GnuGo 思考中...' : '');
  drawBoard();
  clearSave();
  saveGame();
  GnuGoService.clearPlayCache();

  // If PvC mode, preload GnuGo and start if AI plays black
  if (gameMode === 'pvc') {
    initGnuGo().then(() => {
      if (playerColor === WHITE && !gameOver) {
        setTimeout(() => requestAIMove(), 300);
      }
    });
  }

  // Beginner guidance on game start
  if (guidanceEnabled) {
    setTimeout(() => requestGuidanceHints(), 200);
  }
}

// ==================== EVENT HANDLERS ====================
function getBoardPositionFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const point = e.touches?.[0] || e.changedTouches?.[0] || e;
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const mx = (point.clientX - rect.left) * scaleX;
  const my = (point.clientY - rect.top) * scaleY;
  const x = Math.round((my - padding) / cellSize);
  const y = Math.round((mx - padding) / cellSize);
  return inBounds(x, y) ? [x, y] : null;
}

function handleBoardInteraction(e) {
  const pos = getBoardPositionFromEvent(e);
  if (!pos) return;
  const [x, y] = pos;

  if (isScoring) {
    // Toggle dead stones
    if (board[x][y] !== EMPTY) {
      const group = getGroup(board, x, y);
      const result = GameState.toggleDeadGroup(group.stones);
      if (!result.ok) return;
      applyStateFromStore();
      updateScoringDisplay();
      drawBoard();
    }
    return;
  }

  if (guidanceEnabled && guidanceHints.length > 0) {
    const hint = guidanceHints.find(h => h.x === x && h.y === y);
    guidanceTooltip = hint || null;
    if (hint) {
      showGuidanceTooltipAt(hint);
    } else {
      hideGuidanceTooltip();
    }
  }

  placeStone(x, y);
}

let _mouseMoveRaf = null;
canvas.addEventListener('mousemove', (e) => {
  if (_mouseMoveRaf) return;
  _mouseMoveRaf = requestAnimationFrame(() => {
    _mouseMoveRaf = null;
    const pos = getBoardPositionFromEvent(e);
    hoverPos = pos;
    drawBoard();
  });
});

canvas.addEventListener('mouseleave', () => {
  hoverPos = null;
  drawBoard();
});

let lastTouchInteractionAt = 0;

canvas.addEventListener('click', (e) => {
  if (Date.now() - lastTouchInteractionAt < 500) return;
  handleBoardInteraction(e);
});
canvas.addEventListener('touchstart', (e) => {
  const pos = getBoardPositionFromEvent(e);
  hoverPos = pos;
  drawBoard();
}, { passive: true });
canvas.addEventListener('touchend', (e) => {
  lastTouchInteractionAt = Date.now();
  e.preventDefault();
  handleBoardInteraction(e);
}, { passive: false });

// Settings visibility toggles
document.getElementById('gameMode').addEventListener('change', (e) => {
  const isPvC = e.target.value === 'pvc';
  document.getElementById('playerColorGroup').style.display = isPvC ? 'block' : 'none';
  document.getElementById('aiStrengthGroup').style.display = isPvC ? 'block' : 'none';
});

document.getElementById('guidanceToggle').addEventListener('change', (e) => {
  guidanceEnabled = e.target.checked;
  if (guidanceEnabled && !gameOver && !isReviewing && !isScoring) {
    requestGuidanceHints();
  } else {
    clearGuidance();
    drawBoard();
  }
  renderGuidanceLegend();
});

document.getElementById('timerToggle').addEventListener('change', (e) => {
  const show = e.target.checked;
  document.getElementById('timerSettings').style.display = show ? 'block' : 'none';
  document.getElementById('timerArea').style.display = show ? 'block' : 'none';
});

// Keyboard shortcuts for review
document.addEventListener('keydown', (e) => {
  if (!isReviewing) return;
  if (e.key === 'ArrowLeft') reviewGo(currentReviewMove - 1);
  else if (e.key === 'ArrowRight') reviewGo(currentReviewMove + 1);
  else if (e.key === 'Home') reviewGo(0);
  else if (e.key === 'End') reviewGo(moveHistory.length);
});

// Resize — also close sidebar if switching away from mobile
window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeSidebar();
  drawBoard();
});

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
  GameState.sync({ timerSeconds }); // timerSeconds is mutated in-place by the timer interval
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

    // Sync UI controls
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
    syncStatus(gameOver ? '遊戲已結束' : `已恢復棋局（第 ${moveHistory.length} 手）`);

    // Preload GnuGo if needed
    if (gameMode === 'pvc' && !gameOver) {
      initGnuGo().then(() => {
        if (currentPlayer !== playerColor) {
          setTimeout(() => requestAIMove(), 300);
        }
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

// Auto-save after each move
const origPlaceStone = placeStone;
placeStone = function(x, y) {
  const result = origPlaceStone(x, y);
  if (result) saveGame();
  return result;
};

const origDoPass = doPass;
doPass = function() {
  origDoPass();
  saveGame();
};

const origDoUndo = doUndo;
doUndo = function() {
  origDoUndo();
  saveGame();
};

// ==================== MOBILE SIDEBAR ====================
// toggleSidebar / openSidebar / closeSidebar defined in sidebar.js

// ==================== PWA ====================
const VERSION_INFO_URL = 'version.json?v=v2026.03.15-9c49be6';
const VERSION_FALLBACK = 'v2026.03.15-9c49be6';

async function applyAppVersion() {
  try {
    const response = await fetch(VERSION_INFO_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('version fetch failed');
    const data = await response.json();
    const version = data?.version || VERSION_FALLBACK;
    document.getElementById('versionFooter').textContent = `版本：${version}`;
    return version;
  } catch (_) {
    document.getElementById('versionFooter').textContent = `版本：${VERSION_FALLBACK}`;
    return VERSION_FALLBACK;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js?v=v2026.03.15-9c49be6').catch(() => {});
}

// ==================== INIT ====================
applyAppVersion();

if (!loadGame()) {
  startNewGame();
}
