// ظاهر جدید پنل معلم: پوسته، خانه، کلاس‌های من، حضور و غیاب، گزارش‌ها و موارد بیشتر (داده‌ها همان APIهای موجودند)
import { api, post, esc, fa, $, $$, on, busy, modal, setHead, avatar, empty, jdate, timeAgo, subjIcon, gradeName, dateField, readDate, addDays, state, icon, logoHtml, jparts, JMONTHS } from './core.js';

// آیکون‌های خطی منو و نوار پایین
const LINE = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19.5c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.900 6.500 5.500"/><path d="M15.500 4.800a3.500 3.500 0 0 1 0 6.400"/><path d="M18 14.500c2 .8 3.200 2.600 3.500 5"/>',
  chart: '<path d="M4 20v-6"/><path d="M9.500 20V9"/><path d="M15 20v-8"/><path d="M20.500 20V5"/>',
  grid: '<rect x="4" y="4" width="6.500" height="6.500" rx="1.800"/><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.800"/><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.800"/><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.800"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.500 20.500c.8-4 3.800-6 7.500-6s6.700 2 7.500 6"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2.500"/><path d="M9 5V3.500h6V5"/><path d="M9 11h6M9 15h6"/>',
  exam: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 16l2-6 2 6M9.700 14h2.600"/><path d="M15 11v3M13.500 12.500h3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.300l2.800 2.800L16 9.500"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.500 10.500h.01M12 10.500h.01M15.500 10.500h.01"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="M10 9l5 3-5 3z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15.500" rx="2.500"/><path d="M4 10h16M8.500 3v4M15.500 3v4"/>',
  back: '<path d="M14.500 5.500 8 12l6.500 6.500"/>',
  next: '<path d="M9.500 5.500 16 12l-6.500 6.500"/>',
  bell: '<path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 1.500h-15z"/><path d="M10 20.500a2.200 2.200 0 0 0 4 0"/>',
  mail: '<rect x="3.500" y="5.500" width="17" height="13" rx="2.500"/><path d="m4 7 8 6 8-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4.500 4.500"/>',
  qr: '<rect x="4" y="4" width="6.500" height="6.500" rx="1"/><rect x="13.500" y="4" width="6.500" height="6.500" rx="1"/><rect x="4" y="13.500" width="6.500" height="6.500" rx="1"/><path d="M14 14h2.500v2.500H14zM18 18h2.500M18 14h2.500"/>',
  tick: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  x: '<path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/>',
  dash: '<path d="M7 12h10"/>',
  clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  logout: '<path d="M14 4H6v16h8"/><path d="M10.500 12H21M17.500 8.500 21 12l-3.500 3.500"/>',
};
export const li = (name, size = 24) => `<svg class="tp-li" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE[name] || ''}</svg>`;

const NAV_LINE = { '/home': 'home', '/classes': 'users', '/assignments': 'clipboard', '/exams': 'exam', '/manual-scores': 'chart', '/attendance': 'check', '/reports': 'chart', '/messages': 'message', '/materials': 'play', '/plans': 'calendar', '/more': 'grid', '/account': 'user' };
export const nav = (me) => [
  { path: '/home', icon: 'home', label: 'خانه' },
  { path: '/classes', icon: 'users', label: 'کلاس‌های من' },
  { path: '/assignments', icon: 'clipboard', label: 'تکالیف' },
  { path: '/exams', icon: 'file-check', label: 'آزمون‌ها' },
  { path: '/manual-scores', icon: 'chart', label: 'نمرات' },
  { path: '/attendance', icon: 'user-check', label: 'حضور و غیاب' },
  { path: '/reports', icon: 'chart', label: 'گزارش‌ها' },
  { path: '/messages', icon: 'message', label: 'ارتباطات', badge: me.unread },
  { path: '/materials', icon: 'video', label: 'محتوای آموزشی' },
  { path: '/plans', icon: 'calendar', label: 'تقویم و برنامه' },
  { path: '/more', icon: 'more', label: 'موارد بیشتر' },
];
export const bottomNav = () => [
  { path: '/account', icon: 'user', label: 'پروفایل' },
  { path: '/classes', icon: 'users', label: 'کلاس‌ها' },
  { path: '/home', icon: 'home', label: 'خانه' },
  { path: '/reports', icon: 'chart', label: 'گزارش‌ها' },
  { path: '/more', icon: 'more', label: 'بیشتر' },
];

