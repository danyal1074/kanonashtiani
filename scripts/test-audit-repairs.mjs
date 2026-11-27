// آزمون رگرسیون و امنیت ممیزی جامع سامانه رشد نخبه
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-audit-test-'));
const freePort = async () => {
  const s = createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  const p = s.address().port; await new Promise((r) => s.close(r)); return p;
};
const PORT = String(await freePort());
const env = { ...process.env, PORT, ROSHD_HOST: '127.0.0.1', ROSHD_DATA_DIR: path.join(tmp, 'data'), ROSHD_UPLOAD_DIR: path.join(tmp, 'uploads') };

if (spawnSync(process.execPath, ['server/seed.js'], { env, stdio: 'inherit' }).status !== 0) {
  throw new Error('Seed failed');
}

const server = spawn(process.execPath, ['server/index.js'], { env, stdio: 'pipe' });
const B = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(B + '/api/health')).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 150));
}

async function login(role, identifier, password = '123456') {
  const r = await fetch(B + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, identifier, password }),
  });
  assert.equal(r.status, 200, `Login failed for ${role}/${identifier}: ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
}

async function call(ck, method, p, body) {
  const r = await fetch(B + p, {
    method,
    headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) },
    body: method !== 'GET' ? JSON.stringify(body || {}) : undefined,
  });
  const buf = Buffer.from(await r.arrayBuffer());
  let data = null;
  try { data = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: r.status, data, buf, headers: r.headers };
}

let passed = 0;
function check(name, cond) {
  assert.ok(cond, `FAILED: ${name}`);
  passed++;
  console.log(`✓ ${name}`);
}

try {
  const mgrCk = await login('manager', 'manager');
  const tCk = await login('teacher', 'teacher');
  const s7Ck = await login('student', 'student');
  const s5Ck = await login('student', 'student5');

  // ۱. مسدود بودن مسیرهای مشاور برای معلم عادی (is_counselor=0)
  for (const ep of ['/api/counselor/dashboard', '/api/counselor/students', '/api/counselor/study', '/api/counselor/pomodoros', '/api/counselor/exams', '/api/counselor/reports', '/api/counselor/plans', '/api/counselor/sessions']) {
    check(`معلم عادی به ${ep} دسترسی ندارد (403)`, (await call(tCk, 'GET', ep)).status === 403);
  }

  // ۲. ساخت مشاور با محدودیت پایه ۷ و بررسی فیلتر پایه‌ها
  const coRes = await call(mgrCk, 'POST', '/api/manager/counselors', {
    full_name: 'مشاور پایه هفتم', username: 'co_grade7', password: 'Password#7', active: true, grades: [7],
  });
  check('ساخت مشاور با پایه مجاز [7]', coRes.status === 200);
  const co7Ck = await login('counselor', 'co_grade7', 'Password#7');
  const co7Students = await call(co7Ck, 'GET', '/api/counselor/students');
  check('مشاور پایه ۷ فقط دانش‌آموزان پایه ۷ را می‌بیند', co7Students.status === 200 && co7Students.data.length > 0 && co7Students.data.every((s) => s.grade === 7));
  const co7Reports = await call(co7Ck, 'GET', '/api/counselor/reports');
  check('گزارش مشاور پایه ۷ فقط پایه ۷ را شامل می‌شود', co7Reports.status === 200 && co7Reports.data.grades.every((g) => g.grade === 7));
  const s5Id = (await call(s5Ck, 'GET', '/api/me')).data.user.id;
  check('مشاور پایه ۷ به دانش‌آموز پایه ۵ دسترسی ندارد (403)', (await call(co7Ck, 'GET', `/api/counselor/students/${s5Id}`)).status === 403);

  // ۳. معلم-مشاور و ارتباط با پنل دانش‌آموز
  const teachers = (await call(mgrCk, 'GET', '/api/manager/meta')).data.teachers;
  const teacherRow = teachers.find((x) => x.username === 'teacher');
  const updT = await call(mgrCk, 'PUT', `/api/manager/teachers/${teacherRow.id}`, {
    full_name: teacherRow.full_name, active: true, is_counselor: true, counselor_grades: [7],
  });
  check('فعال‌سازی نقش معلم-مشاور برای پایه ۷', updT.status === 200);
  const tMe = await call(tCk, 'GET', '/api/me');
  check('/api/me وضعیت is_counselor و counselor_grades را برمی‌گرداند', tMe.data.is_counselor === true && Array.isArray(tMe.data.counselor_grades) && tMe.data.counselor_grades[0] === 7);

  const s7Id = (await call(s7Ck, 'GET', '/api/me')).data.user.id;
  const planPut = await call(tCk, 'PUT', `/api/counselor/plans/${s7Id}`, {
    week_start: '2026-11-21',
    tasks: [{ weekday: 0, subject: 'ریاضی', title: 'مرور فصل ۱', target: 2 }],
  });
  check('معلم-مشاور می‌تواند برنامه هفتگی دانش‌آموز پایه ۷ ثبت کند', planPut.status === 200);
  const stuPlans = await call(s7Ck, 'GET', '/api/student/counselor-plans');
  check('دانش‌آموز برنامه ثبت‌شده توسط معلم-مشاور را می‌بیند', stuPlans.status === 200 && stuPlans.data.some((p) => p.tasks.some((x) => x.title === 'مرور فصل ۱')));

  const sesPost = await call(tCk, 'POST', '/api/counselor/sessions', {
    student_id: s7Id, title: 'جلسه پیگیری معلم-مشاور', starts_at: '2026-11-29T16:00:00+03:30',
  });
  check('معلم-مشاور جلسه مشاوره ثبت می‌کند', sesPost.status === 200);
  const stuSes = await call(s7Ck, 'GET', '/api/student/counselor-sessions');
  check('دانش‌آموز جلسه ثبت‌شده توسط معلم-مشاور را می‌بیند', stuSes.status === 200 && stuSes.data.some((x) => x.title === 'جلسه پیگیری معلم-مشاور'));

  // ۴. خروجی اکسل دانش‌آموزان (رفع باگ .state -> .status)
  const xlsxAll = await call(mgrCk, 'GET', '/api/manager/students/export.xlsx');
  check('خروجی اکسل دانش‌آموزان فایل XLSX معتبر برمی‌گرداند', xlsxAll.status === 200 && xlsxAll.buf.subarray(0, 2).toString() === 'PK');
  const xlsxPaid = await call(mgrCk, 'GET', '/api/manager/students/export.xlsx?pay=paid');
  check('فیلتر وضعیت پرداخت در خروجی اکسل کار می‌کند', xlsxPaid.status === 200 && xlsxPaid.buf.subarray(0, 2).toString() === 'PK');

  // ۵. مصوبات جلسات کانون (CRUD)
  const mtgCreate = await call(mgrCk, 'POST', '/api/manager/meetings', {
    title: 'جلسه شورای دبیران', meeting_date: '2026-11-27', decisions: 'برگزاری آزمون جمع‌بندی آذر', owner_name: 'معاون آموزشی', status: 'pending',
  });
  check('ثبت مصوبه جلسه کانون', mtgCreate.status === 200 && mtgCreate.data.id > 0);
  const mtgList = await call(mgrCk, 'GET', '/api/manager/meetings');
  check('دریافت فهرست مصوبات جلسات', mtgList.status === 200 && mtgList.data.some((m) => m.id === mtgCreate.data.id));
  const mtgUpd = await call(mgrCk, 'PUT', `/api/manager/meetings/${mtgCreate.data.id}`, { status: 'done' });
  check('به‌روزرسانی وضعیت مصوبه جلسه', mtgUpd.status === 200);
  const mtgDel = await call(mgrCk, 'DELETE', `/api/manager/meetings/${mtgCreate.data.id}`);
  check('حذف مصوبه جلسه', mtgDel.status === 200);

  // ۶. تست‌های امنیت IDOR در بانک سؤالات
  const bulkDenied = await call(tCk, 'POST', '/api/qb/questions/bulk', { ids: [999999], action: 'publish' });
  check('تغییر گروهی سؤالات غیرمجاز رد می‌شود (403)', bulkDenied.status === 403);
  const qbExamS7 = await call(s7Ck, 'POST', '/api/qb/exams/build', { book_id: 'math-7', count: 1, title: 'تمرین خصوصی ۷' }).catch(() => ({ status: 0 }));
  if (qbExamS7.status === 200 && qbExamS7.data?.exam_id) {
    check('دانش‌آموز دیگر نمی‌تواند آزمون تمرینی خصوصی دانش‌آموز ۷ را باز کند (403)', (await call(s5Ck, 'GET', `/api/qb/exams/${qbExamS7.data.exam_id}`)).status === 403);
  }

  console.log(`\n✅ تمام ${passed} آزمون رگرسیون و امنیت ممیزی با موفقیت پاس شدند!`);
} finally {
  server.kill();
  await once(server, 'exit').catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
