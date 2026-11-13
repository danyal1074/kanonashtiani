// مدیریت کلاس‌ها در پنل مدیر کانون:
//   جزئیات کلاس، تغییر نام، حذف امن (با انتقال دانش‌آموزان و ادغام) و «راه‌اندازی پسر/دختر» با پیش‌نمایش.
// افزودن کلاس و تقسیم خودکار در manager.js هستند؛ نرمال‌سازی نام از همین‌جا به آن‌جا می‌رود.
import { all, get, run, tx } from '../db.js';
import { fail, normClassName, classNameKey } from '../util.js';
import { syncStudentsLater } from '../classroom.js';

const M = { roles: ['manager'] };
const GRADES = [4, 5, 6, 7, 8, 9];

export const classNameTaken = (centerId, grade, name, exceptId = null) => {
  const k = classNameKey(name);
  return all('SELECT id, name FROM classes WHERE center_id=? AND grade=?', centerId, grade).some((c) => c.id !== exceptId && classNameKey(c.name) === k);
};

function ownClass(ctx, id) {
  const c = get('SELECT * FROM classes WHERE id=? AND center_id=?', Number(id), ctx.user.center_id);
  if (!c) fail(404, 'کلاس یافت نشد');
  return c;
}
const studentIdsOf = (classId) => all('SELECT user_id FROM students WHERE class_id=?', classId).map((x) => x.user_id);

/** آنچه به یک کلاس وابسته است (برای هشدار پیش از حذف) */
function relatedCounts(classId) {
  const n = (sql) => get(sql, classId).n;
  return {
    schedule: n('SELECT COUNT(*) n FROM schedule WHERE class_id=?'),
    assignments: n('SELECT COUNT(*) n FROM assignments WHERE class_id=?'),
    exams: n('SELECT COUNT(*) n FROM exams WHERE class_id=?'),
    attendance: n('SELECT COUNT(*) n FROM attendance WHERE class_id=?'),
    study_plans: n('SELECT COUNT(*) n FROM study_plans WHERE class_id=?'),
    teachers: n('SELECT COUNT(DISTINCT teacher_id) n FROM teacher_classes WHERE class_id=?'),
  };
}

class DryRun extends Error { constructor(result) { super('dry-run'); this.result = result; } }

