// تست دودی: سرور موقت با داده نمونه، بررسی دسترسی هر نقش و چند جریان اصلی.  اجرا: npm run smoke
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-smoke-'));
const PORT = 3951;
const env = { ...process.env, ROSHD_DATA_DIR: path.join(tmp, 'data'), ROSHD_UPLOAD_DIR: path.join(tmp, 'up'), PORT: String(PORT) };
if (spawnSync(process.execPath, ['server/seed.js'], { cwd: ROOT, env }).status !== 0) { console.error('ساخت داده نمونه ناموفق'); process.exit(1); }
const app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
const B = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* هنوز بالا نیامده */ } await new Promise((r) => setTimeout(r, 200)); }

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; if (!ok) console.log(`  ✗ ${name} ${extra}`); };
async function login(role, id) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, identifier: id, password: '123456' }) });
  return { status: r.status, ck: r.headers.get('set-cookie')?.split(';')[0] };
}
const call = (ck, method, p, body) => fetch(B + p, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

const S = { student: await login('student', 'student'), teacher: await login('teacher', 'teacher'), manager: await login('manager', 'manager'), parent: await login('parent', '09120000000'), admin: await login('admin', 'admin'), locked: await login('student', 'student9') };
for (const [k, v] of Object.entries(S)) check(`ورود ${k}`, v.status === 200, v.status);
check('رمز اشتباه رد می‌شود', (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', identifier: 'student', password: 'x' }) })).status === 401);
check('نقش اشتباه رد می‌شود', (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'manager', identifier: 'student', password: '123456' }) })).status === 401);

// ماتریس دسترسی: هر نقش فقط به مسیر خودش
const AREAS = { student: '/api/student/dashboard', teacher: '/api/teacher/overview', manager: '/api/manager/dashboard', admin: '/api/admin/overview', parent: '/api/parent/children/995' };
for (const [role, s] of Object.entries(S)) {
  if (role === 'locked') continue;
  for (const [area, p] of Object.entries(AREAS)) {
    const r = await call(s.ck, 'GET', p);
    const want = area === role ? 200 : 403;
    check(`${role} → ${area}`, r.status === want, `انتظار ${want} گرفت ${r.status}`);
  }
}
for (const [area, p] of Object.entries(AREAS)) check(`بدون ورود → ${area}`, (await call(null, 'GET', p)).status === 401);

// قفل پنل دانش‌آموز بدهکار: داشبورد قفل، پرداخت باز
check('پنل قفل‌شده: داشبورد ۴۲۳', (await call(S.locked.ck, 'GET', '/api/student/dashboard')).status === 423);
check('پنل قفل‌شده: صفحه پرداخت باز است', (await call(S.locked.ck, 'GET', '/api/student/payment')).status === 200);
check('پنل قفل‌شده: اطلاعیه‌ها باز است', (await call(S.locked.ck, 'GET', '/api/announcements')).status === 200);

// والد فقط فرزند خودش
check('والد: فرزند دیگران ممنوع', (await call(S.parent.ck, 'GET', '/api/parent/children/1')).status === 403);
// معلم فقط دانش‌آموز کلاس خودش
const other = (await call(S.manager.ck, 'GET', '/api/manager/students?grade=4&limit=1')).data.rows[0];
check('معلم: دانش‌آموز کلاس دیگر ممنوع', (await call(S.teacher.ck, 'GET', `/api/teacher/students/${other.id}`)).status === 403);
// پیام‌رسان: فقط مخاطب مجاز
check('پیام به مخاطب غیرمجاز ممنوع', (await call(S.student.ck, 'POST', '/api/messages', { to: other.id, body: 'سلام' })).status === 403);

// جریان آزمون: شروع، ارسال، جلوگیری از تکرار
const ex = (await call(S.student.ck, 'GET', '/api/student/exams')).data.find((e) => e.percent == null);
const st = await call(S.student.ck, 'POST', `/api/student/exams/${ex.id}/start`);
check('شروع آزمون', st.status === 200 && st.data.questions.length > 0);
check('کلید پاسخ به دانش‌آموز نمی‌رسد', st.data.questions.every((q) => !('answer' in q)));
const sub = await call(S.student.ck, 'POST', `/api/student/exams/${ex.id}/submit`, { answers: st.data.questions.map(() => 0) });
check('ارسال آزمون و کارنامه', sub.status === 200 && typeof sub.data.percent === 'number');
check('ارسال دوباره آزمون رد می‌شود', (await call(S.student.ck, 'POST', `/api/student/exams/${ex.id}/submit`, { answers: [] })).status === 400);

