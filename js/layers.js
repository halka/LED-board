import { safeHex, positive, finite, fontFamilyCss } from './utils.js';
import { ctx } from './dom.js';

const imageCache = new Map();

export function normalizeLayer(layer) {
  const type = layer.type === 'image' ? 'image' : 'text';
  const base = {
    ...layer,
    type,
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
  if (type === 'image') {
    base.imageSrc       = layer.imageSrc || '';
    base.imageName      = layer.imageName || '';
    base.widthPx        = positive(layer.widthPx, 200);
    base.heightPx       = finite(layer.heightPx, 0);
    base.tint           = Boolean(layer.tint);
    base.alphaThreshold = Math.max(0, Math.min(255, finite(layer.alphaThreshold, 64)));
  }
  return base;
}

export function textMetricsPx(layer) {
  const item = normalizeLayer(layer);
  ctx.font = `${item.fontWeight} ${item.fontPx}px ${fontFamilyCss(item.fontFamily, item.customFont)}`;
  return { width: ctx.measureText(item.text || ' ').width, height: item.fontPx };
}

export function ensureImageElement(layer) {
  if (!layer.imageSrc) return null;
  const key = layer.imageSrc;
  let img = imageCache.get(key);
  if (!img) {
    img = new Image();
    imageCache.set(key, img);
    img.src = key;
  }
  return img;
}

export function imageMetricsPx(layer) {
  const item = normalizeLayer(layer);
  const width = positive(item.widthPx, 200);
  let height = finite(item.heightPx, 0);
  if (!(height > 0)) {
    const img = ensureImageElement(item);
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      height = width * (img.naturalHeight / img.naturalWidth);
    } else {
      height = width;
    }
  }
  return { width, height };
}

export function layerMetricsPx(layer) {
  return layer.type === 'image' ? imageMetricsPx(layer) : textMetricsPx(layer);
}

export function getLayerAnchorForLeftEdge(leftEdge, align, textWidth) {
  if (align === 'center') return leftEdge + textWidth / 2;
  if (align === 'right')  return leftEdge + textWidth;
  return leftEdge;
}

export function getScrollStartOffset(layer, config) {
  const metrics = layerMetricsPx(layer);
  const startAnchor = getLayerAnchorForLeftEdge(config.width, layer.align, metrics.width);
  return startAnchor - layer.x;
}

export function getScrollEndOffset(layer, config) {
  const metrics = layerMetricsPx(layer);
  const endAnchor = getLayerAnchorForLeftEdge(-metrics.width, layer.align, metrics.width);
  return endAnchor - layer.x;
}

export function getScrollDuration(layer, config) {
  const startOffset = getScrollStartOffset(layer, config);
  const endOffset   = getScrollEndOffset(layer, config);
  return Math.max(0, (startOffset - endOffset) / Math.max(1, layer.speed));
}
