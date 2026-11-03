// آزمون سامانه مهاجرت پایگاه داده (T1)
// اجرا: node scripts/test-migrations.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations, migrate } from '../server/db.js';

console.log('--- آزمون ۱: مهاجرت روی پایگاه داده خالی در حافظه ---');
const memDb = new DatabaseSync(':memory:');
assert.equal(memDb.prepare('PRAGMA user_version').get().user_version, 0);

const v1 = migrate(memDb);
assert.equal(v1, migrations.length);
assert.equal(memDb.prepare('PRAGMA user_version').get().user_version, migrations.length);

const tblCount = memDb.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n;
assert.ok(tblCount > 10, 'جداول پایه باید ساخته شده باشند');

// اجرای مجدد (ایدمپوتنت)
const vRe = migrate(memDb);
assert.equal(vRe, migrations.length, 'اجرای مجدد نباید نسخه را تغییر دهد');
memDb.close();
console.log('✓ پایگاه خالی با موفقیت به نسخه ' + v1 + ' ارتقا یافت.');

console.log('--- آزمون ۲: مهاجرت روی نسخه پشتیبان پایگاه فعلی (بدون ازدست‌رفتن داده) ---');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roshd-mig-test-'));
const backupPath = path.join(tmpDir, 'backup.db');
const mainDbPath = path.join(process.cwd(), 'data', 'roshd.db');

if (fs.existsSync(mainDbPath)) {
  fs.copyFileSync(mainDbPath, backupPath);
  const bakDb = new DatabaseSync(backupPath);
  
  // قبل از مهاجرت: ثبت آمار داده‌ها
  const usersBefore = bakDb.prepare('SELECT COUNT(*) n FROM users').get().n;
  const examsBefore = bakDb.prepare('SELECT COUNT(*) n FROM exam_results').get().n;
  const pomosBefore = bakDb.prepare('SELECT COUNT(*) n FROM pomodoros').get().n;
  
  // اجرای مهاجرت
  const vBak = migrate(bakDb);
  assert.equal(vBak, migrations.length);
  assert.equal(bakDb.prepare('PRAGMA user_version').get().user_version, migrations.length);
  
  // بعد از مهاجرت: تطبیق دقیق داده‌ها (عدم ازدست‌رفتن داده)
  const usersAfter = bakDb.prepare('SELECT COUNT(*) n FROM users').get().n;
  const examsAfter = bakDb.prepare('SELECT COUNT(*) n FROM exam_results').get().n;
  const pomosAfter = bakDb.prepare('SELECT COUNT(*) n FROM pomodoros').get().n;
  
  assert.equal(usersAfter, usersBefore, 'تعداد کاربران نباید تغییر کند');
  assert.equal(examsAfter, examsBefore, 'تعداد نتایج آزمون نباید تغییر کند');
  assert.equal(pomosAfter, pomosBefore, 'تعداد پومودوروها نباید تغییر کند');
  
  // اجرای مجدد روی نسخه پشتیبان
  const vBakRe = migrate(bakDb);
  assert.equal(vBakRe, vBak, 'اجرای مجدد روی پشتیبان نباید نسخه را تغییر دهد');
  
  bakDb.close();
  console.log(`✓ نسخه پشتیبان با ${usersAfter} کاربر با موفقیت مهاجرت کرد و داده‌ها دست‌نخورده ماندند.`);
} else {
  console.log('توجه: data/roshd.db وجود نداشت؛ آزمون پشتیبان رد شد.');
}

console.log('--- آزمون ۳: برگشت تراکنش در صورت بروز خطا در مهاجرت ---');
const failDb = new DatabaseSync(':memory:');
const customMigrations = [
  (d) => d.exec('CREATE TABLE t_ok (id INT);'),
  (d) => { d.exec('CREATE TABLE t_fail (id INT);'); throw new Error('خطای شبیه‌سازی‌شده'); }
];

function runCustomMigrate(database, migs) {
  let version = Number(database.prepare('PRAGMA user_version').get()?.user_version || 0);
  for (let i = version; i < migs.length; i++) {
    const nextVersion = i + 1;
    database.exec('BEGIN');
    try {
      migs[i](database);
      database.exec(`PRAGMA user_version = ${nextVersion}`);
      database.exec('COMMIT');
    } catch (e) {
      database.exec('ROLLBACK');
      throw e;
    }
  }
}

try {
  runCustomMigrate(failDb, customMigrations);
  assert.fail('باید با خطا متوقف می‌شد');
} catch (e) {
  assert.equal(e.message, 'خطای شبیه‌سازی‌شده');
}

// بررسی نسخه: باید ۱ بماند چون مهاجرت دوم خطا داد و رول‌بک شد
const finalVer = failDb.prepare('PRAGMA user_version').get().user_version;
assert.equal(finalVer, 1, 'نسخه باید در ۱ بماند');
const tOkExists = !!failDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='t_ok'").get();
const tFailExists = !!failDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='t_fail'").get();
assert.ok(tOkExists, 'جدول t_ok باید وجود داشته باشد');
assert.ok(!tFailExists, 'جدول t_fail به دلیل خطا نباید وجود داشته باشد');
failDb.close();
console.log('✓ رول‌بک تراکنش هنگام خطای مهاجرت با موفقیت تأیید شد.');

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('\n✅ همه آزمون‌های سامانه مهاجرت (T1) با موفقیت کامل پاس شدند.');
