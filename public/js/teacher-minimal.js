// پوسته و خانهٔ مینیمال معلم؛ عملیات آموزشی از همان مسیرهای پنل فعلی استفاده می‌کنند.
import { api, esc, fa, icon, logoHtml, nameAvatar, setHead, gradeName, jdate, timeAgo } from './core.js';
import { lookToggleHtml } from './look.js';

const GROUPS = [
  { paths: ['/home', '/classes'] },
  { title: 'آموزش', paths: ['/attendance', '/assignments', '/exams', '/reports', '/materials'] },
  { title: 'برنامه‌ریزی و ارتباطات', paths: ['/timetable', '/plans', '/messages', '/more'] },
];
const ICONS = { '/home': 'dashboard', '/classes': 'users', '/attendance': 'user-check', '/assignments': 'clipboard', '/exams': 'file-check', '/reports': 'chart', '/materials': 'book', '/timetable': 'calendar', '/plans': 'timer', '/messages': 'message', '/more': 'grid', '/account': 'user' };
const LABELS = { '/home': 'میز کار', '/plans': 'برنامه مطالعاتی', '/messages': 'پیام‌ها' };
const navItem = (n) => `<a class="nav-item" href="#${n.path}" data-path="${n.path}"><span class="ni">${icon(ICONS[n.path] || n.icon, { size: 19 })}</span><span class="nl">${esc(LABELS[n.path] || n.label)}</span>${n.badge ? `<span class="cnt">${fa(n.badge)}</span>` : ''}</a>`;

export function teacherShellHtml(me, nav, bottom) {
  const byPath = new Map(nav.map((n) => [n.path, n]));
  const used = new Set(GROUPS.flatMap((g) => g.paths));
  const rest = nav.filter((n) => !used.has(n.path));
  return `${me.impersonator ? `<div class="imp-bar" role="status">در حال مشاهدهٔ پنل «${esc(me.user.full_name)}» <button class="btn sm ghost" id="stopImp">بازگشت</button></div>` : ''}
    <a class="sr-only" href="#view" onclick="event.preventDefault();document.getElementById('view').focus()">پرش به محتوا</a>
    <div class="app theme-staff">
      <aside class="sidebar no-print" id="sidebar">
        <a class="ad-brand" href="#/home"><span class="ad-logo">${logoHtml(me.center?.logo || '/img/logo-ashtiani.png')}</span><span><b>${esc(me.center?.name || 'کانون آشتیانی')}</b><small>پنل معلم</small></span></a>
        <nav class="ad-nav" aria-label="منوی اصلی">${GROUPS.map((g) => `<div class="ad-group">${g.title ? `<div class="ad-gt">${g.title}</div>` : ''}${g.paths.map((p) => byPath.get(p)).filter(Boolean).map(navItem).join('')}</div>`).join('')}${rest.map(navItem).join('')}</nav>
        <div class="ad-foot">${lookToggleHtml('new')}<a class="nav-item" href="#/account" data-path="/account"><span class="ni">${icon('user', { size: 19 })}</span><span>حساب کاربری</span></a><button class="nav-item" type="button" id="logoutBtn"><span class="ni">${icon('logout', { size: 19 })}</span><span>خروج از حساب</span></button></div>
      </aside>
      <main class="main">
        <div class="topbar ad-top">
          <button class="icon-btn ad-menu" id="menuBtn" type="button" aria-label="باز کردن منوی معلم" aria-controls="sidebar" aria-expanded="false">${icon('menu', { size: 22 })}</button>
          <div class="title"><h1></h1><div class="sub"></div></div>
          <div class="actions"><span class="actions-slot row wrap"></span><a class="icon-btn ad-bell" href="#/messages" aria-label="پیام‌ها${me.unread ? `، ${fa(me.unread)} خوانده‌نشده` : ''}">${icon('message', { size: 20 })}${me.unread ? '<span class="dot"></span>' : ''}</a><div class="me-chip" id="meChip" role="button" tabindex="0" aria-label="حساب کاربری من">${nameAvatar(me.user.full_name)}<div><div class="nm">${esc(me.user.full_name)}</div><div class="rl">معلم</div></div></div></div>
        </div><div id="view" tabindex="-1" style="outline:none"></div>
      </main>
    </div><nav class="bottom-nav no-print" aria-label="منوی پایین">${bottom.map((n) => `<a href="#${n.path}" data-path="${n.path}"><span class="bi">${icon(ICONS[n.path] || n.icon, { size: 22 })}</span><span>${esc(n.label)}</span></a>`).join('')}</nav>`;
}

export function prepareTeacher() {
  document.body.dataset.concept = 'b';
  // خانهٔ مینیمال سربرگ معمولی دارد؛ کلاس teacher-home فقط برای پوستهٔ فانتزی است.
  document.body.classList.remove('teacher-home');
}

const classLabel = (c) => `${gradeName(c.grade)} ${c.name}`;
const card = (title, href, body) => `<section class="ad-card"><header><h3>${title}</h3>${href ? `<a class="tm-text-link" href="${href}">مشاهده همه ${icon('chevron-left', { size: 15 })}</a>` : ''}</header>${body}</section>`;

