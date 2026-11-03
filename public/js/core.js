// هسته رابط کاربری: API، تاریخ شمسی، اعداد فارسی، اجزای مشترک، نمودار، مسیریاب
import { icon, hasIcon } from './icons.js';
export { icon, hasIcon };
export const state = { me: null, route: null };

// ---------- ابزار متن و عدد ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fa = (s) => String(s ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
export const num = (n) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('fa-IR'));
export const money = (n) => `${num(Math.round(n || 0))} تومان`;
export const en = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
// عدد علامت‌دار با جهت چپ‌به‌راست (تا منفی در متن راست‌به‌چپ جابه‌جا نشود)
export const sgn = (n) => `<bdi dir="ltr">${n > 0 ? '+' : n < 0 ? '−' : ''}${fa(Math.abs(n))}</bdi>`;
export const pct = (n) => (n == null ? '—' : `${fa(Math.round(n))}٪`);
export const initials = (name) => esc((name || '؟').trim()[0]);

// ---------- تاریخ ----------
export function g2j(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * ~~(days / 12053); days %= 12053; jy += 4 * ~~(days / 1461); days %= 1461;
  if (days > 365) { jy += ~~((days - 1) / 365); days = (days - 1) % 365; }
  return [jy, days < 186 ? 1 + ~~(days / 31) : 7 + ~~((days - 186) / 30), 1 + (days < 186 ? days % 31 : (days - 186) % 30)];
}
export function j2g(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * ~~(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * ~~(days / 1461); days %= 1461;
  if (days > 365) { gy += ~~((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0; for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return [gy, gm, gd];
}
export const JMONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const pad = (n) => String(n).padStart(2, '0');
// تاریخ‌های سرور: «YYYY-MM-DD» (روز تهران)، «YYYY-MM-DD HH:MM:SS» (UTC) یا ISO
export function toDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00+03:30`);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  return new Date(s);
}
const TZ = { timeZone: 'Asia/Tehran' };
const tehranParts = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { ...TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  .formatToParts(d).map((p) => [p.type, p.value]));
export function ymdOf(d = new Date()) { const p = tehranParts(d); return `${p.year}-${p.month}-${p.day}`; }
export function jparts(s) { const d = toDate(s); const [y, m, dd] = ymdOf(d).split('-').map(Number); return g2j(y, m, dd); }
export function jdate(s, { year = true, weekday = false } = {}) {
  if (!s) return '—';
  const [y, m, d] = jparts(s);
  const wd = weekday ? WEEKDAYS[faWeekday(ymdOf(toDate(s)))] + ' ' : '';
  return fa(`${wd}${d} ${JMONTHS[m - 1]}${year ? ' ' + y : ''}`);
}
export const jshort = (s) => { if (!s) return '—'; const [y, m, d] = jparts(s); return fa(`${y}/${pad(m)}/${pad(d)}`); };
export function jtime(s) { const p = tehranParts(toDate(s)); return fa(`${p.hour === '24' ? '00' : p.hour}:${p.minute}`); }
export const jdatetime = (s) => `${jdate(s)} - ساعت ${jtime(s)}`;
export function faWeekday(ymd) { return (new Date(ymd + 'T12:00:00Z').getUTCDay() + 1) % 7; }
export function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function timeAgo(s) {
  const diff = (Date.now() - toDate(s).getTime()) / 1000;
  if (diff < 60) return 'لحظاتی پیش';
  if (diff < 3600) return `${fa(Math.floor(diff / 60))} دقیقه پیش`;
  if (diff < 86400) return `${fa(Math.floor(diff / 3600))} ساعت پیش`;
  if (diff < 86400 * 7) return `${fa(Math.floor(diff / 86400))} روز پیش`;
  return jdate(s);
}
export function countdown(iso) {
  const ms = toDate(iso).getTime() - Date.now();
  const late = ms < 0;
  const a = Math.abs(ms);
  const d = Math.floor(a / 864e5), h = Math.floor((a % 864e5) / 36e5), m = Math.floor((a % 36e5) / 6e4), s = Math.floor((a % 6e4) / 1e3);
  let text;
  if (d > 0) text = `${fa(d)} روز و ${fa(h)} ساعت`;
  else if (h > 0) text = `${fa(h)} ساعت و ${fa(m)} دقیقه`;
  else text = `${fa(m)}:${fa(pad(s))}`;
  const cls = late ? 'late' : ms < 6 * 36e5 ? 'danger' : ms < 2 * 864e5 ? 'warn' : 'ok';
  return { text: late ? `${text} تأخیر` : `${text} مانده`, cls, late };
}
export const cdHtml = (iso) => { const c = countdown(iso); return `<span class="countdown ${c.cls}" data-cd="${esc(iso)}">${icon('clock', { size: 13 })}<span>${c.text}</span></span>`; };
setInterval(() => document.querySelectorAll('[data-cd]').forEach((el) => { const c = countdown(el.dataset.cd); el.className = `countdown ${c.cls}`; const t = el.querySelector('span:not(.ic)'); if (t) t.textContent = c.text; }), 1000);

// فیلد تاریخ شمسی (روز/ماه/سال) → مقدار میلادی YYYY-MM-DD
export function dateField(name, ymd, { minYear = 1380, maxYear = 1410 } = {}) {
  const [y, m, d] = ymd ? g2j(...ymd.split('-').map(Number)) : [0, 0, 0];
  const opt = (v, cur, label = fa(v)) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return `<div class="date-field" data-date="${esc(name)}">
    <select class="input" data-p="d"><option value="">روز</option>${Array.from({ length: 31 }, (_, i) => opt(i + 1, d)).join('')}</select>
    <select class="input" data-p="m"><option value="">ماه</option>${JMONTHS.map((n, i) => opt(i + 1, m, n)).join('')}</select>
    <select class="input" data-p="y"><option value="">سال</option>${Array.from({ length: maxYear - minYear + 1 }, (_, i) => opt(maxYear - i, y)).join('')}</select></div>`;
}
export function readDate(root, name) {
  const el = root.querySelector(`[data-date="${name}"]`);
  const v = (p) => Number(el.querySelector(`[data-p="${p}"]`).value);
  if (!v('y') || !v('m') || !v('d')) return null;
  const [gy, gm, gd] = j2g(v('y'), v('m'), v('d'));
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}
export const tehranIso = (ymd, hm) => new Date(`${ymd}T${hm || '23:59'}:00+03:30`).toISOString();

// ---------- API ----------
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null;
  try { data = await res.json(); } catch { /* بدون بدنه */ }
  if (res.status === 401 && !path.startsWith('/api/auth') && path !== '/api/me') { state.me = null; location.hash = '#/login'; throw new Error(data?.error || 'لطفاً دوباره وارد شوید'); }
  if (res.status === 423) { window.dispatchEvent(new Event('roshd:locked')); }
  if (!res.ok) throw new Error(data?.error || 'خطا در ارتباط با سرور');
  return data;
}
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const put = (p, body) => api(p, { method: 'PUT', body: body || {} });
export const del = (p) => api(p, { method: 'DELETE', body: {} });

export function fileToData(file, maxMb = 8) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > maxMb * 1024 * 1024) return reject(new Error(`حجم فایل حداکثر ${fa(maxMb)} مگابایت است`));
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, data: r.result });
    r.onerror = () => reject(new Error('خواندن فایل ممکن نشد'));
    r.readAsDataURL(file);
  });
}

// ---------- DOM ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
// واگذاری رویداد؛ ثبت دوباره همان رویداد/انتخابگر، نسخه قبلی را جایگزین می‌کند (بدون انباشت در رندر مجدد)
export function on(root, ev, sel, fn) {
  const map = (root.__roshdOn ??= new Map());
  const key = `${ev}|${sel}`;
  if (!map.has(key)) root.addEventListener(ev, (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) map.get(key)(e, t); });
  map.set(key, fn);
}
export function formData(form) {
  const o = {};
  for (const el of form.querySelectorAll('[name]')) {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.type !== 'file') o[el.name] = el.value.trim();
  }
  return o;
}
export async function busy(btn, fn) {
  if (btn?.disabled) return;
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ لطفاً صبر کنید…'; }
  try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

export function toast(msg, type = '') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', type === 'err' ? 'alert' : 'status');
  t.innerHTML = `${icon(type === 'ok' ? 'check-circle' : type === 'err' ? 'alert' : 'info', { size: 18 })} <span>${esc(String(msg).trim())}</span>`;
  box.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

export function modal({ title, body, wide = false, actions = [], onOpen }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(String(title).replace(/<[^>]+>/g, '').trim())}"><div class="modal-head"><h3>${String(title).trim()}</h3><button class="icon-btn x" data-close aria-label="بستن">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="${i}">${String(a.label).trim()}</button>`).join('')}</div>` : ''}</div>`;
    document.body.append(back);
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', async (e) => {
      if (e.target === back || e.target.closest('[data-close]')) return close(null);
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = actions[Number(b.dataset.act)];
      if (a.onClick) {
        await busy(b, async () => { const r = await a.onClick(back.querySelector('.modal'), close); if (r !== false) close(r ?? true); });
      } else close(a.value ?? true);
    });
    onOpen?.(back.querySelector('.modal'), close);
    (back.querySelector('.modal-body input, .modal-body select, .modal-body textarea') || back.querySelector('[data-act]:last-child') || back.querySelector('[data-close]'))?.focus({ preventScroll: true });
  });
}
export const confirmBox = (msg, label = 'بله', cls = 'red') => modal({ title: 'تأیید', body: `<p style="margin:0">${msg}</p>`, actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label, cls, value: true }] });

