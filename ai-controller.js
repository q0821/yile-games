// ai-controller.js — AI move requests, review analysis, and guidance hints.
// Imported by main.js; accesses shared mutable state via the `app` context object.

import { GnuGoService } from './gnugo-service.js';
import { getCaptureHints, getGamePhase, getGuidanceLabel } from './hints.js';
import { getGroup } from './rules.js';

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
      // Give the AI a human-like pause (random 1–3s) so the player isn't rushed.
      // GnuGo's own compute time counts toward it, so we only wait the remainder.
      const thinkStart = Date.now();
      const minThinkMs = 1000 + Math.floor(Math.random() * 2000);
      const result = await GnuGoService.play(app.aiLevel, sgf, app.moveHistory.length, app.size);
      const remaining = minThinkMs - (Date.now() - thinkStart);
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
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
    const reviewAnalysisBtn = document.getElementById('reviewAnalysisBtn');
    if (reviewAnalysisBtn) reviewAnalysisBtn.style.display = 'none';
    const panel = document.getElementById('analysisPanel');
    panel.style.display = 'block';
    document.getElementById('analysisProgressBar').style.display = 'block';
    document.getElementById('analysisSummary').style.display = 'none';
    document.getElementById('analysisMoveInfo').style.display = 'none';
    _updateAnalysisProgress();
    // Make sure the panel (and its progress bar) is actually in view on mobile,
    // where it sits below the board and may be off-screen.
    try { panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}

    // Honest review: GnuGo's only reliable signal is its recommended move (the
    // `score`/territory function is broken in this WASM build and the mid-game
    // territory estimate is unreliable). So for each move we just compare what
    // the player actually played against GnuGo's top choice for that position:
    //   match — you played exactly what GnuGo would
    //   diff  — a different move (NOT necessarily worse; we show AI's pick)
    for (let i = 0; i < app.moveHistory.length; i++) {
      if (!app.isAnalyzing) break; // user may have exited review

      const m = app.moveHistory[i];

      if (!m.pass) {
        try {
          const sgf = GnuGoService.buildSGFUpTo(app.moveHistory, app.size, app.komi, i);
          const { move: aiMove } = await GnuGoService.play(REVIEW_BEST_LEVEL, sgf, i, app.size);
          const rating = (aiMove && aiMove[0] === m.x && aiMove[1] === m.y) ? 'match' : 'diff';
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

    let match = 0, diff = 0;
    for (const d of app.analysisData) {
      if (d.rating === 'match') match++;
      else if (d.rating === 'diff') diff++;
    }
    document.getElementById('matchCount').textContent = match;
    document.getElementById('diffCount').textContent = diff;

    const reviewAnalysisBtn = document.getElementById('reviewAnalysisBtn');
    if (reviewAnalysisBtn) reviewAnalysisBtn.style.display = 'none';

    updateAnalysisMoveInfo();
    app.drawBoard();
  }

  function updateAnalysisMoveInfo() {
    const el = document.getElementById('analysisMoveInfo');
    if (!app.analysisData || app.currentReviewMove === 0) {
      el.textContent = '逐手檢視：◀ ▶ 移動，看 AI 在每個局面會下哪裡。';
      return;
    }
    const d = app.analysisData[app.currentReviewMove - 1];
    if (!d || d.move.pass) {
      el.textContent = 'Pass';
      return;
    }
    if (d.rating === 'match') {
      el.textContent = '✅ 和 AI 同手';
    } else if (d.rating === 'diff' && d.aiSuggestion) {
      el.textContent = `🔍 AI 會下在 ${app.COORD_LETTERS[d.aiSuggestion[1]]}${app.size - d.aiSuggestion[0]}（不代表你這手不好）`;
    } else {
      el.textContent = '';
    }
  }

  // ——— Real-time coaching (in-game) ———
  // We can't reliably score "how many points a move lost" (GnuGo's territory
  // function is broken in this build), so instead of guessing we flag the one
  // thing we CAN detect for certain with pure rules: the move just played left
  // its own group in atari (a single liberty) — i.e. it's about to be captured.
  // This is a concrete, honest warning that helps a learner.
  function checkLastMoveQuality() {
    if (app.gameMode !== 'pvc') return;
    const n = app.moveHistory.length;
    if (n === 0) return;
    const m = app.moveHistory[n - 1];
    if (!m || m.pass || m.player !== app.playerColor) return;

    const group = getGroup(app.board, app.size, m.x, m.y);
    if (group.liberties && group.liberties.size === 1) {
      app.showCoachTip?.({
        kind: 'atari',
        coord: `${app.COORD_LETTERS[m.y]}${app.size - m.x}`,
      });
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
