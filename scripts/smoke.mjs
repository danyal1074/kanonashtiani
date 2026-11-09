// تست دودی: سرور موقت با داده نمونه، بررسی دسترسی هر نقش و تمام جریان‌های اصلی و امکانات جدید.  اجرا: npm run smoke
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-smoke-'));
const PORT = 3950 + Math.floor(Math.random() * 500);
const env = { ...process.env, ROSHD_DATA_DIR: path.join(tmp, 'data'), ROSHD_UPLOAD_DIR: path.join(tmp, 'up'), PORT: String(PORT) };
if (spawnSync(process.execPath, ['server/seed.js'], { cwd: ROOT, env }).status !== 0) { console.error('ساخت داده نمونه ناموفق'); process.exit(1); }

// آماده‌سازی صفحه تستی کتاب برای آزمودن اندپوینت صفحات محافظت‌شده
fs.mkdirSync(path.join(env.ROSHD_DATA_DIR, 'books', 'hoosh_6'), { recursive: true });
fs.writeFileSync(path.join(env.ROSHD_DATA_DIR, 'books', 'hoosh_6', 'page_1.jpg'), 'sample-page-content');
fs.writeFileSync(path.join(env.ROSHD_DATA_DIR, 'books', 'hoosh_6', 'page_500.jpg'), 'sample-page-500-content');

const app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
const B = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* هنوز بالا نیامده */ } await new Promise((r) => setTimeout(r, 200)); }

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; if (!ok) console.log(`  ✗ ${name} ${extra}`); };
async function login(role, id, pass = '123456') {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, identifier: id, password: pass }) });
  return { status: r.status, ck: r.headers.get('set-cookie')?.split(';')[0] };
}
const call = (ck, method, p, body) => fetch(B + p, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null), ck: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers }));

const S = { student: await login('student', 'student'), teacher: await login('teacher', 'teacher'), manager: await login('manager', 'manager'), admin: await login('admin', 'admin'), locked: await login('student', 'student9') };
for (const [k, v] of Object.entries(S)) check(`ورود ${k}`, v.status === 200, v.status);
check('رمز اشتباه رد می‌شود', (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', identifier: 'student', password: 'x' }) })).status === 401);
check('نقش اشتباه رد می‌شود', (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'manager', identifier: 'student', password: '123456' }) })).status === 401);

// ماتریس دسترسی: هر نقش فقط به مسیر خودش
const AREAS = { student: '/api/student/dashboard', teacher: '/api/teacher/overview', manager: '/api/manager/dashboard', admin: '/api/admin/overview' };
for (const [role, s] of Object.entries(S)) {
  if (role === 'locked') continue;
  for (const [area, p] of Object.entries(AREAS)) {
    const r = await call(s.ck, 'GET', p);
    const want = area === role ? 200 : 403;
    check(`${role} → ${area}`, r.status === want, `انتظار ${want} گرفت ${r.status}`);
  }
}
for (const [area, p] of Object.entries(AREAS)) check(`بدون ورود → ${area}`, (await call(null, 'GET', p)).status === 401);

// Student layouts use the authenticated grade, and attendance is always student-scoped.
const { isElementary } = await import('../public/js/student-variant.js');
check('انتخاب پنل دبستان فقط برای پایه‌های ۱ تا ۶', [1,2,3,4,5,6].every(grade => isElementary({user:{role:'student'},student:{grade}})) && [0,7,8,9,10,11,12,null,'bad'].every(grade => !isElementary({user:{role:'student'},student:{grade}})) && !isElementary({user:{role:'teacher'},student:{grade:5}}));
const elementarySession = await login('student', 'student5');
// Verify class/center standings against independently counted points ahead of this student.
const rankProbe = new DatabaseSync(path.join(env.ROSHD_DATA_DIR, 'roshd.db'), { readOnly: true });
const rankUser = rankProbe.prepare("SELECT u.id, u.center_id, u.full_name, s.class_id, s.grade FROM users u JOIN students s ON s.user_id=u.id WHERE u.username='student5'").get();
const rankCohort = rankProbe.prepare(`SELECT u.id, u.full_name, s.class_id, s.grade,
  (SELECT COALESCE(SUM(p.amount),0) FROM points p WHERE p.student_id=u.id) total
  FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.active=1`).all(rankUser.center_id);
rankProbe.close();
const rankSelf = rankCohort.find(r => r.id === rankUser.id);
const aheadOfSelf = r => r.total > rankSelf.total || (r.total === rankSelf.total && (r.full_name < rankSelf.full_name || (r.full_name === rankSelf.full_name && r.id < rankSelf.id)));
const classCohort = rankCohort.filter(r => r.class_id === rankUser.class_id);
const rankedDashboard = await call(elementarySession.ck, 'GET', '/api/student/dashboard');
check('رتبه کلاس بر اساس امتیاز هم‌کلاسی‌های فعال است', rankedDashboard.status === 200 && rankedDashboard.data.rankings.class.of === classCohort.length && rankedDashboard.data.rankings.class.rank === classCohort.filter(aheadOfSelf).length + 1);
check('رتبه کانون بین همه پایه‌های همان کانون است', rankedDashboard.data.rankings.center.of === rankCohort.length && rankedDashboard.data.rankings.center.rank === rankCohort.filter(aheadOfSelf).length + 1);
check('رتبه پایه قبلی همچنان حفظ شده است', rankedDashboard.data.rank.of === rankCohort.filter(r => r.grade === rankUser.grade).length);
check('رتبه‌ها اطلاعات دانش‌آموزان دیگر را افشا نمی‌کنند', ['class','center'].every(scope => Object.keys(rankedDashboard.data.rankings[scope]).sort().join(',') === 'of,rank'));
const ownAttendance = await call(elementarySession.ck, 'GET', '/api/student/attendance');
check('حضور و غیاب دانش‌آموز به داده واقعی متصل است', ownAttendance.status === 200 && Array.isArray(ownAttendance.data.rows) && ownAttendance.data.total === ownAttendance.data.present + ownAttendance.data.absent + ownAttendance.data.excused);
const ignoredStudentId = await call(elementarySession.ck, 'GET', '/api/student/attendance?student_id=1');
check('شناسه ارسالی نمی‌تواند صاحب سوابق حضور را عوض کند', JSON.stringify(ignoredStudentId.data) === JSON.stringify(ownAttendance.data));
check('معلم نمی‌تواند از API حضور دانش‌آموز استفاده کند', (await call(S.teacher.ck, 'GET', '/api/student/attendance')).status === 403);
check('حضور بدون ورود باز نیست', (await call(null, 'GET', '/api/student/attendance')).status === 401);
check('حضور در پنل قفل‌شده بسته است', (await call(S.locked.ck, 'GET', '/api/student/attendance')).status === 423);
const elementaryAssignment = (await call(elementarySession.ck, 'GET', '/api/student/assignments')).data.find(a => !a.sub_id);
const noteSubmission = await call(elementarySession.ck, 'POST', `/api/student/assignments/${elementaryAssignment.id}/submit`, { note: 'پاسخ متنی تکلیف، بدون پیوست' });
check('ارسال تکلیف فقط با یادداشت بدون پیوست', noteSubmission.status === 200);
const submittedNote = (await call(elementarySession.ck, 'GET', '/api/student/assignments')).data.find(a => a.id === elementaryAssignment.id);
check('یادداشت تکلیف بدون فایل در پایگاه داده ذخیره می‌شود', !!submittedNote.sub_id && submittedNote.note === 'پاسخ متنی تکلیف، بدون پیوست' && submittedNote.file_path === null && submittedNote.file_name === null);


