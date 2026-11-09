// پنل مدیر کانون
import * as L from './legacy.js';
import { api, post, put, del, esc, fa, num, money, pct, $, $$, on, toast, busy, modal, confirmBox, setHead, avatar, nameAvatar, progress, empty, jdate, jtime, jshort,
  subjIcon, gradeName, dateField, readDate, fileToData, barChart, lineChart, donut, WEEKDAYS, addDays, formData, state, en, logoHtml, timeAgo, printOverlay, icon, hasIcon } from './core.js';
import { messagesView, accountView } from './common.js';
import { studentDetailHtml } from './teacher.js';
import { managerTimetable, KINDS, kindOf } from './timetable.js';
import { openScanner, printSheet, MAX_Q } from './omr.js';

export const nav = (me) => [
  { path: '/home', icon: 'chart', label: 'داشبورد' },
  { path: '/students', icon: 'users', label: 'مدیریت دانش‌آموزان' },
  { path: '/staff', icon: 'board', label: 'معلمان، کلاس‌ها و برنامه' },
  { path: '/counselors', icon: 'users', label: 'مدیریت مشاوران' },
  { path: '/timetable', icon: 'calendar', label: 'برنامه هفتگی کانون' },
  { path: '/fees', icon: 'card', label: 'حق عضویت و رسیدها' },
  { path: '/announcements', icon: 'megaphone', label: 'اطلاعیه‌رسانی' },
  { path: '/accounting', icon: 'wallet', label: 'حسابداری' },
  { path: '/invoices', icon: 'receipt', label: 'فاکتورهای دوره‌ای' },
  { path: '/sms-outbox', icon: 'message', label: 'صندوق پیامک' },
  { path: '/barpa', icon: 'trophy', label: 'کارنامه‌های برپا' },
  { path: '/hoosh-studio', icon: 'sparkles', label: 'استودیوی هوش کمپلکس' },
  { path: '/manual-scores', icon: 'clipboard', label: 'نمرات مستمر کلاسی' },
  { path: '/att-log', icon: 'user-check', label: 'لاگ تغییر حضور' },
  { path: '/comprehensive', icon: 'trophy', label: 'آزمون جامع کانون' },
  { path: '/performance', icon: 'trend', label: 'عملکرد دانش‌آموزان' },
  { path: '/shop', icon: 'bag', label: 'مدیریت فروشگاه' },
  { path: '/messages', icon: 'message', label: 'پیام‌ها', badge: me.unread },
  { path: '/settings', icon: 'sliders', label: 'تنظیمات کانون' },
  { path: '/account', icon: 'key', label: 'حساب کاربری' },
];
export const bottomNav = () => [
  { path: '/home', icon: 'chart', label: 'داشبورد' },
  { path: '/students', icon: 'users', label: 'دانش‌آموزان' },
  { path: '/fees', icon: 'card', label: 'رسیدها' },
  { path: '/accounting', icon: 'wallet', label: 'حساب' },
];

let metaCache = null;
const meta = async (force) => (metaCache = !force && metaCache ? metaCache : await api('/api/manager/meta'));
// کارت شاخص: آیکون (یا ورودی قدیمی) و رنگ از روی کلاس‌های سیستم طراحی
const TONE = (bg = '') => (/green/.test(bg) ? 'green' : /red/.test(bg) ? 'red' : /orange|yellow|sun/.test(bg) ? 'sun' : /blue|slate/.test(bg) ? 'slate' : /pink|coral/.test(bg) ? 'coral' : '');
const kpi = (ico, bg, v, l, href, sub = '') => {
  const tag = href ? `a href="${href}"` : 'div';
  return `<${tag} class="card kpi-card" style="color:inherit"><div class="kpi"><span class="ib lg ${TONE(bg)}">${icon(hasIcon(ico) ? ico : 'chart', { size: 22 })}</span><div class="grow"><div class="lbl">${l}</div><div class="val">${v}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div>${href ? `<span class="go" style="color:var(--ink-400)">${icon('chevron-left', { size: 18 })}</span>` : ''}</div></${href ? 'a' : 'div'}>`;
};
const PAY = { paid: ['پرداخت‌شده', 'green'], pending: ['در انتظار', 'orange'], unpaid: ['پرداخت‌نشده', 'red'] };
const REJECT_REASONS = ['تصویر رسید ناخوانا است', 'مبلغ واریزی کمتر از حق عضویت است', 'رسید تکراری است', 'شماره کارت مقصد اشتباه است', 'تاریخ رسید معتبر نیست'];
const PAY_COLORS = ['#0E9157', '#F2B33D', '#D8262F'];

// ================= داشبورد =================
async function home(el, _p, me) {
  const d = await api('/api/manager/dashboard');
  setHead('داشبورد کانون', `${jdate(me.today, { weekday: true })} · ${esc(me.center.name)}`,
    `<a class="btn ghost sm" href="#/announcements">${icon('megaphone', { size: 16 })} اطلاعیه</a><a class="btn sm" href="#/students">${icon('plus', { size: 16 })} ثبت‌نام دانش‌آموز</a>`);
  const collected = Math.round((d.kpi.paid / Math.max(1, d.kpi.active)) * 100);
  const pendingSms = d.absents.filter((a) => a.status === 'absent' && !a.sms_sent).length;
  el.innerHTML = `<div class="grid c4">
      ${kpi('users', '', fa(d.kpi.active), 'دانش‌آموز فعال', '#/students', `${fa(d.kpi.teachers)} معلم`)}
      ${kpi('check-circle', 'green', fa(d.kpi.paid), 'حق عضویت پرداخت‌شده', '#/fees', `${fa(collected)}٪ وصول`)}
      ${kpi('clock', 'sun', fa(d.kpi.pending + d.kpi.unpaid), 'در انتظار پرداخت', '#/fees', `${fa(d.kpi.pending)} رسید در صف بررسی`)}
      ${kpi('user-x', 'red', fa(d.kpi.absentToday), 'غایبان امروز', '', pendingSms ? `${fa(pendingSms)} پیامک ارسال‌نشده` : 'پیامک‌ها ارسال شده')}
    </div>
  <div class="grid c3" style="margin-top:var(--s-5)">
    <section class="card span2" aria-labelledby="mT1"><div class="card-title"><span class="ib">${icon('chart', { size: 18 })}</span><span id="mT1">وضعیت حق عضویت به تفکیک پایه</span></div>
      ${barChart(d.byGrade.map((g) => ({ label: gradeName(g.grade), values: [g.paid, g.pending, g.unpaid] })), [{ name: 'پرداخت‌شده', color: PAY_COLORS[0] }, { name: 'در انتظار تأیید', color: PAY_COLORS[1] }, { name: 'پرداخت‌نشده', color: PAY_COLORS[2] }], { stacked: true, height: 250, fmt: (v) => fa(Math.round(v)) })}</section>
    <div class="stack" style="gap:var(--s-5)">
      <section class="card"><div class="row"><span class="ib lg green">${icon('wallet', { size: 22 })}</span><div class="grow"><div class="small muted">مانده صندوق</div><div style="font-size:var(--fs-lg);font-weight:900">${money(d.balance)}</div></div></div>
        <a class="btn ghost sm block" style="margin-top:var(--s-4)" href="#/accounting">حسابداری ${icon('chevron-left', { size: 16 })}</a></section>
      <section class="card tint-orange"><div class="row"><span class="ib lg sun">${icon('receipt', { size: 22 })}</span><div class="grow"><div class="small muted">رسیدهای در صف بررسی</div><div style="font-size:var(--fs-xl);font-weight:900">${fa(d.receiptsPending)}</div></div></div>
        <a class="btn accent sm block" style="margin-top:var(--s-4)" href="#/fees">بررسی رسیدها</a></section>
      <section class="card" aria-label="درصد وصول">${donut([{ name: 'پرداخت‌شده', value: d.kpi.paid, color: PAY_COLORS[0] }, { name: 'در انتظار تأیید', value: d.kpi.pending, color: PAY_COLORS[1] }, { name: 'پرداخت‌نشده', value: d.kpi.unpaid, color: PAY_COLORS[2] }], { size: 116, label: `${fa(collected)}٪`, sub: 'وصول' })}</section>
    </div>
  </div>
  <section class="card" style="margin-top:var(--s-5)" aria-labelledby="mT2"><div class="card-title"><span class="ib red">${icon('user-x', { size: 18 })}</span><span id="mT2">غایبان امروز و پیامک به والدین</span>
    ${pendingSms ? `<button class="btn sm more" id="smsAll">${icon('send', { size: 16 })} ارسال به همه (${fa(pendingSms)})</button>` : ''}</div>
    <div class="list">${d.absents.map((a) => `<div class="list-item" style="flex-wrap:wrap">${nameAvatar(a.full_name, 'sm')}<div class="grow" style="min-width:140px"><div class="small bold">${esc(a.full_name)}</div><div class="tiny muted">پایه ${gradeName(a.grade)} · کلاس ${esc(a.class_name)}</div></div>
      ${a.status === 'absent' ? '<span class="badge red">غایب</span>' : '<span class="badge yellow">با اطلاع</span>'}<span class="tiny muted num" dir="ltr" style="min-width:96px;text-align:left">${fa(a.parent_phone)}</span>
      <span style="min-width:120px;text-align:left">${a.status !== 'absent' ? '<span class="tiny muted">نیاز به پیامک ندارد</span>' : a.sms_sent ? `<span class="badge green">${icon('check', { size: 12 })} پیامک ارسال شد</span>` : `<button class="btn sm soft" data-sms="${a.id}">${icon('phone', { size: 14 })} ارسال پیامک</button>`}</span></div>`).join('') || empty('check-circle', '<b>امروز غایبی ثبت نشده</b>حضور و غیاب کلاس‌ها توسط معلم‌ها ثبت می‌شود.')}</div>
    <div class="tiny muted" style="margin-top:var(--s-3);display:flex;gap:6px;align-items:center">${icon('info', { size: 14 })} ارسال پیامک در این نسخه شبیه‌سازی می‌شود.</div></section>`;
  on(el, 'click', '[data-sms]', (e, b) => busy(b, async () => { const r = await post(`/api/manager/attendance/${b.dataset.sms}/sms`); toast(r.failed ? `ارسال نشد: ${r.errors[0] || 'خطای درگاه پیامک'}` : r.simulated ? 'ارسال شبیه‌سازی شد (درگاه پیامک تنظیم نیست)' : 'پیامک ارسال شد', r.failed ? 'err' : 'ok'); home(el, _p, me); }));
  $('#smsAll', el)?.addEventListener('click', (e) => busy(e.currentTarget, async () => { const r = await post('/api/manager/attendance/all/sms'); toast(r.failed ? `${fa(r.sent)} ارسال شد، ${fa(r.failed)} ناموفق: ${r.errors[0] || ''}` : `${fa(r.sent)} پیامک ${r.simulated ? 'شبیه‌سازی' : 'ارسال'} شد`, r.failed ? 'err' : 'ok'); home(el, _p, me); }));
}

