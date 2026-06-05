// sgf.js — 純 SGF 字串工具（不依賴任何引擎）。
//
// 原本住在 gnugo-service.js，GnuGo 引擎移除後抽出來獨立，供「匯出 SGF」使用。
// 座標慣例（與 ui.js / tsumego.js 一致）：SGF 第一字母 = column(y)、第二字母 = row(x)。

const LETTERS = 'abcdefghijklmnopqrs';

/** moveHistory（{x:row,y:col,player,pass}）→ 完整 SGF 字串。player 1=黑(B)、2=白(W)。 */
export function buildSGF(moveHistory, size, komi) {
  let sgf = `(;GM[1]FF[4]SZ[${size}]KM[${komi}]`;
  for (const m of moveHistory) {
    const color = m.player === 1 ? 'B' : 'W';
    if (m.pass) {
      sgf += `;${color}[]`;
    } else {
      sgf += `;${color}[${LETTERS[m.y]}${LETTERS[m.x]}]`;
    }
  }
  sgf += ')';
  return sgf;
}
