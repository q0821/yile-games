// chess-engine.js — 西洋棋 AI（共用 Fairy-Stockfish 引擎，變體固定 chess）。
//
// 不另起一份 WASM：Fairy-Stockfish 同一份引擎支援多變體，故委派給 xiangqi-engine 的
// 共用單例，求手時帶 variant='chess'（內部會 setoption UCI_Variant + ucinewgame 隔離）。
import * as Engine from './xiangqi-engine.js';

export const ensureReady = Engine.ensureReady;
export const reset = Engine.reset;
export const isReady = Engine.isReady;

/** 求一手西洋棋著法（UCI；普通 'e2e4'、升變 'e7e8q'、易位 'e1g1'）。無手回 null。 */
export function bestMove({ fen, level = 2, movetimeMs = 800 }) {
  return Engine.bestMove({ fen, level, movetimeMs, variant: 'chess' });
}