// ================= دانش‌آموزان =================
function studentForm(m, s = {}) {
  return `<form class="stack" id="stForm"><div class="form-grid">
    <div class="field"><label>نام و نام خانوادگی *</label><input class="input" name="full_name" value="${esc(s.full_name || '')}" required></div>
    <div class="field"><label>کد ملی ۱۰ رقمی *</label><input class="input ltr" name="national_code" value="${esc(s.national_code || '')}" maxlength="10" inputmode="numeric" required></div>
    <div class="field"><label>جنسیت</label><select class="input" name="gender"><option value="m" ${s.gender !== 'f' ? 'selected' : ''}>پسر</option><option value="f" ${s.gender === 'f' ? 'selected' : ''}>دختر</option></select></div>
    <div class="field"><label>مدرسه</label><input class="input" name="school" value="${esc(s.school || '')}" list="schoolList"><datalist id="schoolList">${m.schools.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="field"><label>پایه *</label><select class="input" name="grade" id="stGrade">${m.grades.map((g) => `<option value="${g}" ${s.grade === g ? 'selected' : ''}>${gradeName(g)}</option>`).join('')}</select></div>
    <div class="field"><label>کلاس</label><select class="input" name="class_id" id="stClass"></select></div>
    <div class="field"><label>تاریخ تولد</label>${dateField('birth', s.birth_date, { minYear: 1385, maxYear: 1400 })}</div>
    <div class="field"><label>موبایل (اختیاری، فقط برای پیامک)</label><input class="input ltr" name="parent_phone" value="${esc(s.parent_phone || '')}" maxlength="11" inputmode="tel" placeholder="09xxxxxxxxx"></div></div>
    <div class="field"><label>نشانی منزل</label><textarea class="input" name="address" style="min-height:60px">${esc(s.address || '')}</textarea></div></form>`;
}
function bindStudentForm(m, md, s = {}) {
  const drawCls = () => { const g = Number($('#stGrade', m).value); $('#stClass', m).innerHTML = md.classes.filter((c) => c.grade === g).map((c) => `<option value="${c.id}" ${s.class_id === c.id ? 'selected' : ''}>کلاس ${esc(c.name)} (${fa(c.students)} نفر)</option>`).join(''); };
  drawCls(); $('#stGrade', m).onchange = drawCls;
}
const readStudent = (m) => ({ ...formData($('#stForm', m)), national_code: en($('#stForm [name=national_code]', m).value), parent_phone: en($('#stForm [name=parent_phone]', m).value), birth_date: readDate(m, 'birth') });

