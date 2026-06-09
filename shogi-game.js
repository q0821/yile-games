// shogi-game.js — 將棋棋規（封裝 ffish-es6，無自製規則）。
//
// 合法手、走子、升變、打入、勝負、王手一律交給 ffish。也負責「螢幕座標 ↔ UCI square」
// 映射（全模組唯一來源）、FEN→渲染用格陣解析（含升變駒與朝向）、持駒解析。
//
// 座標慣例（已用 ffish legalMoves() 實測校正，勿憑空改）：
//   grid[row][col]，row 0 = 最上方（後手底線, rank 9），row 8 = 最下方（先手底線, rank 1），
//   col 0 = 最左 file a，col 8 = file i。Fairy-Stockfish 將棋 UCI：file a–i + rank 1–9，
//   rank = 9 - row（先手步起點 = rank 3 = row 6；先手王 = e1 = row 8）。
//
// 記法三型（實測）：
//   普通  'e3e4'          from+to（square 恆 2 字元）
//   升變  'e7e8+'         尾綴 +
//   打入  'P@5e' → 實為 'P@e5'：<大寫駒>@<square>（駒字一律大寫，方向由輪到方決定）
//
// 共用同一份多變體 ffish.wasm（與象棋同檔，無需另存）。
import Module from 'ffish-es6';

const FILES = 'abcdefghi';   // col 0..8 → file a..i
const RANKS = 9;
const COLS = 9;

// 駒底字（大寫鍵）。王/玉以朝向區分：先手王、後手玉（傳統高位用王、低位用玉）。
const BASE_CN = { K: '王', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩' };
const GOTE_K = '玉';
// 升變駒底字（金將與王不升變）。
const PROMO_CN = { R: '龍', B: '馬', S: '全', N: '圭', L: '杏', P: 'と' };
// 持駒區顯示順序（強→弱）
export const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

let _ffish = null;
let _board = null;
let _readyPromise = null;

export function ensureReady() {
  if (_readyPromise) return _readyPromise;
  // 與象棋共用 vendored 的 ffish.wasm（多變體單檔），以 application/wasm 提供。
  _readyPromise = (async () => {
    _ffish = await Module({ locateFile: (f) => (f.endsWith('.wasm') ? '/engine/xiangqi/' + f : f) });
    return true;
  })().catch((e) => { _readyPromise = null; throw e; });
  return _readyPromise;
}

export async function newGame() {
  await ensureReady();
  if (_board) { _board.delete(); _board = null; }
  _board = new _ffish.Board('shogi');
}

// ——— 座標映射（唯一來源；改這裡前先肉眼驗證 row/col 沒對調）———

/** grid 座標 → UCI square。row 0=上(rank9)、row 8=下(rank1)、col 0=左(file a)。 */
export function rcToSquare(row, col) { return FILES[col] + (RANKS - row); }

/** UCI square → grid 座標。 */
export function squareToRC(sq) {
  return { col: FILES.indexOf(sq[0]), row: RANKS - Number(sq.slice(1)) };
}

// ——— 著法解析 ———

/**
 * 拆解 UCI 著法。回傳：
 *   普通/升變 { drop:false, from, to, promo:boolean }
 *   打入      { drop:true,  piece:'P', to }
 */
export function splitMove(uci) {
  const d = /^([A-Z])@([a-i][1-9])$/.exec(uci);
  if (d) return { drop: true, piece: d[1], to: d[2] };
  const m = /^([a-i][1-9])([a-i][1-9])(\+?)$/.exec(uci);
  if (m) return { drop: false, from: m[1], to: m[2], promo: m[3] === '+' };
  return { drop: false, from: uci.slice(0, 2), to: uci.slice(2, 4), promo: uci.endsWith('+') };
}

/** 著法的起終 square（打入無 from，回 { from:null, to }），供最後手標記等。 */
export function moveEndpoints(uci) {
  const p = splitMove(uci);
  return p.drop ? { from: null, to: p.to } : { from: p.from, to: p.to };
}

// ——— 局面查詢 ———

export function fen() { return _board.fen(); }
/** true = 先手（白/Sente，後手執方上方）走，false = 後手走。 */
export function turn() { return _board.turn(); }
export function legalMoves() { return _board.legalMoves().split(/\s+/).filter(Boolean); }

/** 從某 square 出發的所有合法目的 square（去重；含升變/不升變兩版本歸一）。 */
export function legalTargetsFrom(square) {
  const set = new Set();
  for (const uci of legalMoves()) {
    const m = splitMove(uci);
    if (!m.drop && m.from === square) set.add(m.to);
  }
  return [...set];
}

/** 持駒某型（大寫駒字）所有合法落點 square。 */
export function legalDropTargets(pieceUpper) {
  const set = new Set();
  for (const uci of legalMoves()) {
    const m = splitMove(uci);
    if (m.drop && m.piece === pieceUpper) set.add(m.to);
  }
  return [...set];
}

/**
 * from→to 的升變狀態：
 *   { can:boolean, must:boolean }
 *   can  = 存在升變版本；must = 只有升變版本（強制升，如步/桂/香到底排）。
 */
export function promotionState(from, to) {
  const plain = from + to, promo = from + to + '+';
  let hasPlain = false, hasPromo = false;
  for (const uci of legalMoves()) {
    if (uci === plain) hasPlain = true;
    else if (uci === promo) hasPromo = true;
  }
  return { can: hasPromo, must: hasPromo && !hasPlain };
}

/** 走一手（UCI），回傳是否合法。 */
export function move(uci) { return _board.push(uci); }
export function isGameOver() { return _board.isGameOver(); }
/** ffish result：'1-0' 先手勝、'0-1' 後手勝、'1/2-1/2' 和、'*' 進行中。 */
export function result() { return _board.result(); }
export function isCheck() { return _board.isCheck(); }
/** 被王手的王 square 陣列，供高亮。 */
export function checkedSquares() { return _board.checkedPieces().split(/\s+/).filter(Boolean); }
export function gamePly() { return _board.gamePly(); }
/** 悔棋一手。 */
export function undo() { _board.pop(); }
/** 目前最後一手 UCI（無則 null）。 */
export function lastMoveUci() {
  const ms = _board.moveStack().split(/\s+/).filter(Boolean);
  return ms.length ? ms[ms.length - 1] : null;
}

// ——— 渲染解析 ———

/** 解析 FEN 盤面段 token（'P' / '+P' / 'k'…）→ { char, sente, promoted }。 */
function pieceInfo(token) {
  const promoted = token[0] === '+';
  const letter = promoted ? token[1] : token[0];
  const sente = letter === letter.toUpperCase();
  const up = letter.toUpperCase();
  let char;
  if (promoted) char = PROMO_CN[up] || up;
  else if (up === 'K') char = sente ? BASE_CN.K : GOTE_K;
  else char = BASE_CN[up] || up;
  return { char, sente, promoted };
}

/**
 * 解析任一 FEN → grid[row][col]，每格 { char, sente, promoted } 或 null。
 * row 0 = 最上方（與 FEN 第一段第一列對齊）。盤面段在 '[' 持駒前。
 */
export function gridFromFen(fenStr) {
  const placement = fenStr.split(' ')[0].split('[')[0];
  const rows = placement.split('/');
  const grid = [];
  for (let r = 0; r < rows.length; r++) {
    const row = [];
    const s = rows[r];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (/\d/.test(ch)) { for (let k = 0; k < Number(ch); k++) row.push(null); }
      else if (ch === '+') { row.push(pieceInfo('+' + s[++i])); }
      else row.push(pieceInfo(ch));
    }
    while (row.length < COLS) row.push(null);
    grid.push(row);
  }
  return grid;
}

