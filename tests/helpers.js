/**
 * Test helpers: load ES6 modules into a vm sandbox for use in Node.js tests.
 *
 * Since the source files now use ES6 import/export, we use Babel to
 * transpile them to CJS before executing in the vm context.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..');

const BABEL_OPTS = {
  presets: [['@babel/preset-env', {
    targets: { node: 'current' },
    modules: 'commonjs'
  }]],
  babelrc: false,
  configFile: false
};

/** Transpile a file from ES6 → CJS. */
function transpile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  return babel.transformSync(code, { ...BABEL_OPTS, filename: filePath }).code;
}

/**
 * A tiny require() that:
 *  - resolves local files relative to ROOT, transpiles them, and runs them
 *    in the shared vm context.
 *  - caches results so each file is loaded only once per sandbox.
 */
function makeRequire(ctx, cache) {
  function localRequire(id) {
    if (cache[id] !== undefined) return cache[id];

    // Relative imports → resolve from ROOT
    if (!id.startsWith('.') && !id.startsWith('/')) {
      throw new Error(`require('${id}') not supported in sandbox`);
    }
    const filePath = require.resolve(path.resolve(ROOT, id));

    // Create a fresh exports object, expose it as module+exports in the context,
    // then execute the transpiled code.
    const modExports = {};
    cache[id] = modExports; // set before running to handle circular deps

    const cjs = transpile(filePath);
    const script = new vm.Script(
      `(function(require, module, exports){ ${cjs} })(localRequire, localModule, localModule.exports);`
    );
    ctx.localRequire = localRequire;
    ctx.localModule = { exports: modExports };
    script.runInContext(ctx);

    // Copy whatever was placed on module.exports back
    Object.assign(modExports, ctx.localModule.exports);
    cache[id] = modExports;
    return modExports;
  }
  return localRequire;
}

function createSandbox(extraGlobals = {}) {
  const cache = {};
  const ctx = vm.createContext({
    // Minimal browser-like globals
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {} }),
      querySelector: () => null
    },
    window: null,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, Array, Object, Set, Map, JSON, Promise,
    requestAnimationFrame: (fn) => { fn(0); return 0; },
    // Stubs for missing properties
    localRequire: null,
    localModule: null,
    ...extraGlobals
  });
  ctx.window = ctx;
  ctx.localRequire = makeRequire(ctx, cache);
  return { ctx, localRequire: ctx.localRequire };
}

/**
 * Load a source file into a sandbox context and return its exports merged
 * into the context object (for convenience: ctx.GoRules etc.).
 */
function loadIntoContext(ctx, localRequire, relPath) {
  const exports = localRequire(relPath);
  // Expose named exports directly on ctx so tests can do ctx.GoRules etc.
  for (const [k, v] of Object.entries(exports)) {
    if (k !== '__esModule') ctx[k] = v;
  }
  return exports;
}

/** Returns a sandbox with GoRules loaded. */
function sandboxWithRules() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './rules.js');
  return ctx;
}

/** Returns a sandbox with GoRules + GameState loaded. */
function sandboxWithGameState() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './rules.js');
  loadIntoContext(ctx, localRequire, './game-state.js');
  return ctx;
}

/** Returns a sandbox with GoRules + GoHints loaded. */
function sandboxWithHints() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './rules.js');
  loadIntoContext(ctx, localRequire, './hints.js');
  return ctx;
}

/** Returns a sandbox with GoTimer loaded (no DOM needed for pure functions). */
function sandboxWithTimer() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './timer.js');
  return ctx;
}

/** Returns a sandbox with GoRules + Tsumego loaded. */
function sandboxWithTsumego() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './rules.js');
  loadIntoContext(ctx, localRequire, './tsumego.js');
  return ctx;
}

/** Returns a sandbox with TsumegoProgress loaded (pure reducers; no DOM needed). */
function sandboxWithTsumegoProgress() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './tsumego-progress.js');
  return ctx;
}

/** Returns a sandbox with GoRules + GoReview loaded. */
function sandboxWithReview() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './rules.js');
  loadIntoContext(ctx, localRequire, './review.js');
  return ctx;
}

/** Returns a sandbox with AdaptiveDifficulty loaded (pure logic; no DOM needed). */
function sandboxWithAdaptive() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './adaptive-difficulty.js');
  return ctx;
}

/** Returns a sandbox with AdaptiveChess loaded (pure logic; no DOM needed). */
function sandboxWithAdaptiveChess() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './adaptive-chess.js');
  return ctx;
}

/** Returns a sandbox with Gomoku rules + AI loaded (pure logic; no DOM needed). */
function sandboxWithGomoku() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './rules.js');
  loadIntoContext(ctx, localRequire, './gomoku-rules.js');
  loadIntoContext(ctx, localRequire, './gomoku-ai.js');
  return ctx;
}

/** Returns a sandbox with Othello rules + AI loaded (pure logic; no DOM needed). */
function sandboxWithOthello() {
  const { ctx, localRequire } = createSandbox();
  loadIntoContext(ctx, localRequire, './rules.js');
  loadIntoContext(ctx, localRequire, './othello-rules.js');
  loadIntoContext(ctx, localRequire, './othello-ai.js');
  return ctx;
}

/** 極簡 in-memory localStorage mock（audio-manager 測試用）。 */
function createMockLocalStorage() {
  let store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
}

/** 極簡 document mock：支援 addEventListener/removeEventListener/dispatchEvent（audio-manager 需要監聽解鎖手勢與 visibilitychange）。 */
function createMockDocumentForAudio() {
  const listeners = {};
  return {
    getElementById: () => null,
    createElement: () => ({ style: {} }),
    querySelector: () => null,
    visibilityState: 'visible',
    addEventListener(type, fn, opts) {
      const entry = { fn, once: !!(opts && opts.once) };
      (listeners[type] = listeners[type] || []).push(entry);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((entry) => entry.fn !== fn);
    },
    dispatchEvent(evt) {
      const entries = (listeners[evt.type] || []).slice();
      for (const entry of entries) {
        entry.fn(evt);
        if (entry.once) {
          listeners[evt.type] = (listeners[evt.type] || []).filter((e) => e !== entry);
        }
      }
      return true;
    }
  };
}

/** 極簡 CustomEvent polyfill（vm context 沒有瀏覽器內建的 CustomEvent）。 */
class MockCustomEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.detail = opts ? opts.detail : undefined;
  }
}

/**
 * Returns a sandbox with AudioManager loaded, plus mock localStorage/document/CustomEvent
 * so audio-manager.js's設定持久化與事件廣播邏輯可在 node（無 jsdom）下測試。
 * 呼叫端可用回傳的 ctx.localStorage / ctx.document 直接檢查/操作 mock 狀態。
 */
function sandboxWithAudioManager() {
  const localStorage = createMockLocalStorage();
  const document = createMockDocumentForAudio();
  const { ctx, localRequire } = createSandbox({
    localStorage,
    document,
    CustomEvent: MockCustomEvent,
    navigator: {}
  });
  loadIntoContext(ctx, localRequire, './sound.js'); // 先曝露 GoSound，方便測試 spy fallback 呼叫
  loadIntoContext(ctx, localRequire, './audio-manager.js');
  ctx.localStorage = localStorage;
  return ctx;
}

module.exports = { sandboxWithRules, sandboxWithGameState, sandboxWithHints, sandboxWithTimer, sandboxWithTsumego, sandboxWithTsumegoProgress, sandboxWithReview, sandboxWithAdaptive, sandboxWithAdaptiveChess, sandboxWithGomoku, sandboxWithOthello, sandboxWithAudioManager };
