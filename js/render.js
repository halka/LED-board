import { positive, tone, fontFamilyCss } from './utils.js';
import { els, ctx, octx, maskCanvas, maskCtx, syncCanvas } from './dom.js';
import { state } from './state.js';
import { normalizeLayer, imageMetricsPx, fillMetricsPx, layerMetricsPx, ensureImageElement } from './layers.js';
import { toConfig } from './config.js';

export function shouldShowLayer(layer, now) {
  if (layer.visible === false) return false;
  if (!layer.blink) return true;
  const ms = positive(layer.blinkMs, 900);
  return (now % (ms * 2)) < ms;
}

export function anchorXToStartX(anchorX, align, width) {
  if (align === 'center') return anchorX - width / 2;
  if (align === 'right')  return anchorX - width;
  return anchorX;
}

// Device-pixel bounding box of a layer (honoring current offset/align/metrics).
export function getLayerBox(rawLayer) {
  const layer   = normalizeLayer(rawLayer);
  const metrics = layerMetricsPx(layer);
  const anchorX = layer.x + (rawLayer.offset || 0);
  const startX  = anchorXToStartX(anchorX, layer.align, metrics.width);
  return { startX, startY: layer.y, width: metrics.width, height: metrics.height };
}

export function hitTestLayer(x, y) {
  for (let i = state.layers.length - 1; i >= 0; i -= 1) {
    const layer = state.layers[i];
    if (layer.visible === false) continue;
    const box = getLayerBox(layer);
    if (x >= box.startX && x <= box.startX + box.width &&
        y >= box.startY && y <= box.startY + box.height) {
      return layer;
    }
  }
  return null;
}

// 8 resize handles, in device-pixel coordinates.
export function getHandlePositions(box) {
  const { startX, startY, width, height } = box;
  const midX = startX + width  / 2;
  const midY = startY + height / 2;
  return [
    { name: 'nw', x: startX,         y: startY },
    { name: 'n',  x: midX,           y: startY },
    { name: 'ne', x: startX + width, y: startY },
    { name: 'e',  x: startX + width, y: midY },
    { name: 'se', x: startX + width, y: startY + height },
    { name: 's',  x: midX,           y: startY + height },
    { name: 'sw', x: startX,         y: startY + height },
    { name: 'w',  x: startX,         y: midY }
  ];
}

export function hitTestHandle(x, y, box, hitRadius) {
  const handles = getHandlePositions(box);
  for (const h of handles) {
    if (Math.abs(x - h.x) <= hitRadius && Math.abs(y - h.y) <= hitRadius) return h.name;
  }
  return null;
}

function toHexComponent(v) {
  return v.toString(16).padStart(2, '0');
}

