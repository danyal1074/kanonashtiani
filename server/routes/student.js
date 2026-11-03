import { buildSelfExamQuestions, sanitizeQuestionsForStudent, evaluateSelfExam } from '../self_exam.js';
import { LEVELS } from '../logic.js';
// پنل دانش‌آموز
import { all, get, run, tx } from '../db.js';
import { fail, saveUpload, ymd, addDays, weekStart, faWeekday, nowIso, clampStr } from '../util.js';
import { totalPoints, levelOf, rankOf, addPoints, feeStatus, ensureLearningPath, saveExamResult, gradeExam } from '../logic.js';
import { studentInfo, centerOf } from './common.js';

const S = { roles: ['student'] };

function topStudiers(centerId, grade, from, to) {
  return all(`SELECT u.id, u.full_name, s.avatar, SUM(p.minutes) minutes FROM pomodoros p JOIN users u ON u.id=p.student_id JOIN students s ON s.user_id=u.id
    WHERE u.center_id=? AND s.grade=? AND p.date>=? AND p.date<=? GROUP BY u.id ORDER BY minutes DESC LIMIT 3`, centerId, grade, from, to);
}

export function classAssignments(classId, sid) {
  return all(`SELECT a.id, a.title, a.description, a.subject, a.deadline, a.reward_points, a.created_at, u.full_name teacher,
    sb.id sub_id, sb.submitted_at, sb.late, sb.note, sb.file_path, sb.file_name
    FROM assignments a LEFT JOIN users u ON u.id=a.teacher_id LEFT JOIN submissions sb ON sb.assignment_id=a.id AND sb.student_id=?
    WHERE a.class_id=? ORDER BY a.deadline DESC`, sid, classId);
}

export function studyWeek(sid, classId) {
  const ws = weekStart();
  const plan = all('SELECT subject, target FROM study_plans WHERE class_id=? AND week_start=?', classId, ws);
  const done = Object.fromEntries(all('SELECT subject, COUNT(*) n FROM pomodoros WHERE student_id=? AND date>=? GROUP BY subject', sid, ws).map((r) => [r.subject, r.n]));
  return { week_start: ws, plan: plan.map((p) => ({ ...p, done: done[p.subject] || 0 })) };
}

export function studentResults(sid) {
  return all(`SELECT e.id, e.title, e.kind, e.subject, r.correct, r.wrong, r.blank, r.percent, r.points, r.created_at,
    (SELECT COUNT(*)+1 FROM exam_results r2 WHERE r2.exam_id=e.id AND r2.percent>r.percent) rank,
    (SELECT COUNT(*) FROM exam_results r3 WHERE r3.exam_id=e.id) of
    FROM exam_results r JOIN exams e ON e.id=r.exam_id WHERE r.student_id=? ORDER BY r.created_at DESC`, sid);
}

