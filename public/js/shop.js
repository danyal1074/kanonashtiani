import { artwork } from './artwork.js';
// صفحه اصلی کانون، صفحه محصول، سبد خرید تعاملی، کد تخفیف و پرداخت
import { api, post, esc, fa, money, $, $$, on, toast, busy, modal, setHead, logoHtml, empty, loading, confetti, state, jdate, icon } from './core.js';

const cartKey = (slug) => `roshd-cart-${slug}`;
export function getCart(slug) { try { return JSON.parse(localStorage.getItem(cartKey(slug)) || '[]'); } catch { return []; } }
function setCart(slug, items) { try { localStorage.setItem(cartKey(slug), JSON.stringify(items)); } catch { /* */ } window.dispatchEvent(new Event('roshd:cart')); }
const unit = (p) => Math.round(p.price * (100 - (p.discount_percent || 0)) / 100);
export function addToCart(slug, id) {
  const c = getCart(slug);
  const it = c.find((x) => x.id === id);
  if (it) it.qty = Math.min(10, it.qty + 1); else c.push({ id, qty: 1 });
  setCart(slug, c);
  toast('به سبد خرید اضافه شد ', 'ok');
}
const KIND = { video: ' دوره ویدیویی', booklet: ' جزوه تخصصی' };

export function productCard(p) {
  return `<article class="product" data-pid="${p.id}"><div class="cover" style="background:linear-gradient(135deg,${esc(p.color || '#0B5F66')}33,${esc(p.color || '#0B5F66')}11)">${icon(p.kind === 'video' ? 'video' : 'book', { size: 44 })}${p.discount_percent ? `<span class="off">${fa(p.discount_percent)}٪ تخفیف</span>` : ''}</div>
    <div class="pb"><span class="badge gray" style="align-self:flex-start">${KIND[p.kind] || p.kind}${p.grade ? ` • ${esc(p.grade)}` : ''}</span><div class="pt">${esc(p.title)}</div><div class="small muted" style="flex:1">${esc(p.description || '')}</div>
    <div class="row between"><div class="price"><span class="now">${money(unit(p))}</span>${p.discount_percent ? `<span class="was">${money(p.price)}</span>` : ''}</div><button class="btn sm" data-add="${p.id}" aria-label="افزودن به سبد">${icon('bag', { size: 16 })} افزودن</button></div></div></article>`;
}

function cartHtml(slug, products, quote) {
  const items = getCart(slug).map((i) => ({ ...i, p: products.find((p) => p.id === i.id) })).filter((i) => i.p);
  if (!items.length) return empty('bag', 'سبد خریدت خالی است');
  const sub = items.reduce((a, i) => a + unit(i.p) * i.qty, 0);
  return `<div class="list">${items.map((i) => `<div class="list-item" style="flex-wrap:wrap"><div class="avatar" style="background:${esc(i.p.color)}1f;color:${esc(i.p.color)}">${icon(i.p.kind === 'video' ? 'video' : 'book', { size: 20 })}</div><div class="grow"><div class="bold small">${esc(i.p.title)}</div><div class="tiny muted">${money(unit(i.p))}</div></div>
    <div class="qty"><button data-inc="${i.id}" aria-label="افزایش">+</button><span>${fa(i.qty)}</span><button data-dec="${i.id}" aria-label="کاهش">−</button></div><b class="small" style="margin-inline-start:auto;text-align:left">${money(unit(i.p) * i.qty)}</b></div>`).join('')}</div>
    <div class="row" style="margin-top:14px"><input class="input ltr" id="dcode" style="min-width:0" placeholder="کد تخفیف (مثلاً ROSHD10)" value="${esc(quote?.code || '')}"><button class="btn ghost" id="applyCode">اعمال</button></div>
    <div class="stack" style="gap:6px;margin-top:14px;background:var(--bg);border-radius:16px;padding:14px">
      <div class="row between"><span>جمع کل</span><b>${money(sub)}</b></div>
      ${quote?.discount ? `<div class="row between pos"><span>${icon('receipt', { size: 16 })} تخفیف (${fa(quote.percent)}٪)</span><b>− ${money(quote.discount)}</b></div>` : ''}
      <div class="row between" style="font-size:18px"><b>مبلغ قابل پرداخت</b><b>${money(sub - (quote?.discount || 0))}</b></div></div>
    <button class="btn lg block green" id="checkout" style="margin-top:14px">${icon('card', { size: 16 })} پرداخت آنلاین</button>`;
}

