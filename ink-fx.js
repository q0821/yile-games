/**
 * 水墨暈開動畫（WebGL，用 OGL）。
 *
 * 目前只做一項：進首頁時，「圍棋對弈」標題以水墨滲入宣紙的方式浮現。
 * 做法：把標題圖當 texture，用 fbm 噪聲場當「滲入門檻」，progress 0→1 時
 * 各處筆畫依噪聲值先後、以柔邊浮現 → 不規則的墨暈擴散感。
 *
 * 保險：prefers-reduced-motion 或 WebGL 不支援 → 直接顯示靜態 CSS 標題。
 * 動畫只在進入首頁時跑一次（約 1.3s），結束後移除 canvas、還原清晰的 CSS 標題、
 * 並釋放 WebGL context（不長駐、手機也省電）。
 */
import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';

const TITLE_SRC = 'img/title-weiqi.webp';
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

    // 清掉 WebP 有損壓縮在「透明區」殘留的微弱 alpha 雜訊，否則會畫出一個矩形霧框
    float baseA = smoothstep(0.05, 0.20, tex.a);

    // 兩個尺度的噪聲：大尺度決定暈開順序，小尺度+微動讓邊緣有濕墨抖動
    float field = fbm(vUv * 3.5) * 0.8 + fbm(vUv * 9.0 + uTime * 0.15) * 0.2;

    // progress 推進，依噪聲門檻以柔邊浮現；uProgress=1 時 p 超過上界，確保全部顯現
    float edge = 0.22;
    float p = mix(-edge, 1.0 + edge, uProgress);
    float reveal = smoothstep(field - edge, field + edge, p);

    // 濕墨前緣：正在浮現的交界處稍微加深，模擬墨在紙上聚集的邊
    float front = reveal * (1.0 - reveal) * 4.0;
    vec3 col = tex.rgb * (1.0 + front * 0.25);

    gl_FragColor = vec4(col, baseA * reveal);
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

  // 先收掉前一個還在跑的動畫，避免重複 overlay 堆疊
  if (_active) { _active.cleanup(); _active = null; }

  // 分頁隱藏時 rAF 會暫停、動畫無法推進 → 直接顯示靜態，避免卡在隱藏
  if (prefersReducedMotion() || !hasWebGL() || document.hidden) { showStatic(); return; }
  if (_played && !opts.force) { showStatic(); return; }

  const rect = h1El.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) { showStatic(); return; }

  _played = true;
  h1El.style.visibility = 'hidden'; // 動畫期間用 canvas 取代靜態標題

  const img = new Image();
  img.decoding = 'async';
  img.src = TITLE_SRC;

  img.onerror = () => { showStatic(); };
  img.onload = () => {
    // 依 contain 規則算出圖在標題框內的實際顯示尺寸，避免 WebGL 把圖拉伸變形
    const iw = img.naturalWidth || 3;
    const ih = img.naturalHeight || 1;
    const scale = Math.min(rect.width / iw, rect.height / ih);
    const w = Math.round(iw * scale);
    const h = Math.round(ih * scale);
    const left = Math.round(rect.left + (rect.width - w) / 2);
    const top = Math.round(rect.top + (rect.height - h) / 2);

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
}

export const InkFx = { playTitleReveal };
