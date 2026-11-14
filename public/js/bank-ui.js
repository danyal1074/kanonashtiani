// بانک سؤال مرکزی (معلم و مدیر): کتاب ← فصل ← مبحث، سؤال متنی/تصویری، بازبینی و انتشار، تاریخچهٔ نسخه‌ها.
import { api, post, put, esc, fa, $, on, toast, busy, modal, setHead, empty, jdate, icon, gradeName, fileToData } from './core.js';

const DIFF = { easy: 'آسان', medium: 'متوسط', hard: 'دشوار' };
const STATUS = { draft: ['پیش‌نویس', 'gray'], review: ['در انتظار بازبینی', 'orange'], published: ['منتشرشده', 'green'], rejected: ['ردشده', 'red'], archived: ['بایگانی', 'gray'] };
const NEXT = { draft: [['review', 'ارسال برای بازبینی'], ['published', 'انتشار'], ['archived', 'بایگانی']], review: [['published', 'تأیید و انتشار'], ['rejected', 'رد'], ['draft', 'بازگشت به پیش‌نویس']], rejected: [['draft', 'بازگشت به پیش‌نویس'], ['archived', 'بایگانی']], published: [['archived', 'بایگانی']], archived: [] };
const badge = (s) => { const [t, c] = STATUS[s] || [s, 'gray']; return `<span class="badge ${c}">${t}</span>`; };
const opt = (v, cur, t) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(t)}</option>`;
const FLAGS = { ambiguous: 'احتمال ابهام یا بیش از یک پاسخ', page_out_of_range: 'شمارهٔ صفحه خارج از بازه بود و حذف شد', no_evidence: 'شاهد متنی ارائه نشد', visual_needs_image: 'سؤال تصویری؛ تصویر شکل را خودتان بارگذاری کنید' };
const aiFlags = (q) => { if (!q.ai_generated) return ''; let f = []; try { f = JSON.parse(q.ai_flags || '[]'); } catch { /* */ } return `<div class="tiny" style="margin-top:4px"><span class="badge orange">پیش‌نویس هوش مصنوعی — پیش از انتشار درستی پاسخ و صفحهٔ منبع را بررسی کنید</span>${f.map((x) => ` <span class="badge red">${FLAGS[x] || esc(x)}</span>`).join('')}${q.source_ref ? `<div class="muted">شاهد: «${esc(q.source_ref)}»</div>` : ''}</div>`; };
const qs = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

export async function bankView(el, _p, me) {
  setHead('بانک سؤال', 'سؤال‌های چهارگزینه‌ای متنی و تصویری با کتاب، فصل و مبحث؛ فقط سؤال منتشرشده در تمرین و آزمون استفاده می‌شود',
    '<button class="btn sm" id="bkNewQ">سؤال جدید</button> <button class="btn sm soft" id="bkAi">تولید پیش‌نویس با هوش مصنوعی</button> <button class="btn sm ghost" id="bkBooks">کتاب‌ها و مباحث</button>');
  const f = qs();
  const [books, list] = await Promise.all([api('/api/bank/books'), api(`/api/bank/questions?${new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()}`)]);
  const topicsOf = (bookId) => (books.find((b) => b.id === Number(bookId))?.chapters || []).flatMap((c) => c.topics.map((t) => ({ ...t, label: `${c.title} ← ${t.title}` })));
  el.innerHTML = `<form class="card row no-print" id="bkFilter" style="gap:8px;flex-wrap:wrap;margin-bottom:12px" aria-label="فیلتر سؤال‌ها">
    <select class="input" name="grade" aria-label="پایه" style="max-width:130px">${opt('', f.grade, 'همه پایه‌ها')}${[4, 5, 6, 7, 8, 9].map((g) => opt(g, f.grade, gradeName(g))).join('')}</select>
    <select class="input" name="book_id" aria-label="کتاب" style="max-width:220px">${opt('', f.book_id, 'همه کتاب‌ها')}${books.map((b) => opt(b.id, f.book_id, `${b.title} (${gradeName(b.grade)})`)).join('')}</select>
    <select class="input" name="topic_id" aria-label="مبحث" style="max-width:240px">${opt('', f.topic_id, 'همه مباحث')}${topicsOf(f.book_id).map((t) => opt(t.id, f.topic_id, t.label)).join('')}</select>
    <select class="input" name="difficulty" aria-label="دشواری" style="max-width:120px">${opt('', f.difficulty, 'همه سطوح')}${Object.entries(DIFF).map(([k, v]) => opt(k, f.difficulty, v)).join('')}</select>
    <select class="input" name="status" aria-label="وضعیت" style="max-width:160px">${opt('', f.status, 'همه وضعیت‌ها')}${Object.entries(STATUS).map(([k, [v]]) => opt(k, f.status, v)).join('')}</select>
    <input class="input" name="q" placeholder="جست‌وجو در متن" value="${esc(f.q || '')}" style="max-width:200px" aria-label="جست‌وجو">
    <label class="row small" style="gap:4px"><input type="checkbox" name="mine" value="1" ${f.mine ? 'checked' : ''}> فقط سؤال‌های من</label><label class="row small" style="gap:4px"><input type="checkbox" name="ai" value="1" ${f.ai ? 'checked' : ''}> فقط تولید هوش مصنوعی</label><button class="btn sm">اعمال</button></form>
    <div class="small muted" style="margin-bottom:8px">${fa(list.length)} سؤال${list.length >= 500 ? ' (۵۰۰ مورد اول)' : ''}</div>
    ${list.length ? `<div class="stack">${list.map((q) => `<article class="card" data-qid="${q.id}"><div class="row between" style="gap:8px;flex-wrap:wrap"><div class="row" style="gap:6px;flex-wrap:wrap">${badge(q.status)}<span class="badge">${DIFF[q.difficulty]}</span><span class="tiny muted">${gradeName(q.grade)} · ${esc(q.subject)}${q.book_title ? ` · ${esc(q.book_title)}` : ''}${q.topic_title ? ` · ${esc(q.topic_title)}` : ''} · نسخهٔ ${fa(q.version)} · ${esc(q.author || '')}${q.ai_generated ? ' · <b>تولید هوش مصنوعی</b>' : ''}</span></div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" data-edit="${q.id}">${icon('edit', { size: 15 })} ویرایش</button>${(NEXT[q.status] || []).map(([s, l]) => `<button class="btn sm ${s === 'published' ? 'green' : s === 'rejected' ? 'danger' : 'soft'}" data-st="${q.id}" data-to="${s}">${l}</button>`).join('')}<button class="btn sm ghost" data-hist="${q.id}">نسخه‌ها</button></div></div>
      <p style="margin:8px 0"><b>${esc(q.text)}</b></p>${q.image ? `<img src="${esc(q.image)}" alt="تصویر سؤال" loading="lazy" style="max-height:160px;border-radius:10px">` : ''}
      <ol class="small" style="padding-inline-start:22px;margin:4px 0">${q.options.map((o, k) => `<li style="${k === q.correct_option ? 'font-weight:800;color:var(--green-600)' : ''}">${esc(o)}${k === q.correct_option ? ' ✓' : ''}</li>`).join('')}</ol>
      ${q.explanation ? `<div class="tiny muted">${esc(q.explanation)}</div>` : ''}${q.review_note ? `<div class="tiny red-t">یادداشت بازبینی: ${esc(q.review_note)}</div>` : ''}${aiFlags(q)}<div class="tiny muted">${q.source_page ? `منبع: صفحهٔ ${fa(q.source_page)} ` : ''}${q.exam_uses ? `· در ${fa(q.exam_uses)} آزمون رسمی` : ''} · ${q.practice_allowed ? 'قابل تمرین' : 'فقط آزمون رسمی'} · استفاده: ${fa(q.usage_count)}</div></article>`).join('')}</div>` : empty('book', 'سؤالی با این فیلتر نیست؛ با «سؤال جدید» شروع کنید')}`;

  $('#bkFilter', el).onsubmit = (e) => { e.preventDefault(); const p = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v)); location.hash = `#/bank?${p}`; };
  $('#bkFilter [name=book_id]', el).onchange = (e) => { const t = $('#bkFilter [name=topic_id]', el); t.innerHTML = opt('', '', 'همه مباحث') + topicsOf(e.target.value).map((x) => opt(x.id, '', x.label)).join(''); };
  const reload = () => bankView(el, _p, me);
  $('#bkNewQ').onclick = () => questionModal({ books, reload });
  $('#bkBooks').onclick = () => booksModal(books, reload);
  $('#bkAi').onclick = () => aiModal(books, reload);
  on(el, 'click', '[data-edit]', async (_e, b) => questionModal({ books, reload, q: await api(`/api/bank/questions/${b.dataset.edit}`) }));
  on(el, 'click', '[data-st]', (_e, b) => {
    const go = (note) => busy(b, async () => { await post(`/api/bank/questions/${b.dataset.st}/status`, { status: b.dataset.to, note }); toast('وضعیت به‌روز شد', 'ok'); reload(); });
    if (b.dataset.to !== 'rejected') return go();
    modal({ title: 'رد سؤال', body: '<form id="rjF"><div class="field"><label for="rjN">علت رد (برای نویسنده نمایش داده می‌شود)</label><textarea class="input" id="rjN" name="note" required maxlength="300"></textarea></div></form>',
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'رد سؤال', cls: 'danger', onClick: async (m) => { const f = $('#rjF', m); if (!f.reportValidity()) return false; await post(`/api/bank/questions/${b.dataset.st}/status`, { status: 'rejected', note: f.note.value }); reload(); } }] });
  });
  on(el, 'click', '[data-hist]', async (_e, b) => {
    const q = await api(`/api/bank/questions/${b.dataset.hist}`);
    modal({ title: `تاریخچهٔ نسخه‌های سؤال ${fa(q.id)}`, wide: true, body: q.versions.map((v) => `<div class="card" style="margin-bottom:8px"><b>نسخهٔ ${fa(v.version)}</b> <span class="tiny muted">${jdate(v.created_at)}</span><p class="small">${esc(v.snapshot.text)}</p><ol class="tiny" style="padding-inline-start:20px">${(v.snapshot.options || []).map((o, k) => `<li style="${k === v.snapshot.correct_option ? 'font-weight:800' : ''}">${esc(o)}</li>`).join('')}</ol></div>`).join(''), actions: [{ label: 'بستن', cls: 'ghost' }] });
  });
}