export default function register(r) {
  // ---------- جزئیات یک کلاس: فهرست دانش‌آموزان با جنسیت + وابستگی‌ها ----------
  r.get('/api/manager/classes/:id', M, (ctx) => {
    const c = ownClass(ctx, ctx.params.id);
    const students = all(`SELECT u.id, u.full_name, u.gender, u.active FROM users u JOIN students s ON s.user_id=u.id WHERE s.class_id=?`, c.id)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fa'));
    const active = students.filter((s) => s.active);
    return {
      ...c, students,
      counts: { students: active.length, boys: active.filter((s) => s.gender !== 'f').length, girls: active.filter((s) => s.gender === 'f').length, inactive: students.length - active.length },
      related: relatedCounts(c.id),
    };
  });

  // ---------- تغییر نام ----------
  r.put('/api/manager/classes/:id', M, (ctx) => {
    const c = ownClass(ctx, ctx.params.id);
    const name = normClassName(ctx.body.name);
    if (!name) fail(400, 'نام کلاس را وارد کنید');
    if (classNameTaken(ctx.user.center_id, c.grade, name, c.id)) fail(400, 'در این پایه کلاسی با همین نام وجود دارد');
    if (name === c.name) return { ok: true, name, unchanged: true };
    run('UPDATE classes SET name=? WHERE id=?', name, c.id);
    syncStudentsLater(studentIdsOf(c.id)); // نام کلاس در «کلاس آنلاین» هم باید به‌روز شود
    return { ok: true, name };
  });

  // ---------- حذف امن ----------
  // دانش‌آموزدار: ?move_to=<کلاس هم‌پایه> → دانش‌آموزان و سابقهٔ حضور، تکلیف، آزمون، برنامهٔ مطالعه و معلم‌ها به آن کلاس می‌روند (ادغام)
  // اگر برنامهٔ هفتگی/تکلیف/آزمون/حضور بماند و حذف شود، بدون force=1 رد می‌شود (حذف کلاس این‌ها را پاک می‌کند)
  r.del('/api/manager/classes/:id', M, (ctx) => {
    const c = ownClass(ctx, ctx.params.id), cid = ctx.user.center_id;
    const target = ctx.query.move_to ? ownClass(ctx, ctx.query.move_to) : null;
    const ids = studentIdsOf(c.id);
    if (target && target.id === c.id) fail(400, 'کلاس مقصد باید غیر از همین کلاس باشد');
    if (target && target.grade !== c.grade) fail(400, 'کلاس مقصد باید از همین پایه باشد');
    if (ids.length && !target) fail(400, 'این کلاس دانش‌آموز دارد؛ کلاس مقصد را برای انتقال آن‌ها انتخاب کنید');
    const rel = relatedCounts(c.id);
    const lost = target ? { schedule: rel.schedule } : { schedule: rel.schedule, assignments: rel.assignments, exams: rel.exams, attendance: rel.attendance, study_plans: rel.study_plans };
    const LABEL = { schedule: 'جلسهٔ برنامهٔ هفتگی', assignments: 'تکلیف', exams: 'آزمون', attendance: 'سابقهٔ حضور و غیاب', study_plans: 'برنامهٔ مطالعه' };
    const parts = Object.entries(lost).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${LABEL[k]}`);
    if (parts.length && ctx.query.force !== '1') fail(409, `با حذف این کلاس ${parts.join('، ')} هم حذف می‌شود؛ برای ادامه تأیید کنید`);
    tx(() => {
      if (target) {
        run('UPDATE students SET class_id=? WHERE class_id=?', target.id, c.id);
        run('UPDATE OR IGNORE attendance SET class_id=? WHERE class_id=?', target.id, c.id);
        run('UPDATE assignments SET class_id=? WHERE class_id=?', target.id, c.id);
        run('UPDATE exams SET class_id=? WHERE class_id=?', target.id, c.id);
        run('UPDATE OR IGNORE study_plans SET class_id=? WHERE class_id=?', target.id, c.id);
        run('UPDATE OR IGNORE teacher_classes SET class_id=? WHERE class_id=?', target.id, c.id);
      }
      run('DELETE FROM classes WHERE id=? AND center_id=?', c.id, cid);
    });
    if (ids.length) syncStudentsLater(ids);
    return { ok: true, moved: target ? ids.length : 0, to: target ? target.name : null };
  });

  // ---------- راه‌اندازی «پسر / دختر» ----------
  // برای هر پایه: «پسر ۱…n» (تغییر نام «الف») و «دختر ۱…m» (تغییر نام «ب» و در صورت نیاز کلاس‌های تازه).
  // تعداد کلاس هر پایه جدا تعیین می‌شود: grades=[{grade:5, boys:2, girls:2}, …] (یا boys_classes/girls_classes برای همهٔ پایه‌ها).
  // نام‌ها «پسر 1»، «دختر 1»، «دختر 2» با رقم لاتین‌اند تا با جدول زمانی کانون (scripts/import-timetable.mjs) یکی باشند (numbered=false: تک‌کلاس بدون شماره).
  // move='keep'  : دانش‌آموزان در کلاس فعلی می‌مانند؛ فقط اگر برای یک سمت چند کلاس خواسته شده، دانش‌آموزانِ همان سمت بین کلاس‌هایش تقسیم می‌شوند.
  // move='gender': همهٔ پسرها بین کلاس‌های پسر و دخترها بین کلاس‌های دختر قرار می‌گیرند (به‌ترتیب حروف الفبا، یکی در میان) — بر اساس جنسیت ثبت‌شده.
  // dry_run=true : همین تغییرات در یک تراکنش اجرا و برگردانده می‌شود، پس پیش‌نمایش دقیقاً همان نتیجهٔ واقعی است.
  r.post('/api/manager/classes/setup-gender', M, (ctx) => {
    const cid = ctx.user.center_id, b = ctx.body;
    const boysName = normClassName(b.boys_name) || 'پسر', girlsName = normClassName(b.girls_name) || 'دختر';
    const boysFrom = normClassName(b.boys_from ?? 'الف'), girlsFrom = normClassName(b.girls_from ?? 'ب');
    const count = (v) => Math.min(4, Math.max(1, Math.floor(Number(v)) || 1));
    const numbered = b.numbered !== false, move = b.move === 'gender' ? 'gender' : 'keep', copyTeachers = b.copy_teachers !== false, dry = b.dry_run === true;
    let plan;
    if (Array.isArray(b.grades)) plan = b.grades.map((x) => ({ grade: Number(x.grade), boys: count(x.boys), girls: count(x.girls) }));
    else plan = (b.grade ? [Number(b.grade)] : GRADES).map((g) => ({ grade: g, boys: count(b.boys_classes), girls: count(b.girls_classes) }));
    if (!plan.length || plan.some((x) => !GRADES.includes(x.grade)) || new Set(plan.map((x) => x.grade)).size !== plan.length) fail(400, 'پایه نامعتبر است');
    if (classNameKey(boysName) === classNameKey(girlsName)) fail(400, 'نام کلاس پسرها و دخترها باید متفاوت باشد');
    if (boysFrom && classNameKey(boysFrom) === classNameKey(girlsFrom)) fail(400, 'نام فعلی کلاس پسرها و دخترها نمی‌تواند یکی باشد');
    const namesFor = (base, n) => (n === 1 && !numbered ? [base] : Array.from({ length: n }, (_, i) => `${base} ${i + 1}`));

    const result = { ok: true, dry_run: dry, move, summary: { renamed: 0, created: 0, moved: 0, boys: 0, girls: 0 }, grades: [] };
    const apply = () => {
      for (const { grade: g, boys: nB, girls: nG } of plan.sort((x, y) => x.grade - y.grade)) {
        const classes = all('SELECT * FROM classes WHERE center_id=? AND grade=?', cid, g);
        const students = all(`SELECT u.id, u.full_name, u.gender, s.class_id FROM users u JOIN students s ON s.user_id=u.id WHERE u.center_id=? AND u.role='student' AND u.active=1 AND s.grade=?`, cid, g);
        if (!classes.length && !students.length) continue; // پایه‌ای که اصلاً وجود ندارد
        const used = new Set(), planned = [];
        const find = (name) => classes.find((c) => classNameKey(c.name) === classNameKey(name));
        const ensure = (role, target, fromNames) => {
          let c = find(target), action = 'use', from = null;
          if (!c) {
            for (const f of fromNames.filter(Boolean)) {
              const cand = find(f);
              if (cand && !used.has(cand.id)) { c = cand; action = 'rename'; from = cand.name; run('UPDATE classes SET name=? WHERE id=?', target, cand.id); result.summary.renamed++; break; }
            }
          }
          if (!c) { c = { id: Number(run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', cid, g, target).lastInsertRowid), grade: g, name: target }; action = 'create'; result.summary.created++; }
          used.add(c.id); planned.push({ id: c.id, name: target, role, action, from });
          return c;
        };
        // کلاس اول هر سمت: نام فعلی («الف»/«ب») یا شکل بدون شماره/شماره‌دار قبلی («پسر» ↔ «پسر 1») به نام تازه تغییر می‌کند
        const side = (role, base, n, from) => namesFor(base, n).map((nm, i) => ensure(role, nm, i === 0 ? [from, base, `${base} 1`] : []));
        const boys = side('boys', boysName, nB, boysFrom), girls = side('girls', girlsName, nG, girlsFrom);
        if (copyTeachers) for (const [made, group] of [[planned.filter((x) => x.role === 'boys'), boys], [planned.filter((x) => x.role === 'girls'), girls]]) {
          for (const p of made.filter((x) => x.action === 'create')) run('INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id, subject) SELECT teacher_id, ?, subject FROM teacher_classes WHERE class_id=?', p.id, group[0].id);
        }
        // جابه‌جایی دانش‌آموزان
        const byName = (a, c) => a.full_name.localeCompare(c.full_name, 'fa');
        const ids = (group) => new Set(group.map((c) => c.id));
        const boyIds = ids(boys), girlIds = ids(girls);
        const pool = (isGirl, groupIds, n) => (move === 'gender' ? students.filter((s) => (s.gender === 'f') === isGirl) : n > 1 ? students.filter((s) => groupIds.has(s.class_id)) : []).sort(byName);
        let moved = 0;
        const put = (s, classId) => { if (s.class_id !== classId) { run('UPDATE students SET class_id=? WHERE user_id=?', classId, s.id); moved++; } };
        pool(false, boyIds, nB).forEach((s, i) => put(s, boys[i % boys.length].id));
        pool(true, girlIds, nG).forEach((s, i) => put(s, girls[i % girls.length].id));
        result.summary.moved += moved;

        // وضعیت نهایی همین پایه (برای پیش‌نمایش)
        const stat = (id) => get(`SELECT COUNT(*) total, COALESCE(SUM(u.gender='f'),0) girls, COALESCE(SUM(u.gender<>'f' OR u.gender IS NULL),0) boys FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=? AND u.active=1`, id);
        const out = planned.map((p) => ({ ...p, ...stat(p.id) }));
        const wrongG = out.filter((x) => x.role === 'boys').reduce((a, x) => a + x.girls, 0), wrongB = out.filter((x) => x.role === 'girls').reduce((a, x) => a + x.boys, 0);
        const warnings = [];
        if (wrongG) warnings.push(`${wrongG} دانش‌آموز با جنسیت ثبت‌شدهٔ «دختر» در کلاس پسرها است`);
        if (wrongB) warnings.push(`${wrongB} دانش‌آموز با جنسیت ثبت‌شدهٔ «پسر» در کلاس دخترها است`);
        if (move === 'gender' && students.length && !students.some((s) => s.gender === 'f')) warnings.push('در این پایه هیچ دختری ثبت نشده؛ اگر جنسیت‌ها را وارد نکرده‌اید، پیش از جابه‌جایی آن‌ها را اصلاح کنید');
        const others = all('SELECT c.id, c.name, (SELECT COUNT(*) FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=c.id AND u.active=1) students FROM classes c WHERE c.center_id=? AND c.grade=? ORDER BY c.name', cid, g).filter((c) => !used.has(c.id));
        result.summary.boys += out.filter((x) => x.role === 'boys').reduce((a, x) => a + x.total, 0);
        result.summary.girls += out.filter((x) => x.role === 'girls').reduce((a, x) => a + x.total, 0);
        result.grades.push({ grade: g, classes: out, others, warnings, moved, mismatch: wrongG + wrongB });
      }
      if (dry) throw new DryRun(result);
    };
    try { tx(apply); } catch (e) { if (e instanceof DryRun) return e.result; throw e; }
    if (result.summary.renamed || result.summary.created || result.summary.moved) syncStudentsLater(null);
    return result;
  });
}
