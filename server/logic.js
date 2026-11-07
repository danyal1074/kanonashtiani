// منطق دامنه: امتیاز، سطح، رتبه، قفل پنل، اطلاعیه‌ها، مسیر یادگیری، جریمه‌های خودکار
import { all, get, run, tx } from './db.js';
import { ymd, addDays, weekStart, faWeekday, nowIso } from './util.js';

export const LEVELS = [
  { min: 0, name: 'جوانه', icon: '🌱' },
  { min: 100, name: 'نهال', icon: '🌿' },
  { min: 250, name: 'شکوفه', icon: '🌸' },
  { min: 450, name: 'درخت', icon: '🌳' },
  { min: 700, name: 'ستاره', icon: '⭐' },
  { min: 1000, name: 'شهاب', icon: '☄️' },
  { min: 1400, name: 'کهکشان', icon: '🌌' },
  { min: 1900, name: 'نخبه', icon: '🏆' },
];

export function levelOf(total) {
  let i = 0;
  while (i + 1 < LEVELS.length && total >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1];
  const progress = next ? Math.round(((total - cur.min) / (next.min - cur.min)) * 100) : 100;
  return { index: i + 1, ...cur, next: next ? { ...next, need: next.min - total } : null, progress: Math.max(0, progress) };
}

export function addPoints(studentId, amount, category, reason, ref = null) {
  if (ref) {
    const r = run('INSERT OR IGNORE INTO points (student_id, amount, category, reason, ref) VALUES (?,?,?,?,?)', studentId, amount, category, reason, ref);
    return r.changes > 0;
  }
  run('INSERT INTO points (student_id, amount, category, reason) VALUES (?,?,?,?)', studentId, amount, category, reason);
  return true;
}

export const totalPoints = (sid) => get('SELECT COALESCE(SUM(amount),0) t FROM points WHERE student_id=?', sid).t;

export function gradeRanking(centerId, grade) {
  return all(`SELECT u.id, u.full_name, s.avatar, s.class_id, COALESCE(SUM(p.amount),0) total
    FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN points p ON p.student_id=u.id
    WHERE u.center_id=? AND s.grade=? AND u.active=1 GROUP BY u.id ORDER BY total DESC, u.full_name`, centerId, grade);
}

export function rankOf(centerId, grade, sid) {
  const list = gradeRanking(centerId, grade);
  const idx = list.findIndex((r) => r.id === sid);
  return { rank: idx + 1, of: list.length };
}

// Class and center standings follow the same points/name ordering as grade rankings.
export function studentRankings(centerId, classId, studentId) {
  const students = all(`SELECT u.id, s.class_id, COALESCE(SUM(p.amount), 0) total
    FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN points p ON p.student_id=u.id
    WHERE u.center_id=? AND u.active=1 GROUP BY u.id ORDER BY total DESC, u.full_name, u.id`, centerId);
  const standing = rows => {
    const index = rows.findIndex(row => row.id === studentId);
    return { rank: index < 0 ? null : index + 1, of: rows.length };
  };
  return {
    class: standing(classId == null ? [] : students.filter(row => row.class_id === classId)),
    center: standing(students),
  };
}

// ---------- حق عضویت و قفل ----------
export function feeStatus(sid) {
  const st = get('SELECT s.grade, u.center_id FROM students s JOIN users u ON u.id=s.user_id WHERE s.user_id=?', sid);
  if (!st) return null;
  const fee = get('SELECT amount, lock_date FROM fee_settings WHERE center_id=? AND grade=?', st.center_id, st.grade) || { amount: 0, lock_date: null };
  const sysFee = fee.amount ? (get('SELECT system_fee FROM centers WHERE id=?', st.center_id)?.system_fee ?? 0) : 0;
  const pays = all('SELECT id, amount, system_fee, status, reject_reason, receipt_path, created_at, reviewed_at FROM payments WHERE student_id=? AND invoice_id IS NULL ORDER BY id DESC', sid);
  const activePays = pays.filter((p) => p.status !== 'reversed');
  let status = 'unpaid';
  if (activePays.some((p) => p.status === 'approved')) status = 'paid';
  else if (activePays.some((p) => p.status === 'pending')) status = 'pending';
  else if (activePays.length && activePays[0].status === 'rejected') status = 'rejected';
  if (!fee.amount) status = status === 'unpaid' || status === 'rejected' ? 'free' : status;
  const deadlinePassed = !!fee.lock_date && ymd() > fee.lock_date;
  const locked = deadlinePassed && !['paid', 'free'].includes(status);
  return { grade: st.grade, amount: fee.amount, system_fee: sysFee, total: fee.amount + sysFee, lock_date: fee.lock_date, status, locked, payments: pays };
}

