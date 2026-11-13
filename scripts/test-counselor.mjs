// Isolated route-handler integration tests: permissions, real aggregates, persistence and upgrades.
// Routes use signed session cookies and production handlers; no listening socket is needed.
// Run: node scripts/test-counselor.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-counselor-'));
process.env.ROSHD_DATA_DIR = path.join(tmp, 'data');
process.env.ROSHD_UPLOAD_DIR = path.join(tmp, 'uploads');
const { db, migrate, migrations, closeDb } = await import('../server/db.js');
const { hashPassword, ymd, addDays, readToken, HttpError } = await import('../server/util.js');
const { Router, COOKIE, parseCookies } = await import('../server/http.js');
const { default: registerCommon } = await import('../server/routes/common.js');
const { default: registerCounselor } = await import('../server/routes/counselor.js');
const { default: registerAdmin } = await import('../server/routes/admin.js');
const { default: registerStudent } = await import('../server/routes/student.js');
const { default: registerTeacher } = await import('../server/routes/teacher.js');
const { default: registerManager } = await import('../server/routes/manager.js');
const password = 'CounselorTest#123';
const passHash = hashPassword(password);
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };

function migrationPreservesData() {
  const old = new DatabaseSync(':memory:');
  try {
    old.exec('PRAGMA foreign_keys=ON');
    for (let i = 0; i < 10; i++) {
      old.exec('BEGIN');
      migrations[i](i === 0 ? { exec: sql => old.exec(sql.replace(",'counselor'", '')) } : old);
      old.exec(`PRAGMA user_version=${i + 1}; COMMIT`);
    }
    assert.throws(() => old.exec("INSERT INTO users(role,pass_hash,full_name) VALUES('counselor','h','Too early')"));
    old.exec(`INSERT INTO centers(id,name,slug) VALUES(1,'Migration center','migration');
      INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,7,'A');
      INSERT INTO users(id,center_id,role,username,pass_hash,full_name) VALUES
        (1,1,'student','legacy-student','existing-hash','Legacy Student'),
        (2,1,'teacher','legacy-teacher','existing-hash','Legacy Teacher');
      INSERT INTO students(user_id,grade,class_id,avatar,father_name) VALUES(1,7,1,'star','Father');
      INSERT INTO points(student_id,amount,category,reason) VALUES(1,40,'study','kept');
      INSERT INTO messages(from_id,to_id,body) VALUES(1,2,'Keep this message');
      INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(2,1,'Math');
      INSERT INTO exams(id,center_id,title,kind,questions) VALUES(1,1,'Old Exam','online','[]');
      INSERT INTO exam_results(exam_id,student_id,answers,percent) VALUES(1,1,'[]',80);
      INSERT INTO pomodoros(student_id,subject,minutes,date) VALUES(1,'Math',25,'2026-11-01');`);
    const preserved = ['users', 'students', 'points', 'messages', 'teacher_classes', 'exams', 'exam_results', 'pomodoros'];
    const before = Object.fromEntries(preserved.map(table => [table, old.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
    migrate(old);
    // Later migrations may add columns (e.g. users.ui_look); compare only the columns that existed before the upgrade.
    for (const table of preserved) {
      const cols = old.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      assert.ok(before[table].length > 0, `${table} fixture must have rows`);
      const legacyCols = Object.keys(before[table][0]);
      for (const c of legacyCols) assert.ok(cols.includes(c), `${table}.${c} must survive the upgrade`);
      const after = old.prepare(`SELECT ${legacyCols.map(c => `"${c}"`).join(',')} FROM ${table} ORDER BY 1`).all();
      assert.deepEqual(after, before[table], `${table} rows must survive the upgrade`);
    }
    assert.equal(old.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.deepEqual(old.prepare('PRAGMA foreign_key_check').all(), []);
    old.exec("INSERT INTO users(id,center_id,role,username,pass_hash,full_name) VALUES(3,1,'counselor','new_counselor','h','New Counselor')");
    assert.throws(() => old.exec("INSERT INTO users(center_id,role,pass_hash,full_name) VALUES(1,'unknown','h','Rejected')"));
    assert.throws(() => old.exec("INSERT INTO users(center_id,role,username,pass_hash,full_name) VALUES(1,'student','legacy-student','h','Duplicate')"));
    assert.equal(migrate(old), migrations.length);
    old.exec('DELETE FROM users WHERE id=1');
    assert.equal(old.prepare('SELECT COUNT(*) n FROM students').get().n, 0);
    assert.equal(old.prepare('SELECT COUNT(*) n FROM exam_results').get().n, 0);
  } finally { old.close(); }
}

function fixture() {
  const insertUser = db.prepare('INSERT INTO users(id,center_id,role,username,pass_hash,full_name,active) VALUES(?,?,?,?,?,?,?)');
  db.exec(`INSERT INTO centers(id,name,slug) VALUES(1,'کانون آشتیانی','ashtiani'),(2,'Other center','other'),(3,'Empty center','empty');
    INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,7,'هفتم الف'),(2,2,8,'هشتم');`);
  for (const [id, center, role, username, name, active] of [
    [11, 1, 'student', 's-one', 'دانش آموز اول', 1],
    [12, 1, 'student', 's-two', 'دانش آموز دوم', 1],
    [13, 1, 'student', 's-inactive', 'Inactive Student', 0],
    [21, 2, 'student', 's-other', 'Foreign Student', 1],
    [31, 1, 'counselor', 'c-one', 'مشاور اول', 1],
    [32, 2, 'counselor', 'c-other', 'Other Counselor', 1],
    [33, 3, 'counselor', 'c-empty', 'Empty Counselor', 1],
    [41, 1, 'manager', 'm-one', 'Manager One', 1],
    [42, 2, 'manager', 'm-other', 'Manager Two', 1],
    [51, null, 'admin', 'admin-test', 'Admin', 1],
    [61, 1, 'teacher', 't-one', 'Teacher', 1],
  ]) insertUser.run(id, center, role, username, passHash, name, active);
  db.exec(`INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(61,1,'ریاضی');
    INSERT INTO students(user_id,grade,class_id,avatar) VALUES(11,7,1,'star'),(12,7,1,'book'),(13,7,1,'star'),(21,8,2,'star');
    INSERT INTO exams(id,center_id,title,kind,grade,class_id,questions,exam_date) VALUES
      (1,1,'آزمون ریاضی','online',7,1,'[]','2026-11-01'),
      (2,2,'Foreign Exam','online',8,2,'[]','2026-11-01');
    INSERT INTO exam_results(exam_id,student_id,answers,percent) VALUES(1,11,'[]',80),(1,12,'[]',50),(2,21,'[]',99);
    INSERT INTO comprehensive_exam_reports(id,center_id,exam_id,exam_title,grade,student_id,student_name,overall_percentage)
      VALUES(21,2,'foreign-barpa','Foreign Comprehensive','هشتم',21,'Foreign Student',99);`);
  const pomo = db.prepare('INSERT INTO pomodoros(student_id,subject,minutes,date) VALUES(?,?,?,?)');
  pomo.run(11, 'ریاضی', 25, ymd());
  pomo.run(12, 'علوم', 50, ymd());
  pomo.run(21, 'Foreign Subject', 999, ymd());
  pomo.run(13, 'Inactive Subject', 999, ymd());
}


try {
  test('Upgrade preserves users and dependent rows, constraints and foreign keys', migrationPreservesData);
  fixture();
  const router = new Router();
  [registerCommon, registerCounselor, registerAdmin, registerStudent, registerTeacher, registerManager].forEach(register => register(router));
  // Reproduce the dispatch contract from server/index.js while exercising real routes,
  // password verification, signed tokens, SQLite writes and route authorization metadata.
  async function request(cookie, method, uri, body) {
    const url = new URL(uri, 'http://local.test');
    const match = router.match(method, url.pathname);
    if (!match) return { status: 404, data: { error: 'Unknown route' } };
    const { route, params } = match;
    const token = readToken(parseCookies(cookie || '')[COOKIE]);
    let user = token ? db.prepare('SELECT * FROM users WHERE id=?').get(token.uid) : null;
    if (!user?.active || user.role === 'parent' || token?.pv && token.pv !== user.pass_hash.slice(-8)) user = null;
    const headers = new Map();
    const ctx = {
      user, params, query: Object.fromEntries(url.searchParams), body: body || {}, ip: '127.0.0.1',
      req: { headers: {}, socket: { encrypted: false } },
      res: { setHeader: (name, value) => headers.set(name.toLowerCase(), value) },
      impersonator: token?.imp ? db.prepare('SELECT id,full_name FROM users WHERE id=? AND role=\'admin\'').get(token.imp) : null,
    };
    try {
      if (route.auth !== false && !user) throw new HttpError(401, 'Authentication required');
      if (route.roles && !route.roles.includes(user?.role)) throw new HttpError(403, 'Role denied');
      return { status: 200, data: await route.handler(ctx), cookie: headers.get('set-cookie')?.split(';')[0] };
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return { status: error.status, data: { error: error.message } };
    }
  }
  async function login(role, identifier, pw = password) {
    const response = await request(null, 'POST', '/api/auth/login', { role, identifier, password: pw });
    assert.equal(response.status, 200, `Login ${role}/${identifier}: ${JSON.stringify(response.data)}`);
    return response.cookie;
  }
  const counselor = await login('counselor', 'c-one');
  const otherCounselor = await login('counselor', 'c-other');
  const emptyCounselor = await login('counselor', 'c-empty');
  const manager = await login('manager', 'm-one');
  const otherManager = await login('manager', 'm-other');
  const student = await login('student', 's-one');
  const secondStudent = await login('student', 's-two');
  const teacher = await login('teacher', 't-one');
  const admin = await login('admin', 'admin-test');
  const get = (cookie, uri) => request(cookie, 'GET', uri);
  const me = await get(counselor, '/api/me');
  test('Counselor authenticates with its own role and center', () => {
    assert.equal(me.data.user.role, 'counselor');
    assert.equal(me.data.center.id, 1);
  });
  const forbidden = await request(null, 'POST', '/api/auth/login', { role: 'counselor', identifier: 'c-one', password: 'wrong' });
  test('Incorrect counselor password is rejected', () => assert.equal(forbidden.status, 401));
  for (const uri of ['/dashboard', '/students', '/pomodoros', '/exams', '/reports', '/plans', '/sessions']) {
    const [anonymous, studentAccess, teacherAccess] = await Promise.all([get(null, '/api/counselor' + uri), get(student, '/api/counselor' + uri), get(teacher, '/api/counselor' + uri)]);
    test(`Counselor ${uri} requires counselor authentication`, () => {
      assert.equal(anonymous.status, 401);
      assert.equal(studentAccess.status, 403);
      assert.equal(teacherAccess.status, 403);
    });
  }
  const students = await get(counselor, '/api/counselor/students');
  test('Student list includes only active students in counselor center', () => {
    assert.equal(students.status, 200);
    assert.deepEqual(students.data.map(s => s.id).sort((a, b) => a - b), [11, 12]);
    assert.equal(students.data.find(s => s.id === 11).exam_average, 80);
    assert.equal(students.data.find(s => s.id === 12).exam_average, 50);
  });
  const detail = await get(counselor, '/api/counselor/students/11');
  test('Student detail contains real exam result and study records', () => {
    assert.equal(detail.status, 200);
    assert.equal(detail.data.student.id, 11);
    assert.equal(detail.data.exams.length, 1);
    assert.equal(detail.data.pomodoros.length, 1);
  });
  for (const uri of ['/students/21', '/students/13', '/pomodoros?student_id=21', '/plans?student_id=21']) {
    const response = await get(counselor, '/api/counselor' + uri);
    test(`Cross-center/inactive resource ${uri} is rejected`, () => assert.ok([403, 404].includes(response.status), JSON.stringify(response.data)));
  }
  const dashboard = await get(counselor, '/api/counselor/dashboard?range=week');
  const pomodoros = await get(counselor, '/api/counselor/pomodoros?range=week');
  const exams = await get(counselor, '/api/counselor/exams');
  const reports = await get(counselor, '/api/counselor/reports');
  test('Dashboard, study, exam and report endpoints load without foreign center data', () => {
    for (const response of [dashboard, pomodoros, exams, reports]) {
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.ok(!JSON.stringify(response.data).includes('Foreign'), 'Foreign center rows leaked');
      assert.ok(!JSON.stringify(response.data).includes('Inactive Subject'), 'Inactive student rows leaked');
    }
  });
  test('Aggregates use two active students, their 75 minutes and their 65% mean', () => {
    assert.equal(dashboard.data.stats.students, 2);
    assert.equal(dashboard.data.stats.pomodoros, 2);
    assert.equal(dashboard.data.stats.minutes, 75);
    assert.equal(dashboard.data.stats.exam_average, 65);
    assert.equal(pomodoros.data.stats.minutes, 75);
    assert.equal(pomodoros.data.trend.reduce((sum, day) => sum + day.minutes, 0), 75);
    assert.equal(exams.data.length, 1);
    assert.equal(exams.data[0].average, 65);
    assert.equal(exams.data[0].participants, 2);
    assert.equal(reports.data.grades[0].students, 2);
  });
  db.exec(`INSERT INTO exams(id,center_id,title,kind,grade,class_id,questions,exam_date) VALUES(3,1,'Native Comprehensive','comprehensive',7,1,'[]','2026-11-02');
    INSERT INTO exam_results(exam_id,student_id,answers,percent) VALUES(3,11,'[]',70);
    INSERT INTO comprehensive_exam_reports(id,center_id,exam_id,exam_title,grade,student_id,student_name,overall_percentage)
      VALUES(22,1,'3','Imported Comprehensive','هفتم',12,'دانش آموز دوم',90);`);
  const collidingExams = await get(counselor, '/api/counselor/exams');
  test('Native comprehensive and imported reports with same exam ID stay separate', () => {
    const native = collidingExams.data.find(row => row.title === 'Native Comprehensive');
    const imported = collidingExams.data.find(row => row.title === 'Imported Comprehensive');
    assert.ok(native && imported);
    assert.equal(native.average, 70);
    assert.equal(imported.average, 90);
    assert.equal(native.participants, 1);
    assert.equal(imported.participants, 1);
  });
  db.prepare('INSERT INTO pomodoros(student_id,subject,minutes,date) VALUES(?,?,?,?)').run(11, 'Old Math', 25, addDays(ymd(), -15));
  const weeklyReports = await get(counselor, '/api/counselor/reports?range=week');
  const monthlyReports = await get(counselor, '/api/counselor/reports?range=month');
  test('Grade study totals follow selected date range', () => {
    assert.equal(weeklyReports.data.grades[0].pomodoros, 2);
    assert.equal(monthlyReports.data.grades[0].pomodoros, 3);
  });
  const emptyDashboard = await get(emptyCounselor, '/api/counselor/dashboard');
  const emptyStudents = await get(emptyCounselor, '/api/counselor/students');
  test('Empty center returns an empty result without fabricated students', () => {
    assert.equal(emptyDashboard.status, 200);
    assert.deepEqual(emptyStudents.data, []);
    assert.equal(emptyDashboard.data.stats.students, 0);
    assert.equal(emptyDashboard.data.stats.pomodoros, 0);
    assert.equal(emptyDashboard.data.stats.exam_average, null);
  });
  const tomorrow = `${addDays(ymd(), 1)}T10:00:00.000Z`;
  const sessionBody = { student_id: 11, title: 'بررسی آزمون', starts_at: tomorrow, notes: 'یادداشت جلسه' };
  const session = await request(counselor, 'POST', '/api/counselor/sessions', sessionBody);
  test('Counselor can create a consultation session', () => assert.equal(session.status, 200, JSON.stringify(session.data)));
  const sessions = await get(counselor, '/api/counselor/sessions');
  const createdSession = sessions.data.find(row => row.title === sessionBody.title);
  test('Created consultation session persists with its student', () => {
    assert.ok(createdSession);
    assert.equal(createdSession.student_id, 11);
  });
  const updatedSession = await request(counselor, 'PUT', `/api/counselor/sessions/${createdSession.id}`, { status: 'completed', notes: 'جلسه برگزار شد' });
  test('Session status and notes can be updated', () => assert.equal(updatedSession.status, 200, JSON.stringify(updatedSession.data)));
  const updatedSessions = await get(counselor, '/api/counselor/sessions');
  test('Updated session status is persisted', () => assert.equal(updatedSessions.data.find(row => row.id === createdSession.id).status, 'completed'));
  const stolenSession = await request(otherCounselor, 'PUT', `/api/counselor/sessions/${createdSession.id}`, { status: 'cancelled' });
  test('Counselor cannot update another center session', () => assert.ok([403, 404].includes(stolenSession.status)));
  const foreignSession = await request(counselor, 'POST', '/api/counselor/sessions', { ...sessionBody, student_id: 21 });
  test('Counselor cannot schedule another center student', () => assert.ok([403, 404].includes(foreignSession.status)));
  const badSession = await request(counselor, 'POST', '/api/counselor/sessions', { ...sessionBody, starts_at: 'invalid-date' });
  test('Invalid session date is rejected', () => assert.equal(badSession.status, 400));
  const impossibleDateSession = await request(counselor, 'POST', '/api/counselor/sessions', { ...sessionBody, starts_at: '2027-02-30T10:00:00Z' });
  const missingZoneSession = await request(counselor, 'POST', '/api/counselor/sessions', { ...sessionBody, starts_at: '2027-02-28T10:00:00' });
  test('Impossible dates and ambiguous session time zones are rejected', () => {
    assert.equal(impossibleDateSession.status, 400);
    assert.equal(missingZoneSession.status, 400);
  });
  const weekStart = ymd();
  const planBody = { week_start: weekStart, tasks: [{ weekday: 0, subject: 'ریاضی', title: 'حل تمرین', target: 2, done: false }, { weekday: 1, subject: 'علوم', title: 'مرور درس', target: 1, done: true }] };
  const plan = await request(counselor, 'PUT', '/api/counselor/plans/11', planBody);
  test('Per-student weekly study plan can be saved', () => assert.equal(plan.status, 200, JSON.stringify(plan.data)));
  const plans = await get(counselor, `/api/counselor/plans?student_id=11&week_start=${weekStart}`);
  test('Study tasks persist for the selected student and week', () => {
    assert.equal(plans.status, 200);
    assert.equal(plans.data.length, 1);
    assert.equal(plans.data[0].tasks.length, 2);
    assert.ok(plans.data[0].tasks.some(row => row.title === 'حل تمرین'));
  });
  const assignedPlans = await get(student, '/api/student/counselor-plans');
  test('Assigned personal plan is visible to its student', () => {
    assert.equal(assignedPlans.status, 200);
    assert.equal(assignedPlans.data.length, 1);
    assert.equal(assignedPlans.data[0].tasks[0].done, false);
  });
  const planId = assignedPlans.data[0].id;
  const completedTask = await request(student, 'PUT', `/api/student/counselor-plans/${planId}/tasks/0`, { done: true });
  const followedPlans = await get(counselor, `/api/counselor/plans?student_id=11&week_start=${weekStart}`);
  test('Student can mark own plan task done and counselor sees the update', () => {
    assert.equal(completedTask.status, 200);
    assert.equal(followedPlans.data[0].tasks[0].done, true);
  });
  const stolenTask = await request(secondStudent, 'PUT', `/api/student/counselor-plans/${planId}/tasks/0`, { done: false });
  test('Student cannot update another student personal plan', () => assert.equal(stolenTask.status, 404));
  const invalidTask = await request(student, 'PUT', `/api/student/counselor-plans/${planId}/tasks/99`, { done: true });
  test('Out-of-range task index is rejected', () => assert.equal(invalidTask.status, 400));
  const foreignPlan = await request(counselor, 'PUT', '/api/counselor/plans/21', planBody);
  test('Counselor cannot overwrite another center study plan', () => assert.ok([403, 404].includes(foreignPlan.status)));
  const badPlan = await request(counselor, 'PUT', '/api/counselor/plans/11', { ...planBody, tasks: [{ weekday: 9, subject: 'ریاضی', title: 'invalid', target: -1 }] });
  test('Invalid weekday/target in study plan is rejected', () => assert.equal(badPlan.status, 400));
  const afterBadPlan = await get(counselor, `/api/counselor/plans?student_id=11&week_start=${weekStart}`);
  test('Invalid plan does not erase existing tasks', () => assert.equal(afterBadPlan.data[0].tasks.length, 2));
  const note = await request(counselor, 'POST', '/api/counselor/students/11/notes', { body: 'پیگیری روش مطالعه' });
  const notesDetail = await get(counselor, '/api/counselor/students/11');
  test('Student follow-up note persists', () => {
    assert.equal(note.status, 200, JSON.stringify(note.data));
    assert.ok(notesDetail.data.notes.some(row => row.body === 'پیگیری روش مطالعه'));
  });
  const teacherDetail = await get(teacher, '/api/teacher/students/11');
  const managerDetail = await get(manager, '/api/manager/students/11');
  test('Private counselor note does not leak through teacher or manager student details', () => {
    assert.equal(teacherDetail.status, 200);
    assert.ok(!JSON.stringify(teacherDetail.data).includes('پیگیری روش مطالعه'));
    assert.equal(managerDetail.status, 200);
    assert.ok(!JSON.stringify(managerDetail.data).includes('پیگیری روش مطالعه'));
  });
  const foreignNote = await request(counselor, 'POST', '/api/counselor/students/21/notes', { body: 'not allowed' });
  test('Counselor cannot add notes for another center student', () => assert.ok([403, 404].includes(foreignNote.status)));
  const counselorContacts = await get(counselor, '/api/messages/contacts');
  const studentContacts = await get(student, '/api/messages/contacts');
  test('Counselor and student can find one another, only within the same center', () => {
    assert.ok(counselorContacts.data.some(row => row.id === 11));
    assert.ok(studentContacts.data.some(row => row.id === 31));
    assert.ok(!counselorContacts.data.some(row => row.id === 21));
  });
  const sent = await request(counselor, 'POST', '/api/messages', { to: 11, body: 'برنامه جدید آماده است' });
  const replies = await get(student, '/api/messages/31');
  test('Internal message is delivered from counselor to student', () => {
    assert.equal(sent.status, 200);
    assert.ok(replies.data.some(row => row.body === 'برنامه جدید آماده است'));
  });
  const forbiddenMessage = await request(counselor, 'POST', '/api/messages', { to: 21, body: 'forbidden' });
  test('Cross-center message is rejected', () => assert.equal(forbiddenMessage.status, 403));
  const selectedCounselor = await get(student, '/api/counselor');
  test('Student counseling entry points to a real counselor account', () => assert.equal(selectedCounselor.data.id, 31));
  const foreignReport = await get(counselor, '/api/barpa-exams/reports/21');
  test('Shared comprehensive report endpoint enforces counselor center', () => assert.ok([403, 404].includes(foreignReport.status)));
  const createCounselor = await request(manager, 'POST', '/api/manager/counselors', { username: 'new_counselor', full_name: 'مشاور جدید', password, mobile: '09121112233' });
  test('Center manager can provision a counselor account', () => assert.equal(createCounselor.status, 200, JSON.stringify(createCounselor.data)));
  const managedCounselors = await get(manager, '/api/manager/counselors');
  const newCounselor = managedCounselors.data.find(row => row.username === 'new_counselor');
  test('Provisioned counselor appears in center management', () => assert.ok(newCounselor));
  const newlySignedInCounselor = await login('counselor', 'new_counselor');
  const colleagueDetail = await get(newlySignedInCounselor, '/api/counselor/students/11');
  const colleagueSessions = await get(newlySignedInCounselor, '/api/counselor/sessions');
  test('Another counselor in same center cannot see private notes or meetings', () => {
    assert.deepEqual(colleagueDetail.data.notes, []);
    assert.deepEqual(colleagueSessions.data, []);
  });
  const appointmentRequest = await request(student, 'POST', '/api/student/counselor-sessions', {
    title: 'درخواست بررسی برنامه', starts_at: tomorrow, counselor_id: 31,
    student_id: 12, status: 'completed', notes: 'Forged private counselor note',
  });
  const ownAppointments = await get(student, '/api/student/counselor-sessions');
  const requestedAppointment = ownAppointments.data.find(row => row.title === 'درخواست بررسی برنامه');
  test('Student can request a real appointment only under their own identity', () => {
    assert.equal(appointmentRequest.status, 200, JSON.stringify(appointmentRequest.data));
    assert.ok(requestedAppointment);
    assert.equal(requestedAppointment.status, 'requested');
    const stored = db.prepare('SELECT * FROM counselor_sessions WHERE id=?').get(requestedAppointment.id);
    assert.equal(stored.student_id, 11);
    assert.equal(stored.counselor_id, 31);
    assert.equal(stored.notes, '');
  });
  const assignedRequests = await get(counselor, '/api/counselor/sessions');
  const peerRequests = await get(newlySignedInCounselor, '/api/counselor/sessions');
  const secondStudentAppointments = await get(secondStudent, '/api/student/counselor-sessions');
  test('Appointment request is visible only to requesting student and assigned counselor', () => {
    assert.ok(assignedRequests.data.some(row => row.id === requestedAppointment.id && row.status === 'requested'));
    assert.ok(!peerRequests.data.some(row => row.id === requestedAppointment.id));
    assert.ok(!secondStudentAppointments.data.some(row => row.id === requestedAppointment.id));
  });
  const acceptedRequest = await request(counselor, 'PUT', `/api/counselor/sessions/${requestedAppointment.id}`, { status: 'scheduled', notes: 'Private acceptance note' });
  const updatedStudentAppointments = await get(student, '/api/student/counselor-sessions');
  test('Counselor can confirm request and student sees status without private notes', () => {
    assert.equal(acceptedRequest.status, 200, JSON.stringify(acceptedRequest.data));
    const confirmed = updatedStudentAppointments.data.find(row => row.id === requestedAppointment.id);
    assert.equal(confirmed.status, 'scheduled');
    assert.equal(Object.hasOwn(confirmed, 'notes'), false);
    assert.ok(!JSON.stringify(updatedStudentAppointments.data).includes('Private acceptance note'));
    assert.ok(!JSON.stringify(updatedStudentAppointments.data).includes('جلسه برگزار شد'));
  });
  const foreignCounselorRequest = await request(student, 'POST', '/api/student/counselor-sessions', { title: 'Forbidden', starts_at: tomorrow, counselor_id: 32 });
  const teacherCounselorRequest = await request(student, 'POST', '/api/student/counselor-sessions', { title: 'Forbidden', starts_at: tomorrow, counselor_id: 61 });
  test('Student cannot request appointments from another center or a teacher', () => {
    assert.ok([400, 403, 404].includes(foreignCounselorRequest.status));
    assert.ok([400, 403, 404].includes(teacherCounselorRequest.status));
  });
  const defaultCounselorRequest = await request(secondStudent, 'POST', '/api/student/counselor-sessions', { title: 'Default assigned counselor', starts_at: tomorrow });
  test('Student request without counselor selection uses an active same-center counselor', () => {
    assert.equal(defaultCounselorRequest.status, 200, JSON.stringify(defaultCounselorRequest.data));
    const stored = db.prepare('SELECT cs.* FROM counselor_sessions cs WHERE title=?').get('Default assigned counselor');
    assert.equal(stored.student_id, 12);
    assert.equal(stored.counselor_id, 31);
    assert.equal(stored.status, 'requested');
  });
  const invalidStudentRequest = await request(student, 'POST', '/api/student/counselor-sessions', { title: 'Invalid date', starts_at: '2027-02-30T10:00:00Z' });
  const anonymousStudentRequest = await request(null, 'POST', '/api/student/counselor-sessions', { title: 'Unauthorized', starts_at: tomorrow });
  const counselorStudentRequest = await request(counselor, 'POST', '/api/student/counselor-sessions', { title: 'Wrong role', starts_at: tomorrow });
  test('Student appointment request validates date and requires student authentication', () => {
    assert.equal(invalidStudentRequest.status, 400);
    assert.equal(anonymousStudentRequest.status, 401);
    assert.equal(counselorStudentRequest.status, 403);
  });
  const inactiveCounselor = await request(manager, 'POST', '/api/manager/counselors', { username: 'inactive_counselor', full_name: 'Disabled On Creation', password, active: false });
  const inactiveLogin = await request(null, 'POST', '/api/auth/login', { role: 'counselor', identifier: 'inactive_counselor', password });
  test('Manager can create an initially inactive counselor account', () => {
    assert.equal(inactiveCounselor.status, 200);
    assert.equal(inactiveLogin.status, 401);
  });
  const inactiveCounselorRequest = await request(student, 'POST', '/api/student/counselor-sessions', { title: 'Inactive counselor', starts_at: tomorrow, counselor_id: inactiveCounselor.data.id });
  test('Student cannot request appointment from inactive counselor', () => assert.ok([400, 403, 404].includes(inactiveCounselorRequest.status)));
  const duplicateCounselor = await request(manager, 'POST', '/api/manager/counselors', { username: 'new_counselor', full_name: 'Duplicate', password });
  test('Duplicate counselor username is rejected', () => assert.equal(duplicateCounselor.status, 400));
  const crossManager = await request(otherManager, 'PUT', `/api/manager/counselors/${newCounselor.id}`, { active: false });
  test('Manager cannot modify a counselor in another center', () => assert.ok([403, 404].includes(crossManager.status)));
  const impersonate = await request(admin, 'POST', '/api/admin/impersonate/31');
  test('Admin can inspect the counselor panel via impersonation', () => {
    assert.equal(impersonate.status, 200);
    assert.equal(impersonate.data.role, 'counselor');
  });
  const disabled = await request(manager, 'PUT', `/api/manager/counselors/${newCounselor.id}`, { active: false });
  const disabledLogin = await request(null, 'POST', '/api/auth/login', { role: 'counselor', identifier: 'new_counselor', password });
  test('Disabled counselor cannot log in', () => {
    assert.equal(disabled.status, 200);
    assert.equal(disabledLogin.status, 401);
  });
  console.log(`\n${checks} counselor checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try { closeDb(); } catch { /* already closed */ }
  fs.rmSync(tmp, { recursive: true, force: true });
}
