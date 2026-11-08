// پنل مشاور کانون؛ تمام شاخص‌ها از اطلاعات واقعی دانش‌آموزان همین کانون محاسبه می‌شوند.
import { api, post, put, esc, fa, num, $, $$, on, busy, toast, modal, setHead, avatar, nameAvatar, empty, jdate, jtime, jdatetime, gradeName, dateField, readDate, ymdOf, addDays, faWeekday, WEEKDAYS, tehranIso, printOverlay, state } from './core.js';
import { messagesView, accountView, announcementsView } from './common.js';

const LINES = {
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 home:'<path d="m3 11 9-8 9 8M5 9.5V21h14V9.5M9 21v-7h6v7"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 4 5"/>',
 chart:'<path d="M4 21V13h3v8M10.5 21V8h3v13M17 21V3h3v18"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5M17 3v5M3 11h18M7 15h1M12 15h1M17 15h1M7 18h1M12 18h1"/>',
 exam:'<path d="M6 3h10l4 4v14H6zM16 3v5h4M9 12h7M9 16h7"/><path d="M3 7v14"/>',
 timer:'<circle cx="12" cy="14" r="8"/><path d="M12 10v5l3 2M9 2h6M12 2v4M18 7l2-2"/>',
 message:'<path d="M4 4h16v13H10l-6 4zM8 9h8M8 13h5"/>',
 settings:'<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
 more:'<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/>',
 back:'<path d="m15 5-7 7 7 7"/>', search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
 filter:'<path d="M3 4h18l-7 8v8l-4-2v-6z"/>', plus:'<path d="M12 4v16M4 12h16"/>',
 bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 7 9-7"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>', trophy:'<path d="M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 15v6M8 21h8"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 book:'<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1zM12 5v15"/>',
 refresh:'<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>', print:'<path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7zM17 11h1"/>',
 edit:'<path d="m4 17-1 4 4-1L20 7l-3-3zM14 7l3 3"/>', arrow:'<path d="M5 16 10 11l4 3 6-9M15 5h5v5"/>',
};
export const coIcon = (name, size = 22) => `<svg class="co-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINES[name] || LINES.chart}</svg>`;
const NAV = [
 ['/home','home','داشبورد مشاور'], ['/students','users','دانش‌آموزان من'], ['/study','timer','پومودورو و مطالعه'], ['/exams','exam','آزمون‌ها'], ['/progress','chart','وضعیت تحصیلی'], ['/plans','calendar','برنامه‌ریزی و پیگیری'], ['/reports','chart','گزارش‌های تحلیلی'], ['/sessions','message','جلسات مشاوره'], ['/messages','mail','پیام‌ها'], ['/account','settings','تنظیمات'],
];
export const nav = me => NAV.map(([path, icon, label]) => ({path, icon, label, ...(path === '/messages' ? {badge:me.unread} : {})}));
export const bottomNav = () => [
 {path:'/plans',icon:'calendar',label:'برنامه‌ها'}, {path:'/students',icon:'users',label:'دانش‌آموزان'}, {path:'/home',icon:'home',label:'خانه'}, {path:'/reports',icon:'chart',label:'گزارش‌ها'}, {path:'/more',icon:'more',label:'بیشتر'},
];
export function prepareCounselor(me, path) {
 document.body.classList.toggle('counselor-home', path === '/home');
 document.querySelectorAll('.sidebar .nav-item, .bottom-nav a[data-path]').forEach(a => {
  const span = a.querySelector('.ni,.bi');
  const n = NAV.find(n => n[0] === a.dataset.path);
  if (span) span.innerHTML = coIcon(n?.[1] || (a.dataset.path === '/more' ? 'more' : 'home'));
 });
 const more = document.querySelector('.bottom-nav #moreBtn');
 if (more) more.style.display = 'none';
}
const END = '/api/counselor';
const statusInfo = { excellent:['عالی','green'], good:['خوب','blue'], attention:['نیاز به پیگیری','orange'], risk:['در معرض افت','red'] };
const badge = s => {const [label, color] = statusInfo[s] || ['بدون داده','gray'];return `<span class="co-badge ${color}">${label}</span>`;};
const percent = value => value == null ? '—' : `${fa(Math.round(Number(value)))}٪`;
const mean = a => a.length ? a.reduce((s,n)=>s+Number(n||0),0)/a.length : null;
const sum = (a,key) => a.reduce((s,n)=>s+Number(n[key]||0),0);
const identity = s => `<span class="co-student-id">${avatar(s.avatar,'sm')}<span><strong>${esc(s.full_name)}</strong><small>پایه ${gradeName(s.grade)}${s.class_name ? ` • ${esc(s.class_name)}` : ''}</small></span></span>`;
const card = (title, content, icon='chart', cls='') => `<section class="co-card ${cls}"><h2 class="co-card-title"><span class="co-title-icon">${coIcon(icon)}</span>${title}</h2>${content}</section>`;
const noData = text => `<div class="co-empty">${coIcon('chart',30)}<span>${esc(text)}</span></div>`;
const opt = (v, current, text) => `<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(text)}</option>`;
const options = (students,id) => students.map(s=>opt(s.id,id,s.full_name+` — پایه ${gradeName(s.grade)}`)).join('');
const kpi = (label,value,ic,tone='',sub='') => `<div class="co-kpi ${tone}"><span class="co-kpi-icon">${ic==='tomato'?'<span class="co-tomato" aria-hidden="true">🍅</span>':coIcon(ic,29)}</span><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</div>`;
function tabs(items,current,cls='') { return `<div class="co-tabs ${cls}" role="group">${items.map(([value,label])=>`<button type="button" data-tab="${esc(value)}" class="${String(value)===String(current)?'on':''}" aria-pressed="${String(value)===String(current)}">${label}</button>`).join('')}</div>`; }
const filterBar = (students,id='',other='') => `<div class="co-filters"><label class="co-select">${coIcon('users',19)}<select class="input" id="coStudent" aria-label="انتخاب دانش‌آموز"><option value="">همه دانش‌آموزان</option>${options(students,id)}</select></label>${other}</div>`;
const loadingChart = 'هنوز داده‌ای برای نمایش نمودار ثبت نشده است';

