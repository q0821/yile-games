export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

export function cloneBoard(board) {
  return board.map(row => [...row]);
}

export function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

export function inBounds(size, x, y) {
  return x >= 0 && x < size && y >= 0 && y < size;
}

export function getNeighbors(size, x, y) {
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([nx, ny]) => inBounds(size, nx, ny));
}

export function getGroup(board, size, x, y) {
  const color = board[x][y];
  if (color === EMPTY) return { stones: [], liberties: new Set() };

  const visited = new Set();
  const stones = [];
  const liberties = new Set();
  const stack = [[x, y]];

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = cx * size + cy;
    if (visited.has(key)) continue;
    visited.add(key);

    if (board[cx][cy] === color) {
      stones.push([cx, cy]);
      for (const [nx, ny] of getNeighbors(size, cx, cy)) {
        if (board[nx][ny] === EMPTY) liberties.add(nx * size + ny);
        else if (board[nx][ny] === color && !visited.has(nx * size + ny)) stack.push([nx, ny]);
      }
    }
  }

  return { stones, liberties };
}

export function removeGroup(board, stones) {
  for (const [x, y] of stones) board[x][y] = EMPTY;
  return stones.length;
}

export function boardToString(board) {
  return board.map(row => row.join('')).join('');
}

export function tryPlaceStone(board, size, x, y, player, currentKo) {
  if (board[x][y] !== EMPTY) return { valid: false };

  const newBoard = cloneBoard(board);
  newBoard[x][y] = player;
  let captured = 0;
  let capturedSingle = null;
  const opp = opponent(player);

  for (const [nx, ny] of getNeighbors(size, x, y)) {
    if (newBoard[nx][ny] === opp) {
      const group = getGroup(newBoard, size, nx, ny);
      if (group.liberties.size === 0) {
        if (group.stones.length === 1) capturedSingle = group.stones[0];
        captured += removeGroup(newBoard, group.stones);
      }
    }
  }

  const selfGroup = getGroup(newBoard, size, x, y);
  if (selfGroup.liberties.size === 0) return { valid: false };

  if (currentKo && currentKo[0] === x && currentKo[1] === y) return { valid: false };

  let newKo = null;
  if (captured === 1 && capturedSingle && selfGroup.stones.length === 1 && selfGroup.liberties.size === 1) {
    newKo = capturedSingle;
  }

  return { valid: true, newBoard, captured, newKo };
}

export function getLegalMoves(board, size, player, koPoint) {
  const moves = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (tryPlaceStone(board, size, x, y, player, koPoint).valid) moves.push([x, y]);
    }
  }
  return moves;
}

export function calculateTerritory(board, size) {
  const territory = Array.from({ length: size }, () => Array(size).fill(EMPTY));
  const visited = Array.from({ length: size }, () => Array(size).fill(false));

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (visited[x][y] || board[x][y] !== EMPTY) continue;

      const region = [];
      const borders = new Set();
      const stack = [[x, y]];

      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (visited[cx][cy]) continue;
        visited[cx][cy] = true;
        if (board[cx][cy] === EMPTY) {
          region.push([cx, cy]);
          for (const [nx, ny] of getNeighbors(size, cx, cy)) {
            if (board[nx][ny] !== EMPTY) borders.add(board[nx][ny]);
            else if (!visited[nx][ny]) stack.push([nx, ny]);
          }
        }
      }

      if (borders.size === 1) {
        const owner = [...borders][0];
        for (const [rx, ry] of region) territory[rx][ry] = owner;
      }
    }
  }

  return territory;
}

export function estimateDeadStones(board, size) {
  const dead = new Set();
  let workBoard = cloneBoard(board);
  let territory = calculateTerritory(workBoard, size);

  let changed = true;
  while (changed) {
    changed = false;
    const visited = new Set();

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const key = x * size + y;
        if (visited.has(key) || workBoard[x][y] === EMPTY) continue;

        const color = workBoard[x][y];
        const { stones, liberties } = getGroup(workBoard, size, x, y);
        for (const [gx, gy] of stones) visited.add(gx * size + gy);

        const opp = opponent(color);
        let safe = false;
        for (const lib of liberties) {
          if (territory[Math.floor(lib / size)][lib % size] !== opp) { safe = true; break; }
        }

        if (!safe) {
          for (const [gx, gy] of stones) {
            dead.add(gx * size + gy);
            workBoard[gx][gy] = EMPTY;
          }
          changed = true;
        }
      }
    }

    if (changed) territory = calculateTerritory(workBoard, size);
  }

  return dead;
}

