// ساخت کلاس‌ها و برنامه هفتگی پاییز ۱۴۰۵ کانون آشتیانی از روی جدول زمان‌بندی کانون.
// اجرا: node scripts/import-timetable.mjs [--center ashtiani]          (فقط پیش‌نمایش)
//        node scripts/import-timetable.mjs --apply                      (ثبت؛ پیش از آن پشتیبان گرفته می‌شود)
// قواعد (به تأیید کاربر):
//  - خانه‌های زردرنگ = کلاس تربیتی؛ خانه‌های بدون رنگ = کلاس علمی شناور (ریاضی یا علوم یا هوش به تشخیص استاد)
//  - خانه‌های سبز (شطرنج، تنیس و دارت)، بنفش (هیئت) و زبان در جدول نیامده‌اند؛ رباتیک هم فعلاً نیامده (پایه و جنسیت ندارد)
//  - «پنجم دختر» بدون عدد = کلاس «دختر 1»؛ با عدد ۲ = «دختر 2». پسر و دختر کلاس جدا دارند.
//  - ثبت فقط اضافه می‌کند: کلاس و جلسهٔ موجود (هم‌کلاس، هم‌روز، هم‌ساعت) دوباره ساخته نمی‌شود و چیزی حذف نمی‌شود.
import { all, get, run, tx, closeDb } from '../server/db.js';
import { makeBackup } from '../server/backup.js';
import { classNameKey } from '../server/util.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const slug = args.includes('--center') ? args[args.indexOf('--center') + 1] : 'ashtiani';

