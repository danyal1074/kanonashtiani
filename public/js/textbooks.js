import { api, $, esc, fa, en, gradeName, setHead, icon, state } from './core.js';

export async function textbooksView(el) {
  setHead('کتاب‌های درسی', 'نسخهٔ آزمایشی · مطالعه، تمرین و برگهٔ تشریحی', '<a class="btn ghost sm" href="#/textbook-papers">برگه‌های تشریحی کلاس</a>');
  const {books}=await api('/api/textbooks');
  el.innerHTML=`<div class="tb-library"><section class="tb-intro"><span class="tb-demo">نسخهٔ دمو</span><h2>از کتاب درسی خودت شروع کن</h2><p>کتاب را باز کن، فصل یا صفحات موردنظرت را انتخاب کن و همان بخش را بخوان.</p></section><div class="tb-book-grid">${books.map(book=>`<article class="tb-book ${book.id==='math-4'?'tb-math':'tb-science'}"><a class="tb-cover" href="#/textbooks/${book.id}" aria-label="باز کردن ${esc(book.title)}"><img src="/api/textbooks/${book.id}/pages/1" alt="صفحهٔ آغاز ${esc(book.title)}" loading="lazy"><span>${icon('book',{size:27})}</span></a><div><span class="tb-label">پایهٔ ${gradeName(book.grade)}</span><h3>${esc(book.title)}</h3><p>${fa(book.chapters.length)} فصل · ${fa(book.printed_pages)} صفحهٔ کتاب</p><a class="btn" href="#/textbooks/${book.id}">مطالعه و انتخاب صفحات ${icon('chevron-left',{size:17})}</a></div></article>`).join('')||'<section class="card">برای پایه و درس شما هنوز کتابی در این نمونه اضافه نشده است.</section>'}</div><p class="tb-notice">از داخل کتاب، تمرین چهارگزینه‌ای بساز. معلم می‌تواند برگهٔ تشریحی منتشر کند و عکس پاسخ دانش‌آموزان را دریافت کند.</p></div>`;
}