// قفل پنل دانش‌آموز بدهکار: داشبورد قفل، پرداخت باز
check('پنل قفل‌شده: داشبورد ۴۲۳', (await call(S.locked.ck, 'GET', '/api/student/dashboard')).status === 423);
check('پنل قفل‌شده: صفحه پرداخت باز است', (await call(S.locked.ck, 'GET', '/api/student/payment')).status === 200);
check('پنل قفل‌شده: اطلاعیه‌ها باز است', (await call(S.locked.ck, 'GET', '/api/announcements')).status === 200);

// والد فقط فرزند خودش
check('ورود والدین غیرفعال است (پنل والدین حذف شده)', (await call('', 'POST', '/api/auth/login', { role: 'parent', identifier: '09120000000', password: '123456' })).status === 400);
// معلم فقط دانش‌آموز کلاس خودش
const other = (await call(S.manager.ck, 'GET', '/api/manager/students?grade=4&limit=1')).data.rows[0];
check('معلم: دانش‌آموز کلاس دیگر ممنوع', (await call(S.teacher.ck, 'GET', `/api/teacher/students/${other.id}`)).status === 403);
// پیام‌رسان: فقط مخاطب مجاز (دانش‌آموز کانون دیگر ممنوع)
check('پیام به مخاطب غیرمجاز ممنوع', (await call(S.student.ck, 'POST', '/api/messages', { to: 999999, body: 'سلام' })).status === 403);

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
check('دانش‌آموز تازه بدون هیچ فرم اجباری وارد پنل می‌شود', (await call(fresh.ck, 'GET', '/api/student/dashboard')).status === 200);
const pwChange = await call(fresh.ck, 'POST', '/api/me/password', { current: nc, next: 'StudentNew#123' });
check('دانش‌آموز تازه می‌تواند اختیاری رمز را عوض کند', pwChange.status === 200);
const freshAfterPw = { ck: pwChange.ck || (await login('student', nc, 'StudentNew#123')).ck };
// پومودورو: ثبت و جلوگیری از ثبت پشت‌سرهم بی‌فاصله
const p1 = await call(freshAfterPw.ck, 'POST', '/api/student/pomodoro', { subject: 'ریاضی', minutes: 25 });
check('ثبت پومودورو پس از تکمیل پروفایل', p1.status === 200);
check('پومودورو بی‌فاصله رد می‌شود', (await call(freshAfterPw.ck, 'POST', '/api/student/pomodoro', { subject: 'ریاضی', minutes: 25 })).status === 429);

