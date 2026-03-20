const $ = (id) => document.getElementById(id);
const FONT_FAMILY = '"BIZ UDPGothic","BIZ UDPゴシック","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';

const els = {
  displayMode: $('displayMode'),
  theme: $('theme'),
  message: $('message'),
  service: $('service'),
  destination: $('destination'),
  departure: $('departure'),
  cars: $('cars'),
  note: $('note'),
  blinkEnabled: $('blinkEnabled'),
  blinkMs: $('blinkMs'),
  blinkMsOut: $('blinkMsOut'),
  bgColor: $('bgColor'),
  fgColor: $('fgColor'),
  accentColor: $('accentColor'),
  noteColor: $('noteColor'),
  bgHex: $('bgHex'),
  fgHex: $('fgHex'),
  accentHex: $('accentHex'),
  noteHex: $('noteHex'),
  preset: $('preset'),
  width: $('width'),
  height: $('height'),
  speed: $('speed'),
  fontScale: $('fontScale'),
  dotSize: $('dotSize'),
  gap: $('gap'),
  fps: $('fps'),
  duration: $('duration'),
  speedOut: $('speedOut'),
  fontScaleOut: $('fontScaleOut'),
  dotSizeOut: $('dotSizeOut'),
  gapOut: $('gapOut'),
  fpsOut: $('fpsOut'),
  durationOut: $('durationOut'),
  modeStat: $('modeStat'),
  themeStat: $('themeStat'),
  recordStat: $('recordStat'),
  meta: $('meta'),
  status: $('status'),
  stationFields: $('stationFields'),
  scrollFields: $('scrollFields'),
  screen: $('screen'),
  toggle: $('toggle'),
  reset: $('reset'),
  savePng: $('savePng'),
  saveWebp: $('saveWebp'),
  saveWebm: $('saveWebm'),
  saveMp4: $('saveMp4')
};

const ctx = els.screen.getContext('2d');
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

const PRESETS = {
  '1600x400': [1600, 400],
  '1280x320': [1280, 320],
  '960x240': [960, 240],
  '640x160': [640, 160]
};

const THEMES = {
  'station-orange': {
    label: '駅風オレンジ',
    bg: '#050505',
    fg: '#ffb300',
    accent: '#7dff7a',
    note: '#ffd84d',
    recommendedSize: '1600x400'
  },
  'station-green': {
    label: '駅風グリーン',
    bg: '#030504',
    fg: '#86ff67',
    accent: '#d9ffd0',
    note: '#86ff67',
    recommendedSize: '1600x400'
  },
  'station-red': {
    label: '駅風警告レッド',
    bg: '#080303',
    fg: '#ff6b57',
    accent: '#ffd5cf',
    note: '#ff6b57',
    recommendedSize: '1600x400'
  },
  custom: { label: 'カスタム' }
};

const state = {
  running: true,
  lastTime: performance.now(),
  offsetPx: 0,
  recorderBusy: false,
  ffmpeg: null,
  ffmpegLoaded: false,
  scrollCacheKey: '',
  scrollPattern: null,
  stationCacheKey: '',
  stationPatternOn: null,
  stationPatternOff: null
};

