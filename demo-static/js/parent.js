// پنل والدین
import { api, esc, fa, pct, money, $, $$, on, setHead, avatar, progress, ring, empty, jdate, jtime, timeAgo, subjIcon, gradeName, lineChart, barChart, state, WEEKDAYS, faWeekday, cdHtml, icon, kpiCard } from './core.js';
import { messagesView, announcementsView, accountView } from './common.js';
import { panelShop } from './shop.js';
import { sproutArt } from './icons.js';

export const nav = (me) => [
  { path: '/home', icon: 'home', label: 'نمای کلی فرزند' },
  { path: '/report', icon: 'file-text', label: 'کارنامه و پیشرفت' },
  { path: '/absences', icon: 'calendar', label: 'سوابق غیبت' },
  { path: '/tasks', icon: 'clipboard', label: 'تکالیف و اطلاعیه‌ها' },
  { path: '/messages', icon: 'message', label: 'پیام به معلم', badge: me.unread },
  { path: '/shop', icon: 'bag', label: 'فروشگاه کانون' },
  { path: '/announcements', icon: 'megaphone', label: 'اطلاعیه‌ها' },
  { path: '/account', icon: 'key', label: 'حساب کاربری' },
];
export const bottomNav = (me) => [
  { path: '/home', icon: 'home', label: 'فرزند' },
  { path: '/report', icon: 'file-text', label: 'کارنامه' },
  { path: '/absences', icon: 'calendar', label: 'غیبت' },
  { path: '/messages', icon: 'message', label: 'پیام', badge: me.unread },
];

function currentChild(me) {
  let id;
  try { id = Number(localStorage.getItem(`roshd-child-${me.user.id}`)); } catch { /* */ }
  return me.children.find((c) => c.id === id) || me.children[0];
}
function childPicker(me, cur, onPick) {
  if (me.children.length < 2) return '';
  return `<div class="chips" style="margin-bottom:16px">${me.children.map((c) => `<button class="chip ${c.id === cur.id ? 'on' : ''}" data-child="${c.id}">${esc(c.full_name)} • ${gradeName(c.grade)}</button>`).join('')}</div>`;
}
async function withChild(el, me, render) {
  const cur = currentChild(me);
  if (!cur) { el.innerHTML = empty('users', 'فرزندی به حساب شما متصل نیست؛ با مدیر کانون تماس بگیرید'); return; }
  const d = await api(`/api/parent/children/${cur.id}`);
  el.innerHTML = childPicker(me, cur) + '<div id="childBody"></div>';
  render($('#childBody', el), d, cur);
  on(el, 'click', '[data-child]', (e, b) => { try { localStorage.setItem(`roshd-child-${me.user.id}`, b.dataset.child); } catch { /* */ } withChild(el, me, render); });
}
const FEE = { paid: [' پرداخت‌شده', 'green'], pending: [' در انتظار تأیید', 'orange'], rejected: [' رسید رد شد', 'red'], unpaid: [' پرداخت نشده', 'red'], free: ['معاف', 'green'] };

