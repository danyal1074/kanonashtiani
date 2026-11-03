// مسیرهای مشترک: ورود، پروفایل، اطلاعیه، پیام‌رسان، صفحه عمومی کانون و فروشگاه
import { all, get, run, tx } from '../db.js';
import { COOKIE } from '../http.js';
import { fail, hashPassword, verifyPassword, needsRehash, signToken, ymd, jMonthOf, toEnDigits, clampStr, randomCode, saveUpload } from '../util.js';
import { feeStatus, announcementsFor, contactsOf, levelOf, totalPoints } from '../logic.js';

const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.count >= 8) fail(429, 'تلاش‌های ناموفق زیاد بود؛ چند دقیقه بعد دوباره امتحان کنید');
  return {
    failed() { const x = attempts.get(key); attempts.set(key, x && x.until > now ? { ...x, count: x.count + 1 } : { count: 1, until: now + 10 * 60e3 }); },
    ok() { attempts.delete(key); },
  };
}

const cookieHeader = (tok, maxAge) => `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
export function setSession(ctx, user, extra = {}) {
  const tok = signToken({ uid: user.id, pv: user.pass_hash.slice(-8), ...extra });
  ctx.res.setHeader('Set-Cookie', cookieHeader(tok, 14 * 86400));
}

export function centerOf(id) {
  return get('SELECT id, name, slug, logo, tagline, color, card_number, card_holder, min_daily_study FROM centers WHERE id=?', id);
}

export function studentInfo(id) {
  return get(`SELECT s.*, c.name class_name, u.full_name FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN classes c ON c.id=s.class_id WHERE s.user_id=?`, id);
}

export function isBirthday(birth) {
  if (!birth) return false;
  const [, bm, bd] = jMonthOf(birth);
  const [, tm, td] = jMonthOf(ymd());
  return bm === tm && bd === td;
}

export default function register(r) {
  r.post('/api/auth/login', { auth: false }, (ctx) => {
    const role = ctx.body.role;
    const id = toEnDigits(clampStr(ctx.body.identifier, 64));
    const pw = String(ctx.body.password || '');
    if (!['student', 'teacher', 'manager', 'parent', 'admin'].includes(role)) fail(400, 'نقش کاربری نامعتبر است');
    if (!id || !pw) fail(400, 'شناسه و رمز عبور را وارد کنید');
    const t = throttle(`${ctx.ip}|${id}`);
    let user;
    if (role === 'parent') user = get(`SELECT * FROM users WHERE role='parent' AND mobile=?`, id);
    else user = get(`SELECT * FROM users WHERE role=? AND (national_code=? OR username=?)`, role, id, id);
    if (!user || !user.active || !verifyPassword(pw, user.pass_hash)) {
      t.failed();
      fail(401, role === 'parent' ? 'شماره موبایل یا رمز عبور اشتباه است' : 'نام کاربری/کد ملی یا رمز عبور اشتباه است');
    }
    t.ok();
    if (needsRehash(user.pass_hash)) {
      user.pass_hash = hashPassword(pw);
      run('UPDATE users SET pass_hash=? WHERE id=?', user.pass_hash, user.id);
    }
    setSession(ctx, user);
    return { ok: true, role: user.role };
  });

  r.post('/api/auth/logout', { auth: false, allowLocked: true }, (ctx) => {
    ctx.res.setHeader('Set-Cookie', cookieHeader('', 0));
    return { ok: true };
  });

  r.post('/api/auth/stop-impersonate', { allowLocked: true }, (ctx) => {
    if (!ctx.impersonator) fail(400, 'در حالت مشاهده‌به‌جای کاربر نیستید');
    const admin = get('SELECT * FROM users WHERE id=?', ctx.impersonator.id);
    setSession(ctx, admin);
    return { ok: true };
  });

  r.get('/api/me', { allowLocked: true }, (ctx) => {
    const u = ctx.user;
    const out = { user: u, impersonator: ctx.impersonator, center: u.center_id ? centerOf(u.center_id) : null, today: ymd() };
    if (u.role === 'student') {
      const s = studentInfo(u.id);
      const total = totalPoints(u.id);
      out.student = { grade: s.grade, class_id: s.class_id, class_name: s.class_name, school: s.school, avatar: s.avatar, birthday: isBirthday(s.birth_date), points: total, level: levelOf(total) };
      out.fee = feeStatus(u.id);
    }
    if (u.role === 'parent') out.children = all(`SELECT u.id, u.full_name, s.grade, s.avatar, c.name class_name FROM parent_children pc JOIN users u ON u.id=pc.student_id JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id WHERE pc.parent_id=? ORDER BY s.grade`, u.id);
    out.unseen = u.role === 'manager' || u.role === 'admin' ? [] : announcementsFor(u).filter((a) => !a.seen_at).reverse();
    out.unread = get('SELECT COUNT(*) n FROM messages WHERE to_id=? AND read_at IS NULL', u.id).n;
    return out;
  });

  r.post('/api/me/password', { allowLocked: true }, (ctx) => {
    const { current, next } = ctx.body;
    const row = get('SELECT pass_hash FROM users WHERE id=?', ctx.user.id);
    if (!verifyPassword(current || '', row.pass_hash)) fail(400, 'رمز فعلی اشتباه است');
    if (!next || String(next).length < 6) fail(400, 'رمز جدید باید حداقل ۶ کاراکتر باشد');
    const h = hashPassword(next);
    run('UPDATE users SET pass_hash=? WHERE id=?', h, ctx.user.id);
    setSession(ctx, { id: ctx.user.id, pass_hash: h });
    return { ok: true };
  });

  r.put('/api/me/avatar', { roles: ['student'] }, (ctx) => {
    let av;
    if (ctx.body.file) {
      const data = ctx.body.file.data;
      if (typeof data !== 'string' || data.length > 3 * 1024 * 1024) fail(400, 'حجم عکس حداکثر ۲ مگابایت است');
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
      if (!match) fail(400, 'فقط عکس PNG، JPG یا WebP مجاز است');
      const bytes = Buffer.from(match[2], 'base64');
      const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
      if (!valid) fail(400, 'محتوای عکس معتبر نیست');
      av = '/uploads/' + saveUpload(ctx.body.file, 2);
    } else {
      av = clampStr(ctx.body.avatar, 32);
      const allowed = ['sprout','star','zap','flame','compass','bulb','flask','book','trophy','target','heart','globe','calculator','languages','gamepad','award'];
      if (!allowed.includes(av)) fail(400, 'آواتار نامعتبر');
    }
    run('UPDATE students SET avatar=? WHERE user_id=?', av, ctx.user.id);
    return { ok: true };
  });

  // ---------- اطلاعیه‌ها ----------
  r.get('/api/announcements', { allowLocked: true }, (ctx) => announcementsFor(ctx.user));
  r.post('/api/announcements/:id/seen', { allowLocked: true }, (ctx) => {
    const a = announcementsFor(ctx.user).find((x) => x.id === Number(ctx.params.id));
    if (!a) fail(404, 'اطلاعیه یافت نشد');
    run('INSERT OR IGNORE INTO announcement_views (announcement_id, user_id) VALUES (?,?)', a.id, ctx.user.id);
    return { ok: true };
  });

  // ---------- پیام‌رسان داخلی امن ----------
  r.get('/api/messages/contacts', {}, (ctx) => {
    const contacts = contactsOf(ctx.user);
    const last = all(`SELECT CASE WHEN from_id=? THEN to_id ELSE from_id END other, MAX(id) mid FROM messages WHERE from_id=? OR to_id=? GROUP BY other`, ctx.user.id, ctx.user.id, ctx.user.id);
    const lastMap = Object.fromEntries(last.map((l) => [l.other, get('SELECT body, created_at, from_id FROM messages WHERE id=?', l.mid)]));
    const unread = Object.fromEntries(all('SELECT from_id, COUNT(*) n FROM messages WHERE to_id=? AND read_at IS NULL GROUP BY from_id', ctx.user.id).map((x) => [x.from_id, x.n]));
    return contacts.map((c) => ({ ...c, last: lastMap[c.id] || null, unread: unread[c.id] || 0 }))
      .sort((a, b) => (b.last?.created_at || '').localeCompare(a.last?.created_at || ''));
  });
  r.get('/api/messages/:uid', {}, (ctx) => {
    const other = Number(ctx.params.uid);
    if (!contactsOf(ctx.user).some((c) => c.id === other)) fail(403, 'امکان گفت‌وگو با این کاربر وجود ندارد');
    run('UPDATE messages SET read_at=datetime(\'now\') WHERE to_id=? AND from_id=? AND read_at IS NULL', ctx.user.id, other);
    return all(`SELECT id, from_id, body, created_at, read_at FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id DESC LIMIT 200`, ctx.user.id, other, other, ctx.user.id).reverse();
  });
  r.post('/api/messages', {}, (ctx) => {
    const to = Number(ctx.body.to);
    const body = clampStr(ctx.body.body, 2000);
    if (!body) fail(400, 'متن پیام خالی است');
    if (!contactsOf(ctx.user).some((c) => c.id === to)) fail(403, 'امکان ارسال پیام به این کاربر وجود ندارد');
    const res = run('INSERT INTO messages (center_id, from_id, to_id, body) VALUES (?,?,?,?)', ctx.user.center_id, ctx.user.id, to, body);
    return get('SELECT id, from_id, body, created_at, read_at FROM messages WHERE id=?', res.lastInsertRowid);
  });

  // ---------- صفحه عمومی کانون و فروشگاه ----------
  r.get('/api/public/centers', { auth: false }, () => all('SELECT name, slug, logo, tagline, color FROM centers ORDER BY id'));
  r.get('/api/public/center/:slug', { auth: false }, (ctx) => {
    const c = get('SELECT id, name, slug, logo, tagline, about, color FROM centers WHERE slug=?', ctx.params.slug);
    if (!c) fail(404, 'کانون یافت نشد');
    const stats = {
      students: get(`SELECT COUNT(*) n FROM users WHERE center_id=? AND role='student' AND active=1`, c.id).n,
      teachers: get(`SELECT COUNT(*) n FROM users WHERE center_id=? AND role='teacher' AND active=1`, c.id).n,
      products: get('SELECT COUNT(*) n FROM products WHERE center_id=? AND active=1', c.id).n,
    };
    const products = all('SELECT id, title, kind, grade, description, price, discount_percent, cover, color FROM products WHERE center_id=? AND active=1 ORDER BY id', c.id);
    return { center: c, stats, products };
  });
  r.get('/api/public/product/:id', { auth: false }, (ctx) => {
    const p = get('SELECT p.id, p.center_id, p.title, p.kind, p.grade, p.description, p.details, p.price, p.discount_percent, p.cover, p.color, c.slug, c.name center_name FROM products p JOIN centers c ON c.id=p.center_id WHERE p.id=? AND p.active=1', Number(ctx.params.id));
    if (!p) fail(404, 'محصول یافت نشد');
    p.related = all('SELECT id, title, kind, price, discount_percent, cover, color FROM products WHERE center_id=? AND id<>? AND active=1 LIMIT 3', p.center_id, p.id);
    return p;
  });

  function priceCart(centerId, items, code) {
    if (!Array.isArray(items) || !items.length) fail(400, 'سبد خرید خالی است');
    const lines = items.slice(0, 50).map((it) => {
      const p = get('SELECT id, title, price, discount_percent, kind, cover, download_url FROM products WHERE id=? AND center_id=? AND active=1', Number(it.id), centerId);
      if (!p) fail(400, 'یکی از محصولات سبد دیگر موجود نیست');
      const qty = Math.max(1, Math.min(10, Number(it.qty) || 1));
      const unit = Math.round(p.price * (100 - p.discount_percent) / 100);
      return { id: p.id, title: p.title, kind: p.kind, cover: p.cover, qty, unit, total: unit * qty, download_url: p.download_url };
    });
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    let percent = 0;
    if (code) {
      const dc = get('SELECT percent FROM discount_codes WHERE center_id=? AND code=? AND active=1', centerId, clampStr(code, 30).toUpperCase());
      if (!dc) fail(400, 'کد تخفیف معتبر نیست');
      percent = dc.percent;
    }
    const discount = Math.round(subtotal * percent / 100);
    return { lines, subtotal, percent, discount, total: subtotal - discount };
  }
  r.post('/api/shop/quote', { roles: ['student', 'parent'] }, (ctx) => priceCart(ctx.user.center_id, ctx.body.items, ctx.body.code));
  r.post('/api/shop/checkout', { roles: ['student', 'parent'] }, (ctx) => {
    const q = priceCart(ctx.user.center_id, ctx.body.items, ctx.body.code);
    // درگاه پرداخت شبیه‌سازی‌شده: پرداخت موفق و صدور کد پیگیری
    const tracking = 'RSH-' + randomCode(8);
    tx(() => {
      run('INSERT INTO orders (center_id, user_id, items, subtotal, discount, total, code, tracking_code) VALUES (?,?,?,?,?,?,?,?)',
        ctx.user.center_id, ctx.user.id, JSON.stringify(q.lines), q.subtotal, q.discount, q.total, ctx.body.code ? String(ctx.body.code).toUpperCase() : null, tracking);
      if (q.total > 0) run(`INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)`,
        ctx.user.center_id, 'income', q.total, `فروش فروشگاه - ${ctx.user.full_name}`, 'فروشگاه', ymd(), tracking);
    });
    return { ok: true, tracking_code: tracking, ...q };
  });
  r.get('/api/shop/orders', { roles: ['student', 'parent'] }, (ctx) =>
    all('SELECT id, items, total, discount, tracking_code, created_at FROM orders WHERE user_id=? ORDER BY id DESC', ctx.user.id).map((o) => ({ ...o, items: JSON.parse(o.items) })));
}
