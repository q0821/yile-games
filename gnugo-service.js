// GnuGoService — communicates with GnuGo running inside a Web Worker.
// All AI calls are async; the worker processes WASM off the main thread.

const LETTERS = 'abcdefghijklmnopqrs';
const INIT_TIMEOUT_MS = 60000; // 60s to load 6.9MB WASM

let _worker = null;
let _workerReady = false;
let _workerLoadingPromise = null;
let _pendingCalls = new Map(); // id → { resolve, reject }
let _nextId = 1;

function _getWorker() {
  if (_worker) return _worker;
  _worker = new Worker('/gnugo-worker.js');
  _worker.onmessage = function (e) {
    const { type, id, raw, message } = e.data;
    if (type === 'ready') {
      _workerReady = true;
      const p = _pendingCalls.get(id);
      if (p) { _pendingCalls.delete(id); p.resolve(); }
      return;
    }
    if (type === 'result') {
      const p = _pendingCalls.get(id);
      if (p) { _pendingCalls.delete(id); p.resolve(raw); }
      return;
    }
    if (type === 'error') {
      const p = _pendingCalls.get(id);
      if (p) { _pendingCalls.delete(id); p.reject(new Error(message)); }
      return;
    }
  };
  _worker.onerror = function (e) {
    console.error('GnuGo worker error:', e);
    const err = new Error(e.message || 'Worker failed to load');
    for (const [, p] of _pendingCalls.entries()) {
      p.reject(err);
    }
    _pendingCalls.clear();
    _workerLoadingPromise = null;
    _workerReady = false;
    _worker = null;
  };
  return _worker;
}

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

export function buildSGFUpTo(moveHistory, size, komi, count) {
  return buildSGF(moveHistory.slice(0, count), size, komi);
}

/** Convert a [row, col] move to SGF coordinate string, e.g. "dc". */
export function moveToSgfCoord(move) {
  return LETTERS[move[1]] + LETTERS[move[0]];
}

/** Append extra SGF move tokens to an existing SGF string (removes trailing ')' first). */
export function appendToSgf(sgf, tokens) {
  return sgf.slice(0, -1) + tokens.join('') + ')';
}

export function parseMoveFromSgfResponse(sgfResponse, expectedMoveCount, size) {
  const expected = expectedMoveCount ?? 0;
  const movePattern = /;([BW])\[([a-s]{0,2})\]/g;
  const allMoves = [];
  let match;

  while ((match = movePattern.exec(sgfResponse)) !== null) {
    allMoves.push({ color: match[1], coord: match[2] });
  }

  if (allMoves.length <= expected) return null;

  const gnugoMove = allMoves[allMoves.length - 1];
  if (!gnugoMove.coord || gnugoMove.coord.length < 2) return null;

  const col = LETTERS.indexOf(gnugoMove.coord[0]);
  const row = LETTERS.indexOf(gnugoMove.coord[1]);
  if (col < 0 || row < 0 || col >= size || row >= size) return null;

  return [row, col];
}

// ——— Initialisation ———

export function ensureReady(setStatus) {
  if (_workerReady) return Promise.resolve();
  if (_workerLoadingPromise) return _workerLoadingPromise;

  const notify = typeof setStatus === 'function' ? setStatus : () => {};
  notify('⏳ 載入 GnuGo AI 引擎...');

  const id = _nextId++;
  const worker = _getWorker();

  _workerLoadingPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (_pendingCalls.has(id)) {
        _pendingCalls.delete(id);
        _workerLoadingPromise = null;
        _workerReady = false;
        if (_worker) { _worker.terminate(); _worker = null; }
        notify('⚠️ AI 引擎載入逾時，請重新整理頁面');
        reject(new Error('GnuGo init timed out'));
      }
    }, INIT_TIMEOUT_MS);

    _pendingCalls.set(id, {
      resolve: () => {
        clearTimeout(timeoutId);
        const statusEl = typeof document !== 'undefined' ? document.getElementById('statusMsg') : null;
        const currentStatus = statusEl?.textContent?.trim() || '';
        const safeToOverwrite = !currentStatus
          || currentStatus === '請開始新遊戲'
          || currentStatus === '⏳ 載入 GnuGo AI 引擎...'
          || currentStatus.startsWith('已恢復棋局');
        if (safeToOverwrite) notify('GnuGo AI 引擎載入完成！');
        resolve();
      },
      reject: (err) => {
        clearTimeout(timeoutId);
        _workerLoadingPromise = null;
        notify('⚠️ AI 引擎載入失敗，請確認 gnugo.wasm 檔案存在');
        reject(err);
      }
    });
  });

  worker.postMessage({ type: 'init', id, payload: { wasmUrl: '/gnugo.wasm' } });
  return _workerLoadingPromise;
}

