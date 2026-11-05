// جدول هفتگی: نمای شبکه‌ای برای معلم و نمای خطی (روز به روز) برای مدیر
import { api, esc, fa, $, on, setHead, empty, gradeName, WEEKDAYS, printOverlay } from './core.js';

export const KINDS = {
  academic: { label: 'درسی', cls: 'k-academic' },
  tarbiati: { label: 'تربیتی', cls: 'k-tarbiati' },
  chess: { label: 'شطرنج', cls: 'k-chess' },
  robotics: { label: 'رباتیک', cls: 'k-robotics' },
  language: { label: 'زبان', cls: 'k-language' },
  sport: { label: 'ورزش', cls: 'k-sport' },
  other: { label: 'سایر', cls: 'k-other' },
};
export const kindOf = (k) => KINDS[k] || KINDS.academic;
const rng = (s) => `<bdi class="tt-time">${fa(s.start)}–${fa(s.end)}</bdi>`;
const clsName = (s) => `${gradeName(s.grade)} ${esc(s.class_name)}`;
const legend = (kinds) => `<div class="tt-legend" aria-label="راهنمای رنگ‌ها">${kinds.map((k) => `<span class="tt-chip ${kindOf(k).cls}">${kindOf(k).label}</span>`).join('')}</div>`;

// ---------- پنل معلم: شبکهٔ ساعت × روز ----------
export async function teacherTimetable(el) {
  setHead('برنامه هفتگی من', 'کلاس‌ها در هر روز و ساعت', '');
  const d = await api('/api/teacher/schedule');
  const rows = d.sessions;
  if (!rows.length) { el.innerHTML = `<div class="card">${empty('calendar', 'هنوز جلسه‌ای برای شما در برنامه هفتگی ثبت نشده است')}</div>`; return; }
  const days = WEEKDAYS.map((w, i) => ({ w, i, list: rows.filter((s) => s.weekday === i) }));
  const slots = [...new Set(rows.map((s) => `${s.start}|${s.end}`))].sort();
  const cell = (s) => `<div class="tt-cell ${kindOf(s.kind).cls}"><b>${esc(s.subject)}</b><span>${clsName(s)}</span>${s.room ? `<small>${esc(s.room)}</small>` : ''}</div>`;
  const kinds = [...new Set(rows.map((s) => s.kind))];
  const active = days.filter((x) => x.list.length);
  el.innerHTML = `<section class="tt tt-teacher">
    <div class="tt-sum" role="list">${days.map((x) => `<a role="listitem" href="#/timetable" class="tt-pill ${x.i === d.today ? 'today' : ''} ${x.list.length ? '' : 'off'}" data-jump="${x.i}"><span>${x.w}</span><b>${fa(x.list.length)}</b></a>`).join('')}</div>
    ${legend(kinds)}
    <div class="tt-grid-wrap" role="region" aria-label="جدول هفتگی" tabindex="0"><table class="tt-grid"><thead><tr><th scope="col">ساعت</th>${days.map((x) => `<th scope="col" class="${x.i === d.today ? 'today' : ''}">${x.w}</th>`).join('')}</tr></thead>
      <tbody>${slots.map((sl) => { const [a, b] = sl.split('|'); return `<tr><th scope="row"><bdi>${fa(a)}<br>${fa(b)}</bdi></th>${days.map((x) => `<td class="${x.i === d.today ? 'today' : ''}">${x.list.filter((s) => s.start === a && s.end === b).map(cell).join('')}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
    <div class="tt-days">${active.map((x) => `<article class="tt-day ${x.i === d.today ? 'today' : ''}" id="tt-d${x.i}"><h3>${x.w}${x.i === d.today ? ' <small>امروز</small>' : ''}</h3>${x.list.map((s) => `<div class="tt-line ${kindOf(s.kind).cls}">${rng(s)}<div><b>${esc(s.subject)}</b><span>${clsName(s)}${s.room ? ' · ' + esc(s.room) : ''}</span></div><em class="tt-chip ${kindOf(s.kind).cls}">${kindOf(s.kind).label}</em></div>`).join('')}</article>`).join('')}</div>
  </section>`;
  on(el, 'click', '[data-jump]', (e, a) => { e.preventDefault(); const t = document.getElementById('tt-d' + a.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

// ---------- پنل مدیر: جدول خطی روز به روز ----------
export async function managerTimetable(el) {
  setHead('برنامه هفتگی کانون', 'کدام کلاس، کجا و چه ساعتی برگزار می‌شود', '<button class="btn soft sm" id="ttPrint">چاپ برنامه</button> <a class="btn sm" href="#/staff">ویرایش جلسات</a>');
  const all = await api('/api/manager/schedule/overview');
  if (!all.length) { el.innerHTML = `<div class="card">${empty('calendar', 'هنوز جلسه‌ای ثبت نشده است. از «معلمان، کلاس‌ها و برنامه» جلسات را اضافه کنید.')}</div>`; return; }
  const rooms = [...new Set(all.map((s) => s.room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa'));
  const f = { kind: '', room: '', day: '' };
  const draw = () => {
    const list = all.filter((s) => (!f.kind || s.kind === f.kind) && (!f.room || s.room === f.room) && (f.day === '' || s.weekday === Number(f.day)));
    const html = WEEKDAYS.map((w, i) => {
      const ds = list.filter((s) => s.weekday === i);
      if (!ds.length) return '';
      return `<section class="tt-mday"><h2>${w}<small>${fa(ds.length)} جلسه</small></h2><div class="tt-mtable" role="table" aria-label="${w}">
        <div class="tt-mrow head" role="row"><span role="columnheader">ساعت</span><span role="columnheader">مکان</span><span role="columnheader">کلاس</span><span role="columnheader">درس / برنامه</span><span role="columnheader">معلم</span></div>
        ${ds.map((s) => `<div class="tt-mrow ${kindOf(s.kind).cls}" role="row"><span role="cell">${rng(s)}</span><span role="cell" class="room">${esc(s.room || '—')}</span><span role="cell"><b>${clsName(s)}</b></span><span role="cell"><em class="tt-chip ${kindOf(s.kind).cls}">${kindOf(s.kind).label}</em> ${esc(s.subject)}</span><span role="cell" class="tch">${esc(s.teacher || 'بدون معلم')}</span></div>`).join('')}</div></section>`;
    }).join('');
    $('#ttBody', el).innerHTML = html || empty('calendar', 'با این فیلتر جلسه‌ای نیست');
  };
  el.innerHTML = `<section class="tt tt-manager"><div class="tt-filters">
    <label>روز<select class="input" id="fDay"><option value="">همه</option>${WEEKDAYS.map((w, i) => `<option value="${i}">${w}</option>`).join('')}</select></label>
    <label>نوع<select class="input" id="fKind"><option value="">همه</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
    <label>مکان<select class="input" id="fRoom"><option value="">همه</option>${rooms.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label></div>
    ${legend([...new Set(all.map((s) => s.kind))])}<div id="ttBody"></div></section>`;
  $('#fDay', el).onchange = (e) => { f.day = e.target.value; draw(); };
  $('#fKind', el).onchange = (e) => { f.kind = e.target.value; draw(); };
  $('#fRoom', el).onchange = (e) => { f.room = e.target.value; draw(); };
  $('#ttPrint').onclick = () => { printOverlay(`<div class="tt tt-manager tt-print">${$('#ttBody', el).innerHTML}</div>`, 'برنامه هفتگی کانون'); };
  draw();
}
