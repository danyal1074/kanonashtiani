import { api, $, esc, fa, en, gradeName, setHead, icon, state, toast } from './core.js';

export async function textbooksView(el) {
  setHead('کتاب‌های درسی', 'مطالعه ورق‌زن، یادداشت‌برداری صفحه‌ای و آزمون از فصل‌ها', '<a class="btn ghost sm" href="#/textbook-papers">برگه‌های تشریحی کلاس</a>');
  const { books } = await api('/api/textbooks');
  const isTeacher = ['teacher', 'manager', 'admin'].includes(state.me?.user?.role);
  const grades = [...new Set(books.map((b) => b.grade))].sort((a, b) => a - b);

  const renderGrid = (gradeFilter = 'all') => {
    const list = gradeFilter === 'all' ? books : books.filter((b) => String(b.grade) === String(gradeFilter));
    return list.map((book) => `
      <article class="tb-book ${String(book.id).startsWith('math') ? 'tb-math' : 'tb-science'}">
        <a class="tb-cover" href="#/textbooks/${book.id}" aria-label="باز کردن ${esc(book.title)}">
          <img src="/api/textbooks/${book.id}/cover" alt="جلد ${esc(book.title)}" loading="lazy" onerror="this.src='/api/textbooks/${book.id}/pages/1'">
          <span>${icon('book', { size: 22 })}</span>
        </a>
        <div class="tb-book-body">
          <span class="tb-label">پایهٔ ${gradeName(book.grade)} · ${book.subject_key === 'ریاضی' ? 'ریاضی' : 'علوم تجربی'}</span>
          <h3>${esc(book.title)}</h3>
          <p>${fa(book.chapters.length)} فصل · ${fa(book.printed_pages)} صفحهٔ کتاب</p>
          <div class="tb-book-actions">
            <a class="btn sm" href="#/textbooks/${book.id}">ورق‌زن و مطالعه ${icon('chevron-left', { size: 16 })}</a>
            <a class="btn ghost sm" href="#/exam-center?tab=builder&book=${encodeURIComponent(book.id)}">آزمون فصل‌به‌فصل</a>
          </div>
        </div>
      </article>
    `).join('') || '<section class="card">برای پایهٔ انتخابی کتابی یافت نشد.</section>';
  };

  el.innerHTML = `
    <div class="tb-library">
      <section class="tb-intro">
        <div class="tb-intro-row">
          <div>
            <span class="tb-demo">${isTeacher ? 'دسترسی کامل معلم (۱۲ کتاب)' : 'کتاب‌های پایهٔ شما'}</span>
            <h2>کتابخانهٔ درسی رشد نخبه</h2>
            <p>کتاب را در حالت ورق‌زن باز کن، روی هر صفحه یادداشت یا طراحی بکش و مستقیماً از همان فصل آزمون بساز.</p>
          </div>
          ${isTeacher && grades.length > 1 ? `
            <div class="tb-grade-pills" id="tbGradePills">
              <button class="btn sm" data-grade="all" type="button">همه (${fa(books.length)})</button>
              ${grades.map((g) => `<button class="btn ghost sm" data-grade="${g}" type="button">پایه ${gradeName(g)}</button>`).join('')}
            </div>
          ` : ''}
        </div>
      </section>
      <div class="tb-book-grid" id="tbBookGrid">${renderGrid('all')}</div>
    </div>`;

  const pills = $('#tbGradePills', el);
  if (pills) {
    pills.onclick = (e) => {
      const btn = e.target.closest('button[data-grade]');
      if (!btn) return;
      pills.querySelectorAll('button').forEach((b) => b.classList.add('ghost'));
      btn.classList.remove('ghost');
      $('#tbBookGrid', el).innerHTML = renderGrid(btn.dataset.grade);
    };
  }
}