const lastName = (n) => String(n || '').trim().split(/\s+/).pop();
const isFemale = (me) => me.user.gender === 'f';
const clsLabel = (c) => `${gradeName(c.grade)} ${c.name}`;
const firstSubject = (c) => String(c.subjects || '').split('،')[0].trim();
const clsTitle = (c) => `${firstSubject(c)} ${clsLabel(c)}`.trim();
const percent = (v) => `${fa(Math.round(v))}٪`;
const score20 = (v) => fa((Math.round(v / 5 * 10) / 10).toString()).replace('.', '٫');
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const BAR_COLORS = ['blue', 'green', 'yellow'];
let classesCache = null;
const myClasses = async () => (classesCache ??= (await api('/api/teacher/overview')).classes);

// Close the tablet drawer when the viewport crosses into the desktop layout.
window.matchMedia('(min-width: 1200px)').addEventListener('change', () => {
  if (document.body.classList.contains('teacher-ui')) $('.scrim')?.click();
});

// ---------- پوسته: سربرگ، نوار کناری و نوار پایین ----------
export function prepareTeacher(me, path) {
  document.body.classList.toggle('teacher-home', path === '/home');
  const main = $('.main');
  if (main && !$('.tp-top')) {
    $('#moreBtn')?.remove();
    const c = me.center;
    main.insertAdjacentHTML('afterbegin', `<header class="tp-top no-print">
      <button type="button" class="tp-round tp-menu" aria-label="باز کردن منوی معلم" aria-controls="sidebar" aria-expanded="false">${li('menu', 24)}</button>
      <a class="tp-brand" href="#/home"><span class="tp-brand-logo">${logoHtml(c?.logo)}</span><b>${esc(c?.name || 'پنل معلم')}</b></a>
      <span class="tp-date">${li('calendar', 20)}${jdate(me.today, { weekday: true })}</span>
      <div class="tp-actions"><a class="tp-round" href="#/messages" aria-label="پیام‌ها">${li('mail', 22)}</a><a class="tp-round" href="#/announcements" aria-label="اطلاعیه‌ها">${li('bell', 22)}${me.unread ? `<span class="tp-dot">${fa(me.unread)}</span>` : ''}</a></div>
    </header>`);
    $('.topbar')?.insertAdjacentHTML('afterbegin', `<button type="button" class="tp-round tp-back" aria-label="بازگشت">${li('back', 22)}</button>`);
    $('.tp-menu').onclick = () => $('#menuBtn')?.click();
    $('.tp-back').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/home'; };
    const sb = $('#sidebar');
    sb?.insertAdjacentHTML('afterbegin', `<button type="button" class="tp-mini tp-close" aria-label="بستن منو">${li('x', 20)}</button>`);
    sb?.querySelector('.tp-close')?.addEventListener('click', () => $('.scrim')?.click());
    sb?.querySelector('.brand')?.insertAdjacentHTML('afterend', `<div class="tp-profile"><span class="tp-photo"><img src="/img/teacher/avatar-${isFemale(me) ? 'f' : 'm'}.webp" alt="" width="112" height="112"><i>${li('tick', 14)}</i></span><b>استاد ${esc(lastName(me.user.full_name))}</b><small id="tpSubject">معلم</small></div>`);
    sb?.querySelector('.brand')?.insertAdjacentHTML('afterbegin', `<div class="tp-panel-title">${icon('graduation', { size: 54 })}<b>پنل معلم</b></div>`);
    $$('#sidebar .nav-item').forEach((a) => { const n = NAV_LINE[a.dataset.path]; if (n) a.querySelector('.ni').innerHTML = li(n, 22); });
    $$('.bottom-nav a[data-path]').forEach((a) => { const n = NAV_LINE[a.dataset.path]; if (n) a.querySelector('.bi').innerHTML = li(n, 25); });
    myClasses().then((cl) => { const s = [...new Set(cl.flatMap((x) => String(x.subjects || '').split('،').map((t) => t.trim())))].filter(Boolean); if ($('#tpSubject') && s[0]) $('#tpSubject').textContent = `معلم ${s[0]}`; }).catch(() => {});
  }
}

