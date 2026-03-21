(function(global) {

  function buildSGFUpTo(n, moveHistory, size, komi) {
    return GnuGoService.buildSGFUpTo(moveHistory, size, komi, n);
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
