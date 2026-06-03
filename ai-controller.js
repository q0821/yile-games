// ai-controller.js — AI move requests and in-game atari coaching.
// Imported by main.js; accesses shared mutable state via the `app` context object.

import { GnuGoService } from './gnugo-service.js';
import { getGroup } from './rules.js';

export function makeAiController(app) {
  // ——— Internal helpers ———
  function initGnuGo() {
    return GnuGoService.ensureReady(app.setStatus);
  }

  // ——— AI move ———
  async function requestAIMove() {
    if (app.gameOver || app.isAIThinking) return;

    if (!GnuGoService.isReady()) {
      try {
        await initGnuGo();
      } catch {
        app.setStatus('AI 引擎尚未載入，請稍候再試');
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
    } catch (err) {
      console.error('GnuGo error:', err);
      app.GameState.sync({ isAIThinking: false });
      app.applyStateFromStore();
      app.updateUI();
      app.setStatus('AI 發生錯誤，請點擊「開始新遊戲」重試');
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
    requestAIMove,
    checkLastMoveQuality,
  };
}