// نمودار SVG با میله‌های آبی و خط سبز، هم‌رنگ با تصاویر مرجع.
function chart(rows,{line=false,percentages=false,height=190,labelKey='label',valueKey='value'}={}) {
 rows=rows.filter(r=>r[valueKey]!=null&&Number.isFinite(Number(r[valueKey])));
 if (!rows.length) return noData(loadingChart);
 const W=600,H=height,L=37,R=17,T=22,B=32, vals=rows.map(r=>Number(r[valueKey]||0)), max=percentages?100:Math.max(1,...vals)*1.16;
 const space=(W-L-R)/rows.length, x=i=>L+space*(i+.5), y=v=>H-B-(H-B-T)*Math.max(0,Math.min(max,v))/max;
 const uid='co'+Math.random().toString(36).slice(2,9), base=H-B;
 const title=rows.map((r,i)=>`${r[labelKey]}: ${fa(Math.round(vals[i]))}${percentages?'٪':''}`).join('، ');
 const pts=vals.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
 return `<svg class="co-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><defs><linearGradient id="${uid}b" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#26c3fc"/><stop offset="1" stop-color="#0080e8"/></linearGradient><linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#41cf65" stop-opacity=".35"/><stop offset="1" stop-color="#41cf65" stop-opacity="0"/></linearGradient></defs>${[0,1,2,3,4].map(i=>{const v=max*i/4;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#cfdcf2" stroke-width="1"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${fa(Math.round(v))}</text>`;}).join('')}${line?`<polygon points="${x(0)},${base} ${pts} ${x(rows.length-1)},${base}" fill="url(#${uid}g)"/>`:vals.map((v,i)=>`<rect x="${x(i)-space*.29}" y="${y(v)}" width="${Math.max(4,space*.58)}" height="${Math.max(0,base-y(v))}" rx="6" fill="url(#${uid}b)"><title>${esc(rows[i][labelKey])}: ${fa(v)}</title></rect>`).join('')}${vals.length?`<polyline points="${pts}" fill="none" stroke="${line?'#27c951':'#31c65b'}" stroke-width="${line?4:2.5}" stroke-linecap="round" stroke-linejoin="round"/>${vals.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="${line?5:4}" fill="#37cc59" stroke="#e9fff1" stroke-width="1.5"/>`).join('')}`:''}${rows.map((r,i)=>rows.length>10&&i%Math.ceil(rows.length/7)!==0&&i!==rows.length-1?'':`<text x="${x(i)}" y="${H-9}" text-anchor="middle">${esc(r[labelKey])}</text>`).join('')}</svg>`;
}
function spark(values=[],s='good') {
 const color={excellent:'#29c85c',good:'#29c85c',attention:'#ffb744',risk:'#ff6287'}[s]||'#8ea6c2';
 if(!values.length)return '<span class="co-no-trend">—</span>';
 const list=values.map(v=>typeof v==='object'?Number(v.percent??v.value??0):Number(v));
 const points=list.map((v,i)=>`${list.length===1?50:3+i*94/(list.length-1)},${30-Math.max(0,Math.min(100,v))*.25}`).join(' ');
 return `<svg class="co-spark" width="84" height="33" viewBox="0 0 100 35" role="img" aria-label="روند نمره‌های ثبت‌شده"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function subjectBars(subjects, key='average') {
 if(!subjects.length)return noData('اطلاعات درسی ثبت نشده است');
 const max=key==='average'?100:Math.max(1,sum(subjects,key));
 return `<div class="co-subjects">${subjects.map((s,i)=>`<div class="co-subject"><span>${esc(s.subject||s.title||'بدون عنوان')}</span><div class="co-track"><i style="width:${Math.max(0,Math.min(100,Number(s[key]||0)/max*100))}%;--bar:${['#29ce79','#20adff','#a660ff','#ffc448'][i%4]}"></i></div><strong>${key==='average'?percent(s[key]):num(s[key])}</strong></div>`).join('')}</div>`;
}
function statusDonut(students) {
 const groups=[{name:'در مسیر برنامه',value:students.filter(s=>['excellent','good'].includes(s.status)).length,color:'#20d585'},{name:'نیاز به پیگیری',value:students.filter(s=>s.status==='attention').length,color:'#ffd043'},{name:'در معرض افت',value:students.filter(s=>s.status==='risk').length,color:'#ff6791'}];
 const total=students.length,c=2*Math.PI*49;let acc=0;
 return `<div class="co-donut-wrap"><div class="co-donut"><svg viewBox="0 0 130 130" role="img" aria-label="وضعیت ${fa(total)} دانش‌آموز"><circle cx="65" cy="65" r="49" fill="none" stroke="#e4edfa" stroke-width="20"/>${groups.map(g=>{const n=total?g.value/total*c:0;const e=`<circle cx="65" cy="65" r="49" fill="none" stroke="${g.color}" stroke-width="20" stroke-dasharray="${n} ${c-n}" stroke-dashoffset="${-acc}"/>`;acc+=n;return e;}).join('')}</svg><span><b>${num(total)}</b><small>دانش‌آموز</small></span></div><div class="co-donut-legend">${groups.map(g=>`<span><i style="background:${g.color}"></i>${g.name} <small>(${num(g.value)} نفر)</small></span>`).join('')}</div></div>`;
}
function studentTable(students,{compact=false}={}) {
 if (!students.length)return noData('دانش‌آموزی برای نمایش وجود ندارد');
 return `<div class="co-table-wrap"><table class="co-table"><thead><tr><th>#</th><th>دانش‌آموز</th><th>کلاس</th><th>پومودورو</th><th>میانگین آزمون‌ها</th><th>روند پیشرفت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${students.slice(0,compact?5:students.length).map((s,i)=>`<tr><td>${fa(i+1)}</td><td><a href="#/students/${s.id}">${identity(s)}</a></td><td>${esc(s.class_name||gradeName(s.grade))}</td><td><b>${num(s.pomodoros)}</b> <span aria-hidden="true">🍅</span></td><td>${percent(s.exam_average)}</td><td>${spark(s.trend,s.status)}</td><td>${badge(s.status)}</td><td><a class="co-detail" href="#/students/${s.id}">جزئیات ${coIcon('back',13)}</a></td></tr>`).join('')}</tbody></table></div>`;
}
function studentCards(students) {
 return students.length?`<div class="co-student-cards">${students.map(s=>`<a class="co-student-card" href="#/students/${s.id}">${identity(s)}${spark(s.trend,s.status)}<span class="co-score ${statusInfo[s.status]?.[1]||'gray'}">${percent(s.exam_average)}</span></a>`).join('')}</div>`:noData('دانش‌آموزی با این مشخصات پیدا نشد');
}
const trendRows = trend => trend.map(t=>({label:WEEKDAYS[faWeekday(t.date)],value:t.pomodoros||0}));
function periodControls(days) {return tabs([['1','امروز'],['7','۷ روز اخیر'],['30','۳۰ روز اخیر']],days,'co-period');}
function bindPeriod(el,callback){on(el,'click','.co-period [data-tab]',(_e,b)=>callback(Number(b.dataset.tab)));}
const today = () => ymdOf();
const weekStart = () => addDays(today(),-faWeekday(today()));

