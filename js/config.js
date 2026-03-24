import { positive, finite, safeHex } from './utils.js';
import { t } from './i18n.js';
import { els } from './dom.js';
import { state } from './state.js';
import { normalizeLayer, getScrollStartOffset, getScrollDuration } from './layers.js';

export function calculateAutoDuration(baseConfig) {
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

export function toConfig() {
  const baseConfig = {
    width:   positive(els.width.value, 1280),
    height:  positive(els.height.value, 320),
    bg:      safeHex(els.bgHex.value.trim(), '#050505'),
    dotSize: positive(els.dotSize.value, 2),
    gap:     finite(els.gap.value, 1),
    fps:     positive(els.fps.value, 60)
  };
  return { ...baseConfig, duration: calculateAutoDuration(baseConfig) };
}

export function snapshotAnimationState() {
  return {
    running: state.running,
    offsets: state.layers.map((layer) => ({ id: layer.id, offset: finite(layer.offset, 0) }))
  };
}

export function restoreAnimationState(snapshot) {
  if (!snapshot) return;
  state.running = snapshot.running;
  for (const saved of snapshot.offsets) {
    const layer = state.layers.find((item) => item.id === saved.id);
    if (layer) layer.offset = saved.offset;
  }
  els.toggle.textContent = state.running ? t('stopPreview') : t('resumePreview');
}

export function prepareRecordingAnimation(config) {
  state.layers.forEach((rawLayer) => {
    const layer = normalizeLayer(rawLayer);
    if (layer.scroll) rawLayer.offset = getScrollStartOffset(layer, config);
  });
}

export function resetOffsets() {
  for (const layer of state.layers) layer.offset = 0;
}

export function resetLayerScrollOffset(layer) {
  const config = toConfig();
  layer.offset = getScrollStartOffset(normalizeLayer(layer), config);
}

// グローバル設定変更時にスクロール中レイヤーの開始位置をリセット
export function resetAllScrollingLayers() {
  const config = toConfig();
  for (const layer of state.layers) {
    const norm = normalizeLayer(layer);
    if (norm.scroll) layer.offset = getScrollStartOffset(norm, config);
  }
}