export async function textbookView(el,{id}) {
  const book=await api(`/api/textbooks/${encodeURIComponent(id)}`);
  if(!el.isConnected)return;
  setHead(book.title,'انتخاب بر اساس شمارهٔ چاپ‌شده در کتاب',`<a class="btn ghost sm" href="#/textbooks">همهٔ کتاب‌ها</a>`);
  let from=book.chapters[0].printed_start,to=book.chapters[0].printed_end,current=from;
  el.innerHTML=`<div class="tb-reader"><aside class="tb-settings"><span class="tb-demo">نسخهٔ دمو</span><h2>${esc(book.title)}</h2><p class="tb-muted">پایهٔ ${gradeName(book.grade)} · ${fa(book.chapters.length)} فصل</p><form id="tbRange"><label for="tbChapter">انتخاب فصل</label><select class="input" id="tbChapter">${book.chapters.map(c=>`<option value="${c.number}">فصل ${fa(c.number)}: ${esc(c.title)}</option>`).join('')}<option value="custom">بازهٔ دلخواه</option></select><div class="tb-fields"><div><label for="tbFrom">از صفحه</label><input class="input" id="tbFrom" type="text" inputmode="numeric" value="${from}" required aria-describedby="tbPageHint"></div><div><label for="tbTo">تا صفحه</label><input class="input" id="tbTo" type="text" inputmode="numeric" value="${to}" required aria-describedby="tbPageHint"></div></div><small id="tbPageHint">شمارهٔ چاپی کتاب: ۱ تا ${fa(book.printed_pages)}</small><p class="tb-error" id="tbError" role="alert" hidden></p><button class="btn" type="submit">نمایش صفحات انتخاب‌شده</button></form><div class="tb-selection" id="tbSelection" aria-live="polite"></div><a class="btn" id="tbPractice" style="width:100%;margin-bottom:12px">${state.me.user.role==='teacher'?'طراحی سؤال و برگهٔ تشریحی':'تست از این صفحات'}</a><a class="btn ghost" href="/api/textbooks/${book.id}/file" download>دریافت PDF کتاب ${icon('download',{size:17})}</a><p class="tb-notice">تولید خودکار سؤال در دمو بودجهٔ محدود دارد. سؤال‌های ذخیره‌شده بدون مصرف دوباره قابل استفاده‌اند؛ سؤال‌ها باید از نظر علمی بررسی شوند.</p></aside><section class="tb-viewer" aria-label="کتاب‌خوان"><nav class="tb-pagination" aria-label="جابه‌جایی صفحات"><button class="btn ghost sm" type="button" id="tbPrev" aria-label="صفحهٔ قبل">${icon('chevron-right',{size:18})}قبل</button><strong id="tbPageLabel" aria-live="polite"></strong><button class="btn ghost sm" type="button" id="tbNext" aria-label="صفحهٔ بعد">بعد${icon('chevron-left',{size:18})}</button></nav><div class="tb-page-wrap"><p id="tbLoading" role="status">در حال دریافت صفحه…</p><img class="tb-page" id="tbPage" alt="" hidden><button class="btn ghost" id="tbRetry" type="button" hidden>تلاش دوباره</button></div><p class="tb-muted tb-page-note">برای خواندن جزئیات می‌توانی تصویر صفحه را بزرگ‌نمایی کنی یا فایل PDF را دریافت کنی.</p></section></div>`;
  const image=$('#tbPage',el), loading=$('#tbLoading',el),retry=$('#tbRetry',el),chapter=$('#tbChapter',el);
  function show(){
    $('#tbPractice',el).href=`#/textbooks/${book.id}/practice?from=${from}&to=${to}`;
    $('#tbPageLabel',el).textContent=`صفحهٔ ${fa(current)} از ${fa(book.printed_pages)}`;
    $('#tbSelection',el).textContent=`بازهٔ انتخابی: ${fa(from)} تا ${fa(to)} · ${fa(to-from+1)} صفحه`;
    $('#tbPrev',el).disabled=current<=from;$('#tbNext',el).disabled=current>=to;
    loading.hidden=false;loading.textContent='در حال دریافت صفحه…';image.hidden=true;retry.hidden=true;
    image.alt=`${book.title}، صفحهٔ چاپی ${fa(current)}`;
    image.onload=()=>{loading.hidden=true;image.hidden=false;};
    image.onerror=()=>{loading.textContent='دریافت تصویر صفحه ممکن نشد.';retry.hidden=false;};
    image.src=`/api/textbooks/${encodeURIComponent(book.id)}/pages/${current}`;
    let zoom=$('#tbZoom',el);if(!zoom){$('.tb-page-note',el).insertAdjacentHTML('beforebegin','<a class="btn ghost" id="tbZoom" target="_blank" rel="noopener">نمایش بزرگ صفحه</a>');zoom=$('#tbZoom',el);}zoom.href=image.src;
  }
  chapter.onchange=()=>{if(chapter.value==='custom')return;const c=book.chapters.find(c=>c.number===Number(chapter.value));$('#tbFrom',el).value=c.printed_start;$('#tbTo',el).value=c.printed_end;};
  for(const input of [$('#tbFrom',el),$('#tbTo',el)])input.oninput=()=>{chapter.value='custom';};
  $('#tbRange',el).onsubmit=e=>{e.preventDefault();const a=en($('#tbFrom',el).value.trim()),b=en($('#tbTo',el).value.trim());const error=$('#tbError',el);if(!/^\d+$/.test(a)||!/^\d+$/.test(b)||Number(a)<1||Number(b)>book.printed_pages||Number(a)>Number(b)){error.textContent=`یک بازهٔ معتبر بین ۱ تا ${fa(book.printed_pages)} وارد کن؛ صفحهٔ شروع نباید از پایان بزرگ‌تر باشد.`;error.hidden=false;return;}error.hidden=true;from=Number(a);to=Number(b);current=from;show();if(matchMedia('(max-width:760px)').matches)$('.tb-viewer',el).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});};
  $('#tbPrev',el).onclick=()=>{if(current>from){current--;show();}};$('#tbNext',el).onclick=()=>{if(current<to){current++;show();}};retry.onclick=()=>{image.src='';show();};
  show();
}
