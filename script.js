const $ = (id) => document.getElementById(id);

// ── フォント定義 ──────────────────────────────────────────────
// ゴシック体・明朝体はシステム搭載フォントを OS ごとに優先度付きで並べる
const FONT_OPTIONS = {
  // ゴシック体（システム）
  biz:     '"BIZ UDPGothic","BIZ UDPゴシック","Noto Sans JP","Yu Gothic","Meiryo",sans-serif',
  hira:    '"Hiragino Sans","ヒラギノ角ゴ ProN W3","BIZ UDPGothic","Yu Gothic",sans-serif',
  yu:      '"Yu Gothic","游ゴシック","Meiryo","Noto Sans JP",sans-serif',
  me:      '"Meiryo","メイリオ","Yu Gothic","Noto Sans JP",sans-serif',
  noto:    '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif',
  sans:    'sans-serif',
  // 明朝体（システム）
  hiraMin: '"Hiragino Mincho ProN","ヒラギノ明朝 ProN W3","Yu Mincho","Noto Serif JP",serif',
  yumin:   '"Yu Mincho","游明朝","YuMincho","Hiragino Mincho ProN","Noto Serif JP",serif',
  notoser: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif',
  serif:   'serif',
  // 等幅
  mono:    '"Courier New",monospace',
  // カスタム（端末フォント）
  custom:  null
};

// ── DOM refs ─────────────────────────────────────────────────
const els = {
  // preview
  screen: $('screen'),
  meta: $('meta'),
  status: $('status'),
  layerStat: $('layerStat'),
  dotStat: $('dotStat'),
  recordStat: $('recordStat'),
  // settings inputs (inside settingsModal)
  width: $('width'),
  height: $('height'),
  bgColor: $('bgColor'),
  bgHex: $('bgHex'),
  dotSize: $('dotSize'),
  gap: $('gap'),
  fps: $('fps'),
  duration: $('duration'),
  // layers
  layers: $('layers'),
  addLayer: $('addLayer'),
  // control modal
  toggle: $('toggle'),
  reset: $('reset'),
  // save modal
  savePng: $('savePng'),
  saveWebp: $('saveWebp'),
  saveWebm: $('saveWebm'),
  saveMp4: $('saveMp4'),
  recordProgressWrap: $('recordProgressWrap'),
  recordProgress: $('recordProgress'),
  recordProgressText: $('recordProgressText'),
  // action buttons
  openControl: $('openControl'),
  openSettings: $('openSettings'),
  openSave: $('openSave'),
  // modals
  controlModal: $('controlModal'),
  settingsModal: $('settingsModal'),
  saveModal: $('saveModal')
};

const ctx = els.screen.getContext('2d');
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

const state = {
  running: true,
  lastTime: performance.now(),
  recorderBusy: false,
  nextLayerId: 1,
  drag: null,
  layers: []
};

// ── Modal helpers ─────────────────────────────────────────────
function openModal(dialog) {
  dialog.showModal();
}
function closeModal(dialog) {
  dialog.close();
}

// Close on backdrop click
['controlModal', 'settingsModal', 'saveModal'].forEach((id) => {
  const dialog = $(id);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

// Close buttons
document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.modal;
    if (target) $(target).close();
  });
});

els.openControl.addEventListener('click', () => openModal(els.controlModal));
els.openSettings.addEventListener('click', () => openModal(els.settingsModal));
els.openSave.addEventListener('click', () => openModal(els.saveModal));

// ── Utilities ─────────────────────────────────────────────────
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
function iso8601BasicNow() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function buildDownloadName(ext) {
  return `led-board_${iso8601BasicNow()}.${ext}`;
}

// ── Config ───────────────────────────────────────────────────
function getLayerAnchorForLeftEdge(leftEdge, align, textWidth) {
  if (align === 'center') return leftEdge + textWidth / 2;
  if (align === 'right') return leftEdge + textWidth;
  return leftEdge;
}
function getScrollStartOffset(layer, config) {
  const metrics = textMetricsPx(layer);
  const startAnchor = getLayerAnchorForLeftEdge(config.width, layer.align, metrics.width);
  return startAnchor - layer.x;
}
function getScrollEndOffset(layer, config) {
  const metrics = textMetricsPx(layer);
  const endAnchor = getLayerAnchorForLeftEdge(-metrics.width, layer.align, metrics.width);
  return endAnchor - layer.x;
}
function getScrollDuration(layer, config) {
  const startOffset = getScrollStartOffset(layer, config);
  const endOffset = getScrollEndOffset(layer, config);
  return Math.max(0, (startOffset - endOffset) / Math.max(1, layer.speed));
}

