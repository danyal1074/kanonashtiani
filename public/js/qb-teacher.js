// رابط کاربری بانک سؤالات در پنل معلم و مدیر (۱۱ زیربخش کامل، ویرایشگر ۱۱ نوع سؤال و Wizard بارگذاری گروهی)
import { api, post, put, esc, fa, num, pct, $, $$, on, busy, toast, modal, setHead, empty, icon, gradeName, dateField, readDate, tehranIso, state } from './core.js';
import { renderMathHtml } from './qb-math.js';

const TYPE_LABELS = {
  single_choice: 'چهارگزینه‌ای', multiple_choice: 'چندپاسخی', true_false: 'صحیح و غلط',
  fill_blank: 'جای خالی', short_answer: 'پاسخ کوتاه', descriptive: 'تشریحی',
  numeric: 'پاسخ عددی', matching: 'وصل‌کردنی', ordering: 'مرتب‌سازی',
  multipart: 'چندبخشی', hotspot: 'ناحیه تصویر',
};
const STATUS_LABELS = {
  draft: ['پیش‌نویس', 'gray'], pending_review: ['در انتظار بررسی', 'orange'],
  approved: ['تأییدشده', 'blue'], published: ['منتشرشده', 'green'],
  rejected: ['ردشده', 'red'], archived: ['بایگانی‌شده', 'gray'],
};

const TABS = [
  ['dashboard', 'داشبورد'],
  ['all', 'همه سؤالات'],
  ['add', 'افزودن سؤال'],
  ['import', 'بارگذاری گروهی'],
  ['books', 'کتاب‌ها'],
  ['pending', 'در انتظار بررسی'],
  ['published', 'منتشرشده'],
  ['archived', 'بایگانی‌شده'],
  ['official', 'آزمون رسمی'],
  ['coverage', 'گزارش پوشش'],
  ['history', 'تاریخچه بارگذاری'],
];

function navTabs(active) {
  return `<nav class="qb-tabs" aria-label="زیربخش‌های بانک سؤالات">${TABS.map(([k, l]) =>
    `<a class="qb-tab ${active === k ? 'on' : ''}" href="#/question-bank/${k}">${l}</a>`
  ).join('')}</nav>`;
}

export async function questionBankView(el, params = {}) {
  const tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'dashboard';
  setHead('بانک سؤالات', 'مدیریت سؤالات کتاب‌های درسی پایه چهارم تا نهم و ساخت آزمون',
    `<a class="btn sm soft" href="#/question-bank/import">${icon('upload', { size: 15 })} بارگذاری گروهی</a> <a class="btn sm" href="#/question-bank/add">${icon('plus', { size: 15 })} افزودن سؤال</a>`);

  el.innerHTML = `<div class="qb-shell">${navTabs(tab)}<div id="qbBody"><div class="empty"><div class="spinner"></div>در حال بارگذاری…</div></div></div>`;
  const body = $('#qbBody', el);

  if (tab === 'dashboard') return renderDashboard(body);
  if (tab === 'all' || tab === 'pending' || tab === 'published' || tab === 'archived') return renderQuestionsList(body, tab);
  if (tab === 'add') return renderEditor(body, params.id ? Number(params.id) : null);
  if (tab === 'import') return renderImportWizard(body);
  if (tab === 'books') return renderBooksList(body);
  if (tab === 'official') return renderOfficialExams(body);
  if (tab === 'coverage') return renderCoverageReport(body);
  if (tab === 'history') return renderImportHistory(body);
}

async function renderDashboard(body) {
  const d = await api('/api/qb/dashboard');
  const k = d.kpis || {};
  const ch = d.charts || {};
  const barList = (items, labelFn, color = 'var(--brand, #0b6b70)') => {
    const max = Math.max(1, ...items.map((x) => x.count || x.percent || 0));
    return items.length ? items.map((x) => {
      const val = x.count ?? x.percent ?? 0;
      return `<div class="qb-bar-row"><span class="qb-bar-lbl">${esc(labelFn(x))}</span><div class="qb-bar-track"><i style="width:${Math.round((val / max) * 100)}%;background:${color}"></i></div><b>${fa(val)}${x.percent != null ? '٪' : ''}</b></div>`;
    }).join('') : '<div class="muted small">داده‌ای ثبت نشده است</div>';
  };

  body.innerHTML = `
    <div class="qb-kpis">
      <div class="card qb-kpi"><small>کل سؤالات</small><b>${fa(k.total || 0)}</b></div>
      <div class="card qb-kpi"><small>سؤالات منتشرشده</small><b class="pos">${fa(k.published || 0)}</b></div>
      <div class="card qb-kpi"><small>نیازمند بررسی</small><b>${fa(k.pending_review || 0)}</b></div>
      <div class="card qb-kpi"><small>کتاب‌های دارای بانک</small><b>${fa(k.books_with_questions || 0)}</b></div>
      <div class="card qb-kpi"><small>صفحات پوشش‌داده‌شده</small><b>${fa(k.covered_pages || 0)}</b></div>
      <div class="card qb-kpi"><small>صفحات بدون سؤال</small><b>${fa(k.uncovered_pages || 0)}</b></div>
      <div class="card qb-kpi"><small>سؤالات تصویری</small><b>${fa(k.visual_questions || 0)}</b></div>
      <div class="card qb-kpi"><small>آزمون‌های برگزارشده</small><b>${fa(k.exams_held || 0)}</b></div>
    </div>
    <div class="grid c2" style="margin-top:16px">
      <section class="card"><div class="card-title">توزیع سؤالات بر اساس پایه</div>${barList(ch.by_grade || [], (x) => `پایه ${gradeName(x.grade)}`)}</section>
      <section class="card"><div class="card-title">توزیع بر اساس کتاب</div>${barList(ch.by_book || [], (x) => x.title, '#2563eb')}</section>
      <section class="card"><div class="card-title">توزیع بر اساس نوع سؤال</div>${barList(ch.by_type || [], (x) => TYPE_LABELS[x.type] || x.type, '#12805c')}</section>
      <section class="card"><div class="card-title">توزیع بر اساس سطح دشواری</div>${barList(ch.by_difficulty || [], (x) => `سطح ${fa(x.difficulty)}`, '#e3a33b')}</section>
      <section class="card"><div class="card-title">درصد پوشش کتاب‌ها</div>${barList(ch.book_coverage || [], (x) => `${x.title} (${fa(x.covered)}/${fa(x.total)})`, '#0e7c82')}</section>
      <section class="card"><div class="card-title">پرمصرف‌ترین سؤالات در آزمون‌ها</div>${(ch.usage_top || []).length ? `<div class="stack" style="gap:8px">${ch.usage_top.map((u) => `<div class="row between small"><span>${esc(u.topic || TYPE_LABELS[u.type] || 'سؤال')} <small class="muted">(${esc(u.book_title)})</small></span><b>${fa(u.uses)} بار</b></div>`).join('')}</div>` : '<div class="muted small">هنوز آزمونی برگزار نشده است</div>'}</section>
    </div>`;
}

