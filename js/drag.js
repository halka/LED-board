import { finite } from './utils.js';
import { t } from './i18n.js';
import { els } from './dom.js';
import { state } from './state.js';
import { hitTestLayer, draw } from './render.js';
import { renderLayerControls, setStatus } from './ui.js';

function getPointerCanvasPoint(event) {
  const rect = els.screen.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (els.screen.width  / rect.width),
    y: (event.clientY - rect.top)  * (els.screen.height / rect.height)
  };
}

export function initDrag() {
  els.screen.addEventListener('pointerdown', (event) => {
    const point = getPointerCanvasPoint(event);
    const layer = hitTestLayer(point.x, point.y);
    if (!layer) return;
    state.drag = {
      id:       layer.id,
      anchorDx: point.x - (finite(layer.x, 0) + finite(layer.offset, 0)),
      anchorDy: point.y - finite(layer.y, 0)
    };
    els.screen.classList.add('dragging');
    els.screen.setPointerCapture(event.pointerId);
    setStatus(t('statusDragging'));
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
    setStatus(t('statusPositionUpdated'));
  }
  els.screen.addEventListener('pointerup',     finishDrag);
  els.screen.addEventListener('pointercancel', finishDrag);
}
