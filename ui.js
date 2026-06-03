import { EMPTY, BLACK, WHITE, getGroup } from './rules.js';

// ——— Liberty map for emotion mode ———
function computeLibertyMap(board, size) {
  const map = Array.from({ length: size }, () => new Array(size).fill(0));
  const visited = new Set();
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] === EMPTY) continue;
      const key = x * size + y;
      if (visited.has(key)) continue;
      const { stones, liberties } = getGroup(board, size, x, y);
      const count = liberties.size;
      for (const [sx, sy] of stones) {
        map[sx][sy] = count;
        visited.add(sx * size + sy);
      }
    }
  }
  return map;
}

// Offscreen canvas cache for static board background (wood texture + grid + stars + labels)
let _bgCache = null;
let _bgCacheKey = '';

// ——— Dirty-rect / resize optimisation ———
// We track whether the canvas *layout* (size or board dimensions) has changed
// since the last draw.  resizeCanvas is only called when needed instead of on
// every draw tick.
let _lastCanvasKey = '';

function _layoutKey(deps, state) {
  return `${window.innerWidth}_${window.innerHeight}_${state.size}`;
}

function renderBoardBackground(deps, state) {
  const w = deps.canvas.width;
  const cacheKey = `${w}_${state.size}`;
  if (_bgCache && _bgCacheKey === cacheKey) return _bgCache;

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = w;
  const ctx = offscreen.getContext('2d');

  ctx.fillStyle = '#dcb35c';
  ctx.fillRect(0, 0, w, w);
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < w; i += 8) {
    ctx.strokeStyle = i % 24 === 0 ? '#a08030' : '#c4a04c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i + (Math.sin(i * 0.05) * 3));
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#5a4420';
  ctx.lineWidth = 1;
  for (let i = 0; i < state.size; i++) {
    const pos = deps.padding + i * deps.cellSize;
    ctx.beginPath();
    ctx.moveTo(deps.padding, pos);
    ctx.lineTo(deps.padding + (state.size - 1) * deps.cellSize, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, deps.padding);
    ctx.lineTo(pos, deps.padding + (state.size - 1) * deps.cellSize);
    ctx.stroke();
  }

  const stars = deps.starPoints[state.size] || [];
  for (const [x, y] of stars) {
    ctx.fillStyle = '#5a4420';
    ctx.beginPath();
    ctx.arc(deps.padding + y * deps.cellSize, deps.padding + x * deps.cellSize, deps.cellSize * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#3a2010';
  ctx.font = `bold ${Math.max(9, Math.min(deps.cellSize * 0.35, deps.padding * 0.4))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letters = 'ABCDEFGHJKLMNOPQRST';
  const labelOffset = deps.padding * 0.5;
  for (let i = 0; i < state.size; i++) {
    const pos = deps.padding + i * deps.cellSize;
    ctx.fillText(letters[i], pos, labelOffset);
    ctx.fillText(letters[i], pos, deps.padding + (state.size - 1) * deps.cellSize + labelOffset);
    ctx.fillText(state.size - i, labelOffset, pos);
    ctx.fillText(state.size - i, deps.padding + (state.size - 1) * deps.cellSize + labelOffset, pos);
  }

  _bgCache = offscreen;
  _bgCacheKey = cacheKey;
  return offscreen;
}

export function updateHUD(state) {
  const normalizedState = {
    ...state,
    isAIThinking: !!state.isAIThinking && state.currentPlayer !== BLACK
  };

  const turnEl = document.getElementById('turnDisplay');
  if (normalizedState.gameOver) {
    turnEl.textContent = '遊戲結束';
    turnEl.className = 'current-turn';
  } else if (normalizedState.isAIThinking) {
    turnEl.textContent = '🤔 AI 思考中...';
    turnEl.className = 'current-turn';
  } else {
    turnEl.textContent = normalizedState.currentPlayer === BLACK ? '⚫ 黑方回合' : '⚪ 白方回合';
    turnEl.className = 'current-turn ' + (normalizedState.currentPlayer === BLACK ? 'black' : 'white');
  }

  document.getElementById('blackCaptures').textContent = normalizedState.captures[BLACK];
  document.getElementById('whiteCaptures').textContent = normalizedState.captures[WHITE];
  document.getElementById('moveCount').textContent = normalizedState.moveHistory.length;

  const mt = document.getElementById('mobileTurn');
  if (normalizedState.gameOver) {
    mt.textContent = '遊戲結束';
    mt.className = 'turn-badge';
  } else if (normalizedState.isAIThinking) {
    mt.textContent = '🤔 AI 思考中';
    mt.className = 'turn-badge';
  } else {
    mt.textContent = normalizedState.currentPlayer === BLACK ? '⚫ 黑方' : '⚪ 白方';
    mt.className = 'turn-badge ' + (normalizedState.currentPlayer === BLACK ? 'black' : 'white');
  }

  document.getElementById('mobileBlackCap').textContent = state.captures[BLACK];
  document.getElementById('mobileWhiteCap').textContent = state.captures[WHITE];
  document.getElementById('mobileMoveCount').textContent = state.moveHistory.length;
}

export function setStatus(message) {
  document.getElementById('statusMsg').textContent = message;
  document.getElementById('mobileStatus').textContent = message;
}

export function getStatusMessage(state, fallbackMessage = '') {
  if (fallbackMessage) return fallbackMessage;
  if (state.gameOver) return '遊戲結束 — 可覆盤或開始新局';
  if (state.isScoring) return '已自動估算死子，可點擊修正，然後確認結果';
  if (state.isReviewing) return '覆盤模式';
  if (state.isAIThinking) return '🤔 GnuGo 思考中...';
  return `${state.currentPlayer === BLACK ? '黑' : '白'}方回合`;
}

export function syncStatus(state, fallbackMessage = '') {
  setStatus(getStatusMessage(state, fallbackMessage));
}

export function updateReviewInfo(state) {
  const info = document.getElementById('reviewInfo');
  if (state.currentReviewMove === 0) {
    info.textContent = '開始位置';
    return;
  }

  const move = state.moveHistory[state.currentReviewMove - 1];
  const letters = 'ABCDEFGHJKLMNOPQRST';
  const moveStr = move.pass ? 'Pass' : `${letters[move.y]}${state.size - move.x}`;
  info.textContent = `第 ${state.currentReviewMove} 手 / ${state.moveHistory.length} - ${move.player === BLACK ? '⚫' : '⚪'} ${moveStr}`;
}

export function updateScoringDisplay(state, score) {
  document.getElementById('blackScore').textContent = score.black.toFixed(1);
  if (state.gameRules === 'japanese') {
    document.getElementById('blackScoreLabel').textContent = '　目+提子';
    document.getElementById('whiteScoreLabel').textContent = '　目+提子（含貼目）';
    document.getElementById('blackDetail').textContent = `目 ${score.blackTerritory} + 提子 ${score.blackStones}`;
    document.getElementById('whiteDetail').textContent = `目 ${score.whiteTerritory} + 提子 ${score.whiteStones} + 貼目 ${state.komi}`;
  } else {
    document.getElementById('blackScoreLabel').textContent = '　棋子+目';
    document.getElementById('whiteScoreLabel').textContent = '　棋子+目（含貼目）';
    document.getElementById('blackDetail').textContent = `${score.blackStones} + ${score.blackTerritory}`;
    document.getElementById('whiteDetail').textContent = `${score.whiteStones} + ${score.whiteTerritory} + ${state.komi}`;
  }

  document.getElementById('whiteScore').textContent = score.white.toFixed(1);
  const diff = score.black - score.white;
  document.getElementById('resultText').textContent = diff > 0
    ? `⚫ 黑勝 ${diff.toFixed(1)} 目`
    : diff < 0
    ? `⚪ 白勝 ${Math.abs(diff).toFixed(1)} 目`
    : '和棋';
}


export function resizeCanvas(deps, state) {
  const isMobile = window.innerWidth <= 900;
  let maxSize;
  if (isMobile) {
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 160;
    maxSize = Math.max(280, Math.min(maxW, maxH));
  } else {
    const panelWidth = 260;
    const maxW = window.innerWidth - panelWidth * 2 - 80;
    const maxH = window.innerHeight - 120;
    maxSize = Math.max(400, Math.min(maxW, maxH, 800));
  }
  const s = state.size - 1;
  const minPadding = Math.ceil((0.88 * maxSize + 16 * s) / (s + 1.76));
  deps.padding = Math.max(30, minPadding);
  const cellSize = Math.floor((maxSize - deps.padding * 2) / s);
  const canvasSize = cellSize * s + deps.padding * 2;
  deps.canvas.width = canvasSize;
  deps.canvas.height = canvasSize;
  deps.canvas.style.width = `${canvasSize}px`;
  deps.canvas.style.height = `${canvasSize}px`;
  return cellSize;
}

export function drawStone(deps, x, y, color, isDead) {
  const cx = deps.padding + y * deps.cellSize;
  const cy = deps.padding + x * deps.cellSize;
  const r = deps.cellSize * 0.44;
  const ctx = deps.ctx;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 2, r, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  if (color === BLACK) {
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#111');
  } else {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#ccc');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color === BLACK ? '#000' : '#aaa';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  if (isDead) {
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2.5;
    const d = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(cx - d, cy + d);
    ctx.stroke();
  }
}

export function drawBoard(deps, state) {
  // ——— Dirty-rect: only resize when the viewport or board size changed ———
  const layoutKey = _layoutKey(deps, state);
  if (layoutKey !== _lastCanvasKey) {
    deps.cellSize = resizeCanvas(deps, state);
    _lastCanvasKey = layoutKey;
    // Invalidate background cache whenever layout changes
    _bgCache = null;
    _bgCacheKey = '';
  }

  const ctx = deps.ctx;
  const canvas = deps.canvas;
  const w = canvas.width;

  ctx.drawImage(renderBoardBackground(deps, state), 0, 0);

  if (state.isScoring && state.scoreData) {
    for (let x = 0; x < state.size; x++) {
      for (let y = 0; y < state.size; y++) {
        if (state.displayBoard[x][y] === EMPTY && state.scoreData.territory[x][y] !== 0) {
          const cx = deps.padding + y * deps.cellSize;
          const cy = deps.padding + x * deps.cellSize;
          ctx.fillStyle = state.scoreData.territory[x][y] === BLACK ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)';
          ctx.fillRect(cx - deps.cellSize * 0.2, cy - deps.cellSize * 0.2, deps.cellSize * 0.4, deps.cellSize * 0.4);
        }
      }
    }
  }

  for (let x = 0; x < state.size; x++) {
    for (let y = 0; y < state.size; y++) {
      if (state.displayBoard[x][y] !== EMPTY) {
        drawStone(deps, x, y, state.displayBoard[x][y], state.deadStones.has(x * state.size + y));
      }
    }
  }

  if (state.emotionEnabled && !state.isScoring) {
    // Liberty count drawn directly with the canvas, not as emoji — colour-emoji
    // fonts render unreliably on canvas in mobile browsers (esp. iOS Safari),
    // so we render the气 count as a number tinted by danger level instead.
    const libertyMap = computeLibertyMap(state.displayBoard, state.size);
    const fontSize = Math.max(9, Math.min(deps.cellSize * 0.5, 18));
    ctx.save();
    ctx.font = `bold ${fontSize}px -apple-system,"Segoe UI",Roboto,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < state.size; x++) {
      for (let y = 0; y < state.size; y++) {
        const color = state.displayBoard[x][y];
        if (color === EMPTY) continue;
        const libs = libertyMap[x][y];
        // Danger-graded colour: red (atari) → orange → yellow → green (safe)
        ctx.fillStyle = libs === 1 ? '#ff5252' : libs === 2 ? '#ffa726'
          : libs === 3 ? '#ffee58' : '#69f0ae';
        const cx = deps.padding + y * deps.cellSize;
        const cy = deps.padding + x * deps.cellSize;
        // Subtle backing so the number stays legible on both stone colours
        ctx.shadowColor = color === BLACK ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 2;
        ctx.fillText(String(libs), cx, cy);
      }
    }
    ctx.restore();
  }

  if (state.lastMove) {
    const [lx, ly] = state.lastMove;
    if (state.displayBoard[lx][ly] !== EMPTY) {
      ctx.fillStyle = state.displayBoard[lx][ly] === BLACK ? '#fff' : '#000';
      ctx.beginPath();
      ctx.arc(deps.padding + ly * deps.cellSize, deps.padding + lx * deps.cellSize, deps.cellSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (state.showingHint && !state.gameOver && !state.isReviewing && !state.isScoring && !state.isAIThinking) {
    for (const [hx, hy] of state.captureHints || []) {
      const cx = deps.padding + hy * deps.cellSize;
      const cy = deps.padding + hx * deps.cellSize;
      ctx.save();
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, deps.cellSize * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff4444';
      ctx.font = `bold ${Math.max(10, deps.cellSize * 0.35)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, cy);
      ctx.restore();
    }
  }

  if (state.hoverPos && !state.gameOver && !state.isReviewing && !state.isScoring && !state.isAIThinking) {
    const [hx, hy] = state.hoverPos;
    if (state.board[hx][hy] === EMPTY) {
      ctx.globalAlpha = 0.4;
      drawStone(deps, hx, hy, state.currentPlayer, false);
      ctx.globalAlpha = 1.0;
    }
  }
}

export const GoUI = {
  updateHUD, setStatus, getStatusMessage, syncStatus, updateReviewInfo,
  updateScoringDisplay,
  resizeCanvas, drawStone, drawBoard
};
