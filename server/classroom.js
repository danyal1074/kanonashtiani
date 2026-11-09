// کلاینت امضاشدهٔ «کلاس آنلاین کانون» (HMAC-SHA256) — فقط از سمت سرور پنل صدا زده می‌شود؛ راز هرگز به مرورگر نمی‌رسد.
// قرارداد: docs/KANOON_PANEL_INTEGRATION.md در مخزن کلاس آنلاین.
//   signature = HMAC_SHA256(secret, `${ts}\n${METHOD}\n${pathAndQuery}\n${rawBody}`)  (هدرهای X-Panel-Timestamp / X-Panel-Signature)
// متغیرهای محیطی (بدون مقدار پیش‌فرض؛ نبودنشان یعنی قابلیت خاموش است):
//   CLASSROOM_API          مثلاً https://class.<دامنه>/api/v1
//   KANOON_PANEL_SECRET    راز مشترک (حداقل ۳۲ نویسه)
//   CLASSROOM_TIMEOUT_MS   اختیاری، پیش‌فرض ۸۰۰۰
import crypto from 'node:crypto';
import { all, get, run } from './db.js';

const PREFIX = '/integrations/kanoon/panel';
const TIMEOUT_MS = Number(process.env.CLASSROOM_TIMEOUT_MS || 8000);

export class ClassroomError extends Error {
  constructor(kind, status, code, detail) { super(detail || kind); this.kind = kind; this.status = status; this.code = code; }
}

function config() {
  const base = String(process.env.CLASSROOM_API || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.KANOON_PANEL_SECRET || '');
  if (!base || secret.length < 32) return null;
  try { const u = new URL(base); if (!/^https?:$/.test(u.protocol)) return null; } catch { return null; }
  return { base, secret };
}
export const classroomEnabled = () => !!config();

// فراخوانی امضاشده. rawBody دقیقاً همان رشتهٔ ارسالی است (برای GET خالی).
export async function classroomCall(method, path, body, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cfg = config();
  if (!cfg) throw new ClassroomError('not_configured', 503, 'NOT_CONFIGURED');
  const raw = body === undefined ? '' : JSON.stringify(body);
  const full = new URL(cfg.base + path);
  const ts = String(Math.floor(now() / 1000));
  const sig = crypto.createHmac('sha256', cfg.secret).update(`${ts}\n${method}\n${full.pathname}${full.search}\n${raw}`).digest('hex');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(full, {
      method, signal: ctl.signal, redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-panel-timestamp': ts, 'x-panel-signature': sig },
      body: raw || undefined,
    });
  } catch (e) {
    throw new ClassroomError('unreachable', 502, 'UNREACHABLE', e?.name === 'AbortError' ? 'timeout' : String(e?.cause?.code || e?.message || e));
  } finally { clearTimeout(timer); }
  let data = null;
  const text = await res.text().catch(() => '');
  try { data = text ? JSON.parse(text) : null; } catch { /* پاسخ غیر JSON */ }
  if (!res.ok) throw new ClassroomError('http', res.status, data?.code || null, `${method} ${path} -> ${res.status}`);
  return data;
}

const EXTERNAL_ID = (id) => String(id);

// ---------- همگام‌سازی دانش‌آموزان ----------
// پنل منبع حقیقت است: نام، پایه، کلاس پنل و فعال‌بودن هر دانش‌آموز به کلاس آنلاین فرستاده می‌شود تا معلم بتواند
// «کلاس‌های پنل» را یکجا انتخاب کند یا برای یک دانش‌آموز کلاس خصوصی بسازد.
const GRADE_FA = { 4: 'چهارم', 5: 'پنجم', 6: 'ششم', 7: 'هفتم', 8: 'هشتم', 9: 'نهم' };
const studentRow = (r) => {
  const name = String(r.full_name || '').trim().slice(0, 80);
  const s = { externalId: EXTERNAL_ID(r.id), name: name.length >= 2 ? name : `دانش‌آموز ${r.id}`, active: !!r.active };
  if (Number.isInteger(r.grade) && r.grade >= 4 && r.grade <= 9) s.grade = r.grade; // سامانهٔ کلاس فقط پایهٔ ۴ تا ۹ را می‌پذیرد
  if (r.class_id != null && r.class_name) { s.classId = String(r.class_id); s.className = `${GRADE_FA[r.grade] || ''} ${r.class_name}`.trim().slice(0, 80); }
  else { s.classId = null; s.className = null; }
  return s;
};
const SELECT = `SELECT u.id, u.full_name, u.active, s.grade, s.class_id, c.name class_name FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id WHERE u.role='student'`;

