// مرکز آزمون یکپارچه دانش‌آموز (داشبورد ساده، آزمونساز فصل‌به‌فصل، تمرین سریع، دفترچه اشتباهات و کارنامه)
import { api, post, esc, fa, pct, $, $$, on, busy, toast, setHead, empty, icon, gradeName, jdate } from './core.js';
import { renderMathHtml } from './qb-math.js';

export async function studentExamCenterView(el, params = {}) {
  const qParams = new URLSearchParams((location.hash.split('?')[1] || ''));
  const tab = qParams.get('tab') || params.tab || 'home';
  setHead('مرکز آزمون رشد', 'ساخت آزمون فصل‌به‌فصل، تمرین سریع، دفترچه اشتباهات و کارنامه');

  const tabs = [
    ['home', 'خانه مرکز آزمون'],
    ['builder', 'ساخت آزمون جدید'],
    ['my-exams', 'آزمون‌های من'],
    ['mistakes', 'دفترچه اشتباهات'],
    ['reports', 'کارنامه و پیشرفت'],
  ];

  el.innerHTML = `<div class="qb-shell">
    <nav class="qb-tabs" aria-label="بخش‌های مرکز آزمون">${tabs.map(([k, l]) =>
      `<a class="qb-tab ${tab === k ? 'on' : ''}" href="#/exam-center?tab=${k}">${l}</a>`).join('')}</nav>
    <div id="ecBody"><div class="empty"><div class="spinner"></div>در حال بارگذاری…</div></div>
  </div>`;

  const body = $('#ecBody', el);
  if (tab === 'home') return renderStudentHome(body);
  if (tab === 'builder') return renderChapterBuilder(body, qParams);
  if (tab === 'my-exams') return renderMyExams(body);
  if (tab === 'mistakes') return renderMistakesNotebook(body);
  if (tab === 'reports') return renderStudentReports(body);
}

async function renderStudentHome(body) {
  const d = await api('/api/exam-center/student/home');
  const st = d.stats || {};
  body.innerHTML = `
    <section class="card" style="background:linear-gradient(135deg,#0b6b70,#0e7c82);color:#fff;padding:24px;margin-bottom:14px">
      <div class="row between wrap" style="gap:14px;align-items:center">
        <div>
          <h2 style="margin:0 0 6px;font-size:22px">آماده‌ای خودت رو محک بزنی؟</h2>
          <p style="margin:0;opacity:.9;font-size:14px">کتاب درسی خودت را انتخاب کن و در چند ثانیه آزمون فصل‌به‌فصل بساز.</p>
        </div>
        <a class="btn lg" href="#/exam-center?tab=builder" style="background:#fff;color:#0b6b70;font-weight:900">${icon('sparkles', { size: 18 })} ساخت آزمون جدید</a>
      </div>
    </section>

    <div class="grid c4" style="margin-bottom:16px">
      <a class="card ad-exam-card" href="#/exam-center?tab=my-exams" style="color:inherit"><div class="row"><span class="ib">${icon('file-check', { size: 20 })}</span><div><b>آزمون‌های من</b><div class="tiny muted">معلم، جامع و تمرینی</div></div></div></a>
      <button type="button" class="card ad-exam-card" id="ecQuickBtn" style="text-align:start;cursor:pointer;font:inherit"><div class="row"><span class="ib sun">${icon('zap', { size: 20 })}</span><div><b>تمرین سریع</b><div class="tiny muted">۵ سؤال پیشنهادی فوری</div></div></div></button>
      <a class="card ad-exam-card" href="#/exam-center?tab=mistakes" style="color:inherit"><div class="row"><span class="ib red">${icon('alert', { size: 20 })}</span><div><b>مرور اشتباهات</b><div class="tiny muted">دفترچه اشتباهات من</div></div></div></a>
      <a class="card ad-exam-card" href="#/exam-center?tab=reports" style="color:inherit"><div class="row"><span class="ib green">${icon('award', { size: 20 })}</span><div><b>کارنامه و پیشرفت</b><div class="tiny muted">تحلیل فصل‌ها و صفحات</div></div></div></a>
    </div>

    <div class="qb-kpis" style="margin-bottom:16px">
      <div class="card qb-kpi"><small>آزمون‌های انجام‌شده</small><b>${fa(st.completed_count || 0)}</b></div>
      <div class="card qb-kpi"><small>سؤالات پاسخ‌داده‌شده</small><b>${fa(st.questions_answered || 0)}</b></div>
      <div class="card qb-kpi"><small>میانگین درصد پاسخ صحیح</small><b class="pos">${fa(st.avg_percent || 0)}٪</b></div>
    </div>

    <div class="grid c2">
      <section class="card">
        <div class="card-title">آزمون‌های پیش رو و اخیر</div>
        <div class="stack" style="gap:8px">
          ${d.qb_exams.slice(0, 5).map((e) => `<a class="card flat row between" href="${e.attempt_status === 'graded' ? `#/qb-report/${e.attempt_id}` : `#/qb-exam/${e.id}`}" style="padding:10px;color:inherit"><div><b>${esc(e.title)}</b><div class="tiny muted">${esc(e.book_title)} · ${fa(e.question_count)} سؤال</div></div><span class="badge ${e.attempt_status === 'graded' ? 'green' : 'blue'}">${e.attempt_status === 'graded' ? `${fa(e.percent)}٪` : 'شروع'}</span></a>`).join('')}
          ${d.legacy_exams.filter((x) => x.percent == null).slice(0, 4).map((e) => `<a class="card flat row between" href="#/exam/${e.id}" style="padding:10px;color:inherit"><div><b>${esc(e.title)}</b><div class="tiny muted">${esc(e.subject || '')} · رسمی</div></div><span class="badge orange">آماده شروع</span></a>`).join('')}
          ${!d.qb_exams.length && !d.legacy_exams.length ? '<div class="small muted">هنوز آزمونی ثبت نشده است. با «ساخت آزمون جدید» شروع کن!</div>' : ''}
        </div>
      </section>
      <section class="card">
        <div class="card-title">مباحث و صفحات نیازمند تمرین</div>
        <div class="stack" style="gap:8px">
          ${d.weak_pages.map((p) => `<div class="card flat row between" style="padding:10px"><div><b>${esc(p.book_title)}</b><div class="tiny muted">صفحه ${fa(p.page_number)}</div></div><a class="btn sm soft" href="#/exam-center?tab=builder&book=${encodeURIComponent(p.book_id)}">تمرین</a></div>`).join('') || '<div class="small muted">پس از انجام چند آزمون، نقاط نیازمند تمرین اینجا نمایش داده می‌شوند.</div>'}
        </div>
      </section>
    </div>`;

  $('#ecQuickBtn', body).onclick = (e) => busy(e.currentTarget, async () => {
    const res = await post('/api/exam-center/student/quick-practice', {});
    location.hash = `#/qb-exam/${res.exam_id}`;
  });
}