async function dashboard(el,_p,me) {
 setHead('داشبورد مشاور','نگاهی به مسیر رشد دانش‌آموزان');
 let days=7, data;
 const draw = async () => {
  data=await api(`${END}/dashboard?days=${days}`);
  const s=data.stats, students=data.students||[];
  el.innerHTML=`<div class="co-dashboard"><div class="co-dashboard-top"><section class="co-welcome"><div><h2>👋 سلام ${esc(me.user.full_name)}</h2><p>به پنل مشاور ${esc(me.center?.name||'کانون آشتیانی')} خوش آمدید.</p><span>همراه هر دانش‌آموز، در مسیر رشد</span></div><div class="co-welcome-art" aria-hidden="true"><span class="co-art-cap">🎓</span><span class="co-art-plant">🌱</span><i class="co-art-book b1"></i><i class="co-art-book b2"></i><i class="co-art-book b3"></i></div></section><div class="co-dashboard-kpis">${kpi('تعداد دانش‌آموزان',num(s.students),'users','blue',`در ${num(new Set(students.map(x=>x.class_id).filter(Boolean)).size)} کلاس`)}${kpi('کل پومودورو',num(s.pomodoros),'tomato','pink',days===1?'امروز':`${fa(days)} روز اخیر`)}${kpi('میانگین نمرات آزمون‌ها',percent(s.exam_average),'exam','lavender')}${kpi('میانگین پیشرفت',percent(s.progress),'trophy','lavender')}</div></div><nav class="co-shortcuts" aria-label="دسترسی سریع">${[['/exams','exam','تحلیل آزمون‌ها'],['/study','timer','پومودورو دانش‌آموزان'],['/plans','target','برنامه مطالعاتی'],['/sessions','calendar','جلسات مشاوره']].map(([href,ic,label])=>`<a href="#${href}">${coIcon(ic,28)}<b>${label}</b></a>`).join('')}</nav><div class="co-mobile-period">${periodControls(days)}</div><div class="co-dashboard-middle">${card('نتایج آزمون‌های اخیر',data.recent_exams?.length?subjectBars(data.recent_exams.slice(0,3).map(x=>({subject:x.title,average:x.average}))):noData('هنوز آزمونی ثبت نشده است'),'exam','co-recent')}${card(`روند مطالعه (پومودورو) ${days===1?'امروز':fa(days)+' روز اخیر'}`,chart(trendRows(data.trend||[])),'timer','co-trend')}${card('وضعیت کلی دانش‌آموزان',statusDonut(students),'users','co-status')}</div><div class="co-dashboard-bottom">${card('عملکرد دانش‌آموزان',`<div class="co-table-tabs">${tabs([['all','عملکرد دانش‌آموزان'],['study','پومودورو'],['exams','آزمون‌ها'],['progress','وضعیت تحصیلی']],'all','co-performance-tabs')}<a class="co-detail" href="#/students">${coIcon('filter',15)} فیلتر</a></div>${studentTable(students,{compact:true})}<a class="co-see-all" href="#/students">مشاهده همه دانش‌آموزان ${coIcon('back',15)}</a>`,'chart','co-performance')}${card(`دانش‌آموزان نیازمند توجه <small>(${num(data.attention?.length||0)} نفر)</small>`,data.attention?.length?`<div class="co-attention-list">${data.attention.slice(0,3).map(s=>`<a href="#/students/${s.id}">${identity(s)}${badge(s.status)}${coIcon('back',16)}</a>`).join('')}</div><a class="co-see-all" href="#/students?status=attention">مشاهده همه ${coIcon('back',15)}</a>`:noData('موردی برای پیگیری ثبت نشده است'),'target','co-attention')}</div></div>`;
  bindPeriod(el,async n=>{days=n;await draw();});
  on(el,'click','.co-performance-tabs [data-tab]',(_e,b)=>{location.hash='#/'+({all:'students',study:'study',exams:'exams',progress:'progress'}[b.dataset.tab]);});
 };
 await draw();
}

