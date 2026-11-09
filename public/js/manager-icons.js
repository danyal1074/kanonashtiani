// آیکون‌های خطی (outline) پنل مدیر؛ جایگزین آیکون‌های سه‌بعدی. منبع: Lucide (ISC) در outline-icons.js
import { OUTLINE } from './outline-icons.js';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function managerIcon(name, { size = 20, cls = '', label = '' } = {}) {
  const body = OUTLINE[name];
  if (!body) return '';
  const n = Math.min(512, Math.max(8, Number(size) || 20));
  return `<svg class="ic ol ${esc(cls)}" data-icon="${esc(name)}" width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}>${body}</svg>`;
}
export const hasOutline = (name) => Object.hasOwn(OUTLINE, name);
