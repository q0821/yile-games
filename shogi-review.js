// shogi-review.js — 將棋覆盤的數據式評估（用 Fairy-Stockfish 滿血逐手評估）。
//
// 與象棋覆盤同法（見 xiangqi-review.js），差別只在棋規模組與引擎變體（shogi）。
// 對每個 ply 局面取「輪到下的一方」視角的評估分（centipawn）。
// 每手失分 loss_i = cpStm_i + cpStm_{i+1}（negamax：相鄰局面視角相反，相加即該手損失）。
// p1Cp 為先手方視角分（先手優為正）供畫優勢曲線。不臆測、純引擎輸出。
import * as Game from './shogi-game.js';
import * as Engine from './xiangqi-engine.js';

const MATE_CP = 30000;

/** mate 分轉等效 centipawn（保留 sign 與步數，越快將死分越高）。 */
function evalCp(a) {
  if (a.mate != null) return a.mate > 0 ? MATE_CP - a.mate * 100 : -MATE_CP - a.mate * 100;
  return a.cp == null ? 0 : a.cp;
}

/** 失分分類（centipawn 門檻，可調）。 */
export function classifyLoss(loss) {
  if (loss < 30) return { key: 'best', label: '佳著' };
  if (loss < 90) return { key: 'good', label: '正常' };
  if (loss < 200) return { key: 'inaccuracy', label: '小失誤' };
  if (loss < 500) return { key: 'mistake', label: '失誤' };
  return { key: 'blunder', label: '大失誤' };
}

/**
 * 逐手分析整局。
 * @param {string[]} moves 整局 UCI 著法
 * @param {object} o { movetimeMs, onProgress(k,N) }
 * @returns {Promise<Array>} nodes[k]（位置 0..N）：
 *   { fen, cpStm, p1Cp, mate, bestmove, pv,  loss, cls }
 *   loss/cls/bestmove/pv 描述「從位置 k 走出的那一手」（即第 k+1 手）；最後一個位置無 loss。
 */
export async function analyzeGame(moves, { movetimeMs = 400, onProgress } = {}) {
  await Game.ensureReady();
  await Engine.ensureReady();
  const fens = Game.fensForMoves(moves);
  const N = moves.length;
  const nodes = [];
  for (let k = 0; k <= N; k++) {
    onProgress?.(k, N);
    const a = await Engine.analyze({ fen: fens[k], movetimeMs, variant: 'shogi' });
    // 終局（被將死／無合法手）：引擎不吐 score → 視為「輪到的一方必敗」(-MATE_CP)，
    // 否則 cpStm=0 會讓致勝的將死手被誤算成大失誤、終局評估顯示均勢。
    const terminal = k > 0 && a.bestmove == null && a.cp == null && a.mate == null;
    const cpStm = terminal ? -MATE_CP : evalCp(a);
    const p1ToMove = (k % 2 === 0); // ply 0 = 先手先走
    nodes.push({ fen: fens[k], cpStm, p1Cp: p1ToMove ? cpStm : -cpStm, mate: a.mate, bestmove: a.bestmove, pv: a.pv });
  }
  for (let i = 0; i < N; i++) {
    const loss = Math.max(0, nodes[i].cpStm + nodes[i + 1].cpStm);
    nodes[i].loss = loss;
    nodes[i].cls = classifyLoss(loss);
  }
  return nodes;
}

export const ShogiReview = { analyzeGame, classifyLoss };