async function studentsView(el) {
 setHead('دانش‌آموزان','همراه مسیر پیشرفت هر دانش‌آموز');
 const students=await api(`${END}/students`), query=new URLSearchParams(location.hash.split('?')[1]||'');
 let q=query.get('q')||'', filter=query.get('status')||'all', grade='';
 el.innerHTML=`<div class="co-students-page"><div class="co-searchbox">${coIcon('search',21)}<input class="input" id="coStudentSearch" value="${esc(q)}" placeholder="جستجوی نام دانش‌آموز…" aria-label="جستجوی نام دانش‌آموز"></div><div class="co-student-toolbar">${tabs([['all','همه'],['attention','نیاز به پیگیری'],['risk','افت تحصیلی'],['excellent','پیشرو']],filter,'co-student-filter')}<select class="input" id="coGrade" aria-label="فیلتر پایه"><option value="">همه پایه‌ها</option>${[...new Set(students.map(s=>s.grade))].sort((a,b)=>a-b).map(g=>opt(g,grade,`پایه ${gradeName(g)}`)).join('')}</select></div><p class="co-result-count" id="coResultCount"></p><div id="coStudentResults"></div></div>`;
 const draw=()=>{const list=students.filter(s=>(!q||s.full_name.includes(q)||String(s.class_name||'').includes(q))&&(!grade||String(s.grade)===grade)&&(filter==='all'||(filter==='attention'?['attention','risk'].includes(s.status):s.status===filter)));$('#coResultCount',el).textContent=`${fa(list.length)} دانش‌آموز`;$('#coStudentResults',el).innerHTML=`<div class="co-desktop-list co-card">${studentTable(list)}</div><div class="co-mobile-list">${studentCards(list)}</div>`;};
 $('#coStudentSearch',el).oninput=e=>{q=e.target.value.trim();draw();};
 $('#coGrade',el).onchange=e=>{grade=e.target.value;draw();};
 on(el,'click','.co-student-filter [data-tab]',(_e,b)=>{filter=b.dataset.tab;$$('.co-student-filter [data-tab]',el).forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});draw();});
 draw();
}

async function profileView(el,params) {
 const d=await api(`${END}/students/${params.id}`),s=d.student;
 setHead(esc(s.full_name),`پایه ${gradeName(s.grade)}`,`<a class="btn ghost sm" href="#/students">بازگشت به دانش‌آموزان</a>`);
 let tab='overview';
 const draw=()=>{
  el.innerHTML=`<div class="co-profile"><div class="co-profile-head">${avatar(s.avatar,'lg')}<div><h2>${esc(s.full_name)}</h2><p>پایه ${gradeName(s.grade)}${s.class_name?' • '+esc(s.class_name):''}</p></div><a class="co-detail" href="#/messages/${s.id}">${coIcon('message',18)} پیام</a></div>${tabs([['overview','نمای کلی'],['study','مطالعه'],['exams','آزمون‌ها'],['subjects','وضعیت درسی']],[tab],'co-profile-tabs')}<div id="coProfileContent">${profileContent(d,tab)}</div></div>`;
  on(el,'click','.co-profile-tabs [data-tab]',(_e,b)=>{tab=b.dataset.tab;draw();});
  $('#coAddNote',el)?.addEventListener('click',()=>modal({title:'یادداشت پیگیری',body:'<div class="field"><label>یادداشت مشاور</label><textarea class="input" name="body" maxlength="2000" rows="5" placeholder="موضوع پیگیری و اقدام بعدی…" required></textarea></div>',actions:[{label:'ذخیره یادداشت',onClick:async m=>{const body=$('[name=body]',m).value.trim();if(!body)throw Error('یادداشت را وارد کنید');await post(`${END}/students/${s.id}/notes`,{body});const fresh=await api(`${END}/students/${s.id}`);d.notes=fresh.notes;draw();toast('یادداشت ذخیره شد','ok');}}]}));
 };
 draw();
}
function profileContent(d,tab) {
 const s=d.stats;
 if(tab==='study')return studyContent({stats:s,trend:d.pomodoros||[],subjects:aggregateSubjects(d.pomodoros||[])},true);
 if(tab==='exams')return examList(d.exams||[],true);
 if(tab==='subjects')return card('وضعیت دروس',subjectBars(d.subjects||[]),'users');
 return `<div class="co-profile-summary">${card('رتبه در پایه',`<div class="co-rank">${coIcon('trophy',45)}<strong>${s.rank?num(s.rank):'—'}</strong><small>بر اساس میانگین آزمون‌ها</small></div>`,'trophy')}${card('وضعیت کلی',`<div class="co-single-ring" style="--p:${Math.max(0,Math.min(100,s.progress||0))}"><span>${percent(s.progress)}</span></div>`,'chart')}</div>${card('روند پیشرفت تحصیلی',chart((d.trend||[]).map(t=>({label:jdate(t.date,{year:false}),value:t.percent})),{line:true,percentages:true}),'chart')}<div class="co-three-kpis">${kpi('روزهای فعال',num(s.active_days),'calendar','pink','روز')}${kpi('میانگین روزانه',num(s.daily_average),'timer','blue','دقیقه')}${kpi('کل پومودورو',num(s.pomodoros),'tomato','pink')}</div>${card('وضعیت دروس',subjectBars(d.subjects||[]),'users')}${card('یادداشت‌های پیگیری',`<button class="btn sm" id="coAddNote">${coIcon('plus',17)} افزودن یادداشت</button>${d.notes?.length?`<div class="co-notes">${d.notes.map(n=>`<article><p>${esc(n.body)}</p><small>${esc(n.author||'مشاور')} • ${jdate(n.created_at)}</small></article>`).join('')}</div>`:noData('یادداشتی برای این دانش‌آموز ثبت نشده است')}`,'message')}`;
}
function aggregateSubjects(pomodoros){const map=new Map();pomodoros.forEach(p=>{const v=map.get(p.subject)||{subject:p.subject,pomodoros:0,minutes:0};v.pomodoros+=Number(p.pomodoros||1);v.minutes+=Number(p.minutes||0);map.set(p.subject,v);});return [...map.values()];}

