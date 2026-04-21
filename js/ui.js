import { safeHex, finite, escapeHtml } from './utils.js';
import { els, syncCanvas } from './dom.js';
import { state } from './state.js';
import { normalizeLayer } from './layers.js';
import { toConfig, resetLayerScrollOffset } from './config.js';
import { draw } from './render.js';
import { t } from './i18n.js';

// パラメタが変化したらスクロール中レイヤーのプレビュー位置をリセット
const SCROLL_RESET_KEYS = new Set([
  'text', 'fontPx', 'fontWeight', 'fontFamily', 'align', 'x', 'customFont', 'speed',
  'widthPx', 'heightPx', 'imageSrc', 'cornerRadius'
]);

// ── Status / Progress ─────────────────────────────────────────
export function setStatus(text) { els.status.textContent = text; }

export function setRecordProgress(value) {
  const clamped = Math.max(0, Math.min(1, value));
  if (els.recordProgress)     els.recordProgress.value          = clamped;
  if (els.recordProgressText) els.recordProgressText.textContent = `${Math.round(clamped * 100)}%`;
}
export function showRecordProgress() {
  if (els.recordProgressWrap) els.recordProgressWrap.hidden = false;
  setRecordProgress(0);
}
export function hideRecordProgress() {
  if (els.recordProgressWrap) els.recordProgressWrap.hidden = true;
  setRecordProgress(0);
}

// ── Layer update ──────────────────────────────────────────────
export function updateLayer(id, key, rawValue, inputType = 'text') {
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) return;

  if (inputType === 'check') {
    layer[key] = Boolean(rawValue);
  } else if (key === 'color' || key === 'outlineColor') {
    layer[key] = safeHex(String(rawValue).trim(), layer[key] || '#ffffff');
  } else if (['x', 'y', 'fontPx', 'fontWeight', 'speed', 'blinkMs', 'outlineWidth',
              'widthPx', 'heightPx', 'alphaThreshold', 'cornerRadius'].includes(key)) {
    layer[key] = Number(rawValue);
  } else {
    layer[key] = rawValue;
  }

  const normalized  = normalizeLayer(layer);
  const shouldReset =
    (key === 'scroll' && normalized.scroll) ||
    (SCROLL_RESET_KEYS.has(key) && normalized.scroll);
  if (shouldReset) resetLayerScrollOffset(layer);

  setStatus(t('statusLayerUpdated'));
}

// ── Layer order ───────────────────────────────────────────────
export function moveLayer(id, mode) {
  const index = state.layers.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [layer] = state.layers.splice(index, 1);
  if (mode === 'front')         state.layers.push(layer);
  else if (mode === 'back')     state.layers.unshift(layer);
  else if (mode === 'forward')  state.layers.splice(Math.min(index + 1, state.layers.length), 0, layer);
  else if (mode === 'backward') state.layers.splice(Math.max(index - 1, 0), 0, layer);
  else                          state.layers.splice(index, 0, layer);
  renderLayerControls();
  draw();
}

