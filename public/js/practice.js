// تمرین آزاد دانش‌آموز (گسترش «خودسنجی»): حالت یادگیری با بازخورد فوری و حالت آزمون شخصی؛
// انتخاب پایه، درس، کتاب، فصل، مبحث، دشواری، تعداد و زمان اختیاری؛ تحلیل مبحثی، مرور اشتباه‌ها و پیشنهاد تمرین بعدی.
// نتایج تمرین آزاد در نمره و رتبهٔ رسمی اثر ندارد.
import { api, post, esc, fa, pct, $, on, toast, busy, setHead, empty, jdate, progress, icon, gradeName } from './core.js';

const DIFF = { '': 'همه', easy: 'آسان', medium: 'متوسط', hard: 'دشوار' };
const MODE = { learning: 'یادگیری', test: 'آزمون شخصی' };
const opt = (v, cur, t) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(t)}</option>`;
const qImage = (q) => (q.image ? `<img src="${esc(q.image)}" alt="تصویر سؤال" loading="lazy" style="max-width:100%;max-height:320px;display:block;margin:8px 0;border-radius:12px">` : '');

export async function practiceHome(el, _p, me) {
  setHead('تمرین آزاد', 'یادگیری با بازخورد فوری یا آزمون شخصی؛ بدون اثر بر نمره و رتبهٔ رسمی');
  const [books, list, ov] = await Promise.all([api('/api/bank/books'), api('/api/student/self-exams'), api('/api/student/practice/overview')]);
  const grade = me.student?.grade;
  const subjects = [...new Set(books.map((b) => b.subject))];
  el.innerHTML = `<div class="grid c3">
  <section class="card" aria-labelledby="pxNew"><div class="card-title"><span class="ib green">${icon('sparkles', { size: 18 })}</span><span id="pxNew">تمرین تازه</span></div>
    <form id="pxForm" class="stack">
      <fieldset class="row" style="gap:8px;border:0;padding:0"><legend class="small bold">حالت</legend>${Object.entries(MODE).map(([k, v], i) => `<label class="chip"><input type="radio" name="mode" value="${k}" ${i ? '' : 'checked'}> ${v}</label>`).join('')}</fieldset>
      <div class="field"><label for="pxGrade">پایه</label><select class="input" id="pxGrade" name="grade">${[4, 5, 6, 7, 8, 9].map((g) => opt(g, grade, gradeName(g))).join('')}</select></div>
      <div class="field"><label for="pxSub">درس</label><select class="input" id="pxSub" name="subject">${opt('', '', 'همه درس‌ها')}${(subjects.length ? subjects : ['ریاضی', 'علوم', 'فارسی', 'هوش و استعداد']).map((s) => opt(s, '', s)).join('')}</select></div>
      <div class="field"><label for="pxBook">کتاب</label><select class="input" id="pxBook" name="book_id"></select></div>
      <div class="field"><label for="pxCh">فصل</label><select class="input" id="pxCh" name="chapter_id"></select></div>
      <div class="field"><label for="pxTopic">مبحث</label><select class="input" id="pxTopic" name="topic_id"></select></div>
      <div class="field"><label for="pxDiff">دشواری</label><select class="input" id="pxDiff" name="difficulty">${Object.entries(DIFF).map(([k, v]) => opt(k, '', v)).join('')}</select></div>
      <div class="field"><label for="pxCnt">تعداد سؤال</label><input class="input" id="pxCnt" name="count" type="number" inputmode="numeric" min="3" max="30" value="10"></div>
      <div id="pxTimeBox"><label class="row" style="gap:8px"><input type="checkbox" name="timed" id="pxTimed" checked> زمان‌دار</label>
      <div class="field"><label for="pxDur">مدت (دقیقه)</label><input class="input" id="pxDur" name="duration_minutes" type="number" inputmode="numeric" min="5" max="120" value="15"></div></div>
      <p class="tiny muted" id="pxAvail" aria-live="polite"></p>
      <button class="btn" type="submit">${icon('play', { size: 16 })} شروع</button></form></section>
  <section class="span2 stack">${overviewHtml(ov)}
    <section class="card"><div class="card-title"><span class="ib">${icon('clipboard', { size: 18 })}</span>سابقهٔ تمرین‌ها</div>
    ${list.length ? `<div class="list">${list.map((e) => `<a class="list-item" href="#/self-exam/${e.id}"><div class="grow"><b>${esc(e.title)}</b><div class="tiny muted">${MODE[e.mode] || 'آزمون'} · ${fa(e.question_count)} سؤال · ${jdate(e.created_at)}</div></div>${e.status === 'completed' ? `<span class="badge green">${pct(e.percentage)}</span>` : '<span class="badge orange">ادامه</span>'}</a>`).join('')}</div>` : empty('target', 'هنوز تمرینی انجام نداده‌ای')}</section></section></div>`;

  const f = $('#pxForm', el);
  const fill = () => {
    const g = Number(f.grade.value), sub = f.subject.value;
    const bs = books.filter((b) => b.grade === g && (!sub || b.subject === sub));
    const curB = bs.find((b) => String(b.id) === f.book_id.value);
    f.book_id.innerHTML = opt('', '', 'همه کتاب‌ها') + bs.map((b) => opt(b.id, f.book_id.value, `${b.title} (${fa(b.practice_questions)} سؤال)`)).join('');
    const chs = curB ? curB.chapters : [];
    const curC = chs.find((c) => String(c.id) === f.chapter_id.value);
    f.chapter_id.innerHTML = opt('', '', 'همه فصل‌ها') + chs.map((c) => opt(c.id, f.chapter_id.value, `${c.title} (${fa(c.practice_questions)})`)).join('');
    f.chapter_id.disabled = !curB;
    f.topic_id.innerHTML = opt('', '', 'همه مباحث') + (curC ? curC.topics : []).map((t) => opt(t.id, f.topic_id.value, `${t.title} (${fa(t.practice_questions)})`)).join('');
    f.topic_id.disabled = !curC;
    const n = (curC ? (curC.topics.find((t) => String(t.id) === f.topic_id.value) || curC) : curB || null)?.practice_questions;
    $('#pxAvail', el).textContent = n != null ? `${fa(n)} سؤال منتشرشده در این انتخاب (بدون فیلتر دشواری)` : '';
    $('#pxTimeBox', el).hidden = f.mode.value === 'learning';
    f.duration_minutes.disabled = !f.timed.checked;
  };
  f.addEventListener('change', (e) => { if (e.target.name === 'book_id') f.chapter_id.value = ''; if (e.target.name === 'chapter_id' || e.target.name === 'book_id') f.topic_id.value = ''; if (['grade', 'subject'].includes(e.target.name)) f.book_id.value = ''; fill(); });
  fill();
  const start = (body, btn) => busy(btn, async () => { const r = await post('/api/student/self-exams', body); if (r.requested > r.question_count) toast(`فقط ${fa(r.question_count)} سؤال برای این انتخاب موجود بود`); location.hash = `#/self-exam/${r.id}`; });
  f.onsubmit = (e) => {
    e.preventDefault();
    const n = (k) => (f[k].value ? Number(f[k].value) : undefined);
    start({ mode: f.mode.value, grade: n('grade'), subject: f.subject.value || undefined, book_id: n('book_id'), chapter_id: n('chapter_id'), topic_id: n('topic_id'), difficulty: f.difficulty.value || undefined, count: Number(f.count.value), timed: f.mode.value === 'test' && f.timed.checked, duration_minutes: Number(f.duration_minutes.value) }, e.submitter);
  };
  on(el, 'click', '[data-rec]', (_e, b) => start({ mode: 'learning', topic_id: Number(b.dataset.rec), difficulty: b.dataset.diff, count: 8 }, b));
}