async function renderQuestionsList(body, mode) {
  const books = await api('/api/qb/books');
  const defaultStatus = mode === 'pending' ? 'pending_review' : (mode === 'published' ? 'published' : (mode === 'archived' ? 'archived' : ''));

  body.innerHTML = `
    <section class="card" style="margin-bottom:14px">
      <div class="row wrap" style="gap:8px;align-items:center">
        <input class="input" id="qbQ" placeholder="جستجوی متن سؤال، مبحث یا شناسه…" style="flex:2 1 200px">
        <select class="input" id="qbBook" style="flex:1 1 150px"><option value="">همه کتاب‌ها</option>${books.map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('')}</select>
        <select class="input" id="qbType" style="flex:1 1 130px"><option value="">همه انواع</option>${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select class="input" id="qbDiff" style="flex:1 1 110px"><option value="">همه سطوح</option>${[1, 2, 3, 4, 5].map((d) => `<option value="${d}">دشواری ${fa(d)}</option>`).join('')}</select>
        <select class="input" id="qbSt" style="flex:1 1 130px"><option value="">همه وضعیت‌ها</option>${Object.entries(STATUS_LABELS).map(([k, [v]]) => `<option value="${k}" ${defaultStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input class="input" id="qbPg" type="number" min="1" placeholder="صفحه" style="width:90px">
        <label class="row small" style="gap:4px"><input type="checkbox" id="qbImg"> تصویری</label>
        <a class="btn ghost sm" id="qbExpBtn" href="/api/qb/export" download="questions-export.json">${icon('download', { size: 15 })} خروجی JSON</a>
      </div>
      <div id="qbBulkBar" class="row wrap" style="gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)" hidden>
        <span class="small bold" id="qbSelCnt">۰ سؤال انتخاب‌شده</span>
        <button class="btn sm green" data-bulk="publish" type="button">انتشار گروهی</button>
        <button class="btn sm soft" data-bulk="approve" type="button">تأیید گروهی</button>
        <button class="btn sm ghost" data-bulk="archive" type="button">بایگانی گروهی</button>
      </div>
    </section>
    <section class="card" id="qbListBox"></section>`;

  const selected = new Set();
  const syncBulk = () => {
    $('#qbBulkBar', body).hidden = selected.size === 0;
    $('#qbSelCnt', body).textContent = `${fa(selected.size)} سؤال انتخاب‌شده`;
  };

  async function load() {
    const params = new URLSearchParams();
    if ($('#qbQ', body).value.trim()) params.set('q', $('#qbQ', body).value.trim());
    if ($('#qbBook', body).value) params.set('book_id', $('#qbBook', body).value);
    if ($('#qbType', body).value) params.set('type', $('#qbType', body).value);
    if ($('#qbDiff', body).value) params.set('difficulty', $('#qbDiff', body).value);
    if ($('#qbSt', body).value) params.set('status', $('#qbSt', body).value);
    if ($('#qbPg', body).value) params.set('page', $('#qbPg', body).value);
    if ($('#qbImg', body).checked) params.set('has_image', '1');
    $('#qbExpBtn', body).href = `/api/qb/export?${params}`;

    const { rows } = await api(`/api/qb/questions?${params}`);
    selected.clear(); syncBulk();
    $('#qbListBox', body).innerHTML = rows.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th><input type="checkbox" id="qbAllChk"></th><th>متن سؤال</th><th>کتاب / صفحه</th><th>نوع / دشواری</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>${rows.map((q) => {
          const [sl, sc] = STATUS_LABELS[q.status] || [q.status, 'gray'];
          return `<tr>
            <td><input type="checkbox" class="qb-row-chk" value="${q.id}"></td>
            <td><div class="qb-stem-cell">${renderMathHtml(q.stem.slice(0, 140))}${q.stem.length > 140 ? '…' : ''}</div><div class="tiny muted">${esc(q.topic || '')} ${q.external_id ? `· <code>${esc(q.external_id)}</code>` : ''}</div></td>
            <td class="small"><b>${esc(q.book_title)}</b><div class="tiny muted">صفحه ${fa(q.primary_page)}</div></td>
            <td class="small">${TYPE_LABELS[q.type] || q.type}<div class="tiny muted">سطح ${fa(q.difficulty)} · ${fa(q.score)} نمره</div></td>
            <td><span class="badge ${sc}">${sl}</span></td>
            <td><div class="row" style="gap:4px">
              ${q.status !== 'published' ? `<button class="btn sm green" data-qpub="${q.id}" title="انتشار">انتشار</button>` : ''}
              <button class="btn sm soft" data-qedit="${q.id}" title="ویرایش">ویرایش</button>
              <button class="btn sm ghost" data-qclone="${q.id}" title="کپی">کپی</button>
              <button class="btn sm ghost" data-qarch="${q.id}" title="بایگانی">بایگانی</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : empty('inbox', 'سؤالی با این فیلترها یافت نشد');
  }

  for (const id of ['#qbBook', '#qbType', '#qbDiff', '#qbSt', '#qbImg']) $(id, body).onchange = load;
  let t; for (const id of ['#qbQ', '#qbPg']) $(id, body).oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  on(body, 'change', '#qbAllChk', (e, c) => {
    $$('.qb-row-chk', body).forEach((x) => { x.checked = c.checked; if (c.checked) selected.add(Number(x.value)); else selected.delete(Number(x.value)); });
    syncBulk();
  });
  on(body, 'change', '.qb-row-chk', (e, c) => { if (c.checked) selected.add(Number(c.value)); else selected.delete(Number(c.value)); syncBulk(); });
  on(body, 'click', '[data-bulk]', (e, b) => busy(b, async () => {
    await post('/api/qb/questions/bulk', { ids: [...selected], action: b.dataset.bulk });
    toast('عملیات گروهی انجام شد', 'ok'); load();
  }));
  on(body, 'click', '[data-qpub]', (e, b) => busy(b, async () => { await post(`/api/qb/questions/${b.dataset.qpub}/status`, { status: 'published' }); toast('منتشر شد', 'ok'); load(); }));
  on(body, 'click', '[data-qarch]', (e, b) => busy(b, async () => { await post(`/api/qb/questions/${b.dataset.qarch}/status`, { status: 'archived' }); toast('بایگانی شد', 'ok'); load(); }));
  on(body, 'click', '[data-qclone]', (e, b) => busy(b, async () => { await post(`/api/qb/questions/${b.dataset.qclone}/clone`, {}); toast('نسخه کپی در پیش‌نویس ساخته شد', 'ok'); load(); }));
  on(body, 'click', '[data-qedit]', (e, b) => renderEditor(body, Number(b.dataset.qedit)));
  await load();
}