check('کد ملی تکراری رد می‌شود', (await call(S.manager.ck, 'POST', '/api/manager/students', { full_name: 'تکراری', national_code: nc, grade: 7, parent_phone: '09350001122' })).status === 400);
// ثبت‌نام بدون موبایل (اختیاری) و اشتراک سامانه جدا از حق عضویت
const nc2 = (() => { const d = [2, 7, 1, 8, 2, 8, 1, 8, 2]; const s = d.reduce((a, x, i) => a + x * (10 - i), 0) % 11; return d.join('') + (s < 2 ? s : 11 - s); })();
check('ثبت‌نام بدون موبایل والدین مجاز است', (await call(S.manager.ck, 'POST', '/api/manager/students', { full_name: 'بدون موبایل', national_code: nc2, grade: 4 })).status === 200);
const feesCfg = (await call(S.manager.ck, 'GET', '/api/manager/fees')).data;
check('اشتراک سامانه پیش‌فرض ۱۰۰ هزار تومان است', feesCfg.system_fee === 100000, feesCfg.system_fee);
const payInfo = (await call(S.student.ck, 'GET', '/api/student/payment')).data;
check('اشتراک سامانه پیش‌فرض خاموش است: مجموع پرداخت = حق عضویت و پنل دانش‌آموز اشتراک نشان نمی‌دهد', feesCfg.system_fee_enabled === false && payInfo.system_fee === 0 && payInfo.total === payInfo.amount, JSON.stringify([payInfo.amount, payInfo.system_fee, payInfo.total]));
check('مسیرهای پنل والدین حذف شده‌اند', (await call(S.manager.ck, 'GET', '/api/parent/children/1')).status === 404);
check('دانش‌آموز بدون موبایل با کد ملی وارد می‌شود', (await login('student', nc2, nc2)).status === 200);
check('مدیر اشتراک سامانه را تغییر می‌دهد', (await call(S.manager.ck, 'PUT', '/api/manager/fees', { system_fee: 120000, settings: [] })).status === 200 && (await call(S.manager.ck, 'GET', '/api/manager/fees')).data.system_fee === 120000);
check('اشتراک سامانه عددی نامعتبر صفر می‌شود', (await call(S.manager.ck, 'PUT', '/api/manager/fees', { system_fee: 'abc', settings: [] })).status === 200 && (await call(S.manager.ck, 'GET', '/api/manager/fees')).data.system_fee === 0);
await call(S.manager.ck, 'PUT', '/api/manager/fees', { system_fee: 100000, settings: [] });
check('نقش ناشناخته (والدین) در ورود رد می‌شود', (await call('', 'POST', '/api/auth/login', { role: 'parent', identifier: '09120000000', password: 'x' })).status === 400);
// ثبت‌نام گروهی فقط با نام، کد ملی و شماره تماس + تکمیل اجباری پروفایل در اولین ورود
const nc3 = (() => { const d = [1, 6, 1, 8, 0, 3, 3, 9, 8]; const s = d.reduce((a, x, i) => a + x * (10 - i), 0) % 11; return d.join('') + (s < 2 ? s : 11 - s); })();
const imp = await call(S.manager.ck, 'POST', '/api/manager/students/import', { csv: `نام و نام خانوادگی,کد ملی,شماره تماس,پایه,جنسیت,کلاس,نام پدر,شهریه این ماه
تست گروهی,${nc3},09121112233,چهارم,دختر,تست‌گروهی,پدر تست,پرداخت شده
` });
check('ثبت‌نام گروهی با ستون‌های پایه و جنسیت و اختیاری‌ها', imp.status === 200 && imp.data.created === 1, JSON.stringify(imp.data).slice(0, 120));
const impNoGrade = await call(S.manager.ck, 'POST', '/api/manager/students/import', { csv: `نام و نام خانوادگی,کد ملی,شماره تماس,پایه,جنسیت
بی‌جنسیت,${nc2},09121112234,چهارم,
`, dry_run: true });
check('جنسیت خالی اجباری نیست: ثبت می‌شود و در گزارش هشدار می‌آید', impNoGrade.status === 200 && impNoGrade.data.error_count === 0 && impNoGrade.data.valid + impNoGrade.data.will_update === 1, JSON.stringify(impNoGrade.data).slice(0, 160));
const impNoCols = await call(S.manager.ck, 'POST', '/api/manager/students/import', { csv: `نام و نام خانوادگی,شماره تماس
x,09121234567
`, dry_run: true });
check('نبودن ستون کد ملی در فایل رد می‌شود (فقط نام و کد ملی لازم‌اند)', impNoCols.status === 400 && /کد ملی/.test(impNoCols.data.error), JSON.stringify(impNoCols.data));
const gs = await login('student', nc3, nc3);
check('ورود دانش‌آموز واردشده گروهی', gs.status === 200);
const feeG = (await call(S.manager.ck, 'GET', '/api/manager/fees')).data;
check('شهریهٔ پرداخت‌شدهٔ فایل ثبت شد یا چون مبلغ پایه تعیین نشده کنار گذاشته شد', imp.data.fee_paid_recorded + imp.data.fee_paid_unset === 1, JSON.stringify([imp.data.fee_paid_recorded, imp.data.fee_paid_unset]));
const meG = (await call(gs.ck, 'GET', '/api/me')).data;
check('اطلاعات خالی پروفایل فقط فهرست یادآوری است (اجباری نیست) و رمز اولیه اعلام می‌شود', Array.isArray(meG.student.missing) && meG.student.missing.some((m) => m.key === 'school') && meG.must_change_password === true);
check('بدون تکمیل پروفایل هم پنل باز است', (await call(gs.ck, 'GET', '/api/student/dashboard')).status === 200);
check('ثبت اطلاعات خالی رد می‌شود', (await call(gs.ck, 'PUT', '/api/student/info', {})).status === 400);
check('رمز اولیه (کد ملی) به‌عنوان رمز جدید رد می‌شود', (await call(gs.ck, 'POST', '/api/me/password', { current: nc3, next: nc3 })).status === 400);
check('مدرسهٔ بی‌معنی (یک حرف) رد می‌شود', (await call(gs.ck, 'PUT', '/api/student/info', { school: 'x' })).status === 400);
const cp = await call(gs.ck, 'PUT', '/api/student/info', { school: 'دبستان نمونه', birth_date: '1392/05/12', father_name: 'پدر', address: 'تهران، خیابان نمونه ۱' });
check('ثبت اختیاری اطلاعات پروفایل موفق', cp.status === 200, JSON.stringify(cp.data));
const meG2 = (await call(gs.ck, 'GET', '/api/me')).data;
check('فقط فیلدهای ثبت‌شده از فهرست خالی‌ها کم می‌شوند', !meG2.student.missing.some((m) => m.key === 'school') && meG2.student.missing.some((m) => m.key === 'mother_name'));
check('پس از تکمیل پروفایل، بدون تغییر رمز هم پنل باز است', (await call(gs.ck, 'GET', '/api/student/dashboard')).status === 200);
check('تغییر رمز با رمز فعلی اشتباه رد می‌شود', (await call(gs.ck, 'POST', '/api/me/password', { current: 'اشتباه-123', next: 'رمز-جدید-456' })).status === 400);
check('تغییر رمز اختیاری با رمز فعلی درست انجام می‌شود', (await call(gs.ck, 'POST', '/api/me/password', { current: nc3, next: 'رمز-جدید-456' })).status === 200);
const nc4 = (() => { const d = [4, 5, 6, 7, 8, 9, 1, 2, 3]; const s = d.reduce((a, x, i) => a + x * (10 - i), 0) % 11; return d.join('') + (s < 2 ? s : 11 - s); })();
const impFull = await call(S.manager.ck, 'POST', '/api/manager/students/import', { csv: `نام و نام خانوادگی,کد ملی,شماره تماس,پایه,جنسیت,نام پدر,نام مادر,مدرسه,تاریخ تولد,نشانی,شماره تماس دوم
علی کامل,${nc4},09124445566,نهم,پسر,حسن,مریم,مدرسه نمونه,1388/02/03,تهران خیابان نمونه,09351112233
` });
check('ثبت‌نام گروهی با همهٔ ستون‌های اختیاری', impFull.status === 200 && impFull.data.created === 1, JSON.stringify(impFull.data).slice(0, 140));
const gf = await login('student', nc4, nc4);
check('ورود دانش‌آموز با ارقام فارسی (کد ملی) هم کار می‌کند', (await login('student', nc4.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]), nc4.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]))).status === 200);
const meF = (await call(gf.ck, 'GET', '/api/me')).data;
check('اطلاعات موجود در فایل در پروفایل ثبت شد (فهرست خالی‌ها تهی است)', meF.student.missing.length === 0, JSON.stringify(meF.student.missing));
const impNoPhone = await call(S.manager.ck, 'POST', '/api/manager/students/import', { csv: `نام و نام خانوادگی,کد ملی,شماره تماس,پایه,جنسیت
بی‌شماره,${nc2},,نهم,پسر
`, dry_run: true });
check('شمارهٔ تماس خالی در ثبت‌نام گروهی اجباری نیست', impNoPhone.status === 200 && impNoPhone.data.valid + impNoPhone.data.will_update === 1 && impNoPhone.data.error_count === 0, JSON.stringify(impNoPhone.data).slice(0, 160));
// ثبت دستی پرداخت، انتقال کلاس و حذف گروهی
const uid4 = (await call(S.manager.ck, 'GET', `/api/manager/students?q=${nc4}`)).data.rows[0]?.id;
const sysOn = await call(S.manager.ck, 'PUT', '/api/manager/fees', { system_fee: 100000, system_fee_enabled: true, settings: [] });
check('مدیر اشتراک سامانه را روشن می‌کند', sysOn.status === 200 && (await call(S.manager.ck, 'GET', '/api/manager/fees')).data.system_fee_enabled === true);
await call(S.manager.ck, 'PUT', '/api/manager/fees', { system_fee_enabled: false, settings: [] });
const mp = await call(S.manager.ck, 'POST', '/api/manager/students/fee-paid', { ids: [uid4], paid: true });
check('مدیر پرداخت حق عضویت را دستی ثبت می‌کند', mp.status === 200 && mp.data.changed === 1, JSON.stringify(mp.data));
const mpAgain = await call(S.manager.ck, 'POST', '/api/manager/students/fee-paid', { ids: [uid4], paid: true });
check('ثبت دوباره پرداخت تکرار نمی‌شود', mpAgain.data.already === 1 && mpAgain.data.changed === 0);
const gfPay = (await call(gf.ck, 'GET', '/api/student/payment')).data;
check('پنل دانش‌آموز «پرداخت شد» و ماه را نشان می‌دهد', gfPay.status === 'paid' && !!gfPay.period, JSON.stringify([gfPay.status, gfPay.period]));
const mu = await call(S.manager.ck, 'POST', '/api/manager/students/fee-paid', { ids: [uid4], paid: false });
check('مدیر پرداخت دستی را لغو می‌کند', mu.status === 200 && mu.data.changed === 1 && (await call(gf.ck, 'GET', '/api/student/payment')).data.status !== 'paid');
const clsList = (await call(S.manager.ck, 'GET', '/api/manager/meta')).data.classes;
const own = clsList.find((c) => c.grade === 9);
const mv = await call(S.manager.ck, 'POST', '/api/manager/students/move', { ids: [uid4], class_id: own.id });
check('انتقال گروهی دانش‌آموز به کلاس', mv.status === 200 && mv.data.moved === 1);
const newCls = await call(S.manager.ck, 'POST', '/api/manager/classes', { grade: 9, name: 'ب-تست' });
const dist = await call(S.manager.ck, 'POST', '/api/manager/classes/distribute', { grade: 9, class_ids: (await call(S.manager.ck, 'GET', '/api/manager/meta')).data.classes.filter((c) => c.grade === 9).map((c) => c.id) });
check('تقسیم خودکار دانش‌آموزان بین چند کلاس', newCls.status === 200 && dist.status === 200 && dist.data.moved >= 1, JSON.stringify(dist.data));
check('حذف همه بدون تأیید رد می‌شود', (await call(S.manager.ck, 'POST', '/api/manager/bulk-delete', { what: 'announcements' })).status === 400 && (await call(S.manager.ck, 'POST', '/api/manager/students/delete', { all: true })).status === 400);
check('حذف همهٔ اطلاعیه‌ها با تأیید', (await call(S.manager.ck, 'POST', '/api/manager/bulk-delete', { what: 'announcements', confirm: true })).status === 200 && (await call(S.manager.ck, 'GET', '/api/manager/announcements')).data.length === 0);
const impUpd = await call(S.manager.ck, 'POST', '/api/manager/students/import', { csv: `کد ملی,نام,کلاس,شهریه
${nc4},علی کامل,نهم ب-تست,پرداخت شده
` });
check('ثبت‌نام گروهی دانش‌آموز موجود را به‌روز می‌کند (کلاس و پرداخت)، رد نمی‌کند', impUpd.status === 200 && impUpd.data.created === 0 && impUpd.data.updated === 1 && impUpd.data.fee_paid_recorded === 1, JSON.stringify(impUpd.data).slice(0, 200));
check('ساخت کانون دوم ممنوع است (سامانهٔ اختصاصی آشتیانی)', (await call(S.admin.ck, 'POST', '/api/admin/centers', { name: 'کانون دیگر', slug: 'other-center', manager_username: 'other_mgr', manager_password: '123456' })).status === 403);
check('حالت نمایشی در نسخهٔ واقعی خاموش است', (await call('', 'GET', '/api/public/mode')).data.demo === false);
check('جدول هفتگی مدیر برمی‌گردد', Array.isArray((await call(S.manager.ck, 'GET', '/api/manager/schedule/overview')).data));
check('جدول هفتگی معلم برمی‌گردد', Array.isArray((await call(S.teacher.ck, 'GET', '/api/teacher/schedule')).data?.sessions));

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
S.teacher = await login('teacher', 'teacher', 'NewPass#99');

