// Original, cohesive 3D assets generated for the student panel. Other roles keep their existing icons.
const NAMES = new Set(["books", "clipboard", "exam", "online", "calendar", "chart", "trophy", "gamepad", "coin", "crown", "target", "podium", "user", "message", "home", "more", "book", "flask", "calculator", "languages", "globe", "quran", "timer", "bell", "mail", "settings", "graduation", "backpack", "board", "building", "wallet", "bag", "check-circle", "award", "trend", "sliders", "cap", "file-text", "megaphone", "user-check", "user-x", "card", "check", "lock", "logout", "menu", "x", "chevron-left", "chevron-right", "arrow-left", "arrow-right", "plus", "search", "clock", "star", "flame", "bulb", "compass", "zap", "bot", "play", "pause", "stop", "upload", "download", "eye", "eye-off", "phone", "alert", "info", "video", "sprout", "receipt", "shield", "printer", "camera", "coins", "inbox", "send", "copy", "cake", "refresh", "trash", "edit", "heart", "database", "key", "tasks", "rocket", "sparkles", "folder", "medallion", "bookmark", "sun", "lightning", "users"]);
const ALIASES = { 'file-check':'exam', 'open-book':'book', back:'chevron-left', gear:'settings' };
const escapeAttr = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assetName = name => NAMES.has(ALIASES[name] || name) ? (ALIASES[name] || name) : 'info';
export function studentIcon(name,{size=20,cls='',label=''}={}) {
  const key=assetName(name); const width=Number.isFinite(Number(size))?Math.max(1,Math.min(512,Number(size))):20;
  return `<img class="ic icon-3d student-icon-v2 ${escapeAttr(cls)}" data-icon="${key}" src="/img/student-v2/icons/${key}.webp?v=2" width="${width}" height="${width}" style="width:${width}px;height:${width}px" alt="${escapeAttr(label)}" ${label?'role="img"':'aria-hidden="true"'} decoding="async">`;
}
export function studentArt(name,cls='') {
  return `<img class="student-art student-art-v2 ${escapeAttr(cls)}" data-student-art="${assetName(name)}" src="/img/student-v2/icons/${assetName(name)}.webp?v=2" width="96" height="96" alt="" aria-hidden="true" decoding="async">`;
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
