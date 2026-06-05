// katago-service.js — gogame 端封裝 vendored KataGo 引擎（web-katrain, MIT，見 katago-engine/）。
//
// 提供 ensureReady / genmove / evaluate / analyzeLocal，作為對弈與分析的唯一引擎。
// 也提供 evaluate()，供日後覆盤誠實分析（勝率/領地）使用。
//
// ⚠️ 座標轉換（最關鍵）：
//   本專案盤面 board[x][y]，x=列(row, 0=上)、y=行(col, 0=左)，棋子值 BLACK/WHITE/EMPTY。
//   web-katrain BoardState 為 board[row][col]（'black'|'white'|null），Move{ x=col, y=row }。
//   兩邊內部都是 [row][col]，但 Move 的 x/y 對調：web.x = our.y(col)、web.y = our.x(row)。
import { BLACK, WHITE, EMPTY } from './rules.js';
import { getKataGoEngineClient } from './katago-engine/engine/katago/client.ts';
import { publicUrl } from './katago-engine/utils/publicUrl.ts';

const MODEL_URL = publicUrl('models/katago-small.bin.gz');

let _client = null;
let _readyPromise = null;
let _backend = null;

function client() {
  if (!_client) _client = getKataGoEngineClient();
  return _client;
}

/** 載入模型（首次約需下載 3.8MB）。可重複呼叫，只初始化一次。 */
export function ensureReady(onStatus) {
  if (_readyPromise) return _readyPromise;
  _readyPromise = (async () => {
    onStatus?.('AI 載入中…（首次需下載模型，約 4MB）');
    // 偏好 WebGPU，引擎內部會自動 fallback 到 WASM
    await client().init(MODEL_URL, 'webgpu');
    _backend = client().getEngineInfo().backend;
    return _backend;
  })().catch((err) => {
    _readyPromise = null; // 失敗可重試
    throw err;
  });
  return _readyPromise;
}

export function isReady() {
  return !!_backend;
}

export function getBackend() {
  return _backend;
}

// ——— 座標 / 盤面轉換 ———

function toColor(player) {
  return player === BLACK ? 'black' : 'white';
}

/** 本專案 board[row][col]（值 BLACK/WHITE/EMPTY）→ web-katrain BoardState（[row][col]，'black'|'white'|null）。 */
function toWebBoard(board, size) {
  const wb = new Array(size);
  for (let r = 0; r < size; r++) {
    const row = new Array(size);
    for (let c = 0; c < size; c++) {
      const v = board[r][c];
      row[c] = v === BLACK ? 'black' : v === WHITE ? 'white' : null;
    }
    wb[r] = row;
  }
  return wb;
}

/** 本專案 moveHistory（{x=row,y=col,player,pass}）→ web Move[]（{x=col,y=row,player}），略過 pass。 */
function toWebMoves(moveHistory) {
  const out = [];
  for (const m of moveHistory) {
    if (m.pass) continue;
    out.push({ x: m.y, y: m.x, player: toColor(m.player) });
  }
  return out;
}

function buildArgs(state, extra) {
  return {
    modelUrl: MODEL_URL,
    board: toWebBoard(state.board, state.size),
    currentPlayer: toColor(state.currentPlayer),
    moveHistory: toWebMoves(state.moveHistory),
    komi: state.komi,
    rules: state.gameRules, // 'chinese' | 'japanese'
    ...extra,
  };
}

/**
 * 求一手棋。visits 控制思考量（強度/延遲）。
 * @returns {{x:number,y:number}|{pass:true}}  本專案座標（x=row,y=col）
 */
export async function genmove(state, { visits = 32, maxTimeMs = 8000 } = {}) {
  await ensureReady(state.onStatus);
  const analysis = await client().analyze(buildArgs(state, { visits, maxTimeMs }));
  const moves = analysis?.moves || [];
  if (!moves.length) return { pass: true };
  const best = moves.find((m) => m.order === 0) || moves[0];
  // web Move x=col,y=row → 本專案 x=row(best.y), y=col(best.x)
  return { x: best.y, y: best.x };
}

/**
 * 評估目前盤面（供覆盤分析）。回傳 KataGo Analysis payload（rootWinRate、moves、ownership…）。
 * 勝率/領地觀點之後在 2c 統一處理。
 */
export async function evaluate(state, { visits = 16, maxTimeMs = 8000 } = {}) {
  await ensureReady(state.onStatus);
  return client().analyze(buildArgs(state, { visits, maxTimeMs }));
}

/**
 * 局部應手（供死活後續手 S7）：限制 KataGo 只在 region 範圍內選手，一次 analyze 同時取得
 * 「局部最佳手 + 該盤面 root 勝率 + ownership」，避免空盤大部分區域讓引擎跑去佔大場。
 *
 * @param {object} region 本專案座標 { minRow, maxRow, minCol, maxCol }（皆含端點）
 * @returns {{ move:{x:number,y:number}|{pass:true}, winrate:number|null, ownership:(Float32Array|number[]|null) }}
 *          move 為本專案座標（x=row、y=col）；winrate=rootWinRate（黑勝率）；ownership index = row*size+col。
 */
export async function analyzeLocal(state, region, { visits = 24, maxTimeMs = 6000 } = {}) {
  await ensureReady(state.onStatus);
  const analysis = await client().analyze(buildArgs(state, { visits, maxTimeMs }));
  const winrate = analysis?.rootWinRate ?? null;
  const ownership = analysis?.ownership || null;
  const size = state.size;
  const policy = analysis?.policy || null;

  // 在 region 內挑 KataGo 最想下的局部手。
  // 不用搜尋出的 moves 清單：近乎空盤時 KataGo 把 visits 花在滿盤大場，候選常整批落在
  // region 外（→ 整題立刻 pass、後續手走不下去）。改用 dense 的 policy（每點都有先驗、
  // illegal 標 -1，index = row*size+col）在 region 內挑最高合法點，保證有局部手；且實測
  // 當 KataGo 真的偏好某局部手時，policy 最高點即同一點。
  let best = null;  // { row, col, p }
  if (policy) {
    for (let r = region.minRow; r <= region.maxRow; r++) {
      for (let c = region.minCol; c <= region.maxCol; c++) {
        const p = policy[r * size + c];   // illegal（占位/自殺/劫）= -1
        if (p < 0) continue;
        if (!best || p > best.p) best = { row: r, col: c, p };
      }
    }
  }
  // 收手門檻：局部已底定時，region 內最高 policy 會掉到雜訊水準（實測「一手即定」題 <0.015、
  // 有真實後續手者 >=0.029）。低於門檻就 pass，讓 AI 不在空處補無意義填子、也讓一手定型的題
  // 老實回報「無後續手」。
  const SETTLED_POLICY = 0.02;
  const move = (best && best.p >= SETTLED_POLICY) ? { x: best.row, y: best.col } : { pass: true };
  return { move, winrate, ownership };
}

export const KataGoService = { ensureReady, isReady, getBackend, genmove, evaluate, analyzeLocal };
