import { esc, icon, jdate, nameAvatar, logoHtml } from './core.js';
import { lookToggleHtml } from './look.js';
export function prepareManager(me) {
 const sidebar=document.querySelector('.manager-ui .sidebar');
 if(!sidebar || sidebar.querySelector('.mp-profile')) return;
 const box=document.createElement('div'); box.className='mp-profile';
 box.innerHTML=`<span class="mp-crown">${icon('crown',{size:38})}</span><b>پنل مدیر</b><a href="#/account" aria-label="حساب کاربری مدیر">${nameAvatar(me.user.full_name,'lg')}</a><strong>${esc(me.user.full_name)}</strong><small>مدیر کانون</small>`;
 sidebar.prepend(box);
 const foot=sidebar.querySelector('.foot'); if(foot && !foot.querySelector('.look-toggle')) foot.insertAdjacentHTML('afterbegin', lookToggleHtml('classic'));
 const top=document.querySelector('.manager-ui .topbar');
 if(top && !top.querySelector('.mp-brand')) {
   const brand=document.createElement('a');brand.href='#/home';brand.className='mp-brand';
   brand.innerHTML=`<span>${logoHtml(me.center?.logo)}</span><b>${esc(me.center?.name||'کانون آشتیانی')}</b>`;
   top.prepend(brand);
 }
}
export function decorateManager(el,me,path,nav) {
 if(path!=='/home') return;
 const section=document.createElement('section');section.className='mp-intro';
 section.innerHTML=`<div class="mp-hero"><h2>سلام مدیر گرامی</h2><p>به پنل مدیریت کانون خوش آمدید.</p><span>${jdate(me.today,{weekday:true})}</span></div><nav class="mp-launcher" aria-label="دسترسی به بخش‌های مدیریت">${nav.filter(n=>n.path!=='/home').slice(0,9).map(n=>`<a href="#${n.path}"><span>${icon(n.icon,{size:42})}</span><b>${n.label}</b></a>`).join('')}</nav>`;
 const extra=nav.filter(n=>n.path!=='/home').slice(9);
 if(extra.length) {
 const details=document.createElement('details');details.className='mp-more-sections';
 details.innerHTML='<summary>سایر بخش‌های مدیریت</summary><nav class="mp-launcher" aria-label="سایر بخش‌ها">'+extra.map(n=>'<a href="#'+n.path+'"><span>'+icon(n.icon,{size:42})+'</span><b>'+n.label+'</b></a>').join('')+'</nav>';
 section.append(details);
 }
 el.prepend(section);
}