function snapshotAnimationState() {
  return {
    running: state.running,
    offsets: state.layers.map((layer) => ({ id: layer.id, offset: finite(layer.offset, 0) }))
  };
}
function restoreAnimationState(snapshot) {
  if (!snapshot) return;
  state.running = snapshot.running;
  for (const saved of snapshot.offsets) {
    const layer = state.layers.find((item) => item.id === saved.id);
    if (layer) layer.offset = saved.offset;
  }
  els.toggle.textContent = state.running ? 'プレビュー停止' : 'プレビュー再開';
}

function prepareRecordingAnimation(config) {
  state.layers.forEach((rawLayer) => {
    const layer = normalizeLayer(rawLayer);
    if (layer.scroll) rawLayer.offset = getScrollStartOffset(layer, config);
  });
}

function calculateAutoDuration(baseConfig) {
  let duration = 1;
  let longestBlinkCycle = 0;

  for (const rawLayer of state.layers) {
    const layer = normalizeLayer(rawLayer);
    if (layer.scroll) {
      duration = Math.max(duration, getScrollDuration(layer, baseConfig));
    }
    if (layer.blink) {
      const blinkCycle = (Math.max(1, layer.blinkMs) * 2) / 1000;
      longestBlinkCycle = Math.max(longestBlinkCycle, blinkCycle);
      duration = Math.max(duration, blinkCycle);
    }
  }

  if (longestBlinkCycle > 0) {
    duration = Math.ceil(duration / longestBlinkCycle) * longestBlinkCycle;
  }
  duration = Math.ceil(duration * baseConfig.fps) / baseConfig.fps;
  return Math.max(1, Number(duration.toFixed(3)));
}

function toConfig() {
  const baseConfig = {
    width: positive(els.width.value, 1280),
    height: positive(els.height.value, 320),
    bg: safeHex(els.bgHex.value.trim(), '#050505'),
    dotSize: positive(els.dotSize.value, 2),
    gap: finite(els.gap.value, 1),
    fps: positive(els.fps.value, 60)
  };
  return { ...baseConfig, duration: calculateAutoDuration(baseConfig) };
}

// ── Status / Progress ─────────────────────────────────────────
function setStatus(text) { els.status.textContent = text; }

function setRecordProgress(value) {
  const clamped = Math.max(0, Math.min(1, value));
  if (els.recordProgress) els.recordProgress.value = clamped;
  if (els.recordProgressText) els.recordProgressText.textContent = `${Math.round(clamped * 100)}%`;
}
function showRecordProgress() {
  if (els.recordProgressWrap) els.recordProgressWrap.hidden = false;
  setRecordProgress(0);
}
function hideRecordProgress() {
  if (els.recordProgressWrap) els.recordProgressWrap.hidden = true;
  setRecordProgress(0);
}

