// تولید پیش‌نویس سؤال از کتاب با هوش مصنوعی: بارگذاری PDF مجاز ← کار تولید ← اعتبارسنجی ← پیش‌نویس «در انتظار بازبینی».
// فقط سؤال تأییدشده توسط معلم/مدیر منتشر می‌شود (setStatus در bank.js این را اجباری می‌کند).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, audit, DATA_DIR } from '../db.js';
import { fail, clampStr, toEnDigits } from '../util.js';
import { aiStatus, aiConfig, generate, inspectPdf, AiError } from '../ai.js';
import { contentHash, insertQuestion } from './bank.js';

const B = { roles: ['teacher', 'manager'] };
const SRC_DIR = path.join(DATA_DIR, 'ai-sources'); // خارج از مسیر عمومی uploads؛ کتاب‌ها از وب قابل دریافت نیستند
const int = (v) => { const n = Number(toEnDigits(String(v ?? ''))); return Number.isInteger(n) ? n : null; };
export const runningJobs = new Map(); // jobId -> Promise (برای آزمون‌ها و جلوگیری از اجرای هم‌زمان)

const teacherGrades = (uid) => all('SELECT DISTINCT c.grade FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=?', uid).map((x) => x.grade);

// اعتبارسنجی سخت‌گیرانهٔ هر سؤال تولیدشده؛ خروجی: { ok, item, flags } یا { ok:false, reason }
export function validateItem(raw, p, pdfPages) {
  const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n) : '');
  const text = str(raw?.question, 2000);
  const options = Array.isArray(raw?.options) ? raw.options.map((o) => str(o, 500)) : [];
  if (!text) return { ok: false, reason: 'متن خالی' };
  if (options.length !== 4 || options.some((o) => !o)) return { ok: false, reason: 'چهار گزینه کامل نیست' };
  if (new Set(options.map((o) => o.replace(/\s+/g, ' '))).size !== 4) return { ok: false, reason: 'گزینهٔ تکراری' };
  if (!Number.isInteger(raw.correct_option) || raw.correct_option < 0 || raw.correct_option > 3) return { ok: false, reason: 'کلید نامعتبر' };
  const flags = [];
  let page = Number.isInteger(raw.source_page) ? raw.source_page : null;
  if (page == null || page < p.page_from || page > p.page_to || page > pdfPages) { flags.push('page_out_of_range'); page = null; }
  if (raw.ambiguous) flags.push('ambiguous');
  if (!str(raw.evidence, 300)) flags.push('no_evidence');
  if (raw.is_visual) flags.push('visual_needs_image');
  return { ok: true, flags, item: { text, options, correct_option: raw.correct_option, explanation: str(raw.explanation, 2000) || null, difficulty: ['easy', 'medium', 'hard'].includes(raw.difficulty) ? raw.difficulty : p.difficulty,
    source_page: page, source_ref: str(raw.evidence, 200) || null } };
}

