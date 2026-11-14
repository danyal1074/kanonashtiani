// بانک سؤال مرکزی و تمرین آزاد دانش‌آموز.
// - کتاب ← فصل ← مبحث، سؤال چهارگزینه‌ای متنی/تصویری، نسخه‌بندی، وضعیت بازبینی/انتشار، جلوگیری از تکرار.
// - تمرین آزاد همان «خودسنجی» موجود (جدول self_exams) است که دو حالت گرفته: یادگیری (بازخورد فوری) و آزمون شخصی.
// - ثابت مهم: نتیجهٔ تمرین آزاد هیچ اثری بر نمرهٔ رسمی (exam_results) و رتبه ندارد.
// - کلید سؤال‌ها فقط برای کارکنان همان کانون قابل مشاهده است؛ سؤال پیوندخورده به آزمون رسمی وارد تمرین نمی‌شود.
import crypto from 'node:crypto';
import { all, get, run, tx, audit } from '../db.js';
import { fail, clampStr, toEnDigits, saveUpload } from '../util.js';
import { addPoints } from '../logic.js';
import { studentInfo } from './common.js';
import { CURATED_QUESTIONS, evaluateSelfExam } from '../self_exam.js';

const B = { roles: ['teacher', 'manager'] };
const S = { roles: ['student'] };
const DIFF = ['easy', 'medium', 'hard'];
const DIFF_FA = { easy: 'آسان', medium: 'متوسط', hard: 'دشوار' };
const STATUSES = ['draft', 'review', 'published', 'rejected', 'archived'];
const int = (v) => { const n = Number(toEnDigits(String(v ?? ''))); return Number.isInteger(n) ? n : null; };
const safeJson = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// ---------- دسترسی ----------
// معلم فقط برای پایه‌هایی که تدریس می‌کند سؤال/کتاب می‌سازد و فقط سؤال‌های خودش را ویرایش می‌کند؛ مدیر کل کانون.
const teacherGrades = (uid) => all('SELECT DISTINCT c.grade FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=?', uid).map((x) => x.grade);
function assertGrade(ctx, grade) {
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) fail(400, 'پایه نامعتبر است');
  if (ctx.user.role === 'teacher' && !teacherGrades(ctx.user.id).includes(grade)) fail(403, 'این پایه را تدریس نمی‌کنید');
}
function ownBook(ctx, id) {
  const b = get('SELECT * FROM educational_books WHERE id=? AND center_id=?', int(id), ctx.user.center_id);
  if (!b) fail(404, 'کتاب یافت نشد');
  return b;
}
function ownChapter(ctx, id) {
  const c = get('SELECT c.*, b.center_id, b.grade, b.subject FROM book_chapters c JOIN educational_books b ON b.id=c.book_id WHERE c.id=? AND b.center_id=?', int(id), ctx.user.center_id);
  if (!c) fail(404, 'فصل یافت نشد');
  return c;
}
function ownTopic(ctx, id) {
  const t = get(`SELECT t.*, c.book_id, b.grade, b.subject FROM book_topics t JOIN book_chapters c ON c.id=t.chapter_id JOIN educational_books b ON b.id=c.book_id
    WHERE t.id=? AND b.center_id=?`, int(id), ctx.user.center_id);
  if (!t) fail(404, 'مبحث یافت نشد');
  return t;
}
export function ownQuestion(ctx, id, { write = false } = {}) {
  const q = get('SELECT * FROM question_bank WHERE id=? AND center_id=?', int(id), ctx.user.center_id);
  if (!q) fail(404, 'سؤال یافت نشد');
  if (write && ctx.user.role === 'teacher' && q.created_by !== ctx.user.id) fail(403, 'فقط سؤال‌های خودتان را می‌توانید تغییر دهید');
  return q;
}

// ---------- اعتبارسنجی و هش محتوا ----------
const norm = (s) => toEnDigits(String(s ?? '')).replace(/[‌\s]+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLowerCase();
export const contentHash = (text, options) => crypto.createHash('sha256').update(JSON.stringify([norm(text), ...options.map(norm).sort()])).digest('hex');

const IMAGE_SIG = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
function saveQuestionImage(file) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(file?.data || ''));
  if (!m) fail(400, 'تصویر سؤال باید PNG، JPEG یا WebP باشد');
  const head = Buffer.from(m[2].slice(0, 16), 'base64');
  if (!IMAGE_SIG[m[1]].every((b, i) => head[i] === b)) fail(400, 'محتوای فایل با نوع تصویر هم‌خوانی ندارد');
  return '/uploads/' + saveUpload({ data: file.data }, 2);
}

