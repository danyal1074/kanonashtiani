// صفحه ورود با انتخاب نقش
import { api, post, esc, $, $$, toast, logoHtml, en, icon } from './core.js';

const ROLES = [
  { key: 'student', icon: 'backpack', name: 'دانش‌آموز', label: 'کد ملی یا نام کاربری', ph: '0012345679' },
  { key: 'teacher', icon: 'board', name: 'معلم', label: 'کد ملی یا نام کاربری', ph: 'teacher' },
  { key: 'manager', icon: 'building', name: 'مدیر کانون', label: 'کد ملی یا نام کاربری', ph: 'manager' },
  { key: 'parent', icon: 'users', name: 'والدین', label: 'شماره موبایل', ph: '09121234567' },
];
const ADMIN = { key: 'admin', icon: 'shield', name: 'مدیر سامانه', label: 'نام کاربری پشتیبانی', ph: 'admin' };
const DEMO = { student: 'student', teacher: 'teacher', manager: 'manager', parent: '09120000000', admin: 'admin' };
const FEATURES = [['timer', 'پومودورو و رقابت مطالعه'], ['file-check', 'آزمون آنلاین با کارنامه فوری'], ['sparkles', 'مسیر یادگیری شخصی'], ['users', 'گزارش لحظه‌ای برای والدین']];