async function home(el, _p, me) {
  setHead('نمای کلی فرزند', `${esc(me.user.full_name)} عزیز، خوش آمدید`);
  await withChild(el, me, (box, d) => {
    const att = d.attendance;
    const total = (att.present || 0) + (att.absent || 0) + (att.excused || 0);
    const studyMax = Math.max(1, ...d.studyDays.map((x) => x.m));
    box.innerHTML = `<section class="hero" style="margin-bottom:var(--s-5)" aria-label="وضعیت فرزند"><div class="row wrap" style="gap:var(--s-5)"><div class="sprout-wrap">${sproutArt(d.level.index, 100)}</div><div class="grow" style="min-width:220px"><div class="row wrap" style="gap:var(--s-2)"><span class="eyebrow">${icon('sprout', { size: 14 })} سطح ${fa(d.level.index)} · ${d.level.name}</span><span class="eyebrow ${d.fee.status === 'paid' || d.fee.status === 'free' ? '' : 'sun'}">${icon('card', { size: 14 })} ${FEE[d.fee.status][0]}</span></div>
      <h2 style="margin-top:var(--s-3)">${esc(d.info.full_name)}</h2><div style="color:var(--teal-100)">پایه ${gradeName(d.info.grade)} · کلاس ${esc(d.info.class_name || '')} · ${esc(d.info.school || '')}</div></div></div>
      <div class="hero-stats" style="margin-top:var(--s-5)"><div class="hero-stat"><div class="l">${icon('star', { size: 14 })} امتیاز</div><div class="v">${fa(d.points)}</div></div><div class="hero-stat"><div class="l">${icon('trophy', { size: 14 })} رتبه در پایه</div><div class="v">${fa(d.rank.rank)}<span style="font-size:var(--fs-sm);font-weight:600;color:var(--teal-100)"> از ${fa(d.rank.of)}</span></div></div><div class="hero-stat"><div class="l">${icon('award', { size: 14 })} معدل کل</div><div class="v">${d.overallAvg == null ? '—' : fa(d.overallAvg)}</div></div></div></section>
    <div class="grid c3"><div class="card"><div class="card-title"><span class="ib green">${icon('calendar', { size: 18 })}</span>حضور در کلاس</div><div class="row">${ring(total ? ((att.present || 0) / total) * 100 : 100, { size: 110, label: pct(total ? ((att.present || 0) / total) * 100 : 100), sub: 'حضور' })}<div class="stack small" style="gap:4px"><span>${icon('check-circle', { size: 16 })} حاضر: ${fa(att.present || 0)}</span><span class="neg">${icon('user-x', { size: 16 })} غایب: ${fa(att.absent || 0)}</span><span>${icon('message', { size: 16 })} با اطلاع: ${fa(att.excused || 0)}</span><a href="#/absences">جزئیات ←</a></div></div></div>
      <div class="card"><div class="card-title"><span class="ib sun">${icon('timer', { size: 18 })}</span>مطالعه ۱۴ روز اخیر</div><div class="row" style="align-items:flex-end;gap:4px;height:110px">${d.studyDays.map((x) => `<div title="${jdate(x.date)}: ${fa(x.m)} دقیقه" style="flex:1;background:linear-gradient(180deg,#F2B33D,#F2B33D);border-radius:6px 6px 2px 2px;height:${(x.m / studyMax) * 100}%;min-height:4px"></div>`).join('') || empty('sprout', 'مطالعه‌ای ثبت نشده')}</div>
        <div class="small" style="margin-top:8px">برنامه این هفته: <b>${fa(d.study.plan.reduce((a, p) => a + Math.min(p.done, p.target), 0))}</b> از ${fa(d.study.plan.reduce((a, p) => a + p.target, 0))} پومودورو</div></div>
      <div class="card tint-yellow"><div class="card-title"><span class="ib sun">${icon('file-text', { size: 18 })}</span>یادداشت دبیر راهنما</div>${d.notes.slice(0, 2).map((n) => `<div style="background:#fff;border-radius:14px;padding:10px 12px;margin-bottom:8px"><div class="small">${esc(n.body)}</div><div class="tiny muted">— ${esc(n.teacher || '')} • ${jdate(n.created_at)}</div></div>`).join('') || empty('file-text', 'یادداشتی ثبت نشده')}<a class="small" href="#/messages">${icon('message', { size: 16 })} گفت‌وگو با معلم ←</a></div></div>
    <div class="grid c2" style="margin-top:18px"><div class="card"><div class="card-title"><span class="ib">${icon('trend', { size: 18 })}</span>روند پیشرفت (معدل ماهانه از ۲۰)</div>${d.cards.length ? lineChart(d.cards.map((c) => c.label.split(' ')[0]), [{ name: 'معدل', color: '#0B5F66', values: d.cards.map((c) => c.avg) }], { max: 20, height: 200, fmt: (v) => fa(Math.round(v)) }) : empty('trend', 'هنوز کارنامه‌ای صادر نشده')}<a class="small" href="#/report">کارنامه کامل ←</a></div>
      <div class="card"><div class="card-title"><span class="ib sun">${icon('clipboard', { size: 18 })}</span>وضعیت تکالیف اخیر</div><div class="list">${d.assignments.slice(0, 6).map((a) => `<div class="list-item"><span>${subjIcon(a.subject)}</span><div class="grow"><b class="small">${esc(a.title)}</b><div class="tiny muted">مهلت ${jdate(a.deadline)}</div></div>${a.submitted_at ? (a.late ? '<span class="badge orange">با تأخیر</span>' : '<span class="badge green">ارسال شد</span>') : new Date(a.deadline) < new Date() ? '<span class="badge red">ارسال نشد</span>' : cdHtml(a.deadline)}</div>`).join('')}</div><a class="small" href="#/tasks">همه ←</a></div></div>`;
  });
}