export function isReady() {
  return _workerReady;
}

// ——— Cache ———

const _playCache = new Map();
const _PLAY_CACHE_MAX = 60;

export function clearPlayCache() {
  _playCache.clear();
}

// ——— Core async play ———

/** Returns Promise<{ raw: string, move: [row, col] | null }> */
export function play(level, sgf, expectedMoveCount, size) {
  const cacheKey = `${level}::${sgf}`;
  if (_playCache.has(cacheKey)) {
    const cached = _playCache.get(cacheKey);
    return Promise.resolve({
      raw: cached.raw,
      move: parseMoveFromSgfResponse(cached.raw, expectedMoveCount, size)
    });
  }

  if (!_workerReady) {
    return Promise.reject(new Error('GnuGo not ready'));
  }

  const id = _nextId++;
  return new Promise((resolve, reject) => {
    _pendingCalls.set(id, {
      resolve: (raw) => {
        if (_playCache.size >= _PLAY_CACHE_MAX) {
          _playCache.delete(_playCache.keys().next().value);
        }
        _playCache.set(cacheKey, { raw });
        resolve({ raw, move: parseMoveFromSgfResponse(raw, expectedMoveCount, size) });
      },
      reject
    });
    _getWorker().postMessage({ type: 'play', id, payload: { level, sgf } });
  });
}

// ——— High-level helpers (all async) ———

export async function getTopMoves(moveHistory, size, komi, currentPlayer, count) {
  const hints = [];
  const sgfBase = buildSGF(moveHistory, size, komi);
  const firstResult = await play(10, sgfBase, moveHistory.length, size);
  const first = firstResult.move;
  if (!first) return hints;

  const color = currentPlayer === 1 ? 'B' : 'W';
  const oppColor = currentPlayer === 1 ? 'W' : 'B';

  hints.push(first);

  const sgfForSecond = appendToSgf(sgfBase, [
    `;${color}[${moveToSgfCoord(first)}]`,
    `;${oppColor}[]`
  ]);
  const secondResult = await play(10, sgfForSecond, moveHistory.length + 2, size);
  const second = secondResult.move;
  if (second && (second[0] !== first[0] || second[1] !== first[1])) {
    hints.push(second);
  }

  if (count >= 3 && hints.length >= 2) {
    const secondMove = hints[1];
    const sgfForThird = appendToSgf(sgfBase, [
      `;${color}[${moveToSgfCoord(first)}]`,
      `;${oppColor}[]`,
      `;${color}[${moveToSgfCoord(secondMove)}]`,
      `;${oppColor}[]`
    ]);
    const thirdResult = await play(10, sgfForThird, moveHistory.length + 4, size);
    const third = thirdResult.move;
    if (third && !hints.some(m => m[0] === third[0] && m[1] === third[1])) {
      hints.push(third);
    }
  }

  return hints.slice(0, count);
}

export const GnuGoService = {
  ensureReady, isReady, buildSGF, buildSGFUpTo, appendToSgf,
  moveToSgfCoord, parseMoveFromSgfResponse, play, clearPlayCache, getTopMoves
};
