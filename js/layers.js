import { safeHex, positive, finite, fontFamilyCss } from './utils.js';
import { ctx } from './dom.js';

export function normalizeLayer(layer) {
  return {
    ...layer,
    color:        safeHex(layer.color, '#e98d0b'),
    outlineColor: safeHex(layer.outlineColor || '#ffffff', '#ffffff'),
    x:            finite(layer.x, 0),
    y:            finite(layer.y, 0),
    fontPx:       positive(layer.fontPx, 150),
    fontWeight:   positive(layer.fontWeight, 300),
    speed:        positive(layer.speed, 300),
    blinkMs:      positive(layer.blinkMs, 900),
    outlineWidth: positive(layer.outlineWidth, 4),
    fontFamily:   layer.fontFamily || 'biz',
    customFont:   layer.customFont || ''
  };
}

export function textMetricsPx(layer) {
  const item = normalizeLayer(layer);
  ctx.font = `${item.fontWeight} ${item.fontPx}px ${fontFamilyCss(item.fontFamily, item.customFont)}`;
  return { width: ctx.measureText(item.text || ' ').width, height: item.fontPx };
}

export function getLayerAnchorForLeftEdge(leftEdge, align, textWidth) {
  if (align === 'center') return leftEdge + textWidth / 2;
  if (align === 'right')  return leftEdge + textWidth;
  return leftEdge;
}

export function getScrollStartOffset(layer, config) {
  const metrics = textMetricsPx(layer);
  const startAnchor = getLayerAnchorForLeftEdge(config.width, layer.align, metrics.width);
  return startAnchor - layer.x;
}

export function getScrollEndOffset(layer, config) {
  const metrics = textMetricsPx(layer);
  const endAnchor = getLayerAnchorForLeftEdge(-metrics.width, layer.align, metrics.width);
  return endAnchor - layer.x;
}

export function getScrollDuration(layer, config) {
  const startOffset = getScrollStartOffset(layer, config);
  const endOffset   = getScrollEndOffset(layer, config);
  return Math.max(0, (startOffset - endOffset) / Math.max(1, layer.speed));
}
