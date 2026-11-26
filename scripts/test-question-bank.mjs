// تست جامع واحد، یکپارچگی و انتهابه‌انتهای بانک سؤالات و موتور آزمون (بدون نیاز به API هوش مصنوعی)
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeZip, readZip, sanitizeSvg } from '../server/qb-zip.js';
import { buildXlsx, parseXlsx, XLSX_COLUMNS } from '../server/qb-xlsx.js';
import { validateQuestion, normalizeText } from '../server/qb-validator.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-qb-test-'));
const env = { ...process.env, PORT: '3993', ROSHD_DATA_DIR: path.join(tmp, 'data'), ROSHD_UPLOAD_DIR: path.join(tmp, 'uploads') };

let passed = 0;
function check(name, cond) {
  assert.ok(cond, `FAILED: ${name}`);
  passed++;
  console.log(`✓ ${name}`);
}

// ۱. تست‌های واحد (ZIP, SVG Sanitize, XLSX, Normalize, Validator)
{
  const cleanSvg = sanitizeSvg('<svg onload="alert(1)"><script>evil()</script><rect width="10" height="10"/></svg>');
  check('پاکسازی SVG ناامن', !cleanSvg.includes('<script') && !cleanSvg.includes('onload'));

  const zip = writeZip([['a.txt', 'سلام']]);
  const read = readZip(zip);
  check('ساخت و خواندن ZIP سالم', read.get('a.txt')?.toString('utf8') === 'سلام');

  const xlsxBuf = buildXlsx([XLSX_COLUMNS, ['E1', 4, 'MATH-04', '1405', 1, 'الگو', 4, '4', 'الگو', 'single_choice', 2, '۲+۲؟', '۳', '۴', '۵', '۶', 'b', 'جمع', 1, 30, 'ریاضی']]);
  const parsed = parseXlsx(xlsxBuf);
  check('ساخت و خواندن فایل XLSX', parsed.length === 2 && parsed[1][0] === 'E1');

  check('نرمال‌سازی حروف فارسی/عربی/اعداد/نیم‌فاصله', normalizeText('كِتابِ‌۱۲۳ ي') === 'کتاب 123 ی');

  const badQ = validateQuestion({ type: 'single_choice', stem: '', source: { primary_page: 999 }, options: [{ id: 'a', text: '۱' }, { id: 'b', text: '۱' }], answer: { correct_option_ids: ['z'] } }, { printedPages: 154 });
  check('تشخیص خطاهای ساختاری سؤال (صفحه، متن، گزینه تکراری، پاسخ نامعتبر)', !badQ.valid && badQ.errors.length >= 4);
}

// ۲. تست‌های یکپارچگی و End-to-End سرور
if (spawnSync(process.execPath, ['server/seed.js'], { env, stdio: 'ignore' }).status !== 0) {
  throw new Error('Seed failed');
}

const server = spawn(process.execPath, ['server/index.js'], { env, stdio: 'ignore' });
const base = 'http://127.0.0.1:3993';

async function apiCall(cookie, method, urlPath, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + urlPath, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}