const ROOMS = { M1: 'طبقه بالا مسجد', M2: 'طبقه پایین مسجد', K110: 'طبقه بالای کانون - 110', K111: 'طبقه بالای کانون - 111', K112: 'طبقه پایین کانون - 112', K113: 'طبقه پایین کانون - 113' };
const END = { '08:00': '09:20', '09:30': '10:50', '11:00': '12:50', '16:00': '17:50', '18:00': '19:20', '19:30': '20:50' };
const SCI = 'علمی (ریاضی / علوم / هوش)', TARB = 'تربیتی';
const GRADES = { 'چهارم': 4, 'پنجم': 5, 'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9 };
const T = 'T'; // هایلات زرد = تربیتی

// روز: 0 شنبه ... 6 جمعه | اتاق: [[شروع، کلاس، (T)]...]
const TABLE = {
  0: { M1: [['18:00', 'هفتم پسر', T], ['19:30', 'هفتم پسر']], K110: [['18:00', 'پنجم دختر 1'], ['19:30', 'پنجم پسر 1']], K112: [['19:30', 'پنجم دختر 1', T]] },
  1: { M1: [['18:00', 'نهم پسر', T], ['19:30', 'نهم پسر']], K110: [['18:00', 'ششم دختر 1'], ['19:30', 'چهارم پسر']] },
  2: { M1: [['18:00', 'هشتم پسر', T], ['19:30', 'هشتم پسر']], M2: [['18:00', 'پنجم پسر 1', T]], K110: [['18:00', 'نهم دختر 1'], ['19:30', 'پنجم پسر 1']], K112: [['18:00', 'پنجم دختر 1'], ['19:30', 'نهم دختر 1', T]] },
  3: { M2: [['18:00', 'پنجم دختر 2', T], ['19:30', 'ششم دختر 1', T]], K110: [['18:00', 'هفتم دختر 1'], ['19:30', 'پنجم دختر 2']], K112: [['18:00', 'ششم دختر 1'], ['19:30', 'هشتم دختر 1']] },
  4: { K110: [['18:00', 'هشتم دختر 2'], ['19:30', 'نهم دختر 2']], K112: [['18:00', 'چهارم دختر'], ['19:30', 'ششم پسر']], K113: [['18:00', 'نهم دختر 2', T], ['19:30', 'هشتم دختر 2', T]] },
  5: {
    M1: [['08:00', 'ششم پسر'], ['09:30', 'ششم پسر', T], ['16:00', 'هفتم پسر'], ['18:00', 'هشتم پسر'], ['19:30', 'نهم پسر']],
    M2: [['09:30', 'چهارم دختر', T]],
    K110: [['08:00', 'پنجم دختر 2'], ['09:30', 'ششم دختر 2'], ['11:00', 'نهم دختر 2'], ['16:00', 'چهارم پسر'], ['18:00', 'نهم دختر 1']],
    K112: [['08:00', 'هشتم دختر 1'], ['09:30', 'هفتم دختر 2'], ['11:00', 'ششم دختر 2', T], ['16:00', 'پنجم پسر 2', T], ['18:00', 'پنجم پسر 2']],
    K113: [['08:00', 'هفتم دختر 2', T], ['09:30', 'هفتم دختر 1', T], ['11:00', 'چهارم دختر'], ['18:00', 'چهارم پسر', T]],
  },
  6: { K110: [['18:00', 'هفتم دختر 2'], ['19:30', 'هفتم دختر 1']], K112: [['16:00', 'هشتم دختر 2'], ['18:00', 'ششم دختر 2']], K113: [['16:00', 'پنجم پسر 2'], ['18:00', 'هفتم دختر 1', T]] },
};

// «پنجم دختر 2» ← { grade: 5, name: 'دختر 2' }؛ بدون عدد = 1
function parseClass(label) {
  const m = /^(\S+)\s+(دختر|پسر)(?:\s+(\d))?$/.exec(label.trim());
  if (!m || !GRADES[m[1]]) throw new Error(`عنوان کلاس نامعتبر: «${label}»`);
  return { grade: GRADES[m[1]], name: `${m[2]} ${m[3] || '1'}` };
}

const center = get('SELECT id, name FROM centers WHERE slug=?', slug);
if (!center) { console.error(`کانونی با شناسه «${slug}» پیدا نشد`); process.exit(1); }

const sessions = [];
for (const [day, rooms] of Object.entries(TABLE)) for (const [room, cells] of Object.entries(rooms)) for (const [start, label, tarb] of cells) {
  sessions.push({ weekday: Number(day), start, end: END[start], room: ROOMS[room], ...parseClass(label), kind: tarb ? 'tarbiati' : 'academic', subject: tarb ? TARB : SCI });
}

// خود جدول نباید یک کلاس را هم‌زمان در دو جا داشته باشد
const seen = new Map();
for (const s of sessions) {
  const k = `${s.grade}|${s.name}|${s.weekday}|${s.start}`;
  if (seen.has(k)) { console.error(`تداخل در خود جدول: ${s.grade}${s.name} روز ${s.weekday} ساعت ${s.start}`); process.exit(1); }
  seen.set(k, 1);
}

const classKeys = [...new Set(sessions.map((s) => `${s.grade}|${s.name}`))].sort();
// کلاس‌های موجود با نام نرمال‌شده تطبیق داده می‌شوند، تا کلاسی که مدیر در پنل ساخته یا تغییر نام داده دوباره ساخته نشود:
// «دختر 1» ≡ «دختر ۱» (رقم فارسی/لاتین) و «پسر» بدون شماره ≡ «پسر 1». اگر هر دو شکل باشند، شکل شماره‌دار برنده است.
const canon = (name) => { const k = classNameKey(name); return /^(دختر|پسر)$/.test(k) ? `${k} 1` : k; };
const existingClasses = new Map();
for (const c of all('SELECT id, grade, name FROM classes WHERE center_id=? ORDER BY id', center.id)) {
  const k = `${c.grade}|${canon(c.name)}`;
  if (!existingClasses.has(k) || classNameKey(c.name) === canon(c.name)) existingClasses.set(k, c.id);
}
const newClasses = classKeys.filter((k) => !existingClasses.has(k));
const existingSessions = get('SELECT COUNT(*) n FROM schedule WHERE class_id IN (SELECT id FROM classes WHERE center_id=?)', center.id).n;

console.log(`کانون: ${center.name}`);
console.log(`جلسه در جدول: ${sessions.length} (علمی ${sessions.filter((s) => s.kind === 'academic').length}، تربیتی ${sessions.filter((s) => s.kind === 'tarbiati').length})`);
console.log(`کلاس لازم: ${classKeys.length} | موجود: ${classKeys.length - newClasses.length} | جدید: ${newClasses.length}`);
console.log(`جلسه‌های فعلی کانون: ${existingSessions}`);
if (!apply) { console.log('\nپیش‌نمایش بود؛ برای ثبت: --apply'); closeDb(); process.exit(0); }

const backup = makeBackup('before-timetable');
let addedClasses = 0, added = 0, skipped = 0;
tx(() => {
  for (const k of classKeys) {
    if (existingClasses.has(k)) continue;
    const [grade, name] = k.split('|');
    existingClasses.set(k, Number(run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', center.id, Number(grade), name).lastInsertRowid));
    addedClasses++;
  }
  for (const s of sessions) {
    const cid = existingClasses.get(`${s.grade}|${s.name}`);
    if (get('SELECT 1 FROM schedule WHERE class_id=? AND weekday=? AND start=? AND end=?', cid, s.weekday, s.start, s.end)) { skipped++; continue; }
    run('INSERT INTO schedule (class_id, weekday, start, end, subject, teacher_id, room, kind) VALUES (?,?,?,?,?,?,?,?)', cid, s.weekday, s.start, s.end, s.subject, null, s.room, s.kind);
    added++;
  }
});
console.log(`\n✅ ثبت شد: ${addedClasses} کلاس جدید، ${added} جلسه (${skipped} جلسهٔ تکراری رد شد)`);
console.log(`پشتیبان قبل از ثبت: ${backup.file}`);
closeDb();
