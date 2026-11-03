// پنل معلم
import { api, post, put, del, esc, fa, num, pct, $, $$, on, toast, busy, modal, confirmBox, setHead, avatar, progress, ring, empty, cdHtml, jdate, jtime, jshort,
  timeAgo, subjIcon, gradeName, dateField, readDate, tehranIso, fileToData, barChart, lineChart, WEEKDAYS, addDays, formData, state, en, icon, kpiCard, nameAvatar, JMONTHS, jparts } from './core.js';
import { messagesView, announcementsView, accountView } from './common.js';
import { openScanner, printSheet, MAX_Q } from './omr.js';

export const nav = (me) => [
  { path: '/home', icon: 'home', label: 'داشبورد' },
  { path: '/attendance', icon: 'user-check', label: 'حضور و غیاب' },
  { path: '/assignments', icon: 'clipboard', label: 'تکالیف' },
  { path: '/exams', icon: 'file-check', label: 'آزمون و اسکن پاسخ‌برگ' },
  { path: '/students', icon: 'users', label: 'عملکرد دانش‌آموزان' },
  { path: '/plans', icon: 'timer', label: 'برنامه پومودوروی هفتگی' },
  { path: '/materials', icon: 'video', label: 'ویدیو و جزوه' },
  { path: '/messages', icon: 'message', label: 'پیام‌ها', badge: me.unread },
  { path: '/announcements', icon: 'megaphone', label: 'اطلاعیه‌ها' },
  { path: '/account', icon: 'sliders', label: 'حساب کاربری' },
];
export const bottomNav = (me) => [
  { path: '/home', icon: 'home', label: 'خانه' },
  { path: '/attendance', icon: 'user-check', label: 'حضور' },
  { path: '/assignments', icon: 'clipboard', label: 'تکالیف' },
  { path: '/messages', icon: 'message', label: 'پیام', badge: me.unread },
];

let classesCache = null;
const myClasses = async () => (classesCache ??= (await api('/api/teacher/overview')).classes);
const clsLabel = (c) => `${gradeName(c.grade)} ${c.name}`;
const filterBar = (classes, q = {}) => `<div class="row wrap" style="margin-bottom:16px"><select class="input" id="fGrade" style="width:auto"><option value="">همه پایه‌ها</option>${[...new Set(classes.map((c) => c.grade))].map((g) => `<option value="${g}" ${Number(q.grade) === g ? 'selected' : ''}>پایه ${gradeName(g)}</option>`).join('')}</select>
  <select class="input" id="fClass" style="width:auto"><option value="">همه کلاس‌ها</option>${classes.filter((c) => !q.grade || c.grade === Number(q.grade)).map((c) => `<option value="${c.id}" ${Number(q.class_id) === c.id ? 'selected' : ''}>کلاس ${clsLabel(c)}</option>`).join('')}</select></div>`;
const bindFilter = (el, q, redraw) => {
  $('#fGrade', el).onchange = (e) => { q.grade = e.target.value; q.class_id = ''; redraw(); };
  $('#fClass', el).onchange = (e) => { q.class_id = e.target.value; redraw(); };
};
const qs = (q) => new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();

// ================= داشبورد =================
async function home(el, _p, me) {
  const d = await api('/api/teacher/overview');
  classesCache = d.classes;
  setHead(`سلام، ${esc(me.user.full_name)}`, `${jdate(me.today, { weekday: true })} · ${fa(d.classes.length)} کلاس`,
    `<a class="btn ghost sm" href="#/assignments">${icon('plus', { size: 16 })} تکلیف جدید</a><a class="btn sm" href="#/attendance">${icon('user-check', { size: 16 })} حضور و غیاب</a>`);
  el.innerHTML = `<div class="grid c4">${kpiCard('users', '', fa(d.stats.students), 'دانش‌آموز در کلاس‌های من', '', '#/students')}${kpiCard('clipboard', 'sun', fa(d.stats.openAssignments), 'تکلیف با مهلت باز', '', '#/assignments')}
    ${kpiCard('inbox', 'green', fa(d.stats.newSubmissions), 'ارسال جدید', 'دو روز اخیر', '#/assignments')}${kpiCard('user-x', 'red', fa(d.stats.absentToday), 'غایب امروز', '', '#/attendance')}</div>
  <div class="grid c3" style="margin-top:var(--s-5)">
    <section class="card"><div class="card-title"><span class="ib slate">${icon('calendar', { size: 18 })}</span>کلاس‌های امروز</div>
      ${d.today.length ? d.today.map((s) => `<div class="class-slot" style="flex-wrap:wrap"><div class="tm">${fa(s.start)} تا ${fa(s.end)}</div><div class="grow" style="min-width:120px"><b class="row" style="gap:6px">${subjIcon(s.subject, 16)} ${esc(s.subject)}</b><div class="tiny muted">کلاس ${gradeName(s.grade)} ${esc(s.class_name)}</div></div><a class="btn sm soft" href="#/attendance/${s.class_id}">${icon('user-check', { size: 16 })} حضور</a></div>`).join('') : empty('calendar', '<b>امروز کلاسی ندارید</b>برنامه هفتگی را مدیر کانون تنظیم می‌کند.')}</section>
    <section class="card"><div class="card-title"><span class="ib">${icon('building', { size: 18 })}</span>کلاس‌های من</div><div class="list">${d.classes.map((c) => `<a class="list-item click" href="#/students?class=${c.id}" style="color:inherit;font-weight:inherit"><div class="avatar sm txt">${fa(c.grade)}</div><div class="grow"><b class="small">کلاس ${clsLabel(c)}</b><div class="tiny muted">${esc(c.subjects)}</div></div><span class="badge gray">${fa(c.students)} نفر</span></a>`).join('')}</div></section>
    <section class="card"><div class="card-title"><span class="ib sun">${icon('trophy', { size: 18 })}</span>برترین‌های امتیاز</div><div class="list">${d.top.map((s, i) => `<a class="list-item click" href="#/students/${s.id}" style="color:inherit;font-weight:inherit"><span class="badge ${i < 3 ? 'yellow' : 'gray'}" style="min-width:28px;justify-content:center">${fa(i + 1)}</span>${nameAvatar(s.full_name, 'sm')}<div class="grow"><b class="small">${esc(s.full_name)}</b><div class="tiny muted">کلاس ${gradeName(s.grade)} ${esc(s.class_name)}</div></div><b class="num">${fa(s.points)}</b></a>`).join('')}</div></section>
  </div>
  <div class="quick" style="margin-top:var(--s-5);grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${[['/attendance', 'user-check', 'حضور و غیاب', 'ثبت با یک لمس', ''], ['/assignments', 'clipboard', 'تکلیف جدید', 'پایه، کلاس و مهلت', 'sun'], ['/exams', 'camera', 'اسکن پاسخ‌برگ', 'نمره‌دهی خودکار', 'green'], ['/plans', 'timer', 'برنامه مطالعه', 'پومودوروی هفتگی', 'slate']].map(([h, i, t, d_, c]) => `<a class="qa" href="#${h}"><span class="ib ${c}">${icon(i, { size: 22 })}</span><span class="grow"><b>${t}</b><span class="d">${d_}</span></span><span class="go">${icon('chevron-left')}</span></a>`).join('')}</div>`;
}