// ---------- خانه ----------
function classPerformance(classes, students) {
  return classes.map((c) => {
    const list = students.filter((s) => s.class_id === c.id);
    return { c, avg: avg(list.filter((s) => s.avg_percent != null).map((s) => s.avg_percent)), absences: list.reduce((a, s) => a + (s.absences || 0), 0), students: list.length };
  });
}
const bars = (items) => `<div class="tp-bars" role="img" aria-label="نمودار میانگین کلاس‌ها"><div class="tp-axis">${[100, 80, 60, 40, 20, 0].map((v) => `<span>${v}</span>`).join('')}</div><div class="tp-plot">${items.map((x, i) => `<div class="tp-bar"><b>${x.text ?? (x.value == null ? '—' : percent(x.value))}</b><i class="${BAR_COLORS[i % 3]}" style="height:${Math.max(2, x.value || 0)}%"></i><span>${esc(x.label)}</span></div>`).join('')}</div></div>`;
const ring = (v, text) => { const n = Math.round(v || 0), c = n >= 75 ? '#17b45a' : '#f6b619'; return `<span class="tp-ring" style="--p:${n};--c:${c}"><b>${text ?? (v == null ? '—' : percent(n))}</b></span>`; };

function calendarHtml(today, cursor) {
  const [y, m] = jparts(cursor);
  let first = cursor;
  while (jparts(addDays(first, -1))[1] === m) first = addDays(first, -1);
  let len = 0, d = first;
  while (jparts(d)[1] === m) { len++; d = addDays(d, 1); }
  const lead = (new Date(`${first}T12:00:00`).getDay() + 1) % 7; // شنبه ستون اول
  const cells = [...Array(lead).fill(''), ...Array.from({ length: len }, (_, i) => i + 1)];
  const [ty, tm, td] = jparts(today);
  return `<div class="tp-cal-head"><button type="button" class="tp-mini" data-cal="${addDays(first, len + 1)}" aria-label="ماه بعد">${li('next', 18)}</button><b>${JMONTHS[m - 1]} ${fa(y)}</b><button type="button" class="tp-mini" data-cal="${addDays(first, -2)}" aria-label="ماه قبل">${li('back', 18)}</button></div>
    <div class="tp-cal-grid">${['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((w) => `<i>${w}</i>`).join('')}${cells.map((n) => `<span class="${n === td && m === tm && y === ty ? 'on' : ''}">${n ? fa(n) : ''}</span>`).join('')}</div>`;
}

