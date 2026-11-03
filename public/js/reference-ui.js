import { openPhotoPicker } from './profile-photo.js';
import { esc, icon, gradeName, avatar, isProfilePhoto } from './core.js';

// Presentation only: links reuse the existing role routes and permissions.
export function decorateDashboard(el, me, nav) {
  const role = me.user.role;
  if (!['student', 'teacher', 'manager'].includes(role)) return;
  el.classList.add('reference-dashboard', `dashboard-${role}`);
  const labels = { student: 'دانش‌آموز', teacher: 'معلم', manager: 'مدیر' };
  const descriptions = { student: 'برای یادگیری امروز آماده‌ای؟', teacher: 'کلاس‌های امروز شما، یک قدم تا آینده‌ای روشن', manager: 'نمای کلی عملکرد و رویدادهای کانون' };
  const tools = role === 'student' ? [
    ['/profile','book','درس‌ها','blue'], ['/assignments','clipboard','تکالیف','gold'],
    ['/exams','check-circle','آزمون‌ها','green'], ['/profile','users','کلاس من','purple'],
    ['/study','calendar','برنامه هفتگی','coral'], ['/results','chart','پیشرفت','purple'],
    ['/games','trophy','چالش‌ها','gold'], ['/profile','award','نشان‌ها و افتخارات','gold']
  ] : nav.filter(n => n.path !== '/home').slice(0,4).map((n,i) => [n.path,n.icon,n.label,['blue','purple','gold','green'][i]]);
  const section = document.createElement('section');
  section.className = 'reference-intro';
  section.innerHTML = `<div class="reference-welcome"><div class="reference-copy"><span class="reference-kicker">پنل ${labels[role]}</span><h2>سلام ${esc(me.user.full_name)}!</h2><p>${descriptions[role]}</p>${me.student ? `<span class="reference-grade">${icon('award')} پایه ${gradeName(me.student.grade)} · هر روز، یک قدم به قله</span>` : `<span class="reference-grade">${icon('sprout')} با هم برای شکوفایی استعدادها</span>`}</div><div class="reference-person person-${role}" role="img" aria-label="تصویر تزئینی ${labels[role]}"></div></div><div class="reference-tools">${tools.map(([path,ico,label,color])=>`<a href="#${path}" class="reference-tool ${color}"><span class="reference-tool-icon">${icon(ico,{size:32})}</span><b>${label}</b></a>`).join('')}</div>`;
  if (role === 'student') {
    const person = section.querySelector('.reference-person');
    if (isProfilePhoto(me.student.avatar)) {
      person.classList.add('has-student-photo');
      person.innerHTML = avatar(me.student.avatar, 'lg');
      person.setAttribute('aria-label', 'عکس پروفایل شما');
    }
    const photoButton = document.createElement('button'); photoButton.className = 'btn soft sm dashboard-photo-button';
    photoButton.innerHTML = `${icon('camera', { size:16 })} ${isProfilePhoto(me.student.avatar) ? 'تغییر عکس من' : 'افزودن عکس من'}`;
    photoButton.onclick = () => openPhotoPicker(me);
    section.querySelector('.reference-copy').append(photoButton);
  }
  el.prepend(section);
  if (role === 'student') {
    const banner = document.createElement('a');
    banner.href = '#/path'; banner.className = 'reference-path';
    banner.innerHTML = `<div><h2>مسیر نخبه شدن</h2><p>با تلاش، نظم و یادگیری</p><span class="reference-start">شروع مسیر ${icon('arrow-left',{size:16})}</span></div><div class="reference-cup" aria-hidden="true">${icon('trophy',{size:76})}<i></i><i></i><i></i></div>`;
    section.append(banner);
  }
}

