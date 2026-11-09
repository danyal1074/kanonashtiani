import { studentAvatarAsset } from './student-avatars.js';
matchMedia('(min-width:1100px)').addEventListener('change', () => {
  if (document.body.classList.contains('student-ui')) document.querySelector('.scrim')?.click();
});
import * as elementary from './elementary.js';
import { isElementary } from './student-variant.js';
export { isElementary };
import * as studentDesign from './student-design.js';
export { studentLogo } from './student-design.js';
export const shellHeader = me => isElementary(me) ? elementary.shellHeader(me) : studentDesign.shellHeader(me);
export const navIcon = (name,size=24) => isElementary(state.me) ? elementary.navIcon(name) : studentDesign.navIcon(name,size);
export const leavePage = () => elementary.leave();
export function prepareStudentPage(path) {
  document.body.dataset.studentPage = path;
  prepareDesktopProfile(state.me);
  if (isElementary(state.me)) elementary.preparePage(path);
  else { document.body.classList.remove('elementary-native-page','elementary-map-page'); studentDesign.prepareStudentPage(path); }
}
function prepareDesktopProfile(me) {
  const sidebar = document.querySelector('.theme-student .sidebar');
  if (!sidebar || !me?.student) return;
  let profile = sidebar.querySelector('.sd-profile');
  if (!profile) { profile = document.createElement('a'); profile.className = 'sd-profile'; profile.href = '#/profile'; sidebar.prepend(profile); }
  const source = isProfilePhoto(me.student.avatar) ? me.student.avatar : studentAvatarAsset(me);
  profile.innerHTML = `<span class="sd-profile-photo"><img src="${esc(source)}" alt="آواتار من" width="100" height="100"></span><b>${esc(me.user.full_name)}</b><small>دانش‌آموز پایه ${gradeName(me.student.grade)}</small>`;
}

import { openPhotoPicker } from './profile-photo.js';
// پنل دانش‌آموز
import { api, post, put, esc, fa, hasIcon, AVATAR_ICONS, sgn, num, money, pct, $, $$, on, toast, busy, modal, confirmBox, setHead, avatar, isProfilePhoto, progress, ring, empty, cdHtml, countdown,
  jdate, jtime, jshort, subjIcon, subjTint, SOFT, SUBJ_COLOR, gradeName, icon, fileToData, beep, confetti, WEEKDAYS, faWeekday, ymdOf, lineChart, barChart, state } from './core.js';
import { messagesView, announcementsView, passwordCard, bindPassword } from './common.js';
import { gamesHub, mathRush, storyView } from './games.js';
import { panelShop } from './shop.js';
import * as L from './legacy.js';

export const nav = (me) => [
  { path: '/home', icon: 'home', label: 'خانه' },
  { path: '/lessons', icon: 'book', label: 'درس‌ها' },
  { path: '/schedule', icon: 'calendar', label: 'برنامه هفتگی' },
  { path: '/library', icon: 'book', label: 'کتابخانه' },
  { path: '/classes', icon: 'video', label: 'کلاس آنلاین' },
  { path: '/assignments', icon: 'clipboard', label: 'تکالیف' },
  { path: '/exams', icon: 'file-check', label: 'آزمون‌ها' },
  { path: '/results', icon: 'award', label: 'کارنامه و نتایج' },
  { path: '/study', icon: 'timer', label: 'مطالعه و پومودورو' },
  { path: '/path', icon: 'sparkles', label: 'مسیر یادگیری هوشمند' },
  { path: '/games', icon: 'gamepad', label: 'بازی و داستان' },
  { path: '/self-exams', icon: 'target', label: 'آزمون خودسنجی' },
  { path: '/roadmap', icon: 'award', label: 'نقشه راه رشد' },
  { path: '/records', icon: 'receipt', label: 'نمرات و فاکتورها' },
  { path: '/counselor', icon: 'message', label: 'مشاور تحصیلی' },
  { path: '/messages', icon: 'message', label: 'پیام‌ها', badge: me.unread },
  { path: '/announcements', icon: 'megaphone', label: 'اطلاعیه‌ها', open: true },
  { path: '/profile', icon: 'user', label: 'پروفایل من' },
  { path: '/payment', icon: 'card', label: 'حق عضویت', open: true },
  { path: '/shop', icon: 'bag', label: 'فروشگاه کانون' },
];
export const bottomNav = (me) => [
  { path: '/more', icon: 'more', label: 'موارد بیشتر', open: true },
  { path: '/roadmap', icon: 'chart', label: 'مسیر پیشرفت' },
  { path: '/home', icon: 'home', label: 'خانه' },
  { path: '/messages', icon: 'message', label: 'پیام‌ها', badge: me.unread },
  { path: '/profile', icon: 'user', label: 'پروفایل من' },
];

const subjBubble = (s) => `<div class="sub-ico" style="background:${SOFT[subjTint(s)]};color:${SUBJ_COLOR[subjTint(s)]}">${subjIcon(s, 20)}</div>`;

