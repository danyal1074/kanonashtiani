// پنل معلم
import { all, get, run, tx } from '../db.js';
import { audit } from '../db.js';
import { examState, isEditable, acceptsResults, transition, bankSnapshot, linkBank } from '../exam_lifecycle.js';
import { fail, ymd, addDays, weekStart, faWeekday, clampStr, saveUpload } from '../util.js';
import { addPoints, totalPoints, levelOf, gradeRanking, saveExamResult, omrMeta, ensureLearningPath, generateLearningPath, subjectScores } from '../logic.js';
import { studentResults, studyWeek } from './student.js';

const T = { roles: ['teacher'] };

export const teacherClasses = (tid) => all(`SELECT c.id, c.grade, c.name, GROUP_CONCAT(tc.subject, '، ') subjects,
  (SELECT COUNT(*) FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=c.id AND u.active=1) students
  FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=? GROUP BY c.id ORDER BY c.grade, c.name`, tid);

function ownClass(tid, classId) {
  const c = get('SELECT c.* FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=? AND c.id=?', tid, Number(classId));
  if (!c) fail(403, 'این کلاس متعلق به شما نیست');
  return c;
}
function ownStudent(tid, sid) {
  const s = get(`SELECT u.id, u.full_name, u.national_code, s.grade, s.class_id, s.school, s.avatar, s.birth_date, c.name class_name, u.center_id
    FROM students s JOIN users u ON u.id=s.user_id JOIN classes c ON c.id=s.class_id
    WHERE u.id=? AND s.class_id IN (SELECT class_id FROM teacher_classes WHERE teacher_id=?)`, Number(sid), tid);
  if (!s) fail(403, 'این دانش‌آموز در کلاس‌های شما نیست');
  return s;
}
const classFilter = (tid, q) => {
  let cls = teacherClasses(tid);
  if (q.grade) cls = cls.filter((c) => c.grade === Number(q.grade));
  if (q.class_id) cls = cls.filter((c) => c.id === Number(q.class_id));
  return cls;
};

export function performanceList(centerId, classIds) {
  if (!classIds.length) return [];
  const ph = classIds.map(() => '?').join(',');
  const ws = weekStart(), from30 = addDays(ymd(), -30);
  const rows = all(`SELECT u.id, u.full_name, s.avatar, s.grade, s.class_id, c.name class_name,
    COALESCE((SELECT SUM(amount) FROM points WHERE student_id=u.id),0) points,
    (SELECT AVG(percent) FROM exam_results WHERE student_id=u.id) avg_percent,
    (SELECT COUNT(*) FROM attendance WHERE student_id=u.id AND status='absent' AND date>=?) absences,
    COALESCE((SELECT SUM(minutes) FROM pomodoros WHERE student_id=u.id AND date>=?),0) week_minutes
    FROM students s JOIN users u ON u.id=s.user_id JOIN classes c ON c.id=s.class_id WHERE s.class_id IN (${ph}) AND u.active=1`, from30, ws, ...classIds);
  const ranks = {};
  for (const g of [...new Set(rows.map((r) => r.grade))]) gradeRanking(centerId, g).forEach((x, i) => { ranks[x.id] = i + 1; });
  return rows.map((r) => ({ ...r, rank: ranks[r.id], level: levelOf(r.points), avg_percent: r.avg_percent == null ? null : Math.round(r.avg_percent) }))
    .sort((a, b) => b.points - a.points);
}

export function studentDetail(s) {
  const lp = ensureLearningPath(s.id);
  const att = all(`SELECT status, COUNT(*) n FROM attendance WHERE student_id=? GROUP BY status`, s.id);
  const months = {};
  for (const r of subjectScores(s.id)) {
    const k = r.date.slice(0, 7);
    (months[k] ??= []).push(r.percent);
  }
  return {
    info: s, points: totalPoints(s.id), level: levelOf(totalPoints(s.id)),
    results: studentResults(s.id).slice(0, 10),
    attendance: Object.fromEntries(att.map((a) => [a.status, a.n])),
    week: studyWeek(s.id, s.class_id),
    path: lp, insights: generateLearningPath(s.id).insights,
    progress: Object.entries(months).sort().map(([m, arr]) => ({ month: m, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) })),
    notes: all('SELECT n.id, n.body, n.created_at, u.full_name teacher FROM counsel_notes n LEFT JOIN users u ON u.id=n.teacher_id WHERE n.student_id=? ORDER BY n.id DESC', s.id),
  };
}