export default function register(r) {
  r.get('/api/student/dashboard', S, (ctx) => {
    const u = ctx.user, s = studentInfo(u.id), today = ymd();
    const total = totalPoints(u.id);
    const center = centerOf(u.center_id);
    const upcoming = all(`SELECT a.id, a.title, a.subject, a.deadline, a.reward_points FROM assignments a
      WHERE a.class_id=? AND NOT EXISTS (SELECT 1 FROM submissions sb WHERE sb.assignment_id=a.id AND sb.student_id=?) AND a.deadline > ?
      ORDER BY a.deadline LIMIT 4`, s.class_id, u.id, addDays(today, -7) + 'T00:00:00Z');
    const todayClasses = all(`SELECT sc.start, sc.end, sc.subject, sc.room, t.full_name teacher FROM schedule sc LEFT JOIN users t ON t.id=sc.teacher_id
      WHERE sc.class_id=? AND sc.weekday=? ORDER BY sc.start`, s.class_id, faWeekday(today));
    const studyToday = get('SELECT COALESCE(SUM(minutes),0) m FROM pomodoros WHERE student_id=? AND date=?', u.id, today).m;
    const lp = ensureLearningPath(u.id);
    return {
      points: total, level: levelOf(total), rank: rankOf(u.center_id, s.grade, u.id), grade: s.grade,
      upcoming, todayClasses,
      top: { today: topStudiers(u.center_id, s.grade, today, today), week: topStudiers(u.center_id, s.grade, weekStart(today), today) },
      study: { today: studyToday, goal: center.min_daily_study },
      week: studyWeek(u.id, s.class_id),
      path: { summary: lp.summary, total: lp.steps.length, done: lp.steps.filter((x) => x.done).length, next: lp.steps.find((x) => !x.done) || null },
      recentPoints: all('SELECT amount, category, reason, created_at FROM points WHERE student_id=? ORDER BY id DESC LIMIT 5', u.id),
      games: get(`SELECT COUNT(*) n FROM game_scores WHERE student_id=?`, u.id).n,
    };
  });

  // ---------- تکالیف ----------
  r.get('/api/student/assignments', S, (ctx) => classAssignments(studentInfo(ctx.user.id).class_id, ctx.user.id));
  r.post('/api/student/assignments/:id/submit', S, (ctx) => {
    const s = studentInfo(ctx.user.id);
    const a = get('SELECT * FROM assignments WHERE id=? AND class_id=?', Number(ctx.params.id), s.class_id);
    if (!a) fail(404, 'تکلیف یافت نشد');
    const note = clampStr(ctx.body.note, 2000);
    if (!note && !ctx.body.file) fail(400, 'یادداشت یا فایل تکلیف را وارد کنید');
    const late = nowIso() > a.deadline ? 1 : 0;
    const prev = get('SELECT * FROM submissions WHERE assignment_id=? AND student_id=?', a.id, ctx.user.id);
    if (prev && prev.late === 0 && late) fail(400, 'مهلت ویرایش این تکلیف تمام شده است');
    const file = ctx.body.file ? saveUpload(ctx.body.file) : prev?.file_path;
    const fileName = ctx.body.file ? clampStr(ctx.body.file.name, 120) : prev?.file_name;
    tx(() => {
      run(`INSERT INTO submissions (assignment_id, student_id, note, file_path, file_name, late) VALUES (?,?,?,?,?,?)
        ON CONFLICT(assignment_id, student_id) DO UPDATE SET note=excluded.note, file_path=excluded.file_path, file_name=excluded.file_name, late=excluded.late, submitted_at=datetime('now')`,
      a.id, ctx.user.id, note, file, fileName, late);
      if (!late && a.reward_points > 0) addPoints(ctx.user.id, a.reward_points, 'تکلیف', `ارسال به‌موقع تکلیف «${a.title}»`, `asg:${a.id}`);
    });
    return { ok: true, late: !!late, reward: late ? 0 : a.reward_points };
  });

  // ---------- آزمون آنلاین ----------
  r.get('/api/student/exams', S, (ctx) => {
    const s = studentInfo(ctx.user.id);
    return all(`SELECT e.id, e.title, e.subject, e.duration_min, e.created_at, json_array_length(e.questions) qcount, t.full_name teacher,
      r.percent, r.points, at.started_at FROM exams e LEFT JOIN users t ON t.id=e.created_by
      LEFT JOIN exam_results r ON r.exam_id=e.id AND r.student_id=? LEFT JOIN exam_attempts at ON at.exam_id=e.id AND at.student_id=?
      WHERE e.kind='online' AND e.center_id=? AND e.grade=? AND (e.class_id IS NULL OR e.class_id=?) ORDER BY e.id DESC`,
    ctx.user.id, ctx.user.id, ctx.user.center_id, s.grade, s.class_id);
  });
  function examFor(ctx) {
    const s = studentInfo(ctx.user.id);
    const e = get(`SELECT * FROM exams WHERE id=? AND kind='online' AND center_id=? AND grade=? AND (class_id IS NULL OR class_id=?)`, Number(ctx.params.id), ctx.user.center_id, s.grade, s.class_id);
    if (!e) fail(404, 'آزمون یافت نشد');
    return e;
  }
  r.post('/api/student/exams/:id/start', S, (ctx) => {
    const e = examFor(ctx);
    if (get('SELECT 1 FROM exam_results WHERE exam_id=? AND student_id=?', e.id, ctx.user.id)) fail(400, 'این آزمون را قبلاً داده‌ای');
    run('INSERT OR IGNORE INTO exam_attempts (exam_id, student_id, started_at) VALUES (?,?,?)', e.id, ctx.user.id, nowIso());
    const at = get('SELECT started_at FROM exam_attempts WHERE exam_id=? AND student_id=?', e.id, ctx.user.id);
    const qs = JSON.parse(e.questions).map((q) => ({ text: q.text, options: q.options, subject: q.subject }));
    return { id: e.id, title: e.title, duration_min: e.duration_min, started_at: at.started_at, server_now: nowIso(), questions: qs };
  });
  r.post('/api/student/exams/:id/submit', S, (ctx) => {
    const e = examFor(ctx);
    const at = get('SELECT started_at FROM exam_attempts WHERE exam_id=? AND student_id=?', e.id, ctx.user.id);
    if (!at) fail(400, 'آزمون شروع نشده است');
    if (get('SELECT 1 FROM exam_results WHERE exam_id=? AND student_id=?', e.id, ctx.user.id)) fail(400, 'پاسخ این آزمون قبلاً ثبت شده');
    const startedMs = new Date(at.started_at.includes('T') ? at.started_at : at.started_at.replace(' ', 'T') + 'Z').getTime();
    const expired = Date.now() - startedMs > (e.duration_min * 60 + 30) * 1000;
    if (expired) {
      fail(400, 'مهلت پاسخ‌دهی به آزمون به پایان رسیده است');
    }
    const qs = JSON.parse(e.questions);
    const answers = qs.map((_, i) => {
      const v = ctx.body.answers?.[i];
      return Number.isInteger(v) && v >= 0 && v <= 3 ? v : null;
    });
    const res = saveExamResult(e, ctx.user.id, answers, 'online');
    return { ...res, expired: false, title: e.title, questions: qs, answers };
  });
  r.get('/api/student/results', S, (ctx) => studentResults(ctx.user.id));
  r.get('/api/student/results/:id', S, (ctx) => {
    const row = get('SELECT r.*, e.title, e.kind, e.questions, e.subject FROM exam_results r JOIN exams e ON e.id=r.exam_id WHERE r.exam_id=? AND r.student_id=?', Number(ctx.params.id), ctx.user.id);
    if (!row) fail(404, 'کارنامه یافت نشد');
    const qs = JSON.parse(row.questions).map((q) => ({ ...q, subject: q.subject || row.subject || 'عمومی' }));
    const answers = JSON.parse(row.answers);
    const rank = get('SELECT COUNT(*)+1 r FROM exam_results WHERE exam_id=? AND percent>?', row.exam_id, row.percent).r;
    const of = get('SELECT COUNT(*) n FROM exam_results WHERE exam_id=?', row.exam_id).n;
    const avg = get('SELECT AVG(percent) a FROM exam_results WHERE exam_id=?', row.exam_id).a;
    return { title: row.title, kind: row.kind, percent: row.percent, correct: row.correct, wrong: row.wrong, blank: row.blank, points: row.points, created_at: row.created_at,
      rank, of, avg: Math.round(avg * 10) / 10, bySubject: gradeExam(qs, answers).bySubject, questions: qs, answers };
  });

  // ---------- مطالعه و پومودورو ----------
  r.get('/api/student/study', S, (ctx) => {
    const u = ctx.user, s = studentInfo(u.id), today = ymd();
    const center = centerOf(u.center_id);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      days.push({ date: d, minutes: get('SELECT COALESCE(SUM(minutes),0) m FROM pomodoros WHERE student_id=? AND date=?', u.id, d).m });
    }
    const subjects = all('SELECT DISTINCT subject FROM teacher_classes WHERE class_id=? UNION SELECT DISTINCT subject FROM schedule WHERE class_id=?', s.class_id, s.class_id).map((x) => x.subject);
    return {
      goal: center.min_daily_study, today: days[6].minutes, days,
      sessions: all('SELECT subject, minutes, created_at FROM pomodoros WHERE student_id=? AND date=? ORDER BY id DESC', u.id, today),
      week: studyWeek(u.id, s.class_id), subjects,
    };
  });
  r.post('/api/student/pomodoro', S, (ctx) => {
    const minutes = Math.round(Number(ctx.body.minutes));
    const subject = clampStr(ctx.body.subject, 40);
    if (!subject) fail(400, 'درس را انتخاب کن');
    if (!(minutes >= 15 && minutes <= 60)) fail(400, 'مدت پومودورو نامعتبر است');
    const last = get('SELECT created_at FROM pomodoros WHERE student_id=? ORDER BY id DESC LIMIT 1', ctx.user.id);
    if (last && Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime() < (minutes - 1) * 60e3) fail(429, 'پومودوروی قبلی تازه ثبت شده است');
    const today = ymd();
    tx(() => {
      run('INSERT INTO pomodoros (student_id, subject, minutes, date) VALUES (?,?,?,?)', ctx.user.id, subject, minutes, today);
      addPoints(ctx.user.id, 2, 'ساعت مطالعه', `یک پومودوروی ${minutes} دقیقه‌ای ${subject}`);
    });
    return { ok: true, today: get('SELECT COALESCE(SUM(minutes),0) m FROM pomodoros WHERE student_id=? AND date=?', ctx.user.id, today).m };
  });

  // ---------- پروفایل ----------
  r.get('/api/student/profile', S, (ctx) => {
    const u = ctx.user, s = studentInfo(u.id);
    const ledger = all('SELECT amount, category, reason, created_at FROM points WHERE student_id=? ORDER BY id DESC', u.id);
    const schedule = all(`SELECT sc.weekday, sc.start, sc.end, sc.subject, sc.room, t.full_name teacher FROM schedule sc LEFT JOIN users t ON t.id=sc.teacher_id WHERE sc.class_id=? ORDER BY sc.weekday, sc.start`, s.class_id);
    const materials = all('SELECT id, title, kind, subject, url, size_kb, created_at FROM materials WHERE center_id=? AND (grade IS NULL OR grade=?) ORDER BY id DESC', u.center_id, s.grade);
    const purchased = all('SELECT items, created_at, tracking_code FROM orders WHERE user_id=? ORDER BY id DESC', u.id).flatMap((o) => JSON.parse(o.items).map((i) => ({ ...i, tracking_code: o.tracking_code })));
    const sum = (f) => ledger.filter(f).reduce((a, x) => a + x.amount, 0);
    return {
      info: { full_name: u.full_name, national_code: u.national_code, school: s.school, grade: s.grade, class_name: s.class_name, birth_date: s.birth_date, avatar: s.avatar },
      ledger, positive: sum((x) => x.amount > 0), negative: sum((x) => x.amount < 0), schedule, materials, purchased,
    };
  });
  r.get('/api/student/payment', { ...S, allowLocked: true }, (ctx) => {
    const c = centerOf(ctx.user.center_id);
    return { ...feeStatus(ctx.user.id), card_number: c.card_number, card_holder: c.card_holder };
  });
  r.post('/api/student/payment', { ...S, allowLocked: true }, (ctx) => {
    if (ctx.body.invoice_id) {
      const invoiceId = Number(ctx.body.invoice_id);
      const inv = get('SELECT id, amount, paid, status FROM fee_invoices WHERE id=? AND student_id=?', invoiceId, ctx.user.id);
      if (!inv) fail(404, 'فاکتور یافت نشد یا متعلق به شما نیست');
      if (inv.status === 'paid' || (inv.paid && inv.paid >= inv.amount)) fail(400, 'این فاکتور قبلاً تسویه شده است');

      const pendingPay = get("SELECT 1 FROM payments WHERE invoice_id=? AND status='pending'", inv.id);
      if (pendingPay) fail(400, 'رسید قبلی این فاکتور در انتظار تأیید است');

      if (!ctx.body.file) fail(400, 'تصویر رسید را بارگذاری کنید');
      const file = saveUpload(ctx.body.file, 6);
      const remaining = Math.max(0, inv.amount - (inv.paid || 0));
      const payAmount = Number(ctx.body.amount) > 0 ? Math.min(Number(ctx.body.amount), remaining) : remaining;

      run("INSERT INTO payments (student_id, amount, receipt_path, invoice_id, fee_type, status) VALUES (?,?,?,?,?,'pending')",
        ctx.user.id, payAmount, file, inv.id, 'invoice');

      return { ok: true, invoice_id: inv.id, amount: payAmount, status: 'pending' };
    }

    const fs_ = feeStatus(ctx.user.id);
    if (fs_.status === 'paid') fail(400, 'حق عضویت شما قبلاً تأیید شده است');
    if (fs_.status === 'pending') fail(400, 'رسید قبلی شما در انتظار تأیید است');
    if (!ctx.body.file) fail(400, 'تصویر رسید را بارگذاری کنید');
    const file = saveUpload(ctx.body.file, 6);
    run('INSERT INTO payments (student_id, amount, receipt_path, fee_type) VALUES (?,?,?,?)', ctx.user.id, fs_.amount, file, 'tuition');
    return { ok: true };
  });

  // ---------- مسیر یادگیری ----------
  r.get('/api/student/learning-path', S, (ctx) => ensureLearningPath(ctx.user.id));
  r.put('/api/student/learning-path/:step', S, (ctx) => {
    const lp = ensureLearningPath(ctx.user.id);
    const st = lp.steps.find((x) => x.id === Number(ctx.params.step));
    if (!st) fail(404, 'گام یافت نشد');
    st.done = !!ctx.body.done;
    run('UPDATE learning_paths SET steps=? WHERE student_id=?', JSON.stringify(lp.steps), ctx.user.id);
    if (st.done) addPoints(ctx.user.id, 3, 'فعالیت', `انجام گام «${st.title}» در مسیر یادگیری`, `lp:${lp.updated_at}:${st.id}`);
    return { ok: true };
  });

  // ---------- بازی و داستان ----------
  r.post('/api/student/game', S, (ctx) => {
    const game = ['math-rush', 'story'].includes(ctx.body.game) ? ctx.body.game : null;
    if (!game) fail(400, 'بازی نامعتبر');
    const score = Math.max(0, Math.min(100000, Math.round(Number(ctx.body.score) || 0)));
    run('INSERT INTO game_scores (student_id, game, score) VALUES (?,?,?)', ctx.user.id, game, score);
    let reward = 0;
    if (game === 'math-rush' && score >= 50 && addPoints(ctx.user.id, 3, 'فعالیت', 'بازی درسی «مسابقه ذهن سریع»', `game:${ymd()}`)) reward = 3;
    if (game === 'story' && score > 0 && addPoints(ctx.user.id, 5, 'فعالیت', 'پایان داستان تعاملی «راز رصدخانه»', 'story:done')) reward = 5;
    const best = get('SELECT MAX(score) b FROM game_scores WHERE student_id=? AND game=?', ctx.user.id, game).b;
    return { ok: true, reward, best };
  });

  // ---------- آزمون‌های خودسنجی هوشمند (Option 1) ----------
  r.post('/api/student/self-exams', S, (ctx) => {
    const s = studentInfo(ctx.user.id);
    const count = Math.max(3, Math.min(30, Number(ctx.body.count || ctx.body.question_count) || 5));
    const duration = Math.max(5, Math.min(60, Number(ctx.body.duration_minutes) || Math.round(count * 2)));
    const subject = clampStr(ctx.body.subject, 50) || 'عمومی';
    const negative = ctx.body.negative_marking ? 1 : 0;

    const questions = buildSelfExamQuestions({ subject, count, grade: s.grade });
    const title = clampStr(ctx.body.title, 100) || `خودسنجی هوشمند (${subject})`;

    const res = run(`
      INSERT INTO self_exams (student_id, title, subject, duration_minutes, question_count, negative_marking, questions_json, status)
      VALUES (?,?,?,?,?,?,?, 'started')
    `, ctx.user.id, title, subject, duration, questions.length, negative, JSON.stringify(questions));

    return {
      id: res.lastInsertRowid,
      title,
      subject,
      duration_minutes: duration,
      question_count: questions.length,
      negative_marking: !!negative,
      questions: sanitizeQuestionsForStudent(questions),
      created_at: nowIso()
    };
  });

  r.get('/api/student/self-exams', S, (ctx) => {
    return all(`
      SELECT id, title, subject, duration_minutes, question_count, negative_marking,
             score, percentage, correct_count, wrong_count, blank_count, points_awarded,
             status, created_at, finished_at
      FROM self_exams WHERE student_id=? ORDER BY id DESC
    `, ctx.user.id).map((r) => ({
      ...r,
      negative_marking: !!r.negative_marking
    }));
  });

  r.get('/api/student/self-exams/:id', S, (ctx) => {
    const exam = get('SELECT * FROM self_exams WHERE id=? AND student_id=?', Number(ctx.params.id), ctx.user.id);
    if (!exam) fail(404, 'آزمون خودسنجی یافت نشد');
    const questions = JSON.parse(exam.questions_json || '[]');
    const answers = exam.answers_json ? JSON.parse(exam.answers_json) : null;

    if (exam.status === 'completed') {
      const evaluation = evaluateSelfExam(questions, answers || {}, exam.negative_marking === 1);
      return {
        ...exam,
        negative_marking: !!exam.negative_marking,
        questions,
        answers,
        evaluation
      };
    }

    return {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      duration_minutes: exam.duration_minutes,
      question_count: exam.question_count,
      negative_marking: !!exam.negative_marking,
      status: exam.status,
      created_at: exam.created_at,
      questions: sanitizeQuestionsForStudent(questions)
    };
  });

  r.post('/api/student/self-exams/:id/submit', S, (ctx) => {
    const exam = get('SELECT * FROM self_exams WHERE id=? AND student_id=?', Number(ctx.params.id), ctx.user.id);
    if (!exam) fail(404, 'آزمون خودسنجی یافت نشد');
    if (exam.status === 'completed') fail(409, 'پاسخ‌های این آزمون خودسنجی قبلاً ثبت شده است');

    const questions = JSON.parse(exam.questions_json || '[]');
    const answers = (typeof ctx.body.answers === 'object' && ctx.body.answers !== null) ? ctx.body.answers : {};
    const evalResult = evaluateSelfExam(questions, answers, exam.negative_marking === 1);

    // ۱. بررسی اتمام مدت آزمون (+ ۳۰ ثانیه مهلت ارسال)
    const createdMs = new Date(exam.created_at.includes('T') ? exam.created_at : exam.created_at.replace(' ', 'T') + 'Z').getTime();
    const isExpired = Date.now() - createdMs > (exam.duration_minutes * 60 + 30) * 1000;

    // ۲. بررسی سقف روزانه: حداکثر ۳ آزمون دارای امتیاز در یک روز
    const todayPointExams = get(`
      SELECT COUNT(*) n FROM self_exams
      WHERE student_id=? AND points_awarded > 0 AND date(finished_at) = date('now')
    `, ctx.user.id).n;

    if (isExpired || todayPointExams >= 3) {
      evalResult.pointsAwarded = 0;
    }

    tx(() => {
      run(`
        UPDATE self_exams SET
          status = 'completed',
          answers_json = ?,
          score = ?,
          percentage = ?,
          correct_count = ?,
          wrong_count = ?,
          blank_count = ?,
          points_awarded = ?,
          finished_at = datetime('now')
        WHERE id = ?
      `, JSON.stringify(answers), evalResult.score, evalResult.percentage, evalResult.correctCount,
         evalResult.wrongCount, evalResult.blankCount, evalResult.pointsAwarded, exam.id);

      if (evalResult.pointsAwarded > 0) {
        addPoints(ctx.user.id, evalResult.pointsAwarded, 'آزمون', `شرکت در خودسنجی: ${exam.title}`, `self_exam:${exam.id}`);
      }
    });

    return {
      ok: true,
      exam_id: exam.id,
      ...evalResult
    };
  });

  // ---------- نقشه راه گرافیکی سطوح رشد (Option 5) ----------
  r.get('/api/student/roadmap', S, (ctx) => {
    const total = totalPoints(ctx.user.id);
    const curLevel = levelOf(total);
    const badges = [
      { id: 'first_step', title: 'گام نخست', desc: 'اولین مطالعه ثبت‌شده', unlocked: total >= 10, icon: '🎯' },
      { id: 'consistency', title: 'مداومت در یادگیری', desc: 'رسیدن به سطح نهال', unlocked: total >= 100, icon: '🌱' },
      { id: 'sharp_mind', title: 'ذهن پویا', desc: 'رسیدن به سطح شکوفه', unlocked: total >= 250, icon: '💡' },
      { id: 'scholar', title: 'پژوهشگر جوان', desc: 'رسیدن به سطح درخت', unlocked: total >= 450, icon: '📚' },
      { id: 'shining_star', title: 'ستاره برتر کانون', desc: 'رسیدن به سطح ستاره', unlocked: total >= 700, icon: '⭐' },
      { id: 'meteor', title: 'شهاب پرفروغ', desc: 'رسیدن به سطح شهاب', unlocked: total >= 1000, icon: '☄️' },
      { id: 'galaxy', title: 'قهرمان کهکشان', desc: 'رسیدن به سطح کهکشان', unlocked: total >= 1400, icon: '🌌' },
      { id: 'elite', title: 'نخبه کشوری', desc: 'بالاترین تراز و سطح نخبگی کانون', unlocked: total >= 1900, icon: '🏆' }
    ];

    const milestones = LEVELS.map((l, idx) => ({
      level: idx + 1,
      name: l.name,
      min_points: l.min,
      icon: l.icon,
      is_unlocked: total >= l.min,
      is_current: curLevel.index === idx + 1,
      privilege: idx === 0 ? 'ورود به باشگاه دانش‌آموزی' :
                 idx === 1 ? 'نشان ویژه دانش‌آموز کوشا' :
                 idx === 2 ? 'دسترسی کامل به بانک تست‌های تیزهوشان' :
                 idx === 3 ? 'کد تخفیف خرید کتاب‌های کمک‌آموزشی' :
                 idx === 4 ? 'جلسه مشاوره فردی رایگان' :
                 idx === 5 ? 'عضویت در تالار نخبگان کانون' :
                 idx === 6 ? 'تقدیرنامه رسمی و لوح افتخار' : 'مدال طلایی و حمایت تحصیلی ویژه کانون'
    }));

    return {
      current_points: total,
      level: curLevel,
      milestones,
      badges
    };
  });

  // ---------- ثبت نمرات مستمر دستی کلاسی (Option 8) ----------
  r.get('/api/student/manual-scores', S, (ctx) => {
    return all(`
      SELECT m.id, m.subject, m.title, m.score, m.created_at, u.full_name teacher_name, c.name class_name
      FROM manual_scores m
      JOIN users u ON u.id=m.teacher_id
      LEFT JOIN classes c ON c.id=m.class_id
      WHERE m.student_id=? ORDER BY m.id DESC
    `, ctx.user.id);
  });

  // ---------- فاکتورهای بدهی دوره‌ای (Option 10) ----------
  r.get('/api/student/invoices', S, (ctx) => {
    return all(`
      SELECT i.id, i.id invoice_id, i.fee_type, i.period, i.amount, i.paid, i.status, i.created_at,
             COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id=i.id AND p.status='approved'), 0) paid_calc
      FROM fee_invoices i
      WHERE i.student_id=? ORDER BY i.id DESC
    `, ctx.user.id).map((r) => {
      const paid = r.paid ?? r.paid_calc ?? 0;
      const remaining = Math.max(0, r.amount - paid);
      const status = paid >= r.amount ? 'paid' : (paid > 0 ? 'partial' : 'issued');
      return {
        id: r.id,
        invoice_id: r.id,
        fee_type: r.fee_type,
        period: r.period,
        amount: r.amount,
        paid,
        remaining,
        status,
        created_at: r.created_at
      };
    });
  });
}