async function report(el, _p, me) {
  setHead('کارنامه دیجیتال دوره‌ای', 'نمره هر درس از ۲۰ بر اساس آزمون‌های هر ماه', '<button class="btn soft sm" onclick="print()"> چاپ کارنامه</button>');
  await withChild(el, me, (box, d) => {
    const subjects = [...new Set(d.cards.flatMap((c) => c.subjects.map((s) => s.name)))];
    const color = (v) => (v >= 17 ? 'var(--green)' : v >= 14 ? '#a16207' : 'var(--red)');
    box.innerHTML = `<div class="grid c3"><div class="card center tint-violet">${ring(d.overallAvg ? (d.overallAvg / 20) * 100 : 0, { size: 150, label: d.overallAvg == null ? '—' : fa(d.overallAvg), sub: 'معدل کل از ۲۰' })}<h3 style="margin-top:10px">${esc(d.info.full_name)}</h3><div class="small muted">رتبه ${fa(d.rank.rank)} از ${fa(d.rank.of)} در پایه</div></div>
      <div class="card span2"><div class="card-title"><span class="ib">${icon('trend', { size: 18 })}</span>نمودار روند پیشرفت</div>${d.cards.length ? lineChart(d.cards.map((c) => c.label), [{ name: 'معدل', color: '#0B5F66', values: d.cards.map((c) => c.avg) }, ...subjects.slice(0, 3).map((s, i) => ({ name: s, color: ['#F2B33D', '#F2B33D', '#0E9157'][i], values: d.cards.map((c) => c.subjects.find((x) => x.name === s)?.score ?? 0) }))], { max: 20, height: 230, fmt: (v) => fa(Math.round(v)) }) : empty('trend', 'داده‌ای نیست')}</div></div>
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('file-text', { size: 18 })}</span>کارنامه درس‌به‌درس</div><div class="table-wrap"><table class="table"><thead><tr><th>درس</th>${d.cards.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
        ${subjects.map((s) => `<tr><td><b>${subjIcon(s)} ${esc(s)}</b></td>${d.cards.map((c) => { const v = c.subjects.find((x) => x.name === s)?.score; return `<td>${v == null ? '—' : `<b style="color:${color(v)}">${fa(v)}</b>`}</td>`; }).join('')}</tr>`).join('')}
        <tr style="background:var(--primary-soft)"><td><b>معدل</b></td>${d.cards.map((c) => `<td><b style="font-size:16px">${fa(c.avg)}</b></td>`).join('')}</tr></tbody></table></div></div>
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('award', { size: 18 })}</span>آخرین آزمون‌ها</div><div class="table-wrap"><table class="table"><thead><tr><th>آزمون</th><th>تاریخ</th><th>درصد</th><th>رتبه</th></tr></thead><tbody>${d.results.map((r) => `<tr><td>${esc(r.title)}</td><td class="tiny">${jdate(r.created_at)}</td><td><b>${pct(r.percent)}</b></td><td>${fa(r.rank)} از ${fa(r.of)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib sun">${icon('file-text', { size: 18 })}</span>یادداشت‌های مشاوره‌ای دبیر راهنما</div>${d.notes.map((n) => `<div class="list-item" style="align-items:flex-start"><span>${icon('file-text', { size: 16 })}</span><div><div>${esc(n.body)}</div><div class="tiny muted">${esc(n.teacher || '')} • ${jdate(n.created_at)}</div></div></div>`).join('') || empty('file-text', 'یادداشتی نیست')}</div>`;
  });
}

async function absences(el, _p, me) {
  setHead('سوابق غیبت', 'غیبت‌ها و غیبت‌های با اطلاع فرزند');
  await withChild(el, me, (box, d) => {
    box.innerHTML = `<div class="grid c3">${kpiCard('user-check', 'green', fa(d.attendance.present || 0), 'حاضر')}${kpiCard('user-x', 'red', fa(d.attendance.absent || 0), 'غایب بدون اطلاع')}${kpiCard('message', 'sun', fa(d.attendance.excused || 0), 'غایب با اطلاع')}</div>
      <div class="card" style="margin-top:18px"><div class="table-wrap"><table class="table"><thead><tr><th>تاریخ</th><th>روز</th><th>کلاس</th><th>وضعیت</th></tr></thead><tbody>${d.absences.map((a) => `<tr><td>${jdate(a.date)}</td><td>${WEEKDAYS[faWeekday(a.date)]}</td><td>${esc(a.class_name)}</td><td>${a.status === 'absent' ? '<span class="badge red">غایب بدون اطلاع</span>' : '<span class="badge yellow">غایب با اطلاع</span>'}</td></tr>`).join('') || `<tr><td colspan="4">${empty('sparkles', 'هیچ غیبتی ثبت نشده')}</td></tr>`}</tbody></table></div></div>`;
  });
}

async function tasks(el, _p, me) {
  setHead('تکالیف و اطلاعیه‌ها', 'وضعیت تکالیف فرزند و اطلاعیه‌های مرتبط');
  await withChild(el, me, (box, d) => {
    box.innerHTML = `<div class="grid c2"><div class="card"><div class="card-title"><span class="ib sun">${icon('clipboard', { size: 18 })}</span>تکالیف</div><div class="list">${d.assignments.map((a) => `<div class="list-item"><span>${subjIcon(a.subject)}</span><div class="grow"><b class="small">${esc(a.title)}</b><div class="tiny muted">${esc(a.subject || '')} • مهلت ${jdate(a.deadline)} ${jtime(a.deadline)}</div></div>${a.submitted_at ? (a.late ? '<span class="badge orange">با تأخیر</span>' : '<span class="badge green">ارسال شد</span>') : new Date(a.deadline) < new Date() ? '<span class="badge red">ارسال نشد</span>' : cdHtml(a.deadline)}</div>`).join('') || empty('inbox', 'تکلیفی نیست')}</div></div>
      <div class="card"><div class="card-title"><span class="ib">${icon('megaphone', { size: 18 })}</span>اطلاعیه‌های کلاس فرزند</div><div class="list">${d.announcements.map((a) => `<div class="list-item" style="align-items:flex-start"><span style="font-size:22px">${esc(a.emoji)}</span><div><b class="small">${esc(a.title)}</b><div class="small">${esc(a.body)}</div><div class="tiny muted">${jdate(a.created_at)}</div></div></div>`).join('') || empty('inbox', 'اطلاعیه‌ای نیست')}</div></div></div>`;
  });
}

export const routes = [
  { path: '/home', view: home },
  { path: '/report', view: report },
  { path: '/absences', view: absences },
  { path: '/tasks', view: tasks },
  { path: '/messages', view: messagesView },
  { path: '/messages/:id', view: messagesView },
  { path: '/shop', view: panelShop },
  { path: '/announcements', view: announcementsView },
  { path: '/account', view: accountView },
];