async function studyView(el) {
 setHead('پومودورو و مطالعه','بررسی زمان مطالعه و تمرکز دانش‌آموزان');
 const students=await api(`${END}/students`);let days=7,id='';
 const draw=async()=>{const d=await api(`${END}/study?days=${days}${id?'&student_id='+id:''}`);el.innerHTML=`<div class="co-study-page">${filterBar(students,id)}${tabs([['1','روزانه'],['7','هفتگی'],['30','ماهانه']],days,'co-period')}${studyContent(d)}</div>`;bindPeriod(el,async n=>{days=n;await draw();});$('#coStudent',el).onchange=async e=>{id=e.target.value;await draw();};};await draw();
}
function studyContent(d,individual=false) {
 const s=d.stats||{},trend=d.trend||[], grouped=new Map();
 trend.forEach(t=>{const v=grouped.get(t.date)||{date:t.date,pomodoros:0,minutes:0};v.pomodoros+=Number(t.pomodoros??1);v.minutes+=Number(t.minutes||0);grouped.set(t.date,v);});
 const rows=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date));
 return `<div class="co-study-kpis">${kpi('مجموع پومودورو',num(s.pomodoros),'tomato','pink')}${kpi('میانگین روزانه',num(s.daily_average),'timer','lavender','دقیقه')}${!individual?kpi('مجموع زمان مطالعه',num(s.minutes),'book','blue','دقیقه'):''}</div>${card('روند مطالعه',chart(trendRows(rows)), 'calendar')}${card('جزئیات مطالعه',d.subjects?.length?`<div class="co-study-details">${d.subjects.map((x,i)=>`<div><span class="co-subject-icon c${i%3}">${coIcon(['book','refresh','target'][i%3],27)}</span><b>${esc(x.subject)}</b><small>${num(x.pomodoros)} پومودورو • ${num(x.minutes)} دقیقه</small><strong>${percent(sum(d.subjects,'minutes')?Number(x.minutes)/sum(d.subjects,'minutes')*100:0)}</strong></div>`).join('')}</div>`:noData('هنوز زمانی برای مطالعه ثبت نشده است'),'users')}`;
}

function examList(exams,individual=false){return exams.length?`<div class="co-exam-list">${exams.map(e=>`<article class="co-exam-row"><span class="co-subject-icon c2">${coIcon('exam',25)}</span><div><b>${esc(e.title)}</b><small>${esc(e.subject||'آزمون جامع')} • ${e.date?jdate(e.date):'بدون تاریخ'}${!individual?` • ${num(e.participants)} شرکت‌کننده`:''}</small></div><strong>${percent(individual?e.percent:e.average)}</strong></article>`).join('')}</div>`:noData('هنوز نتیجه آزمونی ثبت نشده است');}
async function examsView(el) {
 setHead('تحلیل آزمون‌ها','مرور نتایج آزمون‌های مدرسه و آزمون‌های جامع');
 const exams=await api(`${END}/exams`);let kind='all';
 const draw=()=>{const list=exams.filter(e=>kind==='all'||(kind==='school'?e.kind!=='comprehensive':e.kind===kind)), avg=mean(list.map(e=>e.average).filter(x=>x!=null));const scored=list.filter(e=>e.average!=null),delta=scored.length>1?Number(scored[0].average)-Number(scored.at(-1).average):null;el.innerHTML=`<div class="co-exams-page">${tabs([['all','همه آزمون‌ها'],['school','آزمون‌های مدرسه'],['comprehensive','آزمون‌های جامع']],kind,'co-exam-tabs')}<div class="co-three-kpis">${kpi('تعداد آزمون',num(list.length),'exam','blue')}${kpi('روند نمره‌ها',delta==null?'—':`${delta>0?'+':''}${fa(Math.round(delta))}٪`,'arrow','green')}${kpi('میانگین کل',percent(avg),'trophy','lavender')}</div>${card('نمودار عملکرد در آزمون‌ها',chart(list.slice(0,6).reverse().map((e,i)=>({label:'آزمون '+fa(i+1),value:e.average})),{line:true,percentages:true}),'chart')}${card('آخرین آزمون‌ها',examList(list),'exam')}</div>`;on(el,'click','.co-exam-tabs [data-tab]',(_e,b)=>{kind=b.dataset.tab;draw();});};draw();
}