// ================= حضور و غیاب =================
async function attendance(el, params) {
  const classes = await myClasses();
  let classId = Number(params.id) || classes[0]?.id;
  let date = state.me.today;
  setHead('حضور و غیاب', 'با هر لمس وضعیت عوض می‌شود: حاضر ← غایب ← غایب با اطلاع');
  const NEXT = { present: 'absent', absent: 'excused', excused: 'present' };
  const LBL = { present: 'حاضر', absent: 'غایب', excused: 'با اطلاع' };
  let rows = [];
  const load = async () => {
    const d = await api(`/api/teacher/attendance?class_id=${classId}&date=${date}`);
    rows = d.students.map((s) => ({ ...s, status: s.status || 'present' }));
    draw(d.saved);
  };
  const draw = (saved) => {
    const c = (st) => rows.filter((r) => r.status === st).length;
    $('#attBody', el).innerHTML = `<div class="row wrap" style="margin-bottom:14px"><span class="badge green">${icon('check-circle', { size: 16 })} حاضر: ${fa(c('present'))}</span><span class="badge red">${icon('user-x', { size: 16 })} غایب: ${fa(c('absent'))}</span><span class="badge yellow">${icon('message', { size: 16 })} با اطلاع: ${fa(c('excused'))}</span>${saved ? '<span class="badge blue">قبلاً ثبت شده — ویرایش</span>' : ''}
      <span class="grow"></span><button class="btn soft sm" id="allPresent">${icon('user-check', { size: 16 })} همه حاضر</button></div>
      <div class="att-grid">${rows.map((r) => `<div class="att-card ${r.status}" data-sid="${r.id}" role="button" tabindex="0">${nameAvatar(r.full_name, 'sm')}<b class="small grow ellipsis">${esc(r.full_name)}</b><span class="st">${LBL[r.status]}</span></div>`).join('')}</div>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn lg green" id="saveAtt">${icon('check', { size: 16 })} ثبت حضور و غیاب</button></div>`;
  };
  el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row wrap"><div class="chips" id="clsChips">${classes.map((c) => `<button class="chip ${c.id === classId ? 'on' : ''}" data-cls="${c.id}">کلاس ${clsLabel(c)}</button>`).join('')}</div><span class="grow"></span>
    <div style="width:270px">${dateField('attDate', date, { minYear: 1404, maxYear: 1406 })}</div></div></div><div class="card" id="attBody">${empty('clock', 'در حال بارگذاری…')}</div>`;
  on(el, 'click', '[data-cls]', (e, b) => { classId = Number(b.dataset.cls); $$('[data-cls]', el).forEach((x) => x.classList.toggle('on', x === b)); load(); });
  on(el, 'change', '[data-date] select', () => { const d = readDate(el, 'attDate'); if (d) { date = d; load(); } });
  on(el, 'click', '.att-card', (e, card) => { const r = rows.find((x) => x.id === Number(card.dataset.sid)); r.status = NEXT[r.status]; card.className = `att-card ${r.status}`; card.querySelector('.st').textContent = LBL[r.status]; const c = (st) => rows.filter((x) => x.status === st).length; const b = $$('#attBody .badge', el); b[0].innerHTML = `${icon('check-circle', { size: 16 })} حاضر: ${fa(c('present'))}`; b[1].innerHTML = `${icon('user-x', { size: 16 })} غایب: ${fa(c('absent'))}`; b[2].innerHTML = `${icon('message', { size: 16 })} با اطلاع: ${fa(c('excused'))}`; });
  on(el, 'click', '#allPresent', () => { rows.forEach((r) => { r.status = 'present'; }); draw(); });
  on(el, 'click', '#saveAtt', (e, b) => busy(b, async () => {
    const r = await post('/api/teacher/attendance', { class_id: classId, date, records: rows.map((x) => ({ student_id: x.id, status: x.status })) });
    await modal({ title: ' حضور و غیاب ثبت شد', body: `<div class="grid c3 center"><div class="card flat"><div class="pos" style="font-size:26px">${fa(r.present)}</div><div class="small">حاضر</div></div><div class="card flat"><div class="neg" style="font-size:26px">${fa(r.absent)}</div><div class="small">غایب</div></div><div class="card flat"><div style="font-size:26px;color:#a16207;font-weight:800">${fa(r.excused)}</div><div class="small">غایب با اطلاع</div></div></div>
      <div class="card tint-orange" style="margin-top:14px"><div class="row"><span class="ib">${icon('phone', { size: 18 })}</span><div><b>تعداد پیامک غیبت برای ارسال به والدین: ${fa(r.sms)}</b><div class="small muted">ارسال پیامک از داشبورد مدیر کانون انجام می‌شود. غیبت بدون اطلاع ۵ امتیاز منفی دارد.</div></div></div></div>`, actions: [{ label: 'باشه', value: true }] });
    load();
  }));
  load();
}

// ================= تکالیف =================
async function assignments(el) {
  const classes = await myClasses();
  const q = {};
  setHead('تکالیف', 'ساخت تکلیف و پیگیری ارسال‌ها', '<a class="btn ghost sm" href="#/assignments/report"> گزارش تکالیف</a> <button class="btn sm" id="newAsg"> تکلیف جدید</button>');
  const draw = async () => {
    const list = await api(`/api/teacher/assignments?${qs(q)}`);
    el.innerHTML = filterBar(classes, q) + `<div class="grid c2">${list.map((a) => {
      const rate = a.total ? Math.round((a.submitted / a.total) * 100) : 0;
      return `<div class="card"><div class="row" style="align-items:flex-start"><div class="avatar" style="background:var(--orange-soft)">${subjIcon(a.subject)}</div><div class="grow"><b>${esc(a.title)}</b>
        <div class="tiny muted">کلاس ${gradeName(a.grade)} ${esc(a.class_name)} • ${esc(a.subject || '')} • ${icon('star', { size: 16 })} ${fa(a.reward_points)} امتیاز</div></div>${cdHtml(a.deadline)}</div>
        <div style="margin:12px 0 6px" class="row between small"><span>ارسال: <b>${fa(a.submitted)}</b> از ${fa(a.total)} ${a.late ? `<span class="badge orange">${fa(a.late)} با تأخیر</span>` : ''}</span><b>${pct(rate)}</b></div>${progress(rate, rate > 75 ? 'green' : rate > 40 ? 'orange' : '')}
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost sm" data-del="${a.id}">${icon('trash', { size: 16 })}</button><button class="btn soft sm" data-view="${a.id}">مشاهده ارسال‌ها</button></div></div>`;
    }).join('') || `<div class="card">${empty('inbox', 'تکلیفی وجود ندارد')}</div>`}</div>`;
    bindFilter(el, q, draw);
  };
  await draw();
  on(el, 'click', '[data-view]', async (e, b) => {
    const a = await api(`/api/teacher/assignments/${b.dataset.view}`);
    modal({ title: `${icon('inbox', { size: 16 })} ${esc(a.title)}`, wide: true, body: `<div class="small muted" style="margin-bottom:10px">کلاس ${gradeName(a.grade)} ${esc(a.class_name)} • مهلت ${jdate(a.deadline)} ${jtime(a.deadline)}</div><div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>وضعیت</th><th>یادداشت</th><th>فایل</th><th>زمان</th></tr></thead><tbody>
      ${a.students.map((s) => `<tr><td>${esc(s.full_name)}</td><td>${s.submitted_at ? (s.late ? '<span class="badge orange">با تأخیر</span>' : '<span class="badge green">به‌موقع</span>') : '<span class="badge red">ارسال نشده</span>'}</td><td class="small">${esc(s.note || '—')}</td>
      <td>${s.file_path ? `<a href="/roshd/uploads/${esc(s.file_path)}" target="_blank">${icon('file-text', { size: 16 })} ${esc(s.file_name || 'فایل')}</a>` : '—'}</td><td class="tiny">${s.submitted_at ? `${jshort(s.submitted_at)} ${jtime(s.submitted_at)}` : '—'}</td></tr>`).join('')}</tbody></table></div>` });
  });
  on(el, 'click', '[data-del]', async (e, b) => { if (await confirmBox('این تکلیف و امتیازهای مرتبط حذف شود؟', 'حذف')) busy(b, async () => { await del(`/api/teacher/assignments/${b.dataset.del}`); toast('حذف شد', 'ok'); draw(); }); });
  $('#newAsg').onclick = () => {
    const grades = [...new Set(classes.map((c) => c.grade))];
    const subjects = [...new Set(classes.flatMap((c) => c.subjects.split('، ')))];
    modal({
      title: ' تکلیف جدید', wide: true,
      body: `<form class="stack" id="asgForm"><div class="form-grid"><div class="field"><label>پایه</label><select class="input" name="grade" id="aGrade">${grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div>
        <div class="field"><label>درس</label><select class="input" name="subject">${subjects.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>امتیاز تشویقی ارسال به‌موقع</label><input class="input" type="number" name="reward_points" value="5" min="0" max="50"></div></div>
        <div class="field"><label>کلاس‌ها</label><div class="chips" id="aClasses"></div></div>
        <div class="field"><label>عنوان تکلیف</label><input class="input" name="title" required placeholder="مثلاً: حل تمرین‌های صفحه ۳۲"></div>
        <div class="field"><label>توضیحات</label><textarea class="input" name="description"></textarea></div>
        <div class="form-grid"><div class="field"><label>تاریخ مهلت</label>${dateField('deadline', addDays(state.me.today, 3), { minYear: 1404, maxYear: 1406 })}</div><div class="field"><label>ساعت مهلت</label><input class="input ltr" type="time" name="time" value="22:00"></div></div></form>`,
      onOpen: (m) => {
        const drawCls = () => { const g = Number($('#aGrade', m).value); $('#aClasses', m).innerHTML = classes.filter((c) => c.grade === g).map((c, i) => `<label class="chip ${i ? '' : 'on'}"><input type="checkbox" value="${c.id}" ${i ? '' : 'checked'} hidden> کلاس ${esc(c.name)}</label>`).join(''); };
        drawCls();
        $('#aGrade', m).onchange = drawCls;
        on(m, 'change', '#aClasses input', (e, inp) => inp.parentElement.classList.toggle('on', inp.checked));
      },
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
        label: ' انتشار تکلیف', onClick: async (m) => {
          const f = formData($('#asgForm', m));
          const day = readDate(m, 'deadline');
          if (!day) throw new Error('تاریخ مهلت را کامل کنید');
          const class_ids = $$('#aClasses input:checked', m).map((i) => Number(i.value));
          const r = await post('/api/teacher/assignments', { ...f, class_ids, deadline: tehranIso(day, f.time) });
          toast(`تکلیف برای ${fa(r.count)} کلاس منتشر شد`, 'ok'); draw();
        },
      }],
    });
  };
}

async function asgReport(el) {
  const classes = await myClasses();
  const q = {};
  setHead('گزارش تکالیف', 'آمار کلی ارسال به تفکیک کلاس و دانش‌آموز', '<a class="btn ghost sm" href="#/assignments">→ تکالیف</a>');
  const draw = async () => {
    const d = await api(`/api/teacher/assignments-report?${qs(q)}`);
    const tot = d.classes.reduce((a, c) => ({ e: a.e + c.expected, o: a.o + c.onTime, l: a.l + c.late, m: a.m + c.missing }), { e: 0, o: 0, l: 0, m: 0 });
    el.innerHTML = filterBar(classes, q) + `<div class="grid c4">${kpiCard('clipboard', '', fa(tot.e), 'ارسال مورد انتظار')}${kpiCard('check-circle', 'green', fa(tot.o), 'ارسال به‌موقع')}${kpiCard('clock', 'sun', fa(tot.l), 'ارسال با تأخیر')}${kpiCard('x', 'red', fa(tot.m), 'ارسال‌نشده', 'مهلت گذشته')}</div>
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('chart', { size: 18 })}</span>وضعیت ارسال به تفکیک کلاس</div>${barChart(d.classes.map((c) => ({ label: clsLabel(c), values: [c.onTime, c.late, c.missing] })), [{ name: 'به‌موقع', color: '#0E9157' }, { name: 'با تأخیر', color: '#F2B33D' }, { name: 'ارسال‌نشده', color: '#D8262F' }], { stacked: true, height: 240, fmt: (v) => fa(Math.round(v)) })}</div>
      <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('users', { size: 18 })}</span>دانش‌آموزان</div><div class="table-wrap" style="max-height:520px"><table class="table"><thead><tr><th>دانش‌آموز</th><th>کلاس</th><th>به‌موقع</th><th>با تأخیر</th><th>کل تکالیف</th><th style="min-width:140px">درصد ارسال</th></tr></thead><tbody>
      ${d.students.sort((a, b) => a.rate - b.rate).map((s) => `<tr class="click" onclick="location.hash='#/students/${s.id}'"><td>${esc(s.full_name)}</td><td>${gradeName(s.grade)} ${esc(s.class_name)}</td><td class="pos">${fa(s.on_time)}</td><td style="color:#c2410c">${fa(s.late)}</td><td>${fa(s.total)}</td><td><div class="row">${progress(s.rate, s.rate > 75 ? 'green sm' : 'orange sm')}<b class="small">${pct(s.rate)}</b></div></td></tr>`).join('')}</tbody></table></div></div>`;
    bindFilter(el, q, draw);
  };
  draw();
}

// ================= آزمون‌ها =================
async function exams(el) {
  const classes = await myClasses();
  setHead('آزمون‌ها', 'آزمون آنلاین با تصحیح خودکار یا آزمون کاغذی با اسکن پاسخ‌برگ', '<button class="btn sm" id="newExam"> آزمون جدید</button>');
  const list = await api('/api/teacher/exams');
  el.innerHTML = `<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>عنوان</th><th>نوع</th><th>پایه/کلاس</th><th>سؤال</th><th>شرکت‌کننده</th><th>میانگین</th><th>تاریخ</th></tr></thead><tbody>
    ${list.map((e) => `<tr class="click" data-href="#/exams/${e.id}"><td class="bold">${subjIcon(e.subject)} ${esc(e.title)}</td><td><span class="badge ${e.kind === 'online' ? 'blue' : 'orange'}">${e.kind === 'online' ? ' آنلاین' : ' کاغذی'}</span></td>
    <td>${gradeName(e.grade)}${e.class_name ? ` - ${esc(e.class_name)}` : ' (همه کلاس‌ها)'}</td><td>${fa(e.qcount)}</td><td>${fa(e.results)}</td><td>${e.avg == null ? '—' : pct(e.avg)}</td><td class="tiny">${jdate(e.created_at)}</td></tr>`).join('') || `<tr><td colspan="7">${empty('file-check', 'هنوز آزمونی نساخته‌اید')}</td></tr>`}</tbody></table></div></div>`;
  on(el, 'click', 'tr[data-href]', (e, tr) => { location.hash = tr.dataset.href; });
  $('#newExam').onclick = () => examEditor(classes);
}

function examEditor(classes) {
  const grades = [...new Set(classes.map((c) => c.grade))];
  const subjects = [...new Set(classes.flatMap((c) => c.subjects.split('، ')))];
  let kind = 'online';
  let questions = [{ text: '', options: ['', '', '', ''], answer: 0 }];
  let keyCount = 10, key = Array(10).fill(null);
  modal({
    title: ' ساخت آزمون', wide: true,
    body: `<div class="seg" style="margin-bottom:14px"><button class="on" data-kind="online"> آزمون آنلاین (تستی)</button><button data-kind="paper">${icon('file-text', { size: 16 })} آزمون کاغذی + کلید پاسخ</button></div>
      <form id="exForm" class="form-grid"><div class="field"><label>عنوان آزمون</label><input class="input" name="title" required></div>
      <div class="field"><label>درس</label><select class="input" name="subject">${subjects.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
      <div class="field"><label>پایه</label><select class="input" name="grade" id="exGrade">${grades.map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div>
      <div class="field"><label>کلاس</label><select class="input" name="class_id" id="exClass"></select></div>
      <div class="field" id="durField"><label>مدت (دقیقه)</label><input class="input" type="number" name="duration_min" value="15" min="1" max="180"></div></form>
      <div id="qArea" style="margin-top:16px"></div>`,
    onOpen: (m) => {
      const drawCls = () => { const g = Number($('#exGrade', m).value); $('#exClass', m).innerHTML = `<option value="">همه کلاس‌های پایه</option>${classes.filter((c) => c.grade === g).map((c) => `<option value="${c.id}">کلاس ${esc(c.name)}</option>`).join('')}`; };
      drawCls(); $('#exGrade', m).onchange = drawCls;
      const drawQ = () => {
        const area = $('#qArea', m);
        if (kind === 'online') {
          area.innerHTML = questions.map((q, i) => `<div class="card flat" style="margin-bottom:10px"><div class="row"><b>سؤال ${fa(i + 1)}</b><span class="grow"></span>${questions.length > 1 ? `<button class="btn ghost sm" data-rmq="${i}">${icon('trash', { size: 16 })}</button>` : ''}</div>
            <textarea class="input" data-qt="${i}" placeholder="متن سؤال" style="min-height:60px;margin:8px 0">${esc(q.text)}</textarea>
            <div class="form-grid">${q.options.map((o, j) => `<label class="row" style="gap:6px"><input type="radio" name="ans${i}" data-qa="${i}" value="${j}" ${q.answer === j ? 'checked' : ''} title="پاسخ درست"><input class="input" data-qo="${i},${j}" value="${esc(o)}" placeholder="گزینه ${fa(j + 1)}"></label>`).join('')}</div></div>`).join('') + '<button class="btn soft" id="addQ" type="button"> افزودن سؤال</button> <span class="tiny muted">دکمه رادیویی کنار هر گزینه = پاسخ درست</span>';
        } else {
          area.innerHTML = `<div class="row"><label class="small bold">تعداد سؤال‌ها</label><input class="input" type="number" id="keyN" value="${keyCount}" min="1" max="${MAX_Q}" style="width:100px"></div>
            <div class="small muted" style="margin:8px 0">کلید پاسخ را با لمس گزینه درست هر سؤال مشخص کنید:</div><div class="ans-grid">${key.map((a, q) => `<div class="ans-row"><span class="qn">${fa(q + 1)}</span>${[0, 1, 2, 3].map((o) => `<button type="button" class="${a === o ? 'on' : ''}" data-key="${q},${o}">${fa(o + 1)}</button>`).join('')}</div>`).join('')}</div>`;
        }
      };
      drawQ();
      on(m, 'click', '[data-kind]', (e, b) => { kind = b.dataset.kind; $$('[data-kind]', m).forEach((x) => x.classList.toggle('on', x === b)); $('#durField', m).style.display = kind === 'online' ? '' : 'none'; drawQ(); });
      on(m, 'input', '[data-qt]', (e, t) => { questions[t.dataset.qt].text = t.value; });
      on(m, 'input', '[data-qo]', (e, t) => { const [i, j] = t.dataset.qo.split(',').map(Number); questions[i].options[j] = t.value; });
      on(m, 'change', '[data-qa]', (e, t) => { questions[t.dataset.qa].answer = Number(t.value); });
      on(m, 'click', '#addQ', () => { questions.push({ text: '', options: ['', '', '', ''], answer: 0 }); drawQ(); });
      on(m, 'click', '[data-rmq]', (e, b) => { questions.splice(Number(b.dataset.rmq), 1); drawQ(); });
      on(m, 'click', '[data-key]', (e, b) => { const [q, o] = b.dataset.key.split(',').map(Number); key[q] = o; drawQ(); });
      on(m, 'change', '#keyN', (e, t) => { keyCount = Math.max(1, Math.min(MAX_Q, Number(en(t.value)) || 1)); key = Array.from({ length: keyCount }, (_, i) => key[i] ?? null); drawQ(); });
    },
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
      label: ' ذخیره آزمون', onClick: async (m) => {
        const f = formData($('#exForm', m));
        const subject = f.subject;
        const qs_ = kind === 'online' ? questions.map((q) => ({ ...q, subject })) : key.map((a) => ({ answer: a, subject }));
        if (kind === 'paper' && key.some((a) => a == null)) throw new Error('کلید پاسخ همه سؤال‌ها را مشخص کنید');
        const r = await post('/api/teacher/exams', { ...f, kind, questions: qs_ });
        toast('آزمون ساخته شد', 'ok');
        location.hash = `#/exams/${r.id}`;
      },
    }],
  });
}