async function students(el) {
  const md = await meta();
  const q = { q: '', grade: '', class_id: '', school: '', offset: 0 };
  let rows = [], total = 0;
  setHead('مدیریت دانش‌آموزان', 'ثبت‌نام، ویرایش، جستجو و فیلتر', `<button class="btn ghost sm" id="printCreds">${icon('receipt', { size: 16 })} چاپ کارت‌های ورود</button> <button class="btn ghost sm" id="importSt">ثبت‌نام گروهی (CSV)</button> <button class="btn sm" id="addSt"> ثبت‌نام دانش‌آموز</button>`);
  el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row wrap"><input class="input grow" id="q" placeholder=" جستجوی زنده نام یا کد ملی…" style="min-width:220px">
    <select class="input" id="fg" style="width:auto"><option value="">همه پایه‌ها</option>${md.grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select>
    <select class="input" id="fc" style="width:auto"><option value="">همه کلاس‌ها</option></select>
    <select class="input" id="fs" style="width:auto;max-width:220px"><option value="">همه مدارس</option>${md.schools.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div></div>
    <div class="card"><div class="row between" style="margin-bottom:10px"><b id="total"></b></div><div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>کد ملی</th><th>پایه/کلاس</th><th>مدرسه</th><th>موبایل والدین</th><th>حق عضویت</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>
    <div class="center" style="margin-top:12px"><button class="btn ghost" id="more">نمایش بیشتر</button></div></div>`;
  const fillClasses = () => { $('#fc', el).innerHTML = `<option value="">همه کلاس‌ها</option>${md.classes.filter((c) => !q.grade || c.grade === Number(q.grade)).map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}`; };
  fillClasses();
  const rowHtml = (s) => `<tr><td class="click" data-view="${s.id}"><b>${esc(s.full_name)}</b></td><td class="num">${fa(s.national_code)}</td><td>${gradeName(s.grade)} ${esc(s.class_name || '—')}</td><td class="small">${esc(s.school || '')}</td><td class="num">${fa(s.parent_phone)}</td>
    <td><span class="badge ${PAY[s.pay][1]}">${PAY[s.pay][0]}</span></td><td><div class="row" style="gap:4px"><button class="icon-btn" data-sms="${s.id}" title="ارسال پیامک" aria-label="ارسال پیامک">${icon('message', { size: 16 })}</button><button class="icon-btn" data-edit="${s.id}" title="ویرایش" aria-label="ویرایش">${icon('edit', { size: 16 })}</button><button class="icon-btn" data-del="${s.id}" title="حذف" aria-label="حذف">${icon('trash', { size: 16 })}</button></div></td></tr>`;
  let seq = 0;
  const load = async (append) => {
    const my = ++seq;
    if (!append) q.offset = 0;
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: 40 })}`);
    if (my !== seq) return;
    rows = append ? rows.concat(r.rows) : r.rows; total = r.total;
    $('#tb', el).innerHTML = rows.map(rowHtml).join('') || `<tr><td colspan="7">${empty('search', 'دانش‌آموزی با این مشخصات پیدا نشد')}</td></tr>`;
    $('#total', el).textContent = `${fa(total)} دانش‌آموز`;
    $('#more', el).style.display = rows.length < total ? '' : 'none';
  };
  let tmr;
  $('#q', el).oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { q.q = en(e.target.value.trim()); load(); }, 220); };
  $('#fg', el).onchange = (e) => { q.grade = e.target.value; q.class_id = ''; fillClasses(); load(); };
  $('#fc', el).onchange = (e) => { q.class_id = e.target.value; load(); };
  $('#fs', el).onchange = (e) => { q.school = e.target.value; load(); };
  $('#more', el).onclick = () => { q.offset = rows.length; load(true); };
  load();

  const save = async (m, id) => {
    const body = readStudent(m);
    if (id) { await put(`/api/manager/students/${id}`, body); toast('اطلاعات ذخیره شد', 'ok'); }
    else { const r = await post('/api/manager/students', body); await modal({ title: ' ثبت‌نام انجام شد', body: `<div class="stack small"><div>${icon('backpack', { size: 16 })} ${esc(r.credentials.student)}</div></div>`, actions: [{ label: 'باشه', value: true }] }); }
    metaCache = null; load();
  };
  $('#importSt').onclick = () => modal({
    title: 'ثبت‌نام گروهی از فایل CSV', wide: true,
    body: `<div class="stack"><p class="small muted" style="margin:0;line-height:2">فایل اکسل را با «Save As ← CSV UTF-8» ذخیره کنید. ستون‌های لازم: نام و نام خانوادگی (در یک ستون)، کد ملی، شماره تماس، پایه (مثلاً چهارم)، جنسیت (دختر یا پسر). ستون‌های اختیاری: کلاس (مثلاً «دختر ۱»؛ پیش‌فرض «الف»)، نام پدر، نام مادر، مدرسه، تاریخ تولد (شمسی)، نشانی، شماره تماس دوم، شهریه این ماه («پرداخت شده» یعنی شهریهٔ این ماه تسویه است). هر اطلاعاتی که در فایل باشد در پروفایل ثبت می‌شود؛ جاهای خالی خالی می‌ماند و خود دانش‌آموز هر وقت خواست از پروفایلش تکمیل می‌کند (اجباری نیست).
      <a href="/samples/students-template.csv" download>دانلود فایل نمونه</a></p>
      <div class="field"><label for="csvFile">فایل CSV</label><input class="input" type="file" id="csvFile" accept=".csv,text/csv,.txt"></div><div id="csvOut" aria-live="polite"></div></div>`,
    actions: [{ label: 'بستن', cls: 'ghost', value: false },
      { label: 'بررسی بدون ثبت', cls: 'soft', onClick: (m) => runImport(m, true) },
      { label: 'ثبت دانش‌آموزان', onClick: (m) => runImport(m, false) }],
  });
  async function runImport(m, dry) {
    const f = $('#csvFile', m).files[0];
    if (!f) throw new Error('ابتدا فایل CSV را انتخاب کنید');
    const r = await post('/api/manager/students/import', { csv: await f.text(), dry_run: dry });
    const bad = r.errors.filter((e) => !e.message.includes('قبلاً ثبت'));
    $('#csvOut', m).innerHTML = `<div class="row wrap" style="gap:var(--s-2)"><span class="badge">${fa(r.total)} سطر</span><span class="badge green">${dry ? 'قابل ثبت' : 'ثبت‌شده'}: ${fa(dry ? r.valid : r.created)}</span>${r.skipped_existing ? `<span class="badge gray">تکراری: ${fa(r.skipped_existing)}</span>` : ''}${bad.length ? `<span class="badge red">خطا: ${fa(bad.length)}</span>` : ''}</div>
      ${r.errors.length ? `<div class="table-wrap" style="max-height:240px;margin-top:var(--s-3)"><table class="table"><thead><tr><th>سطر</th><th>نام</th><th>مشکل</th></tr></thead><tbody>${r.errors.slice(0, 100).map((e) => `<tr><td>${fa(e.line)}</td><td>${esc(e.name || '')}</td><td class="small">${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${dry ? (bad.length ? '' : '<p class="small pos" style="margin-top:var(--s-3)">همه‌چیز درست است؛ «ثبت دانش‌آموزان» را بزنید.</p>') : '<p class="small" style="margin-top:var(--s-3)">نام کاربری و رمز اولیه هر دانش‌آموز کد ملی خودش است. از «چاپ کارت ورود» برگهٔ ورود را بگیرید.</p>'}`;
    if (!dry) { metaCache = null; toast(`${fa(r.created)} دانش‌آموز ثبت شد`, 'ok'); load(); }
    return false;
  }
  $('#printCreds').onclick = async () => {
    const list = await api(`/api/manager/students/credentials?${new URLSearchParams({ grade: q.grade, class_id: q.class_id })}`);
    if (!list.length) { toast('دانش‌آموزی برای چاپ یافت نشد'); return; }
    if (!q.class_id && !q.grade && !(await confirmBox(`کارت ورود همهٔ ${fa(list.length)} دانش‌آموز چاپ شود؟ برای چاپ یک کلاس، ابتدا کلاس یا پایه را فیلتر کنید.`, 'چاپ همه'))) return;
    const c = state.me?.center || {}, url = `${location.origin}/#/login`, shortUrl = location.host;
    const card = (st) => `<div class="cred-card">
      <div class="cred-head"><span class="cred-logo">${logoHtml(c.logo)}</span><div><b>${esc(c.name || 'کانون')}</b><small>پلتفرم رشد نخبه</small></div></div>
      <div class="cred-body"><div class="cred-info">
        <div class="cred-name">${esc(st.full_name)}</div><div class="cred-cls">${gradeName(st.grade)} ${esc(st.class_name || '')}</div>
        <div class="cred-row"><span>نام کاربری</span><code>${fa(st.student_user)}</code></div>
        <div class="cred-row"><span>رمز عبور اولیه</span><code>${fa(st.student_pass)}</code></div>
        <div class="cred-row"><span>آدرس پنل</span><code class="url">${esc(shortUrl)}</code></div></div>
        <div class="cred-qr">${qrSvg(url)}<small>با گوشی اسکن کنید</small></div></div>
      <div class="cred-foot">پس از اولین ورود، رمز عبور خود را تغییر دهید.</div></div>`;
    printOverlay(`<div class="cred-sheet">${list.map(card).join('')}</div>`, `کارت ورود ${fa(list.length)} دانش‌آموز`);
  };
  $('#addSt').onclick = () => modal({ title: ' ثبت‌نام دانش‌آموز', wide: true, body: studentForm(md), onOpen: (m) => bindStudentForm(m, md), actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: ' ثبت‌نام', onClick: (m) => save(m) }] });
  on(el, 'click', '[data-edit]', (e, b) => {
    const s = rows.find((x) => x.id === Number(b.dataset.edit));
    modal({ title: `${icon('edit', { size: 16 })} ویرایش ${esc(s.full_name)}`, wide: true, body: studentForm(md, s) + '<button class="btn ghost sm" id="resetPw" style="margin-top:12px"> بازنشانی رمز به کد ملی</button>', onOpen: (m) => { bindStudentForm(m, md, s); $('#resetPw', m).onclick = (ev) => busy(ev.target, async () => { await post(`/api/manager/students/${s.id}/reset-password`); toast('رمز به کد ملی بازنشانی شد', 'ok'); }); }, actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: ' ذخیره', onClick: (m) => save(m, s.id) }] });
  });
  on(el, 'click', '[data-del]', async (e, b) => {
    const s = rows.find((x) => x.id === Number(b.dataset.del));
    if (await confirmBox(`«${esc(s.full_name)}» و همه سوابقش (امتیاز، آزمون، پرداخت) برای همیشه حذف شود؟`, 'حذف دانش‌آموز')) { await del(`/api/manager/students/${s.id}`); toast('حذف شد', 'ok'); metaCache = null; load(); }
  });
  on(el, 'click', '[data-view]', async (e, td) => {
    const d = await api(`/api/manager/students/${td.dataset.view}`);
    modal({ title: `${esc(d.info.avatar)} ${esc(d.info.full_name)}`, wide: true, body: studentDetailHtml(d) });
  });
  on(el, 'click', '[data-sms]', async (e, b) => {
    const s = rows.find((x) => x.id === Number(b.dataset.sms));
    if (!s) return;
    const { openSmsModal } = await import('./legacy.js');
    await openSmsModal({
      target_type: 'student',
      student_id: s.id,
      student_name: s.full_name,
      recipient: 'parent',
      text: s.pay === 'unpaid' ? `ولی گرامی دانش‌آموز ${s.full_name}، با سلام؛ لطفاً نسبت به تسویه حق عضویت کانون اقدام فرمایید.` : `ولی گرامی دانش‌آموز ${s.full_name}، `
    });
  });
}