function overviewHtml(ov) {
  const t = ov.totals;
  return `<section class="card"><div class="card-title"><span class="ib">${icon('chart', { size: 18 })}</span>وضعیت تمرین من</div>
    <div class="grid c3" style="margin-bottom:10px"><div><div class="tiny muted">تمرین کامل‌شده</div><b>${fa(t.sessions)}</b></div><div><div class="tiny muted">سؤال پاسخ‌داده</div><b>${fa(t.answered)}</b></div><div><div class="tiny muted">دقت پاسخ‌ها (بدون بی‌پاسخ‌ها)</div><b>${t.accuracy == null ? '—' : pct(t.accuracy)}</b></div></div>
    ${ov.topics.length ? `<h4 style="margin:8px 0">تسلط مبحثی</h4><div class="stack" style="gap:6px">${ov.topics.slice(0, 8).map((x) => `<div><div class="row between small"><span>${esc(x.label)}</span><span>${pct(x.mastery ?? 0)} · ${fa(x.attempted)} سؤال</span></div>${progress(x.mastery ?? 0, (x.mastery ?? 0) < 50 ? 'red' : (x.mastery ?? 0) < 75 ? 'orange' : 'green')}</div>`).join('')}</div>` : ''}
    ${ov.recommendations.length ? `<h4 style="margin:12px 0 6px">پیشنهاد تمرین بعدی</h4><div class="stack" style="gap:6px">${ov.recommendations.map((r) => `<div class="row between"><span class="small"><b>${esc(r.title)}</b> <span class="muted">— ${esc(r.reason)}</span></span><button class="btn sm soft" data-rec="${r.topic_id}" data-diff="${r.difficulty}">شروع</button></div>`).join('')}</div>` : ''}
    <p class="tiny muted" style="margin-top:8px">${esc(ov.note)}</p></section>
    ${ov.mistakes.length ? `<section class="card"><details><summary class="card-title" style="cursor:pointer">مرور اشتباه‌ها (${fa(ov.mistakes.length)})</summary><div class="stack" style="margin-top:8px">${ov.mistakes.map((m) => `<div class="card tint-pink"><b>${esc(m.text)}</b>${qImage(m)}<ol class="small" style="padding-inline-start:22px;margin:6px 0">${m.options.map((o, k) => `<li style="${k === m.correct ? 'font-weight:800;color:var(--green-600)' : k === m.chosen ? 'color:var(--red,#c0392b)' : ''}">${esc(o)}${k === m.correct ? ' ✓' : k === m.chosen ? ' (پاسخ تو)' : ''}</li>`).join('')}</ol>${m.explanation ? `<div class="tiny muted">${esc(m.explanation)}</div>` : ''}</div>`).join('')}</div></details></section>` : ''}`;
}