export function calculateScore(board, size, deadStones, captures, gameRules, komi) {
  const scored = cloneBoard(board);
  let deadBlack = 0;
  let deadWhite = 0;

  for (const key of deadStones) {
    const x = Math.floor(key / size);
    const y = key % size;
    const color = scored[x][y];
    if (color !== EMPTY) {
      if (color === BLACK) deadBlack++;
      else deadWhite++;
      scored[x][y] = EMPTY;
    }
  }

  const territory = calculateTerritory(scored, size);

  let blackStones = 0;
  let whiteStones = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (scored[x][y] === BLACK) blackStones++;
      else if (scored[x][y] === WHITE) whiteStones++;
      if (territory[x][y] === BLACK) blackTerritory++;
      else if (territory[x][y] === WHITE) whiteTerritory++;
    }
  }

  if (gameRules === 'japanese') {
    const blackPrisoners = captures[BLACK] + deadWhite;
    const whitePrisoners = captures[WHITE] + deadBlack;
    return {
      black: blackTerritory + blackPrisoners,
      white: whiteTerritory + whitePrisoners + komi,
      blackStones: blackPrisoners,
      blackTerritory,
      whiteStones: whitePrisoners,
      whiteTerritory,
      territory
    };
  }

  return {
    black: blackStones + blackTerritory,
    white: whiteStones + whiteTerritory + komi,
    blackStones,
    blackTerritory,
    whiteStones,
    whiteTerritory,
    territory
  };
}

// Namespace-compatible export for any remaining legacy callers
export const GoRules = {
  EMPTY, BLACK, WHITE,
  createBoard, cloneBoard, opponent, inBounds, getNeighbors,
  getGroup, removeGroup, boardToString, tryPlaceStone,
  getLegalMoves, calculateTerritory, estimateDeadStones, calculateScore,
  estimateBlackLead, leadForPlayer, computePointsLost, ratePointsLost
};

// ── Learning-mode helpers (review scoring & in-game coaching) ─────────────────
// Estimate how many points Black is ahead by on a (possibly mid-game) board.
// Positive = Black leads, negative = White leads. Pure JS — no engine needed.
// Dead stones are intentionally NOT removed (the mid-game heuristic is unreliable);
// this keeps the running estimate stable across consecutive moves.
export function estimateBlackLead(board, size, captures, rules, komi) {
  const s = calculateScore(board, size, null, captures, rules, komi);
  return s.black - s.white;
}

// Convert a Black-perspective lead into the given player's perspective.
export function leadForPlayer(blackLead, player) {
  return player === BLACK ? blackLead : -blackLead;
}

// How many points worse the played move is versus the engine's best move,
// from the mover's perspective. ~0 = as good as the AI; large positive = blunder.
// `captures` is the running capture count BEFORE this move (used by Japanese rules).
export function computePointsLost(prevBoard, size, move, bestMove, captures, rules, komi) {
  if (!move || move.pass) return 0;
  const player = move.player;
  const actual = tryPlaceStone(prevBoard, size, move.x, move.y, player, null);
  const boardActual = actual.valid ? actual.newBoard : prevBoard;
  const leadActual = leadForPlayer(estimateBlackLead(boardActual, size, captures, rules, komi), player);
  let leadBest = leadActual;
  if (bestMove) {
    const best = tryPlaceStone(prevBoard, size, bestMove[0], bestMove[1], player, null);
    if (best.valid) {
      leadBest = leadForPlayer(estimateBlackLead(best.newBoard, size, captures, rules, komi), player);
    }
  }
  return leadBest - leadActual;
}

// Map a points-lost value to a rating bucket.
export function ratePointsLost(pointsLost, goodPts, badPts) {
  if (pointsLost <= goodPts) return 'good';
  if (pointsLost <= badPts) return 'question';
  return 'bad';
}