// ================= معلمان، کلاس‌ها، برنامه =================
async function staff(el) {
  const md = await meta(true);
  setHead('معلمان، کلاس‌ها و برنامه هفتگی', `${fa(md.teachers.length)} معلم • ${fa(md.classes.length)} کلاس`, '<button class="btn sm" id="addT"> معلم جدید</button> <button class="btn soft sm" id="addC"> کلاس جدید</button>');
  let schedClass = md.classes[0]?.id;
  el.innerHTML = `<div class="grid c2"><div class="card"><div class="card-title"><span class="ib">${icon('board', { size: 18 })}</span>معلمان</div><div class="list">${md.teachers.map((t) => `<div class="list-item">${nameAvatar(t.full_name)}<div class="grow"><b class="small">${esc(t.full_name)}</b> ${t.active ? '' : '<span class="badge red">غیرفعال</span>'}<div class="tiny muted">${esc(t.username)} • ${fa(esc(t.classes || 'بدون کلاس').replace(/:/g, ' ').replace(/،/g, ' ·'))}</div></div><button class="btn sm ghost" data-et="${t.id}" aria-label="ویرایش معلم" title="ویرایش معلم">${icon('edit', { size: 16 })}</button></div>`).join('')}</div></div>
    <div class="card"><div class="card-title"><span class="ib">${icon('building', { size: 18 })}</span>کلاس‌ها</div><div class="grid c3">${md.classes.map((c) => `<div class="card flat center" style="padding:12px"><b>${gradeName(c.grade)} ${esc(c.name)}</b><div class="tiny muted">${fa(c.students)} نفر</div>${c.students ? '' : `<button class="btn ghost sm" data-dc="${c.id}">حذف</button>`}</div>`).join('')}</div></div></div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('calendar', { size: 18 })}</span>برنامه هفتگی کلاس<select class="input more" id="schedSel" style="width:auto">${md.classes.map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}</select></div><div id="sched"></div></div>`;
  const drawSched = async () => {
    const list = await api(`/api/manager/schedule?class_id=${schedClass}`);
    $('#sched', el).innerHTML = `<div class="week-cal">${WEEKDAYS.map((w, i) => `<div class="day"><div class="dn">${w}</div>${list.filter((s) => s.weekday === i).map((s) => `<div class="ses"><b>${subjIcon(s.subject)} ${esc(s.subject)}</b>${fa(s.start)} تا ${fa(s.end)}<div class="tiny muted">${esc(s.teacher || '')}${s.room ? ' · ' + esc(s.room) : ''} · ${kindOf(s.kind).label}</div><button class="btn ghost sm" data-ds="${s.id}" style="padding:0 6px;margin-top:2px">حذف</button></div>`).join('')}</div>`).join('')}</div>
      <form class="row wrap" id="schedForm" style="margin-top:12px"><select class="input" name="weekday" style="width:auto">${WEEKDAYS.map((w, i) => `<option value="${i}">${w}</option>`).join('')}</select><input class="input ltr" type="time" name="start" value="16:00" style="width:auto"><input class="input ltr" type="time" name="end" value="17:30" style="width:auto">
      <input class="input" name="subject" placeholder="درس" style="width:140px"><input class="input" name="room" placeholder="مکان" style="width:140px"><select class="input" name="kind" style="width:auto" aria-label="نوع جلسه">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select><select class="input" name="teacher_id" style="width:auto"><option value="">معلم</option>${md.teachers.map((t) => `<option value="${t.id}">${esc(t.full_name)}</option>`).join('')}</select><button class="btn sm">${icon('plus', { size: 16 })} افزودن جلسه</button></form>`;
    $('#schedForm', el).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post('/api/manager/schedule', { ...formData(e.target), class_id: schedClass }); drawSched(); }); };
  };
  $('#schedSel', el).onchange = (e) => { schedClass = Number(e.target.value); drawSched(); };
  on(el, 'click', '[data-ds]', (e, b) => busy(b, async () => { await del(`/api/manager/schedule/${b.dataset.ds}`); drawSched(); }));
  on(el, 'click', '[data-dc]', async (e, b) => { if (await confirmBox('کلاس حذف شود؟', 'حذف')) { await del(`/api/manager/classes/${b.dataset.dc}`); staff(el); } });
  drawSched();
  const SUBJECTS = ['ریاضی', 'علوم', 'فارسی', 'زبان انگلیسی', 'هوش و استعداد', 'مطالعات اجتماعی'];
  const teacherModal = async (t) => {
    const assign = t ? (await api(`/api/manager/teachers/${t.id}`)).assign : [];
    const has = (cid, s) => assign.some((a) => a.class_id === cid && a.subject === s);
    modal({
      title: t ? `${icon('edit', { size: 16 })} ${esc(t.full_name)}` : ' معلم جدید', wide: true,
      body: `<form class="stack" id="tForm"><div class="form-grid"><div class="field"><label>نام و نام خانوادگی</label><input class="input" name="full_name" value="${esc(t?.full_name || '')}" required></div>
        <div class="field"><label>نام کاربری (لاتین)</label><input class="input ltr" name="username" value="${esc(t?.username || '')}" ${t ? 'disabled' : 'required'}></div>
        <div class="field"><label>${t ? 'رمز جدید (اختیاری)' : 'رمز عبور'}</label><input class="input ltr" name="password" type="password" ${t ? '' : 'required'} minlength="6"></div>
        ${t ? `<div class="field"><label>وضعیت</label><select class="input" name="active"><option value="1" ${t.active ? 'selected' : ''}>فعال</option><option value="0" ${t.active ? '' : 'selected'}>غیرفعال</option></select></div>` : ''}</div>
        <div class="label">کلاس‌ها و درس‌ها</div><div class="table-wrap"><table class="table"><thead><tr><th>کلاس</th>${SUBJECTS.map((s) => `<th class="tiny">${s}</th>`).join('')}</tr></thead><tbody>
        ${md.classes.map((c) => `<tr><td>${gradeName(c.grade)} ${esc(c.name)}</td>${SUBJECTS.map((s) => `<td class="center"><input type="checkbox" data-as="${c.id}|${s}" ${has(c.id, s) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div></form>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
        label: ' ذخیره', onClick: async (m) => {
          const f = formData($('#tForm', m));
          const asg = $$('[data-as]:checked', m).map((c) => { const [class_id, subject] = c.dataset.as.split('|'); return { class_id: Number(class_id), subject }; });
          if (t) await put(`/api/manager/teachers/${t.id}`, { full_name: f.full_name, password: f.password || undefined, active: f.active === '1', assign: asg });
          else await post('/api/manager/teachers', { ...f, assign: asg });
          toast('ذخیره شد', 'ok'); staff(el);
        },
      }],
    });
  };
  $('#addT').onclick = () => teacherModal(null);
  on(el, 'click', '[data-et]', (e, b) => teacherModal(md.teachers.find((t) => t.id === Number(b.dataset.et))));
  $('#addC').onclick = () => modal({ title: ' کلاس جدید', body: `<form class="form-grid" id="cForm"><div class="field"><label>پایه</label><select class="input" name="grade">${md.grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div><div class="field"><label>نام کلاس</label><input class="input" name="name" placeholder="مثلاً: ج" required></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ایجاد', onClick: async (m) => { await post('/api/manager/classes', formData($('#cForm', m))); toast('کلاس ایجاد شد', 'ok'); staff(el); } }] });
}

// ================= حق عضویت =================
async function fees(el) {
  setHead('حق عضویت و رسیدها', 'تعیین مبلغ و تاریخ قفل هر پایه، بررسی رسیدهای کارت‌به‌کارت');
  let tab = 'pending';
  const d = await api('/api/manager/fees');
  el.innerHTML = `<div class="grid c3"><div class="card span2"><div class="card-title"><span class="ib">${icon('receipt', { size: 18 })}</span>صف بررسی رسیدها<div class="seg more">${[['pending', ' در انتظار'], ['approved', ' تأییدشده'], ['rejected', ' ردشده'], ['reversed', ' برگشتی']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="rq"></div></div>
    <div class="card"><div class="card-title"><span class="ib sun">${icon('sliders', { size: 18 })}</span>مبلغ و تاریخ قفل هر پایه</div><form id="feeForm" class="stack">
      <div class="card flat" style="padding:12px"><b>اشتراک سامانه (همهٔ پایه‌ها)</b><div class="field" style="margin-top:6px"><label for="sysFee">مبلغ اشتراک سامانه (تومان، جدا از حق عضویت)</label><input class="input ltr" id="sysFee" value="${d.system_fee}" inputmode="numeric"></div><p class="tiny muted" style="margin:0">به مبلغ حق عضویت هر پایه اضافه می‌شود و در صفحهٔ پرداخت دانش‌آموز جداگانه نوشته می‌شود. برای حذف، صفر بگذارید.</p></div>
      ${d.settings.map((f) => `<div class="card flat" style="padding:12px"><b>پایه ${gradeName(f.grade)}</b><div class="field" style="margin-top:6px"><label>مبلغ (تومان)</label><input class="input ltr" data-amt="${f.grade}" value="${f.amount}" inputmode="numeric"></div><div class="field"><label>تاریخ قفل پنل</label>${dateField(`lock${f.grade}`, f.lock_date, { minYear: 1404, maxYear: 1406 })}</div></div>`).join('')}
      <button class="btn">${icon('check', { size: 16 })} ذخیره تنظیمات</button></form></div></div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('building', { size: 18 })}</span>گزارش وضعیت پرداخت هر کلاس</div><div class="table-wrap"><table class="table"><thead><tr><th>کلاس</th><th>پرداخت‌شده</th><th>در انتظار</th><th>پرداخت‌نشده</th><th style="min-width:160px">درصد وصول</th><th></th></tr></thead><tbody>
    ${d.classes.map((c) => { const t = c.paid + c.pending + c.unpaid; const r = t ? (c.paid / t) * 100 : 0; return `<tr><td><b>${gradeName(c.grade)} ${esc(c.name)}</b></td><td class="pos">${fa(c.paid)}</td><td style="color:#c2410c">${fa(c.pending)}</td><td class="neg">${fa(c.unpaid)}</td><td><div class="row">${progress(r, 'green sm')}<b class="small">${pct(r)}</b></div></td><td><button class="btn ghost sm" data-cls="${c.id}" data-name="${gradeName(c.grade)} ${esc(c.name)}">فهرست</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
  const drawQueue = async () => {
    const list = await api(`/api/manager/receipts?status=${tab}`);
    $('#rq', el).innerHTML = list.length ? `<div class="grid c2">${list.map((p) => `<div class="card flat"><div class="row">${nameAvatar(p.full_name, 'sm')}<div class="grow"><b class="small">${esc(p.full_name)}</b><div class="tiny muted">${gradeName(p.grade)} ${esc(p.class_name || '')} • ${timeAgo(p.created_at)}</div></div><div style="text-align:end"><b class="small">${money(p.amount)}</b>${p.system_fee ? `<div class="tiny muted">شامل اشتراک سامانه ${money(p.system_fee)}</div>` : ''}<div><span class="badge ${p.invoice_id ? 'blue' : ''}">${p.invoice_id ? `فاکتور #${fa(p.invoice_id)}` : 'حق عضویت'}</span></div></div></div>
      ${p.receipt_path ? `<a href="/uploads/${esc(p.receipt_path)}" target="_blank" aria-label="مشاهده تصویر رسید ${esc(p.full_name)}"><img src="/uploads/${esc(p.receipt_path)}" alt="رسید" loading="lazy" style="width:100%;max-height:220px;object-fit:contain;background:var(--bg);border-radius:12px;margin:10px 0"></a>` : ''}
      ${p.status === 'pending' ? `<div class="row"><button class="btn green grow" data-ok="${p.id}">${icon('check-circle', { size: 16 })} تأیید</button><button class="btn red grow" data-no="${p.id}">${icon('x', { size: 16 })} رد</button></div>` : p.status === 'rejected' ? `<div class="small" style="color:var(--red)">علت: ${esc(p.reject_reason)}</div>` : p.status === 'reversed' ? `<div class="small"><span class="badge orange">برگشت‌خورده ${jdate(p.reversed_at)}</span> ${esc(p.reverse_reason || '')}</div>` : `<div class="row"><span class="badge green">تأیید شد ${jdate(p.reviewed_at)}</span><button class="btn sm ghost" style="margin-inline-start:auto" data-rev="${p.id}">برگشت رسید</button></div>`}</div>`).join('')}</div>` : empty(tab === 'pending' ? 'check-circle' : 'inbox', tab === 'pending' ? 'رسیدی در صف بررسی نیست' : 'موردی نیست');
  };
  drawQueue();
  on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.classList.toggle('on', x === b)); drawQueue(); });
  on(el, 'click', '[data-rev]', (e, b) => modal({ title: 'برگشت رسید تأییدشده', body: '<p class="small muted" style="margin-top:0">رسید باطل و یک سند هزینه‌ی اصلاحی در حسابداری ثبت می‌شود. این کار برگشت‌پذیر نیست.</p><div class="field"><label for="revWhy">علت برگشت</label><input class="input" id="revWhy" maxlength="200" required></div>', actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ثبت برگشت', cls: 'red', onClick: async (m) => { const reason = m.querySelector('#revWhy').value.trim(); if (!reason) { toast('علت را بنویسید'); return false; } await post(`/api/manager/receipts/${b.dataset.rev}/reverse`, { reason }); toast('رسید برگشت خورد و سند اصلاحی ثبت شد', 'ok'); drawQueue(); } }] }));
  on(el, 'click', '[data-ok]', (e, b) => busy(b, async () => { await post(`/api/manager/receipts/${b.dataset.ok}/approve`); toast('رسید تأیید شد و در صندوق ثبت شد', 'ok'); drawQueue(); }));
  on(el, 'click', '[data-no]', (e, b) => modal({
    title: ' رد رسید', body: `<div class="label" style="margin-bottom:8px">علت رد (برای دانش‌آموز نمایش داده می‌شود)</div><div class="chips" style="margin-bottom:10px">${REJECT_REASONS.map((r) => `<button class="chip" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div><textarea class="input" id="reason" placeholder="یا علت دیگری بنویسید…"></textarea>`,
    onOpen: (m) => on(m, 'click', '[data-reason]', (ev, c) => { $('#reason', m).value = c.dataset.reason; $$('[data-reason]', m).forEach((x) => x.classList.toggle('on', x === c)); }),
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'رد رسید', cls: 'red', onClick: async (m) => { await post(`/api/manager/receipts/${b.dataset.no}/reject`, { reason: $('#reason', m).value }); toast('رسید رد شد', 'ok'); drawQueue(); } }],
  }));
  on(el, 'click', '[data-cls]', async (e, b) => {
    const list = await api(`/api/manager/fees/class/${b.dataset.cls}`);
    modal({ title: `کلاس ${b.dataset.name}`, body: `<div class="list">${list.map((s) => `<div class="list-item">${nameAvatar(s.full_name, 'sm')}<span class="grow">${esc(s.full_name)}</span><span class="badge ${PAY[s.st][1]}">${PAY[s.st][0]}</span></div>`).join('')}</div>` });
  });
  $('#feeForm', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await put('/api/manager/fees', { system_fee: Number(en($('#sysFee', el).value)) || 0, settings: d.settings.map((f) => ({ grade: f.grade, amount: Number(en($(`[data-amt="${f.grade}"]`, el).value)), lock_date: readDate(el, `lock${f.grade}`) })) });
      toast('تنظیمات حق عضویت ذخیره شد', 'ok');
    });
  };
}

// ================= اطلاعیه‌ها =================
async function announcements(el) {
  const md = await meta();
  setHead('اطلاعیه‌رسانی', 'ارسال به کل کانون، پایه یا کلاس‌های مشخص + گزارش دیده‌شدن', '<button class="btn sm" id="newAnn"> اطلاعیه جدید</button>');
  const list = await api('/api/manager/announcements');
  const target = (a) => (a.target_type === 'all' ? ' کل کانون' : a.target_type === 'grade' ? `${icon('graduation', { size: 16 })} پایه ${a.target_value.map(gradeName).join('، ')}` : `${icon('logout', { size: 16 })} کلاس ${a.target_value.map((id) => { const c = md.classes.find((x) => x.id === id); return c ? `${gradeName(c.grade)} ${c.name}` : ''; }).join('، ')}`);
  el.innerHTML = `<div class="stack">${list.map((a) => `<div class="card"><div class="row" style="align-items:flex-start"><span class="ib lg">${icon('megaphone', { size: 22 })}</span><div class="grow"><b>${esc(a.title)}</b><div class="tiny muted">${jdate(a.created_at)} • ${target(a)}</div><p class="small" style="margin:6px 0 0">${esc(a.body)}</p></div></div>
    <div class="row" style="margin-top:12px"><div class="grow"><div class="row between small"><span>${icon('eye', { size: 16 })} دیده‌شده: <b>${fa(a.seen)}</b> از ${fa(a.audience)} نفر</span><b>${pct(a.audience ? (a.seen / a.audience) * 100 : 0)}</b></div>${progress(a.audience ? (a.seen / a.audience) * 100 : 0, 'green')}</div>
    <button class="btn soft sm" data-rep="${a.id}">گزارش دیده‌شدن</button><button class="icon-btn" data-del="${a.id}" aria-label="حذف">${icon('trash', { size: 16 })}</button></div></div>`).join('') || `<div class="card">${empty('inbox', 'اطلاعیه‌ای ارسال نشده')}</div>`}</div>`;
  on(el, 'click', '[data-rep]', async (e, b) => {
    const a = await api(`/api/manager/announcements/${b.dataset.rep}`);
    const roleN = { student: '', parent: '', teacher: '' };
    const seen = a.people.filter((p) => p.seen_at), unseen = a.people.filter((p) => !p.seen_at);
    const listH = (arr) => `<div class="list" style="max-height:380px;overflow:auto">${arr.map((p) => `<div class="list-item"><span>${roleN[p.role]}</span><div class="grow"><span class="small bold">${esc(p.full_name)}</span><div class="tiny muted">${p.grade ? `پایه ${gradeName(p.grade)} ${esc(p.class_name || '')}` : p.children ? `ولیِ ${esc(p.children)}` : 'معلم'}</div></div>${p.seen_at ? `<span class="tiny muted">${timeAgo(p.seen_at)}</span>` : ''}</div>`).join('') || empty('inbox', 'موردی نیست')}</div>`;
    modal({ title: `${icon('eye', { size: 16 })} ${esc(a.title)}`, wide: true, body: `<div class="seg" style="margin-bottom:12px"><button class="on" data-t="u">${icon('x', { size: 16 })} ندیده‌اند (${fa(unseen.length)})</button><button data-t="s">${icon('check-circle', { size: 16 })} دیده‌اند (${fa(seen.length)})</button></div><div id="pl">${listH(unseen)}</div>`,
      onOpen: (m) => on(m, 'click', '[data-t]', (ev, t) => { $$('[data-t]', m).forEach((x) => x.classList.toggle('on', x === t)); $('#pl', m).innerHTML = listH(t.dataset.t === 's' ? seen : unseen); }) });
  });
  on(el, 'click', '[data-del]', async (e, b) => { if (await confirmBox('اطلاعیه حذف شود؟', 'حذف')) { await del(`/api/manager/announcements/${b.dataset.del}`); announcements(el); } });
  $('#newAnn').onclick = () => {
    let type = 'all';
    modal({
      title: ' اطلاعیه جدید', wide: true,
      body: `<form class="stack" id="annForm"><div class="field"><label for="annTitle">عنوان</label><input class="input" id="annTitle" name="title" placeholder="آغاز ثبت‌نام آزمون جامع" required></div>
        <textarea class="input" name="body" placeholder="متن اطلاعیه…" required style="min-height:120px"></textarea>
        <div class="label">مخاطبان</div><div class="seg"><button type="button" class="on" data-tt="all">${icon('building', { size: 16 })} کل کانون</button><button type="button" data-tt="grade">${icon('graduation', { size: 16 })} پایه مشخص</button><button type="button" data-tt="classes">${icon('logout', { size: 16 })} کلاس‌های مشخص</button></div><div class="chips" id="tv"></div>
        <div class="tiny muted">اطلاعیه پس از ورود، به‌صورت تمام‌صفحه برای دانش‌آموزان و والدینِ مخاطب نمایش داده می‌شود.</div></form>`,
      onOpen: (m) => {
        const drawTv = () => { $('#tv', m).innerHTML = type === 'grade' ? md.grades.map((g) => `<label class="chip"><input type="checkbox" value="${g}" hidden> پایه ${gradeName(g)}</label>`).join('') : type === 'classes' ? md.classes.map((c) => `<label class="chip"><input type="checkbox" value="${c.id}" hidden> ${gradeName(c.grade)} ${esc(c.name)}</label>`).join('') : ''; };
        on(m, 'click', '[data-tt]', (e, b) => { type = b.dataset.tt; $$('[data-tt]', m).forEach((x) => x.classList.toggle('on', x === b)); drawTv(); });
        on(m, 'change', '#tv input', (e, i) => i.parentElement.classList.toggle('on', i.checked));
      },
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: ' ارسال اطلاعیه', onClick: async (m) => { await post('/api/manager/announcements', { ...formData($('#annForm', m)), target_type: type, target_value: $$('#tv input:checked', m).map((i) => Number(i.value)) }); toast('اطلاعیه ارسال شد', 'ok'); announcements(el); } }],
    });
  };
}

// ================= حسابداری =================
async function accounting(el, _p, me) {
  let period = 'month', type = '', from = addDays(me.today, -30), to = me.today;
  setHead('حسابداری', 'درآمد، هزینه، مانده صندوق و دفتر کل', '<button class="btn sm" id="addExp"> ثبت سند هزینه</button> <button class="btn soft sm" id="addInc"> ثبت درآمد</button>');
  const ranges = { day: () => [me.today, me.today], week: () => [addDays(me.today, -6), me.today], month: () => [addDays(me.today, -29), me.today] };
  const load = async () => {
    if (period !== 'custom') [from, to] = ranges[period]();
    const d = await api(`/api/manager/accounting?from=${from}&to=${to}${type ? `&type=${type}` : ''}`);
    el.innerHTML = `<div class="grid c3">${kpi('download', 'green', money(d.totals.income), 'کل درآمد')}${kpi('upload', 'red', money(d.totals.expense), 'کل هزینه')}${kpi('wallet', '', money(d.totals.balance), 'مانده صندوق')}</div>
      <div class="grid c3" style="margin-top:18px"><div class="card span2"><div class="card-title"><span class="ib">${icon('chart', { size: 18 })}</span>مقایسه درآمد و هزینه (۶ ماه اخیر)</div>${barChart(d.months.map((m) => ({ label: m.label, values: [m.income, m.expense] })), [{ name: 'درآمد', color: '#0E9157' }, { name: 'هزینه', color: '#D8262F' }], { height: 250 })}</div>
      <div class="card"><div class="card-title"><span class="ib red">${icon('bulb', { size: 18 })}</span>ترکیب هزینه‌های بازه</div>${d.categories.length ? donut(d.categories.map((c, i) => ({ name: c.category, value: c.total, color: ['#0B5F66', '#F2B33D', '#F2B33D', '#0E9157', '#2C5A7A', '#D8262F'][i % 6] })), { size: 130, label: '', sub: '' }) : empty('bulb', 'هزینه‌ای در این بازه نیست')}</div></div>
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('info', { size: 18 })}</span>دفتر کل تراکنش‌ها و دفتر واریزها</div>
        <div class="row wrap" style="margin-bottom:12px"><div class="seg">${[['day', 'روزانه'], ['week', 'هفتگی'], ['month', 'ماهانه'], ['custom', 'بازه دلخواه']].map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg">${[['', 'همه'], ['income', 'واریزها'], ['expense', 'هزینه‌ها']].map(([k, l]) => `<button data-ty="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${period === 'custom' ? `<div class="row wrap" style="margin-bottom:12px"><span class="small">از</span><div style="width:250px">${dateField('from', from, { minYear: 1403, maxYear: 1406 })}</div><span class="small">تا</span><div style="width:250px">${dateField('to', to, { minYear: 1403, maxYear: 1406 })}</div><button class="btn sm" id="applyR">اعمال</button></div>` : ''}
        <div class="row wrap small" style="margin-bottom:10px"><span class="badge green">ورودی بازه: ${money(d.range.income)}</span><span class="badge red">خروجی بازه: ${money(d.range.expense)}</span><span class="badge gray">${jdate(d.from)} تا ${jdate(d.to)}</span></div>
        <div class="table-wrap" style="max-height:520px"><table class="table"><thead><tr><th>تاریخ</th><th>شرح</th><th>دسته</th><th>مبلغ</th><th></th></tr></thead><tbody>
        ${d.ledger.map((t) => `<tr><td class="tiny">${jshort(t.date)}</td><td class="small">${esc(t.title)}</td><td><span class="badge gray">${esc(t.category || '')}</span></td><td class="${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '−'} ${money(t.amount)}</td><td>${t.ref?.startsWith('pay:') || t.ref?.startsWith('RSH') ? '' : `<button class="icon-btn" data-dt="${t.id}" aria-label="حذف">${icon('trash', { size: 16 })}</button>`}</td></tr>`).join('') || `<tr><td colspan="5">${empty('inbox', 'تراکنشی در این بازه نیست')}</td></tr>`}</tbody></table></div></div>`;
    $('#applyR', el)?.addEventListener('click', () => { from = readDate(el, 'from') || from; to = readDate(el, 'to') || to; load(); });
  };
  on(el, 'click', '[data-p]', (e, b) => { period = b.dataset.p; load(); });
  on(el, 'click', '[data-ty]', (e, b) => { type = b.dataset.ty; load(); });
  on(el, 'click', '[data-dt]', async (e, b) => { if (await confirmBox('این سند حذف شود؟', 'حذف')) { await del(`/api/manager/transactions/${b.dataset.dt}`); load(); } });
  const txModal = (kind) => modal({
    title: kind === 'expense' ? ' ثبت سند هزینه' : ' ثبت درآمد',
    body: `<form class="stack" id="txForm"><div class="field"><label>شرح</label><input class="input" name="title" required></div><div class="form-grid"><div class="field"><label>مبلغ (تومان)</label><input class="input ltr" name="amount" inputmode="numeric" required></div>
      <div class="field"><label>دسته</label><input class="input" name="category" list="cats" placeholder="${kind === 'expense' ? 'اجاره، حقوق، قبوض…' : 'شهریه، کمک مردمی…'}"><datalist id="cats">${(kind === 'expense' ? ['اجاره', 'حقوق', 'قبوض', 'ملزومات', 'آزمون', 'تعمیرات', 'سایر'] : ['شهریه', 'کمک مردمی', 'فروشگاه', 'سایر']).map((c) => `<option value="${c}">`).join('')}</datalist></div></div>
      <div class="field"><label>تاریخ</label>${dateField('txDate', me.today, { minYear: 1403, maxYear: 1406 })}</div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: ' ثبت', onClick: async (m) => { await post('/api/manager/expenses', { ...formData($('#txForm', m)), type: kind, amount: en($('#txForm [name=amount]', m).value).replace(/[,٬]/g, ''), date: readDate(m, 'txDate') }); toast('سند ثبت شد', 'ok'); load(); } }],
  });
  $('#addExp').onclick = () => txModal('expense');
  $('#addInc').onclick = () => txModal('income');
  await load();
}

// ================= آزمون جامع =================
async function comprehensive(el) {
  const md = await meta();
  setHead('آزمون جامع کانون', 'رتبه‌بندی لحظه‌ای و کارت ورود به جلسه با QR', '<button class="btn sm" id="newComp"> آزمون جامع جدید</button>');
  const list = await api('/api/manager/comprehensive');
  el.innerHTML = `<div class="grid c3">${list.map((e) => `<a class="card ${e.results ? '' : 'tint-violet'}" href="#/comprehensive/${e.id}" style="color:inherit"><div class="row"><span class="ib">${icon('trophy', { size: 18 })}</span><div class="grow"><b>${esc(e.title)}</b><div class="tiny muted">پایه ${gradeName(e.grade)} • ${e.exam_date ? jdate(e.exam_date) : '—'} • ${fa(e.qcount)} سؤال</div></div></div>
    <div class="row between small" style="margin-top:10px"><span>نتیجه: ${fa(e.results)} از ${fa(e.candidates)}</span><b>${e.avg == null ? 'برگزار نشده' : `میانگین ${pct(e.avg)}`}</b></div>${progress(e.candidates ? (e.results / e.candidates) * 100 : 0)}</a>`).join('') || `<div class="card">${empty('trophy', 'آزمون جامعی تعریف نشده')}</div>`}</div>`;
  $('#newComp').onclick = () => {
    let n = 20, key = Array(20).fill(null), subj = Array(20).fill('ریاضی');
    const SUBS = ['ریاضی', 'علوم', 'فارسی', 'زبان انگلیسی', 'هوش و استعداد'];
    modal({
      title: ' آزمون جامع جدید', wide: true,
      body: `<form class="form-grid" id="cf"><div class="field"><label>عنوان</label><input class="input" name="title" value="آزمون جامع" required></div><div class="field"><label>پایه</label><select class="input" name="grade">${md.grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div>
        <div class="field"><label>محل برگزاری</label><input class="input" name="location" value="سالن اجتماعات کانون"></div><div class="field"><label>مدت (دقیقه)</label><input class="input" type="number" name="duration_min" value="90"></div>
        <div class="field"><label>تاریخ آزمون</label>${dateField('cdate', addDays(state.me.today, 7), { minYear: 1404, maxYear: 1406 })}</div><div class="field"><label>تعداد سؤال</label><input class="input" type="number" id="cn" value="20" min="1" max="${MAX_Q}"></div></form>
        <div class="small muted" style="margin:10px 0">کلید پاسخ و درس هر سؤال را مشخص کنید (برای کارنامه درس‌به‌درس):</div><div class="ans-grid" id="ck" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))"></div>`,
      onOpen: (m) => {
        const draw = () => { $('#ck', m).innerHTML = key.map((a, q) => `<div class="ans-row"><span class="qn">${fa(q + 1)}</span>${[0, 1, 2, 3].map((o) => `<button type="button" class="${a === o ? 'on' : ''}" data-k="${q},${o}">${fa(o + 1)}</button>`).join('')}<select class="input" data-s="${q}" style="min-height:28px;padding:0 4px;font-size:11px">${SUBS.map((s) => `<option ${subj[q] === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join(''); };
        draw();
        on(m, 'click', '[data-k]', (e, b) => { const [q, o] = b.dataset.k.split(',').map(Number); key[q] = o; draw(); });
        on(m, 'change', '[data-s]', (e, s) => { subj[s.dataset.s] = s.value; });
        $('#cn', m).onchange = (e) => { n = Math.max(1, Math.min(MAX_Q, Number(en(e.target.value)) || 1)); key = Array.from({ length: n }, (_, i) => key[i] ?? null); subj = Array.from({ length: n }, (_, i) => subj[i] ?? 'ریاضی'); draw(); };
      },
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
        label: ' ایجاد آزمون', onClick: async (m) => {
          if (key.some((k) => k == null)) throw new Error('کلید همه سؤال‌ها را مشخص کنید');
          const r = await post('/api/manager/comprehensive', { ...formData($('#cf', m)), exam_date: readDate(m, 'cdate'), questions: key.map((a, i) => ({ answer: a, subject: subj[i] })) });
          location.hash = `#/comprehensive/${r.id}`;
        },
      }],
    });
  };
}

async function compDetail(el, { id }, me) {
  const e = await api(`/api/manager/comprehensive/${id}`);
  const done = new Set(e.results.map((r) => r.student_id));
  setHead(`${esc(e.title)}`, `پایه ${gradeName(e.grade)} • ${e.exam_date ? jdate(e.exam_date, { weekday: true }) : ''} • ${esc(e.location || '')}`,
    '<a class="btn ghost sm" href="#/comprehensive">→ فهرست</a> <button class="btn soft sm" id="cards"> کارت ورود به جلسه</button> <button class="btn ghost sm" id="sheet"> پاسخ‌برگ</button> <button class="btn green sm" id="scan"> اسکن و تصحیح</button>');
  el.innerHTML = `<div class="grid c4">${kpi('users', '', fa(e.students.length), 'داوطلب')}${kpi('check-circle', 'green', fa(e.results.length), 'تصحیح‌شده')}${kpi('chart', 'sun', e.avg == null ? '—' : pct(e.avg), 'میانگین')}${kpi('trophy', 'sun', e.results[0] ? pct(e.results[0].percent) : '—', 'بالاترین درصد')}</div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('zap', { size: 18 })}</span>رتبه‌بندی لحظه‌ای <span class="badge green" id="live">● زنده</span></div><div class="table-wrap"><table class="table"><thead><tr><th>رتبه</th><th>داوطلب</th><th>کلاس</th><th>درست/غلط/نزده</th><th>درصد</th><th>زمان ثبت</th></tr></thead><tbody id="rank"></tbody></table></div></div>`;
  const drawRank = (rs) => { $('#rank', el).innerHTML = rs.map((r) => `<tr><td><b><span class="badge ${r.rank <= 3 ? 'yellow' : 'gray'}" style="min-width:28px;justify-content:center">${fa(r.rank)}</span></b></td><td>${esc(r.full_name)}</td><td>${esc(r.class_name || '')}</td><td><span class="pos">${fa(r.correct)}</span> / <span class="neg">${fa(r.wrong)}</span> / ${fa(r.blank)}</td><td><b>${pct(r.percent)}</b></td><td class="tiny">${timeAgo(r.created_at)}</td></tr>`).join('') || `<tr><td colspan="6">${empty('clock', 'هنوز پاسخ‌برگی تصحیح نشده؛ با «اسکن و تصحیح» شروع کنید')}</td></tr>`; };
  drawRank(e.results);
  const iv = setInterval(async () => { if (!document.body.contains(el)) return clearInterval(iv); try { const x = await api(`/api/manager/comprehensive/${id}`); drawRank(x.results); } catch { clearInterval(iv); } }, 8000);
  $('#scan').onclick = () => openScanner({ exam: e, students: e.students.map((s) => ({ ...s, done: done.has(s.id) })), onSave: (sid, answers) => post(`/api/manager/comprehensive/${id}/result`, { student_id: sid, answers }) }).then(() => compDetail(el, { id }, me));
  $('#sheet').onclick = () => printSheet({ title: `${e.title} - ${me.center.name}`, subtitle: `پایه ${gradeName(e.grade)} • ${fa(e.questions.length)} سؤال`, count: e.questions.length });
  $('#cards').onclick = () => printCards(e, me);
}

function qrSvg(text) {
  if (typeof window.qrcode !== 'function') return '<div class="tiny">QR</div>';
  const q = window.qrcode(0, 'M');
  q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}
function printCards(e, me) {
  const cards = e.students.map((s) => `<div class="entry-card"><div class="info"><div class="head">${icon('receipt', { size: 16 })} کارت ورود به جلسه • ${esc(me.center.name)}</div><div><b>${esc(s.full_name)}</b></div><div>پایه ${gradeName(s.grade)} • کلاس ${esc(s.class_name || '')}</div>
    <div>شماره صندلی: <b>${fa(s.seat)}</b></div><div>${esc(e.title)} • ${e.exam_date ? jdate(e.exam_date, { weekday: true }) : ''}</div><div style="font-size:11px;color:#666">${esc(e.location || '')} — حضور ۱۵ دقیقه قبل از شروع</div></div>
    <div class="qr">${qrSvg(`ROSHD|EXAM:${e.id}|STU:${s.id}|SEAT:${s.seat}`)}</div></div>`).join('');
  printOverlay(`<div class="entry-cards">${cards}</div>`, `${icon('receipt', { size: 16 })} ${fa(e.students.length)} کارت ورود به جلسه`);
}

// ================= عملکرد =================
async function performance(el) {
  const md = await meta();
  let grade = '';
  setHead('عملکرد دانش‌آموزان', '۱۰۰ نفر برتر بر اساس امتیاز');
  const load = async () => {
    const list = await api(`/api/manager/performance${grade ? `?grade=${grade}` : ''}`);
    el.innerHTML = `<div class="chips" style="margin-bottom:14px"><button class="chip ${grade ? '' : 'on'}" data-g="">همه</button>${md.grades.map((g) => `<button class="chip ${String(g) === grade ? 'on' : ''}" data-g="${g}">پایه ${gradeName(g)}</button>`).join('')}</div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>رتبه پایه</th><th>دانش‌آموز</th><th>کلاس</th><th>امتیاز</th><th>سطح</th><th>میانگین آزمون</th><th>غیبت ماه</th><th>مطالعه هفته</th></tr></thead><tbody>
      ${list.map((s) => `<tr><td><b>${fa(s.rank)}</b></td><td>${esc(s.full_name)}</td><td>${gradeName(s.grade)} ${esc(s.class_name)}</td><td><b>${fa(s.points)}</b></td><td>${s.level.name}</td><td>${s.avg_percent == null ? '—' : pct(s.avg_percent)}</td><td>${fa(s.absences)}</td><td>${fa(s.week_minutes)} دقیقه</td></tr>`).join('')}</tbody></table></div></div>`;
  };
  on(el, 'click', '[data-g]', (e, b) => { grade = b.dataset.g; load(); });
  await load();
}

// ================= فروشگاه =================
async function shopAdmin(el, _p, me) {
  setHead('مدیریت فروشگاه', 'محصولات، کدهای تخفیف و سفارش‌ها', `<a class="btn ghost sm" href="#/c/${esc(me.center.slug)}" target="_blank">${icon('globe', { size: 16 })} صفحه عمومی</a> <button class="btn sm" id="addP">${icon('plus', { size: 16 })} محصول</button>`);
  const d = await api('/api/manager/products');
  el.innerHTML = `<div class="grid c3"><div class="card span2"><div class="card-title"><span class="ib">${icon('bag', { size: 18 })}</span>محصولات</div><div class="table-wrap"><table class="table"><thead><tr><th>محصول</th><th>نوع</th><th>قیمت</th><th>تخفیف</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${d.products.map((p) => `<tr><td><span class="row" style="gap:8px">${icon(p.kind === 'video' ? 'video' : 'book', { size: 16 })}${esc(p.title)}</span></td><td>${p.kind === 'video' ? ' ویدیو' : ' جزوه'}</td><td>${money(p.price)}</td><td>${p.discount_percent ? `<span class="badge red">${fa(p.discount_percent)}٪</span>` : '—'}</td><td>${p.active ? '<span class="badge green">فعال</span>' : '<span class="badge gray">غیرفعال</span>'}</td><td><button class="icon-btn" data-ep="${p.id}" aria-label="ویرایش">${icon('edit', { size: 16 })}</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="stack" style="gap:18px"><div class="card"><div class="card-title"><span class="ib coral">${icon('receipt', { size: 18 })}</span>کدهای تخفیف</div><div class="list">${d.codes.map((c) => `<div class="list-item"><code style="direction:ltr">${esc(c.code)}</code><span class="badge">${fa(c.percent)}٪</span><span class="grow"></span><button class="icon-btn" data-dcode="${esc(c.code)}" aria-label="حذف">${icon('trash', { size: 16 })}</button></div>`).join('')}</div>
      <form class="row" id="codeForm" style="margin-top:10px"><input class="input ltr" name="code" placeholder="CODE" required><input class="input" name="percent" type="number" min="1" max="90" placeholder="٪" style="width:80px" required><button class="btn sm" aria-label="افزودن کد تخفیف">${icon('plus', { size: 16 })}</button></form></div>
    <div class="card"><div class="card-title"><span class="ib green">${icon('receipt', { size: 18 })}</span>آخرین سفارش‌ها</div><div class="list">${d.orders.map((o) => `<div class="list-item"><div class="grow"><b class="small">${esc(o.full_name)}</b><div class="tiny muted">${esc(o.tracking_code)} • ${timeAgo(o.created_at)}</div></div><b class="small">${money(o.total)}</b></div>`).join('') || empty('bag', 'سفارشی ثبت نشده')}</div></div></div></div>`;
  const pModal = (p = {}) => modal({
    title: p.id ? ' ویرایش محصول' : ' محصول جدید', wide: true,
    body: `<form class="stack" id="pf"><div class="form-grid"><div class="field"><label>عنوان</label><input class="input" name="title" value="${esc(p.title || '')}" required></div><div class="field"><label>نوع</label><select class="input" name="kind"><option value="video" ${p.kind === 'video' ? 'selected' : ''}>${icon('video', { size: 16 })} دوره ویدیویی</option><option value="booklet" ${p.kind !== 'video' ? 'selected' : ''}>${icon('book', { size: 16 })} جزوه</option></select></div>
      <div class="field"><label>پایه</label><input class="input" name="grade" value="${esc(p.grade || '')}"></div><div class="field"><label>قیمت (تومان)</label><input class="input ltr" name="price" value="${p.price || ''}" required></div>
      <div class="field"><label>درصد تخفیف</label><input class="input" type="number" name="discount_percent" value="${p.discount_percent || 0}" min="0" max="90"></div><div class="field"><label>آیکون</label><input class="input" name="cover" value="${esc(p.cover || '')}"></div>
      <div class="field"><label>رنگ</label><input class="input" type="color" name="color" aria-label="رنگ" value="${esc(p.color || '#0B5F66')}"></div><div class="field"><label>وضعیت</label><select class="input" name="active"><option value="1">فعال</option><option value="0" ${p.active === 0 ? 'selected' : ''}>غیرفعال</option></select></div></div>
      <div class="field"><label>توضیح کوتاه</label><input class="input" name="description" value="${esc(p.description || '')}"></div><div class="field"><label>توضیحات کامل</label><textarea class="input" name="details">${esc(p.details || '')}</textarea></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: ' ذخیره', onClick: async (m) => { const f = formData($('#pf', m)); await post('/api/manager/products', { ...f, id: p.id, active: f.active === '1' }); toast('ذخیره شد', 'ok'); shopAdmin(el, _p, me); } }],
  });
  $('#addP').onclick = () => pModal();
  on(el, 'click', '[data-ep]', (e, b) => pModal(d.products.find((p) => p.id === Number(b.dataset.ep))));
  on(el, 'click', '[data-dcode]', (e, b) => busy(b, async () => { await del(`/api/manager/discount-codes/${encodeURIComponent(b.dataset.dcode)}`); shopAdmin(el, _p, me); }));
  $('#codeForm', el).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post('/api/manager/discount-codes', formData(e.target)); shopAdmin(el, _p, me); }); };
}