// ── Color helpers ─────────────────────────────────────────────
function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
function tone(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = Math.max(0, Math.min(255, (n >> 16) + amount));
  let g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  let b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

// ── Font ──────────────────────────────────────────────────────
function fontFamilyCss(key, customFont) {
  if (key === 'custom') {
    return customFont ? `"${customFont.replace(/"/g, '')}", sans-serif` : FONT_OPTIONS.biz;
  }
  return FONT_OPTIONS[key] || FONT_OPTIONS.biz;
}

// ── Canvas sync ───────────────────────────────────────────────
function syncCanvas(config) {
  if (els.screen.width !== config.width || els.screen.height !== config.height) {
    els.screen.width = config.width;
    els.screen.height = config.height;
  }
  els.meta.textContent = `${config.width} × ${config.height} px`;
  els.dotStat.textContent = `${config.dotSize} px / gap ${config.gap} px`;
  els.recordStat.textContent = `${config.duration} 秒 / ${config.fps} fps`;
  if (els.duration) els.duration.value = `${config.duration} 秒`;
  els.layerStat.textContent = String(state.layers.length);
}

// ── Scroll offset helpers ─────────────────────────────────────
function resetOffsets() {
  for (const layer of state.layers) layer.offset = 0;
}
function resetLayerScrollOffset(layer) {
  const config = toConfig();
  layer.offset = getScrollStartOffset(normalizeLayer(layer), config);
}
// グローバル設定変更時にスクロール中レイヤーの開始位置をリセット
function resetAllScrollingLayers() {
  const config = toConfig();
  for (const layer of state.layers) {
    const norm = normalizeLayer(layer);
    if (norm.scroll) layer.offset = getScrollStartOffset(norm, config);
  }
}

// ── Layer normalize ───────────────────────────────────────────
function normalizeLayer(layer) {
  return {
    ...layer,
    color: safeHex(layer.color, '#e98d0b'),
    outlineColor: safeHex(layer.outlineColor || '#ffffff', '#ffffff'),
    x: finite(layer.x, 0),
    y: finite(layer.y, 0),
    fontPx: positive(layer.fontPx, 150),
    fontWeight: positive(layer.fontWeight, 300),
    speed: positive(layer.speed, 300),
    blinkMs: positive(layer.blinkMs, 900),
    outlineWidth: positive(layer.outlineWidth, 4),
    fontFamily: layer.fontFamily || 'biz',
    customFont: layer.customFont || ''
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// ── Layer UI ──────────────────────────────────────────────────
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
          <button class="btn btn-sub btn-small layer-send-back"   type="button" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>最背面</button>
          <button class="btn btn-sub btn-small layer-backward"    type="button" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>後ろへ</button>
          <button class="btn btn-sub btn-small layer-forward"     type="button" data-id="${item.id}" ${index === state.layers.length - 1 ? 'disabled' : ''}>前へ</button>
          <button class="btn btn-sub btn-small layer-bring-front" type="button" data-id="${item.id}" ${index === state.layers.length - 1 ? 'disabled' : ''}>最前面</button>
          <button class="btn btn-sub btn-small duplicate-layer"   type="button" data-id="${item.id}">複製</button>
          <button class="btn btn-sub btn-small remove-layer"      type="button" data-id="${item.id}" ${state.layers.length === 1 ? 'disabled' : ''}>削除</button>
        </div>
      </div>

      <label class="field">
        <span>テキスト</span>
        <textarea class="layer-input" data-id="${item.id}" data-key="text" rows="3">${escapeHtml(item.text)}</textarea>
      </label>

      <div class="grid four">
        <label class="field">
          <span>文字色</span>
          <div class="color-row">
            <input class="layer-color" data-id="${item.id}" data-key="color" type="color" value="${item.color}">
            <input class="layer-hex"   data-id="${item.id}" data-key="color" type="text"  value="${item.color}">
          </div>
        </label>
        <label class="field">
          <span>文字サイズ(px)</span>
          <input class="layer-number" data-id="${item.id}" data-key="fontPx" type="number" value="${item.fontPx}" step="1">
        </label>
        <label class="field">
          <span>ウェイト</span>
          <input class="layer-number" data-id="${item.id}" data-key="fontWeight" type="number" value="${item.fontWeight}" step="100">
        </label>
        <label class="field">
          <span>フォント</span>
          <select class="layer-select" data-id="${item.id}" data-key="fontFamily">
            <optgroup label="ゴシック体（システム）">
              <option value="biz"  ${item.fontFamily === 'biz'  ? 'selected' : ''}>BIZ UDPゴシック</option>
              <option value="hira" ${item.fontFamily === 'hira' ? 'selected' : ''}>ヒラギノ角ゴ (macOS/iOS)</option>
              <option value="yu"   ${item.fontFamily === 'yu'   ? 'selected' : ''}>游ゴシック (Win/Mac)</option>
              <option value="me"   ${item.fontFamily === 'me'   ? 'selected' : ''}>メイリオ (Windows)</option>
              <option value="noto" ${item.fontFamily === 'noto' ? 'selected' : ''}>Noto Sans JP</option>
              <option value="sans" ${item.fontFamily === 'sans' ? 'selected' : ''}>Sans-serif（汎用）</option>
            </optgroup>
            <optgroup label="明朝体（システム）">
              <option value="hiraMin" ${item.fontFamily === 'hiraMin' ? 'selected' : ''}>ヒラギノ明朝 (macOS/iOS)</option>
              <option value="yumin"   ${item.fontFamily === 'yumin'   ? 'selected' : ''}>游明朝 (Win/Mac)</option>
              <option value="notoser" ${item.fontFamily === 'notoser' ? 'selected' : ''}>Noto Serif JP</option>
              <option value="serif"   ${item.fontFamily === 'serif'   ? 'selected' : ''}>Serif（汎用）</option>
            </optgroup>
            <optgroup label="端末フォント（任意選択）">
              <option value="custom" ${item.fontFamily === 'custom' ? 'selected' : ''}>端末フォントを指定…</option>
            </optgroup>
          </select>
        </label>

        <div class="custom-font-row" data-id="${item.id}" ${item.fontFamily === 'custom' ? '' : 'hidden'} style="grid-column:1/-1">
          <label class="field">
            <span>フォント名（端末にインストール済みのもの）</span>
            <input class="layer-custom-font" data-id="${item.id}" type="text"
              list="local-fonts-list-${item.id}"
              placeholder="例: Helvetica Neue、游明朝"
              value="${escapeHtml(item.customFont || '')}">
            <datalist id="local-fonts-list-${item.id}"></datalist>
          </label>
        </div>
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
            <option value="left"   ${item.align === 'left'   ? 'selected' : ''}>左</option>
            <option value="center" ${item.align === 'center' ? 'selected' : ''}>中央</option>
            <option value="right"  ${item.align === 'right'  ? 'selected' : ''}>右</option>
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
            <input class="layer-outline-hex"   data-id="${item.id}" data-key="outlineColor" type="text"  value="${item.outlineColor}">
          </div>
        </label>
      </div>
    `;
    els.layers.appendChild(wrap);
  });

  bindLayerControlEvents();
  syncCanvas(toConfig());
  state.layers.forEach((layer) => {
    if (layer.fontFamily === 'custom') populateLocalFontDatalist(layer.id);
  });
}

// ── Layer update ──────────────────────────────────────────────
// パラメタが変化したらスクロール中レイヤーのプレビュー位置をリセット
const SCROLL_RESET_KEYS = new Set([
  'text', 'fontPx', 'fontWeight', 'fontFamily', 'align', 'x', 'customFont', 'speed'
]);

function updateLayer(id, key, rawValue, inputType = 'text') {
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) return;

  if (inputType === 'check') {
    layer[key] = Boolean(rawValue);
  } else if (key === 'color' || key === 'outlineColor') {
    layer[key] = safeHex(String(rawValue).trim(), layer[key] || '#ffffff');
  } else if (['x', 'y', 'fontPx', 'fontWeight', 'speed', 'blinkMs', 'outlineWidth'].includes(key)) {
    layer[key] = Number(rawValue);
  } else {
    layer[key] = rawValue;
  }

  const normalized = normalizeLayer(layer);
  const shouldReset =
    (key === 'scroll' && normalized.scroll) ||
    (SCROLL_RESET_KEYS.has(key) && normalized.scroll);
  if (shouldReset) resetLayerScrollOffset(layer);

  setStatus('設定を更新しました');
}

// ── Layer order ───────────────────────────────────────────────
function moveLayer(id, mode) {
  const index = state.layers.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [layer] = state.layers.splice(index, 1);
  if (mode === 'front')    state.layers.push(layer);
  else if (mode === 'back') state.layers.unshift(layer);
  else if (mode === 'forward')  state.layers.splice(Math.min(index + 1, state.layers.length), 0, layer);
  else if (mode === 'backward') state.layers.splice(Math.max(index - 1, 0), 0, layer);
  else state.layers.splice(index, 0, layer);
  renderLayerControls();
  draw();
}

// ── Local font datalist ───────────────────────────────────────
async function populateLocalFontDatalist(layerId) {
  if (typeof window.queryLocalFonts !== 'function') return;
  let fonts;
  try { fonts = await window.queryLocalFonts(); } catch { return; }
  const datalist = els.layers.querySelector(`#local-fonts-list-${layerId}`);
  if (!datalist) return;
  const seen = new Set();
  fonts.forEach((font) => {
    if (!seen.has(font.family)) {
      seen.add(font.family);
      const opt = document.createElement('option');
      opt.value = font.family;
      datalist.appendChild(opt);
    }
  });
}

// ── Layer control event binding ───────────────────────────────
function bindLayerControlEvents() {
  els.layers.querySelectorAll('.layer-input').forEach((node) => {
    node.addEventListener('input', (e) =>
      updateLayer(Number(e.target.dataset.id), e.target.dataset.key, e.target.value));
  });

  els.layers.querySelectorAll('.layer-number').forEach((node) => {
    node.addEventListener('input', (e) =>
      updateLayer(Number(e.target.dataset.id), e.target.dataset.key, e.target.value, 'number'));
  });

  els.layers.querySelectorAll('.layer-select').forEach((node) => {
    node.addEventListener('change', (e) => {
      const id = Number(e.target.dataset.id);
      updateLayer(id, e.target.dataset.key, e.target.value);
      if (e.target.dataset.key === 'fontFamily') {
        const row = els.layers.querySelector(`.custom-font-row[data-id="${id}"]`);
        if (row) row.hidden = e.target.value !== 'custom';
        if (e.target.value === 'custom') populateLocalFontDatalist(id);
      }
    });
  });

  els.layers.querySelectorAll('.layer-custom-font').forEach((node) => {
    node.addEventListener('input', (e) =>
      updateLayer(Number(e.target.dataset.id), 'customFont', e.target.value));
  });

  els.layers.querySelectorAll('.layer-check').forEach((node) => {
    node.addEventListener('change', (e) =>
      updateLayer(Number(e.target.dataset.id), e.target.dataset.key, e.target.checked, 'check'));
  });

  function bindHexPair(colorSel, hexSel, key) {
    els.layers.querySelectorAll(colorSel).forEach((node) => {
      node.addEventListener('input', (e) => {
        const id = Number(e.target.dataset.id);
        const value = safeHex(e.target.value, '#ffffff');
        updateLayer(id, key, value);
        const hexInput = els.layers.querySelector(`${hexSel}[data-id="${id}"]`);
        if (hexInput) hexInput.value = value;
      });
    });
    els.layers.querySelectorAll(hexSel).forEach((node) => {
      node.addEventListener('input', (e) => {
        const id = Number(e.target.dataset.id);
        const value = e.target.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          updateLayer(id, key, value);
          const colorInput = els.layers.querySelector(`${colorSel}[data-id="${id}"]`);
          if (colorInput) colorInput.value = value;
        }
      });
      node.addEventListener('blur', (e) => {
        const id = Number(e.target.dataset.id);
        const layer = state.layers.find((item) => item.id === id);
        if (!layer) return;
        const current = key === 'outlineColor' ? layer.outlineColor : layer.color;
        const value = safeHex(e.target.value.trim(), current);
        e.target.value = value;
        if (key === 'outlineColor') layer.outlineColor = value;
        else layer.color = value;
        const colorInput = els.layers.querySelector(`${colorSel}[data-id="${id}"]`);
        if (colorInput) colorInput.value = value;
      });
    });
  }
  bindHexPair('.layer-color', '.layer-hex', 'color');
  bindHexPair('.layer-outline-color', '.layer-outline-hex', 'outlineColor');

  els.layers.querySelectorAll('.remove-layer').forEach((node) => {
    node.addEventListener('click', (e) => {
      const id = Number(e.target.dataset.id);
      state.layers = state.layers.filter((layer) => layer.id !== id);
      renderLayerControls();
      setStatus('文字を削除しました');
    });
  });

  const moveHandlers = {
    '.layer-bring-front': ['front',    '文字を最前面に移動しました'],
    '.layer-send-back':   ['back',     '文字を最背面に移動しました'],
    '.layer-forward':     ['forward',  '文字を一つ前へ移動しました'],
    '.layer-backward':    ['backward', '文字を一つ後ろへ移動しました']
  };
  Object.entries(moveHandlers).forEach(([sel, [mode, msg]]) => {
    els.layers.querySelectorAll(sel).forEach((node) => {
      node.addEventListener('click', (e) => {
        moveLayer(Number(e.target.dataset.id), mode);
        setStatus(msg);
      });
    });
  });

  els.layers.querySelectorAll('.duplicate-layer').forEach((node) => {
    node.addEventListener('click', (e) => {
      const id = Number(e.target.dataset.id);
      const layer = state.layers.find((item) => item.id === id);
      if (!layer) return;
      state.layers.push({ ...structuredClone(layer), id: state.nextLayerId++, y: finite(layer.y, 0) + 60 });
      renderLayerControls();
      setStatus('文字を複製しました');
    });
  });
}

// ── Global color binding ──────────────────────────────────────
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

// ── Draw ──────────────────────────────────────────────────────
function shouldShowLayer(layer, now) {
  if (!layer.blink) return true;
  const ms = positive(layer.blinkMs, 900);
  return (now % (ms * 2)) < ms;
}

function textMetricsPx(layer) {
  const item = normalizeLayer(layer);
  ctx.font = `${item.fontWeight} ${item.fontPx}px ${fontFamilyCss(item.fontFamily, item.customFont)}`;
  return { width: ctx.measureText(item.text || ' ').width, height: item.fontPx };
}

function anchorXToStartX(anchorX, align, width) {
  if (align === 'center') return anchorX - width / 2;
  if (align === 'right')  return anchorX - width;
  return anchorX;
}

function hitTestLayer(x, y) {
  for (let i = state.layers.length - 1; i >= 0; i -= 1) {
    const layer = normalizeLayer(state.layers[i]);
    const metrics = textMetricsPx(layer);
    const anchorX = layer.x + layer.offset;
    const startX = anchorXToStartX(anchorX, layer.align, metrics.width);
    if (x >= startX && x <= startX + metrics.width && y >= layer.y && y <= layer.y + metrics.height) {
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
    maskCtx.font = `${layer.fontWeight} ${fontCells}px ${fontFamilyCss(layer.fontFamily, layer.customFont)}`;

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
      maskCtx.font = `${layer.fontWeight} ${fontCells}px ${fontFamilyCss(layer.fontFamily, layer.customFont)}`;
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

  ctx.clearRect(0, 0, config.width, config.height);
  ctx.fillStyle = config.bg;
  ctx.fillRect(0, 0, config.width, config.height);

  for (let row = 0; row < rows; row += 1) {
    const cy = row * step + radius + config.gap / 2;
    for (let col = 0; col < cols; col += 1) {
      const cx = col * step + radius + config.gap / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = colors[row * cols + col] || offFill;
      ctx.fill();
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
      const resetWidth = config.width + textMetricsPx(item).width + item.fontPx;
      if (layer.offset < -resetWidth) layer.offset = config.width + item.fontPx;
    });
  }

  draw();
  requestAnimationFrame(tick);
}

// ── Drag ──────────────────────────────────────────────────────
function getPointerCanvasPoint(event) {
  const rect = els.screen.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (els.screen.width / rect.width),
    y: (event.clientY - rect.top)  * (els.screen.height / rect.height)
  };
}

els.screen.addEventListener('pointerdown', (event) => {
  const point = getPointerCanvasPoint(event);
  const layer = hitTestLayer(point.x, point.y);
  if (!layer) return;
  state.drag = {
    id: layer.id,
    anchorDx: point.x - (finite(layer.x, 0) + finite(layer.offset, 0)),
    anchorDy: point.y - finite(layer.y, 0)
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

// ── Download ──────────────────────────────────────────────────
function download(blob, name, mimeType) {
  const file = new File([blob], name, { type: mimeType || blob.type || 'application/octet-stream' });
  const url = URL.createObjectURL(file);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: name, type: file.type });
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
  download(blob, buildDownloadName(type), mime);
  setStatus(`${type.toUpperCase()} を保存しました`);
}

// ── Video recording ───────────────────────────────────────────
// MP4 は Safari など対応ブラウザで直接録画。非対応時は WebM にフォールバック。
function detectVideoMime(preferMp4) {
  if (preferMp4) {
    const mp4Types = ['video/mp4;codecs=avc1', 'video/mp4'];
    const mp4Mime = mp4Types.find((t) => MediaRecorder.isTypeSupported(t));
    if (mp4Mime) return { mime: mp4Mime, ext: 'mp4' };
  }
  const webmMime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t));
  if (webmMime) return { mime: webmMime, ext: 'webm' };
  return null;
}