// ── Local font datalist ───────────────────────────────────────
export async function populateLocalFontDatalist(layerId) {
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
export function bindLayerControlEvents() {
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

  els.layers.querySelectorAll('.layer-image-file').forEach((node) => {
    node.addEventListener('change', (e) => {
      const id   = Number(e.target.dataset.id);
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const layer = state.layers.find((item) => item.id === id);
        if (!layer) return;
        layer.imageSrc  = String(reader.result || '');
        layer.imageName = file.name;
        renderLayerControls();
        setStatus(t('statusImageChanged'));
      };
      reader.readAsDataURL(file);
    });
  });

  function bindHexPair(colorSel, hexSel, key) {
    els.layers.querySelectorAll(colorSel).forEach((node) => {
      node.addEventListener('input', (e) => {
        const id    = Number(e.target.dataset.id);
        const value = safeHex(e.target.value, '#ffffff');
        updateLayer(id, key, value);
        const hexInput = els.layers.querySelector(`${hexSel}[data-id="${id}"]`);
        if (hexInput) hexInput.value = value;
      });
    });
    els.layers.querySelectorAll(hexSel).forEach((node) => {
      node.addEventListener('input', (e) => {
        const id    = Number(e.target.dataset.id);
        const value = e.target.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          updateLayer(id, key, value);
          const colorInput = els.layers.querySelector(`${colorSel}[data-id="${id}"]`);
          if (colorInput) colorInput.value = value;
        }
      });
      node.addEventListener('blur', (e) => {
        const id      = Number(e.target.dataset.id);
        const layer   = state.layers.find((item) => item.id === id);
        if (!layer) return;
        const current = key === 'outlineColor' ? layer.outlineColor : layer.color;
        const value   = safeHex(e.target.value.trim(), current);
        e.target.value = value;
        if (key === 'outlineColor') layer.outlineColor = value;
        else layer.color = value;
        const colorInput = els.layers.querySelector(`${colorSel}[data-id="${id}"]`);
        if (colorInput) colorInput.value = value;
      });
    });
  }
  bindHexPair('.layer-color',         '.layer-hex',         'color');
  bindHexPair('.layer-outline-color', '.layer-outline-hex', 'outlineColor');

  els.layers.querySelectorAll('.remove-layer').forEach((node) => {
    node.addEventListener('click', (e) => {
      const id = Number(e.target.dataset.id);
      state.layers = state.layers.filter((layer) => layer.id !== id);
      renderLayerControls();
      setStatus(t('statusLayerDeleted'));
    });
  });

  const moveHandlers = {
    '.layer-bring-front': ['front',    'statusMovedFront'],
    '.layer-send-back':   ['back',     'statusMovedBack'],
    '.layer-forward':     ['forward',  'statusMovedForward'],
    '.layer-backward':    ['backward', 'statusMovedBackward']
  };
  Object.entries(moveHandlers).forEach(([sel, [mode, statusKey]]) => {
    els.layers.querySelectorAll(sel).forEach((node) => {
      node.addEventListener('click', (e) => {
        moveLayer(Number(e.target.dataset.id), mode);
        setStatus(t(statusKey));
      });
    });
  });

  els.layers.querySelectorAll('.duplicate-layer').forEach((node) => {
    node.addEventListener('click', (e) => {
      const id    = Number(e.target.dataset.id);
      const layer = state.layers.find((item) => item.id === id);
      if (!layer) return;
      state.layers.push({ ...structuredClone(layer), id: state.nextLayerId++, y: finite(layer.y, 0) + 60 });
      renderLayerControls();
      setStatus(t('statusLayerDuplicated'));
    });
  });
}

// ── Layer card: shared header ─────────────────────────────────
function layerHeadHtml(item, index, titleKey) {
  return `
    <div class="layer-head">
      <div class="layer-title">${t(titleKey, { 0: index + 1 })} <span class="muted">${t('layerOrder', { 0: index + 1, 1: state.layers.length })}</span></div>
      <div class="actions-inline">
        <button class="btn btn-sub btn-small layer-send-back"   type="button" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>${t('toBack')}</button>
        <button class="btn btn-sub btn-small layer-backward"    type="button" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>${t('backward')}</button>
        <button class="btn btn-sub btn-small layer-forward"     type="button" data-id="${item.id}" ${index === state.layers.length - 1 ? 'disabled' : ''}>${t('forward')}</button>
        <button class="btn btn-sub btn-small layer-bring-front" type="button" data-id="${item.id}" ${index === state.layers.length - 1 ? 'disabled' : ''}>${t('toFront')}</button>
        <button class="btn btn-sub btn-small duplicate-layer"   type="button" data-id="${item.id}">${t('duplicate')}</button>
        <button class="btn btn-sub btn-small remove-layer"      type="button" data-id="${item.id}" ${state.layers.length === 1 ? 'disabled' : ''}>${t('delete')}</button>
      </div>
    </div>`;
}