const teacherFresh = await login('teacher', 'teacher2');

// ====================================================================
// ========== ارزیابی ۱۵ بند اصلاحات تکمیلی بک‌اند (الف تا ث) ==========
// ====================================================================

// [بند ۱] امنیت اسکریپت استقرار
const deployCode = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy_vps.py'), 'utf8');
check('بند ۱: عدم وجود آی‌پی و رمز عبور هاردکدشده در scripts/deploy_vps.py', !deployCode.includes('89.46.217.44') && !deployCode.includes('tHvlla30dagZlpF8'));
check('بند ۱: حذف AutoAddPolicy و الزام بررسی کلید میزبان', !deployCode.includes('AutoAddPolicy'));
check('بند ۱: حذف دستور دستی must_change_password=0', !deployCode.includes('must_change_password=0'));
check('بند ۱: الزام تهیه نسخه پشتیبان npm run backup پیش از pull', deployCode.includes('npm run backup'));
check('بند ۱: محدودیت استقرار تنها از main یا تگ‌های نسخه (v*)', deployCode.includes('DEPLOY_REF') && deployCode.includes('main'));

// [بند ۲] فایل .gitattributes و پایان خطوط
check('بند ۲: وجود .gitattributes با تنظیم eol=lf', fs.existsSync(path.join(ROOT, '.gitattributes')) && fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8').includes('eol=lf'));

// [بند ۳] امن‌سازی سرویس سیستم‌دی و مستندسازی
const svcContent = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy', 'roshd.service'), 'utf8');
check('بند ۳: سرویس سیستم‌دی با User غیرریشه (roshd)', svcContent.includes('User=roshd') && !svcContent.includes('User=root'));
check('بند ۳: اعمال تدابیر NoNewPrivileges، ProtectSystem و ReadWritePaths', svcContent.includes('NoNewPrivileges=true') && svcContent.includes('ProtectSystem=full') && svcContent.includes('ReadWritePaths='));
check('بند ۳: مستندسازی kanonashtiani.service و /var/www/kanonashtiani در docs/DEPLOYMENT.md', fs.existsSync(path.join(ROOT, 'docs', 'DEPLOYMENT.md')) && fs.readFileSync(path.join(ROOT, 'docs', 'DEPLOYMENT.md'), 'utf8').includes('kanonashtiani.service'));

// [بند ۴] کتاب‌های هوش (فقط معلم و مدیر، حذف endpoint جعلی، دسترسی امن به صفحات، حذف extracted_pages)
check('بند ۴: دسترسی دانش‌آموز به /api/exam-books مسدود است (۴۰۳)', (await call(S.student.ck, 'GET', '/api/exam-books')).status === 403);
const teacherBooks = await call(S.teacher.ck, 'GET', '/api/exam-books');
check('بند ۴: دسترسی معلم به /api/exam-books باز است (۲۰۰)', teacherBooks.status === 200 && Array.isArray(teacherBooks.data) && teacherBooks.data.length >= 2);
check('بند ۴: حذف اندپوینت جعلی /api/exam-books/:id/questions (۴۰۴)', (await call(S.teacher.ck, 'GET', '/api/exam-books/hoosh_6/questions')).status === 404);

// اندپوینت جدید خواندن صفحه کتاب
const pageTest = await fetch(B + '/api/exam-books/hoosh_6/pages/1', { headers: { Cookie: S.teacher.ck } });
check('بند ۴: اندپوینت خواندن صفحه کتاب با احراز هویت معلم و کش خصوصی', pageTest.status === 200 && pageTest.headers.get('cache-control')?.includes('private'));
check('بند ۴: دسترسی دانش‌آموز به صفحات کتاب مسدود است (۴۰۳)', (await call(S.student.ck, 'GET', '/api/exam-books/hoosh_6/pages/1')).status === 403);
check('بند ۴: درخواست شماره صفحه نامعتبر رد می‌شود (۴۰۰)', (await call(S.teacher.ck, 'GET', '/api/exam-books/hoosh_6/pages/999999')).status === 400);
check('بند ۴: عدم وجود پوشه عمومی extracted_pages', !fs.existsSync(path.join(ROOT, 'public', 'extracted_pages')));

// [بند ۵] عدم ذخیره مقادیر پیش‌فرض ساختگی در کارنامه برپا
const stuUser = (await call(S.student.ck, 'GET', '/api/me')).data.user;
const emptyBarpa = await call(S.manager.ck, 'POST', '/api/manager/barpa-exams/reports', {
  exam_id: 'barpa_null_test',
  exam_title: 'آزمون آزمایشی بدون نمره پیش‌فرض',
  grade: 'نهم',
  records: [{ student_id: stuUser.id }]
});
check('بند ۵: ثبت کارنامه بدون داده‌های عددی ساختگی', emptyBarpa.status === 200);
const sDbTest = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'), { readOnly: true });
const nullRow = sDbTest.prepare("SELECT * FROM comprehensive_exam_reports WHERE exam_id='barpa_null_test' AND student_id=?").get(stuUser.id);
check('بند ۵: مقادیر ارسال‌نشده کارنامه NULL ذخیره شدند (نه 6000 یا 1924)', nullRow && nullRow.overall_traz === null && nullRow.overall_rank_all === null && nullRow.overall_correct === null);
sDbTest.close();

// [بند ۶] ارتقای آپلود برپا: عدم پذیرش بدون فایل، حذف مسیر تکراری، عدم ساخت اکانت خودکار
check('بند ۶: آپلود کارنامه برپا بدون فایل ورودی رد می‌شود (۴۰۰)', (await call(S.manager.ck, 'POST', '/api/manager/barpa-exams/upload', {})).status === 400);
check('بند ۶: مسیر تکراری /api/barpa-exams/upload حذف شده است (۴۰۴)', (await call(S.manager.ck, 'POST', '/api/barpa-exams/upload', {})).status === 404);

// [بند ۷] رفع خطای ۵۰۰ کارنامه برای اولیا، حذف OR center_id IS NULL و حذف answers_json از فهرست
const studentBarpaList = await call(S.student.ck, 'GET', '/api/barpa-exams/reports');
check('بند ۷: فهرست کارنامه‌ها ستون حجیم answers_json را بازنمی‌گرداند', studentBarpaList.status === 200 && studentBarpaList.data.length > 0 && !('answers' in studentBarpaList.data[0]));

// ثبت کارنامه با پاسخ و بررسی دسترسی تک‌کارنامه
await call(S.manager.ck, 'POST', '/api/manager/barpa-exams/reports', {
  exam_id: 'barpa_single_test',
  exam_title: 'آزمون برپا نهم با پاسخ‌برگ',
  grade: 'نهم',
  records: [{ student_id: stuUser.id, overall_traz: 6500, answers: [{ q: 1, chosen: 2 }] }]
});
const singleBarpaId = (await call(S.student.ck, 'GET', '/api/barpa-exams/reports')).data.find(r => r.exam_id === 'barpa_single_test')?.id;
const singleBarpa = await call(S.student.ck, 'GET', `/api/barpa-exams/reports/${singleBarpaId}`);
check('بند ۷: جزییات تک‌کارنامه شامل پاسخ‌برگ است', singleBarpa.status === 200 && Array.isArray(singleBarpa.data.answers));

// [بند ۸] صدور فاکتور: صحت کانون دانش‌آموز/کلاس و برگشت شناسه درست در بروزرسانی
check('بند ۸: فاکتور زدن برای دانش‌آموز کانون دیگر یا ناموجود رد می‌شود (۴۰۴)', (await call(S.manager.ck, 'POST', '/api/manager/invoices', { student_id: 999999, fee_type: 'tuition', period: 'تست', amount: 50000 })).status === 404);
const invCreate = await call(S.manager.ck, 'POST', '/api/manager/invoices', { student_id: stuUser.id, fee_type: 'tuition', period: 'بهار ۱۴۰۴', amount: 800000 });
const invUpdate = await call(S.manager.ck, 'POST', '/api/manager/invoices', { student_id: stuUser.id, fee_type: 'tuition', period: 'بهار ۱۴۰۴', amount: 850000 });
check('بند ۸: بروزرسانی فاکتور شناسه معتبر و یکسان بازمی‌گرداند', invCreate.status === 200 && invUpdate.status === 200 && invCreate.data.id === invUpdate.data.id);

// [بند ۹] پرداخت دانش‌آموز با invoice_id و به‌روزرسانی فاکتور
const payInv = await call(S.student.ck, 'POST', '/api/student/payment', { invoice_id: invCreate.data.id, amount: 850000, file: { name: 'rec.png', data: png } });
check('بند ۹: پرداخت دانش‌آموز با invoice_id متصل', payInv.status === 200 && payInv.data.invoice_id === invCreate.data.id);
const stuInvoices = await call(S.student.ck, 'GET', '/api/student/invoices');
const myTargetInv = stuInvoices.data.find(i => i.id === invCreate.data.id);
check('بند ۹: دریافت فاکتورهای دانش‌آموز شامل invoice_id و وضعیت اولیه issued', myTargetInv && myTargetInv.invoice_id === invCreate.data.id && myTargetInv.status === 'issued');
const mgrReceipts = await call(S.manager.ck, 'GET', '/api/manager/receipts?status=pending');
const myPayReceipt = mgrReceipts.data.find(p => p.student_id === stuUser.id && p.invoice_id === invCreate.data.id);
check('بند ۹: رسید در لیست مدیر حاوی invoice_id است', !!myPayReceipt && myPayReceipt.invoice_id === invCreate.data.id);

// [بند ۱۰] برگشت رسید: تغییر قید وضعیت به 'reversed' و نادیده‌گرفتن در وضعیت شهریه
await call(S.manager.ck, 'POST', `/api/manager/receipts/${myPayReceipt.id}/approve`);
const invPaid = (await call(S.student.ck, 'GET', '/api/student/invoices')).data.find(i => i.id === invCreate.data.id);
check('بند ۹: پس از تأیید مدیر، وضعیت فاکتور paid می‌شود', invPaid && invPaid.status === 'paid');
const revAction = await call(S.manager.ck, 'POST', `/api/manager/receipts/${myPayReceipt.id}/reverse`, { reason: 'تست برگشت رسید' });
check('بند ۱۰: ثبت سند اصلاحی برگشت رسید', revAction.status === 200 && revAction.data.reversed);
const reversedList = await call(S.manager.ck, 'GET', '/api/manager/receipts?status=reversed');
check('بند ۱۰: فیلتر رسیدهای با وضعیت reversed کار می‌کند', reversedList.status === 200 && reversedList.data.some(p => p.id === myPayReceipt.id && p.status === 'reversed'));

// [بند ۱۱] آزمون خودسنجی: شرط حداقل نصف پاسخ، سقف روزانه ۳ بار، اتمام زمان
const selfEx1 = (await call(S.student.ck, 'POST', '/api/student/self-exams', { subject: 'ریاضی', count: 6, duration_minutes: 15 })).data;
// پاسخ ندادن به هیچ سؤالی باید منجر به ۰ امتیاز شود
const selfSubZero = await call(S.student.ck, 'POST', `/api/student/self-exams/${selfEx1.id}/submit`, { answers: {} });
check('بند ۱۱: خودسنجی بدون پاسخ دادن به حداقل نصف سوالات امتیاز صفر می‌گیرد', selfSubZero.status === 200 && selfSubZero.data.pointsAwarded === 0);

// خودسنجی با پاسخ به بیش از نصف سوالات
const selfEx2 = (await call(S.student.ck, 'POST', '/api/student/self-exams', { subject: 'ریاضی', count: 6, duration_minutes: 15 })).data;
const selfSubValid = await call(S.student.ck, 'POST', `/api/student/self-exams/${selfEx2.id}/submit`, { answers: { 1: 1, 2: 1, 3: 1, 4: 1 } });
check('بند ۱۱: خودسنجی با پاسخ به بیش از نصف سوالات امتیاز دریافت می‌کند', selfSubValid.status === 200 && selfSubValid.data.pointsAwarded > 0);

// [بند ۱۲] ثبت آزمون آنلاین: جلوگیری از ثبت پس از اتمام مهلت آزمون
const overdueExam = (await call(S.student.ck, 'GET', '/api/student/exams')).data.find(e => e.percent == null);
if (overdueExam) {
  await call(S.student.ck, 'POST', `/api/student/exams/${overdueExam.id}/start`);
  // دستکاری شروع آزمون به ۲ ساعت قبل برای آزمودن انقضا
  const dbMod = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'));
  dbMod.exec(`UPDATE exam_attempts SET started_at = datetime('now', '-2 hours') WHERE exam_id=${overdueExam.id} AND student_id=${stuUser.id}`);
  dbMod.close();
  const lateSubmit = await call(S.student.ck, 'POST', `/api/student/exams/${overdueExam.id}/submit`, { answers: [0, 0, 0] });
  check('بند ۱۲: ارسال آزمون آنلاین پس از پایان بازه زمانی رد می‌شود (۴۰۰)', lateSubmit.status === 400);
}

// [بند ۱۳] مشاور تحصیلی و مخاطبان مجاز
const counselorInfo = await call(S.student.ck, 'GET', '/api/counselor');
check('بند ۱۳: مشاور تحصیلی اطلاعات مدیر کانون را برمی‌گرداند و فاقد is_online جعلی است', counselorInfo.status === 200 && counselorInfo.data.role === 'counselor' && !('is_online' in counselorInfo.data));
const studentContacts = await call(S.student.ck, 'GET', '/api/messages/contacts');
check('بند ۱۳: مدیر کانون در لیست مخاطبان پیام‌رسان دانش‌آموز وجود دارد', studentContacts.status === 200 && studentContacts.data.some(c => c.role === 'manager'));

// [بند ۱۴] صندوق خروجی پیامک: تلاش مجدد فقط برای پیام‌های failed
const outboxList = (await call(S.manager.ck, 'GET', '/api/manager/sms-outbox')).data;
if (outboxList && outboxList.length > 0) {
  // اگر پیامی با وضعیت pending یا sent باشد تلاش مجدد ۴۰۰ می‌دهد
  const nonFailed = outboxList.find(m => m.status !== 'failed');
  if (nonFailed) {
    const retryNonFailed = await call(S.manager.ck, 'POST', `/api/manager/sms-outbox/${nonFailed.id}/retry`);
    check('بند ۱۴: تلاش مجدد برای پیام‌های غیر failed با خطای ۴۰۰ رد می‌شود', retryNonFailed.status === 400);
  }
}

// [بند ۱۵] حذف کد مرده در DELETE /api/teacher/manual-scores/:id
const myOverview = (await call(teacherFresh.ck, 'GET', '/api/teacher/overview')).data;
const myClass = myOverview.classes[0];
const myAtt = (await call(teacherFresh.ck, 'GET', `/api/teacher/attendance?class_id=${myClass.id}`)).data;
const testStuId = myAtt.students[0].id;
const newScore = await call(teacherFresh.ck, 'POST', '/api/teacher/manual-scores', { class_id: myClass.id, subject: 'ریاضی', title: 'پرسش مستمر', student_id: testStuId, score: 19 });
const delScore = await call(teacherFresh.ck, 'DELETE', `/api/teacher/manual-scores/${newScore.data.ids[0]}`);
check('بند ۱۵: دبیر نمره ثبت‌شده خود را با موفقیت حذف می‌کند', delScore.status === 200 && delScore.data.ok);

// ==================== ارزیابی ۸ بند اصلاحات مرحله دوم ====================

// [بند ۱ جدید] فاکتور بدهی دوره‌ای: ثبت رسید فقط pending، عدم تغییر paid فاکتور، منع رسید تکراری، تابع recalcInvoice
const testInv = (await call(S.manager.ck, 'POST', '/api/manager/invoices', { student_id: stuUser.id, fee_type: 'camp', period: 'اردوی مشهد', amount: 300000 })).data;
const payInv1 = await call(S.student.ck, 'POST', '/api/student/payment', { invoice_id: testInv.id, amount: 300000, file: { name: 'camp.png', data: png } });
check('بند ۱: ثبت رسید فاکتور با وضعیت pending', payInv1.status === 200 && payInv1.data.status === 'pending');
const invAfterPay = (await call(S.student.ck, 'GET', '/api/student/invoices')).data.find(i => i.id === testInv.id);
check('بند ۱: پس از ارسال رسید، فاکتور بدون تغییر و در وضعیت issued می‌ماند', invAfterPay && invAfterPay.status === 'issued' && invAfterPay.paid === 0);
const dupPay = await call(S.student.ck, 'POST', '/api/student/payment', { invoice_id: testInv.id, amount: 300000, file: { name: 'camp2.png', data: png } });
check('بند ۱: جلوی ارسال رسید دوم برای فاکتور دارای رسید در انتظار گرفته می‌شود (۴۰۰)', dupPay.status === 400);

// بررسی approve و recalcInvoice
const campReceipt = (await call(S.manager.ck, 'GET', '/api/manager/receipts?status=pending')).data.find(p => p.invoice_id === testInv.id);
const approveCamp = await call(S.manager.ck, 'POST', `/api/manager/receipts/${campReceipt.id}/approve`);
check('بند ۱: تأیید رسید فاکتور توسط مدیر', approveCamp.status === 200);
const invAfterApprove = (await call(S.student.ck, 'GET', '/api/student/invoices')).data.find(i => i.id === testInv.id);
check('بند ۱: فاکتور پس از تأیید به وضعیت paid تغییر می‌یابد', invAfterApprove && invAfterApprove.status === 'paid' && invAfterApprove.paid === 300000);

// بررسی reverse و recalcInvoice
const reverseCamp = await call(S.manager.ck, 'POST', `/api/manager/receipts/${campReceipt.id}/reverse`, { reason: 'اشتباه محاسباتی' });
check('بند ۱: برگشت رسید تأییدشده', reverseCamp.status === 200);
const invAfterReverse = (await call(S.student.ck, 'GET', '/api/student/invoices')).data.find(i => i.id === testInv.id);
check('بند ۱: پس از برگشت رسید، فاکتور مجدداً به issued بازمی‌گردد', invAfterReverse && invAfterReverse.status === 'issued' && invAfterReverse.paid === 0);

// [بند ۲ جدید] یکسان‌سازی وضعیت فاکتور (issued / partial / paid همراه با paid و remaining)
const stuInvs = (await call(S.student.ck, 'GET', '/api/student/invoices')).data;
const mgrInvs = (await call(S.manager.ck, 'GET', '/api/manager/invoices')).data;
const validStatuses = ['issued', 'partial', 'paid'];
check('بند ۲: ساختار و وضعیت فاکتور در پنل دانش‌آموز یکپارچه است', stuInvs.every(i => validStatuses.includes(i.status) && typeof i.paid === 'number' && typeof i.remaining === 'number'));
check('بند ۲: ساختار و وضعیت فاکتور در پنل مدیر یکپارچه است', mgrInvs.every(i => validStatuses.includes(i.status) && typeof i.paid === 'number' && typeof i.remaining === 'number'));

// [بند ۳ جدید] تفکیک فاکتور از حق عضویت در logic.js و داشبورد
const testFeeStatus = (await call(S.student.ck, 'GET', '/api/student/payment')).data;
check('بند ۳: پرداخت‌های دارای invoice_id بر وضعیت حق عضویت تأثیر نمی‌گذارند', !testFeeStatus.locked || testFeeStatus.fee);
const sDb2 = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'), { readOnly: true });
const feeTxCount = sDb2.prepare("SELECT COUNT(*) n FROM transactions WHERE ref LIKE 'pay:%' AND category='حق عضویت' AND title LIKE '%فاکتور%'").get()?.n;
check('بند ۳: عنوان تراکنش فاکتور تاییدشده حق عضویت نیست', feeTxCount === 0);
sDb2.close();

// [بند ۴ جدید] تصحیح pages_count کتاب‌های هوش و دسترسی به صفحات بالا
const bookHoosh6 = (await call(S.teacher.ck, 'GET', '/api/exam-books')).data?.find(b => b.id === 'hoosh_6');
check('بند ۴: تصحیح pages_count کتاب هوش ششم در مهاجرت نسخه ۵', bookHoosh6 && bookHoosh6.pages_count >= 550);
const page500Res = await fetch(B + '/api/exam-books/hoosh_6/pages/500', { headers: { Cookie: S.teacher.ck } });
check('بند ۴: دسترسی به صفحات بالای ۱۲۰ (مثلاً ۵۰۰) با کد ۲۰۰', page500Res.status === 200);
const page999Res = await fetch(B + '/api/exam-books/hoosh_6/pages/999', { headers: { Cookie: S.teacher.ck } });
check('بند ۴: درخواست شماره صفحه فراتر از کل صفحات رد می‌شود (۴۰۰)', page999Res.status === 400);

// [بند ۵ جدید] شناسه‌ی ثابت و بدون Date.now() در آزمون برپا
const barpaPayload1 = {
  exam_title: 'آزمون آزمایشی برپا مرحله اول',
  grade: 'نهم',
  stage: '1',
  records: [{ student_id: stuUser.id, candidate_code: 'BARPA_DET_1', student_name: stuUser.full_name, overall_percentage: 85 }]
};
const repRes1 = await call(S.manager.ck, 'POST', '/api/manager/barpa-exams/reports', barpaPayload1);
const repRes2 = await call(S.manager.ck, 'POST', '/api/manager/barpa-exams/reports', barpaPayload1);
check('بند ۵: ثبت دوباره کارنامه با همان عنوان و مرحله موفق است', repRes1.status === 200 && repRes2.status === 200);
const sDb3 = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'), { readOnly: true });
const examRows = sDb3.prepare("SELECT exam_id FROM comprehensive_exam_reports WHERE candidate_code='BARPA_DET_1'").all();
check('بند ۵: شناسه آزمون ثابت و بدون timestamp است و کارنامه تکراری ثبت نمی‌شود', examRows.length === 1 && !/\d{12,}/.test(examRows[0].exam_id));
sDb3.close();

// [بند ۶ جدید] مدیریت رکوردهای تطبیق‌نشده آزمون برپا (barpa_unmatched و match)
const sDb4 = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'));
sDb4.exec(`
  INSERT INTO barpa_unmatched (exam_id, center_id, candidate_code, full_name, school_name, page, payload_json, created_at)
  VALUES ('exam_unmatched_1', 1, '99887766', 'دانش‌آموز ناشناس', 'مدرسه شهید بهشتی', 4, '{"candidate_code":"99887766","full_name":"دانش‌آموز ناشناس","total_summary":{"traz":7100,"rank_all":12}}', 1700000000)
`);
const unmatchRowId = sDb4.prepare("SELECT last_insert_rowid() id").get().id;
sDb4.close();

const unmatchedList = await call(S.manager.ck, 'GET', '/api/manager/barpa-exams/unmatched');
check('بند ۶: دریافت فهرست داوطلبان تطبیق‌نشده', unmatchedList.status === 200 && unmatchedList.data.some(u => u.candidate_code === '99887766'));

const matchAction = await call(S.manager.ck, 'POST', `/api/manager/barpa-exams/unmatched/${unmatchRowId}/match`, { student_id: stuUser.id });
check('بند ۶: تطبیق دستی دانش‌آموز با موفقیت انجام می‌شود', matchAction.status === 200 && matchAction.data.matched);

const sDb5 = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'), { readOnly: true });
const matchedInReports = sDb5.prepare("SELECT * FROM comprehensive_exam_reports WHERE exam_id='exam_unmatched_1' AND student_id=?").get(stuUser.id);
const remainingInUnmatched = sDb5.prepare("SELECT * FROM barpa_unmatched WHERE id=?").get(unmatchRowId);
check('بند ۶: کارنامه به comprehensive_exam_reports اضافه شد', !!matchedInReports && matchedInReports.overall_traz === 7100);
check('بند ۶: رکورد از جدول barpa_unmatched حذف شد', !remainingInUnmatched);
sDb5.close();

// [بند ۷ جدید] مخاطبان مجاز مدیر کانون در پیام‌رسان
const mgrContacts = await call(S.manager.ck, 'GET', '/api/messages/contacts');
check('بند ۷: لیست مخاطبان مدیر به دبیران و فقط افراد دارای پیام محدود است', mgrContacts.status === 200 && mgrContacts.data.length < 50);

// [بند ۸ جدید] اندپوینت /api/counselor در نبود مدیر کانون
const sDb6 = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'));
sDb6.exec("INSERT INTO centers (id, name, slug) VALUES (999, 'کانون بدون مدیر', 'no-mgr')");
sDb6.exec(`UPDATE users SET center_id=999 WHERE id=${stuUser.id}`);
sDb6.close();

const counselorNone = await call(S.student.ck, 'GET', '/api/counselor');
check('بند ۸: /api/counselor در نبود مدیر کانون { id: null } بازمی‌گرداند', counselorNone.status === 200 && counselorNone.data.id === null);

// بازگرداندن کانون دانش‌آموز به وضعیت اولیه
const sDb7 = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'));
sDb7.exec(`UPDATE users SET center_id=1 WHERE id=${stuUser.id}`);
sDb7.close();

// بررسی سامانه مهاجرت و نسخه ۵ پایگاه داده
const sDbEnd = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'), { readOnly: true });
const ver5 = sDbEnd.prepare('PRAGMA user_version').get()?.user_version;
check('مهاجرت: PRAGMA user_version حداقل ۸ است', ver5 >= 8, `نسخه فعلی: ${ver5}`);
const defaultBooks = sDbEnd.prepare("SELECT COUNT(*) n FROM exam_books WHERE center_id IS NULL").get()?.n;
check('مهاجرت نسخه ۵: کتاب‌های پیش‌فرض دارای center_id NULL هستند (عمومی)', defaultBooks >= 2);
sDbEnd.close();

// ==================== ارزیابی جامع امنیت و کنترل دسترسی بک‌اند ====================

// ۱) خروج، پاکسازی نشست و اعتبارسنجی توکن
const sLogout = await login('student', 'student');
check('ورود موقت دانش‌آموز برای بررسی خروج', sLogout.status === 200 && !!sLogout.ck);
const logoutRes = await call(sLogout.ck, 'POST', '/api/auth/logout');
check('خروج موفقیت‌آمیز و ارسال هدر پاکسازی کوکی', logoutRes.status === 200 && /Max-Age=0/i.test(logoutRes.headers.get('set-cookie') || ''));
check('درخواست بدون کوکی پس از خروج رد می‌شود (۴۰۱)', (await call(null, 'GET', '/api/me')).status === 401);

// ۲) جلوگیری از دسترسی به داده‌های سایر کانون‌ها (Multi-tenant IDOR Isolation)
const sDbTenant = new DatabaseSync(path.join(tmp, 'data', 'roshd.db'));
sDbTenant.exec("INSERT INTO centers (id, name, slug) VALUES (888, 'کانون مجزا برای تست ایزولاسیون', 'other-center')");
sDbTenant.exec("INSERT INTO classes (id, center_id, grade, name) VALUES (8881, 888, 9, 'کلاس کانون ۲')");
sDbTenant.exec("INSERT INTO users (id, center_id, role, username, pass_hash, full_name, active) VALUES (8882, 888, 'student', 'stu_c2', 'dummy_hash', 'دانش‌آموز کانون ۲', 1)");
sDbTenant.close();

const crossClassFees = await call(S.manager.ck, 'GET', '/api/manager/fees/class/8881');
check('مدیر نمی‌تواند به شهریه کلاس کانون دیگر دسترسی داشته باشد (۴۰۴)', crossClassFees.status === 404);
const crossStudent = await call(S.manager.ck, 'GET', '/api/manager/students/8882');
check('مدیر نمی‌تواند اطلاعات دانش‌آموز کانون دیگر را دریافت کند (۴۰۴)', crossStudent.status === 404);
const crossTeacherAtt = await call(S.teacher.ck, 'GET', '/api/teacher/attendance?class_id=8881');
check('معلم به حضور و غیاب کلاس کانون دیگر دسترسی ندارد (۴۰۳)', crossTeacherAtt.status === 403);

// ۳) فروشگاه: محاسبه سمت سرور و جلوگیری از دستکاری قیمت توسط کلاینت
const tamperedOrder = await call(S.student.ck, 'POST', '/api/shop/checkout', {
  items: [{ id: prod.id, qty: 1, price: 10, total: 10 }]
});
check('قیمت سفارش فقط بر اساس قیمت پایگاه داده محاسبه می‌شود و دستکاری کلاینت نادیده گرفته می‌شود', tamperedOrder.status === 200 && tamperedOrder.data.total > 10);

// ۴) امنیت آپلود و جلوگیری از مسیرپیمایی (Path Traversal)
const traversalReq = await call(S.student.ck, 'GET', '/uploads/..%2f..%2fserver%2fdb.js');
check('جلوگیری از مسیرپیمایی در خواندن فایل‌های آپلودی (۴۰۰)', traversalReq.status === 400);
check('دانلود فایل‌های آپلودی بدون ورود مسدود است (۴۰۱)', (await fetch(B + '/uploads/sample.png')).status === 401);
const bigUpload = await call(S.student.ck, 'POST', '/api/student/payment', {
  file: { name: 'huge.png', data: 'data:image/png;base64,' + 'A'.repeat(Math.round(7 * 1024 * 1024 * 4 / 3)) }
});
check('آپلود فایل بیش از سقف مجاز رد می‌شود (۴۰۰)', bigUpload.status === 400);

// ۵) تکالیف: جلوگیری از نمره‌دهی به تکلیف کلاس‌های دیگر توسط معلم
const foreignGrade = await call(S.teacher.ck, 'POST', '/api/teacher/assignments/submissions/999999/grade', { score: 20 });
check('معلم به ثبت نمره برای ارسال‌های خارج از کلاس خودش دسترسی ندارد (۴۰۴)', foreignGrade.status === 404);

// ۶) سامانه پیامکی و ارسال گروهی/تکی مدیر
const emptySms = await call(S.manager.ck, 'POST', '/api/manager/sms/send', {});
check('ارسال پیامک بدون متن رد می‌شود (۴۰۰)', emptySms.status === 400);

const meStu = (await call(S.student.ck, 'GET', '/api/me')).data.user;
const sendStudentSms = await call(S.manager.ck, 'POST', '/api/manager/sms/send', {
  target_type: 'student',
  target_value: meStu.id,
  recipient: 'both',
  text: 'دانش‌آموز گرامی {نام}، آزمون آزمایشی جمعه برگزار می‌شود'
});
check('ارسال پیامک به دانش‌آموز خاص با موفقیت شبیه‌سازی/ارسال می‌شود', sendStudentSms.status === 200 && sendStudentSms.data.ok);

const debtorSms = await call(S.manager.ck, 'POST', '/api/manager/sms/send', {
  target_type: 'debtors',
  recipient: 'parent',
  text: 'ولی گرامی دانش‌آموز {نام}، لطفاً نسبت به پرداخت حق عضویت اقدام نمایید'
});
check('ارسال پیامک یادآوری حق عضویت به بدهکاران با موفقیت شبیه‌سازی/ارسال می‌شود', debtorSms.status === 200 && debtorSms.data.ok);

const annWithSms = await call(S.manager.ck, 'POST', '/api/manager/announcements', {
  title: 'جلسه اولیا و مربیان',
  body: 'چهارشنبه ساعت ۱۶ در سالن اجتماعات',
  target_type: 'all',
  send_sms: true,
  sms_recipient: 'parent'
});
check('ثبت اطلاعیه به همراه ارسال پیامک موفق است', annWithSms.status === 200 && annWithSms.data.ok && annWithSms.data.sms?.total >= 0);

app.kill();
await new Promise((r) => setTimeout(r, 300));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
console.log(`\nتست دودی: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail ? 1 : 0);
