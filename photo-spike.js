// 拍照數子 Spike B：OpenCV.js 辨識管線（透視校正＋交叉點分類）。
// 這是 throwaway 驗證頁，不進正式 bundle，見 docs/PRD-photo-scoring.md「可行性驗證」段落。
//
// 管線六步（對應 brief）：
//   1. 載圖（spike-photos 全集 / spike-photos-real / 手動選檔）
//   2. 盤面四角偵測（灰階→模糊→Canny/adaptiveThreshold→findContours→四邊形→排序四角）
//   3. 透視校正（getPerspectiveTransform + warpPerspective → 正方形工作影像）
//   4. 格線定位（水平/垂直投影找等距峰值；自動判定 13 或 19 路，非其一則失敗）
//   5. 交叉點分類（k-means 依亮度+飽和度分 黑/空/白 三群，標準差作反光二次判斷）
//   6. 結果 UI（疊圖、與 truth 比對、全集總結表）
//
// 所有可調閾值集中在 DEFAULT_CONFIG，頁面 textarea 可即時編輯重跑。

// ————————————————————————————————————————————————————————————————
// Config（唯一閾值來源）
// ————————————————————————————————————————————————————————————————
const DEFAULT_CONFIG = {
  // 透視校正
  warpSize: 760, // 校正後正方形工作影像邊長 (px)

  // 四角偵測
  blurKernel: 5, // 高斯模糊核大小（奇數）
  useCanny: true, // true=Canny 邊緣, false=adaptiveThreshold 二值化
  cannyLow: 40,
  cannyHigh: 120,
  dilateIter: 1, // Canny 後膨脹次數（補齊邊緣缺口）
  adaptiveBlockSize: 25, // adaptiveThreshold 用（useCanny=false 時）
  adaptiveC: 10,
  approxEpsilonRatio: 0.02, // approxPolyDP epsilon = ratio * 輪廓周長
  minBoardAreaRatio: 0.15, // 候選輪廓最小面積 = ratio * 整張影像面積
  useConvexHull: true, // 先取凸包再 approxPolyDP，濾掉邊緣小鋸齒造成的非凸候選

  // 格線定位（投影法，自動判定路數）
  gridSizes: [13, 19], // 允許的路數，其他數量視為判定失敗
  gridSizeTolerance: 2, // 偵測線數與 13/19 的容許誤差（13/19 相差 6，容許 2 不會混淆兩者）
  centerCropRatio: 0.8, // 只在中央 80% 區域做投影（避開紙盤外緣座標字／廠商文字）
  projSmoothWindow: 5, // 投影曲線移動平均視窗（奇數）
  peakThresholdStdMul: 0.6, // 峰值門檻 = 平均值 + 此倍數 * 標準差
  peakMinDistanceDivisor: 30, // 非極大值抑制最小間距 = 裁切區間長度 / 此值

  // 交叉點分類
  sampleRadiusRatio: 0.38, // 取樣半徑 = ratio * 格距
  stoneStdThreshold: 22, // 樣本標準差高於此值視為「疑似棋子表面反光/漸層」
};

let CONFIG = cloneConfig(DEFAULT_CONFIG);

function cloneConfig(c) {
  return JSON.parse(JSON.stringify(c));
}

// ————————————————————————————————————————————————————————————————
// DOM refs
// ————————————————————————————————————————————————————————————————
const cvStatusEl = document.getElementById('cvStatus');
const statusEl = document.getElementById('status');
const loadSetBtn = document.getElementById('loadSetBtn');
const loadRealSetBtn = document.getElementById('loadRealSetBtn');
const filePicker = document.getElementById('filePicker');
const configText = document.getElementById('configText');
const applyConfigBtn = document.getElementById('applyConfigBtn');
const resetConfigBtn = document.getElementById('resetConfigBtn');
const summaryEl = document.getElementById('summaryTable');
const galleryEl = document.getElementById('gallery');

function setStatus(msg) {
  statusEl.textContent = msg;
}

renderConfigTextarea();
function renderConfigTextarea() {
  configText.value = JSON.stringify(CONFIG, null, 2);
}

// ————————————————————————————————————————————————————————————————
// OpenCV.js 就緒等待
// ————————————————————————————————————————————————————————————————
function waitForCv(timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tryHook = () => {
      if (window.cv && window.cv.Mat) {
        resolve();
        return;
      }
      if (window.cv && !window.cv.Mat) {
        // Module 物件已存在，等待 wasm runtime 初始化完成
        window.cv['onRuntimeInitialized'] = () => resolve();
        return;
      }
      if (performance.now() - start > timeoutMs) {
        reject(new Error('opencv.js 逾時未載入（請確認專案根目錄有 opencv.js，見頁面上方指令）'));
        return;
      }
      setTimeout(tryHook, 40);
    };
    tryHook();
  });
}