function bindCart(box, slug, products, rerender) {
  // شنونده‌ها فقط یک‌بار وصل می‌شوند؛ فراخوانی دوباره فقط سبد را تازه می‌کند
  if (box.redrawCart) return box.redrawCart();
  let quote = null;
  const draw = () => { box.innerHTML = cartHtml(slug, products, quote); };
  box.redrawCart = draw;
  draw();
  on(box, 'click', '[data-inc],[data-dec]', (e, b) => {
    const id = Number(b.dataset.inc || b.dataset.dec);
    let c = getCart(slug);
    const it = c.find((x) => x.id === id);
    it.qty += b.dataset.inc ? 1 : -1;
    if (it.qty > 10) it.qty = 10;
    c = c.filter((x) => x.qty > 0);
    setCart(slug, c); quote = null; draw(); rerender?.();
  });
  on(box, 'click', '#applyCode', (e, b) => {
    const code = $('#dcode', box).value.trim();
    if (!code) return;
    if (!state.me) { toast('برای اعمال کد تخفیف ابتدا وارد شو', 'err'); return; }
    busy(b, async () => { const q = await post('/api/shop/quote', { items: getCart(slug), code }); quote = { ...q, code }; draw(); toast(`کد تخفیف ${fa(q.percent)}٪ اعمال شد`, 'ok'); });
  });
  on(box, 'click', '#checkout', async () => {
    if (!state.me || !['student', 'parent'].includes(state.me.user.role)) {
      toast('برای خرید، با حساب دانش‌آموز یا والدین وارد شو', 'err');
      try { sessionStorage.setItem('roshd-after-login', '#/shop'); } catch { /* */ }
      location.hash = '#/login';
      return;
    }
    const total = getCart(slug).reduce((a, i) => { const p = products.find((x) => x.id === i.id); return a + (p ? unit(p) * i.qty : 0); }, 0) - (quote?.discount || 0);
    const res = await modal({
      title: ' درگاه پرداخت (آزمایشی)',
      body: `<div class="center"><span class="ib lg" style="margin:0 auto var(--s-3)">${icon('card', { size: 26 })}</span><p>مبلغ قابل پرداخت:</p><div style="font-size:26px;font-weight:900">${money(total)}</div>
        <p class="small muted">این درگاه شبیه‌سازی‌شده است و هیچ مبلغی از حساب شما کسر نمی‌شود. در نسخه عملیاتی به درگاه بانکی متصل می‌شود.</p></div>`,
      actions: [{ label: 'انصراف', cls: 'ghost', value: null }, { label: ' پرداخت موفق', cls: 'green', onClick: () => post('/api/shop/checkout', { items: getCart(slug), code: quote?.code }) }],
    });
    if (!res) return;
    setCart(slug, []);
    confetti(100);
    await modal({ title: ' خرید موفق', body: `<div class="receipt-ok"><span class="ib lg" style="margin:0 auto var(--s-3)">${icon('check-circle', { size: 26 })}</span><p>پرداخت با موفقیت انجام شد.</p><div class="small muted">کد پیگیری سفارش</div><div class="code">${esc(res.tracking_code)}</div>
      <p class="small">مبلغ پرداختی: <b>${money(res.total)}</b>${res.discount ? ` (با ${money(res.discount)} تخفیف)` : ''}</p><p class="small muted">محصولات خریداری‌شده در «${state.me.user.role === 'student' ? 'پروفایل من' : 'فروشگاه › خریدهای من'}» قابل دانلود است.</p></div>`, actions: [{ label: 'عالی!', value: true }] });
    rerender?.(); draw();
  });
}

