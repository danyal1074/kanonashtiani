// نماهای مشترک بین نقش‌ها: پیام‌رسان امن، اطلاعیه‌ها، حساب کاربری
import { api, post, esc, fa, $, on, toast, busy, setHead, avatar, nameAvatar, empty, jdate, jtime, timeAgo, ROLE_NAMES, formData, state, icon } from './core.js';

const roleIcon = { teacher: 'board', student: 'backpack', parent: 'users', manager: 'building' };

export async function messagesView(el, params) {
  setHead('پیام‌رسان کانون', 'گفت‌وگوی امن داخلی — شماره تلفن هیچ‌کس نمایش داده نمی‌شود');
  let contacts = await api('/api/messages/contacts');
  let active = params.id ? Number(params.id) : null;
  let filter = '';
  let poll;

  el.innerHTML = `<div class="card chat ${active ? 'has-active' : ''}">
    <div class="chat-list"><div class="search"><input class="input" id="cSearch" placeholder=" جستجوی مخاطب…"></div><div id="cList"></div></div>
    <div class="chat-pane" id="pane"></div></div>`;

  const listHtml = () => {
    const rows = contacts.filter((c) => !filter || c.name.includes(filter));
    if (!rows.length) return empty('search', 'مخاطبی پیدا نشد');
    return rows.map((c) => `<div class="contact ${c.id === active ? 'on' : ''}" data-id="${c.id}">
      ${c.role === 'student' ? avatar(c.avatar, 'sm') : `<div class="avatar sm">${icon(roleIcon[c.role] || 'user', { size: 18 })}</div>`}
      <div class="grow"><div class="bold small ellipsis">${esc(c.name)}</div><div class="tiny muted ellipsis">${esc(c.last?.body || c.sub || '')}</div></div>
      <div class="stack" style="gap:2px;align-items:flex-end">${c.last ? `<span class="tiny muted">${timeAgo(c.last.created_at)}</span>` : ''}${c.unread ? `<span class="unread">${fa(c.unread)}</span>` : ''}</div></div>`).join('');
  };
  const drawList = () => { $('#cList', el).innerHTML = listHtml(); };

  async function openThread(id) {
    active = id;
    clearInterval(poll);
    el.querySelector('.chat').classList.toggle('has-active', !!id);
    drawList();
    const pane = $('#pane', el);
    if (!id) { pane.innerHTML = empty('message', 'یک گفت‌وگو را انتخاب کن'); return; }
    const c = contacts.find((x) => x.id === id);
    if (!c) { pane.innerHTML = empty('user-x', 'این مخاطب در دسترس نیست'); return; }
    pane.innerHTML = `<div class="head"><button class="icon-btn" id="back" aria-label="بازگشت">→</button>${c.role === 'student' ? avatar(c.avatar, 'sm') : `<div class="avatar sm">${icon(roleIcon[c.role] || 'user', { size: 18 })}</div>`}
      <div class="grow"><div class="bold">${esc(c.name)}</div><div class="tiny muted">${esc(c.sub || ROLE_NAMES[c.role])}</div></div></div>
      <div class="msgs" id="msgs">${'<div class="empty">…</div>'}</div>
      <form class="composer" id="composer"><textarea class="input" name="body" placeholder="پیامت را بنویس…" maxlength="2000"></textarea><button class="btn" type="submit">ارسال </button></form>`;
    $('#back', pane).onclick = () => { location.hash = '#/messages'; };
    const msgsEl = $('#msgs', pane);
    const draw = (msgs) => {
      msgsEl.innerHTML = `<div class="secure-note">${icon('lock', { size: 16 })} پیام‌ها داخل کانون می‌ماند و شماره تماس دو طرف محفوظ است</div>` + (msgs.length ? msgs.map((m) => `<div class="bubble ${m.from_id === state.me.user.id ? 'me' : 'them'}">${esc(m.body)}<span class="tm">${jdate(m.created_at, { year: false })} ${jtime(m.created_at)}${m.from_id === state.me.user.id ? (m.read_at ? ' ' : ' ') : ''}</span></div>`).join('') : empty('message', 'اولین پیام را بفرست!'));
      msgsEl.scrollTop = msgsEl.scrollHeight;
    };
    let last = '';
    const load = async () => {
      const msgs = await api(`/api/messages/${id}`);
      const sig = msgs.map((m) => m.id + (m.read_at || '')).join();
      if (sig !== last) { last = sig; draw(msgs); }
      if (c.unread) { c.unread = 0; drawList(); }
    };
    await load();
    poll = setInterval(() => { if (!document.body.contains(msgsEl)) return clearInterval(poll); load().catch(() => clearInterval(poll)); }, 5000);
    const form = $('#composer', pane);
    const send = () => busy(form.querySelector('button'), async () => {
      const body = form.body.value.trim();
      if (!body) return;
      await post('/api/messages', { to: id, body });
      form.body.value = '';
      c.last = { body, created_at: new Date().toISOString() };
      await load();
    });
    form.onsubmit = (e) => { e.preventDefault(); send(); };
    form.body.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    form.body.focus();
  }

  $('#cSearch', el).oninput = (e) => { filter = e.target.value.trim(); drawList(); };
  on(el, 'click', '.contact', (e, t) => { location.hash = `#/messages/${t.dataset.id}`; });
  drawList();
  openThread(active);
}

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
  bindPassword(el);
}
