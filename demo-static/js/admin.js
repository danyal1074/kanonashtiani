// پنل مدیر سامانه (پشتیبانی): کانون‌ها، کاربران، ورود به‌جای کاربر، پشتیبان‌گیری
import { api, post, put, esc, fa, num, $, on, toast, busy, modal, confirmBox, setHead, empty, jdate, logoHtml, formData, ROLE_NAMES, fileToData, nameAvatar, icon, kpiCard } from './core.js';
import { accountView } from './common.js';

export const nav = () => [
  { path: '/home', icon: 'building', label: 'کانون‌ها' },
  { path: '/users', icon: 'user', label: 'کاربران و پشتیبانی' },
  { path: '/backup', icon: 'database', label: 'پشتیبان‌گیری و بازیابی' },
  { path: '/account', icon: 'key', label: 'حساب کاربری' },
];
const kb = (b) => (b > 1048576 ? `${fa((b / 1048576).toFixed(1))} مگابایت` : `${fa(Math.round(b / 1024))} کیلوبایت`);

async function home(el) {
  const d = await api('/api/admin/overview');
  setHead('کانون‌ها', 'هر کانون لوگو، نام، مدیر و داده‌های جداگانه دارد', '<button class="btn sm" id="newC"> کانون جدید</button>');
  el.innerHTML = `<div class="grid c4">${kpiCard('users', '', num(d.totals.users), 'کل کاربران')}${kpiCard('backpack', 'sun', num(d.totals.students), 'دانش‌آموزان')}${kpiCard('file-check', 'green', num(d.totals.results), 'نتایج آزمون')}${kpiCard('timer', 'slate', num(d.totals.pomodoros), 'پومودوروهای ثبت‌شده')}</div>
    <div class="grid c3" style="margin-top:18px">${d.centers.map((c) => `<div class="card"><div class="row"><div class="brand-logo" style="background:${esc(c.color)}">${logoHtml(c.logo)}</div><div class="grow"><b>${esc(c.name)}</b><div class="tiny muted">/${esc(c.slug)} • مدیر: ${esc(c.manager || '—')}</div></div></div>
      <div class="row" style="margin-top:12px"><span class="badge">${icon('backpack', { size: 16 })} ${fa(c.students)}</span><span class="badge blue">${icon('board', { size: 16 })} ${fa(c.teachers)}</span><span class="grow"></span><a class="btn ghost sm" href="#/c/${esc(c.slug)}" target="_blank">صفحه عمومی</a><button class="btn soft sm" data-edit="${c.id}">${icon('edit', { size: 16 })}</button></div></div>`).join('')}</div>`;
  $('#newC').onclick = () => modal({
    title: ' کانون جدید', wide: true,
    body: `<form class="form-grid" id="cf"><div class="field"><label>نام کانون</label><input class="input" name="name" required></div><div class="field"><label>شناسه لاتین (آدرس صفحه)</label><input class="input ltr" name="slug" placeholder="my-center" required></div>
      <div class="field"><label>شعار</label><input class="input" name="tagline"></div><div class="field"><label>رنگ</label><input class="input" type="color" name="color" value="#0B5F66"></div><div class="field"><label>لوگو (ایموجی موقت)</label><input class="input" name="logo" value="${icon('star', { size: 16 })}"></div>
      <div class="field"><label>نام مدیر</label><input class="input" name="manager_name" required></div><div class="field"><label>نام کاربری مدیر</label><input class="input ltr" name="manager_username" required></div><div class="field"><label>رمز مدیر</label><input class="input ltr" type="password" name="manager_password" minlength="6" required></div></form>`,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ایجاد کانون', onClick: async (m) => { await post('/api/admin/centers', formData($('#cf', m))); toast('کانون ایجاد شد؛ مدیر می‌تواند وارد شود', 'ok'); home(el); } }],
  });
  on(el, 'click', '[data-edit]', (e, b) => {
    const c = d.centers.find((x) => x.id === Number(b.dataset.edit));
    modal({ title: `${icon('edit', { size: 16 })} ${esc(c.name)}`, body: `<form class="stack" id="ef"><div class="field"><label>نام</label><input class="input" name="name" value="${esc(c.name)}"></div><div class="field"><label>رنگ</label><input class="input" type="color" name="color" value="${esc(c.color)}"></div></form>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره', onClick: async (m) => { await put(`/api/admin/centers/${c.id}`, formData($('#ef', m))); home(el); } }] });
  });
}

async function users(el) {
  setHead('کاربران و پشتیبانی', 'جستجو، بازنشانی رمز، غیرفعال‌سازی و ورود به پنل هر کاربر');
  el.innerHTML = `<div class="card"><div class="row wrap" style="margin-bottom:12px"><input class="input grow" id="q" placeholder=" نام، نام کاربری، کد ملی یا موبایل…"><select class="input" id="role" style="width:auto"><option value="">همه نقش‌ها</option>${['student', 'teacher', 'manager', 'parent'].map((r) => `<option value="${r}">${ROLE_NAMES[r]}</option>`).join('')}</select></div><div id="list"></div></div>`;
  const load = async () => {
    const list = await api(`/api/admin/users?q=${encodeURIComponent($('#q', el).value)}&role=${$('#role', el).value}`);
    $('#list', el).innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>نام</th><th>نقش</th><th>شناسه</th><th>کانون</th><th>وضعیت</th><th></th></tr></thead><tbody>${list.map((u) => `<tr><td>${esc(u.full_name)}</td><td>${ROLE_NAMES[u.role]}</td><td class="num">${fa(u.username || u.national_code || u.mobile || '')}</td><td class="small">${esc(u.center || '—')}</td>
      <td>${u.active ? '<span class="badge green">فعال</span>' : '<span class="badge red">غیرفعال</span>'}</td><td><div class="row" style="gap:4px">${u.role !== 'admin' ? `<button class="btn sm" data-imp="${u.id}">${icon('eye', { size: 16 })} ورود به پنل</button><button class="btn sm ghost" data-pw="${u.id}" aria-label="بازنشانی رمز" title="بازنشانی رمز">${icon('key', { size: 16 })}</button><button class="btn sm ghost" data-tg="${u.id}" aria-label="${u.active ? 'غیرفعال کردن' : 'فعال کردن'}" title="${u.active ? 'غیرفعال کردن' : 'فعال کردن'}">${icon(u.active ? 'lock' : 'check', { size: 16 })}</button>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="6">${empty('search', 'کاربری یافت نشد')}</td></tr>`}</tbody></table></div>`;
  };
  let t; $('#q', el).oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#role', el).onchange = load;
  load();
  on(el, 'click', '[data-imp]', (e, b) => busy(b, async () => { await post(`/api/admin/impersonate/${b.dataset.imp}`); location.hash = '#/home'; location.reload(); }));
  on(el, 'click', '[data-tg]', (e, b) => busy(b, async () => { await post(`/api/admin/users/${b.dataset.tg}/toggle`); load(); }));
  on(el, 'click', '[data-pw]', (e, b) => modal({ title: ' بازنشانی رمز', body: '<input class="input ltr" id="npw" type="text" placeholder="رمز جدید (حداقل ۶ کاراکتر)">', actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ثبت', onClick: async (m) => { await post(`/api/admin/users/${b.dataset.pw}/reset-password`, { password: $('#npw', m).value }); toast('رمز تغییر کرد', 'ok'); } }] }));
}

async function backup(el) {
  const d = await api('/api/admin/overview');
  setHead('پشتیبان‌گیری و بازیابی', `حجم فعلی پایگاه داده: ${kb(d.dbSize)}`, '<button class="btn sm" id="mk"> تهیه پشتیبان جدید</button>');
  el.innerHTML = `<div class="grid c2"><div class="card"><div class="card-title"><span class="ib">${icon('database', { size: 18 })}</span>نسخه‌های پشتیبان</div><div class="list">${d.backups.map((b) => `<div class="list-item"><span>${icon('check', { size: 16 })}</span><div class="grow"><b class="small ltr" style="direction:ltr;display:inline-block">${esc(b.name)}</b><div class="tiny muted">${kb(b.size)}</div></div><a class="btn sm ghost" href="/api/admin/backup/${encodeURIComponent(b.name)}">${icon('download', { size: 16 })} دانلود</a><button class="btn sm red" data-rs="${esc(b.name)}">${icon('refresh', { size: 16 })} بازیابی</button></div>`).join('') || empty('check', 'هنوز پشتیبانی تهیه نشده')}</div></div>
    <div class="card tint-orange"><div class="card-title"><span class="ib sun">${icon('upload', { size: 18 })}</span>بازیابی از فایل</div><p class="small">فایل پشتیبان (.db) را انتخاب کنید. پیش از بازیابی، یک پشتیبان ایمنی خودکار از وضعیت فعلی گرفته می‌شود.</p><input class="input" type="file" id="rf" accept=".db"><button class="btn red" id="rfBtn" style="margin-top:10px">بازیابی از فایل</button>
      <p class="tiny muted" style="margin-top:12px">پشتیبان‌گیری خودکار روزانه را می‌توانید با دستور <code>npm run backup</code> در زمان‌بند سرور (cron) تنظیم کنید.</p></div></div>`;
  $('#mk').onclick = (e) => busy(e.target, async () => { await post('/api/admin/backup'); toast('پشتیبان تهیه شد', 'ok'); backup(el); });
  on(el, 'click', '[data-rs]', async (e, b) => { if (await confirmBox(`پایگاه داده به نسخه «${esc(b.dataset.rs)}» برگردانده شود؟ تغییرات بعد از آن از بین می‌رود.`, 'بازیابی')) busy(b, async () => { await post('/api/admin/restore', { name: b.dataset.rs }); toast('بازیابی انجام شد؛ دوباره وارد شوید', 'ok'); setTimeout(() => location.reload(), 1200); }); });
  $('#rfBtn', el).onclick = async (e) => {
    const f = $('#rf', el).files[0];
    if (!f) return toast('فایل را انتخاب کنید', 'err');
    if (await confirmBox('پایگاه داده با فایل انتخابی جایگزین شود؟', 'بازیابی')) busy(e.target, async () => { await post('/api/admin/restore', { file: await fileToData(f, 200) }); toast('بازیابی انجام شد', 'ok'); setTimeout(() => location.reload(), 1200); });
  };
}

export const routes = [
  { path: '/home', view: home },
  { path: '/users', view: users },
  { path: '/backup', view: backup },
  { path: '/account', view: accountView },
];