export function recalcInvoice(invoiceId) {
  if (!invoiceId) return null;
  const inv = get('SELECT id, amount FROM fee_invoices WHERE id=?', invoiceId);
  if (!inv) return null;
  const approvedSum = get("SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE invoice_id=? AND status='approved'", invoiceId)?.s || 0;
  const status = approvedSum >= inv.amount ? 'paid' : (approvedSum > 0 ? 'partial' : 'issued');
  run('UPDATE fee_invoices SET paid=?, status=? WHERE id=?', approvedSum, status, inv.id);
  return { id: inv.id, paid: approvedSum, status, remaining: Math.max(0, inv.amount - approvedSum) };
}

// ---------- اطلاعیه‌ها ----------
function parseTarget(a) {
  try { return JSON.parse(a.target_value || '[]'); } catch { return []; }
}
export function audienceMatcher(user) {
  if (user.role === 'student') {
    const s = get('SELECT grade, class_id FROM students WHERE user_id=?', user.id);
    return (a) => a.target_type === 'all' || (a.target_type === 'grade' && parseTarget(a).includes(s.grade)) || (a.target_type === 'classes' && parseTarget(a).includes(s.class_id));
  }
  if (user.role === 'parent') {
    const kids = all('SELECT s.grade, s.class_id FROM parent_children pc JOIN students s ON s.user_id=pc.student_id WHERE pc.parent_id=?', user.id);
    return (a) => a.target_type === 'all' || kids.some((k) => (a.target_type === 'grade' && parseTarget(a).includes(k.grade)) || (a.target_type === 'classes' && parseTarget(a).includes(k.class_id)));
  }
  if (user.role === 'teacher') {
    const cls = all('SELECT DISTINCT c.id, c.grade FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=?', user.id);
    return (a) => a.target_type === 'all' || cls.some((c) => (a.target_type === 'grade' && parseTarget(a).includes(c.grade)) || (a.target_type === 'classes' && parseTarget(a).includes(c.id)));
  }
  return (a) => user.role === 'manager' || (user.role === 'counselor' && a.target_type === 'all');
}
export function announcementsFor(user) {
  const list = all(`SELECT a.*, v.seen_at FROM announcements a LEFT JOIN announcement_views v ON v.announcement_id=a.id AND v.user_id=?
    WHERE a.center_id=? ORDER BY a.id DESC`, user.id, user.center_id);
  const match = audienceMatcher(user);
  return list.filter(match);
}
// مخاطبان یک اطلاعیه: دانش‌آموزان هدف + والدینشان (+ معلمان در حالت کل کانون)
export function announcementAudience(a) {
  const t = parseTarget(a);
  let students;
  if (a.target_type === 'all') students = all(`SELECT u.id FROM users u WHERE u.center_id=? AND u.role='student' AND u.active=1`, a.center_id);
  else if (a.target_type === 'grade') students = all(`SELECT u.id FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.active=1 AND s.grade IN (${t.map(() => '?').join(',') || 'NULL'})`, a.center_id, ...t);
  else students = all(`SELECT u.id FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.active=1 AND s.class_id IN (${t.map(() => '?').join(',') || 'NULL'})`, a.center_id, ...t);
  const ids = students.map((s) => s.id);
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const rows = all(`SELECT u.id, u.full_name, u.role, s.grade, c.name class_name, v.seen_at
    FROM users u LEFT JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN announcement_views v ON v.announcement_id=? AND v.user_id=u.id WHERE u.id IN (${ph})`, a.id, ...ids);
  const parents = all(`SELECT DISTINCT u.id, u.full_name, u.role, v.seen_at, (SELECT GROUP_CONCAT(su.full_name,'، ') FROM parent_children p2 JOIN users su ON su.id=p2.student_id WHERE p2.parent_id=u.id) children
    FROM parent_children pc JOIN users u ON u.id=pc.parent_id LEFT JOIN announcement_views v ON v.announcement_id=? AND v.user_id=u.id
    WHERE pc.student_id IN (${ph})`, a.id, ...ids);
  let teachers = [];
  if (a.target_type === 'all') teachers = all(`SELECT u.id, u.full_name, u.role, v.seen_at FROM users u LEFT JOIN announcement_views v ON v.announcement_id=? AND v.user_id=u.id WHERE u.center_id=? AND u.role='teacher' AND u.active=1`, a.id, a.center_id);
  return [...rows, ...parents, ...teachers];
}