async function login(role, identifier, password) {
  const r = await apiCall('', 'POST', '/api/auth/login', { role, identifier, password });
  assert.equal(r.status, 200, `Login failed for ${role}/${identifier}: ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
}

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  const mgrCk = await login('manager', 'manager', '123456');
  const t4Ck = await login('teacher', 'teacher2', '123456'); // معلم ریاضی پایه ۴، ۵، ۶
  const t9Ck = await login('teacher', 'teacher3', '123456'); // معلم علوم ۴..۹
  const stu4Ck = await login('student', 'student5', '123456'); // دانش‌آموز پایه ۵ — بیایید یک کتاب پایه ۵ بسازیم یا به پایه ۴ اضافه کنیم

  // دانش‌آموز پایه ۴ برای تست math-4 (با کد ملی معتبر)
  const nine = '009988776';
  const s = [...nine].reduce((a, d, i) => a + Number(d) * (10 - i), 0) % 11;
  const nc4 = nine + (s < 2 ? s : 11 - s);
  const stu4 = await apiCall(mgrCk, 'POST', '/api/manager/students', {
    full_name: 'تست چهارم', national_code: nc4, grade: 4, parent_phone: '09129988776', gender: 'm',
  });
  check('ساخت دانش‌آموز پایه ۴ برای تست', stu4.status === 200);
  const s4Ck = await login('student', nc4, nc4);

  // امنیت نقش‌ها: دانش‌آموز نباید به مدیریت بانک سؤال دسترسی داشته باشد
  check('دانش‌آموز به فهرست مدیریت بانک سؤال دسترسی ندارد (403)', (await apiCall(s4Ck, 'GET', '/api/qb/questions')).status === 403);
  check('دانش‌آموز به بارگذاری گروهی دسترسی ندارد (403)', (await apiCall(s4Ck, 'POST', '/api/qb/import/validate', {})).status === 403);

  // امنیت درس/پایه معلم: معلم علوم نباید به math-4 دسترسی داشته باشد
  check('معلم علوم به کتاب ریاضی چهارم دسترسی ندارد (403)', (await apiCall(t9Ck, 'GET', '/api/qb/books/math-4')).status === 403);

  // ثبت دستی سؤال (با فرمول LaTeX)، کپی، ویرایش و انتشار
  const manualRes = await apiCall(t4Ck, 'POST', '/api/qb/questions', {
    book_id: 'math-4',
    source: { primary_page: 12, pages: [12, 13] },
    type: 'single_choice',
    difficulty: 2,
    topic: 'الگو',
    stem: 'حاصل $\\frac{1}{2}+\\frac{1}{2}$ چیست؟',
    options: [{ id: 'a', text: '۱' }, { id: 'b', text: '۲' }, { id: 'c', text: '۳' }, { id: 'd', text: '۴' }],
    answer: { correct_option_ids: ['a'] },
    explanation: 'مجموع دو نیمه برابر ۱ است.',
    score: 1,
    status: 'published',
  });
  check('ثبت دستی سؤال توسط معلم', manualRes.status === 200 && manualRes.json.id > 0);
  const q1Id = manualRes.json.id;

  const cloneRes = await apiCall(t4Ck, 'POST', `/api/qb/questions/${q1Id}/clone`, {});
  check('کپی سؤال در پیش‌نویس', cloneRes.status === 200 && cloneRes.json.id > q1Id);

  const editRes = await apiCall(t4Ck, 'PUT', `/api/qb/questions/${q1Id}`, {
    source: { primary_page: 12, pages: [12] },
    type: 'single_choice',
    difficulty: 2,
    topic: 'الگو',
    stem: 'حاصل عبارت $\\frac{1}{2}+\\frac{1}{2}$ کدام است؟',
    options: [{ id: 'a', text: '۱' }, { id: 'b', text: '۲' }, { id: 'c', text: '۳' }, { id: 'd', text: '۴' }],
    answer: { correct_option_ids: ['a'] },
    score: 1,
    status: 'published',
  });
  check('ویرایش سؤال و افزایش نسخه', editRes.status === 200 && editRes.json.version === 2);

  // بارگذاری ZIP استاندارد با تصویر SVG و أنواع سؤال
  const zipPkg = fs.readFileSync('templates/question-package-example.zip');
  const valZip = await apiCall(t4Ck, 'POST', '/api/qb/import/validate', {
    book_id: 'math-4', format: 'zip', filename: 'example.zip', content_base64: zipPkg.toString('base64'),
  });
  check('اعتبارسنجی بسته ZIP استاندارد', valZip.status === 200 && valZip.json.summary.valid_count === 4);

  const comZip = await apiCall(t4Ck, 'POST', `/api/qb/import/${valZip.json.batch_id}/commit`, { auto_publish: true });
  check('ثبت و انتشار سؤالات بسته ZIP', comZip.status === 200 && comZip.json.imported_count === 4);

  // بارگذاری مجدد همان ZIP -> تشخیص تکراری
  const reValZip = await apiCall(t4Ck, 'POST', '/api/qb/import/validate', {
    book_id: 'math-4', format: 'zip', filename: 'example.zip', content_base64: zipPkg.toString('base64'),
  });
  check('تشخیص سؤالات تکراری در بارگذاری مجدد', reValZip.status === 200 && reValZip.json.summary.duplicate_count === 4);

  // بارگذاری Excel (.xlsx)
  const xlsxBuf = fs.readFileSync('templates/question-bank-template.xlsx');
  const valXlsx = await apiCall(t4Ck, 'POST', '/api/qb/import/validate', {
    book_id: 'math-4', format: 'xlsx', filename: 'template.xlsx', content_base64: xlsxBuf.toString('base64'),
  });
  check('اعتبارسنجی فایل اکسل (.xlsx)', valXlsx.status === 200 && valXlsx.json.summary.valid_count === 2);
  await apiCall(t4Ck, 'POST', `/api/qb/import/${valXlsx.json.batch_id}/commit`, { auto_publish: true });

  // تصویر ناموجود در ZIP
  const badImgZip = writeZip([
    ['manifest.json', JSON.stringify({ schema_version: '1.0', package_id: 'p1', title: 't', language: 'fa-IR', book: { title: 'r', grade: 4, edition: '1405' } })],
    ['questions.json', JSON.stringify([{ external_id: 'MISS-1', type: 'single_choice', source: { primary_page: 5 }, difficulty: 2, stem: 'سؤال', assets: [{ path: 'assets/missing.png', role: 'question_image' }], options: [{ id: 'a', text: '۱' }, { id: 'b', text: '۲' }], answer: { correct_option_ids: ['a'] } }])],
  ]);
  const valMiss = await apiCall(t4Ck, 'POST', '/api/qb/import/validate', {
    book_id: 'math-4', format: 'zip', filename: 'miss.zip', content_base64: badImgZip.toString('base64'),
  });
  check('تشخیص تصویر ناموجود و خطای ساختاری', valMiss.status === 200 && valMiss.json.summary.missing_assets_count === 1);

  // ثبت سؤال‌های چندپاسخی، جای‌خالی، وصل‌کردنی، مرتب‌سازی و ناحیه تصویر برای آزمون کامل
  const extraTypes = [
    { type: 'multiple_choice', source: { primary_page: 4 }, stem: 'اعداد زوج را انتخاب کنید', options: [{ id: 'a', text: '۲' }, { id: 'b', text: '۳' }, { id: 'c', text: '۴' }], answer: { correct_option_ids: ['a', 'c'] }, status: 'published' },
    { type: 'true_false', source: { primary_page: 4 }, stem: 'عدد ۲ اول است.', answer: { value: true }, status: 'published' },
    { type: 'fill_blank', source: { primary_page: 4 }, stem: 'پایتخت ایران ___ است.', answer: { accepted: ['تهران'] }, status: 'published' },
  ];
  for (const eq of extraTypes) await apiCall(t4Ck, 'POST', '/api/qb/questions', { book_id: 'math-4', ...eq });

  // گزارش پوشش صفحات کتاب
  const cov = await apiCall(t4Ck, 'GET', '/api/qb/books/math-4/coverage');
  check('گزارش پوشش صفحات کتاب', cov.status === 200 && cov.json.summary.covered_pages >= 4);

  // ساخت آزمون دانش‌آموز از یک صفحه (صفحه ۴)
  const buildPage = await apiCall(s4Ck, 'POST', '/api/qb/exams/build', {
    book_id: 'math-4', scope_type: 'pages', from_page: 4, to_page: 4, question_count: 10, difficulty_mode: 'mixed',
  });
  check('ساخت آزمون از صفحه ۴ و عدم افشای پاسخ صحیح', buildPage.status === 200 && buildPage.json.questions.length >= 4 && buildPage.json.shortage > 0 && buildPage.json.questions.every((q) => !q.answer_json && !q.correct_answer && !q.explanation));

  // عدم دسترسی به کارنامه قبل از ثبت نهایی
  check('مسدود بودن کارنامه پیش از ثبت نهایی آزمون', (await apiCall(s4Ck, 'GET', `/api/qb/attempts/${buildPage.json.attempt_id}/report`)).status === 403);

  // پاسخ‌دهی، ذخیره خودکار و ثبت نهایی آزمون
  const answers = {};
  for (const q of buildPage.json.questions) {
    if (q.type === 'single_choice') answers[q.id] = 'c';
    else if (q.type === 'multiple_choice') answers[q.id] = ['a', 'c'];
    else if (q.type === 'true_false') answers[q.id] = true;
    else if (q.type === 'fill_blank') answers[q.id] = 'تهران';
  }
  const autoSave = await apiCall(s4Ck, 'POST', `/api/qb/attempts/${buildPage.json.attempt_id}/autosave`, { answers, flagged: [] });
  check('ذخیره خودکار پاسخ‌های آزمون', autoSave.status === 200);

  const subRes = await apiCall(s4Ck, 'POST', `/api/qb/attempts/${buildPage.json.attempt_id}/submit`, { answers });
  check('ثبت نهایی و تصحیح خودکار آزمون', subRes.status === 200);

  const rep = await apiCall(s4Ck, 'GET', `/api/qb/attempts/${buildPage.json.attempt_id}/report`);
  check('دریافت کارنامه کامل با تفکیک صفحه و توضیح پاسخ', rep.status === 200 && rep.json.attempt.correct_count >= 3 && rep.json.breakdown.pages.length >= 1);

  const pagePerf = await apiCall(s4Ck, 'GET', '/api/qb/performance/pages');
  check('ثبت گزارش یادگیری صفحه‌محور دانش‌آموز', pagePerf.status === 200 && pagePerf.json.some((p) => p.page_number === 4));

  // آزمون رسمی معلم با سؤال تشریحی و تصحیح معلم
  const offBuild = await apiCall(t4Ck, 'POST', '/api/qb/exams/build', {
    mode: 'official', title: 'آزمون رسمی فصل ۱', book_id: 'math-4', question_count: 5, include_descriptive: true, duration_minutes: 20,
  });
  check('ساخت آزمون رسمی توسط معلم', offBuild.status === 200 && offBuild.json.exam_id > 0);

  const offTake = await apiCall(s4Ck, 'GET', `/api/qb/exams/${offBuild.json.exam_id}`);
  const offAttId = offTake.json.attempt.id;
  const offAns = {};
  for (const q of offTake.json.questions) {
    if (q.type === 'descriptive') offAns[q.id] = 'تفاوت عددهای متوالی را بررسی می‌کنیم';
  }
  await apiCall(s4Ck, 'POST', `/api/qb/attempts/${offAttId}/submit`, { answers: offAns });
  const subs = await apiCall(t4Ck, 'GET', `/api/qb/exams/${offBuild.json.exam_id}/submissions`);
  check('مشاهده برگه‌های ارسالی توسط معلم', subs.status === 200 && subs.json.length === 1);

  const descQ = offTake.json.questions.find((q) => q.type === 'descriptive');
  if (descQ) {
    const gr = await apiCall(t4Ck, 'POST', `/api/qb/attempts/${offAttId}/grade`, { manual_scores: { [descQ.id]: 1.5 } });
    check('تصحیح تشریحی معلم و ثبت نمره نهایی', gr.status === 200);
  }

  console.log(`\nALL QUESTION BANK TESTS PASSED (${passed} checks)!`);
} finally {
  server.kill();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