// حساب‌های مستقل مشاور؛ تنها مدیر کانون به ساخت و ویرایش دسترسی دارد.
async function counselors(el, params, me) {
  setHead('مدیریت مشاوران', 'ساخت حساب مشاور تحصیلی برای دانش‌آموزان کانون', '<button class="btn sm" id="newCounselor">مشاور جدید</button>');
  const data = await api('/api/manager/counselors');
  const list = Array.isArray(data) ? data : data.counselors;
  el.innerHTML = `<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>مشاور</th><th>نام کاربری</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${list.map(c => `<tr><td><div class="row">${nameAvatar(c.full_name)}<b>${esc(c.full_name)}</b></div></td><td><bdi>${esc(c.username || c.national_code || '—')}</bdi></td><td><span class="badge ${c.active ? 'green' : 'red'}">${c.active ? 'فعال' : 'غیرفعال'}</span></td><td><button class="btn sm ghost" data-edit-counselor="${c.id}">${icon('edit')} ویرایش</button></td></tr>`).join('') || `<tr><td colspan="4">${empty('users', 'هنوز مشاوری ثبت نشده؛ با «مشاور جدید» حساب بسازید.')}</td></tr>`}</tbody></table></div></div>`;
  const edit = (c = {}) => modal({
    title: c.id ? 'ویرایش مشاور' : 'مشاور جدید',
    body: `<form class="stack" id="counselorForm"><div class="field"><label>نام و نام خانوادگی</label><input class="input" name="full_name" required maxlength="80" value="${esc(c.full_name || '')}"></div><div class="field"><label>نام کاربری</label><input class="input ltr" name="username" autocomplete="off" required maxlength="40" pattern="[a-zA-Z0-9_.]{3,40}" value="${esc(c.username || '')}" ${c.id ? 'readonly' : ''}></div><div class="field"><label>${c.id ? 'رمز جدید (برای حفظ رمز خالی بگذارید)' : 'رمز عبور (حداقل ۶ نویسه)'}</label><input class="input ltr" type="password" name="password" autocomplete="new-password" minlength="6" ${c.id ? '' : 'required'}></div><div class="field"><label>وضعیت حساب</label><select class="input" name="active"><option value="1">فعال</option><option value="0" ${c.active === 0 ? 'selected' : ''}>غیرفعال</option></select></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره مشاور', onClick: async m => {
      const form = $('#counselorForm', m);
      if (!form.reportValidity()) return false;
      const f = formData(form), body = { ...f, active: f.active === '1' };
      if (!body.password) delete body.password;
      if (c.id) await put(`/api/manager/counselors/${c.id}`, body); else await post('/api/manager/counselors', body);
      toast('حساب مشاور ذخیره شد', 'ok');
      await counselors(el, params, me);
    } }],
  });
  $('#newCounselor').onclick = () => edit();
  on(el, 'click', '[data-edit-counselor]', (_e, b) => edit(list.find(c => c.id === Number(b.dataset.editCounselor))));
}

// ================= تنظیمات =================
async function settings(el) {
  const s = await api('/api/manager/settings');
  setHead('تنظیمات کانون', 'نام، لوگو و اطلاعات نمایش‌داده‌شده در سربرگ و صفحه عمومی');
  el.innerHTML = `<div class="grid c3"><form class="card span2 stack" id="sf"><div class="form-grid"><div class="field"><label>نام کانون</label><input class="input" name="name" value="${esc(s.name)}" required></div><div class="field"><label>شعار</label><input class="input" name="tagline" value="${esc(s.tagline || '')}"></div>
    <div class="field"><label>رنگ سازمانی</label><input class="input" type="color" name="color" aria-label="رنگ" value="${esc(s.color)}"></div><div class="field"><label>حداقل مطالعه روزانه (دقیقه)</label><input class="input" type="number" name="min_daily_study" value="${s.min_daily_study}" min="10" max="300"></div>
    <div class="field"><label>شماره کارت (۱۶ رقم)</label><input class="input ltr" name="card_number" value="${esc(s.card_number || '')}" inputmode="numeric"></div><div class="field"><label>نام صاحب حساب</label><input class="input" name="card_holder" value="${esc(s.card_holder || '')}"></div></div>
    <div class="field"><label>درباره کانون (صفحه عمومی)</label><textarea class="input" name="about">${esc(s.about || '')}</textarea></div><div class="field"><label>لوگوی جدید (PNG/JPG تا ۱ مگابایت)</label><input class="input" type="file" name="logo" aria-label="لوگوی جدید" accept="image/png,image/jpeg,image/webp"></div><button class="btn" style="align-self:flex-start">${icon('check', { size: 16 })} ذخیره تنظیمات</button></form>
    <div class="card center"><div class="brand-logo" style="width:120px;height:120px;border-radius:34px;font-size:60px;margin:0 auto">${logoHtml(s.logo)}</div><h3 style="margin-top:12px">${esc(s.name)}</h3><div class="small muted">${esc(s.tagline || '')}</div><div class="tiny muted" style="margin-top:8px">شناسه صفحه عمومی: <code>${esc(s.slug)}</code></div></div></div>`;
  $('#sf', el).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { const f = e.target; await put('/api/manager/settings', { ...formData(f), card_number: en(f.card_number.value), logo: await fileToData(f.logo.files[0], 1) }); toast('تنظیمات ذخیره شد', 'ok'); window.roshdRefresh(); }); };
}

export const routes = [
  { path: '/home', view: home },
  { path: '/counselors', view: counselors },
  { path: '/students', view: students },
  { path: '/staff', view: staff },
  { path: '/timetable', view: managerTimetable },
  { path: '/fees', view: fees },
  { path: '/announcements', view: announcements },
  { path: '/accounting', view: accounting },
  { path: '/invoices', view: L.mgrInvoices },
  { path: '/sms-outbox', view: L.smsOutbox },
  { path: '/barpa', view: L.mgrBarpa },
  { path: '/barpa/:id', view: L.barpaView },
  { path: '/hoosh-studio', view: L.hooshStudio },
  { path: '/manual-scores', view: L.mgrScores },
  { path: '/att-log', view: L.attLog },
  { path: '/comprehensive', view: comprehensive },
  { path: '/comprehensive/:id', view: compDetail },
  { path: '/performance', view: performance },
  { path: '/shop', view: shopAdmin },
  { path: '/settings', view: settings },
  { path: '/messages', view: messagesView },
  { path: '/messages/:id', view: messagesView },
  { path: '/account', view: accountView },
];