// ---------- آزمون ----------
export function gradeExam(questions, answers) {
  let correct = 0, wrong = 0, blank = 0;
  const bySubject = {};
  questions.forEach((q, i) => {
    const a = answers[i];
    const subj = q.subject || 'عمومی';
    bySubject[subj] ??= { total: 0, correct: 0 };
    bySubject[subj].total++;
    if (a === null || a === undefined || a < 0) blank++;
    else if (a === q.answer) { correct++; bySubject[subj].correct++; }
    else wrong++;
  });
  const percent = questions.length ? Math.round((correct / questions.length) * 1000) / 10 : 0;
  return { correct, wrong, blank, percent, bySubject };
}
export const examPoints = (percent) => Math.round(percent / 10) + (percent >= 100 ? 5 : 0);

export function saveExamResult(exam, studentId, answers, source) {
  const questions = JSON.parse(exam.questions);
  const g = gradeExam(questions, answers);
  const pts = examPoints(g.percent);
  tx(() => {
    run(`INSERT INTO exam_results (exam_id, student_id, answers, correct, wrong, blank, percent, points, source) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(exam_id, student_id) DO UPDATE SET answers=excluded.answers, correct=excluded.correct, wrong=excluded.wrong, blank=excluded.blank, percent=excluded.percent, points=excluded.points, source=excluded.source, created_at=datetime('now')`,
    exam.id, studentId, JSON.stringify(answers), g.correct, g.wrong, g.blank, g.percent, pts, source);
    run('DELETE FROM points WHERE student_id=? AND ref=?', studentId, `exam:${exam.id}`);
    if (pts > 0) addPoints(studentId, pts, 'آزمون', `نتیجه آزمون «${exam.title}» (${g.percent}٪)`, `exam:${exam.id}`);
  });
  const rank = get('SELECT COUNT(*)+1 r FROM exam_results WHERE exam_id=? AND percent>?', exam.id, g.percent).r;
  const of = get('SELECT COUNT(*) n FROM exam_results WHERE exam_id=?', exam.id).n;
  return { ...g, points: pts, rank, of };
}

// نمره هر درس (از ۲۰) به تفکیک ماه برای کارنامه و نمودار پیشرفت
export function subjectScores(sid, sinceDate = null) {
  const rows = all(`SELECT r.answers, r.created_at, e.questions, e.subject FROM exam_results r JOIN exams e ON e.id=r.exam_id WHERE r.student_id=? ${sinceDate ? 'AND r.created_at>=?' : ''} ORDER BY r.created_at`, ...(sinceDate ? [sid, sinceDate] : [sid]));
  return rows.map((r) => {
    const qs = JSON.parse(r.questions).map((q) => ({ ...q, subject: q.subject || r.subject || 'عمومی' }));
    return { date: r.created_at.slice(0, 10), ...gradeExam(qs, JSON.parse(r.answers)) };
  });
}