// ================= تکالیف =================
async function assignments(el) {
  setHead('تکالیف من', 'تکالیفت را به‌موقع بفرست تا امتیاز تشویقی بگیری؛ تأخیر امتیاز منفی دارد');
  const list = await api('/api/student/assignments');
  let tab = 'todo';
  const status = (a) => (a.sub_id ? (a.late ? 'late-sent' : 'sent') : countdown(a.deadline).late ? 'overdue' : 'todo');
  const draw = () => {
    const rows = list.filter((a) => tab === 'all' || (tab === 'todo' && status(a) === 'todo') || (tab === 'sent' && a.sub_id) || (tab === 'overdue' && status(a) === 'overdue'));
    $('#asgList', el).innerHTML = rows.length ? rows.map((a) => {
      const st = status(a);
      const badge = { todo: '', sent: '<span class="badge green"> ارسال شد</span>', 'late-sent': '<span class="badge orange"> با تأخیر ارسال شد</span>', overdue: '<span class="badge red"> دیرکرد</span>' }[st];
      return `<div class="card ${st === 'overdue' ? 'tint-pink' : ''}"><div class="row" style="align-items:flex-start">${subjBubble(a.subject)}
        <div class="grow"><div class="row wrap"><h3 style="font-size:16px">${esc(a.title)}</h3>${badge}</div>
        <div class="tiny muted">${esc(a.subject || '')} • ${esc(a.teacher || '')} • مهلت: ${jdate(a.deadline, { weekday: true })} ساعت ${jtime(a.deadline)}</div>
        ${a.description ? `<p class="small" style="margin:8px 0 0">${esc(a.description)}</p>` : ''}
        ${a.sub_id ? `<div class="small" style="margin-top:8px;background:var(--bg);border-radius:12px;padding:8px 12px">${icon('upload', { size: 16 })} ${jdate(a.submitted_at)} ${jtime(a.submitted_at)}${a.note ? ` — «${esc(a.note)}»` : ''}${a.file_path ? ` • <a href="/uploads/${esc(a.file_path)}" target="_blank">${icon('file-text', { size: 16 })} ${esc(a.file_name || 'فایل')}</a>` : ''}</div>` : ''}
        </div></div>
        <div class="row wrap" style="justify-content:space-between;margin-top:12px">${st === 'todo' || st === 'overdue' ? cdHtml(a.deadline) : '<span></span>'}
        <div class="row"><span class="badge yellow">${icon('star', { size: 16 })} ${fa(a.reward_points)} امتیاز</span>${st === 'todo' || st === 'overdue' || (st === 'sent' && !countdown(a.deadline).late) ? `<button class="btn sm ${st === 'overdue' ? 'red' : ''}" data-submit="${a.id}">${a.sub_id ? ' ویرایش ارسال' : ' ارسال تکلیف'}</button>` : ''}</div></div></div>`;
    }).join('') : empty(tab === 'todo' ? 'check-circle' : 'inbox', tab === 'todo' ? 'همه تکالیف را انجام داده‌ای! آفرین!' : 'موردی نیست');
  };
  const cnt = (t) => list.filter((a) => (t === 'todo' ? status(a) === 'todo' : t === 'sent' ? a.sub_id : status(a) === 'overdue')).length;
  el.innerHTML = `<div class="seg" style="margin-bottom:16px">${[['todo', ' در انتظار'], ['overdue', ' دیرکرد'], ['sent', ' ارسال‌شده'], ['all', 'همه']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l} ${k !== 'all' ? `(${fa(cnt(k))})` : ''}</button>`).join('')}</div><div class="stack" id="asgList"></div>`;
  draw();
  on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  on(el, 'click', '[data-submit]', (e, b) => {
    const a = list.find((x) => x.id === Number(b.dataset.submit));
    const late = countdown(a.deadline).late;
    modal({
      title: `${icon('upload', { size: 16 })} ارسال «${esc(a.title)}»`,
      body: `${late ? '<div class="badge red" style="margin-bottom:10px">مهلت تمام شده؛ ارسال با برچسب دیرکرد ثبت می‌شود</div>' : `<div style="margin-bottom:10px">${cdHtml(a.deadline)}</div>`}
        <div class="stack"><div class="field"><label>یادداشت برای معلم</label><textarea class="input" name="note" placeholder="مثلاً: پاسخ تمرین ۳ را با دو روش نوشتم">${esc(a.note || '')}</textarea></div>
        <div class="field"><label>فایل تکلیف (تصویر، PDF، Word یا ZIP — حداکثر ۸ مگابایت)</label><input class="input" type="file" name="file" accept="image/*,.pdf,.doc,.docx,.zip,.txt"></div></div>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
        label: 'ارسال تکلیف ', onClick: async (m) => {
          const file = await fileToData(m.querySelector('[name=file]').files[0]);
          const r = await post(`/api/student/assignments/${a.id}/submit`, { note: m.querySelector('[name=note]').value, file });
          if (r.reward) { confetti(60); toast(`آفرین! ${fa(r.reward)} امتیاز تشویقی گرفتی`, 'ok'); } else toast(r.late ? 'تکلیف با برچسب دیرکرد ثبت شد' : 'تکلیف ثبت شد', r.late ? '' : 'ok');
          assignments(el);
        },
      }],
    });
  });
}

// ================= آزمون آنلاین =================
async function exams(el) {
  setHead('آزمون‌های آنلاین', 'هر سؤال یک مرحله؛ تایمر را فراموش نکن!', '<a class="btn soft sm" href="#/results"> نتایج و کارنامه‌ها</a>');
  const list = await api('/api/student/exams');
  const open = list.filter((e) => e.percent == null), done = list.filter((e) => e.percent != null);
  const card = (e) => `<div class="card ${e.percent == null ? 'tint-violet' : ''}"><div class="row" style="align-items:flex-start">${subjBubble(e.subject)}<div class="grow">
    <h3 style="font-size:16px">${esc(e.title)}</h3><div class="tiny muted">${esc(e.teacher || '')} • ${fa(e.qcount)} سؤال •  ${fa(e.duration_min)} دقیقه</div></div>
    ${e.percent != null ? `<div class="center"><div style="font-size:22px;font-weight:900;color:var(--primary)">${pct(e.percent)}</div><div class="tiny muted">${sgn(e.points)} امتیاز</div></div>` : ''}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px">${e.percent == null ? `<a class="btn" href="#/exam/${e.id}">${e.started_at ? ' ادامه آزمون' : ' شروع آزمون'}</a>` : `<a class="btn ghost sm" href="#/results/${e.id}">${icon('file-text', { size: 16 })} مشاهده کارنامه</a>`}</div></div>`;
  el.innerHTML = `<h3 style="margin-bottom:12px"> آزمون‌های در انتظار (${fa(open.length)})</h3><div class="grid c3">${open.map(card).join('') || `<div class="card">${empty('sparkles', 'آزمون جدیدی نداری')}</div>`}</div>
    <h3 style="margin:24px 0 12px">${icon('check-circle', { size: 16 })} آزمون‌های داده‌شده</h3><div class="grid c3">${done.map(card).join('') || `<div class="card">${empty('inbox', 'هنوز آزمونی نداده‌ای')}</div>`}</div>`;
}