// ---------- فروشگاه داخل پنل (دانش‌آموز و والدین) ----------
export async function panelShop(el, _p, me) {
  const slug = me.center.slug;
  const data = await api(`/api/public/center/${slug}`);
  const orders = await api('/api/shop/orders').catch(() => []);
  setHead('فروشگاه کانون', 'دوره‌های ویدیویی و جزوه‌های تخصصی', `<a class="btn ghost sm" href="#/c/${esc(slug)}" target="_blank">${icon('globe', { size: 16 })} صفحه عمومی کانون</a>`);
  el.innerHTML = `<div class="grid c3"><div class="span2"><div class="products" id="plist">${data.products.map(productCard).join('')}</div></div>
    <div class="stack" style="gap:18px"><div class="card" style="position:sticky;top:12px"><div class="card-title"><span class="ib">${icon('bag', { size: 18 })}</span>سبد خرید</div><div id="cartBox"></div></div>
    <div class="card"><div class="card-title"><span class="ib green">${icon('receipt', { size: 18 })}</span>خریدهای من</div><div class="list">${orders.map((o) => `<div class="list-item"><div class="grow"><div class="small bold">${o.items.map((i) => esc(i.title)).join('، ')}</div><div class="tiny muted">${jdate(o.created_at)} • کد پیگیری: <b>${esc(o.tracking_code)}</b></div></div>${o.items[0]?.download_url ? `<a class="btn sm soft" href="${esc(o.items[0].download_url)}" download>${icon('download', { size: 16 })}</a>` : ''}</div>`).join('') || empty('bag', 'هنوز خریدی نداشته‌ای')}</div></div></div></div>`;
  const cartBox = $('#cartBox', el);
  bindCart(cartBox, slug, data.products, () => panelShop(el, _p, me));
  on(el, 'click', '[data-add]', (e, b) => { e.stopPropagation(); addToCart(slug, Number(b.dataset.add)); bindCart(cartBox, slug, data.products, () => panelShop(el, _p, me)); });
  on($('#plist', el), 'click', '.product', (e, card) => {
    if (e.target.closest('[data-add]')) return;
    const p = data.products.find((x) => x.id === Number(card.dataset.pid));
    api(`/api/public/product/${p.id}`).then((full) => modal({
      title: esc(full.title), wide: true,
      body: `<div class="row wrap" style="gap:8px">${full.discount_percent ? `<span class="badge red">${fa(full.discount_percent)}٪ تخفیف</span>` : ''}<span class="badge gray">${KIND[full.kind]}</span></div><p style="white-space:pre-line">${esc(full.details || full.description)}</p>
        <div class="price"><span class="now">${money(unit(full))}</span>${full.discount_percent ? `<span class="was">${money(full.price)}</span>` : ''}</div>`,
      actions: [{ label: ' افزودن به سبد', onClick: () => { addToCart(slug, full.id); bindCart(cartBox, slug, data.products, () => panelShop(el, _p, me)); } }],
    }));
  });
}

// ---------- صفحات عمومی ----------
function pubHeader(c) {
  const n = getCart(c.slug).reduce((a, i) => a + i.qty, 0);
  return `<header class="pub-head"><a href="#/c/${esc(c.slug)}" class="row" style="color:inherit"><div class="brand-logo">${logoHtml(c.logo)}</div><div><div class="bold">${esc(c.name)}</div><div class="tiny muted">${icon('sprout', { size: 16 })} پلتفرم رشد نخبه</div></div></a>
    <div class="row" style="margin-inline-start:auto"><a class="icon-btn" href="#/cart/${esc(c.slug)}" aria-label="سبد خرید" style="position:relative">${icon('bag', { size: 16 })}${n ? `<span class="cnt" style="position:absolute;top:-6px;left:-6px;background:var(--pink);color:#fff;border-radius:99px;font-size:11px;min-width:18px;height:18px;display:grid;place-items:center">${fa(n)}</span>` : ''}</a>
    <a class="btn sm" href="${state.me ? '#/home' : '#/login'}">${state.me ? ' پنل من' : ' ورود'}</a></div></header>`;
}

async function landing(root, { slug }) {
  root.innerHTML = loading();
  const d = await api(`/api/public/center/${slug}`).catch((e) => { root.innerHTML = empty('alert', esc(e.message)); });
  if (!d) return;
  const c = d.center;
  document.title = `${c.name} | پلتفرم رشد نخبه`;
  try { localStorage.setItem('roshd-center', c.slug); } catch { /* */ }
  const render = () => {
    root.innerHTML = `${pubHeader(c)}<main class="pub-main">
      <section class="hero" style="margin-bottom:24px"><div class="row wrap" style="gap:22px">${artwork('public-center', 'public-center-art')}<div class="brand-logo" style="width:110px;height:110px;border-radius:32px;font-size:54px;background:#ffffff26">${logoHtml(c.logo)}</div>
        <div class="grow" style="min-width:240px"><span class="glass" style="padding:4px 12px;font-weight:800">${icon('sprout', { size: 16 })} به پلتفرم رشد نخبه خوش آمدید</span><h2 style="font-size:28px;margin:12px 0 6px">${esc(c.name)}</h2><p style="margin:0;opacity:.92">${esc(c.tagline || '')}</p></div>
        <div class="row" style="gap:10px"><div class="glass center"><div class="big-num">${fa(d.stats.students)}</div><div class="small">دانش‌آموز</div></div><div class="glass center"><div class="big-num">${fa(d.stats.teachers)}</div><div class="small">معلم</div></div></div></div></section>
      <div class="grid c3" style="margin-bottom:24px"><div class="card span2"><div class="card-title"><span class="ib">${icon('building', { size: 18 })}</span>درباره کانون</div><p style="margin:0;white-space:pre-line">${esc(c.about || '')}</p></div>
        <div class="card tint-violet"><div class="card-title"><span class="ib">${icon('sparkles', { size: 18 })}</span>در پلتفرم رشد</div><div class="stack small" style="gap:8px"><div>${icon('timer', { size: 16 })} برنامه مطالعه پومودورو و رقابت هفتگی</div><div>${icon('file-check', { size: 16 })} آزمون آنلاین با کارنامه فوری</div><div>${icon('sparkles', { size: 16 })} مسیر یادگیری هوشمند شخصی</div><div>${icon('users', { size: 16 })} گزارش لحظه‌ای برای والدین</div></div></div></div>
      <h2 style="font-size:22px;margin-bottom:14px">${icon('bag', { size: 16 })} فروشگاه کانون</h2><div class="products">${d.products.map(productCard).join('')}</div></main>
      <a class="btn lg cart-fab" href="#/cart/${esc(c.slug)}">${icon('bag', { size: 16 })} سبد خرید<span class="cnt" ${getCart(c.slug).length ? '' : 'hidden'}>${fa(getCart(c.slug).reduce((a, i) => a + i.qty, 0))}</span></a>`;
  };
  render();
  on(root, 'click', '[data-add]', (e, b) => { e.stopPropagation(); addToCart(c.slug, Number(b.dataset.add)); render(); });
  on(root, 'click', '.product', (e, card) => { if (!e.target.closest('[data-add]')) location.hash = `#/p/${card.dataset.pid}`; });
}