// ---------- مسیر یادگیری هوشمند (موتور پیشنهاد قاعده‌محور) ----------
export function generateLearningPath(sid) {
  const since = addDays(ymd(), -60);
  const perf = {};
  for (const r of subjectScores(sid, since)) for (const [s, v] of Object.entries(r.bySubject)) {
    perf[s] ??= { total: 0, correct: 0 };
    perf[s].total += v.total; perf[s].correct += v.correct;
  }
  const study = Object.fromEntries(all(`SELECT subject, SUM(minutes) m FROM pomodoros WHERE student_id=? AND date>=? GROUP BY subject`, sid, addDays(ymd(), -14)).map((r) => [r.subject, r.m]));
  const absences = get(`SELECT COUNT(*) n FROM attendance WHERE student_id=? AND status='absent' AND date>=?`, sid, addDays(ymd(), -30)).n;
  const late = get(`SELECT COUNT(*) n FROM points WHERE student_id=? AND ref LIKE 'late:%' AND created_at>=?`, sid, addDays(ymd(), -30)).n;

  const subjects = Object.entries(perf).map(([s, v]) => ({ s, pct: Math.round((v.correct / v.total) * 100), study: study[s] || 0 }))
    .sort((a, b) => a.pct - b.pct);
  const steps = [];
  let n = 1;
  const push = (o) => steps.push({ id: n++, done: false, ...o });
  const weak = subjects.filter((x) => x.pct < 70).slice(0, 3);
  const strong = subjects.filter((x) => x.pct >= 85).slice(-1);
  for (const w of weak) {
    push({ kind: 'review', subject: w.s, title: `مرور مفهومی ${w.s}`, detail: `تسلط فعلی ${w.pct}٪ است. ${w.pct < 50 ? '۴' : '۳'} پومودوروی ۲۵ دقیقه‌ای روی درسنامه و مثال‌های حل‌شده ${w.s} بگذار.` });
    push({ kind: 'practice', subject: w.s, title: `تمرین هدفمند ${w.s}`, detail: `۱۵ تست سطح متوسط از مبحثی که در آزمون آخر اشتباه زدی حل کن و پاسخ‌های غلط را در دفتر خطا بنویس.` });
  }
  if (!weak.length && subjects.length) push({ kind: 'practice', subject: subjects[0].s, title: `تثبیت ${subjects[0].s}`, detail: `عملکردت خوب است (${subjects[0].pct}٪). با ۱۰ تست ترکیبی آن را تثبیت کن.` });
  for (const s of strong) push({ kind: 'challenge', subject: s.s, title: `چالش المپیادی ${s.s}`, detail: `در ${s.s} می‌درخشی (${s.pct}٪)! هفته‌ای ۲ مسئله چالشی سطح المپیاد حل کن.` });
  const neglected = subjects.filter((x) => x.study < 50).slice(0, 1);
  for (const x of neglected) push({ kind: 'habit', subject: x.s, title: `زمان مطالعه ${x.s} را بیشتر کن`, detail: `در دو هفته اخیر فقط ${x.study} دقیقه ${x.s} خوانده‌ای. روزی یک پومودورو کافی است.` });
  if (late > 0) push({ kind: 'habit', title: 'برنامه‌ریزی تکالیف', detail: `${late} تکلیف دیر ارسال شده. هر شب ۵ دقیقه فهرست تکالیف را چک کن و کار نزدیک‌ترین مهلت را اول انجام بده.` });
  if (absences > 1) push({ kind: 'habit', title: 'حضور منظم در کلاس', detail: `${absences} غیبت در ماه اخیر داشتی. جبران جلسات جا مانده را با دیدن ویدیوی همان جلسه شروع کن.` });
  if (!steps.length) push({ kind: 'practice', title: 'شروع مسیر', detail: 'در اولین آزمون آنلاین شرکت کن تا مسیر یادگیری شخصی‌ات ساخته شود.' });
  push({ kind: 'challenge', title: 'آزمونک پایان هفته', detail: 'آخر هفته در آزمون آنلاین شرکت کن تا پیشرفتت سنجیده و مسیر به‌روز شود.' });

  const summary = subjects.length
    ? `نقاط قوت: ${subjects.filter((x) => x.pct >= 75).map((x) => x.s).join('، ') || '—'} | نیاز به تمرین: ${weak.map((x) => x.s).join('، ') || '—'}`
    : 'هنوز داده آزمونی کافی وجود ندارد.';
  return { steps, summary, insights: subjects };
}

export function ensureLearningPath(sid) {
  let lp = get('SELECT * FROM learning_paths WHERE student_id=?', sid);
  if (!lp) {
    const g = generateLearningPath(sid);
    run('INSERT INTO learning_paths (student_id, steps, summary) VALUES (?,?,?)', sid, JSON.stringify(g.steps), g.summary);
    lp = get('SELECT * FROM learning_paths WHERE student_id=?', sid);
  }
  return { ...lp, steps: JSON.parse(lp.steps) };
}

