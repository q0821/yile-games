// ai-controller.js — AI move requests.
// Imported by main.js; accesses shared mutable state via the `app` context object.
//
// 對手引擎：KataGo（vendored web-katrain，較強且可給誠實評估）。引擎內建
// WebGPU → WASM → CPU 後端 fallback，毋需另一套引擎兜底。
import * as KataGo from './katago-service.js';
import { levelConfig, pickMove } from './adaptive-difficulty.js';

export function makeAiController(app) {
  // 用 KataGo 求一手，依自適應等級做隨機弱化。回傳 {x,y}|{pass:true}。
  async function katagoMove() {
    await KataGo.ensureReady(app.setStatus);
    const cfg = levelConfig(app.aiLevel);
    const cands = await KataGo.genmoveCandidates({
      board: app.board,
      size: app.size,
      currentPlayer: app.currentPlayer,
      moveHistory: app.moveHistory,
      komi: app.komi,
      gameRules: app.gameRules,
      onStatus: app.setStatus,
    }, { visits: cfg.visits });
    if (!cands.length) return { pass: true };
    const m = pickMove(cands, app.aiLevel);
    return m ? { x: m.x, y: m.y } : { pass: true };
  }

  // ——— AI move ———
  async function requestAIMove() {
    if (app.gameOver || app.isAIThinking) return;

    app.GameState.sync({ isAIThinking: true });
    app.applyStateFromStore();
    app.syncStatus();
    app.updateUI();

    try {
      // 給人類般的停頓（1–3s），引擎自身運算時間計入其中，避免瞬間落子。
      const thinkStart = Date.now();
      const minThinkMs = 1000 + Math.floor(Math.random() * 2000);

      const move = await katagoMove();

      const remaining = minThinkMs - (Date.now() - thinkStart);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));

      app.GameState.sync({ isAIThinking: false });
      app.applyStateFromStore();
      app.updateUI();

      if (move && !move.pass) app.placeStone(move.x, move.y);
      else app.doPass();

      if (!app.gameOver && !app.isAIThinking) {
        app.applyStateFromStore();
        app.updateUI();
      }
    } catch (err) {
      console.error('AI move error:', err);
      app.GameState.sync({ isAIThinking: false });
      app.applyStateFromStore();
      app.updateUI();
      app.setStatus('AI 發生錯誤，請點擊「開始新遊戲」重試');
    }
  }

  return {
    requestAIMove,
  };
}