// ثبت‌نام دانش‌آموز و ورود با رمز اولیه
const nc = (() => { const d = [3, 1, 4, 1, 5, 9, 2, 6, 5]; const s = d.reduce((a, x, i) => a + x * (10 - i), 0) % 11; return d.join('') + (s < 2 ? s : 11 - s); })();
const created = await call(S.manager.ck, 'POST', '/api/manager/students', { full_name: 'تست دودی', national_code: nc, grade: 7, parent_phone: '09350001122', gender: 'f' });
check('ثبت‌نام دانش‌آموز', created.status === 200, JSON.stringify(created.data));
const li = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', identifier: nc, password: nc }) });
check('ورود دانش‌آموز تازه با رمز اولیه', li.status === 200);
const fresh = { ck: li.headers.get('set-cookie').split(';')[0] };
// پومودورو: ثبت و جلوگیری از ثبت پشت‌سرهم بی‌فاصله
const p1 = await call(fresh.ck, 'POST', '/api/student/pomodoro', { subject: 'ریاضی', minutes: 25 });
check('ثبت پومودورو', p1.status === 200);
check('پومودورو بی‌فاصله رد می‌شود', (await call(fresh.ck, 'POST', '/api/student/pomodoro', { subject: 'ریاضی', minutes: 25 })).status === 429);


check('کد ملی تکراری رد می‌شود', (await call(S.manager.ck, 'POST', '/api/manager/students', { full_name: 'تکراری', national_code: nc, grade: 7, parent_phone: '09350001122' })).status === 400);

// حق عضویت: رسید ← تأیید ← باز شدن قفل
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
check('بارگذاری رسید', (await call(S.locked.ck, 'POST', '/api/student/payment', { file: { name: 'r.png', data: png } })).status === 200);
check('فایل غیرمجاز رد می‌شود', (await call(S.locked.ck, 'POST', '/api/student/payment', { file: { name: 'x.exe', data: 'data:application/x-msdownload;base64,AAAA' } })).status === 400);
const lockedId = (await call(S.locked.ck, 'GET', '/api/me')).data.user.id;
const pending = (await call(S.manager.ck, 'GET', '/api/manager/receipts?status=pending')).data.find((p) => p.student_id === lockedId);
check('رسید در صف مدیر دیده می‌شود', !!pending);
check('تأیید رسید', (await call(S.manager.ck, 'POST', `/api/manager/receipts/${pending.id}/approve`)).status === 200);
check('پس از تأیید، پنل باز می‌شود', (await call(S.locked.ck, 'GET', '/api/student/dashboard')).status === 200);

// فروشگاه: کد تخفیف و کد پیگیری
const prod = (await call(S.student.ck, 'GET', '/api/public/center/ashtiani')).data.products[0];
const q = await call(S.student.ck, 'POST', '/api/shop/quote', { items: [{ id: prod.id, qty: 2 }], code: 'ROSHD10' });
check('کد تخفیف اعمال می‌شود', q.status === 200 && q.data.discount > 0);
check('کد تخفیف نامعتبر رد می‌شود', (await call(S.student.ck, 'POST', '/api/shop/quote', { items: [{ id: prod.id }], code: 'NOPE' })).status === 400);
const co = await call(S.student.ck, 'POST', '/api/shop/checkout', { items: [{ id: prod.id, qty: 1 }] });
check('خرید و کد پیگیری', co.status === 200 && /^RSH-\d{8}$/.test(co.data.tracking_code));

// خروج: نشست باطل می‌شود؛ تغییر رمز جلسه‌های قبلی را باطل می‌کند
const t = await login('teacher', 'teacher');
check('تغییر رمز', (await call(t.ck, 'POST', '/api/me/password', { current: '123456', next: 'NewPass#99' })).status === 200);
check('توکن قدیمی پس از تغییر رمز باطل است', (await call(t.ck, 'GET', '/api/me')).status === 401);

app.kill();
await new Promise((r) => setTimeout(r, 300));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
console.log(`\nتست دودی: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail ? 1 : 0);
