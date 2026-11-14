// چرخهٔ عمر آزمون رسمی:
// پیش‌نویس ← بازبینی ← آماده ← منتشرشده ← در حال برگزاری ← پایان‌یافته ← انتشار کارنامه
// «در حال برگزاری» و «پایان‌یافته» از روی بازهٔ زمانی آزمون منتشرشده محاسبه می‌شوند؛ معلم می‌تواند آزمون را زودتر ببندد.
import crypto from 'node:crypto';
import { all, get, run, tx, audit } from './db.js';
import { fail } from './util.js';
import { addPoints, examPoints } from './logic.js';

export const STATE_FA = { draft: 'پیش‌نویس', review: 'بازبینی', ready: 'آماده', scheduled: 'منتشرشده (شروع نشده)', in_progress: 'در حال برگزاری', completed: 'پایان‌یافته', results_released: 'کارنامه منتشر شد' };
const EDITABLE = ['draft', 'review', 'ready'];

export function examState(e, now = Date.now()) {
  if (e.status !== 'published') return e.status;
  if (e.starts_at && now < Date.parse(e.starts_at)) return 'scheduled';
  if (e.ends_at && now > Date.parse(e.ends_at)) return 'completed';
  return 'in_progress';
}
export const isEditable = (e) => EDITABLE.includes(e.status);
export const resultsReleased = (e) => !!e.results_released_at;
// ثبت نتیجه (آنلاین یا اسکن) فقط پس از انتشار مجاز است
export const acceptsResults = (e) => ['published', 'completed', 'results_released'].includes(e.status);

function isoWithZone(v, label) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) fail(400, `${label} باید تاریخ و ساعت با منطقهٔ زمانی باشد`);
  return new Date(s).toISOString();
}

// انتقال وضعیت با بررسی کامل سمت سرور
const ALLOWED = {
  draft: ['review', 'ready'], review: ['ready', 'draft'], ready: ['published', 'draft'],
  published: ['completed', 'results_released', 'draft'], completed: ['results_released'], results_released: [],
};
export function transition(ctx, e, to, body = {}) {
  if (!(ALLOWED[e.status] || []).includes(to)) fail(400, `تغییر وضعیت از «${STATE_FA[e.status] || e.status}» به «${STATE_FA[to] || to}» مجاز نیست`);
  const qs = JSON.parse(e.questions || '[]');
  return tx(() => {
    const has = (t) => get(`SELECT 1 x FROM ${t} WHERE exam_id=? LIMIT 1`, e.id);
    if (to === 'draft' && e.status === 'published' && (has('exam_attempts') || has('exam_results'))) fail(409, 'دانش‌آموزان آزمون را شروع کرده‌اند؛ بازگشت به پیش‌نویس ممکن نیست');
    if (to === 'ready' || to === 'published') {
      if (!qs.length) fail(400, 'آزمون سؤال ندارد');
      if (e.kind === 'online' && qs.some((q) => !q.text || !Array.isArray(q.options) || q.options.length !== 4)) fail(400, 'همهٔ سؤال‌های آزمون آنلاین باید متن و چهار گزینه داشته باشند');
    }
    if (to === 'published') {
      const starts = body.starts_at ? isoWithZone(body.starts_at, 'زمان شروع') : null;
      const ends = body.ends_at ? isoWithZone(body.ends_at, 'زمان پایان') : null;
      if (starts && ends && Date.parse(ends) - Date.parse(starts) < e.duration_min * 60000) fail(400, 'بازهٔ برگزاری از مدت آزمون کوتاه‌تر است');
      if (ends && Date.parse(ends) < Date.now()) fail(400, 'زمان پایان گذشته است');
      run("UPDATE exams SET status='published', starts_at=?, ends_at=?, randomize=?, published_at=datetime('now') WHERE id=?", starts, ends, body.randomize ? 1 : 0, e.id);
    } else if (to === 'completed') {
      run("UPDATE exams SET status='completed', ends_at=COALESCE(CASE WHEN ends_at IS NOT NULL AND ends_at < ? THEN ends_at END, ?) WHERE id=?", new Date().toISOString(), new Date().toISOString(), e.id);
    } else if (to === 'results_released') {
      run("UPDATE exams SET status='results_released', results_released_at=datetime('now'), ends_at=COALESCE(ends_at, ?) WHERE id=?", new Date().toISOString(), e.id);
      // امتیاز انگیزشی آزمون فقط پس از انتشار کارنامه داده می‌شود تا نتیجه زودتر لو نرود
      for (const r of all('SELECT student_id, percent FROM exam_results WHERE exam_id=?', e.id)) {
        const pts = examPoints(r.percent);
        if (pts > 0) addPoints(r.student_id, pts, 'آزمون', `نتیجه آزمون «${e.title}» (${r.percent}٪)`, `exam:${e.id}`);
      }
    } else {
      run('UPDATE exams SET status=? WHERE id=?', to, e.id);
    }
    audit(e.center_id, ctx.user.id, 'exam.status', 'exam', e.id, { from: e.status, to, starts_at: body.starts_at || null, ends_at: body.ends_at || null });
    return { ok: true, status: to };
  });
}

// ترتیب تصادفی پایدار سؤال‌ها برای هر دانش‌آموز (فقط ترتیب سؤال؛ گزینه‌ها جابه‌جا نمی‌شوند)
export function studentOrder(e, studentId) {
  const n = JSON.parse(e.questions).length;
  const order = [...Array(n).keys()];
  if (!e.randomize) return order;
  const seed = crypto.createHash('sha256').update(`${e.id}:${studentId}:${e.published_at}`).digest();
  for (let i = n - 1; i > 0; i--) { const j = seed.readUInt32BE((i * 4) % 28) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

// پیوند سؤال‌های بانک به آزمون با نسخهٔ ثابت (snapshot) — بعداً با ویرایش بانک تغییر نمی‌کند
export function bankSnapshot(ctx, ids, grade) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 60) fail(400, 'بین ۱ تا ۶۰ سؤال از بانک انتخاب کنید');
  const uniq = [...new Set(ids.map(Number))];
  if (uniq.length !== ids.length) fail(400, 'سؤال تکراری انتخاب شده است');
  return uniq.map((id) => {
    const q = get("SELECT * FROM question_bank WHERE id=? AND center_id=? AND status='published'", id, ctx.user.center_id);
    if (!q) fail(400, `سؤال ${id} در بانک منتشرشدهٔ این کانون نیست`);
    if (grade && q.grade !== grade) fail(400, `پایهٔ سؤال ${id} با آزمون یکسان نیست`);
    return { text: q.text, image: q.image || undefined, options: JSON.parse(q.options_json), answer: q.correct_option, subject: q.subject, explanation: q.explanation || undefined, bank_id: q.id, bank_version: q.version };
  });
}
export function linkBank(examId, questions) {
  run('DELETE FROM exam_question_links WHERE exam_id=?', examId);
  questions.forEach((q, i) => {
    if (!q.bank_id) return;
    run('INSERT INTO exam_question_links(exam_id,position,question_id,version) VALUES (?,?,?,?)', examId, i, q.bank_id, q.bank_version);
    run('UPDATE question_bank SET usage_count=usage_count+1 WHERE id=?', q.bank_id);
  });
}