async function renderEditor(body, editId = null) {
  const books = await api('/api/qb/books');
  let q = null;
  if (editId) {
    const res = await api(`/api/qb/questions?`);
    q = (res.rows || []).find((x) => x.id === editId) || null;
  }
  const initBookId = q?.book_id || books[0]?.id || '';
  const opts = q ? JSON.parse(q.options_json || '[]') : [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }];
  const ans = q ? JSON.parse(q.answer_json || '{}') : { correct_option_ids: ['a'] };

  body.innerHTML = `
    <form id="qbEditForm" class="card stack" style="gap:14px">
      <div class="card-title">${editId ? `ویرایش سؤال #${fa(editId)}` : 'افزودن سؤال جدید به بانک سؤالات'}</div>
      <div class="form-grid">
        <div class="field"><label>کتاب درسی</label><select class="input" name="book_id" id="edBook">${books.map((b) => `<option value="${esc(b.id)}" ${b.id === initBookId ? 'selected' : ''}>${esc(b.title)} (پایه ${gradeName(b.grade)})</option>`).join('')}</select></div>
        <div class="field"><label>شماره صفحه چاپی کتاب</label><input class="input" type="number" name="primary_page" min="1" value="${q?.primary_page || 1}" required></div>
        <div class="field"><label>نوع سؤال</label><select class="input" name="type" id="edType">${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${(q?.type || 'single_choice') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>سطح دشواری (۱ تا ۵)</label><select class="input" name="difficulty">${[1, 2, 3, 4, 5].map((d) => `<option value="${d}" ${(q?.difficulty || 2) === d ? 'selected' : ''}>${fa(d)}</option>`).join('')}</select></div>
        <div class="field"><label>مبحث</label><input class="input" name="topic" value="${esc(q?.topic || '')}" placeholder="مثلاً الگوهای عددی"></div>
        <div class="field"><label>بارم (نمره)</label><input class="input" type="number" step="0.25" min="0.25" name="score" value="${q?.score || 1}"></div>
        <div class="field"><label>زمان پیشنهادی (ثانیه)</label><input class="input" type="number" min="10" name="estimated_time_seconds" value="${q?.estimated_time_seconds || 60}"></div>
        <div class="field"><label>وضعیت انتشار</label><select class="input" name="status">${Object.entries(STATUS_LABELS).map(([k, [v]]) => `<option value="${k}" ${(q?.status || 'published') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>متن سؤال (پشتیبانی از فرمول ریاضی با <code>$...$</code>)</label><textarea class="input" name="stem" id="edStem" rows="3" required placeholder="مثال: حاصل $\\frac{1}{2}+\\frac{1}{4}$ چیست؟">${esc(q?.stem || '')}</textarea></div>
      <div id="edAnsBox"></div>
      <div class="field"><label>پاسخ تشریحی / توضیح</label><textarea class="input" name="explanation" rows="2">${esc(q?.explanation || '')}</textarea></div>
      <div class="form-grid">
        <div class="field"><label>برچسب‌ها (با ویرگول جدا کنید)</label><input class="input" name="tags" value="${esc(q ? JSON.parse(q.tags_json || '[]').join('، ') : '')}" placeholder="کسر، هندسه"></div>
        <div class="field"><label>ویژگی‌های محتوایی</label><div class="row wrap" style="gap:10px;padding-top:8px">
          <label class="row small" style="gap:4px"><input type="checkbox" name="has_image"> تصویری</label>
          <label class="row small" style="gap:4px"><input type="checkbox" name="is_geometric"> هندسی</label>
          <label class="row small" style="gap:4px"><input type="checkbox" name="has_formula"> فرمول‌دار</label>
        </div></div>
      </div>
      <div class="row wrap" style="gap:8px">
        <button type="button" class="btn soft" id="edPreviewBtn">${icon('eye', { size: 16 })} پیش‌نمایش دانش‌آموز</button>
        <button type="submit" class="btn">${icon('check', { size: 16 })} ${editId ? 'ذخیره تغییرات' : 'ثبت سؤال'}</button>
      </div>
    </form>`;

  const drawAnsFields = () => {
    const t = $('#edType', body).value;
    const box = $('#edAnsBox', body);
    if (t === 'single_choice' || t === 'multiple_choice') {
      const corr = new Set(ans.correct_option_ids || ['a']);
      box.innerHTML = `<div class="stack" style="gap:8px"><label class="small bold">گزینه‌ها و پاسخ صحیح</label>${['a', 'b', 'c', 'd'].map((id, i) => `
        <div class="row" style="gap:8px"><input type="${t === 'single_choice' ? 'radio' : 'checkbox'}" name="corr_opt" value="${id}" ${corr.has(id) ? 'checked' : ''}><input class="input" name="opt_${id}" value="${esc(opts[i]?.text || '')}" placeholder="گزینه ${fa(i + 1)}" required></div>`).join('')}</div>`;
    } else if (t === 'true_false') {
      box.innerHTML = `<div class="field"><label>پاسخ صحیح</label><select class="input" name="tf_val"><option value="true" ${ans.value !== false ? 'selected' : ''}>صحیح</option><option value="false" ${ans.value === false ? 'selected' : ''}>غلط</option></select></div>`;
    } else if (t === 'numeric') {
      box.innerHTML = `<div class="form-grid"><div class="field"><label>مقدار عددی صحیح</label><input class="input ltr" type="number" step="any" name="num_val" value="${ans.value ?? ''}" required></div><div class="field"><label>تلورانس مجاز</label><input class="input ltr" type="number" step="any" name="num_tol" value="${ans.tolerance ?? 0}"></div></div>`;
    } else if (t === 'fill_blank' || t === 'short_answer') {
      box.innerHTML = `<div class="field"><label>پاسخ‌های قابل قبول (با | جدا کنید)</label><input class="input" name="accepted_ans" value="${esc((ans.accepted || []).join(' | '))}" required></div>`;
    } else if (t === 'descriptive') {
      box.innerHTML = `<div class="field"><label>پاسخ نمونه تشریحی</label><textarea class="input" name="model_answer" rows="2" required>${esc(ans.model_answer || '')}</textarea></div>`;
    } else {
      box.innerHTML = `<div class="field"><label>پاسخ ساختاریافته (JSON)</label><textarea class="input ltr" name="raw_answer" rows="3">${esc(JSON.stringify(ans, null, 2))}</textarea></div>`;
    }
  };
  drawAnsFields();
  $('#edType', body).onchange = drawAnsFields;

  const buildPayload = () => {
    const f = $('#qbEditForm', body);
    const t = f.type.value;
    let options = [], answer = {};
    if (t === 'single_choice' || t === 'multiple_choice') {
      options = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: f[`opt_${id}`].value.trim() }));
      const corr = [...f.querySelectorAll('input[name=corr_opt]:checked')].map((x) => x.value);
      answer = { correct_option_ids: corr };
    } else if (t === 'true_false') {
      answer = { value: f.tf_val.value === 'true' };
    } else if (t === 'numeric') {
      answer = { value: Number(f.num_val.value), tolerance: Number(f.num_tol.value || 0) };
    } else if (t === 'fill_blank' || t === 'short_answer') {
      answer = { accepted: f.accepted_ans.value.split('|').map((x) => x.trim()).filter(Boolean) };
    } else if (t === 'descriptive') {
      const sc = Number(f.score.value || 1);
      answer = { model_answer: f.model_answer.value.trim(), rubric: [{ criterion: 'پاسخ کامل', points: sc }] };
    } else {
      answer = JSON.parse(f.raw_answer.value || '{}');
    }
    return {
      book_id: f.book_id.value,
      source: { primary_page: Number(f.primary_page.value), pages: [Number(f.primary_page.value)] },
      type: t,
      difficulty: Number(f.difficulty.value),
      topic: f.topic.value.trim(),
      score: Number(f.score.value || 1),
      estimated_time_seconds: Number(f.estimated_time_seconds.value || 60),
      status: f.status.value,
      stem: f.stem.value.trim(),
      options,
      answer,
      explanation: f.explanation.value.trim(),
      tags: f.tags.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean),
      content_flags: { has_image: f.has_image.checked, is_geometric: f.is_geometric.checked, has_formula: f.has_formula.checked || /\$[^$]+\$/.test(f.stem.value) },
    };
  };

  $('#edPreviewBtn', body).onclick = () => {
    const p = buildPayload();
    modal({
      title: 'پیش‌نمایش سؤال در پنل دانش‌آموز',
      body: `<div class="stack" style="gap:10px"><div class="small muted">صفحه ${fa(p.source.primary_page)} · ${TYPE_LABELS[p.type]} · ${fa(p.score)} نمره</div><div class="qb-stem-preview">${renderMathHtml(p.stem)}</div>${p.options.length ? `<div class="stack" style="gap:6px">${p.options.map((o, i) => `<div class="card flat" style="padding:8px 12px">${fa(i + 1)}) ${renderMathHtml(o.text)}</div>`).join('')}</div>` : ''}</div>`,
      actions: [{ label: 'بستن', cls: 'ghost', value: true }],
    });
  };

  $('#qbEditForm', body).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const payload = buildPayload();
      if (editId) await put(`/api/qb/questions/${editId}`, payload);
      else await post('/api/qb/questions', payload);
      toast(editId ? 'سؤال ویرایش شد' : 'سؤال با موفقیت ثبت شد', 'ok');
      location.hash = '#/question-bank/all';
    });
  };
}

