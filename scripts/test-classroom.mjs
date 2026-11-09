// تست یکپارچگی «کلاس‌های آنلاین»: یک سرور ساختگی کلاس آنلاین که دقیقاً همان قرارداد امضای HMAC را اعتبارسنجی می‌کند
// (پنجرهٔ ±۳۰۰ ثانیه، CLASS_NOT_LIVE، ۴۰۴ برای دانش‌آموز همگام‌نشده) و سرور واقعی پنل با دادهٔ نمونهٔ موقت.
// هیچ‌چیز به Production یا داده‌های واقعی وصل نمی‌شود.  اجرا: node scripts/test-classroom.mjs
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(48).toString('base64url');
const CLASS_LIVE = '11111111-1111-4111-8111-111111111111', CLASS_SOON = '22222222-2222-4222-8222-222222222222';

// ---------- سرور ساختگی کلاس آنلاین ----------
const synced = new Map(), removed = new Set(), log = [];
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    const send = (st, obj) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const ts = req.headers['x-panel-timestamp'], sig = req.headers['x-panel-signature'];
    const expected = crypto.createHmac('sha256', SECRET).update(`${ts}\n${req.method}\n${req.url}\n${raw}`).digest('hex');
    if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300 || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      log.push(['401', req.method, req.url]); return send(401, { code: 'UNAUTHORIZED' });
    }
    log.push([req.method, req.url]);
    const base = '/api/v1/integrations/kanoon/panel';
    if (req.method === 'POST' && req.url === `${base}/students/sync`) {
      const { students } = JSON.parse(raw); let created = 0, updated = 0;
      assert.ok(students.length >= 1 && students.length <= 200);
      for (const s of students) {
        assert.match(s.externalId, /^[A-Za-z0-9_.:-]{1,64}$/); assert.ok(s.name.length >= 2 && s.name.length <= 80);
        if (s.grade != null) assert.ok(s.grade >= 4 && s.grade <= 9);
        assert.equal(typeof s.active, 'boolean');
        if (s.classId != null) { assert.match(s.classId, /^[A-Za-z0-9_.:-]{1,64}$/); assert.ok(s.className.length >= 1 && s.className.length <= 80); }
        synced.has(s.externalId) ? updated++ : created++; synced.set(s.externalId, s);
      }
      return send(200, { created, updated, disabled: 0 });
    }
    if (req.method === 'POST' && req.url === `${base}/students/remove`) {
      const { externalIds } = JSON.parse(raw);
      assert.ok(Array.isArray(externalIds) && externalIds.length >= 1 && externalIds.length <= 200);
      for (const id of externalIds) { removed.add(id); synced.delete(id); }
      return send(200, { disabled: externalIds.length });
    }
    let m = req.method === 'GET' && req.url.match(new RegExp(`^${base}/students/([^/]+)/classes$`));
    if (m) {
      if (!synced.has(m[1])) return send(404, { code: 'NOT_FOUND' });
      return send(200, [
        { classId: CLASS_LIVE, title: 'ریاضی زنده', subject: 'ریاضی', topic: 'کسر', grade: 6, teacherName: 'خانم نمونه', scheduledAt: new Date().toISOString(), durationMinutes: 45, live: true },
        { classId: CLASS_SOON, title: 'علوم', subject: 'علوم', topic: null, grade: 6, teacherName: 'آقای نمونه', scheduledAt: new Date(Date.now() + 864e5).toISOString(), durationMinutes: 40, live: false },
      ]);
    }
    m = req.method === 'POST' && req.url.match(new RegExp(`^${base}/students/([^/]+)/join-ticket$`));
    if (m) {
      if (!synced.has(m[1])) return send(404, { code: 'NOT_FOUND' });
      const { classId } = JSON.parse(raw);
      if (classId === CLASS_SOON) return send(409, { code: 'CLASS_NOT_LIVE' });
      if (classId !== CLASS_LIVE) return send(404, { code: 'NOT_FOUND' });
      return send(200, { url: `http://class.test.invalid/sso?ticket=${crypto.randomBytes(32).toString('base64url')}`, expiresIn: 90 });
    }
    send(404, { code: 'NOT_FOUND' });
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockBase = `http://127.0.0.1:${mock.address().port}/api/v1`;

