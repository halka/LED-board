import { buildDownloadName } from './utils.js';
import { t } from './i18n.js';
import { els } from './dom.js';
import { state } from './state.js';
import { toConfig, snapshotAnimationState, restoreAnimationState, prepareRecordingAnimation } from './config.js';
import { draw } from './render.js';
import { setStatus, showRecordProgress, hideRecordProgress, setRecordProgress } from './ui.js';

export function download(blob, name, mimeType) {
  const file   = new File([blob], name, { type: mimeType || blob.type || 'application/octet-stream' });
  const url    = URL.createObjectURL(file);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: name, type: file.type });
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveImage(type) {
  setStatus(t('generating', { 0: type.toUpperCase() }));
  draw();
  const mime = type === 'png' ? 'image/png' : 'image/webp';
  const blob = await new Promise((resolve) => els.screen.toBlob(resolve, mime, 0.95));
  if (!blob) throw new Error(t('generateFailed', { 0: type.toUpperCase() }));
  download(blob, buildDownloadName(type), mime);
  setStatus(t('saved', { 0: type.toUpperCase() }));
}

// MP4 は Safari など対応ブラウザで直接録画。非対応時は WebM にフォールバック。
export function detectVideoMime(preferMp4) {
  if (preferMp4) {
    const mp4Mime = ['video/mp4;codecs=avc1', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    if (mp4Mime) return { mime: mp4Mime, ext: 'mp4' };
  }
  const webmMime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t));
  if (webmMime) return { mime: webmMime, ext: 'webm' };
  return null;
}

export async function recordVideoBlob(seconds, fps, preferMp4 = false) {
  if (!window.MediaRecorder) throw new Error(t('noMediaRecorder'));
  const detected = detectVideoMime(preferMp4);
  if (!detected) throw new Error(t('noVideoRecord'));

  const { mime, ext } = detected;
  if (preferMp4 && ext === 'webm') setStatus(t('mp4Fallback'));

  const stream   = els.screen.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks   = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const wasRunning = state.running;
  if (!state.running) {
    state.running = true;
    els.toggle.textContent = 'プレビュー停止';
  }

  showRecordProgress();
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    let rafId = 0;
    const tickProgress = () => {
      setRecordProgress(seconds <= 0 ? 1 : (performance.now() - startedAt) / 1000 / seconds);
      if (recorder.state !== 'inactive') rafId = requestAnimationFrame(tickProgress);
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(rafId);
      stream.getTracks().forEach((t) => t.stop());
      hideRecordProgress();
      reject(e.error || new Error(t('recordFailed')));
    };
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      setRecordProgress(1);
      stream.getTracks().forEach((t) => t.stop());
      if (!wasRunning) {
        state.running = false;
        els.toggle.textContent = 'プレビュー再開';
      }
      setTimeout(() => hideRecordProgress(), 300);
      resolve({ blob: new Blob(chunks, { type: mime }), ext });
    };
    recorder.start(200);
    rafId = requestAnimationFrame(tickProgress);
    setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, Math.max(1, seconds) * 1000);
  });
}

export async function saveVideo(preferMp4 = false) {
  if (state.recorderBusy) return;
  state.recorderBusy   = true;
  els.saveWebm.disabled = true;
  els.saveMp4.disabled  = true;

  const snapshot = snapshotAnimationState();
  try {
    const config = toConfig();
    prepareRecordingAnimation(config);
    draw();
    const label = preferMp4 ? 'MP4' : 'WebM';
    setStatus(t('recordingFor', { 0: label, 1: config.duration }));
    const { blob, ext } = await recordVideoBlob(config.duration, config.fps, preferMp4);
    download(blob, buildDownloadName(ext), blob.type);
    setStatus(t('saved', { 0: ext.toUpperCase() }));
  } catch (error) {
    console.error(error);
    hideRecordProgress();
    setStatus(t('saveFailed'));
    alert(error.message || t('saveFailed'));
  } finally {
    restoreAnimationState(snapshot);
    draw();
    state.recorderBusy    = false;
    els.saveWebm.disabled = false;
    els.saveMp4.disabled  = false;
  }
}