export function confetti(n = 120) {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#0B5F66', '#2BAFA9', '#F2B33D', '#F7C866', '#22A867', '#74CBC3'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2.2 + Math.random() * 2.5 + 's';
    p.style.animationDelay = Math.random() * 0.8 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 6000);
}

export function beep(times = 3) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1046, 1318];
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = notes[i % 3];
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t); o.stop(t + 0.26);
    }
  } catch { /* مرورگر بدون صدا */ }
}

// ---------- اجزای نمایشی ----------
// آواتار: نام آیکون انتخاب‌شده دانش‌آموز؛ مقدارهای قدیمی (ایموجی) به آیکون کاربر برمی‌گردند
export const isProfilePhoto = (value) => /^\/uploads\/[a-f0-9-]+\.(png|jpg|jpeg|webp)$/.test(String(value || ''));
export const avatar = (name, cls = '') => isProfilePhoto(name) ? `<div class="avatar photo-avatar ${cls}"><img src="${esc(name)}" alt="عکس پروفایل" loading="lazy"></div>` : `<div class="avatar ${cls}">${icon(hasIcon(name) ? name : 'user', { size: cls === 'lg' ? 34 : cls === 'sm' ? 18 : 22 })}</div>`;
export const AVATAR_ICONS = ['sprout', 'star', 'zap', 'flame', 'compass', 'bulb', 'flask', 'book', 'trophy', 'target', 'heart', 'globe', 'calculator', 'languages', 'gamepad', 'award'];
export const nameAvatar = (name, cls = 'sm') => `<div class="avatar txt ${cls}">${initials(name)}</div>`;
export const progress = (p, cls = '') => `<div class="progress ${cls}"><i style="width:${Math.max(0, Math.min(100, p || 0))}%"></i></div>`;
// حالت خالی: اولین ورودی نام آیکون است (ورودی‌های قدیمی غیرآیکونی به «inbox» برمی‌گردند)
export const empty = (ic, text) => `<div class="empty" role="status"><span class="big">${icon(hasIcon(ic) ? ic : 'inbox', { size: 26 })}</span>${text}</div>`;
export const loading = () => `<div class="empty" role="status" aria-live="polite"><div class="spinner"></div>در حال بارگذاری…</div>`;
export function ring(p, { size = 120, stroke = 12, color = 'url(#rg)', label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, p)) / 100);
  return `<div style="position:relative;width:${size}px;height:${size}px;flex:none">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#0E7077"/><stop offset="1" stop-color="#2BAFA9"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#F0ECE2" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset 1s"/></svg>
    <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1.2"><div><div style="font-weight:900;font-size:${size / 5}px">${label}</div><div class="tiny muted">${sub}</div></div></div></div>`;
}
const SUBJ = { 'ریاضی': ['calculator', 'violet'], 'علوم': ['flask', 'green'], 'فارسی': ['book', 'orange'], 'زبان انگلیسی': ['languages', 'blue'], 'هوش و استعداد': ['bulb', 'pink'], 'مطالعات اجتماعی': ['globe', 'teal'] };
export const subjIcon = (s, size = 18) => icon(SUBJ[s]?.[0] || 'book', { size });
export const SUBJ_COLOR = { violet: 'var(--teal-700)', green: 'var(--green-700)', orange: 'var(--sun-600)', blue: 'var(--slate-700)', pink: 'var(--coral-700)', teal: 'var(--teal-600)' };
export const subjTint = (s) => SUBJ[s]?.[1] || 'violet';
export const SOFT = { violet: 'var(--teal-50)', green: 'var(--green-100)', orange: 'var(--sun-100)', blue: 'var(--slate-100)', pink: 'var(--coral-100)', teal: 'var(--teal-100)', yellow: 'var(--sun-100)', red: 'var(--red-100)' };
export const gradeName = (g) => ({ 4: 'چهارم', 5: 'پنجم', 6: 'ششم', 7: 'هفتم', 8: 'هشتم', 9: 'نهم' }[g] || fa(g));
export const ROLE_NAMES = { student: 'دانش‌آموز', teacher: 'معلم', manager: 'مدیر کانون', parent: 'والدین', admin: 'مدیر سامانه' };
export function logoHtml(logo) {
  if (!logo) return icon('sprout', { size: 24 });
  return /^(\/|data:|https?:)/.test(logo) ? `<img src="${esc(logo)}" alt="لوگو">` : esc(logo);
}