function questionModal({ books, reload, q = null }) {
  const cur = q || { grade: books[0]?.grade || 7, subject: books[0]?.subject || '', options: ['', '', '', ''], correct_option: 0, difficulty: 'medium', practice_allowed: 1 };
  let image = undefined;
  const bookOpts = (grade, subject, sel) => opt('', sel, '— بدون کتاب —') + books.filter((b) => b.grade === Number(grade) && (!subject || b.subject === subject)).map((b) => opt(b.id, sel, b.title)).join('');
  const topicOpts = (bookId, sel) => opt('', sel, '— بدون مبحث —') + (books.find((b) => b.id === Number(bookId))?.chapters || []).flatMap((c) => c.topics.map((t) => opt(t.id, sel, `${c.title} ← ${t.title}`))).join('');
  return modal({
    title: q ? `ویرایش سؤال ${fa(q.id)}${q.status === 'published' ? ' (پس از ذخیره دوباره بازبینی می‌شود)' : ''}` : 'سؤال جدید', wide: true,
    body: `<form class="stack" id="qForm"><div class="grid c3"><div class="field"><label for="qG">پایه</label><select class="input" id="qG" name="grade">${[4, 5, 6, 7, 8, 9].map((g) => opt(g, cur.grade, gradeName(g))).join('')}</select></div>
      <div class="field"><label for="qS">درس</label><input class="input" id="qS" name="subject" required maxlength="40" value="${esc(cur.subject)}" list="qSubs"><datalist id="qSubs">${[...new Set(books.map((b) => b.subject))].map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="field"><label for="qD">دشواری</label><select class="input" id="qD" name="difficulty">${Object.entries(DIFF).map(([k, v]) => opt(k, cur.difficulty, v)).join('')}</select></div></div>
      <div class="grid c2"><div class="field"><label for="qB">کتاب</label><select class="input" id="qB" name="book_id">${bookOpts(cur.grade, cur.subject, cur.book_id)}</select></div><div class="field"><label for="qT">مبحث</label><select class="input" id="qT" name="topic_id">${topicOpts(cur.book_id, cur.topic_id)}</select></div></div>
      <div class="field"><label for="qX">متن سؤال</label><textarea class="input" id="qX" name="text" rows="3" required maxlength="2000">${esc(cur.text || '')}</textarea></div>
      <div class="field"><label for="qI">تصویر سؤال (اختیاری؛ PNG/JPEG/WebP تا ۲ مگابایت)</label><input class="input" type="file" id="qI" accept="image/png,image/jpeg,image/webp">${cur.image ? `<div class="row small" style="gap:8px;margin-top:6px"><img src="${esc(cur.image)}" alt="تصویر فعلی" style="max-height:80px"><label><input type="checkbox" id="qIRm"> حذف تصویر</label></div>` : ''}</div>
      <fieldset class="stack" style="border:0;padding:0"><legend class="small bold">گزینه‌ها (گزینهٔ درست را علامت بزنید)</legend>${[0, 1, 2, 3].map((k) => `<div class="row" style="gap:8px"><input type="radio" name="correct_option" value="${k}" ${cur.correct_option === k ? 'checked' : ''} aria-label="گزینهٔ ${fa(k + 1)} درست است"><input class="input grow" name="opt${k}" required maxlength="500" placeholder="گزینهٔ ${fa(k + 1)}" value="${esc(cur.options[k] || '')}"></div>`).join('')}</fieldset>
      <div class="field"><label for="qE">پاسخ تشریحی (در حالت یادگیری نمایش داده می‌شود)</label><textarea class="input" id="qE" name="explanation" rows="2" maxlength="2000">${esc(cur.explanation || '')}</textarea></div>
      <div class="grid c2"><div class="field"><label for="qP">صفحهٔ منبع</label><input class="input ltr" id="qP" name="source_page" inputmode="numeric" value="${cur.source_page ?? ''}"></div><label class="row small" style="gap:6px;align-self:end"><input type="checkbox" name="practice_allowed" ${cur.practice_allowed ? 'checked' : ''}> قابل استفاده در تمرین آزاد</label></div>
      ${q ? '' : `<div class="field"><label for="qSt">وضعیت پس از ذخیره</label><select class="input" id="qSt" name="status">${opt('draft', 'draft', 'پیش‌نویس')}${opt('review', '', 'ارسال برای بازبینی')}${opt('published', '', 'انتشار مستقیم')}</select></div>`}</form>`,
    onOpen: (m) => {
      const f = $('#qForm', m);
      const syncBooks = () => { f.book_id.innerHTML = bookOpts(f.grade.value, f.subject.value, f.book_id.value); f.topic_id.innerHTML = topicOpts(f.book_id.value, f.topic_id.value); };
      f.grade.onchange = syncBooks; f.subject.onchange = syncBooks; f.book_id.onchange = () => { f.topic_id.innerHTML = topicOpts(f.book_id.value, ''); };
      $('#qI', m).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { toast('حجم تصویر بیش از ۲ مگابایت است', 'err'); e.target.value = ''; return; } image = await fileToData(file); };
    },
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره سؤال', onClick: async (m) => {
      const f = $('#qForm', m);
      if (!f.reportValidity()) return false;
      if (!f.querySelector('[name=correct_option]:checked')) { toast('گزینهٔ درست را مشخص کنید', 'err'); return false; }
      const body = { grade: Number(f.grade.value), subject: f.subject.value.trim(), difficulty: f.difficulty.value, book_id: f.book_id.value ? Number(f.book_id.value) : null, topic_id: f.topic_id.value ? Number(f.topic_id.value) : null, chapter_id: null,
        text: f.text.value, options: [0, 1, 2, 3].map((k) => f[`opt${k}`].value), correct_option: Number(f.querySelector('[name=correct_option]:checked').value), explanation: f.explanation.value, source_page: f.source_page.value, practice_allowed: f.practice_allowed.checked };
      if (image) body.image_file = image.data ? image : { data: image };
      if ($('#qIRm', m)?.checked) body.image = null;
      if (q) { const r = await put(`/api/bank/questions/${q.id}`, body); toast(`ذخیره شد (نسخهٔ ${fa(r.version)})`, 'ok'); } else { await post('/api/bank/questions', { ...body, status: f.status.value }); toast('سؤال ثبت شد', 'ok'); }
      reload();
    } }],
  });
}

