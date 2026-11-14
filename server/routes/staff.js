// ارزیابی عملکرد کارکنان (فقط مدیر کانون): معلم و مشاور.
// - شاخص‌های «اندازه‌گیری‌شده» فقط از داده‌های واقعی ثبت‌شده محاسبه می‌شوند؛ شاخص بدون داده «نامشخص» می‌ماند (نه صفر).
// - «بازخورد مدیر» ذهنی است و جدا نمایش داده می‌شود.
// - وزن‌ها شفاف و قابل تنظیم‌اند؛ روند نمرهٔ دانش‌آموزان فقط «زمینه» است و به‌طور پیش‌فرض وزن صفر دارد
//   (کیفیت کار کارکنان با نمرهٔ خام دانش‌آموز یکی دانسته نمی‌شود).
import { all, get, run, tx, audit } from '../db.js';
import { fail, clampStr, toEnDigits, ymd, addDays, faWeekday } from '../util.js';

const M = { roles: ['manager'] };
export const INDICATORS = {
  teacher: [
    { key: 'results_timeliness', label: 'انتشار به‌موقع کارنامه (≤ ۷ روز پس از پایان آزمون)', kind: 'measured' },
    { key: 'exam_participation', label: 'مشارکت دانش‌آموزان در آزمون‌های منتشرشده', kind: 'measured' },
    { key: 'attendance_recording', label: 'ثبت حضور و غیاب در جلسات برنامهٔ هفتگی', kind: 'measured' },
    { key: 'assessment_activity', label: 'تعداد آزمون رسمی منتشرشده نسبت به هدف', kind: 'measured' },
    { key: 'bank_contribution', label: 'سؤال منتشرشده در بانک نسبت به هدف', kind: 'measured' },
    { key: 'student_trend', label: 'روند میانگین آزمون کلاس‌ها (زمینه)', kind: 'context' },
    { key: 'feedback', label: 'بازخورد مدیر', kind: 'subjective' },
  ],
  counselor: [
    { key: 'plan_coverage', label: 'پوشش برنامهٔ مطالعاتی دانش‌آموزان تخصیص‌یافته', kind: 'measured' },
    { key: 'followup_completion', label: 'انجام فعالیت‌های برنامه (پیگیری)', kind: 'measured' },
    { key: 'sessions_completion', label: 'برگزاری جلسات زمان‌بندی‌شده', kind: 'measured' },
    { key: 'intervention_timeliness', label: 'پیگیری به‌موقع دانش‌آموزان نیازمند توجه (≤ ۱۴ روز)', kind: 'measured' },
    { key: 'student_trend', label: 'روند میانگین آزمون دانش‌آموزان (زمینه)', kind: 'context' },
    { key: 'feedback', label: 'بازخورد مدیر', kind: 'subjective' },
  ],
};
export const DEFAULTS = {
  teacher: { weights: { results_timeliness: 25, exam_participation: 20, attendance_recording: 20, assessment_activity: 15, bank_contribution: 0, student_trend: 0, feedback: 20 }, targets: { exams_per_month: 2, bank_per_month: 10 } },
  counselor: { weights: { plan_coverage: 25, followup_completion: 20, sessions_completion: 20, intervention_timeliness: 15, student_trend: 0, feedback: 20 }, targets: {} },
};

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 10) / 10 : null);
const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && Number.isFinite(Date.parse(s));
function period(q) {
  const to = dateOk(q.to) ? q.to : ymd(), from = dateOk(q.from) ? q.from : addDays(to, -29);
  if (from > to) fail(400, 'بازهٔ زمانی نامعتبر است');
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  if (days > 400) fail(400, 'بازهٔ زمانی حداکثر ۴۰۰ روز است');
  return { from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}
function settings(cid, role) {
  const row = get('SELECT weights_json FROM staff_eval_settings WHERE center_id=? AND role=?', cid, role);
  const saved = row ? JSON.parse(row.weights_json) : {};
  return { weights: { ...DEFAULTS[role].weights, ...(saved.weights || {}) }, targets: { ...DEFAULTS[role].targets, ...(saved.targets || {}) } };
}
const end = (to) => `${to} 23:59:59`;

function feedbackOf(staffId, p) {
  const rows = all('SELECT rating FROM staff_feedback WHERE staff_id=? AND period_end>=? AND period_start<=?', staffId, p.from, p.to);
  return rows.length ? { value: Math.round(((avg(rows.map((r) => r.rating)) - 1) / 4) * 1000) / 10, detail: `میانگین ${avg(rows.map((r) => r.rating))} از ۵ (${rows.length} بازخورد)`, n: rows.length } : { value: null, detail: 'بازخوردی ثبت نشده', n: 0 };
}

function teacherIndicators(cid, t, p, s, classFilter) {
  const ex = all(`SELECT e.*, (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id=e.id) n_results FROM exams e WHERE e.created_by=? AND e.center_id=? AND e.kind IN ('online','paper')
    AND e.published_at IS NOT NULL AND date(e.published_at) BETWEEN ? AND ? ${classFilter ? 'AND (e.class_id=? OR e.class_id IS NULL)' : ''}`, t.id, cid, p.from, p.to, ...(classFilter ? [classFilter] : []));
  const ended = ex.filter((e) => e.status === 'results_released' || e.status === 'completed' || (e.ends_at && Date.parse(e.ends_at) < Date.now()));
  const onTime = ended.filter((e) => e.results_released_at && Date.parse(e.results_released_at.replace(' ', 'T') + 'Z') - Date.parse(e.ends_at || e.published_at.replace(' ', 'T') + 'Z') <= 7 * 864e5);
  let eligible = 0, took = 0;
  for (const e of ex) {
    const n = get(`SELECT COUNT(*) n FROM students s JOIN users u ON u.id=s.user_id WHERE u.center_id=? AND u.active=1 AND s.grade=? ${e.class_id ? 'AND s.class_id=?' : ''}`, cid, e.grade, ...(e.class_id ? [e.class_id] : [])).n;
    eligible += n; took += Math.min(n, e.n_results);
  }
  // جلسات مورد انتظار: هر ردیف برنامهٔ هفتگی معلم در هر روز هفتهٔ متناظر در بازه؛ ثبت‌شده: حضور با همان کلاس و تاریخ
  const sched = all(`SELECT class_id, weekday FROM schedule WHERE teacher_id=? AND COALESCE(kind,'academic')='academic' ${classFilter ? 'AND class_id=?' : ''}`, t.id, ...(classFilter ? [classFilter] : []));
  let expected = 0, recorded = 0;
  if (sched.length) {
    const marked = new Set(all('SELECT DISTINCT class_id || \':\' || date k FROM attendance WHERE date BETWEEN ? AND ?', p.from, p.to > ymd() ? ymd() : p.to).map((x) => x.k));
    for (let d = p.from; d <= p.to && d <= ymd(); d = addDays(d, 1)) {
      const wd = faWeekday(d);
      for (const sc of sched.filter((x) => x.weekday === wd)) { expected++; if (marked.has(`${sc.class_id}:${d}`)) recorded++; }
    }
  }
  const months = p.days / 30;
  const bank = get(`SELECT COUNT(*) n FROM question_bank WHERE created_by=? AND center_id=? AND status='published' AND date(COALESCE(reviewed_at, created_at)) BETWEEN ? AND ?`, t.id, cid, p.from, p.to).n;
  const meanOf = (from, to) => avg(all(`SELECT r.percent FROM exam_results r JOIN exams e ON e.id=r.exam_id WHERE e.created_by=? AND date(r.created_at) BETWEEN ? AND ?`, t.id, from, to).map((r) => r.percent));
  const cur = meanOf(p.from, p.to), prev = meanOf(p.prevFrom, p.prevTo);
  return {
    results_timeliness: ended.length ? { value: pct(onTime.length, ended.length), detail: `${onTime.length} از ${ended.length} آزمون پایان‌یافته`, n: ended.length } : { value: null, detail: 'آزمون پایان‌یافته‌ای در بازه نیست', n: 0 },
    exam_participation: eligible ? { value: pct(took, eligible), detail: `${took} از ${eligible} شرکت مورد انتظار`, n: ex.length } : { value: null, detail: 'آزمون منتشرشده‌ای در بازه نیست', n: 0 },
    attendance_recording: expected ? { value: pct(recorded, expected), detail: `${recorded} از ${expected} جلسهٔ برنامه`, n: expected } : { value: null, detail: 'برنامهٔ هفتگی برای این معلم ثبت نشده', n: 0 },
    assessment_activity: { value: Math.min(100, pct(ex.length, Math.max(1, s.targets.exams_per_month * months)) ?? 0), detail: `${ex.length} آزمون (هدف ${Math.round(s.targets.exams_per_month * months * 10) / 10})`, n: ex.length },
    bank_contribution: { value: Math.min(100, pct(bank, Math.max(1, s.targets.bank_per_month * months)) ?? 0), detail: `${bank} سؤال منتشرشده (هدف ${Math.round(s.targets.bank_per_month * months * 10) / 10})`, n: bank },
    student_trend: cur != null && prev != null ? { value: Math.max(0, Math.min(100, 50 + (cur - prev))), detail: `میانگین ${cur}٪ در برابر ${prev}٪ دورهٔ قبل`, n: 1 } : { value: null, detail: 'دادهٔ کافی برای مقایسهٔ دو دوره نیست', n: 0 },
  };
}

function counselorIndicators(cid, c, p, classFilter) {
  const students = all(`SELECT u.id FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.active=1
    AND s.class_id IN (SELECT class_id FROM counselor_classes WHERE counselor_id=?) ${classFilter ? 'AND s.class_id=?' : ''}`, cid, c.id, ...(classFilter ? [classFilter] : [])).map((x) => x.id);
  if (!students.length) return Object.fromEntries(['plan_coverage', 'followup_completion', 'sessions_completion', 'intervention_timeliness', 'student_trend'].map((k) => [k, { value: null, detail: 'دانش‌آموزی به این مشاور تخصیص نیافته', n: 0 }]));
  const ids = students.map(() => '?').join(',');
  const plans = all(`SELECT student_id, tasks_json FROM counselor_plans WHERE student_id IN (${ids}) AND counselor_id=? AND week_start BETWEEN ? AND ?`, ...students, c.id, addDays(p.from, -6), p.to);
  const tasks = plans.flatMap((x) => JSON.parse(x.tasks_json || '[]'));
  const sessions = all(`SELECT status, starts_at FROM counselor_sessions WHERE counselor_id=? AND student_id IN (${ids}) AND date(starts_at) BETWEEN ? AND ?`, c.id, ...students, p.from, p.to);
  const due = sessions.filter((x) => Date.parse(x.starts_at) < Date.now() && x.status !== 'requested');
  // نیازمند توجه: آخرین نتیجهٔ آزمون منتشرشده زیر ۵۰٪
  const needy = students.filter((sid) => { const r = get(`SELECT r.percent FROM exam_results r JOIN exams e ON e.id=r.exam_id WHERE r.student_id=? AND e.results_released_at IS NOT NULL ORDER BY r.created_at DESC LIMIT 1`, sid); return r && r.percent < 50; });
  const since = addDays(p.to, -14);
  const touched = needy.filter((sid) => get(`SELECT 1 x FROM counselor_notes WHERE counselor_id=? AND student_id=? AND date(created_at) BETWEEN ? AND ?
    UNION ALL SELECT 1 FROM counselor_sessions WHERE counselor_id=? AND student_id=? AND date(starts_at) BETWEEN ? AND ? LIMIT 1`, c.id, sid, since, p.to, c.id, sid, since, p.to));
  const meanOf = (from, to) => avg(all(`SELECT r.percent FROM exam_results r JOIN exams e ON e.id=r.exam_id WHERE r.student_id IN (${ids}) AND e.results_released_at IS NOT NULL AND date(r.created_at) BETWEEN ? AND ?`, ...students, from, to).map((r) => r.percent));
  const cur = meanOf(p.from, p.to), prev = meanOf(p.prevFrom, p.prevTo);
  return {
    plan_coverage: { value: pct(new Set(plans.map((x) => x.student_id)).size, students.length), detail: `${new Set(plans.map((x) => x.student_id)).size} از ${students.length} دانش‌آموز`, n: students.length },
    followup_completion: tasks.length ? { value: pct(tasks.filter((x) => x.done).length, tasks.length), detail: `${tasks.filter((x) => x.done).length} از ${tasks.length} فعالیت`, n: tasks.length } : { value: null, detail: 'فعالیت برنامه‌ای در بازه نیست', n: 0 },
    sessions_completion: due.length ? { value: pct(due.filter((x) => x.status === 'completed').length, due.length), detail: `${due.filter((x) => x.status === 'completed').length} از ${due.length} جلسهٔ سررسیده`, n: due.length } : { value: null, detail: 'جلسهٔ سررسیده‌ای در بازه نیست', n: 0 },
    intervention_timeliness: needy.length ? { value: pct(touched.length, needy.length), detail: `${touched.length} از ${needy.length} دانش‌آموز زیر ۵۰٪`, n: needy.length } : { value: null, detail: 'دانش‌آموز نیازمند پیگیری نیست', n: 0 },
    student_trend: cur != null && prev != null ? { value: Math.max(0, Math.min(100, 50 + (cur - prev))), detail: `میانگین ${cur}٪ در برابر ${prev}٪ دورهٔ قبل`, n: 1 } : { value: null, detail: 'دادهٔ کافی برای مقایسهٔ دو دوره نیست', n: 0 },
  };
}

// امتیاز کل: میانگین وزنی شاخص‌های دارای داده؛ وزن شاخص‌های بدون داده حذف و بقیه دوباره نرمال می‌شوند.
export function score(indicators, weights) {
  let w = 0, sum = 0, total = 0;
  for (const [k, wt] of Object.entries(weights)) { if (!wt) continue; total += wt; const v = indicators[k]?.value; if (v == null) continue; w += wt; sum += wt * v; }
  return { score: w ? Math.round((sum / w) * 10) / 10 : null, coverage: total ? Math.round((w / total) * 100) : 0 };
}

function evaluate(ctx, role, staffId = null) {
  const cid = ctx.user.center_id, p = period(ctx.query), s = settings(cid, role);
  const classFilter = Number(ctx.query.class_id) || null;
  if (classFilter && !get('SELECT id FROM classes WHERE id=? AND center_id=?', classFilter, cid)) fail(404, 'کلاس یافت نشد');
  const staff = all(`SELECT id, full_name, active FROM users WHERE center_id=? AND role=? ${staffId ? 'AND id=?' : ''} ORDER BY full_name`, cid, role, ...(staffId ? [staffId] : []));
  if (staffId && !staff.length) fail(404, 'یافت نشد');
  return { role, period: p, weights: s.weights, targets: s.targets, indicators: INDICATORS[role], staff: staff.map((u) => {
    const ind = { ...(role === 'teacher' ? teacherIndicators(cid, u, p, s, classFilter) : counselorIndicators(cid, u, p, classFilter)), feedback: feedbackOf(u.id, p) };
    return { ...u, indicators: ind, ...score(ind, s.weights) };
  }) };
}

export default function register(r) {
  r.get('/api/manager/staff-eval', M, (ctx) => {
    const role = ctx.query.role === 'counselor' ? 'counselor' : 'teacher';
    return evaluate(ctx, role);
  });
  r.get('/api/manager/staff-eval/:id', M, (ctx) => {
    const u = get("SELECT id, role FROM users WHERE id=? AND center_id=? AND role IN ('teacher','counselor')", Number(ctx.params.id), ctx.user.center_id) || fail(404, 'یافت نشد');
    const out = evaluate(ctx, u.role, u.id), p = out.period;
    const drill = u.role === 'teacher'
      ? { exams: all(`SELECT e.id, e.title, e.status, e.published_at, e.ends_at, e.results_released_at, c.name class_name, (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id=e.id) results, (SELECT ROUND(AVG(percent),1) FROM exam_results r WHERE r.exam_id=e.id) avg
          FROM exams e LEFT JOIN classes c ON c.id=e.class_id WHERE e.created_by=? AND e.center_id=? AND date(COALESCE(e.published_at, e.created_at)) BETWEEN ? AND ? ORDER BY e.id DESC`, u.id, ctx.user.center_id, p.from, p.to) }
      : { sessions: all(`SELECT cs.title, cs.status, cs.starts_at, st.full_name FROM counselor_sessions cs JOIN users st ON st.id=cs.student_id WHERE cs.counselor_id=? AND date(cs.starts_at) BETWEEN ? AND ? ORDER BY cs.starts_at DESC LIMIT 100`, u.id, p.from, p.to),
          classes: all('SELECT c.id, c.name, c.grade FROM counselor_classes cc JOIN classes c ON c.id=cc.class_id WHERE cc.counselor_id=?', u.id) };
    const feedback = all(`SELECT f.id, f.rating, f.comment, f.period_start, f.period_end, f.created_at, m.full_name manager FROM staff_feedback f LEFT JOIN users m ON m.id=f.manager_id WHERE f.staff_id=? ORDER BY f.id DESC LIMIT 50`, u.id);
    return { ...out.staff[0], role: u.role, period: p, weights: out.weights, indicators_meta: out.indicators, drill, feedback };
  });
  r.post('/api/manager/staff-eval/:id/feedback', M, (ctx) => {
    const u = get("SELECT id FROM users WHERE id=? AND center_id=? AND role IN ('teacher','counselor')", Number(ctx.params.id), ctx.user.center_id) || fail(404, 'یافت نشد');
    const rating = Number(toEnDigits(String(ctx.body.rating ?? '')));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'امتیاز باید عدد صحیح ۱ تا ۵ باشد');
    const p = period({ from: ctx.body.period_start, to: ctx.body.period_end });
    const comment = clampStr(ctx.body.comment, 1000);
    const id = Number(run('INSERT INTO staff_feedback(center_id,staff_id,manager_id,period_start,period_end,rating,comment) VALUES (?,?,?,?,?,?,?)', ctx.user.center_id, u.id, ctx.user.id, p.from, p.to, rating, comment || null).lastInsertRowid);
    audit(ctx.user.center_id, ctx.user.id, 'staff.feedback', 'user', u.id, { rating, period: [p.from, p.to] });
    return { ok: true, id };
  });
  r.put('/api/manager/staff-eval/settings', M, (ctx) => {
    const role = ['teacher', 'counselor'].includes(ctx.body.role) ? ctx.body.role : fail(400, 'نقش نامعتبر است');
    const w = ctx.body.weights || {}, weights = {};
    for (const k of Object.keys(DEFAULTS[role].weights)) {
      const v = w[k] == null ? DEFAULTS[role].weights[k] : Number(toEnDigits(String(w[k])));
      if (!Number.isInteger(v) || v < 0 || v > 100) fail(400, 'وزن هر شاخص باید عدد صحیح ۰ تا ۱۰۰ باشد');
      weights[k] = v;
    }
    if (!Object.values(weights).some((v) => v > 0)) fail(400, 'حداقل یک شاخص باید وزن داشته باشد');
    const targets = {};
    for (const k of Object.keys(DEFAULTS[role].targets)) {
      const v = ctx.body.targets?.[k] == null ? DEFAULTS[role].targets[k] : Number(toEnDigits(String(ctx.body.targets[k])));
      if (!(v > 0 && v <= 1000)) fail(400, 'هدف‌ها باید عدد مثبت باشند');
      targets[k] = v;
    }
    tx(() => {
      run(`INSERT INTO staff_eval_settings(center_id,role,weights_json,updated_by) VALUES (?,?,?,?) ON CONFLICT(center_id,role) DO UPDATE SET weights_json=excluded.weights_json, updated_by=excluded.updated_by, updated_at=datetime('now')`,
        ctx.user.center_id, role, JSON.stringify({ weights, targets }), ctx.user.id);
      audit(ctx.user.center_id, ctx.user.id, 'staff.weights', 'center', ctx.user.center_id, { role, weights, targets });
    });
    return { ok: true, weights, targets };
  });
}
