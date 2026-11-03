const database = fetch(new URL('../demo-data.json', import.meta.url)).then(r => { if(!r.ok)throw Error('بارگذاری داده نمایشی ممکن نشد');return r.json(); });
let role = sessionStorage.getItem('roshd-static-demo-role');
const roles = {student:'دانش‌آموز',teacher:'معلم',manager:'مدیر کانون',parent:'والدین',admin:'مدیر سامانه'};
export function demoNotice(message='این نسخه نمایشی است؛ اطلاعات ثبت یا ارسال نمی‌شود.') {
 let box=document.querySelector('#demoNotice');if(!box){box=document.createElement('div');box.id='demoNotice';box.setAttribute('role','status');document.body.append(box);}box.textContent=message;box.hidden=false;clearTimeout(window.demoNoticeTimer);window.demoNoticeTimer=setTimeout(()=>box.hidden=true,4000);
}
export async function demoApi(path, { method='GET', body }={}) {
 const db=await database;
 if(path==='/api/auth/login'){role=Object.hasOwn(roles,body?.role)?body.role:'student';sessionStorage.setItem('roshd-static-demo-role',role);return {ok:true,role};}
 if(path==='/api/auth/logout'){role=null;sessionStorage.removeItem('roshd-static-demo-role');return {ok:true};}
 if(path==='/api/me'&&!role)throw Error('یک پنل نمایشی انتخاب کنید.');
 if(method!=='GET'){demoNotice();throw Error('نسخه نمایشی: ثبت، پرداخت، ارسال و تغییر اطلاعات غیرفعال است.');}
 const key=path.split('?')[0];const data=db[role||'student'];
 if(Object.hasOwn(data,key))return structuredClone(data[key]);
 const pattern=Object.keys(data).find(p=>p.includes(':')&&new RegExp('^'+p.replace(/:\w+/g,'[^/]+')+'$').test(key));
 if(pattern)return structuredClone(data[pattern]);
 demoNotice('این جزئیات در نسخه نمایشی آماده نشده است.');throw Error('این بخش جزئیات در نسخه نمایشی موجود نیست.');
}
function initDemo(){
 const bar=document.createElement('div');bar.className='demo-bar';bar.innerHTML='<b>نسخه نمایشی سامانه</b><span>داده‌ها نمونه هستند؛ ثبت و آپلود غیرفعال است.</span><a href="#/login">تغییر پنل</a>';document.body.prepend(bar);
 const disableFiles=()=>{document.querySelectorAll('input[type="file"]').forEach(e=>{e.disabled=true;e.title='آپلود در نسخه نمایشی غیرفعال است';});document.querySelectorAll('a[href^="/api/"]').forEach(e=>{e.removeAttribute('href');e.title='در نسخه نمایشی غیرفعال است';});};
 new MutationObserver(disableFiles).observe(document.querySelector('#root'),{childList:true,subtree:true});disableFiles();
 document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();demoNotice();},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initDemo);else initDemo();
