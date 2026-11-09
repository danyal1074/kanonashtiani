// پوستهٔ تازهٔ پنل مدیر کانون: منوی گروه‌بندی‌شده، نوار بالا با جست‌وجو و اعلان، منوی موبایل.
import { esc, icon, nameAvatar, logoHtml, api, fa, ROLE_NAMES } from './core.js';

// طرح نهایی: «B آموزشی» (انتخاب مدیر). صفت data-concept برای انتخابگرهای CSS ثابت می‌ماند.
const CONCEPT = 'b';

// گروه‌بندی منو: هیچ مسیری حذف نشده؛ آنچه در گروه‌ها نیست به «بیشتر» می‌رود.
const GROUPS = [
  { paths: ['/home', '/students'] },
  { title: 'آموزش', paths: ['/staff', '/timetable', '/counselors', '/comprehensive', '/manual-scores', '/barpa', '/performance'] },
  { title: 'مالی', paths: ['/fees', '/accounting', '/invoices'] },
  { title: 'ارتباطات', paths: ['/announcements', '/messages', '/sms-outbox'] },
  { title: 'بیشتر', more: true, paths: ['/hoosh-studio', '/att-log', '/shop'] },
];
const LABELS = {
  '/home': 'داشبورد', '/students': 'دانش‌آموزان', '/staff': 'معلمان و کلاس‌ها', '/timetable': 'برنامه هفتگی', '/counselors': 'مشاوران',
  '/comprehensive': 'آزمون جامع', '/manual-scores': 'نمرات کلاسی', '/barpa': 'کارنامه‌های برپا', '/performance': 'عملکرد آموزشی',
  '/fees': 'حق عضویت و رسیدها', '/accounting': 'حسابداری', '/invoices': 'فاکتورهای دوره‌ای',
  '/announcements': 'اطلاعیه‌ها', '/messages': 'پیام‌ها', '/sms-outbox': 'صندوق پیامک',
  '/hoosh-studio': 'استودیوی هوش', '/att-log': 'تغییرات حضور', '/shop': 'فروشگاه', '/settings': 'تنظیمات', '/account': 'حساب کاربری',
};
const ICONS = {
  '/home': 'dashboard', '/students': 'graduation', '/staff': 'school', '/timetable': 'calendar', '/counselors': 'users', '/comprehensive': 'file-check',
  '/manual-scores': 'clipboard', '/barpa': 'award', '/performance': 'chart-line', '/fees': 'card', '/accounting': 'wallet', '/invoices': 'receipt',
  '/announcements': 'megaphone', '/messages': 'message', '/sms-outbox': 'send', '/hoosh-studio': 'sparkles', '/att-log': 'history', '/shop': 'bag',
  '/settings': 'sliders', '/account': 'user',
};

const item = (n) => `<a class="nav-item" href="#${n.path}" data-path="${n.path}"><span class="ni">${icon(ICONS[n.path] || n.icon, { size: 19 })}</span><span class="nl">${LABELS[n.path] || n.label}</span>${n.badge ? `<span class="cnt">${fa(n.badge)}</span>` : ''}</a>`;