export async function home(el, _p, me) {
  const [d, students, report, exams, asg, contacts] = await Promise.all([
    api('/api/teacher/overview'), api('/api/teacher/students').catch(() => []), api('/api/teacher/assignments-report').catch(() => ({ classes: [] })),
    api('/api/teacher/exams').catch(() => []), api('/api/teacher/assignments').catch(() => []), api('/api/messages/contacts').catch(() => []),
  ]);
  classesCache = d.classes;
  setHead('خانه');
  const name = esc(lastName(me.user.full_name));
  const female = isFemale(me);
  const tiles = [
    ['#/attendance', 'check-circle', 'حضور و غیاب', 'mint', 3, ''], ['#/manual-scores', 'file-text', 'ثبت نمره', 'lilac', 2, '<em>A+</em>'], ['#/assignments?new=1', 'clipboard', 'ثبت تکلیف', 'mint2', 1, ''],
    ['#/materials', 'video', 'محتوای آموزشی', 'rose', 6, ''], ['#/exams', 'file-check', 'آزمون جدید', 'sand', 5, ''], ['#/messages', 'users', 'پیام به دانش‌آموزان', 'sky', 4, ''],
  ];
  const perf = classPerformance(d.classes, students).slice(0, 3);
  const t = report.classes.reduce((a, c) => ({ o: a.o + (c.onTime || 0), l: a.l + (c.late || 0), m: a.m + (c.missing || 0) }), { o: 0, l: 0, m: 0 });
  const total = t.o + t.l + t.m, done = total ? Math.round(((t.o + t.l) / total) * 100) : 0;
  const month = jparts(me.today).slice(0, 2).join('-');
  const examsMonth = exams.filter((e) => jparts(e.created_at).slice(0, 2).join('-') === month).length;
  const activity = [...exams.map((e) => ({ at: e.created_at, ic: 'file-check', text: `آزمون ${e.title}`, href: `#/exams/${e.id}` })), ...asg.map((a) => ({ at: a.created_at, ic: 'clipboard', text: `تکلیف ${a.title}`, href: '#/assignments' }))]
    .filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 4);
  const msgs = contacts.filter((c) => c.last).slice(0, 3);

  el.innerHTML = `<div class="tp-home">
    <div class="tp-col">
      <section class="tp-hero ${female ? 'female' : ''}">
        <picture><source media="(min-width:768px)" srcset="/img/teacher/hero-desktop.webp"><img class="tp-hero-bg" src="/img/teacher/hero-mobile${female ? '-bg' : ''}.webp" alt=""></picture>
        ${female ? '<img class="tp-hero-person" src="/img/visual-refresh/dashboard-teacher.webp" alt="">' : ''}
        <div class="tp-hello"><h2>سلام استاد ${name} <span aria-hidden="true">👋</span></h2><p>به پنل معلم خوش آمدید</p><p class="tp-desk">امروز ${fa(d.today.length)} کلاس و ${fa(d.stats.openAssignments)} تکلیف در انتظار شماست.</p></div>
      </section>
      <section class="tp-stats"><a href="#/assignments">${icon('calendar', { size: 34 })}<b>${fa(d.stats.openAssignments)}</b><span>تکلیف فعال</span></a><a href="#/reports">${icon('users', { size: 34 })}<b>${fa(d.stats.students)}</b><span>دانش‌آموز</span></a><a href="#/classes">${icon('users', { size: 34 })}<b>${fa(d.classes.length)}</b><span>کلاس من</span></a></section>
      <nav class="tp-tiles" aria-label="دسترسی سریع">${tiles.map(([h, i, l, c, o, extra]) => `<a class="tp-tile ${c}" href="${h}" style="--o:${o}"><span class="tp-ti">${icon(i, { size: 54 })}${extra}</span><b>${l}</b></a>`).join('')}</nav>
      <div class="tp-cards tp-desk">
        <section class="tp-card"><h3>${li('calendar', 22)}کلاس‌های امروز</h3>${d.today.length ? d.today.slice(0, 3).map((s) => `<a class="tp-slot" href="#/attendance/${s.class_id}"><span class="tp-slot-ic">${subjIcon(s.subject, 30)}</span><span class="grow"><b>${esc(s.subject)}</b><small>${gradeName(s.grade)} ${esc(s.class_name)}</small></span><time>${fa(s.start)} – ${fa(s.end)}</time></a>`).join('') : '<p class="tp-none">امروز کلاسی ندارید</p>'}<a class="tp-link" href="#/plans">${li('calendar', 18)}مشاهده برنامه هفتگی</a></section>
        <section class="tp-card"><h3>${li('calendar', 22)}عملکرد کلاس‌ها</h3>${perf.length ? bars(perf.map((p) => ({ label: clsLabel(p.c), value: p.avg }))) : '<p class="tp-none">داده‌ای نیست</p>'}<a class="tp-link" href="#/reports">گزارش تفصیلی</a></section>
        <section class="tp-card"><h3>${li('check', 22)}وضعیت تکالیف</h3><div class="tp-donut-row"><ul><li><i class="g"></i>تحویل شده<b>${fa(t.o)}</b></li><li><i class="y"></i>در انتظار<b>${fa(t.m)}</b></li><li><i class="r"></i>دیرکرد<b>${fa(t.l)}</b></li></ul><span class="tp-donut" style="--p:${done}"><b>${percent(done)}</b><small>تحویل شده</small></span></div><a class="tp-link" href="#/assignments/report">مشاهده جزئیات</a></section>
        <section class="tp-card"><h3>${li('clock', 22)}فعالیت‌های اخیر</h3>${activity.length ? activity.map((a) => `<a class="tp-act" href="${a.href}">${icon(a.ic, { size: 24 })}<span class="grow">${esc(a.text)}</span><time>${timeAgo(a.at)}</time></a>`).join('') : '<p class="tp-none">فعالیتی ثبت نشده</p>'}</section>
        <section class="tp-card"><h3>${li('chart', 22)}آمار کلی من</h3><div class="tp-mine"><a href="#/reports">${icon('graduation', { size: 38 })}<b>${fa(d.stats.students)}</b><span>دانش‌آموز</span></a><a href="#/classes">${icon('users', { size: 38 })}<b>${fa(d.classes.length)}</b><span>کلاس فعال</span></a><a href="#/exams">${icon('flask', { size: 38 })}<b>${fa(examsMonth)}</b><span>آزمون این ماه</span></a><a href="#/assignments">${icon('clipboard', { size: 38 })}<b>${fa(d.stats.openAssignments)}</b><span>تکلیف جاری</span></a></div></section>
        <section class="tp-card"><h3>${li('mail', 22)}آخرین پیام‌ها</h3>${msgs.length ? msgs.map((c) => `<a class="tp-act" href="#/messages/${c.id}">${icon('message', { size: 24 })}<span class="grow"><b>${esc(c.name)}</b><small>${esc(c.last.body)}</small></span><time>${timeAgo(c.last.created_at)}</time></a>`).join('') : '<p class="tp-none">پیامی نیست</p>'}<a class="tp-link" href="#/messages">مشاهده همه پیام‌ها</a></section>
      </div>
      <a class="tp-res tp-res-m" href="#/hoosh-studio"><div><h3>منابع آموزشی</h3><p>دسترسی به محتوای درسی، آزمون و نمونه سوال</p><span class="tp-yellow">${li('back', 16)}مشاهده و استفاده</span></div><img src="/img/teacher/resources.webp" alt=""></a>
    </div>
    <aside class="tp-side tp-desk">
      <section class="tp-card"><h3>${li('calendar', 22)}تقویم کاری</h3><div id="tpCal">${calendarHtml(me.today, me.today)}</div>
        <h4>${li('calendar', 18)}رویدادهای امروز</h4>${d.today.length ? d.today.slice(0, 3).map((s, i) => `<div class="tp-ev"><i class="${['g', 'y', 'v'][i % 3]}"></i><span class="grow">کلاس ${esc(s.subject)} (${gradeName(s.grade)} ${esc(s.class_name)})</span><time>${fa(s.start)}</time></div>`).join('') : '<p class="tp-none">رویدادی نیست</p>'}
        <a class="tp-link" href="#/plans">${li('calendar', 18)}مشاهده تقویم کامل</a></section>
      <a class="tp-res tp-res-d" href="#/hoosh-studio"><div><h3>منابع آموزشی</h3><p>دسترسی به محتوا، آزمون و نمونه سوال</p></div><img src="/img/teacher/resources.webp" alt=""><span class="tp-yellow">ورود به کتابخانه</span></a>
    </aside>
  </div>`;
  on(el, 'click', '[data-cal]', (e, b) => { $('#tpCal', el).innerHTML = calendarHtml(me.today, b.dataset.cal); });
}