/** 目前局面棋子格陣。 */
export function piecesGrid() { return gridFromFen(fen()); }

/**
 * 解析持駒。回傳 { sente:{R:1,P:2,…}, gote:{…} }（只列有持的；大寫駒字）。
 * FEN 持駒段在 '[...]'，大寫=先手、小寫=後手；持駒不帶升變。
 */
export function handsFromFen(fenStr) {
  const sente = {}, gote = {};
  const m = fenStr.match(/\[([^\]]*)\]/);
  if (m) {
    for (const ch of m[1]) {
      if (/[A-Z]/.test(ch)) sente[ch] = (sente[ch] || 0) + 1;
      else if (/[a-z]/.test(ch)) { const u = ch.toUpperCase(); gote[u] = (gote[u] || 0) + 1; }
    }
  }
  return { sente, gote };
}

/** 目前局面持駒。 */
export function hands() { return handsFromFen(fen()); }

/** 持駒駒字 → 顯示用漢字（底字，未升變）。 */
export function handChar(pieceUpper) { return BASE_CN[pieceUpper] || pieceUpper; }

// ——— 覆盤用 ———

/** 整局已走的 UCI 著法陣列。 */
export function moveStackList() { return _board.moveStack().split(/\s+/).filter(Boolean); }

/** 由著法序列重播，回傳每個 ply（含開局）的 FEN 陣列（長度 = moves.length + 1）。 */
export function fensForMoves(moves) {
  const b = new _ffish.Board('shogi');
  const fens = [b.fen()];
  for (const m of moves) { b.push(m); fens.push(b.fen()); }
  b.delete();
  return fens;
}

export const COLUMNS = COLS;
export const ROWS = RANKS;
