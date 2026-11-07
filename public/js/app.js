import { decoratePageArt } from './artwork.js';
import { decorateDashboard } from './reference-ui.js';
// راه‌انداز برنامه: پوسته، منو، مسیر‌یابی نقش‌ها، اطلاعیه تمام‌صفحه، تبریک تولد و قفل پنل
import { state, api, post, esc, fa, $, $$, on, toast, confetti, logoHtml, ROLE_NAMES, avatar, nameAvatar, jdate, loading, empty, gradeName, icon, labelControls, dateField, readDate } from './core.js';
import { loginView } from './login.js';
import { publicRoutes } from './shop.js';
import * as student from './student.js';
import * as teacher from './teacher.js';
import { prepareManager, decorateManager } from './manager-ui.js';
import { prepareTeacher } from './teacher-ui.js';
import * as manager from './manager.js';
import * as admin from './admin.js';
import * as counselor from './counselor.js';

const PANELS = { student, teacher, counselor, manager, admin };
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.contact, tr[data-href], tr.click, .feature-tile[onclick]')) { e.preventDefault(); e.target.click(); } });
// خطای عملیات‌های پس‌زمینه بی‌صدا نماند
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.message) toast(e.reason.message, 'err'); });
let labelTimer; new MutationObserver(() => { clearTimeout(labelTimer); labelTimer = setTimeout(() => labelControls(), 60); }).observe(document.body, { childList: true, subtree: true });
const root = document.getElementById('root');

async function loadMe() {
  try { state.me = await api('/api/me'); } catch { state.me = null; }
  return state.me;
}