// ---------- پیام‌رسان: مخاطبان مجاز (بدون نمایش شماره تلفن) ----------
export function contactsOf(user) {
  const counselors = all(`SELECT id, full_name name, 'counselor' role, 'مشاور تحصیلی' sub FROM users WHERE center_id=? AND role='counselor' AND active=1 AND id<>? ORDER BY full_name`, user.center_id, user.id);
  if (user.role === 'counselor') return all(`SELECT u.id,u.full_name name,u.role,s.avatar,CASE u.role WHEN 'student' THEN 'دانش‌آموز' WHEN 'teacher' THEN 'دبیر' WHEN 'manager' THEN 'مدیر کانون' WHEN 'counselor' THEN 'مشاور تحصیلی' ELSE 'ولی دانش‌آموز' END sub FROM users u LEFT JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.active=1 AND u.id<>? AND u.role IN ('student','teacher','manager','parent','counselor') ORDER BY u.full_name`, user.center_id, user.id);
  if (user.role === 'student') {
    const s = get('SELECT class_id FROM students WHERE user_id=?', user.id);
    const teachers = all(`SELECT DISTINCT u.id, u.full_name name, 'teacher' role, GROUP_CONCAT(DISTINCT tc.subject) sub FROM teacher_classes tc JOIN users u ON u.id=tc.teacher_id WHERE tc.class_id=? GROUP BY u.id`, s?.class_id ?? -1);
    const mates = all(`SELECT u.id, u.full_name name, 'student' role, st.avatar, 'هم‌کلاسی' sub FROM students st JOIN users u ON u.id=st.user_id WHERE st.class_id=? AND u.id<>? AND u.active=1 ORDER BY u.full_name`, s?.class_id ?? -1, user.id);
    const managers = all(`SELECT id, full_name name, 'manager' role, 'مدیر کانون' sub FROM users WHERE center_id=? AND role='manager' AND active=1`, user.center_id);
    return [...counselors, ...managers, ...teachers.map((t) => ({ ...t, sub: `دبیر ${t.sub}` })), ...mates];
  }
  if (user.role === 'parent') {
    const managers = all(`SELECT id, full_name name, 'manager' role, 'مدیر کانون' sub FROM users WHERE center_id=? AND role='manager' AND active=1`, user.center_id);
    const teachers = all(`SELECT DISTINCT u.id, u.full_name name, 'teacher' role, 'دبیر ' || GROUP_CONCAT(DISTINCT tc.subject) sub FROM parent_children pc JOIN students s ON s.user_id=pc.student_id
      JOIN teacher_classes tc ON tc.class_id=s.class_id JOIN users u ON u.id=tc.teacher_id WHERE pc.parent_id=? GROUP BY u.id`, user.id);
    return [...counselors, ...managers, ...teachers];
  }
  if (user.role === 'teacher') {
    const students = all(`SELECT DISTINCT u.id, u.full_name name, 'student' role, st.avatar, 'کلاس ' || c.name || ' - پایه ' || c.grade sub FROM teacher_classes tc JOIN students st ON st.class_id=tc.class_id
      JOIN users u ON u.id=st.user_id JOIN classes c ON c.id=st.class_id WHERE tc.teacher_id=? AND u.active=1 ORDER BY c.grade, u.full_name`, user.id);
    const parents = all(`SELECT DISTINCT p.id, p.full_name name, 'parent' role, 'ولیِ ' || u.full_name sub FROM teacher_classes tc JOIN students st ON st.class_id=tc.class_id
      JOIN users u ON u.id=st.user_id JOIN parent_children pc ON pc.student_id=u.id JOIN users p ON p.id=pc.parent_id WHERE tc.teacher_id=? ORDER BY p.full_name`, user.id);
    const managers = all(`SELECT id, full_name name, 'manager' role, 'مدیر کانون' sub FROM users WHERE center_id=? AND role='manager'`, user.center_id);
    return [...counselors, ...managers, ...students, ...parents];
  }
  if (user.role === 'manager') {
    const teachers = all(`SELECT id, full_name name, 'teacher' role, 'دبیر' sub FROM users WHERE center_id=? AND role='teacher' AND active=1 ORDER BY full_name`, user.center_id);
    const messagedUsers = all(`
      SELECT DISTINCT u.id, u.full_name name, u.role,
             CASE WHEN u.role='student' THEN st.avatar ELSE NULL END avatar,
             CASE WHEN u.role='student' THEN 'دانش‌آموز' ELSE 'ولی دانش‌آموز' END sub
      FROM users u
      LEFT JOIN students st ON st.user_id=u.id
      WHERE u.center_id=? AND u.role IN ('student', 'parent') AND u.active=1
        AND (
          u.id IN (SELECT to_id FROM messages WHERE from_id=?)
          OR u.id IN (SELECT from_id FROM messages WHERE to_id=?)
        )
      ORDER BY u.full_name
    `, user.center_id, user.id, user.id);
    return [...counselors, ...teachers, ...messagedUsers];
  }
  return [];
}