export function parseQuestions(raw, needText) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 60) fail(400, 'تعداد سؤال‌ها باید بین ۱ تا ۶۰ باشد');
  return raw.map((q, i) => {
    const answer = Number(q.answer);
    if (!(answer >= 0 && answer <= 3)) fail(400, `کلید پاسخ سؤال ${i + 1} مشخص نیست`);
    const out = { answer, subject: clampStr(q.subject, 40) || undefined };
    if (needText) {
      out.text = clampStr(q.text, 1000);
      out.options = (q.options || []).slice(0, 4).map((o) => clampStr(o, 300));
      if (!out.text || out.options.length !== 4 || out.options.some((o) => !o)) fail(400, `متن سؤال ${i + 1} و هر چهار گزینه را کامل کنید`);
    }
    return out;
  });
}

export function examWithResults(e) {
  const students = all(`SELECT u.id, u.full_name, s.avatar, c.name class_name, s.grade FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN classes c ON c.id=s.class_id
    WHERE u.center_id=? AND u.active=1 AND s.grade=? ${e.class_id ? 'AND s.class_id=?' : ''} ORDER BY u.full_name`, ...[e.center_id, e.grade, ...(e.class_id ? [e.class_id] : [])]);
  const results = all(`SELECT r.student_id, r.correct, r.wrong, r.blank, r.percent, r.source, r.created_at, u.full_name, s.avatar, c.name class_name FROM exam_results r JOIN users u ON u.id=r.student_id
    JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id WHERE r.exam_id=? ORDER BY r.percent DESC, u.full_name`, e.id);
  let rank = 0, prev = null;
  results.forEach((r, i) => { if (r.percent !== prev) { rank = i + 1; prev = r.percent; } r.rank = rank; });
  return { ...e, questions: JSON.parse(e.questions), students, results,
    avg: results.length ? Math.round(results.reduce((a, r) => a + r.percent, 0) / results.length) : null };
}

