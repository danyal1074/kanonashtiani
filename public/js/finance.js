// حساب یکپارچهٔ دانش‌آموز: ثبت خرید بوفه/خدمات، کاتالوگ قیمت، صورتحساب، تخفیف/تعدیل، پرداخت حضوری، ابطال و تطبیق.
// همهٔ مبالغ به «تومان» و عدد صحیح؛ ورودی‌ها ارقام فارسی، عربی و انگلیسی را می‌پذیرند.
import { api, post, put, esc, fa, money, $, on, toast, busy, modal, setHead, empty, jdate, en, printOverlay, icon, gradeName } from './core.js';

const CATS = { buffet: 'بوفه', service: 'خدمات آموزشی', other: 'سایر' };
const STATUS = { issued: ['صادرشده', 'orange'], partial: ['پرداخت جزئی', 'blue'], paid: ['تسویه', 'green'], void: ['باطل', 'gray'] };
const PAY = { approved: ['تأییدشده', 'green'], pending: ['در انتظار', 'orange'], rejected: ['ردشده', 'red'], reversed: ['برگشت‌خورده', 'gray'] };
const METHODS = { cash: 'نقدی', pos: 'کارتخوان', transfer: 'کارت‌به‌کارت', receipt: 'رسید آنلاین' };
const badge = (map, k) => { const [t, c] = map[k] || [k, 'gray']; return `<span class="badge ${c}">${t}</span>`; };
const faDigits = (t) => String(t ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const signed = (n) => (n < 0 ? `<span class="red-t">− ${money(-n)}</span>` : money(n));
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
// ورودی مبلغ: ارقام فارسی/عربی و جداکننده‌ها حذف می‌شوند (اعتبارسنجی نهایی در سرور)
const amountInput = (name, label, attrs = '') => `<div class="field"><label for="f-${name}">${label}</label><input class="input ltr" id="f-${name}" name="${name}" inputmode="numeric" autocomplete="off" required ${attrs}><div class="tiny muted" data-echo="${name}"></div></div>`;
function wireAmount(root) {
  root.querySelectorAll('input[inputmode=numeric]').forEach((inp) => inp.addEventListener('input', () => {
    const v = en(inp.value).replace(/[^\d-]/g, ''), echo = root.querySelector(`[data-echo="${inp.name}"]`);
    if (echo) echo.textContent = v && Number(v) ? money(Math.abs(Number(v))) : '';
  }));
}

// ---------- جدول فاکتورها با اقلام (هم مدیر، هم دانش‌آموز) ----------
export function invoicesHtml(invoices, { manage = false } = {}) {
  if (!invoices.length) return empty('receipt', 'فاکتوری ثبت نشده است');
  return invoices.map((i) => `<article class="card fin-inv" style="margin-bottom:12px" data-inv="${i.id}">
    <div class="row between" style="flex-wrap:wrap;gap:8px"><div><b>${esc(i.type_label)} — ${faDigits(esc(i.period))}</b> ${badge(STATUS, i.status)}<div class="tiny muted">صدور ${jdate(i.created_at)}${i.void_reason ? ` • علت ابطال: ${esc(i.void_reason)}` : ''}</div></div>
    <div class="row" style="gap:16px"><span>مبلغ: <b>${money(i.amount)}</b></span><span>پرداخت: <b>${money(i.paid)}</b></span><span>مانده: <b class="${i.remaining > 0 ? 'red-t' : ''}">${money(Math.max(0, i.remaining))}</b></span></div></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>قلم</th><th>تعداد</th><th>فی</th><th>مبلغ</th><th>تاریخ</th></tr></thead><tbody>
    ${i.lines.map((l) => `<tr><td>${faDigits(esc(l.title))} <span class="tiny muted">(${l.kind_label}${l.note ? ` — ${esc(l.note)}` : ''})</span></td><td>${fa(l.quantity)}</td><td>${signed(l.unit_price)}</td><td>${signed(l.amount)}</td><td class="tiny muted">${jdate(l.created_at)}</td></tr>`).join('')}
    </tbody></table></div>
    ${i.payments.length ? `<div class="tiny" style="margin-top:6px">${i.payments.map((p) => `${badge(PAY, p.status)} ${money(p.amount)} — ${METHODS[p.method] || 'رسید'} — ${jdate(p.reviewed_at || p.created_at)}${p.reverse_reason ? ` (${esc(p.reverse_reason)})` : ''}`).join('<br>')}</div>` : ''}
    ${manage && i.status !== 'void' ? `<div class="row no-print" style="margin-top:8px;gap:6px;flex-wrap:wrap">
      ${i.remaining > 0 ? `<button class="btn sm green" data-pay="${i.id}" data-rem="${i.remaining}">${icon('wallet', { size: 16 })} ثبت پرداخت حضوری</button>` : ''}
      <button class="btn sm soft" data-line="${i.id}" data-kind="discount">تخفیف</button><button class="btn sm ghost" data-line="${i.id}" data-kind="adjustment">تعدیل</button>
      ${i.paid === 0 ? `<button class="btn sm ghost danger" data-void="${i.id}">ابطال</button>` : ''}</div>` : ''}
  </article>`).join('');
}
export function totalsHtml(t) {
  return `<div class="grid c4" style="margin-bottom:12px">
    <div class="card"><div class="tiny muted">جمع بدهکاری</div><b>${money(t.charged)}</b></div>
    <div class="card"><div class="tiny muted">پرداخت‌شده</div><b>${money(t.paid)}</b></div>
    <div class="card"><div class="tiny muted">مانده حساب</div><b class="${t.balance > 0 ? 'red-t' : ''}">${money(t.balance)}</b></div>
    <div class="card"><div class="tiny muted">بدهی بوفه</div><b>${money(t.buffet_debt)}</b></div></div>`;
}
export function printStatement(name, st) {
  printOverlay(`<div style="padding:24px;direction:rtl"><h2>صورتحساب ${esc(name)}</h2><p class="small">تاریخ چاپ: ${jdate(new Date().toISOString())} — واحد: تومان</p>${totalsHtml(st.totals)}${invoicesHtml(st.invoices)}</div>`, 'صورتحساب');
}

// ---------- دانش‌آموز: بخش صورتحساب در «فاکتورها و کارنامه» ----------
export async function studentStatementSection(el) {
  const st = await api('/api/student/statement');
  el.insertAdjacentHTML('afterbegin', `<section class="card" style="margin-bottom:16px" id="myStatement"><div class="row between"><div class="card-title">حساب من (شهریه، بوفه و خدمات)</div><button class="btn sm ghost" id="printSt">${icon('printer', { size: 16 })} چاپ صورتحساب</button></div>${totalsHtml(st.totals)}<div class="tiny muted" style="margin-bottom:8px">بدهی بوفه روی دسترسی به پنل اثری ندارد.</div>${invoicesHtml(st.invoices.filter((i) => i.status !== 'void'))}</section>`);
  $('#printSt', el).onclick = () => printStatement('من', st);
}

// ---------- مدیر: صفحهٔ «حساب دانش‌آموزان و بوفه» ----------
export async function financeView(el, routeParams) {
  const params = { ...routeParams, ...Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || '')) };
  setHead('حساب دانش‌آموزان و بوفه', 'خرید بوفه و خدمات، صورتحساب، تخفیف، پرداخت حضوری و تطبیق — مبالغ به تومان');
  const tab = params.tab || 'charge';
  const tabs = [['charge', 'ثبت خرید'], ['accounts', 'حساب‌ها'], ['catalog', 'کاتالوگ قیمت'], ['reconcile', 'تطبیق']];
  el.innerHTML = `<div class="row no-print" role="tablist" style="gap:6px;margin-bottom:12px;flex-wrap:wrap">${tabs.map(([k, t]) => `<a role="tab" aria-selected="${k === tab}" class="btn sm ${k === tab ? '' : 'ghost'}" href="#/finance?tab=${k}">${t}</a>`).join('')}</div><div id="finBody"><div class="skeleton" style="height:120px"></div></div>`;
  const body = $('#finBody', el);
  await ({ charge, accounts, catalog, reconcile }[tab] || charge)(body, params);
}