// ---------- کار زمان‌بندی‌شده: جریمه‌های خودکار (تکرارناپذیر با ref) ----------
export function runPenaltyJob() {
  const today = ymd();
  const now = nowIso();
  let applied = 0;
  tx(() => {
    // ۱) تکالیف دیرشده
    const overdue = all(`SELECT a.id, a.title, a.class_id FROM assignments a WHERE a.deadline < ? AND a.deadline > ?`, now, addDays(today, -30) + 'T00:00:00Z');
    for (const a of overdue) {
      const missing = all(`SELECT st.user_id id FROM students st JOIN users u ON u.id=st.user_id WHERE st.class_id=? AND u.active=1 AND u.created_at < (SELECT deadline FROM assignments WHERE id=?)
        AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id=? AND s.student_id=st.user_id AND s.late=0)`, a.class_id, a.id, a.id);
      for (const m of missing) if (addPoints(m.id, -5, 'تکلیف دیرشده', `ارسال‌نکردن به‌موقع تکلیف «${a.title}»`, `late:${a.id}`)) applied++;
    }
    // ۲) مطالعه کمتر از حداقل (سه روز گذشته، به‌جز جمعه)
    for (let back = 1; back <= 3; back++) {
      const d = addDays(today, -back);
      if (faWeekday(d) === 6) continue;
      const low = all(`SELECT u.id, c.min_daily_study mn, COALESCE((SELECT SUM(minutes) FROM pomodoros p WHERE p.student_id=u.id AND p.date=?),0) m
        FROM users u JOIN centers c ON c.id=u.center_id WHERE u.role='student' AND u.active=1 AND date(u.created_at) < ?`, d, d);
      for (const r of low) if (r.m < r.mn && addPoints(r.id, -3, 'مطالعه کم', `مطالعه ${r.m} دقیقه‌ای در ${d} (کمتر از حداقل ${r.mn} دقیقه)`, `lowstudy:${d}`)) applied++;
    }
    // ۳) اجرا نکردن برنامه مطالعه هفته گذشته
    const lastWeek = addDays(weekStart(today), -7);
    const plans = all(`SELECT class_id, subject, target FROM study_plans WHERE week_start=?`, lastWeek);
    const byClass = {};
    for (const p of plans) (byClass[p.class_id] ??= []).push(p);
    for (const [cid, ps] of Object.entries(byClass)) {
      const students = all(`SELECT user_id id FROM students st JOIN users u ON u.id=st.user_id WHERE class_id=? AND u.active=1 AND date(u.created_at) < ?`, cid, lastWeek);
      for (const s of students) {
        const done = Object.fromEntries(all(`SELECT subject, COUNT(*) n FROM pomodoros WHERE student_id=? AND date>=? AND date<? GROUP BY subject`, s.id, lastWeek, addDays(lastWeek, 7)).map((r) => [r.subject, r.n]));
        const target = ps.reduce((x, p) => x + p.target, 0);
        const got = ps.reduce((x, p) => x + Math.min(done[p.subject] || 0, p.target), 0);
        if (got < target && addPoints(s.id, -10, 'برنامه مطالعه', `اجرای ${got} از ${target} پومودوروی برنامه هفتگی`, `plan:${lastWeek}`)) applied++;
      }
    }
    // ۴) پرداخت نشدن حق عضویت پس از مهلت
    const fees = all(`SELECT center_id, grade, lock_date FROM fee_settings WHERE lock_date IS NOT NULL AND lock_date < ? AND amount>0`, today);
    for (const f of fees) {
      const unpaid = all(`SELECT u.id FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND s.grade=? AND u.active=1 AND date(u.created_at) <= ?
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_id=u.id AND p.invoice_id IS NULL AND p.status='approved')`, f.center_id, f.grade, f.lock_date);
      for (const u of unpaid) if (addPoints(u.id, -20, 'حق عضویت', 'پرداخت نشدن حق عضویت پس از پایان مهلت', `fee:${f.lock_date}`)) applied++;
    }
  });
  return applied;
}