export function buildColorCells(config, now) {
  syncCanvas(config);
  const step   = Math.max(1, config.dotSize + config.gap);
  const cols   = Math.max(1, Math.floor(config.width  / step));
  const rows   = Math.max(1, Math.floor(config.height / step));
  const colors = new Array(cols * rows).fill(null);

  maskCanvas.width  = cols;
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

    if (layer.type === 'image') {
      if (!layer.imageSrc) return;
      const img = ensureImageElement(layer);
      if (!img || !img.complete || !img.naturalWidth) return;

      const metrics = imageMetricsPx(layer);
      const wCells  = Math.max(1, metrics.width  / step);
      const hCells  = Math.max(1, metrics.height / step);
      const anchorXCells = (layer.x + (rawLayer.offset || 0)) / step;
      const startXCells  = anchorXToStartX(anchorXCells, layer.align, wCells);
      const yCells       = layer.y / step;

      maskCtx.clearRect(0, 0, cols, rows);
      maskCtx.imageSmoothingEnabled = false;
      maskCtx.drawImage(img, startXCells, yCells, wCells, hCells);

      const data = maskCtx.getImageData(0, 0, cols, rows).data;
      const threshold = layer.alphaThreshold;
      for (let i = 0; i < colors.length; i += 1) {
        if (data[i * 4 + 3] > threshold) {
          colors[i] = layer.tint
            ? layer.color
            : `#${toHexComponent(data[i * 4])}${toHexComponent(data[i * 4 + 1])}${toHexComponent(data[i * 4 + 2])}`;
        }
      }
      return;
    }

    if (layer.type === 'fill') {
      const metrics = fillMetricsPx(layer);
      const wCells  = Math.max(1, metrics.width  / step);
      const hCells  = Math.max(1, metrics.height / step);
      const anchorXCells = (layer.x + (rawLayer.offset || 0)) / step;
      const startXCells  = anchorXToStartX(anchorXCells, layer.align, wCells);
      const yCells       = layer.y / step;
      const radiusCells  = Math.max(0, Math.min(
        Math.min(wCells, hCells) / 2,
        (layer.cornerRadius || 0) / step
      ));

      maskCtx.clearRect(0, 0, cols, rows);
      maskCtx.fillStyle = '#fff';
      maskCtx.beginPath();
      if (radiusCells > 0 && typeof maskCtx.roundRect === 'function') {
        maskCtx.roundRect(startXCells, yCells, wCells, hCells, radiusCells);
      } else {
        maskCtx.rect(startXCells, yCells, wCells, hCells);
      }
      maskCtx.fill();
      mergeColor(layer.color, true);

      if (layer.outline && positive(layer.outlineWidth, 4) > 0) {
        maskCtx.clearRect(0, 0, cols, rows);
        maskCtx.strokeStyle = '#fff';
        maskCtx.lineWidth   = Math.max(1, layer.outlineWidth / step);
        maskCtx.lineJoin    = 'round';
        maskCtx.beginPath();
        if (radiusCells > 0 && typeof maskCtx.roundRect === 'function') {
          maskCtx.roundRect(startXCells, yCells, wCells, hCells, radiusCells);
        } else {
          maskCtx.rect(startXCells, yCells, wCells, hCells);
        }
        maskCtx.stroke();
        mergeColor(layer.outlineColor, true);
      }
      return;
    }

    const fontCells = Math.max(1, layer.fontPx / step);
    const xCells    = (layer.x + (rawLayer.offset || 0)) / step;
    const yCells    = layer.y / step;
    const fontStr   = `${layer.fontWeight} ${fontCells}px ${fontFamilyCss(layer.fontFamily, layer.customFont)}`;

    maskCtx.clearRect(0, 0, cols, rows);
    maskCtx.textBaseline = 'top';
    maskCtx.textAlign    = layer.align;
    maskCtx.lineJoin     = 'round';
    maskCtx.lineCap      = 'round';
    maskCtx.font         = fontStr;

    if (layer.outline && positive(layer.outlineWidth, 4) > 0) {
      maskCtx.strokeStyle = '#fff';
      maskCtx.lineWidth   = Math.max(1, layer.outlineWidth / step);
      maskCtx.strokeText(layer.text, xCells, yCells);
      mergeColor(layer.outlineColor, false);

      maskCtx.clearRect(0, 0, cols, rows);
      maskCtx.textBaseline = 'top';
      maskCtx.textAlign    = layer.align;
      maskCtx.lineJoin     = 'round';
      maskCtx.lineCap      = 'round';
      maskCtx.font         = fontStr;
    }

    maskCtx.fillStyle = '#fff';
    maskCtx.fillText(layer.text, xCells, yCells);
    mergeColor(layer.color, true);
  });

  return { cols, rows, step, colors };
}

export function draw() {
  const config  = toConfig();
  const now     = performance.now();
  const { cols, rows, step, colors } = buildColorCells(config, now);
  const radius  = config.dotSize / 2;
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

  drawOverlay(config);
}

export const HANDLE_SIZE = 14; // device px, square handle side
export const HANDLE_HIT_RADIUS = 14;

function drawOverlay(config) {
  octx.clearRect(0, 0, config.width, config.height);
  if (state.selectedLayerId == null) return;
  const layer = state.layers.find((l) => l.id === state.selectedLayerId);
  if (!layer) return;

  const box = getLayerBox(layer);
  const half = HANDLE_SIZE / 2;

  octx.save();
  octx.strokeStyle = '#3aa0ff';
  octx.lineWidth   = 2;
  octx.setLineDash([6, 4]);
  octx.strokeRect(box.startX, box.startY, box.width, box.height);
  octx.setLineDash([]);

  octx.fillStyle   = '#ffffff';
  octx.strokeStyle = '#3aa0ff';
  octx.lineWidth   = 2;
  getHandlePositions(box).forEach((h) => {
    octx.fillRect(h.x - half, h.y - half, HANDLE_SIZE, HANDLE_SIZE);
    octx.strokeRect(h.x - half, h.y - half, HANDLE_SIZE, HANDLE_SIZE);
  });
  octx.restore();
}

export function tick(now) {
  const config = toConfig();
  const dt = Math.min(0.05, (now - state.lastTime) / 1000);
  state.lastTime = now;

  if (state.running && !state.drag) {
    state.layers.forEach((layer) => {
      if (!layer.scroll) return;
      const item       = normalizeLayer(layer);
      layer.offset    -= item.speed * dt;
      const metrics    = layerMetricsPx(item);
      const extra      = item.type === 'image' ? metrics.width : item.fontPx;
      const resetWidth = config.width + metrics.width + extra;
      if (layer.offset < -resetWidth) layer.offset = config.width + extra;
    });
  }

  draw();
  requestAnimationFrame(tick);
}