async function renderImportWizard(body) {
  const books = await api('/api/qb/books');
  let valData = null;

  body.innerHTML = `
    <div class="card stack" style="gap:14px">
      <div class="row between wrap" style="gap:10px">
        <div><b>بارگذاری گروهی استاندارد سؤالات (Wizard نه‌مرحله‌ای)</b><div class="tiny muted">پشتیبانی از بسته ZIP استاندارد، JSON و اکسل (.xlsx) بدون نیاز به AI</div></div>
        <div class="row wrap" style="gap:6px">
          <a class="btn sm ghost" href="/api/qb/templates/question-package-example.zip" download>قالب ZIP</a>
          <a class="btn sm ghost" href="/api/qb/templates/question-bank-template.json" download>قالب JSON</a>
          <a class="btn sm ghost" href="/api/qb/templates/question-bank-template.xlsx" download>قالب Excel</a>
          <a class="btn sm ghost" href="/api/qb/templates/question-package.schema.json" download>JSON Schema</a>
        </div>
      </div>
      <div class="qb-steps">
        <span>۱. انتخاب کتاب</span><span>۲. بارگذاری فایل</span><span>۳. اعتبارسنجی</span><span>۴. تطبیق فصل/صفحه</span>
        <span>۵. پیش‌نمایش</span><span>۶. خطاها و تکراری‌ها</span><span>۷. تأیید معلم</span><span>۸. پیش‌نویس</span><span>۹. انتشار</span>
      </div>
      <div class="form-grid">
        <div class="field"><label>۱) انتخاب کتاب و نسخه</label><select class="input" id="impBook">${books.map((b) => `<option value="${esc(b.id)}" data-ed="${b.edition?.id || ''}">${esc(b.title)} (نسخه ${esc(b.edition?.edition_label || '1405')})</option>`).join('')}</select></div>
        <div class="field"><label>۲) فرمت فایل</label><select class="input" id="impFmt"><option value="zip">بسته استاندارد ZIP (همراه تصاویر)</option><option value="json">فایل JSON مستقل</option><option value="xlsx">فایل Excel (.xlsx)</option></select></div>
      </div>
      <label class="qb-drop" id="impDrop">
        <input type="file" id="impFile" accept=".zip,.json,.xlsx" hidden>
        <span>${icon('upload', { size: 24 })} فایل بسته سؤالات را اینجا بکشید یا کلیک کنید</span>
        <small class="muted" id="impFileName">هیچ فایلی انتخاب نشده است</small>
      </label>
      <div id="impProg" class="progress" hidden><i style="width:0%"></i></div>
      <div id="impResult"></div>
    </div>`;

  const fileIn = $('#impFile', body);
  const runFile = async (file) => {
    if (!file) return;
    $('#impFileName', body).textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    const ext = file.name.split('.').pop().toLowerCase();
    if (['zip', 'json', 'xlsx'].includes(ext)) $('#impFmt', body).value = ext;
    const prog = $('#impProg', body);
    prog.hidden = false; prog.querySelector('i').style.width = '45%';

    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const b64 = btoa(bin);

    const opt = $('#impBook', body).selectedOptions[0];
    valData = await post('/api/qb/import/validate', {
      book_id: opt.value,
      edition_id: Number(opt.dataset.ed) || undefined,
      format: $('#impFmt', body).value,
      filename: file.name,
      content_base64: b64,
    });
    prog.querySelector('i').style.width = '100%';
    paintValidation();
  };

  const paintValidation = () => {
    const s = valData.summary;
    $('#impResult', body).innerHTML = `
      <div class="stack" style="gap:12px;margin-top:8px">
        <div class="qb-kpis">
          <div class="card qb-kpi"><small>کل سؤالات فایل</small><b>${fa(s.total_count)}</b></div>
          <div class="card qb-kpi"><small>معتبر</small><b class="pos">${fa(s.valid_count)}</b></div>
          <div class="card qb-kpi"><small>نامعتبر</small><b class="neg">${fa(s.invalid_count)}</b></div>
          <div class="card qb-kpi"><small>تکراری</small><b>${fa(s.duplicate_count)}</b></div>
          <div class="card qb-kpi"><small>تصویر ناموجود</small><b>${fa(s.missing_assets_count)}</b></div>
          <div class="card qb-kpi"><small>صفحه نامعتبر</small><b>${fa(s.invalid_pages_count)}</b></div>
        </div>
        ${valData.errors.length ? `<div class="card flat"><div class="row between"><b>خطاهای ساختاری (${fa(valData.errors.length)})</b><a class="btn sm ghost" href="/api/qb/import/${valData.batch_id}/errors.csv" download>دانلود گزارش خطا (CSV)</a></div><ul class="small" style="margin:8px 0 0">${valData.errors.slice(0, 15).map((e) => `<li>ردیف ${fa(e.row_index)}: ${esc(e.message)}</li>`).join('')}</ul></div>` : ''}
        <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>متن سؤال (پیش‌نمایش)</th><th>صفحه</th><th>وضعیت اعتبارسنجی</th></tr></thead><tbody>
          ${valData.items.slice(0, 30).map((it) => `<tr>
            <td>${fa(it.row_index)}</td>
            <td>${renderMathHtml((it.question.stem || '').slice(0, 110))}</td>
            <td>${fa(it.question.source?.primary_page || '—')}</td>
            <td>${it.duplicate ? '<span class="badge orange">تکراری</span>' : (it.valid ? '<span class="badge green">معتبر</span>' : `<span class="badge red">${esc(it.errors[0]?.message || 'خطا')}</span>`)}</td>
          </tr>`).join('')}
        </tbody></table></div>
        <div class="row wrap" style="gap:8px">
          <label class="row small" style="gap:4px"><input type="checkbox" id="impSkipDup" checked> نادیده‌گرفتن سؤالات تکراری</label>
          <button class="btn soft" id="impDraftBtn" type="button">۸) ذخیره به‌صورت پیش‌نویس</button>
          <button class="btn green" id="impPubBtn" type="button">۹) ذخیره و انتشار گروهی</button>
        </div>
      </div>`;

    const commit = (autoPublish, btn) => busy(btn, async () => {
      const r = await post(`/api/qb/import/${valData.batch_id}/commit`, {
        skip_duplicates: $('#impSkipDup', body).checked,
        auto_publish: autoPublish,
      });
      toast(`${fa(r.imported_count)} سؤال با وضعیت «${autoPublish ? 'منتشرشده' : 'پیش‌نویس'}» وارد بانک شد`, 'ok');
      location.hash = autoPublish ? '#/question-bank/published' : '#/question-bank/pending';
    });
    $('#impDraftBtn', body).onclick = (e) => commit(false, e.currentTarget);
    $('#impPubBtn', body).onclick = (e) => commit(true, e.currentTarget);
  };

  fileIn.onchange = () => runFile(fileIn.files[0]);
  const drop = $('#impDrop', body);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); runFile(e.dataTransfer.files[0]); };
}

