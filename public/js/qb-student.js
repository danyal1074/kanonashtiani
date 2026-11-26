// پنل دانش‌آموز: ساخت آزمون ساده از بانک سؤالات، محیط برگزاری آزمون (۱۱ نوع سؤال) و کارنامه صفحه‌محور
import { api, post, esc, fa, pct, $, $$, on, busy, toast, modal, confirmBox, setHead, empty, icon, gradeName, state } from './core.js';
import { renderMathHtml } from './qb-math.js';

const MASTERY_LABELS = {
  not_evaluated: ['ارزیابی نشده', 'gray'],
  needs_practice: ['نیازمند تمرین', 'red'],
  learning: ['در حال یادگیری', 'orange'],
  good: ['عملکرد مناسب', 'blue'],
  excellent: ['عملکرد بسیار خوب', 'green'],
};

export async function qbBuilderView(el, params = {}) {
  setHead('ساخت آزمون', 'انتخاب کتاب، محدوده و شروع آزمون از بانک سؤالات');
  const books = await api('/api/qb/books');
  const preBook = params.book || books[0]?.id || '';
  const preFrom = params.from || '';
  const preTo = params.to || '';

  if (!books.length) {
    el.innerHTML = `<section class="card">${empty('book', 'هنوز کتاب فعالی برای پایه شما ثبت نشده است')}</section>`;
    return;
  }

  let bookDetail = preBook ? await api(`/api/qb/books/${encodeURIComponent(preBook)}`) : null;

  el.innerHTML = `
    <div class="grid c3">
      <form id="qbBuildForm" class="card span2 stack" style="gap:14px">
        <div class="card-title">۱. ساخت آزمون اختصاصی</div>
        <div class="field"><label>۱) انتخاب کتاب</label>
          <select class="input" name="book_id" id="qbStuBook">${books.map((b) => `<option value="${esc(b.id)}" ${b.id === preBook ? 'selected' : ''}>${esc(b.title)} (${fa(b.published_count)} سؤال)</option>`).join('')}</select>
        </div>
        <div class="field"><label>۲) محدوده آزمون</label>
          <select class="input" name="scope_type" id="qbScopeType">
            <option value="book">کل کتاب</option>
            <option value="chapter">انتخاب فصل</option>
            <option value="lesson">انتخاب درس</option>
            <option value="pages" ${preFrom ? 'selected' : ''}>محدوده صفحات</option>
          </select>
        </div>
        <div id="qbScopeDetails"></div>
        <div class="field"><label>۳) تعداد سؤالات</label>
          <div class="qb-pills" id="qbCountPills">${[10, 15, 20, 30, 50].map((n) => `<button type="button" class="chip ${n === 15 ? 'on' : ''}" data-cnt="${n}">${fa(n)} سؤال</button>`).join('')}</div>
          <input type="hidden" name="question_count" id="qbCountVal" value="15">
        </div>
        <div class="field"><label>۴) سطح دشواری</label>
          <div class="qb-pills" id="qbDiffPills">${[['easy', 'آسان'], ['medium', 'متوسط'], ['hard', 'سخت'], ['mixed', 'ترکیبی']].map(([k, l]) => `<button type="button" class="chip ${k === 'mixed' ? 'on' : ''}" data-diff="${k}">${l}</button>`).join('')}</div>
          <input type="hidden" name="difficulty_mode" id="qbDiffVal" value="mixed">
        </div>
        <details class="card flat" style="padding:10px 14px">
          <summary style="cursor:pointer;font-weight:700;font-size:13px">تنظیمات پیشرفته (نوع سؤال و زمان‌بندی)</summary>
          <div class="form-grid" style="margin-top:10px">
            <div class="field"><label>محدودیت زمانی (دقیقه، ۰ = بدون زمان)</label><input class="input" type="number" name="duration_minutes" min="0" max="180" value="0"></div>
            <div class="field"><label>گزینه تشریحی</label><label class="row small" style="gap:6px;padding-top:8px"><input type="checkbox" name="include_descriptive"> شامل سؤالات تشریحی (خودارزیابی)</label></div>
          </div>
        </details>
        <button class="btn lg" type="submit">${icon('play', { size: 18 })} شروع آزمون</button>
      </form>
      <aside class="card stack" style="gap:10px">
        <div class="card-title">گزارش یادگیری و آزمون‌های من</div>
        <a class="btn soft" href="#/qb-pages">${icon('chart', { size: 16 })} گزارش عملکرد صفحه‌محور</a>
        <div id="qbRecentExams" class="stack" style="gap:8px"></div>
      </aside>
    </div>`;

  const paintScope = () => {
    const st = $('#qbScopeType', el).value;
    const box = $('#qbScopeDetails', el);
    if (st === 'chapter' && bookDetail) {
      box.innerHTML = `<div class="field"><label>انتخاب فصل</label><select class="input" name="chapter_id">${bookDetail.chapters.map((c) => `<option value="${c.id}">فصل ${fa(c.number)}: ${esc(c.title)}</option>`).join('')}</select></div>`;
    } else if (st === 'lesson' && bookDetail) {
      box.innerHTML = `<div class="field"><label>انتخاب درس</label><select class="input" name="lesson_id">${bookDetail.lessons.map((l) => `<option value="${l.id}">${esc(l.title)}</option>`).join('') || '<option value="">درسی تعریف نشده</option>'}</select></div>`;
    } else if (st === 'pages') {
      box.innerHTML = `<div class="form-grid"><div class="field"><label>از صفحه</label><input class="input" type="number" name="from_page" min="1" value="${esc(preFrom || 1)}" required></div><div class="field"><label>تا صفحه</label><input class="input" type="number" name="to_page" min="1" value="${esc(preTo || preFrom || 10)}" required></div></div>`;
    } else {
      box.innerHTML = '';
    }
  };
  paintScope();

  $('#qbStuBook', el).onchange = async (e) => {
    bookDetail = await api(`/api/qb/books/${encodeURIComponent(e.target.value)}`);
    paintScope();
  };
  $('#qbScopeType', el).onchange = paintScope;
  on(el, 'click', '[data-cnt]', (e, b) => {
    $$('#qbCountPills .chip', el).forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); $('#qbCountVal', el).value = b.dataset.cnt;
  });
  on(el, 'click', '[data-diff]', (e, b) => {
    $$('#qbDiffPills .chip', el).forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); $('#qbDiffVal', el).value = b.dataset.diff;
  });

  $('#qbBuildForm', el).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    busy(e.submitter, async () => {
      const payload = {
        book_id: f.book_id.value,
        scope_type: f.scope_type.value,
        chapter_id: f.chapter_id?.value ? Number(f.chapter_id.value) : undefined,
        lesson_id: f.lesson_id?.value ? Number(f.lesson_id.value) : undefined,
        from_page: f.from_page?.value ? Number(f.from_page.value) : undefined,
        to_page: f.to_page?.value ? Number(f.to_page.value) : undefined,
        question_count: Number(f.question_count.value),
        difficulty_mode: f.difficulty_mode.value,
        duration_minutes: Number(f.duration_minutes.value || 0),
        include_descriptive: f.include_descriptive.checked,
      };
      const res = await post('/api/qb/exams/build', payload);
      if (res.shortage > 0) toast(`تعداد سؤالات موجود در این محدوده ${fa(res.question_count)} عدد بود.`, '', 5000);
      location.hash = `#/qb-exam/${res.exam_id}`;
    });
  };

  const recent = await api('/api/qb/exams').catch(() => []);
  $('#qbRecentExams', el).innerHTML = recent.slice(0, 6).map((ex) => `
    <a class="card flat row between" href="${ex.attempt_status === 'graded' || ex.attempt_status === 'submitted' ? `#/qb-report/${ex.attempt_id}` : `#/qb-exam/${ex.id}`}" style="padding:10px;color:inherit">
      <div><b class="small">${esc(ex.title)}</b><div class="tiny muted">${fa(ex.question_count)} سؤال ${ex.mode === 'official' ? '· رسمی' : ''}</div></div>
      <span class="badge ${ex.attempt_status === 'graded' ? 'green' : 'blue'}">${ex.attempt_status === 'graded' ? `${fa(ex.percent)}٪` : 'شروع / ادامه'}</span>
    </a>`).join('') || '<div class="tiny muted">هنوز آزمونی نساخته‌اید</div>';
}

export async function qbExamRunnerView(el, { id }) {
  const data = await api(`/api/qb/exams/${id}`);
  const { exam, attempt, questions } = data;
  if (attempt && attempt.status !== 'started') {
    location.hash = `#/qb-report/${attempt.id}`;
    return;
  }
  setHead(exam.title, `${esc(exam.book_title)} · ${fa(questions.length)} سؤال`);

  const storeKey = `qb_att_${attempt.id}`;
  const savedLocal = JSON.parse(localStorage.getItem(storeKey) || '{}');
  let answers = { ...JSON.parse(attempt.answers_json || '{}'), ...(savedLocal.answers || {}) };
  let flagged = new Set([...JSON.parse(attempt.flagged_json || '[]'), ...(savedLocal.flagged || [])]);
  let cur = 0;

  let remainSec = exam.duration_minutes > 0 ? exam.duration_minutes * 60 : null;
  let timerId = null;

  const saveProgress = () => {
    localStorage.setItem(storeKey, JSON.stringify({ answers, flagged: [...flagged] }));
    post(`/api/qb/attempts/${attempt.id}/autosave`, { answers, flagged: [...flagged] }).catch(() => {});
  };

  const renderQ = () => {
    const q = questions[cur];
    const ans = answers[q.id];
    const answeredCount = questions.filter((x) => {
      const v = answers[x.id];
      return v != null && v !== '' && (!Array.isArray(v) || v.length > 0);
    }).length;

    el.innerHTML = `
      <div class="qb-runner">
        <div class="card qb-run-head row between wrap" style="gap:10px">
          <div class="row" style="gap:10px">
            <b>سؤال ${fa(cur + 1)} از ${fa(questions.length)}</b>
            <span class="badge gray">صفحه ${fa(q.primary_page)}</span>
            ${flagged.has(q.id) ? '<span class="badge orange">نشانه‌گذاری‌شده</span>' : ''}
          </div>
          <div class="row" style="gap:10px">
            ${remainSec != null ? `<span class="badge blue" id="qbTimer">⏱ ${fa(Math.floor(remainSec / 60))}:${fa(String(remainSec % 60).padStart(2, '0'))}</span>` : ''}
            <span class="small muted">${fa(answeredCount)} پاسخ‌داده‌شده</span>
          </div>
        </div>
        <div class="progress" style="margin:10px 0"><i style="width:${Math.round(((cur + 1) / questions.length) * 100)}%"></i></div>

        <div class="grid c3">
          <section class="card span2 stack" style="gap:14px">
            <div class="qb-stem-preview">${renderMathHtml(q.stem)}</div>
            ${(q.assets || []).length ? `<div class="row wrap" style="gap:10px">${q.assets.map((a) => `<img src="${esc(a.path)}" alt="${esc(a.alt || 'تصویر سؤال')}" class="qb-q-img" data-zoom="${esc(a.path)}">`).join('')}</div>` : ''}
            <div id="qbInputArea"></div>
            <div class="row between wrap" style="gap:8px;padding-top:10px;border-top:1px solid var(--line)">
              <div class="row" style="gap:6px">
                <button class="btn ghost sm" id="qbPrevBtn" ${cur === 0 ? 'disabled' : ''}>قبلی</button>
                <button class="btn ghost sm" id="qbNextBtn" ${cur === questions.length - 1 ? 'disabled' : ''}>بعدی</button>
                <button class="btn soft sm" id="qbFlagBtn">${flagged.has(q.id) ? 'حذف نشان' : 'نشان‌گذاری برای مرور'}</button>
              </div>
              <button class="btn green" id="qbFinishBtn">ثبت نهایی آزمون</button>
            </div>
          </section>
          <aside class="card">
            <div class="card-title">پاسخبرگ</div>
            <div class="qb-sheet">${questions.map((x, idx) => {
              const has = answers[x.id] != null && answers[x.id] !== '' && (!Array.isArray(answers[x.id]) || answers[x.id].length > 0);
              return `<button type="button" class="qb-sheet-btn ${idx === cur ? 'cur' : ''} ${has ? 'ans' : ''} ${flagged.has(x.id) ? 'flg' : ''}" data-jump="${idx}">${fa(idx + 1)}</button>`;
            }).join('')}</div>
          </aside>
        </div>
      </div>`;

    const area = $('#qbInputArea', el);
    if (q.type === 'single_choice') {
      area.innerHTML = `<div class="stack" style="gap:8px">${q.options.map((o, i) => `
        <label class="qb-opt ${ans === o.id ? 'on' : ''}">
          <input type="radio" name="qopt" value="${esc(o.id)}" ${ans === o.id ? 'checked' : ''}>
          <span class="qb-opt-lbl">${fa(i + 1)})</span>
          <span class="grow">${renderMathHtml(o.text)}${o.asset_path ? `<br><img src="${esc(o.asset_path)}" style="max-height:90px">` : ''}</span>
        </label>`).join('')}</div>`;
      on(area, 'change', 'input[name=qopt]', (e, r) => { answers[q.id] = r.value; saveProgress(); renderQ(); });
    } else if (q.type === 'multiple_choice') {
      const set = new Set(Array.isArray(ans) ? ans : []);
      area.innerHTML = `<div class="stack" style="gap:8px">${q.options.map((o, i) => `
        <label class="qb-opt ${set.has(o.id) ? 'on' : ''}">
          <input type="checkbox" name="qoptm" value="${esc(o.id)}" ${set.has(o.id) ? 'checked' : ''}>
          <span>${fa(i + 1)}) ${renderMathHtml(o.text)}</span>
        </label>`).join('')}</div>`;
      on(area, 'change', 'input[name=qoptm]', () => {
        answers[q.id] = [...area.querySelectorAll('input[name=qoptm]:checked')].map((x) => x.value);
        saveProgress();
      });
    } else if (q.type === 'true_false') {
      area.innerHTML = `<div class="row" style="gap:10px">
        <button type="button" class="btn ${ans === true ? '' : 'ghost'}" data-tf="true">صحیح</button>
        <button type="button" class="btn ${ans === false ? '' : 'ghost'}" data-tf="false">غلط</button>
      </div>`;
      on(area, 'click', '[data-tf]', (e, b) => { answers[q.id] = b.dataset.tf === 'true'; saveProgress(); renderQ(); });
    } else if (q.type === 'numeric') {
      area.innerHTML = `<input class="input ltr" id="numAns" type="number" step="any" value="${esc(ans ?? '')}" placeholder="عدد پاسخ را وارد کنید">`;
      $('#numAns', area).oninput = (e) => { answers[q.id] = e.target.value; saveProgress(); };
    } else if (q.type === 'fill_blank' || q.type === 'short_answer') {
      area.innerHTML = `<input class="input" id="txtAns" value="${esc(ans ?? '')}" placeholder="پاسخ کوتاه را بنویسید">`;
      $('#txtAns', area).oninput = (e) => { answers[q.id] = e.target.value; saveProgress(); };
    } else if (q.type === 'descriptive') {
      area.innerHTML = `<textarea class="input" id="descAns" rows="4" placeholder="پاسخ تشریحی خود را بنویسید…">${esc(ans ?? '')}</textarea>`;
      $('#descAns', area).oninput = (e) => { answers[q.id] = e.target.value; saveProgress(); };
    } else if (q.type === 'hotspot' && q.assets?.[0]) {
      area.innerHTML = `<div class="small muted">روی نقطه صحیح تصویر کلیک کنید:</div><div style="position:relative;display:inline-block"><img src="${esc(q.assets[0].path)}" id="hsImg" style="max-width:100%;cursor:crosshair;border-radius:10px">${ans ? `<span class="qb-hs-dot" style="left:${ans.x}%;top:${ans.y}%"></span>` : ''}</div>`;
      $('#hsImg', area).onclick = (e) => {
        const rect = e.target.getBoundingClientRect();
        answers[q.id] = { x: Math.round(((e.clientX - rect.left) / rect.width) * 100), y: Math.round(((e.clientY - rect.top) / rect.height) * 100) };
        saveProgress(); renderQ();
      };
    } else {
      area.innerHTML = `<input class="input" id="genAns" value="${esc(typeof ans === 'string' ? ans : JSON.stringify(ans || ''))}" placeholder="پاسخ خود را وارد کنید">`;
      $('#genAns', area).oninput = (e) => { answers[q.id] = e.target.value; saveProgress(); };
    }

    on(el, 'click', '[data-zoom]', (e, img) => modal({ title: 'بزرگ‌نمایی تصویر', body: `<img src="${esc(img.dataset.zoom)}" style="width:100%;border-radius:10px">`, actions: [{ label: 'بستن', cls: 'ghost', value: true }] }));
    $('#qbPrevBtn', el).onclick = () => { if (cur > 0) { cur--; renderQ(); } };
    $('#qbNextBtn', el).onclick = () => { if (cur < questions.length - 1) { cur++; renderQ(); } };
    $('#qbFlagBtn', el).onclick = () => { if (flagged.has(q.id)) flagged.delete(q.id); else flagged.add(q.id); saveProgress(); renderQ(); };
    on(el, 'click', '[data-jump]', (e, b) => { cur = Number(b.dataset.jump); renderQ(); });
    $('#qbFinishBtn', el).onclick = async () => {
      const unanswered = questions.length - questions.filter((x) => answers[x.id] != null && answers[x.id] !== '').length;
      const msg = unanswered > 0 ? `${fa(unanswered)} سؤال بدون پاسخ مانده است. آیا آزمون ثبت نهایی شود؟` : 'آیا از ثبت نهایی آزمون مطمئن هستید؟';
      if (!(await confirmBox(msg, 'ثبت نهایی'))) return;
      if (timerId) clearInterval(timerId);
      await post(`/api/qb/attempts/${attempt.id}/submit`, { answers });
      localStorage.removeItem(storeKey);
      location.hash = `#/qb-report/${attempt.id}`;
    };
  };

  renderQ();
  if (remainSec != null) {
    timerId = setInterval(async () => {
      if (!document.body.contains(el)) return clearInterval(timerId);
      remainSec--;
      const tEl = $('#qbTimer', el);
      if (tEl) tEl.textContent = `⏱ ${fa(Math.floor(remainSec / 60))}:${fa(String(remainSec % 60).padStart(2, '0'))}`;
      if (remainSec <= 0) {
        clearInterval(timerId);
        await post(`/api/qb/attempts/${attempt.id}/submit`, { answers });
        localStorage.removeItem(storeKey);
        location.hash = `#/qb-report/${attempt.id}`;
      }
    }, 1000);
  }
}

