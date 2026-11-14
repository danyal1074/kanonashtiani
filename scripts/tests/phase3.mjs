// Phase 3: central question bank and student free practice.
export default async function ({ db, test, get, post, put }, assert) {
  console.log('— Phase 3: question bank and free practice');
  const { manager, otherManager, teacher, teacher2, foreignTeacher, student, student2, foreignStudent } = globalThis;

  const book = await post(teacher, '/api/bank/books', { grade: 7, subject: 'ریاضی', title: 'ریاضی هفتم' });
  const badBook = await post(teacher, '/api/bank/books', { grade: 9, subject: 'ریاضی', title: 'نهم' });
  const ch = await post(teacher, `/api/bank/books/${book.data.id}/chapters`, { title: 'فصل ۱: راهبردهای حل مسئله' });
  const t1 = await post(teacher, `/api/bank/chapters/${ch.data.id}/topics`, { title: 'الگوها' });
  const t2 = await post(teacher, `/api/bank/chapters/${ch.data.id}/topics`, { title: 'حذف حالت‌های نامطلوب' });
  const foreignCh = await post(foreignTeacher, `/api/bank/books/${book.data.id}/chapters`, { title: 'x' });
  await test('Teachers build books → chapters → topics only for grades they teach, within their center', () => {
    assert.equal(book.status, 200, JSON.stringify(book.data));
    assert.equal(badBook.status, 403);
    assert.equal(t1.status, 200); assert.equal(t2.status, 200);
    assert.equal(foreignCh.status, 404);
  });
  const topic1 = t1.data.id, topic2 = t2.data.id;
  const mk = (i, topic, extra = {}) => ({ grade: 7, subject: 'ریاضی', topic_id: topic, text: `سؤال تمرینی ${i}`, options: [`الف${i}`, `ب${i}`, `ج${i}`, `د${i}`], correct_option: i % 4, difficulty: i % 2 ? 'easy' : 'medium', explanation: `توضیح ${i}`, source_page: 10 + i, ...extra });
  const created = [];
  for (let i = 0; i < 8; i++) created.push(await post(teacher, '/api/bank/questions', mk(i, i < 4 ? topic1 : topic2, { status: 'published' })));
  const draft = await post(teacher, '/api/bank/questions', mk(100, topic1));
  const dup = await post(teacher, '/api/bank/questions', { ...mk(0, topic1), text: '  سؤال  تمرینی ۰ ', options: ['ب0', 'الف0', 'د0', 'ج0'] });
  const invalid = await Promise.all([
    post(teacher, '/api/bank/questions', { ...mk(200, topic1), options: ['a', 'b', 'c'] }),
    post(teacher, '/api/bank/questions', { ...mk(201, topic1), options: ['a', 'a', 'c', 'd'] }),
    post(teacher, '/api/bank/questions', { ...mk(202, topic1), correct_option: 4 }),
    post(teacher, '/api/bank/questions', { ...mk(203, topic1), grade: 8 }),
    post(teacher, '/api/bank/questions', { ...mk(204, topic1), image_file: { data: 'data:image/png;base64,' + Buffer.from('not a png at all').toString('base64') } }),
    post(student, '/api/bank/questions', mk(205, topic1)),
  ]);
  await test('Questions are validated, deduplicated (normalized digits/spacing/order) and role-protected', () => {
    for (const c of created) assert.equal(c.status, 200, JSON.stringify(c.data));
    assert.equal(draft.status, 200);
    assert.equal(dup.status, 409, JSON.stringify(dup.data));
    assert.deepEqual(invalid.map((r) => r.status), [400, 400, 400, 403, 400, 403], JSON.stringify(invalid.map((r) => r.data)));
  });
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
  const img = await post(teacher, '/api/bank/questions', { ...mk(300, topic2), image_file: { data: png } });
  await test('Image-based question stores a validated image', () => {
    assert.equal(img.status, 200, JSON.stringify(img.data));
    const row = db.prepare('SELECT qtype, image FROM question_bank WHERE id=?').get(img.data.id);
    assert.equal(row.qtype, 'mcq4_image'); assert.match(row.image, /^\/uploads\/[\w-]+\.png$/);
  });

  const qid = created[0].data.id;
  const editOther = await put(teacher2, `/api/bank/questions/${qid}`, { text: 'hijack' });
  const viewForeign = await get(foreignTeacher, `/api/bank/questions/${qid}`);
  const listForeign = await get(otherManager, '/api/bank/questions');
  const edit = await put(teacher, `/api/bank/questions/${qid}`, { explanation: 'توضیح بهتر' });
  const detail = await get(teacher, `/api/bank/questions/${qid}`);
  await test('Editing a published question bumps the version, keeps history and requires re-review', () => {
    assert.equal(editOther.status, 403); assert.equal(viewForeign.status, 404);
    assert.ok(!listForeign.data.some((q) => q.id === qid));
    assert.equal(edit.status, 200); assert.equal(edit.data.version, 2); assert.equal(edit.data.status, 'review');
    assert.deepEqual(detail.data.versions.map((v) => v.version), [2, 1]);
    assert.equal(detail.data.versions[1].snapshot.explanation, 'توضیح 0');
  });
  const badTransition = await post(teacher, `/api/bank/questions/${draft.data.id}/status`, { status: 'archived' });
  const rejectNoNote = await post(manager, `/api/bank/questions/${qid}/status`, { status: 'rejected' });
  const republish = await post(manager, `/api/bank/questions/${qid}/status`, { status: 'published' });
  await test('Status transitions are enforced server-side', () => {
    assert.equal(badTransition.status, 200); // draft → archived is allowed
    assert.equal(rejectNoNote.status, 400);
    assert.equal(republish.status, 200);
    const again = db.prepare('SELECT status FROM question_bank WHERE id=?').get(draft.data.id).status;
    assert.equal(again, 'archived');
  });

  // Link one published question to an official exam: it must never appear in practice.
  const linked = created[7].data.id;
  db.prepare('INSERT INTO exam_question_links(exam_id,position,question_id,version) VALUES (?,?,?,1)').run(globalThis.__platform.examId, 0, linked);

  // A classmate leads by real (non-practice) points, so practice points would visibly change the rank if counted.
  db.prepare("INSERT INTO points(student_id,amount,category,reason,ref) VALUES(41,100,'فعالیت','lead','lead:1')").run();
  db.prepare('UPDATE students SET class_id=1 WHERE user_id=41').run();
  const rankBefore = (await get(student, '/api/student/dashboard')).data;
  const officialBefore = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(percent),0) s FROM exam_results WHERE student_id=40').get();
  const learn = await post(student, '/api/student/self-exams', { mode: 'learning', book_id: book.data.id, count: 30 });
  const ids = JSON.parse(db.prepare('SELECT questions_json FROM self_exams WHERE id=?').get(learn.data.id).questions_json).map((q) => q.question_id);
  await test('Practice draws only published, practice-allowed, non-exam-linked questions of the student center', () => {
    assert.equal(learn.status, 200, JSON.stringify(learn.data));
    assert.equal(learn.data.source, 'bank');
    assert.ok(!ids.includes(linked)); assert.ok(!ids.includes(draft.data.id));
    assert.equal(ids.length, 7); // 8 published − 1 linked to an official exam; drafts and the draft image question are excluded
    assert.ok(!JSON.stringify(learn.data).includes('"answer"'), 'answer key must not be sent before answering');
  });
  const pos0 = learn.data.questions[0];
  const stored = JSON.parse(db.prepare('SELECT questions_json FROM self_exams WHERE id=?').get(learn.data.id).questions_json);
  const right = stored[0].answer, wrong = (right + 1) % 4;
  const a1 = await post(student, `/api/student/self-exams/${learn.data.id}/answer`, { position: 0, choice: right });
  const a1again = await post(student, `/api/student/self-exams/${learn.data.id}/answer`, { position: 0, choice: wrong });
  const a2 = await post(student, `/api/student/self-exams/${learn.data.id}/answer`, { position: 1, choice: (stored[1].answer + 1) % 4 });
  const steal = await post(student2, `/api/student/self-exams/${learn.data.id}/answer`, { position: 2, choice: 0 });
  const view = await get(student, `/api/student/self-exams/${learn.data.id}`);
  await test('Learning mode gives immediate feedback, locks answered questions and reveals only answered keys', () => {
    assert.equal(a1.status, 200); assert.equal(a1.data.is_correct, true); assert.ok(a1.data.explanation);
    assert.equal(a1again.status, 409);
    assert.equal(a2.data.is_correct, false); assert.equal(a2.data.correct, stored[1].answer);
    assert.equal(steal.status, 404);
    assert.ok('answer' in view.data.questions[0] && 'answer' in view.data.questions[1]);
    assert.ok(!('answer' in view.data.questions[2]));
    assert.ok(pos0.text);
  });
  const fin = await post(student, `/api/student/self-exams/${learn.data.id}/submit`, { answers: { 0: wrong, 1: right } });
  await test('Learning-mode submit uses stored answers (cannot be rewritten at submit)', () => {
    assert.equal(fin.status, 200);
    assert.equal(fin.data.correctCount, 1); assert.equal(fin.data.wrongCount, 1); assert.equal(fin.data.blankCount, stored.length - 2);
  });
  const testMode = await post(student, '/api/student/self-exams', { mode: 'test', topic_id: topic1, difficulty: 'easy', count: 5, timed: false });
  const tq = JSON.parse(db.prepare('SELECT questions_json FROM self_exams WHERE id=?').get(testMode.data.id).questions_json);
  const tAnswer = await post(student, `/api/student/self-exams/${testMode.data.id}/answer`, { position: 0, choice: 0 });
  const tSubmit = await post(student, `/api/student/self-exams/${testMode.data.id}/submit`, { answers: Object.fromEntries(tq.map((q, i) => [i, (q.answer + 1) % 4])) });
  const tTwice = await post(student, `/api/student/self-exams/${testMode.data.id}/submit`, { answers: {} });
  await test('Personal test mode: filters by topic/difficulty, no instant feedback, untimed allowed, single submit', () => {
    assert.equal(testMode.status, 200, JSON.stringify(testMode.data));
    assert.equal(testMode.data.timed, false);
    assert.ok(tq.every((q) => q.topic_id === topic1));
    assert.equal(tAnswer.status, 400);
    assert.equal(tSubmit.data.wrongCount, tq.length);
    assert.equal(tTwice.status, 409);
  });
  const none = await post(student, '/api/student/self-exams', { topic_id: topic2, difficulty: 'hard' });
  const foreignPractice = await post(foreignStudent, '/api/student/self-exams', { book_id: book.data.id });
  await test('Empty selections and other centers\' books return no questions', () => {
    assert.equal(none.status, 404); assert.equal(foreignPractice.status, 404);
  });

  const rankAfter = (await get(student, '/api/student/dashboard')).data;
  const officialAfter = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(percent),0) s FROM exam_results WHERE student_id=40').get();
  // Award practice points directly too, to prove ranking ignores them even when they exist.
  db.prepare("INSERT INTO points(student_id,amount,category,reason,ref) VALUES(40,500,'تمرین آزاد','test','self_exam:999999')").run();
  const rankForced = (await get(student, '/api/student/dashboard')).data;
  db.prepare('UPDATE students SET class_id=2 WHERE user_id=41').run();
  await test('Free practice never changes official results or class/center ranking', () => {
    assert.equal(rankBefore.rank.rank, 2); assert.equal(rankBefore.rankings.class.rank, 2); assert.equal(rankBefore.rankings.center.rank, 2);
    assert.deepEqual({ ...officialAfter }, { ...officialBefore });
    assert.deepEqual(JSON.stringify(rankAfter.rankings ?? rankAfter.rank), JSON.stringify(rankBefore.rankings ?? rankBefore.rank));
    assert.deepEqual(JSON.stringify(rankForced.rankings ?? rankForced.rank), JSON.stringify(rankBefore.rankings ?? rankBefore.rank));
  });
  const ov = await get(student, '/api/student/practice/overview');
  await test('Practice overview: accuracy, topic mastery, mistakes review and deterministic recommendations', () => {
    assert.equal(ov.status, 200);
    assert.ok(ov.data.totals.answered >= 2);
    const weak = ov.data.topics.find((t) => t.key === topic1);
    assert.ok(weak && weak.attempted >= 3 && weak.mastery < 60, JSON.stringify(ov.data.topics));
    assert.ok(ov.data.mistakes.length >= 1 && ov.data.mistakes[0].explanation);
    assert.ok(ov.data.recommendations.some((r) => r.kind === 'weak' && r.topic_id === topic1));
    assert.match(ov.data.note, /رسمی/);
  });
  const books = await get(student, '/api/bank/books');
  await test('Students see the book/topic catalog with practice counts but no answer keys', () => {
    assert.equal(books.status, 200);
    const b = books.data.find((x) => x.id === book.data.id);
    assert.equal(b.practice_questions, 7);
    assert.ok(!JSON.stringify(books.data).includes('correct_option'));
  });
  const stuBank = await get(student, '/api/bank/questions');
  await test('Students cannot list the bank (keys stay staff-only)', () => assert.equal(stuBank.status, 403));
}