// ---------- کلاس‌های من ----------
export async function classes(el) {
  const d = await api('/api/teacher/overview');
  classesCache = d.classes;
  const live = d.classes.filter((c) => d.today.some((s) => s.class_id === c.id));
  let tab = live.length ? 'live' : 'all';
  setHead('کلاس‌های من', 'حضور و غیاب، تکلیف و نمره هر کلاس', `<a class="tp-round tp-primary tp-head-act" href="#/assignments?new=1" aria-label="تکلیف جدید">${li('plus', 24)}</a>`);
  const ICONS = ['book', 'file-text', 'target', 'flask'];
  const draw = () => {
    const list = tab === 'live' ? live : d.classes;
    el.innerHTML = `<div class="tp-tabs two" role="tablist"><button role="tab" aria-selected="${tab === 'live'}" class="${tab === 'live' ? 'on' : ''}" data-t="live">در حال برگزاری (${fa(live.length)})</button><button role="tab" aria-selected="${tab === 'all'}" class="${tab === 'all' ? 'on' : ''}" data-t="all">همه کلاس‌ها (${fa(d.classes.length)})</button></div>
    <div class="tp-classes">${list.map((c, i) => `<article class="tp-class"><a class="tp-class-top" href="#/students?class=${c.id}"><span class="tp-class-ic">${icon(ICONS[i % ICONS.length], { size: 58 })}</span><span class="grow"><b>${esc(clsTitle(c))}</b><small>${li('users', 19)}${fa(c.students)} دانش‌آموز</small></span><span class="tp-mini">${li('back', 18)}</span></a>
      <div class="tp-chips"><a href="#/attendance/${c.id}">${icon('check-circle', { size: 22 })}حضور و غیاب</a><a href="#/assignments?class=${c.id}">${icon('file-text', { size: 22 })}تکلیف</a><a href="#/manual-scores"><em>A+</em>نمره</a></div></article>`).join('') || `<div class="tp-card">${empty('calendar', 'کلاسی برای نمایش نیست')}</div>`}</div>`;
  };
  draw();
  on(el, 'click', '[data-t]', (e, b) => { tab = b.dataset.t; draw(); });
}