async function takeExam(el, { id }) {
  const key = `roshd-exam-${state.me.user.id}-${id}`;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* */ }
  if (!saved.started) {
    const ok = await confirmBox('آزمون پس از شروع، با تایمر معکوس ادامه پیدا می‌کند و فقط یک‌بار قابل انجام است. آماده‌ای؟', 'بزن بریم! ', 'green');
    if (!ok) { location.hash = '#/exams'; return; }
  }
  const ex = await post(`/api/student/exams/${id}/start`);
  const skew = Date.now() - new Date(ex.server_now).getTime();
  const endAt = new Date(ex.started_at).getTime() + ex.duration_min * 60e3 + skew;
  const answers = saved.answers || ex.questions.map(() => null);
  let cur = saved.cur || 0, submitted = false;
  const persist = () => { try { localStorage.setItem(key, JSON.stringify({ started: true, answers, cur })); } catch { /* */ } };
  persist();
  setHead(`${esc(ex.title)}`, `${fa(ex.questions.length)} سؤال چهارگزینه‌ای`);

  el.innerHTML = `<div class="exam-head"><div class="timer-pill" id="timer">--:--</div><div class="grow">${progress(0)}</div><button class="btn green" id="finish">پایان و ارسال ${icon('check-circle', { size: 16 })}</button></div>
    <div class="card q-card" id="qcard"></div><div class="row between" style="margin-top:14px"><button class="btn ghost" id="prev">→ قبلی</button><button class="btn" id="next">بعدی ←</button></div>
    <div class="card" style="margin-top:16px"><div class="small bold" style="margin-bottom:8px">نقشه سؤال‌ها</div><div class="q-dots" id="dots"></div></div>`;
  const draw = () => {
    const q = ex.questions[cur];
    $('#qcard', el).innerHTML = `<div class="row between"><span class="badge">سؤال ${fa(cur + 1)} از ${fa(ex.questions.length)}</span>${q.subject ? `<span class="badge gray">${subjIcon(q.subject)} ${esc(q.subject)}</span>` : ''}</div>
      <div style="margin-top:14px;line-height:2">${esc(q.text)}</div><div class="options">${q.options.map((o, i) => `<button class="option ${answers[cur] === i ? 'sel' : ''}" data-opt="${i}"><span class="k">${fa(i + 1)}</span><span>${esc(o)}</span></button>`).join('')}</div>`;
    $('#dots', el).innerHTML = ex.questions.map((_, i) => `<button class="${i === cur ? 'cur' : answers[i] != null ? 'ans' : ''}" data-go="${i}">${fa(i + 1)}</button>`).join('');
    $('#prev', el).disabled = cur === 0;
    $('#next', el).textContent = cur === ex.questions.length - 1 ? 'آخرین سؤال' : 'بعدی ←';
    $('#next', el).disabled = cur === ex.questions.length - 1;
    el.querySelector('.exam-head .progress i').style.width = `${(answers.filter((a) => a != null).length / ex.questions.length) * 100}%`;
  };
  draw();
  on(el, 'click', '[data-opt]', (e, b) => {
    const i = Number(b.dataset.opt);
    answers[cur] = answers[cur] === i ? null : i;
    persist(); draw();
    if (answers[cur] != null && cur < ex.questions.length - 1) setTimeout(() => { cur++; persist(); draw(); }, 280);
  });
  on(el, 'click', '[data-go]', (e, b) => { cur = Number(b.dataset.go); persist(); draw(); });
  $('#prev', el).onclick = () => { cur--; persist(); draw(); };
  $('#next', el).onclick = () => { cur++; persist(); draw(); };

  const submit = async (auto) => {
    if (submitted) return;
    submitted = true;
    clearInterval(tick);
    try {
      const r = await post(`/api/student/exams/${id}/submit`, { answers });
      try { localStorage.removeItem(key); } catch { /* */ }
      if (auto) toast('زمان آزمون تمام شد و پاسخ‌ها ارسال شد', '');
      if (r.percent >= 80) confetti(120);
      location.hash = `#/results/${id}`;
    } catch (e) { submitted = false; toast(e.message, 'err'); }
  };
  $('#finish', el).onclick = async () => {
    const blank = answers.filter((a) => a == null).length;
    if (await confirmBox(blank ? `${fa(blank)} سؤال بی‌پاسخ مانده. مطمئنی می‌خواهی ارسال کنی؟` : 'پاسخ‌ها ارسال شود؟', 'ارسال', 'green')) submit(false);
  };
  const timerEl = $('#timer', el);
  const tick = setInterval(() => {
    if (!document.body.contains(timerEl)) return clearInterval(tick);
    const left = Math.max(0, endAt - Date.now());
    const m = Math.floor(left / 60e3), s = Math.floor((left % 60e3) / 1e3);
    timerEl.textContent = fa(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    timerEl.classList.toggle('danger', left < 60e3);
    if (left <= 0) submit(true);
  }, 250);
}