async function examDetail(el, { id }) {
  const e = await api(`/api/teacher/exams/${id}`);
  const done = new Set(e.results.map((r) => r.student_id));
  setHead(`${esc(e.title)}`, `${e.kind === 'online' ? 'آزمون آنلاین' : 'آزمون کاغذی'} • پایه ${gradeName(e.grade)} • ${fa(e.questions.length)} سؤال`,
    `<a class="btn ghost sm" href="#/exams">→ آزمون‌ها</a> <button class="btn ghost sm" id="printSheet">${icon('printer', { size: 16 })} پاسخ‌برگ</button> <button class="btn sm green" id="scan">${icon('camera', { size: 16 })} اسکن پاسخ‌برگ</button> <button class="btn ghost sm" id="delExam">${icon('trash', { size: 16 })}</button>`);
  const dist = [0, 0, 0, 0, 0];
  e.results.forEach((r) => { dist[Math.min(4, Math.floor(r.percent / 20))]++; });
  el.innerHTML = `<div class="grid c3"><div class="card center tint-violet">${ring(e.avg || 0, { size: 140, label: e.avg == null ? '—' : pct(e.avg), sub: 'میانگین' })}<div class="small" style="margin-top:8px">${fa(e.results.length)} از ${fa(e.students.length)} نفر شرکت کرده‌اند</div></div>
    <div class="card span2"><div class="card-title"><span class="ib">${icon('chart', { size: 18 })}</span>توزیع درصدها</div>${barChart(['۰-۲۰', '۲۰-۴۰', '۴۰-۶۰', '۶۰-۸۰', '۸۰-۱۰۰'].map((l, i) => ({ label: l, values: [dist[i]] })), [{ name: 'تعداد دانش‌آموز', color: '#0B5F66' }], { height: 180, fmt: (v) => fa(Math.round(v)) })}</div></div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('award', { size: 18 })}</span>رتبه‌بندی و نتایج</div><div class="table-wrap"><table class="table"><thead><tr><th>رتبه</th><th>دانش‌آموز</th><th>کلاس</th><th>درست/غلط/نزده</th><th>درصد</th><th>روش</th></tr></thead><tbody>
    ${e.results.map((r) => `<tr><td><b><span class="badge ${r.rank <= 3 ? 'yellow' : 'gray'}" style="min-width:28px;justify-content:center">${fa(r.rank)}</span></b></td><td>${esc(r.full_name)}</td><td>${esc(r.class_name || '')}</td><td><span class="pos">${fa(r.correct)}</span> / <span class="neg">${fa(r.wrong)}</span> / ${fa(r.blank)}</td><td><b>${pct(r.percent)}</b></td><td><span class="badge ${r.source === 'online' ? 'blue' : 'orange'}">${r.source === 'online' ? 'آنلاین' : 'اسکن'}</span></td></tr>`).join('') || `<tr><td colspan="6">${empty('clock', 'هنوز نتیجه‌ای ثبت نشده')}</td></tr>`}</tbody></table></div></div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('clock', { size: 18 })}</span>بدون نتیجه (${fa(e.students.length - done.size)})</div><div class="chips">${e.students.filter((s) => !done.has(s.id)).map((s) => `<button class="chip" data-scan="${s.id}">${esc(s.full_name)}</button>`).join('') || '—'}</div></div>`;
  const scanner = (pre) => openScanner({ exam: e, students: e.students.map((s) => ({ ...s, done: done.has(s.id) })), preselect: pre, onSave: (sid, answers) => post(`/api/teacher/exams/${id}/result`, { student_id: sid, answers }) }).then(() => examDetail(el, { id }));
  $('#scan').onclick = () => scanner();
  on(el, 'click', '[data-scan]', (ev, b) => scanner(Number(b.dataset.scan)));
  $('#printSheet').onclick = () => printSheet({ title: e.title, subtitle: `پایه ${gradeName(e.grade)} • ${fa(e.questions.length)} سؤال`, count: e.questions.length });
  $('#delExam').onclick = async () => { if (await confirmBox('آزمون و همه نتایج آن حذف شود؟', 'حذف')) { await del(`/api/teacher/exams/${id}`); toast('حذف شد', 'ok'); location.hash = '#/exams'; } };
}