export function managerShellHtml(me, nav, bottom) {
  const c = me.center;
  const byPath = new Map(nav.map((n) => [n.path, n]));
  const used = new Set(['/settings', '/account']);
  const groups = GROUPS.map((g) => ({ ...g, items: g.paths.filter((p) => byPath.has(p)).map((p) => (used.add(p), byPath.get(p))) }));
  const rest = nav.filter((n) => !used.has(n.path));
  if (rest.length) groups.find((g) => g.more).items.push(...rest);
  const navHtml = groups.filter((g) => g.items.length).map((g) => g.more
    ? `<details class="ad-more"><summary><span>${g.title}</span>${icon('chevron-left', { size: 14 })}</summary>${g.items.map(item).join('')}</details>`
    : `<div class="ad-group">${g.title ? `<div class="ad-gt">${g.title}</div>` : ''}${g.items.map(item).join('')}</div>`).join('');
  const SHORT = { '/fees': 'رسیدها', '/accounting': 'حسابداری' };
  const bottomHtml = bottom.slice(0, 4).map((n) => `<a href="#${n.path}" data-path="${n.path}"><span class="bi">${icon(ICONS[n.path] || n.icon, { size: 22 })}</span><span>${SHORT[n.path] || LABELS[n.path] || n.label}</span></a>`).join('');
  return `
    ${me.impersonator ? `<div class="imp-bar" role="status">${icon('eye', { size: 18 })} در حال مشاهده پنل «${esc(me.user.full_name)}» <button class="btn sm ghost" id="stopImp">بازگشت</button></div>` : ''}
    <a class="sr-only" href="#view" onclick="event.preventDefault();document.getElementById('view').focus()">پرش به محتوا</a>
    <div class="app theme-admin">
      <aside class="sidebar no-print" id="sidebar">
        <a class="ad-brand" href="#/home" aria-label="داشبورد"><span class="ad-logo">${logoHtml(c?.logo || '/img/logo-ashtiani.png')}</span><span class="ad-brand-t"><b>${esc(c?.name || 'کانون آشتیانی')}</b><small>پنل مدیریت</small></span></a>
        <nav class="ad-nav" aria-label="منوی اصلی">${navHtml}</nav>
        <div class="ad-foot">
          <div class="ad-foot-nav">${[byPath.get('/settings'), byPath.get('/account')].filter(Boolean).map(item).join('')}
            <button class="nav-item" id="logoutBtn" type="button"><span class="ni">${icon('logout', { size: 19 })}</span><span class="nl">خروج</span></button></div>
        </div>
      </aside>
      <main class="main">
        <div class="topbar ad-top">
          <button class="icon-btn ad-menu" id="menuBtn" type="button" aria-label="باز کردن منو" aria-controls="sidebar" aria-expanded="false">${icon('menu', { size: 22 })}</button>
          <div class="title"><h1></h1><div class="sub"></div></div>
          <div class="actions"><span class="actions-slot row wrap"></span>
            <form class="ad-search" id="adSearch" role="search"><span class="si">${icon('search', { size: 17 })}</span><input name="q" placeholder="جست‌وجوی دانش‌آموز…" aria-label="جست‌وجوی دانش‌آموز" autocomplete="off"></form>
            <a class="icon-btn ad-bell" href="#/fees" id="adBell" aria-label="رسیدهای در انتظار بررسی">${icon('bell', { size: 20 })}<span class="dot" hidden></span></a>
            <div class="me-chip" id="meChip" role="button" tabindex="0" aria-label="حساب کاربری من">${nameAvatar(me.user.full_name)}<div><div class="nm">${esc(me.user.full_name)}</div><div class="rl">${ROLE_NAMES[me.user.role]}</div></div></div>
          </div>
        </div>
        <div id="view" tabindex="-1" style="outline:none"></div>
      </main>
    </div>
    <nav class="bottom-nav no-print" aria-label="منوی پایین">${bottomHtml}<a href="#" id="moreBtn" role="button" aria-controls="sidebar"><span class="bi">${icon('menu', { size: 22 })}</span><span>بیشتر</span></a></nav>`;
}

let wired = false;
export function prepareManager(me) {
  document.body.dataset.concept = CONCEPT;
  if (!wired) {
    wired = true;
    document.addEventListener('click', (e) => {
      // منوی کشویی سربرگ: با کلیک بیرون یا انتخاب یک گزینه بسته شود
      document.querySelectorAll('.ad-dd[open]').forEach((d) => { if (!d.contains(e.target) || e.target.closest('.ad-dd-menu button')) d.removeAttribute('open'); });
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.ad-dd[open]').forEach((d) => d.removeAttribute('open')); });
    document.addEventListener('submit', (e) => {
      if (e.target.id !== 'adSearch') return;
      e.preventDefault();
      const q = e.target.elements.q.value.trim();
      location.hash = '#/students' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
  }
  // نقطهٔ اعلان: رسیدهای در انتظار بررسی (درخواست سبک، بی‌صدا)
  api('/api/manager/badges').then((b) => {
    const dot = document.querySelector('#adBell .dot');
    if (!dot) return;
    dot.hidden = !b.pending_receipts;
    document.getElementById('adBell')?.setAttribute('aria-label', b.pending_receipts ? `${b.pending_receipts} رسید در انتظار بررسی` : 'اعلان‌ها: رسیدی در انتظار نیست');
  }).catch(() => {});
}
export function decorateManager() { /* طراحی تازه نیازی به دکوراسیون اضافه ندارد */ }
