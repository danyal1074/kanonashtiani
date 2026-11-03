// پنل والدین
import { all, get } from '../db.js';
import { fail, jMonthOf, JMONTHS } from '../util.js';
import { totalPoints, levelOf, rankOf, subjectScores, announcementsFor, feeStatus } from '../logic.js';
import { classAssignments, studentResults, studyWeek } from './student.js';
import { studentInfo } from './common.js';

const P = { roles: ['parent'] };

function ownChild(ctx) {
  const ok = get('SELECT 1 FROM parent_children WHERE parent_id=? AND student_id=?', ctx.user.id, Number(ctx.params.id));
  if (!ok) fail(403, 'این دانش‌آموز فرزند شما نیست');
  return studentInfo(Number(ctx.params.id));
}

// کارنامه دوره‌ای: میانگین نمره هر درس (از ۲۰) در هر ماه شمسی
function reportCards(sid) {
  const terms = {};
  for (const r of subjectScores(sid)) {
    const [y, m] = jMonthOf(r.date);
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const t = (terms[key] ??= { key, label: `${JMONTHS[m - 1]} ${y}`, subjects: {} });
    for (const [s, v] of Object.entries(r.bySubject)) {
      const x = (t.subjects[s] ??= { total: 0, correct: 0 });
      x.total += v.total; x.correct += v.correct;
    }
  }
  return Object.values(terms).sort((a, b) => a.key.localeCompare(b.key)).map((t) => {
    const subjects = Object.entries(t.subjects).map(([name, v]) => ({ name, score: Math.round((v.correct / v.total) * 200) / 10 }));
    const avg = subjects.length ? Math.round((subjects.reduce((a, s) => a + s.score, 0) / subjects.length) * 100) / 100 : 0;
    return { key: t.key, label: t.label, subjects, avg };
  });
}

export default function register(r) {
  r.get('/api/parent/children/:id', P, (ctx) => {
    const s = ownChild(ctx);
    const cards = reportCards(s.user_id);
    const assignments = classAssignments(s.class_id, s.user_id).slice(0, 15);
    const fakeUser = { id: s.user_id, role: 'student', center_id: ctx.user.center_id };
    const total = totalPoints(s.user_id);
    const fee = feeStatus(s.user_id);
    return {
      info: { id: s.user_id, full_name: s.full_name, grade: s.grade, class_name: s.class_name, school: s.school, avatar: s.avatar },
      points: total, level: levelOf(total), rank: rankOf(ctx.user.center_id, s.grade, s.user_id),
      fee: { status: fee.status, amount: fee.amount, lock_date: fee.lock_date, locked: fee.locked },
      absences: all(`SELECT a.date, a.status, c.name class_name FROM attendance a JOIN classes c ON c.id=a.class_id WHERE a.student_id=? AND a.status<>'present' ORDER BY a.date DESC`, s.user_id),
      attendance: Object.fromEntries(all('SELECT status, COUNT(*) n FROM attendance WHERE student_id=? GROUP BY status', s.user_id).map((x) => [x.status, x.n])),
      cards,
      overallAvg: cards.length ? Math.round((cards.reduce((a, c) => a + c.avg, 0) / cards.length) * 100) / 100 : null,
      results: studentResults(s.user_id).slice(0, 8),
      notes: all('SELECT n.body, n.created_at, u.full_name teacher FROM counsel_notes n LEFT JOIN users u ON u.id=n.teacher_id WHERE n.student_id=? ORDER BY n.id DESC', s.user_id),
      assignments: assignments.map((a) => ({ id: a.id, title: a.title, subject: a.subject, deadline: a.deadline, submitted_at: a.submitted_at, late: a.late })),
      announcements: announcementsFor(fakeUser).slice(0, 10).map((a) => ({ id: a.id, title: a.title, body: a.body, emoji: a.emoji, created_at: a.created_at })),
      study: studyWeek(s.user_id, s.class_id),
      studyDays: all(`SELECT date, SUM(minutes) m FROM pomodoros WHERE student_id=? AND date>=date('now','-13 days') GROUP BY date ORDER BY date`, s.user_id),
    };
  });
}
