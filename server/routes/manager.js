// پنل مدیر کانون
import { all, get, run, tx } from '../db.js';
import { fail, ymd, addDays, clampStr, hashPassword, isValidNationalCode, toEnDigits, j2g, jMonthOf, JMONTHS, saveUpload } from '../util.js';
import { feeStatus, announcementAudience, saveExamResult } from '../logic.js';
import { importStudents } from '../importer.js';
import { sendSms, smsProvider } from '../sms.js';
import { parseQuestions, examWithResults, performanceList, studentDetail } from './teacher.js';

const M = { roles: ['manager'] };
const GRADES = [4, 5, 6, 7, 8, 9];
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
  const national_code = toEnDigits(clampStr(b.national_code, 10));
  const parent_phone = toEnDigits(clampStr(b.parent_phone, 11));
  if (!full_name) fail(400, 'نام و نام خانوادگی را وارد کنید');
  if (!isValidNationalCode(national_code)) fail(400, 'کد ملی ۱۰ رقمی معتبر نیست');
  if (!/^09\d{9}$/.test(parent_phone)) fail(400, 'شماره موبایل والدین باید ۱۱ رقم و با ۰۹ شروع شود');
  const grade = Number(b.grade);
  if (!GRADES.includes(grade)) fail(400, 'پایه باید بین چهارم تا نهم باشد');
  const cls = b.class_id ? ownClass(ctx, b.class_id) : null;
  if (cls && cls.grade !== grade) fail(400, 'کلاس انتخابی با پایه همخوانی ندارد');
  if (b.birth_date && !isDate(b.birth_date)) fail(400, 'تاریخ تولد نامعتبر است');
  const dup = get(`SELECT id FROM users WHERE role='student' AND national_code=? AND id<>?`, national_code, existingId ?? -1);
  if (dup) fail(400, 'دانش‌آموزی با این کد ملی قبلاً ثبت شده است');
  return { full_name, national_code, parent_phone, grade, class_id: cls?.id ?? null, school: clampStr(b.school, 100), birth_date: b.birth_date || null,
    address: clampStr(b.address, 300), gender: b.gender === 'f' ? 'f' : 'm' };
}

function linkParent(ctx, studentId, phone, studentName) {
  let p = get(`SELECT id FROM users WHERE role='parent' AND mobile=?`, phone);
  let created = false;
  if (!p) {
    const r = run(`INSERT INTO users (center_id, role, mobile, pass_hash, full_name) VALUES (?,?,?,?,?)`, ctx.user.center_id, 'parent', phone, hashPassword(phone.slice(-6)), `ولیِ ${studentName}`);
    p = { id: Number(r.lastInsertRowid) };
    created = true;
  }
  run('DELETE FROM parent_children WHERE student_id=?', studentId);
  run('INSERT OR IGNORE INTO parent_children (parent_id, student_id) VALUES (?,?)', p.id, studentId);
  return created;
}

function paymentStateSql() {
  return `CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.student_id=u.id AND p.status='approved') THEN 'paid'
    WHEN EXISTS (SELECT 1 FROM payments p WHERE p.student_id=u.id AND p.status='pending') THEN 'pending' ELSE 'unpaid' END`;
}