async function renderChapterBuilder(body, qParams) {
  const books = await api('/api/qb/books');
  if (!books.length) {
    body.innerHTML = `<section class="card">${empty('book', 'هنوز کتاب فعالی برای پایه شما ثبت نشده است')}</section>`;
    return;
  }
  const preBook = qParams.get('book') || books[0].id;
  const preCh = qParams.get('ch') || '';
  let detail = await api(`/api/qb/books/${encodeURIComponent(preBook)}`);

  body.innerHTML = `
    <form id="ecBuildForm" class="card stack" style="gap:14px;max-width:760px">
      <div class="card-title">آزمونساز ساده فصل‌به‌فصل</div>
      <div class="field"><label>۱) انتخاب کتاب درسی پایهٔ شما</label>
        <select class="input" name="book_id" id="ecBook">${books.map((b) => `<option value="${esc(b.id)}" ${b.id === preBook ? 'selected' : ''}>${esc(b.title)} (${fa(b.published_count)} سؤال)</option>`).join('')}</select>
      </div>
      <div class="field"><label>۲) انتخاب محدوده (پیشنهادی: فصل به فصل)</label>
        <select class="input" name="scope_type" id="ecScope">
          <option value="chapter" selected>فصل به فصل</option>
          <option value="book">کل کتاب</option>
          <option value="lesson">انتخاب درس</option>
          <option value="pages">بازه صفحات</option>
        </select>
      </div>
      <div id="ecScopeBox"></div>
      <div class="field"><label>۳) تعداد سؤالات</label>
        <div class="qb-pills" id="ecCntPills">${[5, 10, 20, 30].map((n) => `<button type="button" class="chip ${n === 10 ? 'on' : ''}" data-cnt="${n}">${fa(n)} سؤال</button>`).join('')}</div>
        <div class="row" style="gap:8px;margin-top:8px"><span class="tiny muted">یا تعداد دلخواه:</span><input class="input" type="number" id="ecCntVal" name="question_count" min="1" max="50" value="10" style="width:90px"></div>
      </div>
      <details class="card flat" style="padding:10px 14px">
        <summary style="cursor:pointer;font-weight:700;font-size:13px">تنظیمات پیشرفته اختیاری (سطح، زمان، حالت تمرینی/آزمونی)</summary>
        <div class="form-grid" style="margin-top:10px">
          <div class="field"><label>سطح دشواری</label><select class="input" name="difficulty_mode"><option value="mixed">ترکیبی (پیش‌فرض)</option><option value="easy">آسان</option><option value="medium">متوسط</option><option value="hard">سخت</option></select></div>
          <div class="field"><label>مدت آزمون (دقیقه، ۰ = بدون زمان)</label><input class="input" type="number" name="duration_minutes" min="0" max="180" value="0"></div>
          <div class="field"><label>حالت</label><select class="input" name="practice_mode"><option value="practice">حالت تمرینی (یادگیری)</option><option value="exam">حالت آزمونی (شبیه‌ساز)</option></select></div>
        </div>
      </details>
      <button class="btn lg" type="submit">${icon('play', { size: 18 })} شروع آزمون</button>
    </form>`;

  const paintScope = () => {
    const s = $('#ecScope', body).value;
    const box = $('#ecScopeBox', body);
    if (s === 'chapter') {
      box.innerHTML = `<div class="field"><label>انتخاب فصل کتاب</label><select class="input" name="chapter_id">${(detail.chapters || []).map((c) => `<option value="${c.id}" ${String(c.number) === preCh ? 'selected' : ''}>فصل ${fa(c.number)}: ${esc(c.title)}</option>`).join('')}</select></div>`;
    } else if (s === 'lesson') {
      box.innerHTML = `<div class="field"><label>انتخاب درس</label><select class="input" name="lesson_id">${(detail.lessons || []).map((l) => `<option value="${l.id}">${esc(l.title)}</option>`).join('') || '<option value="">درسی ثبت نشده</option>'}</select></div>`;
    } else if (s === 'pages') {
      box.innerHTML = `<div class="form-grid"><div class="field"><label>از صفحه</label><input class="input" type="number" name="from_page" min="1" value="1"></div><div class="field"><label>تا صفحه</label><input class="input" type="number" name="to_page" min="1" value="20"></div></div>`;
    } else {
      box.innerHTML = '';
    }
  };
  paintScope();

  $('#ecBook', body).onchange = async (e) => {
    detail = await api(`/api/qb/books/${encodeURIComponent(e.target.value)}`);
    paintScope();
  };
  $('#ecScope', body).onchange = paintScope;
  on(body, 'click', '[data-cnt]', (e, b) => {
    $$('#ecCntPills .chip', body).forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    $('#ecCntVal', body).value = b.dataset.cnt;
  });

  $('#ecBuildForm', body).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    busy(e.submitter, async () => {
      const res = await post('/api/qb/exams/build', {
        book_id: f.book_id.value,
        scope_type: f.scope_type.value,
        chapter_id: f.chapter_id?.value ? Number(f.chapter_id.value) : undefined,
        lesson_id: f.lesson_id?.value ? Number(f.lesson_id.value) : undefined,
        from_page: f.from_page?.value ? Number(f.from_page.value) : undefined,
        to_page: f.to_page?.value ? Number(f.to_page.value) : undefined,
        question_count: Number(f.question_count.value),
        difficulty_mode: f.difficulty_mode.value,
        duration_minutes: Number(f.duration_minutes.value || 0),
      });
      if (res.shortage > 0) toast(`تعداد سؤالات موجود در این محدوده ${fa(res.question_count)} عدد بود.`, '', 5000);
      location.hash = `#/qb-exam/${res.exam_id}`;
    });
  };
}

