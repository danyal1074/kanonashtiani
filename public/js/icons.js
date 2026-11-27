import { OUTLINE } from './outline-icons.js';
import { managerIcon } from './manager-icons.js';
import { elementaryIcon } from './elementary-art.js';
import { studentIcon } from './student-icons.js';

const ALIASES = {
  books: 'book',
  exam: 'file-check',
  online: 'video',
  coin: 'coins',
  podium: 'trophy',
  quran: 'book',
  back: 'chevron-left',
  gear: 'settings',
  'open-book': 'book',
};

const escapeAttr = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Unified crisp outline SVG icon renderer across all roles (replaces legacy 3D sprite atlases).
 */
export function icon(name, { size = 20, cls = '', label = '' } = {}) {
  if (globalThis.document?.body?.classList?.contains('manager-ui') && globalThis.document?.body?.classList?.contains('look-classic')) {
    const html = managerIcon(name, { size, cls, label });
    if (html) return html;
  }
  if (globalThis.document?.body?.classList?.contains('student-elementary')) {
    const el = elementaryIcon(name, { size, cls, label });
    if (el) return el;
  }
  if (globalThis.document?.body?.classList?.contains('student-ui')) return studentIcon(name, { size, cls, label });
  const key = ALIASES[name] || name;
  const resolved = Object.hasOwn(OUTLINE, key) ? key : 'info';
  const body = OUTLINE[resolved];
  const n = Number.isFinite(Number(size)) ? Math.max(8, Math.min(512, Number(size))) : 20;
  return `<svg class="ic ol ${escapeAttr(cls)}" data-icon="${escapeAttr(resolved)}" width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${escapeAttr(label)}"` : 'aria-hidden="true" focusable="false"'}>${body}</svg>`;
}

export const hasIcon = (name) => Object.hasOwn(OUTLINE, ALIASES[name] || name);

export function sproutArt(level = 1, size = 120) {
  const n = Math.max(1, Math.min(8, Number(level) || 1));
  const faLevel = String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  return `<span class="sprout-art sprout-art-clean" role="img" aria-label="نهال رشد، سطح ${faLevel}">${icon('sprout', { size: Math.round(size * 0.54) })}<span class="sprout-level">${faLevel}</span></span>`;
}