function shell(me) {
  const panel = PANELS[me.user.role];
  const c = me.center;
  const isCounselor = me.user.role === 'counselor';
  const coLogo = logoHtml(c?.logo || '/img/logo-ashtiani.png');
  const locked = me.fee?.locked;
  const navHtml = panel.nav(me).map((n) => {
    const isLocked = locked && !n.open;
    return `<a class="nav-item ${isLocked ? 'locked' : ''}" href="#${n.path}" data-path="${n.path}"><span class="ni">${icon(isLocked ? 'lock' : n.icon)}</span><span>${n.label}</span>${n.badge ? `<span class="cnt">${fa(n.badge)}</span>` : ''}</a>`;
  }).join('');
  const bottom = (panel.bottomNav?.(me) || []).map((n) => `<a href="#${n.path}" data-path="${n.path}"><span class="bi">${me.user.role === 'student' ? student.navIcon(locked && !n.open ? 'more' : n.icon) : icon(locked && !n.open ? 'lock' : n.icon, { size: 22 })}</span>${n.label}${n.badge ? `<span class="cnt">${fa(n.badge)}</span>` : ''}</a>`).join('');
  const who = me.student ? avatar(me.student.avatar) : nameAvatar(me.user.full_name);
  const brandName = c ? esc(c.name) : 'مدیریت سامانه';
  root.innerHTML = `
    ${me.impersonator ? `<div class="imp-bar" role="status">${icon('eye', { size: 18 })} در حال مشاهده پنل «${esc(me.user.full_name)}» (${ROLE_NAMES[me.user.role]}) به‌جای ${esc(me.impersonator.full_name)} <button class="btn sm ghost" id="stopImp">بازگشت به پنل مدیر سامانه</button></div>` : ''}
    <div class="mobile-head no-print"><a class="sr-only" href="#view" onclick="event.preventDefault();document.getElementById('view').focus()">پرش به محتوا</a><button class="icon-btn" id="menuBtn" aria-label="باز کردن منو" aria-controls="sidebar" aria-expanded="false">${icon('menu', { size: 22 })}</button><div class="brand-logo">${me.user.role === 'student' ? student.studentLogo(c) : isCounselor ? coLogo : logoHtml(c?.logo)}</div>
      <div class="grow"><div class="t1 ellipsis">${brandName}</div><div class="t2">پلتفرم رشد نخبه</div></div>${who}</div>
    ${me.user.role === 'student' ? student.shellHeader(me) : ''}
    ${isCounselor ? `<header class="co-header no-print"><a class="co-brand" href="#/home"><span class="brand-logo">${coLogo}</span><span><b>${brandName}</b><small>سامانه مشاوره تحصیلی</small></span></a><a class="co-user" href="#/account">${who}<span><b>مشاور تحصیلی</b><small>${esc(me.user.full_name)}</small></span></a><div class="co-tools"><a href="#/sessions" aria-label="جلسات مشاوره">${counselor.coIcon('bell')}</a><a href="#/messages" aria-label="پیام‌ها">${counselor.coIcon('message')}</a><button id="coMenu" aria-label="باز کردن منو" aria-controls="sidebar" aria-expanded="false">${counselor.coIcon('menu')}</button></div></header>` : ''}
    <div class="app ${me.user.role === 'student' ? 'theme-student' : 'theme-staff'}">
      <aside class="sidebar no-print" id="sidebar">
        <div class="brand"><div class="brand-logo">${me.user.role === 'student' ? student.studentLogo(c) : isCounselor ? coLogo : logoHtml(c?.logo)}</div><div class="grow"><div class="t1">${brandName}</div><div class="t2">${icon('sprout', { size: 14 })} پلتفرم رشد نخبه</div></div></div>
        <nav class="stack" style="gap:2px" aria-label="منوی اصلی">${navHtml}</nav>
        <div class="foot">
          <div class="row" style="padding:6px">${who}<div class="grow"><div class="bold small ellipsis">${esc(me.user.full_name)}</div><div class="tiny muted">${ROLE_NAMES[me.user.role]}${me.student ? ` • پایه ${gradeName(me.student.grade)}` : ''}</div></div>
          <button class="icon-btn" id="logoutBtn" title="خروج" aria-label="خروج از حساب">${icon('logout')}</button></div>
        </div>
      </aside>
      <main class="main">
        ${isCounselor ? `<div class="co-utility no-print"><div class="co-date">${counselor.coIcon('calendar')} ${jdate(me.today, { weekday: true })}</div><form class="co-search" id="coSearch"><input name="q" aria-label="جستجوی دانش‌آموز" placeholder="جستجوی دانش‌آموز…" autocomplete="off"><button aria-label="جستجو">${counselor.coIcon('search')}</button></form><a class="co-desktop-user" href="#/account">${who}<span><b>مشاور تحصیلی</b><small>${esc(me.user.full_name)}</small></span></a><a class="icon-btn" href="#/messages" aria-label="پیام‌ها">${counselor.coIcon('message')}</a><a class="icon-btn" href="#/sessions" aria-label="جلسات مشاوره">${counselor.coIcon('bell')}</a></div>` : ''}
        <div class="topbar"><div class="title"><h1></h1><div class="sub"></div></div><div class="actions"><span class="actions-slot row wrap"></span>
          <div class="me-chip" id="meChip" role="button" tabindex="0" aria-label="حساب کاربری من">${who}<div><div class="nm">${esc(me.user.full_name)}</div><div class="rl">${ROLE_NAMES[me.user.role]}</div></div></div></div></div>
        <div id="view" tabindex="-1" style="outline:none"></div>
      </main>
    </div>
    ${bottom ? `<nav class="bottom-nav no-print" aria-label="منوی پایین">${bottom}${['student', 'counselor'].includes(me.user.role) ? '' : `<a href="#" id="moreBtn" role="button" aria-controls="sidebar"><span class="bi">${icon('more', { size: 22 })}</span>بیشتر</a>`}</nav>` : ''}`;
  const sb = $('#sidebar');
  const toggle = (open) => {
    sb.classList.toggle('open', open);
    $$('button[aria-controls="sidebar"]').forEach((button) => button.setAttribute('aria-expanded', String(open)));
    if (!open && me.user.role === 'teacher' && sb.contains(document.activeElement)) $('.tp-menu')?.focus();
    if (open) sb.querySelector('.nav-item')?.focus();
    $('.scrim')?.remove();
    if (open) { const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => toggle(false); document.body.append(s); }
  };
  $('#menuBtn').onclick = () => toggle(true);
  $('#coMenu')?.addEventListener('click', () => toggle(true));
  $('#coSearch')?.addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/students?q=' + encodeURIComponent(e.currentTarget.elements.q.value.trim()); });
  // با بزرگ‌شدن پنجره منوی کشویی و پرده‌ی آن بسته می‌شوند
  matchMedia('(min-width: 981px)').addEventListener('change', (e) => { if (e.matches) toggle(false); });
  $('#moreBtn')?.addEventListener('click', (e) => { e.preventDefault(); toggle(true); });
  on(sb, 'click', 'a', () => toggle(false));
  $('#logoutBtn').onclick = async () => { await post('/api/auth/logout'); state.me = null; location.hash = '#/login'; boot(); };
  const goMe = () => { location.hash = me.user.role === 'student' ? '#/profile' : '#/account'; };
  $('#meChip').onclick = goMe;
  $('#meChip').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goMe(); } };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sb.classList.contains('open')) toggle(false); });
  $('#stopImp')?.addEventListener('click', async () => { await post('/api/auth/stop-impersonate'); location.hash = '#/home'; boot(); });
}