// ورودی سؤال (ایجاد یا ویرایش) را کامل اعتبارسنجی و به ردیف جدول تبدیل می‌کند.
export function parseQuestion(ctx, b, prev = null) {
  const grade = b.grade == null && prev ? prev.grade : int(b.grade);
  assertGrade(ctx, grade);
  const subject = clampStr(b.subject ?? prev?.subject, 40);
  if (!subject) fail(400, 'درس سؤال را مشخص کنید');
  const text = clampStr(b.text ?? prev?.text, 2000);
  if (!text) fail(400, 'متن سؤال را وارد کنید');
  const options = Array.isArray(b.options) ? b.options.map((o) => clampStr(o, 500)) : prev ? safeJson(prev.options_json, []) : [];
  if (options.length !== 4 || options.some((o) => !o)) fail(400, 'سؤال باید دقیقاً چهار گزینهٔ غیرخالی داشته باشد');
  if (new Set(options.map(norm)).size !== 4) fail(400, 'گزینه‌های تکراری مجاز نیست');
  const correct = b.correct_option == null && prev ? prev.correct_option : int(b.correct_option);
  if (!(correct >= 0 && correct <= 3)) fail(400, 'گزینهٔ درست را انتخاب کنید');
  const difficulty = b.difficulty ?? prev?.difficulty ?? 'medium';
  if (!DIFF.includes(difficulty)) fail(400, 'سطح دشواری نامعتبر است');
  let book_id = null, chapter_id = null, topic_id = null;
  const topicIn = b.topic_id !== undefined ? b.topic_id : prev?.topic_id, chapterIn = b.chapter_id !== undefined ? b.chapter_id : prev?.chapter_id, bookIn = b.book_id !== undefined ? b.book_id : prev?.book_id;
  if (topicIn) { const t = ownTopic(ctx, topicIn); topic_id = t.id; chapter_id = t.chapter_id; book_id = t.book_id; }
  else if (chapterIn) { const c = ownChapter(ctx, chapterIn); chapter_id = c.id; book_id = c.book_id; }
  else if (bookIn) book_id = ownBook(ctx, bookIn).id;
  if (book_id) { const bk = get('SELECT grade, subject FROM educational_books WHERE id=?', book_id); if (bk.grade !== grade || bk.subject !== subject) fail(400, 'پایه و درس سؤال با کتاب انتخاب‌شده یکسان نیست'); }
  let image = b.image === null ? null : prev?.image ?? null;
  if (b.image_file) image = saveQuestionImage(b.image_file);
  const sp = b.source_page == null || b.source_page === '' ? (b.source_page === '' ? null : prev?.source_page ?? null) : int(b.source_page);
  if (sp != null && !(sp >= 1 && sp <= 5000)) fail(400, 'شمارهٔ صفحهٔ منبع نامعتبر است');
  return {
    grade, subject, text, options, correct_option: correct, difficulty, book_id, chapter_id, topic_id, image,
    qtype: image ? 'mcq4_image' : 'mcq4', explanation: clampStr(b.explanation ?? prev?.explanation, 2000) || null,
    source_page: sp, source_ref: clampStr(b.source_ref ?? prev?.source_ref, 200) || null,
    practice_allowed: b.practice_allowed == null ? (prev ? prev.practice_allowed : 1) : (b.practice_allowed ? 1 : 0),
    content_hash: contentHash(text, options),
  };
}
const snapshot = (q) => ({ text: q.text, options: safeJson(q.options_json, []), correct_option: q.correct_option, explanation: q.explanation, image: q.image, difficulty: q.difficulty, topic_id: q.topic_id, source_page: q.source_page, version: q.version });

