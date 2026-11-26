// نماهای مشترک بین نقش‌ها: پیام‌رسان امن، اطلاعیه‌ها، حساب کاربری
import { api, post, esc, fa, $, on, toast, busy, setHead, avatar, nameAvatar, empty, jdate, jtime, timeAgo, ROLE_NAMES, formData, state, icon } from './core.js';
import { lookToggleHtml } from './look.js';

export { messagesView } from './messenger.js';

export async function announcementsView(el) {
  setHead('اطلاعیه‌ها', 'آخرین خبرها و اطلاعیه‌های کانون');
  const list = await api('/api/announcements');
  el.innerHTML = list.length ? `<div class="stack">${list.map((a) => `<div class="card ${a.seen_at ? '' : 'tint-violet'}"><div class="row" style="align-items:flex-start">
    <span class="ib lg ${a.seen_at ? '' : 'sun'}">${icon('megaphone', { size: 22 })}</span><div class="grow"><div class="row wrap"><h3 style="font-size:17px">${esc(a.title)}</h3>${a.seen_at ? '<span class="badge green">دیده شد </span>' : '<span class="badge orange">جدید</span>'}</div>
    <div class="tiny muted">${jdate(a.created_at, { weekday: true })}</div><p style="margin:8px 0 0;white-space:pre-line">${esc(a.body)}</p></div></div>
    ${a.seen_at ? '' : `<div class="row" style="justify-content:flex-end"><button class="btn sm" data-seen="${a.id}">${icon('eye', { size: 16 })} دیدم</button></div>`}</div>`).join('')}</div>` : empty('inbox', 'اطلاعیه‌ای وجود ندارد');
  on(el, 'click', '[data-seen]', (e, b) => busy(b, async () => { await post(`/api/announcements/${b.dataset.seen}/seen`); announcementsView(el); }));
}

export function passwordCard() {
  return `<div class="card"><div class="card-title"><span class="ib">${icon('key', { size: 18 })}</span>تغییر رمز عبور</div>
    <form id="pwForm" class="form-grid"><div class="field"><label for="pwCur">رمز فعلی</label><input class="input ltr" id="pwCur" type="password" name="current" required autocomplete="current-password"></div>
    <div class="field"><label for="pwNew">رمز جدید (حداقل ۶ کاراکتر)</label><input class="input ltr" id="pwNew" type="password" name="next" minlength="6" required autocomplete="new-password"></div>
    <div class="field" style="justify-content:flex-end"><button class="btn">ذخیره رمز جدید</button></div></form></div>`;
}
export function bindPassword(el) {
  const f = $('#pwForm', el);
  if (f) f.onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post('/api/me/password', formData(f)); f.reset(); toast('رمز عبور تغییر کرد', 'ok'); }); };
}
export async function accountView(el, _p, me) {
  setHead('حساب کاربری', ROLE_NAMES[me.user.role]);
  el.innerHTML = `<div class="grid c2"><div class="card"><div class="row">${nameAvatar(me.user.full_name, 'lg')}<div><h3>${esc(me.user.full_name)}</h3>
    <div class="muted small">${ROLE_NAMES[me.user.role]}${me.center ? ' • ' + esc(me.center.name) : ''}</div>
    <div class="small" style="margin-top:6px">${me.user.username ? `نام کاربری: <b>${esc(me.user.username)}</b>` : ''} ${me.user.mobile ? `موبایل: <b>${fa(me.user.mobile)}</b>` : ''}</div></div></div></div>${passwordCard()}</div>`;
  if (me.user.role === 'teacher') el.insertAdjacentHTML('afterbegin', `<section class="card tm-appearance"><h3>ظاهر پنل من</h3><p>ظاهر دلخواهتان را انتخاب کنید؛ این انتخاب برای حساب شما ذخیره می‌شود.</p>${lookToggleHtml(me.ui_look === 'new' ? 'new' : 'classic')}</section>`);
  bindPassword(el);
}
