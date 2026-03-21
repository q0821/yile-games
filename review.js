(function(global) {
  const { BLACK } = GoRules;

  function buildSGFUpTo(n, moveHistory, size, komi) {
    const letters = 'abcdefghijklmnopqrs';
    let sgf = `(;GM[1]FF[4]SZ[${size}]KM[${komi}]`;
    for (let i = 0; i < n; i++) {
      const m = moveHistory[i];
      const color = m.player === BLACK ? 'B' : 'W';
      if (m.pass) {
        sgf += `;${color}[]`;
      } else {
        sgf += `;${color}[${letters[m.y]}${letters[m.x]}]`;
      }
    }
    sgf += ')';
    return sgf;
  }

  function getReviewBoard(moveHistory, currentReviewMove, size) {
    let b = GoRules.createBoard(size);
    for (let i = 0; i < currentReviewMove; i++) {
      const m = moveHistory[i];
      if (m.pass) continue;
      const result = GoRules.tryPlaceStone(b, size, m.x, m.y, m.player, null);
      if (result.valid) b = result.newBoard;
    }
    return b;
  }

  function getReviewLastMove(moveHistory, currentReviewMove) {
    for (let i = currentReviewMove - 1; i >= 0; i--) {
      if (!moveHistory[i].pass) return [moveHistory[i].x, moveHistory[i].y];
    }
    return null;
  }

  global.GoReview = { buildSGFUpTo, getReviewBoard, getReviewLastMove };
})(window);
