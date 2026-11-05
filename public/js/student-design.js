import { studentArt, studentIcon, studentLogo } from './student-icons.js';
import { api, esc, fa, num, pct, $, $$, on, setHead, icon, isProfilePhoto, WEEKDAYS, faWeekday, jdate, empty } from './core.js';

export const art = studentArt;
export { studentLogo };
export const navIcon = (name, size=24) => studentIcon(name,{size,cls:'student-line'});
const counter = n => n ? `<span class="student-counter">${num(n)}</span>` : '';
export function shellHeader(me) {
  return `<header class="student-masthead no-print">
    <a class="student-points" href="#/profile" aria-label="امتیازهای من">${art('coin')}<span><b data-student-points>${num(me.student.points)}</b><small>امتیاز</small></span></a>
    <a class="student-brand" href="#/home">${studentLogo(me.center)}<span><b>کانون نخبه‌پروری</b><small>${esc(me.center?.name || 'پلتفرم رشد نخبه')}</small></span></a>
    <div class="student-header-actions"><a class="student-round" href="#/messages" aria-label="پیام‌ها">${navIcon('mail')}${counter(me.unread)}</a><a class="student-round" href="#/announcements" aria-label="اعلان‌ها">${navIcon('bell')}${counter(me.unseen?.length)}</a></div>
  </header>`;
}
export function prepareStudentPage(path) {
  document.body.classList.toggle('student-home', path === '/home');
  const top = document.querySelector('.theme-student .topbar');
  if (top && !top.querySelector('.student-back')) {
    const back = document.createElement('a'); back.className = 'student-back student-round'; back.href = '#/home'; back.setAttribute('aria-label', 'بازگشت به خانه'); back.innerHTML = navIcon('back'); top.prepend(back);
  }
}
const shortcuts = [
  ['/lessons','books','درس‌ها','blue'], ['/assignments','clipboard','تکلیف‌ها','purple'],
  ['/exams','exam','آزمون‌ها','purple'], ['/classes','online','کلاس آنلاین','blue'],
  ['/schedule','calendar','برنامه هفتگی','purple'], ['/results','chart','پیشرفت من','blue'],
  ['/games','trophy','چالش‌ها','gold'], ['/games','gamepad','بازی آموزشی','purple']
];
const tile = ([href, image, label, tint], badge = '') => `<a class="student-feature ${tint}" href="#${href}">${art(image)}<b>${label}</b>${badge}</a>`;
const levelCard = (d) => `<a class="student-level student-panel" href="#/roadmap"><div class="student-level-copy"><h2>سطح پیشرفت من</h2><div class="student-progress" role="progressbar" aria-label="پیشرفت سطح" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${d.level.progress}"><i style="width:${d.level.progress}%"></i></div><small>${d.level.next ? `${num(d.level.next.min - d.level.next.need)} از ${num(d.level.next.min)} امتیاز` : `${num(d.points)} امتیاز · بالاترین سطح`}</small></div><div class="student-level-medal">${art('crown')}<small>سطح</small><b>${esc(d.level.name)}</b></div></a>`;

