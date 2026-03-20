const $ = (id) => document.getElementById(id);
const els = {
  message: $('message'), bgColor: $('bgColor'), fgColor: $('fgColor'), bgHex: $('bgHex'), fgHex: $('fgHex'),
  preset: $('preset'), width: $('width'), height: $('height'), speed: $('speed'), fontScale: $('fontScale'),
  dotSize: $('dotSize'), gap: $('gap'), fps: $('fps'), duration: $('duration'),
  speedOut: $('speedOut'), fontScaleOut: $('fontScaleOut'), dotSizeOut: $('dotSizeOut'), gapOut: $('gapOut'),
  fpsOut: $('fpsOut'), durationOut: $('durationOut'), speedStat: $('speedStat'), dotStat: $('dotStat'),
  recordStat: $('recordStat'), meta: $('meta'), status: $('status'), screen: $('screen'), toggle: $('toggle'),
  reset: $('reset'), savePng: $('savePng'), saveWebp: $('saveWebp'), saveWebm: $('saveWebm'), saveMp4: $('saveMp4')
};

const ctx = els.screen.getContext('2d');
const glyphCanvas = document.createElement('canvas');
const glyphCtx = glyphCanvas.getContext('2d', { willReadFrequently: true });
const PRESETS = { '960x240': [960,240], '1280x240': [1280,240], '1280x320': [1280,320], '640x160': [640,160] };

const state = {
  running: true,
  lastTime: performance.now(),
  offsetPx: 0,
  cacheKey: '',
  pattern: null,
  recorderBusy: false,
  ffmpeg: null,
  ffmpegLoaded: false
};

