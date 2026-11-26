import { api, post, esc, fa, $, state, jdate, jtime, toDate, ymdOf, isProfilePhoto, ROLE_NAMES, setHead } from './core.js';

const PATHS = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  send:'<path d="m21 3-7 18-4-7-7-4 18-7Z"/><path d="m10 14 5-5"/>',
  back:'<path d="m9 5 7 7-7 7M4 12h12"/>',
  chat:'<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8M8 14h5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/>',
  down:'<path d="m6 9 6 6 6-6"/>', check:'<path d="m5 12 4 4L19 6"/>',
  read:'<path d="m2 12 4 4L16 6M11 15l2 2L23 7"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.chat}</svg>`;
const drafts = new Map();
let cleanup = () => {};
export function leaveMessages() { cleanup(); cleanup = () => {}; document.body.classList.remove('messenger-page', 'messenger-thread'); }
const normalized = (s) => String(s || '').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').trim();
const face = (c) => {
  const name = String(c.name || 'کاربر');
  const tone = [...name].reduce((n,ch) => n + ch.charCodeAt(0), 0) % 5;
  return `<span class="ms-avatar ms-tone-${tone}" aria-hidden="true">${isProfilePhoto(c.avatar) ? `<img src="${esc(c.avatar)}" alt="">` : esc(name.trim().split(/\s+/).map(n=>n[0]).filter(Boolean).slice(0,2).join(''))}</span>`;
};