// ── Layer card: text ──────────────────────────────────────────
function renderTextLayerCard(item, index) {
  return `
    ${layerHeadHtml(item, index, 'layerTitle')}

    <label class="field">
      <span>${t('textField')}</span>
      <textarea class="layer-input" data-id="${item.id}" data-key="text" rows="3">${escapeHtml(item.text)}</textarea>
    </label>

    <div class="grid four">
      <label class="field">
        <span>${t('textColor')}</span>
        <div class="color-row">
          <input class="layer-color" data-id="${item.id}" data-key="color" type="color" value="${item.color}">
          <input class="layer-hex"   data-id="${item.id}" data-key="color" type="text"  value="${item.color}">
        </div>
      </label>
      <label class="field">
        <span>${t('fontSize')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="fontPx" type="number" value="${item.fontPx}" step="1">
      </label>
      <label class="field">
        <span>${t('fontWeight')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="fontWeight" type="number" value="${item.fontWeight}" step="100">
      </label>
      <label class="field">
        <span>${t('font')}</span>
        <select class="layer-select" data-id="${item.id}" data-key="fontFamily">
          <optgroup label="${t('gothicSystem')}">
            <option value="biz"  ${item.fontFamily === 'biz'  ? 'selected' : ''}>BIZ UDPゴシック</option>
            <option value="hira" ${item.fontFamily === 'hira' ? 'selected' : ''}>ヒラギノ角ゴ (macOS/iOS)</option>
            <option value="yu"   ${item.fontFamily === 'yu'   ? 'selected' : ''}>游ゴシック (Win/Mac)</option>
            <option value="me"   ${item.fontFamily === 'me'   ? 'selected' : ''}>メイリオ (Windows)</option>
            <option value="noto" ${item.fontFamily === 'noto' ? 'selected' : ''}>Noto Sans JP</option>
            <option value="sans" ${item.fontFamily === 'sans' ? 'selected' : ''}>Sans-serif</option>
          </optgroup>
          <optgroup label="${t('minchoSystem')}">
            <option value="hiraMin" ${item.fontFamily === 'hiraMin' ? 'selected' : ''}>ヒラギノ明朝 (macOS/iOS)</option>
            <option value="yumin"   ${item.fontFamily === 'yumin'   ? 'selected' : ''}>游明朝 (Win/Mac)</option>
            <option value="notoser" ${item.fontFamily === 'notoser' ? 'selected' : ''}>Noto Serif JP</option>
            <option value="serif"   ${item.fontFamily === 'serif'   ? 'selected' : ''}>Serif</option>
          </optgroup>
          <optgroup label="${t('deviceFont')}">
            <option value="custom" ${item.fontFamily === 'custom' ? 'selected' : ''}>${t('deviceFontOption')}</option>
          </optgroup>
        </select>
      </label>

      <div class="custom-font-row" data-id="${item.id}" ${item.fontFamily === 'custom' ? '' : 'hidden'} style="grid-column:1/-1">
        <label class="field">
          <span>${t('customFontLabel')}</span>
          <input class="layer-custom-font" data-id="${item.id}" type="text"
            list="local-fonts-list-${item.id}"
            placeholder="${t('customFontPlaceholder')}"
            value="${escapeHtml(item.customFont || '')}">
          <datalist id="local-fonts-list-${item.id}"></datalist>
        </label>
      </div>
    </div>

    <div class="grid three">
      <label class="field">
        <span>${t('xPos')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="x" type="number" value="${item.x}" step="1">
      </label>
      <label class="field">
        <span>${t('yPos')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="y" type="number" value="${item.y}" step="1">
      </label>
      <label class="field">
        <span>${t('align')}</span>
        <select class="layer-select" data-id="${item.id}" data-key="align">
          <option value="left"   ${item.align === 'left'   ? 'selected' : ''}>${t('alignLeft')}</option>
          <option value="center" ${item.align === 'center' ? 'selected' : ''}>${t('alignCenter')}</option>
          <option value="right"  ${item.align === 'right'  ? 'selected' : ''}>${t('alignRight')}</option>
        </select>
      </label>
    </div>

    <div class="check-list">
      <label class="field">
        <span>${t('scroll')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="scroll" type="checkbox" ${item.scroll ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
      <label class="field">
        <span>${t('blink')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="blink" type="checkbox" ${item.blink ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
    </div>

    <div class="grid two">
      <label class="field">
        <span>${t('scrollSpeed')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="speed" type="number" value="${item.speed}" step="1">
      </label>
      <label class="field">
        <span>${t('blinkMs')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="blinkMs" type="number" value="${item.blinkMs}" step="1">
      </label>
    </div>

    <div class="check-list">
      <label class="field">
        <span>${t('outline')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="outline" type="checkbox" ${item.outline ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
      <label class="field">
        <span>${t('outlineWidth')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="outlineWidth" type="number" value="${item.outlineWidth}" step="1">
      </label>
    </div>

    <div class="grid two">
      <label class="field">
        <span>${t('outlineColor')}</span>
        <div class="color-row">
          <input class="layer-outline-color" data-id="${item.id}" data-key="outlineColor" type="color" value="${item.outlineColor}">
          <input class="layer-outline-hex"   data-id="${item.id}" data-key="outlineColor" type="text"  value="${item.outlineColor}">
        </div>
      </label>
    </div>
  `;
}