function setStatus(text) { els.status.textContent = text; }
function safeHex(v, fallback) { return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; }
function shade(hex, add) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + add, g = ((n >> 8) & 255) + add, b = (n & 255) + add;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r}, ${g}, ${b})`;
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function config() {
  return {
    message: (els.message.value || ' ').replace(/\n+/g, '   '),
    bg: safeHex(els.bgHex.value.trim(), '#000000'),
    fg: safeHex(els.fgHex.value.trim(), '#ff3b30'),
    width: Math.max(320, Number(els.width.value) || 960),
    height: Math.max(120, Number(els.height.value) || 240),
    speed: Math.max(20, Number(els.speed.value) || 120),
    fontScale: Math.max(0.6, Number(els.fontScale.value) || 1.2),
    dotSize: Math.max(6, Number(els.dotSize.value) || 12),
    gap: Math.max(1, Number(els.gap.value) || 3),
    fps: Math.max(10, Number(els.fps.value) || 30),
    duration: Math.max(1, Number(els.duration.value) || 5)
  };
}
function invalidate() { state.cacheKey = ''; state.pattern = null; }
function syncCanvas(c) {
  if (els.screen.width !== c.width || els.screen.height !== c.height) {
    els.screen.width = c.width; els.screen.height = c.height;
  }
  els.meta.textContent = `${c.width} × ${c.height} px`;
}
function patternKey(c) { return [c.message,c.bg,c.fg,c.width,c.height,c.dotSize,c.gap,c.fontScale].join('|'); }

function buildPattern(c) {
  syncCanvas(c);
  const step = c.dotSize + c.gap;
  const cols = Math.max(1, Math.floor(c.width / step));
  const rows = Math.max(1, Math.floor(c.height / step));
  const fontSize = Math.max(16, Math.floor(rows * c.dotSize * 0.92 * c.fontScale));
  const padX = c.dotSize * 2;

  glyphCtx.font = `900 ${fontSize}px sans-serif`;
  const textW = Math.ceil(glyphCtx.measureText(c.message).width + padX * 2);
  glyphCanvas.width = Math.max(textW, cols + padX * 2);
  glyphCanvas.height = rows;

  glyphCtx.clearRect(0, 0, glyphCanvas.width, glyphCanvas.height);
  glyphCtx.fillStyle = '#000';
  glyphCtx.fillRect(0, 0, glyphCanvas.width, glyphCanvas.height);
  glyphCtx.fillStyle = '#fff';
  glyphCtx.textBaseline = 'middle';
  glyphCtx.textAlign = 'left';
  glyphCtx.font = `900 ${fontSize}px sans-serif`;
  glyphCtx.fillText(c.message, padX, glyphCanvas.height / 2 + fontSize * 0.02);

  const data = glyphCtx.getImageData(0, 0, glyphCanvas.width, glyphCanvas.height).data;
  const lit = new Uint8Array(glyphCanvas.width * glyphCanvas.height);
  for (let y = 0; y < glyphCanvas.height; y++) {
    for (let x = 0; x < glyphCanvas.width; x++) {
      const i = (y * glyphCanvas.width + x) * 4;
      lit[y * glyphCanvas.width + x] = data[i + 3] > 10 && data[i] > 10 ? 1 : 0;
    }
  }

  return { step, cols, rows, glyphWidth: glyphCanvas.width, glyphHeight: glyphCanvas.height, lit, off: shade(c.bg, 30), glow: rgba(c.fg, .22) };
}

function getPattern(c) {
  const key = patternKey(c);
  if (state.pattern && state.cacheKey === key) { syncCanvas(c); return state.pattern; }
  state.pattern = buildPattern(c); state.cacheKey = key; return state.pattern;
}

function draw() {
  const c = config();
  const p = getPattern(c);
  const radius = c.dotSize / 2;
  const step = p.step;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, els.screen.width, els.screen.height);

  const cycle = p.glyphWidth + p.cols + 2;
  const offsetCells = state.offsetPx / step;

  for (let row = 0; row < p.rows; row++) {
    const cy = row * step + radius + c.gap / 2;
    for (let col = 0; col < p.cols; col++) {
      const cx = col * step + radius + c.gap / 2;
      let gx = Math.floor(col + offsetCells);
      gx = ((gx % cycle) + cycle) % cycle;
      gx -= p.cols;
      const on = gx >= 0 && gx < p.glyphWidth && row < p.glyphHeight ? p.lit[row * p.glyphWidth + gx] === 1 : false;
      ctx.beginPath();
      ctx.arc(cx, cy, on ? radius : radius * .92, 0, Math.PI * 2);
      if (on) {
        ctx.fillStyle = c.fg;
        ctx.shadowBlur = c.dotSize * 1.15;
        ctx.shadowColor = p.glow;
      } else {
        ctx.fillStyle = p.off;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

function updateReadouts() {
  const c = config();
  els.speedOut.value = `${c.speed} px/s`;
  els.fontScaleOut.value = `${c.fontScale.toFixed(1)} 倍`;
  els.dotSizeOut.value = `${c.dotSize} px`;
  els.gapOut.value = `${c.gap} px`;
  els.fpsOut.value = `${c.fps} fps`;
  els.durationOut.value = `${c.duration} 秒`;
  els.speedStat.textContent = `${c.speed} px/s`;
  els.dotStat.textContent = `${c.dotSize} px`;
  els.recordStat.textContent = `${c.duration} 秒 / ${c.fps} fps`;
  els.meta.textContent = `${c.width} × ${c.height} px`;
}

function syncPreset() {
  const key = `${Math.max(320, Number(els.width.value) || 960)}x${Math.max(120, Number(els.height.value) || 240)}`;
  els.preset.value = PRESETS[key] ? key : 'custom';
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveImage(type) {
  setStatus(`${type.toUpperCase()} を生成中...`);
  draw();
  const mime = type === 'png' ? 'image/png' : 'image/webp';
  const blob = await new Promise((resolve) => els.screen.toBlob(resolve, mime, .95));
  if (!blob) throw new Error(`${type.toUpperCase()} の生成に失敗しました。`);
  download(blob, `led-board.${type}`);
  setStatus(`${type.toUpperCase()} を保存しました`);
}

async function recordWebmBlob(sec, fps) {
  if (!window.MediaRecorder) throw new Error('このブラウザは MediaRecorder に対応していません。');
  const stream = els.screen.captureStream(fps);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  if (!mime) throw new Error('このブラウザは WebM 録画に対応していません。');

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const wasRunning = state.running;
  if (!state.running) { state.running = true; els.toggle.textContent = 'プレビュー停止'; }

  return new Promise((resolve, reject) => {
    recorder.onerror = (e) => reject(e.error || new Error('録画に失敗しました。'));
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!wasRunning) { state.running = false; els.toggle.textContent = 'プレビュー再開'; }
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.start(200);
    setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, sec * 1000);
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
  state.ffmpeg = ffmpeg; state.ffmpegLoaded = true; return ffmpeg;
}

async function toMp4(webmBlob) {
  const ffmpeg = await ensureFFmpeg();
  const { fetchFile } = window.FFmpegUtil;
  await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
  await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', 'output.mp4']);
  const data = await ffmpeg.readFile('output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

async function saveVideo(format) {
  if (state.recorderBusy) return;
  state.recorderBusy = true;
  els.saveWebm.disabled = true; els.saveMp4.disabled = true;
  try {
    const c = config();
    setStatus(`${format.toUpperCase()} 用に ${c.duration} 秒録画中...`);
    const webm = await recordWebmBlob(c.duration, c.fps);
    if (format === 'webm') {
      download(webm, 'led-board.webm');
      setStatus('WebM を保存しました');
    } else {
      setStatus('MP4 に変換中...');
      const mp4 = await toMp4(webm);
      download(mp4, 'led-board.mp4');
      setStatus('MP4 を保存しました');
    }
  } catch (err) {
    console.error(err);
    setStatus('保存に失敗しました');
    alert(err.message || '保存に失敗しました。');
  } finally {
    state.recorderBusy = false;
    els.saveWebm.disabled = false; els.saveMp4.disabled = false;
  }
}

function tick(now) {
  const c = config();
  const p = getPattern(c);
  const dt = Math.min(.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  if (state.running) {
    state.offsetPx += c.speed * dt;
    const cyclePx = (p.glyphWidth + p.cols + 2) * p.step;
    if (state.offsetPx >= cyclePx) state.offsetPx = 0;
  }
  draw();
  requestAnimationFrame(tick);
}

function bindColor(colorEl, hexEl, fallback) {
  colorEl.addEventListener('input', () => { hexEl.value = safeHex(colorEl.value.trim(), fallback); invalidate(); setStatus('色設定を更新しました'); });
  hexEl.addEventListener('input', () => { const v = hexEl.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { colorEl.value = v; invalidate(); setStatus('色設定を更新しました'); } });
  hexEl.addEventListener('blur', () => { const v = safeHex(hexEl.value.trim(), fallback); hexEl.value = v; colorEl.value = v; invalidate(); });
}

bindColor(els.bgColor, els.bgHex, '#000000');
bindColor(els.fgColor, els.fgHex, '#ff3b30');

els.preset.addEventListener('change', () => {
  if (els.preset.value !== 'custom') {
    const [w, h] = PRESETS[els.preset.value];
    els.width.value = w; els.height.value = h; invalidate(); updateReadouts(); setStatus('表示サイズを更新しました');
  }
});
[els.width, els.height].forEach((el) => el.addEventListener('input', () => { syncPreset(); invalidate(); updateReadouts(); setStatus('表示サイズを更新しました'); }));
[els.message, els.speed, els.fontScale, els.dotSize, els.gap, els.fps, els.duration].forEach((el) => el.addEventListener('input', () => {
  if ([els.message, els.fontScale, els.dotSize, els.gap].includes(el)) invalidate();
  updateReadouts(); setStatus('設定を更新しました');
}));

els.toggle.addEventListener('click', () => {
  state.running = !state.running;
  els.toggle.textContent = state.running ? 'プレビュー停止' : 'プレビュー再開';
  setStatus(state.running ? 'プレビュー再生中' : 'プレビュー停止中');
});
els.reset.addEventListener('click', () => { state.offsetPx = 0; draw(); setStatus('表示位置をリセットしました'); });
els.savePng.addEventListener('click', () => saveImage('png').catch((e) => { alert(e.message); setStatus('保存に失敗しました'); }));
els.saveWebp.addEventListener('click', () => saveImage('webp').catch((e) => { alert(e.message); setStatus('保存に失敗しました'); }));
els.saveWebm.addEventListener('click', () => saveVideo('webm'));
els.saveMp4.addEventListener('click', () => saveVideo('mp4'));

updateReadouts();
draw();
setStatus('プレビュー再生中');
requestAnimationFrame(tick);
