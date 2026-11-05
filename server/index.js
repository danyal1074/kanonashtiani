// نقطه ورود سرور «پلتفرم رشد نخبه»
import './env.js'; // باید اول باشد (اندازه استخر نخ‌ها)
import http from 'node:http';
import path from 'node:path';
import { ROOT, UPLOAD_DIR, get, db, closeDb } from './db.js';
import { Router, parseCookies, readBody, sendJson, serveFile, safeJoin, clientIp, isHttps, COOKIE } from './http.js';
import { HttpError, readToken } from './util.js';
import { feeStatus, runPenaltyJob } from './logic.js';
import { metrics, snapshot } from './metrics.js';
import { allow, purge as purgeBuckets } from './ratelimit.js';
import { backupTick } from './backup.js';
import registerCommon from './routes/common.js';
import registerStudent from './routes/student.js';
import registerTeacher from './routes/teacher.js';
import registerManager from './routes/manager.js';
import registerAdmin from './routes/admin.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.ROSHD_HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(ROOT, 'public');
const SLOW_MS = Number(process.env.ROSHD_SLOW_MS || 800);
const LOG_ALL = process.env.ROSHD_LOG === '1';
// سقف نرخ هر کاربر: ۶۰ درخواست پشت‌سرهم و ۸ درخواست در ثانیه در حالت پایدار (کاربر عادی بسیار کمتر مصرف می‌کند)
const USER_LIMIT = { burst: Number(process.env.ROSHD_USER_BURST || 60), perSecond: Number(process.env.ROSHD_USER_RPS || 8) };
// درخواست‌های بدون ورود (صفحه ورود، فروشگاه عمومی): سقف سخاوتمندانه، چون صدها دانش‌آموز ممکن است پشت یک آی‌پی مدرسه باشند.
// مقابله با حدس رمز با شمارنده تلاش ناموفق ورود انجام می‌شود، نه با سقف تعداد درخواست.
const IP_LIMIT = { burst: Number(process.env.ROSHD_IP_BURST || 3000), perSecond: Number(process.env.ROSHD_IP_RPS || 300) };
const ALLOWED_ORIGINS = new Set((process.env.ROSHD_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' https: data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

const router = new Router();
[registerCommon, registerStudent, registerTeacher, registerManager, registerAdmin].forEach((r) => r(router));
router.get('/api/health', { auth: false }, () => {
  get('SELECT 1 x'); // اتصال به پایگاه داده زنده است
  return { ok: true, uptime_s: Math.round((Date.now() - metrics.started) / 1000) };
});

function loadUser(req) {
  const tok = parseCookies(req.headers.cookie)[COOKIE];
  const p = readToken(tok);
  if (!p) return {};
  const user = get('SELECT id, center_id, role, username, national_code, mobile, full_name, gender, active, pass_hash, must_change_password, (SELECT profile_done FROM students WHERE user_id=users.id) profile_done FROM users WHERE id=?', p.uid);
  if (!user || !user.active || user.role === 'parent') return {};
  // اعتبار توکن پس از تغییر رمز از بین می‌رود
  if (p.pv && p.pv !== user.pass_hash.slice(-8)) return {};
  delete user.pass_hash;
  const impersonator = p.imp ? get('SELECT id, full_name FROM users WHERE id=? AND role=?', p.imp, 'admin') : null;
  return { user, impersonator };
}

// جلوگیری از CSRF: کوکی SameSite=Lax است؛ علاوه بر آن مبدأ درخواست و نوع محتوا نیز بررسی می‌شود.
function checkUnsafeRequest(req) {
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    let host; try { host = new URL(origin).host; } catch { throw new HttpError(403, 'مبدأ درخواست نامعتبر است'); }
    if (host !== req.headers.host && !ALLOWED_ORIGINS.has(origin)) throw new HttpError(403, 'درخواست از مبدأ غیرمجاز');
  }
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
  if (hasBody && !/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'نوع محتوا باید JSON باشد');
}

function setSecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}