waitForCv()
  .then(() => {
    cvStatusEl.textContent = 'OpenCV.js 已就緒，可以載入照片。';
    loadSetBtn.disabled = false;
    loadRealSetBtn.disabled = false;
    filePicker.disabled = false;
  })
  .catch((err) => {
    cvStatusEl.textContent = 'OpenCV.js 載入失敗：' + err.message;
    cvStatusEl.classList.add('msg-fail');
  });

// ————————————————————————————————————————————————————————————————
// 載圖
// ————————————————————————————————————————————————————————————————
let currentEntries = [];
let currentResults = [];

function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片載入失敗：' + url));
    img.src = url;
  });
}

async function loadSpikePhotosSet() {
  setStatus('讀取 spike-photos/manifest.json…');
  try {
    const res = await fetch('/spike-photos/manifest.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const manifest = await res.json();
    const entries = [];
    for (const p of manifest.photos) {
      const img = await loadImageFromURL(`/spike-photos/${p.file}`);
      let truth = null;
      try {
        const tRes = await fetch(`/spike-photos/${p.truth}`);
        if (tRes.ok) truth = await tRes.json();
      } catch (e) {
        /* 無 truth 也繼續 */
      }
      entries.push({ name: p.file, imgEl: img, truth });
    }
    await runPipeline(entries);
  } catch (err) {
    setStatus('載入 spike-photos 全集失敗：' + err.message);
  }
}

async function loadRealPhotosSet() {
  setStatus('嘗試讀取 spike-photos-real/manifest.json…');
  try {
    const res = await fetch('/spike-photos-real/manifest.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const manifest = await res.json();
    const entries = [];
    for (const p of manifest.photos) {
      const img = await loadImageFromURL(`/spike-photos-real/${p.file}`);
      let truth = null;
      if (p.truth) {
        try {
          const tRes = await fetch(`/spike-photos-real/${p.truth}`);
          if (tRes.ok) truth = await tRes.json();
        } catch (e) {
          /* 無 truth 也繼續 */
        }
      }
      entries.push({ name: p.file, imgEl: img, truth });
    }
    await runPipeline(entries);
  } catch (err) {
    setStatus(
      `spike-photos-real/manifest.json 不存在或讀取失敗（${err.message}）——` +
        '該資料夾目前沒有 manifest，請改用上方「選擇圖片檔案」手動選取（無 truth，僅顯示辨識結果，不計分）。'
    );
  }
}

filePicker.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  setStatus(`讀取 ${files.length} 個手動選取的檔案…`);
  const entries = [];
  for (const f of files) {
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImageFromURL(url);
      entries.push({ name: f.name, imgEl: img, truth: null });
    } catch (err) {
      console.error(err);
    }
  }
  await runPipeline(entries);
});

loadSetBtn.addEventListener('click', loadSpikePhotosSet);
loadRealSetBtn.addEventListener('click', loadRealPhotosSet);

// ————————————————————————————————————————————————————————————————
// Config UI
// ————————————————————————————————————————————————————————————————
applyConfigBtn.addEventListener('click', async () => {
  try {
    CONFIG = JSON.parse(configText.value);
  } catch (err) {
    setStatus('Config JSON 解析失敗：' + err.message);
    return;
  }
  if (currentEntries.length) {
    await runPipeline(currentEntries);
  } else {
    setStatus('Config 已套用（尚無已載入照片可重跑）。');
  }
});

resetConfigBtn.addEventListener('click', async () => {
  CONFIG = cloneConfig(DEFAULT_CONFIG);
  renderConfigTextarea();
  if (currentEntries.length) await runPipeline(currentEntries);
});

// ————————————————————————————————————————————————————————————————
// 管線主流程
// ————————————————————————————————————————————————————————————————
async function runPipeline(entries) {
  currentEntries = entries;
  currentResults = [];
  galleryEl.innerHTML = '';
  for (let i = 0; i < entries.length; i++) {
    setStatus(`處理中…（${i + 1}/${entries.length}）${entries[i].name}`);
    let result;
    try {
      result = processOnePhoto(entries[i], CONFIG);
    } catch (err) {
      console.error(err);
      result = { name: entries[i].name, truth: entries[i].truth, stage: { corners: { ok: false, reason: '例外：' + err.message } } };
    }
    currentResults.push(result);
    galleryEl.appendChild(renderPhotoCard(result));
    // 讓瀏覽器有機會重繪，避免長批次處理時整頁凍結感
    await new Promise((r) => setTimeout(r, 0));
  }
  renderSummary(currentResults);
  setStatus(`完成：共處理 ${entries.length} 張。`);
}

