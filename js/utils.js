import { FONT_OPTIONS } from './constants.js';

export function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}
export function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
export function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
export function iso8601BasicNow() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
export function buildDownloadName(ext) {
  return `led-board_${iso8601BasicNow()}.${ext}`;
}
export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
export function tone(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}
export function fontFamilyCss(key, customFont) {
  if (key === 'custom') {
    return customFont ? `"${customFont.replace(/"/g, '')}", sans-serif` : FONT_OPTIONS.biz;
  }
  return FONT_OPTIONS[key] || FONT_OPTIONS.biz;
}
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