export async function practiceSession(el, p) {
  const e = await api(`/api/student/self-exams/${p.id}`);
  if (e.status === 'completed') return resultView(el, e.evaluation, e);
  const back = '<a class="btn ghost sm" href="#/self-exams">← تمرین آزاد</a>';
  if (e.mode === 'learning') return learningView(el, e, back);
  setHead(esc(e.title), `${MODE.test} · ${fa(e.question_count)} سؤال${e.timed ? ` · ${fa(e.duration_minutes)} دقیقه` : ' · بدون محدودیت زمان'}${e.negative_marking ? ' · نمره منفی' : ''}`, back);
  const ans = {};
  el.innerHTML = `<div class="card" style="position:sticky;top:8px;z-index:5;margin-bottom:12px"><div class="row between"><b id="seLeft">${e.timed ? '—' : 'بدون محدودیت زمان'}</b><span class="muted small" id="seDone">۰ از ${fa(e.questions.length)} پاسخ داده شد</span></div>${progress(0, 'green')}</div>
  <form id="seQ" class="stack">${e.questions.map((q, i) => `<fieldset class="card" style="border:0"><legend class="bold" style="padding:0 4px">${fa(i + 1)}. ${esc(q.text)}</legend>${qImage(q)}<div class="stack" style="gap:6px;margin-top:8px">${q.options.map((o, k) => `<label class="list-item" style="cursor:pointer"><input type="radio" name="q${i}" value="${k}"> ${esc(o)}</label>`).join('')}</div></fieldset>`).join('')}
  <button class="btn" type="submit" id="seSubmit">${icon('check-circle', { size: 16 })} ثبت پاسخ‌ها</button></form>`;
  let timer;
  const submit = (btn) => busy(btn, async () => { const r = await post(`/api/student/self-exams/${e.id}/submit`, { answers: ans }); clearInterval(timer); toast(r.pointsAwarded ? `ثبت شد؛ ${fa(r.pointsAwarded)} امتیاز گرفتی` : 'ثبت شد', 'ok'); resultView(el, r, e); });
  on(el, 'change', 'input[type=radio]', (_ev, r) => { ans[r.name.slice(1)] = Number(r.value); const n = Object.keys(ans).length; $('#seDone', el).textContent = `${fa(n)} از ${fa(e.questions.length)} پاسخ داده شد`; $('.progress i', el).style.width = `${(n / e.questions.length) * 100}%`; });
  $('#seQ', el).onsubmit = (ev) => { ev.preventDefault(); submit(ev.submitter); };
  if (e.timed) {
    const startedMs = new Date(e.created_at.includes('T') ? e.created_at : e.created_at.replace(' ', 'T') + 'Z').getTime();
    const tick = () => { const left = Math.max(0, Math.round((startedMs + e.duration_minutes * 60000 - Date.now()) / 1000)); $('#seLeft', el).textContent = `زمان باقی‌مانده: ${fa(String(Math.floor(left / 60)).padStart(2, '0'))}:${fa(String(left % 60).padStart(2, '0'))}`; if (!left) { clearInterval(timer); toast('زمان تمام شد؛ پاسخ‌ها ثبت می‌شود'); submit($('#seSubmit', el)); } };
    timer = setInterval(() => { if (!document.body.contains($('#seLeft', el))) return clearInterval(timer); tick(); }, 1000); tick();
  }
}