/** 對單張照片跑完整管線，回傳含各階段中間結果與錯誤訊息的物件（不丟例外，供 UI 顯示）。 */
function processOnePhoto(entry, cfg) {
  const result = { name: entry.name, truth: entry.truth, stage: {} };

  // 步驟 1+2：讀圖、四角偵測
  const origCanvas = document.createElement('canvas');
  origCanvas.width = entry.imgEl.naturalWidth;
  origCanvas.height = entry.imgEl.naturalHeight;
  origCanvas.getContext('2d').drawImage(entry.imgEl, 0, 0);
  result.origCanvas = origCanvas;

  let srcMat;
  try {
    srcMat = cv.imread(entry.imgEl);
  } catch (err) {
    result.stage.corners = { ok: false, reason: '讀取影像失敗：' + err.message };
    return result;
  }

  const cornerRes = detectCorners(srcMat, cfg);
  result.stage.corners = cornerRes;
  if (!cornerRes.ok) {
    srcMat.delete();
    return result;
  }
  result.cornersCanvas = drawCornersOverlay(origCanvas, cornerRes.corners);

  // 步驟 3：透視校正
  const warped = warpBoard(srcMat, cornerRes.corners, cfg.warpSize);
  srcMat.delete();

  const warpedGridCanvas = document.createElement('canvas');
  cv.imshow(warpedGridCanvas, warped);
  const warpedClassCanvas = document.createElement('canvas');
  cv.imshow(warpedClassCanvas, warped);

  // 步驟 4：格線定位（自動判定路數）
  const gridRes = detectGridLinesBothAxes(warped, cfg);
  result.stage.grid = gridRes;
  if (!gridRes.ok) {
    warped.delete();
    result.warpedGridCanvas = warpedGridCanvas;
    return result;
  }
  drawGridOverlay(warpedGridCanvas, gridRes.rowLines, gridRes.colLines);
  result.warpedGridCanvas = warpedGridCanvas;
  result.boardSize = gridRes.boardSize;

  // 步驟 5：交叉點分類
  const stats = sampleIntersections(warped, gridRes.rowLines, gridRes.colLines, cfg);
  warped.delete();
  const clusterInfo = clusterBoardReference(stats, cfg);
  const predicted = classifyAll(stats, clusterInfo, cfg);
  result.predicted = predicted;
  result.clusterInfo = { black: clusterInfo.centersSorted[0], empty: clusterInfo.centersSorted[1], white: clusterInfo.centersSorted[2] };

  // 步驟 6：與 truth 比對（若有）
  let scoring = null;
  if (entry.truth) {
    if (entry.truth.size === gridRes.boardSize) {
      scoring = scoreAgainstTruth(predicted, entry.truth.grid);
    } else {
      scoring = { ok: false, reason: `truth 路數(${entry.truth.size}) 與偵測路數(${gridRes.boardSize}) 不符，無法比對` };
    }
  }
  result.scoring = scoring;

  drawClassificationOverlay(warpedClassCanvas, gridRes.rowLines, gridRes.colLines, predicted, scoring);
  result.warpedClassCanvas = warpedClassCanvas;

  return result;
}

