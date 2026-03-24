import { safeHex, finite, escapeHtml } from './utils.js';
import { els, syncCanvas } from './dom.js';
import { state } from './state.js';
import { normalizeLayer } from './layers.js';
import { toConfig, resetLayerScrollOffset } from './config.js';
import { draw } from './render.js';

// パラメタが変化したらスクロール中レイヤーのプレビュー位置をリセット
const SCROLL_RESET_KEYS = new Set([
  'text', 'fontPx', 'fontWeight', 'fontFamily', 'align', 'x', 'customFont', 'speed'
]);

// ── Status / Progress ─────────────────────────────────────────
export function setStatus(text) { els.status.textContent = text; }

export function setRecordProgress(value) {
  const clamped = Math.max(0, Math.min(1, value));
  if (els.recordProgress)     els.recordProgress.value         = clamped;
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
  } else if (['x', 'y', 'fontPx', 'fontWeight', 'speed', 'blinkMs', 'outlineWidth'].includes(key)) {
    layer[key] = Number(rawValue);
  } else {
    layer[key] = rawValue;
  }

  const normalized   = normalizeLayer(layer);
  const shouldReset  =
    (key === 'scroll' && normalized.scroll) ||
    (SCROLL_RESET_KEYS.has(key) && normalized.scroll);
  if (shouldReset) resetLayerScrollOffset(layer);

  setStatus('設定を更新しました');
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
  bindHexPair('.layer-color',        '.layer-hex',         'color');
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
      const id    = Number(e.target.dataset.id);
      const layer = state.layers.find((item) => item.id === id);
      if (!layer) return;
      state.layers.push({ ...structuredClone(layer), id: state.nextLayerId++, y: finite(layer.y, 0) + 60 });
      renderLayerControls();
      setStatus('文字を複製しました');
    });
  });
}

// ── Layer UI ──────────────────────────────────────────────────
export function renderLayerControls() {
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

// ── Global color binding ──────────────────────────────────────
export function bindColor(colorEl, hexEl, fallback) {
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
