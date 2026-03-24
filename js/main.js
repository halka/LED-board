import { els, syncCanvas, initModals } from './dom.js';
import { state } from './state.js';
import { toConfig, resetAllScrollingLayers, resetOffsets } from './config.js';
import { draw, tick } from './render.js';
import { renderLayerControls, setStatus, bindColor } from './ui.js';
import { initDrag } from './drag.js';
import { saveImage, saveVideo } from './save.js';

initModals();
initDrag();

// ── Layer add ─────────────────────────────────────────────────
els.addLayer.addEventListener('click', () => {
  state.layers.push({
    id:           state.nextLayerId++,
    text:         '',
    color:        '#ff6b57',
    x: 50, y: 65,
    fontPx:       200,
    fontFamily:   'biz',
    align:        'left',
    scroll:       false, speed:    300,
    blink:        false, blinkMs:  900,
    outline:      false, outlineColor: '#ffffff', outlineWidth: 4,
    offset:       0
  });
  renderLayerControls();
  setStatus('文字を追加しました');
});

// ── Global settings ───────────────────────────────────────────
[els.width, els.height, els.dotSize, els.gap, els.fps].forEach((node) => {
  node.addEventListener('input', () => {
    syncCanvas(toConfig());
    resetAllScrollingLayers();
    setStatus('全体設定を更新しました');
  });
});

bindColor(els.bgColor, els.bgHex, '#050505');

// ── Control modal ─────────────────────────────────────────────
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

// ── Save modal ────────────────────────────────────────────────
els.savePng.addEventListener('click',  () => saveImage('png').catch((e)  => { alert(e.message); setStatus('保存に失敗しました'); }));
els.saveWebp.addEventListener('click', () => saveImage('webp').catch((e) => { alert(e.message); setStatus('保存に失敗しました'); }));
els.saveWebm.addEventListener('click', () => saveVideo(false));
els.saveMp4.addEventListener('click',  () => saveVideo(true));

// ── Init ──────────────────────────────────────────────────────
renderLayerControls();
syncCanvas(toConfig());
draw();
setStatus('プレビュー再生中');
requestAnimationFrame(tick);