// ---------- حضور و غیاب ----------
export async function attendance(el, params) {
  const list = await myClasses();
  let classId = Number(params.id) || list[0]?.id;
  let date = state.me.today, rows = [], saved = false, term = '';
  const NEXT = { present: 'absent', absent: 'excused', excused: 'present' };
  const LBL = { present: 'حاضر', absent: 'غایب', excused: 'با اطلاع' };
  const MARK = { present: 'tick', absent: 'x', excused: 'dash' };
  setHead('حضور و غیاب', 'با هر لمس وضعیت عوض می‌شود: حاضر ← غایب ← غایب با اطلاع', `<button type="button" class="tp-round tp-head-act tp-cal-btn" id="pickDate" aria-label="انتخاب تاریخ">${li('calendar', 24)}</button>`);
  if (!list.length) { el.innerHTML = `<div class="tp-card">${empty('calendar', 'کلاسی به شما اختصاص داده نشده است')}</div>`; return; }
  const count = (st) => rows.filter((r) => r.status === st).length;
  const drawStats = () => { $('#attStats', el).innerHTML = [['excused', 'clock', 'violet'], ['absent', 'x', 'orange'], ['present', 'tick', 'green']].map(([k, ic, c]) => `<div class="tp-att-stat ${c}"><div><span class="tp-mark ${k}">${li(ic, 16)}</span>${LBL[k]}</div><b>${fa(count(k))} نفر</b></div>`).join(''); };
  const drawRows = () => {
    const shown = rows.filter((r) => r.full_name.includes(term));
    $('#attList', el).innerHTML = shown.map((r) => `<button type="button" class="tp-att-row" data-sid="${r.id}" aria-label="${esc(r.full_name)}: ${LBL[r.status]}">${avatar(r.avatar, 'sm')}<b class="grow">${esc(r.full_name)}</b><span class="tp-mark ${r.status}">${li(MARK[r.status], 18)}</span></button>`).join('') || '<p class="tp-none">دانش‌آموزی پیدا نشد</p>';
  };
  const draw = () => {
    $('#attDay', el).textContent = jdate(date, { weekday: true });
    $('#nextDay', el).disabled = date >= state.me.today;
    $('#attSaved', el).hidden = !saved;
    drawStats(); drawRows();
  };
  const load = async () => {
    const d = await api(`/api/teacher/attendance?class_id=${classId}&date=${date}`);
    rows = d.students.map((s) => ({ ...s, status: s.status || 'present' }));
    saved = d.saved;
    draw();
  };
  el.innerHTML = `<div class="tp-att">
    <label class="tp-select">${icon('users', { size: 26 })}<span class="sr-only">کلاس</span><select id="attClass">${list.map((c) => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(clsTitle(c))}</option>`).join('')}</select></label>
    <div class="tp-day"><button type="button" class="tp-mini" id="nextDay" aria-label="روز بعد">${li('next', 18)}</button><span>${li('calendar', 22)}<b id="attDay"></b></span><button type="button" class="tp-mini" id="prevDay" aria-label="روز قبل">${li('back', 18)}</button></div>
    <div class="tp-att-stats" id="attStats"></div>
    <div class="tp-saved" id="attSaved" hidden>قبلاً ثبت شده — ویرایش</div>
    <label class="tp-search">${li('search', 22)}<span class="sr-only">جستجوی دانش‌آموز</span><input id="attQ" placeholder="جستجوی دانش‌آموز..." autocomplete="off"></label>
    <div class="tp-att-list" id="attList"></div>
    <div class="tp-att-actions"><button type="button" class="tp-btn primary" id="saveAtt">${li('tick', 20)}ثبت نهایی</button><button type="button" class="tp-btn" id="allPresent" title="همه را حاضر می‌کند">${li('qr', 22)}ثبت خودکار</button></div>
  </div>`;
  $('#attClass', el).onchange = (e) => { classId = Number(e.target.value); load(); };
  $('#prevDay', el).onclick = () => { date = addDays(date, -1); load(); };
  $('#nextDay', el).onclick = () => { if (date < state.me.today) { date = addDays(date, 1); load(); } };
  $('#attQ', el).oninput = (e) => { term = e.target.value.trim(); drawRows(); };
  $('#pickDate').onclick = () => modal({ title: 'انتخاب تاریخ', body: dateField('attDate', date, { minYear: 1404, maxYear: 1406 }), actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'نمایش', onClick: async (m) => { const d = readDate(m, 'attDate'); if (!d) throw new Error('تاریخ را کامل کنید'); if (d > state.me.today) throw new Error('ثبت حضور برای روزهای آینده ممکن نیست'); date = d; await load(); } }] });
  on(el, 'click', '.tp-att-row', (e, b) => { const r = rows.find((x) => x.id === Number(b.dataset.sid)); r.status = NEXT[r.status]; drawStats(); drawRows(); });
  $('#allPresent', el).onclick = () => { rows.forEach((r) => { r.status = 'present'; }); drawStats(); drawRows(); };
  $('#saveAtt', el).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await post('/api/teacher/attendance', { class_id: classId, date, records: rows.map((x) => ({ student_id: x.id, status: x.status })) });
    await modal({ title: 'حضور و غیاب ثبت شد', body: `<div class="grid c3 center"><div class="card flat"><div class="pos" style="font-size:26px">${fa(r.present)}</div><div class="small">حاضر</div></div><div class="card flat"><div class="neg" style="font-size:26px">${fa(r.absent)}</div><div class="small">غایب</div></div><div class="card flat"><div style="font-size:26px;color:#a16207;font-weight:800">${fa(r.excused)}</div><div class="small">غایب با اطلاع</div></div></div>
      <div class="card tint-orange" style="margin-top:14px"><div class="row"><span class="ib">${icon('phone', { size: 18 })}</span><div><b>تعداد پیامک غیبت برای ارسال به والدین: ${fa(r.sms)}</b><div class="small muted">ارسال پیامک از داشبورد مدیر کانون انجام می‌شود. غیبت بدون اطلاع ۵ امتیاز منفی دارد.</div></div></div></div>`, actions: [{ label: 'باشه', value: true }] });
    load();
  });
  load();
}

// ---------- گزارش‌ها ----------
export async function reports(el) {
  setHead('گزارش‌ها', 'عملکرد کلاس‌ها، تکالیف، آزمون‌ها و حضور');
  const [list, students, report, exams] = await Promise.all([myClasses(), api('/api/teacher/students').catch(() => []), api('/api/teacher/assignments-report').catch(() => ({ classes: [] })), api('/api/teacher/exams').catch(() => [])]);
  let tab = 'perf';
  const perf = classPerformance(list, students);
  const rowHtml = (href, title, sub, v, text) => `<a class="tp-rep-row" href="${href}">${ring(v, text)}<span class="grow"><b>${esc(title)}</b><small>${sub}</small></span><span class="tp-mini">${li('back', 18)}</span></a>`;
  const view = {
    perf: () => ({ title: 'میانگین عملکرد کلاس‌ها', items: perf.map((p) => ({ label: clsLabel(p.c), value: p.avg })), rows: perf.map((p) => rowHtml(`#/students?class=${p.c.id}`, clsTitle(p.c), `میانگین نمرات: ${p.avg == null ? '—' : score20(p.avg)}`, p.avg)).join('') }),
    asg: () => { const r = report.classes.map((c) => { const all = (c.onTime || 0) + (c.late || 0) + (c.missing || 0); return { c, v: all ? ((c.onTime + c.late) / all) * 100 : null, all }; }); return { title: 'درصد ارسال تکالیف', items: r.map((x) => ({ label: clsLabel(x.c), value: x.v })), rows: r.map((x) => rowHtml('#/assignments/report', `کلاس ${clsLabel(x.c)}`, `به‌موقع ${fa(x.c.onTime || 0)} · با تأخیر ${fa(x.c.late || 0)} · ارسال‌نشده ${fa(x.c.missing || 0)}`, x.v)).join('') }; },
    exam: () => { const r = exams.filter((e) => e.avg != null).slice(0, 8); return { title: 'میانگین آزمون‌های اخیر', items: r.slice(0, 4).map((e) => ({ label: e.title, value: e.avg })), rows: r.map((e) => rowHtml(`#/exams/${e.id}`, e.title, `${fa(e.results)} شرکت‌کننده`, e.avg)).join('') }; },
    att: () => { const max = Math.max(1, ...perf.map((p) => p.absences)); return { title: 'تعداد غیبت ۳۰ روز اخیر', items: perf.map((p) => ({ label: clsLabel(p.c), value: (p.absences / max) * 100, text: fa(p.absences) })), rows: perf.map((p) => rowHtml(`#/attendance/${p.c.id}`, clsTitle(p.c), `${fa(p.absences)} غیبت در ۳۰ روز اخیر`, (p.absences / max) * 100, fa(p.absences))).join('') + '<a class="tp-link" href="#/att-log">لاگ تغییر حضور</a>' }; },
  };
  const draw = () => {
    const v = view[tab]();
    el.innerHTML = `<div class="tp-tabs" role="tablist">${[['perf', 'عملکرد کلاس‌ها'], ['asg', 'تکالیف'], ['exam', 'آزمون‌ها'], ['att', 'حضور و غیاب']].map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="tp-rep"><section class="tp-card"><h3>${v.title}</h3>${v.items.length ? bars(v.items) : '<p class="tp-none">داده‌ای برای نمایش نیست</p>'}</section><section class="tp-card tp-rep-list">${v.rows || '<p class="tp-none">داده‌ای برای نمایش نیست</p>'}</section></div>`;
  };
  draw();
  on(el, 'click', '[data-t]', (e, b) => { tab = b.dataset.t; draw(); });
}

