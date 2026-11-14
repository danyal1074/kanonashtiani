// رابط چرخهٔ عمر آزمون رسمی و انتخاب سؤال از بانک (مشترک معلم و مدیر).
import { api, post, esc, fa, $, on, toast, busy, modal, empty, jdatetime, icon, dateField, readDate, tehranIso } from './core.js';

export const STATE = {
  draft: ['پیش‌نویس', 'gray'], review: ['در بازبینی', 'orange'], ready: ['آماده انتشار', 'blue'], scheduled: ['منتشرشده — شروع نشده', 'blue'],
  in_progress: ['در حال برگزاری', 'green'], completed: ['پایان‌یافته — منتظر انتشار کارنامه', 'orange'], results_released: ['کارنامه منتشر شد', 'green'],
};
export const stateBadge = (s) => { const [t, c] = STATE[s] || [s, 'gray']; return `<span class="badge ${c}">${t}</span>`; };

// انتخاب سؤال‌های منتشرشدهٔ بانک (پایهٔ مشخص) — خروجی: آرایهٔ شناسه‌ها یا null (انصراف)
export async function pickBankQuestions(grade, preselected = []) {
  const [books, list] = await Promise.all([api('/api/bank/books'), api(`/api/bank/questions?status=published&grade=${grade}`)]);
  const chosen = new Set(preselected);
  return modal({
    title: 'انتخاب سؤال از بانک', wide: true,
    body: list.length ? `<div class="row" style="gap:8px;margin-bottom:8px;flex-wrap:wrap"><select class="input" id="bpTopic" aria-label="مبحث" style="max-width:280px"><option value="">همه مباحث</option>${books.filter((b) => b.grade === grade).flatMap((b) => b.chapters.flatMap((c) => c.topics.map((t) => `<option value="${t.id}">${esc(b.title)} ← ${esc(t.title)}</option>`))).join('')}</select><input class="input" id="bpQ" placeholder="جست‌وجو" style="max-width:200px" aria-label="جست‌وجو"><span class="small muted" id="bpN"></span></div>
      <div class="stack" id="bpList" style="max-height:55vh;overflow:auto">${list.map((q) => `<label class="list-item" data-topic="${q.topic_id || ''}" data-text="${esc(q.text)}" style="align-items:flex-start;gap:8px"><input type="checkbox" value="${q.id}" ${chosen.has(q.id) ? 'checked' : ''}><span class="grow"><b class="small">${esc(q.text)}</b><span class="tiny muted"> · ${esc(q.topic_title || q.subject)} · ${q.difficulty_fa}${q.exam_uses ? ` · در ${fa(q.exam_uses)} آزمون` : ''}</span></span></label>`).join('')}</div>
      <p class="tiny muted">سؤال‌ها با نسخهٔ فعلی در آزمون ثابت می‌شوند؛ ویرایش بعدی بانک روی این آزمون اثری ندارد. سؤالی که در آزمون رسمی استفاده شود از تمرین آزاد حذف می‌شود.</p>`
      : empty('book', `برای این پایه سؤال منتشرشده‌ای در بانک نیست. ابتدا از «بانک سؤال» سؤال بسازید و منتشر کنید.`),
    onOpen: (m) => {
      const count = () => { const n = m.querySelectorAll('#bpList input:checked').length; const el = $('#bpN', m); if (el) el.textContent = `${fa(n)} انتخاب‌شده`; };
      const filter = () => { const t = $('#bpTopic', m).value, q = $('#bpQ', m).value.trim(); m.querySelectorAll('#bpList [data-topic]').forEach((r) => { r.hidden = (t && r.dataset.topic !== t) || (q && !r.dataset.text.includes(q)); }); };
      if (list.length) { $('#bpTopic', m).onchange = filter; $('#bpQ', m).oninput = filter; m.addEventListener('change', count); count(); }
    },
    actions: [{ label: 'انصراف', cls: 'ghost', value: null }, ...(list.length ? [{ label: 'افزودن به آزمون', onClick: async (m, close) => { close([...m.querySelectorAll('#bpList input:checked')].map((i) => Number(i.value))); return false; } }] : [])],
  });
}

