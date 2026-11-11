const CELLS = { crown:0, users:1, user:1, board:2, building:2, 'user-check':3, 'user-x':3, 'file-check':4, clipboard:4, card:5, wallet:5, receipt:6, coins:6, sparkles:7, bot:7, megaphone:8, message:9, chart:10, trend:10, calendar:11, trophy:12, award:12, sliders:13, settings:13, shield:13, phone:14, send:14, bag:15 };
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let OUTLINE = {};
export const setOutline = (m) => { OUTLINE = m; };
// ظاهر جدید: آیکون خطی (SVG)؛ ظاهر کلاسیک: اطلس تصویری قدیمی
export function managerIcon(name,{size=24,cls='',label=''}={}) {
 if (document.body.classList.contains('look-new')) {
  const body = OUTLINE[name]; if (!body) return '';
  const n = Math.min(512, Math.max(8, Number(size) || 20));
  return `<svg class="ic ol ${esc(cls)}" data-icon="${esc(name)}" width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}>${body}</svg>`;
 }
 if (!Object.hasOwn(CELLS,name)) return '';
 const i=CELLS[name], n=Math.min(512,Math.max(1,Number(size)||24));
 return `<span class="ic manager-icon ${esc(cls)}" data-icon="${esc(name)}" style="width:${n}px;height:${n}px;background-position:${i%4*100/3}% ${Math.floor(i/4)*100/3}%" ${label ? `role="img" aria-label="${esc(label)}"`:'aria-hidden="true"'}></span>`;
}