export async function loginView(root, onDone) {
  document.title = 'ورود | پلتفرم رشد نخبه';
  let centers = [];
  try { centers = await api('/api/public/centers'); } catch { /* آفلاین */ }
  let slug;
  try { slug = localStorage.getItem('roshd-center'); } catch { /* */ }
  let center = centers.find((c) => c.slug === slug) || centers[0] || { name: 'پلتفرم رشد نخبه' };
  let role = ROLES[0];
  if (!root.isConnected) return; // نمای دیگری جایگزین شده است

  root.innerHTML = `<div class="login-wrap">
    <section class="login-art" aria-label="معرفی کانون">
      <div class="login-top">
        <div class="login-logo" id="cLogo">${logoHtml(center.logo)}</div>
        <div><span class="pill">${icon('sprout', { size: 14 })} پلتفرم رشد نخبه</span>
          <div class="bold" id="cName" style="font-size:var(--fs-md);margin-top:10px">${esc(center.name)}</div>
          <div class="small" style="color:var(--teal-100)" id="cTag">${esc(center.tagline || '')}</div></div>
      </div>
      <div>
        <h1>هر روز یک قدم<br><em>رشد</em> کن.</h1>
        <p class="lead">برنامه مطالعه، آزمون، امتیاز و مسیر یادگیری شخصی؛ همه در یک جا برای دانش‌آموز، معلم، مدیر و والدین.</p>
      </div>
      <div class="feature-list">${FEATURES.map(([i, t]) => `<div><span class="ib">${icon(i, { size: 18 })}</span>${t}</div>`).join('')}</div>
      <div class="foot"><a class="btn ghost sm" id="shopLink" href="#/c/${esc(center.slug || '')}" style="background:transparent;color:var(--white);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)">${icon('bag', { size: 16 })} صفحه کانون و فروشگاه</a></div>
    </section>
    <main class="login-form">
      <div class="login-box">
        ${centers.length > 1 ? `<div class="field" style="margin-bottom:var(--s-5)"><label for="centerSel">کانون</label><select class="input" id="centerSel">${centers.map((c) => `<option value="${esc(c.slug)}" ${c.slug === center.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
        <h2>ورود به حساب</h2>
        <p class="muted" style="margin:4px 0 0">نقش خودت را انتخاب کن.</p>
        <div class="role-grid" role="radiogroup" aria-label="نقش کاربری">${ROLES.map((r, i) => `<button type="button" class="role ${i ? '' : 'on'}" data-role="${r.key}" role="radio" aria-checked="${!i}" tabindex="${i ? -1 : 0}"><span class="ri">${icon(r.icon, { size: 20 })}</span><span class="rn">${r.name}</span></button>`).join('')}</div>
        <form id="loginForm" class="stack" style="gap:var(--s-4)" autocomplete="on" novalidate>
          <div class="field"><label id="idLabel" for="ident">${role.label}</label><input class="input ltr" id="ident" name="identifier" placeholder="${role.ph}" autocomplete="username" required inputmode="text" aria-describedby="loginErr"></div>
          <div class="field"><label for="pw">رمز عبور</label><div class="pw-wrap"><input class="input ltr" id="pw" name="password" type="password" autocomplete="current-password" required aria-describedby="loginErr">
            <button type="button" class="icon-btn" id="togglePw" aria-label="نمایش رمز" aria-pressed="false">${icon('eye')}</button></div></div>
          <div class="field-error" id="loginErr" role="alert" aria-live="assertive"></div>
          <button class="btn lg block" type="submit" id="loginBtn">ورود ${icon('arrow-left', { size: 18 })}</button>
        </form>
        <div class="demo-box"><div class="row between" style="margin-bottom:var(--s-2)"><b class="small">حساب‌های نمایشی</b><span class="muted">رمز همه: <code>123456</code></span></div>
          <div class="chips">
            <button class="chip" data-demo="student">${icon('backpack', { size: 14 })} آرین</button><button class="chip" data-demo="student9">${icon('lock', { size: 14 })} کیان (قفل)</button>
            <button class="chip" data-demo="teacher">${icon('board', { size: 14 })} معلم</button><button class="chip" data-demo="manager">${icon('building', { size: 14 })} مدیر</button>
            <button class="chip" data-demo="parent">${icon('users', { size: 14 })} والد</button><button class="chip" data-demo="admin">${icon('shield', { size: 14 })} مدیر سامانه</button></div></div>
        <p class="center small" style="margin-top:var(--s-4)"><a href="#" id="adminLink">${icon('shield', { size: 14 })} ورود پشتیبانی سامانه</a></p>
      </div>
    </main></div>`;

  const errEl = $('#loginErr', root);
  const setErr = (msg) => {
    errEl.innerHTML = msg ? `${icon('alert', { size: 14 })} ${esc(msg)}` : '';
    ['#ident', '#pw'].forEach((s) => $(s, root).setAttribute('aria-invalid', msg ? 'true' : 'false'));
  };
  const setRole = (r, focus = false) => {
    role = r;
    $$('.role', root).forEach((b) => { const on = b.dataset.role === r.key; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    $('#idLabel', root).textContent = r.label;
    $('#ident', root).placeholder = r.ph;
    $('#ident', root).inputMode = r.key === 'parent' ? 'tel' : 'text';
    setErr('');
  };
  $$('.role', root).forEach((b) => {
    b.onclick = () => setRole(ROLES.find((r) => r.key === b.dataset.role));
    // پیمایش با کلیدهای جهت در گروه رادیویی (راست‌به‌چپ)
    b.onkeydown = (e) => {
      const i = ROLES.findIndex((r) => r.key === b.dataset.role);
      const d = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); setRole(ROLES[(i + d + ROLES.length) % ROLES.length], true); }
    };
  });
  $('#adminLink', root).onclick = (e) => { e.preventDefault(); setRole(ADMIN); $('#ident', root).focus(); };
  $('#togglePw', root).onclick = (e) => {
    const p = $('#pw', root), show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = icon(show ? 'eye-off' : 'eye');
    e.currentTarget.setAttribute('aria-pressed', String(show));
    e.currentTarget.setAttribute('aria-label', show ? 'پنهان کردن رمز' : 'نمایش رمز');
  };
  $$('[data-demo]', root).forEach((b) => (b.onclick = () => {
    const k = b.dataset.demo;
    setRole(k === 'admin' ? ADMIN : ROLES.find((r) => r.key === (k === 'student9' ? 'student' : k)));
    $('#ident', root).value = k === 'student9' ? 'student9' : DEMO[k];
    $('#pw', root).value = '123456';
    $('#loginBtn', root).focus();
  }));
  $('#centerSel', root)?.addEventListener('change', (e) => {
    center = centers.find((c) => c.slug === e.target.value);
    try { localStorage.setItem('roshd-center', center.slug); } catch { /* */ }
    $('#cLogo', root).innerHTML = logoHtml(center.logo);
    $('#cName', root).textContent = center.name;
    $('#cTag', root).textContent = center.tagline || '';
    $('#shopLink', root).href = `#/c/${center.slug}`;
  });
  ['#ident', '#pw'].forEach((s) => $(s, root).addEventListener('input', () => setErr('')));
  $('#loginForm', root).onsubmit = async (e) => {
    e.preventDefault();
    const ident = en($('#ident', root).value.trim()), pw = $('#pw', root).value;
    if (!ident || !pw) { setErr(!ident ? `${role.label} را وارد کن` : 'رمز عبور را وارد کن'); $(!ident ? '#ident' : '#pw', root).focus(); return; }
    const btn = $('#loginBtn', root), old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;margin:0;border-width:2px;border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> در حال ورود…';
    try {
      await post('/api/auth/login', { role: role.key, identifier: ident, password: pw });
      toast('خوش آمدی', 'ok');
      location.hash = '#/home';
      onDone();
    } catch (err) {
      setErr(err.message);
      $('#pw', root).select();
    } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
  };
}