// ================= دانش‌آموزان =================
async function students(el) {
  const classes = await myClasses();
  const q = {};
  const m = /class=(\d+)/.exec(location.hash); if (m) q.class_id = m[1];
  setHead('عملکرد دانش‌آموزان', 'امتیاز، رتبه، میانگین آزمون، غیبت و مطالعه هفته');
  const draw = async () => {
    const list = await api(`/api/teacher/students?${qs(q)}`);
    el.innerHTML = filterBar(classes, q) + `<div class="card"><input class="input" id="sSearch" placeholder=" جستجوی نام…" style="margin-bottom:12px"><div class="table-wrap"><table class="table"><thead><tr><th>رتبه پایه</th><th>دانش‌آموز</th><th>کلاس</th><th>امتیاز</th><th>سطح</th><th>میانگین آزمون</th><th>غیبت ماه</th><th>مطالعه هفته</th></tr></thead><tbody id="sBody">
      ${list.map((s) => `<tr class="click" data-href="#/students/${s.id}" data-name="${esc(s.full_name)}"><td><b>${fa(s.rank)}</b></td><td>${esc(s.full_name)}</td><td>${gradeName(s.grade)} ${esc(s.class_name)}</td><td><b>${fa(s.points)}</b></td><td>${s.level.name}</td>
      <td>${s.avg_percent == null ? '—' : `<span class="badge ${s.avg_percent >= 75 ? 'green' : s.avg_percent >= 50 ? 'yellow' : 'red'}">${pct(s.avg_percent)}</span>`}</td><td>${s.absences ? `<span class="neg">${fa(s.absences)}</span>` : '۰'}</td><td>${fa(s.week_minutes)} دقیقه</td></tr>`).join('')}</tbody></table></div></div>`;
    bindFilter(el, q, draw);
    $('#sSearch', el).oninput = (e) => $$('#sBody tr', el).forEach((tr) => { tr.style.display = tr.dataset.name.includes(e.target.value.trim()) ? '' : 'none'; });
  };
  await draw();
  on(el, 'click', 'tr[data-href]', (e, tr) => { location.hash = tr.dataset.href; });
}

