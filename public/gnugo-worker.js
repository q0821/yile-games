// Web Worker for GnuGo AI engine.
// Runs GnuGo WASM off the main thread so UI stays responsive during AI moves.
// Communication via postMessage: { type, id, payload } / { type, id, ...result }

importScripts('/gnugo-loader.js');

let gnugoModule = null;

self.onmessage = function (e) {
  const { type, id, payload } = e.data;

  if (type === 'init') {
    const wasmUrl = payload.wasmUrl;
    fetch(wasmUrl)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to fetch WASM: ${r.status}`);
        return r.arrayBuffer();
      })
      .then(bytes => {
        const Module = {};
        Module.wasmBinary = new Uint8Array(bytes);
        Module.locateFile = (path) => (path === 'gnugo.wasm' ? wasmUrl : path);
        GnuGoLoader.init(Module);
        gnugoModule = Module;
        self.postMessage({ type: 'ready', id });
      })
      .catch(err => {
        self.postMessage({ type: 'error', id, message: err.message });
      });
    return;
  }

  if (type === 'play') {
    if (!gnugoModule) {
      self.postMessage({ type: 'error', id, message: 'GnuGo not ready' });
      return;
    }
    try {
      const raw = gnugoModule.ccall(
        'play', 'string', ['number', 'string'],
        [payload.level, payload.sgf]
      );
      self.postMessage({ type: 'result', id, raw });
    } catch (err) {
      self.postMessage({ type: 'error', id, message: err.message });
    }
    return;
  }

  self.postMessage({ type: 'error', id, message: `Unknown message type: ${type}` });
};
