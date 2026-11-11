// پنل مدیر کانون
import fs from 'node:fs';
import path from 'node:path';
import { parseBarpaPdfFile } from '../../scripts/barpa-parser.mjs';
import { all, get, run, tx, ROOT, UPLOAD_DIR } from '../db.js';
import { fail, ymd, addDays, clampStr, hashPassword, isValidNationalCode, normalizeNationalCode, normalizeIranianMobile, parseBirthDate, toEnDigits, j2g, jMonthOf, JMONTHS, saveUpload } from '../util.js';
import { feeStatus, announcementAudience, saveExamResult, recalcInvoice, markFeePaid, unmarkFeePaid, backfillZeroPayments, periodLabel } from '../logic.js';
export { recalcInvoice };
import { importStudents } from '../importer.js';
import { syncStudentsLater, removeStudentsLater, classroomEnabled, pendingRemovals, fullSync, ClassroomError } from '../classroom.js';
import { sendSms, smsProvider } from '../sms.js';
import { setSession } from './common.js';
import { parseQuestions, examWithResults, performanceList, studentDetail } from './teacher.js';

const M = { roles: ['manager'] };
const GRADES = [4, 5, 6, 7, 8, 9];
const SESSION_KINDS = ['academic', 'tarbiati', 'chess', 'robotics', 'language', 'sport', 'other'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

function ownClass(ctx, id) {
  const c = get('SELECT * FROM classes WHERE id=? AND center_id=?', Number(id), ctx.user.center_id);
  if (!c) fail(404, 'کلاس یافت نشد');
  return c;
}
function ownStudent(ctx, id) {
  const s = get(`SELECT u.id, u.full_name, u.national_code, u.center_id, s.* , c.name class_name FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id WHERE u.id=? AND u.center_id=?`, Number(id), ctx.user.center_id);
  if (!s) fail(404, 'دانش‌آموز یافت نشد');
  return s;
}

function studentPayload(ctx, b, existingId = null) {
  const full_name = clampStr(b.full_name, 80);
  const national_code = normalizeNationalCode(b.national_code);
  const hasPhone = !!String(b.parent_phone ?? '').trim();
  const parent_phone = hasPhone ? normalizeIranianMobile(b.parent_phone) : null;
  if (!full_name) fail(400, 'نام و نام خانوادگی را وارد کنید');
  if (!isValidNationalCode(national_code)) fail(400, 'کد ملی ۱۰ رقمی معتبر نیست');
  if (hasPhone && !parent_phone) fail(400, 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود (یا خالی بماند)');
  const grade = Number(b.grade);
  if (!GRADES.includes(grade)) fail(400, 'پایه باید بین چهارم تا نهم باشد');
  const cls = b.class_id ? ownClass(ctx, b.class_id) : null;
  if (cls && cls.grade !== grade) fail(400, 'کلاس انتخابی با پایه همخوانی ندارد');
  let birth_date = null;
  if (b.birth_date && String(b.birth_date).trim()) {
    try { birth_date = parseBirthDate(b.birth_date); } catch (e) { fail(400, e.message); }
  }
  const dup = get(`SELECT id FROM users WHERE role='student' AND national_code=? AND id<>?`, national_code, existingId ?? -1);
  if (dup) fail(400, 'دانش‌آموزی با این کد ملی قبلاً ثبت شده است');
  return { full_name, national_code, parent_phone, grade, class_id: cls?.id ?? null, school: clampStr(b.school, 100), birth_date,
    address: clampStr(b.address, 300), gender: b.gender === 'f' ? 'f' : 'm' };
}

function paymentStateSql() {
  return `CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.student_id=u.id AND p.status='approved' AND p.invoice_id IS NULL) THEN 'paid'
    WHEN EXISTS (SELECT 1 FROM payments p WHERE p.student_id=u.id AND p.status='pending' AND p.invoice_id IS NULL) THEN 'pending' ELSE 'unpaid' END`;
}

export default function register(r) {
  // شمارنده‌های سبک برای نشانهٔ اعلان در نوار بالا (فقط خواندنی)
  r.get('/api/manager/badges', M, (ctx) => ({
    pending_receipts: get(`SELECT COUNT(*) n FROM payments p JOIN users u ON u.id=p.student_id WHERE u.center_id=? AND p.status='pending'`, ctx.user.center_id).n,
  }));
  // ---------- تحلیل‌ها برای داشبورد (فقط خواندنی؛ فرمول‌ها در docs/analytics-design.md) ----------
  const jm = (dateStr) => { const [y, m] = jMonthOf(dateStr.slice(0, 10)); return y * 12 + (m - 1); };
  const jmLabel = (k) => JMONTHS[k % 12];
  const analyticsCache = new Map();
  r.get('/api/manager/analytics', M, (ctx) => {
    const cid = ctx.user.center_id, grade = GRADES.includes(Number(ctx.query.grade)) ? Number(ctx.query.grade) : null;
    const days = [7, 14, 30].includes(Number(ctx.query.days)) ? Number(ctx.query.days) : 14;
    const key = `${cid}|${grade}|${days}`, hit = analyticsCache.get(key);
    if (hit && Date.now() - hit.t < 5000) return hit.v;
    const today = ymd(), gradeSql = grade ? ' AND s.grade=?' : '', gp = grade ? [grade] : [];
    const nowK = jm(today);

    // دانش‌آموزان فعال + مبلغ قابل وصول و دریافتی هر نفر (پرداخت تأییدشدهٔ حق عضویت، سقف به مبلغ قابل وصول)
    const sys = get('SELECT system_fee, system_fee_enabled FROM centers WHERE id=?', cid);
    const sysFee = sys?.system_fee_enabled ? sys.system_fee || 0 : 0;
    const feeBy = Object.fromEntries(all('SELECT grade, amount FROM fee_settings WHERE center_id=?', cid).map((f) => [f.grade, f.amount]));
    const studs = all(`SELECT u.id, s.grade, s.class_id, u.created_at, ${paymentStateSql()} st,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=u.id AND p.status='approved' AND p.invoice_id IS NULL), 0) paid
      FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.active=1`, cid);
    const studsAll = studs, studsG = grade ? studs.filter((x) => x.grade === grade) : studs;
    const summarize = (list) => {
      const sums = { due: 0, collected: 0, paid: 0, pending: 0, unpaid: 0 };
      const map = new Map(GRADES.map((g) => [g, { grade: g, paid: 0, pending: 0, unpaid: 0, due: 0, collected: 0 }]));
      for (const s of list) {
        const fee = feeBy[s.grade] || 0, due = fee ? fee + sysFee : 0, got = Math.min(s.paid, due || s.paid);
        sums.due += due; sums.collected += due ? got : 0; sums[s.st]++;
        const g = map.get(s.grade); g[s.st]++; g.due += due; g.collected += due ? got : 0;
      }
      return { ...sums, students: list.length, pct_amount: sums.due ? Math.round((sums.collected / sums.due) * 1000) / 10 : null, pct_students: list.length ? Math.round((sums.paid / list.length) * 1000) / 10 : null, map };
    };
    const kpiSum = summarize(studsAll), gSum = summarize(studsG);
    const byGradeMap = gSum.map;
    const collection = (({ map, ...rest }) => rest)(gSum);

    // مالی: شش ماه شمسی اخیر
    const fin = [];
    for (let i = 5; i >= 0; i--) {
      const k = nowK - i, y = Math.floor(k / 12), m = (k % 12) + 1;
      const f = (a) => `${a[0]}-${String(a[1]).padStart(2, '0')}-${String(a[2]).padStart(2, '0')}`;
      const next = m === 12 ? [y + 1, 1] : [y, m + 1];
      const row = get(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) inc, COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) exp FROM transactions WHERE center_id=? AND date>=? AND date<?`, cid, f(j2g(y, m, 1)), f(j2g(next[0], next[1], 1)));
      fin.push({ label: JMONTHS[m - 1], income: row.inc, expense: row.exp, net: row.inc - row.exp });
    }
    const totals = get(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) inc, COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) exp FROM transactions WHERE center_id=?`, cid);

    // حضور و غیاب: روزهای اخیر + مقایسهٔ کلاس‌ها (آخر ۳۰ روز)
    const from = addDays(today, -(days - 1));
    const attDays = all(`SELECT a.date, SUM(a.status='present') present, SUM(a.status='absent') absent, SUM(a.status='excused') excused FROM attendance a JOIN classes c ON c.id=a.class_id
      ${grade ? 'JOIN students s ON s.user_id=a.student_id AND s.grade=?' : ''} WHERE c.center_id=? AND a.date BETWEEN ? AND ? GROUP BY a.date ORDER BY a.date`, ...gp, cid, from, today)
      .map((d) => ({ date: d.date, present: d.present, absent: d.absent, excused: d.excused, rate: Math.round((d.present / (d.present + d.absent + d.excused)) * 1000) / 10 }));
    const attClasses = all(`SELECT c.grade, c.name, SUM(a.status='present') present, SUM(a.status='absent') absent, SUM(a.status='excused') excused FROM attendance a JOIN classes c ON c.id=a.class_id
      WHERE c.center_id=? AND a.date BETWEEN ? AND ? ${grade ? 'AND c.grade=?' : ''} GROUP BY c.id HAVING (present+absent+excused)>0 ORDER BY c.grade, c.name`, cid, addDays(today, -29), today, ...gp)
      .map((c) => ({ grade: c.grade, name: c.name, absent: c.absent, total: c.present + c.absent + c.excused, rate: Math.round((c.present / (c.present + c.absent + c.excused)) * 1000) / 10 }));

    // رشد دانش‌آموزان: ثبت‌نام جدید هر ماه شمسی و جمع تجمعی
    const created = studsG.map((s) => jm(s.created_at || today));
    const minK = Math.min(nowK, ...(created.length ? created : [nowK])), startK = Math.max(minK, nowK - 11);
    let cum = created.filter((k) => k < startK).length;
    const growth = [];
    for (let k = startK; k <= nowK; k++) { const n = created.filter((x) => x === k).length; cum += n; growth.push({ label: jmLabel(k), new: n, total: cum }); }

    // عملکرد آموزشی: میانگین درصد آزمون‌ها به‌تفکیک پایه و ماه + توزیع نمره
    const ex = all(`SELECT s.grade, r.percent, r.created_at FROM exam_results r JOIN students s ON s.user_id=r.student_id JOIN users u ON u.id=r.student_id WHERE u.center_id=? AND r.percent IS NOT NULL${gradeSql}`, cid, ...gp);
    const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
    const academic = {
      n: ex.length,
      byGrade: GRADES.map((g) => { const v = ex.filter((e) => e.grade === g).map((e) => e.percent); return { grade: g, avg: avg(v), n: v.length }; }).filter((g) => g.n),
      months: [...new Set(ex.map((e) => jm(e.created_at)))].sort((a, b) => a - b).slice(-6).map((k) => { const v = ex.filter((e) => jm(e.created_at) === k).map((e) => e.percent); return { label: jmLabel(k), avg: avg(v), n: v.length }; }),
      distribution: [[0, 40, 'زیر ۴۰'], [40, 60, '۴۰ تا ۶۰'], [60, 80, '۶۰ تا ۸۰'], [80, 101, '۸۰ تا ۱۰۰']].map(([lo, hi, label]) => ({ label, n: ex.filter((e) => e.percent >= lo && e.percent < hi).length })),
    };

    // شاخص‌ها، هشدارها و فعالیت‌های اخیر
    const pendingReceipts = get(`SELECT COUNT(*) n FROM payments p JOIN users u ON u.id=p.student_id WHERE u.center_id=? AND p.status='pending'`, cid).n;
    const absentToday = get(`SELECT COUNT(*) n FROM attendance a JOIN classes c ON c.id=a.class_id WHERE c.center_id=? AND a.date=? AND a.status='absent'`, cid, today).n;
    const unsentSms = get(`SELECT COUNT(*) n FROM attendance a JOIN classes c ON c.id=a.class_id WHERE c.center_id=? AND a.date=? AND a.status='absent' AND a.sms_sent=0`, cid, today).n;
    const lockBy = Object.fromEntries(all('SELECT grade, lock_date FROM fee_settings WHERE center_id=?', cid).map((f) => [f.grade, f.lock_date || '9999']));
    const lockedNow = studsAll.filter((s) => s.st !== 'paid' && feeBy[s.grade] && (lockBy[s.grade] || '9999') < today).length;
    const alerts = [];
    if (pendingReceipts) alerts.push({ tone: 'warn', text: `${pendingReceipts} رسید در انتظار بررسی است`, href: '#/fees' });
    if (unsentSms) alerts.push({ tone: 'warn', text: `پیامک غیبت امروز برای ${unsentSms} دانش‌آموز ارسال نشده`, href: '#absent' });
    if (lockedNow) alerts.push({ tone: 'danger', text: `${lockedNow} دانش‌آموز به‌دلیل پایان مهلت پرداخت قفل هستند`, href: '#/fees' });
    const classesNoStudents = get(`SELECT COUNT(*) n FROM classes c WHERE c.center_id=? AND NOT EXISTS (SELECT 1 FROM students s WHERE s.class_id=c.id)`, cid).n;
    if (classesNoStudents) alerts.push({ tone: 'info', text: `${classesNoStudents} کلاس هنوز دانش‌آموز ندارد`, href: '#/staff' });
    const recent = [
      ...all(`SELECT p.created_at t, u.full_name n, p.status st, p.amount a FROM payments p JOIN users u ON u.id=p.student_id WHERE u.center_id=? ORDER BY p.id DESC LIMIT 6`, cid).map((p) => ({ t: p.t, kind: 'payment', text: `${p.st === 'approved' ? 'پرداخت تأیید شد' : p.st === 'pending' ? 'رسید جدید' : p.st === 'rejected' ? 'رسید رد شد' : 'پرداخت برگشت خورد'}: ${p.n}`, amount: p.a })),
      ...all(`SELECT created_at t, title FROM announcements WHERE center_id=? ORDER BY id DESC LIMIT 3`, cid).map((a) => ({ t: a.t, kind: 'announcement', text: `اطلاعیه: ${a.title}` })),
      ...all(`SELECT u.created_at t, u.full_name n FROM users u WHERE u.center_id=? AND u.role='student' ORDER BY u.id DESC LIMIT 3`, cid).map((u) => ({ t: u.t, kind: 'student', text: `ثبت‌نام دانش‌آموز: ${u.n}` })),
    ].sort((a, b) => String(b.t).localeCompare(String(a.t))).slice(0, 8);

    const out = {
      generated: today, grade, days,
      kpi: {
        students: studsAll.length, paid_students: kpiSum.paid, teachers: get(`SELECT COUNT(*) n FROM users WHERE center_id=? AND role='teacher' AND active=1`, cid).n,
        classes: get(`SELECT COUNT(*) n FROM classes WHERE center_id=?`, cid).n, collection_pct: kpiSum.pct_amount, collection_pct_students: kpiSum.pct_students, pending_receipts: pendingReceipts, absent_today: absentToday,
      },
      collection, byGrade: [...byGradeMap.values()].filter((g) => !grade || g.grade === grade),
      finance: { months: fin, totals: { income: totals.inc, expense: totals.exp, balance: totals.inc - totals.exp } },
      attendance: { days: attDays, byClass: attClasses }, growth, academic, alerts, recent,
    };
    analyticsCache.set(key, { t: Date.now(), v: out });
    if (analyticsCache.size > 50) analyticsCache.clear();
    return out;
  });
  r.get('/api/manager/dashboard', M, (ctx) => {
    const cid = ctx.user.center_id, today = ymd();
    const rows = all(`SELECT s.grade, ${paymentStateSql()} st FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.active=1`, cid);
    const byGrade = GRADES.map((g) => {
      const rs = rows.filter((x) => x.grade === g);
      return { grade: g, paid: rs.filter((x) => x.st === 'paid').length, pending: rs.filter((x) => x.st === 'pending').length, unpaid: rs.filter((x) => x.st === 'unpaid').length };
    });
    const absents = all(`SELECT a.id, a.status, a.sms_sent, u.full_name, s.grade, s.parent_phone, c.name class_name, s.avatar FROM attendance a JOIN users u ON u.id=a.student_id
      JOIN students s ON s.user_id=u.id JOIN classes c ON c.id=a.class_id WHERE c.center_id=? AND a.date=? AND a.status IN ('absent','excused') ORDER BY a.status, u.full_name`, cid, today);
    return {
      kpi: {
        active: rows.length,
        paid: rows.filter((x) => x.st === 'paid').length,
        pending: rows.filter((x) => x.st === 'pending').length,
        unpaid: rows.filter((x) => x.st === 'unpaid').length,
        absentToday: absents.filter((a) => a.status === 'absent').length,
        teachers: get(`SELECT COUNT(*) n FROM users WHERE center_id=? AND role='teacher' AND active=1`, cid).n,
      },
      byGrade, absents,
      receiptsPending: get(`SELECT COUNT(*) n FROM payments p JOIN users u ON u.id=p.student_id WHERE u.center_id=? AND p.status='pending'`, cid).n,
      balance: get(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) b FROM transactions WHERE center_id=?`, cid).b,
    };
  });
  r.post('/api/manager/attendance/:id/sms', M, async (ctx) => {
    const cid = ctx.user.center_id;
    const rows = all(`SELECT a.id, a.student_id, a.date, u.full_name, s.parent_phone, c.name class_name, c.grade FROM attendance a JOIN classes c ON c.id=a.class_id
      JOIN users u ON u.id=a.student_id JOIN students s ON s.user_id=u.id
      WHERE c.center_id=? AND a.status='absent' AND a.sms_sent=0 AND ${ctx.params.id === 'all' ? 'a.date=?' : 'a.id=?'}`, cid, ctx.params.id === 'all' ? ymd() : Number(ctx.params.id));
    const center = get('SELECT name FROM centers WHERE id=?', cid);
    const result = { ok: true, sent: 0, failed: 0, simulated: smsProvider() === 'simulated', errors: [] };
    // ارسال با هم‌زمانی ۵ تایی؛ فقط پیامک‌های موفق علامت «ارسال‌شده» می‌گیرند و ناموفق‌ها قابل تلاش دوباره می‌مانند
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.all(rows.slice(i, i + 5).map(async (a) => {
        const [jy, jm, jd] = jMonthOf(a.date);
        const text = `${center.name}: ${a.full_name} امروز (${jy}/${jm}/${jd}) در کلاس ${a.class_name} غایب بود.`;
        const r = await sendSms(a.parent_phone, text, { center_id: cid, student_id: a.student_id, message_type: 'absence' });
        if (r.ok) { run('UPDATE attendance SET sms_sent=1 WHERE id=?', a.id); result.sent++; } else { result.failed++; if (result.errors.length < 3) result.errors.push(r.error); }
      }));
    }
    return result;
  });

  // ---------- داده‌های پایه ----------
  r.get('/api/manager/meta', M, (ctx) => {
    const cid = ctx.user.center_id;
    return {
      grades: GRADES,
      classes: all(`SELECT c.*, (SELECT COUNT(*) FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=c.id AND u.active=1) students FROM classes c WHERE center_id=? ORDER BY grade, name`, cid),
      schools: all(`SELECT DISTINCT s.school FROM students s JOIN users u ON u.id=s.user_id WHERE u.center_id=? AND s.school<>'' ORDER BY s.school`, cid).map((x) => x.school),
      teachers: all(`SELECT u.id, u.full_name, u.username, u.mobile, u.active, (SELECT GROUP_CONCAT(c.grade || c.name || ':' || tc.subject, '، ') FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=u.id) classes
        FROM users u WHERE u.center_id=? AND u.role='teacher' ORDER BY u.full_name`, cid),
    };
  });
  r.post('/api/manager/classes', M, (ctx) => {
    const grade = Number(ctx.body.grade), name = clampStr(ctx.body.name, 30);
    if (!GRADES.includes(grade) || !name) fail(400, 'پایه و نام کلاس را وارد کنید');
    if (get('SELECT 1 FROM classes WHERE center_id=? AND grade=? AND name=?', ctx.user.center_id, grade, name)) fail(400, 'این کلاس وجود دارد');
    run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', ctx.user.center_id, grade, name);
    return { ok: true };
  });
  r.del('/api/manager/classes/:id', M, (ctx) => {
    const c = ownClass(ctx, ctx.params.id);
    if (get('SELECT COUNT(*) n FROM students WHERE class_id=?', c.id).n) fail(400, 'ابتدا دانش‌آموزان این کلاس را جابه‌جا کنید');
    run('DELETE FROM classes WHERE id=?', c.id);
    return { ok: true };
  });

  // ---------- مدیریت دانش‌آموزان ----------
  r.get('/api/manager/students', M, (ctx) => {
    const q = ctx.query, where = [`u.center_id=?`, `u.role='student'`], p = [ctx.user.center_id];
    if (q.q) { where.push('(u.full_name LIKE ? OR u.national_code LIKE ?)'); const s = `%${toEnDigits(q.q).trim()}%`; p.push(s, s); }
    if (q.grade) { where.push('s.grade=?'); p.push(Number(q.grade)); }
    if (q.class_id) { where.push('s.class_id=?'); p.push(Number(q.class_id)); }
    if (q.school) { where.push('s.school=?'); p.push(q.school); }
    if (q.gender === 'm' || q.gender === 'f') { where.push('u.gender=?'); p.push(q.gender); }
    if (['paid', 'pending', 'unpaid'].includes(q.pay)) { where.push(`${paymentStateSql()}=?`); p.push(q.pay); }
    const w = where.join(' AND ');
    const total = get(`SELECT COUNT(*) n FROM users u JOIN students s ON s.user_id=u.id WHERE ${w}`, ...p).n;
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 30)), offset = Math.max(0, Number(q.offset) || 0);
    const rows = all(`SELECT u.id, u.full_name, u.national_code, u.gender, s.school, s.grade, s.class_id, c.name class_name, s.birth_date, s.parent_phone, s.phone2, s.father_name, s.mother_name, s.address, s.avatar,
      ${paymentStateSql()} pay FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id WHERE ${w} ORDER BY s.grade, c.name, u.full_name LIMIT ? OFFSET ?`, ...p, limit, offset);
    return { total, rows };
  });
  
  r.get('/api/manager/students/credentials', M, (ctx) => {
    const q = ctx.query, where = [`u.center_id=?`, `u.role='student'`, `u.active=1`], p = [ctx.user.center_id];
    if (q.grade) { where.push('s.grade=?'); p.push(Number(q.grade)); }
    if (q.class_id) { where.push('s.class_id=?'); p.push(Number(q.class_id)); }
    const rows = all(`SELECT u.id, u.full_name, u.national_code, s.grade, s.class_id, c.name class_name, s.school, s.parent_phone
      FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id
      WHERE ${where.join(' AND ')} ORDER BY s.grade, c.name, u.full_name`, ...p);
    return rows.map((r) => ({
      ...r,
      student_user: r.national_code,
      student_pass: r.national_code,
    }));
  });

  r.get('/api/manager/students/:id', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    return { ...studentDetail({ id: s.id, full_name: s.full_name, national_code: s.national_code, grade: s.grade, class_id: s.class_id, class_name: s.class_name, school: s.school, avatar: s.avatar, birth_date: s.birth_date, center_id: s.center_id }), fee: feeStatus(s.id) };
  });
  r.post('/api/manager/students', M, (ctx) => {
    const d = studentPayload(ctx, ctx.body);
    const id = tx(() => {
      const res = run(`INSERT INTO users (center_id, role, national_code, pass_hash, full_name, gender, must_change_password) VALUES (?,?,?,?,?,?,1)`, ctx.user.center_id, 'student', d.national_code, hashPassword(d.national_code), d.full_name, d.gender);
      const uid = Number(res.lastInsertRowid);
      run('INSERT INTO students (user_id, school, grade, class_id, birth_date, parent_phone, address, avatar, profile_done) VALUES (?,?,?,?,?,?,?,?,?)', uid, d.school, d.grade, d.class_id, d.birth_date, d.parent_phone, d.address, 'sprout', d.school && d.birth_date && d.address ? 1 : 0);
      return uid;
    });
    syncStudentsLater([id]);
    return { ok: true, id, credentials: { student: `نام کاربری و رمز اولیه دانش‌آموز: کد ملی (${d.national_code})` } };
  });
  // ثبت‌نام گروهی از CSV؛ با dry_run فقط اعتبارسنجی و گزارش خطای هر سطر بدون ثبت
  r.post('/api/manager/students/import', M, async (ctx) => {
    const csv = String(ctx.body.csv || ''), xlsx_b64 = String(ctx.body.xlsx_b64 || '');
    if (!csv.trim() && !xlsx_b64) fail(400, 'فایل خالی است');
    const dg = Number(ctx.body.default_grade), fg = Number(ctx.body.force_grade), defaults = { grade: GRADES.includes(dg) ? dg : null, forceGrade: GRADES.includes(fg) ? fg : null, lenient: !!ctx.body.lenient_nc, feeMonth: clampStr(ctx.body.fee_month, 20), gender: ctx.body.default_gender === 'f' ? 'f' : ctx.body.default_gender === 'm' ? 'm' : null };
    try { const out = await importStudents(ctx.user.center_id, xlsx_b64 ? { xlsx_b64 } : csv, { dryRun: !!ctx.body.dry_run, defaults }); if (!ctx.body.dry_run) syncStudentsLater(null); return out; } catch (e) { fail(e.status || 400, e.message); }
  });
  r.put('/api/manager/students/:id', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    const d = studentPayload(ctx, ctx.body, s.id);
    tx(() => {
      run('UPDATE users SET full_name=?, national_code=?, gender=? WHERE id=?', d.full_name, d.national_code, d.gender, s.id);
      run('UPDATE students SET school=?, grade=?, class_id=?, birth_date=?, parent_phone=?, address=? WHERE user_id=?', d.school, d.grade, d.class_id, d.birth_date, d.parent_phone, d.address, s.id);
    });
    syncStudentsLater([s.id]);
    return { ok: true };
  });
  // ورود به پنل دانش‌آموز (مشاهده‌به‌جای دانش‌آموز)؛ بازگشت از نوار بالای صفحه
  r.post('/api/manager/students/:id/impersonate', M, (ctx) => {
    const u = get(`SELECT * FROM users WHERE id=? AND center_id=? AND role='student' AND active=1`, Number(ctx.params.id), ctx.user.center_id);
    if (!u) fail(404, 'دانش‌آموز فعال در این کانون یافت نشد');
    setSession(ctx, u, { imp: ctx.user.id });
    return { ok: true };
  });
  r.del('/api/manager/students/:id', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    tx(() => {
      run('DELETE FROM users WHERE id=?', s.id);
      // حذف والد بدون فرزند
      run(`DELETE FROM users WHERE role='parent' AND center_id=? AND NOT EXISTS (SELECT 1 FROM parent_children pc WHERE pc.parent_id=users.id)`, ctx.user.center_id);
    });
    removeStudentsLater([s.id]);
    return { ok: true };
  });
  // ---------- عملیات گروهی روی دانش‌آموزان ----------
  // هدف: فهرست شناسه‌ها (ids) یا همهٔ نتایج یک فیلتر (filter: {q, grade, class_id, school}) یا همه (all: true)
  const pickStudents = (ctx) => {
    const b = ctx.body, cid = ctx.user.center_id;
    if (Array.isArray(b.ids)) {
      const ids = [...new Set(b.ids.map(Number).filter(Number.isInteger))];
      if (!ids.length) return [];
      return all(`SELECT u.id FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.id IN (${ids.map(() => '?').join(',')})`, cid, ...ids).map((x) => x.id);
    }
    if (!b.all && !b.filter) fail(400, 'دانش‌آموزان را انتخاب کنید');
    const q = b.filter || {}, where = ['u.center_id=?', "u.role='student'"], p = [cid];
    if (q.q) { where.push('(u.full_name LIKE ? OR u.national_code LIKE ?)'); const t = `%${toEnDigits(String(q.q)).trim()}%`; p.push(t, t); }
    if (q.grade) { where.push('s.grade=?'); p.push(Number(q.grade)); }
    if (q.class_id) { where.push('s.class_id=?'); p.push(Number(q.class_id)); }
    if (q.school) { where.push('s.school=?'); p.push(String(q.school)); }
    if (q.gender === 'm' || q.gender === 'f') { where.push('u.gender=?'); p.push(q.gender); }
    if (['paid', 'pending', 'unpaid'].includes(q.pay)) { where.push(`${paymentStateSql()}=?`); p.push(q.pay); }
    return all(`SELECT u.id FROM users u JOIN students s ON s.user_id=u.id WHERE ${where.join(' AND ')}`, ...p).map((x) => x.id);
  };
  r.post('/api/manager/students/fee-paid', M, (ctx) => {
    const ids = pickStudents(ctx), paid = ctx.body.paid !== false, period = clampStr(ctx.body.period, 30) || undefined;
    if (!ids.length) fail(400, 'دانش‌آموزی انتخاب نشده است');
    const out = { ok: true, count: ids.length, changed: 0, already: 0, unset: 0 };
    tx(() => {
      for (const id of ids) {
        if (paid) {
          const r_ = markFeePaid(ctx.user.center_id, id, { period });
          if (r_?.result === 'already') out.already++; else if (r_) { out.changed++; if (r_.result === 'unset') out.unset++; }
        } else out.changed += unmarkFeePaid(ctx.user.center_id, id, clampStr(ctx.body.reason, 200) || undefined, ctx.user.id) ? 1 : 0;
      }
    });
    return out;
  });
  r.post('/api/manager/students/move', M, (ctx) => {
    const c = ownClass(ctx, ctx.body.class_id), ids = pickStudents(ctx);
    if (!ids.length) fail(400, 'دانش‌آموزی انتخاب نشده است');
    let moved = 0;
    tx(() => { for (const id of ids) moved += run('UPDATE students SET class_id=?, grade=? WHERE user_id=?', c.id, c.grade, id).changes; });
    syncStudentsLater(ids);
    return { ok: true, moved };
  });
  r.post('/api/manager/students/delete', M, (ctx) => {
    if (ctx.body.confirm !== true) fail(400, 'تأیید حذف لازم است');
    const ids = pickStudents(ctx);
    if (!ids.length) fail(400, 'دانش‌آموزی برای حذف نیست');
    tx(() => {
      for (const id of ids) run('DELETE FROM users WHERE id=?', id);
      run(`DELETE FROM users WHERE role='parent' AND center_id=? AND NOT EXISTS (SELECT 1 FROM parent_children pc WHERE pc.parent_id=users.id)`, ctx.user.center_id);
    });
    removeStudentsLater(ids);
    return { ok: true, deleted: ids.length };
  });
  // تقسیم دانش‌آموزان یک پایه بین چند کلاس (به‌ترتیب حروف الفبا، یکی در میان؛ دختر/پسر جداگانه متعادل می‌شوند)
  r.post('/api/manager/classes/distribute', M, (ctx) => {
    const grade = Number(ctx.body.grade);
    const classIds = (Array.isArray(ctx.body.class_ids) ? ctx.body.class_ids : []).map(Number);
    if (!GRADES.includes(grade) || classIds.length < 2) fail(400, 'پایه و حداقل دو کلاس را انتخاب کنید');
    const classes = classIds.map((id) => ownClass(ctx, id));
    if (classes.some((c) => c.grade !== grade)) fail(400, 'کلاس‌ها باید از همین پایه باشند');
    const st = all(`SELECT u.id, u.gender FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.active=1 AND s.grade=? ORDER BY u.full_name`, ctx.user.center_id, grade);
    const byGender = ctx.body.by_gender !== false;
    let n = 0;
    tx(() => {
      const groups = byGender ? [st.filter((x) => x.gender === 'f'), st.filter((x) => x.gender !== 'f')] : [st];
      let k = 0;
      for (const g of groups) for (const x of g) { run('UPDATE students SET class_id=? WHERE user_id=?', classes[k++ % classes.length].id, x.id); n++; }
    });
    syncStudentsLater(st.map((x) => x.id));
    return { ok: true, moved: n };
  });
  // پسرها در یک کلاس (پیش‌فرض «الف») و دخترها در کلاس دیگر (پیش‌فرض «ب») — برای یک پایه یا همهٔ پایه‌ها؛ کلاس‌ها در صورت نبودن ساخته می‌شوند
  r.post('/api/manager/classes/split-gender', M, (ctx) => {
    const cid = ctx.user.center_id, boys = clampStr(ctx.body.boys_class, 30) || 'الف', girls = clampStr(ctx.body.girls_class, 30) || 'ب';
    if (boys === girls) fail(400, 'نام کلاس پسرها و دخترها باید متفاوت باشد');
    const grades = ctx.body.grade ? [Number(ctx.body.grade)] : GRADES;
    if (grades.some((g) => !GRADES.includes(g))) fail(400, 'پایه نامعتبر است');
    const out = { ok: true, boys: 0, girls: 0, classes_created: 0 };
    tx(() => {
      const cls = (g, name) => {
        const ex = get('SELECT id FROM classes WHERE center_id=? AND grade=? AND name=?', cid, g, name);
        if (ex) return ex.id;
        out.classes_created++;
        return Number(run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', cid, g, name).lastInsertRowid);
      };
      for (const g of grades) {
        const st = all("SELECT u.id, u.gender FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND s.grade=?", cid, g);
        if (!st.length) continue;
        const bc = cls(g, boys), gc = cls(g, girls);
        for (const x of st) { run('UPDATE students SET class_id=? WHERE user_id=?', x.gender === 'f' ? gc : bc, x.id); if (x.gender === 'f') out.girls++; else out.boys++; }
      }
    });
    syncStudentsLater(null);
    return out;
  });
  // وضعیت و همگام‌سازی دستی با «کلاس آنلاین»
  r.get('/api/manager/classroom/status', M, () => ({ enabled: classroomEnabled(), pending_removals: pendingRemovals() }));
  r.post('/api/manager/classroom/sync', M, async () => {
    if (!classroomEnabled()) fail(503, 'اتصال به کلاس آنلاین هنوز تنظیم نشده است');
    try { return { ok: true, ...(await fullSync()) }; } catch (e) {
      console.warn('[classroom-sync]', e.message);
      fail(502, e instanceof ClassroomError && e.kind === 'unreachable' ? 'ارتباط با کلاس آنلاین برقرار نشد؛ چند دقیقه بعد دوباره تلاش کنید' : 'همگام‌سازی با کلاس آنلاین ناموفق بود');
    }
  });
  // «حذف همه» برای بخش‌های مختلف (با تأیید)
  r.post('/api/manager/bulk-delete', M, (ctx) => {
    if (ctx.body.confirm !== true) fail(400, 'تأیید حذف لازم است');
    const cid = ctx.user.center_id, what = String(ctx.body.what || '');
    let n = 0;
    tx(() => {
      if (what === 'announcements') n = run('DELETE FROM announcements WHERE center_id=?', cid).changes;
      else if (what === 'schedule') n = run('DELETE FROM schedule WHERE class_id IN (SELECT id FROM classes WHERE center_id=?)', cid).changes;
      else if (what === 'transactions') n = run(`DELETE FROM transactions WHERE center_id=? AND (ref IS NULL OR (ref NOT LIKE 'pay:%' AND ref NOT LIKE 'reversal:%'))`, cid).changes;
      else if (what === 'classes') n = run(`DELETE FROM classes WHERE center_id=? AND NOT EXISTS (SELECT 1 FROM students s WHERE s.class_id=classes.id) AND NOT EXISTS (SELECT 1 FROM schedule sc WHERE sc.class_id=classes.id)`, cid).changes;
      else if (what === 'teachers' || what === 'counselors') n = run('DELETE FROM users WHERE center_id=? AND role=?', cid, what === 'teachers' ? 'teacher' : 'counselor').changes;
      else fail(400, 'بخش نامعتبر است');
    });
    return { ok: true, deleted: n };
  });
  r.post('/api/manager/students/:id/reset-password', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    run('UPDATE users SET pass_hash=?, must_change_password=1 WHERE id=?', hashPassword(s.national_code), s.id);
    return { ok: true };
  });

  // ---------- معلمان و برنامه کلاسی ----------
  r.post('/api/manager/teachers', M, (ctx) => {
    const b = ctx.body, username = toEnDigits(clampStr(b.username, 40)).toLowerCase(), full_name = clampStr(b.full_name, 80);
    if (!full_name || !/^[a-z0-9_.]{3,40}$/.test(username)) fail(400, 'نام و نام کاربری لاتین (حداقل ۳ حرف) لازم است');
    if (!b.password || String(b.password).length < 6) fail(400, 'رمز عبور حداقل ۶ کاراکتر');
    if (get(`SELECT 1 FROM users WHERE role='teacher' AND username=?`, username)) fail(400, 'این نام کاربری تکراری است');
    tx(() => {
      const res = run(`INSERT INTO users (center_id, role, username, mobile, pass_hash, full_name) VALUES (?,?,?,?,?,?)`, ctx.user.center_id, 'teacher', username, clampStr(b.mobile, 11) || null, hashPassword(b.password), full_name);
      for (const a of b.assign || []) { ownClass(ctx, a.class_id); run('INSERT OR IGNORE INTO teacher_classes VALUES (?,?,?)', Number(res.lastInsertRowid), Number(a.class_id), clampStr(a.subject, 40)); }
    });
    return { ok: true };
  });
  r.put('/api/manager/teachers/:id', M, (ctx) => {
    const t = get(`SELECT id FROM users WHERE id=? AND center_id=? AND role='teacher'`, Number(ctx.params.id), ctx.user.center_id);
    if (!t) fail(404, 'معلم یافت نشد');
    tx(() => {
      if (ctx.body.full_name) run('UPDATE users SET full_name=? WHERE id=?', clampStr(ctx.body.full_name, 80), t.id);
      if (ctx.body.active !== undefined) run('UPDATE users SET active=? WHERE id=?', ctx.body.active ? 1 : 0, t.id);
      if (ctx.body.password) { if (String(ctx.body.password).length < 6) fail(400, 'رمز عبور حداقل ۶ کاراکتر'); run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(ctx.body.password), t.id); }
      if (Array.isArray(ctx.body.assign)) {
        run('DELETE FROM teacher_classes WHERE teacher_id=?', t.id);
        for (const a of ctx.body.assign) { ownClass(ctx, a.class_id); run('INSERT OR IGNORE INTO teacher_classes VALUES (?,?,?)', t.id, Number(a.class_id), clampStr(a.subject, 40)); }
      }
    });
    return { ok: true };
  });
  r.get('/api/manager/teachers/:id', M, (ctx) => {
    const t = get(`SELECT id, full_name, username, mobile, active FROM users WHERE id=? AND center_id=? AND role='teacher'`, Number(ctx.params.id), ctx.user.center_id);
    if (!t) fail(404, 'معلم یافت نشد');
    t.assign = all('SELECT class_id, subject FROM teacher_classes WHERE teacher_id=?', t.id);
    return t;
  });
  r.get('/api/manager/schedule/colors', M, (ctx) => JSON.parse(get('SELECT config FROM schedule_colors WHERE center_id=?', ctx.user.center_id)?.config || '{}'));
  r.put('/api/manager/schedule/colors', M, (ctx) => {
    const config = { kinds: Object.create(null), subjects: Object.create(null) };
    for (const group of ['kinds', 'subjects']) {
      const values = ctx.body[group] ?? {};
      if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 100) fail(400, 'تنظیمات رنگ معتبر نیست');
      for (const [key, color] of Object.entries(values)) {
        if (!key.trim() || key.length > 40 || (group === 'kinds' && !SESSION_KINDS.includes(key)) || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) fail(400, 'نام درس یا رنگ معتبر نیست');
        config[group][key] = color.toLowerCase();
      }
    }
    run('INSERT INTO schedule_colors (center_id, config) VALUES (?,?) ON CONFLICT(center_id) DO UPDATE SET config=excluded.config', ctx.user.center_id, JSON.stringify(config));
    return { ok: true };
  });
  r.get('/api/manager/schedule', M, (ctx) => {
    const c = ownClass(ctx, ctx.query.class_id);
    return all('SELECT sc.*, u.full_name teacher FROM schedule sc LEFT JOIN users u ON u.id=sc.teacher_id WHERE class_id=? ORDER BY weekday, start', c.id);
  });
  r.post('/api/manager/schedule', M, (ctx) => {
    const b = ctx.body, c = ownClass(ctx, b.class_id);
    const wd = Number(b.weekday);
    if (!(wd >= 0 && wd <= 6) || !/^\d{2}:\d{2}$/.test(b.start) || !/^\d{2}:\d{2}$/.test(b.end) || b.end <= b.start) fail(400, 'روز و ساعت شروع/پایان را درست وارد کنید');
    if (!clampStr(b.subject, 40)) fail(400, 'نام درس را وارد کنید');
    const tid = b.teacher_id ? get(`SELECT id FROM users WHERE id=? AND center_id=? AND role='teacher'`, Number(b.teacher_id), ctx.user.center_id)?.id : null;
    const kind = SESSION_KINDS.includes(b.kind) ? b.kind : 'academic';
    const clash = get('SELECT 1 FROM schedule WHERE class_id=? AND weekday=? AND start<? AND end>?', c.id, wd, b.end, b.start);
    if (clash) fail(400, 'در این روز و ساعت برای این کلاس جلسهٔ دیگری ثبت شده است');
    run('INSERT INTO schedule (class_id, weekday, start, end, subject, teacher_id, room, kind) VALUES (?,?,?,?,?,?,?,?)', c.id, wd, b.start, b.end, clampStr(b.subject, 40), tid ?? null, clampStr(b.room, 30), kind);
    return { ok: true };
  });
  // نمای کلی همهٔ جلسات کانون برای جدول خطی مدیر (هر روز: ساعت، مکان، کلاس)
  r.get('/api/manager/schedule/overview', M, (ctx) => all(`SELECT sc.id, sc.weekday, sc.start, sc.end, sc.subject, sc.room, sc.kind, sc.class_id, c.grade, c.name class_name, sc.teacher_id, u.full_name teacher
    FROM schedule sc JOIN classes c ON c.id=sc.class_id LEFT JOIN users u ON u.id=sc.teacher_id WHERE c.center_id=? ORDER BY sc.weekday, sc.start, sc.room, c.grade, c.name`, ctx.user.center_id));
  r.del('/api/manager/schedule/:id', M, (ctx) => {
    run('DELETE FROM schedule WHERE id=? AND class_id IN (SELECT id FROM classes WHERE center_id=?)', Number(ctx.params.id), ctx.user.center_id);
    return { ok: true };
  });

  // ---------- حق عضویت ----------
  r.get('/api/manager/fees', M, (ctx) => {
    const set = Object.fromEntries(all('SELECT grade, amount, lock_date FROM fee_settings WHERE center_id=?', ctx.user.center_id).map((f) => [f.grade, f]));
    const classes = all(`SELECT c.id, c.grade, c.name FROM classes c WHERE c.center_id=? ORDER BY c.grade, c.name`, ctx.user.center_id).map((c) => {
      const st = all(`SELECT ${paymentStateSql()} st FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=? AND u.active=1`, c.id);
      return { ...c, paid: st.filter((x) => x.st === 'paid').length, pending: st.filter((x) => x.st === 'pending').length, unpaid: st.filter((x) => x.st === 'unpaid').length };
    });
    return { settings: GRADES.map((g) => set[g] || { grade: g, amount: 0, lock_date: null }), classes, system_fee: get('SELECT system_fee FROM centers WHERE id=?', ctx.user.center_id)?.system_fee ?? 0, system_fee_enabled: !!get('SELECT system_fee_enabled FROM centers WHERE id=?', ctx.user.center_id)?.system_fee_enabled };
  });
  r.put('/api/manager/fees', M, (ctx) => {
    tx(() => {
      if (ctx.body.system_fee !== undefined) run('UPDATE centers SET system_fee=? WHERE id=?', Math.max(0, Math.round(Number(ctx.body.system_fee) || 0)), ctx.user.center_id);
      if (ctx.body.system_fee_enabled !== undefined) run('UPDATE centers SET system_fee_enabled=? WHERE id=?', ctx.body.system_fee_enabled ? 1 : 0, ctx.user.center_id);
      for (const f of ctx.body.settings || []) {
        if (!GRADES.includes(Number(f.grade))) continue;
        if (f.lock_date && !isDate(f.lock_date)) fail(400, 'تاریخ قفل نامعتبر است');
        run(`INSERT INTO fee_settings (center_id, grade, amount, lock_date) VALUES (?,?,?,?) ON CONFLICT(center_id, grade) DO UPDATE SET amount=excluded.amount, lock_date=excluded.lock_date`,
          ctx.user.center_id, Number(f.grade), Math.max(0, Math.round(Number(f.amount) || 0)), f.lock_date || null);
      }
      backfillZeroPayments(ctx.user.center_id);
    });
    return { ok: true };
  });
  r.get('/api/manager/fees/class/:id', M, (ctx) => {
    const c = ownClass(ctx, ctx.params.id);
    return all(`SELECT u.id, u.full_name, s.avatar, ${paymentStateSql()} st FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=? AND u.active=1 ORDER BY st DESC, u.full_name`, c.id);
  });
  r.get('/api/manager/receipts', M, (ctx) => {
    const status = ['pending', 'approved', 'rejected', 'reversed'].includes(ctx.query.status) ? ctx.query.status : 'pending';
    return all(`SELECT p.*, u.full_name, s.grade, c.name class_name, s.avatar FROM payments p JOIN users u ON u.id=p.student_id JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id
      WHERE u.center_id=? AND p.status=? ORDER BY p.id ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`, ctx.user.center_id, status);
  });
  const ownPayment = (ctx) => {
    const p = get(`SELECT p.*, u.full_name FROM payments p JOIN users u ON u.id=p.student_id WHERE p.id=? AND u.center_id=?`, Number(ctx.params.id), ctx.user.center_id);
    if (!p) fail(404, 'رسید یافت نشد');
    if (p.status !== 'pending') fail(400, 'این رسید قبلاً بررسی شده است');
    return p;
  };
  r.post('/api/manager/receipts/:id/approve', M, (ctx) => {
    const p = ownPayment(ctx);
    tx(() => {
      run(`UPDATE payments SET status='approved', reviewed_at=datetime('now'), period=COALESCE(period, ?) WHERE id=?`, periodLabel(), p.id);
      if (p.invoice_id) {
        const inv = get('SELECT fee_type, period FROM fee_invoices WHERE id=?', p.invoice_id);
        const title = inv ? `فاکتور ${inv.fee_type || ''} ${inv.period || ''} - ${p.full_name}`.trim() : `فاکتور - ${p.full_name}`;
        run(`INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)`, ctx.user.center_id, 'income', p.amount, title, 'فاکتور', ymd(), `pay:${p.id}`);
        recalcInvoice(p.invoice_id);
      } else {
        run(`INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)`, ctx.user.center_id, 'income', p.amount, `حق عضویت - ${p.full_name}`, 'حق عضویت', ymd(), `pay:${p.id}`);
        run(`DELETE FROM points WHERE student_id=? AND ref LIKE 'fee:%'`, p.student_id);
      }
    });
    return { ok: true };
  });
  r.post('/api/manager/receipts/:id/reject', M, (ctx) => {
    const p = ownPayment(ctx);
    const reason = clampStr(ctx.body.reason, 200);
    if (!reason) fail(400, 'علت رد رسید را مشخص کنید');
    tx(() => {
      run(`UPDATE payments SET status='rejected', reject_reason=?, reviewed_at=datetime('now') WHERE id=?`, reason, p.id);
      if (p.invoice_id) {
        recalcInvoice(p.invoice_id);
      }
    });
    return { ok: true };
  });

  // ---------- تنظیمات کانون ----------
  r.get('/api/manager/settings', M, (ctx) => get('SELECT name, slug, logo, tagline, about, color, card_number, card_holder, min_daily_study FROM centers WHERE id=?', ctx.user.center_id));
  r.put('/api/manager/settings', M, (ctx) => {
    const b = ctx.body;
    const card = toEnDigits(clampStr(b.card_number, 19)).replace(/\D/g, '');
    if (card && card.length !== 16) fail(400, 'شماره کارت باید ۱۶ رقم باشد');
    let logo = b.logo;
    if (logo && typeof logo === 'object') logo = '/uploads/' + saveUpload(logo, 1);
    run('UPDATE centers SET name=?, tagline=?, about=?, color=?, card_number=?, card_holder=?, min_daily_study=?, logo=COALESCE(?, logo) WHERE id=?',
      clampStr(b.name, 100) || 'کانون', clampStr(b.tagline, 150), clampStr(b.about, 2000), /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#7c3aed', card, clampStr(b.card_holder, 80),
      Math.max(10, Math.min(300, Number(b.min_daily_study) || 50)), typeof logo === 'string' ? clampStr(logo, 200000) : null, ctx.user.center_id);
    return { ok: true };
  });

  // ---------- اطلاعیه‌رسانی ----------
  r.get('/api/manager/announcements', M, (ctx) => all('SELECT * FROM announcements WHERE center_id=? ORDER BY id DESC', ctx.user.center_id).map((a) => {
    const aud = announcementAudience(a);
    return { ...a, target_value: JSON.parse(a.target_value || '[]'), audience: aud.length, seen: aud.filter((x) => x.seen_at).length };
  }));
  r.post('/api/manager/announcements', M, async (ctx) => {
    const b = ctx.body;
    const title = clampStr(b.title, 150), body = clampStr(b.body, 4000);
    if (!title || !body) fail(400, 'عنوان و متن اطلاعیه را وارد کنید');
    const type = ['all', 'grade', 'classes'].includes(b.target_type) ? b.target_type : 'all';
    let value = (b.target_value || []).map(Number);
    if (type === 'grade') value = value.filter((g) => GRADES.includes(g));
    if (type === 'classes') value = value.filter((id) => get('SELECT 1 FROM classes WHERE id=? AND center_id=?', id, ctx.user.center_id));
    if (type !== 'all' && !value.length) fail(400, 'مخاطبان اطلاعیه را انتخاب کنید');
    const ins = run('INSERT INTO announcements (center_id, title, body, emoji, target_type, target_value, author_id) VALUES (?,?,?,?,?,?,?)',
      ctx.user.center_id, title, body, clampStr(b.emoji, 8) || '📢', type, JSON.stringify(value), ctx.user.id);

    let smsResult = null;
    if (b.send_sms) {
      const ann = { id: ins.lastInsertRowid, center_id: ctx.user.center_id, target_type: type, target_value: JSON.stringify(value) };
      const people = announcementAudience(ann);
      const center = get('SELECT name FROM centers WHERE id=?', ctx.user.center_id);
      const prefix = center?.name ? `[${center.name}] ` : '';
      const text = `${prefix}${title}\n${body}`.slice(0, 300);
      const rec = b.sms_recipient || 'parent';
      const queue = [];
      const seen = new Set();
      for (const p of people) {
        if (p.role === 'student') {
          if ((rec === 'parent' || rec === 'both')) {
            const st = get('SELECT parent_phone FROM students WHERE user_id=?', p.id);
            if (st?.parent_phone && !seen.has(st.parent_phone)) {
              seen.add(st.parent_phone);
              queue.push({ phone: st.parent_phone, student_id: p.id });
            }
          }
          if ((rec === 'student' || rec === 'both')) {
            const u = get('SELECT mobile FROM users WHERE id=?', p.id);
            if (u?.mobile && !seen.has(u.mobile)) {
              seen.add(u.mobile);
              queue.push({ phone: u.mobile, student_id: p.id });
            }
          }
        }
      }
      let sent = 0, failed = 0;
      for (let i = 0; i < queue.length; i += 5) {
        await Promise.all(queue.slice(i, i + 5).map(async (q) => {
          const r = await sendSms(q.phone, text, { center_id: ctx.user.center_id, student_id: q.student_id, message_type: 'announcement' });
          if (r.ok) sent++; else failed++;
        }));
      }
      smsResult = { total: queue.length, sent, failed, simulated: smsProvider() === 'simulated' };
    }
    return { ok: true, id: ins.lastInsertRowid, sms: smsResult };
  });
  r.get('/api/manager/announcements/:id', M, (ctx) => {
    const a = get('SELECT * FROM announcements WHERE id=? AND center_id=?', Number(ctx.params.id), ctx.user.center_id);
    if (!a) fail(404, 'اطلاعیه یافت نشد');
    return { ...a, people: announcementAudience(a) };
  });
  r.del('/api/manager/announcements/:id', M, (ctx) => {
    run('DELETE FROM announcements WHERE id=? AND center_id=?', Number(ctx.params.id), ctx.user.center_id);
    return { ok: true };
  });

  // ---------- حسابداری ----------
  r.get('/api/manager/accounting', M, (ctx) => {
    const cid = ctx.user.center_id;
    const from = isDate(ctx.query.from) ? ctx.query.from : addDays(ymd(), -30);
    const to = isDate(ctx.query.to) ? ctx.query.to : ymd();
    const type = ['income', 'expense'].includes(ctx.query.type) ? ctx.query.type : null;
    const all_ = get(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) inc, COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) exp FROM transactions WHERE center_id=?`, cid);
    const range = get(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) inc, COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) exp FROM transactions WHERE center_id=? AND date BETWEEN ? AND ?`, cid, from, to);
    // شش ماه شمسی اخیر
    const [jy, jm] = jMonthOf(ymd());
    const months = [];
    for (let i = 5; i >= 0; i--) {
      let y = jy, m = jm - i;
      while (m < 1) { m += 12; y--; }
      const start = j2g(y, m, 1), endM = m === 12 ? [y + 1, 1] : [y, m + 1], end = j2g(endM[0], endM[1], 1);
      const f = (a) => `${a[0]}-${String(a[1]).padStart(2, '0')}-${String(a[2]).padStart(2, '0')}`;
      const s = get(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) inc, COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) exp FROM transactions WHERE center_id=? AND date>=? AND date<?`, cid, f(start), f(end));
      months.push({ label: JMONTHS[m - 1], income: s.inc, expense: s.exp });
    }
    const ledger = all(`SELECT * FROM transactions WHERE center_id=? AND date BETWEEN ? AND ? ${type ? 'AND type=?' : ''} ORDER BY date DESC, id DESC LIMIT 500`, ...[cid, from, to, ...(type ? [type] : [])]);
    const categories = all(`SELECT category, SUM(amount) total FROM transactions WHERE center_id=? AND type='expense' AND date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC`, cid, from, to);
    return { from, to, totals: { income: all_.inc, expense: all_.exp, balance: all_.inc - all_.exp }, range: { income: range.inc, expense: range.exp }, months, ledger, categories };
  });
  r.post('/api/manager/expenses', M, (ctx) => {
    const b = ctx.body;
    const amount = Math.round(Number(toEnDigits(b.amount)));
    if (!(amount > 0)) fail(400, 'مبلغ نامعتبر است');
    if (!isDate(b.date)) fail(400, 'تاریخ نامعتبر است');
    const title = clampStr(b.title, 150);
    if (!title) fail(400, 'شرح هزینه را وارد کنید');
    const type = b.type === 'income' ? 'income' : 'expense';
    run('INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)', ctx.user.center_id, type, amount, title, clampStr(b.category, 40) || 'سایر', b.date, clampStr(b.ref, 40) || null);
    return { ok: true };
  });
  r.del('/api/manager/transactions/:id', M, (ctx) => {
    run(`DELETE FROM transactions WHERE id=? AND center_id=? AND (ref IS NULL OR ref NOT LIKE 'pay:%')`, Number(ctx.params.id), ctx.user.center_id);
    return { ok: true };
  });

  // ---------- آزمون جامع کانون ----------
  r.get('/api/manager/comprehensive', M, (ctx) => all(`SELECT e.id, e.title, e.grade, e.exam_date, e.location, e.created_at, json_array_length(e.questions) qcount,
    (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id=e.id) results, (SELECT AVG(percent) FROM exam_results r WHERE r.exam_id=e.id) avg,
    (SELECT COUNT(*) FROM students s JOIN users u ON u.id=s.user_id WHERE u.center_id=e.center_id AND s.grade=e.grade AND u.active=1) candidates
    FROM exams e WHERE e.center_id=? AND e.kind='comprehensive' ORDER BY e.id DESC`, ctx.user.center_id));
  r.post('/api/manager/comprehensive', M, (ctx) => {
    const b = ctx.body, title = clampStr(b.title, 150), grade = Number(b.grade);
    if (!title || !GRADES.includes(grade)) fail(400, 'عنوان و پایه را وارد کنید');
    if (b.exam_date && !isDate(b.exam_date)) fail(400, 'تاریخ آزمون نامعتبر است');
    const qs = parseQuestions(b.questions, false);
    const res = run('INSERT INTO exams (center_id, title, kind, grade, duration_min, questions, exam_date, location, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      ctx.user.center_id, title, 'comprehensive', grade, Math.max(10, Number(b.duration_min) || 90), JSON.stringify(qs), b.exam_date || null, clampStr(b.location, 150), ctx.user.id);
    return { ok: true, id: Number(res.lastInsertRowid) };
  });
  const ownComp = (ctx) => {
    const e = get(`SELECT * FROM exams WHERE id=? AND center_id=? AND kind='comprehensive'`, Number(ctx.params.id), ctx.user.center_id);
    if (!e) fail(404, 'آزمون یافت نشد');
    return e;
  };
  r.get('/api/manager/comprehensive/:id', M, (ctx) => {
    const e = examWithResults(ownComp(ctx));
    e.students = e.students.map((s, i) => ({ ...s, seat: e.id * 1000 + i + 1 }));
    return e;
  });
  r.post('/api/manager/comprehensive/:id/result', M, (ctx) => {
    const e = ownComp(ctx);
    const st = get(`SELECT u.id, s.grade FROM users u JOIN students s ON s.user_id=u.id WHERE u.id=? AND u.center_id=?`, Number(ctx.body.student_id), ctx.user.center_id);
    if (!st || st.grade !== e.grade) fail(400, 'داوطلب نامعتبر است');
    const n = JSON.parse(e.questions).length;
    const answers = Array.from({ length: n }, (_, i) => { const v = ctx.body.answers?.[i]; return Number.isInteger(v) && v >= 0 && v <= 3 ? v : null; });
    return saveExamResult(e, st.id, answers, 'scan');
  });
  r.del('/api/manager/comprehensive/:id', M, (ctx) => {
    const e = ownComp(ctx);
    tx(() => { run('DELETE FROM points WHERE ref=?', `exam:${e.id}`); run('DELETE FROM exams WHERE id=?', e.id); });
    return { ok: true };
  });

  // ---------- عملکرد کلی و فروشگاه ----------
  r.get('/api/manager/performance', M, (ctx) => {
    const ids = all('SELECT id FROM classes WHERE center_id=?' + (ctx.query.grade ? ' AND grade=?' : ''), ...[ctx.user.center_id, ...(ctx.query.grade ? [Number(ctx.query.grade)] : [])]).map((c) => c.id);
    return performanceList(ctx.user.center_id, ids).slice(0, 100);
  });
  r.get('/api/manager/products', M, (ctx) => ({
    products: all('SELECT * FROM products WHERE center_id=? ORDER BY id DESC', ctx.user.center_id),
    codes: all('SELECT * FROM discount_codes WHERE center_id=?', ctx.user.center_id),
    orders: all(`SELECT o.id, o.total, o.tracking_code, o.created_at, u.full_name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.center_id=? ORDER BY o.id DESC LIMIT 50`, ctx.user.center_id),
  }));
  r.post('/api/manager/products', M, (ctx) => {
    const b = ctx.body, title = clampStr(b.title, 150), price = Math.round(Number(toEnDigits(b.price)));
    if (!title || !(price >= 0)) fail(400, 'عنوان و قیمت را وارد کنید');
    const vals = [title, b.kind === 'video' ? 'video' : 'booklet', clampStr(b.grade, 30), clampStr(b.description, 500), clampStr(b.details, 4000), price,
      Math.max(0, Math.min(90, Number(b.discount_percent) || 0)), clampStr(b.cover, 8) || '📘', /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#7c3aed', b.active === false ? 0 : 1];
    if (b.id) run('UPDATE products SET title=?, kind=?, grade=?, description=?, details=?, price=?, discount_percent=?, cover=?, color=?, active=? WHERE id=? AND center_id=?', ...vals, Number(b.id), ctx.user.center_id);
    else run('INSERT INTO products (title, kind, grade, description, details, price, discount_percent, cover, color, active, center_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...vals, ctx.user.center_id);
    return { ok: true };
  });
  r.post('/api/manager/discount-codes', M, (ctx) => {
    const code = clampStr(ctx.body.code, 30).toUpperCase(), percent = Number(ctx.body.percent);
    if (!/^[A-Z0-9-]{3,30}$/.test(code) || !(percent > 0 && percent <= 90)) fail(400, 'کد لاتین و درصد ۱ تا ۹۰ لازم است');
    run('INSERT INTO discount_codes (code, center_id, percent, active) VALUES (?,?,?,1) ON CONFLICT(center_id, code) DO UPDATE SET percent=excluded.percent, active=1', code, ctx.user.center_id, percent);
    return { ok: true };
  });
  r.del('/api/manager/discount-codes/:code', M, (ctx) => {
    run('DELETE FROM discount_codes WHERE center_id=? AND code=?', ctx.user.center_id, ctx.params.code);
    return { ok: true };
  });

  // ---------- برگشت رسید تأییدشده با سند اصلاحی (Option 11) ----------
  r.post('/api/manager/receipts/:id/reverse', M, (ctx) => {
    const p = get(`SELECT p.*, u.full_name FROM payments p JOIN users u ON u.id=p.student_id WHERE p.id=? AND u.center_id=?`, Number(ctx.params.id), ctx.user.center_id);
    if (!p) fail(404, 'رسید یافت نشد');
    if (p.status !== 'approved') fail(400, 'فقط رسیدهای تأییدشده قابل برگشت هستند');
    if (p.reversed_at) fail(400, 'این رسید قبلاً برگشت خورده و سند اصلاحی صادر شده است');

    const reason = clampStr(ctx.body.reason, 200) || 'برگشت توسط مدیریت کانون';

    tx(() => {
      run(`UPDATE payments SET status='reversed', reversed_at=datetime('now'), reversed_by=?, reverse_reason=?, reject_reason=? WHERE id=?`,
        ctx.user.id, reason, `برگشت رسید تأییدشده: ${reason}`, p.id);
      run(`INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)`,
        ctx.user.center_id, 'expense', p.amount, `سند اصلاحی برگشت رسید - ${p.full_name}`, 'اصلاحیه', ymd(), `reversal:${p.id}`);
      if (p.invoice_id) {
        recalcInvoice(p.invoice_id);
      }
    });

    return { ok: true, id: p.id, reversed: true, reason };
  });

  // ---------- فاکتورهای بدهی دوره‌ای (Option 10) ----------
  r.get('/api/manager/invoices', M, (ctx) => {
    return all(`
      SELECT i.*, u.full_name, c.name class_name, s.grade,
             COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id=i.id AND p.status='approved'), 0) paid
      FROM fee_invoices i
      JOIN users u ON u.id=i.student_id
      LEFT JOIN students s ON s.user_id=u.id
      LEFT JOIN classes c ON c.id=s.class_id
      WHERE i.center_id=? ORDER BY i.id DESC
    `, ctx.user.center_id).map((r) => {
      const paid = Number(r.paid) || 0;
      const amount = Number(r.amount) || 0;
      const status = paid >= amount ? 'paid' : (paid > 0 ? 'partial' : 'issued');
      return {
        ...r,
        paid,
        remaining: Math.max(0, amount - paid),
        status,
      };
    });
  });

  r.post('/api/manager/invoices', M, (ctx) => {
    const b = ctx.body;
    const fee_type = clampStr(b.fee_type, 40) || 'tuition';
    const period = clampStr(b.period, 40);
    const amount = Number(b.amount);
    if (!period || !amount || amount <= 0) fail(400, 'دوره و مبلغ معتبر فاکتور الزامی است');

    const studentIds = [];
    if (b.class_id) {
      const cls = get('SELECT id FROM classes WHERE id=? AND center_id=?', Number(b.class_id), ctx.user.center_id);
      if (!cls) fail(404, 'کلاس یافت نشد یا متعلق به این کانون نیست');
      const studs = all("SELECT s.user_id FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=? AND u.center_id=? AND u.role='student'", cls.id, ctx.user.center_id);
      for (const s of studs) studentIds.push(s.user_id);
    } else if (b.student_id) {
      const stu = get("SELECT id FROM users WHERE id=? AND center_id=? AND role='student'", Number(b.student_id), ctx.user.center_id);
      if (!stu) fail(404, 'دانش‌آموز یافت نشد یا متعلق به این کانون نیست');
      studentIds.push(stu.id);
    }
    if (!studentIds.length) fail(400, 'دانش‌آموز یا کلاس انتخاب نشده است');

    const createdIds = [];
    tx(() => {
      for (const sid of studentIds) {
        run(`
          INSERT INTO fee_invoices (center_id, student_id, fee_type, period, amount)
          VALUES (?,?,?,?,?)
          ON CONFLICT(student_id, fee_type, period) DO UPDATE SET amount=excluded.amount
        `, ctx.user.center_id, sid, fee_type, period, amount);
        const inv = get('SELECT id FROM fee_invoices WHERE student_id=? AND fee_type=? AND period=?', sid, fee_type, period);
        createdIds.push(inv.id);
      }
    });

    return { ok: true, id: createdIds[0], count: createdIds.length, ids: createdIds };
  });

  // ---------- صندوق خروجی و صف پیامک‌ها (Option 12) ----------
  r.get('/api/manager/sms-outbox', M, (ctx) => {
    return all(`
      SELECT o.*, u.full_name student_name
      FROM sms_outbox o
      LEFT JOIN users u ON u.id=o.student_id
      WHERE o.center_id=? ORDER BY o.id DESC LIMIT 200
    `, ctx.user.center_id);
  });

  r.post('/api/manager/sms-outbox/:id/retry', M, async (ctx) => {
    const msg = get('SELECT * FROM sms_outbox WHERE id=? AND center_id=?', Number(ctx.params.id), ctx.user.center_id);
    if (!msg) fail(404, 'پیامک در صندوق خروجی یافت نشد');
    if (msg.status !== 'failed') fail(400, 'فقط پیام‌های ناموفق (failed) قابل تلاش مجدد هستند');
    const r = await sendSms(msg.recipient_phone, msg.content);
    if (r.ok) {
      run(`UPDATE sms_outbox SET status='sent', sent_at=datetime('now'), error_message=NULL WHERE id=?`, msg.id);
      return { ok: true, status: 'sent' };
    } else {
      run(`UPDATE sms_outbox SET status='failed', error_message=? WHERE id=?`, r.error, msg.id);
      return { ok: false, status: 'failed', error: r.error };
    }
  });

  // ---------- ارسال پیامک گروهی یا تکی به دانش‌آموزان / اولیا ----------
  r.post('/api/manager/sms/send', M, async (ctx) => {
    const cid = ctx.user.center_id;
    const b = ctx.body || {};
    const text = clampStr(b.text || b.message, 500);
    if (!text) fail(400, 'متن پیامک را وارد کنید');

    const targetType = ['all', 'grade', 'class', 'student', 'debtors'].includes(b.target_type) ? b.target_type : 'all';
    const recipient = ['parent', 'student', 'both'].includes(b.recipient) ? b.recipient : 'parent';
    const msgType = b.message_type || (targetType === 'debtors' ? 'fee_reminder' : 'broadcast');

    let students = [];
    if (targetType === 'student') {
      const sid = Number(b.target_value);
      const st = get(`SELECT u.id, u.full_name, u.mobile, s.parent_phone FROM users u JOIN students s ON s.user_id=u.id WHERE u.id=? AND u.center_id=? AND u.active=1`, sid, cid);
      if (!st) fail(404, 'دانش‌آموز یافت نشد');
      students = [st];
    } else if (targetType === 'class') {
      const clsId = Number(b.target_value);
      students = all(`SELECT u.id, u.full_name, u.mobile, s.parent_phone FROM users u JOIN students s ON s.user_id=u.id WHERE s.class_id=? AND u.center_id=? AND u.active=1`, clsId, cid);
    } else if (targetType === 'grade') {
      const gr = Number(b.target_value);
      students = all(`SELECT u.id, u.full_name, u.mobile, s.parent_phone FROM users u JOIN students s ON s.user_id=u.id WHERE s.grade=? AND u.center_id=? AND u.active=1`, gr, cid);
    } else if (targetType === 'debtors') {
      students = all(`SELECT u.id, u.full_name, u.mobile, s.parent_phone FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.active=1 AND ${paymentStateSql()} = 'unpaid'`, cid);
    } else {
      students = all(`SELECT u.id, u.full_name, u.mobile, s.parent_phone FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.active=1`, cid);
    }

    if (!students.length) fail(400, 'مخاطبی برای ارسال پیامک یافت نشد');

    const result = { ok: true, total: 0, sent: 0, failed: 0, simulated: smsProvider() === 'simulated', errors: [] };
    const queue = [];
    for (const st of students) {
      const personalized = text.replace(/\{نام\}|\{name\}/gi, st.full_name);
      if ((recipient === 'parent' || recipient === 'both') && st.parent_phone) {
        queue.push({ phone: st.parent_phone, student_id: st.id, text: personalized });
      }
      if ((recipient === 'student' || recipient === 'both') && st.mobile) {
        queue.push({ phone: st.mobile, student_id: st.id, text: personalized });
      }
    }

    const seen = new Set();
    const uniqueQueue = [];
    for (const item of queue) {
      const ph = String(item.phone).trim();
      if (ph && !seen.has(ph)) {
        seen.add(ph);
        uniqueQueue.push({ ...item, phone: ph });
      }
    }

    result.total = uniqueQueue.length;
    for (let i = 0; i < uniqueQueue.length; i += 5) {
      await Promise.all(uniqueQueue.slice(i, i + 5).map(async (item) => {
        const r = await sendSms(item.phone, item.text, { center_id: cid, student_id: item.student_id, message_type: msgType });
        if (r.ok) {
          result.sent++;
        } else {
          result.failed++;
          if (result.errors.length < 3) result.errors.push(r.error);
        }
      }));
    }

    return result;
  });

  // ---------- لاگ تغییرات حضور و غیاب برای مدیر (Option 7) ----------
  r.get('/api/manager/attendance/changes', M, (ctx) => {
    return all(`
      SELECT ch.*, u.full_name student_name, actor.full_name actor_name, c.name class_name
      FROM attendance_changes ch
      JOIN users u ON u.id=ch.student_id
      JOIN users actor ON actor.id=ch.actor_id
      LEFT JOIN classes c ON c.id=ch.session_id
      WHERE u.center_id=? ORDER BY ch.id DESC LIMIT 200
    `, ctx.user.center_id);
  });

  // ---------- نمرات مستمر دستی کلاسی برای مدیر (Option 8) ----------
  r.get('/api/manager/manual-scores', M, (ctx) => {
    return all(`
      SELECT m.*, u.full_name student_name, t.full_name teacher_name, c.name class_name
      FROM manual_scores m
      JOIN users u ON u.id=m.student_id
      JOIN users t ON t.id=m.teacher_id
      LEFT JOIN classes c ON c.id=m.class_id
      WHERE m.center_id=? ORDER BY m.id DESC LIMIT 300
    `, ctx.user.center_id);
  });

  // ---------- کارنامه رسمی آزمون جامع «طرح برپا» برای مدیر (Option 9) ----------
  const toNumOrNull = (val) => (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) ? Number(val) : null);

  r.post('/api/manager/barpa-exams/reports', M, (ctx) => {
    const b = ctx.body;
    const grade = String(b.grade || 'نهم');
    const exam_title = clampStr(b.exam_title, 120) || 'آزمون جامع طرح برپا';
    const stage = b.stage ? String(b.stage).trim() : '';
    let exam_id = clampStr(b.exam_id, 80);
    if (!exam_id) {
      const cleanTitle = exam_title.replace(/[^\w\u0600-\u06FF]+/g, '_').replace(/^_+|_+$/g, '');
      const sPart = stage ? `_stage${stage}` : '';
      exam_id = `barpa_${grade}${sPart}_${cleanTitle}`;
    }
    const records = Array.isArray(b.records) ? b.records : (b.student_id ? [b] : []);
    if (!records.length) fail(400, 'حداقل یک کارنامه ارسال کنید');

    const saved = [];
    tx(() => {
      for (const rec of records) {
        const sid = Number(rec.student_id);
        const stu = get('SELECT id, full_name, school FROM users u LEFT JOIN students s ON s.user_id=u.id WHERE u.id=? AND u.center_id=?', sid, ctx.user.center_id);
        if (!stu) continue;

        const res = run(`
          INSERT INTO comprehensive_exam_reports (
            center_id, exam_id, exam_title, grade, student_id, candidate_code,
            student_name, school_name, total_attendees, overall_traz, overall_rank_all,
            overall_rank_center, overall_percentage, overall_correct, overall_wrong,
            overall_unanswered, total_questions, subjects_json, categories_json, answers_json
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(exam_id, student_id) DO UPDATE SET
            candidate_code = excluded.candidate_code,
            student_name = excluded.student_name,
            school_name = excluded.school_name,
            total_attendees = excluded.total_attendees,
            overall_traz = excluded.overall_traz,
            overall_rank_all = excluded.overall_rank_all,
            overall_rank_center = excluded.overall_rank_center,
            overall_percentage = excluded.overall_percentage,
            overall_correct = excluded.overall_correct,
            overall_wrong = excluded.overall_wrong,
            overall_unanswered = excluded.overall_unanswered,
            total_questions = excluded.total_questions,
            subjects_json = excluded.subjects_json,
            categories_json = excluded.categories_json,
            answers_json = excluded.answers_json
        `, ctx.user.center_id, exam_id, exam_title, grade, sid,
           rec.candidate_code || `STU_${sid}`,
           rec.student_name || stu.full_name,
           rec.school_name || stu.school || null,
           toNumOrNull(rec.total_attendees),
           toNumOrNull(rec.overall_traz),
           toNumOrNull(rec.overall_rank_all),
           toNumOrNull(rec.overall_rank_center),
           toNumOrNull(rec.overall_percentage),
           toNumOrNull(rec.overall_correct),
           toNumOrNull(rec.overall_wrong),
           toNumOrNull(rec.overall_unanswered),
           toNumOrNull(rec.total_questions),
           typeof rec.subjects === 'string' ? rec.subjects : JSON.stringify(rec.subjects || []),
           typeof rec.categories === 'string' ? rec.categories : JSON.stringify(rec.categories || []),
           typeof rec.answers === 'string' ? rec.answers : JSON.stringify(rec.answers || [])
        );
        saved.push(res.lastInsertRowid);
      }
    });

    return { ok: true, count: saved.length, ids: saved };
  });

  // ---------- تطبیق با نام و نام خانوادگی (وقتی کد ملی نیست یا پیدا نشد) ----------
  // یکسان‌سازی ی/ک عربی، حذف اعراب، نیم‌فاصله و علائم. دو کلید ساخته می‌شود:
  //  - اجزای نام مرتب‌شده (ترتیب «نام / نام‌خانوادگی» مهم نیست)
  //  - نام چسبیده (فاصله و نیم‌فاصله مهم نیست: «حسن زاده» = «حسن‌زاده» = «حسنزاده»)
  const nameClean = (s) => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').toLowerCase();
  const nameTokens = (s) => nameClean(s).split(/[\s\u200c\u200d]+/).map((t) => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const nameKeys = (s) => { const t = nameTokens(s); return t.length ? [`s:${[...t].sort().join('|')}`, `j:${t.join('')}`] : []; };
  const BARPA_GRADES = { 'چهارم': 4, 'پنجم': 5, 'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9 };
  const buildNameIndex = (centerId) => {
    const idx = new Map();
    for (const st of all(`SELECT u.id, u.full_name, s.grade FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.active=1`, centerId)) {
      for (const k of nameKeys(st.full_name)) { const a = idx.get(k) || []; if (!a.some((x) => x.id === st.id)) a.push(st); idx.set(k, a); }
    }
    return idx;
  };
  // فقط وقتی دقیقاً یک دانش‌آموز مطابقت داشته باشد برمی‌گرداند. در هم‌نام بودن، پایه آزمون تعیین‌کننده است؛
  // اگر باز هم یکتا نشد، رکورد «تطبیق‌نشده» می‌ماند تا مدیر دستی تعیین کند (جلوگیری از ثبت نتیجه برای فرد اشتباه).
  const findByName = (idx, fullName, gradeWord) => {
    for (const k of nameKeys(fullName)) {
      let c = idx.get(k) || [];
      if (c.length > 1 && BARPA_GRADES[gradeWord]) c = c.filter((x) => x.grade === BARPA_GRADES[gradeWord]);
      if (c.length === 1) return c[0];
    }
    return null;
  };

  // ---------- آپلود PDF و تفکیک خودکار کارنامه آزمون جامع برپا ----------
  const handleBarpaUpload = async (ctx) => {
    const b = ctx.body || {};
    const centerId = ctx.user.role === 'admin' ? (Number(b.center_id) || ctx.user.center_id) : ctx.user.center_id;
    if (!centerId) fail(400, 'شناسه کانون الزامی است');

    if (!b.file || !b.file.data) {
      fail(400, 'فایل آزمون برپا ارسال نشده است');
    }

    const fileName = saveUpload(b.file, 50);
    const pdfPath = path.join(UPLOAD_DIR, fileName);

    const scriptPath = path.join(ROOT, 'scripts', 'parse_barpa_pdf.py');
    const records = await parseBarpaPdfFile(scriptPath, pdfPath);

    const grade = clampStr(b.grade, 20) || 'نهم';
    const stage = b.stage ? String(b.stage).trim() : '';
    const examTitle = clampStr(b.exam_title, 120) || (stage ? `مرحله ${stage} برپا | پایه ${grade}` : `آزمون برپا | پایه ${grade}`);
    let examId = clampStr(b.exam_id, 80);
    if (!examId) {
      const cleanTitle = examTitle.replace(/[^\w\u0600-\u06FF]+/g, '_').replace(/^_+|_+$/g, '');
      const sPart = stage ? `_stage${stage}` : '';
      examId = `barpa_${grade}${sPart}_${cleanTitle}`;
    }

    const imported = [];
    const unmatched = [];
    const nameIdx = buildNameIndex(centerId);

    tx(() => {
      // پاکسازی رکوردهای تطبیق‌نشده قبلی برای همین آزمون و کانون جهت جلوگیری از تکرار هنگام آپلود دوباره
      run('DELETE FROM barpa_unmatched WHERE center_id=? AND exam_id=?', centerId, examId);

      for (const item of records) {
        const candidateCode = toEnDigits(String(item.candidate_code || '')).trim();
        const fullName = clampStr(item.full_name, 80);
        const schoolName = clampStr(item.school_name, 100) || null;
        const total = item.total_summary || {};
        const payloadJson = JSON.stringify(item);

        // اول با کد ملی/نام کاربری، اگر نبود یا پیدا نشد با نام و نام خانوادگی
        let stu = candidateCode ? get("SELECT u.id, u.full_name FROM users u WHERE u.role='student' AND u.center_id=? AND (u.national_code=? OR u.username=?)", centerId, candidateCode, candidateCode) : null;
        let matchedBy = stu ? 'code' : null;
        if (!stu) { stu = findByName(nameIdx, fullName, grade); if (stu) matchedBy = 'name'; }

        if (!stu) {
          const res = run(`
            INSERT INTO barpa_unmatched (exam_id, center_id, candidate_code, full_name, school_name, page, payload_json, created_at)
            VALUES (?,?,?,?,?,?,?,?)
          `, examId, centerId, candidateCode || null, fullName || null, schoolName, item.page || null, payloadJson, Date.now());
          unmatched.push({ id: res.lastInsertRowid, candidate_code: candidateCode || null, full_name: fullName, school_name: schoolName, page: item.page });
          continue;
        }

        run(`
          INSERT INTO comprehensive_exam_reports (
            center_id, exam_id, exam_title, grade, student_id, candidate_code,
            student_name, school_name, total_attendees, overall_traz, overall_rank_all,
            overall_rank_center, overall_percentage, overall_correct, overall_wrong,
            overall_unanswered, total_questions, subjects_json, categories_json, answers_json
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(exam_id, student_id) DO UPDATE SET
            candidate_code = excluded.candidate_code,
            student_name = excluded.student_name,
            school_name = excluded.school_name,
            total_attendees = excluded.total_attendees,
            overall_traz = excluded.overall_traz,
            overall_rank_all = excluded.overall_rank_all,
            overall_rank_center = excluded.overall_rank_center,
            overall_percentage = excluded.overall_percentage,
            overall_correct = excluded.overall_correct,
            overall_wrong = excluded.overall_wrong,
            overall_unanswered = excluded.overall_unanswered,
            total_questions = excluded.total_questions,
            subjects_json = excluded.subjects_json,
            categories_json = excluded.categories_json,
            answers_json = excluded.answers_json
        `,
          centerId,
          examId,
          item.exam_title || examTitle,
          grade,
          stu.id,
          candidateCode || `STU_${stu.id}`,
          fullName || stu.full_name,
          schoolName,
          toNumOrNull(item.total_attendees),
          toNumOrNull(total.traz),
          toNumOrNull(total.rank_all),
          toNumOrNull(total.rank_center),
          toNumOrNull(total.percentage),
          toNumOrNull(total.correct),
          toNumOrNull(total.wrong),
          toNumOrNull(total.unanswered),
          item.answers?.length ? item.answers.length : null,
          JSON.stringify(item.subjects || []),
          JSON.stringify(item.categories || []),
          JSON.stringify(item.answers || [])
        );

        imported.push({
          student_id: stu.id,
          full_name: fullName || stu.full_name,
          candidate_code: candidateCode || null,
          matched_by: matchedBy,
          traz: toNumOrNull(total.traz),
          rank: toNumOrNull(total.rank_all)
        });
      }
    });

    return {
      ok: true,
      success: true,
      exam_id: examId,
      exam_title: examTitle,
      count: imported.length,
      matched_by_name: imported.filter((x) => x.matched_by === 'name').length,
      unmatched_count: unmatched.length,
      students: imported,
      unmatched
    };
  };

  r.post('/api/manager/barpa-exams/upload', { roles: ['manager', 'admin'] }, handleBarpaUpload);

  // ---------- مدیریت رکوردهای تطبیق‌نشده آزمون برپا ----------
  r.get('/api/manager/barpa-exams/unmatched', M, (ctx) => {
    const examId = ctx.query.exam_id;
    if (examId) {
      return all('SELECT id, exam_id, center_id, candidate_code, full_name, school_name, page, created_at FROM barpa_unmatched WHERE center_id=? AND exam_id=? ORDER BY id ASC', ctx.user.center_id, examId);
    }
    return all('SELECT id, exam_id, center_id, candidate_code, full_name, school_name, page, created_at FROM barpa_unmatched WHERE center_id=? ORDER BY id DESC', ctx.user.center_id);
  });

  r.post('/api/manager/barpa-exams/unmatched/:id/match', M, (ctx) => {
    const id = Number(ctx.params.id);
    const row = get('SELECT * FROM barpa_unmatched WHERE id=? AND center_id=?', id, ctx.user.center_id);
    if (!row) fail(404, 'رکورد تطبیق‌نشده یافت نشد');

    const studentId = Number(ctx.body?.student_id);
    if (!studentId) fail(400, 'شناسه دانش‌آموز الزامی است');
    const stu = get("SELECT u.id, u.full_name, s.school FROM users u LEFT JOIN students s ON s.user_id=u.id WHERE u.id=? AND u.center_id=? AND u.role='student'", studentId, ctx.user.center_id);
    if (!stu) fail(404, 'دانش‌آموز در این کانون یافت نشد');

    let item = {};
    try {
      item = JSON.parse(row.payload_json || '{}');
    } catch {}

    const total = item.total_summary || {};
    const examTitle = item.exam_title || `آزمون برپا`;
    const grade = item.grade || 'نهم';

    tx(() => {
      run(`
        INSERT INTO comprehensive_exam_reports (
          center_id, exam_id, exam_title, grade, student_id, candidate_code,
          student_name, school_name, total_attendees, overall_traz, overall_rank_all,
          overall_rank_center, overall_percentage, overall_correct, overall_wrong,
          overall_unanswered, total_questions, subjects_json, categories_json, answers_json
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(exam_id, student_id) DO UPDATE SET
          candidate_code = excluded.candidate_code,
          student_name = excluded.student_name,
          school_name = excluded.school_name,
          total_attendees = excluded.total_attendees,
          overall_traz = excluded.overall_traz,
          overall_rank_all = excluded.overall_rank_all,
          overall_rank_center = excluded.overall_rank_center,
          overall_percentage = excluded.overall_percentage,
          overall_correct = excluded.overall_correct,
          overall_wrong = excluded.overall_wrong,
          overall_unanswered = excluded.overall_unanswered,
          total_questions = excluded.total_questions,
          subjects_json = excluded.subjects_json,
          categories_json = excluded.categories_json,
          answers_json = excluded.answers_json
      `,
        row.center_id,
        row.exam_id,
        examTitle,
        grade,
        stu.id,
        row.candidate_code || `STU_${stu.id}`,
        row.full_name || stu.full_name,
        row.school_name || stu.school || null,
        toNumOrNull(item.total_attendees),
        toNumOrNull(total.traz),
        toNumOrNull(total.rank_all),
        toNumOrNull(total.rank_center),
        toNumOrNull(total.percentage),
        toNumOrNull(total.correct),
        toNumOrNull(total.wrong),
        toNumOrNull(total.unanswered),
        item.answers?.length ? item.answers.length : null,
        JSON.stringify(item.subjects || []),
        JSON.stringify(item.categories || []),
        JSON.stringify(item.answers || [])
      );

      run('DELETE FROM barpa_unmatched WHERE id=?', row.id);
    });

    return { ok: true, matched: true, student_id: stu.id, student_name: stu.full_name };
  });

  // فهرست آزمون‌های برپای ثبت‌شده در کانون (برای حذف و آپلود دوباره)
  r.get('/api/manager/barpa-exams', M, (ctx) => all(`SELECT exam_id, MAX(exam_title) exam_title, MAX(grade) grade, COUNT(*) reports, MAX(created_at) created_at,
      (SELECT COUNT(*) FROM barpa_unmatched b WHERE b.center_id=r.center_id AND b.exam_id=r.exam_id) unmatched
    FROM comprehensive_exam_reports r WHERE r.center_id=? GROUP BY r.exam_id ORDER BY MAX(r.id) DESC`, ctx.user.center_id));
  // حذف همه کارنامه‌ها و رکوردهای تطبیق‌نشده یک آزمون (سپس می‌توان فایل را دوباره آپلود کرد)
  r.del('/api/manager/barpa-exams', M, (ctx) => {
    const examId = clampStr(ctx.query.exam_id, 200), cid = ctx.user.center_id;
    if (!examId) fail(400, 'شناسه آزمون لازم است');
    return tx(() => {
      const reports = run('DELETE FROM comprehensive_exam_reports WHERE center_id=? AND exam_id=?', cid, examId).changes;
      const unmatched = run('DELETE FROM barpa_unmatched WHERE center_id=? AND exam_id=?', cid, examId).changes;
      if (!reports && !unmatched) fail(404, 'آزمونی با این شناسه یافت نشد');
      return { ok: true, deleted_reports: Number(reports), deleted_unmatched: Number(unmatched) };
    });
  });
  // حذف یک کارنامه یا یک رکورد تطبیق‌نشده
  r.del('/api/manager/barpa-exams/reports/:id', M, (ctx) => {
    if (!run('DELETE FROM comprehensive_exam_reports WHERE id=? AND center_id=?', Number(ctx.params.id), ctx.user.center_id).changes) fail(404, 'کارنامه یافت نشد');
    return { ok: true };
  });
  r.del('/api/manager/barpa-exams/unmatched/:id', M, (ctx) => {
    if (!run('DELETE FROM barpa_unmatched WHERE id=? AND center_id=?', Number(ctx.params.id), ctx.user.center_id).changes) fail(404, 'رکورد یافت نشد');
    return { ok: true };
  });

  r.post('/api/manager/barpa-exams/upload', { roles: ['manager', 'admin'] }, handleBarpaUpload);
}
