import { els, syncCanvas, initModals } from './dom.js';
import { state } from './state.js';
import { toConfig, resetAllScrollingLayers, resetOffsets } from './config.js';
import { draw, tick } from './render.js';
import { renderLayerControls, setStatus, bindColor } from './ui.js';
import { initDrag } from './drag.js';
import { saveImage, saveVideo } from './save.js';
import { t, getLang, setLang, applyI18n } from './i18n.js';

initModals();
initDrag();

// ── Language toggle ───────────────────────────────────────────
document.getElementById('langToggle').addEventListener('click', () => {
  setLang(getLang() === 'ja' ? 'en' : 'ja');
  applyI18n();
  renderLayerControls();
  // Sync JS-controlled dynamic text to new language
  els.toggle.textContent = state.running ? t('stopPreview') : t('resumePreview');
  setStatus(state.running ? t('statusPlaying') : t('statusPaused'));
});

// ── Layer add ─────────────────────────────────────────────────
els.addLayer.addEventListener('click', () => {
  state.layers.push({
    id:           state.nextLayerId++,
    type:         'text',
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
  setStatus(t('statusLayerAdded'));
});

// ── Image layer add ───────────────────────────────────────────
els.addImageLayer.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.layers.push({
        id:             state.nextLayerId++,
        type:           'image',
        imageSrc:       String(reader.result || ''),
        imageName:      file.name,
        widthPx:        300,
        heightPx:       0,
        x: 50, y: 50,
        align:          'left',
        color:          '#ffffff',
        tint:           false,
        alphaThreshold: 64,
        scroll:         false, speed:   300,
        blink:          false, blinkMs: 900,
        offset:         0
      });
      renderLayerControls();
      setStatus(t('statusImageLayerAdded'));
    };
    reader.readAsDataURL(file);
  });
  input.click();
});

// ── Fill layer add ────────────────────────────────────────────
els.addFillLayer.addEventListener('click', () => {
  state.layers.push({
    id:           state.nextLayerId++,
    type:         'fill',
    color:        '#c83c3c',
    x: 40, y: 40,
    widthPx:      320,
    heightPx:     220,
    cornerRadius: 0,
    align:        'left',
    outline:      false, outlineColor: '#ffffff', outlineWidth: 4,
    scroll:       false, speed:   300,
    blink:        false, blinkMs: 900,
    offset:       0
  });
  renderLayerControls();
  setStatus(t('statusFillLayerAdded'));
});

// ── Global settings ───────────────────────────────────────────
[els.width, els.height, els.dotSize, els.gap, els.fps].forEach((node) => {
  node.addEventListener('input', () => {
    syncCanvas(toConfig());
    resetAllScrollingLayers();
    setStatus(t('statusGlobalUpdated'));
  });
});

bindColor(els.bgColor, els.bgHex, '#050505');

// ── Control modal ─────────────────────────────────────────────
els.toggle.addEventListener('click', () => {
  state.running = !state.running;
  els.toggle.textContent = state.running ? t('stopPreview') : t('resumePreview');
  setStatus(state.running ? t('statusPlaying') : t('statusPaused'));
});

els.reset.addEventListener('click', () => {
  resetOffsets();
  draw();
  setStatus(t('statusScrollReset'));
});

// ── Save modal ────────────────────────────────────────────────
els.savePng.addEventListener('click',  () => saveImage('png').catch((e)  => { alert(e.message); setStatus(t('saveFailed')); }));
els.saveWebp.addEventListener('click', () => saveImage('webp').catch((e) => { alert(e.message); setStatus(t('saveFailed')); }));
els.saveWebm.addEventListener('click', () => saveVideo(false));
els.saveMp4.addEventListener('click',  () => saveVideo(true));

// ── Init ──────────────────────────────────────────────────────
applyI18n();
renderLayerControls();
syncCanvas(toConfig());
draw();
setStatus(t('statusPlaying'));
requestAnimationFrame(tick);