// ————————————————————————————————————————————————————————————————
// 步驟 2：盤面四角偵測
// ————————————————————————————————————————————————————————————————
function detectCorners(srcMat, cfg) {
  const gray = new cv.Mat();
  cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
  const blurred = new cv.Mat();
  const k = cfg.blurKernel % 2 === 1 ? cfg.blurKernel : cfg.blurKernel + 1;
  cv.GaussianBlur(gray, blurred, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT);

  const edges = new cv.Mat();
  if (cfg.useCanny) {
    cv.Canny(blurred, edges, cfg.cannyLow, cfg.cannyHigh);
    if (cfg.dilateIter > 0) {
      const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      const anchor = new cv.Point(-1, -1);
      cv.dilate(edges, edges, kernel, anchor, cfg.dilateIter, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
      kernel.delete();
    }
  } else {
    cv.adaptiveThreshold(
      blurred,
      edges,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      cfg.adaptiveBlockSize % 2 === 1 ? cfg.adaptiveBlockSize : cfg.adaptiveBlockSize + 1,
      cfg.adaptiveC
    );
  }

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const imgArea = srcMat.rows * srcMat.cols;
  const minArea = imgArea * cfg.minBoardAreaRatio;
  let best = null;
  let bestArea = 0;
  let candidateCount = 0;
  let largestAnyArea = 0; // 除錯用：不管形狀，面積最大的輪廓（判斷 findContours 有沒有抓到夠大的東西）
  let largestNearMiss = null; // 除錯用：面積達標但非合格四邊形的最大輪廓（頂點數/凸性）

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > largestAnyArea) largestAnyArea = area;
    if (area < minArea) {
      cnt.delete();
      continue;
    }
    // 先取凸包再簡化：實際照片邊緣常因雜訊/棋子貼邊產生小鋸齒，直接對原始輪廓
    // approxPolyDP 容易變成 6~9 頂點的非凸多邊形——盤面本身透視後必為凸四邊形，
    // 取凸包可濾掉這類小凹陷，讓 approxPolyDP 穩定收斂到 4 點。
    let source = cnt;
    let hull = null;
    if (cfg.useConvexHull) {
      hull = new cv.Mat();
      cv.convexHull(cnt, hull, false, true);
      source = hull;
    }
    const peri = cv.arcLength(source, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(source, approx, cfg.approxEpsilonRatio * peri, true);
    cnt.delete();
    if (hull) hull.delete();
    const isQuad = approx.rows === 4 && cv.isContourConvex(approx);
    if (isQuad) {
      candidateCount++;
      if (area > bestArea) {
        if (best) best.delete();
        best = approx;
        bestArea = area;
      } else {
        approx.delete();
      }
    } else {
      if (!largestNearMiss || area > largestNearMiss.area) {
        largestNearMiss = { area, vertices: approx.rows, convex: cv.isContourConvex(approx) };
      }
      approx.delete();
    }
  }

  gray.delete();
  blurred.delete();
  edges.delete();
  contours.delete();
  hierarchy.delete();

  if (!best) {
    let detail = `最大輪廓面積 ${Math.round(largestAnyArea)}px²`;
    if (largestNearMiss) {
      detail += `；面積達標的最大候選有 ${largestNearMiss.vertices} 個頂點（凸=${largestNearMiss.convex}，面積 ${Math.round(largestNearMiss.area)}px²）`;
    }
    return {
      ok: false,
      reason: `找不到合格四邊形輪廓（候選 ${candidateCount} 個，面積門檻 ${Math.round(minArea)}px²，${detail}）`,
    };
  }

  const pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push({ x: best.data32S[i * 2], y: best.data32S[i * 2 + 1] });
  }
  best.delete();

  return { ok: true, corners: orderCorners(pts), area: bestArea, candidateCount };
}

/** 四點排序為左上/右上/右下/左下（pyimagesearch order_points 慣例）。 */
function orderCorners(pts) {
  const sums = pts.map((p) => p.x + p.y);
  const diffs = pts.map((p) => p.y - p.x);
  const tl = pts[sums.indexOf(Math.min(...sums))];
  const br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.min(...diffs))];
  const bl = pts[diffs.indexOf(Math.max(...diffs))];
  return { tl, tr, br, bl };
}

