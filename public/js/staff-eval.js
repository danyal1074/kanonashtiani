// ارزیابی عملکرد معلمان و مشاوران (پنل مدیر): شاخص‌های اندازه‌گیری‌شده، زمینه و بازخورد ذهنی جدا از هم،
// وزن‌های شفاف و قابل تنظیم، فیلتر دوره/کلاس، نمودار، جزئیات و خروجی CSV.
import { api, post, put, esc, fa, pct, $, on, toast, busy, modal, setHead, empty, jdate, icon, gradeName, barChart, dateField, readDate, ymdOf, addDays } from './core.js';

const KIND = { measured: ['اندازه‌گیری‌شده', 'blue'], context: ['زمینه', 'gray'], subjective: ['ذهنی', 'orange'] };
const qp = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
const today = () => new Date().toISOString().slice(0, 10);
const PRESETS = [['30', '۳۰ روز اخیر'], ['90', '۹۰ روز اخیر'], ['180', 'شش ماه اخیر'], ['custom', 'بازهٔ دلخواه']];
const cell = (x) => (x?.value == null ? `<span class="muted" title="${esc(x?.detail || '')}">—</span>` : `<span title="${esc(x.detail)}"><b>${pct(x.value)}</b></span>`);

export async function staffEvalView(el) {
  const q = qp();
  const role = q.role === 'counselor' ? 'counselor' : 'teacher';
  const preset = q.preset || '30';
  const to = q.to || today(), from = q.from || addDaysIso(to, -(Number(preset) || 30) + 1);
  setHead('ارزیابی عملکرد کارکنان', 'فقط برای مدیر کانون • شاخص‌ها از داده‌های ثبت‌شده محاسبه می‌شوند؛ نبودِ داده «نامشخص» است، نه صفر',
    '<button class="btn sm ghost" id="seW">وزن‌ها و هدف‌ها</button> <button class="btn sm ghost" id="seCsv">خروجی CSV</button>');
  const [meta, data] = await Promise.all([api('/api/manager/meta'), api(`/api/manager/staff-eval?role=${role}&from=${from}&to=${to}${q.class_id ? `&class_id=${q.class_id}` : ''}`)]);
  const inds = data.indicators;
  const ranked = [...data.staff].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  el.innerHTML = `<form class="card row no-print" id="seF" style="gap:8px;flex-wrap:wrap;margin-bottom:12px" aria-label="فیلتر">
      <div class="row" role="tablist" style="gap:4px">${[['teacher', 'معلمان'], ['counselor', 'مشاوران']].map(([k, v]) => `<button type="button" role="tab" aria-selected="${k === role}" class="btn sm ${k === role ? '' : 'ghost'}" data-role="${k}">${v}</button>`).join('')}</div>
      <select class="input" name="preset" aria-label="دوره" style="max-width:170px">${PRESETS.map(([k, v]) => `<option value="${k}" ${k === preset ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <span id="seCustom" ${preset === 'custom' ? '' : 'hidden'} class="row" style="gap:6px"><span class="small">از</span>${dateField('seFrom', from)}<span class="small">تا</span>${dateField('seTo', to)}</span>
      <select class="input" name="class_id" aria-label="کلاس" style="max-width:180px"><option value="">همه کلاس‌ها</option>${meta.classes.map((c) => `<option value="${c.id}" ${String(c.id) === q.class_id ? 'selected' : ''}>${esc(gradeName(c.grade))} ${esc(c.name)}</option>`).join('')}</select>
      <button class="btn sm">اعمال</button><span class="tiny muted">${jdate(data.period.from)} تا ${jdate(data.period.to)}</span></form>
    ${ranked.length ? `<div class="card" style="margin-bottom:12px"><div class="card-title">امتیاز وزنی (فقط شاخص‌های دارای داده)</div>${barChart(ranked.slice(0, 15).map((s) => ({ label: s.full_name, values: [s.score ?? 0] })), [{ name: 'امتیاز', color: '#0B5F66' }], { height: 220 })}</div>
    <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>${role === 'teacher' ? 'معلم' : 'مشاور'}</th><th>امتیاز</th><th>پوشش داده</th>${inds.map((i) => `<th title="${esc(i.label)}"><span class="badge ${KIND[i.kind][1]}" style="font-size:10px">${KIND[i.kind][0]}</span><div class="tiny">${esc(i.label)}</div><div class="tiny muted">وزن ${fa(data.weights[i.key] ?? 0)}</div></th>`).join('')}<th></th></tr></thead>
    <tbody>${ranked.map((s) => `<tr><td><b>${esc(s.full_name)}</b>${s.active ? '' : ' <span class="badge gray">غیرفعال</span>'}</td><td>${s.score == null ? '<span class="muted">داده کافی نیست</span>' : `<b>${pct(s.score)}</b>`}</td><td class="small">${pct(s.coverage)}</td>${inds.map((i) => `<td>${cell(s.indicators[i.key])}</td>`).join('')}<td><button class="btn sm ghost" data-drill="${s.id}">جزئیات</button></td></tr>`).join('')}</tbody></table></div>
    <p class="tiny muted" style="margin-top:8px">نشانگر را روی هر عدد نگه دارید تا مبنای محاسبه را ببینید. «روند نمرهٔ دانش‌آموزان» فقط زمینه است و پیش‌فرض وزنی ندارد؛ کیفیت کار کارکنان با نمرهٔ خام دانش‌آموزان یکی دانسته نمی‌شود.</p></div>`
    : `<div class="card">${empty('users', role === 'teacher' ? 'معلمی ثبت نشده' : 'مشاوری ثبت نشده')}</div>`}`;

  const go = (patch) => { const n = { ...q, ...patch }; location.hash = `#/staff-eval?${new URLSearchParams(Object.entries(n).filter(([, v]) => v))}`; };
  on(el, 'click', '[data-role]', (_e, b) => go({ role: b.dataset.role }));
  $('#seF [name=preset]', el).onchange = (e) => { $('#seCustom', el).hidden = e.target.value !== 'custom'; };
  $('#seF', el).onsubmit = (e) => {
    e.preventDefault(); const f = e.target, pr = f.preset.value;
    const range = pr === 'custom' ? { from: readDate(el, 'seFrom'), to: readDate(el, 'seTo') } : { from: '', to: '' };
    if (pr === 'custom' && (!range.from || !range.to)) return toast('تاریخ شروع و پایان را انتخاب کنید', 'err');
    go({ preset: pr, class_id: f.class_id.value, ...range });
  };
  $('#seCsv').onclick = () => {
    const head = ['نام', 'امتیاز', 'پوشش داده', ...inds.map((i) => `${i.label} (${KIND[i.kind][0]})`)];
    const rows = ranked.map((s) => [s.full_name, s.score ?? '', s.coverage, ...inds.map((i) => s.indicators[i.key]?.value ?? '')]);
    const csv = '﻿' + [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `staff-eval-${role}-${data.period.from}-${data.period.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#seW').onclick = () => modal({
    title: `وزن‌ها و هدف‌ها — ${role === 'teacher' ? 'معلمان' : 'مشاوران'}`,
    body: `<form id="seWF" class="stack"><p class="small muted">امتیاز کل = میانگین وزنی شاخص‌هایی که داده دارند. وزن صفر یعنی شاخص فقط نمایش داده می‌شود.</p>${inds.map((i) => `<div class="row between"><label for="w-${i.key}" class="small">${esc(i.label)} <span class="badge ${KIND[i.kind][1]}">${KIND[i.kind][0]}</span></label><input class="input ltr" style="max-width:90px" id="w-${i.key}" name="${i.key}" inputmode="numeric" value="${fa(data.weights[i.key] ?? 0)}"></div>`).join('')}
      ${Object.keys(data.targets).length ? `<h4>هدف‌ها (در ماه)</h4>${Object.entries(data.targets).map(([k, v]) => `<div class="row between"><label for="t-${k}" class="small">${k === 'exams_per_month' ? 'آزمون رسمی منتشرشده' : 'سؤال منتشرشده در بانک'}</label><input class="input ltr" style="max-width:90px" id="t-${k}" data-target="${k}" inputmode="numeric" value="${fa(v)}"></div>`).join('')}` : ''}</form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره', onClick: async (m) => {
      const weights = Object.fromEntries(inds.map((i) => [i.key, $(`#w-${i.key}`, m).value]));
      const targets = Object.fromEntries([...m.querySelectorAll('[data-target]')].map((x) => [x.dataset.target, x.value]));
      await put('/api/manager/staff-eval/settings', { role, weights, targets }); toast('وزن‌ها ذخیره شد', 'ok'); staffEvalView(el);
    } }],
  });
  on(el, 'click', '[data-drill]', async (_e, b) => {
    const d = await api(`/api/manager/staff-eval/${b.dataset.drill}?from=${data.period.from}&to=${data.period.to}`);
    modal({
      title: `${esc(d.full_name)} — جزئیات`, wide: true,
      body: `<div class="grid c2">${d.indicators_meta.map((i) => `<div class="card"><div class="row between"><span class="small">${esc(i.label)}</span><span class="badge ${KIND[i.kind][1]}">${KIND[i.kind][0]}</span></div><b>${d.indicators[i.key]?.value == null ? '—' : pct(d.indicators[i.key].value)}</b><div class="tiny muted">${esc(d.indicators[i.key]?.detail || '')}</div></div>`).join('')}</div>
        ${d.drill.exams ? `<h4>آزمون‌های دوره</h4>${d.drill.exams.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>آزمون</th><th>کلاس</th><th>وضعیت</th><th>شرکت‌کننده</th><th>میانگین</th><th>انتشار کارنامه</th></tr></thead><tbody>${d.drill.exams.map((x) => `<tr><td>${esc(x.title)}</td><td>${esc(x.class_name || 'همه')}</td><td class="small">${esc(x.status)}</td><td>${fa(x.results)}</td><td>${x.avg == null ? '—' : pct(x.avg)}</td><td class="tiny">${x.results_released_at ? jdate(x.results_released_at) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('file-check', 'آزمونی در این دوره نیست')}` : ''}
        ${d.drill.sessions ? `<h4>کلاس‌های تحت پوشش: ${d.drill.classes.map((c) => esc(`${gradeName(c.grade)} ${c.name}`)).join('، ') || '—'}</h4><h4>جلسات دوره</h4>${d.drill.sessions.length ? d.drill.sessions.map((x) => `<div class="small">${esc(x.full_name)} — ${esc(x.title)} — ${esc(x.status)} — ${jdate(x.starts_at)}</div>`).join('') : empty('calendar', 'جلسه‌ای در این دوره نیست')}` : ''}
        <h4 style="margin-top:12px">بازخورد مدیر (ذهنی)</h4>${d.feedback.map((f) => `<div class="small">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)} — ${esc(f.comment || '')} <span class="tiny muted">(${jdate(f.period_start)} تا ${jdate(f.period_end)} • ${esc(f.manager || '')})</span></div>`).join('') || '<p class="small muted">بازخوردی ثبت نشده</p>'}
        <form id="fbF" class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><label for="fbR" class="small">امتیاز</label><select class="input" id="fbR" name="rating" style="max-width:90px">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${fa(n)}</option>`).join('')}</select><input class="input grow" name="comment" maxlength="1000" placeholder="توضیح (اختیاری)" aria-label="توضیح بازخورد"><button class="btn sm">ثبت بازخورد برای این دوره</button></form>`,
      onOpen: (m) => { $('#fbF', m).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/manager/staff-eval/${d.id}/feedback`, { rating: Number(e.target.rating.value), comment: e.target.comment.value, period_start: data.period.from, period_end: data.period.to }); toast('بازخورد ثبت شد', 'ok'); m.closest('.modal-back').remove(); staffEvalView(el); }); }; },
      actions: [{ label: 'بستن', cls: 'ghost' }],
    });
  });
}
function addDaysIso(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