async function handle(req, res) {
  const t0 = performance.now();
  metrics.requests++;
  if (++metrics.inflight > metrics.peakInflight) metrics.peakInflight = metrics.inflight;
  let tag = '';
  res.on('close', () => {
    metrics.inflight--;
    const ms = performance.now() - t0;
    if (res.statusCode >= 500) metrics.errors5xx++;
    if (ms > SLOW_MS) metrics.slow++;
    if (LOG_ALL && tag || ms > SLOW_MS || res.statusCode >= 500) console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: tag || req.url.split('?')[0], s: res.statusCode, ms: Math.round(ms) }));
  });
  setSecurityHeaders(req, res);

  try {
    let url, pathname;
    try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'آدرس نامعتبر است'); }

    if (pathname.startsWith('/api/')) {
      tag = pathname;
      const method = req.method;
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new HttpError(405, 'روش مجاز نیست');
      const m = router.match(method, pathname);
      if (!m) throw new HttpError(404, 'مسیر یافت نشد');
      const { route, params } = m;
      const { user, impersonator } = loadUser(req);
      const ip = clientIp(req);
      const lim = allow(user ? `u${user.id}` : `ip${ip}`, user ? USER_LIMIT : IP_LIMIT);
      if (!lim.ok) { metrics.rateLimited++; res.setHeader('Retry-After', String(lim.retryAfter)); throw new HttpError(429, 'درخواست‌های شما زیاد است؛ چند ثانیه صبر کنید'); }
      if (method !== 'GET') checkUnsafeRequest(req);
      if (route.auth !== false && !user) throw new HttpError(401, 'لطفاً دوباره وارد شوید');
      if (route.roles && !route.roles.includes(user.role)) throw new HttpError(403, 'به این بخش دسترسی ندارید');
      if (user?.role === 'student' && user.must_change_password && route.auth !== false && pathname !== '/api/me' && pathname !== '/api/me/password') {
        throw new HttpError(428, 'لطفاً ابتدا رمز عبور خود را تغییر دهید');
      }
      if (user?.role === 'student' && user.profile_done === 0 && route.auth !== false && !['/api/me', '/api/me/password', '/api/student/complete-profile'].includes(pathname)) {
        throw new HttpError(428, 'لطفاً ابتدا اطلاعات پروفایل خود را تکمیل کنید');
      }
      if (user?.role === 'student' && route.auth !== false && !route.allowLocked && feeStatus(user.id)?.locked) {
        throw new HttpError(423, 'پنل شما به دلیل پرداخت نشدن حق عضویت قفل است');
      }
      const ctx = {
        req, res, user, impersonator, params, query: Object.fromEntries(url.searchParams),
        body: method !== 'GET' ? await readBody(req, pathname === '/api/admin/restore' ? 300 * 1024 * 1024 : (pathname.includes('/barpa-exams/upload') ? 50 * 1024 * 1024 : undefined)) : {},
        ip, handled: false,
      };
      const out = await route.handler(ctx);
      if (!ctx.handled) sendJson(res, 200, out ?? { ok: true });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'روش مجاز نیست');

    if (pathname.startsWith('/uploads/')) {
      // فایل‌های بارگذاری‌شده فقط برای کاربران واردشده؛ بدون اجرای اسکریپت (sandbox)
      if (!loadUser(req).user) throw new HttpError(401, 'دسترسی غیرمجاز');
      const f = safeJoin(UPLOAD_DIR, pathname.slice('/uploads/'.length));
      if (!f) throw new HttpError(400, 'مسیر نامعتبر');
      return await serveFile(req, res, f, { download: url.searchParams.get('dl'), sandbox: true, priv: true });
    }

    res.setHeader('Content-Security-Policy', CSP);
    const file = safeJoin(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (file && path.extname(file)) return await serveFile(req, res, file);
    return await serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(`[${req.method} ${tag || req.url}]`, e);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'خطای داخلی سرور' : e.message });
    else res.destroy();
  }
}

const server = http.createServer(handle);
server.keepAliveTimeout = 65_000;   // بیشتر از Nginx تا اتصال‌ها زودتر از پروکسی بسته نشوند
server.headersTimeout = 70_000;
server.requestTimeout = 600_000;
server.on('clientError', (err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });

server.listen(PORT, HOST, () => {
  console.log(`پلتفرم رشد نخبه روی http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} اجرا شد (نخ‌های کمکی: ${process.env.UV_THREADPOOL_SIZE})`);
  if (!get('SELECT COUNT(*) n FROM users').n) console.warn('پایگاه داده خالی است؛ برای ساخت داده نمونه دستور «npm run seed» را اجرا کنید.');
});

// ---------- کارهای زمان‌بندی‌شده (همه با try/catch تا خطا سرور را نیندازد) ----------
const safe = (name, fn) => () => { try { return fn(); } catch (e) { console.error(`[${name}]`, e); } };
const timers = [
  setInterval(safe('penalty', () => { const n = runPenaltyJob(); if (n) console.log(`امتیاز منفی خودکار: ${n} مورد`); }), 10 * 60e3),
  setInterval(safe('backup', () => { const b = backupTick(); if (b) console.log(`پشتیبان خودکار: ${b.name}`); }), 60e3),
  setInterval(safe('wal', () => db.exec('PRAGMA wal_checkpoint(PASSIVE)')), 30 * 60e3),
  setInterval(safe('optimize', () => db.exec('PRAGMA optimize')), 6 * 3600e3),
  setInterval(safe('purge', () => purgeBuckets()), 60e3),
  setInterval(safe('metrics', () => { const s = snapshot({ reset: true }); if (s.event_loop_ms.p99 > 250) console.warn('تأخیر حلقه رویداد بالاست', JSON.stringify(s.event_loop_ms)); }), 60e3),
];
timers.forEach((t) => t.unref());
setTimeout(safe('penalty', () => runPenaltyJob()), 3000).unref();

// ---------- خاموش شدن تمیز و ثبت خطاهای پیش‌بینی‌نشده ----------
let closing = false;
function shutdown(reason, code = 0) {
  if (closing) return;
  closing = true;
  console.log(`خاموش شدن (${reason})…`);
  const done = () => { try { closeDb(); } catch (e) { console.error(e); } process.exit(code); };
  server.close(done);
  server.closeIdleConnections?.();
  setTimeout(() => { server.closeAllConnections?.(); done(); }, 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); shutdown('خطای پیش‌بینی‌نشده', 1); });
process.on('unhandledRejection', (e) => { console.error('unhandledRejection', e); });
