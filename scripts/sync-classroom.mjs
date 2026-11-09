// همگام‌سازی دستی/دوره‌ای دانش‌آموزان فعال پنل با «کلاس آنلاین کانون»
//   node scripts/sync-classroom.mjs            ← همهٔ دانش‌آموزان فعال
//   node scripts/sync-classroom.mjs --dry-run  ← فقط شمارش، بدون ارسال
//   node scripts/sync-classroom.mjs 12 15      ← فقط این شناسه‌ها
// نیازمند env: CLASSROOM_API و KANOON_PANEL_SECRET (از فایل .env یا محیط). برای اجرای دوره‌ای: cron روزانه.
import '../server/env.js';
import { all } from '../server/db.js';
import { syncStudents, classroomEnabled } from '../server/classroom.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (dry) {
  const n = ids.length || all("SELECT 1 FROM users u JOIN students s ON s.user_id=u.id WHERE u.role='student' AND u.active=1").length;
  console.log(`حالت آزمایشی: ${n} دانش‌آموز ارسال می‌شد.`);
  process.exit(0);
}
if (!classroomEnabled()) { console.error('CLASSROOM_API و KANOON_PANEL_SECRET (حداقل ۳۲ نویسه) تنظیم نشده است.'); process.exit(2); }
try {
  const r = await syncStudents(ids.length ? ids : null);
  console.log(`همگام‌سازی انجام شد: ${r.total} دانش‌آموز (جدید ${r.created}، به‌روزرسانی ${r.updated})`);
  process.exit(0);
} catch (e) { console.error('خطا در همگام‌سازی:', e.message); process.exit(1); }
