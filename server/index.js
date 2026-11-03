// نقطه ورود سرور «پلتفرم رشد نخبه»
import http from 'node:http';
import path from 'node:path';
import { ROOT, UPLOAD_DIR, get } from './db.js';
import { Router, parseCookies, readBody, sendJson, sendFile, safeJoin, COOKIE } from './http.js';
import { HttpError, readToken } from './util.js';
import { feeStatus, runPenaltyJob } from './logic.js';
import registerCommon from './routes/common.js';
import registerStudent from './routes/student.js';
import registerTeacher from './routes/teacher.js';
import registerManager from './routes/manager.js';
import registerParent from './routes/parent.js';
import registerAdmin from './routes/admin.js';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(ROOT, 'public');


const router = new Router();
[registerCommon, registerStudent, registerTeacher, registerManager, registerParent, registerAdmin].forEach((r) => r(router));

function loadUser(req) {
  const tok = parseCookies(req.headers.cookie)[COOKIE];
  const p = readToken(tok);
  if (!p) return {};
  const user = get('SELECT id, center_id, role, username, national_code, mobile, full_name, gender, active, pass_hash FROM users WHERE id=?', p.uid);
  if (!user || !user.active) return {};
  // اعتبار توکن پس از تغییر رمز از بین می‌رود
  if (p.pv && p.pv !== user.pass_hash.slice(-8)) return {};
  delete user.pass_hash;
  const impersonator = p.imp ? get('SELECT id, full_name FROM users WHERE id=? AND role=?', p.imp, 'admin') : null;
  return { user, impersonator };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');

  try {
    if (pathname.startsWith('/api/')) {
      const m = router.match(req.method, pathname);
      if (!m) throw new HttpError(404, 'مسیر یافت نشد');
      const { route, params } = m;
      const { user, impersonator } = loadUser(req);
      if (route.auth !== false && !user) throw new HttpError(401, 'لطفاً دوباره وارد شوید');
      if (route.roles && !route.roles.includes(user.role)) throw new HttpError(403, 'به این بخش دسترسی ندارید');
      if (user?.role === 'student' && route.auth !== false && !route.allowLocked && feeStatus(user.id)?.locked) {
        throw new HttpError(423, 'پنل شما به دلیل پرداخت نشدن حق عضویت قفل است');
      }
      const ctx = {
        req, res, user, impersonator, params, query: Object.fromEntries(url.searchParams),
        body: ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req, pathname === '/api/admin/restore' ? 300 * 1024 * 1024 : undefined) : {},
        ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress,
        handled: false,
      };
      const out = await route.handler(ctx);
      if (!ctx.handled) sendJson(res, 200, out ?? { ok: true });
      return;
    }
    if (pathname.startsWith('/uploads/')) {
      // فایل‌های بارگذاری‌شده فقط برای کاربران واردشده
      if (!loadUser(req).user) throw new HttpError(401, 'دسترسی غیرمجاز');
      const f = safeJoin(UPLOAD_DIR, pathname.slice('/uploads/'.length));
      if (!f) throw new HttpError(400, 'مسیر نامعتبر');
      return sendFile(res, f, { download: url.searchParams.get('dl') });
    }
    const file = safeJoin(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (file && path.extname(file)) return sendFile(res, file, { cache: /\/(fonts|vendor)\//.test(pathname) });
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'خطای داخلی سرور' : e.message });
  }
});

server.listen(PORT, () => {
  console.log(`🌱 پلتفرم رشد نخبه روی http://localhost:${PORT} اجرا شد`);
  if (!get('SELECT COUNT(*) n FROM users').n) console.warn('⚠️ پایگاه داده خالی است؛ برای ساخت داده نمونه و حساب‌ها دستور «npm run seed» را اجرا کنید.');
});

// جریمه‌های خودکار: هنگام شروع و هر ۱۰ دقیقه
const job = () => { try { const n = runPenaltyJob(); if (n) console.log(`امتیاز منفی خودکار: ${n} مورد`); } catch (e) { console.error('penalty job', e); } };
setTimeout(job, 2000);
setInterval(job, 10 * 60 * 1000);
