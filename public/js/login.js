import { artwork } from './artwork.js';
// صفحه ورود با انتخاب نقش
import { api, post, esc, $, $$, toast, logoHtml, en, icon } from './core.js';

const ROLES = [
  { key: 'student', icon: 'graduation', name: 'دانش‌آموز', label: 'کد ملی یا نام کاربری', ph: '0012345679' },
  { key: 'teacher', icon: 'book', name: 'معلم', label: 'کد ملی یا نام کاربری', ph: 'teacher' },
  { key: 'counselor', icon: 'users', name: 'مشاور', label: 'کد ملی یا نام کاربری', ph: 'counselor' },
  { key: 'manager', icon: 'building', name: 'مدیر کانون', label: 'کد ملی یا نام کاربری', ph: 'manager' },
];
const ADMIN = { key: 'admin', icon: 'shield', name: 'مدیر سامانه', label: 'نام کاربری پشتیبانی', ph: 'admin' };
const FEATURES = [['book', 'مطالعه هدفمند'], ['clipboard', 'آزمون و کارنامه'], ['message', 'همراهی پشتیبان']];

export async function loginView(root, onDone) {
  document.title = 'ورود | پلتفرم رشد نخبه';
  let centers = [];
  try { centers = await api('/api/public/centers'); } catch { /* آفلاین */ }
  let slug;
  try { slug = localStorage.getItem('roshd-center'); } catch { /* */ }
  let center = centers.find((c) => c.slug === slug) || centers[0] || { name: 'پلتفرم رشد نخبه' };
  let role = ROLES[0];
  if (!root.isConnected) return; // نمای دیگری جایگزین شده است

  // راست‌به‌چپ: فرم در ستون اول (راست) و تصویرسازی در ستون دوم (چپ)؛ در موبایل فرم بالاتر است
  root.innerHTML = `<div class="lg-wrap">
    <main class="lg-form">
      <div class="lg-box">
        <header class="lg-brand"><span class="lg-logo" id="cLogo">${logoHtml(center.logo)}</span><span class="lg-divider" aria-hidden="true"></span><b class="lg-center" id="cName">${esc(center.name)}</b></header>
        <h1 class="lg-title">ورود به سامانه</h1>
        <p class="lg-sub">مسیر رشدت از اینجا شروع می‌شود</p>
        <div class="lg-roles" role="radiogroup" aria-label="نقش کاربری">${ROLES.map((r, i) => `<button type="button" class="role lg-role ${i ? '' : 'on'}" data-role="${r.key}" role="radio" aria-checked="${!i}" tabindex="${i ? -1 : 0}"><span class="lg-check">${icon('check-circle', { size: 20 })}</span>${icon(r.icon, { size: 40 })}<span class="lg-rn">${r.name}</span></button>`).join('')}</div>
        <form id="loginForm" class="lg-fields" autocomplete="on" novalidate>
          <div class="field lg-field"><label id="idLabel" for="ident">${role.label}</label><input class="input lg-input ltr" id="ident" name="identifier" placeholder="${role.ph}" autocomplete="username" required inputmode="text" aria-describedby="loginErr"></div>
          <div class="field lg-field"><label for="pw">رمز عبور</label><div class="lg-pw"><input class="input lg-input ltr" id="pw" name="password" type="password" autocomplete="current-password" required aria-describedby="loginErr">
            <button type="button" class="lg-eye" id="togglePw" aria-label="نمایش رمز" aria-pressed="false">${icon('eye', { size: 22 })}</button></div></div>
          <div class="field-error" id="loginErr" role="alert" aria-live="assertive"></div>
          <button class="lg-submit" type="submit" id="loginBtn">ورود به حساب</button>
        </form>
        <nav class="lg-links" aria-label="پیوندهای ورود"><a id="shopLink" href="#/c/${esc(center.slug || '')}">صفحه کانون و فروشگاه</a><a href="#" id="adminLink">ورود پشتیبانی سامانه</a></nav>
        ${centers.length > 1 ? `<div class="lg-center-pick"><label for="centerSel">کانون</label><select class="input" id="centerSel">${centers.map((c) => `<option value="${esc(c.slug)}" ${c.slug === center.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      </div>
    </main>
    <section class="lg-art" aria-label="معرفی کانون">
      <h2 class="lg-slogan">هر روز، یک قدم <em>رشد</em></h2>
      ${artwork('login-welcome', 'lg-hero')}
      <ul class="lg-features">${FEATURES.map(([i, t]) => `<li>${icon(i, { size: 26 })}<span>${t}</span></li>`).join('')}</ul>
    </section></div>`;

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
    $('#ident', root).inputMode = 'text';
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
    e.currentTarget.innerHTML = icon(show ? 'eye-off' : 'eye', { size: 22 });
    e.currentTarget.setAttribute('aria-pressed', String(show));
    e.currentTarget.setAttribute('aria-label', show ? 'پنهان کردن رمز' : 'نمایش رمز');
  };
  $('#centerSel', root)?.addEventListener('change', (e) => {
    center = centers.find((c) => c.slug === e.target.value);
    try { localStorage.setItem('roshd-center', center.slug); } catch { /* */ }
    $('#cLogo', root).innerHTML = logoHtml(center.logo);
    $('#cName', root).textContent = center.name;
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
