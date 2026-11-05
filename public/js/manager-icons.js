const CELLS = { crown:0, users:1, user:1, board:2, building:2, 'user-check':3, 'user-x':3, 'file-check':4, clipboard:4, card:5, wallet:5, receipt:6, coins:6, sparkles:7, bot:7, megaphone:8, message:9, chart:10, trend:10, calendar:11, trophy:12, award:12, sliders:13, settings:13, shield:13, phone:14, send:14, bag:15 };
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function managerIcon(name,{size=24,cls='',label=''}={}) {
 if (!Object.hasOwn(CELLS,name)) return '';
 const i=CELLS[name], n=Math.min(512,Math.max(1,Number(size)||24));
 return `<span class="ic manager-icon ${esc(cls)}" data-icon="${esc(name)}" style="width:${n}px;height:${n}px;background-position:${i%4*100/3}% ${Math.floor(i/4)*100/3}%" ${label ? `role="img" aria-label="${esc(label)}"`:'aria-hidden="true"'}></span>`;
}