// ================= نتایج و کارنامه =================
async function results(el) {
  setHead('پیشرفت من', 'نتیجه هر تلاش، یک قدم رو به جلو');
  const [list, reports] = await Promise.all([api('/api/student/results'), api('/api/barpa-exams/reports').catch(() => [])]);
  const chrono = [...list].reverse();
  const mean = list.length ? list.reduce((sum,r)=>sum+Number(r.percent),0)/list.length : null;
  const kinds = {online:'آنلاین',paper:'حضوری',comprehensive:'جامع کانون'};
  let tab = 'all';
  el.innerHTML = `<div class="student-results">
    <section class="student-exam-summary student-panel"><div><h2>میانگین آزمون‌های من</h2><strong>${mean == null ? '—' : pct(mean)}</strong><small>${fa(list.length)} آزمون ثبت‌شده</small></div>${studentDesign.art('trophy')}</section>
    ${chrono.length > 1 ? `<section class="student-panel"><h2>${studentDesign.art('chart')}روند پیشرفت تحصیلی</h2>${lineChart(chrono.map(r=>jdate(r.created_at,{year:false})),[{name:'درصد آزمون',color:'#08bb61',values:chrono.map(r=>r.percent)}],{max:100,height:180})}</section>` : ''}
    <section class="student-panel"><h2>${studentDesign.art('books')}میانگین درس‌ها</h2>${studentDesign.averagesHtml(studentDesign.lessonAverages(list))}</section>
    ${reports.length ? `<section class="student-panel"><h2>${studentDesign.art('exam')}کارنامه‌های جامع برپا</h2>${L.barpaList(reports)}</section>` : ''}
    <div class="seg" role="tablist" aria-label="نوع آزمون">${[['all','همه آزمون‌ها'],['online','آزمون‌های آنلاین'],['kanoon','آزمون‌های کانون']].map(([key,label])=>`<button role="tab" aria-selected="${key===tab}" class="${key===tab?'on':''}" data-result-tab="${key}">${label}</button>`).join('')}</div>
    <div class="student-exam-results" id="studentExamResults"></div></div>`;
  const draw = () => {
    const rows = list.filter(r=>tab==='all'||(tab==='online'?r.kind==='online':r.kind!=='online'));
    $('#studentExamResults',el).innerHTML = rows.length ? rows.map(r=>`<a class="student-result-card student-panel" href="#/results/${r.id}">${studentDesign.art('exam')}<div><b>${esc(r.title)}</b><small>${esc(r.subject || '')} · ${kinds[r.kind] || 'آزمون'} · ${jdate(r.created_at)}</small><small>رتبه ${fa(r.rank)} از ${fa(r.of)} · درست ${fa(r.correct)} / غلط ${fa(r.wrong)} / نزده ${fa(r.blank)}</small></div><strong>${pct(r.percent)}</strong>${studentDesign.navIcon('back',18)}</a>`).join('') : `<div class="student-panel">${empty('exam','هنوز نتیجه‌ای برای این بخش نداری')}</div>`;
  };
  draw();
  on(el,'click','[data-result-tab]',(_e,b)=>{tab=b.dataset.resultTab; $$('[data-result-tab]',el).forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-selected',String(x===b));});draw();});
}

async function resultDetail(el, { id }) {
  const r = await api(`/api/student/results/${id}`);
  setHead(`کارنامه «${esc(r.title)}»`, jdatetime_(r.created_at), '<a class="btn ghost sm" href="#/results">→ همه نتایج</a> <button class="btn soft sm" onclick="print()"> چاپ</button>');
  const mood = r.percent >= 85 ? ['trophy', 'sun', 'فوق‌العاده بود'] : r.percent >= 65 ? ['star', '', 'خیلی خوب بود'] : r.percent >= 45 ? ['zap', '', 'خوب بود؛ با تمرین بهتر هم می‌شود'] : ['sprout', 'green', 'نگران نباش؛ مسیر یادگیری‌ات را دنبال کن'];
  el.innerHTML = `<div class="grid c3"><div class="card tint-violet center"><span class="ib lg ${mood[1]}" style="margin:0 auto var(--s-3)">${icon(mood[0], { size: 24 })}</span><h3 style="margin-bottom:var(--s-3)">${mood[2]}</h3>${ring(r.percent, { size: 150, label: pct(r.percent), sub: 'درصد' })}</div>
    <div class="card"><div class="card-title"><span class="ib">${icon('chart', { size: 18 })}</span>خلاصه</div><div class="list">
      <div class="list-item">${icon('check-circle', { size: 16 })} پاسخ درست<b class="pos" style="margin-inline-start:auto">${fa(r.correct)}</b></div><div class="list-item">${icon('x', { size: 16 })} پاسخ غلط<b class="neg" style="margin-inline-start:auto">${fa(r.wrong)}</b></div>
      <div class="list-item">${icon('info', { size: 16 })} بدون پاسخ<b style="margin-inline-start:auto">${fa(r.blank)}</b></div><div class="list-item">${icon('award', { size: 16 })} رتبه<b style="margin-inline-start:auto">${fa(r.rank)} از ${fa(r.of)}</b></div>
      <div class="list-item">${icon('users', { size: 16 })} میانگین شرکت‌کنندگان<b style="margin-inline-start:auto">${pct(r.avg)}</b></div><div class="list-item">${icon('star', { size: 16 })} امتیاز دریافتی<b class="pos" style="margin-inline-start:auto">${sgn(r.points)}</b></div></div></div>
    <div class="card"><div class="card-title"><span class="ib">${icon('book', { size: 18 })}</span>به تفکیک درس</div>${Object.entries(r.bySubject).map(([s, v]) => `<div style="margin-bottom:12px"><div class="row between small"><b>${subjIcon(s)} ${esc(s)}</b><span>${fa(v.correct)} از ${fa(v.total)}</span></div>${progress((v.correct / v.total) * 100)}</div>`).join('')}</div></div>
    ${r.questions[0]?.text ? `<div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('search', { size: 18 })}</span>مرور پاسخ‌ها</div><div class="stack">${r.questions.map((q, i) => `<div class="card flat"><div class="bold">${fa(i + 1)}. ${esc(q.text)}</div><div class="options" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${q.options.map((o, j) => `<div class="option ${j === q.answer ? 'right' : r.answers[i] === j ? 'wrong' : ''}" style="cursor:default"><span class="k">${fa(j + 1)}</span>${esc(o)}${j === q.answer ? ' ' : r.answers[i] === j ? ' ' : ''}</div>`).join('')}</div></div>`).join('')}</div></div>` : ''}`;
}
const jdatetime_ = (s) => `${jdate(s)} - ساعت ${jtime(s)}`;

// ================= مطالعه و پومودورو =================
const POMO = { focus: 25 * 60, brk: 5 * 60, demoFocus: 10, demoBreak: 5 };
const timer = (() => {
  let t = null;
  try { t = JSON.parse(localStorage.getItem('roshd-pomo') || 'null'); } catch { /* */ }
  return { get: () => t, set: (v) => { t = v; try { v ? localStorage.setItem('roshd-pomo', JSON.stringify(v)) : localStorage.removeItem('roshd-pomo'); } catch { /* */ } } };
})();
// تیک سراسری: اتمام دوره حتی وقتی صفحه دیگری باز است
setInterval(async () => {
  const t = timer.get();
  if (!t || t.paused || Date.now() < t.endAt || t.finishing) return;
  t.finishing = true; timer.set(t);
  beep(t.phase === 'focus' ? 4 : 2);
  if (t.phase === 'focus') {
    if (!t.demo) {
      try { const r = await post('/api/student/pomodoro', { subject: t.subject, minutes: 25 }); toast(`یک پومودورو ${t.subject} ثبت شد! +۲ امتیاز (امروز: ${fa(r.today)} دقیقه)`, 'ok'); } catch (e) { toast(e.message, 'err'); }
    } else toast(' دوره تمرکز (حالت تست) تمام شد — در حالت تست، زمان ثبت نمی‌شود', 'ok');
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('پایان پومودورو ', { body: 'آفرین! حالا ۵ دقیقه استراحت کن.' });
    timer.set({ ...t, phase: 'break', finishing: false, endAt: Date.now() + (t.demo ? POMO.demoBreak : POMO.brk) * 1000, total: t.demo ? POMO.demoBreak : POMO.brk, count: (t.count || 0) + 1 });
  } else {
    toast(' استراحت تمام شد؛ آماده دور بعدی هستی؟');
    timer.set(null);
  }
  window.dispatchEvent(new Event('roshd:pomo'));
}, 500);

async function study(el) {
  setHead('مطالعه با پومودورو', '۲۵ دقیقه تمرکز کامل، ۵ دقیقه استراحت — هر پومودورو ۲ امتیاز');
  const [d, counselorPlans] = await Promise.all([api('/api/student/study'), api('/api/student/counselor-plans')]);
  const goalPct = Math.min(100, Math.round((d.today / d.goal) * 100));
  const subjects = [...new Set([...d.week.plan.map((p) => p.subject), ...d.subjects])];
  el.innerHTML = `${counselorPlans.length ? `<section class="card" style="margin-bottom:18px"><div class="card-title">${icon('calendar')} برنامه شخصی مشاور</div>${counselorPlans.map(plan => `<div style="margin-bottom:12px"><div class="row between wrap"><b>${esc(plan.counselor)}</b><span class="tiny muted">هفته ${jdate(plan.week_start)}</span></div><div class="list">${plan.tasks.map((t,i) => `<label class="list-item" style="cursor:pointer"><input type="checkbox" data-counselor-plan="${plan.id}" data-task-index="${i}" ${t.done ? 'checked' : ''}><span class="grow"><b class="small">${WEEKDAYS[t.weekday]} · ${esc(t.title)}</b><span class="tiny muted" style="display:block">${esc(t.subject)} · هدف ${fa(t.target)} پومودورو</span></span></label>`).join('')}</div></div>`).join('')}</section>` : ''}<div class="grid c3">
    <div class="card span2"><div class="pomo" id="pomo"></div></div>
    <div class="stack" style="gap:18px">
      <div class="card tint-green"><div class="card-title"><span class="ib green">${icon('target', { size: 18 })}</span>هدف مطالعه امروز</div>
        <div class="row" style="gap:14px">${ring(goalPct, { label: pct(goalPct), sub: 'تکمیل' })}<div><div style="font-size:24px;font-weight:900">${fa(d.today)} <span class="small muted">دقیقه</span></div><div class="small muted">از حداقل ${fa(d.goal)} دقیقه</div>
        ${d.today < d.goal ? `<div class="badge orange" style="margin-top:6px"> ${fa(d.goal - d.today)} دقیقه تا حداقل</div>` : '<div class="badge green" style="margin-top:6px"> هدف کامل شد</div>'}</div></div>
        <button class="btn soft sm block" style="margin-top:12px" id="notifyBtn">${icon('bell', { size: 16 })} فعال‌سازی یادآور مرورگر</button></div>
      <div class="card"><div class="card-title"><span class="ib">${icon('calendar', { size: 18 })}</span>برنامه پومودوروی این هفته</div>
        ${d.week.plan.length ? d.week.plan.map((p) => `<div style="margin-bottom:12px"><div class="row between small"><b>${subjIcon(p.subject)} ${esc(p.subject)}</b><span>${fa(Math.min(p.done, p.target))} از ${fa(p.target)} ${p.done >= p.target ? icon('check-circle', { size: 14 }) : ''}</span></div>
          <div class="seg-bar" role="img" aria-label="${fa(Math.min(p.done, p.target))} از ${fa(p.target)}">${Array.from({ length: p.target }, (_, i) => `<i class="${i < p.done ? 'on' : ''}"></i>`).join('')}</div></div>`).join('') : empty('calendar', 'معلم هنوز برنامه هفتگی تعیین نکرده')}
        <div class="tiny muted">برنامه هر هفته توسط معلم تعیین و آخر هفته بررسی می‌شود؛ اجرا نکردن برنامه امتیاز منفی دارد.</div></div>
    </div>
    <div class="card span2"><div class="card-title"><span class="ib slate">${icon('trend', { size: 18 })}</span>دقیقه‌های مطالعه ۷ روز اخیر</div>
      ${barChart(d.days.map((x) => ({ label: WEEKDAYS[faWeekday(x.date)], values: [x.minutes] })), [{ name: 'دقیقه مطالعه', color: '#0E9157' }], { height: 200, fmt: (v) => fa(Math.round(v)) })}
    </div>
    <div class="card"><div class="card-title"><span class="ib">${icon('receipt', { size: 18 })}</span>جلسه‌های امروز</div>
      <div class="list">${d.sessions.map((s) => `<div class="list-item"><span class="ib">${icon('timer', { size: 18 })}</span><div class="grow"><b class="small">${esc(s.subject)}</b><div class="tiny muted">${fa(s.minutes)} دقیقه • ساعت ${jtime(s.created_at)}</div></div><span class="badge green">${sgn(2)}</span></div>`).join('') || empty('sprout', 'هنوز پومودورویی ثبت نشده')}</div></div>
  </div>`;
  on(el, 'change', '[data-counselor-plan]', async (_e, checkbox) => {
    const done = checkbox.checked;
    checkbox.disabled = true;
    try {
      await put(`/api/student/counselor-plans/${checkbox.dataset.counselorPlan}/tasks/${checkbox.dataset.taskIndex}`, { done });
      toast('وضعیت فعالیت ذخیره شد', 'ok');
    } catch (err) { checkbox.checked = !done; toast(err.message, 'err'); }
    finally { checkbox.disabled = false; }
  });
  $('#notifyBtn', el).onclick = async () => {
    if (!('Notification' in window)) return toast('مرورگر شما از اعلان پشتیبانی نمی‌کند', 'err');
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'یادآور فعال شد؛ پایان هر پومودورو اعلان می‌گیری' : 'اجازه اعلان داده نشد', p === 'granted' ? 'ok' : 'err');
  };

  const pomoEl = $('#pomo', el);
  let demo = false;
  const R = 130, C = 2 * Math.PI * R;
  const drawPomo = () => {
    const t = timer.get();
    if (!t) {
      pomoEl.className = 'pomo';
      pomoEl.innerHTML = `<div class="pomo-ring"><svg viewBox="0 0 290 290"><circle cx="145" cy="145" r="${R}" fill="none" stroke="#F0ECE2" stroke-width="16"/></svg>
        <div class="inner"><div><div style="color:var(--teal-600)">${icon('timer', { size: 40 })}</div><div class="time">${fa(demo ? '00:10' : '25:00')}</div><div class="phase">آماده تمرکز</div></div></div></div>
        <div class="field" style="width:min(340px,100%)"><label>درس این پومودورو</label><select class="input" id="pSubj">${subjects.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
        <label class="check"><input type="checkbox" id="demoMode" ${demo ? 'checked' : ''}> ${icon('zap', { size: 16 })} حالت تست سریع (۱۰ ثانیه تمرکز / ۵ ثانیه استراحت — برای نمایش)</label>
        <button class="btn lg" id="pStart">${icon('play', { size: 16 })} شروع تمرکز</button>`;
      $('#demoMode', pomoEl).onchange = (e) => { demo = e.target.checked; drawPomo(); };
      $('#pStart', pomoEl).onclick = () => {
        const total = demo ? POMO.demoFocus : POMO.focus;
        timer.set({ phase: 'focus', subject: $('#pSubj', pomoEl).value, demo, endAt: Date.now() + total * 1000, total, count: 0 });
        drawPomo();
      };
      return;
    }
    const left = t.paused ? t.left : Math.max(0, t.endAt - Date.now());
    const frac = 1 - left / (t.total * 1000);
    const m = Math.floor(left / 60e3), s = Math.floor((left % 60e3) / 1e3);
    pomoEl.className = `pomo ${t.phase === 'break' ? 'break' : ''}`;
    pomoEl.innerHTML = `<div class="pomo-ring"><svg viewBox="0 0 290 290"><defs><linearGradient id="pg" x1="0" x2="1"><stop offset="0" stop-color="${t.phase === 'break' ? '#22A867' : '#F2B33D'}"/><stop offset="1" stop-color="${t.phase === 'break' ? '#22A867' : '#F2B33D'}"/></linearGradient></defs>
      <circle cx="145" cy="145" r="${R}" fill="none" stroke="#F0ECE2" stroke-width="16"/><circle cx="145" cy="145" r="${R}" fill="none" stroke="url(#pg)" stroke-width="16" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
      <div class="inner"><div><div style="color:${t.phase === 'break' ? 'var(--green-600)' : 'var(--sun-600)'}">${icon(t.phase === 'break' ? 'clock' : 'target', { size: 34 })}</div><div class="time" id="pTime">${fa(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)}</div>
      <div class="phase">${t.phase === 'break' ? 'وقت استراحت' : `تمرکز روی ${esc(t.subject)}`}${t.demo ? ' • تست' : ''}</div></div></div></div>
      <div class="row"><button class="btn ${t.paused ? 'green' : 'ghost'}" id="pPause">${t.paused ? ' ادامه' : ' توقف موقت'}</button><button class="btn red" id="pStop">${icon('stop', { size: 16 })} پایان</button>${t.phase === 'break' ? '<button class="btn" id="pSkip"> رد کردن استراحت</button>' : ''}</div>`;
    $('#pPause', pomoEl).onclick = () => {
      const x = timer.get();
      if (x.paused) timer.set({ ...x, paused: false, endAt: Date.now() + x.left });
      else timer.set({ ...x, paused: true, left: Math.max(0, x.endAt - Date.now()) });
      drawPomo();
    };
    $('#pStop', pomoEl).onclick = async () => { if (timer.get()?.phase === 'break' || (await confirmBox('پومودوروی نیمه‌تمام ثبت نمی‌شود. پایان بدهیم؟', 'پایان'))) { timer.set(null); drawPomo(); } };
    $('#pSkip', pomoEl)?.addEventListener('click', () => { timer.set(null); drawPomo(); });
  };
  drawPomo();
  let lastPhase = timer.get()?.phase;
  const iv = setInterval(() => {
    if (!document.body.contains(pomoEl)) return clearInterval(iv);
    const t = timer.get();
    if ((t?.phase) !== lastPhase) { lastPhase = t?.phase; drawPomo(); return; }
    if (t && !t.paused) {
      const left = Math.max(0, t.endAt - Date.now());
      const tm = $('#pTime', pomoEl);
      if (tm) tm.textContent = fa(`${String(Math.floor(left / 60e3)).padStart(2, '0')}:${String(Math.floor((left % 60e3) / 1e3)).padStart(2, '0')}`);
      const circ = pomoEl.querySelectorAll('circle')[1];
      if (circ) circ.setAttribute('stroke-dashoffset', C * (left / (t.total * 1000)));
    }
  }, 250);
  const onPomo = () => { if (!document.body.contains(pomoEl)) return window.removeEventListener('roshd:pomo', onPomo); study(el); };
  window.addEventListener('roshd:pomo', onPomo);
}