export default function register(r) {
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
    const rows = all(`SELECT a.id, a.date, u.full_name, s.parent_phone, c.name class_name, c.grade FROM attendance a JOIN classes c ON c.id=a.class_id
      JOIN users u ON u.id=a.student_id JOIN students s ON s.user_id=u.id
      WHERE c.center_id=? AND a.status='absent' AND a.sms_sent=0 AND ${ctx.params.id === 'all' ? 'a.date=?' : 'a.id=?'}`, cid, ctx.params.id === 'all' ? ymd() : Number(ctx.params.id));
    const center = get('SELECT name FROM centers WHERE id=?', cid);
    const result = { ok: true, sent: 0, failed: 0, simulated: smsProvider() === 'simulated', errors: [] };
    // ارسال با هم‌زمانی ۵ تایی؛ فقط پیامک‌های موفق علامت «ارسال‌شده» می‌گیرند و ناموفق‌ها قابل تلاش دوباره می‌مانند
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.all(rows.slice(i, i + 5).map(async (a) => {
        const [jy, jm, jd] = jMonthOf(a.date);
        const text = `${center.name}: ${a.full_name} امروز (${jy}/${jm}/${jd}) در کلاس ${a.class_name} غایب بود.`;
        const r = await sendSms(a.parent_phone, text, { center_id: cid, student_id: a.user_id || a.id, message_type: 'absence' });
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
    const w = where.join(' AND ');
    const total = get(`SELECT COUNT(*) n FROM users u JOIN students s ON s.user_id=u.id WHERE ${w}`, ...p).n;
    const limit = Math.min(100, Number(q.limit) || 30), offset = Math.max(0, Number(q.offset) || 0);
    const rows = all(`SELECT u.id, u.full_name, u.national_code, u.gender, s.school, s.grade, s.class_id, c.name class_name, s.birth_date, s.parent_phone, s.address, s.avatar,
      ${paymentStateSql()} pay FROM users u JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id WHERE ${w} ORDER BY s.grade, c.name, u.full_name LIMIT ? OFFSET ?`, ...p, limit, offset);
    return { total, rows };
  });
  r.get('/api/manager/students/:id', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    return { ...studentDetail({ id: s.id, full_name: s.full_name, national_code: s.national_code, grade: s.grade, class_id: s.class_id, class_name: s.class_name, school: s.school, avatar: s.avatar, birth_date: s.birth_date, center_id: s.center_id }), fee: feeStatus(s.id) };
  });
  r.post('/api/manager/students', M, (ctx) => {
    const d = studentPayload(ctx, ctx.body);
    let parentCreated;
    const id = tx(() => {
      const res = run(`INSERT INTO users (center_id, role, national_code, pass_hash, full_name, gender) VALUES (?,?,?,?,?,?)`, ctx.user.center_id, 'student', d.national_code, hashPassword(d.national_code), d.full_name, d.gender);
      const uid = Number(res.lastInsertRowid);
      run('INSERT INTO students (user_id, school, grade, class_id, birth_date, parent_phone, address, avatar) VALUES (?,?,?,?,?,?,?,?)', uid, d.school, d.grade, d.class_id, d.birth_date, d.parent_phone, d.address, 'sprout');
      parentCreated = linkParent(ctx, uid, d.parent_phone, d.full_name);
      return uid;
    });
    return { ok: true, id, credentials: { student: `نام کاربری و رمز اولیه دانش‌آموز: کد ملی (${d.national_code})`, parent: parentCreated ? `ورود والدین با موبایل ${d.parent_phone} و رمز اولیه: ۶ رقم آخر موبایل` : 'والد از قبل ثبت شده بود و فرزند به حسابش اضافه شد' } };
  });
  // ثبت‌نام گروهی از CSV؛ با dry_run فقط اعتبارسنجی و گزارش خطای هر سطر بدون ثبت
  r.post('/api/manager/students/import', M, async (ctx) => {
    const csv = String(ctx.body.csv || '');
    if (!csv.trim()) fail(400, 'فایل CSV خالی است');
    try { return await importStudents(ctx.user.center_id, csv, { dryRun: !!ctx.body.dry_run }); } catch (e) { fail(400, e.message); }
  });
  r.put('/api/manager/students/:id', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    const d = studentPayload(ctx, ctx.body, s.id);
    tx(() => {
      run('UPDATE users SET full_name=?, national_code=?, gender=? WHERE id=?', d.full_name, d.national_code, d.gender, s.id);
      run('UPDATE students SET school=?, grade=?, class_id=?, birth_date=?, parent_phone=?, address=? WHERE user_id=?', d.school, d.grade, d.class_id, d.birth_date, d.parent_phone, d.address, s.id);
      if (d.parent_phone !== s.parent_phone) linkParent(ctx, s.id, d.parent_phone, d.full_name);
    });
    return { ok: true };
  });
  r.del('/api/manager/students/:id', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    tx(() => {
      run('DELETE FROM users WHERE id=?', s.id);
      // حذف والد بدون فرزند
      run(`DELETE FROM users WHERE role='parent' AND center_id=? AND NOT EXISTS (SELECT 1 FROM parent_children pc WHERE pc.parent_id=users.id)`, ctx.user.center_id);
    });
    return { ok: true };
  });
  r.post('/api/manager/students/:id/reset-password', M, (ctx) => {
    const s = ownStudent(ctx, ctx.params.id);
    run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(s.national_code), s.id);
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
    run('INSERT INTO schedule (class_id, weekday, start, end, subject, teacher_id, room) VALUES (?,?,?,?,?,?,?)', c.id, wd, b.start, b.end, clampStr(b.subject, 40), tid ?? null, clampStr(b.room, 30));
    return { ok: true };
  });
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
    return { settings: GRADES.map((g) => set[g] || { grade: g, amount: 0, lock_date: null }), classes };
  });
  r.put('/api/manager/fees', M, (ctx) => {
    tx(() => {
      for (const f of ctx.body.settings || []) {
        if (!GRADES.includes(Number(f.grade))) continue;
        if (f.lock_date && !isDate(f.lock_date)) fail(400, 'تاریخ قفل نامعتبر است');
        run(`INSERT INTO fee_settings (center_id, grade, amount, lock_date) VALUES (?,?,?,?) ON CONFLICT(center_id, grade) DO UPDATE SET amount=excluded.amount, lock_date=excluded.lock_date`,
          ctx.user.center_id, Number(f.grade), Math.max(0, Math.round(Number(f.amount) || 0)), f.lock_date || null);
      }
    });
    return { ok: true };
  });
  r.get('/api/manager/fees/class/:id', M, (ctx) => {
    const c = ownClass(ctx, ctx.params.id);
    return all(`SELECT u.id, u.full_name, s.avatar, ${paymentStateSql()} st FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=? AND u.active=1 ORDER BY st DESC, u.full_name`, c.id);
  });
  r.get('/api/manager/receipts', M, (ctx) => {
    const status = ['pending', 'approved', 'rejected'].includes(ctx.query.status) ? ctx.query.status : 'pending';
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
      run(`UPDATE payments SET status='approved', reviewed_at=datetime('now') WHERE id=?`, p.id);
      run(`INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)`, ctx.user.center_id, 'income', p.amount, `حق عضویت - ${p.full_name}`, 'حق عضویت', ymd(), `pay:${p.id}`);
      run(`DELETE FROM points WHERE student_id=? AND ref LIKE 'fee:%'`, p.student_id);
    });
    return { ok: true };
  });
  r.post('/api/manager/receipts/:id/reject', M, (ctx) => {
    const p = ownPayment(ctx);
    const reason = clampStr(ctx.body.reason, 200);
    if (!reason) fail(400, 'علت رد رسید را مشخص کنید');
    run(`UPDATE payments SET status='rejected', reject_reason=?, reviewed_at=datetime('now') WHERE id=?`, reason, p.id);
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
  r.post('/api/manager/announcements', M, (ctx) => {
    const b = ctx.body;
    const title = clampStr(b.title, 150), body = clampStr(b.body, 4000);
    if (!title || !body) fail(400, 'عنوان و متن اطلاعیه را وارد کنید');
    const type = ['all', 'grade', 'classes'].includes(b.target_type) ? b.target_type : 'all';
    let value = (b.target_value || []).map(Number);
    if (type === 'grade') value = value.filter((g) => GRADES.includes(g));
    if (type === 'classes') value = value.filter((id) => get('SELECT 1 FROM classes WHERE id=? AND center_id=?', id, ctx.user.center_id));
    if (type !== 'all' && !value.length) fail(400, 'مخاطبان اطلاعیه را انتخاب کنید');
    run('INSERT INTO announcements (center_id, title, body, emoji, target_type, target_value, author_id) VALUES (?,?,?,?,?,?,?)',
      ctx.user.center_id, title, body, clampStr(b.emoji, 8) || '📢', type, JSON.stringify(value), ctx.user.id);
    return { ok: true };
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
      run(`UPDATE payments SET status='rejected', reversed_at=datetime('now'), reversed_by=?, reverse_reason=?, reject_reason=? WHERE id=?`,
        ctx.user.id, reason, `برگشت رسید تأییدشده: ${reason}`, p.id);
      run(`INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)`,
        ctx.user.center_id, 'expense', p.amount, `سند اصلاحی برگشت رسید - ${p.full_name}`, 'اصلاحیه', ymd(), `reversal:${p.id}`);
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
    `, ctx.user.center_id).map((r) => ({
      ...r,
      remaining: Math.max(0, r.amount - r.paid),
      status: r.paid >= r.amount ? 'settled' : (r.paid > 0 ? 'partially_paid' : 'unpaid')
    }));
  });

  r.post('/api/manager/invoices', M, (ctx) => {
    const b = ctx.body;
    const fee_type = clampStr(b.fee_type, 40) || 'tuition';
    const period = clampStr(b.period, 40);
    const amount = Number(b.amount);
    if (!period || !amount || amount <= 0) fail(400, 'دوره و مبلغ معتبر فاکتور الزامی است');

    const studentIds = [];
    if (b.class_id) {
      const studs = all('SELECT user_id FROM students WHERE class_id=?', Number(b.class_id));
      for (const s of studs) studentIds.push(s.user_id);
    } else if (b.student_id) {
      studentIds.push(Number(b.student_id));
    }
    if (!studentIds.length) fail(400, 'دانش‌آموز یا کلاس انتخاب نشده است');

    const createdIds = [];
    tx(() => {
      for (const sid of studentIds) {
        const res = run(`
          INSERT INTO fee_invoices (center_id, student_id, fee_type, period, amount)
          VALUES (?,?,?,?,?)
          ON CONFLICT(student_id, fee_type, period) DO UPDATE SET amount=excluded.amount
        `, ctx.user.center_id, sid, fee_type, period, amount);
        createdIds.push(res.lastInsertRowid);
      }
    });

    return { ok: true, count: createdIds.length, ids: createdIds };
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
    const r = await sendSms(msg.recipient_phone, msg.content);
    if (r.ok) {
      run(`UPDATE sms_outbox SET status='sent', sent_at=datetime('now'), error_message=NULL WHERE id=?`, msg.id);
      return { ok: true, status: 'sent' };
    } else {
      run(`UPDATE sms_outbox SET status='failed', error_message=? WHERE id=?`, r.error, msg.id);
      return { ok: false, status: 'failed', error: r.error };
    }
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
  r.post('/api/manager/barpa-exams/reports', M, (ctx) => {
    const b = ctx.body;
    const exam_id = clampStr(b.exam_id, 80) || 'barpa_comprehensive';
    const exam_title = clampStr(b.exam_title, 120) || 'آزمون جامع طرح برپا';
    const grade = String(b.grade || 'نهم');
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
            overall_traz = excluded.overall_traz,
            overall_rank_all = excluded.overall_rank_all,
            overall_rank_center = excluded.overall_rank_center,
            overall_percentage = excluded.overall_percentage,
            subjects_json = excluded.subjects_json,
            answers_json = excluded.answers_json
        `, ctx.user.center_id, exam_id, exam_title, grade, sid,
           rec.candidate_code || `STU_${sid}`,
           rec.student_name || stu.full_name,
           rec.school_name || stu.school || 'کانون شهید کاظمی آشتیانی',
           Number(rec.total_attendees) || 1924,
           Number(rec.overall_traz) || 6000,
           Number(rec.overall_rank_all) || 1,
           Number(rec.overall_rank_center) || 1,
           Number(rec.overall_percentage) || 75.5,
           Number(rec.overall_correct) || 80,
           Number(rec.overall_wrong) || 15,
           Number(rec.overall_unanswered) || 25,
           Number(rec.total_questions) || 120,
           typeof rec.subjects === 'string' ? rec.subjects : JSON.stringify(rec.subjects || []),
           typeof rec.categories === 'string' ? rec.categories : JSON.stringify(rec.categories || []),
           typeof rec.answers === 'string' ? rec.answers : JSON.stringify(rec.answers || [])
        );
        saved.push(res.lastInsertRowid);
      }
    });

    return { ok: true, count: saved.length, ids: saved };
  });
}
