// Shared recurring weekly timetable. Manager overview retains every simultaneous session.
import { api, post, put, esc, fa, $, on, setHead, empty, gradeName, WEEKDAYS, printOverlay, jdate, addDays, faWeekday, ymdOf, state, icon, toast, modal, formData, fileToData, busy } from './core.js';
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
const compressScheduleImage = (file) => new Promise((resolve, reject) => {
 if (!file.type.startsWith('image/')) return fileToData(file, 10).then(resolve, reject);
 const url = URL.createObjectURL(file);
 const img = new Image();
 img.onload = () => {
  URL.revokeObjectURL(url);
  const maxDim = 1600;
  let { width: w, height: h } = img;
  if (w > maxDim || h > maxDim) {
   if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
   else { w = Math.round(w * maxDim / h); h = maxDim; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  resolve(canvas.toDataURL('image/jpeg', 0.85));
 };
 img.onerror = () => { URL.revokeObjectURL(url); fileToData(file, 10).then(resolve, reject); };
 img.src = url;
});

export async function managerTimetable(el){
 setHead('برنامه هفتگی کلاس‌ها','همهٔ کلاس‌ها، معلمان و مکان‌های کانون',`<span class="row wrap" style="gap:8px"><button type="button" class="btn sm soft" id="ttNewClass">${icon('plus',{size:15})} کلاس جدید</button><button type="button" class="btn sm soft" id="ttAddSession">${icon('plus',{size:15})} افزودن جلسه</button><button type="button" class="btn sm" id="ttPhoto">${icon('camera',{size:15})} ثبت از روی عکس</button></span>`);
 const [rows,colors,meta]=await Promise.all([api('/api/manager/schedule/overview'),api('/api/manager/schedule/colors'),api('/api/manager/meta')]);
 renderTimetable(el,rows,colors,true,meta,()=>managerTimetable(el));
}
function renderTimetable(el,rows,initialColors,manager,meta=null,reload=null){
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
 const allSubjects=[...new Set([...(meta?.subjects||[]),...subjects,'ریاضی','علوم','فارسی','هوش و استعداد','زبان انگلیسی','عربی','فیزیک','شیمی','زیست'])].sort((a,b)=>a.localeCompare(b,'fa'));
 const allRooms=[...new Set([...rooms,...(meta?.classes||[]).map(c=>`${gradeName(c.grade)} ${c.name}`)])].sort((a,b)=>a.localeCompare(b,'fa'));
 const ncBtn=document.getElementById('ttNewClass');
 if(ncBtn) ncBtn.onclick=()=>modal({
  title:'افزودن کلاس جدید',
  body:`<form id="ttNcForm" class="stack"><div class="field"><label for="ttNcG">پایه</label><select class="input" id="ttNcG" name="grade">${(meta?.grades||[4,5,6,7,8,9]).map(g=>`<option value="${g}">${gradeName(g)}</option>`).join('')}</select></div><div class="field"><label for="ttNcN">نام کلاس</label><input class="input" id="ttNcN" name="name" maxlength="30" required placeholder="مثلاً الف، ب، تیزهوشان"></div></form>`,
  actions:[{label:'انصراف',cls:'ghost',value:false},{label:'ایجاد کلاس',onClick:async m=>{
   const d=formData($('#ttNcForm',m));if(!d.name?.trim()){toast('نام کلاس را وارد کنید','err');return false;}
   await post('/api/manager/classes',{grade:Number(d.grade),name:d.name.trim()});toast('کلاس ساخته شد','ok');if(reload)reload();
  }}]
 });
 const addBtn=document.getElementById('ttAddSession');
 if(addBtn) addBtn.onclick=()=>{
  if(!meta?.classes?.length)return toast('ابتدا یک کلاس ایجاد کنید','err');
  modal({
   title:'افزودن جلسه به برنامه هفتگی',
   body:`<form id="ttAsForm" class="stack">
    <div class="form-grid">
     <div class="field"><label>کلاس</label><select class="input" name="class_id">${meta.classes.map(c=>`<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}</select></div>
     <div class="field"><label>روز هفته</label><select class="input" name="weekday">${WEEKDAYS.map((w,i)=>`<option value="${i}">${w}</option>`).join('')}</select></div>
     <div class="field"><label>ساعت شروع</label><input class="input ltr" type="time" name="start" value="16:00" required></div>
     <div class="field"><label>ساعت پایان</label><input class="input ltr" type="time" name="end" value="17:30" required></div>
     <div class="field"><label>درس</label><select class="input" name="subject_sel" id="ttAsSubj">${allSubjects.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}<option value="__new__">➕ درس جدید...</option></select><input class="input" name="subject_new" id="ttAsSubjNew" placeholder="نام درس جدید" style="display:none;margin-top:6px" maxlength="40"></div>
     <div class="field"><label>مکان</label><select class="input" name="room_sel" id="ttAsRoom"><option value="">بدون مکان</option>${allRooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}<option value="__new__">➕ مکان جدید...</option></select><input class="input" name="room_new" id="ttAsRoomNew" placeholder="نام مکان جدید" style="display:none;margin-top:6px" maxlength="30"></div>
     <div class="field"><label>نوع جلسه</label><select class="input" name="kind">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div>
     <div class="field"><label>دبیر</label><select class="input" name="teacher_id"><option value="">—</option>${(meta.teachers||[]).map(t=>`<option value="${t.id}">${esc(t.full_name)}</option>`).join('')}</select></div>
    </div>
   </form>`,
   actions:[{label:'انصراف',cls:'ghost',value:false},{label:'ثبت جلسه',onClick:async m=>{
    const f=$('#ttAsForm',m);
    const subject=f.subject_sel.value==='__new__'?f.subject_new.value.trim():f.subject_sel.value;
    const room=f.room_sel.value==='__new__'?f.room_new.value.trim():f.room_sel.value;
    if(!subject){toast('نام درس را وارد کنید','err');return false;}
    await post('/api/manager/schedule',{class_id:Number(f.class_id.value),weekday:Number(f.weekday.value),start:f.start.value,end:f.end.value,subject,room,kind:f.kind.value,teacher_id:f.teacher_id.value||null});
    toast('جلسه ثبت شد','ok');if(reload)reload();
   }}],
   onOpen:m=>{
    const sync=(s,i)=>{const se=$(s,m),ip=$(i,m);const fn=()=>{const n=se.value==='__new__';ip.style.display=n?'':'none';ip.required=n;};se.onchange=fn;fn();};
    sync('#ttAsSubj','#ttAsSubjNew');sync('#ttAsRoom','#ttAsRoomNew');
   }
  });
 };
 const phBtn=document.getElementById('ttPhoto');
 if(phBtn) phBtn.onclick=()=>{
  if(!meta?.classes?.length)return toast('ابتدا یک کلاس ایجاد کنید','err');
  let slots=[],dataUrl='';
  modal({
   title:'ثبت برنامه هفتگی از روی عکس',
   wide:true,
   body:`<div class="stack">
    <div class="field"><label>کلاس هدف</label><select class="input" id="ttSpCls">${meta.classes.map(c=>`<option value="${c.id}">${gradeName(c.grade)} ${esc(c.name)}</option>`).join('')}</select></div>
    <div class="row wrap" style="gap:10px;align-items:center">
     <input class="input grow" type="file" id="ttSpFile" accept="image/*,application/pdf">
     <button type="button" class="btn" id="ttSpParse" disabled>${icon('sparkles',{size:16})} تحلیل و استخراج برنامه</button>
    </div>
    <div id="ttSpPrev" class="center" style="display:none"><img id="ttSpImg" style="max-height:180px;border-radius:10px;border:1px solid var(--line)" alt="پیش‌نمایش"></div>
    <div id="ttSpNote" class="small muted" style="display:none"></div>
    <datalist id="ttSpSubjL">${allSubjects.map(s=>`<option value="${esc(s)}">`).join('')}</datalist>
    <datalist id="ttSpRoomL">${allRooms.map(r=>`<option value="${esc(r)}">`).join('')}</datalist>
    <div id="ttSpBox" style="display:none">
     <div class="row between wrap" style="margin-bottom:8px;gap:8px">
      <label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" id="ttSpRep"> <span class="small">جایگزینی با برنامه فعلی این کلاس</span></label>
      <button type="button" class="btn sm soft" id="ttSpAdd">${icon('plus',{size:14})} افزودن ردیف</button>
     </div>
     <div class="table-wrap"><table class="table"><thead><tr><th>روز</th><th>شروع</th><th>پایان</th><th>درس</th><th>دبیر</th><th>مکان</th><th>نوع</th><th></th></tr></thead><tbody id="ttSpRows"></tbody></table></div>
    </div>
   </div>`,
   actions:[{label:'انصراف',cls:'ghost',value:false},{label:'تایید و ثبت نهایی',onClick:async m=>{
    const trs=[...m.querySelectorAll('#ttSpRows tr')];
    if(!trs.length){toast('ابتدا تصویر را تحلیل کنید یا ردیفی اضافه کنید','err');return false;}
    const readRows=trs.map(tr=>({
     weekday:Number(tr.querySelector('[data-f="weekday"]').value),
     start:tr.querySelector('[data-f="start"]').value,
     end:tr.querySelector('[data-f="end"]').value,
     subject:tr.querySelector('[data-f="subject"]').value.trim(),
     teacher_id:tr.querySelector('[data-f="teacher_id"]').value||null,
     room:tr.querySelector('[data-f="room"]').value.trim(),
     kind:tr.querySelector('[data-f="kind"]').value
    }));
    const r=await post('/api/manager/schedule/bulk',{class_id:Number($('#ttSpCls',m).value),replace:$('#ttSpRep',m).checked,slots:readRows});
    toast(`${fa(r.inserted)} جلسه ثبت شد${r.skipped?` (${fa(r.skipped)} مورد تداخلی یا ناقص رد شد)`:''}`,'ok');if(reload)reload();
   }}],
   onOpen:m=>{
    const drawRows=()=>{
     $('#ttSpBox',m).style.display='';
     $('#ttSpRows',m).innerHTML=slots.map((s,idx)=>`<tr>
      <td><select class="input sm" data-f="weekday" style="width:95px">${WEEKDAYS.map((w,i)=>`<option value="${i}" ${i===Number(s.weekday)?'selected':''}>${w}</option>`).join('')}</select></td>
      <td><input class="input sm ltr" type="time" data-f="start" value="${esc(s.start||'16:00')}" style="width:95px"></td>
      <td><input class="input sm ltr" type="time" data-f="end" value="${esc(s.end||'17:30')}" style="width:95px"></td>
      <td><input class="input sm" data-f="subject" list="ttSpSubjL" value="${esc(s.subject||'')}" placeholder="نام درس" style="width:125px"></td>
      <td><select class="input sm" data-f="teacher_id" style="width:120px"><option value="">—</option>${(meta.teachers||[]).map(t=>`<option value="${t.id}" ${Number(s.teacher_id)===t.id?'selected':''}>${esc(t.full_name)}</option>`).join('')}</select></td>
      <td><input class="input sm" data-f="room" list="ttSpRoomL" value="${esc(s.room||'')}" placeholder="مکان" style="width:95px"></td>
      <td><select class="input sm" data-f="kind" style="width:95px">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${s.kind===k?'selected':''}>${v.label}</option>`).join('')}</select></td>
      <td><button type="button" class="btn sm ghost" data-rm="${idx}">${icon('trash',{size:14})}</button></td>
     </tr>`).join('');
    };
    $('#ttSpFile',m).onchange=async e=>{
     const f=e.target.files[0];if(!f)return;
     try{
      dataUrl=await compressScheduleImage(f);$('#ttSpParse',m).disabled=false;
      if(f.type.startsWith('image/')){$('#ttSpImg',m).src=dataUrl;$('#ttSpPrev',m).style.display='';}else{$('#ttSpPrev',m).style.display='none';}
     }catch(err){toast(err.message||'خطا در خواندن فایل','err');}
    };
    $('#ttSpParse',m).onclick=e=>busy(e.currentTarget,async()=>{
     const r=await post('/api/manager/schedule/parse-image',{image:dataUrl,class_id:Number($('#ttSpCls',m).value)});
     slots=r.slots||[];const n=$('#ttSpNote',m);
     if(r.note){n.textContent=r.note;n.style.display='';}
     else if(slots.length){n.textContent=`${fa(slots.length)} جلسه استخراج شد. پس از بررسی، دکمه تایید را بزنید.`;n.style.display='';}
     else{n.textContent='جلسه‌ای شناسایی نشد؛ می‌توانید ردیف‌ها را دستی اضافه کنید.';n.style.display='';}
     if(!slots.length)slots=[{weekday:0,start:'16:00',end:'17:30',subject:'',teacher_id:null,room:'',kind:'academic'}];
     drawRows();
    });
    $('#ttSpAdd',m).onclick=()=>{slots.push({weekday:0,start:'16:00',end:'17:30',subject:'',teacher_id:null,room:'',kind:'academic'});drawRows();};
    on(m,'click','[data-rm]',(_e,b)=>{slots.splice(Number(b.dataset.rm),1);drawRows();});
   }
  });
 };
 }
 };
 draw();
}
