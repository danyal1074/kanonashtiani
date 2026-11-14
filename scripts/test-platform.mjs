// Integration tests for the Kanoon platform enhancements (phases 1–5).
// Real route handlers and SQLite in a disposable temp directory; no network socket.
// Run: node scripts/test-platform.mjs
import assert from 'node:assert/strict';
import { createHarness } from './lib/harness.mjs';
import { classifyFills } from '../public/js/omr-classify.js';

const h = await createHarness('roshd-platform-');
const { db, test, get, post, put, del, login } = h;

try {
  // ---------- Fixture: two centers, classes, staff, students ----------
  const U = db.prepare('INSERT INTO users(id,center_id,role,username,national_code,mobile,pass_hash,full_name,active) VALUES(?,?,?,?,?,?,?,?,1)');
  db.exec(`INSERT INTO centers(id,name,slug) VALUES(1,'کانون آشتیانی','ashtiani'),(2,'Other','other');
    INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,7,'الف'),(2,1,7,'ب'),(3,2,7,'X');`);
  for (const [id, c, role, user, nc, mobile, name] of [
    [10, 1, 'manager', 'mgr', null, null, 'مدیر'], [11, 2, 'manager', 'mgr2', null, null, 'Other Manager'],
    [20, 1, 'teacher', 'tch', null, null, 'معلم'], [21, 1, 'teacher', 'tch2', null, null, 'معلم دوم'], [22, 2, 'teacher', 'tchx', null, null, 'Foreign Teacher'],
    [30, 1, 'counselor', 'cns', null, null, 'مشاور'],
    [40, 1, 'student', null, '0011111111', null, 'دانش‌آموز الف'], [41, 1, 'student', null, '0022222222', null, 'دانش‌آموز ب'],
    [42, 2, 'student', null, '0033333333', null, 'Foreign Student'],
    [50, 1, 'parent', null, null, '09120000001', 'ولی الف'],
  ]) U.run(id, c, role, user, nc, mobile, h.passHash, name);
  db.exec(`INSERT INTO students(user_id,grade,class_id) VALUES(40,7,1),(41,7,2),(42,7,3);
    INSERT INTO parent_children(parent_id,student_id) VALUES(50,40);
    INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(20,1,'ریاضی'),(21,2,'علوم'),(22,3,'Math');
    INSERT INTO counselor_classes(center_id,counselor_id,class_id) VALUES(1,30,1);`);
  const manager = await login('manager', 'mgr'), otherManager = await login('manager', 'mgr2');
  const teacher = await login('teacher', 'tch'), teacher2 = await login('teacher', 'tch2'), foreignTeacher = await login('teacher', 'tchx');
  const student = await login('student', '0011111111'), student2 = await login('student', '0022222222'), foreignStudent = await login('student', '0033333333');
  Object.assign(globalThis, { manager, otherManager, teacher, teacher2, foreignTeacher, student, student2, foreignStudent });

  console.log('— Phase 1: OMR, answer-key isolation, retired continuous grades');
  await test('OMR classification distinguishes ok / blank / multiple / weak marks', () => {
    assert.deepEqual(classifyFills([0.9, 0.05, 0.02, 0.04]), { answer: 0, status: 'ok', confidence: 1 });
    assert.equal(classifyFills([0.02, 0.05, 0.01, 0.03]).status, 'blank');
    assert.equal(classifyFills([0.02, 0.05, 0.01, 0.03]).answer, null);
    const multi = classifyFills([0.85, 0.8, 0.03, 0.02]);
    assert.equal(multi.status, 'multi'); assert.equal(multi.answer, null);
    const weak = classifyFills([0.03, 0.3, 0.02, 0.04]);
    assert.equal(weak.status, 'weak'); assert.equal(weak.answer, 1);
    const erased = classifyFills([0.7, 0.3, 0.02, 0.04]);
    assert.equal(erased.status, 'weak'); assert.equal(erased.answer, 0);
    assert.equal(classifyFills([NaN, -1, 2, 0]).answer, 2);
  });

  const secret = 'SECRET-OFFICIAL-QUESTION';
  const created = await post(teacher, '/api/teacher/exams', { title: 'آزمون رسمی', kind: 'online', grade: 7, class_id: 1, subject: 'ریاضی', duration_min: 20,
    questions: [{ text: secret, options: ['a', 'b', 'c', 'd'], answer: 2 }, { text: secret + '2', options: ['a', 'b', 'c', 'd'], answer: 1 }] });
  await test('Teacher creates an official online exam', () => assert.equal(created.status, 200, JSON.stringify(created.data)));
  const examId = created.data.id;
  let leaked = false;
  for (let i = 0; i < 20 && !leaked; i++) {
    const se = await post(student, '/api/student/self-exams', { subject: i % 2 ? 'ریاضی' : 'عمومی', count: 3 + i });
    if (JSON.stringify(se.data).includes(secret)) leaked = true;
    const full = await get(student, `/api/student/self-exams/${se.data.id}`);
    const stored = db.prepare('SELECT questions_json FROM self_exams WHERE id=?').get(se.data.id).questions_json;
    if (stored.includes(secret) || JSON.stringify(full.data).includes(secret)) leaked = true;
  }
  await test('Self-practice never includes official exam questions or keys', () => assert.equal(leaked, false));

  const retired = await Promise.all([get(teacher, '/api/teacher/manual-scores?class_id=1'), post(teacher, '/api/teacher/manual-scores', { class_id: 1, subject: 'ریاضی', title: 'شفاهی', records: [{ student_id: 40, score: 20 }] }), get(student, '/api/student/manual-scores')]);
  await test('Continuous/oral score entry and display are retired (410) without deleting history', () => {
    for (const r of retired) assert.equal(r.status, 410, JSON.stringify(r.data));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM manual_scores').get().n, 0);
  });
  db.exec("INSERT INTO manual_scores(center_id,student_id,teacher_id,class_id,subject,title,score) VALUES(1,40,20,1,'ریاضی','قدیمی',18)");
  const archive = await get(manager, '/api/manager/manual-scores');
  await test('Historical continuous scores remain readable in the manager archive', () => {
    assert.equal(archive.status, 200); assert.equal(archive.data.length, 1);
  });

  const scan1 = await post(teacher, `/api/teacher/exams/${examId}/result`, { student_id: 40, answers: [2, null], omr: { blank: [1], multi: [], weak: [], corrected: [] } });
  const scan2 = await post(teacher, `/api/teacher/exams/${examId}/result`, { student_id: 40, answers: [2, 1], omr: { blank: [], multi: [1], weak: [], corrected: [1, 99, -1, 'x'] } });
  await test('OMR save then manual correction recalculates result and keeps an audit trail', () => {
    assert.equal(scan1.status, 200, JSON.stringify(scan1.data)); assert.equal(scan1.data.percent, 50);
    assert.equal(scan2.status, 200); assert.equal(scan2.data.percent, 100);
    const r = db.prepare('SELECT percent, source FROM exam_results WHERE exam_id=? AND student_id=40').get(examId);
    assert.equal(r.percent, 100); assert.equal(r.source, 'scan');
    const logs = db.prepare("SELECT action, actor_id, detail_json FROM audit_log WHERE entity='exam_result' ORDER BY id").all();
    assert.deepEqual(logs.map((l) => l.action), ['exam_result.create', 'exam_result.correct']);
    const d = JSON.parse(logs[1].detail_json);
    assert.equal(logs[1].actor_id, 20); assert.equal(d.before.percent, 50); assert.equal(d.after.percent, 100);
    assert.deepEqual(d.omr.corrected, [1]);
  });
  const foreignScan = await post(foreignTeacher, `/api/teacher/exams/${examId}/result`, { student_id: 40, answers: [0, 0] });
  const outsiderScan = await post(teacher, `/api/teacher/exams/${examId}/result`, { student_id: 41, answers: [0, 0] });
  await test('OMR results cannot be saved by other teachers or for students outside the class', () => {
    assert.equal(foreignScan.status, 404); assert.equal(outsiderScan.status, 403);
  });

  globalThis.__platform = { examId };
  const extra = new URL('./test-platform-phases.mjs', import.meta.url);
  if ((await import('node:fs')).existsSync(extra)) await (await import(extra.href)).default(h);
} finally {
  h.summary('Platform checks');
  h.cleanup();
}