// ————————————————————————————————————————————————————————————————
// 步驟 3：透視校正
// ————————————————————————————————————————————————————————————————
function warpBoard(srcMat, corners, warpSize) {
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners.tl.x, corners.tl.y,
    corners.tr.x, corners.tr.y,
    corners.br.x, corners.br.y,
    corners.bl.x, corners.bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    warpSize - 1, 0,
    warpSize - 1, warpSize - 1,
    0, warpSize - 1,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  cv.warpPerspective(srcMat, dst, M, new cv.Size(warpSize, warpSize), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
  srcTri.delete();
  dstTri.delete();
  M.delete();
  return dst;
}

// ————————————————————————————————————————————————————————————————
// 步驟 4：格線定位（投影法，自動判定路數）
// ————————————————————————————————————————————————————————————————
function detectGridLinesBothAxes(warpedMat, cfg) {
  const gray = new cv.Mat();
  cv.cvtColor(warpedMat, gray, cv.COLOR_RGBA2GRAY);
  const w = gray.cols;
  const h = gray.rows;
  const data = gray.data;

  const cropRatio = cfg.centerCropRatio;
  const x0 = Math.round((w * (1 - cropRatio)) / 2);
  const x1 = w - x0;
  const y0 = Math.round((h * (1 - cropRatio)) / 2);
  const y1 = h - y0;

  const rowProfile = new Float64Array(y1 - y0);
  for (let y = y0; y < y1; y++) {
    let s = 0;
    const base = y * w;
    for (let x = x0; x < x1; x++) s += 255 - data[base + x];
    rowProfile[y - y0] = s;
  }
  const colProfile = new Float64Array(x1 - x0);
  for (let x = x0; x < x1; x++) {
    let s = 0;
    for (let y = y0; y < y1; y++) s += 255 - data[y * w + x];
    colProfile[x - x0] = s;
  }
  gray.delete();

  const rowFit = fitGridAxis(rowProfile, y0, h, cfg);
  const colFit = fitGridAxis(colProfile, x0, w, cfg);

  if (!rowFit.ok) return { ok: false, reason: '水平格線定位失敗：' + rowFit.reason };
  if (!colFit.ok) return { ok: false, reason: '垂直格線定位失敗：' + colFit.reason };
  if (rowFit.boardSize !== colFit.boardSize) {
    return {
      ok: false,
      reason: `水平/垂直判定路數不一致（列判定 ${rowFit.boardSize} 路、欄判定 ${colFit.boardSize} 路）`,
    };
  }

  return {
    ok: true,
    boardSize: rowFit.boardSize,
    rowLines: rowFit.positions,
    colLines: colFit.positions,
    rowRawCount: rowFit.rawCount,
    colRawCount: colFit.rawCount,
  };
}

/** 對一條投影曲線（已限縮於中央裁切區）擬合等距格線，回傳判定路數與外插後的完整線位置。 */
function fitGridAxis(profile, offset, fullLength, cfg) {
  const smoothed = movingAverage(profile, cfg.projSmoothWindow);
  const mean = average(smoothed);
  const std = stddev(smoothed, mean);
  const minVal = mean + cfg.peakThresholdStdMul * std;

  const candidates = [];
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] >= smoothed[i - 1] && smoothed[i] >= smoothed[i + 1] && smoothed[i] > minVal) {
      candidates.push({ idx: i, val: smoothed[i] });
    }
  }
  if (candidates.length < 3) {
    return { ok: false, reason: `峰值過少（${candidates.length} 個）` };
  }

  const minDistance = Math.max(4, profile.length / cfg.peakMinDistanceDivisor);
  candidates.sort((a, b) => b.val - a.val);
  const accepted = [];
  for (const cand of candidates) {
    if (accepted.every((a) => Math.abs(a.idx - cand.idx) >= minDistance)) accepted.push(cand);
  }
  accepted.sort((a, b) => a.idx - b.idx);
  if (accepted.length < 3) {
    return { ok: false, reason: `非極大值抑制後峰值過少（${accepted.length} 個）` };
  }

  const positions = accepted.map((a) => a.idx + offset);
  const diffs = [];
  for (let i = 1; i < positions.length; i++) diffs.push(positions[i] - positions[i - 1]);
  diffs.sort((a, b) => a - b);
  const d0 = diffs[Math.floor(diffs.length / 2)];
  if (!(d0 > 0)) return { ok: false, reason: '無法估計格距' };

  // 以第一個峰值為錨點指派整數格線索引，最小平方擬合 pos = a + idx * d
  const idxGuess = positions.map((p) => Math.round((p - positions[0]) / d0));
  let sumI = 0;
  let sumP = 0;
  let sumII = 0;
  let sumIP = 0;
  const n = positions.length;
  for (let i = 0; i < n; i++) {
    sumI += idxGuess[i];
    sumP += positions[i];
    sumII += idxGuess[i] * idxGuess[i];
    sumIP += idxGuess[i] * positions[i];
  }
  const denom = n * sumII - sumI * sumI;
  let d = d0;
  let a = positions[0] - idxGuess[0] * d0;
  if (Math.abs(denom) > 1e-6) {
    d = (n * sumIP - sumI * sumP) / denom;
    a = (sumP - d * sumI) / n;
  }

  // 外插到全圖範圍，數出總共有幾條格線落在影像內（含裁切區外的線）
  const tol = 0.3 * d;
  const kMin = Math.ceil((0 - tol - a) / d);
  const kMax = Math.floor((fullLength - 1 + tol - a) / d);
  const rawCount = kMax - kMin + 1;

  let boardSize = null;
  for (const candidateSize of cfg.gridSizes) {
    if (Math.abs(rawCount - candidateSize) <= cfg.gridSizeTolerance) {
      boardSize = candidateSize;
      break;
    }
  }
  if (boardSize === null) {
    return { ok: false, reason: `偵測到約 ${rawCount} 條線，非 ${cfg.gridSizes.join('/')} 附近`, rawCount };
  }

  // 以判定路數重新置中產生正好 boardSize 條等距線
  const idxCenter = Math.round((fullLength / 2 - a) / d);
  const start = idxCenter - Math.floor((boardSize - 1) / 2);
  const finalPositions = [];
  for (let kk = 0; kk < boardSize; kk++) finalPositions.push(a + d * (start + kk));

  return { ok: true, boardSize, positions: finalPositions, spacing: d, rawCount };
}

