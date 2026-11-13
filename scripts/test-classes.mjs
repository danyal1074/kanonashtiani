// Isolated route-handler tests for the manager's class management (rename, safe delete/merge, boys/girls setup).
// Uses the real handlers, signed sessions and a throw-away SQLite database; no listening socket is needed.
// Run: node scripts/test-classes.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-classes-'));
process.env.ROSHD_DATA_DIR = path.join(tmp, 'data');
process.env.ROSHD_UPLOAD_DIR = path.join(tmp, 'uploads');
const { db, closeDb } = await import('../server/db.js');
const { hashPassword, readToken, HttpError } = await import('../server/util.js');
const { Router, COOKIE, parseCookies } = await import('../server/http.js');
const { default: registerCommon } = await import('../server/routes/common.js');
const { default: registerManager } = await import('../server/routes/manager.js');
const { default: registerClasses } = await import('../server/routes/classes.js');
const { importStudents } = await import('../server/importer.js');
const password = 'ClassTest#123';
let checks = 0;
const test = async (name, fn) => { await fn(); checks++; console.log(`✓ ${name}`); };

// ----- fixture: center 1 has grade 7 (الف/ب) and grade 8 (الف/ب); center 2 is a different tenant -----
function fixture() {
  const passHash = hashPassword(password);
  db.exec(`INSERT INTO centers(id,name,slug) VALUES(1,'کانون آشتیانی','ashtiani'),(2,'Other','other');
    INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,7,'الف'),(2,1,7,'ب'),(3,1,8,'الف'),(4,1,8,'ب'),(9,2,7,'الف');`);
  const user = db.prepare('INSERT INTO users(id,center_id,role,username,pass_hash,full_name,gender,active) VALUES(?,?,?,?,?,?,?,?)');
  user.run(41, 1, 'manager', 'm-one', passHash, 'مدیر', 'm', 1);
  user.run(42, 2, 'manager', 'm-other', passHash, 'مدیر دیگر', 'm', 1);
  user.run(43, 1, 'teacher', 't-one', passHash, 'معلم', 'm', 1);
  // grade 7: الف = 3 boys + 1 girl (mis-registered?), ب = 5 girls + 1 inactive girl
  const st = db.prepare('INSERT INTO students(user_id,grade,class_id) VALUES(?,?,?)');
  let id = 100;
  const add = (name, gender, grade, cls, active = 1) => { user.run(++id, 1, 'student', `s${id}`, passHash, name, gender, active); st.run(id, grade, cls); return id; };
  add('علی', 'm', 7, 1); add('رضا', 'm', 7, 1); add('محمد', 'm', 7, 1); add('سارا', 'f', 7, 1);
  for (const n of ['زهرا', 'مریم', 'فاطمه', 'نرگس', 'پریسا']) add(n, 'f', 7, 2);
  add('غیرفعال', 'f', 7, 2, 0);
  add('امیر', 'm', 8, 3); add('نیما', 'm', 8, 3); add('الهام', 'f', 8, 4); add('ژاله', 'f', 8, 4);
  user.run(300, 2, 'student', 'foreign', passHash, 'دانش‌آموز دیگر', 'f', 1); st.run(300, 7, 9);
  // data hanging off class 2 (grade-7 girls) and class 1
  db.exec(`INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(43,2,'ریاضی'),(43,2,'علوم'),(43,1,'ریاضی');
    INSERT INTO schedule(class_id,weekday,start,end,subject,teacher_id) VALUES(2,0,'16:00','17:00','ریاضی',43),(2,2,'16:00','17:00','علوم',43);
    INSERT INTO assignments(center_id,class_id,teacher_id,title,deadline) VALUES(1,2,43,'تکلیف','2026-12-01');
    INSERT INTO attendance(class_id,student_id,date,status) VALUES(2,105,'2026-11-01','present'),(2,106,'2026-11-01','absent');`);
}

