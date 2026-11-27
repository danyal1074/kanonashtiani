import { icon } from './icons.js';

// Unified clean outline icons for the student panel (replaces heavy 3D webp icons).
const ALIASES = { 'file-check': 'exam', 'open-book': 'book', back: 'chevron-left', gear: 'settings' };
const escapeAttr = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function studentIcon(name, { size = 20, cls = '', label = '' } = {}) {
  const key = ALIASES[name] || name;
  return icon(key, { size, cls: `student-line-ic ${cls}`.trim(), label });
}

export function studentArt(name, cls = '') {
  const key = ALIASES[name] || name;
  return `<span class="student-art student-art-clean ${escapeAttr(cls)}" data-student-art="${escapeAttr(key)}" aria-hidden="true">${icon(key, { size: 32 })}</span>`;
}

export function studentLogo(center) {
  if (!center?.logo || /ashtiani/i.test(center.logo)) return '<img src="/img/student-v2/logo-ashtiani.webp" alt="نشان کانون نخبه‌پروری" width="72" height="72">';
  return `<img src="${escapeAttr(center.logo)}" alt="نشان کانون" width="72" height="72">`;
}

// Keep the shared school heading concise without repeating its prefix.
export function studentCenterTitle(center) {
  const name = String(center?.name || '').trim();
  if (/آشتیانی|ashtiani/i.test(name) || (!name && /ashtiani/i.test(center?.logo || ''))) return 'شهید کاظمی آشتیانی';
  return name.replace(/^(?:کانون(?:[\s‌-]*نخبه[\s‌-]*پروری)?[\s‌-]*)+/u, '').trim() || 'رشد نخبه';
}