async function runJob(ctxLike, jobId) {
  const job = get('SELECT * FROM ai_generation_jobs WHERE id=?', jobId);
  const p = JSON.parse(job.params_json);
  const src = get('SELECT * FROM ai_sources WHERE id=?', job.source_id);
  run("UPDATE ai_generation_jobs SET status='running', attempts=attempts+1 WHERE id=?", jobId);
  try {
    const buf = fs.readFileSync(path.join(SRC_DIR, `${src.sha256}.pdf`));
    const out = await generate(buf, p);
    if (!Array.isArray(out.items)) throw new AiError('خروجی سرویس فهرست سؤال نداشت', 'malformed');
    let accepted = 0, flagged = 0, discarded = 0;
    const seen = new Set();
    tx(() => {
      for (const raw of out.items.slice(0, p.count + 5)) {
        const v = validateItem(raw, p, src.pages || 0);
        if (!v.ok) { discarded++; continue; }
        const hash = contentHash(v.item.text, v.item.options);
        if (seen.has(hash) || get("SELECT 1 x FROM question_bank WHERE center_id=? AND content_hash=? AND status<>'archived'", ctxLike.user.center_id, hash)) { discarded++; continue; }
        seen.add(hash);
        const q = insertQuestion(ctxLike, { grade: p.grade, subject: p.subject, book_id: p.book_id, chapter_id: p.chapter_id, topic_id: p.topic_id, image: null, qtype: 'mcq4', practice_allowed: 1, content_hash: hash, ...v.item }, { status: 'draft', ai: jobId });
        run("UPDATE question_bank SET status='review', ai_flags=? WHERE id=?", JSON.stringify(v.flags), q.id);
        accepted++; if (v.flags.length) flagged++;
      }
      run("UPDATE ai_generation_jobs SET status='succeeded', model=?, input_tokens=?, output_tokens=?, accepted=?, flagged=?, discarded=?, finished_at=datetime('now') WHERE id=?",
        out.model, out.usage?.input_tokens ?? null, out.usage?.output_tokens ?? null, accepted, flagged, discarded, jobId);
      audit(ctxLike.user.center_id, ctxLike.user.id, 'ai.job', 'ai_job', jobId, { accepted, flagged, discarded, input_tokens: out.usage?.input_tokens, output_tokens: out.usage?.output_tokens });
    });
  } catch (e) {
    const msg = e instanceof AiError ? e.message : 'خطای داخلی در پردازش پاسخ هوش مصنوعی';
    if (!(e instanceof AiError)) console.error('[ai job]', jobId, e);
    run("UPDATE ai_generation_jobs SET status='failed', error=?, finished_at=datetime('now') WHERE id=?", msg, jobId);
  } finally { runningJobs.delete(jobId); }
}