try {
  fixture();
  const router = new Router();
  [registerCommon, registerManager, registerClasses].forEach((register) => register(router));
  async function request(cookie, method, uri, body) {
    const url = new URL(uri, 'http://local.test');
    const match = router.match(method, url.pathname);
    if (!match) return { status: 404, data: { error: 'Unknown route' } };
    const { route, params } = match;
    const token = readToken(parseCookies(cookie || '')[COOKIE]);
    const user = token ? db.prepare('SELECT * FROM users WHERE id=?').get(token.uid) : null;
    const headers = new Map();
    const ctx = { user, params, query: Object.fromEntries(url.searchParams), body: body || {}, ip: '127.0.0.1', req: { headers: {}, socket: { encrypted: false } }, res: { setHeader: (n, v) => headers.set(n.toLowerCase(), v) } };
    try {
      if (route.auth !== false && !user) throw new HttpError(401, 'Authentication required');
      if (route.roles && !route.roles.includes(user?.role)) throw new HttpError(403, 'Role denied');
      return { status: 200, data: await route.handler(ctx), cookie: headers.get('set-cookie')?.split(';')[0] };
    } catch (e) { if (!(e instanceof HttpError)) throw e; return { status: e.status, data: { error: e.message } }; }
  }
  const login = async (role, identifier) => { const r = await request(null, 'POST', '/api/auth/login', { role, identifier, password }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.cookie; };
  const mgr = await login('manager', 'm-one'), other = await login('manager', 'm-other'), teacher = await login('teacher', 't-one');
  const names = (grade) => db.prepare('SELECT name FROM classes WHERE center_id=1 AND grade=? ORDER BY id').all(grade).map((c) => c.name);
  const classOf = (uid) => db.prepare('SELECT c.name FROM students s JOIN classes c ON c.id=s.class_id WHERE s.user_id=?').get(uid)?.name;

  // ---------------- permissions & tenant isolation ----------------
  await test('Only a manager can read / rename / delete / set up classes', async () => {
    for (const [m, u, b] of [['GET', '/api/manager/classes/1'], ['PUT', '/api/manager/classes/1', { name: 'x' }], ['DELETE', '/api/manager/classes/1'], ['POST', '/api/manager/classes/setup-gender', {}]]) {
      assert.equal((await request(null, m, u, b)).status, 401, `${m} ${u} anonymous`);
      assert.equal((await request(teacher, m, u, b)).status, 403, `${m} ${u} teacher`);
    }
  });
  await test('A manager cannot see or change another center\'s class', async () => {
    assert.equal((await request(other, 'GET', '/api/manager/classes/1')).status, 404);
    assert.equal((await request(other, 'PUT', '/api/manager/classes/1', { name: 'هک' })).status, 404);
    assert.equal((await request(other, 'DELETE', '/api/manager/classes/1')).status, 404);
    assert.equal((await request(mgr, 'GET', '/api/manager/classes/9')).status, 404);
    assert.deepEqual(names(7), ['الف', 'ب']);
  });

  // ---------------- details ----------------
  await test('Class details list students with gender and count active only', async () => {
    const r = await request(mgr, 'GET', '/api/manager/classes/2');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.counts, { students: 5, boys: 0, girls: 5, inactive: 1 });
    assert.equal(r.data.students.length, 6);
    assert.deepEqual(r.data.related, { schedule: 2, assignments: 1, exams: 0, attendance: 2, study_plans: 0, teachers: 1 });
  });
  await test('Meta reports boys and girls per class', async () => {
    const r = await request(mgr, 'GET', '/api/manager/meta');
    const c1 = r.data.classes.find((c) => c.id === 1);
    assert.deepEqual([c1.students, c1.boys, c1.girls], [4, 3, 1]);
  });

  // ---------------- create ----------------
  await test('Adding a class returns its id and rejects duplicates, including Arabic letters / spaces / digits', async () => {
    const a = await request(mgr, 'POST', '/api/manager/classes', { grade: 7, name: '  ج  ' });
    assert.equal(a.status, 200); assert.ok(a.data.id);
    assert.equal((await request(mgr, 'POST', '/api/manager/classes', { grade: 7, name: 'ج' })).status, 400);
    assert.equal((await request(mgr, 'POST', '/api/manager/classes', { grade: 7, name: 'دختر ۱' })).status, 200);
    assert.equal((await request(mgr, 'POST', '/api/manager/classes', { grade: 7, name: 'دختر 1' })).status, 400, 'Persian and Latin digits are the same class');
    assert.equal((await request(mgr, 'POST', '/api/manager/classes', { grade: 7, name: '' })).status, 400);
    await request(mgr, 'DELETE', `/api/manager/classes/${a.data.id}`);
    const d = db.prepare("SELECT id FROM classes WHERE center_id=1 AND grade=7 AND name='دختر ۱'").get();
    await request(mgr, 'DELETE', `/api/manager/classes/${d.id}`);
    assert.deepEqual(names(7), ['الف', 'ب']);
  });

  // ---------------- rename ----------------
  await test('Rename keeps the class id, students, teachers and schedule', async () => {
    const r = await request(mgr, 'PUT', '/api/manager/classes/2', { name: 'دختر' });
    assert.equal(r.status, 200); assert.equal(r.data.name, 'دختر');
    assert.equal(db.prepare('SELECT name FROM classes WHERE id=2').get().name, 'دختر');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM students WHERE class_id=2').get().n, 6);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM schedule WHERE class_id=2').get().n, 2);
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/2', { name: 'ب' })).status, 200);
  });
  await test('Rename rejects empty and duplicate names within the same grade only', async () => {
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/2', { name: '   ' })).status, 400);
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/2', { name: 'الف' })).status, 400);
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/2', { name: 'ا ل ف' })).status, 200, 'different spelling is a different class');
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/2', { name: 'ب' })).status, 200);
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/4', { name: 'الف' })).status, 400, 'grade 8 already has الف');
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/1', { name: 'الف' })).data.unchanged, true);
    assert.equal((await request(mgr, 'PUT', '/api/manager/classes/1', { name: 'كلاس' })).data.name, 'کلاس', 'Arabic kaf is normalised');
    await request(mgr, 'PUT', '/api/manager/classes/1', { name: 'الف' });
  });

  // ---------------- delete / merge ----------------
  await test('Deleting a class with students requires a target class from the same grade', async () => {
    assert.equal((await request(mgr, 'DELETE', '/api/manager/classes/1')).status, 400);
    assert.equal((await request(mgr, 'DELETE', '/api/manager/classes/1?move_to=1')).status, 400);
    assert.equal((await request(mgr, 'DELETE', '/api/manager/classes/1?move_to=3')).status, 400, 'other grade');
    assert.equal((await request(mgr, 'DELETE', '/api/manager/classes/1?move_to=9')).status, 404, 'other center');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM classes WHERE id=1').get().n, 1);
  });
  await test('Deleting a class that has schedule/attendance needs explicit confirmation (force)', async () => {
    const r = await request(mgr, 'DELETE', '/api/manager/classes/2?move_to=1');
    assert.equal(r.status, 409);
    assert.match(r.data.error, /2 جلسهٔ برنامهٔ هفتگی/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM classes WHERE id=2').get().n, 1, 'nothing deleted');
  });
  await test('Merge: students, attendance, assignments and teachers move to the target; only the timetable is dropped', async () => {
    const r = await request(mgr, 'DELETE', '/api/manager/classes/2?move_to=1&force=1');
    assert.equal(r.status, 200); assert.equal(r.data.moved, 6);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM classes WHERE id=2').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM students WHERE class_id=1').get().n, 10);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance WHERE class_id=1').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM assignments WHERE class_id=1').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM teacher_classes WHERE class_id=1').get().n, 2, 'ریاضی already existed on class 1 → merged, علوم added');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM schedule WHERE class_id=2').get().n, 0);
  });
  await test('Deleting an empty class works without confirmation', async () => {
    const a = await request(mgr, 'POST', '/api/manager/classes', { grade: 9, name: 'خالی' });
    assert.equal((await request(mgr, 'DELETE', `/api/manager/classes/${a.data.id}`)).status, 200);
  });

  // restore grade 7: re-create «ب» with the 5 original girls so the setup tests have a realistic starting point
  const bId = Number((await request(mgr, 'POST', '/api/manager/classes', { grade: 7, name: 'ب' })).data.id);
  db.prepare("UPDATE students SET class_id=? WHERE user_id IN (SELECT id FROM users WHERE full_name IN ('زهرا','مریم','فاطمه','نرگس','پریسا','غیرفعال'))").run(bId);
  db.prepare("INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(43,?,'ریاضی')").run(bId);
  db.prepare("INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(43,?,'علوم')").run(bId);

  // ---------------- boys / girls setup ----------------
  const snapshot = () => JSON.stringify({ c: db.prepare('SELECT id,grade,name FROM classes ORDER BY id').all(), s: db.prepare('SELECT user_id,class_id FROM students ORDER BY user_id').all(), t: db.prepare('SELECT * FROM teacher_classes ORDER BY 1,2,3').all() });
  await test('Setup preview changes nothing', async () => {
    const before = snapshot();
    const r = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grade: 7, girls_classes: 2, move: 'gender', dry_run: true });
    assert.equal(r.status, 200); assert.equal(r.data.dry_run, true);
    assert.equal(snapshot(), before);
  });
  await test('Setup (rename only): الف→پسر, ب→دختر keeps every student where they were', async () => {
    const before = db.prepare('SELECT user_id,class_id FROM students ORDER BY user_id').all();
    const r = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { move: 'keep', girls_classes: 1 });
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.summary.renamed, r.data.summary.created, r.data.summary.moved], [4, 0, 0]);
    assert.deepEqual(names(7), ['پسر 1', 'دختر 1']); assert.deepEqual(names(8), ['پسر 1', 'دختر 1']);
    assert.deepEqual(db.prepare('SELECT user_id,class_id FROM students ORDER BY user_id').all(), before);
    const g7 = r.data.grades.find((g) => g.grade === 7);
    assert.ok(g7.warnings.some((w) => /1 دانش‌آموز با جنسیت ثبت‌شدهٔ «دختر» در کلاس پسرها/.test(w)), 'mismatch is surfaced');
    assert.equal(g7.mismatch, 1, 'numeric mismatch count for the UI');
    assert.equal(r.data.grades.find((g) => g.grade === 9), undefined, 'grades without classes or students are skipped');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM classes WHERE center_id=2 AND name='الف'").get().n, 1, 'other center untouched');
  });
  await test('Setup is idempotent', async () => {
    const before = snapshot();
    const r = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { move: 'keep', girls_classes: 1 });
    assert.deepEqual([r.data.summary.renamed, r.data.summary.created, r.data.summary.moved], [0, 0, 0]);
    assert.equal(snapshot(), before);
  });
  await test('Girls split into two classes: preview equals the real result; teachers are copied; boys untouched', async () => {
    const preview = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grade: 7, girls_classes: 2, move: 'keep', dry_run: true });
    const real = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grade: 7, girls_classes: 2, move: 'keep' });
    // ids of classes created during the preview are rolled back, so compare everything except ids and the dry_run flag
    const sameShape = (x) => JSON.parse(JSON.stringify({ ...x, dry_run: undefined }, (k, v) => (k === 'id' ? undefined : v)));
    assert.deepEqual(sameShape(preview.data), sameShape(real.data), 'the preview is exactly what is then applied');
    assert.deepEqual(names(7), ['پسر 1', 'دختر 1', 'دختر 2']);
    const cnt = (n) => db.prepare(`SELECT COUNT(*) n FROM students s JOIN classes c ON c.id=s.class_id JOIN users u ON u.id=s.user_id WHERE c.center_id=1 AND c.grade=7 AND c.name=? AND u.active=1`).get(n).n;
    assert.equal(cnt('پسر 1'), 4); assert.equal(cnt('دختر 1') + cnt('دختر 2'), 5);
    assert.ok(Math.abs(cnt('دختر 1') - cnt('دختر 2')) <= 1, 'balanced');
    assert.equal(real.data.summary.created, 1);
    const second = db.prepare("SELECT id FROM classes WHERE center_id=1 AND grade=7 AND name='دختر 2'").get().id;
    assert.equal(db.prepare('SELECT COUNT(*) n FROM teacher_classes WHERE class_id=?').get(second).n, 2, 'teachers copied to the new class');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM schedule WHERE class_id=?').get(second).n, 0, 'timetable is not copied (would double-book teachers)');
  });
  await test('Rerun with one girls class folds the split classes back', async () => {
    const r = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grade: 7, girls_classes: 1, move: 'gender' });
    assert.equal(r.status, 200);
    assert.ok(names(7).includes('دختر 1'));
    const g7 = r.data.grades[0];
    assert.equal(g7.classes.find((c) => c.role === 'girls').girls, 6, '5 girls from ب + the girl who was registered in the boys class');
    assert.equal(g7.classes.find((c) => c.role === 'boys').girls, 0, 'the girl registered in the boys class moved out');
    assert.equal(g7.classes.find((c) => c.role === 'boys').boys, 3);
    assert.ok(g7.others.some((c) => c.name === 'دختر 2'), 'leftover class is reported so it can be deleted');
  });
  await test('Move-by-gender sends the girl in «پسر» to the girls class', async () => {
    const sara = db.prepare("SELECT s.class_id FROM students s JOIN users u ON u.id=s.user_id WHERE u.full_name='سارا'").get();
    assert.equal(db.prepare('SELECT name FROM classes WHERE id=?').get(sara.class_id).name, 'دختر 1');
    assert.equal(classOf(db.prepare("SELECT id FROM users WHERE full_name='علی'").get().id), 'پسر 1');
  });
  // ---------------- bulk import after the rename ----------------
  const csv = (rows) => ['نام و نام خانوادگی,کد ملی,پایه,جنسیت,کلاس', ...rows].join('\n');
  const classNameOf = (nc) => db.prepare('SELECT c.name FROM users u JOIN students s ON s.user_id=u.id JOIN classes c ON c.id=s.class_id WHERE u.national_code=?').get(nc)?.name;
  await test('Import without a class: explicit gender goes to «پسر»/«دختر»; unknown gender keeps the old «الف» fallback', async () => {
    const left = db.prepare("SELECT id FROM classes WHERE center_id=1 AND grade=7 AND name='دختر 2'").get();
    if (left) assert.equal((await request(mgr, 'DELETE', `/api/manager/classes/${left.id}`)).status, 200);
    const r = await importStudents(1, csv(['پسر تست,1000000001,هفتم,پسر,', 'دختر تست,1000000002,هفتم,دختر,', 'نامعلوم تست,1000000003,هفتم,,']), { defaults: { lenient: true } });
    assert.equal(r.created, 3, JSON.stringify(r));
    assert.equal(classNameOf('1000000001'), 'پسر 1');
    assert.equal(classNameOf('1000000002'), 'دختر 1');
    assert.equal(classNameOf('1000000003'), 'الف', 'unknown gender is not guessed into a boys/girls class');
    assert.equal(r.classes_created, 1);
  });
  await test('Import balances new girls across «دختر ۱/۲» and matches class names written with Persian or Latin digits', async () => {
    await request(mgr, 'DELETE', `/api/manager/classes/${db.prepare("SELECT id FROM classes WHERE center_id=1 AND grade=7 AND name='الف'").get().id}?move_to=${db.prepare("SELECT id FROM classes WHERE center_id=1 AND grade=7 AND name='پسر 1'").get().id}&force=1`);
    assert.equal((await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grade: 7, girls_classes: 2, move: 'gender' })).status, 200);
    const before = db.prepare("SELECT COUNT(*) n FROM classes WHERE center_id=1 AND grade=7").get().n;
    const r = await importStudents(1, csv(['دختر یک,1000000011,هفتم,دختر,', 'دختر دو,1000000012,هفتم,دختر,', 'دختر سه,1000000013,هفتم,دختر,', 'دختر فارسی,1000000014,هفتم,دختر,دختر ۱']), { defaults: { lenient: true } });
    assert.equal(r.created, 4, JSON.stringify(r));
    assert.equal(r.classes_created, 0, 'no stray class was created');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM classes WHERE center_id=1 AND grade=7").get().n, before);
    assert.equal(classNameOf('1000000014'), 'دختر 1', 'Persian-digit «دختر ۱» in a file is the same class as «دختر 1»');
    const cnt = (n) => db.prepare("SELECT COUNT(*) n FROM students s JOIN classes c ON c.id=s.class_id WHERE c.center_id=1 AND c.grade=7 AND c.name=?").get(n).n;
    assert.ok(Math.abs(cnt('دختر 1') - cnt('دختر 2')) <= 2, `balanced enough: ${cnt('دختر 1')} vs ${cnt('دختر 2')}`);
  });
  // ---------------- the institute's real structure: counts differ per grade ----------------
  await test('Per-grade plan: grade 7 = 1 boys + 2 girls, grade 8 = 2 boys + 1 girls; names match the timetable convention', async () => {
    const r = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grades: [{ grade: 7, boys: 1, girls: 2 }, { grade: 8, boys: 2, girls: 1 }], move: 'gender' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(names(7).sort(), ['دختر 1', 'دختر 2', 'پسر 1'].sort());
    assert.deepEqual(names(8).sort(), ['دختر 1', 'پسر 1', 'پسر 2'].sort());
    const g8 = r.data.grades.find((g) => g.grade === 8);
    const boys8 = g8.classes.filter((c) => c.role === 'boys');
    assert.deepEqual(boys8.map((c) => c.total), [1, 1], 'the two grade-8 boys are spread over the two boys classes');
    assert.equal(g8.classes.find((c) => c.role === 'girls').girls, 2);
    assert.equal(g8.warnings.length, 0);
  });
  await test('A bare legacy «پسر» becomes «پسر 1» (not a new class); numbered:false keeps single classes bare', async () => {
    db.prepare("UPDATE classes SET name='پسر' WHERE center_id=1 AND grade=8 AND name='پسر 1'").run();
    const bare = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grades: [{ grade: 8, boys: 2, girls: 1 }], move: 'keep' });
    assert.equal(bare.data.grades[0].classes.find((c) => c.name === 'پسر 1').action, 'rename');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM classes WHERE center_id=1 AND grade=8').get().n, 3);
    const flat = await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grades: [{ grade: 8, boys: 1, girls: 1 }], numbered: false, move: 'keep' });
    assert.equal(flat.status, 200);
    assert.ok(names(8).includes('پسر') && names(8).includes('دختر'), 'numbered:false gives bare names for single classes');
    await request(mgr, 'POST', '/api/manager/classes/setup-gender', { grades: [{ grade: 8, boys: 2, girls: 1 }], move: 'keep' });
    assert.deepEqual(names(8).sort(), ['دختر 1', 'پسر 1', 'پسر 2'].sort());
  });
  await test('Setup rejects duplicate/unknown grades; per-side counts are clamped to 1–4', async () => {
    const post = (b) => request(mgr, 'POST', '/api/manager/classes/setup-gender', b);
    assert.equal((await post({ grades: [{ grade: 7, boys: 1, girls: 1 }, { grade: 7, boys: 1, girls: 1 }] })).status, 400);
    assert.equal((await post({ grades: [{ grade: 12, boys: 1, girls: 1 }] })).status, 400);
    assert.equal((await post({ grades: [] })).status, 400);
    const r = await post({ grades: [{ grade: 7, boys: 99, girls: 0 }], dry_run: true });
    const side = (role) => r.data.grades[0].classes.filter((c) => c.role === role).length;
    assert.deepEqual([side('boys'), side('girls')], [4, 1]);
  });

  // ---------------- the timetable script must attach sessions to the renamed classes, not create duplicates ----------------
  await test('scripts/import-timetable.mjs reuses «پسر 1/دختر 1/دختر 2» whatever digit script or numbering they were saved with', async () => {
    const { spawnSync } = await import('node:child_process');
    // make the storage deliberately awkward: Persian digit in grade 7, a bare «پسر» in grade 8
    db.prepare("UPDATE classes SET name='دختر ۲' WHERE center_id=1 AND grade=7 AND name='دختر 2'").run();
    db.prepare("UPDATE classes SET name='پسر' WHERE center_id=1 AND grade=8 AND name='پسر 1'").run();
    db.prepare("UPDATE centers SET slug='ashtiani' WHERE id=1").run();
    const count = (g) => db.prepare('SELECT COUNT(*) n FROM classes WHERE center_id=1 AND grade=?').get(g).n;
    const before = { 7: count(7), 8: count(8) };
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const run = spawnSync(process.execPath, ['scripts/import-timetable.mjs', '--center', 'ashtiani', '--apply'], { cwd: ROOT, env: process.env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(count(7), before[7], 'grade 7 already had all three classes → nothing created');
    assert.equal(count(8), before[8] + 1, 'grade 8 only gains «دختر 2», which genuinely did not exist (no «پسر 1» twin next to the bare «پسر»)');
    assert.equal(db.prepare("SELECT name FROM classes WHERE center_id=1 AND grade=8 AND name NOT IN ('پسر','پسر 2','دختر 1')").get().name, 'دختر 2');
    const sessions = (g, n) => db.prepare('SELECT COUNT(*) n FROM schedule sc JOIN classes c ON c.id=sc.class_id WHERE c.center_id=1 AND c.grade=? AND c.name=?').get(g, n).n;
    assert.ok(sessions(7, 'دختر ۲') > 0, 'sessions landed on the existing «دختر ۲»');
    assert.ok(sessions(8, 'پسر') > 0, 'sessions landed on the existing bare «پسر»');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM classes WHERE center_id=1 AND grade=7 AND name='دختر 2'").get().n, 0, 'no Latin-digit twin was created');
  });

  await test('Setup validates names and grade', async () => {
    for (const body of [{ boys_name: 'x', girls_name: 'x' }, { boys_from: 'الف', girls_from: 'الف' }, { grade: 3 }]) assert.equal((await request(mgr, 'POST', '/api/manager/classes/setup-gender', body)).status, 400, JSON.stringify(body));
  });

  console.log(`\n${checks} class-management checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try { closeDb(); } catch { /* already closed */ }
  fs.rmSync(tmp, { recursive: true, force: true });
}
