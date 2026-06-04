// ai-controller.js — AI move requests.
// Imported by main.js; accesses shared mutable state via the `app` context object.

import { GnuGoService } from './gnugo-service.js';

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

  return {
    initGnuGo,
    requestAIMove,
  };
}