export async function textbookView(el, { id }) {
  const book = await api(`/api/textbooks/${encodeURIComponent(id)}`);
  if (!el.isConnected) return;
  setHead(book.title, 'کتاب‌خوان ورق‌زن + دفتر یادداشت و رسم روی صفحه', '<a class="btn ghost sm" href="#/textbooks">همهٔ کتاب‌ها</a>');

  const chapters = book.chapters || [];
  let from = 1;
  let to = book.printed_pages;
  let current = chapters[0]?.printed_start || 1;
  let spread = window.innerWidth >= 1100;
  let zoomPct = 100;
  let drawMode = false;
  let penColor = '#c62828';
  let penSize = 3;
  let strokes = [];
  let savedNotePages = new Set();

  try {
    const notesList = await api(`/api/textbooks/${encodeURIComponent(book.id)}/notes`);
    savedNotePages = new Set((notesList || []).filter((n) => n.note_text).map((n) => n.page));
  } catch {}

  const role = state.me?.user?.role;
  const chapterForPage = (p) => chapters.find((c) => p >= c.printed_start && p <= c.printed_end) || chapters[0];

  el.innerHTML = `
    <div class="tb-reader">
      <aside class="tb-settings">
        <div class="tb-book-head">
          <span class="tb-demo">پایهٔ ${gradeName(book.grade)}</span>
          <h2>${esc(book.title)}</h2>
          <p class="tb-muted">${fa(chapters.length)} فصل · ${fa(book.printed_pages)} صفحه</p>
        </div>

        <form id="tbRange">
          <label for="tbChapter">فصل کتاب</label>
          <select class="input" id="tbChapter">
            <option value="all">کل کتاب (۱ تا ${fa(book.printed_pages)})</option>
            ${chapters.map((c) => `<option value="${c.number}">فصل ${fa(c.number)}: ${esc(c.title)} (${fa(c.printed_start)}-${fa(c.printed_end)})</option>`).join('')}
          </select>

          <div class="tb-fields">
            <div><label for="tbFrom">از صفحه</label><input class="input" id="tbFrom" type="text" inputmode="numeric" value="${from}"></div>
            <div><label for="tbTo">تا صفحه</label><input class="input" id="tbTo" type="text" inputmode="numeric" value="${to}"></div>
          </div>
          <p class="tb-error" id="tbError" role="alert" hidden></p>
          <button class="btn sm" type="submit">اعمال بازه</button>
        </form>

        <div class="tb-actions-stack">
          <a class="btn" id="tbChapterExam" href="#/exam-center?tab=builder&book=${encodeURIComponent(book.id)}&chapter=1">آزمون این فصل</a>
          <a class="btn soft" id="tbPractice" href="#/textbooks/${book.id}/practice?from=${from}&to=${to}">${role === 'teacher' ? 'برگهٔ تشریحی و سؤال' : 'تست از این صفحات'}</a>
          <a class="btn ghost" href="/api/textbooks/${book.id}/file" download>دریافت PDF کتاب ${icon('download', { size: 16 })}</a>
        </div>

        <div class="tb-notes-box">
          <div class="tb-notes-head">
            <strong>یادداشت این صفحه <span id="tbNotePageBadge"></span></strong>
            <span class="tb-muted" id="tbNoteStatus"></span>
          </div>
          <textarea class="input" id="tbNoteText" rows="4" placeholder="نکته‌ها و خلاصهٔ این صفحه را بنویس..."></textarea>
          <div class="tb-draw-tools">
            <button class="btn ghost sm" type="button" id="tbDrawToggle">قلم طراحی روی صفحه</button>
            <input type="color" id="tbPenColor" value="#c62828" title="رنگ قلم">
            <button class="btn ghost sm" type="button" id="tbDrawUndo" title="پاک کردن آخرین خط">برگشت</button>
            <button class="btn ghost sm" type="button" id="tbDrawClear" title="پاک کردن کل طراحی">پاک</button>
          </div>
          <button class="btn sm" type="button" id="tbSaveNote" style="width:100%;margin-top:8px">ذخیره یادداشت و طراحی</button>
        </div>
      </aside>

      <section class="tb-viewer" aria-label="کتاب‌خوان ورق‌زن">
        <nav class="tb-pagination" aria-label="کنترل ورق‌زن">
          <div class="tb-nav-group">
            <button class="btn ghost sm" type="button" id="tbPrev">${icon('chevron-right', { size: 17 })} صفحه قبل</button>
            <div class="tb-jump">
              <span>صفحه</span>
              <input class="input" id="tbPageInput" type="text" inputmode="numeric" value="${current}" aria-label="شماره صفحه">
              <span id="tbPageTotal">از ${fa(book.printed_pages)}</span>
            </div>
            <button class="btn ghost sm" type="button" id="tbNext">صفحه بعد ${icon('chevron-left', { size: 17 })}</button>
          </div>
          <div class="tb-nav-group">
            <button class="btn ghost sm" type="button" id="tbSpreadToggle">${spread ? 'تک‌صفحه‌ای' : 'ورق‌زن دوصفحه‌ای'}</button>
            <button class="btn ghost sm" type="button" id="tbZoomOut" title="کوچک‌نمایی">-</button>
            <span id="tbZoomLabel" class="tb-muted">۱۰۰٪</span>
            <button class="btn ghost sm" type="button" id="tbZoomIn" title="بزرگ‌نمایی">+</button>
          </div>
        </nav>

        <div class="tb-chapter-banner" id="tbChapterBanner"></div>

        <div class="tb-flip-stage" id="tbStage">
          <div class="tb-book-spread ${spread ? 'is-spread' : 'is-single'}" id="tbSpreadWrap">
            <div class="tb-page-slot tb-page-primary">
              <p class="tb-loading" id="tbLoading">در حال دریافت صفحه…</p>
              <div class="tb-canvas-wrap" id="tbCanvasWrap" style="width:${zoomPct}%">
                <img class="tb-page" id="tbPage" alt="">
                <canvas class="tb-draw-canvas" id="tbCanvas"></canvas>
              </div>
              <span class="tb-page-num" id="tbNum1"></span>
            </div>
            <div class="tb-page-slot tb-page-secondary" id="tbSecondSlot" ${spread ? '' : 'hidden'}>
              <div class="tb-canvas-wrap" style="width:${zoomPct}%">
                <img class="tb-page" id="tbPage2" alt="">
              </div>
              <span class="tb-page-num" id="tbNum2"></span>
            </div>
          </div>
        </div>
      </section>
    </div>`;

  const img1 = $('#tbPage', el);
  const img2 = $('#tbPage2', el);
  const canvas = $('#tbCanvas', el);
  const ctx2d = canvas.getContext('2d');
  const loading = $('#tbLoading', el);
  const chapterSel = $('#tbChapter', el);
  const noteInput = $('#tbNoteText', el);
  const noteStatus = $('#tbNoteStatus', el);

  function redrawCanvas() {
    if (!canvas.width || !canvas.height) return;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    for (const st of strokes) {
      if (!st.pts || st.pts.length < 2) continue;
      ctx2d.strokeStyle = st.color || '#c62828';
      ctx2d.lineWidth = st.size || 3;
      ctx2d.lineCap = 'round';
      ctx2d.lineJoin = 'round';
      ctx2d.beginPath();
      ctx2d.moveTo(st.pts[0][0] * canvas.width, st.pts[0][1] * canvas.height);
      for (let i = 1; i < st.pts.length; i++) {
        ctx2d.lineTo(st.pts[i][0] * canvas.width, st.pts[i][1] * canvas.height);
      }
      ctx2d.stroke();
    }
  }

  function syncCanvasSize() {
    if (!img1.naturalWidth) return;
    canvas.width = img1.clientWidth || 600;
    canvas.height = img1.clientHeight || 850;
    redrawCanvas();
  }

  let painting = false;
  let currentStroke = null;
  const pointNorm = (e) => {
    const r = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [Math.max(0, Math.min(1, (clientX - r.left) / r.width)), Math.max(0, Math.min(1, (clientY - r.top) / r.height))];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!drawMode) return;
    painting = true;
    canvas.setPointerCapture(e.pointerId);
    currentStroke = { color: penColor, size: penSize, pts: [pointNorm(e)] };
    strokes.push(currentStroke);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!painting || !drawMode || !currentStroke) return;
    currentStroke.pts.push(pointNorm(e));
    redrawCanvas();
  });
  const endPaint = () => { painting = false; currentStroke = null; };
  canvas.addEventListener('pointerup', endPaint);
  canvas.addEventListener('pointercancel', endPaint);

  async function loadPageNote(page) {
    noteStatus.textContent = 'در حال بارگذاری…';
    $('#tbNotePageBadge', el).textContent = `صفحهٔ ${fa(page)}`;
    strokes = [];
    redrawCanvas();
    try {
      const data = await api(`/api/textbooks/${encodeURIComponent(book.id)}/notes/${page}`);
      noteInput.value = data.note_text || '';
      try {
        const parsed = data.drawing_json ? JSON.parse(data.drawing_json) : [];
        strokes = Array.isArray(parsed) ? parsed : [];
      } catch { strokes = []; }
      redrawCanvas();
      noteStatus.textContent = data.updated_at ? 'ذخیره‌شده' : '';
    } catch {
      noteStatus.textContent = '';
    }
  }

  function animateFlip(dir) {
    const wrap = $('#tbSpreadWrap', el);
    wrap.classList.remove('flip-next', 'flip-prev');
    void wrap.offsetWidth;
    wrap.classList.add(dir > 0 ? 'flip-next' : 'flip-prev');
  }

  function show(dir = 0) {
    if (dir !== 0) animateFlip(dir);
    const ch = chapterForPage(current);
    $('#tbChapterBanner', el).innerHTML = ch
      ? `<span>فصل ${fa(ch.number)}: <strong>${esc(ch.title)}</strong></span><span class="tb-muted">صفحه ${fa(current)} ${savedNotePages.has(current) ? '· دارای یادداشت' : ''}</span>`
      : '';
    $('#tbChapterExam', el).href = `#/exam-center?tab=builder&book=${encodeURIComponent(book.id)}&chapter=${ch ? ch.number : 1}`;
    $('#tbPractice', el).href = `#/textbooks/${book.id}/practice?from=${from}&to=${to}`;
    $('#tbPageInput', el).value = String(current);
    $('#tbNum1', el).textContent = `صفحهٔ ${fa(current)}`;

    const step = spread ? 2 : 1;
    $('#tbPrev', el).disabled = current <= from;
    $('#tbNext', el).disabled = current + step > to && current >= to;

    loading.hidden = false;
    img1.onload = () => { loading.hidden = true; syncCanvasSize(); };
    img1.onerror = () => { loading.textContent = 'دریافت تصویر صفحه ممکن نشد.'; };
    img1.src = `/api/textbooks/${encodeURIComponent(book.id)}/pages/${current}`;
    img1.alt = `${book.title} صفحه ${fa(current)}`;

    const slot2 = $('#tbSecondSlot', el);
    if (spread && current + 1 <= to) {
      slot2.hidden = false;
      img2.src = `/api/textbooks/${encodeURIComponent(book.id)}/pages/${current + 1}`;
      img2.alt = `${book.title} صفحه ${fa(current + 1)}`;
      $('#tbNum2', el).textContent = `صفحهٔ ${fa(current + 1)}`;
    } else {
      slot2.hidden = true;
    }

    loadPageNote(current);
  }

  chapterSel.onchange = () => {
    if (chapterSel.value === 'all') {
      from = 1; to = book.printed_pages; current = 1;
    } else {
      const c = chapters.find((x) => x.number === Number(chapterSel.value));
      if (!c) return;
      from = c.printed_start; to = c.printed_end; current = c.printed_start;
    }
    $('#tbFrom', el).value = from;
    $('#tbTo', el).value = to;
    show(1);
  };

  $('#tbRange', el).onsubmit = (e) => {
    e.preventDefault();
    const a = Number(en($('#tbFrom', el).value.trim()));
    const b = Number(en($('#tbTo', el).value.trim()));
    const err = $('#tbError', el);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > book.printed_pages || a > b) {
      err.textContent = `بازهٔ معتبر بین ۱ تا ${fa(book.printed_pages)} وارد کنید.`;
      err.hidden = false;
      return;
    }
    err.hidden = true;
    from = a; to = b; current = a;
    show(1);
  };

  $('#tbPrev', el).onclick = () => {
    const step = spread ? 2 : 1;
    if (current > from) { current = Math.max(from, current - step); show(-1); }
  };
  $('#tbNext', el).onclick = () => {
    const step = spread ? 2 : 1;
    if (current < to) { current = Math.min(to, current + step); show(1); }
  };
  $('#tbPageInput', el).onchange = (e) => {
    const p = Number(en(e.target.value.trim()));
    if (Number.isInteger(p) && p >= 1 && p <= book.printed_pages) {
      if (p < from || p > to) { from = 1; to = book.printed_pages; }
      const dir = p >= current ? 1 : -1;
      current = p;
      show(dir);
    }
  };
  $('#tbSpreadToggle', el).onclick = (e) => {
    spread = !spread;
    e.target.textContent = spread ? 'تک‌صفحه‌ای' : 'ورق‌زن دوصفحه‌ای';
    $('#tbSpreadWrap', el).className = `tb-book-spread ${spread ? 'is-spread' : 'is-single'}`;
    show(0);
  };
  const applyZoom = () => {
    el.querySelectorAll('.tb-canvas-wrap').forEach((w) => { w.style.width = `${zoomPct}%`; });
    $('#tbZoomLabel', el).textContent = `${fa(zoomPct)}٪`;
    setTimeout(syncCanvasSize, 60);
  };
  $('#tbZoomIn', el).onclick = () => { zoomPct = Math.min(160, zoomPct + 15); applyZoom(); };
  $('#tbZoomOut', el).onclick = () => { zoomPct = Math.max(70, zoomPct - 15); applyZoom(); };

  $('#tbDrawToggle', el).onclick = (e) => {
    drawMode = !drawMode;
    canvas.classList.toggle('is-active', drawMode);
    e.target.classList.toggle('ghost', !drawMode);
    e.target.textContent = drawMode ? 'قلم فعال است' : 'قلم طراحی روی صفحه';
  };
  $('#tbPenColor', el).onchange = (e) => { penColor = e.target.value; };
  $('#tbDrawUndo', el).onclick = () => { strokes.pop(); redrawCanvas(); };
  $('#tbDrawClear', el).onclick = () => { strokes = []; redrawCanvas(); };

  $('#tbSaveNote', el).onclick = async () => {
    noteStatus.textContent = 'در حال ذخیره…';
    try {
      await api(`/api/textbooks/${encodeURIComponent(book.id)}/notes/${current}`, {
        method: 'PUT',
        body: { note_text: noteInput.value, drawing_json: JSON.stringify(strokes) },
      });
      if (noteInput.value.trim()) savedNotePages.add(current);
      else savedNotePages.delete(current);
      noteStatus.textContent = 'ذخیره شد';
      toast('یادداشت و طراحی صفحه ذخیره شد');
    } catch (err) {
      noteStatus.textContent = 'خطا در ذخیره';
      toast(err.message || 'خطا در ذخیره یادداشت', 'error');
    }
  };

  show(0);
}