function movingAverage(arr, win) {
  if (win <= 1) return Float64Array.from(arr);
  const half = Math.floor(win / 2);
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    let n = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < arr.length) {
        s += arr[j];
        n++;
      }
    }
    out[i] = s / n;
  }
  return out;
}
function average(arr) {
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}
function stddev(arr, mean) {
  let s = 0;
  for (const v of arr) s += (v - mean) * (v - mean);
  return Math.sqrt(s / arr.length);
}

// ————————————————————————————————————————————————————————————————
// 步驟 5：交叉點分類
// ————————————————————————————————————————————————————————————————
/** 對每個交叉點取樣（HSV 的 V=亮度、S=飽和度），回傳 N×N 統計陣列。 */
function sampleIntersections(warpedMat, rowLines, colLines, cfg) {
  const rgb = new cv.Mat();
  cv.cvtColor(warpedMat, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  rgb.delete();

  const data = hsv.data;
  const w = hsv.cols;
  const h = hsv.rows;

  const rowSpacing = (rowLines[rowLines.length - 1] - rowLines[0]) / (rowLines.length - 1);
  const colSpacing = (colLines[colLines.length - 1] - colLines[0]) / (colLines.length - 1);
  const cellSize = Math.min(Math.abs(rowSpacing), Math.abs(colSpacing));
  const radius = Math.max(2, cellSize * cfg.sampleRadiusRatio);

  const stats = [];
  for (let r = 0; r < rowLines.length; r++) {
    const row = [];
    for (let c = 0; c < colLines.length; c++) {
      row.push(sampleCircle(data, w, h, colLines[c], rowLines[r], radius));
    }
    stats.push(row);
  }
  hsv.delete();
  return stats;
}

function sampleCircle(hsvData, w, h, cx, cy, radius) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  let sum = 0;
  let sumSq = 0;
  let sumSat = 0;
  let n = 0;
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const idx = (y * w + x) * 3;
      const v = hsvData[idx + 2];
      const s = hsvData[idx + 1];
      sum += v;
      sumSq += v * v;
      sumSat += s;
      n++;
    }
  }
  if (n === 0) return { mean: 0, std: 0, sat: 0, n: 0 };
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return { mean, std: Math.sqrt(variance), sat: sumSat / n, n };
}

/** 用 k-means（k=3）對全盤取樣點的（亮度, 飽和度）分群，依中心亮度排序判定 黑/空/白。 */
function clusterBoardReference(stats, cfg) {
  const N = stats.length;
  const points = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) points.push(stats[r][c]);
  const M = points.length;

  const samples = new cv.Mat(M, 2, cv.CV_32F);
  for (let i = 0; i < M; i++) {
    samples.data32F[i * 2] = points[i].mean;
    samples.data32F[i * 2 + 1] = points[i].sat;
  }
  const labels = new cv.Mat();
  const centers = new cv.Mat();
  const criteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 30, 0.5);
  cv.kmeans(samples, 3, labels, criteria, 5, cv.KMEANS_PP_CENTERS, centers);

  const centerList = [0, 1, 2].map((i) => ({
    clusterIdx: i,
    brightness: centers.data32F[i * 2],
    sat: centers.data32F[i * 2 + 1],
  }));
  const centersSorted = [...centerList].sort((a, b) => a.brightness - b.brightness); // [黑, 空, 白]
  const rankOfCluster = new Array(3);
  centersSorted.forEach((c, rank) => {
    rankOfCluster[c.clusterIdx] = rank;
  });

  const labelArr = Int32Array.from(labels.data32S);
  samples.delete();
  labels.delete();
  centers.delete();

  return { labelArr, rankOfCluster, centersSorted };
}

const CLASS_NAMES = ['black', 'empty', 'white'];

/** rank(0/1/2) → 分類名稱；並用標準差做「疑似棋子反光」的二次修正。 */
function classifyAll(stats, clusterInfo, cfg) {
  const N = stats.length;
  const { labelArr, rankOfCluster, centersSorted } = clusterInfo;
  const emptyCenter = centersSorted[1];
  const grid = [];
  let li = 0;
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) {
      const s = stats[r][c];
      const rank = rankOfCluster[labelArr[li++]]; // 0 黑 / 1 空 / 2 白
      let cls = CLASS_NAMES[rank];
      // 反光/漸層二次判斷：判為「空」但標準差異常高，改依亮度正負判黑/白
      if (cls === 'empty' && s.std >= cfg.stoneStdThreshold) {
        cls = s.mean <= emptyCenter.brightness ? 'black' : 'white';
      }
      row.push(cls);
    }
    grid.push(row);
  }
  return grid;
}

