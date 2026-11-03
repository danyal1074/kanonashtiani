// صفحه‌های قابلیت‌های تکمیلی کانون: خودسنجی، نقشه راه، مشاور، کتاب‌های هوش، نمرات مستمر، فاکتورها، کارنامه برپا،
// لاگ حضور و غیاب و صندوق پیامک. فقط رابط کاربری؛ منطق و دسترسی‌ها سمت سرور است.
import { api, post, del, esc, fa, num, money, pct, $, $$, on, toast, busy, modal, confirmBox, setHead, empty, loading, jdate, jdatetime, icon, progress, gradeName } from './core.js';
import { sproutArt } from './icons.js';

const dt = (s) => (s ? jdatetime(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z') : '—');
const tabs = (items, cur) => `<div class="seg" style="margin-bottom:16px" role="tablist">${items.map(([k, l]) => `<button role="tab" aria-selected="${k === cur}" data-tab="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const score20 = (v) => fa(Number(v).toLocaleString('en', { maximumFractionDigits: 2 })).replace('.', '٫');
const INV = { settled: ['تسویه‌شده', 'green'], partially_paid: ['پرداخت ناقص', 'orange'], unpaid: ['پرداخت‌نشده', 'red'] };
const FEE_TYPES = { tuition: 'شهریه', membership: 'حق عضویت', camp: 'اردو', book: 'کتاب' };

// ---------- جدول‌های مشترک (دانش‌آموز، ولی، مدیر) ----------
export const scoresTable = (rows, { teacher = true, student = false } = {}) => rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${student ? '<th>دانش‌آموز</th>' : ''}<th>درس</th><th>عنوان</th><th>نمره از ۲۰</th>${teacher ? '<th>معلم</th>' : ''}<th>تاریخ</th></tr></thead><tbody>${rows.map((m) => `<tr>${student ? `<td>${esc(m.student_name)}</td>` : ''}<td>${esc(m.subject)}</td><td>${esc(m.title)}</td><td><b class="${m.score < 10 ? 'red-t' : ''}">${score20(m.score)}</b></td>${teacher ? `<td>${esc(m.teacher_name || '')}</td>` : ''}<td class="tiny muted">${dt(m.created_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('inbox', 'نمره‌ای ثبت نشده');
export const invoicesTable = (rows, { student = false } = {}) => rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${student ? '<th>دانش‌آموز</th>' : ''}<th>نوع</th><th>دوره</th><th>مبلغ</th><th>پرداخت‌شده</th><th>مانده</th><th>وضعیت</th></tr></thead><tbody>${rows.map((i) => `<tr>${student ? `<td>${esc(i.full_name)}</td>` : ''}<td>${esc(FEE_TYPES[i.fee_type] || i.fee_type)}</td><td>${esc(i.period)}</td><td>${money(i.amount)}</td><td>${money(i.paid)}</td><td><b>${money(i.remaining)}</b></td><td><span class="badge ${INV[i.status][1]}">${INV[i.status][0]}</span></td></tr>`).join('')}</tbody></table></div>` : empty('receipt', 'فاکتوری صادر نشده');
export const barpaList = (rows, { student = false } = {}) => rows.length ? `<div class="list">${rows.map((r) => `<a class="list-item" href="#/barpa/${r.id}"><span class="ib sun">${icon('trophy', { size: 18 })}</span><div class="grow"><b>${esc(r.exam_title)}</b><div class="tiny muted">${student ? `${esc(r.student_name || '')} · ` : ''}تراز ${num(r.overall_traz)} · رتبه کانون ${num(r.overall_rank_center)} · رتبه کشوری ${num(r.overall_rank_all)}</div></div><span class="badge green">${pct(r.overall_percentage)}</span></a>`).join('')}</div>` : empty('trophy', 'کارنامه‌ای صادر نشده');

// ---------- کارنامه تفصیلی آزمون جامع (مشترک همه نقش‌ها) ----------
const COLS = { name: 'درس', title: 'درس', subject: 'درس', percentage: 'درصد', percent: 'درصد', traz: 'تراز', rank: 'رتبه', correct: 'درست', wrong: 'غلط', unanswered: 'نزده', blank: 'نزده', total: 'تعداد' };
function objTable(rows) {
  if (!rows?.length || typeof rows[0] !== 'object') return '';
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => rows.every((r) => r[k] == null || typeof r[k] !== 'object')).slice(0, 8);
  return `<div class="table-wrap"><table class="table"><thead><tr>${keys.map((k) => `<th>${esc(COLS[k] || k)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${typeof r[k] === 'number' ? num(r[k]) : esc(r[k] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export async function barpaDetail(el, p) {
  const r = await api(`/api/barpa-exams/reports/${p.id}`);
  setHead(`کارنامه «${esc(r.exam_title)}»`, `${esc(r.student_name)} · ${esc(r.school_name || '')}`, '<button class="btn soft sm" onclick="print()">چاپ</button>');
  const stat = (l, v) => `<div class="card" style="text-align:center"><div class="muted small">${l}</div><div style="font-size:24px;font-weight:900">${v}</div></div>`;
  el.innerHTML = `<div class="grid c4" style="margin-bottom:16px">${stat('تراز کل', num(r.overall_traz))}${stat('رتبه در کانون', num(r.overall_rank_center))}${stat('رتبه کشوری', `${num(r.overall_rank_all)} <small class="muted">از ${num(r.total_attendees)}</small>`)}${stat('درصد کل', pct(r.overall_percentage))}</div>
  <div class="grid c4" style="margin-bottom:16px">${stat('درست', num(r.overall_correct))}${stat('غلط', num(r.overall_wrong))}${stat('نزده', num(r.overall_unanswered))}${stat('کل سؤال‌ها', num(r.total_questions))}</div>
  ${r.subjects?.length ? `<div class="card" style="margin-bottom:16px"><div class="card-title">نتیجه به تفکیک درس</div>${objTable(r.subjects)}</div>` : ''}
  ${r.categories?.length ? `<div class="card" style="margin-bottom:16px"><div class="card-title">نتیجه به تفکیک مبحث</div>${objTable(r.categories)}</div>` : ''}
  ${r.answers?.length ? `<div class="card"><div class="card-title">پاسخ سؤال به سؤال</div>${objTable(r.answers)}</div>` : ''}`;
}

// ================= دانش‌آموز: خودسنجی =================
export async function selfExams(el) {
  setHead('آزمون خودسنجی', 'آزمون شخصی بساز، بدون استرس تمرین کن و امتیاز بگیر');
  const list = await api('/api/student/self-exams');
  el.innerHTML = `<div class="grid c3"><section class="card" aria-labelledby="seN"><div class="card-title"><span class="ib green">${icon('sparkles', { size: 18 })}</span><span id="seN">آزمون تازه</span></div>
    <form id="seForm" class="stack"><div class="field"><label for="seSub">درس</label><select class="input" id="seSub" name="subject">${['ریاضی', 'علوم', 'فارسی', 'هوش و استعداد', 'عمومی'].map((s) => `<option>${s}</option>`).join('')}</select></div>
    <div class="field"><label for="seCnt">تعداد سؤال</label><input class="input" id="seCnt" name="count" type="number" min="3" max="30" value="5"></div>
    <div class="field"><label for="seDur">مدت (دقیقه)</label><input class="input" id="seDur" name="duration_minutes" type="number" min="5" max="60" value="15"></div>
    <label class="row" style="gap:8px"><input type="checkbox" name="negative_marking"> نمره منفی (هر سه غلط، یک درست کم می‌کند)</label>
    <button class="btn" type="submit">${icon('play', { size: 16 })} شروع آزمون</button></form></section>
    <section class="card span2" aria-labelledby="seH"><div class="card-title"><span class="ib">${icon('clipboard', { size: 18 })}</span><span id="seH">سابقه‌ی آزمون‌ها</span></div>
    ${list.length ? `<div class="list">${list.map((e) => `<a class="list-item" href="#/self-exam/${e.id}"><div class="grow"><b>${esc(e.title)}</b><div class="tiny muted">${esc(e.subject)} · ${fa(e.question_count)} سؤال · ${dt(e.created_at)}</div></div>${e.status === 'completed' ? `<span class="badge green">${pct(e.percentage)}</span><span class="badge yellow">+${fa(e.points_awarded)}</span>` : '<span class="badge orange">ادامه بده</span>'}</a>`).join('')}</div>` : empty('inbox', 'هنوز آزمونی نساخته‌ای')}</section></div>`;
  $('#seForm', el).onsubmit = (e) => { e.preventDefault(); const f = e.target; busy(e.submitter, async () => {
    const r = await post('/api/student/self-exams', { subject: f.subject.value, count: Number(f.count.value), duration_minutes: Number(f.duration_minutes.value), negative_marking: f.negative_marking.checked });
    location.hash = `#/self-exam/${r.id}`;
  }); };
}
export async function selfExam(el, p) {
  const e = await api(`/api/student/self-exams/${p.id}`);
  if (e.status === 'completed') return selfExamResult(el, e.evaluation, e);
  setHead(esc(e.title), `${fa(e.question_count)} سؤال · ${fa(e.duration_minutes)} دقیقه${e.negative_marking ? ' · نمره منفی دارد' : ''}`, '<a class="btn ghost sm" href="#/self-exams">← خودسنجی</a>');
  const ans = {};
  el.innerHTML = `<div class="card" style="position:sticky;top:8px;z-index:5;margin-bottom:12px"><div class="row between"><b id="seLeft" aria-live="off">—</b><span class="muted small" id="seDone">۰ از ${fa(e.questions.length)} پاسخ داده شد</span></div>${progress(0, 'green')}</div>
  <form id="seQ" class="stack">${e.questions.map((q, i) => `<fieldset class="card" style="border:0"><legend class="bold" style="padding:0 4px">${fa(i + 1)}. ${esc(q.text || q.q)}</legend><div class="stack" style="gap:6px;margin-top:8px">${q.options.map((o, k) => `<label class="list-item" style="cursor:pointer"><input type="radio" name="q${q.id}" value="${k}"> <span>${esc(o)}</span></label>`).join('')}</div></fieldset>`).join('')}
  <button class="btn" type="submit">${icon('check-circle', { size: 16 })} ثبت پاسخ‌ها</button></form>`;
  const submit = (btn) => busy(btn, async () => {
    const r = await post(`/api/student/self-exams/${e.id}/submit`, { answers: ans });
    clearInterval(timer); toast(`ثبت شد؛ ${fa(r.pointsAwarded)} امتیاز گرفتی`, 'ok'); selfExamResult(el, r, e);
  });
  on(el, 'change', 'input[type=radio]', (ev, r) => { ans[r.name.slice(1)] = Number(r.value); const n = Object.keys(ans).length; $('#seDone', el).textContent = `${fa(n)} از ${fa(e.questions.length)} پاسخ داده شد`; $('.progress i', el).style.width = `${(n / e.questions.length) * 100}%`; });
  $('#seQ', el).onsubmit = (ev) => { ev.preventDefault(); submit(ev.submitter); };
  let left = e.duration_minutes * 60;
  const tick = () => { const m = Math.floor(left / 60), s = left % 60; $('#seLeft', el).textContent = `زمان باقی‌مانده: ${fa(String(m).padStart(2, '0'))}:${fa(String(s).padStart(2, '0'))}`; if (left-- <= 0) { clearInterval(timer); toast('زمان تمام شد؛ پاسخ‌ها ثبت می‌شود'); submit($('#seQ button[type=submit]', el)); } };
  const timer = setInterval(() => { if (!document.body.contains($('#seLeft', el))) return clearInterval(timer); tick(); }, 1000); tick();
}
function selfExamResult(el, r, e) {
  setHead(`نتیجه‌ی «${esc(e.title)}»`, `${esc(e.subject)}`, '<a class="btn ghost sm" href="#/self-exams">← خودسنجی</a>');
  const st = (l, v, c = '') => `<div class="card" style="text-align:center"><div class="muted small">${l}</div><div style="font-size:26px;font-weight:900" class="${c}">${v}</div></div>`;
  el.innerHTML = `<div class="grid c4" style="margin-bottom:16px">${st('درصد', pct(r.percentage))}${st('درست', fa(r.correctCount), 'green-t')}${st('غلط', fa(r.wrongCount), 'red-t')}${st('نزده', fa(r.blankCount))}</div>
  <div class="stack">${r.analysis.map((a, i) => `<section class="card ${a.is_correct ? '' : 'tint-pink'}"><div class="row wrap" style="gap:8px"><b class="grow">${fa(i + 1)}. ${esc(a.text)}</b><span class="badge ${a.is_correct ? 'green' : a.is_blank ? 'orange' : 'red'}">${a.is_correct ? 'درست' : a.is_blank ? 'بدون پاسخ' : 'غلط'}</span></div>
  <ol class="small" style="margin:8px 0;padding-inline-start:22px">${a.options.map((o, k) => `<li style="${k === a.correct ? 'font-weight:800;color:var(--green-600)' : k === a.chosen ? 'color:var(--red,#c0392b)' : ''}">${esc(o)}${k === a.correct ? ' ✓' : k === a.chosen ? ' (انتخاب تو)' : ''}</li>`).join('')}</ol>
  ${a.explanation ? `<div class="tiny muted">${esc(a.explanation)}</div>` : ''}</section>`).join('')}</div>`;
}

// ================= دانش‌آموز: نقشه راه =================
export async function roadmap(el) {
  setHead('نقشه راه رشد', 'هشت سطح از جوانه تا نخبه');
  const d = await api('/api/student/roadmap');
  el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row wrap" style="gap:16px"><div>${sproutArt(d.level.index, 90)}</div><div class="grow"><h2>سطح ${fa(d.level.index)} · ${esc(d.level.name)}</h2><div class="muted">${fa(d.current_points)} امتیاز${d.level.next ? ` · ${fa(d.level.next.need)} امتیاز تا «${esc(d.level.next.name)}»` : ''}</div>${progress(d.level.progress, 'green')}</div></div></div>
  <ol class="stack" style="list-style:none;padding:0">${d.milestones.map((m) => `<li class="card ${m.is_current ? 'tint-green' : ''}" ${m.is_current ? 'aria-current="step"' : ''} style="${m.is_unlocked ? '' : 'opacity:.62'}"><div class="row" style="gap:14px"><div>${sproutArt(m.level, 56)}</div><div class="grow"><div class="row wrap" style="gap:8px"><b>سطح ${fa(m.level)}: ${esc(m.name)}</b>${m.is_current ? '<span class="badge green">سطح فعلی</span>' : m.is_unlocked ? '<span class="badge">باز شده</span>' : `<span class="badge orange">${icon('lock', { size: 12 })} قفل</span>`}</div><div class="small muted">از ${fa(m.min_points)} امتیاز</div><div class="small">${icon('star', { size: 14 })} امتیاز ویژه: ${esc(m.privilege)}</div></div></div></li>`).join('')}</ol>
  <h3 style="margin:20px 0 10px">نشان‌ها</h3><div class="grid c4">${d.badges.map((b) => `<div class="card" style="text-align:center;${b.unlocked ? '' : 'opacity:.55'}"><div class="ib ${b.unlocked ? 'sun' : ''}" style="margin:0 auto 8px">${icon(b.unlocked ? 'award' : 'lock', { size: 22 })}</div><b class="small">${esc(b.title)}</b><div class="tiny muted">${esc(b.desc)}</div></div>`).join('')}</div>`;
}

// ================= دانش‌آموز: مشاور =================
export async function counselor(el, _p, me) {
  setHead('مشاور تحصیلی', 'سؤال درسی و برنامه‌ریزی را از مشاور کانون بپرس');
  const [c, chips] = await Promise.all([api('/api/counselor'), api('/api/counselor/quick-chips')]);
  el.innerHTML = `<div class="card" style="margin-bottom:12px"><div class="row" style="gap:12px"><span class="ib green">${icon('user', { size: 22 })}</span><div class="grow"><b>${esc(c.full_name)}</b> <span class="badge ${c.is_online ? 'green' : ''}">${c.is_online ? 'آنلاین' : 'آفلاین'}</span><div class="small muted">${esc(c.title)}</div><div class="tiny muted">${esc(c.bio)}</div></div></div></div>
  <div class="chips" style="margin-bottom:12px">${chips.map((x) => `<button class="chip" data-chip="${esc(x.prompt)}">${esc(x.label)}</button>`).join('')}</div>
  <div class="card"><div id="cMsgs" class="stack" style="max-height:46vh;overflow:auto" aria-live="polite"></div>
  <form id="cForm" class="row" style="gap:8px;margin-top:12px"><label class="sr-only" for="cTxt">متن پیام</label><textarea class="input grow" id="cTxt" rows="2" maxlength="2000" placeholder="پیامت را بنویس…"></textarea><button class="btn" type="submit">ارسال</button></form></div>`;
  const draw = async () => {
    const box = $('#cMsgs', el);
    try {
      const m = await api(`/api/messages/${c.id}`);
      box.innerHTML = m.length ? m.map((x) => `<div class="msg ${x.from_id === me.user.id ? 'me' : ''}" style="align-self:${x.from_id === me.user.id ? 'flex-start' : 'flex-end'};max-width:85%;background:${x.from_id === me.user.id ? 'var(--teal-100,#dbf6ed)' : 'var(--surface-2,#f1f6fc)'};border-radius:16px;padding:8px 12px">${esc(x.body)}<div class="tiny muted">${dt(x.created_at)}</div></div>`).join('') : '<div class="muted small">هنوز پیامی نیست. از چیپ‌های بالا شروع کن.</div>';
      box.scrollTop = box.scrollHeight;
    } catch (err) { box.innerHTML = `<div class="badge orange">${esc(err.message || 'گفت‌وگو با مشاور در دسترس نیست')}</div>`; }
  };
  on(el, 'click', '[data-chip]', (e, b) => { $('#cTxt', el).value = b.dataset.chip; $('#cTxt', el).focus(); });
  $('#cForm', el).onsubmit = (e) => { e.preventDefault(); const t = $('#cTxt', el).value.trim(); if (!t) return; busy(e.submitter, async () => { await post('/api/messages', { to: c.id, body: t }); $('#cTxt', el).value = ''; await draw(); }); };
  draw();
}

// ================= دانش‌آموز: کتاب‌های هوش =================
export async function books(el, p) {
  if (p.id && p.topic) return topicQuestions(el, p);
  if (p.id) return topics(el, p);
  setHead('کتاب‌های هوش', 'سرفصل‌ها و تمرین‌های هر کتاب');
  const b = await api('/api/exam-books');
  el.innerHTML = b.length ? `<div class="grid c3">${b.map((x) => `<a class="card" href="#/books/${esc(x.id)}"><div class="row" style="gap:12px"><span class="ib sun">${icon('book', { size: 22 })}</span><div class="grow"><b>${esc(x.title || x.name || x.id)}</b><div class="tiny muted">${x.topics_count ? `${fa(x.topics_count)} مبحث` : ''}${x.grade ? ` · پایه ${esc(x.grade)}` : ''}</div></div></div></a>`).join('')}</div>` : empty('book', 'کتابی ثبت نشده');
}
async function topics(el, p) {
  setHead('سرفصل‌ها', '', '<a class="btn ghost sm" href="#/books">← کتاب‌ها</a>');
  const t = await api(`/api/exam-books/${encodeURIComponent(p.id)}/topics`);
  const list = Array.isArray(t) ? t : (t.topics || []);
  const groups = {};
  for (const x of list) (groups[x.chapterTitle || x.sectionTitle || 'مباحث'] ||= []).push(x);
  el.innerHTML = Object.entries(groups).map(([g, items]) => `<section class="card" style="margin-bottom:12px"><div class="card-title">${esc(g)}</div><div class="list">${items.map((x) => `<a class="list-item" href="#/books/${esc(p.id)}/${x.id}"><div class="grow">${esc(x.title)}</div><span class="tiny muted">ص ${fa(x.bookStartPage ?? '')}${x.bookEndPage ? `–${fa(x.bookEndPage)}` : ''}</span></a>`).join('')}</div></section>`).join('') || empty('book', 'سرفصلی نیست');
}
async function topicQuestions(el, p) {
  setHead('تمرین مبحث', '', `<a class="btn ghost sm" href="#/books/${esc(p.id)}">← سرفصل‌ها</a>`);
  const q = await api(`/api/exam-books/${encodeURIComponent(p.id)}/questions?topic_id=${encodeURIComponent(p.topic)}`);
  el.innerHTML = q.length ? `<div class="stack">${q.map((x, i) => `<section class="card"><b>${fa(i + 1)}. ${esc(x.text)}</b><ol class="small" style="margin:8px 0;padding-inline-start:22px">${x.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>${x.explanation ? `<details><summary class="small">توضیح</summary><div class="small muted">${esc(x.explanation)}</div></details>` : ''}</section>`).join('')}</div>` : empty('inbox', 'سؤالی برای این مبحث نیست');
}

// ================= دانش‌آموز: نمرات، فاکتورها، کارنامه برپا =================
export async function records(el) {
  setHead('نمرات و فاکتورها', 'نمره‌های مستمر کلاس، فاکتورهای دوره‌ای و کارنامه‌های آزمون جامع');
  const [s, i, b] = await Promise.all([api('/api/student/manual-scores'), api('/api/student/invoices'), api('/api/barpa-exams/reports')]);
  el.innerHTML = `<section class="card" style="margin-bottom:16px"><div class="card-title">نمرات مستمر کلاسی</div>${scoresTable(s)}</section>
  <section class="card" style="margin-bottom:16px"><div class="card-title">فاکتورهای دوره‌ای</div>${invoicesTable(i)}</section>
  <section class="card"><div class="card-title">کارنامه آزمون جامع برپا</div>${barpaList(b)}</section>`;
}
export const barpaView = (el, p) => barpaDetail(el, p);

// ================= معلم: نمرات مستمر و لاگ حضور =================
export async function teacherScores(el) {
  setHead('نمرات مستمر کلاسی', 'ثبت نمره از ۲۰ برای هر دانش‌آموز');
  const ov = await api('/api/teacher/overview');
  if (!ov.classes.length) { el.innerHTML = empty('users', 'کلاسی به شما اختصاص داده نشده'); return; }
  let cls = ov.classes[0].id;
  const draw = async () => {
    const [att, list] = await Promise.all([api(`/api/teacher/attendance?class_id=${cls}`), api(`/api/teacher/manual-scores?class_id=${cls}`)]);
    $('#msBody', el).innerHTML = `<form id="msForm" class="card" style="margin-bottom:16px"><div class="row wrap" style="gap:10px;margin-bottom:12px"><div class="field grow"><label for="msSub">درس</label><input class="input" id="msSub" name="subject" required maxlength="50"></div><div class="field grow"><label for="msTit">عنوان (مثلاً پرسش کلاسی)</label><input class="input" id="msTit" name="title" required maxlength="100"></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th style="width:140px">نمره (۰ تا ۲۰)</th></tr></thead><tbody>${att.students.map((s) => `<tr><td>${esc(s.full_name)}</td><td><input class="input" type="number" min="0" max="20" step="0.25" inputmode="decimal" data-sid="${s.id}" aria-label="نمره ${esc(s.full_name)}"></td></tr>`).join('')}</tbody></table></div>
      <button class="btn" type="submit" style="margin-top:12px">${icon('check-circle', { size: 16 })} ثبت نمره‌ها</button></form>
      <section class="card"><div class="card-title">نمرات ثبت‌شده</div>${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>درس</th><th>عنوان</th><th>نمره</th><th>تاریخ</th><th></th></tr></thead><tbody>${list.map((m) => `<tr><td>${esc(m.student_name)}</td><td>${esc(m.subject)}</td><td>${esc(m.title)}</td><td><b>${score20(m.score)}</b></td><td class="tiny muted">${dt(m.created_at)}</td><td><button class="btn sm ghost" data-del="${m.id}" aria-label="حذف نمره ${esc(m.student_name)}">${icon('trash', { size: 14 })}</button></td></tr>`).join('')}</tbody></table></div>` : empty('inbox', 'نمره‌ای ثبت نشده')}</section>`;
    $('#msForm', el).onsubmit = (e) => { e.preventDefault(); const f = e.target; const records = $$('[data-sid]', f).filter((i) => i.value !== '').map((i) => ({ student_id: Number(i.dataset.sid), score: Number(i.value) }));
      if (!records.length) return toast('حداقل یک نمره وارد کن');
      busy(e.submitter, async () => { const r = await post('/api/teacher/manual-scores', { class_id: cls, subject: f.subject.value, title: f.title.value, records }); toast(`${fa(r.count)} نمره ثبت شد`, 'ok'); draw(); }); };
  };
  el.innerHTML = `<div class="row wrap" style="margin-bottom:16px;gap:10px"><label for="msCls" class="bold">کلاس:</label><select class="input" id="msCls" style="width:auto">${ov.classes.map((c) => `<option value="${c.id}">${esc(c.name)} · پایه ${gradeName(c.grade)}</option>`).join('')}</select></div><div id="msBody">${loading()}</div>`;
  $('#msCls', el).onchange = (e) => { cls = Number(e.target.value); draw(); };
  on(el, 'click', '[data-del]', async (e, b) => { if (await confirmBox('این نمره حذف شود؟')) busy(b, async () => { await del(`/api/teacher/manual-scores/${b.dataset.del}`); toast('حذف شد', 'ok'); draw(); }); });
  draw();
}
const ST = { present: 'حاضر', absent: 'غایب', excused: 'موجه' };
export async function attLog(el, _p, me) {
  setHead('لاگ تغییرات حضور و غیاب', 'هر بار که وضعیت یک دانش‌آموز عوض شود اینجا ثبت می‌شود');
  const rows = await api(`/api/${me.user.role}/attendance/changes`);
  el.innerHTML = `<section class="card">${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>کلاس</th><th>تاریخ حضور</th><th>تغییر</th><th>ویرایشگر</th><th>زمان ثبت</th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(c.student_name)}</td><td>${esc(c.class_name || '')}</td><td>${c.date ? jdate(c.date) : '—'}</td><td>${ST[c.old_status] || esc(c.old_status)} ← <b>${ST[c.new_status] || esc(c.new_status)}</b></td><td>${esc(c.actor_name)}</td><td class="tiny muted">${dt(c.changed_at || c.created_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('inbox', 'تغییری ثبت نشده')}</section>`;
}

// ================= ولی: نمرات، فاکتورها، کارنامه فرزند =================
export async function parentRecords(el, _p, me, child) {
  setHead('نمرات و فاکتورها', `${esc(child.full_name)} · پایه ${gradeName(child.grade)}`);
  const [s, i, b] = await Promise.all([api(`/api/parent/children/${child.id}/manual-scores`), api(`/api/parent/children/${child.id}/invoices`), api(`/api/parent/children/${child.id}/barpa-reports`)]);
  el.innerHTML = `<section class="card" style="margin-bottom:16px"><div class="card-title">نمرات مستمر کلاسی</div>${scoresTable(s)}</section>
  <section class="card" style="margin-bottom:16px"><div class="card-title">فاکتورهای دوره‌ای</div>${invoicesTable(i)}</section>
  <section class="card"><div class="card-title">کارنامه آزمون جامع برپا</div>${barpaList(b)}</section>`;
}

// ================= مدیر: فاکتورها، پیامک، کارنامه برپا، نمرات =================
export async function mgrInvoices(el) {
  setHead('فاکتورهای دوره‌ای', 'صدور بدهی برای یک دانش‌آموز یا کل یک کلاس');
  const [meta, list] = await Promise.all([api('/api/manager/meta'), api('/api/manager/invoices')]);
  const owed = list.reduce((a, i) => a + i.remaining, 0);
  el.innerHTML = `<div class="grid c3"><form id="ivForm" class="card" aria-label="صدور فاکتور"><div class="card-title">صدور فاکتور</div><div class="stack">
    <div class="field"><label for="ivCls">کلاس</label><select class="input" id="ivCls" name="class_id" required><option value="">انتخاب کنید</option>${meta.classes.map((c) => `<option value="${c.id}">${esc(c.name)} · پایه ${gradeName(c.grade)} (${fa(c.students)} نفر)</option>`).join('')}</select></div>
    <div class="field"><label for="ivType">نوع</label><select class="input" id="ivType" name="fee_type">${Object.entries(FEE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field"><label for="ivPer">دوره (مثلاً مهر ۱۴۰۵)</label><input class="input" id="ivPer" name="period" required maxlength="40"></div>
    <div class="field"><label for="ivAmt">مبلغ به تومان</label><input class="input" id="ivAmt" name="amount" type="number" min="1000" step="1000" inputmode="numeric" required></div>
    <button class="btn" type="submit">صدور برای همه‌ی دانش‌آموزان کلاس</button></div></form>
    <section class="card span2"><div class="card-title">مانده بدهی کل: <b>${money(owed)}</b></div>${invoicesTable(list, { student: true })}</section></div>`;
  $('#ivForm', el).onsubmit = (e) => { e.preventDefault(); const f = e.target; busy(e.submitter, async () => {
    if (!(await confirmBox(`برای همه‌ی دانش‌آموزان این کلاس فاکتور ${money(Number(f.amount.value))} صادر شود؟`))) return;
    const r = await post('/api/manager/invoices', { class_id: Number(f.class_id.value), fee_type: f.fee_type.value, period: f.period.value, amount: Number(f.amount.value) });
    toast(`${fa(r.count)} فاکتور صادر شد`, 'ok'); mgrInvoices(el);
  }); };
}
const SMS = { sent: ['ارسال شد', 'green'], failed: ['ناموفق', 'red'], pending: ['در صف', 'orange'] };
export async function smsOutbox(el) {
  setHead('صندوق خروجی پیامک', 'وضعیت همه‌ی پیامک‌های کانون؛ پیامک ناموفق را دوباره بفرستید');
  const rows = await api('/api/manager/sms-outbox');
  el.innerHTML = `<section class="card">${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>گیرنده</th><th>دانش‌آموز</th><th>متن</th><th>وضعیت</th><th>زمان</th><th></th></tr></thead><tbody>${rows.map((m) => `<tr><td dir="ltr">${esc(m.recipient_phone)}</td><td>${esc(m.student_name || '—')}</td><td class="small">${esc(m.content)}${m.error_message ? `<div class="tiny red-t">${esc(m.error_message)}</div>` : ''}</td><td><span class="badge ${(SMS[m.status] || ['', ''])[1]}">${(SMS[m.status] || [m.status])[0]}</span></td><td class="tiny muted">${dt(m.sent_at || m.created_at)}</td><td>${m.status === 'failed' ? `<button class="btn sm soft" data-retry="${m.id}">ارسال مجدد</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('inbox', 'پیامکی ثبت نشده')}</section>`;
  on(el, 'click', '[data-retry]', (e, b) => busy(b, async () => { const r = await post(`/api/manager/sms-outbox/${b.dataset.retry}/retry`); toast(r.ok ? 'پیامک ارسال شد' : `ناموفق: ${r.error}`, r.ok ? 'ok' : ''); smsOutbox(el); }));
}
export async function mgrBarpa(el) {
  setHead('کارنامه‌های آزمون جامع برپا', 'صدور و مشاهده‌ی کارنامه‌ی رسمی');
  const [rows, studs] = await Promise.all([api('/api/barpa-exams/reports'), api('/api/manager/students?limit=500')]);
  const f = (id, l, extra = '') => `<div class="field"><label for="${id}">${l}</label><input class="input" id="${id}" name="${id}" type="number" step="any" inputmode="decimal" required ${extra}></div>`;
  el.innerHTML = `<div class="grid c3"><form id="bpForm" class="card" aria-label="ثبت کارنامه"><div class="card-title">ثبت کارنامه</div><div class="stack">
    <div class="field"><label for="bpSt">دانش‌آموز</label><select class="input" id="bpSt" required><option value="">انتخاب کنید</option>${(studs.rows || studs).map((s) => `<option value="${s.id}">${esc(s.full_name)}</option>`).join('')}</select></div>
    <div class="field"><label for="bpTi">عنوان آزمون</label><input class="input" id="bpTi" value="آزمون جامع طرح برپا" required maxlength="120"></div>
    ${f('overall_traz', 'تراز کل')}${f('overall_rank_all', 'رتبه کشوری')}${f('overall_rank_center', 'رتبه در کانون')}${f('total_attendees', 'تعداد شرکت‌کنندگان کشوری')}${f('overall_percentage', 'درصد کل', 'min="0" max="100"')}${f('overall_correct', 'تعداد درست')}${f('overall_wrong', 'تعداد غلط')}${f('overall_unanswered', 'تعداد نزده')}${f('total_questions', 'کل سؤال‌ها')}
    <div class="tiny muted">همه‌ی مقدارها را از کارنامه‌ی رسمی وارد کنید؛ فیلد خالی ثبت نمی‌شود.</div><button class="btn" type="submit">ثبت و صدور</button></div></form>
    <section class="card span2"><div class="card-title">کارنامه‌های صادرشده</div>${barpaList(rows, { student: true })}</section></div>`;
  $('#bpForm', el).onsubmit = (e) => { e.preventDefault(); const g = e.target; busy(e.submitter, async () => {
    const rec = { student_id: Number($('#bpSt', g).value) };
    for (const k of ['overall_traz', 'overall_rank_all', 'overall_rank_center', 'total_attendees', 'overall_percentage', 'overall_correct', 'overall_wrong', 'overall_unanswered', 'total_questions']) rec[k] = Number(g[k].value);
    await post('/api/manager/barpa-exams/reports', { exam_title: $('#bpTi', g).value, grade: 'نهم', records: [rec] });
    toast('کارنامه ثبت شد', 'ok'); mgrBarpa(el);
  }); };
}
export async function mgrScores(el) {
  setHead('نمرات مستمر کلاسی', 'همه‌ی نمرات ثبت‌شده‌ی معلمان کانون');
  el.innerHTML = `<section class="card">${scoresTable(await api('/api/manager/manual-scores'), { student: true })}</section>`;
}