// ================= مسیر یادگیری هوشمند =================
async function learningPath(el) {
  setHead('مسیر یادگیری هوشمند', 'پیشنهاد شخصی بر اساس نتایج آزمون، زمان مطالعه و حضورت — با نظارت معلم');
  const lp = await api('/api/student/learning-path');
  const kinds = { review: ['book', 'مرور', 'blue'], practice: ['edit', 'تمرین', 'violet'], challenge: ['zap', 'چالش', 'pink'], habit: ['sprout', 'عادت', 'green'] };
  const done = lp.steps.filter((s) => s.done).length;
  el.innerHTML = `<div class="card tint-teal" style="margin-bottom:18px"><div class="row wrap" style="gap:18px">${ring((done / Math.max(1, lp.steps.length)) * 100, { label: `${fa(done)} از ${fa(lp.steps.length)}`, sub: 'گام' })}
    <div class="grow"><h3>${icon('compass', { size: 16 })} تحلیل هوشمند مسیر تو</h3><p class="small" style="margin:6px 0">${esc(lp.summary || '')}</p><div class="tiny muted">آخرین به‌روزرسانی: ${jdate(lp.updated_at)} • هر گام انجام‌شده ۳ امتیاز</div></div></div></div>
    <div class="stack" style="gap:0;position:relative">${lp.steps.map((s, i) => { const k = kinds[s.kind] || kinds.practice; return `
      <div class="row" style="align-items:stretch;gap:14px"><div style="display:flex;flex-direction:column;align-items:center;width:46px;flex:none">
        <div class="avatar" style="background:${s.done ? 'var(--green-600)' : SOFT[k[2]]};color:${s.done ? 'var(--white)' : SUBJ_COLOR[k[2]] || 'var(--teal-700)'}">${icon(s.done ? 'check' : k[0], { size: 20 })}</div>${i < lp.steps.length - 1 ? '<div style="flex:1;width:2px;background:var(--line-strong);margin:4px 0"></div>' : ''}</div>
        <div class="card grow" style="margin-bottom:14px;${s.done ? 'opacity:.7' : ''}"><div class="row wrap"><b style="${s.done ? 'text-decoration:line-through' : ''}">${esc(s.title)}</b><span class="badge ${k[2] === 'violet' ? '' : k[2]}">${k[1]}</span>${s.subject ? `<span class="badge gray">${subjIcon(s.subject)} ${esc(s.subject)}</span>` : ''}</div>
        <p class="small" style="margin:6px 0 10px">${esc(s.detail || '')}</p><label class="check"><input type="checkbox" data-step="${s.id}" ${s.done ? 'checked' : ''}> انجام دادم</label></div></div>`; }).join('')}</div>`;
  on(el, 'change', '[data-step]', async (e, c) => {
    try { await put(`/api/student/learning-path/${c.dataset.step}`, { done: c.checked }); if (c.checked) { toast('عالی! +۳ امتیاز ', 'ok'); confetti(40); } learningPath(el); } catch (err) { toast(err.message, 'err'); }
  });
}