function setStatus(text) {
  els.status.textContent = text;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function tone(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amount;
  let g = ((n >> 8) & 255) + amount;
  let b = (n & 255) + amount;
  r = clamp(r, 0, 255);
  g = clamp(g, 0, 255);
  b = clamp(b, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function getConfig() {
  return {
    mode: els.displayMode.value,
    theme: els.theme.value,
    message: (els.message.value || ' ').replace(/\n+/g, '   '),
    service: (els.service.value || '普通').trim(),
    destination: (els.destination.value || '函館').trim(),
    departure: (els.departure.value || '14:32').trim(),
    cars: (els.cars.value || '3両').trim(),
    note: (els.note.value || 'まもなく発車します').trim(),
    blinkEnabled: els.blinkEnabled.checked,
    blinkMs: Math.max(300, Number(els.blinkMs.value) || 900),
    bg: safeHex(els.bgHex.value.trim(), '#050505'),
    fg: safeHex(els.fgHex.value.trim(), '#ffb300'),
    accent: safeHex(els.accentHex.value.trim(), '#7dff7a'),
    noteColor: safeHex(els.noteHex.value.trim(), '#ffd84d'),
    width: Math.max(320, Number(els.width.value) || 1600),
    height: Math.max(120, Number(els.height.value) || 400),
    speed: Math.max(20, Number(els.speed.value) || 120),
    fontScale: Math.max(0.6, Number(els.fontScale.value) || 1),
    dotSize: Math.max(6, Number(els.dotSize.value) || 10),
    gap: Math.max(1, Number(els.gap.value) || 2),
    fps: Math.max(10, Number(els.fps.value) || 30),
    duration: Math.max(1, Number(els.duration.value) || 5)
  };
}

function invalidateScroll() {
  state.scrollCacheKey = '';
  state.scrollPattern = null;
}

function invalidateStation() {
  state.stationCacheKey = '';
  state.stationPatternOn = null;
  state.stationPatternOff = null;
}

function invalidateAll() {
  invalidateScroll();
  invalidateStation();
}

function syncCanvas(config) {
  if (els.screen.width !== config.width || els.screen.height !== config.height) {
    els.screen.width = config.width;
    els.screen.height = config.height;
  }
  els.meta.textContent = `${config.width} × ${config.height} px`;
}

function applyTheme(themeKey, { resize = true } = {}) {
  const theme = THEMES[themeKey];
  if (!theme || themeKey === 'custom') return;
  els.bgColor.value = theme.bg;
  els.bgHex.value = theme.bg;
  els.fgColor.value = theme.fg;
  els.fgHex.value = theme.fg;
  els.accentColor.value = theme.accent;
  els.accentHex.value = theme.accent;
  els.noteColor.value = theme.note;
  els.noteHex.value = theme.note;
  if (resize && theme.recommendedSize) {
    const [width, height] = PRESETS[theme.recommendedSize];
    els.preset.value = theme.recommendedSize;
    els.width.value = width;
    els.height.value = height;
  }
  invalidateAll();
}

function bindColor(colorEl, hexEl, fallback) {
  colorEl.addEventListener('input', () => {
    hexEl.value = safeHex(colorEl.value.trim(), fallback);
    els.theme.value = 'custom';
    invalidateAll();
    setStatus('色設定を更新しました');
  });
  hexEl.addEventListener('input', () => {
    const value = hexEl.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      colorEl.value = value;
      els.theme.value = 'custom';
      invalidateAll();
      setStatus('色設定を更新しました');
    }
  });
  hexEl.addEventListener('blur', () => {
    const value = safeHex(hexEl.value.trim(), fallback);
    hexEl.value = value;
    colorEl.value = value;
    invalidateAll();
  });
}

function clearMask(width, height) {
  maskCanvas.width = width;
  maskCanvas.height = height;
  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = '#000';
  maskCtx.fillRect(0, 0, width, height);
}

function mergeMask(cells, id) {
  const { data } = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  for (let i = 0; i < cells.length; i += 1) {
    const j = i * 4;
    if (data[j + 3] > 20 && data[j] > 20) {
      cells[i] = id;
    }
  }
}

function fontMetrics(text, size, weight = 900) {
  maskCtx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  const metrics = maskCtx.measureText(text || ' ');
  const ascent = metrics.actualBoundingBoxAscent || size * 0.8;
  const descent = metrics.actualBoundingBoxDescent || size * 0.2;
  return {
    width: metrics.width,
    ascent,
    descent,
    height: ascent + descent,
    size,
    weight
  };
}

function fitText(text, maxWidth, maxHeight, weight = 900, minSize = 4) {
  const start = Math.max(minSize, Math.floor(maxHeight));
  for (let size = start; size >= minSize; size -= 1) {
    const metrics = fontMetrics(text, size, weight);
    if (metrics.width <= maxWidth && metrics.height <= maxHeight) {
      return metrics;
    }
  }
  return fontMetrics(text, minSize, weight);
}

function renderTextBlock(cells, id, text, box, { align = 'left', weight = 900 } = {}) {
  clearMask(maskCanvas.width, maskCanvas.height);
  const metrics = fitText(text, box.width, box.height, weight);
  maskCtx.fillStyle = '#fff';
  maskCtx.textBaseline = 'alphabetic';
  if (align === 'center') maskCtx.textAlign = 'center';
  else if (align === 'right') maskCtx.textAlign = 'right';
  else maskCtx.textAlign = 'left';
  maskCtx.font = `${metrics.weight} ${metrics.size}px ${FONT_FAMILY}`;

  const x = align === 'center'
    ? box.x + box.width / 2
    : align === 'right'
      ? box.x + box.width
      : box.x;
  const y = box.y + (box.height + metrics.ascent - metrics.descent) / 2;
  maskCtx.fillText(text, x, y);
  mergeMask(cells, id);
}

function drawLine(cells, id, x, y, width, height) {
  clearMask(maskCanvas.width, maskCanvas.height);
  maskCtx.fillStyle = '#fff';
  maskCtx.fillRect(x, y, width, height);
  mergeMask(cells, id);
}

function makePalette(config) {
  return {
    offFill: tone(config.bg, 24),
    lit: { fill: config.fg, shadow: rgba(config.fg, 0.28) },
    accent: { fill: config.accent, shadow: rgba(config.accent, 0.24) },
    note: { fill: config.noteColor, shadow: rgba(config.noteColor, 0.26) },
    dim: { fill: tone(config.bg, 54), shadow: 'transparent' }
  };
}

function scrollKey(config) {
  return [config.message, config.bg, config.fg, config.width, config.height, config.dotSize, config.gap, config.fontScale].join('|');
}

function stationKey(config) {
  return [
    config.service,
    config.destination,
    config.departure,
    config.cars,
    config.note,
    config.bg,
    config.fg,
    config.accent,
    config.noteColor,
    config.width,
    config.height,
    config.dotSize,
    config.gap,
    config.fontScale
  ].join('|');
}

function buildScrollPattern(config) {
  syncCanvas(config);
  const step = config.dotSize + config.gap;
  const cols = Math.max(1, Math.floor(config.width / step));
  const rows = Math.max(1, Math.floor(config.height / step));
  const fontSize = Math.max(8, Math.floor(rows * 0.68 * config.fontScale));
  const padX = Math.max(4, Math.floor(cols * 0.04));

  maskCtx.font = `900 ${fontSize}px ${FONT_FAMILY}`;
  const textWidth = Math.ceil(maskCtx.measureText(config.message).width + padX * 2);

  clearMask(Math.max(textWidth, cols + padX * 2), rows);
  maskCtx.fillStyle = '#fff';
  maskCtx.textBaseline = 'middle';
  maskCtx.textAlign = 'left';
  maskCtx.font = `900 ${fontSize}px ${FONT_FAMILY}`;
  maskCtx.fillText(config.message, padX, rows / 2 + fontSize * 0.02);

  const cells = new Uint8Array(maskCanvas.width * maskCanvas.height);
  mergeMask(cells, 1);

  return {
    step,
    cols,
    rows,
    glyphWidth: maskCanvas.width,
    glyphHeight: maskCanvas.height,
    cells,
    palette: makePalette(config)
  };
}

function getScrollPattern(config) {
  const key = scrollKey(config);
  if (state.scrollPattern && state.scrollCacheKey === key) {
    syncCanvas(config);
    return state.scrollPattern;
  }
  state.scrollPattern = buildScrollPattern(config);
  state.scrollCacheKey = key;
  return state.scrollPattern;
}

function buildStationPattern(config, showNote) {
  syncCanvas(config);
  const step = config.dotSize + config.gap;
  const cols = Math.max(1, Math.floor(config.width / step));
  const rows = Math.max(1, Math.floor(config.height / step));
  const cells = new Uint8Array(cols * rows);

  clearMask(cols, rows);

  const padX = Math.max(2, Math.floor(cols * 0.03));
  const padY = Math.max(1, Math.floor(rows * 0.10));
  const boxGap = Math.max(2, Math.floor(cols * 0.015));
  const topBandH = Math.max(8, Math.floor(rows * 0.58));
  const bottomBandY = topBandH + 1;
  const bottomBandH = rows - bottomBandY - 1;

  const serviceW = Math.max(8, Math.floor(cols * 0.14));
  const depW = Math.max(10, Math.floor(cols * 0.17));
  const carsW = Math.max(8, Math.floor(cols * 0.11));
  const contentW = cols - padX * 2 - boxGap * 3;
  const destW = Math.max(12, contentW - serviceW - depW - carsW);

  const xService = padX;
  const xDest = xService + serviceW + boxGap;
  const xDep = xDest + destW + boxGap;
  const xCars = xDep + depW + boxGap;

  drawLine(cells, 4, 0, 0, cols, 1);
  drawLine(cells, 4, 0, rows - 1, cols, 1);
  drawLine(cells, 4, 0, topBandH, cols, 1);
  drawLine(cells, 4, xDest - Math.ceil(boxGap / 2), 0, 1, topBandH);
  drawLine(cells, 4, xDep - Math.ceil(boxGap / 2), 0, 1, topBandH);
  drawLine(cells, 4, xCars - Math.ceil(boxGap / 2), 0, 1, topBandH);

  const topBoxY = padY;
  const topBoxH = topBandH - padY * 2;
  renderTextBlock(cells, 2, config.service, { x: xService, y: topBoxY, width: serviceW, height: topBoxH }, { align: 'left' });
  renderTextBlock(cells, 1, config.destination, { x: xDest, y: topBoxY, width: destW, height: topBoxH }, { align: 'left' });
  renderTextBlock(cells, 1, config.departure, { x: xDep, y: topBoxY, width: depW, height: topBoxH }, { align: 'center' });
  renderTextBlock(cells, 1, config.cars, { x: xCars, y: topBoxY, width: carsW, height: topBoxH }, { align: 'center' });

  if (showNote && bottomBandH > 4) {
    renderTextBlock(cells, 3, config.note, {
      x: padX,
      y: bottomBandY + Math.max(1, Math.floor(rows * 0.03)),
      width: cols - padX * 2,
      height: bottomBandH - Math.max(1, Math.floor(rows * 0.05))
    }, { align: 'left' });
  }

  return {
    step,
    cols,
    rows,
    cells,
    palette: makePalette(config)
  };
}

function getStationPattern(config) {
  const key = stationKey(config);
  if (!state.stationPatternOn || !state.stationPatternOff || state.stationCacheKey !== key) {
    state.stationPatternOn = buildStationPattern(config, true);
    state.stationPatternOff = buildStationPattern(config, false);
    state.stationCacheKey = key;
  }
  const blinkOn = !config.blinkEnabled || ((performance.now() % (config.blinkMs * 2)) < config.blinkMs);
  return blinkOn ? state.stationPatternOn : state.stationPatternOff;
}

function getCellStyle(cellId, palette) {
  if (cellId === 1) return palette.lit;
  if (cellId === 2) return palette.accent;
  if (cellId === 3) return palette.note;
  if (cellId === 4) return palette.dim;
  return null;
}

function drawDots(pattern, config) {
  const radius = config.dotSize / 2;
  const step = pattern.step;
  ctx.fillStyle = config.bg;
  ctx.fillRect(0, 0, els.screen.width, els.screen.height);

  for (let row = 0; row < pattern.rows; row += 1) {
    const cy = row * step + radius + config.gap / 2;
    for (let col = 0; col < pattern.cols; col += 1) {
      const cx = col * step + radius + config.gap / 2;
      const cellId = pattern.cells[row * pattern.cols + col];
      const style = getCellStyle(cellId, pattern.palette);
      ctx.beginPath();
      ctx.arc(cx, cy, cellId ? radius : radius * 0.92, 0, Math.PI * 2);
      if (style) {
        ctx.fillStyle = style.fill;
        ctx.shadowBlur = config.dotSize * 1.1;
        ctx.shadowColor = style.shadow;
      } else {
        ctx.fillStyle = pattern.palette.offFill;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

function draw() {
  const config = getConfig();

  if (config.mode === 'scroll') {
    const pattern = getScrollPattern(config);
    const cycle = pattern.glyphWidth + pattern.cols + 2;
    const offsetCells = state.offsetPx / pattern.step;
    const visible = { ...pattern, cells: new Uint8Array(pattern.cols * pattern.rows) };

    for (let row = 0; row < pattern.rows; row += 1) {
      for (let col = 0; col < pattern.cols; col += 1) {
        let glyphX = Math.floor(col + offsetCells);
        glyphX = ((glyphX % cycle) + cycle) % cycle;
        glyphX -= pattern.cols;
        if (glyphX >= 0 && glyphX < pattern.glyphWidth && row < pattern.glyphHeight) {
          visible.cells[row * pattern.cols + col] = pattern.cells[row * pattern.glyphWidth + glyphX];
        }
      }
    }
    drawDots(visible, config);
    return;
  }

  drawDots(getStationPattern(config), config);
}

function updateReadouts() {
  const config = getConfig();
  els.speedOut.value = `${config.speed} px/s`;
  els.fontScaleOut.value = `${config.fontScale.toFixed(2)} 倍`;
  els.dotSizeOut.value = `${config.dotSize} px`;
  els.gapOut.value = `${config.gap} px`;
  els.fpsOut.value = `${config.fps} fps`;
  els.durationOut.value = `${config.duration} 秒`;
  els.blinkMsOut.value = `${config.blinkMs} ms`;
  els.meta.textContent = `${config.width} × ${config.height} px`;
  els.recordStat.textContent = `${config.duration} 秒 / ${config.fps} fps`;
  els.modeStat.textContent = config.mode === 'station' ? '駅風発車標' : '横スクロール';
  els.themeStat.textContent = THEMES[config.theme]?.label || 'カスタム';
  els.stationFields.classList.toggle('is-hidden', config.mode !== 'station');
  els.scrollFields.classList.toggle('is-hidden', config.mode !== 'scroll');
  els.reset.disabled = config.mode !== 'scroll';
}

function syncPreset() {
  const key = `${Math.max(320, Number(els.width.value) || 1600)}x${Math.max(120, Number(els.height.value) || 400)}`;
  els.preset.value = PRESETS[key] ? key : 'custom';
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveImage(type) {
  setStatus(`${type.toUpperCase()} を生成中...`);
  draw();
  const mime = type === 'png' ? 'image/png' : 'image/webp';
  const blob = await new Promise((resolve) => els.screen.toBlob(resolve, mime, 0.95));
  if (!blob) throw new Error(`${type.toUpperCase()} の生成に失敗しました。`);
  download(blob, `led-board.${type}`);
  setStatus(`${type.toUpperCase()} を保存しました`);
}

async function recordWebmBlob(seconds, fps) {
  if (!window.MediaRecorder) throw new Error('このブラウザは MediaRecorder に対応していません。');
  const stream = els.screen.captureStream(fps);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((value) => MediaRecorder.isTypeSupported(value)) || '';
  if (!mime) throw new Error('このブラウザは WebM 録画に対応していません。');

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  const wasRunning = state.running;
  if (!state.running) {
    state.running = true;
    els.toggle.textContent = 'プレビュー停止';
  }

  return new Promise((resolve, reject) => {
    recorder.onerror = (event) => reject(event.error || new Error('録画に失敗しました。'));
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (!wasRunning) {
        state.running = false;
        els.toggle.textContent = 'プレビュー再開';
      }
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.start(200);
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, seconds * 1000);
  });
}

async function ensureFFmpeg() {
  if (state.ffmpegLoaded) return state.ffmpeg;
  if (!window.FFmpegWASM || !window.FFmpegUtil) throw new Error('ffmpeg.wasm の読み込みに失敗しました。');
  const { FFmpeg } = window.FFmpegWASM;
  const { toBlobURL } = window.FFmpegUtil;
  const ffmpeg = new FFmpeg();
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  setStatus('MP4変換エンジンを読み込み中...');
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
  });
  state.ffmpeg = ffmpeg;
  state.ffmpegLoaded = true;
  return ffmpeg;
}

async function toMp4(webmBlob) {
  const ffmpeg = await ensureFFmpeg();
  const { fetchFile } = window.FFmpegUtil;
  await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-movflags', 'faststart',
    'output.mp4'
  ]);
  const data = await ffmpeg.readFile('output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

async function saveVideo(format) {
  if (state.recorderBusy) return;
  state.recorderBusy = true;
  els.saveWebm.disabled = true;
  els.saveMp4.disabled = true;
  try {
    const config = getConfig();
    setStatus(`${format.toUpperCase()} 用に ${config.duration} 秒録画中...`);
    const webm = await recordWebmBlob(config.duration, config.fps);
    if (format === 'webm') {
      download(webm, 'led-board.webm');
      setStatus('WebM を保存しました');
    } else {
      setStatus('MP4 に変換中...');
      const mp4 = await toMp4(webm);
      download(mp4, 'led-board.mp4');
      setStatus('MP4 を保存しました');
    }
  } catch (error) {
    console.error(error);
    setStatus('保存に失敗しました');
    alert(error.message || '保存に失敗しました。');
  } finally {
    state.recorderBusy = false;
    els.saveWebm.disabled = false;
    els.saveMp4.disabled = false;
  }
}

function tick(now) {
  const config = getConfig();
  const dt = Math.min(0.05, (now - state.lastTime) / 1000);
  state.lastTime = now;

  if (state.running && config.mode === 'scroll') {
    const pattern = getScrollPattern(config);
    state.offsetPx += config.speed * dt;
    const cyclePx = (pattern.glyphWidth + pattern.cols + 2) * pattern.step;
    if (state.offsetPx >= cyclePx) state.offsetPx = 0;
  }

  draw();
  requestAnimationFrame(tick);
}

bindColor(els.bgColor, els.bgHex, '#050505');
bindColor(els.fgColor, els.fgHex, '#ffb300');
bindColor(els.accentColor, els.accentHex, '#7dff7a');
bindColor(els.noteColor, els.noteHex, '#ffd84d');

els.theme.addEventListener('change', () => {
  applyTheme(els.theme.value);
  updateReadouts();
  setStatus('テーマを更新しました');
});

els.displayMode.addEventListener('change', () => {
  updateReadouts();
  invalidateAll();
  setStatus(els.displayMode.value === 'station' ? '駅風発車標モードに切り替えました' : '横スクロールモードに切り替えました');
});

els.preset.addEventListener('change', () => {
  if (els.preset.value !== 'custom') {
    const [width, height] = PRESETS[els.preset.value];
    els.width.value = width;
    els.height.value = height;
    invalidateAll();
    updateReadouts();
    setStatus('表示サイズを更新しました');
  }
});

[els.width, els.height].forEach((el) => {
  el.addEventListener('input', () => {
    syncPreset();
    invalidateAll();
    updateReadouts();
    setStatus('表示サイズを更新しました');
  });
});

[
  els.message,
  els.service,
  els.destination,
  els.departure,
  els.cars,
  els.note,
  els.speed,
  els.fontScale,
  els.dotSize,
  els.gap,
  els.fps,
  els.duration,
  els.blinkMs
].forEach((el) => {
  el.addEventListener('input', () => {
    invalidateAll();
    updateReadouts();
    setStatus('設定を更新しました');
  });
});

els.blinkEnabled.addEventListener('change', () => {
  updateReadouts();
  setStatus(els.blinkEnabled.checked ? '備考欄点滅を有効にしました' : '備考欄点滅を無効にしました');
});

els.toggle.addEventListener('click', () => {
  state.running = !state.running;
  els.toggle.textContent = state.running ? 'プレビュー停止' : 'プレビュー再開';
  setStatus(state.running ? 'プレビュー再生中' : 'プレビュー停止中');
});

els.reset.addEventListener('click', () => {
  state.offsetPx = 0;
  draw();
  setStatus('表示位置をリセットしました');
});

els.savePng.addEventListener('click', () => {
  saveImage('png').catch((error) => {
    alert(error.message);
    setStatus('保存に失敗しました');
  });
});

els.saveWebp.addEventListener('click', () => {
  saveImage('webp').catch((error) => {
    alert(error.message);
    setStatus('保存に失敗しました');
  });
});

els.saveWebm.addEventListener('click', () => saveVideo('webm'));
els.saveMp4.addEventListener('click', () => saveVideo('mp4'));

applyTheme('station-orange', { resize: false });
updateReadouts();
draw();
setStatus('駅風プレビュー再生中');
requestAnimationFrame(tick);