// کارت شاخص: آیکون، رنگ (sun/green/red/slate/coral)، مقدار، برچسب، توضیح و پیوند اختیاری
export function kpiCard(ic, tone, value, label, sub = '', href = '') {
  const tag = href ? `a href="${href}"` : 'div';
  return `<${tag} class="card kpi-card" style="color:inherit;font-weight:inherit"><div class="kpi"><span class="ib lg ${tone || ''}">${icon(hasIcon(ic) ? ic : 'chart', { size: 22 })}</span><div class="grow"><div class="lbl">${label}</div><div class="val">${value}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div>${href ? `<span class="go" style="color:var(--ink-400)">${icon('chevron-left', { size: 18 })}</span>` : ''}</div></${href ? 'a' : 'div'}>`;
}

// ---------- نمودارها (SVG) ----------
export const PALETTE = ['#0B5F66', '#F2B33D', '#2BAFA9', '#22A867', '#2C5A7A', '#D8262F'];
function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
const shortNum = (v) => (v >= 1e9 ? fa(+(v / 1e9).toFixed(1)) + ' میلیارد' : v >= 1e6 ? fa(+(v / 1e6).toFixed(1)) + ' م' : v >= 1e3 ? fa(+(v / 1e3).toFixed(0)) + ' هزار' : fa(Math.round(v)));
// data: [{label, values:[..]}]  series: [{name,color}]
// نمودارها راست‌به‌چپ: محور مقادیر در سمت راست و ترتیب داده‌ها از راست به چپ
export function barChart(data, series, { height = 220, stacked = false, fmt = shortNum } = {}) {
  const W = 600, H = height, padR = 58, padL = 8, padB = 30, padT = 12;
  const max = niceMax(Math.max(1, ...data.map((d) => (stacked ? d.values.reduce((a, b) => a + b, 0) : Math.max(...d.values)))));
  const cw = (W - padR - padL) / data.length;
  const bw = stacked ? Math.min(46, cw * 0.55) : Math.min(26, (cw * 0.7) / series.length);
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; s += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#E7E2D6" stroke-dasharray="${i ? '4 4' : ''}"/><text x="${W - padR + 8}" y="${y(v) + 4}" text-anchor="start">${fmt(v)}</text>`; }
  data.forEach((d, i) => {
    const cx = W - padR - cw * i - cw / 2;
    if (stacked) {
      let acc = 0;
      d.values.forEach((v, j) => { const y0 = y(acc), y1 = y(acc + v); acc += v; if (v > 0) s += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1)}" fill="${series[j].color}" rx="4"><title>${esc(series[j].name)}: ${fmt(v)}</title></rect>`; });
    } else {
      d.values.forEach((v, j) => { const x = cx + (bw * series.length) / 2 - (j + 1) * bw; s += `<rect x="${x + 2}" y="${y(v)}" width="${bw - 4}" height="${Math.max(0, H - padB - y(v))}" fill="${series[j].color}" rx="6"><title>${esc(series[j].name)}: ${fmt(v)}</title></rect>`; });
    }
    s += `<text x="${cx}" y="${H - 8}" text-anchor="middle" style="font-weight:700;fill:#2D4446">${esc(d.label)}</text>`;
  });
  return s + '</svg>' + legend(series);
}
export function lineChart(labels, series, { height = 220, max = null, fmt = (v) => fa(Math.round(v)) } = {}) {
  const W = 600, H = height, padR = 44, padB = 30, padT = 14, padL = 16;
  const M = max ?? niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => (labels.length === 1 ? (W - padR + padL) / 2 : W - padR - (i * (W - padL - padR)) / (labels.length - 1));
  const y = (v) => H - padB - (v / M) * (H - padB - padT);
  const uid = Math.random().toString(36).slice(2, 7);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><defs>${series.map((se, k) => `<linearGradient id="lg${uid}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${se.color}" stop-opacity=".28"/><stop offset="1" stop-color="${se.color}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;
  for (let i = 0; i <= 4; i++) { const v = (M / 4) * i; s += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#E7E2D6" stroke-dasharray="${i ? '4 4' : ''}"/><text x="${W - padR + 8}" y="${y(v) + 4}" text-anchor="start">${fmt(v)}</text>`; }
  labels.forEach((l, i) => { s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="font-weight:700;fill:#2D4446">${esc(l)}</text>`; });
  series.forEach((se, k) => {
    if (!se.values.length) return;
    const pts = se.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    s += `<polygon points="${x(0)},${H - padB} ${pts} ${x(se.values.length - 1)},${H - padB}" fill="url(#lg${uid}${k})"/>`;
    s += `<polyline points="${pts}" fill="none" stroke="${se.color}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    se.values.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="5" fill="#fff" stroke="${se.color}" stroke-width="3"><title>${esc(labels[i])}: ${fmt(v)}</title></circle>`; });
  });
  return s + '</svg>' + (series.length > 1 ? legend(series) : '');
}
export function donut(parts, { size = 150, label = '', sub = '' } = {}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1, r = 52, c = 2 * Math.PI * r;
  let acc = 0;
  const segs = parts.map((p) => { const len = (p.value / total) * c; const seg = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${p.color}" stroke-width="22" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-acc}"><title>${esc(p.name)}: ${num(p.value)}</title></circle>`; acc += len; return seg; }).join('');
  return `<div class="row" style="gap:18px;flex-wrap:wrap"><div style="position:relative;width:${size}px;height:${size}px"><svg viewBox="0 0 140 140" width="${size}" height="${size}" style="transform:rotate(-90deg)"><circle cx="70" cy="70" r="${r}" fill="none" stroke="#F0ECE2" stroke-width="22"/>${segs}</svg>
    <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1.3"><div><b style="font-size:22px">${label}</b><div class="tiny muted">${sub}</div></div></div></div>
    <div class="stack" style="gap:6px">${parts.map((p) => `<div class="row small"><span class="dot" style="background:${p.color}"></span>${esc(p.name)} <b class="num">${num(p.value)}</b></div>`).join('')}</div></div>`;
}
const legend = (series) => `<div class="legend" style="margin-top:8px">${series.map((s) => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;

// ---------- نمای چاپ داخل برنامه (بدون پنجره پاپ‌آپ) ----------
export function printOverlay(html, title = 'چاپ') {
  const ov = document.createElement('div');
  ov.className = 'print-overlay';
  ov.innerHTML = `<div class="print-toolbar"><b>${title}</b><span class="grow"></span><button class="btn" data-p>${icon('printer')} چاپ</button><button class="btn ghost" data-x>${icon('x')} بستن</button></div><div class="print-body">${html}</div>`;
  document.body.append(ov);
  document.body.classList.add('printing');
  const close = () => { ov.remove(); document.body.classList.remove('printing'); };
  ov.querySelector('[data-x]').onclick = close;
  ov.querySelector('[data-p]').onclick = () => window.print();
  return ov;
}

// ---------- سربرگ صفحه ----------
const HEAD_ICONS = { newAsg: 'plus', newExam: 'plus', addMat: 'upload', addSt: 'plus', addT: 'plus', addC: 'plus', newAnn: 'megaphone', addExp: 'upload', addInc: 'download',
  newComp: 'plus', addP: 'plus', newC: 'plus', mk: 'database', scan: 'camera', printSheet: 'printer', sheet: 'printer', cards: 'receipt', delExam: 'trash', givePts: 'star' };
export function setHead(title, sub = '', actions = '') {
  const t = document.querySelector('.topbar');
  if (!t) return;
  t.querySelector('h1').innerHTML = title;
  t.querySelector('.sub').innerHTML = sub;
  t.querySelector('.actions-slot').innerHTML = actions;
  // دکمه‌های سربرگ که آیکون ندارند، بر اساس شناسه آیکون می‌گیرند
  t.querySelectorAll('.actions-slot .btn').forEach((b) => {
    if (b.querySelector('svg')) return;
    const ic = HEAD_ICONS[b.id] || (b.getAttribute('href') === '#/results' ? 'award' : /→/.test(b.textContent) ? 'arrow-right' : '');
    if (ic) { b.innerHTML = icon(ic, { size: 16 }) + ' ' + b.innerHTML.replace('→', '').trim(); }
  });
  document.title = `${title.replace(/<[^>]+>/g, '')} | پلتفرم رشد نخبه`;
}

// ---------- مسیریاب ----------
const routes = [];
export function route(pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ pattern, re, keys, handler, ...opts });
}
export function matchRoute(hash) {
  const path = hash.replace(/^#/, '') || '/';
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) return { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}
export const go = (h) => { if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; };
