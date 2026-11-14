// Phase 4b: AI question drafts from a permitted PDF (mock provider; no network, no key).
import { runningJobs } from '../../server/routes/ai.js';

const pdf = (pages, extra = '') => 'data:application/pdf;base64,' + Buffer.from(`%PDF-1.4\n${Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj\n`).join('')}2 0 obj << /Type /Pages /Count ${pages} >> endobj\n${extra}%%EOF\n`).toString('base64');
const settle = () => Promise.all([...runningJobs.values()]);

export default async function ({ db, test, get, post }, assert) {
  console.log('— Phase 4b: AI question drafts');
  const { manager, teacher, teacher2, student, otherManager } = globalThis;
  delete process.env.ROSHD_AI_PROVIDER; delete process.env.ANTHROPIC_API_KEY;
  const off = await get(teacher, '/api/bank/ai/status');
  await test('Without a configured provider the AI feature reports disabled (no fake results)', () => {
    assert.equal(off.data.enabled, false); assert.ok(off.data.reason);
  });
  process.env.ROSHD_AI_PROVIDER = 'mock'; process.env.ROSHD_AI_MOCK = 'ok'; process.env.ROSHD_AI_MOCK_DELAY = '30';
  const bad = await Promise.all([
    post(teacher, '/api/bank/ai/sources', { title: 'کتاب', file: { data: pdf(10) } }),
    post(teacher, '/api/bank/ai/sources', { title: 'کتاب', rights_confirmed: true, file: { data: 'data:application/pdf;base64,' + Buffer.from('not a pdf'.repeat(20)).toString('base64') } }),
    post(teacher, '/api/bank/ai/sources', { title: 'کتاب', rights_confirmed: true, file: { data: pdf(3, '4 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj\n') } }),
    post(teacher, '/api/bank/ai/sources', { title: 'کتاب', rights_confirmed: true, file: { data: pdf(3, '/Encrypt 9 0 R\n') } }),
    post(teacher, '/api/bank/ai/sources', { title: 'کتاب', rights_confirmed: true, file: { data: 'data:image/png;base64,AAAA' } }),
    post(student, '/api/bank/ai/sources', { title: 'کتاب', rights_confirmed: true, file: { data: pdf(10) } }),
  ]);
  const src = await post(teacher, '/api/bank/ai/sources', { title: 'ریاضی هفتم — فصل ۱', rights_confirmed: true, file: { name: 'r7.pdf', data: pdf(12) } });
  const again = await post(teacher, '/api/bank/ai/sources', { title: 'تکراری', rights_confirmed: true, file: { data: pdf(12) } });
  await test('PDF intake requires rights confirmation and rejects non-PDF, scripted and encrypted files', () => {
    assert.deepEqual(bad.map((r) => r.status), [400, 400, 400, 400, 400, 403], JSON.stringify(bad.map((r) => r.data)));
    assert.equal(src.status, 200); assert.equal(src.data.pages, 12);
    assert.equal(again.data.existing, true);
    const row = db.prepare('SELECT sha256 FROM ai_sources WHERE id=?').get(src.data.id);
    assert.ok(!(row.sha256 + '.pdf').includes('/'));
  });
  const topic = db.prepare("SELECT t.id FROM book_topics t JOIN book_chapters c ON c.id=t.chapter_id JOIN educational_books b ON b.id=c.book_id WHERE b.center_id=1 AND b.grade=7 LIMIT 1").get().id;
  const job = { source_id: src.data.id, grade: 7, subject: 'ریاضی', topic_id: topic, count: 4, difficulty: 'medium', page_from: 2, page_to: 3 };
  const invalid = await Promise.all([
    post(teacher, '/api/bank/ai/jobs', { ...job, page_to: 99 }),
    post(teacher, '/api/bank/ai/jobs', { ...job, count: 50 }),
    post(teacher, '/api/bank/ai/jobs', { ...job, grade: 9 }),
    post(otherManager, '/api/bank/ai/jobs', job),
  ]);
  const j1 = await post(teacher, '/api/bank/ai/jobs', job);
  const busy = await post(teacher, '/api/bank/ai/jobs', job);
  await settle();
  const jobs = await get(teacher, '/api/bank/ai/jobs');
  const drafts = db.prepare('SELECT * FROM question_bank WHERE ai_job_id=?').all(j1.data.id);
  await test('A valid job creates grounded drafts in review status with flags; invalid ranges/grades/centers are rejected', () => {
    assert.deepEqual(invalid.map((r) => r.status), [400, 400, 403, 404], JSON.stringify(invalid.map((r) => r.data)));
    assert.equal(j1.status, 200, JSON.stringify(j1.data)); assert.equal(busy.status, 429);
    const j = jobs.data.find((x) => x.id === j1.data.id);
    assert.equal(j.status, 'succeeded'); assert.equal(j.accepted, 4); assert.equal(j.flagged, 1); assert.equal(j.input_tokens, 1000);
    assert.ok(drafts.every((q) => q.status === 'review' && q.ai_generated === 1 && q.topic_id === topic && q.source_page >= 2 && q.source_page <= 3));
    assert.deepEqual(JSON.parse(drafts[1].ai_flags), ['ambiguous']);
  });
  process.env.ROSHD_AI_MOCK = 'bad';
  const j2 = await post(teacher, '/api/bank/ai/jobs', { ...job, count: 2, page_from: 5, page_to: 6 });
  await settle();
  const r2 = db.prepare('SELECT * FROM ai_generation_jobs WHERE id=?').get(j2.data.id);
  const d2 = db.prepare('SELECT * FROM question_bank WHERE ai_job_id=?').all(j2.data.id);
  await test('Malformed items are discarded, duplicates dropped, out-of-range pages nulled and flagged (never fabricated)', () => {
    assert.equal(r2.status, 'succeeded');
    assert.equal(r2.discarded, 3, JSON.stringify(r2)); // 3-option item, in-batch duplicate, bad key
    const outOfRange = d2.find((q) => q.text === 'صفحهٔ خارج از بازه');
    assert.ok(outOfRange); assert.equal(outOfRange.source_page, null); assert.ok(JSON.parse(outOfRange.ai_flags).includes('page_out_of_range'));
  });
  for (const mode of ['timeout', 'malformed']) {
    process.env.ROSHD_AI_MOCK = mode;
    const j = await post(teacher, '/api/bank/ai/jobs', job);
    await settle();
    const row = db.prepare('SELECT status, error FROM ai_generation_jobs WHERE id=?').get(j.data.id);
    await test(`AI ${mode} fails the job cleanly with a Persian error and no drafts`, () => {
      assert.equal(row.status, 'failed'); assert.ok(row.error);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM question_bank WHERE ai_job_id=?').get(j.data.id).n, 0);
    });
  }
  const directPublish = await post(teacher, `/api/bank/questions/${drafts[0].id}/status`, { status: 'published' });
  const viaDraft = await post(teacher, `/api/bank/questions/${drafts[2].id}/status`, { status: 'draft' });
  const draftPublish = await post(teacher, `/api/bank/questions/${drafts[2].id}/status`, { status: 'published' });
  const practiceBefore = JSON.stringify((await post(student, '/api/student/self-exams', { mode: 'test', topic_id: topic, count: 30, timed: false })).data);
  await test('Only teacher-approved AI drafts are published; unreviewed drafts never reach students', () => {
    assert.equal(directPublish.status, 200); // review → published is the approval step
    assert.equal(viaDraft.status, 200); assert.equal(draftPublish.status, 400);
    assert.ok(!practiceBefore.includes(drafts[3].text));
  });
  process.env.ROSHD_AI_MOCK = 'ok';
  db.prepare("UPDATE ai_generation_jobs SET created_at=datetime('now')").run();
  process.env.ROSHD_AI_DAILY_JOBS = String(db.prepare("SELECT COUNT(*) n FROM ai_generation_jobs WHERE center_id=1").get().n);
  const limited = await post(manager, '/api/bank/ai/jobs', job);
  delete process.env.ROSHD_AI_DAILY_JOBS;
  const other = await get(teacher2, '/api/bank/ai/jobs');
  await test('Daily per-center rate limit and per-teacher job visibility are enforced', () => {
    assert.equal(limited.status, 429);
    assert.equal(other.data.length, 0);
  });
  delete process.env.ROSHD_AI_PROVIDER;
}
