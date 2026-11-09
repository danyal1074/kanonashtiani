// داشبورد تازهٔ مدیر: شاخص‌ها، اقدام‌های سریع و پنج نمودار با داده‌های واقعی (/api/manager/analytics، فقط خواندنی).
// فرمول‌ها در docs/analytics-design.md؛ جایی که داده کافی نیست «داده کافی نیست» نمایش داده می‌شود، نه عدد ساختگی.
import { api, post, esc, fa, money, $, $$, on, toast, busy, confirmBox, jdate, icon, gradeName, empty, nameAvatar, timeAgo, setHead } from './core.js';
import { comboChart, stackedBars, donut, lineChart, hbars, compact } from './admin-charts.js';

const day = (d) => jdate(d, { year: false });
const card = (cls, title, sub, body, tools = '') => `<section class="ad-card ${cls}"><header><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${tools ? `<div class="ad-tools">${tools}</div>` : ''}</header>${body}</section>`;
const ICON_OF = { payment: 'banknote', announcement: 'megaphone', student: 'user-plus' };

export async function adminHome(el, _p, me) {
  setHead('داشبورد', `${jdate(me.today, { weekday: true })} · ${esc(me.center?.name || 'کانون آشتیانی')}`, '');
  const f = { grade: '', days: 14 };
  const first = (me.user.full_name || '').split(' ')[0];
  el.innerHTML = `<div class="ad-dash">
    <section class="ad-hero"><div><h2>سلام ${esc(first)}، خوش آمدید</h2><p>خلاصهٔ وضعیت امروز کانون؛ شاخص‌ها بر اساس اطلاعات ثبت‌شده در سامانه‌اند.</p></div>
      <div class="ad-actions"><a class="btn sm" href="#/students?new=1">${icon('user-plus', { size: 16 })} ثبت دانش‌آموز</a><a class="btn ghost sm" href="#/staff?new=teacher">${icon('school', { size: 16 })} ثبت معلم</a><a class="btn ghost sm" href="#/fees">${icon('receipt', { size: 16 })} بررسی رسید</a><a class="btn ghost sm" href="#/announcements?new=1">${icon('megaphone', { size: 16 })} اطلاعیه</a><a class="btn ghost sm" href="#/timetable">${icon('calendar', { size: 16 })} برنامه هفتگی</a></div></section>
    <div id="adBody"><div class="ad-kpis">${'<div class="ad-kpi"><div class="ad-skel" style="height:64px"></div></div>'.repeat(6)}</div><div class="ad-grid" style="margin-top:14px">${'<div class="ad-card ad-col-6"><div class="ad-skel"></div></div>'.repeat(4)}</div></div>
  </div>`;
  const body = $('#adBody', el);
  const dashP = api('/api/manager/dashboard').catch(() => null); // فهرست غایبان امروز (همان عملیات پیامک قبلی)

  async function load() {
    let d;
    try { d = await api(`/api/manager/analytics?${new URLSearchParams({ grade: f.grade, days: f.days })}`); } catch (e) {
      body.innerHTML = `<div class="ad-err" role="alert">${icon('circle-alert', { size: 20 })}<span>بارگذاری آمار انجام نشد: ${esc(e.message)}</span><button class="btn sm ghost" id="adRetry">تلاش دوباره</button></div>`;
      $('#adRetry', body).onclick = () => { body.innerHTML = '<div class="ad-skel"></div>'; load(); };
      return;
    }
    paint(d, await dashP);
  }

  function paint(d, dash) {
    const k = d.kpi, c = d.collection, g0 = { paid: c.paid, pending: c.pending, unpaid: c.unpaid };
    const sel = `<select class="ad-sel" id="adGrade" aria-label="فیلتر پایه"><option value="">همهٔ پایه‌ها</option>${[4, 5, 6, 7, 8, 9].map((g) => `<option value="${g}" ${String(f.grade) === String(g) ? 'selected' : ''}>پایه ${gradeName(g)}</option>`).join('')}</select>`;
    const rng = `<select class="ad-sel" id="adDays" aria-label="بازهٔ حضور و غیاب">${[7, 14, 30].map((n) => `<option value="${n}" ${f.days === n ? 'selected' : ''}>${fa(n)} روز اخیر</option>`).join('')}</select>`;
    const kp = (ico, label, val, href, sub, tone = '') => `<a class="ad-kpi ${tone}" href="${href}"><div class="kt">${icon(ico, { size: 17 })}${label}</div><div class="kv">${val}</div><div class="ks">${sub}</div></a>`;
    body.innerHTML = `
      <section class="ad-kpis" aria-label="شاخص‌های کلیدی">
        ${kp('graduation', 'دانش‌آموزان فعال', fa(k.students), '#/students', `${fa(c.paid)} نفر پرداخت‌کننده`)}
        ${kp('school', 'معلمان فعال', fa(k.teachers), '#/staff', 'مدیریت معلمان')}
        ${kp('layers', 'کلاس‌ها', fa(k.classes), '#/staff', 'مدیریت کلاس‌ها')}
        ${kp('banknote', 'وصول حق عضویت', k.collection_pct == null ? '—' : `${fa(k.collection_pct)}<small>٪</small>`, '#/fees', c.pct_students == null ? '' : `${fa(c.pct_students)}٪ دانش‌آموزان پرداخت کرده‌اند`)}
        ${kp('receipt', 'رسیدهای در انتظار', fa(k.pending_receipts), '#/fees', k.pending_receipts ? 'نیازمند بررسی' : 'همه بررسی شده', k.pending_receipts ? 'warn' : '')}
        ${kp('user-x', 'غیبت‌های امروز', fa(k.absent_today), '#absent', k.absent_today ? 'پیامک به والدین' : 'بدون غیبت', k.absent_today ? 'bad' : '')}
      </section>
      <div class="ad-filters" style="margin:14px 0 10px"><div class="grp"><b style="font-size:13px">نمودارها</b>${sel}${rng}</div><span class="small muted">${d.grade ? `فقط پایهٔ ${gradeName(d.grade)}` : 'همهٔ پایه‌ها'}</span></div>
      <div class="ad-grid">
        ${card('ad-col-8', 'وضعیت مالی', 'درآمد، هزینه و مانده در شش ماه اخیر (تومان)', `<div id="chFin" class="ch"></div><div class="ad-sum"><div><small>مجموع درآمد</small><b>${money(d.finance.totals.income)}</b></div><div><small>مجموع هزینه</small><b>${money(d.finance.totals.expense)}</b></div><div><small>مانده صندوق</small><b>${money(d.finance.totals.balance)}</b></div></div>`)}
        ${card('ad-col-4', 'وصول حق عضویت', 'درصد وصول مبلغی = دریافتی ÷ قابل وصول', `<div id="chColl" class="ch"></div><div class="ad-sum"><div><small>دریافت‌شده</small><b>${money(c.collected)}</b></div><div><small>قابل وصول</small><b>${money(c.due)}</b></div></div>`)}
        ${card('ad-col-6', 'پرداخت‌ها به تفکیک پایه', 'تعداد دانش‌آموزان در هر وضعیت پرداخت', `<div id="chPay" class="ch"></div><div class="ad-sum"><div><small>پرداخت‌شده</small><b>${fa(g0.paid)}</b></div><div><small>در انتظار</small><b>${fa(g0.pending)}</b></div><div><small>پرداخت‌نشده</small><b>${fa(g0.unpaid)}</b></div></div>`)}
        ${card('ad-col-6', 'روند حضور', `درصد حضور در ${fa(d.days)} روز اخیر`, '<div id="chAtt" class="ch"></div><div class="ad-sec" style="margin-top:6px">کمترین حضور بین کلاس‌ها (۳۰ روز)</div><div id="chAttCls"></div>')}
        ${card('ad-col-4', 'رشد دانش‌آموزان', 'ثبت‌نام جدید و جمع دانش‌آموزان فعال', '<div id="chGrow" class="ch"></div>')}
        ${card('ad-col-4', 'عملکرد آموزشی', `میانگین درصد آزمون‌ها (${fa(d.academic.n)} نتیجه)`, '<div id="chAcad"></div><div class="ad-sec" style="margin:8px 0 4px">توزیع نتایج</div><div id="chDist"></div>')}
        ${card('ad-col-4', 'هشدارهای مهم', '', d.alerts.length ? `<ul class="ad-alerts">${d.alerts.map((a) => `<li><span class="tag ${a.tone === 'warn' ? '' : a.tone}"></span><a href="${a.href}">${esc(a.text)}</a>${icon('chevron-left', { size: 15 })}</li>`).join('')}</ul>` : empty('check-circle', 'هشدار فعالی وجود ندارد'))}
        ${card('ad-col-6', 'غایبان امروز', 'پیامک به والدین با یک کلیک', absentHtml(dash), dash?.absents?.some((a) => a.status === 'absent' && !a.sms_sent) ? `<button class="btn sm soft" id="adSmsAll">ارسال به همه</button>` : '')}
        ${card('ad-col-6', 'فعالیت‌های اخیر', '', d.recent.length ? `<ul class="ad-feed">${d.recent.map((r) => `<li><span class="fi">${icon(ICON_OF[r.kind] || 'info', { size: 16 })}</span><a>${esc(r.text)}</a><small>${timeAgo(r.t)}</small></li>`).join('')}</ul>` : empty('inbox', 'هنوز فعالیتی ثبت نشده'))}
      </div>`;
    drawCharts(d);
    $('#adGrade', body).onchange = (e) => { f.grade = e.target.value; load(); };
    $('#adDays', body).onchange = (e) => { f.days = Number(e.target.value); load(); };
    $$('a[href="#absent"]', body).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $('#adAbsent', body)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  }

  function absentHtml(dash) {
    if (!dash) return empty('alert', 'فهرست غایبان دریافت نشد');
    if (!dash.absents.length) return empty('check-circle', 'امروز غایبی ثبت نشده است');
    return `<div class="list" id="adAbsent">${dash.absents.map((a) => `<div class="list-item" style="flex-wrap:wrap">${nameAvatar(a.full_name, 'sm')}<div class="grow" style="min-width:130px"><div class="small bold">${esc(a.full_name)}</div><div class="tiny muted">پایه ${gradeName(a.grade)} · کلاس ${esc(a.class_name)}</div></div>
      ${a.status === 'absent' ? '<span class="badge red">غایب</span>' : '<span class="badge yellow">با اطلاع</span>'}
      <span style="min-width:112px;text-align:left">${a.status !== 'absent' ? '' : a.sms_sent ? `<span class="badge green">${icon('check', { size: 12 })} ارسال شد</span>` : `<button class="btn sm soft" data-sms="${a.id}">${icon('send', { size: 14 })} پیامک</button>`}</span></div>`).join('')}</div>`;
  }

  function drawCharts(d) {
    const fin = d.finance.months;
    comboChart($('#chFin', body), { labels: fin.map((m) => m.label), bars: [{ name: 'درآمد', color: 'var(--c1)', values: fin.map((m) => m.income) }, { name: 'هزینه', color: 'var(--c3)', values: fin.map((m) => m.expense) }], line: { name: 'مانده ماهانه', color: 'var(--c4)', values: fin.map((m) => m.net) }, tipFmt: money, label: 'نمودار درآمد و هزینه ماهانه' });
    const c = d.collection;
    donut($('#chColl', body), { segments: [{ name: 'پرداخت‌شده', value: c.paid, color: 'var(--c5)' }, { name: 'در انتظار', value: c.pending, color: 'var(--c3)' }, { name: 'پرداخت‌نشده', value: c.unpaid, color: 'var(--c4)' }], center: { value: c.pct_amount == null ? '—' : `${fa(c.pct_amount)}٪`, label: 'وصول مبلغی' }, label: 'وضعیت پرداخت دانش‌آموزان', emptyText: 'دانش‌آموزی ثبت نشده است' });
    const g = d.byGrade;
    stackedBars($('#chPay', body), { labels: g.map((x) => `پایه ${gradeName(x.grade)}`), series: [{ name: 'پرداخت‌شده', color: 'var(--c5)', values: g.map((x) => x.paid) }, { name: 'در انتظار', color: 'var(--c3)', values: g.map((x) => x.pending) }, { name: 'پرداخت‌نشده', color: 'var(--c4)', values: g.map((x) => x.unpaid) }], height: 320, label: 'نمودار وضعیت پرداخت به تفکیک پایه' });
    lineChart($('#chAtt', body), { labels: d.attendance.days.map((x) => day(x.date)), series: [{ name: 'درصد حضور', color: 'var(--c1)', values: d.attendance.days.map((x) => x.rate) }], max: 100, min: 50, ticks: 5, label: 'روند درصد حضور', emptyText: 'برای این بازه حضور و غیابی ثبت نشده است' });
    hbars($('#chAttCls', body), { rows: [...d.attendance.byClass].sort((a, b) => a.rate - b.rate).slice(0, 5).map((x) => ({ label: `${gradeName(x.grade)} ${x.name}`, value: x.rate, color: x.rate < 80 ? 'var(--c4)' : x.rate < 90 ? 'var(--c3)' : 'var(--c5)' })), emptyText: 'داده‌ای برای مقایسه نیست' });
    lineChart($('#chGrow', body), { labels: d.growth.map((x) => x.label), series: [{ name: 'دانش‌آموزان فعال', color: 'var(--c1)', values: d.growth.map((x) => x.total) }], height: 250, fmt: (v) => fa(Math.round(v)), label: 'رشد دانش‌آموزان', emptyText: 'داده کافی نیست' });
    hbars($('#chAcad', body), { rows: d.academic.byGrade.map((x) => ({ label: `پایه ${gradeName(x.grade)}`, value: x.avg })), emptyText: 'هنوز نتیجهٔ آزمونی ثبت نشده است — داده کافی نیست' });
    const tot = d.academic.distribution.reduce((s, x) => s + x.n, 0) || 1;
    hbars($('#chDist', body), { rows: d.academic.distribution.map((x, i) => ({ label: x.label, value: (x.n / tot) * 100, color: ['var(--c4)', 'var(--c3)', 'var(--c2)', 'var(--c5)'][i] })), emptyText: '' });
  }

  on(el, 'click', '[data-sms]', (e, b) => busy(b, async () => {
    const r = await post(`/api/manager/attendance/${b.dataset.sms}/sms`);
    toast(r.failed ? `ارسال نشد: ${r.errors[0] || 'خطای درگاه پیامک'}` : r.simulated ? 'ارسال شبیه‌سازی شد (درگاه پیامک تنظیم نیست)' : 'پیامک ارسال شد', r.failed ? 'err' : 'ok');
    adminHome(el, _p, me);
  }));
  on(el, 'click', '#adSmsAll', (e, b) => busy(b, async () => {
    if (!(await confirmBox('پیامک غیبت برای همهٔ غایبان امروز که هنوز پیامک نگرفته‌اند ارسال شود؟', 'ارسال'))) return;
    const r = await post('/api/manager/attendance/all/sms');
    toast(r.failed ? `${fa(r.sent)} ارسال شد، ${fa(r.failed)} ناموفق` : `${fa(r.sent)} پیامک ${r.simulated ? 'شبیه‌سازی' : 'ارسال'} شد`, r.failed ? 'err' : 'ok');
    adminHome(el, _p, me);
  }));
  load();
}