// ================= پروفایل =================
const AVATARS = AVATAR_ICONS;
async function profile(el, _p, me) {
  const d = await api('/api/student/profile');
  setHead('پروفایل من', `${esc(d.info.full_name)} • پایه ${gradeName(d.info.grade)}`);
  const today = faWeekday(me.today);
  const cats = {};
  d.ledger.forEach((l) => { cats[l.category] = (cats[l.category] || 0) + l.amount; });
  el.innerHTML = `<div class="grid c3">
    <div class="card tint-violet"><div class="row"><button class="avatar lg" id="avBtn" style="cursor:pointer;border:0" aria-label="تغییر آواتار"><img class="student-profile-character" src="${esc(isProfilePhoto(d.info.avatar) ? d.info.avatar : studentAvatarAsset(me))}" alt="آواتار من"></button><div class="grow"><h3>${esc(d.info.full_name)}</h3>
      <div class="small muted">${esc(d.info.school || '')}</div><div class="small">پایه ${gradeName(d.info.grade)} • کلاس ${esc(d.info.class_name || '')}</div><div class="tiny muted">کد ملی: ${fa(d.info.national_code)} • تولد: ${jdate(d.info.birth_date)}</div></div></div>
      <button class="btn soft sm" style="margin-top:12px" id="avBtn2">${icon('edit', { size: 16 })} انتخاب آواتار</button> <button class="btn sm" id="photoBtn" style="margin-top:12px">${icon('camera', { size: 16 })} بارگذاری عکس من</button><p class="tiny muted">عکس شما در پروفایل و پنل نمایش داده می‌شود.</p></div>
    <div class="card"><div class="card-title"><span class="ib green">${icon('chart', { size: 18 })}</span>ترازنامه امتیاز</div>
      <div class="row" style="gap:10px"><div class="card flat grow center" style="padding:12px"><div class="pos" style="font-size:22px">${sgn(d.positive)}</div><div class="tiny muted">امتیاز مثبت</div></div>
      <div class="card flat grow center" style="padding:12px"><div class="neg" style="font-size:22px">${sgn(d.negative)}</div><div class="tiny muted">امتیاز منفی</div></div></div>
      <div class="stack" style="gap:6px;margin-top:12px">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="row between small"><span>${esc(c)}</span><b class="${v >= 0 ? 'pos' : 'neg'}">${sgn(v)}</b></div>`).join('')}</div></div>
    <div class="card"><div class="card-title"><span class="ib sun">${icon('bag', { size: 18 })}</span>خریدهای من</div>
      <div class="list">${d.purchased.map((p) => `<div class="list-item"><span class="ib">${icon(p.kind === 'video' ? 'video' : 'book', { size: 18 })}</span><div class="grow"><div class="small bold ellipsis">${esc(p.title)}</div><div class="tiny muted">کد پیگیری: ${esc(p.tracking_code)}</div></div>${p.download_url ? `<a class="btn sm soft" href="${esc(p.download_url)}" download>${icon('download', { size: 16 })}</a>` : ''}</div>`).join('') || empty('bag', '<a href="#/shop">سری به فروشگاه بزن</a>')}</div></div>
  </div>
  <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib slate">${icon('calendar', { size: 18 })}</span>تقویم هفتگی کلاس‌ها</div>
    <div class="week-cal">${WEEKDAYS.map((w, i) => `<div class="day ${i === today ? 'today' : ''}"><div class="dn">${w}</div>${d.schedule.filter((s) => s.weekday === i).map((s) => `<div class="ses"><b>${subjIcon(s.subject)} ${esc(s.subject)}</b>${fa(s.start)} تا ${fa(s.end)}<div class="tiny muted">${esc(s.teacher || '')}</div></div>`).join('') || '<div class="tiny muted center">—</div>'}</div>`).join('')}</div></div>
  <div class="grid c2" style="margin-top:18px">
    <div class="card"><div class="card-title"><span class="ib coral">${icon('copy', { size: 18 })}</span>ریز امتیازهای مثبت و منفی</div>
      <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="table"><thead><tr><th>امتیاز</th><th>بابت</th><th>دسته</th><th>تاریخ</th></tr></thead><tbody>
      ${d.ledger.map((l) => `<tr><td class="${l.amount > 0 ? 'pos' : 'neg'}">${sgn(l.amount)}</td><td class="small">${esc(l.reason)}</td><td><span class="badge ${l.amount > 0 ? 'green' : 'red'}">${esc(l.category)}</span></td><td class="tiny">${jshort(l.created_at)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-title"><span class="ib sun">${icon('video', { size: 18 })}</span>ویدیوها و جزوه‌ها</div>
      <div class="list">${d.materials.map((m) => `<div class="list-item"><div class="avatar sm" style="background:${m.kind === 'video' ? 'var(--red-soft)' : 'var(--blue-soft)'};color:${m.kind === 'video' ? 'var(--red-700)' : 'var(--slate-700)'}">${icon(m.kind === 'video' ? 'video' : 'file-text', { size: 18 })}</div><div class="grow"><div class="small bold ellipsis">${esc(m.title)}</div><div class="tiny muted">${esc(m.subject || '')}${m.size_kb ? ` • ${fa(m.size_kb)} کیلوبایت` : ''} • ${jdate(m.created_at)}</div></div><a class="btn sm soft" href="${esc(m.url)}" target="_blank" download>${icon('download', { size: 16 })} دانلود</a></div>`).join('') || empty('inbox', 'هنوز فایلی بارگذاری نشده')}</div></div>
  </div>
  <div class="grid c2" style="margin-top:18px"><div class="card tint-yellow row wrap"><span class="ib">${icon('card', { size: 18 })}</span><div class="grow"><b>حق عضویت</b><div class="small muted">پرداخت کارت‌به‌کارت و بارگذاری رسید</div></div><a class="btn" href="#/payment">مشاهده</a></div>${passwordCard()}</div>`;
  bindPassword(el);
  const pickAv = () => modal({
    title: 'آواتارت را انتخاب کن', body: `<div class="av-grid" role="listbox" aria-label="آواتارها">${AVATARS.map((a) => `<button class="av-pick" data-av="${a}" aria-label="${a}">${icon(a, { size: 26 })}</button>`).join('')}</div>`,
    onOpen: (m, close) => on(m, 'click', '[data-av]', async (e, b) => { await put('/api/me/avatar', { avatar: b.dataset.av }); close(); toast('آواتار عوض شد', 'ok'); window.roshdRefresh(); }),
  });
  $('#avBtn', el).onclick = () => openPhotoPicker(me); $('#avBtn2', el).onclick = pickAv; $('#photoBtn', el).onclick = () => openPhotoPicker(me);
}

// ================= حق عضویت =================
async function payment(el, _p, me) {
  const d = await api('/api/student/payment');
  setHead('حق عضویت', `پایه ${gradeName(d.grade)}`);
  const st = { paid: [d.period ? `حق عضویت ${d.period} پرداخت شد` : ' پرداخت‌شده و تأییدشده', 'green'], pending: [' در انتظار تأیید مدیر', 'orange'], rejected: [' رسید رد شد', 'red'], unpaid: [' پرداخت نشده', 'red'], free: [' معاف از پرداخت', 'green'] }[d.status];
  const card = (d.card_number || '').replace(/(\d{4})(?=\d)/g, '$1-');
  el.innerHTML = `${d.locked ? `<div class="lock-banner"><span class="lk">${icon('lock', { size: 16 })}</span><div><h3>پنل تو موقتاً قفل است</h3><div class="small">مهلت پرداخت حق عضویت (${jdate(d.lock_date)}) تمام شده. بعد از پرداخت و بارگذاری رسید، با تأیید مدیر کانون پنل دوباره باز می‌شود. اطلاعیه‌ها همچنان در دسترس است.</div></div></div>` : ''}
  <div class="grid c2"><div class="card tint-violet"><div class="card-title"><span class="ib">${icon('wallet', { size: 18 })}</span>وضعیت پرداخت</div>
    <div class="row between"><span>حق عضویت کانون</span><b style="font-size:18px">${money(d.amount)}</b></div>
    ${d.system_fee ? `<div class="row between" style="margin-top:8px"><span>اشتراک استفاده از سامانه رشد</span><b style="font-size:18px">${money(d.system_fee)}</b></div><div class="row between" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line-strong)"><span><b>مجموع قابل پرداخت</b></span><b style="font-size:22px">${money(d.total)}</b></div><p class="small muted" style="margin:8px 0 0">اشتراک سامانه مبلغی جدا از حق عضویت است و برای استفاده از پنل آموزشی دریافت می‌شود. هر دو مبلغ با هم و در یک واریز پرداخت می‌شوند.</p>` : ''}
    <div class="row between" style="margin-top:8px"><span>مهلت پرداخت</span><b>${d.lock_date ? jdate(d.lock_date) : '—'}</b></div>
    <div class="row between" style="margin-top:8px"><span>وضعیت</span><span class="badge ${st[1]}" style="font-size:13px">${st[0]}</span></div>
    ${d.status === 'rejected' && d.payments[0]?.reject_reason ? `<div class="small" style="margin-top:10px;background:var(--red-soft);border-radius:12px;padding:8px 12px">علت رد: <b>${esc(d.payments[0].reject_reason)}</b></div>` : ''}</div>
  <div class="card"><div class="card-title"><span class="ib slate">${icon('building', { size: 18 })}</span>پرداخت کارت‌به‌کارت</div>
    <div style="background:var(--teal-800);color:#fff;border-radius:20px;padding:20px;box-shadow:var(--shadow)"><div class="small" style="opacity:.8">شماره کارت کانون</div>
      <div style="font-size:22px;font-weight:900;letter-spacing:2px;direction:ltr;text-align:left;margin:8px 0">${fa(card || '—')}</div><div class="row between"><span class="small">${esc(d.card_holder || '')}</span><button class="btn sm ghost" id="copyCard">${icon('copy', { size: 16 })} کپی شماره کارت</button></div></div>
    ${['paid', 'pending', 'free'].includes(d.status) ? '' : `<form id="payForm" class="stack" style="margin-top:14px"><div class="field"><label>تصویر رسید پرداخت (حداکثر ۶ مگابایت)</label><input class="input" type="file" name="file" accept="image/*,.pdf" required></div><button class="btn green">${icon('upload', { size: 16 })} بارگذاری رسید</button></form>`}</div></div>
  <div class="card" style="margin-top:18px"><div class="card-title"><span class="ib">${icon('receipt', { size: 18 })}</span>سابقه رسیدها</div>
    <div class="list">${d.payments.map((p) => `<div class="list-item"><span style="font-size:22px">${{ approved: '', pending: '', rejected: '' }[p.status]}</span><div class="grow"><b class="small">${money(p.amount)}</b>${p.system_fee ? `<div class="tiny">حق عضویت ${money(p.amount - p.system_fee)} + اشتراک سامانه ${money(p.system_fee)}</div>` : ''}<div class="tiny muted">${p.period ? `${esc(p.period)} • ` : ''}${jdatetime_(p.created_at)}${p.reject_reason ? ` • ${esc(p.reject_reason)}` : ''}</div></div>
      <span class="badge ${{ approved: 'green', pending: 'orange', rejected: 'red' }[p.status]}">${{ approved: 'تأیید شد', pending: 'در انتظار تأیید', rejected: 'رد شد' }[p.status]}</span>${p.receipt_path ? `<a class="btn sm ghost" href="/uploads/${esc(p.receipt_path)}" target="_blank">رسید</a>` : ''}</div>`).join('') || empty('receipt', 'رسیدی ثبت نشده')}</div></div>`;
  $('#copyCard', el).onclick = async () => { try { await navigator.clipboard.writeText(d.card_number); toast('شماره کارت کپی شد', 'ok'); } catch { toast(`شماره کارت: ${d.card_number}`); } };
  const f = $('#payForm', el);
  if (f) f.onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post('/api/student/payment', { file: await fileToData(f.file.files[0], 6) }); toast('رسید ثبت شد و در انتظار تأیید است', 'ok'); payment(el, _p, me); }); };
}

const baseRoutes = [
  { path: '/challenges', view: studentDesign.roadmap },
  { path: '/my-class', view: studentDesign.classes },
  { path: '/teachers', view: studentDesign.classes },
  { path: '/attendance', view: studentDesign.attendance },
  { path: '/home', view: studentDesign.home },
  { path: '/lessons', view: studentDesign.lessons },
  { path: '/schedule', view: studentDesign.schedule },
  { path: '/classes', view: studentDesign.classes },
  { path: '/library', view: studentDesign.library },
  { path: '/more', view: studentDesign.more, open: true },
  { path: '/assignments', view: assignments },
  { path: '/exams', view: exams },
  { path: '/exam/:id', view: takeExam },
  { path: '/results', view: results },
  { path: '/results/:id', view: resultDetail },
  { path: '/study', view: study },
  { path: '/path', view: learningPath },
  { path: '/games', view: gamesHub },
  { path: '/games/math', view: mathRush },
  { path: '/games/story', view: storyView },
  { path: '/messages', view: messagesView },
  { path: '/messages/:id', view: messagesView },
  { path: '/announcements', view: announcementsView, open: true },
  { path: '/profile', view: profile },
  { path: '/account', view: profile },
  { path: '/payment', view: payment, open: true },
  { path: '/shop', view: panelShop },
  { path: '/self-exams', view: L.selfExams },
  { path: '/self-exam/:id', view: L.selfExam },
  { path: '/roadmap', view: studentDesign.roadmap },
  { path: '/counselor', view: L.counselor },
  { path: '/records', view: L.records },
  { path: '/barpa/:id', view: L.barpaView },
];

export const routes = baseRoutes.map(r => ({ ...r, view: async (el, params, me) => {
  if (isElementary(me) && elementary.views[r.path]) return elementary.views[r.path](el, params, me);
  await r.view(el, params, me);
  if (isElementary(me)) elementary.decorateCore(el, r.path);
} }));