// ————————————————————————————————————————————————————————————————
// 步驟 6：與 truth 比對
// ————————————————————————————————————————————————————————————————
const CLASS_TO_TRUTH_IDX = { empty: 0, black: 1, white: 2 };

function scoreAgainstTruth(predictedGrid, truthGrid) {
  const N = predictedGrid.length;
  const confusion = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let correct = 0;
  let total = 0;
  const errors = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const t = truthGrid[r][c];
      const p = CLASS_TO_TRUTH_IDX[predictedGrid[r][c]];
      confusion[t][p]++;
      total++;
      if (t === p) correct++;
      else errors.push({ r, c, truth: t, predicted: p });
    }
  }
  return { ok: true, accuracy: correct / total, correct, total, confusion, errors };
}

// ————————————————————————————————————————————————————————————————
// 疊圖繪製
// ————————————————————————————————————————————————————————————————
function drawCornersOverlay(origCanvas, corners) {
  const canvas = document.createElement('canvas');
  canvas.width = origCanvas.width;
  canvas.height = origCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(origCanvas, 0, 0);

  const order = ['tl', 'tr', 'br', 'bl'];
  ctx.strokeStyle = '#39ff6a';
  ctx.lineWidth = Math.max(2, canvas.width / 300);
  ctx.beginPath();
  order.forEach((key, i) => {
    const p = corners[key];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();

  ctx.font = `${Math.max(14, canvas.width / 40)}px sans-serif`;
  ctx.fillStyle = '#ff3b3b';
  const labels = { tl: 'TL', tr: 'TR', br: 'BR', bl: 'BL' };
  order.forEach((key) => {
    const p = corners[key];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#39ff6a';
    ctx.fill();
    ctx.fillStyle = '#ff3b3b';
    ctx.fillText(labels[key], p.x + 8, p.y - 8);
  });
  return canvas;
}

function drawGridOverlay(canvas, rowLines, colLines) {
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(0, 200, 255, 0.85)';
  ctx.lineWidth = 1;
  for (const y of rowLines) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (const x of colLines) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

function drawClassificationOverlay(canvas, rowLines, colLines, predicted, scoring) {
  const ctx = canvas.getContext('2d');
  const rowSpacing = Math.abs((rowLines[rowLines.length - 1] - rowLines[0]) / (rowLines.length - 1));
  const colSpacing = Math.abs((colLines[colLines.length - 1] - colLines[0]) / (colLines.length - 1));
  const cellSize = Math.min(rowSpacing, colSpacing);
  const dotR = cellSize * 0.36;

  for (let r = 0; r < rowLines.length; r++) {
    for (let c = 0; c < colLines.length; c++) {
      const x = colLines[c];
      const y = rowLines[r];
      const cls = predicted[r][c];
      if (cls === 'black') {
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (cls === 'white') {
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250, 250, 250, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, dotR * 0.18), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 150, 0, 0.7)';
        ctx.fill();
      }
    }
  }

  if (scoring && scoring.ok) {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.95)';
    ctx.lineWidth = 2;
    for (const e of scoring.errors) {
      const x = colLines[e.c];
      const y = rowLines[e.r];
      ctx.strokeRect(x - dotR - 2, y - dotR - 2, (dotR + 2) * 2, (dotR + 2) * 2);
    }
  }
}

// ————————————————————————————————————————————————————————————————
// UI 渲染：逐張明細卡片
// ————————————————————————————————————————————————————————————————
function renderPhotoCard(result) {
  const card = document.createElement('div');
  card.className = 'photo-card';

  const cornerOk = result.stage.corners && result.stage.corners.ok;
  const gridOk = result.stage.grid ? result.stage.grid.ok : cornerOk ? undefined : false;

  let title = `<h3>${escapeHtml(result.name)}`;
  title += cornerOk ? ' <span class="ok">四角 OK</span>' : ' <span class="fail">四角失敗</span>';
  if (cornerOk) {
    if (result.stage.grid && result.stage.grid.ok) {
      title += ` <span class="ok">格線 OK（${result.stage.grid.boardSize} 路）</span>`;
    } else if (result.stage.grid) {
      title += ' <span class="fail">格線失敗</span>';
    }
  }
  if (result.scoring) {
    if (result.scoring.ok) {
      title += ` <span class="ok">準確率 ${(result.scoring.accuracy * 100).toFixed(1)}%（錯 ${result.scoring.errors.length}/${result.scoring.total}）</span>`;
    } else {
      title += ` <span class="fail">${escapeHtml(result.scoring.reason)}</span>`;
    }
  } else if (result.predicted) {
    title += ' <span class="msg-warn">無 truth（僅顯示辨識結果，不計分）</span>';
  }
  title += '</h3>';
  card.innerHTML = title;

  if (!cornerOk) {
    card.innerHTML += `<p class="msg-fail">四角偵測失敗：${escapeHtml(result.stage.corners.reason)}</p>`;
  } else if (result.stage.grid && !result.stage.grid.ok) {
    card.innerHTML += `<p class="msg-fail">格線定位失敗：${escapeHtml(result.stage.grid.reason)}</p>`;
  }

  const canvasesDiv = document.createElement('div');
  canvasesDiv.className = 'canvases';
  canvasesDiv.appendChild(canvasBlock(result.cornersCanvas || result.origCanvas, '原圖 + 四角偵測'));
  if (result.warpedGridCanvas) canvasesDiv.appendChild(canvasBlock(result.warpedGridCanvas, '透視校正 + 格線'));
  if (result.warpedClassCanvas) canvasesDiv.appendChild(canvasBlock(result.warpedClassCanvas, '交叉點分類（紅框＝錯誤點）'));
  card.appendChild(canvasesDiv);

  if (result.scoring && result.scoring.ok) {
    card.appendChild(confusionTable(result.scoring.confusion));
  }

  return card;
}

function canvasBlock(canvas, caption) {
  const wrap = document.createElement('figure');
  wrap.className = 'canvas-block';
  wrap.appendChild(canvas);
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  wrap.appendChild(cap);
  return wrap;
}

function confusionTable(confusion) {
  const wrap = document.createElement('div');
  const rowNames = ['truth=空', 'truth=黑', 'truth=白'];
  const colNames = ['pred=空', 'pred=黑', 'pred=白'];
  let html = '<table><thead><tr><th></th>' + colNames.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  for (let r = 0; r < 3; r++) {
    html += `<tr><th>${rowNames[r]}</th>` + confusion[r].map((v) => `<td>${v}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ————————————————————————————————————————————————————————————————
// UI 渲染：總結表
// ————————————————————————————————————————————————————————————————
function renderSummary(results) {
  let cornerSuccess = 0;
  let accSum = 0;
  let accCount = 0;

  let html = '<table><thead><tr><th>檔名</th><th>四角偵測</th><th>路數</th><th>格線定位</th><th>準確率</th><th>錯誤數</th><th>備註</th></tr></thead><tbody>';
  for (const r of results) {
    const cornerOk = r.stage.corners && r.stage.corners.ok;
    if (cornerOk) cornerSuccess++;
    const gridStage = r.stage.grid;
    const gridOk = gridStage && gridStage.ok;

    let accCell = '—';
    let errCell = '—';
    let noteCell = '';
    if (r.scoring && r.scoring.ok) {
      accCell = (r.scoring.accuracy * 100).toFixed(1) + '%';
      errCell = `${r.scoring.errors.length}/${r.scoring.total}`;
      accSum += r.scoring.accuracy;
      accCount++;
    } else if (r.scoring && !r.scoring.ok) {
      noteCell = r.scoring.reason;
    } else if (r.predicted) {
      noteCell = '無 truth，僅顯示辨識結果';
    } else if (!cornerOk) {
      noteCell = r.stage.corners.reason;
    } else if (!gridOk) {
      noteCell = gridStage.reason;
    }

    html += `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="${cornerOk ? 'ok' : 'fail'}">${cornerOk ? '成功' : '失敗'}</td>
      <td>${gridOk ? gridStage.boardSize : '—'}</td>
      <td class="${gridOk ? 'ok' : cornerOk ? 'fail' : ''}">${cornerOk ? (gridOk ? '成功' : '失敗') : '—'}</td>
      <td>${accCell}</td>
      <td>${errCell}</td>
      <td>${escapeHtml(noteCell)}</td>
    </tr>`;
  }

  const avgAcc = accCount > 0 ? (accSum / accCount) * 100 : null;
  html += `<tr class="summaryRow">
    <td>總結</td>
    <td>${cornerSuccess}/${results.length} 成功</td>
    <td colspan="2"></td>
    <td colspan="2">${avgAcc !== null ? `平均準確率 ${avgAcc.toFixed(2)}%（${accCount} 張有 truth 可比對）` : '無可比對張數'}</td>
    <td></td>
  </tr>`;
  html += '</tbody></table>';
  summaryEl.innerHTML = html;
}
