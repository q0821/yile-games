// ai-controller.js — AI move requests, review analysis, and guidance hints.
// Imported by main.js; accesses shared mutable state via the `app` context object.

import { GnuGoService } from './gnugo-service.js';
import { getCaptureHints, getGamePhase, getGuidanceLabel } from './hints.js';
import {
  createBoard, tryPlaceStone, BLACK, WHITE,
  estimateBlackLead, computePointsLost, ratePointsLost,
} from './rules.js';

// Move-quality thresholds, expressed in points lost vs the engine's best move.
const COACH_GOOD_PTS = 2;  // lose <= 2 pts  → 好手
const COACH_BAD_PTS = 6;   // lose >  6 pts  → 惡手
// Engine level used when asking GnuGo for its "best move" benchmark.
const REVIEW_BEST_LEVEL = 10;

export function makeAiController(app) {
  let _coachBusy = false; // debounce for real-time coaching

  // ——— Internal helpers ———
  function initGnuGo() {
    return GnuGoService.ensureReady(app.setStatus);
  }

  // ——— Guidance hints ———
  async function requestGuidanceHints() {
    if (!app.guidanceEnabled || app.isGameBusy()) return;
    if (app.gameMode === 'pvc' && app.currentPlayer !== app.playerColor) return;

    app.guidanceHints = [];
    app.guidanceTooltip = null;
    app.hideGuidanceTooltip();

    if (!GnuGoService.isReady()) {
      app.guidanceLoading = true;
      app.drawBoard();
      try {
        await initGnuGo();
      } catch {
        app.guidanceLoading = false;
        return;
      }
      if (app.guidanceEnabled) requestGuidanceHints();
      return;
    }

    app.guidanceLoading = true;
    app.drawBoard();

    // Small yield so the loading indicator paints before we block
    await new Promise(r => setTimeout(r, 10));

    try {
      const phase = getGamePhase(app.moveHistory.length, app.size);
      const labelCtx = { board: app.board, size: app.size, currentPlayer: app.currentPlayer };
      const topMoves = await GnuGoService.getTopMoves(
        app.moveHistory, app.size, app.komi, app.currentPlayer, 3
      );
      app.guidanceHints = topMoves.map((move, index) => ({
        x: move[0], y: move[1],
        rank: index,
        label: getGuidanceLabel(move[0], move[1], index, phase, labelCtx)
      }));
    } catch (e) {
      console.error('Guidance hint error:', e);
      app.guidanceHints = [];
    }

    app.guidanceLoading = false;
    app.renderGuidanceLegend();
    app.drawBoard();
  }

  // ——— AI move ———
  async function requestAIMove() {
    if (app.gameOver || app.isAIThinking) return;

    if (!GnuGoService.isReady()) {
      try {
        await initGnuGo();
      } catch {
        app.setStatus('⚠️ AI 引擎尚未載入，請稍候再試');
        app.GameState.sync({ isAIThinking: false });
        app.applyStateFromStore();
        app.updateUI();
        return;
      }
      // Recurse after loading
      return requestAIMove();
    }

    app.GameState.sync({ isAIThinking: true });
    app.applyStateFromStore();
    app.syncStatus();
    app.updateUI();

    try {
      const sgf = GnuGoService.buildSGF(app.moveHistory, app.size, app.komi);
      const result = await GnuGoService.play(app.aiLevel, sgf, app.moveHistory.length, app.size);
      app.GameState.sync({ isAIThinking: false });
      app.applyStateFromStore();
      app.updateUI();

      if (result.move) {
        app.placeStone(result.move[0], result.move[1]);
      } else {
        app.doPass();
      }

      if (!app.gameOver && !app.isAIThinking) {
        app.applyStateFromStore();
        app.updateUI();
      }

      if (app.guidanceEnabled && !app.gameOver && app.currentPlayer === app.playerColor) {
        setTimeout(() => requestGuidanceHints(), app.GUIDANCE_HINT_DELAY_MS);
      }
    } catch (err) {
      console.error('GnuGo error:', err);
      app.GameState.sync({ isAIThinking: false });
      app.applyStateFromStore();
      app.updateUI();
      app.setStatus('⚠️ AI 發生錯誤，請點擊「開始新遊戲」重試');
    }
  }

  // ——— AI Review analysis ———
  async function startAnalysis() {
    if (app.isAnalyzing || !app.gameOver || app.moveHistory.length === 0) return;

    try {
      await initGnuGo();
    } catch {
      app.setStatus('⚠️ AI 引擎尚未載入，無法進行分析');
      return;
    }

    app.isAnalyzing = true;
    app.analysisData = [];
    app.analysisProgress = 0;

    document.getElementById('analysisBtn').style.display = 'none';
    document.getElementById('analysisPanel').style.display = 'block';
    document.getElementById('analysisProgressBar').style.display = 'block';
    document.getElementById('analysisSummary').style.display = 'none';
    document.getElementById('analysisMoveInfo').style.display = 'none';

    // Rebuild the game move-by-move so each position can be scored with pure JS
    // (territory estimate). One GnuGo call per move gives the "best move" benchmark;
    // points-lost vs that move drives the rating, and the running Black lead feeds
    // the momentum chart.
    let prevBoard = createBoard(app.size);
    const runningCaptures = { [BLACK]: 0, [WHITE]: 0 };

    for (let i = 0; i < app.moveHistory.length; i++) {
      if (!app.isAnalyzing) break; // user may have exited review

      const m = app.moveHistory[i];

      if (!m.pass) {
        try {
          const sgf = GnuGoService.buildSGFUpTo(app.moveHistory, app.size, app.komi, i);
          const { move: aiMove } = await GnuGoService.play(REVIEW_BEST_LEVEL, sgf, i, app.size);

          const pointsLost = computePointsLost(
            prevBoard, app.size, m, aiMove, runningCaptures, app.gameRules, app.komi
          );
          const rating = ratePointsLost(pointsLost, COACH_GOOD_PTS, COACH_BAD_PTS);

          // Advance the board and capture counts for the next iteration.
          const placed = tryPlaceStone(prevBoard, app.size, m.x, m.y, m.player, null);
          if (placed.valid) {
            prevBoard = placed.newBoard;
            if (placed.captured) {
              runningCaptures[m.player] += placed.captured;
            }
          }

          const blackLead = estimateBlackLead(prevBoard, app.size, runningCaptures, app.gameRules, app.komi);
          app.analysisData.push({ move: m, aiSuggestion: aiMove, rating, pointsLost, blackLead });
        } catch {
          const blackLead = estimateBlackLead(prevBoard, app.size, runningCaptures, app.gameRules, app.komi);
          app.analysisData.push({ move: m, aiSuggestion: null, rating: 'neutral', pointsLost: 0, blackLead });
        }
      } else {
        const blackLead = estimateBlackLead(prevBoard, app.size, runningCaptures, app.gameRules, app.komi);
        app.analysisData.push({ move: m, aiSuggestion: null, rating: 'neutral', pointsLost: 0, blackLead });
      }

      app.analysisProgress = Math.round(((i + 1) / app.moveHistory.length) * 100);
      _updateAnalysisProgress();

      // Yield to browser so the progress bar repaints
      await new Promise(r => setTimeout(r, app.ANALYSIS_STEP_DELAY_MS));
    }

    _finishAnalysis();
  }

  function _updateAnalysisProgress() {
    document.getElementById('analysisProgressFill').style.width = app.analysisProgress + '%';
    document.getElementById('analysisProgressText').textContent =
      `分析中... ${app.analysisProgress}%（${app.analysisData.length} / ${app.moveHistory.length} 手）`;
  }

  function _finishAnalysis() {
    app.isAnalyzing = false;
    document.getElementById('analysisProgressBar').style.display = 'none';
    document.getElementById('analysisSummary').style.display = 'block';
    document.getElementById('analysisMoveInfo').style.display = 'block';

    let good = 0, question = 0, bad = 0;
    for (const d of app.analysisData) {
      if (d.rating === 'good') good++;
      else if (d.rating === 'question') question++;
      else if (d.rating === 'bad') bad++;
    }
    document.getElementById('goodCount').textContent = good;
    document.getElementById('questionCount').textContent = question;
    document.getElementById('badCount').textContent = bad;

    updateAnalysisMoveInfo();
    app.drawScoreChart?.();
    app.drawBoard();
  }

  function updateAnalysisMoveInfo() {
    const el = document.getElementById('analysisMoveInfo');
    if (!app.analysisData || app.currentReviewMove === 0) {
      el.textContent = '';
      return;
    }
    const d = app.analysisData[app.currentReviewMove - 1];
    if (!d || d.move.pass) {
      el.textContent = 'Pass';
      return;
    }
    const ratingText = d.rating === 'good' ? '✅ 好手'
      : d.rating === 'question' ? '⚠️ 疑問手'
      : d.rating === 'bad' ? '❌ 惡手' : '';
    let text = ratingText;
    if (typeof d.pointsLost === 'number' && d.pointsLost >= 1 && d.rating !== 'good') {
      text += `　約損失 ${d.pointsLost.toFixed(0)} 目`;
    }
    if (d.aiSuggestion && d.rating !== 'good') {
      text += `　AI 建議：${app.COORD_LETTERS[d.aiSuggestion[1]]}${app.size - d.aiSuggestion[0]}`;
    }
    el.textContent = text;
  }

  // ——— Real-time coaching (in-game) ———
  // Best-effort: after the human plays in pvc, quietly check whether the move
  // lost a lot of points vs GnuGo's choice and surface a non-blocking tip.
  async function checkLastMoveQuality() {
    if (_coachBusy || app.gameMode !== 'pvc') return;
    const n = app.moveHistory.length;
    if (n === 0) return;
    const m = app.moveHistory[n - 1];
    if (!m || m.pass || m.player !== app.playerColor) return;
    if (!GnuGoService.isReady()) return;

    _coachBusy = true;
    try {
      const prevBoard = app.GoReview.getReviewBoard(app.moveHistory, n - 1, app.size);
      const sgf = GnuGoService.buildSGFUpTo(app.moveHistory, app.size, app.komi, n - 1);
      const { move: bestMove } = await GnuGoService.play(REVIEW_BEST_LEVEL, sgf, n - 1, app.size);
      const pointsLost = computePointsLost(
        prevBoard, app.size, m, bestMove, app.captures, app.gameRules, app.komi
      );
      if (pointsLost > COACH_BAD_PTS && bestMove) {
        const coord = `${app.COORD_LETTERS[bestMove[1]]}${app.size - bestMove[0]}`;
        app.showCoachTip?.({ pointsLost, coord, moveIndex: n - 1 });
      }
    } catch {
      // never disrupt play
    } finally {
      _coachBusy = false;
    }
  }

  return {
    initGnuGo,
    requestGuidanceHints,
    requestAIMove,
    startAnalysis,
    updateAnalysisMoveInfo,
    checkLastMoveQuality,
  };
}