export default function register(r) {
  r.get('/api/teacher/overview', T, (ctx) => {
    const t = ctx.user, today = ymd();
    const classes = teacherClasses(t.id);
    const ids = classes.map((c) => c.id);
    const ph = ids.map(() => '?').join(',') || 'NULL';
    return {
      classes,
      today: all(`SELECT sc.start, sc.end, sc.subject, sc.room, c.name class_name, c.grade, c.id class_id FROM schedule sc JOIN classes c ON c.id=sc.class_id WHERE sc.teacher_id=? AND sc.weekday=? ORDER BY sc.start`, t.id, faWeekday(today)),
      stats: {
        students: classes.reduce((a, c) => a + c.students, 0),
        openAssignments: get(`SELECT COUNT(*) n FROM assignments WHERE teacher_id=? AND deadline>?`, t.id, new Date().toISOString()).n,
        newSubmissions: get(`SELECT COUNT(*) n FROM submissions sb JOIN assignments a ON a.id=sb.assignment_id WHERE a.teacher_id=? AND sb.submitted_at>=?`, t.id, addDays(today, -2)).n,
        absentToday: get(`SELECT COUNT(*) n FROM attendance WHERE class_id IN (${ph}) AND date=? AND status='absent'`, ...ids, today).n,
      },
      top: performanceList(t.center_id, ids).slice(0, 5),
    };
  });

  // برنامه هفتگی معلم: همهٔ جلسات او در هفته
  r.get('/api/teacher/schedule', T, (ctx) => ({
    today: faWeekday(ymd()),
    colors: JSON.parse(get('SELECT config FROM schedule_colors WHERE center_id=?', ctx.user.center_id)?.config || '{}'),
    sessions: all(`SELECT sc.id, sc.weekday, sc.start, sc.end, sc.subject, sc.room, sc.kind, c.id class_id, c.grade, c.name class_name
      FROM schedule sc JOIN classes c ON c.id=sc.class_id WHERE sc.teacher_id=? ORDER BY sc.weekday, sc.start`, ctx.user.id),
  }));

  // ---------- حضور و غیاب ----------
  r.get('/api/teacher/attendance', T, (ctx) => {
    const c = ownClass(ctx.user.id, ctx.query.class_id);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.date || '') ? ctx.query.date : ymd();
    const rows = all(`SELECT u.id, u.full_name, s.avatar, a.status, a.sms_sent FROM students s JOIN users u ON u.id=s.user_id
      LEFT JOIN attendance a ON a.student_id=u.id AND a.class_id=? AND a.date=? WHERE s.class_id=? AND u.active=1 ORDER BY u.full_name`, c.id, date, c.id);
    return { class: c, date, students: rows, saved: rows.some((x) => x.status) };
  });
  r.post('/api/teacher/attendance', T, (ctx) => {
    const c = ownClass(ctx.user.id, ctx.body.class_id);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.body.date || '') ? ctx.body.date : ymd();
    if (date > ymd()) fail(400, 'ثبت حضور برای روزهای آینده ممکن نیست');
    const valid = new Set(all('SELECT user_id FROM students WHERE class_id=?', c.id).map((x) => x.user_id));
    let absent = 0, excused = 0, present = 0;
    tx(() => {
      for (const rec of ctx.body.records || []) {
        if (!valid.has(rec.student_id) || !['present', 'absent', 'excused'].includes(rec.status)) continue;
        const prev = get('SELECT status FROM attendance WHERE class_id=? AND student_id=? AND date=?', c.id, rec.student_id, date);
        if (prev && prev.status !== rec.status) {
          run('INSERT INTO attendance_changes (session_id, student_id, old_status, new_status, actor_id, date) VALUES (?,?,?,?,?,?)',
            c.id, rec.student_id, prev.status, rec.status, ctx.user.id, date);
        }
        run(`INSERT INTO attendance (class_id, student_id, date, status, teacher_id) VALUES (?,?,?,?,?)
          ON CONFLICT(class_id, student_id, date) DO UPDATE SET status=excluded.status, teacher_id=excluded.teacher_id`, c.id, rec.student_id, date, rec.status, ctx.user.id);
        const ref = `abs:${c.id}:${date}`;
        if (rec.status === 'absent') { absent++; addPoints(rec.student_id, -5, 'غیبت', `غیبت بدون اطلاع در کلاس ${c.name} (${date})`, ref); }
        else { run('DELETE FROM points WHERE student_id=? AND ref=?', rec.student_id, ref); rec.status === 'excused' ? excused++ : present++; }
      }
    });
    const smsPending = get(`SELECT COUNT(*) n FROM attendance WHERE class_id=? AND date=? AND status='absent' AND sms_sent=0`, c.id, date).n;
    return { ok: true, present, absent, excused, sms: smsPending };
  });

  // ---------- تکالیف ----------
  r.get('/api/teacher/assignments', T, (ctx) => {
    const cls = classFilter(ctx.user.id, ctx.query);
    if (!cls.length) return [];
    return all(`SELECT a.*, c.name class_name, c.grade,
      (SELECT COUNT(*) FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=a.class_id AND u.active=1) total,
      (SELECT COUNT(*) FROM submissions sb WHERE sb.assignment_id=a.id) submitted,
      (SELECT COUNT(*) FROM submissions sb WHERE sb.assignment_id=a.id AND sb.late=1) late
      FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.class_id IN (${cls.map(() => '?').join(',')}) ORDER BY a.deadline DESC`, ...cls.map((c) => c.id));
  });
  r.post('/api/teacher/assignments', T, (ctx) => {
    const b = ctx.body;
    const classIds = (b.class_ids || []).map(Number);
    if (!classIds.length) fail(400, 'حداقل یک کلاس انتخاب کنید');
    const title = clampStr(b.title, 150);
    if (!title) fail(400, 'عنوان تکلیف را وارد کنید');
    const deadline = new Date(b.deadline);
    if (isNaN(deadline)) fail(400, 'مهلت نامعتبر است');
    if (deadline < new Date()) fail(400, 'مهلت باید در آینده باشد');
    const reward = Math.max(0, Math.min(50, Number(b.reward_points) || 0));
    tx(() => {
      for (const id of classIds) {
        ownClass(ctx.user.id, id);
        run('INSERT INTO assignments (center_id, class_id, teacher_id, subject, title, description, deadline, reward_points) VALUES (?,?,?,?,?,?,?,?)',
          ctx.user.center_id, id, ctx.user.id, clampStr(b.subject, 40), title, clampStr(b.description, 3000), deadline.toISOString(), reward);
      }
    });
    return { ok: true, count: classIds.length };
  });
  r.del('/api/teacher/assignments/:id', T, (ctx) => {
    const a = get('SELECT * FROM assignments WHERE id=? AND teacher_id=?', Number(ctx.params.id), ctx.user.id);
    if (!a) fail(404, 'تکلیف یافت نشد');
    tx(() => {
      run(`DELETE FROM points WHERE ref IN (?, ?)`, `late:${a.id}`, `asg:${a.id}`);
      run('DELETE FROM assignments WHERE id=?', a.id);
    });
    return { ok: true };
  });
  r.get('/api/teacher/assignments/:id', T, (ctx) => {
    const a = get('SELECT a.*, c.name class_name, c.grade FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=?', Number(ctx.params.id));
    if (!a) fail(404, 'تکلیف یافت نشد');
    ownClass(ctx.user.id, a.class_id);
    a.students = all(`SELECT u.id, u.full_name, s.avatar, sb.note, sb.file_path, sb.file_name, sb.submitted_at, sb.late FROM students s JOIN users u ON u.id=s.user_id
      LEFT JOIN submissions sb ON sb.assignment_id=? AND sb.student_id=u.id WHERE s.class_id=? AND u.active=1 ORDER BY sb.submitted_at IS NULL, u.full_name`, a.id, a.class_id);
    return a;
  });
  r.get('/api/teacher/assignments-report', T, (ctx) => {
    const cls = classFilter(ctx.user.id, ctx.query);
    const now = new Date().toISOString();
    const classes = cls.map((c) => {
      const asg = all('SELECT id, deadline FROM assignments WHERE class_id=?', c.id);
      const ids = asg.map((a) => a.id);
      const ph = ids.map(() => '?').join(',') || 'NULL';
      const onTime = get(`SELECT COUNT(*) n FROM submissions WHERE assignment_id IN (${ph}) AND late=0`, ...ids).n;
      const late = get(`SELECT COUNT(*) n FROM submissions WHERE assignment_id IN (${ph}) AND late=1`, ...ids).n;
      const expected = asg.length * c.students;
      const due = asg.filter((a) => a.deadline < now).length * c.students;
      return { ...c, assignments: asg.length, expected, onTime, late, missing: Math.max(0, due - onTime - late), rate: expected ? Math.round(((onTime + late) / expected) * 100) : 0 };
    });
    const ids = cls.map((c) => c.id);
    const students = ids.length ? all(`SELECT u.id, u.full_name, s.avatar, c.name class_name, c.grade,
      (SELECT COUNT(*) FROM assignments a WHERE a.class_id=s.class_id) total,
      (SELECT COUNT(*) FROM submissions sb JOIN assignments a ON a.id=sb.assignment_id WHERE sb.student_id=u.id AND a.class_id=s.class_id AND sb.late=0) on_time,
      (SELECT COUNT(*) FROM submissions sb JOIN assignments a ON a.id=sb.assignment_id WHERE sb.student_id=u.id AND a.class_id=s.class_id AND sb.late=1) late
      FROM students s JOIN users u ON u.id=s.user_id JOIN classes c ON c.id=s.class_id WHERE s.class_id IN (${ids.map(() => '?').join(',')}) AND u.active=1
      ORDER BY c.grade, c.name, u.full_name`, ...ids) : [];
    return { classes, students: students.map((s) => ({ ...s, rate: s.total ? Math.round(((s.on_time + s.late) / s.total) * 100) : 0 })) };
  });

  // ---------- آزمون ----------
  r.get('/api/teacher/exams', T, (ctx) => all(`SELECT e.id, e.title, e.kind, e.subject, e.grade, e.duration_min, e.created_at, e.status, e.starts_at, e.ends_at, e.results_released_at, c.name class_name,
    json_array_length(e.questions) qcount, (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id=e.id) results, (SELECT AVG(percent) FROM exam_results r WHERE r.exam_id=e.id) avg
    FROM exams e LEFT JOIN classes c ON c.id=e.class_id WHERE e.created_by=? ORDER BY e.id DESC`, ctx.user.id).map((e) => ({ ...e, state: examState(e) })));
  r.post('/api/teacher/exams', T, (ctx) => {
    const b = ctx.body;
    const kind = b.kind === 'paper' ? 'paper' : 'online';
    const title = clampStr(b.title, 150);
    if (!title) fail(400, 'عنوان آزمون را وارد کنید');
    const cls = teacherClasses(ctx.user.id);
    const grade = Number(b.grade);
    if (!cls.some((c) => c.grade === grade)) fail(403, 'این پایه را تدریس نمی‌کنید');
    const classId = b.class_id ? ownClass(ctx.user.id, b.class_id).id : null;
    // سؤال‌ها: دستی، از بانک سؤال (با نسخهٔ ثابت) یا ترکیبی از هر دو
    const manual = Array.isArray(b.questions) && b.questions.length ? parseQuestions(b.questions, kind === 'online') : [];
    const fromBank = Array.isArray(b.bank_question_ids) && b.bank_question_ids.length ? bankSnapshot(ctx, b.bank_question_ids, grade) : [];
    const qs = [...fromBank, ...manual];
    if (!qs.length || qs.length > 60) fail(400, 'تعداد سؤال‌ها باید بین ۱ تا ۶۰ باشد');
    // آزمون جدید همیشه «پیش‌نویس» است و تا انتشار برای دانش‌آموز دیده نمی‌شود
    return tx(() => {
      const id = Number(run("INSERT INTO exams (center_id, title, kind, subject, grade, class_id, duration_min, questions, created_by, status) VALUES (?,?,?,?,?,?,?,?,?,'draft')",
        ctx.user.center_id, title, kind, clampStr(b.subject, 40), grade, classId, Math.max(1, Math.min(180, Number(b.duration_min) || 15)), JSON.stringify(qs), ctx.user.id).lastInsertRowid);
      linkBank(id, qs);
      audit(ctx.user.center_id, ctx.user.id, 'exam.create', 'exam', id, { questions: qs.length, from_bank: fromBank.length });
      return { ok: true, id, status: 'draft' };
    });
  });
  // ویرایش فقط در پیش‌نویس، بازبینی یا آماده (پس از انتشار، سؤال‌ها ثابت می‌مانند)
  r.put('/api/teacher/exams/:id', T, (ctx) => {
    const e = ownExam(ctx), b = ctx.body;
    if (!isEditable(e)) fail(409, 'آزمون منتشرشده قابل ویرایش نیست');
    const title = b.title == null ? e.title : clampStr(b.title, 150);
    if (!title) fail(400, 'عنوان آزمون را وارد کنید');
    const classId = b.class_id === undefined ? e.class_id : b.class_id ? ownClass(ctx.user.id, b.class_id).id : null;
    let qs = JSON.parse(e.questions);
    if (b.questions !== undefined || b.bank_question_ids !== undefined) {
      const manual = Array.isArray(b.questions) && b.questions.length ? parseQuestions(b.questions, e.kind === 'online') : [];
      const fromBank = Array.isArray(b.bank_question_ids) && b.bank_question_ids.length ? bankSnapshot(ctx, b.bank_question_ids, e.grade) : [];
      qs = [...fromBank, ...manual];
      if (!qs.length || qs.length > 60) fail(400, 'تعداد سؤال‌ها باید بین ۱ تا ۶۰ باشد');
    }
    return tx(() => {
      run('UPDATE exams SET title=?, class_id=?, duration_min=?, questions=?, status=CASE WHEN status=\'ready\' THEN \'review\' ELSE status END WHERE id=?', title, classId,
        b.duration_min == null ? e.duration_min : Math.max(1, Math.min(180, Number(b.duration_min) || 15)), JSON.stringify(qs), e.id);
      linkBank(e.id, qs);
      audit(e.center_id, ctx.user.id, 'exam.edit', 'exam', e.id, { questions: qs.length });
      return { ok: true };
    });
  });
  r.post('/api/teacher/exams/:id/status', T, (ctx) => transition(ctx, ownExam(ctx), String(ctx.body.to || ''), ctx.body));
  const ownExam = (ctx) => {
    const e = get('SELECT * FROM exams WHERE id=? AND created_by=?', Number(ctx.params.id), ctx.user.id);
    if (!e) fail(404, 'آزمون یافت نشد');
    return e;
  };
  r.get('/api/teacher/exams/:id', T, (ctx) => { const e = ownExam(ctx); return { ...examWithResults(e), state: examState(e) }; });
  r.del('/api/teacher/exams/:id', T, (ctx) => {
    const e = ownExam(ctx);
    // نتایج تاریخی هرگز با حذف آزمون از بین نمی‌روند
    if (get('SELECT 1 x FROM exam_results WHERE exam_id=? UNION ALL SELECT 1 FROM exam_attempts WHERE exam_id=? LIMIT 1', e.id, e.id)) fail(409, 'این آزمون نتیجه یا شرکت‌کننده دارد و برای حفظ سوابق حذف نمی‌شود');
    audit(e.center_id, ctx.user.id, 'exam.delete', 'exam', e.id, { title: e.title });
    tx(() => { run('DELETE FROM points WHERE ref=?', `exam:${e.id}`); run('DELETE FROM exams WHERE id=?', e.id); });
    return { ok: true };
  });
  r.post('/api/teacher/exams/:id/result', T, (ctx) => {
    const e = ownExam(ctx);
    if (!acceptsResults(e)) fail(409, 'ابتدا آزمون را منتشر کنید');
    const st = ownStudent(ctx.user.id, ctx.body.student_id);
    if (st.grade !== e.grade || (e.class_id && st.class_id !== e.class_id)) fail(400, 'این دانش‌آموز در جامعه این آزمون نیست');
    const n = JSON.parse(e.questions).length;
    const answers = Array.from({ length: n }, (_, i) => { const v = ctx.body.answers?.[i]; return Number.isInteger(v) && v >= 0 && v <= 3 ? v : null; });
    return saveExamResult(e, st.id, answers, 'scan', { actorId: ctx.user.id, meta: omrMeta(ctx.body.omr, n) });
  });

  // ---------- دانش‌آموزان و مسیر یادگیری ----------
  r.get('/api/teacher/students', T, (ctx) => performanceList(ctx.user.center_id, classFilter(ctx.user.id, ctx.query).map((c) => c.id)));
  r.get('/api/teacher/students/:id', T, (ctx) => studentDetail(ownStudent(ctx.user.id, ctx.params.id)));
  r.put('/api/teacher/students/:id/path', T, (ctx) => {
    const s = ownStudent(ctx.user.id, ctx.params.id);
    const steps = (ctx.body.steps || []).slice(0, 20).map((x, i) => ({
      id: i + 1, title: clampStr(x.title, 120), detail: clampStr(x.detail, 500), subject: clampStr(x.subject, 40) || undefined,
      kind: ['review', 'practice', 'challenge', 'habit'].includes(x.kind) ? x.kind : 'practice', done: !!x.done,
    })).filter((x) => x.title);
    if (!steps.length) fail(400, 'حداقل یک گام لازم است');
    run(`INSERT INTO learning_paths (student_id, steps, summary, updated_by, updated_at) VALUES (?,?,?,?,datetime('now'))
      ON CONFLICT(student_id) DO UPDATE SET steps=excluded.steps, summary=excluded.summary, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    s.id, JSON.stringify(steps), clampStr(ctx.body.summary, 500), ctx.user.id);
    return { ok: true };
  });
  r.post('/api/teacher/students/:id/path/regenerate', T, (ctx) => {
    const s = ownStudent(ctx.user.id, ctx.params.id);
    const g = generateLearningPath(s.id);
    return { steps: g.steps, summary: g.summary };
  });
  r.post('/api/teacher/students/:id/notes', T, (ctx) => {
    const s = ownStudent(ctx.user.id, ctx.params.id);
    const body = clampStr(ctx.body.body, 2000);
    if (!body) fail(400, 'متن یادداشت خالی است');
    run('INSERT INTO counsel_notes (student_id, teacher_id, body) VALUES (?,?,?)', s.id, ctx.user.id, body);
    return { ok: true };
  });
  r.post('/api/teacher/students/:id/points', T, (ctx) => {
    const s = ownStudent(ctx.user.id, ctx.params.id);
    const amount = Math.round(Number(ctx.body.amount));
    if (!amount || Math.abs(amount) > 20) fail(400, 'امتیاز باید بین ۲۰- و ۲۰ باشد');
    addPoints(s.id, amount, 'فعالیت', clampStr(ctx.body.reason, 200) || (amount > 0 ? 'فعالیت کلاسی' : 'تذکر کلاسی'));
    return { ok: true };
  });

  // ---------- برنامه پومودوروی هفتگی ----------
  r.get('/api/teacher/study-plans', T, (ctx) => {
    const c = ownClass(ctx.user.id, ctx.query.class_id);
    const ws = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.week || '') ? ctx.query.week : weekStart();
    const plan = all('SELECT subject, target FROM study_plans WHERE class_id=? AND week_start=? ORDER BY subject', c.id, ws);
    const students = all(`SELECT u.id, u.full_name, s.avatar FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=? AND u.active=1 ORDER BY u.full_name`, c.id).map((s) => {
      const done = Object.fromEntries(all('SELECT subject, COUNT(*) n FROM pomodoros WHERE student_id=? AND date>=? AND date<? GROUP BY subject', s.id, ws, addDays(ws, 7)).map((x) => [x.subject, x.n]));
      const target = plan.reduce((a, p) => a + p.target, 0);
      const got = plan.reduce((a, p) => a + Math.min(done[p.subject] || 0, p.target), 0);
      return { ...s, done, got, target, rate: target ? Math.round((got / target) * 100) : 0 };
    });
    const subjects = all('SELECT DISTINCT subject FROM schedule WHERE class_id=? UNION SELECT DISTINCT subject FROM teacher_classes WHERE class_id=?', c.id, c.id).map((x) => x.subject);
    return { class: c, week_start: ws, plan, students, subjects };
  });
  r.post('/api/teacher/study-plans', T, (ctx) => {
    const c = ownClass(ctx.user.id, ctx.body.class_id);
    const ws = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(ctx.body.week || '') ? ctx.body.week : ymd());
    const items = (ctx.body.items || []).filter((x) => clampStr(x.subject, 40) && Number(x.target) > 0).slice(0, 12);
    tx(() => {
      run('DELETE FROM study_plans WHERE class_id=? AND week_start=?', c.id, ws);
      for (const it of items) run('INSERT INTO study_plans (class_id, week_start, subject, target, teacher_id) VALUES (?,?,?,?,?)', c.id, ws, clampStr(it.subject, 40), Math.min(30, Number(it.target)), ctx.user.id);
    });
    return { ok: true };
  });

  // ---------- ویدیو و جزوه ----------
  r.get('/api/teacher/materials', T, (ctx) => all('SELECT * FROM materials WHERE center_id=? ORDER BY id DESC', ctx.user.center_id));
  r.post('/api/teacher/materials', T, (ctx) => {
    const b = ctx.body;
    const title = clampStr(b.title, 150);
    if (!title) fail(400, 'عنوان را وارد کنید');
    const kind = ['video', 'pdf', 'file'].includes(b.kind) ? b.kind : 'file';
    let url = clampStr(b.url, 500);
    let size = null;
    if (b.file) { const name = saveUpload(b.file, 10); url = `/uploads/${name}`; size = Math.round(Buffer.byteLength(b.file.data) * 0.75 / 1024); }
    if (!url || !/^(https?:\/\/|\/uploads\/)/.test(url)) fail(400, 'فایل یا لینک معتبر لازم است');
    run('INSERT INTO materials (center_id, grade, subject, title, kind, url, size_kb) VALUES (?,?,?,?,?,?,?)', ctx.user.center_id, Number(b.grade) || null, clampStr(b.subject, 40), title, kind, url, size);
    return { ok: true };
  });

  // ---------- لاگ تغییرات حضور و غیاب (Option 7) ----------
  r.get('/api/teacher/attendance/changes', T, (ctx) => {
    const classIds = classFilter(ctx.user.id, ctx.query).map((c) => c.id);
    if (!classIds.length) return [];
    return all(`
      SELECT ch.*, u.full_name student_name, actor.full_name actor_name, c.name class_name
      FROM attendance_changes ch
      JOIN users u ON u.id=ch.student_id
      JOIN users actor ON actor.id=ch.actor_id
      LEFT JOIN classes c ON c.id=ch.session_id
      WHERE ch.session_id IN (${classIds.map(() => '?').join(',')})
      ORDER BY ch.id DESC LIMIT 100
    `, ...classIds);
  });

  // ---------- نمرات مستمر کلاسی: بازنشسته ----------
  // سیاست کانون: ارزشیابی تحصیلی فقط از آزمون‌های رسمی آنلاین، کلاسی و جامع است.
  // ردیف‌های قبلی جدول manual_scores حذف نمی‌شوند و فقط در بایگانی مدیر (فقط‌خواندنی) دیده می‌شوند.
  const retired = () => fail(410, 'نمرات مستمر/کلاسی دیگر بخشی از ارزشیابی نیست؛ ارزشیابی فقط از آزمون‌های آنلاین، کلاسی و جامع انجام می‌شود');
  r.get('/api/teacher/manual-scores', T, retired);
  r.post('/api/teacher/manual-scores', T, retired);
  r.del('/api/teacher/manual-scores/:id', T, retired);
}