async function renderMyExams(body) {
  const d = await api('/api/exam-center/student/home');
  body.innerHTML = `
    <div class="card stack" style="gap:10px">
      <div class="row between wrap" style="gap:8px">
        <div class="card-title" style="margin:0">همه آزمون‌های من (تمرینی، معلم و جامع)</div>
        <select class="input" id="myExFilter" style="width:180px">
          <option value="all">همه نوع‌ها</option>
          <option value="practice">تمرینی (بانک سؤال)</option>
          <option value="official">رسمی و کلاسی</option>
        </select>
      </div>
      <div id="myExList" class="stack" style="gap:8px"></div>
    </div>`;
  const paint = () => {
    const f = $('#myExFilter', body).value;
    const rows = [
      ...d.qb_exams.map((e) => ({ kind: e.mode, title: e.title, sub: `${e.book_title} · ${fa(e.question_count)} سؤال`, href: e.attempt_status === 'graded' ? `#/qb-report/${e.attempt_id}` : `#/qb-exam/${e.id}`, badge: e.attempt_status === 'graded' ? `${fa(e.percent)}٪` : 'شروع / ادامه', cls: e.attempt_status === 'graded' ? 'green' : 'blue' })),
      ...d.legacy_exams.map((e) => ({ kind: 'official', title: e.title, sub: `${e.subject || ''} · ${e.kind === 'comprehensive' ? 'آزمون جامع' : 'آزمون کلاسی'}`, href: e.percent == null ? `#/exam/${e.id}` : '#/results', badge: e.percent == null ? 'شروع آزمون' : `${fa(e.percent)}٪`, cls: e.percent == null ? 'orange' : 'green' })),
    ].filter((x) => f === 'all' || x.kind === f);
    $('#myExList', body).innerHTML = rows.map((r) => `<a class="card flat row between" href="${r.href}" style="padding:12px;color:inherit"><div><b>${esc(r.title)}</b><div class="tiny muted">${esc(r.sub)}</div></div><span class="badge ${r.cls}">${r.badge}</span></a>`).join('') || '<div class="small muted">آزمونی یافت نشد</div>';
  };
  paint();
  $('#myExFilter', body).onchange = paint;
}