async function recordVideoBlob(seconds, fps, preferMp4 = false) {
  if (!window.MediaRecorder) throw new Error('このブラウザは MediaRecorder に対応していません。');
  const detected = detectVideoMime(preferMp4);
  if (!detected) throw new Error('このブラウザは動画録画に対応していません。');

  const { mime, ext } = detected;
  if (preferMp4 && ext === 'webm') {
    setStatus('MP4非対応のため WebM で録画します...');
  }

  const stream = els.screen.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const wasRunning = state.running;
  if (!state.running) {
    state.running = true;
    els.toggle.textContent = 'プレビュー停止';
  }

  showRecordProgress();
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    let rafId = 0;
    const tickProgress = () => {
      setRecordProgress(seconds <= 0 ? 1 : (performance.now() - startedAt) / 1000 / seconds);
      if (recorder.state !== 'inactive') rafId = requestAnimationFrame(tickProgress);
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(rafId);
      stream.getTracks().forEach((t) => t.stop());
      hideRecordProgress();
      reject(e.error || new Error('録画に失敗しました。'));
    };
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      setRecordProgress(1);
      stream.getTracks().forEach((t) => t.stop());
      if (!wasRunning) {
        state.running = false;
        els.toggle.textContent = 'プレビュー再開';
      }
      setTimeout(() => hideRecordProgress(), 300);
      resolve({ blob: new Blob(chunks, { type: mime }), ext });
    };
    recorder.start(200);
    rafId = requestAnimationFrame(tickProgress);
    setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, Math.max(1, seconds) * 1000);
  });
}

