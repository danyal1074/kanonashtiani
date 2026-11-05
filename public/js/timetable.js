// Shared recurring weekly timetable. Manager overview retains every simultaneous session.
import { api, put, esc, fa, $, on, setHead, empty, gradeName, WEEKDAYS, printOverlay, jdate, addDays, faWeekday, ymdOf, state, icon, toast } from './core.js';
export const KINDS = {
 academic:{label:'درسی',cls:'k-academic',color:'#eee7fa'},tarbiati:{label:'تربیتی',cls:'k-tarbiati',color:'#ffe58f'},
 chess:{label:'شطرنج',cls:'k-chess',color:'#d7edff'},robotics:{label:'رباتیک',cls:'k-robotics',color:'#e0d9fc'},
 language:{label:'زبان',cls:'k-language',color:'#a6edef'},sport:{label:'ورزش',cls:'k-sport',color:'#c6f5a1'},other:{label:'سایر',cls:'k-other',color:'#f9d8ec'}
};
export const kindOf=k=>KINDS[k]||KINDS.academic;
const valid=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
function ink(hex){const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);const l=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;return (l+.05)/.05>=1.05/(l+.05)?'#101d36':'#ffffff';}
function colorOf(s,p){const c=p.subjects?.[s.subject]||p.kinds?.[s.kind]||kindOf(s.kind).color;return valid(c)?c:kindOf(s.kind).color;}
const paint=c=>`style="--session-bg:${c};--session-ink:${ink(c)}"`;
const label=s=>`${gradeName(s.grade)} ${esc(s.class_name)}`;
const time=s=>`<bdi dir="ltr">${fa(s.start)} – ${fa(s.end)}</bdi>`;
const overlap=(a,b)=>a.weekday===b.weekday&&a.start<b.end&&b.start<a.end&&a.id!==b.id;
function card(s,p,rows,manager){
 const simultaneous=manager&&rows.some(x=>overlap(s,x));
 return `<article class="tt-event" data-session-id="${s.id}" ${paint(colorOf(s,p))}><div class="tt-event-title"><b>${label(s)}</b>${simultaneous?'<small class="tt-overlap">هم‌زمان</small>':''}</div><span class="tt-subject">${esc(s.subject)}</span><span class="tt-location">${icon('building',{size:16})}${esc(s.room||'مکان تعیین نشده')}</span><span class="tt-event-time">${time(s)}</span>${manager?`<small class="tt-teacher-name">${esc(s.teacher||'معلم تعیین نشده')}</small>`:''}</article>`;
}
export async function teacherTimetable(el){
 setHead('برنامه هفتگی کلاس‌های من','فقط کلاس‌های اختصاص‌یافته به شما','');
 const d=await api('/api/teacher/schedule'); renderTimetable(el,d.sessions,d.colors||{},false);
}
export async function managerTimetable(el){
 setHead('برنامه هفتگی کلاس‌ها','همهٔ کلاس‌ها، معلمان و مکان‌های کانون','<a class="btn sm" href="#/staff">ویرایش جلسات</a>');
 const [rows,colors]=await Promise.all([api('/api/manager/schedule/overview'),api('/api/manager/schedule/colors')]);renderTimetable(el,rows,colors,true);
}
function renderTimetable(el,rows,initialColors,manager){
 let palette=initialColors,mode=matchMedia('(max-width:700px)').matches?'day':'week',date=state.me?.today||ymdOf(),room='',kind='';
 const subjects=[...new Set(rows.map(s=>s.subject))].sort((a,b)=>a.localeCompare(b,'fa'));
 const rooms=[...new Set(rows.map(s=>s.room).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa'));
 const colorEditor=()=>`<details class="tt-colors"><summary>${icon('settings')} تنظیم رنگ درس‌ها</summary><form id="ttColors"><p>رنگ دسته‌ها برای همهٔ معلمان این کانون مشترک است. رنگ اختصاصی درس بر رنگ دسته اولویت دارد.</p><div class="tt-color-fields">${Object.entries(KINDS).map(([k,v])=>`<label>${v.label}<input type="color" data-kind="${k}" value="${valid(palette.kinds?.[k])?palette.kinds[k]:v.color}" aria-label="رنگ ${v.label}"></label>`).join('')}</div><h3>رنگ اختصاصی هر درس</h3><div class="tt-color-fields">${subjects.map((s,i)=>`<label><span><input type="checkbox" data-enabled="${i}" ${valid(palette.subjects?.[s])?'checked':''}> ${esc(s)}</span><input type="color" data-subject-index="${i}" value="${colorOf({subject:s,kind:'academic'},palette)}" aria-label="رنگ ${esc(s)}"></label>`).join('')}</div><div class="tt-color-actions"><button class="btn" type="submit">ذخیره رنگ‌ها</button><button class="btn ghost" type="button" id="ttDefaults">بازگشت به رنگ‌های پیش‌فرض</button></div></form></details>`;
 const draw=()=>{
 const weekday=faWeekday(date),start=addDays(date,-weekday);
 const list=rows.filter(s=>(!room||s.room===room)&&(!kind||(s.kind||'academic')===kind));
 const selected=list.filter(s=>s.weekday===weekday).sort((a,b)=>a.start.localeCompare(b.start)||String(a.room).localeCompare(String(b.room),'fa'));
 const slots=[...new Set(list.map(s=>s.start+'|'+s.end))].sort();
 const event=s=>card(s,palette,list,manager);
 const grid=`<div class="tt-grid-wrap" tabindex="0" role="region" aria-label="جدول برنامه هفته؛ برای دیدن تمام روزها افقی پیمایش کنید"><table class="tt-grid"><thead><tr><th scope="col">ساعت</th>${WEEKDAYS.map((w,i)=>`<th scope="col" class="${i===weekday?'tt-selected':''}"><button type="button" data-select-day="${i}">${w}<small>${jdate(addDays(start,i),{year:false})}</small></button></th>`).join('')}</tr></thead><tbody>${slots.map(slot=>{const[a,b]=slot.split('|');return `<tr><th scope="row"><bdi dir="ltr">${fa(a)}<br>–<br>${fa(b)}</bdi></th>${WEEKDAYS.map((_,i)=>`<td>${list.filter(s=>s.weekday===i&&s.start===a&&s.end===b).map(event).join('')||'<span class="tt-free">—</span>'}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
 const daily=`<div class="tt-agenda">${selected.map(s=>`<div class="tt-agenda-row"><div class="tt-agenda-time">${time(s)}</div>${event(s)}</div>`).join('')||empty('calendar','برای این روز جلسه‌ای ثبت نشده است')}</div>`;
 const listing=`<div class="tt-list">${WEEKDAYS.map((w,i)=>{const ds=list.filter(s=>s.weekday===i);return ds.length?`<section><h3>${w}</h3><div class="tt-agenda">${ds.map(s=>`<div class="tt-agenda-row"><div class="tt-agenda-time">${time(s)}</div>${event(s)}</div>`).join('')}</div></section>`:'';}).join('')}</div>`;
 el.innerHTML=`<section class="tt tt-reference ${manager?'tt-manager':'tt-teacher'}"><header class="tt-banner"><span class="tt-banner-icon">${icon('calendar',{size:64})}</span><div><h2>برنامه هفتگی کلاس‌ها</h2><p>${manager?'نمای کلی کانون و کلاس‌های هم‌زمان':'برنامه اختصاصی کلاس‌های شما'}</p></div></header><div class="tt-toolbar"><div class="tt-view-tabs" role="group" aria-label="نوع نمایش">${[['week','نمایش هفته'],['day','نمایش روز'],['list','لیست کلاس‌ها']].map(([v,t])=>`<button type="button" data-mode="${v}" aria-pressed="${mode===v}" class="${mode===v?'active':''}">${t}</button>`).join('')}</div><button class="btn ghost sm" id="ttPrint">چاپ برنامه</button></div><div class="tt-datebar"><button type="button" data-step="-1" aria-label="${mode==='day'?'روز':'هفته'} قبل">${icon('chevron-right')}</button><strong>${mode==='day'?WEEKDAYS[weekday]+' '+jdate(date):'هفتهٔ '+jdate(start)+' تا '+jdate(addDays(start,6))}</strong><button type="button" data-step="1" aria-label="${mode==='day'?'روز':'هفته'} بعد">${icon('chevron-left')}</button><button type="button" id="ttToday">امروز</button></div><p class="tt-repeat-note">برنامهٔ تکرارشوندهٔ هفتگی · تاریخ‌ها برای مرور هفته نمایش داده می‌شوند.</p><div class="tt-filters"><label>مکان<select id="ttRoom" class="input"><option value="">همهٔ مکان‌ها</option>${rooms.map(r=>`<option ${r===room?'selected':''}>${esc(r)}</option>`).join('')}</select></label><label>نوع درس<select id="ttKind" class="input"><option value="">همهٔ انواع</option>${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${kind===k?'selected':''}>${v.label}</option>`).join('')}</select></label></div><div id="ttContent">${!list.length?empty('calendar','جلسه‌ای مطابق این فیلتر ثبت نشده است'):mode==='week'?grid:mode==='day'?daily:listing}</div>${mode==='day'?`<div class="tt-daily-summary"><span><b>${fa(selected.length)}</b> کلاس</span><span><b>${fa(new Set(selected.map(s=>s.room).filter(Boolean)).size)}</b> مکان</span><span><b>${fa(selected.reduce((n,s)=>{const m=t=>Number(t.slice(0,2))*60+Number(t.slice(3));return n+m(s.end)-m(s.start)},0))}</b> دقیقه‌جلسه</span></div>`:''}<footer class="tt-legend"><b>راهنمای رنگ‌ها:</b>${Object.entries(KINDS).map(([k,v])=>`<span class="tt-chip" ${paint(valid(palette.kinds?.[k])?palette.kinds[k]:v.color)}>${v.label}</span>`).join('')}${Object.entries(palette.subjects||{}).filter(([,c])=>valid(c)).map(([s,c])=>`<span class="tt-chip" ${paint(c)}>${esc(s)}</span>`).join('')}</footer>${manager?colorEditor():''}</section>`;
 $('[data-step="-1"]',el).onclick=()=>{date=addDays(date,mode==='day'?-1:-7);draw()};
 $('[data-step="1"]',el).onclick=()=>{date=addDays(date,mode==='day'?1:7);draw()};
 $('#ttToday',el).onclick=()=>{date=state.me?.today||ymdOf();draw()};
 el.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;draw()});
 el.querySelectorAll('[data-select-day]').forEach(b=>b.onclick=()=>{date=addDays(start,Number(b.dataset.selectDay));mode='day';draw()});
 $('#ttRoom',el).onchange=e=>{room=e.target.value;draw()};$('#ttKind',el).onchange=e=>{kind=e.target.value;draw()};
 $('#ttPrint',el).onclick=()=>printOverlay(`<section class="tt tt-reference tt-print"><h1>برنامه هفتگی کلاس‌ها</h1>${$('#ttContent',el).innerHTML}<div class="tt-legend">${$('.tt-legend',el).innerHTML}</div></section>`,'برنامه هفتگی');
 if(manager){
 const save=async(config,button)=>{button.disabled=true;try{await put('/api/manager/schedule/colors',config);palette=config;toast('رنگ‌ها برای کانون ذخیره شد','ok');draw()}catch(e){toast(e.message,'err');button.disabled=false}};
 $('#ttColors',el).onsubmit=e=>{e.preventDefault();const config={kinds:{},subjects:{}};el.querySelectorAll('[data-kind]').forEach(i=>config.kinds[i.dataset.kind]=i.value);el.querySelectorAll('[data-subject-index]').forEach(i=>{if(el.querySelector('[data-enabled="'+i.dataset.subjectIndex+'"]').checked)config.subjects[subjects[Number(i.dataset.subjectIndex)]]=i.value});save(config,e.submitter)};
 $('#ttDefaults',el).onclick=e=>save({kinds:{},subjects:{}},e.currentTarget);
 }
 };
 draw();
}