async function plansView(el) {
 setHead('برنامه مطالعاتی','برنامه‌ریزی هفتگی و پیگیری انجام فعالیت‌ها');
 const students=await api(`${END}/students`);let id=students[0]?.id||'',week=weekStart(),tab='plans';
 const draw=async()=>{
  const plans=id?await api(`${END}/plans?student_id=${id}&week_start=${week}`):[],plan=plans[0]||{tasks:[]}, student=students.find(s=>Number(s.id)===Number(id));
  el.innerHTML=`<div class="co-plans-page">${tabs([['plans','برنامه‌ها'],['tasks','تکالیف مطالعاتی']],tab,'co-plan-tabs')}${filterBar(students,id,`<div class="co-week-nav"><button class="icon-btn" data-week="-7" aria-label="هفته قبل">${coIcon('back',17)}</button><b>هفته ${jdate(week,{year:false})}</b><button class="icon-btn" data-week="7" aria-label="هفته بعد">${coIcon('back',17)}</button></div>`)}${student?card(`برنامه هفتگی ${esc(student.full_name)}`,`<p class="co-plan-grade">پایه ${gradeName(student.grade)}</p>${plan.tasks.length?`<div class="co-plan-days">${(tab==='tasks'?plan.tasks.map((t,i)=>({...t,index:i})).filter(t=>!t.done):plan.tasks.map((t,i)=>({...t,index:i}))).map(t=>`<div class="co-plan-task"><b>${WEEKDAYS[t.weekday]||''}</b><span><strong>${esc(t.subject)}</strong>${t.title?' • '+esc(t.title):''} <small>(${fa(t.target)} پومودورو)</small></span><button class="co-task-check ${t.done?'done':''}" data-task="${t.index}" aria-label="${t.done?'انجام نشده':'انجام شد'}: ${esc(t.subject)}" aria-pressed="${!!t.done}">${coIcon(t.done?'check':'plus',17)}</button></div>`).join('')||noData('همه فعالیت‌های این هفته انجام شده‌اند')}</div>`:noData('برای این هفته برنامه‌ای ثبت نشده است')}<button class="btn block co-edit-plan" id="coEditPlan">${coIcon('edit',18)} ${plan.tasks.length?'ویرایش برنامه':'ثبت برنامه هفتگی'}</button>`,'calendar'):noData('ابتدا یک دانش‌آموز در کانون ثبت کنید')}</div>`;
  $('#coStudent',el).onchange=async e=>{id=e.target.value;await draw();};
  on(el,'click','[data-week]',async(_e,b)=>{week=addDays(week,Number(b.dataset.week));await draw();});
  on(el,'click','.co-plan-tabs [data-tab]',async(_e,b)=>{tab=b.dataset.tab;await draw();});
  on(el,'click','[data-task]',(_e,b)=>busy(b,async()=>{const tasks=plan.tasks.map((t,i)=>i===Number(b.dataset.task)?{...t,done:!t.done}:t);await put(`${END}/plans/${id}`,{week_start:week,tasks});await draw();}));
  $('#coEditPlan',el)?.addEventListener('click',()=>editPlan(student,week,plan.tasks,draw));
 };
 await draw();
}
async function editPlan(student,week,tasks,refresh){
 const list=tasks.map(t=>({...t}));
 const row=(t,i)=>`<div class="co-edit-task" data-index="${i}"><select class="input" name="weekday" aria-label="روز هفته">${WEEKDAYS.map((n,d)=>opt(d,t.weekday,n)).join('')}</select><input class="input" name="subject" value="${esc(t.subject)}" placeholder="درس" maxlength="80" required><input class="input" name="title" value="${esc(t.title||'')}" placeholder="فعالیت مطالعه" maxlength="200" required><input class="input" type="number" name="target" value="${Number(t.target)||1}" min="1" max="100" aria-label="تعداد پومودورو"><button type="button" class="icon-btn" data-remove-task aria-label="حذف فعالیت">×</button></div>`;
 const read=m=>$$('.co-edit-task',m).map(r=>({weekday:Number($('[name=weekday]',r).value),subject:$('[name=subject]',r).value.trim(),title:$('[name=title]',r).value.trim(),target:Number($('[name=target]',r).value),done:!!list[Number(r.dataset.index)]?.done}));
 await modal({title:`برنامه ${esc(student.full_name)}`,wide:true,body:`<p class="muted small">هفته ${jdate(week)} • برای هر روز، درس و تعداد پومودورو را مشخص کنید.</p><div id="coTaskEditor">${list.map(row).join('')}</div><button class="btn ghost sm" type="button" id="coAddTask">${coIcon('plus',16)} افزودن فعالیت</button>`,onOpen:m=>{let next=list.length;$('#coAddTask',m).onclick=()=>{$('#coTaskEditor',m).insertAdjacentHTML('beforeend',row({weekday:0,subject:'',title:'',target:1},next++));};on(m,'click','[data-remove-task]',(_e,b)=>b.closest('.co-edit-task').remove());},actions:[{label:'انصراف',cls:'ghost',value:false},{label:'ذخیره برنامه',onClick:async m=>{const values=read(m);if(values.some(t=>!t.subject||!t.title||!Number.isInteger(t.target)||t.target<1||t.target>100))throw Error('نام درس، عنوان فعالیت و تعداد پومودورو معتبر را وارد کنید');await put(`${END}/plans/${student.id}`,{week_start:week,tasks:values});await refresh();toast('برنامه هفتگی ذخیره شد','ok');}}]});
}