export async function home(el, _p, me) {
  const [d, announcements] = await Promise.all([api('/api/student/dashboard'), api('/api/announcements').catch(() => [])]);
  setHead('خانه', 'یک قدم نزدیک‌تر به رویاهای تو');
  const points = document.querySelector('[data-student-points]'); if (points) points.textContent = num(d.points);
  const goal = d.study.goal > 0 ? Math.min(100, Math.round(d.study.today / d.study.goal * 100)) : 100;
  const upcoming = d.upcoming.slice(0, 2);
  const first = me.user.full_name.trim().split(/\s+/)[0];
  const notice = announcements[0];
  el.innerHTML = `<div class="student-dashboard"><div class="student-first-screen">
    <section class="student-welcome" aria-labelledby="studentHello"><div class="student-welcome-copy"><span class="student-welcome-kicker">${art('sparkles')} امروز، نوبت درخشیدن توست</span><h1 id="studentHello">سلام <span>${esc(first)}</span> جان!</h1><p>هر روز، یک قدم<br><strong>نزدیک‌تر به رویاهایت</strong></p><a class="student-welcome-cta" href="#/study">بزن بریم یاد بگیریم ${navIcon('chevron-left',16)}</a></div><a class="student-portrait ${isProfilePhoto(me.student.avatar) ? 'has-own-photo' : ''}" href="#/profile" aria-label="پروفایل من"><span class="student-portrait-halo" aria-hidden="true"></span><img class="student-character" src="${isProfilePhoto(me.student.avatar) ? esc(me.student.avatar) : '/img/student-v2/student-character.webp'}" alt="${isProfilePhoto(me.student.avatar) ? 'عکس پروفایل شما' : 'دانش‌آموز آماده یادگیری'}" width="400" height="480" fetchpriority="high"><span class="student-portrait-star" aria-hidden="true">${art('star')}</span></a></section>
    <div class="student-status-grid"><a class="student-rank" href="#/roadmap"><div><h2>رتبه من در پایه</h2><strong>${num(d.rank.rank)}</strong><small>از میان ${num(d.rank.of)} دانش‌آموز</small><span class="student-rank-caption">هر قدمت، یک فرصت برای رشد</span></div>${art('podium')}</a>${levelCard(d)}</div>
    <nav class="student-features" aria-label="دسترسی سریع">${shortcuts.map((item, i) => tile(item, i === 1 ? counter(d.upcoming.length) : '')).join('')}</nav>
    <section class="student-panel student-today"><h2>${art('target')}کارهای امروز من</h2><div class="student-tasks-art">${art('tasks')}</div><div class="student-today-list"><a href="#/study" class="student-today-row ${goal >= 100 ? 'done' : ''}"><span class="student-task-check">${goal >= 100 ? navIcon('check', 16) : ''}</span><b>مطالعه روزانه</b><span>${num(d.study.today)} از ${num(d.study.goal)} دقیقه</span></a>${upcoming.map(a => `<a href="#/assignments" class="student-today-row"><span class="student-task-check"></span><b>${esc(a.title)}</b>${icon(a.subject === 'علوم' ? 'flask' : 'book', {size:26})}</a>`).join('')}${!upcoming.length ? '<a href="#/assignments" class="student-today-row done"><span class="student-task-check">'+navIcon('check',16)+'</span><b>تکلیف انجام‌نشده‌ای نداری</b></a>' : ''}</div></section>
    </div><section class="student-panel student-events"><h2>${art('calendar')}رویدادهای کانون</h2><a class="student-event-banner" href="#/${notice ? 'announcements' : 'games'}"><div><b>${notice ? esc(notice.title) : 'با یادگیری، به اوج برس!'}</b><span class="student-yellow-button">مشاهده جزئیات ${navIcon('back',16)}</span></div>${art('rocket')}</a><div class="student-event-dots" aria-hidden="true"><i class="active"></i><i></i><i></i><i></i></div></section>
  </div>`;
}

