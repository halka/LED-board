import { finite, positive } from './utils.js';
import { t } from './i18n.js';
import { els } from './dom.js';
import { state } from './state.js';
import {
  hitTestLayer, hitTestHandle, getLayerBox, draw,
  HANDLE_HIT_RADIUS
} from './render.js';
import { renderLayerControls, setStatus, updateSelectedLayerUI } from './ui.js';

function getPointerCanvasPoint(event) {
  const rect = els.overlay.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (els.overlay.width  / rect.width),
    y: (event.clientY - rect.top)  * (els.overlay.height / rect.height)
  };
}

// Handle → which edge of the bbox stays anchored.
// Returns {fixedSide: {x: 'l'|'c'|'r', y: 't'|'c'|'b'}}.
const HANDLE_FIXED = {
  nw: { x: 'r', y: 'b' },
  n:  { x: 'c', y: 'b' },
  ne: { x: 'l', y: 'b' },
  e:  { x: 'l', y: 'c' },
  se: { x: 'l', y: 't' },
  s:  { x: 'c', y: 't' },
  sw: { x: 'r', y: 't' },
  w:  { x: 'r', y: 'c' }
};

const HANDLE_CURSOR = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize'
};

function anchorXFromStartX(startX, align, width) {
  if (align === 'center') return startX + width / 2;
  if (align === 'right')  return startX + width;
  return startX;
}

function applyResize(layer, handle, pointer, initial, shiftKey) {
  const fixed = HANDLE_FIXED[handle];
  const { startX, startY, width: w0, height: h0 } = initial.box;

  const fixedX =
    fixed.x === 'l' ? startX :
    fixed.x === 'r' ? startX + w0 :
    startX + w0 / 2;
  const fixedY =
    fixed.y === 't' ? startY :
    fixed.y === 'b' ? startY + h0 :
    startY + h0 / 2;

  let newW = w0;
  let newH = h0;
  let newStartX = startX;
  let newStartY = startY;

  if (fixed.x === 'l') {
    newW = Math.max(4, pointer.x - fixedX);
    newStartX = fixedX;
  } else if (fixed.x === 'r') {
    newW = Math.max(4, fixedX - pointer.x);
    newStartX = fixedX - newW;
  }
  if (fixed.y === 't') {
    newH = Math.max(4, pointer.y - fixedY);
    newStartY = fixedY;
  } else if (fixed.y === 'b') {
    newH = Math.max(4, fixedY - pointer.y);
    newStartY = fixedY - newH;
  }

  // Edge-only handles (n/s/e/w) keep the perpendicular dimension unchanged.
  if (fixed.x === 'c') { newW = w0; newStartX = startX; }
  if (fixed.y === 'c') { newH = h0; newStartY = startY; }

  // Shift = aspect lock, for corners only.
  if (shiftKey && fixed.x !== 'c' && fixed.y !== 'c' && w0 > 0 && h0 > 0) {
    const ratio = w0 / h0;
    const byW = newW;
    const byH = newH * ratio;
    if (byW >= byH) {
      newH = newW / ratio;
    } else {
      newW = newH * ratio;
    }
    if (fixed.x === 'r') newStartX = fixedX - newW;
    if (fixed.y === 'b') newStartY = fixedY - newH;
  }

  if (layer.type === 'image' || layer.type === 'fill') {
    layer.widthPx  = newW;
    layer.heightPx = newH;
    layer.x = anchorXFromStartX(newStartX, layer.align || 'left', newW) - finite(layer.offset, 0);
    layer.y = newStartY;
  } else {
    // Text: scale fontPx. Pick the axis that's changed most proportionally.
    const base = positive(initial.fontPx, 150);
    const rw = w0 > 0 ? newW / w0 : 1;
    const rh = h0 > 0 ? newH / h0 : 1;
    let scale;
    if (fixed.x === 'c')      scale = rh;   // vertical drag
    else if (fixed.y === 'c') scale = rw;   // horizontal drag
    else                      scale = Math.max(Math.abs(rw - 1), Math.abs(rh - 1)) === Math.abs(rw - 1) ? rw : rh;
    const newFont = Math.max(4, Math.round(base * scale));
    layer.fontPx = newFont;
    // Keep fixed edge put (approximate for width since text width depends on rendered glyphs).
    layer.y = fixed.y === 'b' ? fixedY - newFont : fixed.y === 't' ? fixedY : layer.y;
    // For x, use the pre-drag anchor unchanged (text rendered from that anchor). No x change.
  }
}

