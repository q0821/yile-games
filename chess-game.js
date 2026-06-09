// chess-game.js — 西洋棋棋規（封裝 ffish-es6，無自製規則）。
//
// 合法手、走子、升變、王車易位、吃過路兵、勝負、將軍一律交給 ffish。也負責
// 「螢幕座標 ↔ UCI square」映射（全模組唯一來源）、FEN→渲染用格陣解析。
//
// 座標慣例（已用 ffish legalMoves() 實測校正）：
//   grid[row][col]，row 0 = 最上方（rank 8，黑方底線），row 7 = 最下方（rank 1，白方底線），
//   col 0 = 最左 file a，col 7 = file h。UCI：file a–h + rank 1–8，rank = 8 - row。
//   白兵 e2 = row 6、白王 e1 = row 7。
//
// 記法（實測）：普通 'e2e4'；升變 'e7e8q'（尾碼 q/r/b/n、強制選一）；
//   王車易位 'e1g1'（短）/'e1c1'（長，引擎自動移車）；吃過路兵 'e5d6'（外觀同普通手）。
//
// 共用同一份多變體 ffish.wasm（與象棋/將棋同檔）。
import Module from 'ffish-es6';

const FILES = 'abcdefgh';   // col 0..7 → file a..h
const RANKS = 8;
const COLS = 8;

// FEN 駒 → 顯示用 Unicode 西洋棋實心字（兩方同字、靠顏色分黑白；造型即剪影）。
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
// 升變可選駒（顯示用中文）
export const PROMO_PIECES = [
  { code: 'q', glyph: '♛', name: '后' },
  { code: 'r', glyph: '♜', name: '車' },
  { code: 'b', glyph: '♝', name: '象' },
  { code: 'n', glyph: '♞', name: '馬' },
];

let _ffish = null;
let _board = null;
let _readyPromise = null;

export function ensureReady() {
  if (_readyPromise) return _readyPromise;
  // 與象棋/將棋共用 vendored 的 ffish.wasm（多變體單檔）。
  _readyPromise = (async () => {
    _ffish = await Module({ locateFile: (f) => (f.endsWith('.wasm') ? '/engine/xiangqi/' + f : f) });
    return true;
  })().catch((e) => { _readyPromise = null; throw e; });
  return _readyPromise;
}

export async function newGame() {
  await ensureReady();
  if (_board) { _board.delete(); _board = null; }
  _board = new _ffish.Board('chess');
}

// ——— 座標映射（唯一來源；改這裡前先肉眼驗證 row/col 沒對調）———

/** grid 座標 → UCI square。row 0=上(rank8)、row 7=下(rank1)、col 0=左(file a)。 */
export function rcToSquare(row, col) { return FILES[col] + (RANKS - row); }

/** UCI square → grid 座標。 */
export function squareToRC(sq) {
  return { col: FILES.indexOf(sq[0]), row: RANKS - Number(sq[1]) };
}

// ——— 著法解析 ———

/**
 * 拆解 UCI 著法 → { from, to, promo }（promo 為 'q'|'r'|'b'|'n' 或 ''）。
 * 王車易位/吃過路兵外觀同普通手、無需特判（引擎處理）。
 */
export function splitMove(uci) {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn]?)$/.exec(uci);
  if (m) return { from: m[1], to: m[2], promo: m[3] };
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promo: uci.slice(4, 5) };
}

/** 著法起終 square（供最後手標記）。 */
export function moveEndpoints(uci) { const p = splitMove(uci); return { from: p.from, to: p.to }; }

// ——— 局面查詢 ———

export function fen() { return _board.fen(); }
/** true = 白方走，false = 黑方走。 */
export function turn() { return _board.turn(); }
export function legalMoves() { return _board.legalMoves().split(/\s+/).filter(Boolean); }

/** 從某 square 出發的所有合法目的 square（去重；升變四版本歸一個目的）。 */
export function legalTargetsFrom(square) {
  const set = new Set();
  for (const uci of legalMoves()) {
    const m = splitMove(uci);
    if (m.from === square) set.add(m.to);
  }
  return [...set];
}

/**
 * from→to 是否為升變（兵抵底排，西洋棋強制選子）。
 * 升變時 legalMoves 只有帶尾碼的版本（from+to+q/r/b/n），無 plain。
 */
export function isPromotion(from, to) {
  for (const uci of legalMoves()) {
    const m = splitMove(uci);
    if (m.from === from && m.to === to && m.promo) return true;
  }
  return false;
}

/** 走一手（UCI），回傳是否合法。 */
export function move(uci) { return _board.push(uci); }
export function isGameOver() { return _board.isGameOver(); }
/** ffish result：'1-0' 白勝、'0-1' 黑勝、'1/2-1/2' 和、'*' 進行中。 */
export function result() { return _board.result(); }
export function isCheck() { return _board.isCheck(); }
/** 被將的王 square 陣列，供高亮。 */
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

/**
 * 解析任一 FEN → grid[row][col]，每格 { glyph, white } 或 null。
 * row 0 = 最上方（與 FEN 第一段第一列對齊）。
 */
export function gridFromFen(fenStr) {
  const placement = fenStr.split(' ')[0];
  const rows = placement.split('/');
  const grid = [];
  for (let r = 0; r < rows.length; r++) {
    const row = [];
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { for (let k = 0; k < Number(ch); k++) row.push(null); }
      else {
        const white = ch === ch.toUpperCase();
        row.push({ glyph: GLYPH[ch.toUpperCase()] || ch, white });
      }
    }
    while (row.length < COLS) row.push(null);
    grid.push(row);
  }
  return grid;
}

/** 目前局面棋子格陣。 */
export function piecesGrid() { return gridFromFen(fen()); }

export const COLUMNS = COLS;
export const ROWS = RANKS;