export async function messagesView(el, params = {}) {
  leaveMessages();
  setHead('پیام‌رسان کانون', 'گفت‌وگو با اعضای کانون');
  document.body.classList.add('messenger-page');
  const active = Number(params.id) || null, uid = state.me.user.id;
  let disposed = false, timer, contacts = [], filter = '', unreadOnly = false, sending = false, signature = '', loaded = false;
  let messages = [], refreshing = false;
  const draftKey = `${uid}:${active}`;
  const viewport = () => { el.style.setProperty('--ms-vh', `${window.visualViewport?.height || innerHeight}px`); el.style.setProperty('--ms-top', `${window.visualViewport?.offsetTop || 0}px`); const input=el.querySelector('#msBody');if(input){input.style.height='auto';input.style.height=`${Math.min(132,input.scrollHeight)}px`;} };
  viewport(); window.addEventListener('resize', viewport); window.visualViewport?.addEventListener('resize', viewport); window.visualViewport?.addEventListener('scroll', viewport);
  const saveDraft = () => { const input = el.querySelector('#msBody'); if (input && active) { if(input.value)drafts.set(draftKey,input.value);else drafts.delete(draftKey); } };
  cleanup = () => { disposed = true; clearTimeout(timer); saveDraft(); window.removeEventListener('resize', viewport); window.visualViewport?.removeEventListener('resize', viewport); window.visualViewport?.removeEventListener('scroll', viewport); };
  const alive = () => !disposed && el.isConnected;
  el.innerHTML = `<section class="chat ms-app ${active ? 'has-active' : ''}" aria-label="پیام‌رسان کانون">
    <aside class="chat-list ms-list"><header class="ms-list-head"><div class="ms-list-title"><span class="ms-brand-icon">${svg('chat')}</span><div><h2>پیام‌رسان کانون</h2><p id="msSummary">گفت‌وگوهای شما</p></div></div><label class="ms-search">${svg('search')}<input id="cSearch" type="search" placeholder="جست‌وجوی نام یا پیام…" aria-label="جست‌وجو در گفت‌وگوها" autocomplete="off"></label><div class="ms-tabs" role="group" aria-label="فیلتر گفت‌وگوها"><button type="button" data-ms-tab="all" aria-pressed="true">همهٔ گفت‌وگوها</button><button type="button" data-ms-tab="unread" aria-pressed="false">خوانده‌نشده <span id="msUnread">۰</span></button></div></header><div id="cList" class="ms-contacts" aria-label="گفت‌وگوها"><p class="ms-list-empty" role="status">در حال دریافت گفت‌وگوها…</p></div><footer class="ms-list-foot">${svg('lock')}ارتباط داخلی اعضای کانون</footer></aside>
    <section class="chat-pane ms-pane" id="pane" aria-label="گفت‌وگوی انتخاب‌شده"></section></section>`;
  function drawList() {
    const rows = contacts.filter(c => (!unreadOnly || c.unread) && (!filter || normalized(`${c.name} ${c.last?.body || ''}`).includes(filter))).sort((a,b) => (b.last?.created_at || '').localeCompare(a.last?.created_at || '') || a.name.localeCompare(b.name,'fa'));
    $('#msSummary',el).textContent = `${fa(contacts.length)} مخاطب در کانون شما`;
    $('#msUnread',el).textContent = fa(contacts.reduce((sum,c)=>sum+(c.unread || 0),0));
    $('#cList',el).innerHTML = rows.map(c=>`<button type="button" class="contact ms-contact ${c.id===active?'on':''} ${c.unread?'has-unread':''}" data-ms-contact="${c.id}" ${c.id===active?'aria-current="true"':''}>${face(c)}<span class="ms-contact-body"><span class="ms-contact-top"><b>${esc(c.name)}</b>${c.last?`<time>${jtime(c.last.created_at)}</time>`:''}</span><span class="ms-contact-bottom"><span class="ms-preview">${c.last?.from_id===uid?'شما: ':''}${esc(c.last?.body || c.sub || ROLE_NAMES[c.role] || '')}</span>${c.unread?`<span class="ms-unread" aria-label="${fa(c.unread)} پیام خوانده‌نشده">${fa(c.unread)}</span>`:''}</span></span></button>`).join('') || `<div class="ms-list-empty">${svg('search')}<b>${filter?'نتیجه‌ای پیدا نشد':unreadOnly?'همهٔ پیام‌ها خوانده شده‌اند':'هنوز مخاطبی در دسترس نیست'}</b><small>${filter?'نام دیگری را جست‌وجو کنید':'مخاطبان بر اساس ارتباط شما در کانون نمایش داده می‌شوند.'}</small></div>`;
  }
  const pane = $('#pane',el);
  const emptyPane = (title, text) => { pane.innerHTML = `<div class="ms-welcome"><span>${svg('chat')}</span><h3>${title}</h3><p>${text}</p><small>${svg('lock')}شمارهٔ تماس کاربران نمایش داده نمی‌شود</small>${active?'<a href="#/messages" class="ms-empty-back">بازگشت به گفت‌وگوها</a>':''}</div>`; };
  emptyPane('اینجا گفت‌وگو شروع می‌شود','برای دیدن پیام‌ها و شروع مکالمه، یک مخاطب را انتخاب کنید.');
  $('#cSearch',el).oninput=e=>{filter=normalized(e.target.value);drawList();};
  el.addEventListener('click',e=>{
    const contact=e.target.closest('[data-ms-contact]');if(contact){location.hash=`#/messages/${contact.dataset.msContact}`;return;}
    const tab=e.target.closest('[data-ms-tab]');if(tab){unreadOnly=tab.dataset.msTab==='unread';el.querySelectorAll('[data-ms-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));drawList();}
  });
  contacts = await api('/api/messages/contacts');
  if(!alive())return;
  drawList();
  const contact = contacts.find(c=>c.id===active);
  if(active && !contact)emptyPane('این گفت‌وگو در دسترس نیست','از فهرست، یکی از مخاطبان مجاز خود را انتخاب کنید.');
  if(contact){
    document.body.classList.add('messenger-thread');
    pane.innerHTML=`<header class="ms-thread-head"><a class="ms-icon-btn ms-back" href="#/messages" aria-label="بازگشت به گفت‌وگوها">${svg('back')}</a>${face(contact)}<div class="ms-person"><h3>${esc(contact.name)}</h3><p>${esc(contact.sub || ROLE_NAMES[contact.role] || 'عضو کانون')}</p></div><span class="ms-thread-lock" title="گفت‌وگوی داخلی کانون">${svg('lock')}</span></header><div class="ms-history-wrap"><div class="msgs ms-history" id="msgs" tabindex="0" aria-label="تاریخچهٔ پیام‌ها"><p class="ms-list-empty" role="status">در حال دریافت پیام‌ها…</p></div><button type="button" class="ms-jump" hidden aria-label="رفتن به آخرین پیام‌ها">${svg('down')}پیام‌های جدید</button></div><div class="ms-connection" role="status" hidden></div><form class="composer ms-composer" id="composer"><div class="ms-emoji-wrap"><button type="button" class="ms-icon-btn" id="msEmojiToggle" aria-label="انتخاب شکلک" aria-expanded="false" aria-controls="msEmojis">${svg('smile')}</button><div id="msEmojis" class="ms-emojis" hidden aria-label="شکلک‌ها">${['👍','🙏','🌷','😊','👏','❤️','✅','🎉'].map((emoji,i)=>`<button type="button" data-ms-emoji="${emoji}" aria-label="${['پسندیدن','سپاس','گل','لبخند','تشویق','قلب','تأیید','تبریک'][i]}">${emoji}</button>`).join('')}</div></div><div class="ms-input-wrap"><textarea id="msBody" name="body" rows="1" maxlength="2000" placeholder="پیامتان را بنویسید…" aria-label="متن پیام" dir="auto"></textarea><span id="msCounter" hidden></span></div><button class="ms-send" type="submit" aria-label="ارسال پیام" disabled>${svg('send')}</button></form><div class="ms-compose-hint">Enter برای ارسال · Shift + Enter برای خط جدید</div><span class="sr-only" id="msLive" role="status" aria-live="polite"></span>`;
    let sendRevision=0;
    const input=$('#msBody',el), form=$('#composer',el), history=$('#msgs',el), jump=el.querySelector('.ms-jump');
    input.value=drafts.get(draftKey)||'';
    const updateInput=()=>{input.style.height='auto';input.style.height=`${Math.min(132,input.scrollHeight)}px`;form.querySelector('.ms-send').disabled=sending||!input.value.trim();$('#msCounter',el).hidden=input.value.length<1800;$('#msCounter',el).textContent=`${fa(input.value.length)} / ۲۰۰۰`;saveDraft();};
    input.oninput=updateInput;updateInput();
    jump.onclick=()=>{history.scrollTop=history.scrollHeight;jump.hidden=true;};
    history.onscroll=()=>{if(history.scrollHeight-history.scrollTop-history.clientHeight<80)jump.hidden=true;};
    const emojiToggle=$('#msEmojiToggle',el), emojis=$('#msEmojis',el);
    const closeEmoji=()=>{emojis.hidden=true;emojiToggle.setAttribute('aria-expanded','false');};
    emojiToggle.onclick=()=>{emojis.hidden=!emojis.hidden;emojiToggle.setAttribute('aria-expanded',String(!emojis.hidden));};
    el.addEventListener('click',e=>{const b=e.target.closest('[data-ms-emoji]');if(b){input.setRangeText(b.dataset.msEmoji,input.selectionStart,input.selectionEnd,'end');input.value=input.value.slice(0,2000);updateInput();closeEmoji();input.focus();}else if(!e.target.closest('.ms-emoji-wrap'))closeEmoji();});
    el.addEventListener('keydown',e=>{if(e.key==='Escape'){closeEmoji();if(e.target.closest('.ms-emoji-wrap'))emojiToggle.focus();}});
    function drawMessages(next, forceBottom=false){
      const sig=JSON.stringify(next);if(sig===signature)return;signature=sig;
      const nearBottom=!loaded||forceBottom||history.scrollHeight-history.scrollTop-history.clientHeight<80;
      const scroll=history.scrollTop, newCount=next.filter(m=>!messages.some(old=>old.id===m.id)&&m.from_id!==uid).length;
      let day='';
      history.innerHTML=`<p class="ms-privacy">${svg('lock')}گفت‌وگوی داخلی کانون · شماره تماس شما نمایش داده نمی‌شود</p>${next.length===200?'<p class="ms-day">۲۰۰ پیام اخیر این گفت‌وگو</p>':''}`+(next.length?next.map(m=>{
        const currentDay=ymdOf(toDate(m.created_at)), separator=currentDay!==day?`<div class="ms-day"><span>${currentDay===state.me.today?'امروز':jdate(m.created_at)}</span></div>`:'';day=currentDay;
        const mine=m.from_id===uid;
        return `${separator}<article class="bubble ms-bubble ${mine?'me':'them'}" data-message-id="${m.id}" aria-label="${mine?'پیام شما':`پیام ${esc(contact.name)}`}"><div class="ms-message-text" dir="auto">${esc(m.body)}</div><footer><time datetime="${esc(m.created_at)}">${jtime(m.created_at)}</time>${mine?`<span class="ms-receipt ${m.read_at?'is-read':''}" role="img" aria-label="${m.read_at?'خوانده شده':'ارسال شده'}" title="${m.read_at?'خوانده شده':'ارسال شده'}">${svg(m.read_at?'read':'check')}</span>`:''}</footer></article>`;
      }).join(''):'<div class="ms-no-messages"><b>شروع یک گفت‌وگوی تازه</b><p>سلامی بنویسید و اولین پیام را بفرستید.</p></div>');
      messages=next;
      if(nearBottom){history.scrollTop=history.scrollHeight;jump.hidden=true;}else{history.scrollTop=scroll;if(newCount)jump.hidden=false;}
      if(loaded&&newCount)$('#msLive',el).textContent=`${fa(newCount)} پیام جدید دریافت شد`;
      loaded=true;
    }
    const connection=el.querySelector('.ms-connection');
    async function loadThread(force=false){const revision=sendRevision;const data=await api(`/api/messages/${active}`);if(!alive()||revision!==sendRevision)return;drawMessages(data,force);const c=contacts.find(c=>c.id===active);if(c?.unread){c.unread=0;drawList();}connection.hidden=true;}
    async function send(){
      const raw=input.value, body=raw.trim();if(!body||sending)return;
      sending=true;sendRevision++;updateInput();
      try{
        const sent=await post('/api/messages',{to:active,body});if(!alive()){if(drafts.get(draftKey)===raw)drafts.delete(draftKey);return;}
        if(input.value===raw){input.value='';drafts.delete(draftKey);}
        drawMessages([...messages.filter(m=>m.id!==sent.id),sent],true);
        const c=contacts.find(c=>c.id===active);if(c)c.last=sent;drawList();connection.hidden=true;$('#msLive',el).textContent='پیام ارسال شد';
      }catch(e){if(alive()){connection.textContent=`پیام ارسال نشد؛ متن حفظ شده است. ${e.message}`;connection.hidden=false;}}
      finally{sending=false;if(alive())updateInput();}
    }
    form.onsubmit=e=>{e.preventDefault();send();};
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229&&!matchMedia('(pointer: coarse)').matches){e.preventDefault();send();}};
    try{await loadThread();}catch(e){if(alive()){connection.textContent='دریافت پیام‌ها ممکن نشد؛ اتصال دوباره بررسی می‌شود.';connection.hidden=false;}}
    if(!alive())return;
    // Polling is sequential. Never fetch/read messages while this conversation is hidden.
    async function refresh(){if(!alive())return;if(!document.hidden&&!sending&&!refreshing){refreshing=true;try{await loadThread();const next=await api('/api/messages/contacts');if(alive()){contacts=next;drawList();}}catch{if(alive()){connection.textContent='ارتباط برقرار نیست؛ برای اتصال مجدد تلاش می‌کنیم…';connection.hidden=false;}}finally{refreshing=false;}}if(alive())timer=setTimeout(refresh,5000);}
    timer=setTimeout(refresh,5000);
  }else{
    async function refreshList(){if(!alive())return;if(!document.hidden){try{const next=await api('/api/messages/contacts');if(alive()){contacts=next;drawList();}}catch{/* Keep the last successful contact list during a brief outage. */}}if(alive())timer=setTimeout(refreshList,5000);}
    timer=setTimeout(refreshList,5000);
  }
}
