import { buildDownloadName } from './utils.js';
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
  setStatus(`${type.toUpperCase()} を生成中...`);
  draw();
  const mime = type === 'png' ? 'image/png' : 'image/webp';
  const blob = await new Promise((resolve) => els.screen.toBlob(resolve, mime, 0.95));
  if (!blob) throw new Error(`${type.toUpperCase()} の生成に失敗しました。`);
  download(blob, buildDownloadName(type), mime);
  setStatus(`${type.toUpperCase()} を保存しました`);
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
  if (!window.MediaRecorder) throw new Error('このブラウザは MediaRecorder に対応していません。');
  const detected = detectVideoMime(preferMp4);
  if (!detected) throw new Error('このブラウザは動画録画に対応していません。');

  const { mime, ext } = detected;
  if (preferMp4 && ext === 'webm') setStatus('MP4非対応のため WebM で録画します...');

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
      reject(e.error || new Error('録画に失敗しました。'));
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
    setStatus(`${label} 用に ${config.duration} 秒録画中...`);
    const { blob, ext } = await recordVideoBlob(config.duration, config.fps, preferMp4);
    download(blob, buildDownloadName(ext), blob.type);
    setStatus(`${ext.toUpperCase()} を保存しました`);
  } catch (error) {
    console.error(error);
    hideRecordProgress();
    setStatus('保存に失敗しました');
    alert(error.message || '保存に失敗しました。');
  } finally {
    restoreAnimationState(snapshot);
    draw();
    state.recorderBusy    = false;
    els.saveWebm.disabled = false;
    els.saveMp4.disabled  = false;
  }
}
