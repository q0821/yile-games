// ai-controller.js — AI move requests.
// Imported by main.js; accesses shared mutable state via the `app` context object.
//
// 對手引擎：優先 KataGo（vendored web-katrain，較強且可給誠實評估），
// KataGo 載入/求手失敗時自動 fallback 回 GnuGo，確保對弈不中斷。
import { GnuGoService } from './gnugo-service.js';
import * as KataGo from './katago-service.js';

// 強度（aiLevel 1/5/10 = 初/中/高）→ KataGo 搜尋量（visits）。iPhone WebGPU 實測：
// 32 visits ~0.28s、單次 eval ~10ms，故下列值在手機上約 0.2~1.5s，可接受。
function aiLevelToVisits(level) {
  if (level >= 10) return 160;
  if (level >= 5) return 48;
  return 8;
}

export function makeAiController(app) {
  // ——— Internal helpers ———
  function initGnuGo() {
    return GnuGoService.ensureReady(app.setStatus);
  }

  // 用 KataGo 求一手；失敗則丟出，由呼叫端 fallback。
  async function katagoMove() {
    await KataGo.ensureReady(app.setStatus);
    const visits = aiLevelToVisits(app.aiLevel);
    return KataGo.genmove({
      board: app.board,
      size: app.size,
      currentPlayer: app.currentPlayer,
      moveHistory: app.moveHistory,
      komi: app.komi,
      gameRules: app.gameRules,
      onStatus: app.setStatus,
    }, { visits });
  }

  // 用 GnuGo 求一手（fallback）。回傳 {x,y}|{pass:true}。
  async function gnugoMove() {
    if (!GnuGoService.isReady()) await initGnuGo();
    const sgf = GnuGoService.buildSGF(app.moveHistory, app.size, app.komi);
    const result = await GnuGoService.play(app.aiLevel, sgf, app.moveHistory.length, app.size);
    return result.move ? { x: result.move[0], y: result.move[1] } : { pass: true };
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

      let move;
      try {
        move = await katagoMove();
      } catch (kataErr) {
        console.warn('KataGo 不可用，fallback 回 GnuGo：', kataErr);
        app.setStatus('改用 GnuGo 引擎…');
        move = await gnugoMove();
      }

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
    initGnuGo,
    requestAIMove,
  };
}