function subjectArt(subject) {
  const names = {'ریاضی':'calculator','علوم':'flask','انگلیسی':'languages','زبان انگلیسی':'languages','مطالعات':'globe','مطالعات اجتماعی':'globe','قرآن':'quran','فارسی':'open-book'};
  return art(names[subject] || 'open-book');
}
export function lessonAverages(results) {
  const sums = new Map();
  for (const r of results) { if (r.percent == null || !r.subject) continue; const s = sums.get(r.subject) || [0,0]; s[0] += Number(r.percent); s[1]++; sums.set(r.subject,s); }
  return [...sums].map(([subject,[sum,n]]) => ({subject,value:Math.round(sum/n)}));
}
export async function lessons(el) {
  const [profile, study, results] = await Promise.all([api('/api/student/profile'),api('/api/student/study'),api('/api/student/results')]);
  setHead('درس‌ها', 'درس‌های من، یک مسیر پر از کشف');
  const subjects = [...new Set([...study.subjects,...profile.schedule.map(s=>s.subject),...profile.materials.map(m=>m.subject)].filter(Boolean))];
  el.innerHTML = `<div class="student-lessons">${subjects.length ? `<div class="student-subjects">${subjects.map((s,i)=>`<a class="student-subject ${['purple','blue','gold'][i%3]}" href="#/library?subject=${encodeURIComponent(s)}">${subjectArt(s)}<b>${esc(s)}</b></a>`).join('')}</div>` : empty('book','هنوز درسی برای کلاس تو تعریف نشده')}<section class="student-panel"><h2>${art('chart')}پیشرفت در درس‌ها</h2>${averagesHtml(lessonAverages(results))}</section></div>`;
}
export function averagesHtml(rows) {
  return rows.length ? `<div class="student-averages">${rows.map(s=>`<div><b>${esc(s.subject)}</b><div class="student-progress" role="progressbar" aria-label="میانگین ${esc(s.subject)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.value}"><i style="width:${s.value}%"></i></div><strong>${pct(s.value)}</strong></div>`).join('')}</div>` : '<p class="muted small">بعد از اولین آزمون، میانگین درس‌ها اینجا نمایش داده می‌شود.</p>';
}
export async function schedule(el, _p, me) {
  const d = await api('/api/student/profile'); let day = faWeekday(me.today);
  setHead('برنامه هفتگی', 'برنامه کلاس‌های این هفته');
  el.innerHTML = `<div class="student-days" role="tablist" aria-label="روز هفته">${WEEKDAYS.map((w,i)=>`<button role="tab" aria-selected="${i===day}" class="${i===day?'on':''}" data-day="${i}">${w}</button>`).join('')}</div><div class="student-schedule-list" id="studentSchedule"></div><a class="student-primary-link" href="#/study">${art('calendar')} مشاهده برنامه مطالعه</a>`;
  const draw = () => { const rows=d.schedule.filter(s=>s.weekday===day); $('#studentSchedule',el).innerHTML = rows.length ? rows.map((s,i)=>`<article class="student-schedule-card ${['gold','purple','blue'][i%3]}"><span class="student-subject-icon">${subjectArt(s.subject)}</span><div><h2>${esc(s.subject)}</h2><b>${fa(s.start)} ـ ${fa(s.end)}</b><small>${esc(s.teacher || '')}${s.room ? ' · '+esc(s.room):''}</small></div></article>`).join('') : `<div class="student-panel">${empty('calendar','برای این روز کلاسی ثبت نشده است')}</div>`; };
  draw(); on(el,'click','[data-day]',(_e,b)=>{day=Number(b.dataset.day); $$('[data-day]',el).forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-selected',String(x===b));});draw();});
}
export async function classes(el, _p, me) {
  const d=await api('/api/student/profile'); const today=faWeekday(me.today);
  setHead('کلاس آنلاین','برنامه کلاس‌ها و منابع آموزشی');
  const rows=d.schedule.filter(s=>s.weekday===today);
  el.innerHTML=`<section class="student-panel"><h2>${art('online')}کلاس‌های امروز</h2>${rows.length ? rows.map(s=>`<div class="student-list-row"><span class="student-subject-icon">${subjectArt(s.subject)}</span><div><b>${esc(s.subject)}</b><small>${esc(s.teacher||'')}${s.room?' · '+esc(s.room):''}</small></div><strong>${fa(s.start)} ـ ${fa(s.end)}</strong></div>`).join(''):empty('calendar','امروز کلاسی در برنامه ثبت نشده')}</section><a class="student-primary-link" href="#/schedule">مشاهده برنامه هفتگی ${navIcon('back',18)}</a><section class="student-panel"><h2>${art('books')}ویدیوها و منابع کلاس</h2>${materialsHtml(d.materials.filter(m=>m.kind==='video'))}</section>`;
}
function materialsHtml(rows) {
  return rows.length ? rows.map(m=>`<a class="student-list-row" href="${esc(m.url)}" target="_blank" rel="noopener"><span class="student-subject-icon">${subjectArt(m.subject)}</span><div><b>${esc(m.title)}</b><small>${esc(m.subject||'')} · ${jdate(m.created_at)}</small></div>${navIcon('back',18)}</a>`).join('') : empty('book','هنوز منبعی برای این بخش بارگذاری نشده است');
}
export async function library(el) {
  const d=await api('/api/student/profile'); const selected=new URLSearchParams(location.hash.split('?')[1]||'').get('subject'); let filter=selected||'همه';
  setHead('کتابخانه','کتاب‌ها، جزوه‌ها و ویدیوهای آموزشی');
  const subjects=[...new Set(d.materials.map(m=>m.subject).filter(Boolean))];
  const filters=['همه',...new Set([...(selected?[selected]:[]),...subjects])];
  el.innerHTML=`<div class="student-days student-library-filters" role="tablist">${filters.map(s=>`<button role="tab" aria-selected="${s===filter}" class="${s===filter?'on':''}" data-subject="${esc(s)}">${esc(s)}</button>`).join('')}</div><section class="student-panel" id="studentMaterials"></section>`;
  const draw=()=>{$('#studentMaterials',el).innerHTML=materialsHtml(d.materials.filter(m=>filter==='همه'||m.subject===filter));};draw();
  on(el,'click','[data-subject]',(_e,b)=>{filter=b.dataset.subject; $$('[data-subject]',el).forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-selected',String(x===b));});draw();});
}
const groups=[['آموزش و یادگیری',shortcuts.slice(0,4).concat([['/study','timer','مطالعه هفتگی','blue'],['/library','book','کتابخانه','purple']])],['برنامه‌ریزی و مدیریت', [['/schedule','calendar','برنامه هفتگی','blue'],['/study','timer','برنامه مطالعه','blue'],['/announcements','bell','اعلان‌ها','gold'],['/counselor','user','گفت‌وگو با مشاور','blue']]],['گزارش و پیشرفت', [['/results','exam','گزارش‌ها','blue'],['/roadmap','trophy','رتبه و جایگاه','gold'],['/path','compass','مسیر یادگیری من','purple'],['/records','receipt','نمرات و فاکتورها','blue']]],['امکانات تکمیلی', [['/games','gamepad','بازی آموزشی','purple'],['/self-exams','exam','آزمون خودسنجی','blue'],['/shop','bag','فروشگاه کانون','gold'],['/profile','user','پروفایل من','blue'],['/payment','card','حق عضویت','gold'],['/messages','message','پیام‌ها','blue']]]];
export async function more(el) {
  setHead('موارد بیشتر','همه امکانات کانون، در دسترس تو');
  el.innerHTML=`<label class="student-search">${navIcon('search',20)}<input type="search" id="studentToolSearch" placeholder="جست‌وجو در امکانات…" aria-label="جست‌وجو در امکانات"></label><div class="student-more-groups">${groups.map(([title,items])=>`<section class="student-more-group"><h2>${title}</h2><div class="student-more-grid">${items.map(item=>tile(item)).join('')}</div></section>`).join('')}</div><p class="student-no-results muted center" hidden>موردی پیدا نشد.</p><div class="student-more-footer"><a href="#/profile">حساب کاربری من</a><button class="btn ghost" id="studentLogout">خروج از حساب</button></div>`;
  $('#studentLogout',el).onclick=()=>document.getElementById('logoutBtn')?.click();
  $('#studentToolSearch',el).addEventListener('input',e=>{const q=e.target.value.trim().replace(/ي/g,'ی').replace(/ك/g,'ک');let any=false;$$('.student-more-group',el).forEach(g=>{let show=false;$$('.student-feature',g).forEach(t=>{const hit=t.textContent.includes(q);t.hidden=!hit;show ||= hit;});g.hidden=!show;any ||= show;});$('.student-no-results',el).hidden=any;});
}

export async function roadmap(el) {
  const [d,dashboard] = await Promise.all([api('/api/student/roadmap'),api('/api/student/dashboard')]);
  setHead('مسیر پیشرفت','قدم به قدم تا قله موفقیت');
  const unlocked = d.badges.filter(b=>b.unlocked).length;
  const next = d.milestones.find(m=>m.level===d.level.index+1);
  el.innerHTML = `<div class="student-roadmap"><section class="student-panel student-road-hero"><div><small>سطح فعلی من</small><h2>${esc(d.level.name)}</h2><b>${num(d.current_points)} امتیاز</b><div class="student-progress" role="progressbar" aria-label="پیشرفت سطح فعلی" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${d.level.progress}"><i style="width:${d.level.progress}%"></i></div></div><img src="/img/visual-refresh/learning-path.webp" alt="" aria-hidden="true"></section>
    <div class="student-road-stats">${[['trophy','رتبه در پایه',num(dashboard.rank.rank)],['coin','امتیازهای من',num(d.current_points)],['crown','سطح رشد',num(d.level.index)],['target','نشان‌های من',num(unlocked)]].map(([image,label,value])=>`<div class="student-panel">${art(image)}<b>${label}</b><strong>${value}</strong></div>`).join('')}</div>
    <a class="student-panel student-next-level" href="#/path">${art('target')}<div><h2>${next ? 'گام بعدی: '+esc(next.name) : 'به قله رسیدی!'}</h2><p>${next ? `${num(d.level.next.need)} امتیاز تا سطح بعد` : 'حالا وقت کشف یک مسیر تازه است'}</p><small>مشاهده مسیر یادگیری من ‹</small></div></a>
    <details class="student-panel student-level-details"><summary>سطح‌ها و امتیازها</summary><ol class="student-milestones">${d.milestones.map(m=>`<li class="${m.is_unlocked?'unlocked':''}" ${m.is_current?'aria-current="step"':''}><span>${m.is_unlocked?navIcon('check',18):icon('lock',{size:20})}</span><div><b>${esc(m.name)} ${m.is_current?'<small>سطح فعلی</small>':''}</b><p>${esc(m.privilege)}</p></div><strong>${num(m.min_points)}</strong></li>`).join('')}</ol></details>
    <section class="student-panel"><h2>${art('trophy')}نشان‌های من</h2><div class="student-badges">${d.badges.map(b=>`<div class="${b.unlocked?'unlocked':''}">${b.unlocked?art('trophy'):icon('lock',{size:44})}<b>${esc(b.title)}</b><small>${esc(b.desc)}</small><span>${b.unlocked?'دریافت شده':'قفل'}</span></div>`).join('')}</div></section></div>`;
}

export async function attendance(el) {
 const a=await api('/api/student/attendance');setHead('حضور و غیاب','سوابق ثبت‌شده ۹۰ روز اخیر');
 const status={present:'حاضر',absent:'غایب',excused:'غیبت موجه'};
 el.innerHTML=`<section class="student-panel"><h2>${art('calendar')}حضور و غیاب من</h2>${a.rows.map(r=>`<div class="student-list-row"><div><b>${jdate(r.date)}</b><small>${esc(r.class_name||'')}</small></div><strong>${status[r.status]}</strong></div>`).join('')||empty('calendar','هنوز سابقه‌ای ثبت نشده است')}</section>`;
}