function learningView(el, e, back) {
  setHead(esc(e.title), `${MODE.learning} · ${fa(e.question_count)} سؤال · پاسخ و توضیح هر سؤال بلافاصله نمایش داده می‌شود`, back);
  const answers = { ...e.answers };
  const card = (q, i) => {
    const chosen = answers[i], done = chosen != null;
    return `<section class="card" id="lq${i}"><b>${fa(i + 1)}. ${esc(q.text)}</b>${qImage(q)}<div class="stack" style="gap:6px;margin-top:8px" role="group" aria-label="گزینه‌های سؤال ${fa(i + 1)}">${q.options.map((o, k) => {
      const cls = !done ? '' : k === q.answer ? 'tint-green' : k === chosen ? 'tint-pink' : '';
      return `<button type="button" class="list-item ${cls}" style="text-align:right" data-q="${i}" data-k="${k}" ${done ? 'disabled' : ''} aria-pressed="${k === chosen}">${fa(k + 1)}) ${esc(o)}${done && k === q.answer ? ' ✓' : ''}</button>`;
    }).join('')}</div>${done ? `<div class="small" style="margin-top:8px" role="status"><b class="${chosen === q.answer ? 'green-t' : 'red-t'}">${chosen === q.answer ? 'آفرین، درست بود!' : 'نادرست'}</b>${q.explanation ? ` — ${esc(q.explanation)}` : ''}</div>` : ''}</section>`;
  };
  const draw = () => {
    const n = Object.keys(answers).length;
    el.innerHTML = `<div class="card" style="position:sticky;top:8px;z-index:5;margin-bottom:12px"><div class="row between"><span class="small">${fa(n)} از ${fa(e.questions.length)} پاسخ داده شد</span><button class="btn sm" id="lqEnd">${n === e.questions.length ? 'دیدن کارنامه' : 'پایان تمرین'}</button></div>${progress((n / e.questions.length) * 100, 'green')}</div><div class="stack">${e.questions.map(card).join('')}</div>`;
  };
  draw();
  on(el, 'click', '[data-q]', (_ev, b) => busy(b, async () => {
    const i = Number(b.dataset.q), k = Number(b.dataset.k);
    const r = await post(`/api/student/self-exams/${e.id}/answer`, { position: i, choice: k });
    answers[i] = k; e.questions[i].answer = r.correct; e.questions[i].explanation = r.explanation;
    const y = window.scrollY; draw(); window.scrollTo(0, y);
    $(`#lq${i} [role=status]`, el)?.focus?.();
  }));
  on(el, 'click', '#lqEnd', (_ev, b) => busy(b, async () => { const r = await post(`/api/student/self-exams/${e.id}/submit`, {}); resultView(el, r, e); }));
}

function resultView(el, r, e) {
  setHead(`نتیجهٔ «${esc(e.title)}»`, `${MODE[e.mode] || 'آزمون'} · فقط برای تمرین؛ در نمره و رتبهٔ رسمی اثری ندارد`, '<a class="btn ghost sm" href="#/self-exams">← تمرین آزاد</a>');
  const st = (l, v, c = '') => `<div class="card" style="text-align:center"><div class="muted small">${l}</div><div style="font-size:26px;font-weight:900" class="${c}">${v}</div></div>`;
  el.innerHTML = `<div class="grid c4" style="margin-bottom:16px">${st('درصد', pct(r.percentage))}${st('درست', fa(r.correctCount), 'green-t')}${st('غلط', fa(r.wrongCount), 'red-t')}${st('بی‌پاسخ', fa(r.blankCount))}</div>
  <div class="stack">${r.analysis.map((a, i) => `<section class="card ${a.is_correct ? '' : 'tint-pink'}"><div class="row wrap" style="gap:8px"><b class="grow">${fa(i + 1)}. ${esc(a.text)}</b><span class="badge ${a.is_correct ? 'green' : a.is_blank ? 'orange' : 'red'}">${a.is_correct ? 'درست' : a.is_blank ? 'بی‌پاسخ' : 'نادرست'}</span></div>
  <ol class="small" style="margin:8px 0;padding-inline-start:22px">${a.options.map((o, k) => `<li style="${k === a.correct ? 'font-weight:800;color:var(--green-600)' : k === a.chosen ? 'color:var(--red,#c0392b)' : ''}">${esc(o)}${k === a.correct ? ' ✓' : k === a.chosen ? ' (انتخاب تو)' : ''}</li>`).join('')}</ol>
  ${a.explanation ? `<div class="tiny muted">${esc(a.explanation)}</div>` : ''}</section>`).join('')}</div>`;
}
