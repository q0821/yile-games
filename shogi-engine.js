// shogi-engine.js — 將棋 AI（共用 Fairy-Stockfish 引擎，變體固定 shogi）。
//
// 不另起一份 WASM：Fairy-Stockfish 同一份引擎支援多變體，故委派給 xiangqi-engine 的
// 共用單例，求手時帶 variant='shogi'（內部會 setoption UCI_Variant + ucinewgame 隔離）。
// 將棋無 NNUE 權重 → 古典評估，休閒對弈足夠。
import * as Engine from './xiangqi-engine.js';

export const ensureReady = Engine.ensureReady;
export const reset = Engine.reset;
export const isReady = Engine.isReady;

/** 求一手將棋著法（UCI；普通 'e3e4'、升變 'e7e8+'、打入 'P@5e'）。無手回 null。 */
export function bestMove({ fen, level = 2, movetimeMs = 800 }) {
  return Engine.bestMove({ fen, level, movetimeMs, variant: 'shogi' });
}

/** 建議走法（AI 建議按鈕，教學用途，固定全力不吃難度削弱）。見 xiangqi-engine.js 的 hint()。 */
export function hint({ fen, movetime = 1500 } = {}) {
  return Engine.hint({ fen, movetime, variant: 'shogi' });
}
