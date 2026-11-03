import { post, icon, logoHtml } from './core.js';
export async function loginView(root,onDone) {
 document.title='نمایش امکانات | رشد نخبه';
 const roles=[['student','backpack','پنل دانش‌آموز','تکالیف، آزمون، مسیر رشد و بازی'],['teacher','board','پنل معلم','کلاس‌ها، حضور و غیاب و تکالیف'],['manager','building','پنل مدیر کانون','دانش‌آموزان، شهریه و گزارش‌ها'],['parent','users','پنل والدین','پیشرفت و کارنامه فرزند'],['admin','shield','مدیریت سامانه','نمای کلی کانون‌ها و تنظیمات']];
 root.innerHTML=`<main class="demo-entry"><div class="demo-entry-logo">${logoHtml('/img/logo-ashtiani.png')}</div><span class="reference-kicker">کانون نخبه‌پروری شهید دانشمند کاظم آشتیانی</span><h1>یک قدم به آینده نزدیک‌تر</h1><p>برای آشنایی با امکانات سامانه، یکی از پنل‌ها را انتخاب کنید.</p><div class="demo-entry-grid">${roles.map(([role,ico,title,desc])=>`<button class="demo-entry-card" data-demo-role="${role}">${icon(ico,{size:68})}<b>${title}</b><span>${desc}</span><small>مشاهده پنل ←</small></button>`).join('')}</div><p class="small muted">ورود بدون نام کاربری و رمز عبور · اطلاعات نمونه · بدون ثبت تغییرات</p></main>`;
 root.querySelectorAll('[data-demo-role]').forEach(b=>b.onclick=async()=>{b.disabled=true;await post('/api/auth/login',{role:b.dataset.demoRole});location.hash='#/home';await onDone();});
}