function booksModal(books, reload) {
  return modal({
    title: 'کتاب‌ها، فصل‌ها و مباحث', wide: true,
    body: `<form class="row" id="bkF" style="gap:6px;flex-wrap:wrap;margin-bottom:12px"><select class="input" name="grade" aria-label="پایه" style="max-width:120px">${[4, 5, 6, 7, 8, 9].map((g) => opt(g, 7, gradeName(g))).join('')}</select><input class="input" name="subject" required placeholder="درس" maxlength="40" style="max-width:140px"><input class="input grow" name="title" required placeholder="عنوان کتاب" maxlength="150"><button class="btn sm">افزودن کتاب</button></form>
      ${books.length ? books.map((b) => `<section class="card" style="margin-bottom:8px"><b>${esc(b.title)}</b> <span class="tiny muted">${gradeName(b.grade)} · ${esc(b.subject)} · ${fa(b.practice_questions)} سؤال قابل تمرین</span>
        <ul style="margin:6px 0;padding-inline-start:18px">${b.chapters.map((c) => `<li><b class="small">${esc(c.title)}</b><ul style="padding-inline-start:16px">${c.topics.map((t) => `<li class="small">${esc(t.title)} <span class="tiny muted">(${fa(t.practice_questions)})</span></li>`).join('')}</ul>
          <form class="row" data-topic="${c.id}" style="gap:6px"><input class="input" name="title" required maxlength="150" placeholder="مبحث جدید" aria-label="مبحث جدید در ${esc(c.title)}"><button class="btn sm ghost">افزودن مبحث</button></form></li>`).join('')}</ul>
        <form class="row" data-chapter="${b.id}" style="gap:6px"><input class="input" name="title" required maxlength="150" placeholder="فصل جدید" aria-label="فصل جدید در ${esc(b.title)}"><button class="btn sm ghost">افزودن فصل</button></form></section>`).join('') : empty('book', 'هنوز کتابی ثبت نشده')}`,
    onOpen: (m) => {
      const done = (close) => { toast('ذخیره شد', 'ok'); close(); reload(); };
      $('#bkF', m).onsubmit = (e) => { e.preventDefault(); const f = e.target; busy(e.submitter, async () => { await post('/api/bank/books', { grade: Number(f.grade.value), subject: f.subject.value, title: f.title.value }); done(() => m.closest('.modal-back').remove()); }); };
      on(m, 'submit', 'form[data-chapter]', (e, f) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/bank/books/${f.dataset.chapter}/chapters`, { title: f.title.value }); done(() => m.closest('.modal-back').remove()); }); });
      on(m, 'submit', 'form[data-topic]', (e, f) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/bank/chapters/${f.dataset.topic}/topics`, { title: f.title.value }); done(() => m.closest('.modal-back').remove()); }); });
    },
    actions: [{ label: 'بستن', cls: 'ghost' }],
  });
}

