/**
 * Test helpers: load browser IIFE modules into a vm sandbox so they work
 * in Node.js without a real DOM.  Each file does (function(global){...})(window),
 * so we create a context where `window` === the context object itself.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function createSandbox() {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  return ctx;
}

function loadFile(ctx, file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(code, ctx);
}

/** Returns a sandbox with GoRules loaded. */
function sandboxWithRules() {
  const ctx = createSandbox();
  loadFile(ctx, 'rules.js');
  return ctx;
}

/** Returns a sandbox with GoRules + GameState loaded. */
function sandboxWithGameState() {
  const ctx = createSandbox();
  loadFile(ctx, 'rules.js');
  loadFile(ctx, 'game-state.js');
  return ctx;
}

/** Returns a sandbox with GoRules + GoHints loaded. */
function sandboxWithHints() {
  const ctx = createSandbox();
  loadFile(ctx, 'rules.js');
  loadFile(ctx, 'hints.js');
  return ctx;
}

/** Returns a sandbox with GoTimer loaded (no DOM needed for pure functions). */
function sandboxWithTimer() {
  const ctx = createSandbox();
  loadFile(ctx, 'timer.js');
  return ctx;
}

module.exports = { sandboxWithRules, sandboxWithGameState, sandboxWithHints, sandboxWithTimer };
