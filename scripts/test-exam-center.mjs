// تست یکپارچگی مرکز آزمون یکپارچه، ۱۲ کتاب درسی، یادداشت کتاب، مصوبات جلسات، اکسل دانش‌آموزان و معلم-مشاور
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseXlsx } from '../server/qb-xlsx.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-ec-test-'));
const port = 4100 + Math.floor(Math.random() * 500);
const env = { ...process.env, PORT: String(port), ROSHD_DATA_DIR: path.join(tmp, 'data'), ROSHD_UPLOAD_DIR: path.join(tmp, 'uploads') };

if (spawnSync(process.execPath, ['server/seed.js'], { env, stdio: 'ignore' }).status !== 0) throw new Error('Seed failed');
const server = spawn(process.execPath, ['server/index.js'], { env, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;

let passed = 0;
const check = (name, cond) => { assert.ok(cond, `FAILED: ${name}`); passed++; console.log(`✓ ${name}`); };

async function apiCall(cookie, method, urlPath, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}

async function login(role, identifier, password) {
  const r = await apiCall('', 'POST', '/api/auth/login', { role, identifier, password });
  assert.equal(r.status, 200, `Login failed: ${role}/${identifier}`);
  return r.headers.get('set-cookie').split(';')[0];
}

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  const mgrCk = await login('manager', 'manager', '123456');
  const tCk = await login('teacher', 'teacher2', '123456');
  const stu5Ck = await login('student', 'student5', '123456'); // پایه ۵

  // ۱. ۱۲ کتاب درسی: معلم همه ۱۲ کتاب را می‌بیند، دانش‌آموز پایه ۵ فقط کتاب‌های پایه ۵ را
  const tBooks = await apiCall(tCk, 'GET', '/api/textbooks');
  check('معلم همه ۱۲ کتاب درسی را می‌بیند', tBooks.status === 200 && Array.isArray(tBooks.json?.books) && tBooks.json.books.length === 12);

  const s5Books = await apiCall(stu5Ck, 'GET', '/api/textbooks');
  check('دانش‌آموز پایه ۵ فقط کتاب‌های پایه پنجم را می‌بیند', s5Books.status === 200 && Array.isArray(s5Books.json?.books) && s5Books.json.books.length === 2 && s5Books.json.books.every((b) => b.grade === 5));

  // ۲. یادداشت‌برداری روی صفحه کتاب
  const saveNote = await apiCall(stu5Ck, 'PUT', '/api/textbooks/math-5/notes/4', { note_text: 'نکته مهم فصل اول' });
  const getNote = await apiCall(stu5Ck, 'GET', '/api/textbooks/math-5/notes/4');
  check('ذخیره و بازیابی یادداشت روی صفحه کتاب', saveNote.status === 200 && getNote.json.note_text === 'نکته مهم فصل اول');

  // ۳. مرکز آزمون دانش‌آموز و تمرین سریع ۵ سؤالی
  const ecHome = await apiCall(stu5Ck, 'GET', '/api/exam-center/student/home');
  check('داشبورد مرکز آزمون دانش‌آموز', ecHome.status === 200 && ecHome.json.stats != null);

  const qp = await apiCall(stu5Ck, 'POST', '/api/exam-center/student/quick-practice', {});
  check('تمرین سریع ۱ کلیکی دانش‌آموز', qp.status === 200 && qp.json.exam_id > 0);

  // ۴. خروجی اکسل (.xlsx) دانش‌آموزان با فیلتر
  const xlsxRes = await fetch(base + '/api/manager/students/export.xlsx?grade=5', { headers: { Cookie: mgrCk } });
  const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer());
  const rows = parseXlsx(xlsxBuf);
  check('خروجی اکسل دانش‌آموزان با فیلتر پایه', xlsxRes.status === 200 && rows.length > 1 && rows.slice(1).every((r) => String(r[3]) === '5'));

  // ۵. مصوبات جلسات کانون
  const mCreate = await apiCall(mgrCk, 'POST', '/api/manager/meetings', { title: 'جلسه اول', meeting_date: '2026-11-27', decisions: 'برگزاری آزمون ماهانه', owner_name: 'معاون' });
  const mList = await apiCall(mgrCk, 'GET', '/api/manager/meetings');
  check('ثبت و دریافت مصوبات جلسات', mCreate.status === 200 && mList.json.some((m) => m.title === 'جلسه اول'));

  // ۶. تعیین پایه‌های مشاور و معلم-مشاور
  const coRes = await apiCall(mgrCk, 'POST', '/api/manager/counselors', { full_name: 'مشاور پنجم', username: 'co5', password: '123456', grades: [5] });
  check('ساخت مشاور با محدوده پایه ۵', coRes.status === 200);
  const coCk = await login('counselor', 'co5', '123456');
  const coSts = await apiCall(coCk, 'GET', '/api/counselor/students');
  check('مشاور فقط دانش‌آموزان پایه ۵ را می‌بیند', coSts.status === 200 && coSts.json.length > 0 && coSts.json.every((s) => s.grade === 5));

  // معلم-مشاور
  const tList = await apiCall(mgrCk, 'GET', '/api/manager/meta');
  const t2 = tList.json.teachers.find((x) => x.username === 'teacher2');
  await apiCall(mgrCk, 'PUT', `/api/manager/teachers/${t2.id}`, { is_counselor: true, counselor_grades: [4, 5] });
  const tMe = await apiCall(tCk, 'GET', '/api/me');
  check('معلم-مشاور در /api/me با پایه‌های ۴ و ۵', tMe.json.is_counselor === true && tMe.json.counselor_grades.includes(5));
  const tcSts = await apiCall(tCk, 'GET', '/api/counselor/students');
  check('معلم-مشاور به API مشاور در محدوده پایه‌هایش دسترسی دارد', tcSts.status === 200 && tcSts.json.every((s) => [4, 5].includes(s.grade)));

  // ۷. حذف امن سؤال توسط معلم
  const qDel = await apiCall(tCk, 'POST', '/api/qb/questions', {
    book_id: 'math-5', source: { primary_page: 5 }, type: 'true_false', stem: 'سؤال قابل حذف', answer: { value: true }, status: 'draft',
  });
  const delRes = await apiCall(tCk, 'DELETE', `/api/qb/questions/${qDel.json.id}`);
  check('حذف سؤال توسط معلم', delRes.status === 200);

  console.log(`\nALL EXAM CENTER & NEW FEATURES TESTS PASSED (${passed} checks)!`);
} finally {
  server.kill();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