async function sessionsView(el){
 setHead('جلسات مشاوره','مدیریت قرارها و پیگیری گفت‌وگوهای مشاوره');
 const students=await api(`${END}/students`);let tab='mine';
 const draw=async()=>{const sessions=await api(`${END}/sessions`),upcoming=sessions.filter(s=>s.status==='scheduled'&&new Date(s.starts_at).getTime()>=Date.now()),past=sessions.filter(s=>['completed','cancelled'].includes(s.status)||(s.status==='scheduled'&&new Date(s.starts_at).getTime()<Date.now())),requests=sessions.filter(s=>s.status==='requested');const rows=list=>list.length?`<div class="co-session-list">${list.map(s=>`<button class="co-session" data-session="${s.id}"><span class="co-subject-icon ${s.status==='completed'?'c0':'c2'}">${coIcon(s.status==='completed'?'check':'calendar',25)}</span><span><strong>${esc(s.full_name)}</strong><small>${jdatetime(s.starts_at)} • ${esc(s.title)}</small>${s.status==='cancelled'?'<em>لغو شده</em>':''}</span>${coIcon('back',18)}</button>`).join('')}</div>`:noData('جلسه‌ای در این بخش ثبت نشده است');el.innerHTML=`<div class="co-sessions-page">${tabs([['mine','جلسات من'],['all',`درخواست‌ها (${fa(requests.length)})`]],tab,'co-session-tabs')}<button class="co-session-banner" id="coNewSession"><span class="co-calendar-art" aria-hidden="true">🗓️</span><span><b>ثبت جلسه جدید</b><small>برای دانش‌آموز</small></span>${coIcon('plus',24)}</button>${tab==='mine'?`${card('جلسات آینده',rows(upcoming),'chart')}${card('جلسات گذشته و نیازمند پیگیری',rows(past),'calendar')}`:card('درخواست‌های دانش‌آموزان',rows(requests),'calendar')}</div>`;on(el,'click','.co-session-tabs [data-tab]',async(_e,b)=>{tab=b.dataset.tab;await draw();});$('#coNewSession',el).onclick=()=>sessionEditor(students,null,draw);on(el,'click','[data-session]',(_e,b)=>sessionEditor(students,sessions.find(s=>s.id===Number(b.dataset.session)),draw));};await draw();
}
async function sessionEditor(students,session,refresh){
 if(!students.length){toast('ابتدا دانش‌آموزی در کانون ثبت کنید');return;}
 const ymd=session?.starts_at?ymdOf(new Date(session.starts_at)):today();
 const time=session?.starts_at?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'}).format(new Date(session.starts_at)):'16:00';
 await modal({title:session?'جزئیات جلسه مشاوره':'ثبت جلسه جدید',body:`<form id="coSessionForm" class="stack"><div class="field"><label>دانش‌آموز</label><select class="input" name="student_id" ${session?'disabled':''}>${options(students,session?.student_id)}</select></div><div class="field"><label>موضوع جلسه</label><input class="input" name="title" maxlength="150" value="${esc(session?.title||'')}" required placeholder="بررسی برنامه مطالعاتی"></div><div class="field"><label>تاریخ جلسه (شمسی)</label>${dateField('coSessionDate',ymd,{minYear:1400,maxYear:1420})}</div><div class="field"><label>ساعت جلسه</label><input class="input" type="time" name="time" value="${time}" required></div>${session?`<div class="field"><label>وضعیت جلسه</label><select class="input" name="status">${[['requested','درخواست جدید'],['scheduled','تأیید و برنامه‌ریزی شده'],['completed','برگزار شده'],['cancelled','لغو شده']].map(([v,t])=>opt(v,session.status,t)).join('')}</select></div>`:''}<div class="field"><label>یادداشت جلسه</label><textarea class="input" name="notes" maxlength="3000" rows="4" placeholder="هدف جلسه و نتیجه پیگیری…">${esc(session?.notes||'')}</textarea></div></form>`,actions:[{label:'انصراف',cls:'ghost',value:false},{label:'ذخیره جلسه',onClick:async m=>{const f=$('#coSessionForm',m);if(!f.reportValidity())return false;const date=readDate(m,'coSessionDate');if(!date)throw Error('تاریخ جلسه را انتخاب کنید');const body={student_id:Number(f.elements.student_id.value),title:f.elements.title.value.trim(),starts_at:tehranIso(date,f.elements.time.value),notes:f.elements.notes.value.trim(),...(session?{status:f.elements.status.value}:{})};if(session)await put(`${END}/sessions/${session.id}`,body);else await post(`${END}/sessions`,body);await refresh();toast('جلسه ذخیره شد','ok');}}]});
}