async function renderMistakesNotebook(body) {
  const rows = await api('/api/exam-center/student/mistakes');
  body.innerHTML = `
    <section class="card stack" style="gap:12px">
      <div class="row between wrap" style="gap:8px">
        <div class="card-title" style="margin:0">دفترچه اشتباهات (${fa(rows.length)} سؤال)</div>
        <a class="btn sm" href="#/exam-center?tab=builder">ساخت آزمون جبرانی</a>
      </div>
      ${rows.length ? rows.map((m) => `
        <div class="card flat stack" style="gap:6px;padding:12px">
          <div class="row between wrap"><span class="badge blue">${esc(m.book_title)} · ${esc(m.chapter_title || `صفحه ${fa(m.primary_page)}`)}</span><span class="badge red">${fa(m.wrong_times)} بار اشتباه</span></div>
          <div>${renderMathHtml(m.stem)}</div>
          ${m.explanation ? `<div class="small muted">${renderMathHtml(m.explanation)}</div>` : ''}
        </div>`).join('') : empty('check-circle', 'آفرین! هنوز سؤال اشتباهی در دفترچه ثبت نشده است')}
    </section>`;
}

async function renderStudentReports(body) {
  const [d, pages] = await Promise.all([api('/api/exam-center/student/home'), api('/api/qb/performance/pages')]);
  const graded = d.qb_exams.filter((e) => e.attempt_status === 'graded' || e.attempt_status === 'submitted');
  body.innerHTML = `
    <div class="grid c2">
      <section class="card stack" style="gap:8px">
        <div class="card-title">کارنامه‌های آزمون‌های من</div>
        ${graded.map((e) => `<a class="card flat row between" href="#/qb-report/${e.attempt_id}" style="padding:10px;color:inherit"><div><b>${esc(e.title)}</b><div class="tiny muted">${esc(e.book_title)} · ${e.mode === 'official' ? 'آزمون رسمی' : 'تمرین آزاد'}</div></div><span class="badge green">${fa(e.percent)}٪</span></a>`).join('') || '<div class="small muted">هنوز کارنامه‌ای ثبت نشده است</div>'}
        <a class="btn sm ghost" href="#/results">مشاهده کارنامه‌های آزمون‌های قبلی سامانه</a>
      </section>
      <section class="card stack" style="gap:8px">
        <div class="card-title">نقشه تسلط صفحات کتاب</div>
        ${pages.slice(0, 12).map((p) => `<div class="row between small"><span>${esc(p.book_title)} · صفحه ${fa(p.page_number)}</span><b>${fa(p.correct_count)} / ${fa(p.attempts_count)}</b></div>`).join('') || '<div class="small muted">داده کافی ثبت نشده است</div>'}
        <a class="btn sm soft" href="#/qb-pages">گزارش کامل صفحه‌محور</a>
      </section>
    </div>`;
}