// ---------- موارد بیشتر ----------
export function more(el) {
  setHead('موارد بیشتر', 'همه‌ی بخش‌های پنل معلم');
  const items = [['#/assignments', 'clipboard', 'تکالیف'], ['#/exams', 'file-check', 'آزمون و اسکن پاسخ‌برگ'], ['#/manual-scores', 'file-text', 'نمرات مستمر کلاسی'], ['#/attendance', 'check-circle', 'حضور و غیاب'], ['#/hoosh-studio', 'sparkles', 'استودیوی هوش کمپلکس'], ['#/students', 'users', 'عملکرد دانش‌آموزان'], ['#/plans', 'timer', 'برنامه پومودوروی هفتگی'], ['#/materials', 'video', 'ویدیو و جزوه'], ['#/att-log', 'user-check', 'لاگ تغییر حضور'], ['#/messages', 'message', 'پیام‌ها'], ['#/announcements', 'megaphone', 'اطلاعیه‌ها'], ['#/account', 'sliders', 'حساب کاربری']];
  el.innerHTML = `<div class="tp-more">${items.map(([h, i, l]) => `<a class="tp-tile sky" href="${h}"><span class="tp-ti">${icon(i, { size: 46 })}</span><b>${l}</b></a>`).join('')}<button type="button" class="tp-tile rose" id="tpOut"><span class="tp-ti">${icon('logout', { size: 46 })}</span><b>خروج از حساب</b></button></div>`;
  $('#tpOut', el).onclick = () => $('#logoutBtn')?.click();
}
