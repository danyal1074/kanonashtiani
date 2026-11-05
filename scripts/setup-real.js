// راه‌اندازی نسخه واقعی: پایگاه داده نمونه (ساختگی) پاک می‌شود و فقط مدیر سامانه و «کانون آشتیانی» ساخته می‌شود.
// اجرا (با سرور خاموش):  ROSHD_ADMIN_PASSWORD=<رمز> npm run setup:real -- --yes
// پیش از پاک‌سازی یک پشتیبان کامل در data/backups ذخیره می‌شود.
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, UPLOAD_DIR, closeDb, openDb, run, tx } from '../server/db.js';
import { makeBackup } from '../server/backup.js';
import { hashPassword } from '../server/util.js';

const password = process.env.ROSHD_ADMIN_PASSWORD || '';
if (!process.argv.includes('--yes')) { console.error('این دستور همه داده‌های فعلی را پاک می‌کند (پشتیبان گرفته می‌شود). برای تأیید: npm run setup:real -- --yes'); process.exit(1); }
if (password.length < 6) { console.error('رمز مدیر سامانه را با متغیر ROSHD_ADMIN_PASSWORD بدهید (حداقل ۶ کاراکتر)'); process.exit(1); }

const backup = makeBackup('before-real');
closeDb();
for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(DB_PATH + ext)) fs.rmSync(DB_PATH + ext);
// فایل‌های بارگذاری‌شده متعلق به داده‌های نمونه‌اند
if (fs.existsSync(UPLOAD_DIR)) for (const f of fs.readdirSync(UPLOAD_DIR)) fs.rmSync(path.join(UPLOAD_DIR, f), { recursive: true, force: true });
openDb();

tx(() => {
  run(`INSERT INTO centers (id, name, slug, logo, tagline, color, min_daily_study) VALUES (1,?,?,?,?,?,?)`,
    'کانون نخبه‌پروری شهید کاظم آشتیانی', 'ashtiani', '/img/logo-ashtiani.svg', 'جایی برای رشد استعدادهای درخشان', '#7c3aed', 50);
  run(`INSERT INTO users (center_id, role, username, pass_hash, full_name) VALUES (NULL,'admin','admin',?,?)`, hashPassword(password), 'مدیر سامانه');
  for (const g of [4, 5, 6, 7, 8, 9]) {
    run('INSERT INTO classes (center_id, grade, name) VALUES (1,?,?)', g, 'الف');
    run('INSERT INTO fee_settings (center_id, grade, amount, lock_date) VALUES (1,?,0,NULL)', g);
  }
});
closeDb();
console.log(`✅ پایگاه داده واقعی ساخته شد (فقط مدیر سامانه + کانون آشتیانی).\n   پشتیبان داده‌های قبلی: ${backup.file}`);