function updateCursor(point) {
  if (state.drag) return;
  let cursor = 'default';
  if (state.selectedLayerId != null) {
    const sel = state.layers.find((l) => l.id === state.selectedLayerId);
    if (sel && sel.visible !== false) {
      const box = getLayerBox(sel);
      const handle = hitTestHandle(point.x, point.y, box, HANDLE_HIT_RADIUS);
      if (handle) cursor = HANDLE_CURSOR[handle];
      else if (hitTestLayer(point.x, point.y)) cursor = 'move';
    } else if (hitTestLayer(point.x, point.y)) {
      cursor = 'move';
    }
  } else if (hitTestLayer(point.x, point.y)) {
    cursor = 'move';
  }
  els.overlay.style.cursor = cursor;
}

export function initDrag() {
  els.overlay.addEventListener('pointerdown', (event) => {
    const point = getPointerCanvasPoint(event);

    // Priority 1: resize handle on currently selected layer.
    if (state.selectedLayerId != null) {
      const sel = state.layers.find((l) => l.id === state.selectedLayerId);
      if (sel && sel.visible !== false) {
        const box    = getLayerBox(sel);
        const handle = hitTestHandle(point.x, point.y, box, HANDLE_HIT_RADIUS);
        if (handle) {
          state.drag = {
            mode:    'resize',
            id:      sel.id,
            handle,
            initial: { box, fontPx: finite(sel.fontPx, 150) }
          };
          els.overlay.setPointerCapture(event.pointerId);
          setStatus(t('statusResizing'));
          return;
        }
      }
    }

    // Priority 2: hit-test any visible layer → move (and select).
    const layer = hitTestLayer(point.x, point.y);
    if (layer) {
      if (state.selectedLayerId !== layer.id) {
        state.selectedLayerId = layer.id;
        updateSelectedLayerUI();
      }
      state.drag = {
        mode:     'move',
        id:       layer.id,
        anchorDx: point.x - (finite(layer.x, 0) + finite(layer.offset, 0)),
        anchorDy: point.y - finite(layer.y, 0)
      };
      els.overlay.classList.add('dragging');
      els.overlay.setPointerCapture(event.pointerId);
      setStatus(t('statusDragging'));
      draw();
      return;
    }

    // Empty area → deselect.
    if (state.selectedLayerId != null) {
      state.selectedLayerId = null;
      updateSelectedLayerUI();
      draw();
    }
  });

  els.overlay.addEventListener('pointermove', (event) => {
    const point = getPointerCanvasPoint(event);
    if (!state.drag) { updateCursor(point); return; }
    const layer = state.layers.find((item) => item.id === state.drag.id);
    if (!layer) return;

    if (state.drag.mode === 'move') {
      layer.x = point.x - state.drag.anchorDx - finite(layer.offset, 0);
      layer.y = point.y - state.drag.anchorDy;
    } else if (state.drag.mode === 'resize') {
      applyResize(layer, state.drag.handle, point, state.drag.initial, event.shiftKey);
    }
    draw();
  });

  function finishDrag() {
    if (!state.drag) return;
    state.drag = null;
    els.overlay.classList.remove('dragging');
    renderLayerControls();
    setStatus(t('statusPositionUpdated'));
  }
  els.overlay.addEventListener('pointerup',     finishDrag);
  els.overlay.addEventListener('pointercancel', finishDrag);
}