async function saveVideo(preferMp4 = false) {
  if (state.recorderBusy) return;
  state.recorderBusy = true;
  els.saveWebm.disabled = true;
  els.saveMp4.disabled = true;

  const snapshot = snapshotAnimationState();
  try {
    const config = toConfig();
    prepareRecordingAnimation(config);
    draw();
    const label = preferMp4 ? 'MP4' : 'WebM';
    setStatus(`${label} 用に ${config.duration} 秒録画中...`);
    const { blob, ext } = await recordVideoBlob(config.duration, config.fps, preferMp4);
    download(blob, buildDownloadName(ext), blob.type);
    setStatus(`${ext.toUpperCase()} を保存しました`);
  } catch (error) {
    console.error(error);
    hideRecordProgress();
    setStatus('保存に失敗しました');
    alert(error.message || '保存に失敗しました。');
  } finally {
    restoreAnimationState(snapshot);
    draw();
    state.recorderBusy = false;
    els.saveWebm.disabled = false;
    els.saveMp4.disabled = false;
  }
}

// ── Event bindings ────────────────────────────────────────────
els.addLayer.addEventListener('click', () => {
  state.layers.push({
    id: state.nextLayerId++,
    text: '',
    color: '#ff6b57',
    x: 50, y: 65,
    fontPx: 200,
    fontFamily: 'biz',
    align: 'left',
    scroll: false, speed: 300,
    blink: false,  blinkMs: 900,
    outline: false, outlineColor: '#ffffff', outlineWidth: 4,
    offset: 0
  });
  renderLayerControls();
  setStatus('文字を追加しました');
});

// グローバル設定変更時：スクロール中レイヤーの位置をリセット
[els.width, els.height, els.dotSize, els.gap, els.fps].forEach((node) => {
  node.addEventListener('input', () => {
    syncCanvas(toConfig());
    resetAllScrollingLayers();
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

els.savePng.addEventListener('click',  () => saveImage('png').catch((e)  => { alert(e.message); setStatus('保存に失敗しました'); }));
els.saveWebp.addEventListener('click', () => saveImage('webp').catch((e) => { alert(e.message); setStatus('保存に失敗しました'); }));
els.saveWebm.addEventListener('click', () => saveVideo(false));
els.saveMp4.addEventListener('click',  () => saveVideo(true));

// ── Prevent pull-to-refresh on mobile/tablet ──────────────────
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.modal')) return; // allow scrolling inside modals
  if (e.touches.length > 1) return;       // allow pinch-zoom
  e.preventDefault();
}, { passive: false });

// ── Init ──────────────────────────────────────────────────────
renderLayerControls();
syncCanvas(toConfig());
draw();
setStatus('プレビュー再生中');
requestAnimationFrame(tick);
