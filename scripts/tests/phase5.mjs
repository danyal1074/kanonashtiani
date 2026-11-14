// Phase 5: staff evaluations (manager-only, measured vs subjective, configurable weights).
import { score } from '../../server/routes/staff.js';
import { ymd, addDays, faWeekday } from '../../server/util.js';

export default async function ({ db, test, get, post, put }, assert) {
  console.log('— Phase 5: staff evaluations');
  const { manager, otherManager, teacher } = globalThis;
  const counselor = await (async () => { const r = await post(null, '/api/auth/login', { role: 'counselor', identifier: 'cns', password: 'PlatformTest#123' }); return r.cookie; })();
  const denied = await Promise.all([get(teacher, '/api/manager/staff-eval'), get(counselor, '/api/manager/staff-eval?role=counselor'), get(otherManager, '/api/manager/staff-eval/20')]);
  await test('Staff evaluations are manager-only and center-scoped', () => assert.deepEqual(denied.map((r) => r.status), [403, 403, 404]));

  // Fixture: teacher 20 has two academic schedule slots on today's weekday; attendance recorded for one of them.
  const today = ymd(), wd = faWeekday(today);
  db.prepare("INSERT INTO schedule(class_id,weekday,start,end,subject,teacher_id,kind) VALUES (1,?,'08:00','09:00','ریاضی',20,'academic'),(2,?,'10:00','11:00','ریاضی',20,'academic')").run(wd, wd);
  db.prepare("INSERT OR IGNORE INTO attendance(class_id,student_id,date,status,teacher_id) VALUES (1,40,?,'present',20)").run(today);
  const from = today, to = today;
  const ev = await get(manager, `/api/manager/staff-eval?role=teacher&from=${from}&to=${to}`);
  const t20 = ev.data.staff.find((s) => s.id === 20), t21 = ev.data.staff.find((s) => s.id === 21);
  await test('Teacher indicators come from recorded data; missing data stays unknown (not zero)', () => {
    assert.equal(ev.status, 200, JSON.stringify(ev.data));
    assert.equal(t20.indicators.attendance_recording.value, 50, JSON.stringify(t20.indicators.attendance_recording));
    assert.equal(t21.indicators.attendance_recording.value, null);
    assert.equal(t21.indicators.results_timeliness.value, null);
    assert.equal(t21.indicators.feedback.value, null);
    assert.ok(ev.data.indicators.find((i) => i.key === 'feedback').kind === 'subjective');
    assert.equal(ev.data.weights.student_trend, 0, 'raw student scores are context only by default');
  });
  await test('Score renormalizes over indicators that have data and reports coverage', () => {
    const r = score({ a: { value: 80 }, b: { value: null }, c: { value: 40 } }, { a: 1, b: 1, c: 3 });
    assert.equal(r.score, 50); assert.equal(r.coverage, 80);
    assert.deepEqual(score({ a: { value: null } }, { a: 5 }), { score: null, coverage: 0 });
  });
  const fb = await post(manager, '/api/manager/staff-eval/20/feedback', { rating: '۵', comment: 'کلاس منظم', period_start: from, period_end: to });
  const badFb = await post(manager, '/api/manager/staff-eval/20/feedback', { rating: 9, period_start: from, period_end: to });
  const ev2 = await get(manager, `/api/manager/staff-eval?role=teacher&from=${from}&to=${to}`);
  await test('Manager feedback is validated, stored separately and audited', () => {
    assert.equal(fb.status, 200); assert.equal(badFb.status, 400);
    assert.equal(ev2.data.staff.find((s) => s.id === 20).indicators.feedback.value, 100);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='staff.feedback'").get().n >= 1);
  });
  const w = await put(manager, '/api/manager/staff-eval/settings', { role: 'teacher', weights: { results_timeliness: 0, exam_participation: 0, attendance_recording: 100, assessment_activity: 0, bank_contribution: 0, student_trend: 0, feedback: 0 } });
  const wBad = await put(manager, '/api/manager/staff-eval/settings', { role: 'teacher', weights: { attendance_recording: -1 } });
  const wZero = await put(manager, '/api/manager/staff-eval/settings', { role: 'teacher', weights: Object.fromEntries(Object.keys(ev.data.weights).map((k) => [k, 0])) });
  const ev3 = await get(manager, `/api/manager/staff-eval?role=teacher&from=${from}&to=${to}`);
  await test('Weights are configurable and validated; the score follows them', () => {
    assert.equal(w.status, 200); assert.equal(wBad.status, 400); assert.equal(wZero.status, 400);
    assert.equal(ev3.data.staff.find((s) => s.id === 20).score, 50);
  });
  const cv = await get(manager, `/api/manager/staff-eval?role=counselor&from=${addDays(today, -30)}&to=${today}`);
  const drill = await get(manager, `/api/manager/staff-eval/30?from=${addDays(today, -30)}&to=${today}`);
  const drillT = await get(manager, `/api/manager/staff-eval/20?from=${addDays(today, -30)}&to=${today}`);
  const badRange = await get(manager, `/api/manager/staff-eval?from=${today}&to=${addDays(today, -5)}`);
  await test('Counselor indicators, drill-down and period validation work', () => {
    assert.equal(cv.status, 200);
    const c = cv.data.staff.find((s) => s.id === 30);
    assert.ok(c.indicators.plan_coverage.value != null);
    assert.equal(drill.status, 200); assert.ok(Array.isArray(drill.data.drill.sessions)); assert.deepEqual(drill.data.drill.classes.map((x) => x.id), [1]);
    assert.ok(drillT.data.drill.exams.length >= 1); assert.equal(drillT.data.feedback[0].comment, 'کلاس منظم');
    assert.equal(badRange.status, 400);
  });
}
