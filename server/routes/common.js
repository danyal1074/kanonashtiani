import fs from 'node:fs';
import path from 'node:path';
import { CURATED_QUESTIONS } from '../self_exam.js';
// مسیرهای مشترک: ورود، پروفایل، اطلاعیه، پیام‌رسان، صفحه عمومی کانون و فروشگاه
import { all, get, run, tx, ROOT, DATA_DIR } from '../db.js';
import { COOKIE, isHttps, serveFile } from '../http.js';
import { fail, hashPasswordAsync, verifyPasswordAsync, needsRehash, signToken, ymd, jMonthOf, toEnDigits, clampStr, normalizeIranianMobile, normalizeNationalCode, randomCode, saveUpload } from '../util.js';
import { feeStatus, announcementsFor, contactsOf, levelOf, totalPoints } from '../logic.js';

// محدودیت تلاش ناموفق ورود: هر (آی‌پی، شناسه) ۸ بار در ۱۰ دقیقه؛ و سقف کلی هر آی‌پی (مدرسه‌ای با ده‌ها دانش‌آموز پشت یک آی‌پی)
const attempts = new Map();
const WINDOW = 10 * 60e3;
const LIMITS = { pair: 8, ip: Number(process.env.ROSHD_LOGIN_IP_LIMIT || 1000) };
function bump(key) { const now = Date.now(); const x = attempts.get(key); attempts.set(key, x && x.until > now ? { ...x, count: x.count + 1 } : { count: 1, until: now + WINDOW }); }
const blocked = (key, max) => { const a = attempts.get(key); return !!a && a.until > Date.now() && a.count >= max; };
function throttle(ip, id) {
  const pair = `${ip}|${id}`, ipKey = `ip|${ip}`;
  if (blocked(pair, LIMITS.pair) || blocked(ipKey, LIMITS.ip)) fail(429, 'تلاش‌های ناموفق زیاد بود؛ چند دقیقه بعد دوباره امتحان کنید');
  return { failed() { bump(pair); bump(ipKey); }, ok() { attempts.delete(pair); } };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k); }, 60e3).unref();