async function pickStudent(body, onPick) {
  const box = document.createElement('div');
  box.innerHTML = `<div class="field"><label for="finQ">جست‌وجوی دانش‌آموز (نام یا کد ملی)</label><input class="input" id="finQ" autocomplete="off" placeholder="مثلاً رضایی"></div><div id="finList" class="stack"></div>`;
  body.append(box);
  let timer;
  const load = async () => {
    const rows = await api(`/api/manager/finance/students?q=${encodeURIComponent($('#finQ', box).value.trim())}`);
    $('#finList', box).innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>دانش‌آموز</th><th>کلاس</th><th>مانده حساب</th><th></th></tr></thead><tbody>${rows.slice(0, 30).map((s) => `<tr><td><b>${esc(s.full_name)}</b>${s.active ? '' : ' <span class="badge gray">غیرفعال</span>'}</td><td class="small">${s.grade ? gradeName(s.grade) : ''} ${esc(s.class_name || '')}</td><td>${s.balance > 0 ? `<b class="red-t">${money(s.balance)}</b>` : money(s.balance)}</td><td><button class="btn sm" data-pick="${s.id}" data-name="${esc(s.full_name)}">انتخاب</button></td></tr>`).join('')}</tbody></table></div>` : empty('users', 'دانش‌آموزی یافت نشد');
  };
  $('#finQ', box).oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
  on(box, 'click', '[data-pick]', (_e, b) => onPick(Number(b.dataset.pick), b.dataset.name));
  await load();
}

async function charge(body) {
  const items = (await api('/api/manager/charge-items')).filter((i) => i.active);
  if (!items.length) { body.innerHTML = `<div class="card">${empty('bag', 'ابتدا در «کاتالوگ قیمت» اقلام بوفه یا خدمات را تعریف کنید.')}<div class="row" style="justify-content:center"><a class="btn" href="#/finance?tab=catalog">رفتن به کاتالوگ</a></div></div>`; return; }
  body.innerHTML = '';
  await pickStudent(body, (sid, name) => {
    const cart = new Map();
    let key = newKey();
    const draw = () => {
      const total = [...cart].reduce((n, [id, q]) => n + q * items.find((i) => i.id === id).unit_price, 0);
      body.innerHTML = `<div class="grid c3"><section class="card span2"><div class="row between"><div class="card-title">اقلام — ${esc(name)}</div><a class="btn sm ghost" href="#/finance?tab=accounts&student=${sid}">صورتحساب</a></div>
        ${Object.entries(CATS).map(([cat, label]) => { const list = items.filter((i) => i.category === cat); return list.length ? `<h4 style="margin:12px 0 6px">${label}</h4><div class="grid c3">${list.map((i) => `<button type="button" class="card" style="text-align:right;cursor:pointer" data-add="${i.id}" aria-label="افزودن ${esc(i.title)}"><b>${esc(i.title)}</b><div class="small muted">${money(i.unit_price)}</div>${cart.get(i.id) ? `<span class="badge green">× ${fa(cart.get(i.id))}</span>` : ''}</button>`).join('')}</div>` : ''; }).join('')}</section>
        <aside class="card"><div class="card-title">سبد</div>${cart.size ? `<ul class="stack" style="list-style:none;padding:0">${[...cart].map(([id, q]) => { const i = items.find((x) => x.id === id); return `<li class="row between"><span>${esc(i.title)} × ${fa(q)}</span><span class="row">${money(q * i.unit_price)} <button class="icon-btn" data-dec="${id}" aria-label="کم کردن ${esc(i.title)}">−</button></span></li>`; }).join('')}</ul>` : '<p class="muted small">قلمی انتخاب نشده</p>'}
        <div class="row between" style="margin:10px 0"><b>جمع</b><b>${money(total)}</b></div><button class="btn block green" id="finSubmit" ${cart.size ? '' : 'disabled'}>ثبت در حساب دانش‌آموز</button><button class="btn block ghost" id="finBack" style="margin-top:6px">دانش‌آموز دیگر</button></aside></div>`;
    };
    draw();
    on(body, 'click', '[data-add]', (_e, b) => { const id = Number(b.dataset.add); cart.set(id, (cart.get(id) || 0) + 1); key = newKey(); draw(); });
    on(body, 'click', '[data-dec]', (_e, b) => { const id = Number(b.dataset.dec); const q = (cart.get(id) || 0) - 1; if (q > 0) cart.set(id, q); else cart.delete(id); key = newKey(); draw(); });
    on(body, 'click', '#finSubmit', (_e, b) => busy(b, async () => {
      // همان کلید برای تلاش مجدد پس از خطای شبکه؛ سرور خرید تکراری ثبت نمی‌کند
      const r = await post(`/api/manager/students/${sid}/charges`, { idempotency_key: key, items: [...cart].map(([item_id, quantity]) => ({ item_id, quantity })) });
      toast(r.replayed ? 'این خرید قبلاً ثبت شده بود' : `${money(r.total)} در حساب ${name} ثبت شد`, 'ok');
      cart.clear(); key = newKey(); draw();
    }));
    on(body, 'click', '#finBack', () => { body.innerHTML = ''; charge(body); });
  });
}

async function accounts(body, params) {
  const show = async (sid) => {
    const st = await api(`/api/manager/students/${sid}/statement`);
    body.innerHTML = `<div class="row between no-print" style="margin-bottom:10px"><div><b>${esc(st.student.full_name)}</b> <span class="muted small">${gradeName(st.student.grade)} ${esc(st.student.class_name || '')}</span></div><div class="row"><button class="btn sm ghost" id="finPrint">${icon('printer', { size: 16 })} چاپ صورتحساب</button><a class="btn sm ghost" href="#/finance?tab=accounts">بازگشت</a></div></div>
      ${totalsHtml(st.totals)}${invoicesHtml(st.invoices, { manage: true })}
      ${st.tuition_payments.length ? `<section class="card"><div class="card-title">پرداخت‌های حق عضویت (جدا از حساب بوفه)</div>${st.tuition_payments.map((p) => `<div class="small">${badge(PAY, p.status)} ${money(p.amount)} — ${faDigits(esc(p.period || ''))} — ${jdate(p.reviewed_at || p.created_at)}</div>`).join('')}</section>` : ''}`;
    $('#finPrint', body).onclick = () => printStatement(st.student.full_name, st);
    const reload = () => show(sid);
    on(body, 'click', '[data-pay]', (_e, b) => { const key = newKey(); modal({
      title: 'ثبت پرداخت حضوری', body: `<form class="stack" id="payForm">${amountInput('amount', `مبلغ (حداکثر ${money(Number(b.dataset.rem))})`)}<div class="field"><label for="f-method">روش</label><select class="input" id="f-method" name="method"><option value="cash">نقدی</option><option value="pos">کارتخوان</option><option value="transfer">کارت‌به‌کارت</option></select></div></form>`,
      onOpen: (m) => { wireAmount(m); $('[name=amount]', m).value = fa(Number(b.dataset.rem)); },
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ثبت پرداخت', cls: 'green', onClick: async (m) => { const f = $('#payForm', m); if (!f.reportValidity()) return false; await post(`/api/manager/invoices/${b.dataset.pay}/payments`, { idempotency_key: key, amount: f.amount.value, method: f.method.value }); toast('پرداخت ثبت شد', 'ok'); reload(); } }],
    }); });
    on(body, 'click', '[data-line]', (_e, b) => { const key = newKey(), kind = b.dataset.kind; modal({
      title: kind === 'discount' ? 'ثبت تخفیف' : 'ثبت تعدیل', body: `<form class="stack" id="lineForm">${amountInput('amount', kind === 'discount' ? 'مبلغ تخفیف' : 'مبلغ تعدیل (منفی برای کاهش)')}<div class="field"><label for="f-reason">علت (الزامی، در سوابق ثبت می‌شود)</label><input class="input" id="f-reason" name="reason" required maxlength="200"></div></form>`,
      onOpen: wireAmount,
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ثبت', onClick: async (m) => { const f = $('#lineForm', m); if (!f.reportValidity()) return false; await post(`/api/manager/invoices/${b.dataset.line}/lines`, { idempotency_key: key, kind, amount: f.amount.value, reason: f.reason.value }); toast('ثبت شد', 'ok'); reload(); } }],
    }); });
    on(body, 'click', '[data-void]', (_e, b) => modal({
      title: 'ابطال فاکتور', body: '<form id="voidForm" class="stack"><p class="small">فاکتور حذف نمی‌شود؛ با وضعیت «باطل» در سوابق می‌ماند و از مانده حساب کسر می‌شود.</p><div class="field"><label for="f-vr">علت ابطال</label><input class="input" id="f-vr" name="reason" required maxlength="200"></div></form>',
      actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ابطال فاکتور', cls: 'danger', onClick: async (m) => { const f = $('#voidForm', m); if (!f.reportValidity()) return false; await post(`/api/manager/invoices/${b.dataset.void}/void`, { reason: f.reason.value }); toast('فاکتور باطل شد', 'ok'); reload(); } }],
    }));
  };
  if (params.student) return show(Number(params.student));
  body.innerHTML = '';
  await pickStudent(body, (sid) => { location.hash = `#/finance?tab=accounts&student=${sid}`; });
}

async function catalog(body) {
  const items = await api('/api/manager/charge-items');
  body.innerHTML = `<div class="grid c3"><form class="card" id="itemForm" aria-label="قلم جدید"><div class="card-title">قلم جدید</div>
    <div class="field"><label for="f-cat">دسته</label><select class="input" id="f-cat" name="category">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field"><label for="f-title">عنوان</label><input class="input" id="f-title" name="title" required maxlength="80"></div>${amountInput('unit_price', 'قیمت واحد (تومان)')}
    <button class="btn block">افزودن</button><p class="tiny muted">تغییر قیمت فقط روی خریدهای بعدی اثر دارد.</p></form>
    <section class="card span2"><div class="card-title">کاتالوگ</div>${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>دسته</th><th>عنوان</th><th>قیمت</th><th>وضعیت</th><th></th></tr></thead><tbody>${items.map((i) => `<tr><td>${CATS[i.category]}</td><td>${esc(i.title)}</td><td>${money(i.unit_price)}</td><td>${i.active ? '<span class="badge green">فعال</span>' : '<span class="badge gray">غیرفعال</span>'}</td><td class="row"><button class="btn sm ghost" data-price="${i.id}">قیمت</button><button class="btn sm ghost" data-toggle="${i.id}" data-active="${i.active}">${i.active ? 'غیرفعال' : 'فعال'}</button></td></tr>`).join('')}</tbody></table></div>` : empty('bag', 'هنوز قلمی تعریف نشده')}</section></div>`;
  wireAmount(body);
  $('#itemForm', body).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { const f = e.target; await post('/api/manager/charge-items', { category: f.category.value, title: f.title.value, unit_price: f.unit_price.value }); toast('افزوده شد', 'ok'); catalog(body); }); };
  on(body, 'click', '[data-toggle]', (_e, b) => busy(b, async () => { await put(`/api/manager/charge-items/${b.dataset.toggle}`, { active: b.dataset.active !== '1' }); catalog(body); }));
  on(body, 'click', '[data-price]', (_e, b) => modal({
    title: 'تغییر قیمت', body: `<form id="priceForm">${amountInput('unit_price', 'قیمت جدید (تومان)')}</form>`, onOpen: wireAmount,
    actions: [{ label: 'انصراف', cls: 'ghost', value: false }, { label: 'ذخیره', onClick: async (m) => { const f = $('#priceForm', m); if (!f.reportValidity()) return false; await put(`/api/manager/charge-items/${b.dataset.price}`, { unit_price: f.unit_price.value }); catalog(body); } }],
  }));
}

async function reconcile(body) {
  const r = await api('/api/manager/finance/reconcile');
  const LBL = { lines_mismatch: 'جمع اقلام با مبلغ فاکتور برابر نیست', paid_mismatch: 'مبلغ پرداخت‌شدهٔ ثبت‌شده با پرداخت‌های تأییدشده برابر نیست', overpaid: 'پرداخت بیش از مبلغ فاکتور', missing_income_entry: 'سند درآمد برای پرداخت تأییدشده ثبت نشده', missing_reversal_entry: 'سند اصلاحی برای برگشت ثبت نشده' };
  body.innerHTML = `${totalsHtml({ charged: r.totals.charged, paid: r.totals.paid, balance: r.totals.outstanding, buffet_debt: 0 }).replace(/<div class="card"><div class="tiny muted">بدهی بوفه[\s\S]*?<\/div><\/div>(?=<\/div>$)/, '')}
    <section class="card"><div class="card-title">نتیجهٔ تطبیق — ${jdate(r.checked_at)}</div>${r.ok ? `<p>${icon('check', { size: 18 })} همهٔ فاکتورها، پرداخت‌ها و اسناد حسابداری با یکدیگر سازگارند.</p>` : `<div class="table-wrap"><table class="table"><thead><tr><th>مشکل</th><th>مرجع</th><th>مورد انتظار</th><th>ثبت‌شده</th></tr></thead><tbody>${r.issues.map((i) => `<tr><td>${LBL[i.type] || i.type}</td><td>${i.invoice_id ? `فاکتور ${fa(i.invoice_id)}` : `پرداخت ${fa(i.payment_id)}`}</td><td>${money(i.expected)}</td><td>${money(i.actual)}</td></tr>`).join('')}</tbody></table></div>`}</section>`;
}
