(function(global) {
  // ==================== CAPTURE HINTS ====================

  function getCaptureHints(board, size, player, koPoint) {
    const hints = [];
    const seen = new Set();
    const opp = GoRules.opponent(player);

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        if (board[x][y] !== opp) continue;
        const group = GoRules.getGroup(board, size, x, y);
        if (group.liberties.size === 1) {
          for (const libKey of group.liberties) {
            const lx = Math.floor(libKey / size);
            const ly = libKey % size;
            const key = `${lx},${ly}`;
            if (!seen.has(key)) {
              const result = GoRules.tryPlaceStone(board, size, lx, ly, player, koPoint);
              if (result.valid) {
                hints.push([lx, ly]);
                seen.add(key);
              }
            }
          }
        }
      }
    }
    return hints;
  }

  // ==================== BEGINNER GUIDANCE ====================

  function getGamePhase(moveCount, size) {
    const threshold = size <= 9 ? 10 : size <= 13 ? 20 : 30;
    if (moveCount < threshold) return 'opening';
    if (moveCount < threshold * 3) return 'middle';
    return 'endgame';
  }

  function getGuidanceLabel(x, y, rank, phase, ctx) {
    const { board, size, currentPlayer } = ctx;
    const { EMPTY } = GoRules;
    const margin = size <= 9 ? 2 : 3;
    const isCorner = (r, c) => (r < margin || r >= size - margin) && (c < margin || c >= size - margin);
    const isSide = (r, c) => r < margin || r >= size - margin || c < margin || c >= size - margin;

    if (phase === 'opening') {
      if (isCorner(x, y)) {
        const nearby = GoRules.getNeighbors(size, x, y).some(([nx, ny]) => board[nx][ny] !== EMPTY);
        return nearby ? '守角' : '佔角';
      }
      if (isSide(x, y)) return '拓邊';
      return '佈局';
    } else if (phase === 'middle') {
      const opp = GoRules.opponent(currentPlayer);
      for (const [nx, ny] of GoRules.getNeighbors(size, x, y)) {
        if (board[nx][ny] === opp) {
          const group = GoRules.getGroup(board, size, nx, ny);
          if (group.liberties.size <= 2) return '攻擊';
        }
      }
      for (const [nx, ny] of GoRules.getNeighbors(size, x, y)) {
        if (board[nx][ny] === currentPlayer) {
          const group = GoRules.getGroup(board, size, nx, ny);
          if (group.liberties.size <= 2) return '補強';
        }
      }
      if (isSide(x, y)) return '拓邊';
      return '中腹';
    } else {
      return '收官';
    }
  }

  const RANK_NAMES = ['⭐ 最佳', '🔵 次佳', '🟢 可考慮'];

  /** Pure: returns HTML string for the legend, or null when legend should be hidden. */
  function buildGuidanceLegendHTML(guidanceHints, ctx) {
    const { guidanceEnabled, gameOver, isReviewing, isScoring, size } = ctx;
    if (!guidanceEnabled || guidanceHints.length === 0 || gameOver || isReviewing || isScoring) {
      return null;
    }
    return guidanceHints.map((hint) => {
      const coord = `${String.fromCharCode(65 + hint.y)}${size - hint.x}`;
      return `<div><strong>${RANK_NAMES[hint.rank] || '提示'}</strong>：${coord} — ${hint.label}</div>`;
    }).join('');
  }

  function renderGuidanceLegend(guidanceHints, ctx) {
    const legend = document.getElementById('guidanceLegend');
    if (!legend) return;
    const html = buildGuidanceLegendHTML(guidanceHints, ctx);
    if (html === null) {
      legend.style.display = 'none';
      legend.innerHTML = '';
    } else {
      legend.innerHTML = html;
      legend.style.display = 'block';
    }
  }

  global.GoHints = { getCaptureHints, getGamePhase, getGuidanceLabel, buildGuidanceLegendHTML, renderGuidanceLegend };
})(window);
