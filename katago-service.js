// katago-service.js — gogame 端封裝 vendored KataGo 引擎（web-katrain, MIT，見 katago-engine/）。
//
// 對齊 gnugo-service 的使用方式（ensureReady / genmove），讓對弈可改用 KataGo。
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

export const KataGoService = { ensureReady, isReady, getBackend, genmove, evaluate };
