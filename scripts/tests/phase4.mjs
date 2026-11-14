// Phase 4a: official exam lifecycle, bank snapshots, result release, comprehensive integration.
export default async function ({ db, test, get, post, put, del }, assert) {
  console.log('— Phase 4: official exam lifecycle');
  const { manager, teacher, teacher2, foreignTeacher, student, student2 } = globalThis;
  const bankIds = db.prepare("SELECT id FROM question_bank WHERE center_id=1 AND grade=7 AND status='published' ORDER BY id LIMIT 4").all().map((r) => r.id);
  const manualQ = { text: 'سؤال دستی', options: ['۱', '۲', '۳', '۴'], answer: 3 };
  const mk = await post(teacher, '/api/teacher/exams', { title: 'آزمون رسمی فصل ۱', kind: 'online', grade: 7, subject: 'ریاضی', duration_min: 10, bank_question_ids: bankIds, questions: [manualQ] });
  const id = mk.data.id;
  const sList = await get(student, '/api/student/exams');
  const sStart = await post(student, `/api/student/exams/${id}/start`);
  await test('New official exam is a draft, snapshots bank questions and is invisible to students', () => {
    assert.equal(mk.status, 200, JSON.stringify(mk.data)); assert.equal(mk.data.status, 'draft');
    const qs = JSON.parse(db.prepare('SELECT questions FROM exams WHERE id=?').get(id).questions);
    assert.equal(qs.length, 5); assert.equal(qs[0].bank_id, bankIds[0]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM exam_question_links WHERE exam_id=?').get(id).n, 4);
    assert.ok(!sList.data.some((e) => e.id === id)); assert.equal(sStart.status, 404);
  });
  const skip = await post(teacher, `/api/teacher/exams/${id}/status`, { to: 'published' });
  const foreign = await post(foreignTeacher, `/api/teacher/exams/${id}/status`, { to: 'review' });
  const other = await post(teacher2, `/api/teacher/exams/${id}/status`, { to: 'review' });
  const edit = await put(teacher, `/api/teacher/exams/${id}`, { title: 'آزمون رسمی فصل ۱ (ویرایش)', duration_min: 12 });
  await test('Transitions are enforced server-side and only the owner can drive them', () => {
    assert.equal(skip.status, 400); assert.equal(foreign.status, 404); assert.equal(other.status, 404);
    assert.equal(edit.status, 200);
  });
  // Editing the bank question after linking must not change the exam snapshot.
  db.prepare("UPDATE question_bank SET text='تغییر بعدی در بانک' WHERE id=?").run(bankIds[0]);
  await test('Exam keeps its immutable snapshot when the bank question changes later', () => {
    const qs = JSON.parse(db.prepare('SELECT questions FROM exams WHERE id=?').get(id).questions);
    assert.notEqual(qs[0].text, 'تغییر بعدی در بانک');
  });
  for (const to of ['review', 'ready']) await post(teacher, `/api/teacher/exams/${id}/status`, { to });
  const future = new Date(Date.now() + 3600e3).toISOString(), later = new Date(Date.now() + 7200e3).toISOString();
  const shortWin = await post(teacher, `/api/teacher/exams/${id}/status`, { to: 'published', starts_at: future, ends_at: new Date(Date.now() + 3660e3).toISOString() });
  const noZone = await post(teacher, `/api/teacher/exams/${id}/status`, { to: 'published', starts_at: '2030-01-01T10:00' });
  const pub = await post(teacher, `/api/teacher/exams/${id}/status`, { to: 'published', starts_at: future, ends_at: later, randomize: true });
  const early = await post(student, `/api/student/exams/${id}/start`);
  const editLive = await put(teacher, `/api/teacher/exams/${id}`, { title: 'x' });
  await test('Publishing validates the window; students see it but cannot start before starts_at; no edits after publish', () => {
    assert.equal(shortWin.status, 400); assert.equal(noZone.status, 400);
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    assert.equal(early.status, 409);
    assert.equal(editLive.status, 409);
  });
  db.prepare('UPDATE exams SET starts_at=? WHERE id=?').run(new Date(Date.now() - 60e3).toISOString(), id);
  const st1 = await post(student, `/api/student/exams/${id}/start`), st2 = await post(student2, `/api/student/exams/${id}/start`);
  const orig = JSON.parse(db.prepare('SELECT questions FROM exams WHERE id=?').get(id).questions);
  const order1 = JSON.parse(db.prepare('SELECT order_json FROM exam_attempts WHERE exam_id=? AND student_id=40').get(id).order_json);
  const correctShown = order1.map((o) => orig[o].answer);
  const sub1 = await post(student, `/api/student/exams/${id}/submit`, { answers: correctShown });
  const dup = await post(student, `/api/student/exams/${id}/submit`, { answers: correctShown });
  const early1 = await get(student, `/api/student/results/${id}`);
  const ptsBefore = db.prepare("SELECT COUNT(*) n FROM points WHERE ref=?").get(`exam:${id}`).n;
  await test('Randomized order maps back to original answers; results, key and points stay hidden until release', () => {
    assert.equal(st1.status, 200); assert.equal(st2.status, 200);
    assert.ok(st1.data.questions.every((q) => !('answer' in q)));
    assert.ok(st1.data.deadline);
    assert.equal(sub1.status, 200); assert.equal(sub1.data.released, false);
    assert.ok(!('percent' in sub1.data) && !('questions' in sub1.data));
    assert.equal(db.prepare('SELECT percent FROM exam_results WHERE exam_id=? AND student_id=40').get(id).percent, 100);
    assert.equal(dup.status, 400);
    assert.equal(early1.status, 409);
    assert.equal(ptsBefore, 0);
  });
  const sList2 = await get(student, '/api/student/exams');
  const rel = await post(teacher, `/api/teacher/exams/${id}/status`, { to: 'results_released' });
  const rel2 = await post(teacher, `/api/teacher/exams/${id}/status`, { to: 'results_released' });
  const card = await get(student, `/api/student/results/${id}`);
  const late = await post(student2, `/api/student/exams/${id}/submit`, { answers: [0, 0, 0, 0, 0] });
  await test('Release publishes report cards and awards points exactly once; submissions close after release', () => {
    assert.equal(sList2.data.find((e) => e.id === id).percent, null);
    assert.equal(rel.status, 200); assert.equal(rel2.status, 400);
    assert.equal(card.status, 200); assert.equal(card.data.percent, 100);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM points WHERE ref=?').get(`exam:${id}`).n, 1);
    assert.equal(late.status, 400);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE entity='exam' AND entity_id=? AND action='exam.status'").get(String(id)).n >= 4);
  });
  const delRes = await del(teacher, `/api/teacher/exams/${id}`);
  const draft2 = await post(teacher, '/api/teacher/exams', { title: 'پیش‌نویس حذفی', kind: 'online', grade: 7, questions: [manualQ] });
  const delDraft = await del(teacher, `/api/teacher/exams/${draft2.data.id}`);
  await test('Exams with results cannot be deleted; empty drafts can', () => {
    assert.equal(delRes.status, 409); assert.equal(delDraft.status, 200);
  });
  const practiceIds = JSON.parse(db.prepare("SELECT questions_json FROM self_exams WHERE id=?").get((await post(student, '/api/student/self-exams', { mode: 'test', grade: 7, count: 30, timed: false })).data.id).questions_json).map((q) => q.question_id);
  await test('Questions used in an official exam are excluded from free practice', () => {
    for (const b of bankIds) assert.ok(!practiceIds.includes(b));
  });
  const comp = await post(manager, '/api/manager/comprehensive', { title: 'جامع آذر', grade: 7, bank_question_ids: bankIds.slice(0, 2), questions: [{ answer: 1 }] });
  const scan = await post(manager, `/api/manager/comprehensive/${comp.data.id}/result`, { student_id: 41, answers: [0, 0, 1] });
  const hidden = await get(student2, `/api/student/results/${comp.data.id}`);
  const crel = await post(manager, `/api/manager/comprehensive/${comp.data.id}/release`);
  const shown = await get(student2, `/api/student/results/${comp.data.id}`);
  await test('Comprehensive exams accept bank questions, scan immediately and release report cards explicitly', () => {
    assert.equal(comp.status, 200, JSON.stringify(comp.data)); assert.equal(scan.status, 200, JSON.stringify(scan.data));
    assert.equal(hidden.status, 409); assert.equal(crel.status, 200); assert.equal(shown.status, 200);
  });
  globalThis.__platform.bankIds = bankIds;
}