// ── Layer card: image ─────────────────────────────────────────
function renderImageLayerCard(item, index) {
  const thumb = item.imageSrc
    ? `<img class="layer-image-thumb" src="${escapeHtml(item.imageSrc)}" alt="">`
    : `<div class="layer-image-thumb empty" aria-hidden="true"></div>`;
  const nameLabel = item.imageName ? escapeHtml(item.imageName) : t('noImageSelected');
  return `
    ${layerHeadHtml(item, index, 'imageLayerTitle')}

    <div class="image-layer-row">
      ${thumb}
      <div class="image-layer-meta">
        <span class="muted">${nameLabel}</span>
        <label class="btn btn-sub btn-small image-file-label">
          <span>${t('chooseImage')}</span>
          <input class="layer-image-file" data-id="${item.id}" type="file" accept="image/*" hidden>
        </label>
      </div>
    </div>

    <div class="grid four">
      <label class="field">
        <span>${t('imageWidth')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="widthPx" type="number" value="${item.widthPx}" step="1">
      </label>
      <label class="field">
        <span>${t('imageHeight')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="heightPx" type="number" value="${item.heightPx}" step="1">
      </label>
      <label class="field">
        <span>${t('alphaThreshold')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="alphaThreshold" type="number" value="${item.alphaThreshold}" step="1" min="0" max="255">
      </label>
      <label class="field">
        <span>${t('align')}</span>
        <select class="layer-select" data-id="${item.id}" data-key="align">
          <option value="left"   ${item.align === 'left'   ? 'selected' : ''}>${t('alignLeft')}</option>
          <option value="center" ${item.align === 'center' ? 'selected' : ''}>${t('alignCenter')}</option>
          <option value="right"  ${item.align === 'right'  ? 'selected' : ''}>${t('alignRight')}</option>
        </select>
      </label>
    </div>

    <div class="grid two">
      <label class="field">
        <span>${t('xPos')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="x" type="number" value="${item.x}" step="1">
      </label>
      <label class="field">
        <span>${t('yPos')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="y" type="number" value="${item.y}" step="1">
      </label>
    </div>

    <div class="check-list">
      <label class="field">
        <span>${t('tintColor')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="tint" type="checkbox" ${item.tint ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
      <label class="field">
        <span>${t('textColor')}</span>
        <div class="color-row">
          <input class="layer-color" data-id="${item.id}" data-key="color" type="color" value="${item.color}">
          <input class="layer-hex"   data-id="${item.id}" data-key="color" type="text"  value="${item.color}">
        </div>
      </label>
    </div>

    <div class="check-list">
      <label class="field">
        <span>${t('scroll')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="scroll" type="checkbox" ${item.scroll ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
      <label class="field">
        <span>${t('blink')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="blink" type="checkbox" ${item.blink ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
    </div>

    <div class="grid two">
      <label class="field">
        <span>${t('scrollSpeed')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="speed" type="number" value="${item.speed}" step="1">
      </label>
      <label class="field">
        <span>${t('blinkMs')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="blinkMs" type="number" value="${item.blinkMs}" step="1">
      </label>
    </div>
  `;
}