function markActive(path) {
  $$('.nav-item, .bottom-nav a[data-path]').forEach((a) => {
    const p = a.dataset.path;
    const on_ = path === p || (p !== '/home' && path.startsWith(p + '/'));
    a.classList.toggle('on', on_);
    if (on_) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function matchPanel(routes, path) {
  for (const r of routes) {
    const keys = [];
    const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = re.exec(path);
    if (m) return { r, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

let rendering = 0;
async function render() {
  const token = ++rendering;
  student.leavePage();
  const path = (location.hash.replace(/^#/, '') || '/home').split('?')[0];
  $('.scrim')?.remove();

  // صفحات عمومی (بدون ورود هم در دسترس)
  const pub = matchPanel(publicRoutes, path);
  document.body.classList.toggle('student-ui', !pub && path !== '/login' && state.me?.user.role === 'student');
  const elementary = !pub && path !== '/login' && student.isElementary(state.me);
  document.body.classList.toggle('student-elementary', elementary);
  document.body.classList.toggle('student-secondary', !elementary && !pub && path !== '/login' && state.me?.user.role === 'student');
  if (!elementary) document.body.classList.remove('elementary-native-page','elementary-map-page');
  document.body.classList.toggle('student-home', !pub && path === '/home' && state.me?.user.role === 'student');
  document.body.classList.toggle('manager-ui', !pub && path !== '/login' && state.me?.user.role === 'manager');
  document.body.classList.toggle('counselor-ui', !pub && path !== '/login' && state.me?.user.role === 'counselor');
  document.body.classList.toggle('teacher-ui', !pub && path !== '/login' && state.me?.user.role === 'teacher');
  if (pub) { const box = document.createElement('div'); root.replaceChildren(box); return pub.r.view(box, pub.params); }
  if (path === '/login' || !state.me) {
    if (state.me) { location.hash = '#/home'; return; }
    const box = document.createElement('div'); root.replaceChildren(box);
    return loginView(box, () => boot());
  }

  const me = state.me;
  if (!$('#view')) shell(me);
  const panel = PANELS[me.user.role];
  let found = matchPanel(panel.routes, path);
  if (!found) { location.hash = '#/home'; return; }
  if (me.user?.role === 'student' && me.student?.profile_done === false) { ensureProfileComplete(me); return; }
  if (me.user?.role === 'student') passwordHint(me);
  if (me.fee?.locked && !found.r.open) { location.hash = '#/payment'; return; }
  markActive(path);
  if (me.user.role === 'student') student.prepareStudentPage(path);
  if (me.user.role === 'teacher') prepareTeacher(me, path);
  if (me.user.role === 'manager') prepareManager(me);
  if (me.user.role === 'counselor') counselor.prepareCounselor(me, path);
  // عنصر تازه برای هر نما تا شنونده‌های نمای قبلی باقی نمانند
  const view = $('#view').cloneNode(false);
  $('#view').replaceWith(view);
  view.innerHTML = loading();
  view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
  window.scrollTo({ top: 0 });
  try {
    await found.r.view(view, found.params, me);
    if (token === rendering) {
      if (path === '/home' && !['student', 'teacher', 'manager', 'counselor'].includes(me.user.role)) decorateDashboard(view, me, panel.nav(me));
      if (me.user.role === 'manager') decorateManager(view, me, path, panel.nav(me));
      else if (me.user.role !== 'counselor' && !student.isElementary(me)) decoratePageArt(view, me, path);
    }
  } catch (e) {
    if (token !== rendering) return;
    view.innerHTML = empty('alert', `<b>این بخش باز نشد</b>${esc(e.message)}<div style="margin-top:12px"><button class="btn ghost sm" onclick="location.reload()">تلاش دوباره</button></div>`);
  }
}

// ---------- اطلاعیه‌های دیده‌نشده (تمام‌صفحه، پشت‌سرهم) و تبریک تولد ----------
function fullscreen(html, onReady) {
  return new Promise((resolve) => {
    const fs = document.createElement('div');
    fs.className = 'fullscreen';
    fs.innerHTML = html;
    document.body.append(fs);
    fs.querySelector('[data-ok]')?.focus();
    onReady(fs, () => { fs.remove(); resolve(); });
  });
}

// تکمیل اجباری پروفایل در اولین ورود (دانش‌آموزانی که با کد ملی، نام و شماره تماس ثبت شده‌اند)
async function ensureProfileComplete(me) {
  if (me.user.role !== 'student' || !me.student || me.student.profile_done !== false) return;
  if (document.querySelector('.force-profile-fullscreen')) return;
  await new Promise((resolve) => {
    const fs = document.createElement('div');
    fs.className = 'fullscreen force-pw-fullscreen force-profile-fullscreen';
    fs.innerHTML = `
      <div class="fs-card" role="dialog" aria-modal="true" aria-labelledby="fpTitle" style="max-width:480px;text-align:right;max-height:92dvh;overflow:auto">
        <div class="big-emoji sun" style="text-align:center">${icon('user', { size: 40 })}</div>
        <h2 id="fpTitle" style="text-align:center;margin:12px 0 6px">تکمیل اطلاعات شما</h2>
        <p class="muted small" style="text-align:center;margin-bottom:16px;line-height:1.8">سلام <b>${esc(me.user.full_name)}</b> عزیز! برای استفاده از پنل، این اطلاعات را یک بار کامل کن.</p>
        <form id="fpForm" class="stack" style="gap:12px" novalidate>
          <div class="field"><label for="fpSchool">نام مدرسه *</label><input class="input" id="fpSchool" name="school" maxlength="100" required autocomplete="organization"></div>
          <div class="field"><label>تاریخ تولد *</label>${dateField('fpBirth', null, { minYear: 1385, maxYear: 1400 })}</div>
          <div class="field"><label for="fpFather">نام پدر</label><input class="input" id="fpFather" name="father_name" maxlength="80" autocomplete="off"></div>
          <div class="field"><label for="fpAddress">نشانی منزل *</label><textarea class="input" id="fpAddress" name="address" maxlength="300" style="min-height:64px" required autocomplete="street-address"></textarea></div>
          <div class="field"><label for="fpPhone">شماره تماس (در صورت تغییر)</label><input class="input ltr" id="fpPhone" name="phone" inputmode="tel" maxlength="11" placeholder="09xxxxxxxxx" autocomplete="tel"></div>
          <div class="field-error" id="fpErr" role="alert" style="display:none;color:var(--red-600);background:var(--red-soft);padding:8px 12px;border-radius:8px;font-size:13px"></div>
          <button class="btn lg block accent" type="submit" id="fpBtn">${icon('check', { size: 18 })} ذخیره و ورود به پنل</button>
        </form>
        <div style="margin-top:14px;text-align:center"><button type="button" class="btn sm ghost" id="fpLogout">${icon('logout', { size: 14 })} خروج از حساب</button></div>
      </div>`;
    document.body.append(fs);
    const form = fs.querySelector('#fpForm'), errEl = fs.querySelector('#fpErr'), btn = fs.querySelector('#fpBtn');
    fs.querySelector('#fpSchool').focus();
    fs.querySelector('#fpLogout').onclick = async () => { await post('/api/auth/logout'); state.me = null; location.hash = '#/login'; fs.remove(); boot(); };
    const showErr = (m) => { errEl.textContent = m; errEl.style.display = 'block'; };
    form.onsubmit = async (e) => {
      e.preventDefault(); errEl.style.display = 'none';
      const birth = readDate(fs, 'fpBirth');
      if (!form.school.value.trim()) return showErr('نام مدرسه را وارد کن');
      if (!birth) return showErr('تاریخ تولد را کامل انتخاب کن');
      if (form.address.value.trim().length < 5) return showErr('نشانی منزل را وارد کن');
      const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'در حال ذخیره…';
      try {
        await post('/api/student/complete-profile', { school: form.school.value, birth_date: birth, father_name: form.father_name.value, address: form.address.value, phone: form.phone.value });
        if (state.me?.student) state.me.student.profile_done = true;
        toast('اطلاعات ذخیره شد. خوش آمدی!', 'ok');
        fs.remove(); resolve();
        await loadMe(); render();
      } catch (err) { showErr(err.message || 'خطا در ذخیره اطلاعات'); } finally { btn.disabled = false; btn.innerHTML = old; }
    };
  });
}
// اطلاعیهٔ غیراجباری: دانش‌آموزی که هنوز رمز اولیه (کد ملی) را عوض نکرده، یک‌بار در هر نشست یادآوری می‌شود
async function passwordHint(me) {
  if (me.user.role !== 'student' || !me.must_change_password) return;
  try { if (sessionStorage.getItem('roshd-pw-hint')) return; sessionStorage.setItem('roshd-pw-hint', '1'); } catch { /* */ }
  toast('رمز عبور فعلی‌ات همان کد ملی است. برای امنیت بیشتر می‌توانی از «پروفایل من» آن را تغییر بدهی (اجباری نیست).', '', 9000);
}

async function showBirthday(me) {
  if (!me.student?.birthday) return;
  const key = `roshd-bday-${me.user.id}-${me.today}`;
  try { if (localStorage.getItem(key)) return; } catch { /* حافظه در دسترس نیست */ }
  confetti(160);
  await fullscreen(`<div class="fs-card" role="dialog" aria-modal="true" aria-labelledby="bdT"><div class="big-emoji sun">${icon('cake', { size: 38 })}</div><h2 id="bdT">تولدت مبارک ${esc(me.user.full_name.split(' ')[0])} جان!</h2>
    <div class="body" style="text-align:center">امروز روز توست. همه اعضای ${esc(me.center.name)} برایت سالی پر از کشف، شادی و موفقیت آرزو می‌کنند.<br>نشان ویژه «ستاره تولد» هم به پروفایلت اضافه شد.</div>
    <button class="btn lg block accent" data-ok>ممنونم</button></div>`, (fs, done) => {
    fs.querySelector('[data-ok]').onclick = () => { try { localStorage.setItem(key, '1'); } catch { /* */ } done(); };
  });
}
async function showAnnouncements(me) {
  const list = me.unseen || [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    await fullscreen(`<div class="fs-card" role="dialog" aria-modal="true" aria-labelledby="anT${i}"><div class="fs-dots" aria-hidden="true">${list.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="badge">اطلاعیه ${fa(i + 1)} از ${fa(list.length)}</div><div class="big-emoji" style="margin-top:14px">${icon('megaphone', { size: 34 })}</div>
      <h2 id="anT${i}">${esc(a.title)}</h2><div class="tiny muted">${jdate(a.created_at)}</div><div class="body">${esc(a.body)}</div>
      <button class="btn lg block" data-ok>${icon('check', { size: 20 })} دیدم</button></div>`, (fs, done) => {
      fs.querySelector('[data-ok]').onclick = async (e) => {
        e.target.disabled = true;
        try { await post(`/api/announcements/${a.id}/seen`); } catch (err) { toast(err.message, 'err'); }
        done();
      };
    });
  }
}

export async function refreshMe() {
  await loadMe();
  if (state.me) { root.innerHTML = ''; render(); }
}

export async function boot() {
  await loadMe();
  root.innerHTML = '';
  if (state.me) {
    let after = null;
    try { after = sessionStorage.getItem('roshd-after-login'); sessionStorage.removeItem('roshd-after-login'); } catch { /* */ }
    if (location.hash === '#/login' || !location.hash) location.hash = after || '#/home';
    await render();
    if (state.me.user.role === 'student' && state.me.student?.profile_done === false) { /* اول فرم تکمیل پروفایل؛ اطلاعیه‌ها در ورود بعدی */ } else {
      await showBirthday(state.me);
      await showAnnouncements(state.me);
    }
    if (state.me.unseen?.length) { state.me.unseen = []; }
  } else render();
}

window.addEventListener('hashchange', render);
window.addEventListener('roshd:locked', async () => { await loadMe(); root.innerHTML = ''; location.hash = '#/payment'; render(); });
window.roshdRefresh = refreshMe;
boot();

