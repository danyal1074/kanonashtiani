// پنل مدیر کانون
import * as L from './legacy.js';
import { api, post, put, del, esc, fa, num, money, pct, $, $$, on, toast, busy, modal, confirmBox, setHead, avatar, nameAvatar, progress, empty, jdate, jtime, jshort,
  subjIcon, gradeName, dateField, readDate, fileToData, barChart, lineChart, donut, WEEKDAYS, addDays, formData, state, en, logoHtml, timeAgo, printOverlay, icon, hasIcon, JMONTHS } from './core.js';
import { messagesView, accountView } from './common.js';
import { adminHome } from './admin-dashboard.js';
import { comboChart, donut as adDonut } from './admin-charts.js';
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
const home = (el, p, me) => adminHome(el, p, me);

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
  let md = await meta();
  const hq = new URLSearchParams(location.hash.split('?')[1] || '');
  const q = { q: hq.get('q') || '', grade: '', class_id: '', school: '', gender: '', pay: '', offset: 0 };
  const PAGE = 30;
  let rows = [], total = 0, allResults = false;
  const sel = new Set();
  setHead('دانش‌آموزان', 'جست‌وجو، فیلتر و مدیریت ثبت‌نام‌ها', `<button class="btn sm" id="addSt">${icon('user-plus', { size: 16 })} ثبت دانش‌آموز</button> <button class="btn ghost sm" id="importSt">${icon('upload', { size: 16 })} ثبت‌نام گروهی</button> <details class="ad-dd"><summary class="btn ghost sm" aria-label="امکانات بیشتر">${icon('more', { size: 17 })}</summary><div class="ad-dd-menu"><button type="button" id="printCreds">${icon('printer', { size: 16 })} چاپ کارت‌های ورود</button><button type="button" id="classesSt">${icon('layers', { size: 16 })} مدیریت کلاس‌ها</button><button type="button" id="syncClassroom">${icon('refresh', { size: 16 })} همگام‌سازی کلاس آنلاین</button><button type="button" id="delAllSt" class="danger">${icon('trash', { size: 16 })} حذف همهٔ دانش‌آموزان…</button></div></details>`);
  el.innerHTML = `<div class="ad-toolbar" role="search">
      <label class="ad-searchbox"><span class="si">${icon('search', { size: 17 })}</span><input class="input" id="q" type="search" placeholder="جست‌وجوی نام یا کد ملی…" value="${esc(q.q)}" aria-label="جست‌وجوی دانش‌آموز" autocomplete="off"></label>
      <select class="input ad-f" id="fg" aria-label="پایه"><option value="">همهٔ پایه‌ها</option>${md.grades.map((g) => `<option value="${g}">پایه ${gradeName(g)}</option>`).join('')}</select>
      <select class="input ad-f" id="fc" aria-label="کلاس"><option value="">همهٔ کلاس‌ها</option></select>
      <select class="input ad-f" id="fpay" aria-label="وضعیت پرداخت"><option value="">همهٔ وضعیت‌های پرداخت</option><option value="paid">پرداخت‌شده</option><option value="pending">در انتظار تأیید</option><option value="unpaid">پرداخت‌نشده</option></select>
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
    <td data-l="حق عضویت"><span class="badge ${PAY[s.pay][1]}">${PAY[s.pay][0]}</span></td>
    <td class="ad-act"><div class="row" style="gap:2px;justify-content:flex-end"><button class="icon-btn" data-view="${s.id}" title="پروفایل" aria-label="پروفایل">${icon('eye', { size: 17 })}</button><button class="icon-btn" data-edit="${s.id}" title="ویرایش" aria-label="ویرایش">${icon('edit', { size: 17 })}</button><button class="icon-btn" data-paid="${s.id}" title="${s.pay === 'paid' ? 'لغو پرداخت حق عضویت' : 'ثبت پرداخت حق عضویت'}" aria-label="${s.pay === 'paid' ? 'لغو پرداخت حق عضویت' : 'ثبت پرداخت حق عضویت'}">${icon(s.pay === 'paid' ? 'circle-x' : 'check-circle', { size: 17 })}</button><button class="icon-btn" data-sms="${s.id}" title="پیامک" aria-label="ارسال پیامک">${icon('message', { size: 17 })}</button><button class="icon-btn" data-del="${s.id}" title="حذف" aria-label="حذف" style="color:var(--red)">${icon('trash', { size: 17 })}</button></div></td></tr>`;
  let seq = 0;
  const load = async () => {
    const my = ++seq;
    const r = await api(`/api/manager/students?${new URLSearchParams({ ...q, limit: PAGE })}`);
    if (my !== seq) return;
    rows = r.rows; total = r.total;
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
  on(el, 'click', '[data-paid]', (e, b) => busy(b, async () => {
    const s = rows.find((x) => x.id === Number(b.dataset.paid)), paid = s.pay !== 'paid';
    if (!paid && !(await confirmBox(`پرداخت حق عضویت «${esc(s.full_name)}» لغو شود؟ سند اصلاحی ثبت می‌شود.`, 'لغو پرداخت'))) return;
    const r = await post('/api/manager/students/fee-paid', { ids: [s.id], paid });
    toast(paid ? (r.unset ? 'پرداخت‌شده ثبت شد؛ مبلغ پایه هنوز تعیین نشده (بعداً در حسابداری کامل می‌شود)' : 'حق عضویت پرداخت‌شده ثبت شد و در حسابداری آمد') : 'پرداخت لغو شد', 'ok', 5000);
    load();
  }));
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
      <div class="row wrap" style="gap:6px;margin-top:8px">${cl.map((c) => `<span class="badge">${esc(c.name)} · ${fa(c.students)} نفر${c.students ? '' : ` <button class="icon-btn" data-delcls="${c.id}" aria-label="حذف کلاس ${esc(c.name)}">${icon('trash', { size: 14 })}</button>`}</span>`).join('') || '<span class="small muted">کلاسی نیست</span>'}</div></div>`; }).join('')}
      <p class="small muted" style="margin:0;line-height:2">برای هر پایه چند کلاس بسازید، سپس «تقسیم خودکار» دانش‌آموزان را بین کلاس‌ها پخش می‌کند. برای جابه‌جایی دلخواه، در فهرست دانش‌آموزان چند نفر را تیک بزنید و «انتقال به کلاس» را بزنید.</p></div>`;
    modal({ title: 'کلاس‌های هر پایه', wide: true, body: `<div id="clsBody">${body()}</div>`, actions: [{ label: 'بستن', value: true }], onOpen: (m) => {
      const redraw = async () => { metaCache = null; md = await meta(); $('#clsBody', m).innerHTML = body(); fillClasses(); load(); };
      on(m, 'click', '[data-addcls]', (ev, b) => busy(b, async () => {
        const g = Number(b.dataset.addcls), name = $(`[data-newname="${g}"]`, m).value.trim();
        if (!name) { toast('نام کلاس را بنویسید'); return; }
        await post('/api/manager/classes', { grade: g, name }); toast('کلاس ساخته شد', 'ok'); await redraw();
      }));
      on(m, 'click', '[data-delcls]', (ev, b) => busy(b, async () => { await del(`/api/manager/classes/${b.dataset.delcls}`); toast('کلاس حذف شد', 'ok'); await redraw(); }));
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
      <div class="ad-sec">حق عضویت</div><div class="row" style="gap:10px"><span class="badge ${PAY[s.pay][1]}">${PAY[s.pay][0]}</span><button class="btn sm ${s.pay === 'paid' ? 'ghost' : 'green'}" data-d="paid">${s.pay === 'paid' ? 'لغو پرداخت' : 'ثبت پرداخت'}</button></div>
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
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('new') === 'teacher') setTimeout(() => $('#addT')?.click(), 50);
  on(el, 'click', '[data-et]', (e, b) => teacherModal(md.teachers.find((t) => t.id === Number(b.dataset.et))));
  $('#addC').onclick = () => modal({ title: ' کلاس جدید', body: `<form class="form-grid" id="cForm"><div class="field"><label>پایه</label><select class="input" name="grade">${md.grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div><div class="field"><label>نام کلاس</label><input class="input" name="name" placeholder="مثلاً: ج" required></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ایجاد', onClick: async (m) => { await post('/api/manager/classes', formData($('#cForm', m))); toast('کلاس ایجاد شد', 'ok'); staff(el); } }] });
}

// ================= حق عضویت =================
async function fees(el) {
  setHead('حق عضویت و رسیدها', 'بررسی رسیدها، تعیین مبلغ و پیگیری وصول');
  let tab = 'pending', rpage = 0;
  const RP = 20;
  const [d, an] = await Promise.all([api('/api/manager/fees'), api('/api/manager/analytics').catch(() => null)]);
  const c = an?.collection;
  const kp = (ico, l, v, s = '', tone = '') => `<div class="ad-kpi ${tone}"><div class="kt">${icon(ico, { size: 17 })}${l}</div><div class="kv">${v}</div><div class="ks">${s}</div></div>`;
  el.innerHTML = `<div class="ad-dash">
    ${c ? `<section class="ad-kpis ad-kpis-4" aria-label="خلاصهٔ وصول">${kp('banknote', 'وصول حق عضویت', c.pct_amount == null ? '—' : `${fa(c.pct_amount)}<small>٪</small>`, 'دریافتی ÷ قابل وصول')}${kp('wallet', 'دریافت‌شده', money(c.collected), 'پرداخت‌های تأییدشده')}${kp('receipt', 'قابل وصول', money(c.due), 'بر اساس مبلغ هر پایه')}${kp('clock', 'در انتظار تأیید', fa(c.pending), c.pending ? 'رسید در صف بررسی' : 'صف خالی است', c.pending ? 'warn' : '')}</section>` : ''}
    <div class="ad-tabs" role="tablist" aria-label="بخش‌های حق عضویت"><button role="tab" aria-selected="true" data-pane="pnR">${icon('receipt', { size: 16 })} رسیدها</button><button role="tab" aria-selected="false" data-pane="pnS">${icon('sliders', { size: 16 })} مبلغ و مهلت</button><button role="tab" aria-selected="false" data-pane="pnC">${icon('layers', { size: 16 })} گزارش کلاس‌ها</button></div>
    <section id="pnR" role="tabpanel"><div class="ad-card"><header><div><h3>رسیدهای کارت‌به‌کارت</h3><p>تصویر رسید را ببینید، تأیید یا با ذکر علت رد کنید.</p></div><div class="seg">${[['pending', 'در انتظار'], ['approved', 'تأییدشده'], ['rejected', 'ردشده'], ['reversed', 'برگشتی']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div></header><div id="rq"></div></div></section>
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
    const all_ = await api(`/api/manager/receipts?status=${tab}`);
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
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('info', { size: 18 })}</span>دفتر کل تراکنش‌ها و دفتر واریزها</div>
        <div class="row wrap" style="margin-bottom:12px"><div class="seg">${[['day', 'روزانه'], ['week', 'هفتگی'], ['month', 'ماهانه'], ['custom', 'بازه دلخواه']].map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg">${[['', 'همه'], ['income', 'واریزها'], ['expense', 'هزینه‌ها']].map(([k, l]) => `<button data-ty="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${period === 'custom' ? `<div class="row wrap" style="margin-bottom:12px"><span class="small">از</span><div style="width:250px">${dateField('from', from, { minYear: 1403, maxYear: 1406 })}</div><span class="small">تا</span><div style="width:250px">${dateField('to', to, { minYear: 1403, maxYear: 1406 })}</div><button class="btn sm" id="applyR">اعمال</button></div>` : ''}
        <div class="row wrap small" style="margin-bottom:10px"><span class="badge green">ورودی بازه: ${money(d.range.income)}</span><span class="badge red">خروجی بازه: ${money(d.range.expense)}</span><span class="badge gray">${jdate(d.from)} تا ${jdate(d.to)}</span></div>
        <div class="table-wrap" style="max-height:520px"><table class="table"><thead><tr><th>تاریخ</th><th>شرح</th><th>دسته</th><th>مبلغ</th><th></th></tr></thead><tbody>
        ${d.ledger.map((t) => `<tr><td class="tiny">${jshort(t.date)}</td><td class="small">${esc(t.title)}</td><td><span class="badge gray">${esc(t.category || '')}</span></td><td class="${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '−'} ${money(t.amount)}</td><td>${t.ref?.startsWith('pay:') || t.ref?.startsWith('RSH') ? '' : `<button class="icon-btn" data-dt="${t.id}" aria-label="حذف">${icon('trash', { size: 16 })}</button>`}</td></tr>`).join('') || `<tr><td colspan="5">${empty('inbox', 'تراکنشی در این بازه نیست')}</td></tr>`}</tbody></table></div></div>`;
    comboChart($('#chAcc', el), { labels: d.months.map((m) => m.label), bars: [{ name: 'درآمد', color: 'var(--c1)', values: d.months.map((m) => m.income) }, { name: 'هزینه', color: 'var(--c3)', values: d.months.map((m) => m.expense) }], line: { name: 'مانده ماهانه', color: 'var(--c4)', values: d.months.map((m) => m.income - m.expense) }, tipFmt: money, label: 'نمودار درآمد و هزینه' });
    adDonut($('#chCat', el), { segments: d.categories.map((x, i) => ({ name: x.category, value: x.total, color: ['var(--c1)', 'var(--c3)', 'var(--c2)', 'var(--c5)', 'var(--c4)', 'var(--c6)'][i % 6] })), center: { value: fa(d.categories.length), label: 'دسته' }, label: 'ترکیب هزینه‌ها', emptyText: 'هزینه‌ای در این بازه نیست' });
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
