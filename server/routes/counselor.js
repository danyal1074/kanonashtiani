// Independent counselor panel. Every read/write is scoped to an active student
// in the signed-in counselor's center whose class is assigned to that counselor
// (counselor_classes); meetings and private notes also to their author.
import { all, get, run, tx, audit } from '../db.js';
import { fail, clampStr, toEnDigits, normalizeIranianMobile, hashPasswordAsync, ymd, addDays } from '../util.js';

const C = { roles: ['counselor'] };
const M = { roles: ['manager', 'admin'] };
const avg = (values) => values.length ? Math.round(values.reduce((n, x) => n + x, 0) / values.length * 10) / 10 : null;
const count = (rows) => rows.length;
const safeJson = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
function daysOf(q) {
  const days = Number(q.days ?? ({ today: 1, week: 7, month: 30 }[q.range]) ?? 7);
  if (![1, 7, 30, 90].includes(days)) fail(400, 'بازه زمانی نامعتبر است');
  return days;
}
// SQL condition limiting a students/users join (aliases u, s) to the counselor's assigned classes.
export const ASSIGNED = `s.class_id IN (SELECT cc.class_id FROM counselor_classes cc JOIN classes ac ON ac.id=cc.class_id WHERE cc.counselor_id=? AND ac.center_id=u.center_id)`;
function ownStudent(ctx, id) {
  const student = get(`SELECT u.id,u.full_name,u.mobile,s.grade,s.class_id,s.avatar,s.school,c.name class_name
    FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id
    WHERE u.id=? AND u.center_id=? AND u.role='student' AND u.active=1 AND ${ASSIGNED}`, Number(id), ctx.user.center_id, ctx.user.id);
  if (!student) fail(404, 'دانش‌آموز یافت نشد');
  return student;
}
function dateOnly(value, label = 'تاریخ') {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) fail(400, `${label} معتبر نیست`);
  return s;
}
export function counselorSessionStart(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) || !Number.isFinite(Date.parse(s))) fail(400, 'تاریخ و ساعت جلسه معتبر نیست');
  dateOnly(s.slice(0,10));
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(s)) fail(400, 'منطقه زمانی جلسه را مشخص کنید');
  return new Date(s).toISOString();
}
function examRows(ctx) {
  const cid = ctx.user.center_id, me = ctx.user.id;
  return all(`SELECT er.id,er.student_id,e.id exam_id,e.title,e.kind,COALESCE(e.subject,'عمومی') subject,er.percent,COALESCE(e.exam_date,er.created_at) date,'native' source
    FROM exam_results er JOIN exams e ON e.id=er.exam_id JOIN users u ON u.id=er.student_id JOIN students s ON s.user_id=u.id
    WHERE u.center_id=? AND e.center_id=? AND u.role='student' AND u.active=1 AND ${ASSIGNED}
    UNION ALL
    SELECT -r.id,r.student_id,r.exam_id,r.exam_title,'comprehensive','جامع',r.overall_percentage,r.created_at,'barpa'
    FROM comprehensive_exam_reports r JOIN users u ON u.id=r.student_id JOIN students s ON s.user_id=u.id
    WHERE u.center_id=? AND r.center_id=? AND u.role='student' AND u.active=1 AND ${ASSIGNED} ORDER BY date`, cid, cid, me, cid, cid, me);
}
function aggregateExams(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.source}:${row.kind}:${row.exam_id}`;
    if (!groups.has(key)) groups.set(key, { id: row.exam_id, source: row.source, title: row.title, kind: row.kind, subject: row.subject, date: row.date, results: [] });
    groups.get(key).results.push(row);
  }
  return [...groups.values()].map(({ results, ...exam }) => ({ ...exam, average: avg(results.filter((r) => r.percent != null).map((r) => r.percent)), participants: new Set(results.map((r) => r.student_id)).size }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
function studentRows(ctx) {
  const students = all(`SELECT u.id,u.full_name,s.grade,s.class_id,s.avatar,c.name class_name FROM users u
    JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id
    WHERE u.center_id=? AND u.role='student' AND u.active=1 AND ${ASSIGNED} ORDER BY s.grade,u.full_name`, ctx.user.center_id, ctx.user.id);
  const study = new Map(all(`SELECT p.student_id,COUNT(*) pomodoros FROM pomodoros p JOIN users u ON u.id=p.student_id JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.active=1 AND ${ASSIGNED} GROUP BY p.student_id`, ctx.user.center_id, ctx.user.id).map((x) => [x.student_id, x.pomodoros]));
  const results = examRows(ctx);
  return students.map((student) => {
    const exams = results.filter((e) => e.student_id === student.id && e.percent != null);
    const trend = exams.map((e) => e.percent).slice(-7), last = trend.at(-1), previous = trend.at(-2);
    const exam_average = avg(exams.map((e) => e.percent));
    const status = last == null ? 'attention' : last < 50 ? 'risk' : last < 70 || (previous != null && last - previous < -10) ? 'attention' : last >= 85 ? 'excellent' : 'good';
    return { ...student, pomodoros: study.get(student.id) || 0, exam_average, progress: last ?? null, status, trend, exam_change: last != null && previous != null ? Math.round((last - previous) * 10) / 10 : null };
  });
}
function studyData(ctx) {
  const days = daysOf(ctx.query), end = ymd(), start = addDays(end, 1 - days);
  let where = `u.center_id=? AND u.role='student' AND u.active=1 AND ${ASSIGNED} AND p.date>=? AND p.date<=?`, params = [ctx.user.center_id, ctx.user.id, start, end];
  if (ctx.query.student_id) { ownStudent(ctx, ctx.query.student_id); where += ' AND p.student_id=?'; params.push(Number(ctx.query.student_id)); }
  const rows = all(`SELECT p.* FROM pomodoros p JOIN users u ON u.id=p.student_id JOIN students s ON s.user_id=u.id WHERE ${where} ORDER BY p.date,p.id`, ...params);
  const trend = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i), daily = rows.filter((p) => p.date === date);
    return { date, pomodoros: count(daily), minutes: daily.reduce((sum, p) => sum + p.minutes, 0) };
  });
  const subjects = [...new Set(rows.map((p) => p.subject))].map((subject) => {
    const data = rows.filter((p) => p.subject === subject);
    return { subject, pomodoros: count(data), minutes: data.reduce((sum, p) => sum + p.minutes, 0) };
  });
  const minutes = rows.reduce((sum, p) => sum + p.minutes, 0);
  return { stats: { pomodoros: count(rows), minutes, daily_average: Math.round(minutes / days), active_days: new Set(rows.map((p) => p.date)).size }, trend, subjects, start, end, days };
}
function overallStats(students, study) {
  return { students: students.length, pomodoros: study.stats.pomodoros, minutes: study.stats.minutes, exam_average: avg(students.filter((s) => s.exam_average != null).map((s) => s.exam_average)), progress: avg(students.filter((s) => s.progress != null).map((s) => s.progress)) };
}
function sessionRows(ctx) {
  return all(`SELECT cs.*,u.full_name,s.grade,s.avatar FROM counselor_sessions cs JOIN users u ON u.id=cs.student_id JOIN students s ON s.user_id=u.id
    WHERE cs.counselor_id=? AND u.center_id=? AND u.role='student' AND u.active=1 AND ${ASSIGNED} ORDER BY cs.starts_at`, ctx.user.id, ctx.user.center_id, ctx.user.id);
}
function managementCenter(ctx) {
  const cid = ctx.user.role === 'admin' ? Number(ctx.body.center_id || ctx.query.center_id) : ctx.user.center_id;
  if (!get('SELECT id FROM centers WHERE id=?', cid || -1)) fail(400, 'کانون را انتخاب کنید');
  return cid;
}

export default function register(r) {
  r.get('/api/counselor/students', C, (ctx) => {
    let students = studentRows(ctx);
    if (ctx.query.q) { const q = clampStr(ctx.query.q, 100); students = students.filter((s) => s.full_name.includes(q) || s.class_name?.includes(q)); }
    if (ctx.query.grade) students = students.filter((s) => s.grade === Number(ctx.query.grade));
    if (ctx.query.status && ctx.query.status !== 'all') students = students.filter((s) => s.status === ctx.query.status);
    return students;
  });
  r.get('/api/counselor/dashboard', C, (ctx) => {
    const students = studentRows(ctx), study = studyData(ctx);
    return { stats: overallStats(students, study), students, trend: study.trend, recent_exams: aggregateExams(examRows(ctx)).slice(0, 5), attention: students.filter((s) => ['attention','risk'].includes(s.status)), sessions: sessionRows(ctx).filter((s) => s.status === 'scheduled').slice(0, 5) };
  });
  r.get('/api/counselor/study', C, studyData);
  r.get('/api/counselor/pomodoros', C, studyData);
  r.get('/api/counselor/students/:id', C, (ctx) => {
    const student = ownStudent(ctx, ctx.params.id), summarized = studentRows(ctx).find((s) => s.id === student.id);
    const exams = examRows(ctx).filter((e) => e.student_id === student.id);
    const pomodoros = all('SELECT id,subject,minutes,date FROM pomodoros WHERE student_id=? ORDER BY date DESC,id DESC', student.id);
    const active_days = new Set(pomodoros.map((p) => p.date)).size;
    const subjects = [...new Set(exams.map((e) => e.subject))].map((subject) => ({ subject, average: avg(exams.filter((e) => e.subject === subject && e.percent != null).map((e) => e.percent)) }));
    const ranked = studentRows(ctx).filter((s) => s.grade === student.grade && s.exam_average != null).sort((a, b) => b.exam_average - a.exam_average);
    return { student: { ...student, ...summarized }, stats: { pomodoros: count(pomodoros), daily_average: active_days ? Math.round(pomodoros.reduce((n,p) => n+p.minutes,0) / active_days) : 0, active_days, exam_average: summarized.exam_average, progress: summarized.progress, rank: summarized.exam_average == null ? null : ranked.findIndex((s) => s.id === student.id) + 1 },
      trend: exams.filter((e) => e.percent != null).slice(-12).map((e) => ({ date: e.date, percent: e.percent })), subjects, exams: exams.reverse(), pomodoros,
      notes: all(`SELECT n.id,n.body,n.created_at,u.full_name author FROM counselor_notes n LEFT JOIN users u ON u.id=n.counselor_id WHERE n.student_id=? AND n.counselor_id=? ORDER BY n.id DESC`, student.id, ctx.user.id) };
  });
  r.post('/api/counselor/students/:id/notes', C, (ctx) => {
    const student = ownStudent(ctx, ctx.params.id), body = clampStr(ctx.body.body, 3000);
    if (!body) fail(400, 'متن یادداشت را وارد کنید');
    const result = run('INSERT INTO counselor_notes (student_id,counselor_id,body) VALUES (?,?,?)', student.id, ctx.user.id, body);
    return { ok: true, id: Number(result.lastInsertRowid) };
  });
  r.get('/api/counselor/exams', C, (ctx) => {
    let exams = aggregateExams(examRows(ctx));
    if (ctx.query.kind && ctx.query.kind !== 'all') exams = exams.filter((e) => e.kind === ctx.query.kind);
    return exams;
  });
  r.get('/api/counselor/reports', C, (ctx) => {
    const students = studentRows(ctx), study = studyData(ctx);
    const studyByGrade = new Map(all(`SELECT s.grade,COUNT(*) pomodoros FROM pomodoros p JOIN users u ON u.id=p.student_id JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.active=1 AND ${ASSIGNED} AND p.date>=? AND p.date<=? GROUP BY s.grade`, ctx.user.center_id,ctx.user.id,study.start,study.end).map((row) => [row.grade,row.pomodoros]));
    const grades = [...new Set(students.map((s) => s.grade))].map((grade) => {
      const rows = students.filter((s) => s.grade === grade);
      return { grade, students: rows.length, pomodoros: studyByGrade.get(grade) || 0, average: avg(rows.filter((s) => s.exam_average != null).map((s) => s.exam_average)), progress: avg(rows.filter((s) => s.progress != null).map((s) => s.progress)) };
    });
    return { stats: overallStats(students, study), grades, students, trend: study.trend };
  });
  r.get('/api/counselor/plans', C, (ctx) => {
    const params = [ctx.user.center_id, ctx.user.id], filters = ["u.center_id=?", ASSIGNED, "u.active=1", "u.role='student'"];
    if (ctx.query.student_id) { ownStudent(ctx, ctx.query.student_id); filters.push('p.student_id=?'); params.push(Number(ctx.query.student_id)); }
    if (ctx.query.week_start) { filters.push('p.week_start=?'); params.push(dateOnly(ctx.query.week_start)); }
    return all(`SELECT p.*,u.full_name,s.grade FROM counselor_plans p JOIN users u ON u.id=p.student_id JOIN students s ON s.user_id=u.id WHERE ${filters.join(' AND ')} ORDER BY p.week_start DESC,u.full_name`, ...params)
      .map(({ tasks_json, ...plan }) => ({ ...plan, tasks: safeJson(tasks_json) }));
  });
  r.put('/api/counselor/plans/:student_id', C, (ctx) => {
    const student = ownStudent(ctx, ctx.params.student_id), week = dateOnly(ctx.body.week_start, 'شروع هفته');
    if (!Array.isArray(ctx.body.tasks) || ctx.body.tasks.length > 100) fail(400, 'برنامه حداکثر صد فعالیت دارد');
    const tasks = ctx.body.tasks.map((task) => {
      if (!task || !Number.isInteger(task.weekday) || task.weekday < 0 || task.weekday > 6) fail(400, 'روز فعالیت نامعتبر است');
      const title = clampStr(task.title, 200), subject = clampStr(task.subject, 80), target = Number(task.target ?? 1);
      if (!title || !subject || !Number.isInteger(target) || target < 1 || target > 100) fail(400, 'عنوان، درس و هدف صحیح برای فعالیت لازم است');
      if (task.done !== undefined && typeof task.done !== 'boolean') fail(400, 'وضعیت فعالیت نامعتبر است');
      return { weekday: task.weekday, subject, title, target, done: task.done === true };
    });
    run(`INSERT INTO counselor_plans (student_id,counselor_id,week_start,tasks_json) VALUES (?,?,?,?)
      ON CONFLICT(student_id,week_start) DO UPDATE SET counselor_id=excluded.counselor_id,tasks_json=excluded.tasks_json,updated_at=datetime('now')`, student.id, ctx.user.id, week, JSON.stringify(tasks));
    return { ok: true };
  });
  r.get('/api/counselor/sessions', C, sessionRows);
  r.post('/api/counselor/sessions', C, (ctx) => {
    const student = ownStudent(ctx, ctx.body.student_id), title = clampStr(ctx.body.title, 200), start = counselorSessionStart(ctx.body.starts_at);
    if (!title) fail(400, 'عنوان جلسه را وارد کنید');
    const result = run('INSERT INTO counselor_sessions (student_id,counselor_id,title,starts_at,notes) VALUES (?,?,?,?,?)', student.id, ctx.user.id, title, start, clampStr(ctx.body.notes, 3000));
    return { ok: true, id: Number(result.lastInsertRowid) };
  });
  r.put('/api/counselor/sessions/:id', C, (ctx) => {
    const session = sessionRows(ctx).find((s) => s.id === Number(ctx.params.id));
    if (!session) fail(404, 'جلسه یافت نشد');
    const b = ctx.body, status = b.status ?? session.status, title = b.title == null ? session.title : clampStr(b.title, 200), start = b.starts_at == null ? session.starts_at : counselorSessionStart(b.starts_at);
    if (!['requested','scheduled','completed','cancelled'].includes(status) || !title) fail(400, 'وضعیت یا عنوان جلسه معتبر نیست');
    run('UPDATE counselor_sessions SET status=?,title=?,starts_at=?,notes=? WHERE id=? AND counselor_id=?', status, title, start, b.notes == null ? session.notes : clampStr(b.notes, 3000), session.id, ctx.user.id);
    return { ok: true };
  });
  r.del('/api/counselor/sessions/:id', C, (ctx) => {
    if (!sessionRows(ctx).some((s) => s.id === Number(ctx.params.id))) fail(404, 'جلسه یافت نشد');
    run('DELETE FROM counselor_sessions WHERE id=? AND counselor_id=?', Number(ctx.params.id), ctx.user.id);
    return { ok: true };
  });

  // Managers can provision counselors in their own center. Admins must select one.
  r.get('/api/manager/counselors', M, (ctx) => {
    const cid = managementCenter(ctx);
    const assigned = all(`SELECT cc.counselor_id,c.id,c.name,c.grade,(SELECT COUNT(*) FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=c.id AND u.active=1) students
      FROM counselor_classes cc JOIN classes c ON c.id=cc.class_id WHERE cc.center_id=? AND c.center_id=? ORDER BY c.grade,c.name`, cid, cid);
    return all(`SELECT id,full_name,username,mobile,active,created_at FROM users WHERE center_id=? AND role='counselor' ORDER BY full_name`, cid).map((c) => {
      const classes = assigned.filter((a) => a.counselor_id === c.id).map(({ counselor_id, ...cls }) => cls);
      return { ...c, classes, students: classes.reduce((n, x) => n + x.students, 0) };
    });
  });
  // Replace the full set of classes assigned to a counselor (all classes must belong to the same center).
  r.put('/api/manager/counselors/:id/classes', M, (ctx) => {
    const cid = managementCenter(ctx), id = Number(ctx.params.id);
    if (!get("SELECT id FROM users WHERE id=? AND center_id=? AND role='counselor'", id, cid)) fail(404, 'مشاور یافت نشد');
    const ids = ctx.body.class_ids;
    if (!Array.isArray(ids) || ids.length > 500) fail(400, 'فهرست کلاس‌ها نامعتبر است');
    const wanted = [...new Set(ids.map(Number))];
    if (wanted.some((x) => !Number.isInteger(x) || x <= 0)) fail(400, 'شناسهٔ کلاس نامعتبر است');
    for (const classId of wanted) if (!get('SELECT id FROM classes WHERE id=? AND center_id=?', classId, cid)) fail(400, 'کلاس انتخاب‌شده متعلق به این کانون نیست');
    return tx(() => {
      const before = all('SELECT class_id FROM counselor_classes WHERE counselor_id=?', id).map((x) => x.class_id);
      const added = wanted.filter((x) => !before.includes(x)), removed = before.filter((x) => !wanted.includes(x));
      for (const classId of removed) run('DELETE FROM counselor_classes WHERE counselor_id=? AND class_id=?', id, classId);
      for (const classId of added) run('INSERT INTO counselor_classes(center_id,counselor_id,class_id,assigned_by) VALUES (?,?,?,?)', cid, id, classId, ctx.user.id);
      if (added.length || removed.length) audit(cid, ctx.user.id, 'counselor.classes', 'user', id, { added, removed });
      return { ok: true, added: added.length, removed: removed.length };
    });
  });
  r.post('/api/manager/counselors', M, async (ctx) => {
    const cid = managementCenter(ctx), b = ctx.body, username = toEnDigits(clampStr(b.username, 40)).toLowerCase(), name = clampStr(b.full_name, 80);
    if (!name || !/^[a-z0-9_.]{3,40}$/.test(username)) fail(400, 'نام و نام کاربری لاتین (حداقل سه حرف) لازم است');
    if (String(b.password || '').length < 6) fail(400, 'رمز عبور حداقل شش کاراکتر است');
    if (get("SELECT id FROM users WHERE role='counselor' AND username=?", username)) fail(400, 'نام کاربری مشاور تکراری است');
    const mobile = b.mobile ? normalizeIranianMobile(b.mobile) : null;
    if (b.mobile && !mobile) fail(400, 'شماره موبایل معتبر نیست');
    if (b.active !== undefined && ![true,false,0,1].includes(b.active)) fail(400, 'وضعیت حساب معتبر نیست');
    const hash = await hashPasswordAsync(b.password);
    if (get("SELECT id FROM users WHERE role='counselor' AND username=?", username)) fail(400, 'نام کاربری مشاور تکراری است');
    const result = run("INSERT INTO users(center_id,role,username,full_name,mobile,pass_hash,active) VALUES (?,'counselor',?,?,?,?,?)", cid, username, name, mobile, hash, b.active == null ? 1 : Number(b.active));
    return { ok: true, id: Number(result.lastInsertRowid) };
  });
  r.put('/api/manager/counselors/:id', M, async (ctx) => {
    const cid = managementCenter(ctx), id = Number(ctx.params.id), existing = get("SELECT * FROM users WHERE id=? AND center_id=? AND role='counselor'", id, cid);
    if (!existing) fail(404, 'مشاور یافت نشد');
    const b = ctx.body, name = b.full_name == null ? existing.full_name : clampStr(b.full_name, 80), username = b.username == null ? existing.username : toEnDigits(clampStr(b.username, 40)).toLowerCase();
    if (!name || !/^[a-z0-9_.]{3,40}$/.test(username)) fail(400, 'نام و نام کاربری معتبر لازم است');
    if (get("SELECT id FROM users WHERE role='counselor' AND username=? AND id<>?", username, id)) fail(400, 'نام کاربری مشاور تکراری است');
    const mobile = b.mobile == null ? existing.mobile : b.mobile ? normalizeIranianMobile(b.mobile) : null;
    if (b.mobile && !mobile) fail(400, 'شماره موبایل معتبر نیست');
    if (b.active !== undefined && ![true,false,0,1].includes(b.active)) fail(400, 'وضعیت حساب معتبر نیست');
    if (b.password != null && String(b.password).length < 6) fail(400, 'رمز عبور حداقل شش کاراکتر است');
    const hash = b.password == null ? existing.pass_hash : await hashPasswordAsync(b.password);
    tx(() => {
      if (get("SELECT id FROM users WHERE role='counselor' AND username=? AND id<>?", username, id)) fail(400, 'نام کاربری مشاور تکراری است');
      run('UPDATE users SET full_name=?,username=?,mobile=?,active=?,pass_hash=? WHERE id=? AND center_id=?', name, username, mobile, b.active == null ? existing.active : Number(b.active), hash, id, cid);
    });
    return { ok: true };
  });
}
