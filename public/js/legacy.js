// صفحه‌های قابلیت‌های تکمیلی کانون: خودسنجی، نقشه راه، مشاور، استودیوی طرح آزمون چاپی، نمرات مستمر، فاکتورها، کارنامه برپا،
// لاگ حضور و غیاب و صندوق پیامک. فقط رابط کاربری؛ منطق و دسترسی‌ها سمت سرور است.
import { api, post, del, esc, fa, num, money, pct, $, $$, on, toast, busy, modal, confirmBox, setHead, empty, loading, jdate, jdatetime, icon, progress, gradeName, fileToData } from './core.js';
import { sproutArt } from './icons.js';

const dt = (s) => (s ? jdatetime(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z') : '—');
const tabs = (items, cur) => `<div class="seg" style="margin-bottom:16px" role="tablist">${items.map(([k, l]) => `<button role="tab" aria-selected="${k === cur}" data-tab="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const nv = (v) => (v == null || v === '' ? '—' : num(v));
const pv = (v) => (v == null || v === '' ? '—' : pct(v));
const score20 = (v) => fa(Number(v).toLocaleString('en', { maximumFractionDigits: 2 })).replace('.', '٫');
const INV = { settled: ['تسویه‌شده', 'green'], partially_paid: ['پرداخت ناقص', 'orange'], unpaid: ['پرداخت‌نشده', 'red'] };
INV.paid = INV.settled; INV.partial = INV.partially_paid; INV.issued = INV.unpaid;
const invBadge = (st) => { const [l, c] = INV[st] || [st || '—', '']; return `<span class="badge ${c}">${esc(l)}</span>`; };
// تصویر صفحه کتاب هوش؛ سرور فقط به معلم و مدیر همان کانون می‌دهد
const bookPageUrl = (bookId, page) => `/api/exam-books/${encodeURIComponent(bookId)}/pages/${Number(page)}`;
const FEE_TYPES = { tuition: 'شهریه', membership: 'حق عضویت', camp: 'اردو', book: 'کتاب' };

// ---------- جدول‌های مشترک (دانش‌آموز، ولی، مدیر) ----------
export const scoresTable = (rows, { teacher = true, student = false } = {}) => rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${student ? '<th>دانش‌آموز</th>' : ''}<th>درس</th><th>عنوان</th><th>نمره از ۲۰</th>${teacher ? '<th>معلم</th>' : ''}<th>تاریخ</th></tr></thead><tbody>${rows.map((m) => `<tr>${student ? `<td>${esc(m.student_name)}</td>` : ''}<td>${esc(m.subject)}</td><td>${esc(m.title)}</td><td><b class="${m.score < 10 ? 'red-t' : ''}">${score20(m.score)}</b></td>${teacher ? `<td>${esc(m.teacher_name || '')}</td>` : ''}<td class="tiny muted">${dt(m.created_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('inbox', 'نمره‌ای ثبت نشده');
export const invoicesTable = (rows, { student = false, pay = false } = {}) => rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${student ? '<th>دانش‌آموز</th>' : ''}<th>نوع</th><th>دوره</th><th>مبلغ</th><th>پرداخت‌شده</th><th>مانده</th><th>وضعیت</th>${pay ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((i) => `<tr>${student ? `<td>${esc(i.full_name)}</td>` : ''}<td>${esc(FEE_TYPES[i.fee_type] || i.fee_type)}</td><td>${esc(i.period)}</td><td>${money(i.amount)}</td><td>${money(i.paid)}</td><td><b>${money(i.remaining)}</b></td><td>${invBadge(i.status)}</td>${pay ? `<td>${i.remaining > 0 ? `<button class="btn sm" data-payinv="${i.id}" data-rem="${i.remaining}">پرداخت</button>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty('receipt', 'فاکتوری صادر نشده');
export const barpaList = (rows, { student = false } = {}) => rows.length ? `<div class="list">${rows.map((r) => `<a class="list-item" href="#/barpa/${r.id}"><span class="ib sun">${icon('trophy', { size: 18 })}</span><div class="grow"><b>${esc(r.exam_title)}</b><div class="tiny muted">${student ? `${esc(r.student_name || '')} · ` : ''}تراز ${nv(r.overall_traz)} · رتبه کانون ${nv(r.overall_rank_center)} · رتبه کشوری ${nv(r.overall_rank_all)}</div></div><span class="badge green">${pv(r.overall_percentage)}</span></a>`).join('')}</div>` : empty('trophy', 'کارنامه‌ای صادر نشده');

// ---------- کارنامه تفصیلی آزمون جامع (مشترک همه نقش‌ها) ----------
const COLS = { name: 'درس', title: 'درس', subject: 'درس', percentage: 'درصد', percent: 'درصد', traz: 'تراز', rank: 'رتبه', correct: 'درست', wrong: 'غلط', unanswered: 'نزده', blank: 'نزده', total: 'تعداد' };
function objTable(rows) {
  if (!rows?.length || typeof rows[0] !== 'object') return '';
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => rows.every((r) => r[k] == null || typeof r[k] !== 'object')).slice(0, 8);
  return `<div class="table-wrap"><table class="table"><thead><tr>${keys.map((k) => `<th>${esc(COLS[k] || k)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${typeof r[k] === 'number' ? num(r[k]) : esc(r[k] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export async function barpaDetail(el, p) {
  const r = await api(`/api/barpa-exams/reports/${p.id}`);
  setHead(`کارنامه «${esc(r.exam_title)}»`, `${esc(r.student_name)} · کد داوطلبی: ${esc(r.candidate_code || '—')}`, '<button class="btn soft sm" id="printReportBtn">چاپ کارنامه</button>');

  const stat = (l, v, sub = '', color = '') => `
    <div class="card" style="text-align:center;padding:14px;border-top:3px solid ${color || '#2563eb'}">
      <div class="muted small">${l}</div>
      <div style="font-size:24px;font-weight:900;margin-top:4px">${v}</div>
      ${sub ? `<div class="tiny muted" style="margin-top:2px">${sub}</div>` : ''}
    </div>`;

  const subjects = r.subjects || [];
  const categories = r.categories || [];
  const answers = r.answers || [];

  const answersHtml = answers.length ? `
    <div class="card" style="margin-top:16px" id="barpaBubbleSection">
      <div class="row between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <div>
          <div class="card-title" style="margin-bottom:2px">پاسخ‌برگ ۱۲۰ تایی دیجیتال آزمون</div>
          <div class="tiny muted">تحلیل برداری گزینه‌های انتخاب‌شده توسط داوطلب و وضعیت کلید پاسخ‌ها</div>
        </div>
        <div class="seg" id="ansFilters" style="display:flex;gap:4px">
          <button class="btn sm active" data-filter="all" type="button">همه (${num(answers.length)})</button>
          <button class="btn sm soft" data-filter="correct" type="button" style="color:#059669">درست‌ها (${nv(r.overall_correct)})</button>
          <button class="btn sm soft" data-filter="wrong" type="button" style="color:#dc2626">نادرست‌ها (${nv(r.overall_wrong)})</button>
          <button class="btn sm soft" data-filter="unanswered" type="button" style="color:#64748b">نزده‌ها (${nv(r.overall_unanswered)})</button>
        </div>
      </div>
      <div class="bubble-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(110px, 1fr));gap:8px" id="ansGrid">
        ${answers.map((a) => {
          const isCorrect = a.status === 'correct';
          const isWrong = a.status === 'wrong';
          const bg = isCorrect ? '#ecfdf5' : (isWrong ? '#fef2f2' : '#f8fafc');
          const border = isCorrect ? '#6ee7b7' : (isWrong ? '#fca5a5' : '#e2e8f0');
          const textCol = isCorrect ? '#065f46' : (isWrong ? '#991b1b' : '#64748b');
          const badgeBg = isCorrect ? '#059669' : (isWrong ? '#dc2626' : '#cbd5e1');
          const badgeText = isCorrect || isWrong ? '#ffffff' : '#334155';
          const iconSymbol = isCorrect ? '✓' : (isWrong ? '✗' : '—');
          return `
            <div class="ans-bubble" data-status="${a.status}" style="background:${bg};border:1px solid ${border};border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:${textCol}">
              <span style="font-weight:700;color:#64748b">#${num(a.q)}</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${a.choice > 0 ? `<span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:6px;background:${badgeBg};color:${badgeText};font-weight:900;font-size:11px">${num(a.choice)}</span>` : '<span style="font-size:10px;color:#94a3b8">نزده</span>'}
                <span style="font-weight:900;font-size:13px">${iconSymbol}</span>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>` : '';

  el.innerHTML = `
    <!-- Header Banner -->
    <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg, #0f3d91 0%, #1e40af 50%, #031b4e 100%);color:#fff;padding:20px;border-radius:16px">
      <div class="row between" style="flex-wrap:wrap;gap:12px">
        <div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <span class="badge yellow" style="font-weight:900">کارنامه رسمی آزمون جامع</span>
            <span class="badge" style="background:rgba(255,255,255,0.2);color:#fff">${esc(r.grade || 'پایه نهم')}</span>
            <span class="badge" style="background:rgba(255,255,255,0.2);color:#fff">${nv(r.total_attendees)} داوطلب</span>
          </div>
          <div style="font-size:22px;font-weight:900">${esc(r.exam_title)}</div>
          <div class="row" style="gap:16px;margin-top:10px;font-size:13px;color:rgba(255,255,255,0.85);flex-wrap:wrap">
            <span>دانش‌آموز: <b style="color:#fff">${esc(r.student_name)}</b></span>
            <span>کد داوطلبی: <b style="color:#fff">${esc(r.candidate_code || '—')}</b></span>
            <span>مدرسه: <b style="color:#fff">${esc(r.school_name || '—')}</b></span>
          </div>
        </div>
        <button class="btn" id="printReportInnerBtn" type="button" style="background:#f59e0b;color:#0f172a;font-weight:900;align-self:flex-start">
          ${icon('printer', { size: 16 })} چاپ کارنامه
        </button>
      </div>
    </div>

    <!-- 4 Key KPI Cards -->
    <div class="grid c4" style="margin-bottom:16px">
      ${stat('تراز کل داوطلب', nv(r.overall_traz), 'شاخص هم‌ترازی نمرات', '#2563eb')}
      ${stat('رتبه در کانون', nv(r.overall_rank_center), 'بین دانش‌آموزان مرکز', '#059669')}
      ${stat('رتبه کل کشوری', nv(r.overall_rank_all), r.total_attendees ? `از بین ${num(r.total_attendees)} داوطلب` : '', '#d97706')}
      ${stat('درصد کل آزمون', pv(r.overall_percentage), `${nv(r.overall_correct)} درست از ${nv(r.total_questions)}`, '#7c3aed')}
    </div>

    <!-- 4 Breakdown Metric Cards -->
    <div class="grid c4" style="margin-bottom:16px">
      ${stat('تعداد درست', nv(r.overall_correct), 'امتیاز مثبت', '#059669')}
      ${stat('تعداد نادرست', nv(r.overall_wrong), 'نمره منفی', '#dc2626')}
      ${stat('تعداد بدون پاسخ', nv(r.overall_unanswered), 'بدون اثر', '#64748b')}
      ${stat('کل سؤال‌ها', nv(r.total_questions), '', '#3b82f6')}
    </div>

    <!-- Subject Breakdown Table -->
    ${subjects.length ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">تحلیل نتایج به تفکیک دروس آزمون</div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>نام درس</th>
                <th>تعداد سؤال</th>
                <th>درست</th>
                <th>غلط</th>
                <th>نزده</th>
                <th>درصد پاسخگویی</th>
                <th>تراز</th>
                <th>رتبه مرکز</th>
                <th>رتبه کشوری</th>
              </tr>
            </thead>
            <tbody>
              ${subjects.map((s) => `
                <tr>
                  <td class="bold">${esc(s.name || s.subject)}</td>
                  <td>${num(s.count || s.total || 0)}</td>
                  <td style="color:#059669;font-weight:700">${num(s.correct || 0)}</td>
                  <td style="color:#dc2626;font-weight:700">${num(s.wrong || 0)}</td>
                  <td class="muted">${num(s.unanswered || s.blank || 0)}</td>
                  <td>
                    <span class="badge ${s.percentage >= 50 ? 'green' : (s.percentage >= 25 ? 'blue' : 'orange')}">
                      ${pct(s.percentage)}
                    </span>
                  </td>
                  <td class="bold">${num(s.traz || 0)}</td>
                  <td>${num(s.rank_center || s.rank || '—')}</td>
                  <td>${num(s.rank_all || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

    <!-- Categories Breakdown -->
    ${categories.length ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">تحلیل موضوعی دسته‌ها (عمومی، اختصاصی، استعداد تحلیلی)</div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>دسته</th>
                <th>تعداد</th>
                <th>درست</th>
                <th>غلط</th>
                <th>نزده</th>
                <th>درصد</th>
                <th>تراز</th>
                <th>رتبه کشوری</th>
              </tr>
            </thead>
            <tbody>
              ${categories.map((c) => `
                <tr>
                  <td class="bold">${esc(c.label || c.name)}</td>
                  <td>${num(c.count || 0)}</td>
                  <td style="color:#059669;font-weight:700">${num(c.correct || 0)}</td>
                  <td style="color:#dc2626;font-weight:700">${num(c.wrong || 0)}</td>
                  <td class="muted">${num(c.unanswered || 0)}</td>
                  <td><span class="badge ${c.percentage >= 40 ? 'green' : 'blue'}">${pct(c.percentage)}</span></td>
                  <td class="bold">${num(c.traz || 0)}</td>
                  <td>${num(c.rank_all || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

    <!-- 120-bubble Digital Answer Sheet -->
    ${answersHtml}
  `;

  const doPrint = () => window.print();
  $('#printReportBtn', el)?.addEventListener('click', doPrint);
  $('#printReportInnerBtn', el)?.addEventListener('click', doPrint);

  // Bubble filter interactivity
  const filterBtns = $$('#ansFilters button', el);
  const bubbles = $$('.ans-bubble', el);
  filterBtns.forEach((btn) => {
    btn.onclick = () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      bubbles.forEach((b) => {
        b.style.display = (filter === 'all' || b.dataset.status === filter) ? 'flex' : 'none';
      });
    };
  });
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
  if (!c?.id) { el.innerHTML = empty('user', 'هنوز مشاوری برای کانون تعیین نشده است'); return; }
  el.innerHTML = `<div class="card" style="margin-bottom:12px"><div class="row" style="gap:12px"><span class="ib green">${icon('user', { size: 22 })}</span><div class="grow"><b>${esc(c.full_name)}</b><div class="small muted">${esc(c.title)}</div><div class="tiny muted">${esc(c.bio)}</div></div></div></div>
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

// ================= دانش‌آموز: نمرات، فاکتورها، کارنامه برپا =================
export async function records(el) {
  setHead('نمرات و فاکتورها', 'نمره‌های مستمر کلاس، فاکتورهای دوره‌ای و کارنامه‌های آزمون جامع');
  const [s, i, b, fee] = await Promise.all([api('/api/student/manual-scores'), api('/api/student/invoices'), api('/api/barpa-exams/reports'), api('/api/student/payment').catch(() => null)]);
  el.innerHTML = `<section class="card" style="margin-bottom:16px"><div class="card-title">نمرات مستمر کلاسی</div>${scoresTable(s)}</section>
  <section class="card" style="margin-bottom:16px"><div class="card-title">فاکتورهای دوره‌ای</div>${invoicesTable(i, { pay: true })}</section>
  <section class="card"><div class="card-title">کارنامه آزمون جامع برپا</div>${barpaList(b)}</section>`;
  on(el, 'click', '[data-payinv]', (e, btn) => modal({
    title: 'پرداخت فاکتور',
    body: `<p class="small" style="margin-top:0">مبلغ مانده: <b>${money(Number(btn.dataset.rem))}</b>${fee?.card_number ? `<br>شماره کارت: <b dir="ltr">${esc(fee.card_number)}</b> به نام ${esc(fee.card_holder || '')}` : ''}</p>
      <p class="tiny muted">پس از واریز، تصویر رسید را بارگذاری کنید. فاکتور پس از تأیید مدیر کانون تسویه می‌شود.</p>
      <div class="field"><label for="invRc">تصویر رسید</label><input class="input" type="file" id="invRc" accept="image/png,image/jpeg,image/webp" required></div>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ارسال رسید', onClick: async (m) => {
      const f = m.querySelector('#invRc').files[0];
      if (!f) { toast('تصویر رسید را انتخاب کنید'); return false; }
      await post('/api/student/payment', { invoice_id: Number(btn.dataset.payinv), file: await fileToData(f) });
      toast('رسید ارسال شد و در صف بررسی مدیر است', 'ok');
      records(el);
    } }],
  }));
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
  setHead('کارنامه‌های آزمون جامع برپا', 'صدور دستی یا تفکیک خودکار کارنامه با آپلود PDF نتایج');
  const [rows, studs] = await Promise.all([api('/api/barpa-exams/reports'), api('/api/manager/students?limit=500')]);
  const f = (id, l, extra = '') => `<div class="field"><label for="${id}">${l}</label><input class="input" id="${id}" name="${id}" type="number" step="any" inputmode="decimal" required ${extra}></div>`;

  el.innerHTML = `
    <!-- PDF Auto-Split Upload Card -->
    <section class="card" style="margin-bottom:16px;background:linear-gradient(135deg, #f0f7ff 0%, #e6efff 100%);border:1.5px dashed #2563eb;padding:18px">
      <div class="row between" style="flex-wrap:wrap;gap:12px;align-items:center">
        <div>
          <div style="font-weight:900;font-size:16px;color:#1e40af;display:flex;align-items:center;gap:8px">
            <span class="ib blue">${icon('upload', { size: 20 })}</span>
            <span>آپلود و تفکیک خودکار کارنامه آزمون جامع برپا (PDF)</span>
          </div>
          <div class="small" style="margin-top:4px;color:#3b82f6;max-width:700px;line-height:1.6">
            فایل PDF چندصفحه‌ای نتایج آزمون برپا را بارگذاری کنید. سیستم با هوش مصنوعی و PyMuPDF به صورت خودکار کارنامه هر دانش‌آموز را تفکیک، اطلاعات دروس، تراز و پاسخ‌برگ ۱۲۰ تایی را استخراج و برای هر داوطلب در پنل ثبت می‌کند.
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="file" id="barpaPdfInput" accept=".pdf" style="display:none">
          <button class="btn soft" id="barpaPickBtn" type="button" style="background:#fff">
            ${icon('file-text', { size: 16 })} انتخاب فایل PDF نتایج
          </button>
          <button class="btn" id="barpaStartUploadBtn" type="button" disabled style="background:#2563eb;color:#fff;font-weight:900">
            ${icon('upload', { size: 16 })} شروع تفکیک و ثبت در پنل‌ها
          </button>
        </div>
      </div>
      <div class="row wrap" style="gap:10px;margin-top:12px">
        <div class="field" style="flex:2 1 220px"><label for="bpUpTitle">عنوان آزمون</label><input class="input" id="bpUpTitle" maxlength="120" placeholder="مثلاً مرحله اول برپا"></div>
        <div class="field" style="flex:1 1 120px"><label for="bpUpGrade">پایه</label><select class="input" id="bpUpGrade">${['چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم'].map((g) => `<option${g === 'نهم' ? ' selected' : ''}>${g}</option>`).join('')}</select></div>
        <div class="field" style="flex:1 1 100px"><label for="bpUpStage">مرحله</label><input class="input" id="bpUpStage" type="number" min="1" max="20" inputmode="numeric"></div>
      </div>
      <div class="tiny muted" style="margin-top:6px">کارنامه‌ها فقط با کد ملی یا نام کاربری دانش‌آموز تطبیق داده می‌شوند و حساب جدیدی ساخته نمی‌شود.</div>
      <div id="barpaUploadStatus" class="small bold" style="margin-top:10px;display:none;color:#1e40af"></div>
    </section>

    <div class="grid c3">
      <form id="bpForm" class="card" aria-label="ثبت دستی کارنامه">
        <div class="card-title">ثبت دستی تک‌کارنامه</div>
        <div class="stack">
          <div class="field">
            <label for="bpSt">دانش‌آموز</label>
            <select class="input" id="bpSt" required>
              <option value="">انتخاب کنید</option>
              ${(studs.rows || studs).map((s) => `<option value="${s.id}">${esc(s.full_name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="bpTi">عنوان آزمون</label>
            <input class="input" id="bpTi" value="آزمون جامع طرح برپا" required maxlength="120">
          </div>
          ${f('overall_traz', 'تراز کل')}
          ${f('overall_rank_all', 'رتبه کشوری')}
          ${f('overall_rank_center', 'رتبه در کانون')}
          ${f('total_attendees', 'تعداد شرکت‌کنندگان کشوری')}
          ${f('overall_percentage', 'درصد کل', 'min="0" max="100"')}
          ${f('overall_correct', 'تعداد درست')}
          ${f('overall_wrong', 'تعداد غلط')}
          ${f('overall_unanswered', 'تعداد نزده')}
          ${f('total_questions', 'کل سؤال‌ها')}
          <div class="tiny muted">همه‌ی مقدارها را از کارنامه‌ی رسمی وارد کنید؛ فیلد خالی ثبت نمی‌شود.</div>
          <button class="btn" type="submit">ثبت و صدور دستی</button>
        </div>
      </form>

      <section class="card span2">
        <div class="card-title">کارنامه‌های صادرشده آزمون جامع (${num(rows.length)})</div>
        ${barpaList(rows, { student: true })}
      </section>
    </div>
  `;

  // PDF Upload Handlers
  const fileInput = $('#barpaPdfInput', el);
  const pickBtn = $('#barpaPickBtn', el);
  const uploadBtn = $('#barpaStartUploadBtn', el);
  const statusDiv = $('#barpaUploadStatus', el);
  let selectedFile = null;

  pickBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files[0]) {
      selectedFile = fileInput.files[0];
      statusDiv.style.display = 'block';
      statusDiv.textContent = `فایل انتخاب‌شده: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} کیلوبایت)`;
      uploadBtn.disabled = false;
    }
  };

  uploadBtn.onclick = () => busy(uploadBtn, async () => {
    if (!selectedFile) return;
    statusDiv.textContent = 'در حال ارسال و تفکیک خودکار صفحات کارنامه با موتور پایتون... لطفاً شکیبا باشید.';
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result;
        const res = await post('/api/manager/barpa-exams/upload', {
          file: { data: dataUrl, name: selectedFile.name },
          exam_title: $('#bpUpTitle', el).value.trim() || undefined,
          grade: $('#bpUpGrade', el).value,
          stage: $('#bpUpStage', el).value || undefined,
        });
        toast(`${fa(res.count || 0)} کارنامه ثبت شد${res.unmatched_count ? ` · ${fa(res.unmatched_count)} مورد تطبیق داده نشد` : ''}`, res.unmatched_count ? 'error' : 'ok');
        await mgrBarpa(el);
        if (res.unmatched?.length) modal({
          title: `${fa(res.unmatched.length)} کارنامه بدون دانش‌آموز`, wide: true,
          body: `<p class="small" style="margin-top:0">این داوطلب‌ها با کد ملی یا نام کاربری هیچ دانش‌آموزی در کانون تطبیق داده نشدند و ثبت نشدند. کد ملی دانش‌آموز را در پرونده‌اش اصلاح کنید و فایل را دوباره بارگذاری کنید.</p>
            <div class="table-wrap"><table class="table"><thead><tr><th>صفحه</th><th>نام در کارنامه</th><th>کد داوطلبی</th><th>مدرسه</th></tr></thead><tbody>${res.unmatched.map((u) => `<tr><td>${fa(u.page ?? '—')}</td><td>${esc(u.full_name || '—')}</td><td dir="ltr">${esc(u.candidate_code || '—')}</td><td>${esc(u.school_name || '—')}</td></tr>`).join('')}</tbody></table></div>`,
          actions: [{ label: 'متوجه شدم', value: true }],
        });
      } catch (err) {
        statusDiv.textContent = `خطا در پردازش: ${err.message}`;
        toast(`خطا در پردازش فایل: ${err.message}`, 'error');
      }
    };
    reader.readAsDataURL(selectedFile);
  });

  // Manual Form Submit Handler
  $('#bpForm', el).onsubmit = (e) => {
    e.preventDefault();
    const g = e.target;
    busy(e.submitter, async () => {
      const rec = { student_id: Number($('#bpSt', g).value) };
      for (const k of ['overall_traz', 'overall_rank_all', 'overall_rank_center', 'total_attendees', 'overall_percentage', 'overall_correct', 'overall_wrong', 'overall_unanswered', 'total_questions']) {
        rec[k] = Number(g[k].value);
      }
      await post('/api/manager/barpa-exams/reports', { exam_title: $('#bpTi', g).value, grade: 'نهم', records: [rec] });
      toast('کارنامه ثبت شد', 'ok');
      mgrBarpa(el);
    });
  };
}

// ================= استودیوی جامع طرح آزمون هوش و استعداد تحلیلی =================
if (!window._examBasket) window._examBasket = [];

export async function hooshStudio(el) {
  setHead('استودیوی طرح آزمون هوش و استعداد تحلیلی', 'طراحی دفترچه آزمون چاپی A4، صدور پاسخ‌برگ ۴ گزینه‌ای و انتشار آزمون آنلاین');

  const books = await api('/api/exam-books');
  let activeBookId = books[0]?.id || 'hoosh_6';
  let activeBook = books.find((b) => b.id === activeBookId) || books[0];
  let topics = await api(`/api/exam-books/${activeBookId}/topics`);
  let activeTopic = topics[0] || null;
  let activeSection = 'all';
  let activeChapter = 'all';
  let searchWord = '';

  const examConfig = {
    title: 'آزمون هوش و استعداد تحلیلی',
    grade: activeBook?.grade || 'ششم',
    duration: 45,
    hasNegativeScore: true,
    teacher: 'استاد کانون نخبه‌پروری',
    date: jdate(new Date())
  };

  function renderStudio() {
    const sections = [...new Set(topics.map((t) => t.sectionTitle || 'سایر'))];
    const availableChapters = [...new Set(
      topics.filter((t) => activeSection === 'all' || t.sectionTitle === activeSection)
            .map((t) => t.chapterTitle || 'سایر')
    )];

    const filteredTopics = topics.filter((t) => {
      if (activeSection !== 'all' && t.sectionTitle !== activeSection) return false;
      if (activeChapter !== 'all' && t.chapterTitle !== activeChapter) return false;
      if (searchWord && !t.title.includes(searchWord) && !(t.chapterTitle || '').includes(searchWord)) return false;
      return true;
    });

    if (!activeTopic || !filteredTopics.includes(activeTopic)) {
      activeTopic = filteredTopics[0] || null;
    }

    const basket = window._examBasket;

    el.innerHTML = `
      <!-- Studio Header / Top Control Bar -->
      <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);color:#fff;padding:20px;border-radius:16px">
        <div class="row between" style="flex-wrap:wrap;gap:12px;align-items:center">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span class="badge yellow" style="font-weight:900">میز کار تخصصی معلمان کانون</span>
              <span class="badge" style="background:rgba(255,255,255,0.15);color:#fff">${esc(activeBook?.title || 'هوش کمپلکس')}</span>
            </div>
            <div style="font-size:20px;font-weight:900">میز کار هوشمند طراحی و چاپ آزمون تیزهوشان</div>
            <div class="small" style="color:#94a3b8;margin-top:4px">
              انتخاب مباحث از کتب هوش کمپلکس، گزینش برگه‌های استاندارد سؤال، پیش‌نمایش چاپ A4 با سربرگ رسمی کانون و انتشار آزمون آنلاین.
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="openPrintBookletBtn" type="button" style="background:#2563eb;color:#fff;font-weight:900" ${basket.length === 0 ? 'disabled' : ''}>
              ${icon('printer', { size: 16 })} چاپ دفترچه آزمون (${num(basket.length)} برگه)
            </button>
            <button class="btn soft" id="openPrintAnswerSheetBtn" type="button" style="background:#fff;color:#0f172a;font-weight:900">
              ${icon('file-check', { size: 16 })} چاپ پاسخ‌برگ ۴ گزینه‌ای
            </button>
            <button class="btn soft" id="openAiPromptBtn" type="button" style="background:#f59e0b;color:#0f172a;font-weight:900">
              ${icon('sparkles', { size: 16 })} پرامپت هوش مصنوعی
            </button>
          </div>
        </div>

        <!-- Book Selection Pills -->
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="small bold" style="color:#cbd5e1">کتاب منبع:</span>
          ${books.map((b) => `
            <button class="btn sm ${b.id === activeBookId ? '' : 'soft'}" data-book="${b.id}" type="button" style="${b.id === activeBookId ? 'background:#f59e0b;color:#0f172a;font-weight:900' : 'background:rgba(255,255,255,0.1);color:#fff'}">
              ${esc(b.title)} (${esc(b.grade)})
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Studio 2-Column Layout -->
      <div class="grid c3" style="gap:16px">
        
        <!-- Left Column: Topics Syllabus & Filters -->
        <div class="card" style="height:fit-content">
          <div class="card-title" style="margin-bottom:12px">فهرست مباحث کتاب (${num(filteredTopics.length)} مبحث)</div>
          
          <div class="stack" style="gap:8px;margin-bottom:12px">
            <input class="input" id="topicSearchInput" placeholder="جستجوی عنوان مبحث..." value="${esc(searchWord)}" style="font-size:12px">
            
            <div class="row" style="gap:6px">
              <select class="input" id="sectionSelect" style="font-size:12px">
                <option value="all">همه بخش‌ها</option>
                ${sections.map((s) => `<option value="${esc(s)}" ${activeSection === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
              </select>
              <select class="input" id="chapterSelect" style="font-size:12px">
                <option value="all">همه فصل‌ها</option>
                ${availableChapters.map((c) => `<option value="${esc(c)}" ${activeChapter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Topics List -->
          <div class="list" style="max-height:550px;overflow-y:auto;padding-left:4px" id="topicsContainer">
            ${filteredTopics.length ? filteredTopics.map((t) => {
              const isSelected = activeTopic && activeTopic.id === t.id;
              return `
                <div class="list-item topic-item" data-id="${t.id}" style="cursor:pointer;background:${isSelected ? '#eff6ff' : ''};border:1px solid ${isSelected ? '#3b82f6' : 'transparent'};border-radius:8px;padding:8px 10px;margin-bottom:4px">
                  <div class="grow">
                    <div style="font-weight:${isSelected ? '900' : '700'};font-size:12px;color:${isSelected ? '#1d4ed8' : 'inherit'}">
                      ${num(t.id)}. ${esc(t.title)}
                    </div>
                    <div class="tiny muted" style="margin-top:2px">
                      ${esc(t.sectionTitle || '')} › ${esc(t.chapterTitle || '')}
                    </div>
                  </div>
                  <span class="badge sm" style="background:#f1f5f9;color:#475569">${num(t.pageCount || 2)} برگه</span>
                </div>
              `;
            }).join('') : empty('book', 'مبحثی یافت نشد')}
          </div>
        </div>

        <!-- Right Column: Question Pages Slide Preview & Exam Basket -->
        <div class="span2 stack" style="gap:16px">
          
          <!-- Active Topic Header Card -->
          ${activeTopic ? `
            <div class="card">
              <div class="row between" style="flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
                <div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span class="badge blue">مبحث ${num(activeTopic.id)}</span>
                    <span class="tiny muted">${esc(activeTopic.sectionTitle || '')} › ${esc(activeTopic.chapterTitle || '')}</span>
                  </div>
                  <div style="font-size:18px;font-weight:900;color:#0f172a;margin-top:4px">${esc(activeTopic.title)}</div>
                  <div class="tiny muted" style="margin-top:2px">
                    برگه‌های منبع: صفحه ${num(activeTopic.bookStartPage || activeTopic.pdfStartPage)} تا ${num(activeTopic.bookEndPage || activeTopic.pdfEndPage)} کتاب
                  </div>
                </div>

                <div style="display:flex;gap:6px">
                  <button class="btn sm soft" id="addAllTopicPagesBtn" type="button">
                    ${icon('plus', { size: 14 })} افزودن همه برگه‌های این مبحث به سبد
                  </button>
                </div>
              </div>

              <!-- Question Pages Grid Preview -->
              <div class="grid c2" style="gap:16px" id="pagesPreviewGrid">
                ${Array.from({ length: (activeTopic.pdfEndPage - activeTopic.pdfStartPage + 1) || 1 }).map((_, idx) => {
                  const pageNum = (activeTopic.pdfStartPage || 1) + idx;
                  const imgUrl = bookPageUrl(activeBookId, pageNum);
                  const inBasket = basket.some((b) => b.bookId === activeBookId && b.pageNum === pageNum);

                  return `
                    <div class="card" style="padding:10px;border:1.5px solid ${inBasket ? '#2563eb' : 'var(--border)'};background:${inBasket ? '#f8faff' : '#fff'};border-radius:12px">
                      <div class="row between" style="margin-bottom:8px;align-items:center">
                        <span class="small bold">برگه شماره ${num(pageNum)}</span>
                        <button class="btn sm ${inBasket ? 'soft' : ''}" data-page="${pageNum}" data-toggle-page style="${inBasket ? 'color:#dc2626;border-color:#fca5a5' : 'background:#2563eb;color:#fff'}">
                          ${inBasket ? 'حذف از سبد' : '+ افزودن به آزمون'}
                        </button>
                      </div>
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;height:380px;display:flex;align-items:center;justify-content:center;cursor:pointer" data-zoom-img="${imgUrl}">
                        <img src="${imgUrl}" alt="صفحه ${pageNum}" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.src='/img/placeholder.png';this.alt='تصویر در دسترس نیست';" />
                      </div>
                      <div class="row between tiny muted" style="margin-top:8px">
                        <span>کیفیت اسکن: استاندارد ۳۰۰DPI</span>
                        <span style="color:#2563eb;font-weight:700;cursor:pointer" data-zoom-img="${imgUrl}">بزرگ‌نمایی</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Exam Basket & Settings Drawer -->
          <div class="card" style="border:1.5px solid #2563eb">
            <div class="card-title row between" style="align-items:center">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="ib blue">${icon('clipboard', { size: 18 })}</span>
                <span>سبد برگه‌های آزمون انتخابی (${num(basket.length)} برگه انتخاب‌شده)</span>
              </div>
              ${basket.length ? `<button class="btn sm soft" id="clearBasketBtn" style="color:#dc2626">خالی‌کردن سبد</button>` : ''}
            </div>

            ${basket.length ? `
              <!-- Basket Items Chips -->
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:10px;background:#f8fafc;border-radius:8px">
                ${basket.map((item, idx) => `
                  <div style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:4px 8px;font-size:11px">
                    <span style="font-weight:700">برگه ${num(item.pageNum)}</span>
                    <span class="tiny muted">(${esc(item.topicTitle)})</span>
                    <button class="icon-btn" data-remove-basket="${idx}" style="cursor:pointer;color:#dc2626;border:0;background:none;padding:0;margin-right:4px">✕</button>
                  </div>
                `).join('')}
              </div>

              <!-- Exam Configuration Fields -->
              <div class="grid c3" style="gap:10px;margin-bottom:16px">
                <div class="field">
                  <label class="tiny muted">عنوان آزمون</label>
                  <input class="input" id="cfgTitle" value="${esc(examConfig.title)}" style="font-size:12px">
                </div>
                <div class="field">
                  <label class="tiny muted">پایه تحصیلی</label>
                  <input class="input" id="cfgGrade" value="${esc(examConfig.grade)}" style="font-size:12px">
                </div>
                <div class="field">
                  <label class="tiny muted">مدت پاسخگویی (دقیقه)</label>
                  <input class="input" id="cfgDuration" type="number" value="${examConfig.duration}" style="font-size:12px">
                </div>
              </div>

              <div class="row between" style="flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid var(--border)">
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
                  <input type="checkbox" id="cfgNegative" ${examConfig.hasNegativeScore ? 'checked' : ''}> نمره منفی لحاظ شود (یک سوم غلط)
                </label>

                <div style="display:flex;gap:8px">
                  <button class="btn" id="basketPrintBtn" type="button" style="background:#2563eb;color:#fff;font-weight:900">
                    ${icon('printer', { size: 16 })} پیش‌نمایش و چاپ آزمون (A4)
                  </button>
                </div>
              </div>
            ` : `
              <div style="text-align:center;padding:24px 0" class="muted small">
                هنوز برگه‌ای به سبد آزمون اضافه نشده است. از مباحث سمت راست، برگه‌های سوال مورد نظر را انتخاب و دکمه «+ افزودن به آزمون» را بزنید.
              </div>
            `}
          </div>

        </div>
      </div>
    `;

    bindStudioEvents();
  }

  function bindStudioEvents() {
    // Book selection
    $$('button[data-book]', el).forEach((b) => {
      b.onclick = async () => {
        activeBookId = b.dataset.book;
        activeBook = books.find((x) => x.id === activeBookId) || books[0];
        examConfig.grade = activeBook?.grade || 'ششم';
        topics = await api(`/api/exam-books/${activeBookId}/topics`);
        activeTopic = topics[0] || null;
        activeSection = 'all';
        activeChapter = 'all';
        renderStudio();
      };
    });

    // Topic search and filters
    const searchInput = $('#topicSearchInput', el);
    if (searchInput) {
      searchInput.oninput = () => {
        searchWord = searchInput.value.trim();
        renderStudio();
      };
    }

    const secSel = $('#sectionSelect', el);
    if (secSel) {
      secSel.onchange = () => {
        activeSection = secSel.value;
        activeChapter = 'all';
        renderStudio();
      };
    }

    const chpSel = $('#chapterSelect', el);
    if (chpSel) {
      chpSel.onchange = () => {
        activeChapter = chpSel.value;
        renderStudio();
      };
    }

    // Select topic
    $$('.topic-item', el).forEach((ti) => {
      ti.onclick = () => {
        const tid = Number(ti.dataset.id);
        activeTopic = topics.find((t) => t.id === tid) || null;
        renderStudio();
      };
    });

    // Toggle page in basket
    $$('button[data-toggle-page]', el).forEach((btn) => {
      btn.onclick = () => {
        const pageNum = Number(btn.dataset.page);
        const idx = window._examBasket.findIndex((b) => b.bookId === activeBookId && b.pageNum === pageNum);
        if (idx !== -1) {
          window._examBasket.splice(idx, 1);
        } else {
          const imgUrl = bookPageUrl(activeBookId, pageNum);
          window._examBasket.push({
            bookId: activeBookId,
            bookTitle: activeBook?.title || 'هوش کمپلکس',
            topicId: activeTopic?.id || 1,
            topicTitle: activeTopic?.title || 'مبحث هوش',
            pageNum,
            imageUrl: imgUrl
          });
        }
        renderStudio();
      };
    });

    // Add all pages of active topic
    const addAllBtn = $('#addAllTopicPagesBtn', el);
    if (addAllBtn && activeTopic) {
      addAllBtn.onclick = () => {
        const start = activeTopic.pdfStartPage || 1;
        const end = activeTopic.pdfEndPage || start;
        for (let p = start; p <= end; p++) {
          if (!window._examBasket.some((b) => b.bookId === activeBookId && b.pageNum === p)) {
            const imgUrl = bookPageUrl(activeBookId, p);
            window._examBasket.push({
              bookId: activeBookId,
              bookTitle: activeBook?.title || 'هوش کمپلکس',
              topicId: activeTopic.id,
              topicTitle: activeTopic.title,
              pageNum: p,
              imageUrl: imgUrl
            });
          }
        }
        toast(`همه برگه‌های مبحث «${activeTopic.title}» به سبد اضافه شد`, 'ok');
        renderStudio();
      };
    }

    // Remove single basket item
    $$('button[data-remove-basket]', el).forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.removeBasket);
        window._examBasket.splice(idx, 1);
        renderStudio();
      };
    });

    // Clear basket
    const clearBtn = $('#clearBasketBtn', el);
    if (clearBtn) {
      clearBtn.onclick = () => {
        window._examBasket = [];
        renderStudio();
      };
    }

    // Image Zoom Modal
    $$('[data-zoom-img]', el).forEach((item) => {
      item.onclick = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const url = item.dataset.zoomImg;
        modal({
          title: 'پیش‌نمایش باکیفیت برگه سؤال',
          wide: true,
          body: `<div style="text-align:center"><img src="${url}" style="max-width:100%;max-height:80vh;object-fit:contain;border:1px solid #cbd5e1;border-radius:8px" /></div>`,
          actions: [{ label: 'بستن', onClick: () => {} }]
        });
      };
    });

    // Config updates
    const tInput = $('#cfgTitle', el);
    if (tInput) tInput.onchange = () => { examConfig.title = tInput.value.trim(); };
    const gInput = $('#cfgGrade', el);
    if (gInput) gInput.onchange = () => { examConfig.grade = gInput.value.trim(); };
    const dInput = $('#cfgDuration', el);
    if (dInput) dInput.onchange = () => { examConfig.duration = Number(dInput.value) || 45; };
    const nInput = $('#cfgNegative', el);
    if (nInput) nInput.onchange = () => { examConfig.hasNegativeScore = nInput.checked; };

    // Print Actions
    $('#openPrintBookletBtn', el)?.addEventListener('click', () => openPrintModal('exam'));
    $('#basketPrintBtn', el)?.addEventListener('click', () => openPrintModal('exam'));
    $('#openPrintAnswerSheetBtn', el)?.addEventListener('click', () => openPrintModal('answers'));
    $('#openAiPromptBtn', el)?.addEventListener('click', openAiPromptModal);
  }

  function openPrintModal(mode) {
    const basket = window._examBasket;
    if (mode === 'exam' && !basket.length) {
      return toast('لطفاً حداقل یک برگه به سبد آزمون اضافه کنید', 'error');
    }

    const printHtml = mode === 'exam' ? `
      <div class="hoosh-print-wrap" style="background:#fff;color:#0f172a;direction:rtl">
        ${basket.map((item, index) => `
          <div class="hoosh-print-sheet" style="min-height:280mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;padding:15mm;box-sizing:border-box">
            <!-- Header -->
            <div style="border-bottom:2px solid #1e40af;padding-bottom:10px;margin-bottom:12px">
              <div style="text-align:center;font-size:13px;margin-bottom:4px">بسم الله الرحمن الرحیم</div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:40px;height:40px;border-radius:8px;background:#1e40af;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px">رشد</div>
                  <div>
                    <div style="font-size:15px;font-weight:900;color:#0f172a">کانون نخبه‌پروری دانشمند شهید دکتر سعید کاظمی آشتیانی</div>
                    <div style="font-size:10px;color:#475569">پایگاه علمی تربیتی مسجد ائمه بقیع (ع) تربت حیدریه | سامانه آزمون تیزهوشان</div>
                  </div>
                </div>
                <div style="text-align:left;font-size:11px;line-height:1.5;color:#334155">
                  <div>تاریخ آزمون: <b>${examConfig.date}</b></div>
                  <div>مدت پاسخگویی: <b>${examConfig.duration} دقیقه</b></div>
                  <div>صفحه: <b>${num(index + 1)} از ${num(basket.length)}</b></div>
                </div>
              </div>
              <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;background:#f8fafc;padding:5px 8px;border-radius:6px">
                <div style="font-weight:900;color:#1e40af">${esc(examConfig.title)} | ${esc(examConfig.grade)}</div>
                <div style="color:#475569">
                  طراح: <b>${esc(examConfig.teacher)}</b>
                  ${examConfig.hasNegativeScore ? '<span style="color:#dc2626;font-weight:700;margin-right:8px">| دارای نمره منفی</span>' : ''}
                </div>
              </div>
              ${index === 0 ? `
                <div style="margin-top:8px;display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;font-size:11px;padding:6px;border:1px dashed #cbd5e1;border-radius:6px;background:#fff">
                  <div>نام و نام خانوادگی داوطلب: ...........................</div>
                  <div>شماره داوطلبی: ...........................</div>
                  <div>نام آموزشگاه: ...........................</div>
                </div>
              ` : ''}
            </div>

            <!-- Image -->
            <div style="flex:1;display:flex;align-items:center;justify-content:center;margin:6px 0">
              <img src="${item.imageUrl}" style="max-width:100%;max-height:220mm;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px" />
            </div>

            <!-- Footer -->
            <div style="border-top:1px solid #e2e8f0;padding-top:6px;display:flex;justify-content:space-between;font-size:10px;color:#64748b">
              <div>کانون نخبه‌پروری شهید دکتر سعید کاظمی آشتیانی</div>
              <div>صفحه ${num(index + 1)} از ${num(basket.length)}</div>
              <div>سامانه آزمون تیزهوشان رشد</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="hoosh-print-wrap" style="background:#fff;color:#0f172a;direction:rtl;padding:15mm;box-sizing:border-box">
        <div style="text-align:center;font-size:13px;margin-bottom:4px">بسم الله الرحمن الرحیم</div>
        <div style="border-bottom:2px solid #1e40af;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:18px;font-weight:900;color:#0f172a">پاسخ‌برگ اختصاصی ۴ گزینه‌ای آزمون</div>
            <div style="font-size:11px;color:#475569;margin-top:2px">کانون نخبه‌پروری دانشمند شهید دکتر سعید کاظمی آشتیانی تربت حیدریه</div>
            <div style="font-size:12px;color:#1e40af;font-weight:700;margin-top:4px">${esc(examConfig.title)} - ${esc(examConfig.grade)}</div>
          </div>
          <div style="text-align:left;font-size:11px;line-height:1.5;color:#334155">
            <div>تاریخ: <b>${examConfig.date}</b></div>
            <div>مدت: <b>${examConfig.duration} دقیقه</b></div>
            <div>طراح: <b>${esc(examConfig.teacher)}</b></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;font-size:11px;padding:8px;border:2px dashed #cbd5e1;border-radius:8px;margin-bottom:16px;background:#f8fafc">
          <div>نام و نام خانوادگی: .......................................</div>
          <div>کلاس / شعبه: .......................................</div>
          <div>شماره داوطلبی: .......................................</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;font-size:11px">
          ${Array.from({ length: 4 }).map((_, col) => `
            <div style="border:1px solid #e2e8f0;border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:5px">
              <div style="display:flex;justify-content:space-between;font-weight:900;color:#475569;padding-bottom:4px;border-bottom:1px solid #e2e8f0;font-size:10px">
                <span>سؤال</span>
                <span style="display:flex;gap:6px"><span>۱</span><span>۲</span><span>۳</span><span>۴</span></span>
              </div>
              ${Array.from({ length: 15 }).map((_, row) => {
                const qNum = col * 15 + row + 1;
                return `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:1px 0">
                    <span style="font-weight:700;color:#64748b;width:20px">${num(qNum)}</span>
                    <div style="display:flex;gap:6px">
                      <span style="display:inline-block;width:13px;height:13px;border:1.5px solid #64748b;border-radius:50%"></span>
                      <span style="display:inline-block;width:13px;height:13px;border:1.5px solid #64748b;border-radius:50%"></span>
                      <span style="display:inline-block;width:13px;height:13px;border:1.5px solid #64748b;border-radius:50%"></span>
                      <span style="display:inline-block;width:13px;height:13px;border:1.5px solid #64748b;border-radius:50%"></span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:8px;margin-top:20px;display:flex;justify-content:space-between;font-size:10px;color:#64748b">
          <div>لطفاً دایره مربوط به گزینه صحیح را کاملاً با مداد سیاه نرم پررنگ نمایید.</div>
          <div>کانون شهید کاظمی آشتیانی</div>
        </div>
      </div>
    `;

    modal({
      title: mode === 'exam' ? 'پیش‌نمایش دفترچه آزمون چاپی A4' : 'پیش‌نمایش پاسخ‌برگ ۴ گزینه‌ای',
      wide: true,
      body: printHtml,
      actions: [
        { label: 'چاپ مستقیم (یا ذخیره PDF)', primary: true, onClick: () => window.print() },
        { label: 'بستن', onClick: () => {} }
      ]
    });
  }

  function openAiPromptModal() {
    const topicTitle = activeTopic?.title || 'هوش و استعداد تحلیلی';
    const promptText = `System Prompt:
شما طراح ارشد آزمون‌های تیزهوشان و سمپاد در زمینه هوش و استعداد تحلیلی هستید.
وظیفه شما طراحی سوالات استاندارد ۴ گزینه‌ای از مباحث کتاب هوش کمپلکس است.
خروجی باید صرفاً یک آرایه معتبر JSON شامل فیلدهای زیر باشد:
[
  {
    "question_number": 1,
    "topic": "${topicTitle}",
    "difficulty": "hard",
    "question_text": "متن فارسی سوال",
    "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
    "correct_option": 1,
    "detailed_solution": "توضیح کامل پاسخ تشریحی"
  }
]`;

    modal({
      title: 'پرامپت هوش مصنوعی جهت طراحی سوالات تالیفی جدید',
      body: `
        <div class="stack" style="gap:10px">
          <div class="small muted">
            این پرامپت اختصاصی جهت تولید خودکار سوالات تالیفی جدید با هوش مصنوعی از مبحث «<b>${esc(topicTitle)}</b>» آماده شده است. می‌توانید آن را کپی کرده و در Claude یا ChatGPT قرار دهید:
          </div>
          <textarea id="aiPromptTextArea" class="input" style="height:220px;font-family:monospace;font-size:11px;direction:ltr" readonly>${promptText}</textarea>
        </div>
      `,
      actions: [
        {
          label: 'کپی پرامپت در حافظه',
          primary: true,
          onClick: () => {
            navigator.clipboard.writeText(promptText);
            toast('پرامپت استاندارد طراحی سوال در حافظه کپی شد', 'ok');
          }
        },
        { label: 'بستن', onClick: () => {} }
      ]
    });
  }

  renderStudio();
}

export async function mgrScores(el) {
  setHead('نمرات مستمر کلاسی', 'همه‌ی نمرات ثبت‌شده‌ی معلمان کانون');
  el.innerHTML = `<section class="card">${scoresTable(await api('/api/manager/manual-scores'), { student: true })}</section>`;
}