export async function home(el, _params, me) {
  const d = await api('/api/teacher/overview');
  setHead('میز کار معلم', jdate(me.today, { weekday: true }));
  const stats = [
    ['calendar', d.today.length, 'کلاس امروز', '#/timetable'],
    ['clipboard', d.stats.openAssignments, 'تکلیف فعال', '#/assignments'],
    ['users', d.stats.students, 'دانش‌آموزان من', '#/classes'],
    ['message', me.unread || 0, 'پیام خوانده‌نشده', '#/messages'],
  ];
  const classesToday = [...d.today].sort((a, b) => a.start.localeCompare(b.start));
  const todayHtml = classesToday.length ? classesToday.map((s) => `<article class="tm-session"><time>${fa(s.start)}<small>تا ${fa(s.end)}</small></time><div class="grow"><h4>${esc(s.subject)}</h4><p>${gradeName(s.grade)} ${esc(s.class_name)}</p><small class="tm-room">${icon('building', { size: 15 })}${esc(s.room || 'مکان مشخص نشده')}</small></div><a class="btn soft sm" href="#/attendance/${s.class_id}">ثبت حضور</a></article>`).join('') : `<div class="tm-empty">${icon('calendar', { size: 28 })}<b>امروز کلاسی ندارید</b><a href="#/timetable">مشاهده برنامهٔ هفته</a></div>`;
  const tasks = `<a class="tm-task" href="#/assignments/report">${icon('clipboard', { size: 21 })}<span class="grow"><b>بررسی ارسال تکالیف</b><small>ارسال‌های دو روز اخیر</small></span><span class="tm-count">${fa(d.stats.newSubmissions)}</span></a><a class="tm-task" href="#/exams">${icon('file-check', { size: 21 })}<span class="grow"><b>آزمون‌ها و نمرات</b><small>ساخت آزمون و مشاهدهٔ نتایج</small></span>${icon('chevron-left', { size: 17 })}</a><a class="tm-task" href="#/messages">${icon('message', { size: 21 })}<span class="grow"><b>پیام‌های من</b><small>گفت‌وگو با دانش‌آموزان و همکاران</small></span><span class="tm-count">${fa(me.unread || 0)}</span></a>`;
  const classes = d.classes.length ? `<div class="tm-class-grid">${d.classes.slice(0, 6).map((c) => `<article class="tm-class"><span class="tm-subject">${icon('book', { size: 22 })}</span><h4>${esc(classLabel(c))}</h4><p>${esc(c.subjects || 'درس مشخص نشده')}</p><small>${fa(c.students)} دانش‌آموز</small><div><a href="#/students?class=${c.id}">دانش‌آموزان ${icon('chevron-left', { size: 14 })}</a><a href="#/assignments?class=${c.id}">تکالیف</a></div></article>`).join('')}</div>` : '<p class="tm-empty">هنوز کلاسی به شما اختصاص داده نشده است.</p>';
  el.innerHTML = `<div class="ad-dash tm-home"><section class="ad-hero"><div><h2>سلام ${esc(me.user.full_name)}</h2><p>برنامه و کارهای آموزشی شما، در یک نگاه</p></div><div class="ad-actions"><a class="btn" href="#/assignments?new=1">${icon('plus', { size: 18 })}ثبت تکلیف</a><a class="btn ghost" href="#/exams">آزمون‌ها</a></div></section>
    <div class="ad-kpis ad-kpis-4">${stats.map(([ic, value, label, href]) => `<a class="ad-kpi" href="${href}"><span class="kt">${icon(ic, { size: 19 })}${label}</span><b class="kv">${fa(value)}</b></a>`).join('')}</div>
    <div class="tm-workspace">${card('کلاس‌های امروز', '#/timetable', todayHtml)}${card('صندوق کار', '', tasks)}</div>
    ${card('کلاس‌های من', '#/classes', classes)}
    ${card('آخرین پیام‌ها', '#/messages', '<div class="tm-recent" aria-live="polite">در حال دریافت پیام‌ها…</div>')}</div>`;
  // خرابی پیام‌رسان نباید مانع نمایش برنامه و کلاس‌ها شود.
  try {
    const contacts = await api('/api/messages/contacts');
    const recent = contacts.filter((c) => c.last).sort((a, b) => String(b.last.created_at).localeCompare(String(a.last.created_at))).slice(0, 3);
    el.querySelector('.tm-recent').innerHTML = recent.length ? recent.map((c) => `<a class="tm-task" href="#/messages/${c.id}">${nameAvatar(c.name)}<span class="grow"><b>${esc(c.name)}</b><small class="ellipsis">${esc(c.last.body)}</small></span><time>${timeAgo(c.last.created_at)}</time></a>`).join('') : '<p class="muted small">هنوز پیامی ندارید.</p>';
  } catch { el.querySelector('.tm-recent').innerHTML = '<a class="tm-text-link" href="#/messages">برای بررسی پیام‌ها وارد پیام‌رسان شوید</a>'; }
}
