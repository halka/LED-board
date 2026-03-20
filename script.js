const $ = (id) => document.getElementById(id);

const FONT_OPTIONS = {
  biz: '"BIZ UDPGothic","BIZ UDPゴシック","Noto Sans JP","Yu Gothic","Meiryo",sans-serif',
  noto: '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif',
  yu: '"Yu Gothic","Meiryo","Noto Sans JP",sans-serif',
  me: '"Meiryo","Yu Gothic","Noto Sans JP",sans-serif',
  mono: '"Courier New",monospace',
  serif: 'serif',
  sans: 'sans-serif'
};

const els = {
  width: $('width'),
  height: $('height'),
  bgColor: $('bgColor'),
  bgHex: $('bgHex'),
  dotSize: $('dotSize'),
  gap: $('gap'),
  fps: $('fps'),
  duration: $('duration'),
  layers: $('layers'),
  addLayer: $('addLayer'),
  meta: $('meta'),
  status: $('status'),
  layerStat: $('layerStat'),
  dotStat: $('dotStat'),
  recordStat: $('recordStat'),
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

const state = {
  running: true,
  lastTime: performance.now(),
  recorderBusy: false,
  ffmpeg: null,
  ffmpegLoaded: false,
  nextLayerId: 3,
  drag: null,
  layers: [
    {
      id: 1,
      text: 'LED電光掲示板',
      color: '#ffb300',
      x: 48,
      y: 54,
      fontPx: 112,
      fontFamily: 'biz',
      align: 'left',
      scroll: false,
      speed: 120,
      blink: false,
      blinkMs: 900,
      outline: true,
      outlineColor: '#fff2cf',
      outlineWidth: 6,
      offset: 0
    },
    {
      id: 2,
      text: '色・位置・サイズ・フォントを自由設定',
      color: '#6ef26b',
      x: 48,
      y: 206,
      fontPx: 54,
      fontFamily: 'noto',
      align: 'left',
      scroll: true,
      speed: 120,
      blink: false,
      blinkMs: 900,
      outline: false,
      outlineColor: '#ffffff',
      outlineWidth: 4,
      offset: 0
    }
  ]
};

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toConfig() {
  return {
    width: positive(els.width.value, 1280),
    height: positive(els.height.value, 320),
    bg: safeHex(els.bgHex.value.trim(), '#050505'),
    dotSize: positive(els.dotSize.value, 10),
    gap: finite(els.gap.value, 2),
    fps: positive(els.fps.value, 30),
    duration: positive(els.duration.value, 5)
  };
}

function setStatus(text) {
  els.status.textContent = text;
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
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r}, ${g}, ${b})`;
}

function fontFamilyCss(key) {
  return FONT_OPTIONS[key] || FONT_OPTIONS.biz;
}

function syncCanvas(config) {
  if (els.screen.width !== config.width || els.screen.height !== config.height) {
    els.screen.width = config.width;
    els.screen.height = config.height;
  }
  els.meta.textContent = `${config.width} × ${config.height} px`;
  els.dotStat.textContent = `${config.dotSize} px / gap ${config.gap} px`;
  els.recordStat.textContent = `${config.duration} 秒 / ${config.fps} fps`;
  els.layerStat.textContent = String(state.layers.length);
}

function resetOffsets() {
  for (const layer of state.layers) layer.offset = 0;
}

function normalizeLayer(layer) {
  return {
    ...layer,
    color: safeHex(layer.color, '#ffb300'),
    outlineColor: safeHex(layer.outlineColor || '#ffffff', '#ffffff'),
    x: finite(layer.x, 0),
    y: finite(layer.y, 0),
    fontPx: positive(layer.fontPx, 48),
    speed: positive(layer.speed, 120),
    blinkMs: positive(layer.blinkMs, 900),
    outlineWidth: positive(layer.outlineWidth, 4),
    fontFamily: layer.fontFamily || 'biz'
  };
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderLayerControls() {
  els.layers.innerHTML = '';
  state.layers.forEach((layer, index) => {
    const item = normalizeLayer(layer);
    const wrap = document.createElement('div');
    wrap.className = 'layer-card';
    wrap.innerHTML = `
      <div class="layer-head">
        <div class="layer-title">文字 ${index + 1} <span class="muted">表示順 ${index + 1}/${state.layers.length}</span></div>
        <div class="actions-inline">
          <button class="btn btn-sub btn-small layer-send-back" type="button" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>最背面</button>
          <button class="btn btn-sub btn-small layer-backward" type="button" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>後ろへ</button>
          <button class="btn btn-sub btn-small layer-forward" type="button" data-id="${item.id}" ${index === state.layers.length - 1 ? 'disabled' : ''}>前へ</button>
          <button class="btn btn-sub btn-small layer-bring-front" type="button" data-id="${item.id}" ${index === state.layers.length - 1 ? 'disabled' : ''}>最前面</button>
          <button class="btn btn-sub btn-small duplicate-layer" type="button" data-id="${item.id}">複製</button>
          <button class="btn btn-sub btn-small remove-layer" type="button" data-id="${item.id}" ${state.layers.length === 1 ? 'disabled' : ''}>削除</button>
        </div>
      </div>

      <label class="field">
        <span>テキスト</span>
        <textarea class="layer-input" data-id="${item.id}" data-key="text" rows="3">${escapeHtml(item.text)}</textarea>
      </label>

      <div class="grid three">
        <label class="field">
          <span>文字色</span>
          <div class="color-row">
            <input class="layer-color" data-id="${item.id}" data-key="color" type="color" value="${item.color}">
            <input class="layer-hex" data-id="${item.id}" data-key="color" type="text" value="${item.color}">
          </div>
        </label>
        <label class="field">
          <span>文字サイズ(px)</span>
          <input class="layer-number" data-id="${item.id}" data-key="fontPx" type="number" value="${item.fontPx}" step="1">
        </label>
        <label class="field">
          <span>フォント</span>
          <select class="layer-select" data-id="${item.id}" data-key="fontFamily">
            <option value="biz" ${item.fontFamily === 'biz' ? 'selected' : ''}>BIZ UDPGothic</option>
            <option value="noto" ${item.fontFamily === 'noto' ? 'selected' : ''}>Noto Sans JP</option>
            <option value="yu" ${item.fontFamily === 'yu' ? 'selected' : ''}>Yu Gothic</option>
            <option value="me" ${item.fontFamily === 'me' ? 'selected' : ''}>Meiryo</option>
            <option value="mono" ${item.fontFamily === 'mono' ? 'selected' : ''}>Monospace</option>
            <option value="serif" ${item.fontFamily === 'serif' ? 'selected' : ''}>Serif</option>
            <option value="sans" ${item.fontFamily === 'sans' ? 'selected' : ''}>Sans Serif</option>
          </select>
        </label>
      </div>

      <div class="grid three">
        <label class="field">
          <span>X座標(px)</span>
          <input class="layer-number" data-id="${item.id}" data-key="x" type="number" value="${item.x}" step="1">
        </label>
        <label class="field">
          <span>Y座標(px)</span>
          <input class="layer-number" data-id="${item.id}" data-key="y" type="number" value="${item.y}" step="1">
        </label>
        <label class="field">
          <span>揃え</span>
          <select class="layer-select" data-id="${item.id}" data-key="align">
            <option value="left" ${item.align === 'left' ? 'selected' : ''}>左</option>
            <option value="center" ${item.align === 'center' ? 'selected' : ''}>中央</option>
            <option value="right" ${item.align === 'right' ? 'selected' : ''}>右</option>
          </select>
        </label>
      </div>

      <div class="check-list">
        <label class="field">
          <span>横スクロール</span>
          <label class="switch-row">
            <input class="layer-check" data-id="${item.id}" data-key="scroll" type="checkbox" ${item.scroll ? 'checked' : ''}>
            <span>有効</span>
          </label>
        </label>
        <label class="field">
          <span>点滅</span>
          <label class="switch-row">
            <input class="layer-check" data-id="${item.id}" data-key="blink" type="checkbox" ${item.blink ? 'checked' : ''}>
            <span>有効</span>
          </label>
        </label>
      </div>

      <div class="grid two">
        <label class="field">
          <span>スクロール速度(px/s)</span>
          <input class="layer-number" data-id="${item.id}" data-key="speed" type="number" value="${item.speed}" step="1">
        </label>
        <label class="field">
          <span>点滅間隔(ms)</span>
          <input class="layer-number" data-id="${item.id}" data-key="blinkMs" type="number" value="${item.blinkMs}" step="1">
        </label>
      </div>

      <div class="check-list">
        <label class="field">
          <span>縁取り</span>
          <label class="switch-row">
            <input class="layer-check" data-id="${item.id}" data-key="outline" type="checkbox" ${item.outline ? 'checked' : ''}>
            <span>有効</span>
          </label>
        </label>
        <label class="field">
          <span>縁取り太さ(px)</span>
          <input class="layer-number" data-id="${item.id}" data-key="outlineWidth" type="number" value="${item.outlineWidth}" step="1">
        </label>
      </div>

      <div class="grid two">
        <label class="field">
          <span>縁取り色</span>
          <div class="color-row">
            <input class="layer-outline-color" data-id="${item.id}" data-key="outlineColor" type="color" value="${item.outlineColor}">
            <input class="layer-outline-hex" data-id="${item.id}" data-key="outlineColor" type="text" value="${item.outlineColor}">
          </div>
        </label>
      </div>
    `;
    els.layers.appendChild(wrap);
  });
  bindLayerControlEvents();
  syncCanvas(toConfig());
}

function updateLayer(id, key, rawValue, inputType = 'text') {
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) return;
  if (inputType === 'check') {
    layer[key] = Boolean(rawValue);
  } else if (key === 'color' || key === 'outlineColor') {
    layer[key] = safeHex(String(rawValue).trim(), layer[key] || '#ffffff');
  } else if (['x', 'y', 'fontPx', 'speed', 'blinkMs', 'outlineWidth'].includes(key)) {
    layer[key] = Number(rawValue);
  } else {
    layer[key] = rawValue;
  }
  setStatus('設定を更新しました');
}


function moveLayer(id, mode) {
  const index = state.layers.findIndex((item) => item.id === id);
  if (index < 0) return;

  const [layer] = state.layers.splice(index, 1);
  if (mode === 'front') {
    state.layers.push(layer);
  } else if (mode === 'back') {
    state.layers.unshift(layer);
  } else if (mode === 'forward') {
    state.layers.splice(Math.min(index + 1, state.layers.length), 0, layer);
  } else if (mode === 'backward') {
    state.layers.splice(Math.max(index - 1, 0), 0, layer);
  } else {
    state.layers.splice(index, 0, layer);
  }

  renderLayerControls();
  draw();
}

function bindLayerControlEvents() {
  els.layers.querySelectorAll('.layer-input').forEach((node) => {
    node.addEventListener('input', (event) => {
      updateLayer(Number(event.target.dataset.id), event.target.dataset.key, event.target.value);
    });
  });

  els.layers.querySelectorAll('.layer-number').forEach((node) => {
    node.addEventListener('input', (event) => {
      updateLayer(Number(event.target.dataset.id), event.target.dataset.key, event.target.value, 'number');
    });
  });

  els.layers.querySelectorAll('.layer-select').forEach((node) => {
    node.addEventListener('change', (event) => {
      updateLayer(Number(event.target.dataset.id), event.target.dataset.key, event.target.value);
    });
  });

  els.layers.querySelectorAll('.layer-check').forEach((node) => {
    node.addEventListener('change', (event) => {
      updateLayer(Number(event.target.dataset.id), event.target.dataset.key, event.target.checked, 'check');
    });
  });

  function bindHexPair(colorSelector, hexSelector, key) {
    els.layers.querySelectorAll(colorSelector).forEach((node) => {
      node.addEventListener('input', (event) => {
        const id = Number(event.target.dataset.id);
        const value = safeHex(event.target.value, '#ffffff');
        updateLayer(id, key, value);
        const hexInput = els.layers.querySelector(`${hexSelector}[data-id="${id}"]`);
        if (hexInput) hexInput.value = value;
      });
    });

    els.layers.querySelectorAll(hexSelector).forEach((node) => {
      node.addEventListener('input', (event) => {
        const id = Number(event.target.dataset.id);
        const value = event.target.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          updateLayer(id, key, value);
          const colorInput = els.layers.querySelector(`${colorSelector}[data-id="${id}"]`);
          if (colorInput) colorInput.value = value;
        }
      });
      node.addEventListener('blur', (event) => {
        const id = Number(event.target.dataset.id);
        const layer = state.layers.find((item) => item.id === id);
        if (!layer) return;
        const current = key === 'outlineColor' ? layer.outlineColor : layer.color;
        const value = safeHex(event.target.value.trim(), current);
        event.target.value = value;
        if (key === 'outlineColor') layer.outlineColor = value;
        else layer.color = value;
        const colorInput = els.layers.querySelector(`${colorSelector}[data-id="${id}"]`);
        if (colorInput) colorInput.value = value;
      });
    });
  }

  bindHexPair('.layer-color', '.layer-hex', 'color');
  bindHexPair('.layer-outline-color', '.layer-outline-hex', 'outlineColor');

  els.layers.querySelectorAll('.remove-layer').forEach((node) => {
    node.addEventListener('click', (event) => {
      const id = Number(event.target.dataset.id);
      state.layers = state.layers.filter((layer) => layer.id !== id);
      renderLayerControls();
      setStatus('文字を削除しました');
    });
  });

  els.layers.querySelectorAll('.layer-bring-front').forEach((node) => {
    node.addEventListener('click', (event) => {
      moveLayer(Number(event.target.dataset.id), 'front');
      setStatus('文字を最前面に移動しました');
    });
  });

  els.layers.querySelectorAll('.layer-send-back').forEach((node) => {
    node.addEventListener('click', (event) => {
      moveLayer(Number(event.target.dataset.id), 'back');
      setStatus('文字を最背面に移動しました');
    });
  });

  els.layers.querySelectorAll('.layer-forward').forEach((node) => {
    node.addEventListener('click', (event) => {
      moveLayer(Number(event.target.dataset.id), 'forward');
      setStatus('文字を一つ前へ移動しました');
    });
  });

  els.layers.querySelectorAll('.layer-backward').forEach((node) => {
    node.addEventListener('click', (event) => {
      moveLayer(Number(event.target.dataset.id), 'backward');
      setStatus('文字を一つ後ろへ移動しました');
    });
  });

  els.layers.querySelectorAll('.duplicate-layer').forEach((node) => {
    node.addEventListener('click', (event) => {
      const id = Number(event.target.dataset.id);
      const layer = state.layers.find((item) => item.id === id);
      if (!layer) return;
      state.layers.push({
        ...structuredClone(layer),
        id: state.nextLayerId++,
        y: finite(layer.y, 0) + 60
      });
      renderLayerControls();
      setStatus('文字を複製しました');
    });
  });
}

function bindColor(colorEl, hexEl, fallback) {
  colorEl.addEventListener('input', () => {
    const value = safeHex(colorEl.value.trim(), fallback);
    hexEl.value = value;
    setStatus('色設定を更新しました');
  });
  hexEl.addEventListener('input', () => {
    const value = hexEl.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      colorEl.value = value;
      setStatus('色設定を更新しました');
    }
  });
  hexEl.addEventListener('blur', () => {
    const value = safeHex(hexEl.value.trim(), fallback);
    hexEl.value = value;
    colorEl.value = value;
  });
}

function shouldShowLayer(layer, now) {
  if (!layer.blink) return true;
  const ms = positive(layer.blinkMs, 900);
  return (now % (ms * 2)) < ms;
}

function textMetricsPx(layer) {
  const item = normalizeLayer(layer);
  ctx.font = `900 ${item.fontPx}px ${fontFamilyCss(item.fontFamily)}`;
  const width = ctx.measureText(item.text || ' ').width;
  const height = item.fontPx;
  return { width, height };
}

function anchorXToStartX(anchorX, align, width) {
  if (align === 'center') return anchorX - width / 2;
  if (align === 'right') return anchorX - width;
  return anchorX;
}

function hitTestLayer(x, y) {
  for (let i = state.layers.length - 1; i >= 0; i -= 1) {
    const layer = normalizeLayer(state.layers[i]);
    const metrics = textMetricsPx(layer);
    const anchorX = layer.x + layer.offset;
    const startX = anchorXToStartX(anchorX, layer.align, metrics.width);
    const startY = layer.y;
    if (x >= startX && x <= startX + metrics.width && y >= startY && y <= startY + metrics.height) {
      return state.layers[i];
    }
  }
  return null;
}

function buildColorCells(config, now) {
  syncCanvas(config);
  const step = Math.max(1, config.dotSize + config.gap);
  const cols = Math.max(1, Math.floor(config.width / step));
  const rows = Math.max(1, Math.floor(config.height / step));
  const colors = new Array(cols * rows).fill(null);

  maskCanvas.width = cols;
  maskCanvas.height = rows;

  function mergeColor(color, overwrite) {
    const image = maskCtx.getImageData(0, 0, cols, rows).data;
    for (let i = 0; i < colors.length; i += 1) {
      if (image[i * 4 + 3] > 0 && (overwrite || colors[i] === null)) {
        colors[i] = color;
      }
    }
  }

  state.layers.forEach((rawLayer) => {
    const layer = normalizeLayer(rawLayer);
    if (!shouldShowLayer(layer, now)) return;

    const fontCells = Math.max(1, layer.fontPx / step);
    const xCells = (layer.x + layer.offset) / step;
    const yCells = layer.y / step;

    maskCtx.clearRect(0, 0, cols, rows);
    maskCtx.textBaseline = 'top';
    maskCtx.textAlign = layer.align;
    maskCtx.lineJoin = 'round';
    maskCtx.lineCap = 'round';
    maskCtx.font = `900 ${fontCells}px ${fontFamilyCss(layer.fontFamily)}`;

    if (layer.outline && positive(layer.outlineWidth, 4) > 0) {
      maskCtx.strokeStyle = '#fff';
      maskCtx.lineWidth = Math.max(1, layer.outlineWidth / step);
      maskCtx.strokeText(layer.text, xCells, yCells);
      mergeColor(layer.outlineColor, false);
      maskCtx.clearRect(0, 0, cols, rows);
      maskCtx.textBaseline = 'top';
      maskCtx.textAlign = layer.align;
      maskCtx.lineJoin = 'round';
      maskCtx.lineCap = 'round';
      maskCtx.font = `900 ${fontCells}px ${fontFamilyCss(layer.fontFamily)}`;
    }

    maskCtx.fillStyle = '#fff';
    maskCtx.fillText(layer.text, xCells, yCells);
    mergeColor(layer.color, true);
  });

  return { cols, rows, step, colors };
}

function draw() {
  const config = toConfig();
  const now = performance.now();
  const { cols, rows, step, colors } = buildColorCells(config, now);
  const radius = config.dotSize / 2;
  const offFill = tone(config.bg, 24);

  ctx.fillStyle = config.bg;
  ctx.fillRect(0, 0, config.width, config.height);

  for (let row = 0; row < rows; row += 1) {
    const cy = row * step + radius + config.gap / 2;
    for (let col = 0; col < cols; col += 1) {
      const cx = col * step + radius + config.gap / 2;
      const color = colors[row * cols + col];
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      if (color) {
        ctx.fillStyle = color;
        ctx.shadowBlur = config.dotSize * 1.15;
        ctx.shadowColor = rgba(color, .28);
      } else {
        ctx.fillStyle = offFill;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

function tick(now) {
  const config = toConfig();
  const dt = Math.min(.05, (now - state.lastTime) / 1000);
  state.lastTime = now;

  if (state.running && !state.drag) {
    state.layers.forEach((layer) => {
      if (!layer.scroll) return;
      const item = normalizeLayer(layer);
      layer.offset -= item.speed * dt;
      const metrics = textMetricsPx(item);
      const resetWidth = config.width + metrics.width + item.fontPx;
      if (layer.offset < -resetWidth) {
        layer.offset = config.width + item.fontPx;
      }
    });
  }

  draw();
  requestAnimationFrame(tick);
}

function getPointerCanvasPoint(event) {
  const rect = els.screen.getBoundingClientRect();
  const scaleX = els.screen.width / rect.width;
  const scaleY = els.screen.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

els.screen.addEventListener('pointerdown', (event) => {
  const point = getPointerCanvasPoint(event);
  const layer = hitTestLayer(point.x, point.y);
  if (!layer) return;
  const anchorX = finite(layer.x, 0) + finite(layer.offset, 0);
  const anchorY = finite(layer.y, 0);
  state.drag = {
    id: layer.id,
    anchorDx: point.x - anchorX,
    anchorDy: point.y - anchorY
  };
  els.screen.classList.add('dragging');
  els.screen.setPointerCapture(event.pointerId);
  setStatus('文字をドラッグ中');
});

els.screen.addEventListener('pointermove', (event) => {
  if (!state.drag) return;
  const layer = state.layers.find((item) => item.id === state.drag.id);
  if (!layer) return;
  const point = getPointerCanvasPoint(event);
  layer.x = point.x - state.drag.anchorDx - finite(layer.offset, 0);
  layer.y = point.y - state.drag.anchorDy;
  draw();
});

function finishDrag() {
  if (!state.drag) return;
  state.drag = null;
  els.screen.classList.remove('dragging');
  renderLayerControls();
  setStatus('文字位置を更新しました');
}

els.screen.addEventListener('pointerup', finishDrag);
els.screen.addEventListener('pointercancel', finishDrag);

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
  const blob = await new Promise((resolve) => els.screen.toBlob(resolve, mime, .95));
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
  await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', 'output.mp4']);
  const data = await ffmpeg.readFile('output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

async function saveVideo(format) {
  if (state.recorderBusy) return;
  state.recorderBusy = true;
  els.saveWebm.disabled = true;
  els.saveMp4.disabled = true;

  try {
    const config = toConfig();
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

els.addLayer.addEventListener('click', () => {
  state.layers.push({
    id: state.nextLayerId++,
    text: '新しい文字',
    color: '#ff6b57',
    x: 48,
    y: 120,
    fontPx: 60,
    fontFamily: 'biz',
    align: 'left',
    scroll: false,
    speed: 120,
    blink: false,
    blinkMs: 900,
    outline: false,
    outlineColor: '#ffffff',
    outlineWidth: 4,
    offset: 0
  });
  renderLayerControls();
  setStatus('文字を追加しました');
});

[els.width, els.height, els.dotSize, els.gap, els.fps, els.duration].forEach((node) => {
  node.addEventListener('input', () => {
    syncCanvas(toConfig());
    setStatus('全体設定を更新しました');
  });
});

bindColor(els.bgColor, els.bgHex, '#050505');

els.toggle.addEventListener('click', () => {
  state.running = !state.running;
  els.toggle.textContent = state.running ? 'プレビュー停止' : 'プレビュー再開';
  setStatus(state.running ? 'プレビュー再生中' : 'プレビュー停止中');
});

els.reset.addEventListener('click', () => {
  resetOffsets();
  draw();
  setStatus('スクロール位置をリセットしました');
});

els.savePng.addEventListener('click', () => saveImage('png').catch((error) => {
  alert(error.message);
  setStatus('保存に失敗しました');
}));

els.saveWebp.addEventListener('click', () => saveImage('webp').catch((error) => {
  alert(error.message);
  setStatus('保存に失敗しました');
}));

els.saveWebm.addEventListener('click', () => saveVideo('webm'));
els.saveMp4.addEventListener('click', () => saveVideo('mp4'));

renderLayerControls();
syncCanvas(toConfig());
draw();
setStatus('プレビュー再生中');
requestAnimationFrame(tick);