const cookieHeader = (tok, maxAge, req) => `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req && isHttps(req) ? '; Secure' : ''}`;
export function setSession(ctx, user, extra = {}) {
  const tok = signToken({ uid: user.id, pv: user.pass_hash.slice(-8), ...extra });
  ctx.res.setHeader('Set-Cookie', cookieHeader(tok, 14 * 86400, ctx.req));
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
  r.post('/api/auth/login', { auth: false }, async (ctx) => {
    const role = ctx.body.role;
    const id = toEnDigits(clampStr(ctx.body.identifier, 64));
    const pw = String(ctx.body.password || '');
    if (!['student', 'teacher', 'manager', 'admin'].includes(role)) fail(400, 'نقش کاربری نامعتبر است');
    if (!id || !pw) fail(400, 'شناسه و رمز عبور را وارد کنید');
    const t = throttle(ctx.ip, id);
    let user;
    const cleanNc = normalizeNationalCode(id);
    user = get(`SELECT * FROM users WHERE role=? AND (national_code=? OR national_code=? OR username=?)`, role, id, cleanNc || id, id);
    if (!user || !user.active || !(await verifyPasswordAsync(pw, user.pass_hash))) {
      t.failed();
      fail(401, 'نام کاربری/کد ملی یا رمز عبور اشتباه است');
    }
    t.ok();
    if (needsRehash(user.pass_hash)) {
      // به‌روزرسانی شرطی: اگر هم‌زمان نشست دیگری همین حساب را ارتقا داد، هش او حفظ می‌شود (وگرنه توکن آن نشست باطل می‌شد)
      const h = await hashPasswordAsync(pw);
      const r = run('UPDATE users SET pass_hash=? WHERE id=? AND pass_hash=?', h, user.id, user.pass_hash);
      user.pass_hash = r.changes ? h : get('SELECT pass_hash FROM users WHERE id=?', user.id).pass_hash;
    }
    setSession(ctx, user);
    return { ok: true, role: user.role };
  });

  r.post('/api/auth/logout', { auth: false, allowLocked: true }, (ctx) => {
    ctx.res.setHeader('Set-Cookie', cookieHeader('', 0, ctx.req));
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
    const out = { user: u, impersonator: ctx.impersonator, center: u.center_id ? centerOf(u.center_id) : null, today: ymd(), must_change_password: !!u.must_change_password };
    if (u.role === 'student') {
      const s = studentInfo(u.id);
      const total = totalPoints(u.id);
      out.student = s ? { grade: s.grade, class_id: s.class_id, class_name: s.class_name, school: s.school, profile_done: !!s.profile_done, avatar: s.avatar, birthday: isBirthday(s.birth_date), points: total, level: levelOf(total) } : { grade: 7, class_id: null, class_name: null, school: '', avatar: 'sprout', birthday: false, points: total, level: levelOf(total) };
      out.fee = feeStatus(u.id);
    }
    if (u.role === 'parent') out.children = all(`SELECT u.id, u.full_name, s.grade, s.avatar, c.name class_name FROM parent_children pc JOIN users u ON u.id=pc.student_id JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id WHERE pc.parent_id=? ORDER BY s.grade`, u.id);
    out.unseen = u.role === 'manager' || u.role === 'admin' ? [] : announcementsFor(u).filter((a) => !a.seen_at).reverse();
    out.unread = get('SELECT COUNT(*) n FROM messages WHERE to_id=? AND read_at IS NULL', u.id).n;
    return out;
  });

  r.post('/api/me/password', { allowLocked: true }, async (ctx) => {
    const { current, next } = ctx.body;
    const row = get('SELECT pass_hash, national_code FROM users WHERE id=?', ctx.user.id);
    // تغییر اجباری رمز اولیه: نشست همین الان با رمز اولیه ساخته شده؛ تأیید دوبارهٔ رمز فعلی (یک هش سنگین) لازم نیست
    const forced = !!ctx.user.must_change_password;
    if (!forced && !(await verifyPasswordAsync(current || '', row.pass_hash))) fail(400, 'رمز فعلی اشتباه است');
    if (!next || String(next).length < 6) fail(400, 'رمز جدید باید حداقل ۶ کاراکتر باشد');
    if (forced && row.national_code && toEnDigits(String(next)) === row.national_code) fail(400, 'رمز جدید نباید با رمز اولیه یکسان باشد');
    const h = await hashPasswordAsync(next);
    run('UPDATE users SET pass_hash=?, must_change_password=0 WHERE id=?', h, ctx.user.id); if (ctx.user) ctx.user.must_change_password = 0;
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

  // ---------- بانک کتاب‌ها و آزمون‌های هوش (Option 2) ----------
  const BOOK_ROLES = ['teacher', 'manager', 'admin'];
  r.get('/api/exam-books', { roles: BOOK_ROLES }, (ctx) => {
    if (ctx.user.role === 'admin') {
      return all('SELECT * FROM exam_books ORDER BY is_custom ASC, id ASC');
    }
    return all('SELECT * FROM exam_books WHERE center_id=? OR center_id IS NULL ORDER BY is_custom ASC, id ASC', ctx.user.center_id);
  });

  r.get('/api/exam-books/:id/topics', { roles: BOOK_ROLES }, (ctx) => {
    const id = ctx.params.id;
    const book = ctx.user.role === 'admin'
      ? get('SELECT * FROM exam_books WHERE id=?', id)
      : get('SELECT * FROM exam_books WHERE id=? AND (center_id=? OR center_id IS NULL)', id, ctx.user.center_id);
    if (!book) fail(404, 'کتاب آزمون یافت نشد');

    if (id === 'hoosh_6') {
      const p = path.join(ROOT, 'server', 'data', 'hoosh_topics.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } else if (id === 'hoosh_8_9') {
      const p = path.join(ROOT, 'server', 'data', 'hoosh_topics_8_9.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    if (book.topics_json) {
      try { return JSON.parse(book.topics_json); } catch { /* */ }
    }
    const count = book.topics_count || 10;
    const sample = [];
    for (let i = 1; i <= count; i++) {
      sample.push({
        id: i,
        title: `مبحث ${i}: فصل آزمون تحلیلی`,
        sectionId: 1,
        sectionTitle: 'سؤالات استخراج‌شده کتاب',
        chapterId: 1,
        chapterTitle: 'بخش تمرینات و آزمون‌ها',
        bookStartPage: i * 2,
        bookEndPage: i * 2 + 1,
        pageCount: 2
      });
    }
    return sample;
  });

  r.get('/api/exam-books/:id/pages/:n', { roles: BOOK_ROLES }, async (ctx) => {
    const id = ctx.params.id;
    const book = ctx.user.role === 'admin'
      ? get('SELECT * FROM exam_books WHERE id=?', id)
      : get('SELECT * FROM exam_books WHERE id=? AND (center_id=? OR center_id IS NULL)', id, ctx.user.center_id);
    if (!book) fail(404, 'کتاب آزمون یافت نشد');

    const n = Number(ctx.params.n);
    if (!Number.isInteger(n) || n < 1 || (book.pages_count && n > book.pages_count)) {
      fail(400, 'شماره صفحه نامعتبر است');
    }

    const pageFile = path.join(DATA_DIR, 'books', id, `page_${n}.jpg`);
    if (!fs.existsSync(pageFile)) {
      fail(404, 'صفحه مورد نظر یافت نشد');
    }

    ctx.handled = true;
    return await serveFile(ctx.req, ctx.res, pageFile, { priv: true });
  });

  // ---------- مشاور تحصیلی کانون (Option 3) ----------
  r.get('/api/counselor', { allowLocked: true }, (ctx) => {
    const c = get(`SELECT id, full_name, role FROM users WHERE center_id=? AND role='manager' AND active=1 ORDER BY id ASC LIMIT 1`, ctx.user.center_id);
    if (!c) return { id: null };
    return {
      id: c.id,
      full_name: c.full_name,
      role: 'counselor',
      title: 'مشاور ارشد تحصیلی و استعدادپروری',
      bio: 'پاسخگوی سوالات آموزشی، تحلیل آزمون‌های برپا، هدایت تحصیلی و حل چالش‌های یادگیری شما',
      center_id: ctx.user.center_id
    };
  });
  r.get('/api/counselor/quick-chips', { allowLocked: true }, () => [
    { id: 1, label: 'برنامه‌ریزی برای آزمون برپا', prompt: 'سلام استاد، لطفاً برای برنامه‌ریزی آزمون جامع مرحله بعد راهنمایی‌ام کنید.' },
    { id: 2, label: 'روش مطالعه و تست‌زنی هوش', prompt: 'سلام، برای مباحث هوش تحلیلی و کلامی چه روش تمرین و تست‌زنی را پیشنهاد می‌کنید؟' },
    { id: 3, label: 'افت نمرات مستمر و بی‌انگیزگی', prompt: 'استاد، اخیراً احساس خستگی و افت نمره در کلاس‌ها دارم، چطور انگیزه پیدا کنم؟' },
    { id: 4, label: 'درخواست مشاوره آنلاین / تلفنی', prompt: 'سلام و احترام، مایل هستم یک جلسه مشاوره تحصیلی برای بررسی روند پیشرفت داشته باشم.' }
  ]);

  // ---------- کارنامه رسمی آزمون جامع «طرح برپا» (Option 9) ----------
  r.get('/api/barpa-exams/reports', { allowLocked: true }, (ctx) => {
    let rows;
    const cols = 'id, center_id, exam_id, exam_title, grade, student_id, candidate_code, student_name, school_name, total_attendees, overall_traz, overall_rank_all, overall_rank_center, overall_percentage, overall_correct, overall_wrong, overall_unanswered, total_questions, subjects_json, categories_json, created_at';
    if (ctx.user.role === 'student') {
      rows = all(`SELECT ${cols} FROM comprehensive_exam_reports WHERE student_id=? ORDER BY id DESC`, ctx.user.id);
    } else if (ctx.user.role === 'parent') {
      const children = all('SELECT student_id FROM parent_children WHERE parent_id=?', ctx.user.id).map((x) => x.student_id);
      if (!children.length) return [];
      rows = all(`SELECT ${cols} FROM comprehensive_exam_reports WHERE student_id IN (${children.map(() => '?').join(',')}) ORDER BY id DESC`, ...children);
    } else if (ctx.user.role === 'admin') {
      rows = all(`SELECT r.id, r.center_id, r.exam_id, r.exam_title, r.grade, r.student_id, r.candidate_code, u.full_name student_name, r.school_name, r.total_attendees, r.overall_traz, r.overall_rank_all, r.overall_rank_center, r.overall_percentage, r.overall_correct, r.overall_wrong, r.overall_unanswered, r.total_questions, r.subjects_json, r.categories_json, r.created_at, u.mobile FROM comprehensive_exam_reports r JOIN users u ON u.id=r.student_id ORDER BY r.overall_traz DESC`);
    } else {
      // teacher and manager: only their center
      rows = all(`SELECT r.id, r.center_id, r.exam_id, r.exam_title, r.grade, r.student_id, r.candidate_code, u.full_name student_name, r.school_name, r.total_attendees, r.overall_traz, r.overall_rank_all, r.overall_rank_center, r.overall_percentage, r.overall_correct, r.overall_wrong, r.overall_unanswered, r.total_questions, r.subjects_json, r.categories_json, r.created_at, u.mobile FROM comprehensive_exam_reports r JOIN users u ON u.id=r.student_id WHERE r.center_id=? ORDER BY r.overall_traz DESC`, ctx.user.center_id);
    }
    return rows.map((r) => ({
      ...r,
      subjects: JSON.parse(r.subjects_json || '[]'),
      categories: JSON.parse(r.categories_json || '[]')
    }));
  });

  r.get('/api/barpa-exams/reports/:id', { allowLocked: true }, (ctx) => {
    const row = get('SELECT * FROM comprehensive_exam_reports WHERE id=?', Number(ctx.params.id));
    if (!row) fail(404, 'کارنامه آزمون جامع یافت نشد');
    if (ctx.user.role === 'student' && row.student_id !== ctx.user.id) {
      fail(403, 'دسترسی غیرمجاز به این کارنامه');
    }
    if (ctx.user.role === 'parent') {
      const allowed = all('SELECT student_id FROM parent_children WHERE parent_id=?', ctx.user.id).map((x) => x.student_id);
      if (!allowed.includes(row.student_id)) fail(403, 'دسترسی غیرمجاز به کارنامه');
    }
    if (ctx.user.role === 'teacher' || ctx.user.role === 'manager') {
      if (row.center_id !== ctx.user.center_id) fail(403, 'دسترسی غیرمجاز به این کارنامه');
    }
    return {
      ...row,
      subjects: JSON.parse(row.subjects_json || '[]'),
      categories: JSON.parse(row.categories_json || '[]'),
      answers: JSON.parse(row.answers_json || '[]')
    };
  });
}
