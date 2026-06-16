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
    if (!m || m.pass) return { pass: true };
    return { x: m.x, y: m.y };
  }

  // ——— AI move ———
  // 整輪失敗後自動恢復重試的次數上限（每輪內部已含一次 reset+重試）。
  const MAX_RECOVER = 1;
  let recoverAttempts = 0;

  async function requestAIMove() {
    if (app.gameOver || app.isAIThinking) return;
    // 只有「不是玩家回合」時 AI 才該落子。防止失敗後自動重試的排程在使用者已開新局／
    // 已輪到玩家時誤觸發 AI 幫玩家下子。
    if (app.gameMode === 'pvc' && app.currentPlayer === app.playerColor) return;

    app.GameState.sync({ isAIThinking: true });
    app.applyStateFromStore();
    app.syncStatus();
    app.updateUI();

    try {
      // 給人類般的停頓（1–3s），引擎自身運算時間計入其中，避免瞬間落子。
      const thinkStart = Date.now();
      const minThinkMs = 1000 + Math.floor(Math.random() * 2000);

      // 引擎推論偶發失敗（WebGPU device lost / worker 推論錯誤）多為 transient，
      // 重試一次往往就過；重試前 reset 引擎，避免一直用壞掉的 worker。
      const MAX_ATTEMPTS = 2;
      let move = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          move = await katagoMove();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          console.error(`AI move error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
          if (attempt < MAX_ATTEMPTS) {
            app.setStatus('AI 連線異常，重置引擎重試中…');
            KataGo.reset();
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }
      if (lastErr) throw lastErr;
      recoverAttempts = 0; // 成功取得一手，恢復計數歸零

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
      console.error('AI move failed after retries:', err);
      // 重置引擎，讓後續重試／開始新遊戲能重建乾淨 worker 恢復，毋需整頁重整。
      try { KataGo.reset(); } catch { /* noop */ }
      app.GameState.sync({ isAIThinking: false });
      app.applyStateFromStore();
      app.updateUI();
      const detail = (err && err.message) ? err.message : String(err);

      if (recoverAttempts < MAX_RECOVER) {
        // 整輪失敗：引擎已重置，延遲後自動再算一輪，不丟失當前對局。
        recoverAttempts += 1;
        app.setStatus(`AI 發生錯誤（${detail}）— 已重置引擎，自動重試中…`);
        setTimeout(() => requestAIMove(), 1500);
      } else {
        // 連自動恢復都失敗（多半是持續性問題），引導開新局；引擎已 reset，新局可恢復。
        recoverAttempts = 0;
        app.setStatus(`AI 持續發生錯誤（${detail}）— 請點「開始新遊戲」重試`);
      }
    }
  }

  return {
    requestAIMove,
  };
}