export async function qbReportView(el, { id }) {
  const rep = await api(`/api/qb/attempts/${id}/report`);
  const { attempt: a, exam, items, breakdown } = rep;
  setHead('کارنامه آزمون', `${esc(exam.title)} · ${esc(exam.book_title)}`,
    `<a class="btn ghost sm" href="#/qb-builder?book=${encodeURIComponent(exam.book_id)}">آزمون مجدد</a>`);

  el.innerHTML = `
    <div class="qb-kpis" style="margin-bottom:16px">
      <div class="card qb-kpi"><small>درصد کسب‌شده</small><b>${fa(a.percent)}٪</b></div>
      <div class="card qb-kpi"><small>نمره</small><b>${fa(a.total_score)} از ${fa(a.max_score)}</b></div>
      <div class="card qb-kpi"><small>صحیح</small><b class="pos">${fa(a.correct_count)}</b></div>
      <div class="card qb-kpi"><small>غلط</small><b class="neg">${fa(a.wrong_count)}</b></div>
      <div class="card qb-kpi"><small>نزده</small><b>${fa(a.blank_count)}</b></div>
      <div class="card qb-kpi"><small>نیازمند تصحیح</small><b>${fa(a.pending_count)}</b></div>
    </div>
    <div class="row wrap" style="gap:8px;margin-bottom:16px">
      <button class="btn sm soft" id="retryWrongBtn" type="button">تمرین اشتباهات</button>
      <a class="btn sm ghost" href="#/qb-builder?book=${encodeURIComponent(exam.book_id)}">آزمون جدید از این کتاب</a>
      <a class="btn sm ghost" href="#/qb-pages">عملکرد صفحه‌محور</a>
    </div>
    <div class="grid c3" style="margin-bottom:16px">
      <section class="card"><div class="card-title">عملکرد بر اساس فصل</div>${breakdown.chapters.map((c) => `<div class="row between small"><span>${esc(c.label)}</span><b>${fa(c.correct)} / ${fa(c.total)}</b></div>`).join('')}</section>
      <section class="card"><div class="card-title">عملکرد بر اساس مبحث</div>${breakdown.topics.map((t) => `<div class="row between small"><span>${esc(t.label)}</span><b>${fa(t.correct)} / ${fa(t.total)}</b></div>`).join('')}</section>
      <section class="card"><div class="card-title">عملکرد بر اساس صفحه</div>${breakdown.pages.map((p) => `<div class="row between small"><a href="#/textbooks/${encodeURIComponent(exam.book_id)}">صفحه ${fa(p.page)}</a><b>${fa(p.correct)} / ${fa(p.total)}</b></div>`).join('')}</section>
    </div>
    <section class="card stack" style="gap:12px">
      <div class="card-title">پاسخنامه تشریحی و مرجع صفحات</div>
      ${items.map((it, idx) => `
        <div class="card flat stack" style="gap:6px;padding:12px">
          <div class="row between wrap" style="gap:6px">
            <b>سؤال ${fa(idx + 1)} (${it.grading.status === 'correct' ? '✅ صحیح' : (it.grading.status === 'wrong' ? '❌ غلط' : (it.grading.status === 'pending_review' ? '📝 تشریحی' : '⚪ نزده'))})</b>
            <a class="btn sm ghost" href="#/textbooks/${encodeURIComponent(exam.book_id)}">مطالعه صفحه مرتبط (ص ${fa(it.primary_page)})</a>
          </div>
          <div>${renderMathHtml(it.stem)}</div>
          <div class="small muted">پاسخ شما: <b>${esc(typeof it.student_answer === 'object' ? JSON.stringify(it.student_answer) : (it.student_answer ?? '—'))}</b> · پاسخ صحیح: <b class="pos">${esc(JSON.stringify(it.correct_answer.correct_option_ids ?? it.correct_answer.value ?? it.correct_answer.accepted ?? it.correct_answer.model_answer ?? ''))}</b></div>
          ${it.explanation ? `<div class="small" style="background:#fff;padding:8px;border-radius:8px"><b>توضیح:</b> ${renderMathHtml(it.explanation)}</div>` : ''}
        </div>`).join('')}
    </section>`;

  $('#retryWrongBtn', el).onclick = async () => {
    try {
      const r = await post('/api/qb/exams/build', { book_id: exam.book_id, special_mode: 'mistakes', source_attempt_id: a.id });
      location.hash = `#/qb-exam/${r.exam_id}`;
    } catch (e) {
      toast(e.message || 'سؤال غلطی برای تمرین وجود ندارد', 'err');
    }
  };
}

export async function qbPagesView(el) {
  setHead('گزارش یادگیری صفحه‌محور', 'وضعیت تسلط شما در هر صفحه از کتاب‌های درسی');
  const rows = await api('/api/qb/performance/pages');
  el.innerHTML = `<section class="card">${rows.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>کتاب</th><th>صفحه</th><th>پاسخ‌ها / صحیح</th><th>وضعیت</th><th>تمرین</th></tr></thead>
    <tbody>${rows.map((r) => {
      const [lbl, cls] = MASTERY_LABELS[r.mastery_status] || [r.mastery_status, 'gray'];
      return `<tr><td>${esc(r.book_title)}</td><td>صفحه ${fa(r.page_number)}</td><td>${fa(r.attempts_count)} / <b class="pos">${fa(r.correct_count)}</b></td><td><span class="badge ${cls}">${lbl}</span></td><td><a class="btn sm soft" href="#/qb-builder?book=${encodeURIComponent(r.book_id)}&from=${r.page_number}&to=${r.page_number}">آزمون از این صفحه</a></td></tr>`;
    }).join('')}</tbody></table></div>` : empty('chart', 'هنوز آزمونی از بانک سؤالات ثبت نکرده‌اید')}</section>`;
}
