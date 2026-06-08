/**
 * 水墨暈開動畫（WebGL，用 OGL）。
 *
 * 目前只做一項：進首頁時，「弈樂」標題以水墨滲入宣紙的方式浮現（需有毛筆圖；
 * 無圖時退回思源宋體文字標題 + CSS 淡入，見 title-data.js / style.css）。
 * 做法：把標題圖當 texture，用 fbm 噪聲場當「滲入門檻」，progress 0→1 時
 * 各處筆畫依噪聲值先後、以柔邊浮現 → 不規則的墨暈擴散感。
 *
 * 保險：prefers-reduced-motion 或 WebGL 不支援 → 直接顯示靜態 CSS 標題。
 * 動畫只在進入首頁時跑一次（約 1.3s），結束後移除 canvas、還原清晰的 CSS 標題、
 * 並釋放 WebGL context（不長駐、手機也省電）。
 */
import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';
import { TITLE_DATA_URI } from './title-data.js';

const TITLE_SRC = TITLE_DATA_URI; // base64 內嵌：不發外部請求，CDN 無法快取成 HTML（見 title-data.js）
const DURATION = 1300; // ms

const vertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform float uProgress;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)),
          c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec4 tex = texture2D(tMap, vUv);

    // 帶 alpha 的墨色透明圖：直接用 alpha 當筆畫遮罩（墨色已在 rgb）
    float baseA = tex.a;

    // 噪聲場決定暈開順序
    float field = fbm(vUv * 3.5) * 0.8 + fbm(vUv * 9.0 + uTime * 0.15) * 0.2;

    // progress 推進，依噪聲門檻以柔邊浮現；uProgress=1 時 p 超過上界，確保全部顯現
    float edge = 0.22;
    float p = mix(-edge, 1.0 + edge, uProgress);
    float reveal = smoothstep(field - edge, field + edge, p);

    gl_FragColor = vec4(tex.rgb, baseA * reveal);
  }
`;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (_) {
    return false;
  }
}

function prefersReducedMotion() {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

let _played = false;
let _active = null; // 目前進行中的動畫（{ cleanup }），用於重播前先收掉前一個

/**
 * 在標題元素上播放水墨暈開。
 * @param {HTMLElement} h1El  標題元素（CSS background-image 顯示書法圖者）
 * @param {{force?: boolean}} [opts] force=true 可重播
 */
export function playTitleReveal(h1El, opts = {}) {
  if (!h1El) return;

  const showStatic = () => { h1El.style.visibility = 'visible'; };

  // 無毛筆標題圖（已改用思源宋體文字標題）→ 不播圖揭示，直接顯示文字；
  // 質感由 style.css 的 CSS 淡入動畫負責。日後 inline 回毛筆圖即自動恢復 WebGL 揭示。
  if (!TITLE_SRC) { showStatic(); return; }

  // 先收掉前一個還在跑的動畫，避免重複 overlay 堆疊
  if (_active) { _active.cleanup(); _active = null; }

  // 分頁隱藏時 rAF 會暫停、動畫無法推進 → 直接顯示靜態，避免卡在隱藏
  if (prefersReducedMotion() || !hasWebGL() || document.hidden) { showStatic(); return; }
  if (_played && !opts.force) { showStatic(); return; }

  const rect = h1El.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) { showStatic(); return; }

  _played = true;

  const img = new Image();
  img.decoding = 'async';

  img.onerror = () => { showStatic(); };
  let started = false;
  img.onload = () => {
    if (started) return; // 避免快取補呼叫造成重複
    started = true;
    // 不再隱藏 <h1>：文字永遠是可見本體，水墨動畫只疊在上面當特效；
    // 就算圖載失敗 / 座標算錯 / 字型位移，標題文字都還在，不會消失。
    // 動畫當下重新量框（字型/版面此時通常已穩定，定位較準）。
    const r = h1El.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { showStatic(); return; }
    // 依 contain 規則算出圖在標題框內的實際顯示尺寸，避免 WebGL 把圖拉伸變形
    const iw = img.naturalWidth || 3;
    const ih = img.naturalHeight || 1;
    const scale = Math.min(r.width / iw, r.height / ih);
    const w = Math.round(iw * scale);
    const h = Math.round(ih * scale);
    const left = Math.round(r.left + (r.width - w) / 2);
    const top = Math.round(r.top + (r.height - h) / 2);

    let renderer;
    try {
      renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    } catch (_) {
      showStatic();
      return;
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    renderer.setSize(w, h);

    const canvas = gl.canvas;
    Object.assign(canvas.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${w}px`,
      height: `${h}px`,
      pointerEvents: 'none',
      zIndex: '60',
      // 覆蓋全域 canvas{} 規則（那是給對弈棋盤的圓角+描邊+陰影），否則會在標題旁出現一個框
      borderRadius: '0',
      boxShadow: 'none',
      background: 'transparent',
    });
    document.body.appendChild(canvas);

    const texture = new Texture(gl, {
      image: img,
      generateMipmaps: false,
      premultiplyAlpha: false,
    });

    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        tMap: { value: texture },
        uProgress: { value: 0 },
        uTime: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
    const start = performance.now();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      showStatic();
      canvas.remove();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      if (_active && _active.cleanup === cleanup) _active = null;
    };
    // 保險：不靠 rAF 的硬性收尾，避免分頁切走時 rAF 暫停導致標題卡在隱藏
    const safety = setTimeout(cleanup, DURATION + 600);
    _active = { cleanup };

    const frame = (t) => {
      if (done) return;
      const raw = Math.min(1, (t - start) / DURATION);
      program.uniforms.uProgress.value = easeOutCubic(raw);
      program.uniforms.uTime.value = (t - start) * 0.001;
      try {
        renderer.render({ scene: mesh });
      } catch (_) {
        cleanup();
        return;
      }
      if (raw < 1) requestAnimationFrame(frame);
      else cleanup();
    };
    requestAnimationFrame(frame);
  };

  // handler 設好之後才設 src，確保快取的圖也會觸發 onload
  img.src = TITLE_SRC;
  // 已快取時 onload 可能已錯過，手動補呼叫（onload 內有 started 去重）
  if (img.complete && img.naturalWidth) img.onload();
}