export function studentDetailHtml(d) {
  const att = d.attendance;
  return `<div class="grid c3"><div class="card tint-violet"><div class="row">${avatar(d.info.avatar, 'lg')}<div><h3>${esc(d.info.full_name)}</h3><div class="small muted">پایه ${gradeName(d.info.grade)} • کلاس ${esc(d.info.class_name)}</div><div class="small">${esc(d.info.school || '')}</div></div></div>
    <div class="row" style="margin-top:14px;gap:8px"><div class="card flat grow center" style="padding:10px"><b style="font-size:20px">${fa(d.points)}</b><div class="tiny muted">امتیاز</div></div><div class="card flat grow center" style="padding:10px"><b style="font-size:20px">${fa(d.level.index)}</b><div class="tiny muted">${d.level.name}</div></div></div></div>
    <div class="card"><div class="card-title"><span class="ib green">${icon('calendar', { size: 18 })}</span>حضور</div><div class="list"><div class="list-item">${icon('check-circle', { size: 16 })} حاضر<b style="margin-inline-start:auto">${fa(att.present || 0)}</b></div><div class="list-item">${icon('user-x', { size: 16 })} غایب<b class="neg" style="margin-inline-start:auto">${fa(att.absent || 0)}</b></div><div class="list-item">${icon('message', { size: 16 })} با اطلاع<b style="margin-inline-start:auto">${fa(att.excused || 0)}</b></div></div></div>
    <div class="card"><div class="card-title"><span class="ib sun">${icon('timer', { size: 18 })}</span>برنامه این هفته</div>${d.week.plan.map((p) => `<div style="margin-bottom:8px"><div class="row between small"><span>${esc(p.subject)}</span><span>${fa(p.done)} از ${fa(p.target)}</span></div>${progress((p.done / p.target) * 100, 'orange sm')}</div>`).join('') || empty('calendar', 'برنامه‌ای تعیین نشده')}</div></div>
    <div class="grid c2" style="margin-top:18px"><div class="card"><div class="card-title"><span class="ib">${icon('trend', { size: 18 })}</span>روند پیشرفت ماهانه</div>${d.progress.length ? lineChart(d.progress.map((p) => JMONTHS[jparts(p.month + '-15')[1] - 1]), [{ name: 'میانگین درصد', color: '#0B5F66', values: d.progress.map((p) => p.avg) }], { max: 100, height: 180 }) : empty('trend', 'داده کافی نیست')}</div>
    <div class="card"><div class="card-title"><span class="ib">${icon('file-check', { size: 18 })}</span>تسلط درس‌ها (۶۰ روز اخیر)</div>${d.insights.map((x) => `<div style="margin-bottom:10px"><div class="row between small"><b>${subjIcon(x.s)} ${esc(x.s)}</b><span>${pct(x.pct)}</span></div>${progress(x.pct, x.pct >= 75 ? 'green' : x.pct >= 50 ? 'orange' : '')}</div>`).join('') || empty('file-check', 'بدون داده')}</div></div>
    <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('award', { size: 18 })}</span>آخرین آزمون‌ها</div><div class="table-wrap"><table class="table"><thead><tr><th>آزمون</th><th>تاریخ</th><th>درصد</th><th>رتبه</th></tr></thead><tbody>${d.results.map((r) => `<tr><td>${esc(r.title)}</td><td class="tiny">${jdate(r.created_at)}</td><td><b>${pct(r.percent)}</b></td><td>${fa(r.rank)} از ${fa(r.of)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

async function studentDetail(el, { id }) {
  const d = await api(`/api/teacher/students/${id}`);
  setHead(esc(d.info.full_name), 'پرونده عملکرد، مسیر یادگیری و یادداشت مشاوره', `<a class="btn ghost sm" href="#/students">→ دانش‌آموزان</a> <a class="btn soft sm" href="#/messages/${id}">${icon('message', { size: 16 })} پیام</a> <button class="btn sm" id="givePts">${icon('star', { size: 16 })} امتیاز کلاسی</button>`);
  let steps = d.path.steps.map((s) => ({ ...s }));
  let summary = d.path.summary || '';
  el.innerHTML = studentDetailHtml(d) + `
    <div class="grid c2" style="margin-top:18px"><div class="card tint-teal"><div class="card-title"><span class="ib">${icon('sparkles', { size: 18 })}</span>مسیر یادگیری هوشمند پیشنهادی<button class="btn soft sm more" id="regen">${icon('sparkles', { size: 16 })} بازتولید هوشمند</button></div>
      <textarea class="input" id="lpSummary" style="min-height:50px;margin-bottom:10px">${esc(summary)}</textarea><div id="lpSteps"></div>
      <div class="row" style="margin-top:10px"><button class="btn ghost sm" id="addStep">${icon('plus', { size: 16 })} گام جدید</button><span class="grow"></span><button class="btn green" id="savePath">${icon('check', { size: 16 })} ذخیره مسیر</button></div></div>
    <div class="card"><div class="card-title"><span class="ib sun">${icon('clipboard', { size: 18 })}</span>یادداشت مشاوره‌ای (قابل مشاهده برای والدین)</div>
      <form id="noteForm" class="stack"><textarea class="input" name="body" placeholder="مثلاً: در حل مسئله خلاق است؛ پیشنهاد می‌شود…" required></textarea><button class="btn sm" style="align-self:flex-end">افزودن یادداشت</button></form>
      <div class="list" style="margin-top:10px">${d.notes.map((n) => `<div class="list-item" style="align-items:flex-start"><span>${icon('file-text', { size: 16 })}</span><div class="grow"><div class="small">${esc(n.body)}</div><div class="tiny muted">${esc(n.teacher || '')} • ${jdate(n.created_at)}</div></div></div>`).join('') || empty('file-text', 'یادداشتی ثبت نشده')}</div></div></div>`;
  const KINDS = { review: 'مرور', practice: 'تمرین', challenge: 'چالش', habit: 'عادت' };
  const drawSteps = () => {
    $('#lpSteps', el).innerHTML = steps.map((s, i) => `<div class="card flat" style="padding:10px;margin-bottom:8px"><div class="row"><b class="small">${fa(i + 1)}.</b><input class="input" data-st="${i},title" value="${esc(s.title)}"><select class="input" data-st="${i},kind" style="width:110px">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="icon-btn" data-rm="${i}" aria-label="حذف">${icon('trash', { size: 16 })}</button></div>
      <textarea class="input" data-st="${i},detail" style="min-height:44px;margin-top:6px">${esc(s.detail || '')}</textarea>${s.done ? '<span class="badge green" style="margin-top:4px">انجام‌شده توسط دانش‌آموز</span>' : ''}</div>`).join('');
  };
  drawSteps();
  on(el, 'input', '[data-st]', (e, t) => { const [i, k] = t.dataset.st.split(','); steps[i][k] = t.value; });
  on(el, 'change', 'select[data-st]', (e, t) => { const [i, k] = t.dataset.st.split(','); steps[i][k] = t.value; });
  on(el, 'click', '[data-rm]', (e, b) => { steps.splice(Number(b.dataset.rm), 1); drawSteps(); });
  $('#addStep', el).onclick = () => { steps.push({ title: '', detail: '', kind: 'practice' }); drawSteps(); };
  $('#regen', el).onclick = (e) => busy(e.target, async () => { const g = await post(`/api/teacher/students/${id}/path/regenerate`); steps = g.steps; $('#lpSummary', el).value = g.summary; drawSteps(); toast('پیشنهاد جدید ساخته شد؛ پس از بازبینی ذخیره کنید'); });
  $('#savePath', el).onclick = (e) => busy(e.target, async () => { await put(`/api/teacher/students/${id}/path`, { steps, summary: $('#lpSummary', el).value }); toast('مسیر یادگیری ذخیره شد', 'ok'); });
  $('#noteForm', el).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/teacher/students/${id}/notes`, formData(e.target)); toast('یادداشت ثبت شد', 'ok'); studentDetail(el, { id }); }); };
  $('#givePts').onclick = () => modal({ title: ' امتیاز کلاسی', body: `<form class="stack" id="ptsForm"><div class="field"><label>امتیاز (بین ۲۰- تا ۲۰)</label><input class="input" type="number" name="amount" value="3" min="-20" max="20"></div><div class="field"><label>بابت</label><input class="input" name="reason" placeholder="مثلاً: مشارکت فعال در کلاس"></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ثبت امتیاز', onClick: async (m) => { await post(`/api/teacher/students/${id}/points`, formData($('#ptsForm', m))); toast('امتیاز ثبت شد', 'ok'); studentDetail(el, { id }); } }] });
}

// ================= برنامه پومودوروی هفتگی =================
async function plans(el) {
  const classes = await myClasses();
  let classId = classes[0]?.id, week = null;
  setHead('برنامه پومودوروی هفتگی', 'تعیین تعداد پومودوروی هر درس برای هفته و بررسی اجرای آن');
  const load = async () => {
    const d = await api(`/api/teacher/study-plans?class_id=${classId}${week ? `&week=${week}` : ''}`);
    week = d.week_start;
    const isCurrent = week >= addDays(state.me.today, -6);
    const total = d.plan.reduce((a, p) => a + p.target, 0);
    const items = d.plan.length ? d.plan : d.subjects.map((s) => ({ subject: s, target: 0 }));
    el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row wrap"><div class="chips">${classes.map((c) => `<button class="chip ${c.id === classId ? 'on' : ''}" data-cls="${c.id}">کلاس ${clsLabel(c)}</button>`).join('')}</div><span class="grow"></span>
      <div class="row"><button class="btn ghost sm" id="prevW">→ هفته قبل</button><b class="small">هفته ${jdate(week, { year: false })}</b><button class="btn ghost sm" id="nextW" ${isCurrent ? 'disabled' : ''}>هفته بعد ←</button></div></div></div>
      <div class="grid c3"><div class="card"><div class="card-title"><span class="ib sun">${icon('target', { size: 18 })}</span>برنامه هفته (${fa(total)} پومودورو)</div>
        <div class="stack" id="planItems">${items.map((p, i) => `<div class="row"><span class="grow">${subjIcon(p.subject)} <input class="input" data-ps="${i}" value="${esc(p.subject)}" style="display:inline-block;width:calc(100% - 30px)"></span><input class="input" type="number" min="0" max="30" data-pt="${i}" value="${p.target}" style="width:80px"></div>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn ghost sm" id="addP">${icon('plus', { size: 16 })} درس</button><span class="grow"></span><button class="btn" id="saveP">${icon('check', { size: 16 })} ذخیره برنامه</button></div>
        <div class="tiny muted" style="margin-top:8px">در پایان هفته، دانش‌آموزانی که برنامه را کامل اجرا نکنند ۱۰ امتیاز منفی می‌گیرند.</div></div>
      <div class="card span2"><div class="card-title"><span class="ib">${icon('search', { size: 18 })}</span>بررسی هفتگی اجرای برنامه</div><div class="table-wrap" style="max-height:520px"><table class="table"><thead><tr><th>دانش‌آموز</th>${d.plan.map((p) => `<th>${esc(p.subject)}</th>`).join('')}<th style="min-width:140px">پیشرفت</th></tr></thead><tbody>
        ${d.students.sort((a, b) => b.rate - a.rate).map((s) => `<tr><td>${esc(s.full_name)}</td>${d.plan.map((p) => `<td class="${(s.done[p.subject] || 0) >= p.target ? 'pos' : ''}">${fa(s.done[p.subject] || 0)} از ${fa(p.target)}</td>`).join('')}<td><div class="row">${progress(s.rate, s.rate >= 100 ? 'green sm' : 'orange sm')}<b class="small">${pct(s.rate)}</b></div></td></tr>`).join('')}</tbody></table></div></div></div>`;
    const read = () => $$('[data-ps]', el).map((inp, i) => ({ subject: inp.value.trim(), target: Number(en($(`[data-pt="${i}"]`, el).value)) || 0 }));
    $('#addP', el).onclick = () => { const it = read(); it.push({ subject: '', target: 1 }); d.plan = it.filter((x) => x.subject || x.target); items.splice(0, items.length, ...it); $('#planItems', el).insertAdjacentHTML('beforeend', `<div class="row"><span class="grow">${icon('book', { size: 16 })} <input class="input" data-ps="${it.length - 1}" placeholder="نام درس" style="display:inline-block;width:calc(100% - 30px)"></span><input class="input" type="number" min="0" max="30" data-pt="${it.length - 1}" value="1" style="width:80px"></div>`); };
    $('#saveP', el).onclick = (e) => busy(e.target, async () => { await post('/api/teacher/study-plans', { class_id: classId, week, items: read() }); toast('برنامه هفته ذخیره شد', 'ok'); load(); });
    $('#prevW', el).onclick = () => { week = addDays(week, -7); load(); };
    $('#nextW', el).onclick = () => { week = addDays(week, 7); load(); };
  };
  on(el, 'click', '[data-cls]', (e, b) => { classId = Number(b.dataset.cls); load(); });
  load();
}

// ================= ویدیو و جزوه =================
async function materials(el) {
  setHead('ویدیو و جزوه', 'فایل‌های آموزشی که دانش‌آموزان می‌توانند دانلود کنند', '<button class="btn sm" id="addMat"> افزودن فایل</button>');
  const list = await api('/api/teacher/materials');
  el.innerHTML = `<div class="card"><div class="list">${list.map((m) => `<div class="list-item"><div class="avatar sm" style="background:${m.kind === 'video' ? 'var(--red-soft)' : 'var(--blue-soft)'};color:${m.kind === 'video' ? 'var(--red-700)' : 'var(--slate-700)'}">${icon(m.kind === 'video' ? 'video' : 'file-text', { size: 18 })}</div><div class="grow"><b class="small">${esc(m.title)}</b><div class="tiny muted">${m.grade ? `پایه ${gradeName(m.grade)}` : 'همه پایه‌ها'} • ${esc(m.subject || '')} • ${jdate(m.created_at)}</div></div><a class="btn sm ghost" href="${esc(m.url)}" target="_blank">مشاهده</a></div>`).join('') || empty('inbox', 'فایلی نیست')}</div></div>`;
  const classes = await myClasses();
  $('#addMat').onclick = () => modal({
    title: ' افزودن ویدیو یا جزوه',
    body: `<form class="stack" id="matForm"><div class="field"><label>عنوان</label><input class="input" name="title" required></div><div class="form-grid"><div class="field"><label>نوع</label><select class="input" name="kind"><option value="pdf">${icon('file-text', { size: 16 })} جزوه (PDF)</option><option value="video">${icon('video', { size: 16 })} ویدیو</option><option value="file">${icon('file-text', { size: 16 })} سایر</option></select></div>
      <div class="field"><label>پایه</label><select class="input" name="grade"><option value="">همه</option>${[...new Set(classes.map((c) => c.grade))].map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div><div class="field"><label>درس</label><input class="input" name="subject"></div></div>
      <div class="field"><label>فایل (حداکثر ۱۰ مگابایت)</label><input class="input" type="file" name="file" accept=".pdf,video/mp4,image/*,.zip,.doc,.docx"></div><div class="field"><label>یا لینک (برای ویدیوهای بزرگ)</label><input class="input ltr" name="url" placeholder="https://"></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'افزودن', onClick: async (m) => { const f = $('#matForm', m); await post('/api/teacher/materials', { ...formData(f), file: await fileToData(f.file.files[0], 10) }); toast('افزوده شد', 'ok'); materials(el); } }],
  });
}

export const routes = [
  { path: '/home', view: home },
  { path: '/attendance', view: attendance },
  { path: '/attendance/:id', view: attendance },
  { path: '/assignments', view: assignments },
  { path: '/assignments/report', view: asgReport },
  { path: '/exams', view: exams },
  { path: '/exams/:id', view: examDetail },
  { path: '/students', view: students },
  { path: '/students/:id', view: studentDetail },
  { path: '/plans', view: plans },
  { path: '/materials', view: materials },
  { path: '/messages', view: messagesView },
  { path: '/messages/:id', view: messagesView },
  { path: '/announcements', view: announcementsView },
  { path: '/account', view: accountView },
];