async function renderBooksList(body) {
  const books = await api('/api/qb/books');
  const isMgr = ['manager', 'admin'].includes(state.me.user.role);
  body.innerHTML = `
    ${isMgr ? `<div class="row between" style="margin-bottom:12px"><b>کتاب‌های درسی متصل به بانک سؤالات</b><button class="btn sm" id="newBookBtn">${icon('plus', { size: 15 })} ثبت کتاب جدید</button></div>` : ''}
    <div class="grid c3">${books.map((b) => `
      <a class="card ad-exam-card" href="#/qb-books/${esc(b.id)}" style="color:inherit">
        <div class="row between"><b>${esc(b.title)}</b><span class="badge blue">پایه ${gradeName(b.grade)}</span></div>
        <div class="tiny muted" style="margin:6px 0">کد: <code>${esc(b.book_code || b.id)}</code> · نسخه ${esc(b.edition?.edition_label || '1405')} · ${fa(b.chapters_count)} فصل</div>
        <div class="row between small" style="margin-top:8px"><span>${fa(b.published_count)} سؤال منتشرشده</span><b>پوشش ${fa(b.coverage_percent)}٪</b></div>
        <div class="progress green" style="margin-top:6px"><i style="width:${b.coverage_percent}%"></i></div>
      </a>`).join('') || empty('book', 'کتابی برای پایه/درس شما یافت نشد')}</div>`;

  $('#newBookBtn', body)?.addEventListener('click', () => {
    modal({
      title: 'ثبت کتاب درسی جدید',
      body: `<form id="nbForm" class="stack"><div class="form-grid">
        <div class="field"><label>عنوان کتاب</label><input class="input" name="title" required placeholder="مثلاً ریاضی ششم"></div>
        <div class="field"><label>کد کتاب</label><input class="input ltr" name="book_code" placeholder="MATH-06"></div>
        <div class="field"><label>پایه</label><select class="input" name="grade">${[4, 5, 6, 7, 8, 9].map((g) => `<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div>
        <div class="field"><label>درس</label><input class="input" name="subject_key" required value="ریاضی"></div>
        <div class="field"><label>تعداد صفحات چاپی</label><input class="input" type="number" name="printed_pages" value="150" min="1"></div>
        <div class="field"><label>اختلاف صفحه PDF</label><input class="input" type="number" name="pdf_offset" value="0"></div>
      </div></form>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
        label: 'ثبت کتاب', onClick: async (m) => {
          const f = $('#nbForm', m);
          await post('/api/qb/books', { title: f.title.value, book_code: f.book_code.value, grade: Number(f.grade.value), subject_key: f.subject_key.value, printed_pages: Number(f.printed_pages.value), pdf_offset: Number(f.pdf_offset.value) });
          toast('کتاب ثبت شد', 'ok'); renderBooksList(body);
        },
      }],
    });
  });
}

