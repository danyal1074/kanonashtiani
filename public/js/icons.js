import { managerIcon } from './manager-icons.js';
import { elementaryIcon } from './elementary-art.js';
import { studentIcon } from './student-icons.js';
// Original regenerated icons: each semantic name has its own sprite cell.
const ATLAS = {"set-01": {"file": "visual-refresh/set-01.webp", "columns": 4, "rows": 4}, "set-02": {"file": "visual-refresh/set-02.webp", "columns": 4, "rows": 4}, "set-03": {"file": "visual-refresh/set-03.webp", "columns": 4, "rows": 4}, "set-04": {"file": "visual-refresh/set-04.webp", "columns": 4, "rows": 4}, "set-05": {"file": "visual-refresh/set-05.webp", "columns": 4, "rows": 4}, "set-06": {"file": "visual-refresh/set-06.webp", "columns": 4, "rows": 4}};
const ICON_3D = {"book": ["set-01", 0], "clipboard": ["set-01", 1], "file-check": ["set-01", 2], "check-circle": ["set-01", 3], "users": ["set-01", 4], "calendar": ["set-01", 5], "chart": ["set-01", 6], "trend": ["set-01", 7], "trophy": ["set-01", 8], "award": ["set-01", 9], "home": ["set-01", 10], "message": ["set-01", 11], "bell": ["set-01", 12], "settings": ["set-01", 13], "sliders": ["set-02", 0], "graduation": ["set-02", 1], "backpack": ["set-02", 2], "flask": ["set-02", 3], "board": ["set-02", 4], "building": ["set-02", 5], "wallet": ["set-02", 6], "cap": ["set-02", 7], "file-text": ["set-02", 8], "timer": ["set-02", 9], "sparkles": ["set-02", 10], "gamepad": ["set-02", 11], "megaphone": ["set-02", 12], "user": ["set-02", 13], "user-check": ["set-03", 0], "user-x": ["set-03", 1], "card": ["set-03", 2], "bag": ["set-03", 3], "check": ["set-03", 4], "lock": ["set-03", 5], "logout": ["set-03", 6], "menu": ["set-03", 7], "x": ["set-03", 8], "chevron-left": ["set-03", 9], "chevron-right": ["set-03", 10], "arrow-left": ["set-03", 11], "arrow-right": ["set-03", 12], "plus": ["set-03", 13], "search": ["set-04", 0], "clock": ["set-04", 1], "star": ["set-04", 2], "flame": ["set-04", 3], "target": ["set-04", 4], "calculator": ["set-04", 5], "languages": ["set-04", 6], "bulb": ["set-04", 7], "globe": ["set-04", 8], "compass": ["set-04", 9], "zap": ["set-04", 10], "bot": ["set-04", 11], "play": ["set-04", 12], "pause": ["set-04", 13], "stop": ["set-05", 0], "upload": ["set-05", 1], "download": ["set-05", 2], "eye": ["set-05", 3], "eye-off": ["set-05", 4], "phone": ["set-05", 5], "alert": ["set-05", 6], "info": ["set-05", 7], "video": ["set-05", 8], "sprout": ["set-05", 9], "receipt": ["set-05", 10], "shield": ["set-05", 11], "printer": ["set-05", 12], "camera": ["set-05", 13], "coins": ["set-06", 0], "inbox": ["set-06", 1], "send": ["set-06", 2], "copy": ["set-06", 3], "cake": ["set-06", 4], "refresh": ["set-06", 5], "trash": ["set-06", 6], "edit": ["set-06", 7], "heart": ["set-06", 8], "database": ["set-06", 9], "more": ["set-06", 10], "key": ["set-06", 11]};
const escapeAttr = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function icon(name, { size = 20, cls = '', label = '' } = {}) {
  if (globalThis.document?.body?.classList?.contains('manager-ui')) { const html = managerIcon(name, {size,cls,label}); if (html) return html; }
  if (globalThis.document?.body?.classList?.contains('student-elementary')) { const el = elementaryIcon(name, { size, cls, label }); if (el) return el; }
  if (globalThis.document?.body?.classList?.contains('student-ui')) return studentIcon(name, { size, cls, label });
  const [atlas, index] = Object.hasOwn(ICON_3D, name) ? ICON_3D[name] : ICON_3D.info;
  const { file, columns, rows } = ATLAS[atlas];
  const width = Number.isFinite(Number(size)) ? Math.max(1, Math.min(512, Number(size))) : 20;
  const x = (index % columns) * 100 / (columns - 1);
  const y = Math.floor(index / columns) * 100 / (rows - 1);
  return `<span class="ic icon-3d icon-atlas-${atlas} ${escapeAttr(cls)}" data-icon="${escapeAttr(Object.hasOwn(ICON_3D, name) ? name : 'info')}" style="width:${width}px;height:${width}px;background-image:url('/img/${file}');background-size:${columns * 100}% ${rows * 100}%;background-position:${x}% ${y}%" ${label ? `role="img" aria-label="${escapeAttr(label)}"` : 'aria-hidden="true"'}></span>`;
}
export const hasIcon = name => Object.hasOwn(ICON_3D, name);

export function sproutArt(level = 1, size = 120) {
  const n = Math.max(1, Math.min(8, Number(level) || 1));
  return `<span class="sprout-art sprout-art-3d" role="img" aria-label="نهال رشد، سطح ${n}">${icon('sprout', { size })}<span class="sprout-level">${String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])}</span></span>`;
}