export default function register(r) {
  r.get('/api/bank/ai/status', B, async (ctx) => {
    const s = await aiStatus(), c = aiConfig();
    const today = get("SELECT COUNT(*) n FROM ai_generation_jobs WHERE center_id=? AND date(created_at)=date('now')", ctx.user.center_id).n;
    return { ...s, daily_limit: c.dailyJobs, used_today: today };
  });
  r.get('/api/bank/ai/sources', B, (ctx) => all('SELECT id, title, pages, size_bytes, created_at, uploaded_by FROM ai_sources WHERE center_id=? ORDER BY id DESC', ctx.user.center_id));
  r.post('/api/bank/ai/sources', B, (ctx) => {
    const b = ctx.body;
    if (b.rights_confirmed !== true) fail(400, 'تأیید کنید که مجوز استفادهٔ آموزشی از این کتاب را دارید');
    const title = clampStr(b.title, 150) || fail(400, 'عنوان منبع را وارد کنید');
    const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.file?.data || ''));
    if (!m) fail(400, 'فقط فایل PDF پذیرفته می‌شود');
    const buf = Buffer.from(m[1], 'base64');
    let info;
    try { info = inspectPdf(buf); } catch (e) { if (e instanceof AiError) fail(400, e.message); throw e; }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const dup = get('SELECT id FROM ai_sources WHERE center_id=? AND sha256=?', ctx.user.center_id, sha);
    if (dup) return { ok: true, id: dup.id, pages: info.pages, existing: true };
    fs.mkdirSync(SRC_DIR, { recursive: true });
    fs.writeFileSync(path.join(SRC_DIR, `${sha}.pdf`), buf, { mode: 0o600 });
    const id = Number(run('INSERT INTO ai_sources(center_id,uploaded_by,title,file_name,size_bytes,pages,sha256,rights_confirmed) VALUES (?,?,?,?,?,?,?,1)',
      ctx.user.center_id, ctx.user.id, title, clampStr(b.file?.name, 150) || 'book.pdf', buf.length, info.pages, sha).lastInsertRowid);
    audit(ctx.user.center_id, ctx.user.id, 'ai.source', 'ai_source', id, { pages: info.pages, bytes: buf.length });
    return { ok: true, id, pages: info.pages };
  });
  r.post('/api/bank/ai/jobs', B, async (ctx) => {
    const st = await aiStatus();
    if (!st.enabled) fail(503, st.reason);
    const b = ctx.body, c = aiConfig();
    const src = get('SELECT * FROM ai_sources WHERE id=? AND center_id=?', int(b.source_id), ctx.user.center_id) || fail(404, 'منبع یافت نشد');
    const grade = int(b.grade);
    if (!(grade >= 1 && grade <= 12)) fail(400, 'پایه نامعتبر است');
    if (ctx.user.role === 'teacher' && !teacherGrades(ctx.user.id).includes(grade)) fail(403, 'این پایه را تدریس نمی‌کنید');
    const subject = clampStr(b.subject, 40) || fail(400, 'درس را مشخص کنید');
    const count = int(b.count);
    if (!(count >= 1 && count <= 20)) fail(400, 'تعداد سؤال بین ۱ تا ۲۰ است');
    const page_from = int(b.page_from), page_to = int(b.page_to);
    if (!(page_from >= 1 && page_to >= page_from && page_to <= src.pages && page_to - page_from <= 50)) fail(400, `بازهٔ صفحه نامعتبر است (۱ تا ${src.pages}، حداکثر ۵۰ صفحه)`);
    const difficulty = ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium';
    let topic = null, topic_id = null, chapter_id = null, book_id = null;
    if (b.topic_id) {
      const t = get(`SELECT t.id, t.title, t.chapter_id, c.book_id, bk.grade, bk.subject FROM book_topics t JOIN book_chapters c ON c.id=t.chapter_id JOIN educational_books bk ON bk.id=c.book_id WHERE t.id=? AND bk.center_id=?`, int(b.topic_id), ctx.user.center_id) || fail(404, 'مبحث یافت نشد');
      if (t.grade !== grade || t.subject !== subject) fail(400, 'مبحث با پایه و درس یکسان نیست');
      ({ id: topic_id, chapter_id, book_id } = t); topic = t.title;
    }
    const today = get("SELECT COUNT(*) n FROM ai_generation_jobs WHERE center_id=? AND date(created_at)=date('now')", ctx.user.center_id).n;
    if (today >= c.dailyJobs) fail(429, `سقف روزانهٔ ${c.dailyJobs} درخواست تولید سؤال برای کانون پر شده است`);
    if (get("SELECT 1 x FROM ai_generation_jobs WHERE requested_by=? AND status IN ('queued','running')", ctx.user.id)) fail(429, 'یک درخواست دیگر شما هنوز در حال اجراست');
    const params = { grade, subject, count, page_from, page_to, difficulty, include_visual: !!b.include_visual, topic, topic_id, chapter_id, book_id };
    const id = Number(run('INSERT INTO ai_generation_jobs(center_id,source_id,requested_by,provider,model,params_json) VALUES (?,?,?,?,?,?)', ctx.user.center_id, src.id, ctx.user.id, st.provider, st.model, JSON.stringify(params)).lastInsertRowid);
    const ctxLike = { user: { id: ctx.user.id, center_id: ctx.user.center_id, role: ctx.user.role } };
    runningJobs.set(id, runJob(ctxLike, id));
    return { ok: true, id, status: 'queued' };
  });
  r.get('/api/bank/ai/jobs', B, (ctx) => all(`SELECT j.id, j.status, j.error, j.params_json, j.accepted, j.flagged, j.discarded, j.input_tokens, j.output_tokens, j.model, j.created_at, j.finished_at, s.title source_title, u.full_name requested_by_name
    FROM ai_generation_jobs j LEFT JOIN ai_sources s ON s.id=j.source_id LEFT JOIN users u ON u.id=j.requested_by WHERE j.center_id=? ${ctx.user.role === 'teacher' ? 'AND j.requested_by=?' : ''} ORDER BY j.id DESC LIMIT 50`,
  ...(ctx.user.role === 'teacher' ? [ctx.user.center_id, ctx.user.id] : [ctx.user.center_id])).map(({ params_json, ...j }) => ({ ...j, params: JSON.parse(params_json) })));
}