export async function qbBookDetailView(el, { id }) {
  const data = await api(`/api/qb/books/${encodeURIComponent(id)}`);
  const { book, edition, chapters, lessons, pages } = data;
  setHead(book.title, `پایه ${gradeName(book.grade)} · نسخه ${esc(edition?.edition_label || '1405')} · ${fa(edition?.printed_pages || 0)} صفحه`,
    `<a class="btn ghost sm" href="#/question-bank/books">→ همه کتاب‌ها</a> <a class="btn sm" href="#/question-bank/import">بارگذاری سؤال</a>`);

  el.innerHTML = `
    <div class="grid c3">
      <section class="card">
        <div class="row between"><div class="card-title" style="margin:0">فصل‌ها و درس‌ها</div><button class="btn sm soft" id="addChBtn">+ فصل</button></div>
        <div class="stack" style="gap:8px;margin-top:10px">${chapters.map((c) => `
          <div class="card flat" style="padding:10px">
            <div class="row between"><b>فصل ${fa(c.number)}: ${esc(c.title)}</b><span class="tiny muted">ص ${fa(c.printed_start)} تا ${fa(c.printed_end)}</span></div>
            <div class="tiny muted" style="margin-top:4px">${lessons.filter((l) => l.chapter_id === c.id).map((l) => `${esc(l.title)} (${fa(l.printed_start)}-${fa(l.printed_end)})`).join(' · ') || 'بدون درس ثبت‌شده'}</div>
          </div>`).join('') || '<div class="muted small">فصلی ثبت نشده است</div>'}</div>
        <div class="row wrap" style="gap:8px;margin-top:12px">
          <input class="input" id="offIn" type="number" value="${edition?.pdf_offset || 0}" style="width:90px">
          <button class="btn sm ghost" id="saveOffBtn" type="button">تنظیم اختلاف PDF</button>
        </div>
      </section>
      <section class="card span2">
        <div class="card-title">نقشه صفحات کتاب و وضعیت بانک سؤال</div>
        <div class="qb-page-grid">${pages.map((p) => {
          const s = p.stats;
          const cls = p.excluded ? 'excl' : (s.total > 0 ? 'cov' : 'empty');
          return `<button type="button" class="qb-pg-cell ${cls}" data-pg="${p.printed_page}" title="صفحه چاپی ${p.printed_page} (PDF ${p.pdf_page})">
            <b>${fa(p.printed_page)}</b>
            <small>${p.excluded ? 'مستثنا' : `${fa(s.total)} سؤال`}</small>
          </button>`;
        }).join('')}</div>
        <div id="pgInspector" style="margin-top:14px"></div>
      </section>
    </div>`;

  $('#saveOffBtn', el).onclick = async () => {
    await put(`/api/qb/books/${book.id}/pages`, { edition_id: edition.id, pdf_offset: Number($('#offIn', el).value) });
    toast('اختلاف شماره صفحات به‌روزرسانی شد', 'ok');
    qbBookDetailView(el, { id });
  };

  $('#addChBtn', el).onclick = () => {
    modal({
      title: 'افزودن / ویرایش فصل',
      body: `<form id="chForm" class="stack"><div class="form-grid">
        <div class="field"><label>شماره فصل</label><input class="input" type="number" name="number" min="1" value="${chapters.length + 1}" required></div>
        <div class="field"><label>عنوان فصل</label><input class="input" name="title" required></div>
        <div class="field"><label>از صفحه چاپی</label><input class="input" type="number" name="printed_start" min="1" required></div>
        <div class="field"><label>تا صفحه چاپی</label><input class="input" type="number" name="printed_end" min="1" required></div>
      </div></form>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
        label: 'ذخیره فصل', onClick: async (m) => {
          const f = $('#chForm', m);
          await post(`/api/qb/books/${book.id}/chapters`, { edition_id: edition.id, number: Number(f.number.value), title: f.title.value, printed_start: Number(f.printed_start.value), printed_end: Number(f.printed_end.value) });
          toast('فصل ثبت شد', 'ok'); qbBookDetailView(el, { id });
        },
      }],
    });
  };

  on(el, 'click', '[data-pg]', async (e, b) => {
    const pg = Number(b.dataset.pg);
    const pObj = pages.find((x) => x.printed_page === pg);
    const { rows } = await api(`/api/qb/questions?book_id=${encodeURIComponent(book.id)}&page=${pg}`);
    $('#pgInspector', el).innerHTML = `
      <div class="card flat">
        <div class="row between wrap" style="gap:8px">
          <b>صفحه چاپی ${fa(pg)} (صفحه PDF: ${fa(pObj?.pdf_page || pg)})</b>
          <div class="row" style="gap:6px">
            <button class="btn sm ghost" id="toggleExclBtn">${pObj?.excluded ? 'بازگشت به پوشش آموزشی' : 'مستثنا از پوشش (جلد/فهرست)'}</button>
            <a class="btn sm" href="#/question-bank/add">+ افزودن سؤال به این صفحه</a>
          </div>
        </div>
        <div class="tiny muted" style="margin:6px 0">کل: ${fa(pObj?.stats.total || 0)} · تستی: ${fa(pObj?.stats.test || 0)} · تشریحی: ${fa(pObj?.stats.descriptive || 0)} · تصویری: ${fa(pObj?.stats.visual || 0)} · تأیید/منتشرشده: ${fa(pObj?.stats.published || 0)}</div>
        ${rows.length ? `<div class="stack" style="gap:6px;margin-top:8px">${rows.map((q) => `<div class="card" style="padding:10px"><div class="row between"><span class="badge gray">${TYPE_LABELS[q.type]}</span><span class="tiny muted">دشواری ${fa(q.difficulty)}</span></div><div style="margin-top:6px">${renderMathHtml(q.stem)}</div></div>`).join('')}</div>` : '<div class="small muted">هنوز سؤالی برای این صفحه ثبت نشده است.</div>'}
      </div>`;
    $('#toggleExclBtn', el).onclick = async () => {
      await put(`/api/qb/books/${book.id}/pages`, { edition_id: edition.id, pages: [{ printed_page: pg, excluded: !pObj.excluded, exclude_reason: !pObj.excluded ? 'غیرآموزشی' : null }] });
      toast('وضعیت صفحه به‌روزرسانی شد', 'ok');
      qbBookDetailView(el, { id });
    };
  });
}

async function renderOfficialExams(body) {
  const [books, exams, ov] = await Promise.all([
    api('/api/qb/books'),
    api('/api/qb/exams'),
    api('/api/teacher/overview').catch(() => ({ classes: [] })),
  ]);
  const classes = ov?.classes || [];
  body.innerHTML = `
    <div class="grid c3">
      <form id="offExForm" class="card stack">
        <div class="card-title">ساخت آزمون رسمی از بانک سؤالات</div>
        <div class="field"><label>عنوان آزمون</label><input class="input" name="title" required placeholder="آزمون رسمی فصل اول"></div>
        <div class="field"><label>کتاب</label><select class="input" name="book_id">${books.map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('')}</select></div>
        <div class="field"><label>کلاس</label><select class="input" name="class_id"><option value="">همه کلاس‌ها</option>${classes.map((c) => `<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="form-grid">
          <div class="field"><label>تعداد سؤال</label><input class="input" type="number" name="question_count" value="15" min="1" max="50"></div>
          <div class="field"><label>مدت (دقیقه)</label><input class="input" type="number" name="duration_minutes" value="30" min="5"></div>
          <div class="field"><label>سطح</label><select class="input" name="difficulty_mode"><option value="mixed">ترکیبی</option><option value="easy">آسان</option><option value="medium">متوسط</option><option value="hard">سخت</option></select></div>
          <div class="field"><label>تاریخ پایان (شمسی)</label>${dateField('offEnd', null, { minYear: 1404, maxYear: 1406 })}</div>
        </div>
        <label class="row small" style="gap:6px"><input type="checkbox" name="include_descriptive" checked> شامل سؤالات تشریحی</label>
        <button class="btn" type="submit">ساخت و انتشار آزمون رسمی</button>
      </form>
      <section class="card span2">
        <div class="card-title">آزمون‌های رسمی ساخته‌شده</div>
        <div class="stack" style="gap:8px">${exams.map((e) => `
          <div class="card flat row between wrap" style="padding:12px;gap:8px">
            <div><b>${esc(e.title)}</b><div class="tiny muted">${esc(e.book_title)} · ${fa(e.question_count)} سؤال · ${fa(e.submitted_count || 0)} شرکت‌کننده</div></div>
            <button class="btn sm soft" data-subs="${e.id}" type="button">تصحیح و کارنامه‌ها</button>
          </div>`).join('') || '<div class="muted small">هنوز آزمون رسمی ساخته نشده است</div>'}</div>
      </section>
    </div>`;

  $('#offExForm', body).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    busy(e.submitter, async () => {
      const endD = readDate(body, 'offEnd');
      await post('/api/qb/exams/build', {
        mode: 'official',
        title: f.title.value.trim(),
        book_id: f.book_id.value,
        class_id: f.class_id.value ? Number(f.class_id.value) : null,
        question_count: Number(f.question_count.value),
        duration_minutes: Number(f.duration_minutes.value),
        difficulty_mode: f.difficulty_mode.value,
        include_descriptive: f.include_descriptive.checked,
        ends_at: endD ? tehranIso(endD, '23:59') : null,
      });
      toast('آزمون رسمی ساخته و منتشر شد', 'ok');
      renderOfficialExams(body);
    });
  };

  on(body, 'click', '[data-subs]', async (e, b) => {
    const subs = await api(`/api/qb/exams/${b.dataset.subs}/submissions`);
    modal({
      title: 'برگه‌های ارسالی دانش‌آموزان',
      wide: true,
      body: subs.length ? `<div class="stack" style="gap:8px">${subs.map((s) => `
        <div class="card flat row between wrap" style="padding:10px">
          <div><b>${esc(s.student_name)}</b><div class="tiny muted">خودکار: ${fa(s.auto_score)} · کل: ${fa(s.total_score)} / ${fa(s.max_score)} (${fa(s.percent)}٪)</div></div>
          <button class="btn sm" data-gradeatt="${s.id}" type="button">${s.pending_count ? `تصحیح (${fa(s.pending_count)} تشریحی)` : 'مشاهده کارنامه'}</button>
        </div>`).join('')}</div>` : '<div class="muted">هنوز دانش‌آموزی شرکت نکرده است</div>',
      onOpen: (m) => {
        on(m, 'click', '[data-gradeatt]', async (ev, gb) => {
          const rep = await api(`/api/qb/attempts/${gb.dataset.gradeatt}/report`);
          const desc = rep.items.filter((it) => it.type === 'descriptive');
          if (!desc.length) return toast(`نمره نهایی: ${fa(rep.attempt.percent)}٪`, 'ok');
          modal({
            title: 'تصحیح سؤالات تشریحی',
            body: `<form id="grForm" class="stack">${desc.map((d) => `<div class="card flat"><div class="small bold">${renderMathHtml(d.stem)}</div><p class="small" style="margin:6px 0">پاسخ دانش‌آموز: ${esc(d.student_answer || '—')}</p><div class="field"><label>نمره (حداکثر ${fa(d.grading.max_score)})</label><input class="input" type="number" step="0.25" min="0" max="${d.grading.max_score}" name="sc_${d.question_id}" value="${d.grading.score || 0}"></div></div>`).join('')}</form>`,
            actions: [{ label: 'انصراف', cls: 'ghost', value: false }, {
              label: 'ثبت نمره نهایی', onClick: async (gm) => {
                const manual_scores = {};
                desc.forEach((d) => { manual_scores[d.question_id] = Number($(`[name=sc_${d.question_id}]`, gm).value); });
                await post(`/api/qb/attempts/${gb.dataset.gradeatt}/grade`, { manual_scores });
                toast('تصحیح تشریحی ثبت شد', 'ok');
              },
            }],
          });
        });
      },
      actions: [{ label: 'بستن', cls: 'ghost', value: true }],
    });
  });
}

async function renderCoverageReport(body) {
  const books = await api('/api/qb/books');
  if (!books.length) { body.innerHTML = empty('book', 'کتابی ثبت نشده است'); return; }
  const cov = await api(`/api/qb/books/${encodeURIComponent(books[0].id)}/coverage`);
  const s = cov.summary;
  body.innerHTML = `
    <section class="card">
      <div class="row between wrap" style="gap:10px;margin-bottom:12px">
        <div class="card-title" style="margin:0">گزارش پوشش صفحه‌به‌صفحه</div>
        <select class="input" id="covBook" style="width:240px">${books.map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('')}</select>
      </div>
      <div id="covBox"></div>
    </section>`;
  const paint = (c) => {
    const sm = c.summary;
    $('#covBox', body).innerHTML = `
      <div class="qb-kpis" style="margin-bottom:14px">
        <div class="card qb-kpi"><small>صفحات آموزشی</small><b>${fa(sm.educational_pages)}</b></div>
        <div class="card qb-kpi"><small>پوشش‌داده‌شده</small><b class="pos">${fa(sm.covered_pages)}</b></div>
        <div class="card qb-kpi"><small>بدون سؤال</small><b class="neg">${fa(sm.uncovered_pages)}</b></div>
        <div class="card qb-kpi"><small>درصد پوشش</small><b>${fa(sm.coverage_percent)}٪</b></div>
      </div>
      <div class="qb-page-grid">${c.pages.map((p) => `<div class="qb-pg-cell ${p.excluded ? 'excl' : (p.total ? 'cov' : 'empty')}"><b>${fa(p.printed_page)}</b><small>${p.excluded ? 'مستثنا' : `${fa(p.total)} سؤال`}</small></div>`).join('')}</div>`;
  };
  paint(cov);
  $('#covBook', body).onchange = async (e) => paint(await api(`/api/qb/books/${encodeURIComponent(e.target.value)}/coverage`));
}

async function renderImportHistory(body) {
  const rows = await api('/api/qb/import/batches');
  body.innerHTML = `<section class="card">${rows.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>فایل</th><th>کتاب</th><th>فرمت</th><th>کل / معتبر / تکراری / واردشده</th><th>خطاها</th></tr></thead>
    <tbody>${rows.map((b) => `<tr>
      <td><b>${esc(b.filename)}</b><div class="tiny muted">${esc(b.owner_name || '')}</div></td>
      <td>${esc(b.book_title)}</td>
      <td><span class="badge gray">${esc(b.format.toUpperCase())}</span></td>
      <td>${fa(b.total_count)} / <span class="pos">${fa(b.valid_count)}</span> / ${fa(b.duplicate_count)} / <b>${fa(b.imported_count)}</b></td>
      <td>${b.invalid_count ? `<a class="btn sm ghost" href="/api/qb/import/${b.id}/errors.csv" download>گزارش خطا (${fa(b.invalid_count)})</a>` : '—'}</td>
    </tr>`).join('')}</tbody></table></div>` : empty('inbox', 'هنوز بارگذاری گروهی انجام نشده است')}</section>`;
}