// ---------- پنل واقعی با داده موقت ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-cls-'));
const PORT = 4500 + Math.floor(Math.random() * 400);
const baseEnv = { ...process.env, ROSHD_DATA_DIR: path.join(tmp, 'data'), ROSHD_UPLOAD_DIR: path.join(tmp, 'up'), PORT: String(PORT), CLASSROOM_API: mockBase, KANOON_PANEL_SECRET: SECRET };
assert.equal(spawnSync(process.execPath, ['server/seed.js'], { cwd: ROOT, env: baseEnv }).status, 0, 'seed');
const B = `http://127.0.0.1:${PORT}`;
const start = async (env) => {
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) return p; } catch { /* هنوز بالا نیامده */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error('server not up');
};
const stop = (p) => new Promise((r) => { p.once('exit', r); p.kill(); });
let app = await start(baseEnv);
let pass = 0;
const check = (n, ok, x = '') => { if (ok) pass++; else { console.log(`  ✗ ${n} ${x}`); process.exitCode = 1; } };
const login = async (role, id) => {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role, identifier: id, password: '123456' }) });
  return r.headers.get('set-cookie')?.split(';')[0];
};
const call = (ck, method, p, body) => fetch(B + p, { method, headers: { ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) }, body: body ? JSON.stringify(body) : undefined });
const ncOk = (b) => { const c = b + String((() => { const s = [...b].reduce((a, d, i) => a + Number(d) * (10 - i), 0) % 11; return s < 2 ? s : 11 - s; })()); return c; };
const NC = ncOk('123456789');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const stu = await login('student', 'student'), mgr = await login('manager', 'manager');
  check('ورود دانش‌آموز و مدیر', !!stu && !!mgr);
  const db = new DatabaseSync(path.join(baseEnv.ROSHD_DATA_DIR, 'roshd.db'), { readOnly: true });
  const me = db.prepare("SELECT id FROM users WHERE username='student'").get().id;

  check('بدون ورود ۴۰۱', (await call(null, 'GET', '/api/student/online-classes')).status === 401);
  check('مدیر به مسیر دانش‌آموز ۴۰۳', (await call(mgr, 'GET', '/api/student/online-classes')).status === 403);

  // فهرست: دانش‌آموز همگام‌نشده → همگام‌سازی خودکار و تلاش دوباره؛ شناسه فقط از نشست (پارامتر کلاینت نادیده گرفته می‌شود)
  let r = await call(stu, 'GET', '/api/student/online-classes?studentId=999&externalId=999');
  const d = await r.json();
  check('فهرست ۲۰۰ و فعال', r.status === 200 && d.enabled === true && d.classes.length === 2, JSON.stringify(d));
  check('همگام‌سازی خودکار با شناسهٔ نشست', synced.has(String(me)) && !synced.has('999'));
  check('هر درخواست امضای معتبر داشت', !log.some((l) => l[0] === '401'));
  check('نام و پایه همگام شد', synced.get(String(me))?.name?.length >= 2);

  r = await call(stu, 'POST', `/api/student/online-classes/${CLASS_LIVE}/join`, {});
  const j = await r.json();
  check('ورود به کلاس زنده → url بلیت', r.status === 200 && /\/sso\?ticket=[\w-]{40,}$/.test(j.url), JSON.stringify(j));

  r = await call(stu, 'POST', `/api/student/online-classes/${CLASS_SOON}/join`, {});
  const n = await r.json();
  check('CLASS_NOT_LIVE → ۴۰۹ با پیام فارسی', r.status === 409 && /شروع نشده/.test(n.error), JSON.stringify(n));
  check('کلاس ناشناس ۴۰۴', (await call(stu, 'POST', '/api/student/online-classes/33333333-3333-4333-8333-333333333333/join', {})).status === 404);
  const before = log.length;
  check('شناسهٔ کلاس بد ۴۰۴ بدون تماس با سرور', (await call(stu, 'POST', '/api/student/online-classes/..%2Fx/join', {})).status === 404 && log.length === before);

  // همگام‌سازی هنگام ایجاد/ویرایش دانش‌آموز توسط مدیر
  const cls = db.prepare('SELECT id, grade FROM classes WHERE center_id=1 LIMIT 1').get();
  r = await call(mgr, 'POST', '/api/manager/students', { full_name: 'تست همگام', national_code: NC, grade: cls.grade, class_id: cls.id });
  const created = await r.json();
  await sleep(1500);
  check('دانش‌آموز جدید به کلاس آنلاین همگام شد', r.status === 200 && synced.has(String(created.id)), `${r.status} ${JSON.stringify(created)}`);
  await call(mgr, 'PUT', `/api/manager/students/${created.id}`, { full_name: 'تست همگام ویرایش', national_code: NC, grade: cls.grade, class_id: cls.id });
  await sleep(1500);
  check('ویرایش دانش‌آموز همگام شد', synced.get(String(created.id))?.name === 'تست همگام ویرایش', synced.get(String(created.id))?.name);
  // کلاس پنل: شناسه و نام نمایشی کلاس همراه دانش‌آموز می‌رود و با جابه‌جایی به‌روز می‌شود
  const sc1 = synced.get(String(created.id));
  check('کلاس پنل و فعال‌بودن همراه دانش‌آموز رفت', sc1?.classId === String(cls.id) && /^(چهارم|پنجم|ششم|هفتم|هشتم|نهم) /.test(sc1?.className || '') && sc1?.active === true, JSON.stringify(sc1));
  const other = db.prepare('SELECT id, grade, name FROM classes WHERE center_id=1 AND id<>? LIMIT 1').get(cls.id);
  const mv = await call(mgr, 'POST', '/api/manager/students/move', { ids: [created.id], class_id: other.id });
  await sleep(1500);
  check('جابه‌جایی به کلاس دیگر همگام شد', mv.status === 200 && synced.get(String(created.id))?.classId === String(other.id), JSON.stringify(synced.get(String(created.id))));
  const dist = await call(mgr, 'POST', '/api/manager/classes/split-gender', {});
  await sleep(2500);
  check('تقسیم جنسیتی کلاس‌ها همگام شد', dist.status === 200 && [...synced.values()].some((x) => x.className && /ب$/.test(x.className)), String(dist.status));
  // حذف: درخواست حذف به کلاس آنلاین می‌رود و از صف پاک می‌شود
  const del1 = await call(mgr, 'DELETE', `/api/manager/students/${created.id}`);
  await sleep(1500);
  check('حذف دانش‌آموز به کلاس آنلاین اعلام شد', del1.status === 200 && removed.has(String(created.id)));
  db.close();
  const q = (sql, ...a) => { const d2 = new DatabaseSync(path.join(baseEnv.ROSHD_DATA_DIR, 'roshd.db'), { readOnly: true }); try { return d2.prepare(sql).get(...a); } finally { d2.close(); } };
  check('صف حذف پس از ارسال موفق خالی است', q('SELECT COUNT(*) n FROM classroom_removals').n === 0);

  // راز اشتباه: کلاس ۴۰۱ می‌دهد → پنل ۵۰۲ با پیام فارسی و بدون افشای جزئیات
  await stop(app);
  app = await start({ ...baseEnv, KANOON_PANEL_SECRET: crypto.randomBytes(48).toString('base64url') });
  r = await call(await login('student', 'student'), 'GET', '/api/student/online-classes');
  const bad = await r.json();
  check('راز اشتباه → ۵۰۲ و پیام فارسی', r.status === 502 && /ارتباط/.test(bad.error) && !/401|signature/i.test(bad.error), JSON.stringify(bad));

  // قطع ارتباط
  await stop(app);
  app = await start({ ...baseEnv, CLASSROOM_API: 'http://127.0.0.1:9/api/v1', CLASSROOM_TIMEOUT_MS: '2000' });
  r = await call(await login('student', 'student'), 'POST', `/api/student/online-classes/${CLASS_LIVE}/join`, {});
  check('قطع ارتباط → ۵۰۲ و پیام فارسی', r.status === 502 && /ارتباط/.test((await r.json()).error));
  // حذف هنگام قطع ارتباط: در صف ماندگار می‌ماند و بعداً با همگام‌سازی دستی ارسال می‌شود
  const mgr2 = await login('manager', 'manager');
  const victim = await (await call(mgr2, 'POST', '/api/manager/students', { full_name: 'قربانی صف', national_code: ncOk('223456789'), grade: cls.grade, class_id: cls.id })).json();
  const del2 = await call(mgr2, 'DELETE', `/api/manager/students/${victim.id}`);
  await sleep(3500);
  check('حذف هنگام قطع ارتباط انجام شد و در صف ماند', del2.status === 200 && q('SELECT COUNT(*) n FROM classroom_removals WHERE ext_id=?', String(victim.id)).n === 1);
  await stop(app);
  app = await start(baseEnv);
  const mgr3 = await login('manager', 'manager');
  const st3 = await (await call(mgr3, 'GET', '/api/manager/classroom/status')).json();
  check('وضعیت اتصال: فعال و یک حذف در صف', st3.enabled === true && st3.pending_removals === 1, JSON.stringify(st3));
  const fs3 = await call(mgr3, 'POST', '/api/manager/classroom/sync', {});
  const fsj = await fs3.json();
  check('همگام‌سازی دستی، صف حذف را خالی کرد', fs3.status === 200 && fsj.removed === 1 && removed.has(String(victim.id)) && q('SELECT COUNT(*) n FROM classroom_removals').n === 0, JSON.stringify(fsj));
  const stu5 = await login('student', 'student');
  check('مدیر فقط: دانش‌آموز به همگام‌سازی دسترسی ندارد', (await call(stu5, 'POST', '/api/manager/classroom/sync', {})).status === 403);

  // تنظیم‌نشده → خاموش
  await stop(app);
  const off = { ...baseEnv }; delete off.CLASSROOM_API; delete off.KANOON_PANEL_SECRET;
  app = await start(off);
  const stu4 = await login('student', 'student');
  const o = await (await call(stu4, 'GET', '/api/student/online-classes')).json();
  check('بدون env → enabled=false', o.enabled === false && o.classes.length === 0);
  check('بدون env ورود → ۵۰۳', (await call(stu4, 'POST', `/api/student/online-classes/${CLASS_LIVE}/join`, {})).status === 503);

  // اسکریپت همگام‌سازی دستی
  synced.clear();
  // async لازم است: سرور ساختگی در همین پردازه است و spawnSync حلقهٔ رویداد را قفل می‌کند
  const sc = await new Promise((res) => { const c = spawn(process.execPath, ['scripts/sync-classroom.mjs'], { cwd: ROOT, env: baseEnv }); let stdout = '', stderr = ''; c.stdout.on('data', (x) => { stdout += x; }); c.stderr.on('data', (x) => { stderr += x; }); c.on('exit', (status) => res({ status, stdout, stderr })); });
  check('اسکریپت sync-classroom موفق', sc.status === 0 && synced.size > 5, `${sc.status} ${sc.stdout}${sc.stderr}`);
  console.log(sc.stdout.trim());
} finally {
  await stop(app).catch(() => {}); mock.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} بررسی موفق${process.exitCode ? ' — شکست دارد' : ' — همه موفق'}`);