async function productPage(root, { id }) {
  root.innerHTML = loading();
  const p = await api(`/api/public/product/${id}`).catch((e) => { root.innerHTML = empty('alert', esc(e.message)); });
  if (!p) return;
  const c = (await api(`/api/public/center/${p.slug}`)).center;
  document.title = `${p.title} | ${c.name}`;
  const render = () => {
    root.innerHTML = `${pubHeader(c)}<main class="pub-main"><a href="#/c/${esc(c.slug)}" class="small">→ بازگشت به صفحه کانون</a>
      <div class="grid c2" style="margin-top:14px"><div class="card" style="display:grid;place-items:center;min-height:320px;background:${esc(p.color)}14;color:${esc(p.color)}">${icon(p.kind === 'video' ? 'video' : 'book', { size: 96 })}</div>
      <div class="card"><div class="row wrap">${p.discount_percent ? `<span class="badge red">${icon('flame', { size: 16 })} ${fa(p.discount_percent)}٪ تخفیف</span>` : ''}<span class="badge gray">${KIND[p.kind]}</span>${p.grade ? `<span class="badge">پایه ${esc(p.grade)}</span>` : ''}</div>
        <h1 style="font-size:26px;font-weight:900;margin:12px 0">${esc(p.title)}</h1><p class="muted">${esc(p.description || '')}</p><p style="white-space:pre-line">${esc(p.details || '')}</p>
        <div class="price" style="margin:16px 0"><span class="now" style="font-size:26px">${money(unit(p))}</span>${p.discount_percent ? `<span class="was" style="font-size:16px">${money(p.price)}</span>` : ''}</div>
        <div class="row wrap"><button class="btn lg" data-add="${p.id}">${icon('bag', { size: 16 })} افزودن به سبد خرید</button><a class="btn lg ghost" href="#/cart/${esc(c.slug)}">مشاهده سبد</a></div></div></div>
      ${p.related.length ? `<h3 style="margin:26px 0 12px">محصولات مرتبط</h3><div class="products">${p.related.map(productCard).join('')}</div>` : ''}</main>`;
  };
  render();
  on(root, 'click', '[data-add]', (e, b) => { e.stopPropagation(); addToCart(c.slug, Number(b.dataset.add)); render(); });
  on(root, 'click', '.product', (e, card) => { if (!e.target.closest('[data-add]')) location.hash = `#/p/${card.dataset.pid}`; });
}

async function cartPage(root, { slug }) {
  root.innerHTML = loading();
  const d = await api(`/api/public/center/${slug}`);
  document.title = `سبد خرید | ${d.center.name}`;
  const render = () => {
    root.innerHTML = `${pubHeader(d.center)}<main class="pub-main" style="max-width:760px"><a href="#/c/${esc(slug)}" class="small">→ ادامه خرید</a><div class="card" style="margin-top:12px"><div class="card-title"><span class="ib">${icon('bag', { size: 18 })}</span>سبد خرید</div><div id="cartBox"></div></div>
      ${state.me ? '' : '<p class="small muted center">برای اعمال کد تخفیف و پرداخت، با حساب دانش‌آموز یا والدین وارد شوید.</p>'}</main>`;
    bindCart($('#cartBox', root), slug, d.products, render);
  };
  render();
}

export const publicRoutes = [
  { path: '/c/:slug', view: landing },
  { path: '/p/:id', view: productPage },
  { path: '/cart/:slug', view: cartPage },
];