// ids خالی = همهٔ دانش‌آموزان (فعال و غیرفعال؛ غیرفعال‌ها در کلاس آنلاین غیرفعال می‌شوند). در دسته‌های ≤۲۰۰ ارسال می‌شود.
export async function syncStudents(ids, opts) {
  const rows = ids ? ids.map((id) => get(`${SELECT} AND u.id=?`, Number(id))).filter(Boolean) : all(`${SELECT} ORDER BY u.id`);
  let created = 0, updated = 0, disabled = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const out = await classroomCall('POST', `${PREFIX}/students/sync`, { students: rows.slice(i, i + 200).map(studentRow) }, opts);
    created += out?.created || 0; updated += out?.updated || 0; disabled += out?.disabled || 0;
  }
  return { total: rows.length, created, updated, disabled };
}

// ---------- حذف دانش‌آموز: صف ماندگار تا ارسال موفق ----------
export function queueRemovals(ids) {
  if (!classroomEnabled()) return;
  for (const id of ids || []) run('INSERT OR IGNORE INTO classroom_removals (ext_id) VALUES (?)', EXTERNAL_ID(id));
}
export const pendingRemovals = () => get('SELECT COUNT(*) n FROM classroom_removals')?.n || 0;
export async function flushRemovals(opts) {
  const rows = all('SELECT ext_id FROM classroom_removals ORDER BY created_at LIMIT 2000').map((r) => r.ext_id);
  let disabled = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const out = await classroomCall('POST', `${PREFIX}/students/remove`, { externalIds: batch }, opts);
    disabled += out?.disabled || 0;
    for (const id of batch) run('DELETE FROM classroom_removals WHERE ext_id=?', id);
  }
  return { sent: rows.length, disabled };
}

// همگام‌سازی پس‌زمینه هنگام ایجاد/ویرایش/حذف: هرگز عملیات اصلی پنل را مختل نمی‌کند و خطا فقط لاگ می‌شود
// (همگام‌سازی کامل دوره‌ای و صف حذف، موارد جاافتاده را جبران می‌کنند).
const pending = new Set();
let timer = null, pendingAll = false, pendingRemoval = false;
// ids = آرایهٔ شناسه‌ها؛ null = همهٔ دانش‌آموزان (ثبت‌نام گروهی، جابه‌جایی گروهی)
export function syncStudentsLater(ids) {
  if (!classroomEnabled()) return;
  if (ids) for (const id of ids) pending.add(Number(id)); else pendingAll = true;
  schedule();
}
// دانش‌آموزان حذف‌شده: ابتدا در صف ماندگار، سپس ارسال
export function removeStudentsLater(ids) {
  if (!classroomEnabled()) return;
  queueRemovals(ids);
  pendingRemoval = true;
  schedule();
}
function schedule() {
  if (timer) return;
  timer = setTimeout(async () => {
    const batch = pendingAll ? null : [...pending], doSync = pendingAll || pending.size > 0, doRemove = pendingRemoval;
    pending.clear(); pendingAll = false; pendingRemoval = false; timer = null;
    try { if (doSync) await syncStudents(batch); } catch (e) { console.warn('[classroom-sync]', e.message); }
    try { if (doRemove) await flushRemovals(); } catch (e) { console.warn('[classroom-remove]', e.message); }
  }, 500);
  timer.unref?.();
}

// همگام‌سازی کامل (دوره‌ای و دستی): همه دانش‌آموزان + حذف‌های در صف
export async function fullSync(opts) {
  const sync = await syncStudents(null, opts);
  const removals = await flushRemovals(opts);
  return { ...sync, removals: removals.sent, removed: removals.disabled };
}

// ---------- کلاس‌های دانش‌آموز و بلیت ورود ----------
// اگر دانش‌آموز هنوز همگام نشده (۴۰۴)، یک بار همگام می‌شود و دوباره تلاش می‌کند.
async function withAutoSync(studentId, fn, opts) {
  try { return await fn(); } catch (e) {
    if (!(e instanceof ClassroomError) || e.kind !== 'http' || e.status !== 404) throw e;
    const n = (await syncStudents([studentId], opts)).total;
    if (!n) throw e;
    return fn();
  }
}
export const listClasses = (studentId, opts) => withAutoSync(studentId,
  async () => { const r = await classroomCall('GET', `${PREFIX}/students/${encodeURIComponent(EXTERNAL_ID(studentId))}/classes`, undefined, opts); return Array.isArray(r) ? r : []; }, opts);
export const joinTicket = (studentId, classId, opts) => withAutoSync(studentId,
  () => classroomCall('POST', `${PREFIX}/students/${encodeURIComponent(EXTERNAL_ID(studentId))}/join-ticket`, { classId }, opts), opts);