export function insertQuestion(ctx, d, { status = 'draft', ai = null } = {}) {
  const dup = get("SELECT id, status FROM question_bank WHERE center_id=? AND content_hash=? AND status<>'archived'", ctx.user.center_id, d.content_hash);
  if (dup) fail(409, `این سؤال قبلاً در بانک ثبت شده است (شمارهٔ ${dup.id})`);
  const id = Number(run(`INSERT INTO question_bank (center_id,grade,subject,book_id,chapter_id,topic_id,difficulty,qtype,text,image,options_json,correct_option,explanation,source_page,source_ref,
      ai_generated,ai_job_id,status,practice_allowed,content_hash,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ctx.user.center_id, d.grade, d.subject, d.book_id, d.chapter_id, d.topic_id, d.difficulty, d.qtype, d.text, d.image, JSON.stringify(d.options), d.correct_option, d.explanation,
  d.source_page, d.source_ref, ai ? 1 : 0, ai, status, d.practice_allowed, d.content_hash, ctx.user.id).lastInsertRowid);
  const q = get('SELECT * FROM question_bank WHERE id=?', id);
  run('INSERT INTO question_versions(question_id,version,snapshot_json,changed_by) VALUES (?,?,?,?)', id, 1, JSON.stringify(snapshot(q)), ctx.user.id);
  return q;
}

// انتقال‌های مجاز وضعیت؛ انتشار سؤالِ ساخت هوش مصنوعی فقط پس از بازبینی انسانی (review) ممکن است.
const TRANSITIONS = { draft: ['review', 'published', 'archived'], review: ['published', 'rejected', 'draft'], rejected: ['draft', 'archived'], published: ['archived'], archived: [] };
export function setStatus(ctx, q, to, note = null) {
  if (!STATUSES.includes(to) || !TRANSITIONS[q.status].includes(to)) fail(400, `تغییر وضعیت از «${q.status}» به «${to}» مجاز نیست`);
  if (to === 'published' && q.ai_generated && q.status !== 'review') fail(400, 'سؤال تولیدشده با هوش مصنوعی باید ابتدا بازبینی شود');
  if (to === 'rejected' && !note) fail(400, 'علت رد سؤال را بنویسید');
  run(`UPDATE question_bank SET status=?, review_note=COALESCE(?, review_note), reviewed_by=CASE WHEN ? IN ('published','rejected') THEN ? ELSE reviewed_by END,
    reviewed_at=CASE WHEN ? IN ('published','rejected') THEN datetime('now') ELSE reviewed_at END, updated_at=datetime('now') WHERE id=?`, to, note, to, ctx.user.id, to, q.id);
  audit(ctx.user.center_id, ctx.user.id, 'question.status', 'question', q.id, { from: q.status, to, note });
}

const publicQuestion = (q) => ({ ...q, options: safeJson(q.options_json, []), options_json: undefined, difficulty_fa: DIFF_FA[q.difficulty] });

// ---------- انتخاب سؤال برای تمرین آزاد ----------
// فقط سؤال‌های «منتشرشده»، مجاز برای تمرین، از کانون خود دانش‌آموز و بدون پیوند به آزمون رسمی.
export function practicePool(centerId, f) {
  const where = ["q.center_id=?", "q.status='published'", 'q.practice_allowed=1', 'NOT EXISTS (SELECT 1 FROM exam_question_links l WHERE l.question_id=q.id)'];
  const p = [centerId];
  for (const k of ['grade', 'book_id', 'chapter_id', 'topic_id']) if (f[k]) { where.push(`q.${k}=?`); p.push(f[k]); }
  if (f.subject) { where.push('q.subject=?'); p.push(f.subject); }
  if (f.difficulty) { where.push('q.difficulty=?'); p.push(f.difficulty); }
  return all(`SELECT q.* FROM question_bank q WHERE ${where.join(' AND ')}`, ...p);
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- تحلیل تمرین ----------
const pct = (c, n) => (n ? Math.round((c / n) * 1000) / 10 : null);
export function practiceOverview(studentId, centerId) {
  const rows = all(`SELECT pa.*, t.title topic_title FROM practice_answers pa LEFT JOIN book_topics t ON t.id=pa.topic_id WHERE pa.student_id=?`, studentId);
  const answered = rows.filter((r) => r.chosen != null);
  const group = (keyFn, labelFn) => {
    const m = new Map();
    for (const r of rows) { const k = keyFn(r); if (k == null) continue; const g = m.get(k) || { key: k, label: labelFn(r), attempted: 0, correct: 0, blank: 0 }; g.attempted++; if (r.is_correct) g.correct++; if (r.chosen == null) g.blank++; m.set(k, g); }
    return [...m.values()].map((g) => ({ ...g, mastery: pct(g.correct, g.attempted) })).sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0));
  };
  const topics = group((r) => r.topic_id, (r) => r.topic_title || 'بدون مبحث');
  const subjects = group((r) => r.subject || null, (r) => r.subject);
  const sessions = all(`SELECT id, title, subject, mode, question_count, percentage, correct_count, wrong_count, blank_count, status, created_at, finished_at FROM self_exams WHERE student_id=? ORDER BY id DESC LIMIT 30`, studentId);
  // پیشنهاد قطعی (بدون هوش مصنوعی): مباحث ضعیف ← تمرین آسان/متوسط؛ مباحث قوی ← دشوارتر؛ مباحث تمرین‌نشده ← شروع.
  const student = get('SELECT grade FROM students WHERE user_id=?', studentId);
  const recommendations = [];
  for (const t of topics.filter((t) => t.key && t.attempted >= 3 && t.mastery < 60).slice(0, 3)) recommendations.push({ kind: 'weak', topic_id: t.key, title: `مرور «${t.label}»`, reason: `تسلط ${t.mastery}٪ در ${t.attempted} سؤال`, difficulty: t.mastery < 40 ? 'easy' : 'medium' });
  for (const t of topics.filter((t) => t.key && t.attempted >= 5 && t.mastery >= 85).slice(-2)) recommendations.push({ kind: 'strong', topic_id: t.key, title: `چالش دشوار «${t.label}»`, reason: `تسلط ${t.mastery}٪`, difficulty: 'hard' });
  if (student) {
    const seen = new Set(topics.map((t) => t.key));
    const fresh = all(`SELECT t.id, t.title, COUNT(q.id) n FROM question_bank q JOIN book_topics t ON t.id=q.topic_id WHERE q.center_id=? AND q.grade=? AND q.status='published' AND q.practice_allowed=1
      AND NOT EXISTS (SELECT 1 FROM exam_question_links l WHERE l.question_id=q.id) GROUP BY t.id ORDER BY n DESC`, centerId, student.grade).filter((t) => !seen.has(t.id)).slice(0, 2);
    for (const t of fresh) recommendations.push({ kind: 'new', topic_id: t.id, title: `شروع مبحث «${t.title}»`, reason: `${t.n} سؤال آماده`, difficulty: 'easy' });
  }
  const mistakes = [];
  for (const s of all(`SELECT id, questions_json FROM self_exams WHERE student_id=? AND status='completed' ORDER BY id DESC LIMIT 20`, studentId)) {
    const qs = safeJson(s.questions_json, []);
    for (const a of answered.filter((r) => r.session_id === s.id && !r.is_correct)) {
      const q = qs[a.position];
      if (q) mistakes.push({ session_id: s.id, question_id: a.question_id, topic_id: a.topic_id, text: q.text, image: q.image || null, options: q.options, chosen: a.chosen, correct: q.answer, explanation: q.explanation || null, answered_at: a.answered_at });
    }
    if (mistakes.length >= 30) break;
  }
  return {
    totals: { sessions: sessions.filter((s) => s.status === 'completed').length, answered: answered.length, correct: rows.filter((r) => r.is_correct).length, accuracy: pct(rows.filter((r) => r.is_correct).length, answered.length) },
    topics, subjects, sessions, mistakes: mistakes.slice(0, 30), recommendations, note: 'نتایج تمرین آزاد در نمره و رتبهٔ رسمی اثری ندارد.',
  };
}

const sanitize = (questions, revealUpTo = null) => questions.map((q, i) => ({ position: i, text: q.text, image: q.image || null, options: q.options, subject: q.subject, topic: q.topic || null, ...(revealUpTo?.has(i) ? { answer: q.answer, explanation: q.explanation || null } : {}) }));

export default function register(r) {
  // ---------- کتاب، فصل، مبحث ----------
  r.get('/api/bank/books', { roles: ['teacher', 'manager', 'student'] }, (ctx) => {
    const books = all('SELECT * FROM educational_books WHERE center_id=? ORDER BY grade, subject, title', ctx.user.center_id);
    const chapters = all('SELECT c.* FROM book_chapters c JOIN educational_books b ON b.id=c.book_id WHERE b.center_id=? ORDER BY c.ord, c.id', ctx.user.center_id);
    const topics = all('SELECT t.* FROM book_topics t JOIN book_chapters c ON c.id=t.chapter_id JOIN educational_books b ON b.id=c.book_id WHERE b.center_id=? ORDER BY t.ord, t.id', ctx.user.center_id);
    // دانش‌آموز فقط تعداد سؤال‌های قابل تمرین را می‌بیند (نه وضعیت بانک)
    const counts = all(`SELECT q.topic_id, q.chapter_id, q.book_id, q.difficulty, COUNT(*) n FROM question_bank q WHERE q.center_id=? AND q.status='published' AND q.practice_allowed=1
      AND NOT EXISTS (SELECT 1 FROM exam_question_links l WHERE l.question_id=q.id) GROUP BY q.topic_id, q.chapter_id, q.book_id, q.difficulty`, ctx.user.center_id);
    const sum = (k, id) => counts.filter((c) => c[k] === id).reduce((n, c) => n + c.n, 0);
    return books.map((b) => ({ ...b, practice_questions: sum('book_id', b.id), chapters: chapters.filter((c) => c.book_id === b.id).map((c) => ({ ...c, practice_questions: sum('chapter_id', c.id), topics: topics.filter((t) => t.chapter_id === c.id).map((t) => ({ ...t, practice_questions: sum('topic_id', t.id) })) })) }));
  });
  r.post('/api/bank/books', B, (ctx) => {
    const b = ctx.body, grade = int(b.grade); assertGrade(ctx, grade);
    const subject = clampStr(b.subject, 40), title = clampStr(b.title, 150);
    if (!subject || !title) fail(400, 'درس و عنوان کتاب لازم است');
    if (get('SELECT id FROM educational_books WHERE center_id=? AND grade=? AND subject=? AND title=?', ctx.user.center_id, grade, subject, title)) fail(409, 'این کتاب قبلاً ثبت شده است');
    const id = Number(run('INSERT INTO educational_books(center_id,grade,subject,title,publisher,created_by) VALUES (?,?,?,?,?,?)', ctx.user.center_id, grade, subject, title, clampStr(b.publisher, 100) || null, ctx.user.id).lastInsertRowid);
    return { ok: true, id };
  });
  r.post('/api/bank/books/:id/chapters', B, (ctx) => {
    const book = ownBook(ctx, ctx.params.id); assertGrade(ctx, book.grade);
    const title = clampStr(ctx.body.title, 150) || fail(400, 'عنوان فصل لازم است');
    const ord = get('SELECT COALESCE(MAX(ord),0)+1 n FROM book_chapters WHERE book_id=?', book.id).n;
    return { ok: true, id: Number(run('INSERT INTO book_chapters(book_id,ord,title) VALUES (?,?,?)', book.id, ord, title).lastInsertRowid) };
  });
  r.post('/api/bank/chapters/:id/topics', B, (ctx) => {
    const ch = ownChapter(ctx, ctx.params.id); assertGrade(ctx, ch.grade);
    const title = clampStr(ctx.body.title, 150) || fail(400, 'عنوان مبحث لازم است');
    const ord = get('SELECT COALESCE(MAX(ord),0)+1 n FROM book_topics WHERE chapter_id=?', ch.id).n;
    return { ok: true, id: Number(run('INSERT INTO book_topics(chapter_id,ord,title) VALUES (?,?,?)', ch.id, ord, title).lastInsertRowid) };
  });

  // ---------- سؤال‌ها ----------
  r.get('/api/bank/questions', B, (ctx) => {
    const q = ctx.query, where = ['q.center_id=?'], p = [ctx.user.center_id];
    if (ctx.user.role === 'teacher') { const g = teacherGrades(ctx.user.id); where.push(`(q.created_by=? OR q.grade IN (${g.map(() => '?').join(',') || 'NULL'}))`); p.push(ctx.user.id, ...g); }
    for (const k of ['grade', 'book_id', 'chapter_id', 'topic_id']) if (int(q[k])) { where.push(`q.${k}=?`); p.push(int(q[k])); }
    if (q.subject) { where.push('q.subject=?'); p.push(clampStr(q.subject, 40)); }
    if (DIFF.includes(q.difficulty)) { where.push('q.difficulty=?'); p.push(q.difficulty); }
    if (STATUSES.includes(q.status)) { where.push('q.status=?'); p.push(q.status); }
    if (q.mine === '1') { where.push('q.created_by=?'); p.push(ctx.user.id); }
    if (q.ai === '1') where.push('q.ai_generated=1');
    if (q.q) { where.push('q.text LIKE ?'); p.push(`%${clampStr(q.q, 80)}%`); }
    const rows = all(`SELECT q.*, u.full_name author, t.title topic_title, b.title book_title,
        (SELECT COUNT(*) FROM exam_question_links l WHERE l.question_id=q.id) exam_uses
      FROM question_bank q LEFT JOIN users u ON u.id=q.created_by LEFT JOIN book_topics t ON t.id=q.topic_id LEFT JOIN educational_books b ON b.id=q.book_id
      WHERE ${where.join(' AND ')} ORDER BY q.id DESC LIMIT 500`, ...p);
    return rows.map(publicQuestion);
  });
  r.get('/api/bank/questions/:id', B, (ctx) => {
    const q = ownQuestion(ctx, ctx.params.id);
    return { ...publicQuestion(q), versions: all('SELECT version, snapshot_json, changed_by, created_at FROM question_versions WHERE question_id=? ORDER BY version DESC', q.id).map((v) => ({ ...v, snapshot: safeJson(v.snapshot_json, {}), snapshot_json: undefined })) };
  });
  r.post('/api/bank/questions', B, (ctx) => {
    const d = parseQuestion(ctx, ctx.body);
    const status = ['draft', 'review', 'published'].includes(ctx.body.status) ? ctx.body.status : 'draft';
    return tx(() => {
      const q = insertQuestion(ctx, d, { status: 'draft' });
      if (status !== 'draft') setStatus(ctx, q, status);
      audit(ctx.user.center_id, ctx.user.id, 'question.create', 'question', q.id, { status });
      return { ok: true, id: q.id };
    });
  });
  // ویرایش: نسخه بالا می‌رود و نسخهٔ قبلی نگه داشته می‌شود؛ ویرایش سؤال منتشرشده آن را به «بازبینی» برمی‌گرداند.
  r.put('/api/bank/questions/:id', B, (ctx) => {
    const prev = ownQuestion(ctx, ctx.params.id, { write: true });
    if (prev.status === 'archived') fail(400, 'سؤال بایگانی‌شده قابل ویرایش نیست');
    const d = parseQuestion(ctx, ctx.body, prev);
    return tx(() => {
      if (get("SELECT id FROM question_bank WHERE center_id=? AND content_hash=? AND id<>? AND status<>'archived'", ctx.user.center_id, d.content_hash, prev.id)) fail(409, 'سؤال مشابه دیگری در بانک وجود دارد');
      const status = prev.status === 'published' ? 'review' : prev.status === 'rejected' ? 'draft' : prev.status;
      run(`UPDATE question_bank SET grade=?,subject=?,book_id=?,chapter_id=?,topic_id=?,difficulty=?,qtype=?,text=?,image=?,options_json=?,correct_option=?,explanation=?,source_page=?,source_ref=?,
        practice_allowed=?,content_hash=?,status=?,version=version+1,updated_at=datetime('now') WHERE id=?`, d.grade, d.subject, d.book_id, d.chapter_id, d.topic_id, d.difficulty, d.qtype, d.text, d.image,
      JSON.stringify(d.options), d.correct_option, d.explanation, d.source_page, d.source_ref, d.practice_allowed, d.content_hash, status, prev.id);
      const q = get('SELECT * FROM question_bank WHERE id=?', prev.id);
      run('INSERT INTO question_versions(question_id,version,snapshot_json,changed_by) VALUES (?,?,?,?)', q.id, q.version, JSON.stringify(snapshot(q)), ctx.user.id);
      audit(ctx.user.center_id, ctx.user.id, 'question.edit', 'question', q.id, { version: q.version, status });
      return { ok: true, version: q.version, status };
    });
  });
  r.post('/api/bank/questions/:id/status', B, (ctx) => {
    const q = ownQuestion(ctx, ctx.params.id);
    // معلم فقط سؤال خودش را منتشر/بایگانی می‌کند؛ رد کردن (بازبینی) برای مدیر یا نویسنده
    if (ctx.user.role === 'teacher' && q.created_by !== ctx.user.id) fail(403, 'فقط نویسندهٔ سؤال یا مدیر کانون می‌تواند وضعیت را تغییر دهد');
    tx(() => setStatus(ctx, q, String(ctx.body.status || ''), clampStr(ctx.body.note, 300) || null));
    return { ok: true };
  });

  // ---------- تمرین آزاد دانش‌آموز ----------
  r.get('/api/student/self-exams', S, (ctx) => all(`SELECT id, title, subject, mode, timed, duration_minutes, question_count, negative_marking, score, percentage, correct_count, wrong_count, blank_count,
    points_awarded, status, created_at, finished_at FROM self_exams WHERE student_id=? ORDER BY id DESC`, ctx.user.id).map((x) => ({ ...x, negative_marking: !!x.negative_marking })));

  r.post('/api/student/self-exams', S, (ctx) => {
    const s = studentInfo(ctx.user.id), b = ctx.body;
    const mode = b.mode === 'learning' ? 'learning' : 'test';
    const count = Math.max(3, Math.min(30, int(b.count ?? b.question_count) || 5));
    const timed = mode === 'test' && b.timed !== false && b.timed !== 0;
    const duration = timed ? Math.max(5, Math.min(120, int(b.duration_minutes) || count * 2)) : 0;
    const grade = int(b.grade) || s.grade;
    if (grade < 1 || grade > 12) fail(400, 'پایه نامعتبر است');
    const f = { grade, subject: clampStr(b.subject, 40) || null, book_id: int(b.book_id), chapter_id: int(b.chapter_id), topic_id: int(b.topic_id), difficulty: DIFF.includes(b.difficulty) ? b.difficulty : null };
    if (f.subject === 'عمومی') f.subject = null;
    let pool = practicePool(ctx.user.center_id, f).map((q) => ({ question_id: q.id, version: q.version, text: q.text, image: q.image, options: safeJson(q.options_json, []), answer: q.correct_option, explanation: q.explanation, subject: q.subject, topic_id: q.topic_id }));
    let source = 'bank';
    // کانونی که هنوز بانک سؤال ندارد: فقط در انتخاب عمومی (بدون کتاب/مبحث) از سؤال‌های نمونهٔ ثابت استفاده می‌شود.
    if (!pool.length && !f.book_id && !f.chapter_id && !f.topic_id) {
      source = 'curated';
      pool = CURATED_QUESTIONS.filter((q) => !f.subject || q.subject === f.subject).map((q) => ({ question_id: null, text: q.text, options: q.options, answer: q.answer, explanation: q.explanation, subject: q.subject, topic_id: null }));
    }
    if (!pool.length) fail(404, 'برای این انتخاب هنوز سؤال منتشرشده‌ای وجود ندارد');
    const picked = shuffle(pool).slice(0, count);
    const topics = new Map(all(`SELECT id, title FROM book_topics WHERE id IN (${picked.map(() => '?').join(',')})`, ...picked.map((q) => q.topic_id ?? -1)).map((t) => [t.id, t.title]));
    picked.forEach((q) => { q.topic = topics.get(q.topic_id) || null; });
    const title = clampStr(b.title, 100) || `${mode === 'learning' ? 'تمرین یادگیری' : 'آزمون شخصی'} ${f.subject || 'ترکیبی'}`;
    const id = tx(() => {
      const id = Number(run(`INSERT INTO self_exams (student_id,title,subject,duration_minutes,question_count,negative_marking,questions_json,status,mode,grade,book_id,chapter_id,topic_id,difficulty,timed)
        VALUES (?,?,?,?,?,?,?,'started',?,?,?,?,?,?,?)`, ctx.user.id, title, f.subject || 'ترکیبی', duration, picked.length, b.negative_marking && mode === 'test' ? 1 : 0, JSON.stringify(picked),
      mode, grade, f.book_id, f.chapter_id, f.topic_id, f.difficulty, timed ? 1 : 0).lastInsertRowid);
      for (const q of picked) if (q.question_id) run('UPDATE question_bank SET usage_count=usage_count+1 WHERE id=?', q.question_id);
      return id;
    });
    return { id, title, mode, source, subject: f.subject || 'ترکیبی', timed, duration_minutes: duration, question_count: picked.length, requested: count, questions: sanitize(picked) };
  });

  const session = (ctx) => {
    const e = get('SELECT * FROM self_exams WHERE id=? AND student_id=?', int(ctx.params.id), ctx.user.id);
    if (!e) fail(404, 'تمرین یافت نشد');
    return { e, qs: safeJson(e.questions_json, []), answers: safeJson(e.answers_json, {}) || {} };
  };
  r.get('/api/student/self-exams/:id', S, (ctx) => {
    const { e, qs, answers } = session(ctx);
    const base = { id: e.id, title: e.title, subject: e.subject, mode: e.mode, timed: !!e.timed, duration_minutes: e.duration_minutes, question_count: e.question_count, negative_marking: !!e.negative_marking, status: e.status, created_at: e.created_at };
    if (e.status === 'completed') return { ...base, ...e, questions: qs, answers, evaluation: evaluateSelfExam(qs.map((q, i) => ({ ...q, id: i })), answers, e.negative_marking === 1), questions_json: undefined, answers_json: undefined };
    // حالت یادگیری: پاسخ و توضیح سؤال‌های پاسخ‌داده‌شده نمایش داده می‌شود، نه بقیه
    const revealed = e.mode === 'learning' ? new Set(Object.keys(answers).map(Number)) : null;
    return { ...base, answers: e.mode === 'learning' ? answers : {}, questions: sanitize(qs, revealed) };
  });

  // حالت یادگیری: ثبت پاسخ یک سؤال و بازخورد فوری؛ پاسخ ثبت‌شده قابل تغییر نیست.
  r.post('/api/student/self-exams/:id/answer', S, (ctx) => {
    const { e, qs, answers } = session(ctx);
    if (e.mode !== 'learning') fail(400, 'بازخورد فوری فقط در حالت یادگیری است');
    if (e.status !== 'started') fail(409, 'این تمرین به پایان رسیده است');
    const pos = int(ctx.body.position), choice = int(ctx.body.choice);
    if (!(pos >= 0 && pos < qs.length)) fail(400, 'سؤال نامعتبر است');
    if (!(choice >= 0 && choice <= 3)) fail(400, 'گزینه نامعتبر است');
    if (answers[pos] != null) fail(409, 'به این سؤال قبلاً پاسخ داده‌ای');
    const q = qs[pos], correct = choice === Number(q.answer);
    tx(() => {
      answers[pos] = choice;
      run('UPDATE self_exams SET answers_json=? WHERE id=?', JSON.stringify(answers), e.id);
      run(`INSERT INTO practice_answers(session_id,student_id,question_id,position,topic_id,subject,chosen,is_correct) VALUES (?,?,?,?,?,?,?,?)`, e.id, ctx.user.id, q.question_id ?? null, pos, q.topic_id ?? null, q.subject ?? null, choice, correct ? 1 : 0);
    });
    return { position: pos, is_correct: correct, correct: Number(q.answer), explanation: q.explanation || null, answered: Object.keys(answers).length, total: qs.length };
  });

  r.post('/api/student/self-exams/:id/submit', S, (ctx) => {
    const { e, qs, answers: stored } = session(ctx);
    if (e.status === 'completed') fail(409, 'پاسخ‌های این تمرین قبلاً ثبت شده است');
    // در حالت یادگیری پاسخ‌های ثبت‌شده مرجع‌اند؛ در آزمون شخصی پاسخ‌های ارسالی خوانده می‌شوند.
    const sent = typeof ctx.body.answers === 'object' && ctx.body.answers ? ctx.body.answers : {};
    const answers = {};
    qs.forEach((_, i) => {
      const v = e.mode === 'learning' ? stored[i] : sent[i];
      if (v != null && v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 3) answers[i] = Number(v);
    });
    const evalResult = evaluateSelfExam(qs.map((q, i) => ({ ...q, id: i })), answers, e.negative_marking === 1);
    const createdMs = new Date(e.created_at.includes('T') ? e.created_at : e.created_at.replace(' ', 'T') + 'Z').getTime();
    const expired = e.timed && e.duration_minutes > 0 && Date.now() - createdMs > (e.duration_minutes * 60 + 30) * 1000;
    const today = get("SELECT COUNT(*) n FROM self_exams WHERE student_id=? AND points_awarded>0 AND date(finished_at)=date('now')", ctx.user.id).n;
    if (expired || today >= 3) evalResult.pointsAwarded = 0;
    tx(() => {
      run(`UPDATE self_exams SET status='completed', answers_json=?, score=?, percentage=?, correct_count=?, wrong_count=?, blank_count=?, points_awarded=?, finished_at=datetime('now') WHERE id=? AND status='started'`,
        JSON.stringify(answers), evalResult.score, evalResult.percentage, evalResult.correctCount, evalResult.wrongCount, evalResult.blankCount, evalResult.pointsAwarded, e.id);
      qs.forEach((q, i) => {
        if (e.mode === 'learning' && stored[i] != null) return; // قبلاً ثبت شده
        run(`INSERT OR IGNORE INTO practice_answers(session_id,student_id,question_id,position,topic_id,subject,chosen,is_correct) VALUES (?,?,?,?,?,?,?,?)`, e.id, ctx.user.id, q.question_id ?? null, i, q.topic_id ?? null, q.subject ?? null, answers[i] ?? null, answers[i] === Number(q.answer) ? 1 : 0);
      });
      // امتیاز تمرین فقط برای سطح/نقشهٔ راه است؛ در رتبه‌بندی حساب نمی‌شود (RANKED_POINTS)
      if (evalResult.pointsAwarded > 0) addPoints(ctx.user.id, evalResult.pointsAwarded, 'تمرین آزاد', `تمرین «${e.title}»`, `self_exam:${e.id}`);
    });
    return { ok: true, exam_id: e.id, mode: e.mode, expired: !!expired, ...evalResult };
  });

  r.get('/api/student/practice/overview', S, (ctx) => practiceOverview(ctx.user.id, ctx.user.center_id));
}
