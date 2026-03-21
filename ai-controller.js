// ai-controller.js — AI move requests, review analysis, and guidance hints.
// Imported by main.js; accesses shared mutable state via the `app` context object.

import { GnuGoService } from './gnugo-service.js';
import { getCaptureHints, getGamePhase, getGuidanceLabel } from './hints.js';

export function makeAiController(app) {
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
        app.setStatus('⚠️ AI 引擎未就緒');
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
      app.setStatus('⚠️ AI 出錯，請重新開始');
    }
  }

  // ——— AI Review analysis ———
  async function startAnalysis() {
    if (app.isAnalyzing || !app.gameOver || app.moveHistory.length === 0) return;

    try {
      await initGnuGo();
    } catch {
      app.setStatus('⚠️ AI 引擎未就緒，無法分析');
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

    // Process one move per tick to keep the UI responsive
    for (let i = 0; i < app.moveHistory.length; i++) {
      if (!app.isAnalyzing) break; // user may have exited review

      const m = app.moveHistory[i];

      if (!m.pass) {
        try {
          const sgf = GnuGoService.buildSGFUpTo(app.moveHistory, app.size, app.komi, i);
          const { move: aiMove } = await GnuGoService.play(10, sgf, i, app.size);

          let rating = 'good';
          if (aiMove) {
            const dist = Math.abs(aiMove[0] - m.x) + Math.abs(aiMove[1] - m.y);
            if (dist === 0 || dist <= app.ANALYSIS_GOOD_DIST) {
              rating = 'good';
            } else if (dist <= app.ANALYSIS_BAD_DIST) {
              rating = 'question';
            } else {
              rating = 'bad';
            }
          }
          app.analysisData.push({ move: m, aiSuggestion: aiMove, rating });
        } catch {
          app.analysisData.push({ move: m, aiSuggestion: null, rating: 'neutral' });
        }
      } else {
        app.analysisData.push({ move: m, aiSuggestion: null, rating: 'neutral' });
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
    if (d.aiSuggestion && d.rating !== 'good') {
      text += `　AI 建議：${app.COORD_LETTERS[d.aiSuggestion[1]]}${app.size - d.aiSuggestion[0]}`;
    }
    el.textContent = text;
  }

  return {
    initGnuGo,
    requestGuidanceHints,
    requestAIMove,
    startAnalysis,
    updateAnalysisMoveInfo
  };
}