// ——— 共用噪聲 GLSL ———
const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)),
          c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
`;

/* ============================ 背景墨雲飄動 ============================ */

const BG_SRC = '/img/bg-light.webp';

const ambientFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform float uTime;
  uniform vec2 uCover;   // cover 縮放
  uniform vec2 uOffset;  // cover 置中位移
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 base = vUv * uCover + uOffset;          // 以 cover 方式鋪滿，不變形
    vec3 baseCol = texture2D(tMap, base).rgb;    // 未位移的原色
    float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));

    // 只讓「中灰的墨絲」流動；黑子(很暗)、白子/亮紙(很亮)都凍結 → 棋子不動、只有墨在動
    float flow = 1.0 - smoothstep(0.10, 0.34, abs(lum - 0.42));

    float t = uTime * 0.045;
    vec2 w1 = vec2(fbm(vUv * 2.2 + vec2(0.0, t)), fbm(vUv * 2.2 + vec2(t, 0.0)));
    vec2 w2 = vec2(fbm(vUv * 2.2 + 3.5 * w1 + vec2(1.7, 9.2)),
                   fbm(vUv * 2.2 + 3.5 * w1 + vec2(8.3, 2.8)));
    float warpAmt = 0.055 * flow;                 // 只位移墨絲
    vec3 col = texture2D(tMap, base + (w2 - 0.5) * warpAmt).rgb;
    gl_FragColor = vec4(col, 1.0);
  }
`;

let _ambient = null;

