import { state } from './state.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export const els = {
  // preview
  screen:             $('screen'),
  meta:               $('meta'),
  status:             $('status'),
  layerStat:          $('layerStat'),
  dotStat:            $('dotStat'),
  recordStat:         $('recordStat'),
  // settings inputs (inside settingsModal)
  width:              $('width'),
  height:             $('height'),
  bgColor:            $('bgColor'),
  bgHex:              $('bgHex'),
  dotSize:            $('dotSize'),
  gap:                $('gap'),
  fps:                $('fps'),
  duration:           $('duration'),
  // layers
  layers:             $('layers'),
  addLayer:           $('addLayer'),
  // control modal
  toggle:             $('toggle'),
  reset:              $('reset'),
  // save modal
  savePng:            $('savePng'),
  saveWebp:           $('saveWebp'),
  saveWebm:           $('saveWebm'),
  saveMp4:            $('saveMp4'),
  recordProgressWrap: $('recordProgressWrap'),
  recordProgress:     $('recordProgress'),
  recordProgressText: $('recordProgressText'),
  // action buttons
  openControl:        $('openControl'),
  openSettings:       $('openSettings'),
  openSave:           $('openSave'),
  // modals
  controlModal:       $('controlModal'),
  settingsModal:      $('settingsModal'),
  saveModal:          $('saveModal')
};

export const ctx = els.screen.getContext('2d');
export const maskCanvas = document.createElement('canvas');
export const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

export function syncCanvas(config) {
  if (els.screen.width !== config.width || els.screen.height !== config.height) {
    els.screen.width = config.width;
    els.screen.height = config.height;
  }
  els.meta.textContent       = `${config.width} × ${config.height} px`;
  els.dotStat.textContent    = `${config.dotSize} px / gap ${config.gap} px`;
  els.recordStat.textContent = t('recordStatText', { 0: config.duration, 1: config.fps });
  if (els.duration) els.duration.value = t('durationSec', { 0: config.duration });
  els.layerStat.textContent  = String(state.layers.length);
}

export function openModal(dialog)  { dialog.showModal(); }
export function closeModal(dialog) { dialog.close(); }

export function initModals() {
  ['controlModal', 'settingsModal', 'saveModal'].forEach((id) => {
    const dialog = $(id);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.modal;
      if (target) $(target).close();
    });
  });

  els.openControl.addEventListener('click',  () => openModal(els.controlModal));
  els.openSettings.addEventListener('click', () => openModal(els.settingsModal));
  els.openSave.addEventListener('click',     () => openModal(els.saveModal));
}