// ---------- تولید پیش‌نویس با هوش مصنوعی ----------
async function aiModal(books, reload) {
  const [st, sources, jobs] = await Promise.all([api('/api/bank/ai/status'), api('/api/bank/ai/sources'), api('/api/bank/ai/jobs')]);
  const JOB = { queued: ['در صف', 'gray'], running: ['در حال تولید', 'blue'], succeeded: ['انجام شد', 'green'], failed: ['ناموفق', 'red'] };
  const topics = books.flatMap((b) => b.chapters.flatMap((c) => c.topics.map((t) => ({ ...t, label: `${b.title} ← ${c.title} ← ${t.title}`, grade: b.grade, subject: b.subject }))));
  let timer = null;
  return modal({
    title: 'تولید پیش‌نویس سؤال از کتاب', wide: true,
    body: `${st.enabled ? `<div class="badge green">سرویس فعال (${esc(st.model || '')}) — امروز ${fa(st.used_today)} از ${fa(st.daily_limit)} درخواست</div>` : `<div class="card tint-pink" role="status"><b>تولید با هوش مصنوعی روی این سرور فعال نیست.</b><div class="small">${esc(st.reason || '')}</div><div class="tiny muted">مدیر فنی باید کلید سرویس و بستهٔ رسمی آن را روی سرور تنظیم کند (راهنما: docs/ai-questions.md).</div></div>`}
      <p class="tiny muted">فقط کتاب‌هایی را بارگذاری کنید که مجوز استفادهٔ آموزشی از آن‌ها را دارید. فایل خارج از دسترس عمومی نگه داشته می‌شود. همهٔ سؤال‌ها به‌صورت «در انتظار بازبینی» ذخیره می‌شوند و تا تأیید شما منتشر نمی‌شوند.</p>
      <div class="grid c2"><form class="card stack" id="aiSrc"><div class="card-title">۱. بارگذاری منبع (PDF تا ۸ مگابایت)</div><div class="field"><label for="aiT">عنوان</label><input class="input" id="aiT" name="title" required maxlength="150"></div>
        <div class="field"><label for="aiF">فایل PDF</label><input class="input" type="file" id="aiF" accept="application/pdf" required></div><label class="row small" style="gap:6px"><input type="checkbox" name="rights" required> مجوز استفادهٔ آموزشی از این کتاب را دارم</label><button class="btn sm">بارگذاری</button></form>
      <form class="card stack" id="aiJob"><div class="card-title">۲. درخواست تولید</div>
        <div class="field"><label for="aiS">منبع</label><select class="input" id="aiS" name="source_id" required>${sources.map((x) => `<option value="${x.id}" data-pages="${x.pages}">${esc(x.title)} (${fa(x.pages)} صفحه)</option>`).join('') || '<option value="">ابتدا منبع بارگذاری کنید</option>'}</select></div>
        <div class="field"><label for="aiTopic">مبحث (پایه و درس از کتاب گرفته می‌شود)</label><select class="input" id="aiTopic" name="topic_id" required>${topics.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('') || '<option value="">ابتدا کتاب و مبحث تعریف کنید</option>'}</select></div>
        <div class="grid c3"><div class="field"><label for="aiPf">از صفحه</label><input class="input ltr" id="aiPf" name="page_from" inputmode="numeric" required value="1"></div><div class="field"><label for="aiPt">تا صفحه</label><input class="input ltr" id="aiPt" name="page_to" inputmode="numeric" required value="5"></div><div class="field"><label for="aiN">تعداد</label><input class="input ltr" id="aiN" name="count" inputmode="numeric" required value="5"></div></div>
        <div class="grid c2"><div class="field"><label for="aiD">دشواری</label><select class="input" id="aiD" name="difficulty">${Object.entries(DIFF).map(([k, v]) => opt(k, 'medium', v)).join('')}</select></div><label class="row small" style="gap:6px;align-self:end"><input type="checkbox" name="include_visual"> سؤال‌های تصویری/هوش</label></div>
        <button class="btn sm green" ${st.enabled && sources.length && topics.length ? '' : 'disabled'}>تولید پیش‌نویس</button></form></div>
      <div class="card" style="margin-top:12px"><div class="card-title">درخواست‌ها</div><div id="aiJobs">${jobsHtml(jobs)}</div></div>`,
    onOpen: (m) => {
      const refresh = async () => { const list = await api('/api/bank/ai/jobs'); $('#aiJobs', m).innerHTML = jobsHtml(list); if (!list.some((j) => ['queued', 'running'].includes(j.status))) { clearInterval(timer); timer = null; } };
      const poll = () => { if (!timer) timer = setInterval(() => { if (!document.body.contains(m)) return clearInterval(timer); refresh().catch(() => {}); }, 3000); };
      if (jobs.some((j) => ['queued', 'running'].includes(j.status))) poll();
      $('#aiSrc', m).onsubmit = (e) => { e.preventDefault(); const f = e.target; busy(e.submitter, async () => {
        const file = f.querySelector('#aiF').files[0];
        if (!file || file.size > 8 * 1024 * 1024) throw new Error('یک فایل PDF تا ۸ مگابایت انتخاب کنید');
        const data = await fileToData(file, 8);
        const r = await post('/api/bank/ai/sources', { title: f.title.value, rights_confirmed: f.rights.checked, file: data });
        toast(r.existing ? 'این فایل قبلاً بارگذاری شده بود' : `منبع با ${fa(r.pages)} صفحه ذخیره شد`, 'ok'); m.closest('.modal-back').remove(); aiModal(books, reload);
      }); };
      $('#aiJob', m).onsubmit = (e) => { e.preventDefault(); const f = e.target; busy(e.submitter, async () => {
        const t = topics.find((x) => x.id === Number(f.topic_id.value));
        await post('/api/bank/ai/jobs', { source_id: Number(f.source_id.value), topic_id: t.id, grade: t.grade, subject: t.subject, page_from: f.page_from.value, page_to: f.page_to.value, count: f.count.value, difficulty: f.difficulty.value, include_visual: f.include_visual.checked });
        toast('درخواست ثبت شد؛ نتیجه چند دقیقه دیگر آماده می‌شود', 'ok'); await refresh(); poll();
      }); };
      on(m, 'click', '[data-review]', () => { m.closest('.modal-back').remove(); location.hash = '#/bank?ai=1&status=review'; });
    },
    actions: [{ label: 'بستن', cls: 'ghost', onClick: async () => { clearInterval(timer); reload(); } }],
  });
  function jobsHtml(list) {
    return list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>منبع</th><th>درخواست</th><th>وضعیت</th><th>نتیجه</th><th>زمان</th></tr></thead><tbody>${list.map((j) => { const [t, c] = JOB[j.status] || [j.status, 'gray']; return `<tr><td>${esc(j.source_title || '')}</td><td class="small">${fa(j.params.count)} سؤال · صفحه ${fa(j.params.page_from)}–${fa(j.params.page_to)} · ${esc(j.params.topic || j.params.subject)}</td><td><span class="badge ${c}">${t}</span>${j.error ? `<div class="tiny red-t">${esc(j.error)}</div>` : ''}</td><td class="small">${j.status === 'succeeded' ? `${fa(j.accepted)} پیش‌نویس${j.flagged ? ` (${fa(j.flagged)} نیازمند دقت)` : ''}${j.discarded ? ` · ${fa(j.discarded)} حذف‌شده` : ''} <button class="btn sm ghost" type="button" data-review>بازبینی</button>` : '—'}</td><td class="tiny muted">${jdate(j.created_at)}</td></tr>`; }).join('')}</tbody></table></div>` : empty('sparkles', 'هنوز درخواستی ثبت نشده');
  }
}
