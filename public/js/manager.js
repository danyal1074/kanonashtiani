// پنل مدیر کانون
import * as L from './legacy.js';
import { api, post, put, del, esc, fa, num, money, pct, $, $$, on, toast, busy, modal, confirmBox, setHead, avatar, nameAvatar, progress, empty, jdate, jtime, jshort,
  subjIcon, gradeName, dateField, readDate, fileToData, barChart, lineChart, donut, WEEKDAYS, addDays, formData, state, en, logoHtml, timeAgo, printOverlay, icon, hasIcon, JMONTHS } from './core.js';
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

function downloadCsv(filename, headers, rows) {
  const escCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escCsv).join(','), ...rows.map((r) => r.map(escCsv).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// ================= داشبورد =================
const isNewLook = () => document.body.classList.contains('look-new');
async function home(el, p, me) {
  if (!isNewLook()) return homeClassic(el, p, me);
  const { adminHome } = await import('./admin-dashboard.js');
  return adminHome(el, p, me);
}

// ================= دانش‌آموزان =================
// «حذف همه» با تأیید تایپی؛ برای هر بخش جداگانه
async function deleteAll(what, label, after, note = '') {
  await modal({
    title: `حذف همهٔ ${label}`,
    body: `<p class="small" style="margin-top:0;line-height:2">همهٔ ${label} این کانون <b>برای همیشه</b> حذف می‌شود و قابل بازگشت نیست. ${note}</p><div class="field"><label for="dAllWord">برای تأیید، کلمهٔ «حذف» را بنویسید</label><input class="input" id="dAllWord" autocomplete="off"></div>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'حذف همه', cls: 'red', onClick: async (m) => {
      if ($('#dAllWord', m).value.trim() !== 'حذف') { toast('برای تأیید، کلمهٔ «حذف» را بنویسید', 'err'); return false; }
      const r = await post('/api/manager/bulk-delete', { what, confirm: true });
      metaCache = null; toast(`${fa(r.deleted)} مورد حذف شد`, 'ok'); after?.();
    } }],
  });
}

// خواندن فایل ثبت‌نام گروهی: xlsx به‌صورت base64، CSV به‌صورت متن (UTF-8 یا ویندوز-۱۲۵۶)
async function readImportFile(f) {
  if (/\.xls$/i.test(f.name)) throw new Error('فایل قدیمی .xls پشتیبانی نمی‌شود؛ در اکسل «Save As ← Excel Workbook (.xlsx)» یا CSV را بزنید');
  if (/\.xlsx$/i.test(f.name)) {
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { xlsx_b64: btoa(bin) };
  }
  const bytes = await f.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('�')) text = new TextDecoder('windows-1256').decode(bytes);
  return { csv: text };
}

function studentForm(m, s = {}) {
  const curSchool = s.school || '';
  const knownSchools = [...new Set([...(m.schools || [])])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fa'));
  const isCustom = curSchool && !knownSchools.includes(curSchool);
  return `<form class="stack" id="stForm"><div class="form-grid">
    <div class="field"><label>نام و نام خانوادگی *</label><input class="input" name="full_name" value="${esc(s.full_name || '')}" required></div>
    <div class="field"><label>کد ملی ۱۰ رقمی *</label><input class="input ltr" name="national_code" value="${esc(s.national_code || '')}" maxlength="10" inputmode="numeric" required></div>
    <div class="field"><label>جنسیت</label><select class="input" name="gender"><option value="m" ${s.gender !== 'f' ? 'selected' : ''}>پسر</option><option value="f" ${s.gender === 'f' ? 'selected' : ''}>دختر</option></select></div>
    <div class="field"><label>مدرسه</label>
      <select class="input" name="school_sel" id="stSchoolSel">
        <option value="">-- بدون انتخاب / نامشخص --</option>
        ${knownSchools.map((x) => `<option value="${esc(x)}" ${x === curSchool ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        <option value="__new__" ${isCustom ? 'selected' : ''}>➕ سایر / افزودن مدرسه جدید...</option>
      </select>
      <input class="input" name="school_new" id="stSchoolNew" value="${isCustom ? esc(curSchool) : ''}" placeholder="نام مدرسه جدید را بنویسید" style="${isCustom ? 'margin-top:6px' : 'display:none;margin-top:6px'}" maxlength="100">
    </div>
    <div class="field"><label>پایه *</label><select class="input" name="grade" id="stGrade">${m.grades.map((g) => `<option value="${g}" ${s.grade === g ? 'selected' : ''}>${gradeName(g)}</option>`).join('')}</select></div>
    <div class="field"><label>کلاس</label><select class="input" name="class_id" id="stClass"></select></div>
    <div class="field"><label>تاریخ تولد</label>${dateField('birth', s.birth_date, { minYear: 1385, maxYear: 1400 })}</div>
    <div class="field"><label>موبایل (اختیاری، فقط برای پیامک)</label><input class="input ltr" name="parent_phone" value="${esc(s.parent_phone || '')}" maxlength="11" inputmode="tel" placeholder="09xxxxxxxxx"></div></div>
    <div class="field"><label>نشانی منزل</label><textarea class="input" name="address" style="min-height:60px">${esc(s.address || '')}</textarea></div></form>`;
}
function bindStudentForm(m, md, s = {}) {
  const drawCls = () => { const g = Number($('#stGrade', m).value); $('#stClass', m).innerHTML = md.classes.filter((c) => c.grade === g).map((c) => `<option value="${c.id}" ${s.class_id === c.id ? 'selected' : ''}>کلاس ${esc(c.name)} (${fa(c.students)} نفر)</option>`).join(''); };
  drawCls(); $('#stGrade', m).onchange = drawCls;
  const sel = $('#stSchoolSel', m), inp = $('#stSchoolNew', m);
  if (sel && inp) {
    sel.onchange = () => {
      const isNew = sel.value === '__new__';
      inp.style.display = isNew ? '' : 'none';
      if (isNew) inp.focus();
    };
  }
}
const readStudent = (m) => {
  const f = $('#stForm', m);
  const d = formData(f);
  const school = f.school_sel ? (f.school_sel.value === '__new__' ? (f.school_new?.value || '').trim() : f.school_sel.value) : (d.school || '');
  return {
    ...d,
    school,
    national_code: en(f.querySelector('[name=national_code]')?.value || ''),
    parent_phone: en(f.querySelector('[name=parent_phone]')?.value || ''),
    birth_date: readDate(m, 'birth'),
  };
};

async function students(el) {
  let md = await meta();
  const hq = new URLSearchParams(location.hash.split('?')[1] || '');
  const q = { q: hq.get('q') || '', grade: '', class_id: '', school: '', gender: '', pay: '', offset: 0 };
  const PAGE = 30;
  let rows = [], total = 0, allResults = false, curPeriod = '', prevPeriod = '';
  const sel = new Set();
  setHead('دانش‌آموزان', 'جست‌وجو، فیلتر و مدیریت ثبت‌نام‌ها', `<button class="btn sm" id="addSt">${icon('user-plus', { size: 16 })} ثبت دانش‌آموز</button> <button class="btn ghost sm" id="importSt">${icon('upload', { size: 16 })} ثبت‌نام گروهی</button> <details class="ad-dd"><summary class="btn ghost sm" aria-label="امکانات بیشتر">${icon('more', { size: 17 })}</summary><div class="ad-dd-menu"><button type="button" id="exportStCsv">${icon('download', { size: 16 })} خروجی اکسل (CSV)</button><button type="button" id="printStList">${icon('printer', { size: 16 })} چاپ فهرست دانش‌آموزان</button><button type="button" id="printCreds">${icon('printer', { size: 16 })} چاپ کارت‌های ورود</button><button type="button" id="classesSt">${icon('layers', { size: 16 })} مدیریت کلاس‌ها</button><button type="button" id="syncClassroom">${icon('refresh', { size: 16 })} همگام‌سازی کلاس آنلاین</button><button type="button" id="delAllSt" class="danger">${icon('trash', { size: 16 })} حذف همهٔ دانش‌آموزان…</button></div></details>`);
  el.innerHTML = `<div class="ad-toolbar" role="search">
      <label class="ad-searchbox"><span class="si">${icon('search', { size: 17 })}</span><input class="input" id="q" type="search" placeholder="جست‌وجوی نام یا کد ملی…" value="${esc(q.q)}" aria-label="جست‌وجوی دانش‌آموز" autocomplete="off"></label>
      <select class="input ad-f" id="fg" aria-label="پایه"><option value="">همهٔ پایه‌ها</option>${md.grades.map((g) => `<option value="${g}">پایه ${gradeName(g)}</option>`).join('')}</select>
      <select class="input ad-f" id="fc" aria-label="کلاس"><option value="">همهٔ کلاس‌ها</option></select>
      <select class="input ad-f" id="fpay" aria-label="وضعیت پرداخت"><option value="">همهٔ وضعیت‌های پرداخت</option><option value="paid">پرداخت‌شده (ماه جاری)</option><option value="pending">در انتظار تأیید</option><option value="unpaid">پرداخت‌نشده (ماه جاری)</option><option value="prev_unpaid">طلبکار از ماه قبل</option></select>
      <select class="input ad-f" id="fgender" aria-label="جنسیت"><option value="">همهٔ جنسیت‌ها</option><option value="m">پسر</option><option value="f">دختر</option></select>
      <select class="input ad-f" id="fs" aria-label="مدرسه"><option value="">همهٔ مدارس</option>${md.schools.map((x) => `<option>${esc(x)}</option>`).join('')}</select>
      <button class="btn ghost sm" id="clearF" type="button" hidden>${icon('x', { size: 14 })} پاک‌کردن فیلترها</button></div>
    <div class="card ad-tablecard">
      <div class="ad-th"><b id="total">…</b><span class="small muted" id="rangeInfo"></span></div>
      <div class="ad-bulk" id="bulkBar" hidden role="region" aria-label="عملیات گروهی"><span id="bulkInfo"></span>
        <button class="btn sm soft" id="selectAllRes" type="button" hidden></button>
        <span class="grow"></span><button class="btn sm green" data-bulk="paid">${icon('check-circle', { size: 15 })} ثبت پرداخت</button><button class="btn sm ghost" data-bulk="unpaid">لغو پرداخت</button><button class="btn sm ghost" data-bulk="move">انتقال به کلاس…</button><button class="btn sm red" data-bulk="delete">${icon('trash', { size: 15 })} حذف…</button><button class="btn sm ghost" id="bulkClear" type="button">لغو انتخاب</button></div>
      <div class="table-wrap"><table class="table ad-cards"><thead><tr><th style="width:38px"><input type="checkbox" id="selAll" aria-label="انتخاب همهٔ ردیف‌های این صفحه"></th><th>دانش‌آموز</th><th>پایه و کلاس</th><th>موبایل والدین</th><th>حق عضویت</th><th><span class="sr-only">عملیات</span></th></tr></thead><tbody id="tb"></tbody></table></div>
      <div class="ad-pager" id="pager"></div></div>`;
  const fillClasses = () => { $('#fc', el).innerHTML = `<option value="">همه کلاس‌ها</option>${md.classes.filter((c) => !q.grade || c.grade === Number(q.grade)).map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}`; };
  fillClasses();
  const rowHtml = (s) => `<tr><td class="ad-sel"><input type="checkbox" data-sel="${s.id}" ${sel.has(s.id) || allResults ? 'checked' : ''} aria-label="انتخاب ${esc(s.full_name)}"></td>
    <td class="ad-first"><button type="button" class="ad-student ad-link" data-view="${s.id}" aria-label="پروفایل ${esc(s.full_name)}">${nameAvatar(s.full_name)}<span><b>${esc(s.full_name)}</b><small class="num">${fa(s.national_code)}</small></span></button></td>
    <td data-l="پایه و کلاس">${gradeName(s.grade)} · ${esc(s.class_name || '—')}</td><td data-l="موبایل والدین" class="num">${s.parent_phone ? fa(s.parent_phone) : '—'}</td>
    <td data-l="حق عضویت"><span class="badge ${PAY[s.pay][1]}">${PAY[s.pay][0]}</span>${s.prev_unpaid ? `<div style="margin-top:3px"><span class="badge orange" style="font-size:10px">طلب ماه قبل (${esc((prevPeriod || 'ماه قبل').split(' ')[0])})</span></div>` : ''}</td>
    <td class="ad-act"><div class="row" style="gap:4px;justify-content:flex-end;align-items:center"><button class="btn sm soft" data-pay-fee="${s.id}" title="پرداخت شهریه و سوابق" style="padding:3px 10px;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0">${icon('banknote', { size: 15 })} پرداخت شهریه</button><button class="icon-btn" data-view="${s.id}" title="پروفایل" aria-label="پروفایل">${icon('eye', { size: 17 })}</button><button class="icon-btn" data-imp="${s.id}" title="ورود به پنل دانش‌آموز" aria-label="ورود به پنل دانش‌آموز">${icon('user-check', { size: 17 })}</button><button class="icon-btn" data-edit="${s.id}" title="ویرایش" aria-label="ویرایش">${icon('edit', { size: 17 })}</button><button class="icon-btn" data-sms="${s.id}" title="پیامک" aria-label="ارسال پیامک">${icon('message', { size: 17 })}</button><button class="icon-btn" data-del="${s.id}" title="حذف" aria-label="حذف" style="color:var(--red)">${icon('trash', { size: 17 })}</button></div></td></tr>`;
  let seq = 0;
  const load = async () => {
    const my = ++seq;
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: PAGE })}`);
    if (my !== seq) return;
    rows = r.rows; total = r.total;
    if (r.current_period) curPeriod = r.current_period;
    if (r.prev_period) prevPeriod = r.prev_period;
    $('#tb', el).innerHTML = rows.map(rowHtml).join('') || `<tr><td colspan="6">${empty('search', 'دانش‌آموزی با این مشخصات پیدا نشد')}</td></tr>`;
    $('#total', el).textContent = `${fa(total)} دانش‌آموز`;
    const pages = Math.max(1, Math.ceil(total / PAGE)), page = Math.floor(q.offset / PAGE) + 1;
    $('#rangeInfo', el).textContent = total ? `نمایش ${fa(q.offset + 1)} تا ${fa(q.offset + rows.length)}` : '';
    $('#pager', el).innerHTML = total > PAGE ? `<span>صفحهٔ ${fa(page)} از ${fa(pages)}</span><span class="row" style="gap:6px"><button class="btn ghost sm" data-page="${page - 2}" ${page <= 1 ? 'disabled' : ''}>${icon('chevron-right', { size: 15 })} قبلی</button><button class="btn ghost sm" data-page="${page}" ${page >= pages ? 'disabled' : ''}>بعدی ${icon('chevron-left', { size: 15 })}</button></span>` : '';
    $('#selAll', el).checked = rows.length > 0 && rows.every((x) => sel.has(x.id));
    $('#clearF', el).hidden = !(q.q || q.grade || q.class_id || q.school || q.gender || q.pay);
    bulkInfo();
  };
  let tmr;
  $('#q', el).oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { q.q = en(e.target.value.trim()); q.offset = 0; resetSel(); load(); }, 250); };
  $('#fg', el).onchange = (e) => { q.grade = e.target.value; q.class_id = ''; q.offset = 0; fillClasses(); resetSel(); load(); };
  $('#fc', el).onchange = (e) => { q.class_id = e.target.value; q.offset = 0; resetSel(); load(); };
  $('#fs', el).onchange = (e) => { q.school = e.target.value; q.offset = 0; resetSel(); load(); };
  $('#fgender', el).onchange = (e) => { q.gender = e.target.value; q.offset = 0; resetSel(); load(); };
  $('#fpay', el).onchange = (e) => { q.pay = e.target.value; resetSel(); q.offset = 0; load(); };
  $('#clearF', el).onclick = () => { Object.assign(q, { q: '', grade: '', class_id: '', school: '', gender: '', pay: '', offset: 0 }); $('#q', el).value = ''; ['fg', 'fc', 'fpay', 'fgender', 'fs'].forEach((id) => { $('#' + id, el).value = ''; }); fillClasses(); resetSel(); load(); };
  on(el, 'click', '[data-page]', (e, b) => { q.offset = Math.max(0, Number(b.dataset.page)) * PAGE; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  load().then(() => { if (hq.get('new')) $('#addSt').click(); });

  // ----- انتخاب و عملیات گروهی: فقط روی افراد صریحاً انتخاب‌شده (یا «همهٔ نتایج فیلتر» که کاربر خودش انتخاب می‌کند) -----
  const filterObj = () => ({ q: q.q, grade: q.grade, class_id: q.class_id, school: q.school, gender: q.gender, pay: q.pay });
  const target = () => (allResults ? { filter: filterObj() } : { ids: [...sel] });
  const count = () => (allResults ? total : sel.size);
  const hasFilter = () => !!(q.q || q.grade || q.class_id || q.school || q.gender || q.pay);
  const targetLabel = () => (allResults ? (hasFilter() ? `همهٔ ${fa(total)} دانش‌آموزِ نتیجهٔ فیلتر` : `همهٔ ${fa(total)} دانش‌آموز کانون`) : `${fa(sel.size)} دانش‌آموز انتخاب‌شده`);
  function resetSel() { sel.clear(); allResults = false; }
  function bulkInfo() {
    const bar = $('#bulkBar', el), has = sel.size > 0 || allResults;
    bar.hidden = !has;
    $('#bulkInfo', el).innerHTML = has ? `<b>${targetLabel()}</b>` : '';
    const all = $('#selectAllRes', el), pageAll = rows.length > 0 && rows.every((x) => sel.has(x.id));
    all.hidden = !(pageAll && total > rows.length && !allResults);
    all.textContent = `انتخاب همهٔ ${fa(total)} نتیجه`;
  }
  on(el, 'change', '[data-sel]', (e, b) => { const id = Number(b.dataset.sel); allResults = false; if (b.checked) sel.add(id); else sel.delete(id); $('#selAll', el).checked = rows.every((x) => sel.has(x.id)); bulkInfo(); });
  $('#selAll', el).onchange = (e) => { allResults = false; $$('[data-sel]', el).forEach((b) => { b.checked = e.target.checked; const id = Number(b.dataset.sel); if (b.checked) sel.add(id); else sel.delete(id); }); bulkInfo(); };
  $('#selectAllRes', el).onclick = () => { allResults = true; bulkInfo(); };
  $('#bulkClear', el).onclick = () => { resetSel(); $$('[data-sel]', el).forEach((b) => { b.checked = false; }); $('#selAll', el).checked = false; bulkInfo(); };
  const afterBulk = () => { resetSel(); metaCache = null; load(); };
  on(el, 'click', '[data-bulk]', async (e, b) => {
    if (!count()) { toast('ابتدا دانش‌آموزان را انتخاب کنید'); return; }
    const kind = b.dataset.bulk, label = targetLabel();
    if (kind === 'paid' || kind === 'unpaid') {
      const paid = kind === 'paid';
      if (!(await confirmBox(paid ? `حق عضویت ${label} «پرداخت‌شده» ثبت شود؟ درآمد آن در حسابداری هم ثبت می‌شود و در پنل دانش‌آموز «پرداخت شده» دیده می‌شود.` : `پرداخت حق عضویت ${label} لغو شود؟ برای هر مورد سند اصلاحی در حسابداری ثبت می‌شود.`, paid ? 'ثبت پرداخت' : 'لغو پرداخت'))) return;
      const r = await post('/api/manager/students/fee-paid', { ...target(), paid });
      toast(paid ? `${fa(r.changed)} نفر پرداخت‌شده شد${r.already ? ` (${fa(r.already)} نفر از قبل پرداخت‌شده بودند)` : ''}${r.unset ? ` — برای ${fa(r.unset)} نفر مبلغ پایه هنوز تعیین نشده؛ بعد از تعیین مبلغ در «حق عضویت»، حسابداری خودکار کامل می‌شود` : ''}` : `پرداخت ${fa(r.changed)} نفر لغو شد`, 'ok', 7000);
      afterBulk();
    } else if (kind === 'move') {
      await modal({ title: `انتقال ${label} به کلاس`, body: `<div class="field"><label for="mvCls">کلاس مقصد (پایهٔ دانش‌آموز هم متناسب با کلاس تغییر می‌کند)</label><select class="input" id="mvCls">${md.classes.map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)} (${fa(c.students)} نفر)</option>`).join('')}</select></div>`,
        actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'انتقال', onClick: async (m) => { const r = await post('/api/manager/students/move', { ...target(), class_id: Number($('#mvCls', m).value) }); toast(`${fa(r.moved)} نفر منتقل شد`, 'ok'); afterBulk(); } }] });
    } else if (kind === 'delete') {
      await modal({ title: `حذف ${label}`, body: `<p class="small" style="margin-top:0;line-height:2">${label} با همهٔ سوابقشان (امتیاز، آزمون، پرداخت) <b>برای همیشه</b> حذف می‌شوند. اسناد حسابداری باقی می‌ماند.</p><div class="field"><label for="dsWord">برای تأیید، کلمهٔ «حذف» را بنویسید</label><input class="input" id="dsWord" autocomplete="off"></div>`,
        actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'حذف', cls: 'red', onClick: async (m) => {
          if ($('#dsWord', m).value.trim() !== 'حذف') { toast('برای تأیید، کلمهٔ «حذف» را بنویسید', 'err'); return false; }
          const r = await post('/api/manager/students/delete', { ...target(), confirm: true }); toast(`${fa(r.deleted)} دانش‌آموز حذف شد`, 'ok'); afterBulk();
        } }] });
    }
  });
  const openPayFeeModal = async (sid) => {
    const s = rows.find((x) => x.id === sid);
    if (!s) return;
    const det = await api(`/api/manager/students/${sid}`).catch(() => ({ fee: {} }));
    const fee = det.fee || {};
    const pays = fee.payments || [];
    const curPer = fee.current_period || curPeriod || 'ماه جاری';
    const prevPer = fee.prev_period || prevPeriod || 'ماه قبل';
    const isPaid = s.pay === 'paid';
    const defaultPer = s.prev_unpaid ? prevPer : curPer;
    const pBadge = { approved: ['تأییدشده', 'green'], pending: ['در انتظار', 'orange'], rejected: ['ردشده', 'red'], reversed: ['لغوشده', 'gray'] };
    modal({
      title: `پرداخت شهریه — ${esc(s.full_name)}`,
      wide: true,
      body: `<form id="payFeeForm" class="stack">
        <div class="row between" style="padding:10px;background:var(--bg-card,#f4f8fd);border:1px solid var(--line,#d5e3f4);border-radius:12px;margin-bottom:8px">
          <div>
            <b>${esc(s.full_name)}</b>
            <div class="tiny muted">کد ملی: ${fa(s.national_code)} · پایه ${gradeName(s.grade)} ${esc(s.class_name || '')}</div>
          </div>
          <div style="text-align:left">
            <span class="badge ${PAY[s.pay][1]}">${esc(curPer)}: ${PAY[s.pay][0]}</span>
            ${s.prev_unpaid ? `<div style="margin-top:4px"><span class="badge orange">طلبکار از ${esc(prevPer)}</span></div>` : ''}
          </div>
        </div>
        ${s.prev_unpaid ? `<div class="card flat" style="padding:8px 12px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-size:12px">این دانش‌آموز هنوز شهریه ماه قبل (<b>${esc(prevPer)}</b>) را پرداخت نکرده است.</div>` : ''}
        <div class="field">
          <label for="pfPeriod">بابت دوره / ماه</label>
          <div class="row wrap" style="gap:6px;margin-bottom:6px">
            <button type="button" class="btn sm soft" data-set-per="${esc(curPer)}">${esc(curPer)} (ماه جاری)</button>
            ${prevPer ? `<button type="button" class="btn sm soft" data-set-per="${esc(prevPer)}">${esc(prevPer)} (ماه قبل)</button>` : ''}
            <button type="button" class="btn sm soft" data-set-per="کل سال">کل سال</button>
          </div>
          <input class="input" id="pfPeriod" name="period" value="${esc(defaultPer)}" placeholder="مثلاً: آذر ۱۴۰۵، آبان ۱۴۰۵، یا کل سال">
        </div>
        <div class="form-grid">
          <div class="field"><label for="pfMethod">روش پرداخت</label><select class="input" id="pfMethod" name="method"><option value="card">کارت‌به‌کارت / انتقال بانکی</option><option value="cash">نقدی</option><option value="pos">دستگاه پوز کانون</option><option value="buffet">بوفه کانون</option></select></div>
          <div class="field"><label for="pfNote">شماره پیگیری / یادداشت</label><input class="input" id="pfNote" name="note" placeholder="اختیاری"></div>
        </div>
        <div style="margin-top:8px">
          <b class="small">سوابق پرداخت شهریه ثبت‌شده (${fa(pays.length)} مورد):</b>
          <div class="table-wrap" style="max-height:180px;overflow-y:auto;margin-top:6px">
            <table class="table"><thead><tr><th>دوره/ماه</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th></tr></thead><tbody>
              ${pays.map((p) => `<tr><td>${esc(p.period || '—')}</td><td class="num">${p.amount ? money(p.amount) : 'ثبت‌شده'}</td><td><span class="badge ${(pBadge[p.status] || ['—', 'gray'])[1]}">${(pBadge[p.status] || [p.status])[0]}</span></td><td class="tiny">${jdate(p.reviewed_at || p.created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="center muted small">هنوز پرداختی ثبت نشده است</td></tr>'}
            </tbody></table>
          </div>
        </div>
      </form>`,
      onOpen: (m) => {
        on(m, 'click', '[data-set-per]', (ev, bt) => { $('#pfPeriod', m).value = bt.dataset.setPer; });
      },
      actions: [
        ...(isPaid ? [{
          label: 'لغو پرداخت ماه جاری',
          cls: 'danger soft',
          onClick: async () => {
            if (!confirm(`آیا پرداخت شهریه «${esc(s.full_name)}» لغو شود؟`)) return false;
            await post('/api/manager/students/fee-paid', { ids: [s.id], paid: false });
            toast('پرداخت شهریه لغو شد', 'ok');
            load();
            return true;
          }
        }] : []),
        { label: 'انصراف', cls: 'ghost', value: false },
        {
          label: 'تأیید و ثبت پرداخت شهریه',
          cls: 'green',
          onClick: async (m) => {
            const period = $('#pfPeriod', m).value.trim() || curPer;
            await post('/api/manager/students/fee-paid', { ids: [s.id], paid: true, period });
            toast(`پرداخت شهریه (${period}) برای «${s.full_name}» ثبت شد`, 'ok');
            load();
            return true;
          }
        }
      ]
    });
  };
  on(el, 'click', '[data-pay-fee]', (e, b) => openPayFeeModal(Number(b.dataset.payFee)));
  on(el, 'click', '[data-paid]', (e, b) => busy(b, async () => {
    const s = rows.find((x) => x.id === Number(b.dataset.paid)), paid = s.pay !== 'paid';
    if (!paid && !(await confirmBox(`پرداخت حق عضویت «${esc(s.full_name)}» لغو شود؟ سند اصلاحی ثبت می‌شود.`, 'لغو پرداخت'))) return;
    const r = await post('/api/manager/students/fee-paid', { ids: [s.id], paid });
    toast(paid ? (r.unset ? 'پرداخت‌شده ثبت شد؛ مبلغ پایه هنوز تعیین نشده (بعداً در حسابداری کامل می‌شود)' : 'حق عضویت پرداخت‌شده ثبت شد و در حسابداری آمد') : 'پرداخت لغو شد', 'ok', 5000);
    load();
  }));
  if ($('#exportStCsv')) $('#exportStCsv').onclick = async () => {
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: 100, offset: 0 })}`);
    if (!r.rows.length) return toast('دانش‌آموزی برای خروجی نیست', 'err');
    downloadCsv(`students-${curPeriod || 'list'}.csv`,
      ['نام و نام خانوادگی', 'کد ملی', 'پایه', 'کلاس', 'مدرسه', 'موبایل والدین', 'وضعیت ماه جاری', 'طلب ماه قبل'],
      r.rows.map((s) => [s.full_name, s.national_code, gradeName(s.grade), s.class_name || '', s.school || '', s.parent_phone || '', PAY[s.pay]?.[0] || s.pay, s.prev_unpaid ? 'بله' : 'خیر']));
    toast('فایل اکسل (CSV) آماده شد', 'ok');
  };
  if ($('#printStList')) $('#printStList').onclick = async () => {
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: 100, offset: 0 })}`);
    if (!r.rows.length) return toast('دانش‌آموزی برای چاپ نیست', 'err');
    printOverlay(`<h2 style="margin:0 0 12px">فهرست دانش‌آموزان (${fa(r.rows.length)} نفر)</h2>
      <table class="table" style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>ردیف</th><th>نام و نام خانوادگی</th><th>کد ملی</th><th>پایه و کلاس</th><th>موبایل</th><th>وضعیت شهریه</th></tr></thead>
      <tbody>${r.rows.map((s, i) => `<tr><td>${fa(i + 1)}</td><td>${esc(s.full_name)}</td><td>${fa(s.national_code)}</td><td>${gradeName(s.grade)} ${esc(s.class_name || '—')}</td><td>${fa(s.parent_phone || '—')}</td><td>${PAY[s.pay]?.[0] || s.pay}${s.prev_unpaid ? ' (طلب ماه قبل)' : ''}</td></tr>`).join('')}</tbody></table>`, 'فهرست دانش‌آموزان');
  };
  $('#syncClassroom').onclick = (e) => busy(e.currentTarget, async () => {
    const r = await post('/api/manager/classroom/sync');
    toast(`${fa(r.total)} دانش‌آموز با کلاس آنلاین همگام شد (جدید ${fa(r.created)}، به‌روز ${fa(r.updated)}${r.removed ? `، حذف‌شده ${fa(r.removed)}` : ''})`, 'ok', 6000);
  });
  $('#delAllSt').onclick = () => { sel.clear(); deleteStudentsAll(); };
  const deleteStudentsAll = () => modal({ title: 'حذف همهٔ دانش‌آموزان', body: `<p class="small" style="margin-top:0;line-height:2">همهٔ دانش‌آموزان این کانون با همهٔ سوابقشان <b>برای همیشه</b> حذف می‌شوند (فیلتر فعلی نادیده گرفته می‌شود). اسناد حسابداری باقی می‌ماند.</p><div class="field"><label for="daWord">برای تأیید، کلمهٔ «حذف» را بنویسید</label><input class="input" id="daWord" autocomplete="off"></div>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'حذف همه', cls: 'red', onClick: async (m) => {
      if ($('#daWord', m).value.trim() !== 'حذف') { toast('برای تأیید، کلمهٔ «حذف» را بنویسید', 'err'); return false; }
      const r = await post('/api/manager/students/delete', { all: true, confirm: true }); toast(`${fa(r.deleted)} دانش‌آموز حذف شد`, 'ok'); afterBulk();
    } }] });

  // ----- کلاس‌ها: چند کلاس برای هر پایه، تقسیم خودکار دانش‌آموزان -----
  $('#classesSt').onclick = () => {
    const body = () => `<div class="stack"><div class="row between wrap" style="gap:8px"><span class="small muted">تقسیم بر اساس جنسیت برای همهٔ پایه‌ها (کلاس‌های الف و ب در صورت نبودن ساخته می‌شوند)</span><button class="btn sm" data-gsplit="all">همهٔ پایه‌ها: پسر الف، دختر ب</button></div>${md.grades.map((g) => { const cl = md.classes.filter((c) => c.grade === g); return `<div class="card flat" style="padding:10px"><div class="row between wrap" style="gap:8px"><b>پایه ${gradeName(g)}</b><span class="row wrap" style="gap:6px"><input class="input" data-newname="${g}" placeholder="نام کلاس جدید (مثلاً ب)" style="width:170px" maxlength="30"><button class="btn sm" data-addcls="${g}">افزودن کلاس</button><button class="btn sm soft" data-gsplit="${g}">پسر الف، دختر ب</button>${cl.length > 1 ? `<button class="btn sm soft" data-dist="${g}">تقسیم خودکار بین ${fa(cl.length)} کلاس</button>` : ''}</span></div>
      <div class="row wrap" style="gap:6px;margin-top:8px">${cl.map((c) => `<span class="badge">${esc(c.name)} · ${fa(c.students)} نفر <button class="icon-btn" data-editcls="${c.id}" data-cname="${esc(c.name)}" data-cgrade="${c.grade}" aria-label="ویرایش نام کلاس ${esc(c.name)}">${icon('edit', { size: 13 })}</button>${c.students ? '' : ` <button class="icon-btn" data-delcls="${c.id}" aria-label="حذف کلاس ${esc(c.name)}">${icon('trash', { size: 14 })}</button>`}</span>`).join('') || '<span class="small muted">کلاسی نیست</span>'}</div></div>`; }).join('')}
      <p class="small muted" style="margin:0;line-height:2">برای هر پایه چند کلاس بسازید، سپس «تقسیم خودکار» دانش‌آموزان را بین کلاس‌ها پخش می‌کند. برای جابه‌جایی دلخواه، در فهرست دانش‌آموزان چند نفر را تیک بزنید و «انتقال به کلاس» را بزنید.</p></div>`;
    modal({ title: 'کلاس‌های هر پایه', wide: true, body: `<div id="clsBody">${body()}</div>`, actions: [{ label: 'بستن', value: true }], onOpen: (m) => {
      const redraw = async () => { metaCache = null; md = await meta(); $('#clsBody', m).innerHTML = body(); fillClasses(); load(); };
      on(m, 'click', '[data-addcls]', (ev, b) => busy(b, async () => {
        const g = Number(b.dataset.addcls), name = $(`[data-newname="${g}"]`, m).value.trim();
        if (!name) { toast('نام کلاس را بنویسید'); return; }
        await post('/api/manager/classes', { grade: g, name }); toast('کلاس ساخته شد', 'ok'); await redraw();
      }));
      on(m, 'click', '[data-delcls]', (ev, b) => busy(b, async () => { await del(`/api/manager/classes/${b.dataset.delcls}`); toast('کلاس حذف شد', 'ok'); await redraw(); }));
      on(m, 'click', '[data-editcls]', (ev, b) => {
        const cid = b.dataset.editcls, oldName = b.dataset.cname || '', grade = Number(b.dataset.cgrade);
        modal({ title: 'ویرایش نام کلاس', body: `<div class="field"><label for="edClsN">نام جدید کلاس (پایه ${gradeName(grade)})</label><input class="input" id="edClsN" value="${esc(oldName)}" maxlength="30" required></div>`,
          actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره', onClick: async (em) => {
            const name = $('#edClsN', em).value.trim(); if (!name) { toast('نام کلاس را بنویسید'); return false; }
            await put(`/api/manager/classes/${cid}`, { name, grade }); toast('نام کلاس ویرایش شد', 'ok'); await redraw();
          } }] });
      });
      on(m, 'click', '[data-gsplit]', (ev, b) => busy(b, async () => {
        const g = b.dataset.gsplit, all_ = g === 'all';
        if (!(await confirmBox(`${all_ ? 'در همهٔ پایه‌ها' : `در پایهٔ ${gradeName(Number(g))}`} همهٔ پسرها به کلاس «الف» و همهٔ دخترها به کلاس «ب» منتقل شوند؟ کلاس فعلی دانش‌آموزان تغییر می‌کند.`, 'انتقال'))) return;
        const r = await post('/api/manager/classes/split-gender', all_ ? {} : { grade: Number(g) });
        toast(`${fa(r.boys)} پسر در «الف» و ${fa(r.girls)} دختر در «ب» قرار گرفتند${r.classes_created ? ` (${fa(r.classes_created)} کلاس تازه ساخته شد)` : ''}`, 'ok', 6000); await redraw();
      }));
      on(m, 'click', '[data-dist]', (ev, b) => busy(b, async () => {
        const g = Number(b.dataset.dist), cl = md.classes.filter((c) => c.grade === g);
        if (!(await confirmBox(`دانش‌آموزان پایهٔ ${gradeName(g)} به‌ترتیب حروف الفبا (دختر و پسر جداگانه) بین ${fa(cl.length)} کلاس پخش شوند؟ کلاس فعلی همهٔ آن‌ها تغییر می‌کند.`, 'تقسیم خودکار'))) return;
        const r = await post('/api/manager/classes/distribute', { grade: g, class_ids: cl.map((c) => c.id) }); toast(`${fa(r.moved)} نفر بین کلاس‌ها تقسیم شدند`, 'ok'); await redraw();
      }));
    } });
  };

  const save = async (m, id) => {
    const body = readStudent(m);
    if (id) { await put(`/api/manager/students/${id}`, body); toast('اطلاعات ذخیره شد', 'ok'); }
    else { const r = await post('/api/manager/students', body); await modal({ title: ' ثبت‌نام انجام شد', body: `<div class="stack small"><div>${icon('backpack', { size: 16 })} ${esc(r.credentials.student)}</div></div>`, actions: [{ label: 'باشه', value: true }] }); }
    metaCache = null; load();
  };
  $('#importSt').onclick = () => modal({
    title: 'ثبت‌نام گروهی از فایل اکسل یا CSV', wide: true,
    body: `<div class="stack"><p class="small muted" style="margin:0;line-height:2">هر فایل اکسل (xlsx) یا CSV را بدهید؛ سامانه ستون‌ها را خودش از روی عنوان و محتوا تشخیص می‌دهد (نام و نام خانوادگی در یک ستون، کد ملی، شماره تماس، پایه، جنسیت، کلاس، نام پدر و مادر، مدرسه، تاریخ تولد، نشانی، شهریه پرداخت‌شده و …) و پیش از ثبت نشانتان می‌دهد. فقط <b>نام و نام خانوادگی</b> و <b>کد ملی</b> لازم است؛ هر اطلاعات دیگری در فایل باشد در پروفایل ثبت می‌شود و جاهای خالی اجباری نیستند. نام کاربری و رمز اولیهٔ همه کد ملی است. اگر دانش‌آموزی قبلاً ثبت شده باشد دوباره ساخته نمی‌شود، ولی کلاس، وضعیت پرداخت و اطلاعات خالی‌اش با فایل به‌روز می‌شود.
      <a href="/samples/students-template.csv" download>دانلود فایل نمونه</a></p>
      <div class="field"><label for="csvFile">فایل اکسل یا CSV</label><input class="input" type="file" id="csvFile" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
      <div class="form-grid"><div class="field"><label for="impGrade">این فایل مربوط به کدام پایه است؟</label><select class="input" id="impGrade"><option value="">— از روی ستون پایهٔ فایل تشخیص بده</option>${md.grades.map((g) => `<option value="${g}">فقط پایهٔ ${gradeName(g)} (همهٔ ردیف‌ها در این پایه ثبت شوند)</option>`).join('')}</select></div>
        <div class="field"><label for="impGender">اگر جنسیت در فایل نیست یا خالی است</label><select class="input" id="impGender"><option value="">پسر (در گزارش هشدار داده می‌شود)</option><option value="f">دختر</option><option value="m">پسر</option></select></div>
        <div class="field"><label for="impMonth">اگر فایل ستون ماه‌ها دارد، پرداخت کدام ماه؟</label><select class="input" id="impMonth"><option value="">ماه جاری</option>${JMONTHS.map((m) => `<option>${m}</option>`).join('')}</select></div></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="impLenient"> <span class="small">کد ملی‌هایی که ارقام کنترلی‌شان درست نیست (اما ۱۰ رقم‌اند) هم ثبت شوند؛ با هشدار</span></label>
      <div id="csvOut" aria-live="polite"></div></div>`,
    actions: [{ label: 'بستن', cls: 'ghost', value: false },
      { label: 'بررسی بدون ثبت', cls: 'soft', onClick: (m) => runImport(m, true) },
      { label: 'ثبت دانش‌آموزان', onClick: (m) => runImport(m, false) }],
  });
  async function runImport(m, dry) {
    const f = $('#csvFile', m).files[0];
    if (!f) throw new Error('ابتدا فایل را انتخاب کنید');
    const r = await post('/api/manager/students/import', { ...(await readImportFile(f)), dry_run: dry, force_grade: $('#impGrade', m).value, default_gender: $('#impGender', m).value, fee_month: $('#impMonth', m).value, lenient_nc: $('#impLenient', m).checked });
    const bad = r.errors.filter((e) => !e.warning), warn = r.errors.filter((e) => e.warning);
    $('#csvOut', m).innerHTML = `<div class="stack" style="gap:var(--s-3)">
      <div class="table-wrap" style="max-height:200px"><table class="table"><thead><tr><th>ستون فایل</th><th>تشخیص سامانه</th><th></th></tr></thead><tbody>${r.mapping.map((x) => `<tr><td>${esc(x.header)}</td><td><b>${esc(x.label)}</b></td><td class="tiny muted">${x.how === 'header' ? 'از روی عنوان' : 'از روی محتوا'}</td></tr>`).join('')}</tbody></table></div>
      ${r.fee_month ? `<div class="tiny">ستون‌های ماه در فایل پیدا شد؛ وضعیت پرداخت از ستون <b>${esc(r.fee_month)}</b> خوانده شد.</div>` : ''}
      ${r.unmapped.length ? `<div class="tiny muted">ستون‌های نادیده‌گرفته‌شده: ${r.unmapped.map(esc).join('، ')}</div>` : ''}
      <div class="row wrap" style="gap:var(--s-2)"><span class="badge">${fa(r.total)} ردیف</span>
        <span class="badge green">${dry ? 'دانش‌آموز جدید' : 'ثبت‌شده'}: ${fa(dry ? r.valid : r.created)}</span>
        ${(dry ? r.will_update : r.updated) ? `<span class="badge blue">${dry ? 'موجود، قابل به‌روزرسانی' : 'به‌روزرسانی‌شده'}: ${fa(dry ? r.will_update : r.updated)}</span>` : ''}
        ${r.paid_in_file ? `<span class="badge green">شهریه پرداخت‌شده در فایل: ${fa(r.paid_in_file)}</span>` : ''}
        ${!dry && r.fee_paid_recorded ? `<span class="badge green">پرداخت ثبت‌شده: ${fa(r.fee_paid_recorded)}</span>` : ''}
        ${!dry && r.classes_created ? `<span class="badge gray">کلاس تازه: ${fa(r.classes_created)}</span>` : ''}
        ${bad.length ? `<span class="badge red">خطا: ${fa(bad.length)}</span>` : ''}</div>
      ${r.gender_guessed ? `<p class="small" style="margin:0;color:#c2410c">جنسیت ${fa(r.gender_guessed)} نفر در فایل نبود و «پسر» ثبت ${dry ? 'می‌شود' : 'شد'}. اگر دختر هستند، بالا «دختر» را انتخاب کنید یا ستون جنسیت را به فایل اضافه کنید.</p>` : ''}
      ${!dry && r.fee_paid_unset ? `<p class="small" style="margin:0;color:#c2410c">برای ${fa(r.fee_paid_unset)} نفر شهریه «پرداخت‌شده» ثبت شد ولی مبلغ حق عضویت پایه‌شان هنوز تعیین نشده. بعد از تعیین مبلغ در «حق عضویت»، مبلغ و سند حسابداری خودکار کامل می‌شود.</p>` : ''}
      ${r.errors.length ? `<div class="table-wrap" style="max-height:220px"><table class="table"><thead><tr><th>ردیف</th><th>نام</th><th>مشکل</th></tr></thead><tbody>${r.errors.slice(0, 150).map((e) => `<tr><td>${fa(e.line)}</td><td>${esc(e.name || '')}</td><td class="small">${e.warning ? 'هشدار: ' : ''}${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${dry ? (bad.length ? '<p class="small" style="margin:0">ردیف‌های دارای خطا ثبت نمی‌شوند؛ بقیه ثبت می‌شوند.</p>' : '<p class="small pos" style="margin:0">همه‌چیز درست است؛ «ثبت دانش‌آموزان» را بزنید.</p>') : '<p class="small" style="margin:0">نام کاربری و رمز اولیهٔ هر دانش‌آموز کد ملی خودش است. از «چاپ کارت‌های ورود» برگهٔ ورود را بگیرید.</p>'}</div>`;
    if (!dry) { metaCache = null; md = await meta(); fillClasses(); toast(`${fa(r.created)} دانش‌آموز ثبت و ${fa(r.updated)} نفر به‌روزرسانی شد`, 'ok'); load(); }
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
  on(el, 'click', '[data-imp]', (e, b) => busy(b, async () => { await post(`/api/manager/students/${b.dataset.imp}/impersonate`); location.hash = '#/home'; location.reload(); }));
  on(el, 'click', '[data-del]', async (e, b) => {
    const s = rows.find((x) => x.id === Number(b.dataset.del));
    if (await confirmBox(`«${esc(s.full_name)}» و همه سوابقش (امتیاز، آزمون، پرداخت) برای همیشه حذف شود؟`, 'حذف دانش‌آموز')) { await del(`/api/manager/students/${s.id}`); toast('حذف شد', 'ok'); metaCache = null; load(); }
  });
  let drawerKey = null, drawerOpener = null;
  const closeDrawer = () => { $('.ad-drawer-back')?.remove(); $('.ad-drawer')?.remove(); if (drawerKey) { document.removeEventListener('keydown', drawerKey); drawerKey = null; } drawerOpener?.focus?.(); drawerOpener = null; };
  on(el, 'click', '[data-view]', async (e, td) => {
    const s = rows.find((x) => x.id === Number(td.dataset.view)); if (!s) return;
    closeDrawer();
    drawerOpener = td;
    const back = document.createElement('div'); back.className = 'ad-drawer-back'; back.dataset.close = '1';
    const dr = document.createElement('aside'); dr.className = 'ad-drawer'; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true'); dr.setAttribute('aria-label', `پروفایل ${s.full_name}`);
    const kv = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
    dr.innerHTML = `<header><div class="ad-student">${nameAvatar(s.full_name)}<span><b>${esc(s.full_name)}</b><small>پایه ${gradeName(s.grade)} · کلاس ${esc(s.class_name || '—')}</small></span></div><button class="icon-btn" data-close aria-label="بستن">${icon('x', { size: 20 })}</button></header>
      <div class="body"><div class="ad-sec">اطلاعات</div><dl class="ad-kv">${kv('کد ملی', `<span class="num">${fa(s.national_code)}</span>`)}${kv('جنسیت', s.gender === 'f' ? 'دختر' : 'پسر')}${kv('مدرسه', esc(s.school || ''))}${kv('تاریخ تولد', s.birth_date ? jdate(s.birth_date, { year: true }) : '')}${kv('نام پدر', esc(s.father_name || ''))}${kv('نام مادر', esc(s.mother_name || ''))}${kv('موبایل والدین', s.parent_phone ? `<span class="num" dir="ltr">${fa(s.parent_phone)}</span>` : '')}${kv('شماره دوم', s.phone2 ? `<span class="num" dir="ltr">${fa(s.phone2)}</span>` : '')}${kv('نشانی', esc(s.address || ''))}</dl>
      <div class="ad-sec">حق عضویت</div><div class="row wrap" style="gap:8px"><span class="badge ${PAY[s.pay][1]}">${PAY[s.pay][0]}</span>${s.prev_unpaid ? '<span class="badge orange">طلب ماه قبل</span>' : ''}<button class="btn sm green" data-d="pay">${icon('banknote', { size: 14 })} پرداخت شهریه</button><a class="btn sm soft" href="#/invoices" onclick="document.querySelector('.ad-drawer-back')?.click()">${icon('receipt', { size: 14 })} صدور فاکتور</a></div>
      <div class="ad-sec">عملکرد</div><div id="drPerf"><div class="ad-skel" style="height:90px"></div></div></div>
      <footer><button class="btn sm" data-d="edit">${icon('edit', { size: 15 })} ویرایش</button><button class="btn sm ghost" data-d="sms">${icon('message', { size: 15 })} پیامک به والدین</button><span class="grow"></span><button class="btn sm ghost" data-d="del" style="color:var(--red)">${icon('trash', { size: 15 })} حذف</button></footer>`;
    document.body.append(back, dr);
    dr.querySelector('[data-close]').focus();
    drawerKey = (ev) => {
      if ($('.modal-back')) return; // وقتی مودال باز است فقط مودال می‌بندد
      if (ev.key === 'Escape') return closeDrawer();
      if (ev.key !== 'Tab') return;
      const f = [...dr.querySelectorAll('button:not([disabled]),a[href],input,select,textarea')].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', drawerKey);
    back.onclick = () => closeDrawer();
    dr.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-close]')) return closeDrawer();
      const b = ev.target.closest('[data-d]'); if (!b) return;
      closeDrawer();
      if (b.dataset.d === 'pay') return openPayFeeModal(s.id);
      $(`[data-${{ paid: 'paid', edit: 'edit', sms: 'sms', del: 'del' }[b.dataset.d]}="${s.id}"]`, el)?.click();
    });
    try { const d = await api(`/api/manager/students/${s.id}`); const box = $('#drPerf', dr); if (box) box.innerHTML = studentDetailHtml(d); } catch (err) { const box = $('#drPerf', dr); if (box) box.innerHTML = `<div class="ad-err">${esc(err.message)}</div>`; }
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
  setHead('معلمان، کلاس‌ها و برنامه هفتگی', `${fa(md.teachers.length)} معلم • ${fa(md.classes.length)} کلاس`, '<button class="btn sm" id="addT"> معلم جدید</button> <button class="btn soft sm" id="addC"> کلاس جدید</button> <details class="ad-dd"><summary class="btn ghost sm" aria-label="امکانات بیشتر">' + icon('more', { size: 17 }) + '</summary><div class="ad-dd-menu"><button type="button" id="delAllT" class="danger">' + icon('trash', { size: 16 }) + ' حذف همهٔ معلمان…</button><button type="button" id="delAllS" class="danger">' + icon('trash', { size: 16 }) + ' حذف همهٔ جلسات برنامه…</button><button type="button" id="delAllC" class="danger">' + icon('trash', { size: 16 }) + ' حذف کلاس‌های خالی…</button></div></details>');
  $('#delAllT').onclick = () => deleteAll('teachers', 'معلمان', () => staff(el), 'برنامهٔ کلاسی آن‌ها هم از معلم جدا می‌شود.');
  $('#delAllS').onclick = () => deleteAll('schedule', 'جلسات برنامهٔ هفتگی', () => staff(el));
  $('#delAllC').onclick = () => deleteAll('classes', 'کلاس‌های خالی', () => staff(el), '(فقط کلاس‌هایی که دانش‌آموز و جلسه ندارند)');
  let schedClass = md.classes[0]?.id;
  el.innerHTML = `<div class="grid c2"><div class="card"><div class="card-title"><span class="ib">${icon('board', { size: 18 })}</span>معلمان<input class="input sm more" id="tSearch" placeholder="جست‌وجوی معلم…" style="width:160px"></div><div class="list" id="tList">${md.teachers.map((t) => {
    const clsChips = t.classes ? String(t.classes).split('،').map((x) => `<span class="badge gray" style="font-size:10px;padding:1px 6px">${fa(esc(x.trim().replace(/:/g, ' · ')))}</span>`).join('') : '<span class="tiny muted">بدون کلاس</span>';
    return `<div class="list-item" data-tname="${esc(t.full_name)}" style="align-items:flex-start">${nameAvatar(t.full_name)}<div class="grow"><div class="row wrap" style="gap:6px"><b class="small">${esc(t.full_name)}</b><span class="tiny muted" dir="ltr">@${esc(t.username)}</span>${t.active ? '' : '<span class="badge red">غیرفعال</span>'}</div><div class="row wrap" style="gap:4px;margin-top:5px">${clsChips}</div></div><button class="btn sm ghost" data-et="${t.id}" aria-label="ویرایش معلم" title="ویرایش معلم">${icon('edit', { size: 16 })}</button><button class="icon-btn" data-delt="${t.id}" data-tname="${esc(t.full_name)}" aria-label="حذف معلم" title="حذف معلم" style="color:var(--red)">${icon('trash', { size: 15 })}</button></div>`;
  }).join('') || empty('users', 'هنوز معلمی ثبت نشده')}</div></div>
    <div class="card"><div class="card-title"><span class="ib">${icon('building', { size: 18 })}</span>کلاس‌ها</div><div class="grid c3">${md.classes.map((c) => `<div class="card flat center" style="padding:12px"><b>${gradeName(c.grade)} ${esc(c.name)}</b><div class="tiny muted">${fa(c.students)} نفر</div><div class="row center" style="gap:4px;margin-top:6px"><button class="btn ghost sm" data-ec="${c.id}" data-cname="${esc(c.name)}" data-cgrade="${c.grade}">${icon('edit', { size: 14 })} ویرایش</button>${c.students ? '' : `<button class="btn ghost sm" data-dc="${c.id}">حذف</button>`}</div></div>`).join('')}</div></div></div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('calendar', { size: 18 })}</span>برنامه هفتگی کلاس<span class="row wrap more" style="gap:8px"><a class="btn sm soft" href="#/timetable">${icon('calendar', { size: 15 })} جدول کل کانون (درگ و دراپ)</a><button type="button" class="btn sm soft" id="schedPhoto">${icon('camera', { size: 16 })} ثبت از روی عکس برنامه</button><select class="input" id="schedSel" style="width:auto">${md.classes.map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}</select><button type="button" class="btn sm ghost" id="schedNewClass" title="افزودن کلاس جدید">${icon('plus', { size: 15 })} کلاس جدید</button></span></div><div id="sched"></div></div>`;
  $('#tSearch', el).oninput = (e) => { const v = e.target.value.trim(); $$('#tList [data-tname]', el).forEach((row) => { row.style.display = row.dataset.tname.includes(v) ? '' : 'none'; }); };
  on(el, 'click', '[data-delt]', async (e, b) => {
    if (!(await confirmBox(`معلم «${esc(b.dataset.tname)}» حذف شود؟ جلسات برنامه هفتگی بدون معلم می‌شوند.`, 'حذف معلم'))) return;
    await del(`/api/manager/teachers/${b.dataset.delt}`);
    metaCache = null; toast('معلم حذف شد', 'ok'); staff(el);
  });
  let allSubjects = [...new Set([...(md.subjects || []), 'ریاضی', 'علوم', 'فارسی', 'هوش و استعداد', 'زبان انگلیسی', 'عربی', 'فیزیک', 'شیمی', 'زیست'])];
  let allRooms = [...new Set(md.classes.map((c) => `${gradeName(c.grade)} ${c.name}`))];
  const drawSched = async () => {
    if (!schedClass) { $('#sched', el).innerHTML = empty('calendar', 'ابتدا یک کلاس ایجاد کنید'); return; }
    const [list, ov] = await Promise.all([api(`/api/manager/schedule?class_id=${schedClass}`), api('/api/manager/schedule/overview').catch(() => [])]);
    allSubjects = [...new Set([...allSubjects, ...ov.map((x) => x.subject).filter(Boolean), ...list.map((x) => x.subject).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fa'));
    allRooms = [...new Set([...allRooms, ...ov.map((x) => x.room).filter(Boolean), ...list.map((x) => x.room).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fa'));
    $('#sched', el).innerHTML = `<div class="week-cal">${WEEKDAYS.map((w, i) => `<div class="day"><div class="dn">${w}</div>${list.filter((s) => s.weekday === i).map((s) => `<div class="ses"><b>${subjIcon(s.subject)} ${esc(s.subject)}</b>${fa(s.start)} تا ${fa(s.end)}<div class="tiny muted">${esc(s.teacher || '')}${s.room ? ' · ' + esc(s.room) : ''} · ${kindOf(s.kind).label}</div><button class="btn ghost sm" data-ds="${s.id}" style="padding:0 6px;margin-top:2px">حذف</button></div>`).join('')}</div>`).join('')}</div>
      <form class="row wrap" id="schedForm" style="margin-top:12px;gap:8px;align-items:center">
        <select class="input" name="weekday" style="width:auto">${WEEKDAYS.map((w, i) => `<option value="${i}">${w}</option>`).join('')}</select>
        <input class="input ltr" type="time" name="start" value="16:00" style="width:auto">
        <input class="input ltr" type="time" name="end" value="17:30" style="width:auto">
        <select class="input" name="subject_sel" id="sfSubjSel" style="width:auto">${allSubjects.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}<option value="__new__">➕ درس جدید...</option></select>
        <input class="input" name="subject_new" id="sfSubjNew" placeholder="نام درس جدید" style="width:140px;display:none" maxlength="40">
        <select class="input" name="room_sel" id="sfRoomSel" style="width:auto"><option value="">مکان (اختیاری)</option>${allRooms.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}<option value="__new__">➕ مکان جدید...</option></select>
        <input class="input" name="room_new" id="sfRoomNew" placeholder="نام مکان جدید" style="width:140px;display:none" maxlength="30">
        <select class="input" name="kind" style="width:auto" aria-label="نوع جلسه">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <select class="input" name="teacher_id" style="width:auto"><option value="">معلم</option>${md.teachers.map((t) => `<option value="${t.id}">${esc(t.full_name)}</option>`).join('')}</select>
        <button class="btn sm">${icon('plus', { size: 16 })} افزودن جلسه</button>
      </form>`;
    const syncCustom = (selId, inpId) => {
      const sel = $(selId, el), inp = $(inpId, el);
      const toggle = () => { const isNew = sel.value === '__new__'; inp.style.display = isNew ? '' : 'none'; inp.required = isNew; if (isNew) inp.focus(); };
      sel.onchange = toggle; toggle();
    };
    syncCustom('#sfSubjSel', '#sfSubjNew');
    syncCustom('#sfRoomSel', '#sfRoomNew');
    $('#schedForm', el).onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const subject = f.subject_sel.value === '__new__' ? f.subject_new.value.trim() : f.subject_sel.value;
      const room = f.room_sel.value === '__new__' ? f.room_new.value.trim() : f.room_sel.value;
      if (!subject) return toast('نام درس را وارد کنید', 'err');
      busy(e.submitter, async () => {
        await post('/api/manager/schedule', { weekday: f.weekday.value, start: f.start.value, end: f.end.value, subject, room, kind: f.kind.value, teacher_id: f.teacher_id.value, class_id: schedClass });
        drawSched();
      });
    };
  };
  $('#schedSel', el).onchange = (e) => { schedClass = Number(e.target.value); drawSched(); };
  $('#schedNewClass', el).onclick = () => modal({
    title: 'افزودن کلاس جدید',
    body: `<form id="sncForm" class="stack"><div class="field"><label for="sncGrade">پایه</label><select class="input" id="sncGrade" name="grade">${md.grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div><div class="field"><label for="sncName">نام کلاس (مثلاً الف، ب، تیزهوشان)</label><input class="input" id="sncName" name="name" maxlength="30" required></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ایجاد کلاس', onClick: async (m) => {
      const d = formData($('#sncForm', m));
      if (!d.name?.trim()) { toast('نام کلاس را وارد کنید', 'err'); return false; }
      await post('/api/manager/classes', { grade: Number(d.grade), name: d.name.trim() });
      metaCache = null; md = await meta();
      const created = md.classes.find((c) => c.grade === Number(d.grade) && c.name === d.name.trim());
      if (created) schedClass = created.id;
      $('#schedSel', el).innerHTML = md.classes.map((c) => `<option value="${c.id}" ${c.id === schedClass ? 'selected' : ''}>${gradeName(c.grade)} ${esc(c.name)}</option>`).join('');
      toast('کلاس ساخته شد', 'ok');
      drawSched();
    } }],
  });
  const compressScheduleImage = (file) => new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return fileToData(file, 10).then(resolve, reject);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1600;
      let { width: w, height: h } = img;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fileToData(file, 10).then(resolve, reject); };
    img.src = url;
  });
  $('#schedPhoto', el).onclick = () => {
    if (!schedClass) return toast('ابتدا یک کلاس ایجاد یا انتخاب کنید', 'err');
    const cls = md.classes.find((c) => c.id === schedClass);
    let slots = [];
    let dataUrl = '';
    modal({
      title: `ثبت برنامه هفتگی از روی عکس (${cls ? `${gradeName(cls.grade)} ${esc(cls.name)}` : ''})`,
      wide: true,
      body: `<div class="stack">
        <div class="row wrap" style="gap:10px;align-items:center">
          <input class="input grow" type="file" id="spFile" accept="image/*,application/pdf">
          <button type="button" class="btn" id="spParse" disabled>${icon('sparkles', { size: 16 })} تحلیل و استخراج برنامه</button>
        </div>
        <div id="spPreview" class="center" style="display:none"><img id="spImg" style="max-height:180px;border-radius:10px;border:1px solid var(--line)" alt="پیش‌نمایش برنامه"></div>
        <div id="spNote" class="small muted" style="display:none"></div>
        <datalist id="spSubjList">${allSubjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <datalist id="spRoomList">${allRooms.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
        <div id="spBox" style="display:none">
          <div class="row between wrap" style="margin-bottom:8px;gap:8px">
            <label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" id="spReplace"> <span class="small">جایگزینی با برنامه فعلی این کلاس</span></label>
            <button type="button" class="btn sm soft" id="spAddRow">${icon('plus', { size: 14 })} افزودن ردیف</button>
          </div>
          <div class="table-wrap"><table class="table"><thead><tr><th>روز</th><th>شروع</th><th>پایان</th><th>درس</th><th>دبیر</th><th>مکان</th><th>نوع</th><th></th></tr></thead><tbody id="spRows"></tbody></table></div>
        </div>
      </div>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'تایید و ثبت نهایی در برنامه', onClick: async (m) => {
        const rows = [...m.querySelectorAll('#spRows tr')];
        if (!rows.length) { toast('ابتدا تصویر را تحلیل کنید یا ردیفی اضافه کنید', 'err'); return false; }
        const readRows = rows.map((tr) => ({
          weekday: Number(tr.querySelector('[data-f="weekday"]').value),
          start: tr.querySelector('[data-f="start"]').value,
          end: tr.querySelector('[data-f="end"]').value,
          subject: tr.querySelector('[data-f="subject"]').value.trim(),
          teacher_id: tr.querySelector('[data-f="teacher_id"]').value || null,
          room: tr.querySelector('[data-f="room"]').value.trim(),
          kind: tr.querySelector('[data-f="kind"]').value,
        }));
        const replace = $('#spReplace', m).checked;
        const r = await post('/api/manager/schedule/bulk', { class_id: schedClass, replace, slots: readRows });
        toast(`${fa(r.inserted)} جلسه ثبت شد${r.skipped ? ` (${fa(r.skipped)} مورد تداخلی یا ناقص رد شد)` : ''}`, 'ok');
        drawSched();
      } }],
      onOpen: (m) => {
        const drawRows = () => {
          $('#spBox', m).style.display = '';
          $('#spRows', m).innerHTML = slots.map((s, idx) => `<tr data-idx="${idx}">
            <td><select class="input sm" data-f="weekday" style="width:95px">${WEEKDAYS.map((w, i) => `<option value="${i}" ${i === Number(s.weekday) ? 'selected' : ''}>${w}</option>`).join('')}</select></td>
            <td><input class="input sm ltr" type="time" data-f="start" value="${esc(s.start || '16:00')}" style="width:95px"></td>
            <td><input class="input sm ltr" type="time" data-f="end" value="${esc(s.end || '17:30')}" style="width:95px"></td>
            <td><input class="input sm" data-f="subject" list="spSubjList" value="${esc(s.subject || '')}" placeholder="نام درس" style="width:125px"></td>
            <td><select class="input sm" data-f="teacher_id" style="width:120px"><option value="">—</option>${md.teachers.map((t) => `<option value="${t.id}" ${Number(s.teacher_id) === t.id ? 'selected' : ''}>${esc(t.full_name)}</option>`).join('')}</select></td>
            <td><input class="input sm" data-f="room" list="spRoomList" value="${esc(s.room || '')}" placeholder="مکان" style="width:95px"></td>
            <td><select class="input sm" data-f="kind" style="width:95px">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></td>
            <td><button type="button" class="btn sm ghost" data-rmrow="${idx}" aria-label="حذف">${icon('trash', { size: 14 })}</button></td>
          </tr>`).join('');
        };
        $('#spFile', m).onchange = async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            dataUrl = await compressScheduleImage(f);
            $('#spParse', m).disabled = false;
            if (f.type.startsWith('image/')) {
              $('#spImg', m).src = dataUrl;
              $('#spPreview', m).style.display = '';
            } else {
              $('#spPreview', m).style.display = 'none';
            }
          } catch (err) {
            toast(err.message || 'خطا در خواندن فایل', 'err');
          }
        };
        $('#spParse', m).onclick = (e) => busy(e.currentTarget, async () => {
          const r = await post('/api/manager/schedule/parse-image', { image: dataUrl, class_id: schedClass });
          slots = r.slots || [];
          const noteEl = $('#spNote', m);
          if (r.note) { noteEl.textContent = r.note; noteEl.style.display = ''; }
          else if (slots.length) { noteEl.textContent = `${fa(slots.length)} جلسه استخراج شد. پس از بررسی و ویرایش احتمالی، دکمه تایید را بزنید.`; noteEl.style.display = ''; }
          else { noteEl.textContent = 'جلسه‌ای شناسایی نشد؛ می‌توانید ردیف‌ها را دستی اضافه کنید.'; noteEl.style.display = ''; }
          if (!slots.length) slots = [{ weekday: 0, start: '16:00', end: '17:30', subject: '', teacher_id: null, room: '', kind: 'academic' }];
          drawRows();
        });
        $('#spAddRow', m).onclick = () => {
          slots.push({ weekday: 0, start: '16:00', end: '17:30', subject: '', teacher_id: null, room: '', kind: 'academic' });
          drawRows();
        };
        on(m, 'click', '[data-rmrow]', (_ev, b) => {
          slots.splice(Number(b.dataset.rmrow), 1);
          drawRows();
        });
      },
    });
  };
  on(el, 'click', '[data-ds]', (e, b) => busy(b, async () => { await del(`/api/manager/schedule/${b.dataset.ds}`); drawSched(); }));
  on(el, 'click', '[data-dc]', async (e, b) => { if (await confirmBox('کلاس حذف شود؟', 'حذف')) { await del(`/api/manager/classes/${b.dataset.dc}`); staff(el); } });
  on(el, 'click', '[data-ec]', (e, b) => {
    const cid = b.dataset.ec, oldName = b.dataset.cname || '', grade = Number(b.dataset.cgrade);
    modal({ title: 'ویرایش کلاس', body: `<form id="ecForm" class="stack"><div class="field"><label for="ecGrade">پایه</label><select class="input" id="ecGrade" name="grade">${md.grades.map((g) => `<option value="${g}" ${g === grade ? 'selected' : ''}>${gradeName(g)}</option>`).join('')}</select></div><div class="field"><label for="ecName">نام کلاس</label><input class="input" id="ecName" name="name" value="${esc(oldName)}" maxlength="30" required></div></form>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره', onClick: async (m) => {
        const d = formData($('#ecForm', m)); if (!d.name?.trim()) { toast('نام کلاس را وارد کنید'); return false; }
        await put(`/api/manager/classes/${cid}`, { name: d.name.trim(), grade: Number(d.grade) });
        metaCache = null; toast('نام کلاس ویرایش شد', 'ok'); staff(el);
      } }] });
  });
  drawSched();
  // فهرست درس‌ها از تنظیمات کانون می‌آید و داخل همین پنجره قابل ویرایش است
  const SUBJECTS = [...(md.subjects || [])];
  const teacherModal = async (t) => {
    const assign = t ? (await api(`/api/manager/teachers/${t.id}`)).assign : [];
    modal({
      title: t ? `${icon('edit', { size: 16 })} ${esc(t.full_name)}` : ' معلم جدید', wide: true,
      body: `<form class="stack" id="tForm"><div class="form-grid"><div class="field"><label>نام و نام خانوادگی</label><input class="input" name="full_name" value="${esc(t?.full_name || '')}" required></div>
        <div class="field"><label>نام کاربری (لاتین)</label><input class="input ltr" name="username" value="${esc(t?.username || '')}" ${t ? 'disabled' : 'required'}></div>
        <div class="field"><label>${t ? 'رمز جدید (اختیاری)' : 'رمز عبور'}</label><input class="input ltr" name="password" type="password" ${t ? '' : 'required'} minlength="6"></div>
        ${t ? `<div class="field"><label>وضعیت</label><select class="input" name="active"><option value="1" ${t.active ? 'selected' : ''}>فعال</option><option value="0" ${t.active ? '' : 'selected'}>غیرفعال</option></select></div>` : ''}</div>
        <div class="label">درس‌های قابل انتخاب <span class="tiny muted">(نام را برای ویرایش تغییر دهید، با ✕ حذف کنید یا درس جدید اضافه کنید)</span></div>
        <div class="row wrap" id="subjChips" style="gap:6px"></div>
        <div class="row" style="gap:6px;margin-top:6px"><input class="input" id="newSubj" placeholder="درس جدید، مثلاً: قرآن" maxlength="40" style="max-width:220px" aria-label="نام درس جدید"><button type="button" class="btn soft sm" id="addSubj">${icon('plus', { size: 16 })} افزودن درس</button></div>
        <div class="label">کلاس‌ها و درس‌ها</div><div id="asgTable"></div></form>`,
      onOpen: (m) => {
        const checked = new Set(assign.map((a) => `${a.class_id}|${a.subject}`));
        const drawSubjects = () => {
          $('#subjChips', m).innerHTML = SUBJECTS.map((s, i) => `<span class="row" style="gap:2px;display:inline-flex"><input class="input" data-sren="${i}" value="${esc(s)}" maxlength="40" aria-label="نام درس" style="width:${Math.max(9, s.length + 3)}ch;height:34px;padding:2px 8px"><button type="button" class="icon-btn" data-sdel="${i}" title="حذف درس" aria-label="حذف درس ${esc(s)}">${icon('x', { size: 14 })}</button></span>`).join('') || '<span class="tiny muted">هنوز درسی تعریف نشده</span>';
          $('#asgTable', m).innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>کلاس</th>${SUBJECTS.map((s) => `<th class="tiny">${esc(s)}</th>`).join('')}</tr></thead><tbody>
            ${md.classes.map((c) => `<tr><td>${gradeName(c.grade)} ${esc(c.name)}</td>${SUBJECTS.map((s) => `<td class="center"><input type="checkbox" data-as="${c.id}|${esc(s)}" aria-label="${esc(s)}" ${checked.has(`${c.id}|${s}`) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        };
        // هر تغییر فهرست فوری ذخیره می‌شود؛ اگر سرور نپذیرفت (مثلاً درس در حال استفاده) به حالت قبل برمی‌گردد
        const persist = async (next, renames = []) => {
          try { await put('/api/manager/subjects', { subjects: next, renames }); SUBJECTS.splice(0, SUBJECTS.length, ...next); md.subjects = [...next]; return true; }
          catch (err) { toast(err.message, 'err'); return false; }
        };
        $('#asgTable', m).addEventListener('change', (e) => { const c = e.target.closest('[data-as]'); if (c) (c.checked ? checked.add(c.dataset.as) : checked.delete(c.dataset.as)); });
        const add = async () => {
          const inp = $('#newSubj', m), name = inp.value.trim();
          if (!name) return;
          if (SUBJECTS.includes(name)) { toast('این درس در فهرست هست', 'err'); return; }
          if (await persist([...SUBJECTS, name])) { inp.value = ''; drawSubjects(); }
        };
        $('#addSubj', m).onclick = add;
        m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('#newSubj, [data-sren]')) { e.preventDefault(); e.target.id === 'newSubj' ? add() : e.target.blur(); } });
        m.addEventListener('change', async (e) => {
          const inp = e.target.closest('[data-sren]');
          if (!inp) return;
          const i = Number(inp.dataset.sren), from = SUBJECTS[i], to = inp.value.trim();
          if (!to || to === from) { inp.value = from; return; }
          if (SUBJECTS.includes(to)) { toast('این درس در فهرست هست', 'err'); inp.value = from; return; }
          const next = SUBJECTS.map((s, j) => (j === i ? to : s));
          if (await persist(next, [{ from, to }])) {
            for (const k of [...checked]) { const [cid, sub] = k.split('|'); if (sub === from) { checked.delete(k); checked.add(`${cid}|${to}`); } }
            drawSubjects();
          } else inp.value = from;
        });
        on(m, 'click', '[data-sdel]', async (e, b) => {
          const i = Number(b.dataset.sdel), gone = SUBJECTS[i];
          if (SUBJECTS.length < 2) { toast('حداقل یک درس باید بماند', 'err'); return; }
          if (await persist(SUBJECTS.filter((_, j) => j !== i))) { for (const k of [...checked]) if (k.split('|')[1] === gone) checked.delete(k); drawSubjects(); }
        });
        drawSubjects();
      },
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
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('new') === 'teacher') setTimeout(() => $('#addT')?.click(), 50);
  on(el, 'click', '[data-et]', (e, b) => teacherModal(md.teachers.find((t) => t.id === Number(b.dataset.et))));
  $('#addC').onclick = () => modal({ title: ' کلاس جدید', body: `<form class="form-grid" id="cForm"><div class="field"><label>پایه</label><select class="input" name="grade">${md.grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div><div class="field"><label>نام کلاس</label><input class="input" name="name" placeholder="مثلاً: ج" required></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ایجاد', onClick: async (m) => { await post('/api/manager/classes', formData($('#cForm', m))); toast('کلاس ایجاد شد', 'ok'); staff(el); } }] });
}

// ================= حق عضویت =================
async function fees(el) {
  setHead('حق عضویت و رسیدها', 'بررسی رسیدها، تعیین مبلغ و پیگیری وصول', `<a class="btn sm soft" href="#/students">${icon('users', { size: 15 })} مدیریت پرداخت دانش‌آموزان</a>`);
  let tab = 'pending', rpage = 0;
  const RP = 20;
  const [d, an] = await Promise.all([api('/api/manager/fees'), api('/api/manager/analytics').catch(() => null)]);
  const c = an?.collection;
  const kp = (ico, l, v, s = '', tone = '') => `<div class="ad-kpi ${tone}"><div class="kt">${icon(ico, { size: 17 })}${l}</div><div class="kv">${v}</div><div class="ks">${s}</div></div>`;
  el.innerHTML = `<div class="ad-dash">
    ${c ? `<section class="ad-kpis ad-kpis-4" aria-label="خلاصهٔ وصول">${kp('banknote', 'وصول حق عضویت', c.pct_amount == null ? '—' : `${fa(c.pct_amount)}<small>٪</small>`, 'دریافتی ÷ قابل وصول')}${kp('wallet', 'دریافت‌شده', money(c.collected), 'پرداخت‌های تأییدشده')}${kp('receipt', 'قابل وصول', money(c.due), 'بر اساس مبلغ هر پایه')}${kp('clock', 'در انتظار تأیید', fa(c.pending), c.pending ? 'رسید در صف بررسی' : 'صف خالی است', c.pending ? 'warn' : '')}</section>` : ''}
    <div class="ad-tabs" role="tablist" aria-label="بخش‌های حق عضویت"><button role="tab" aria-selected="true" data-pane="pnR">${icon('receipt', { size: 16 })} رسیدها</button><button role="tab" aria-selected="false" data-pane="pnS">${icon('sliders', { size: 16 })} مبلغ و مهلت</button><button role="tab" aria-selected="false" data-pane="pnC">${icon('layers', { size: 16 })} گزارش کلاس‌ها</button></div>
    <section id="pnR" role="tabpanel"><div class="ad-card"><header><div><h3>رسیدهای کارت‌به‌کارت</h3><p>تصویر رسید را ببینید، تأیید یا با ذکر علت رد کنید.</p></div><div class="row wrap" style="gap:8px;align-items:center"><input class="input sm" id="rSearch" placeholder="جست‌وجوی نام دانش‌آموز…" style="width:170px"><div class="seg">${[['pending', 'در انتظار'], ['approved', 'تأییدشده'], ['rejected', 'ردشده'], ['reversed', 'برگشتی']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div></div></header><div id="rq"></div></div></section>
    <section id="pnS" role="tabpanel" hidden><form id="feeForm" class="stack">
      <div class="ad-grid">
        <div class="ad-card ad-col-4"><header><div><h3>اشتراک سامانه</h3><p>جدا از حق عضویت و فعلاً خاموش</p></div></header>
          <label class="row" style="gap:8px"><input type="checkbox" id="sysOn" ${d.system_fee_enabled ? 'checked' : ''}> <span>اعمال بر پرداخت دانش‌آموزان</span></label>
          <div class="field"><label for="sysFee">مبلغ اشتراک (تومان)</label><input class="input ltr" id="sysFee" value="${d.system_fee}" inputmode="numeric"></div>
          <p class="tiny muted" style="margin:0">تا وقتی خاموش است، به مبلغ پرداخت اضافه نمی‌شود. با روشن‌شدن، به حق عضویت هر پایه افزوده و جدا نمایش داده می‌شود.</p></div>
        <div class="ad-card ad-col-8"><header><div><h3>قیمت‌گذاری یکجا</h3><p>یک مبلغ برای همهٔ پایه‌ها؛ هر پایه را بعداً می‌توانید جدا تغییر دهید.</p></div></header>
          <div class="row" style="gap:8px"><input class="input ltr grow" id="allAmt" inputmode="numeric" placeholder="مثلاً 3500000" aria-label="مبلغ همهٔ پایه‌ها"><button type="button" class="btn soft" id="applyAll">اعمال به همهٔ پایه‌ها</button></div>
          <p class="tiny muted" style="margin:0">پس از اعمال، «ذخیره تنظیمات» را بزنید.</p></div>
      </div>
      <div class="ad-grid">${d.settings.map((f) => `<div class="ad-card ad-col-4"><header><h3>پایهٔ ${gradeName(f.grade)}</h3></header><div class="field"><label>مبلغ حق عضویت (تومان)</label><input class="input ltr" data-amt="${f.grade}" value="${f.amount}" inputmode="numeric"></div><div class="field"><label>مهلت پرداخت (تاریخ قفل پنل)</label>${dateField(`lock${f.grade}`, f.lock_date, { minYear: 1404, maxYear: 1406 })}</div></div>`).join('')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn">${icon('check', { size: 16 })} ذخیرهٔ تنظیمات</button></div></form></section>
    <section id="pnC" role="tabpanel" hidden><div class="ad-card" style="padding:0"><div class="table-wrap"><table class="table ad-cards"><thead><tr><th>کلاس</th><th>پرداخت‌شده</th><th>در انتظار</th><th>پرداخت‌نشده</th><th style="min-width:160px">درصد وصول (تعداد)</th><th></th></tr></thead><tbody>
    ${d.classes.map((cl) => { const t = cl.paid + cl.pending + cl.unpaid; const r = t ? (cl.paid / t) * 100 : 0; return `<tr><td class="ad-first"><b>${gradeName(cl.grade)} ${esc(cl.name)}</b></td><td data-l="پرداخت‌شده" class="pos">${fa(cl.paid)}</td><td data-l="در انتظار" style="color:var(--amber-ink)">${fa(cl.pending)}</td><td data-l="پرداخت‌نشده" class="neg">${fa(cl.unpaid)}</td><td data-l="وصول"><div class="row">${progress(r, 'green sm')}<b class="small">${pct(r)}</b></div></td><td class="ad-act"><button class="btn ghost sm" data-cls="${cl.id}" data-name="${gradeName(cl.grade)} ${esc(cl.name)}">فهرست</button></td></tr>`; }).join('')}</tbody></table></div></div></section>
  </div>`;
  on(el, 'click', '[data-pane]', (e, b) => { $$('[data-pane]', el).forEach((x) => x.setAttribute('aria-selected', String(x === b))); ['pnR', 'pnS', 'pnC'].forEach((id) => { $('#' + id, el).hidden = id !== b.dataset.pane; }); });
  const drawQueue = async () => {
    const rqSearch = ($('#rSearch', el)?.value || '').trim();
    const raw = await api(`/api/manager/receipts?status=${tab}`);
    const all_ = rqSearch ? raw.filter((p) => (p.full_name || '').includes(rqSearch)) : raw;
    rpage = Math.min(rpage, Math.max(0, Math.ceil(all_.length / RP) - 1));
    const list = all_.slice(rpage * RP, rpage * RP + RP);
    const act = (p) => (p.status === 'pending' ? `<div class="row" style="gap:6px;justify-content:flex-end"><button class="btn sm green" data-ok="${p.id}">${icon('check', { size: 15 })} تأیید</button><button class="btn sm ghost" style="color:var(--red)" data-no="${p.id}">${icon('x', { size: 15 })} رد</button></div>`
      : p.status === 'rejected' ? `<span class="badge red">رد شد</span><div class="tiny muted">${esc(p.reject_reason || '')}</div>`
      : p.status === 'reversed' ? `<span class="badge orange">برگشت‌خورده ${jdate(p.reversed_at)}</span><div class="tiny muted">${esc(p.reverse_reason || '')}</div>`
      : `<div class="row" style="gap:8px;justify-content:flex-end"><span class="badge green">تأیید ${jdate(p.reviewed_at)}</span><button class="btn sm ghost" data-rev="${p.id}">برگشت</button></div>`);
    $('#rq', el).innerHTML = list.length ? `<div class="table-wrap"><table class="table ad-cards"><thead><tr><th>دانش‌آموز</th><th>مبلغ</th><th>نوع</th><th>زمان</th><th>رسید</th><th style="text-align:end">وضعیت / اقدام</th></tr></thead><tbody>${list.map((p) => `<tr>
      <td class="ad-first"><div class="ad-student">${nameAvatar(p.full_name, 'sm')}<span><b>${esc(p.full_name)}</b><small>${gradeName(p.grade)} ${esc(p.class_name || '')}</small></span></div></td>
      <td data-l="مبلغ"><b>${money(p.amount)}</b>${p.system_fee ? `<div class="tiny muted">شامل اشتراک ${money(p.system_fee)}</div>` : ''}</td>
      <td data-l="نوع"><span class="badge ${p.invoice_id ? 'blue' : ''}">${p.invoice_id ? `فاکتور #${fa(p.invoice_id)}` : 'حق عضویت'}</span></td>
      <td data-l="زمان" class="small muted">${timeAgo(p.created_at)}</td>
      <td data-l="رسید">${p.receipt_path ? `<button type="button" class="btn sm ghost" data-img="/uploads/${esc(p.receipt_path)}" data-who="${esc(p.full_name)}">${icon('eye', { size: 15 })} مشاهده</button>` : '<span class="muted small">بدون تصویر</span>'}</td>
      <td class="ad-act" style="text-align:end">${act(p)}</td></tr>`).join('')}</tbody></table></div>${all_.length > RP ? `<div class="ad-pager" style="padding-inline:0"><span>${fa(rpage * RP + 1)} تا ${fa(rpage * RP + list.length)} از ${fa(all_.length)}${all_.length >= 200 ? ' (۲۰۰ مورد اخیر)' : ''}</span><span class="row" style="gap:6px"><button class="btn ghost sm" data-rp="-1" ${rpage === 0 ? 'disabled' : ''}>${icon('chevron-right', { size: 15 })} قبلی</button><button class="btn ghost sm" data-rp="1" ${(rpage + 1) * RP >= all_.length ? 'disabled' : ''}>بعدی ${icon('chevron-left', { size: 15 })}</button></span></div>` : ''}` : empty(tab === 'pending' ? 'check-circle' : 'inbox', tab === 'pending' ? 'رسیدی در صف بررسی نیست' : 'موردی در این بخش نیست');
  };
  on(el, 'click', '[data-rp]', (e, b) => { rpage = Math.max(0, rpage + Number(b.dataset.rp)); drawQueue(); });
  on(el, 'click', '[data-img]', (e, b) => modal({ title: `رسید ${esc(b.dataset.who)}`, wide: true, body: `<img src="${esc(b.dataset.img)}" alt="تصویر رسید ${esc(b.dataset.who)}" style="width:100%;max-height:70vh;object-fit:contain;background:var(--surface-2);border-radius:10px" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'muted',textContent:'تصویر رسید قابل نمایش نیست.'}))">`, actions: [{ label: 'بستن', cls: 'ghost', value: true }, { label: 'باز کردن در تب جدید', cls: 'soft', onClick: () => { window.open(b.dataset.img, '_blank', 'noopener'); return false; } }] }));
  drawQueue();
  if ($('#rSearch', el)) $('#rSearch', el).oninput = () => { rpage = 0; drawQueue(); };
  on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; rpage = 0; $$('[data-tab]', el).forEach((x) => x.classList.toggle('on', x === b)); drawQueue(); });
  on(el, 'click', '[data-rev]', (e, b) => modal({ title: 'برگشت رسید تأییدشده', body: '<p class="small muted" style="margin-top:0">رسید باطل و یک سند هزینه‌ی اصلاحی در حسابداری ثبت می‌شود. این کار برگشت‌پذیر نیست.</p><div class="field"><label for="revWhy">علت برگشت</label><input class="input" id="revWhy" maxlength="200" required></div>', actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ثبت برگشت', cls: 'red', onClick: async (m) => { const reason = m.querySelector('#revWhy').value.trim(); if (!reason) { toast('علت را بنویسید'); return false; } await post(`/api/manager/receipts/${b.dataset.rev}/reverse`, { reason }); toast('رسید برگشت خورد و سند اصلاحی ثبت شد', 'ok'); drawQueue(); } }] }));
  on(el, 'click', '[data-ok]', (e, b) => busy(b, async () => { await post(`/api/manager/receipts/${b.dataset.ok}/approve`); toast('رسید تأیید شد و در صندوق ثبت شد', 'ok'); drawQueue(); }));
  on(el, 'click', '[data-no]', (e, b) => modal({
    title: ' رد رسید', body: `<div class="label" style="margin-bottom:8px">علت رد (برای دانش‌آموز نمایش داده می‌شود)</div><div class="chips" style="margin-bottom:10px">${REJECT_REASONS.map((r) => `<button class="chip" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div><textarea class="input" id="reason" placeholder="یا علت دیگری بنویسید…"></textarea>`,
    onOpen: (m) => on(m, 'click', '[data-reason]', (ev, c) => { $('#reason', m).value = c.dataset.reason; $$('[data-reason]', m).forEach((x) => x.classList.toggle('on', x === c)); }),
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'رد رسید', cls: 'red', onClick: async (m) => { await post(`/api/manager/receipts/${b.dataset.no}/reject`, { reason: $('#reason', m).value }); toast('رسید رد شد', 'ok'); drawQueue(); } }],
  }));
  on(el, 'click', '[data-cls]', async (e, b) => {
    const list = await api(`/api/manager/fees/class/${b.dataset.cls}`);
    modal({ title: `کلاس ${esc(b.dataset.name)}`, body: `<div class="list">${list.map((s) => `<div class="list-item" data-row="${s.id}">${nameAvatar(s.full_name, 'sm')}<span class="grow">${esc(s.full_name)}</span><span class="badge ${PAY[s.st][1]}" data-badge>${PAY[s.st][0]}</span>${s.st === 'paid' ? '' : `<button class="btn sm soft" data-mp="${s.id}">ثبت پرداخت</button>`}</div>`).join('')}</div>`,
      onOpen: (m) => on(m, 'click', '[data-mp]', (ev, bt) => busy(bt, async () => { await post('/api/manager/students/fee-paid', { ids: [Number(bt.dataset.mp)], paid: true }); const row = bt.closest('[data-row]'); const bd = $('[data-badge]', row); bd.className = 'badge green'; bd.textContent = PAY.paid[0]; bt.remove(); toast('پرداخت ثبت شد', 'ok'); })) });
  });
  $('#applyAll', el).onclick = () => { const v = en($('#allAmt', el).value).replace(/\D/g, ''); if (!v) { toast('مبلغ را وارد کنید'); return; } $$('[data-amt]', el).forEach((i) => { i.value = v; }); toast('در همهٔ پایه‌ها نوشته شد؛ «ذخیره تنظیمات» را بزنید', 'ok'); };
  $('#feeForm', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await put('/api/manager/fees', { system_fee: Number(en($('#sysFee', el).value)) || 0, system_fee_enabled: $('#sysOn', el).checked, settings: d.settings.map((f) => ({ grade: f.grade, amount: Number(en($(`[data-amt="${f.grade}"]`, el).value)), lock_date: readDate(el, `lock${f.grade}`) })) });
      toast('تنظیمات حق عضویت ذخیره شد', 'ok');
    });
  };
}

// ================= اطلاعیه‌ها =================
async function announcements(el) {
  const md = await meta();
  setHead('اطلاعیه‌رسانی', 'ارسال به کل کانون، پایه یا کلاس‌های مشخص + گزارش دیده‌شدن', '<button class="btn sm" id="newAnn"> اطلاعیه جدید</button> <details class="ad-dd"><summary class="btn ghost sm" aria-label="امکانات بیشتر">' + icon('more', { size: 17 }) + '</summary><div class="ad-dd-menu"><button type="button" id="delAllAnn" class="danger">' + icon('trash', { size: 16 }) + ' حذف همهٔ اطلاعیه‌ها…</button></div></details>');
  $('#delAllAnn').onclick = () => deleteAll('announcements', 'اطلاعیه‌ها', () => announcements(el));
  const list = await api('/api/manager/announcements');
  const target = (a) => (a.target_type === 'all' ? ' کل کانون' : a.target_type === 'grade' ? `${icon('graduation', { size: 16 })} پایه ${a.target_value.map(gradeName).join('، ')}` : `${icon('logout', { size: 16 })} کلاس ${a.target_value.map((id) => { const c = md.classes.find((x) => x.id === id); return c ? `${gradeName(c.grade)} ${esc(c.name)}` : ''; }).join('، ')}`);
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
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('new')) setTimeout(() => $('#newAnn')?.click(), 50);
}

// ================= حسابداری =================
async function accounting(el, _p, me) {
  let period = 'month', type = '', from = addDays(me.today, -30), to = me.today;
  setHead('حسابداری', 'درآمد، هزینه، مانده صندوق و دفتر کل', '<button class="btn sm" id="addExp"> ثبت سند هزینه</button> <button class="btn soft sm" id="addInc"> ثبت درآمد</button> <details class="ad-dd"><summary class="btn ghost sm" aria-label="امکانات بیشتر">' + icon('more', { size: 17 }) + '</summary><div class="ad-dd-menu"><button type="button" id="delAllTx" class="danger">' + icon('trash', { size: 16 }) + ' حذف اسناد دستی…</button></div></details>');
  $('#delAllTx').onclick = () => deleteAll('transactions', 'اسناد دستی (هزینه/درآمد ثبت‌شده)', () => accounting(el, _p, me), 'اسناد مربوط به پرداخت حق عضویت و اصلاحیه‌ها حذف نمی‌شوند.');
  const ranges = { day: () => [me.today, me.today], week: () => [addDays(me.today, -6), me.today], month: () => [addDays(me.today, -29), me.today] };
  const load = async () => {
    if (period !== 'custom') [from, to] = ranges[period]();
    const d = await api(`/api/manager/accounting?from=${from}&to=${to}${type ? `&type=${type}` : ''}`);
    el.innerHTML = `<section class="ad-kpis ad-kpis-3" aria-label="خلاصهٔ مالی">${[['download', 'کل درآمد', money(d.totals.income), 'مجموع ورودی‌ها'], ['upload', 'کل هزینه', money(d.totals.expense), 'مجموع خروجی‌ها'], ['wallet', 'مانده صندوق', money(d.totals.balance), 'درآمد منهای هزینه']].map(([i, l, v, sub]) => `<div class="ad-kpi"><div class="kt">${icon(i, { size: 17 })}${l}</div><div class="kv sm">${v}</div><div class="ks">${sub}</div></div>`).join('')}</section>
      <div class="ad-grid" style="margin-top:14px"><section class="ad-card ad-col-8"><header><div><h3>مقایسهٔ درآمد و هزینه</h3><p>شش ماه اخیر (تومان)</p></div></header><div id="chAcc"></div></section>
      <section class="ad-card ad-col-4"><header><div><h3>ترکیب هزینه‌ها</h3><p>در بازهٔ انتخاب‌شده</p></div></header><div id="chCat"></div></section></div>
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('info', { size: 18 })}</span>دفتر کل تراکنش‌ها و دفتر واریزها<span class="row wrap more" style="gap:6px"><button class="btn sm soft" id="accCsv">${icon('download', { size: 14 })} خروجی اکسل</button><button class="btn sm ghost" id="accPrint">${icon('printer', { size: 14 })} چاپ دفتر کل</button></span></div>
        <div class="row wrap" style="margin-bottom:12px;gap:8px"><div class="seg">${[['day', 'روزانه'], ['week', 'هفتگی'], ['month', 'ماهانه'], ['custom', 'بازه دلخواه']].map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg">${[['', 'همه'], ['income', 'واریزها'], ['expense', 'هزینه‌ها']].map(([k, l]) => `<button data-ty="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div><input class="input sm" id="accSearch" placeholder="جست‌وجوی شرح یا دسته…" style="width:180px"></div>
        ${period === 'custom' ? `<div class="row wrap" style="margin-bottom:12px"><span class="small">از</span><div style="width:250px">${dateField('from', from, { minYear: 1403, maxYear: 1406 })}</div><span class="small">تا</span><div style="width:250px">${dateField('to', to, { minYear: 1403, maxYear: 1406 })}</div><button class="btn sm" id="applyR">اعمال</button></div>` : ''}
        <div class="row wrap small" style="margin-bottom:10px"><span class="badge green">ورودی بازه: ${money(d.range.income)}</span><span class="badge red">خروجی بازه: ${money(d.range.expense)}</span><span class="badge gray">${jdate(d.from)} تا ${jdate(d.to)}</span></div>
        <div class="table-wrap" style="max-height:520px"><table class="table"><thead><tr><th>تاریخ</th><th>شرح</th><th>دسته</th><th>مبلغ</th><th></th></tr></thead><tbody id="accBody">
        ${d.ledger.map((t) => `<tr data-acc="${esc(t.title + ' ' + (t.category || ''))}"><td class="tiny">${jshort(t.date)}</td><td class="small">${esc(t.title)}</td><td><span class="badge gray">${esc(t.category || '')}</span></td><td class="${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '−'} ${money(t.amount)}</td><td>${t.ref?.startsWith('pay:') || t.ref?.startsWith('RSH') ? '' : `<button class="icon-btn" data-dt="${t.id}" aria-label="حذف">${icon('trash', { size: 16 })}</button>`}</td></tr>`).join('') || `<tr><td colspan="5">${empty('inbox', 'تراکنشی در این بازه نیست')}</td></tr>`}</tbody></table></div></div>`;
    const { comboChart, donut: adDonut, compact } = await import('./admin-charts.js');
    comboChart($('#chAcc', el), { labels: d.months.map((m) => m.label), bars: [{ name: 'درآمد', color: 'var(--c1)', values: d.months.map((m) => m.income) }, { name: 'هزینه', color: 'var(--c3)', values: d.months.map((m) => m.expense) }], line: { name: 'مانده ماهانه', color: 'var(--c4)', values: d.months.map((m) => m.income - m.expense) }, tipFmt: money, label: 'نمودار درآمد و هزینه' });
    adDonut($('#chCat', el), { segments: d.categories.map((x, i) => ({ name: x.category, value: x.total, color: ['var(--c1)', 'var(--c3)', 'var(--c2)', 'var(--c5)', 'var(--c4)', 'var(--c6)'][i % 6] })), center: { value: fa(d.categories.length), label: 'دسته' }, label: 'ترکیب هزینه‌ها', emptyText: 'هزینه‌ای در این بازه نیست', valueFmt: compact, tipFmt: money });
    $('#applyR', el)?.addEventListener('click', () => { from = readDate(el, 'from') || from; to = readDate(el, 'to') || to; load(); });
    $('#accSearch', el).oninput = (ev) => { const v = ev.target.value.trim(); $$('#accBody tr[data-acc]', el).forEach((tr) => { tr.style.display = tr.dataset.acc.includes(v) ? '' : 'none'; }); };
    $('#accCsv', el).onclick = () => {
      if (!d.ledger.length) return toast('تراکنشی نیست', 'err');
      downloadCsv(`accounting-${d.from}-to-${d.to}.csv`, ['تاریخ', 'شرح', 'دسته', 'نوع', 'مبلغ (تومان)'], d.ledger.map((t) => [jshort(t.date), t.title, t.category || '', t.type === 'income' ? 'درآمد' : 'هزینه', t.amount]));
      toast('فایل اکسل دفتر کل آماده شد', 'ok');
    };
    $('#accPrint', el).onclick = () => printOverlay(`<h2 style="margin:0 0 8px">دفتر کل تراکنش‌ها (${jdate(d.from)} تا ${jdate(d.to)})</h2><p style="font-size:12px">ورودی بازه: ${money(d.range.income)} | خروجی بازه: ${money(d.range.expense)}</p><table class="table" style="width:100%;font-size:12px"><thead><tr><th>تاریخ</th><th>شرح</th><th>دسته</th><th>مبلغ</th></tr></thead><tbody>${d.ledger.map((t) => `<tr><td>${jshort(t.date)}</td><td>${esc(t.title)}</td><td>${esc(t.category || '')}</td><td>${t.type === 'income' ? '+' : '−'} ${money(t.amount)}</td></tr>`).join('')}</tbody></table>`, 'دفتر کل تراکنش‌ها');
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
  el.innerHTML = `<div class="grid c3">${list.map((e) => `<a class="card ad-exam-card ${e.results ? '' : 'tint-violet'}" href="#/comprehensive/${e.id}" style="color:inherit"><div class="row" style="align-items:flex-start"><span class="ib">${icon('trophy', { size: 18 })}</span><div class="grow"><b>${esc(e.title)}</b><div class="tiny muted">پایه ${gradeName(e.grade)} • ${e.exam_date ? jdate(e.exam_date) : '—'} • ${fa(e.qcount)} سؤال</div></div><span class="badge ${e.avg == null ? 'gray' : 'green'}">${e.avg == null ? 'در انتظار' : 'برگزارشده'}</span></div>
    <div class="row between small" style="margin-top:12px"><span>نتیجه: <b>${fa(e.results)}</b> از ${fa(e.candidates)}</span><b>${e.avg == null ? 'برگزار نشده' : `میانگین ${pct(e.avg)}`}</b></div>${progress(e.candidates ? (e.results / e.candidates) * 100 : 0, e.results ? 'green' : '')}</a>`).join('') || `<div class="card">${empty('trophy', 'آزمون جامعی تعریف نشده')}</div>`}</div>`;
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
    '<a class="btn ghost sm" href="#/comprehensive">→ فهرست</a> <button class="btn soft sm" id="cards"> کارت ورود به جلسه</button> <button class="btn ghost sm" id="sheet"> پاسخ‌برگ</button> <button class="btn soft sm" id="compCsv">خروجی اکسل</button> <button class="btn green sm" id="scan"> اسکن و تصحیح</button> <button class="btn ghost sm" id="delComp" style="color:var(--red)">حذف</button>');
  el.innerHTML = `<div class="grid c4">${kpi('users', '', fa(e.students.length), 'داوطلب')}${kpi('check-circle', 'green', fa(e.results.length), 'تصحیح‌شده')}${kpi('chart', 'sun', e.avg == null ? '—' : pct(e.avg), 'میانگین')}${kpi('trophy', 'sun', e.results[0] ? pct(e.results[0].percent) : '—', 'بالاترین درصد')}</div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('zap', { size: 18 })}</span>رتبه‌بندی لحظه‌ای <span class="badge green" id="live">● زنده</span></div><div class="table-wrap"><table class="table"><thead><tr><th>رتبه</th><th>داوطلب</th><th>کلاس</th><th>درست/غلط/نزده</th><th>درصد</th><th>زمان ثبت</th></tr></thead><tbody id="rank"></tbody></table></div></div>`;
  const drawRank = (rs) => { $('#rank', el).innerHTML = rs.map((r) => `<tr><td><b><span class="badge ${r.rank <= 3 ? 'yellow' : 'gray'}" style="min-width:28px;justify-content:center">${fa(r.rank)}</span></b></td><td>${esc(r.full_name)}</td><td>${esc(r.class_name || '')}</td><td><span class="pos">${fa(r.correct)}</span> / <span class="neg">${fa(r.wrong)}</span> / ${fa(r.blank)}</td><td><b>${pct(r.percent)}</b></td><td class="tiny">${timeAgo(r.created_at)}</td></tr>`).join('') || `<tr><td colspan="6">${empty('clock', 'هنوز پاسخ‌برگی تصحیح نشده؛ با «اسکن و تصحیح» شروع کنید')}</td></tr>`; };
  drawRank(e.results);
  const iv = setInterval(async () => { if (!document.body.contains(el)) return clearInterval(iv); try { const x = await api(`/api/manager/comprehensive/${id}`); drawRank(x.results); } catch { clearInterval(iv); } }, 8000);
  $('#scan').onclick = () => openScanner({ exam: e, students: e.students.map((s) => ({ ...s, done: done.has(s.id) })), onSave: (sid, answers) => post(`/api/manager/comprehensive/${id}/result`, { student_id: sid, answers }) }).then(() => compDetail(el, { id }, me));
  $('#sheet').onclick = () => printSheet({ title: `${e.title} - ${me.center.name}`, subtitle: `پایه ${gradeName(e.grade)} • ${fa(e.questions.length)} سؤال`, count: e.questions.length });
  $('#cards').onclick = () => printCards(e, me);
  $('#compCsv').onclick = () => {
    if (!e.results.length) return toast('هنوز نتیجه‌ای ثبت نشده', 'err');
    downloadCsv(`exam-${e.id}.csv`, ['رتبه', 'نام و نام خانوادگی', 'کلاس', 'درست', 'غلط', 'نزده', 'درصد'], e.results.map((r) => [r.rank, r.full_name, r.class_name || '', r.correct, r.wrong, r.blank, r.percent]));
  };
  $('#delComp').onclick = async () => {
    if (!(await confirmBox(`آزمون «${esc(e.title)}» و تمام نتایج آن حذف شود؟`, 'حذف آزمون جامع'))) return;
    await del(`/api/manager/comprehensive/${id}`);
    toast('آزمون حذف شد', 'ok');
    location.hash = '#/comprehensive';
  };
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
  let grade = '', search = '', list = [];
  setHead('عملکرد دانش‌آموزان', 'رتبه‌بندی، میانگین آزمون، غیبت و مطالعه هفته', `<button class="btn sm soft" id="perfCsv">${icon('download', { size: 15 })} خروجی اکسل</button> <button class="btn sm ghost" id="perfPrint">${icon('printer', { size: 15 })} چاپ</button>`);
  el.innerHTML = `<div class="row wrap between" style="margin-bottom:14px;gap:10px"><div class="chips" id="perfChips"><button class="chip on" data-g="">همه</button>${md.grades.map((g) => `<button class="chip" data-g="${g}">پایه ${gradeName(g)}</button>`).join('')}</div><input class="input sm" id="perfSearch" placeholder="جست‌وجوی نام یا کلاس…" style="width:200px"></div>
    <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>رتبه پایه</th><th>دانش‌آموز</th><th>کلاس</th><th>امتیاز</th><th>سطح</th><th>میانگین آزمون</th><th>غیبت ماه</th><th>مطالعه هفته</th></tr></thead><tbody id="perfBody"></tbody></table></div></div>`;
  const drawRows = () => {
    const filtered = search ? list.filter((s) => (s.full_name || '').includes(search) || (s.class_name || '').includes(search)) : list;
    $('#perfBody', el).innerHTML = filtered.map((s) => `<tr><td><b>${fa(s.rank)}</b></td><td>${esc(s.full_name)}</td><td>${gradeName(s.grade)} ${esc(s.class_name)}</td><td><b>${fa(s.points)}</b></td><td>${s.level.name}</td><td>${s.avg_percent == null ? '—' : pct(s.avg_percent)}</td><td>${fa(s.absences)}</td><td>${fa(s.week_minutes)} دقیقه</td></tr>`).join('') || `<tr><td colspan="8">${empty('search', 'موردی یافت نشد')}</td></tr>`;
  };
  const load = async () => {
    list = await api(`/api/manager/performance${grade ? `?grade=${grade}` : ''}`);
    drawRows();
  };
  on(el, 'click', '[data-g]', (e, b) => { grade = b.dataset.g; $$('#perfChips .chip', el).forEach((x) => x.classList.toggle('on', x === b)); load(); });
  $('#perfSearch', el).oninput = (ev) => { search = ev.target.value.trim(); drawRows(); };
  $('#perfCsv').onclick = () => {
    if (!list.length) return toast('داده‌ای نیست', 'err');
    downloadCsv('performance.csv', ['رتبه', 'نام', 'پایه', 'کلاس', 'امتیاز', 'سطح', 'میانگین آزمون', 'غیبت', 'مطالعه هفته'], list.map((s) => [s.rank, s.full_name, gradeName(s.grade), s.class_name || '', s.points, s.level.name, s.avg_percent ?? '', s.absences, s.week_minutes]));
  };
  $('#perfPrint').onclick = () => printOverlay(`<h2 style="margin:0 0 12px">گزارش عملکرد دانش‌آموزان</h2><table class="table" style="width:100%;font-size:12px"><thead><tr><th>رتبه</th><th>نام</th><th>کلاس</th><th>امتیاز</th><th>میانگین آزمون</th><th>غیبت</th></tr></thead><tbody>${list.map((s) => `<tr><td>${fa(s.rank)}</td><td>${esc(s.full_name)}</td><td>${gradeName(s.grade)} ${esc(s.class_name || '')}</td><td>${fa(s.points)}</td><td>${s.avg_percent == null ? '—' : pct(s.avg_percent)}</td><td>${fa(s.absences)}</td></tr>`).join('')}</tbody></table>`, 'عملکرد دانش‌آموزان');
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
    actions: [
      ...(p.id ? [{ label: 'حذف محصول', cls: 'danger soft', onClick: async () => { if (!confirm(`محصول «${esc(p.title)}» حذف شود؟`)) return false; await del(`/api/manager/products/${p.id}`); toast('محصول حذف شد', 'ok'); shopAdmin(el, _p, me); return true; } }] : []),
      { label: 'انصراف', cls: 'ghost', value: false },
      { label: ' ذخیره', onClick: async (m) => { const f = formData($('#pf', m)); await post('/api/manager/products', { ...f, id: p.id, active: f.active === '1' }); toast('ذخیره شد', 'ok'); shopAdmin(el, _p, me); } }
    ],
  });
  $('#addP').onclick = () => pModal();
  on(el, 'click', '[data-ep]', (e, b) => pModal(d.products.find((p) => p.id === Number(b.dataset.ep))));
  on(el, 'click', '[data-dcode]', (e, b) => busy(b, async () => { await del(`/api/manager/discount-codes/${encodeURIComponent(b.dataset.dcode)}`); shopAdmin(el, _p, me); }));
  $('#codeForm', el).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post('/api/manager/discount-codes', formData(e.target)); shopAdmin(el, _p, me); }); };
}

// حساب‌های مستقل مشاور؛ تنها مدیر کانون به ساخت و ویرایش دسترسی دارد.
async function counselors(el, params, me) {
  setHead('مدیریت مشاوران', 'ساخت حساب مشاور تحصیلی برای دانش‌آموزان کانون', '<button class="btn sm" id="newCounselor">مشاور جدید</button> <details class="ad-dd"><summary class="btn ghost sm" aria-label="امکانات بیشتر">' + icon('more', { size: 17 }) + '</summary><div class="ad-dd-menu"><button type="button" id="delAllCo" class="danger">' + icon('trash', { size: 16 }) + ' حذف همهٔ مشاوران…</button></div></details>');
  $('#delAllCo').onclick = () => deleteAll('counselors', 'مشاوران', () => counselors(el, params, me));
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

// ================= نسخهٔ کلاسیک صفحه‌ها (ظاهر کلاسیک پنل مدیر؛ بدون تغییر نسبت به نسخهٔ پیشین) =================
async function homeClassic(el, _p, me) {
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
  on(el, 'click', '[data-sms]', (e, b) => busy(b, async () => { const r = await post(`/api/manager/attendance/${b.dataset.sms}/sms`); toast(r.failed ? `ارسال نشد: ${r.errors[0] || 'خطای درگاه پیامک'}` : r.simulated ? 'ارسال شبیه‌سازی شد (درگاه پیامک تنظیم نیست)' : 'پیامک ارسال شد', r.failed ? 'err' : 'ok'); homeClassic(el, _p, me); }));
  $('#smsAll', el)?.addEventListener('click', (e) => busy(e.currentTarget, async () => { const r = await post('/api/manager/attendance/all/sms'); toast(r.failed ? `${fa(r.sent)} ارسال شد، ${fa(r.failed)} ناموفق: ${r.errors[0] || ''}` : `${fa(r.sent)} پیامک ${r.simulated ? 'شبیه‌سازی' : 'ارسال'} شد`, r.failed ? 'err' : 'ok'); homeClassic(el, _p, me); }));
}

async function studentsClassic(el) {
  let md = await meta();
  const q = { q: '', grade: '', class_id: '', school: '', gender: '', offset: 0 };
  let rows = [], total = 0;
  const sel = new Set();
  setHead('مدیریت دانش‌آموزان', 'ثبت‌نام، ویرایش، جستجو و فیلتر', `<button class="btn ghost sm" id="printCreds">${icon('receipt', { size: 16 })} چاپ کارت‌های ورود</button> <button class="btn ghost sm" id="importSt">ثبت‌نام گروهی (اکسل / CSV)</button> <button class="btn ghost sm" id="classesSt">کلاس‌ها</button> <button class="btn ghost sm" id="syncClassroom">همگام‌سازی کلاس آنلاین</button> <button class="btn ghost sm" id="delAllSt" style="color:var(--red)">حذف همه</button> <button class="btn sm" id="addSt"> ثبت‌نام دانش‌آموز</button>`);
  el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row wrap"><input class="input grow" id="q" placeholder=" جستجوی زنده نام یا کد ملی…" style="min-width:220px">
    <select class="input" id="fg" style="width:auto"><option value="">همه پایه‌ها</option>${md.grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select>
    <select class="input" id="fc" style="width:auto"><option value="">همه کلاس‌ها</option></select>
    <select class="input" id="fgender" style="width:auto"><option value="">همهٔ جنسیت‌ها</option><option value="m">پسر</option><option value="f">دختر</option></select>
    <select class="input" id="fs" style="width:auto;max-width:220px"><option value="">همه مدارس</option>${md.schools.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div></div>
    <div class="card"><div class="row between" style="margin-bottom:10px"><b id="total"></b><div class="row wrap" style="gap:6px"><span class="small muted" id="bulkInfo"></span><button class="btn sm green" data-bulk="paid">حق عضویت: پرداخت شد</button><button class="btn sm ghost" data-bulk="unpaid">لغو پرداخت</button><button class="btn sm soft" data-bulk="move">انتقال به کلاس…</button><button class="btn sm red" data-bulk="delete">حذف…</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th style="width:34px"><input type="checkbox" id="selAll" aria-label="انتخاب همهٔ ردیف‌های نمایش‌داده‌شده"></th><th>دانش‌آموز</th><th>کد ملی</th><th>پایه/کلاس</th><th>مدرسه</th><th>موبایل والدین</th><th>حق عضویت</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>
    <div class="center" style="margin-top:12px"><button class="btn ghost" id="more">نمایش بیشتر</button></div></div>`;
  const fillClasses = () => { $('#fc', el).innerHTML = `<option value="">همه کلاس‌ها</option>${md.classes.filter((c) => !q.grade || c.grade === Number(q.grade)).map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}`; };
  fillClasses();
  const rowHtml = (s) => `<tr><td><input type="checkbox" data-sel="${s.id}" ${sel.has(s.id) ? 'checked' : ''} aria-label="انتخاب ${esc(s.full_name)}"></td><td class="click" data-view="${s.id}"><b>${esc(s.full_name)}</b></td><td class="num">${fa(s.national_code)}</td><td>${gradeName(s.grade)} ${esc(s.class_name || '—')}<div class="tiny muted">پنل ${s.grade <= 6 ? 'دبستان' : 'متوسطه'}</div></td><td class="small">${esc(s.school || '')}</td><td class="num">${fa(s.parent_phone)}</td>
    <td><span class="badge ${PAY[s.pay][1]}">${PAY[s.pay][0]}</span>${s.prev_unpaid ? `<div style="margin-top:3px"><span class="badge orange" style="font-size:10px">طلب ماه قبل</span></div>` : ''}</td><td><div class="row" style="gap:4px;align-items:center"><button class="btn sm soft" data-pay-fee="${s.id}" title="پرداخت شهریه" style="padding:3px 10px;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0">${icon('banknote', { size: 15 })} پرداخت شهریه</button><button class="icon-btn" data-paid="${s.id}" title="${s.pay === 'paid' ? 'لغو پرداخت حق عضویت' : 'ثبت پرداخت حق عضویت'}" aria-label="${s.pay === 'paid' ? 'لغو پرداخت حق عضویت' : 'ثبت پرداخت حق عضویت'}">${icon(s.pay === 'paid' ? 'x' : 'check-circle', { size: 16 })}</button><button class="icon-btn" data-sms="${s.id}" title="ارسال پیامک" aria-label="ارسال پیامک">${icon('message', { size: 16 })}</button><button class="icon-btn" data-imp="${s.id}" title="ورود به پنل دانش‌آموز" aria-label="ورود به پنل دانش‌آموز">${icon('user-check', { size: 17 })}</button><button class="icon-btn" data-edit="${s.id}" title="ویرایش" aria-label="ویرایش">${icon('edit', { size: 16 })}</button><button class="icon-btn" data-del="${s.id}" title="حذف" aria-label="حذف">${icon('trash', { size: 16 })}</button></div></td></tr>`;
  let seq = 0;
  const load = async (append) => {
    const my = ++seq;
    if (!append) q.offset = 0;
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: 40 })}`);
    if (my !== seq) return;
    rows = append ? rows.concat(r.rows) : r.rows; total = r.total;
    $('#tb', el).innerHTML = rows.map(rowHtml).join('') || `<tr><td colspan="8">${empty('search', 'دانش‌آموزی با این مشخصات پیدا نشد')}</td></tr>`;
    $('#total', el).textContent = `${fa(total)} دانش‌آموز`;
    $('#more', el).style.display = rows.length < total ? '' : 'none';
    $('#selAll', el).checked = false;
    bulkInfo();
  };
  let tmr;
  $('#q', el).oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { q.q = en(e.target.value.trim()); load(); }, 220); };
  $('#fg', el).onchange = (e) => { q.grade = e.target.value; q.class_id = ''; fillClasses(); load(); };
  $('#fc', el).onchange = (e) => { q.class_id = e.target.value; load(); };
  $('#fs', el).onchange = (e) => { q.school = e.target.value; load(); };
  $('#fgender', el).onchange = (e) => { q.gender = e.target.value; load(); };
  $('#more', el).onclick = () => { q.offset = rows.length; load(true); };
  load();

  // ----- انتخاب و عملیات گروهی (روی انتخاب‌شده‌ها، یا اگر چیزی انتخاب نشده بود روی همهٔ نتایج فیلتر فعلی) -----
  const filtered = () => !!(q.q || q.grade || q.class_id || q.school || q.gender);
  const target = () => (sel.size ? { ids: [...sel] } : { filter: { q: q.q, grade: q.grade, class_id: q.class_id, school: q.school, gender: q.gender } });
  const targetLabel = () => (sel.size ? `${fa(sel.size)} دانش‌آموز انتخاب‌شده` : filtered() ? `همهٔ ${fa(total)} دانش‌آموزِ نتیجهٔ فیلتر` : `همهٔ ${fa(total)} دانش‌آموز`);
  function bulkInfo() { $('#bulkInfo', el).textContent = `عملیات روی: ${targetLabel()}`; }
  on(el, 'change', '[data-sel]', (e, b) => { const id = Number(b.dataset.sel); if (b.checked) sel.add(id); else sel.delete(id); bulkInfo(); });
  $('#selAll', el).onchange = (e) => { $$('[data-sel]', el).forEach((b) => { b.checked = e.target.checked; const id = Number(b.dataset.sel); if (b.checked) sel.add(id); else sel.delete(id); }); bulkInfo(); };
  const afterBulk = () => { sel.clear(); metaCache = null; load(); };
  on(el, 'click', '[data-bulk]', async (e, b) => {
    if (!total) { toast('دانش‌آموزی برای این عملیات نیست'); return; }
    const kind = b.dataset.bulk, label = targetLabel();
    if (kind === 'paid' || kind === 'unpaid') {
      const paid = kind === 'paid';
      if (!(await confirmBox(paid ? `حق عضویت ${label} «پرداخت‌شده» ثبت شود؟ درآمد آن در حسابداری هم ثبت می‌شود و در پنل دانش‌آموز «پرداخت شده» دیده می‌شود.` : `پرداخت حق عضویت ${label} لغو شود؟ برای هر مورد سند اصلاحی در حسابداری ثبت می‌شود.`, paid ? 'ثبت پرداخت' : 'لغو پرداخت'))) return;
      const r = await post('/api/manager/students/fee-paid', { ...target(), paid });
      toast(paid ? `${fa(r.changed)} نفر پرداخت‌شده شد${r.already ? ` (${fa(r.already)} نفر از قبل پرداخت‌شده بودند)` : ''}${r.unset ? ` — برای ${fa(r.unset)} نفر مبلغ پایه هنوز تعیین نشده؛ بعد از تعیین مبلغ در «حق عضویت»، حسابداری خودکار کامل می‌شود` : ''}` : `پرداخت ${fa(r.changed)} نفر لغو شد`, 'ok', 7000);
      afterBulk();
    } else if (kind === 'move') {
      await modal({ title: `انتقال ${label} به کلاس`, body: `<div class="field"><label for="mvCls">کلاس مقصد (پایهٔ دانش‌آموز هم متناسب با کلاس تغییر می‌کند)</label><select class="input" id="mvCls">${md.classes.map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)} (${fa(c.students)} نفر)</option>`).join('')}</select></div>`,
        actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'انتقال', onClick: async (m) => { const r = await post('/api/manager/students/move', { ...target(), class_id: Number($('#mvCls', m).value) }); toast(`${fa(r.moved)} نفر منتقل شد`, 'ok'); afterBulk(); } }] });
    } else if (kind === 'delete') {
      await modal({ title: `حذف ${label}`, body: `<p class="small" style="margin-top:0;line-height:2">${label} با همهٔ سوابقشان (امتیاز، آزمون، پرداخت) <b>برای همیشه</b> حذف می‌شوند. اسناد حسابداری باقی می‌ماند.</p><div class="field"><label for="dsWord">برای تأیید، کلمهٔ «حذف» را بنویسید</label><input class="input" id="dsWord" autocomplete="off"></div>`,
        actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'حذف', cls: 'red', onClick: async (m) => {
          if ($('#dsWord', m).value.trim() !== 'حذف') { toast('برای تأیید، کلمهٔ «حذف» را بنویسید', 'err'); return false; }
          const r = await post('/api/manager/students/delete', { ...target(), confirm: true }); toast(`${fa(r.deleted)} دانش‌آموز حذف شد`, 'ok'); afterBulk();
        } }] });
    }
  });
  const openPayFeeModal = async (sid) => {
    const s = rows.find((x) => x.id === sid);
    if (!s) return;
    const det = await api(`/api/manager/students/${sid}`).catch(() => ({ fee: {} }));
    const fee = det.fee || {};
    const pays = fee.payments || [];
    const curPer = fee.current_period || curPeriod || 'ماه جاری';
    const prevPer = fee.prev_period || prevPeriod || 'ماه قبل';
    const isPaid = s.pay === 'paid';
    const defaultPer = s.prev_unpaid ? prevPer : curPer;
    const pBadge = { approved: ['تأییدشده', 'green'], pending: ['در انتظار', 'orange'], rejected: ['ردشده', 'red'], reversed: ['لغوشده', 'gray'] };
    modal({
      title: `پرداخت شهریه — ${esc(s.full_name)}`,
      wide: true,
      body: `<form id="payFeeForm" class="stack">
        <div class="row between" style="padding:10px;background:var(--bg-card,#f4f8fd);border:1px solid var(--line,#d5e3f4);border-radius:12px;margin-bottom:8px">
          <div>
            <b>${esc(s.full_name)}</b>
            <div class="tiny muted">کد ملی: ${fa(s.national_code)} · پایه ${gradeName(s.grade)} ${esc(s.class_name || '')}</div>
          </div>
          <div style="text-align:left">
            <span class="badge ${PAY[s.pay][1]}">${esc(curPer)}: ${PAY[s.pay][0]}</span>
            ${s.prev_unpaid ? `<div style="margin-top:4px"><span class="badge orange">طلبکار از ${esc(prevPer)}</span></div>` : ''}
          </div>
        </div>
        ${s.prev_unpaid ? `<div class="card flat" style="padding:8px 12px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-size:12px">این دانش‌آموز هنوز شهریه ماه قبل (<b>${esc(prevPer)}</b>) را پرداخت نکرده است.</div>` : ''}
        <div class="field">
          <label for="pfPeriod">بابت دوره / ماه</label>
          <div class="row wrap" style="gap:6px;margin-bottom:6px">
            <button type="button" class="btn sm soft" data-set-per="${esc(curPer)}">${esc(curPer)} (ماه جاری)</button>
            ${prevPer ? `<button type="button" class="btn sm soft" data-set-per="${esc(prevPer)}">${esc(prevPer)} (ماه قبل)</button>` : ''}
            <button type="button" class="btn sm soft" data-set-per="کل سال">کل سال</button>
          </div>
          <input class="input" id="pfPeriod" name="period" value="${esc(defaultPer)}" placeholder="مثلاً: آذر ۱۴۰۵، آبان ۱۴۰۵، یا کل سال">
        </div>
        <div class="form-grid">
          <div class="field"><label for="pfMethod">روش پرداخت</label><select class="input" id="pfMethod" name="method"><option value="card">کارت‌به‌کارت / انتقال بانکی</option><option value="cash">نقدی</option><option value="pos">دستگاه پوز کانون</option><option value="buffet">بوفه کانون</option></select></div>
          <div class="field"><label for="pfNote">شماره پیگیری / یادداشت</label><input class="input" id="pfNote" name="note" placeholder="اختیاری"></div>
        </div>
        <div style="margin-top:8px">
          <b class="small">سوابق پرداخت شهریه ثبت‌شده (${fa(pays.length)} مورد):</b>
          <div class="table-wrap" style="max-height:180px;overflow-y:auto;margin-top:6px">
            <table class="table"><thead><tr><th>دوره/ماه</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th></tr></thead><tbody>
              ${pays.map((p) => `<tr><td>${esc(p.period || '—')}</td><td class="num">${p.amount ? money(p.amount) : 'ثبت‌شده'}</td><td><span class="badge ${(pBadge[p.status] || ['—', 'gray'])[1]}">${(pBadge[p.status] || [p.status])[0]}</span></td><td class="tiny">${jdate(p.reviewed_at || p.created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="center muted small">هنوز پرداختی ثبت نشده است</td></tr>'}
            </tbody></table>
          </div>
        </div>
      </form>`,
      onOpen: (m) => {
        on(m, 'click', '[data-set-per]', (ev, bt) => { $('#pfPeriod', m).value = bt.dataset.setPer; });
      },
      actions: [
        ...(isPaid ? [{
          label: 'لغو پرداخت ماه جاری',
          cls: 'danger soft',
          onClick: async () => {
            if (!confirm(`آیا پرداخت شهریه «${esc(s.full_name)}» لغو شود؟`)) return false;
            await post('/api/manager/students/fee-paid', { ids: [s.id], paid: false });
            toast('پرداخت شهریه لغو شد', 'ok');
            load();
            return true;
          }
        }] : []),
        { label: 'انصراف', cls: 'ghost', value: false },
        {
          label: 'تأیید و ثبت پرداخت شهریه',
          cls: 'green',
          onClick: async (m) => {
            const period = $('#pfPeriod', m).value.trim() || curPer;
            await post('/api/manager/students/fee-paid', { ids: [s.id], paid: true, period });
            toast(`پرداخت شهریه (${period}) برای «${s.full_name}» ثبت شد`, 'ok');
            load();
            return true;
          }
        }
      ]
    });
  };
  on(el, 'click', '[data-pay-fee]', (e, b) => openPayFeeModal(Number(b.dataset.payFee)));
  on(el, 'click', '[data-paid]', (e, b) => busy(b, async () => {
    const s = rows.find((x) => x.id === Number(b.dataset.paid)), paid = s.pay !== 'paid';
    if (!paid && !(await confirmBox(`پرداخت حق عضویت «${esc(s.full_name)}» لغو شود؟ سند اصلاحی ثبت می‌شود.`, 'لغو پرداخت'))) return;
    const r = await post('/api/manager/students/fee-paid', { ids: [s.id], paid });
    toast(paid ? (r.unset ? 'پرداخت‌شده ثبت شد؛ مبلغ پایه هنوز تعیین نشده (بعداً در حسابداری کامل می‌شود)' : 'حق عضویت پرداخت‌شده ثبت شد و در حسابداری آمد') : 'پرداخت لغو شد', 'ok', 5000);
    load();
  }));
  if ($('#exportStCsv')) $('#exportStCsv').onclick = async () => {
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: 100, offset: 0 })}`);
    if (!r.rows.length) return toast('دانش‌آموزی برای خروجی نیست', 'err');
    downloadCsv(`students-${curPeriod || 'list'}.csv`,
      ['نام و نام خانوادگی', 'کد ملی', 'پایه', 'کلاس', 'مدرسه', 'موبایل والدین', 'وضعیت ماه جاری', 'طلب ماه قبل'],
      r.rows.map((s) => [s.full_name, s.national_code, gradeName(s.grade), s.class_name || '', s.school || '', s.parent_phone || '', PAY[s.pay]?.[0] || s.pay, s.prev_unpaid ? 'بله' : 'خیر']));
    toast('فایل اکسل (CSV) آماده شد', 'ok');
  };
  if ($('#printStList')) $('#printStList').onclick = async () => {
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: 100, offset: 0 })}`);
    if (!r.rows.length) return toast('دانش‌آموزی برای چاپ نیست', 'err');
    printOverlay(`<h2 style="margin:0 0 12px">فهرست دانش‌آموزان (${fa(r.rows.length)} نفر)</h2>
      <table class="table" style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>ردیف</th><th>نام و نام خانوادگی</th><th>کد ملی</th><th>پایه و کلاس</th><th>موبایل</th><th>وضعیت شهریه</th></tr></thead>
      <tbody>${r.rows.map((s, i) => `<tr><td>${fa(i + 1)}</td><td>${esc(s.full_name)}</td><td>${fa(s.national_code)}</td><td>${gradeName(s.grade)} ${esc(s.class_name || '—')}</td><td>${fa(s.parent_phone || '—')}</td><td>${PAY[s.pay]?.[0] || s.pay}${s.prev_unpaid ? ' (طلب ماه قبل)' : ''}</td></tr>`).join('')}</tbody></table>`, 'فهرست دانش‌آموزان');
  };
  $('#syncClassroom').onclick = (e) => busy(e.currentTarget, async () => {
    const r = await post('/api/manager/classroom/sync');
    toast(`${fa(r.total)} دانش‌آموز با کلاس آنلاین همگام شد (جدید ${fa(r.created)}، به‌روز ${fa(r.updated)}${r.removed ? `، حذف‌شده ${fa(r.removed)}` : ''})`, 'ok', 6000);
  });
  $('#delAllSt').onclick = () => { sel.clear(); deleteStudentsAll(); };
  const deleteStudentsAll = () => modal({ title: 'حذف همهٔ دانش‌آموزان', body: `<p class="small" style="margin-top:0;line-height:2">همهٔ دانش‌آموزان این کانون با همهٔ سوابقشان <b>برای همیشه</b> حذف می‌شوند (فیلتر فعلی نادیده گرفته می‌شود). اسناد حسابداری باقی می‌ماند.</p><div class="field"><label for="daWord">برای تأیید، کلمهٔ «حذف» را بنویسید</label><input class="input" id="daWord" autocomplete="off"></div>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'حذف همه', cls: 'red', onClick: async (m) => {
      if ($('#daWord', m).value.trim() !== 'حذف') { toast('برای تأیید، کلمهٔ «حذف» را بنویسید', 'err'); return false; }
      const r = await post('/api/manager/students/delete', { all: true, confirm: true }); toast(`${fa(r.deleted)} دانش‌آموز حذف شد`, 'ok'); afterBulk();
    } }] });

  // ----- کلاس‌ها: چند کلاس برای هر پایه، تقسیم خودکار دانش‌آموزان -----
  $('#classesSt').onclick = () => {
    const body = () => `<div class="stack"><div class="row between wrap" style="gap:8px"><span class="small muted">تقسیم بر اساس جنسیت برای همهٔ پایه‌ها (کلاس‌های الف و ب در صورت نبودن ساخته می‌شوند)</span><button class="btn sm" data-gsplit="all">همهٔ پایه‌ها: پسر الف، دختر ب</button></div>${md.grades.map((g) => { const cl = md.classes.filter((c) => c.grade === g); return `<div class="card flat" style="padding:10px"><div class="row between wrap" style="gap:8px"><b>پایه ${gradeName(g)}</b><span class="row wrap" style="gap:6px"><input class="input" data-newname="${g}" placeholder="نام کلاس جدید (مثلاً ب)" style="width:170px" maxlength="30"><button class="btn sm" data-addcls="${g}">افزودن کلاس</button><button class="btn sm soft" data-gsplit="${g}">پسر الف، دختر ب</button>${cl.length > 1 ? `<button class="btn sm soft" data-dist="${g}">تقسیم خودکار بین ${fa(cl.length)} کلاس</button>` : ''}</span></div>
      <div class="row wrap" style="gap:6px;margin-top:8px">${cl.map((c) => `<span class="badge">${esc(c.name)} · ${fa(c.students)} نفر <button class="icon-btn" data-editcls="${c.id}" data-cname="${esc(c.name)}" data-cgrade="${c.grade}" aria-label="ویرایش نام کلاس ${esc(c.name)}">${icon('edit', { size: 13 })}</button>${c.students ? '' : ` <button class="icon-btn" data-delcls="${c.id}" aria-label="حذف کلاس ${esc(c.name)}">${icon('trash', { size: 14 })}</button>`}</span>`).join('') || '<span class="small muted">کلاسی نیست</span>'}</div></div>`; }).join('')}
      <p class="small muted" style="margin:0;line-height:2">برای هر پایه چند کلاس بسازید، سپس «تقسیم خودکار» دانش‌آموزان را بین کلاس‌ها پخش می‌کند. برای جابه‌جایی دلخواه، در فهرست دانش‌آموزان چند نفر را تیک بزنید و «انتقال به کلاس» را بزنید.</p></div>`;
    modal({ title: 'کلاس‌های هر پایه', wide: true, body: `<div id="clsBody">${body()}</div>`, actions: [{ label: 'بستن', value: true }], onOpen: (m) => {
      const redraw = async () => { metaCache = null; md = await meta(); $('#clsBody', m).innerHTML = body(); fillClasses(); load(); };
      on(m, 'click', '[data-addcls]', (ev, b) => busy(b, async () => {
        const g = Number(b.dataset.addcls), name = $(`[data-newname="${g}"]`, m).value.trim();
        if (!name) { toast('نام کلاس را بنویسید'); return; }
        await post('/api/manager/classes', { grade: g, name }); toast('کلاس ساخته شد', 'ok'); await redraw();
      }));
      on(m, 'click', '[data-delcls]', (ev, b) => busy(b, async () => { await del(`/api/manager/classes/${b.dataset.delcls}`); toast('کلاس حذف شد', 'ok'); await redraw(); }));
      on(m, 'click', '[data-editcls]', (ev, b) => {
        const cid = b.dataset.editcls, oldName = b.dataset.cname || '', grade = Number(b.dataset.cgrade);
        modal({ title: 'ویرایش نام کلاس', body: `<div class="field"><label for="edClsN">نام جدید کلاس (پایه ${gradeName(grade)})</label><input class="input" id="edClsN" value="${esc(oldName)}" maxlength="30" required></div>`,
          actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره', onClick: async (em) => {
            const name = $('#edClsN', em).value.trim(); if (!name) { toast('نام کلاس را بنویسید'); return false; }
            await put(`/api/manager/classes/${cid}`, { name, grade }); toast('نام کلاس ویرایش شد', 'ok'); await redraw();
          } }] });
      });
      on(m, 'click', '[data-gsplit]', (ev, b) => busy(b, async () => {
        const g = b.dataset.gsplit, all_ = g === 'all';
        if (!(await confirmBox(`${all_ ? 'در همهٔ پایه‌ها' : `در پایهٔ ${gradeName(Number(g))}`} همهٔ پسرها به کلاس «الف» و همهٔ دخترها به کلاس «ب» منتقل شوند؟ کلاس فعلی دانش‌آموزان تغییر می‌کند.`, 'انتقال'))) return;
        const r = await post('/api/manager/classes/split-gender', all_ ? {} : { grade: Number(g) });
        toast(`${fa(r.boys)} پسر در «الف» و ${fa(r.girls)} دختر در «ب» قرار گرفتند${r.classes_created ? ` (${fa(r.classes_created)} کلاس تازه ساخته شد)` : ''}`, 'ok', 6000); await redraw();
      }));
      on(m, 'click', '[data-dist]', (ev, b) => busy(b, async () => {
        const g = Number(b.dataset.dist), cl = md.classes.filter((c) => c.grade === g);
        if (!(await confirmBox(`دانش‌آموزان پایهٔ ${gradeName(g)} به‌ترتیب حروف الفبا (دختر و پسر جداگانه) بین ${fa(cl.length)} کلاس پخش شوند؟ کلاس فعلی همهٔ آن‌ها تغییر می‌کند.`, 'تقسیم خودکار'))) return;
        const r = await post('/api/manager/classes/distribute', { grade: g, class_ids: cl.map((c) => c.id) }); toast(`${fa(r.moved)} نفر بین کلاس‌ها تقسیم شدند`, 'ok'); await redraw();
      }));
    } });
  };

  const save = async (m, id) => {
    const body = readStudent(m);
    if (id) { await put(`/api/manager/students/${id}`, body); toast('اطلاعات ذخیره شد', 'ok'); }
    else { const r = await post('/api/manager/students', body); await modal({ title: ' ثبت‌نام انجام شد', body: `<div class="stack small"><div>${icon('backpack', { size: 16 })} ${esc(r.credentials.student)}</div></div>`, actions: [{ label: 'باشه', value: true }] }); }
    metaCache = null; load();
  };
  $('#importSt').onclick = () => modal({
    title: 'ثبت‌نام گروهی از فایل اکسل یا CSV', wide: true,
    body: `<div class="stack"><p class="small muted" style="margin:0;line-height:2">هر فایل اکسل (xlsx) یا CSV را بدهید؛ سامانه ستون‌ها را خودش از روی عنوان و محتوا تشخیص می‌دهد (نام و نام خانوادگی در یک ستون، کد ملی، شماره تماس، پایه، جنسیت، کلاس، نام پدر و مادر، مدرسه، تاریخ تولد، نشانی، شهریه پرداخت‌شده و …) و پیش از ثبت نشانتان می‌دهد. فقط <b>نام و نام خانوادگی</b> و <b>کد ملی</b> لازم است؛ هر اطلاعات دیگری در فایل باشد در پروفایل ثبت می‌شود و جاهای خالی اجباری نیستند. نام کاربری و رمز اولیهٔ همه کد ملی است. اگر دانش‌آموزی قبلاً ثبت شده باشد دوباره ساخته نمی‌شود، ولی کلاس، وضعیت پرداخت و اطلاعات خالی‌اش با فایل به‌روز می‌شود.
      <a href="/samples/students-template.csv" download>دانلود فایل نمونه</a></p>
      <div class="field"><label for="csvFile">فایل اکسل یا CSV</label><input class="input" type="file" id="csvFile" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
      <div class="form-grid"><div class="field"><label for="impGrade">این فایل مربوط به کدام پایه است؟</label><select class="input" id="impGrade"><option value="">— از روی ستون پایهٔ فایل تشخیص بده</option>${md.grades.map((g) => `<option value="${g}">فقط پایهٔ ${gradeName(g)} (همهٔ ردیف‌ها در این پایه ثبت شوند)</option>`).join('')}</select></div>
        <div class="field"><label for="impGender">اگر جنسیت در فایل نیست یا خالی است</label><select class="input" id="impGender"><option value="">پسر (در گزارش هشدار داده می‌شود)</option><option value="f">دختر</option><option value="m">پسر</option></select></div>
        <div class="field"><label for="impMonth">اگر فایل ستون ماه‌ها دارد، پرداخت کدام ماه؟</label><select class="input" id="impMonth"><option value="">ماه جاری</option>${JMONTHS.map((m) => `<option>${m}</option>`).join('')}</select></div></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="impLenient"> <span class="small">کد ملی‌هایی که ارقام کنترلی‌شان درست نیست (اما ۱۰ رقم‌اند) هم ثبت شوند؛ با هشدار</span></label>
      <div id="csvOut" aria-live="polite"></div></div>`,
    actions: [{ label: 'بستن', cls: 'ghost', value: false },
      { label: 'بررسی بدون ثبت', cls: 'soft', onClick: (m) => runImport(m, true) },
      { label: 'ثبت دانش‌آموزان', onClick: (m) => runImport(m, false) }],
  });
  async function runImport(m, dry) {
    const f = $('#csvFile', m).files[0];
    if (!f) throw new Error('ابتدا فایل را انتخاب کنید');
    const r = await post('/api/manager/students/import', { ...(await readImportFile(f)), dry_run: dry, force_grade: $('#impGrade', m).value, default_gender: $('#impGender', m).value, fee_month: $('#impMonth', m).value, lenient_nc: $('#impLenient', m).checked });
    const bad = r.errors.filter((e) => !e.warning), warn = r.errors.filter((e) => e.warning);
    $('#csvOut', m).innerHTML = `<div class="stack" style="gap:var(--s-3)">
      <div class="table-wrap" style="max-height:200px"><table class="table"><thead><tr><th>ستون فایل</th><th>تشخیص سامانه</th><th></th></tr></thead><tbody>${r.mapping.map((x) => `<tr><td>${esc(x.header)}</td><td><b>${esc(x.label)}</b></td><td class="tiny muted">${x.how === 'header' ? 'از روی عنوان' : 'از روی محتوا'}</td></tr>`).join('')}</tbody></table></div>
      ${r.fee_month ? `<div class="tiny">ستون‌های ماه در فایل پیدا شد؛ وضعیت پرداخت از ستون <b>${esc(r.fee_month)}</b> خوانده شد.</div>` : ''}
      ${r.unmapped.length ? `<div class="tiny muted">ستون‌های نادیده‌گرفته‌شده: ${r.unmapped.map(esc).join('، ')}</div>` : ''}
      <div class="row wrap" style="gap:var(--s-2)"><span class="badge">${fa(r.total)} ردیف</span>
        <span class="badge green">${dry ? 'دانش‌آموز جدید' : 'ثبت‌شده'}: ${fa(dry ? r.valid : r.created)}</span>
        ${(dry ? r.will_update : r.updated) ? `<span class="badge blue">${dry ? 'موجود، قابل به‌روزرسانی' : 'به‌روزرسانی‌شده'}: ${fa(dry ? r.will_update : r.updated)}</span>` : ''}
        ${r.paid_in_file ? `<span class="badge green">شهریه پرداخت‌شده در فایل: ${fa(r.paid_in_file)}</span>` : ''}
        ${!dry && r.fee_paid_recorded ? `<span class="badge green">پرداخت ثبت‌شده: ${fa(r.fee_paid_recorded)}</span>` : ''}
        ${!dry && r.classes_created ? `<span class="badge gray">کلاس تازه: ${fa(r.classes_created)}</span>` : ''}
        ${bad.length ? `<span class="badge red">خطا: ${fa(bad.length)}</span>` : ''}</div>
      ${r.gender_guessed ? `<p class="small" style="margin:0;color:#c2410c">جنسیت ${fa(r.gender_guessed)} نفر در فایل نبود و «پسر» ثبت ${dry ? 'می‌شود' : 'شد'}. اگر دختر هستند، بالا «دختر» را انتخاب کنید یا ستون جنسیت را به فایل اضافه کنید.</p>` : ''}
      ${!dry && r.fee_paid_unset ? `<p class="small" style="margin:0;color:#c2410c">برای ${fa(r.fee_paid_unset)} نفر شهریه «پرداخت‌شده» ثبت شد ولی مبلغ حق عضویت پایه‌شان هنوز تعیین نشده. بعد از تعیین مبلغ در «حق عضویت»، مبلغ و سند حسابداری خودکار کامل می‌شود.</p>` : ''}
      ${r.errors.length ? `<div class="table-wrap" style="max-height:220px"><table class="table"><thead><tr><th>ردیف</th><th>نام</th><th>مشکل</th></tr></thead><tbody>${r.errors.slice(0, 150).map((e) => `<tr><td>${fa(e.line)}</td><td>${esc(e.name || '')}</td><td class="small">${e.warning ? 'هشدار: ' : ''}${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${dry ? (bad.length ? '<p class="small" style="margin:0">ردیف‌های دارای خطا ثبت نمی‌شوند؛ بقیه ثبت می‌شوند.</p>' : '<p class="small pos" style="margin:0">همه‌چیز درست است؛ «ثبت دانش‌آموزان» را بزنید.</p>') : '<p class="small" style="margin:0">نام کاربری و رمز اولیهٔ هر دانش‌آموز کد ملی خودش است. از «چاپ کارت‌های ورود» برگهٔ ورود را بگیرید.</p>'}</div>`;
    if (!dry) { metaCache = null; md = await meta(); fillClasses(); toast(`${fa(r.created)} دانش‌آموز ثبت و ${fa(r.updated)} نفر به‌روزرسانی شد`, 'ok'); load(); }
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
  on(el, 'click', '[data-imp]', (e, b) => busy(b, async () => { await post(`/api/manager/students/${b.dataset.imp}/impersonate`); location.hash = '#/home'; location.reload(); }));
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

async function feesClassic(el) {
  setHead('حق عضویت و رسیدها', 'تعیین مبلغ و تاریخ قفل هر پایه، بررسی رسیدهای کارت‌به‌کارت');
  let tab = 'pending';
  const d = await api('/api/manager/fees');
  el.innerHTML = `<div class="grid c3"><div class="card span2"><div class="card-title"><span class="ib">${icon('receipt', { size: 18 })}</span>صف بررسی رسیدها<div class="seg more">${[['pending', ' در انتظار'], ['approved', ' تأییدشده'], ['rejected', ' ردشده'], ['reversed', ' برگشتی']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="rq"></div></div>
    <div class="card"><div class="card-title"><span class="ib sun">${icon('sliders', { size: 18 })}</span>مبلغ و تاریخ قفل هر پایه</div><form id="feeForm" class="stack">
      <div class="card flat" style="padding:12px"><b>اشتراک سامانه (همهٔ پایه‌ها)</b><label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" id="sysOn" ${d.system_fee_enabled ? 'checked' : ''}> <span>اعمال اشتراک سامانه بر پرداخت دانش‌آموزان <span class="tiny muted">(فعلاً خاموش)</span></span></label><div class="field" style="margin-top:6px"><label for="sysFee">مبلغ اشتراک سامانه (تومان، جدا از حق عضویت)</label><input class="input ltr" id="sysFee" value="${d.system_fee}" inputmode="numeric"></div><p class="tiny muted" style="margin:0">تا وقتی خاموش باشد، به مبلغ پرداخت دانش‌آموز اضافه نمی‌شود و در پنل او دیده نمی‌شود. وقتی روشن شود، به مبلغ حق عضویت هر پایه اضافه و جداگانه نوشته می‌شود.</p></div>
      <div class="card flat" style="padding:12px"><b>قیمت‌گذاری یکجا برای همهٔ پایه‌ها</b><div class="row" style="margin-top:6px;gap:6px"><input class="input ltr grow" id="allAmt" inputmode="numeric" placeholder="مثلاً 580000" aria-label="مبلغ همهٔ پایه‌ها"><button type="button" class="btn sm soft" id="applyAll">اعمال به همه</button></div><p class="tiny muted" style="margin:6px 0 0">مبلغ در همهٔ پایه‌ها نوشته می‌شود؛ سپس «ذخیره تنظیمات» را بزنید. بعد هر پایه را می‌توانید جدا تغییر دهید.</p></div>
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
  if ($('#rSearch', el)) $('#rSearch', el).oninput = () => { rpage = 0; drawQueue(); };
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
    modal({ title: `کلاس ${b.dataset.name}`, body: `<div class="list">${list.map((s) => `<div class="list-item" data-row="${s.id}">${nameAvatar(s.full_name, 'sm')}<span class="grow">${esc(s.full_name)}</span><span class="badge ${PAY[s.st][1]}" data-badge>${PAY[s.st][0]}</span>${s.st === 'paid' ? '' : `<button class="btn sm soft" data-mp="${s.id}">ثبت پرداخت</button>`}</div>`).join('')}</div>`,
      onOpen: (m) => on(m, 'click', '[data-mp]', (ev, bt) => busy(bt, async () => { await post('/api/manager/students/fee-paid', { ids: [Number(bt.dataset.mp)], paid: true }); const row = bt.closest('[data-row]'); const bd = $('[data-badge]', row); bd.className = 'badge green'; bd.textContent = PAY.paid[0]; bt.remove(); toast('پرداخت ثبت شد', 'ok'); })) });
  });
  $('#applyAll', el).onclick = () => { const v = en($('#allAmt', el).value).replace(/\D/g, ''); if (!v) { toast('مبلغ را وارد کنید'); return; } $$('[data-amt]', el).forEach((i) => { i.value = v; }); toast('در همهٔ پایه‌ها نوشته شد؛ «ذخیره تنظیمات» را بزنید', 'ok'); };
  $('#feeForm', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await put('/api/manager/fees', { system_fee: Number(en($('#sysFee', el).value)) || 0, system_fee_enabled: $('#sysOn', el).checked, settings: d.settings.map((f) => ({ grade: f.grade, amount: Number(en($(`[data-amt="${f.grade}"]`, el).value)), lock_date: readDate(el, `lock${f.grade}`) })) });
      toast('تنظیمات حق عضویت ذخیره شد', 'ok');
    });
  };
}

async function accountingClassic(el, _p, me) {
  let period = 'month', type = '', from = addDays(me.today, -30), to = me.today;
  setHead('حسابداری', 'درآمد، هزینه، مانده صندوق و دفتر کل', '<button class="btn sm" id="addExp"> ثبت سند هزینه</button> <button class="btn soft sm" id="addInc"> ثبت درآمد</button> <button class="btn ghost sm" id="delAllTx" style="color:var(--red)">حذف اسناد دستی</button>');
  $('#delAllTx').onclick = () => deleteAll('transactions', 'اسناد دستی (هزینه/درآمد ثبت‌شده)', () => accountingClassic(el, _p, me), 'اسناد مربوط به پرداخت حق عضویت و اصلاحیه‌ها حذف نمی‌شوند.');
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


export const routes = [
  { path: '/home', view: home },
  { path: '/counselors', view: counselors },
  { path: '/students', view: (el, p, me) => (isNewLook() ? students : studentsClassic)(el, p, me) },
  { path: '/staff', view: staff },
  { path: '/timetable', view: managerTimetable },
  { path: '/fees', view: (el, p, me) => (isNewLook() ? fees : feesClassic)(el, p, me) },
  { path: '/announcements', view: announcements },
  { path: '/accounting', view: (el, p, me) => (isNewLook() ? accounting : accountingClassic)(el, p, me) },
  { path: '/invoices', view: L.mgrInvoices },
  { path: '/sms-outbox', view: L.smsOutbox },
  { path: '/barpa', view: L.mgrBarpa },
  { path: '/barpa/:id', view: L.barpaView },
  { path: '/hoosh-studio', view: L.hooshStudio },
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