/** 啟動背景墨雲飄動（桌機；行動裝置/reduced-motion/無 WebGL 則維持靜態 CSS 背景）。 */
export function startAmbient() {
  if (_ambient) return;
  if (prefersReducedMotion() || !hasWebGL()) return;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const narrow = window.matchMedia?.('(max-width: 900px)')?.matches;
  if (coarse || narrow) return; // 省電：行動裝置用靜態背景

  const img = new Image();
  let started = false;
  img.onerror = () => {};
  img.onload = () => {
    if (started) return;
    started = true;

    let renderer;
    try {
      renderer = new Renderer({ alpha: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5) });
    } catch (_) { return; }
    const gl = renderer.gl;
    const canvas = gl.canvas;
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      zIndex: '-1', pointerEvents: 'none', borderRadius: '0', boxShadow: 'none', background: 'transparent',
    });
    document.body.prepend(canvas);
    // 改由 WebGL 畫背景（CSS 純色底仍在後面當 fallback）
    document.body.style.setProperty('--bg-app-image', 'none');

    const texture = new Texture(gl, {
      image: img, generateMipmaps: false,
      wrapS: gl.MIRRORED_REPEAT, wrapT: gl.MIRRORED_REPEAT,
    });
    const program = new Program(gl, {
      vertex, fragment: ambientFrag,
      uniforms: { tMap: { value: texture }, uTime: { value: 0 }, uCover: { value: [1, 1] }, uOffset: { value: [0, 0] } },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      const cw = canvas.width, ch = canvas.height;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const car = cw / ch, iar = iw / ih;
      let sx = 1, sy = 1;
      if (car > iar) sy = iar / car; else sx = car / iar;
      program.uniforms.uCover.value = [sx, sy];
      program.uniforms.uOffset.value = [(1 - sx) / 2, (1 - sy) / 2];
    };
    window.addEventListener('resize', resize);
    resize();
    try { renderer.render({ scene: mesh }); } catch (_) {} // 先畫一幀，避免黑邊閃爍

    const FPS = 30, frameMs = 1000 / FPS;
    let last = 0, raf = null;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < frameMs) return;
      last = t;
      program.uniforms.uTime.value = t * 0.001;
      try { renderer.render({ scene: mesh }); } catch (_) {}
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
      else if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
    });
    _ambient = { canvas };
  };
  img.src = BG_SRC;
  if (img.complete && img.naturalWidth) img.onload();
}

/* ============================ 切換畫面墨暈過渡 ============================ */

const TRANS_DURATION = 880; // ms
const transitionFrag = /* glsl */ `
  precision highp float;
  uniform float uProgress;  // 0→1
  uniform vec3 uInk;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    // 覆蓋度：0→1→0（中點全墨），swap 在中點發生
    float cover = uProgress < 0.5
      ? smoothstep(0.0, 0.5, uProgress)
      : 1.0 - smoothstep(0.5, 1.0, uProgress);
    // 墨漬從畫面下緣往上漫（加一點方向性，比純噪聲更像潑墨）
    float n = fbm(vUv * 3.0) * 0.6 + fbm(vUv * 8.0) * 0.2 + (1.0 - vUv.y) * 0.2;
    float m = smoothstep(n - 0.32, n + 0.10, cover * 1.7 - 0.35); // 較硬的墨鋒
    // 濃淡紋理的近黑墨色
    vec3 ink = uInk + 0.018 * fbm(vUv * 6.0 + 3.0);
    gl_FragColor = vec4(ink, clamp(m, 0.0, 1.0));
  }
`;

let _transitioning = false;

/**
 * 以墨暈覆蓋播放畫面切換：覆蓋到中點時呼叫 swapFn 換 DOM，再退開。
 * 保證 swapFn 一定會被呼叫（即使 WebGL 失敗或分頁隱藏）。
 */
export function playTransition(swapFn) {
  if (typeof swapFn !== 'function') return;
  if (_transitioning || prefersReducedMotion() || !hasWebGL() || document.hidden) {
    swapFn();
    return;
  }
  _transitioning = true;

  let renderer;
  try {
    renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio || 1, 1.5) });
  } catch (_) { _transitioning = false; swapFn(); return; }
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const canvas = gl.canvas;
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '9999', pointerEvents: 'none', borderRadius: '0', boxShadow: 'none', background: 'transparent',
  });
  document.body.appendChild(canvas);

  const program = new Program(gl, {
    vertex, fragment: transitionFrag, transparent: true,
    uniforms: { uProgress: { value: 0 }, uInk: { value: [0.02, 0.016, 0.012] } },
  });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

  let swapped = false;
  const doSwap = () => { if (swapped) return; swapped = true; try { swapFn(); } catch (_) {} };
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(safetySwap);
    clearTimeout(safetyEnd);
    doSwap(); // 保底：確保有換頁
    canvas.remove();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    _transitioning = false;
  };
  // 不靠 rAF 的保底：中點換頁、結束收尾
  const safetySwap = setTimeout(doSwap, TRANS_DURATION * 0.5);
  const safetyEnd = setTimeout(finish, TRANS_DURATION + 250);

  const start = performance.now();
  const frame = (t) => {
    if (done) return;
    const p = Math.min(1, (t - start) / TRANS_DURATION);
    program.uniforms.uProgress.value = p;
    if (p >= 0.5) doSwap();
    try { renderer.render({ scene: mesh }); } catch (_) { finish(); return; }
    if (p < 1) requestAnimationFrame(frame);
    else finish();
  };
  requestAnimationFrame(frame);
}

export const InkFx = { playTitleReveal, startAmbient, playTransition };