async function reportsView(el,_p,_me,progressOnly=false){
 setHead(progressOnly?'وضعیت تحصیلی':'گزارش‌ها و تحلیل','نمای کلی از پیشرفت آموزشی کانون');
 const d=await api(`${END}/reports`);let compare=false,groupReport=false;
 const draw=()=>{const s=d.stats,grades=d.grades||[];el.innerHTML=`<div class="co-reports-page">${progressOnly?'':`<div class="co-report-actions"><button class="co-report-action" id="coGroupReport">${coIcon('users',30)}<b>گزارش گروهی<br>کلاس‌ها</b></button><button class="co-report-action pink" id="coCompare">${coIcon('chart',30)}<b>مقایسه<br>عملکرد</b></button><button class="co-report-action" id="coDownload">${coIcon('download',30)}<b>دانلود<br>گزارش</b></button></div>`}${card(compare?'مقایسه عملکرد پایه‌ها':'وضعیت کلی پایه‌ها',chart(grades.map(g=>({label:gradeName(g.grade),value:compare?g.average:g.progress})),{percentages:true}), 'tomato')}${card('تحلیل وضعیت کانون',`<div class="co-report-metrics"><div>${coIcon('arrow',26)}<span>میانگین پیشرفت تحصیلی</span><strong>${percent(s.progress)}</strong></div><div><span class="co-tomato">🍅</span><span>مجموع پومودورو</span><strong>${num(s.pomodoros)}</strong></div><div>${coIcon('exam',26)}<span>میانگین نتیجه آزمون‌ها</span><strong>${percent(s.exam_average)}</strong></div></div>`,'chart')}<div class="co-report-details ${groupReport?'expanded':''}" id="coReportDetails">${groupReport?card('گزارش گروهی کلاس‌ها',classReports(d.students||[]),'users'):card('عملکرد دانش‌آموزان',studentTable(d.students||[]),'users')}</div><button class="btn ghost co-print" id="coPrint">${coIcon('print',18)} نسخه قابل چاپ</button></div>`;$('#coCompare',el)?.addEventListener('click',()=>{compare=!compare;draw();});$('#coGroupReport',el)?.addEventListener('click',()=>{groupReport=!groupReport;draw();$('#coReportDetails',el).scrollIntoView({behavior:'smooth',block:'start'});});$('#coDownload',el)?.addEventListener('click',()=>downloadReport(d));$('#coPrint',el).onclick=()=>printOverlay(`<div dir="rtl"><h1>${esc(state.me.center?.name||'کانون آشتیانی')} — گزارش مشاور</h1><p>${jdate(today())}</p>${studentTable(d.students||[])}</div>`,'گزارش مشاور');};draw();
}
function classReports(students) {
 const groups=new Map();
 for(const student of students){const key=student.class_id||`grade-${student.grade}`;if(!groups.has(key))groups.set(key,{name:student.class_name||`بدون کلاس — پایه ${gradeName(student.grade)}`,students:[]});groups.get(key).students.push(student);}
 if(!groups.size)return noData('کلاسی برای گزارش وجود ندارد');
 return `<div class="co-table-wrap"><table class="co-table"><thead><tr><th>کلاس</th><th>تعداد دانش‌آموزان</th><th>میانگین آزمون</th><th>میانگین پیشرفت</th><th>کل پومودورو</th></tr></thead><tbody>${[...groups.values()].map(g=>`<tr><td>${esc(g.name)}</td><td>${num(g.students.length)}</td><td>${percent(mean(g.students.map(s=>s.exam_average).filter(v=>v!=null)))}</td><td>${percent(mean(g.students.map(s=>s.progress).filter(v=>v!=null)))}</td><td>${num(sum(g.students,'pomodoros'))}</td></tr>`).join('')}</tbody></table></div>`;
}
function downloadReport(d){const cell=v=>`"${String(v??'').replace(/^[=+\-@\t\r]/,"'").replace(/"/g,'""')}"`;const rows=[['نام دانش‌آموز','پایه','کلاس','تعداد پومودورو','میانگین آزمون','پیشرفت','وضعیت'],...(d.students||[]).map(s=>[s.full_name,gradeName(s.grade),s.class_name,s.pomodoros,s.exam_average??'',s.progress??'',statusInfo[s.status]?.[0]||'بدون داده'])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`counselor-report-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('گزارش دانلود شد','ok');}

async function moreView(el,_p,me){setHead('بیشتر','همه امکانات پنل مشاور');el.innerHTML=`<div class="co-more-grid">${nav(me).filter(n=>n.path!=='/home').map(n=>`<a class="co-card" href="#${n.path}">${coIcon(n.icon,30)}<b>${n.label}</b>${n.badge?`<span class="co-badge red">${fa(n.badge)}</span>`:''}</a>`).join('')}<a class="co-card" href="#/announcements">${coIcon('bell',30)}<b>اطلاعیه‌ها</b></a><button type="button" class="co-card pwa-install" data-pwa-install><img src="/icons/icon-192.png" alt="" width="30" height="30"><b>نصب در موبایل</b></button></div>`;}
export const routes = [
 {path:'/home',view:dashboard}, {path:'/students',view:studentsView}, {path:'/students/:id',view:profileView},
 {path:'/study',view:studyView}, {path:'/exams',view:examsView}, {path:'/plans',view:plansView},
 {path:'/sessions',view:sessionsView}, {path:'/reports',view:reportsView}, {path:'/progress',view:(el,p,me)=>reportsView(el,p,me,true)},
 {path:'/messages',view:messagesView}, {path:'/messages/:id',view:messagesView}, {path:'/account',view:accountView}, {path:'/announcements',view:announcementsView}, {path:'/more',view:moreView},
];