// پنل وضعیت آزمون معلم با دکمه‌های انتقال مجاز
export function lifecyclePanel(e) {
  const s = e.state;
  const btn = (to, label, cls = 'soft') => `<button class="btn sm ${cls}" data-to="${to}">${label}</button>`;
  const actions = {
    draft: btn('review', 'ارسال برای بازبینی') + btn('ready', 'آماده انتشار', ''),
    review: btn('ready', 'تأیید و آماده انتشار', '') + btn('draft', 'بازگشت به پیش‌نویس', 'ghost'),
    ready: `<button class="btn sm green" id="pubBtn">${icon('send', { size: 15 })} انتشار و زمان‌بندی</button>` + btn('draft', 'بازگشت به پیش‌نویس', 'ghost'),
    scheduled: btn('draft', 'لغو انتشار', 'ghost'), in_progress: btn('completed', 'پایان آزمون'),
    completed: btn('results_released', 'انتشار کارنامه', 'green'),
  }[s] || '';
  const when = [e.starts_at && `شروع: ${jdatetime(e.starts_at)}`, e.ends_at && `پایان: ${jdatetime(e.ends_at)}`, e.randomize && 'ترتیب تصادفی سؤال‌ها'].filter(Boolean).join(' · ');
  return `<div class="card" style="margin-bottom:12px"><div class="row between" style="flex-wrap:wrap;gap:8px"><div>${stateBadge(s)} <span class="small muted">${when}</span></div><div class="row" style="gap:6px;flex-wrap:wrap">${actions}${['in_progress', 'scheduled'].includes(s) ? btn('results_released', 'انتشار کارنامه', 'ghost') : ''}</div></div>
    <div class="tiny muted" style="margin-top:6px">${s === 'draft' || s === 'review' || s === 'ready' ? 'دانش‌آموزان آزمون را تا انتشار نمی‌بینند. پس از انتشار، سؤال‌ها قابل ویرایش نیستند.' : s === 'results_released' ? 'دانش‌آموزان کارنامه و پاسخ‌نامه را می‌بینند.' : 'نمره و کلید پاسخ تا «انتشار کارنامه» به دانش‌آموزان نشان داده نمی‌شود.'}</div></div>`;
}

export function wireLifecycle(el, e, base, reload) {
  const go = (to, body = {}, b) => busy(b, async () => { await post(`${base}/status`, { to, ...body }); toast('وضعیت آزمون به‌روز شد', 'ok'); reload(); });
  on(el, 'click', '[data-to]', (_ev, b) => {
    const to = b.dataset.to;
    if (to === 'results_released' && e.state === 'in_progress') return modal({ title: 'انتشار کارنامه', body: '<p>آزمون هنوز در حال برگزاری است. با انتشار کارنامه، ارسال پاسخ بسته می‌شود. ادامه می‌دهید؟</p>', actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'انتشار', cls: 'green', onClick: async () => go(to, {}, b) }] });
    go(to, {}, b);
  });
  const pub = $('#pubBtn', el);
  if (pub) pub.onclick = () => modal({
    title: 'انتشار آزمون', body: `<form class="stack" id="pubF"><p class="small muted">برای آزمون بدون محدودیت زمانی، تاریخ‌ها را خالی بگذارید (از همین حالا تا بستن دستی).</p>
      <div class="grid c2"><div class="field"><label>تاریخ شروع</label>${dateField('pubSD')}</div><div class="field"><label for="pubST">ساعت شروع</label><input class="input ltr" type="time" id="pubST" value="08:00"></div>
      <div class="field"><label>تاریخ پایان</label>${dateField('pubED')}</div><div class="field"><label for="pubET">ساعت پایان</label><input class="input ltr" type="time" id="pubET" value="20:00"></div></div>
      <label class="row small" style="gap:6px"><input type="checkbox" id="pubR"> ترتیب سؤال‌ها برای هر دانش‌آموز تصادفی باشد</label></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'انتشار', cls: 'green', onClick: async (m) => {
      const sd = readDate(m, 'pubSD'), ed = readDate(m, 'pubED');
      await post(`${base}/status`, { to: 'published', starts_at: sd ? tehranIso(sd, $('#pubST', m).value) : undefined, ends_at: ed ? tehranIso(ed, $('#pubET', m).value) : undefined, randomize: $('#pubR', m).checked });
      toast('آزمون منتشر شد', 'ok'); reload();
    } }],
  });
}
