export const u=n=>'/img/elementary/'+n;
export const SV={
  left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l13-7.5z"/></svg>',
  cam:'<svg viewBox="0 0 24 24" fill="#fff"><rect x="2.5" y="6" width="12.5" height="12" rx="3"/><path d="M16.5 10.5l5-3v9l-5-3z"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 11V8a5 5 0 0 1 10 0v3h1.2v10H5.8V11zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4-5.7-3.1-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M12 2.5a6.2 6.2 0 0 0-6.2 6.2v4.2L3.6 16.6h16.8l-2.2-3.7V8.7A6.2 6.2 0 0 0 12 2.5z" fill="currentColor"/><path d="M9.3 18.4a2.8 2.8 0 0 0 5.4 0z" fill="currentColor"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="3.2"/><circle cx="17" cy="7" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="3.2"/></svg>',
  cup:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4a3.2 3.2 0 0 0 3.2 4.2M17 5.5h3a3.2 3.2 0 0 1-3.2 4.2M12 14v4M8 21h8M9.5 18h5"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.8 2.5 11h2.8v9.4h5.2v-6h3v6h5.2V11h2.8z"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.5c-4.9 0-8.8 3.3-8.8 7.4 0 2.2 1.1 4.2 2.9 5.5l-.8 3.9 4-2.1c.9.2 1.8.3 2.7.3 4.9 0 8.8-3.3 8.8-7.4S16.9 3.5 12 3.5z"/><path d="M8.5 12.2c1.9 1.4 5.1 1.4 7 0" stroke-linecap="round"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="4.2"/><path d="M4 21c.8-4.2 4-6.6 8-6.6s7.2 2.4 8 6.6"/></svg>',
  lockl:'<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
  help:'<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.4-1.1.9-1.1 1.7M12 17h.01"/></svg>',
  out:'<svg class="i" viewBox="0 0 24 24" fill="none" stroke="#ef3340" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M15 8l4 4-4 4M19 12H9"/></svg>'
};
const sp=(l,t,d,z=11)=>`<svg class="sp" style="left:${l};top:${t};--d:${d};width:${z}px;height:${z}px" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.7 8.3L23 12l-8.3 2.7L12 23l-2.7-8.3L1 12l8.3-2.7z" fill="#ffd54a" stroke="#fff3b0" stroke-width="1"/></svg>`;
export function tileIcon(r){
  const s=u('ic-'+r+'.png'),base=`<img class="base" src="${s}" alt="">`,cl=c=>`<img class="${c}" src="${s}" alt="">`;
  switch(r){
    case 'lessons':return `<span class="ai a-lessons split">${base}<span class="cl-wrap">${cl('bl')}${cl('br')}</span>${sp('2%','-5px','0s')}${sp('84%','-7px','.25s')}${sp('46%','-10px','.5s',9)}</span>`;
    case 'homework':return `<span class="ai a-homework">${base}<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#22b35e"/><path d="M6.5 12.5l3.8 3.8 7.2-7.8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    case 'exams':return `<span class="ai a-exams">${base}</span>`;
    case 'online':return `<span class="ai a-online">${base}<i class="pg"></i><i class="pr"></i><i class="pr r2"></i></span>`;
    case 'schedule':return `<span class="ai a-schedule">${base}<svg class="clk" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#f0366b" stroke-width="2.4"/><line x1="12" y1="12" x2="16" y2="9.5" stroke="#2a3a55" stroke-width="2" stroke-linecap="round"/><g class="mh"><line x1="12" y1="12" x2="12" y2="5" stroke="#f0366b" stroke-width="2" stroke-linecap="round"/></g><circle cx="12" cy="12" r="1.6" fill="#2a3a55"/></svg></span>`;
    case 'progress':return `<span class="ai a-progress split">${base}<span class="cl-wrap">${cl('b1')}${cl('b2')}${cl('b3')}</span></span>`;
    case 'challenges':return `<span class="ai a-challenges">${base}<span class="shine"></span>${sp('0%','4%','.1s')}${sp('86%','-3%','.35s')}${sp('92%','46%','.6s',9)}</span>`;
    case 'games':return `<span class="ai a-games">${base}</span>`;
  }
  return `<span class="ai">${base}</span>`;
}

const CORE_ICONS={book:'ic-lessons.png',clipboard:'ic-homework.png','file-check':'ic-exams.png','file-text':'ic-content.png',users:'ic-students.png',calendar:'ic-schedule.png',chart:'ic-progress.png',trend:'ic-growth.png',trophy:'ic-challenges.png',award:'md-gold.png',message:'ic-messages.png',settings:'ic-settings.png',graduation:'ic-myclass.png',cap:'ic-myclass.png',flask:'sm-flask.png',board:'ic-teachers.png',building:'ic-classes.png',wallet:'ic-fee.png',timer:'extra-study.webp',gamepad:'ic-games.png',user:'ic-profile.png',card:'ic-fee.png',bag:'extra-shop.webp',target:'ic-target.png',calculator:'ls-math.png',languages:'ls-english.png',globe:'ls-social.png',compass:'extra-learning-path.webp',coins:'ic-points.png',receipt:'ic-reports.png',sparkles:'ic-route.png'};
export function elementaryIcon(name,{size=20,cls='',label=''}={}){
 const file=CORE_ICONS[name];if(!file)return null;const safe=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const n=Number.isFinite(Number(size))?Math.max(1,Math.min(512,Number(size))):20;
 return `<img class="ic icon-3d elementary-icon ${safe(cls)}" data-icon="${safe(name)}" src="${u(file)}" width="${n}" height="${n}" style="width:${n}px;height:${n}px;object-fit:contain" alt="${safe(label)}" ${label?'':'aria-hidden="true"'} decoding="async">`;
}