// ── Layer card: fill ──────────────────────────────────────────
function renderFillLayerCard(item, index) {
  return `
    ${layerHeadHtml(item, index, 'fillLayerTitle')}

    <div class="grid four">
      <label class="field">
        <span>${t('fillColor')}</span>
        <div class="color-row">
          <input class="layer-color" data-id="${item.id}" data-key="color" type="color" value="${item.color}">
          <input class="layer-hex"   data-id="${item.id}" data-key="color" type="text"  value="${item.color}">
        </div>
      </label>
      <label class="field">
        <span>${t('imageWidth')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="widthPx" type="number" value="${item.widthPx}" step="1">
      </label>
      <label class="field">
        <span>${t('fillHeight')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="heightPx" type="number" value="${item.heightPx}" step="1">
      </label>
      <label class="field">
        <span>${t('cornerRadius')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="cornerRadius" type="number" value="${item.cornerRadius}" step="1" min="0">
      </label>
    </div>

    <div class="grid three">
      <label class="field">
        <span>${t('xPos')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="x" type="number" value="${item.x}" step="1">
      </label>
      <label class="field">
        <span>${t('yPos')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="y" type="number" value="${item.y}" step="1">
      </label>
      <label class="field">
        <span>${t('align')}</span>
        <select class="layer-select" data-id="${item.id}" data-key="align">
          <option value="left"   ${item.align === 'left'   ? 'selected' : ''}>${t('alignLeft')}</option>
          <option value="center" ${item.align === 'center' ? 'selected' : ''}>${t('alignCenter')}</option>
          <option value="right"  ${item.align === 'right'  ? 'selected' : ''}>${t('alignRight')}</option>
        </select>
      </label>
    </div>

    <div class="check-list">
      <label class="field">
        <span>${t('outline')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="outline" type="checkbox" ${item.outline ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
      <label class="field">
        <span>${t('outlineWidth')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="outlineWidth" type="number" value="${item.outlineWidth}" step="1">
      </label>
    </div>

    <div class="grid two">
      <label class="field">
        <span>${t('outlineColor')}</span>
        <div class="color-row">
          <input class="layer-outline-color" data-id="${item.id}" data-key="outlineColor" type="color" value="${item.outlineColor}">
          <input class="layer-outline-hex"   data-id="${item.id}" data-key="outlineColor" type="text"  value="${item.outlineColor}">
        </div>
      </label>
    </div>

    <div class="check-list">
      <label class="field">
        <span>${t('scroll')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="scroll" type="checkbox" ${item.scroll ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
      <label class="field">
        <span>${t('blink')}</span>
        <label class="switch-row">
          <input class="layer-check" data-id="${item.id}" data-key="blink" type="checkbox" ${item.blink ? 'checked' : ''}>
          <span>${t('enabled')}</span>
        </label>
      </label>
    </div>

    <div class="grid two">
      <label class="field">
        <span>${t('scrollSpeed')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="speed" type="number" value="${item.speed}" step="1">
      </label>
      <label class="field">
        <span>${t('blinkMs')}</span>
        <input class="layer-number" data-id="${item.id}" data-key="blinkMs" type="number" value="${item.blinkMs}" step="1">
      </label>
    </div>
  `;
}

// ── Layer UI ──────────────────────────────────────────────────
export function renderLayerControls() {
  els.layers.innerHTML = '';
  state.layers.forEach((layer, index) => {
    const item = normalizeLayer(layer);
    const wrap = document.createElement('div');
    wrap.className = 'layer-card';
    if (item.type === 'image')      wrap.innerHTML = renderImageLayerCard(item, index);
    else if (item.type === 'fill')  wrap.innerHTML = renderFillLayerCard(item, index);
    else                            wrap.innerHTML = renderTextLayerCard(item, index);
    els.layers.appendChild(wrap);
  });

  bindLayerControlEvents();
  syncCanvas(toConfig());
  state.layers.forEach((layer) => {
    if (layer.fontFamily === 'custom') populateLocalFontDatalist(layer.id);
  });
}

// ── Global color binding ──────────────────────────────────────
export function bindColor(colorEl, hexEl, fallback) {
  colorEl.addEventListener('input', () => {
    const value = safeHex(colorEl.value.trim(), fallback);
    hexEl.value = value;
    setStatus(t('statusColorUpdated'));
  });
  hexEl.addEventListener('input', () => {
    const value = hexEl.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      colorEl.value = value;
      setStatus(t('statusColorUpdated'));
    }
  });
  hexEl.addEventListener('blur', () => {
    const value = safeHex(hexEl.value.trim(), fallback);
    hexEl.value = value;
    colorEl.value = value;
  });
}
