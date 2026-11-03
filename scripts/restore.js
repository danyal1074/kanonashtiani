// بازیابی پایگاه داده از فایل پشتیبان: npm run restore -- <مسیر فایل .db>
// پیش از اجرا سرور را متوقف کنید.
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, closeDb } from '../server/db.js';
import { makeBackup } from '../server/backup.js';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('مسیر فایل پشتیبان را وارد کنید: npm run restore -- data/backups/roshd-....db'); process.exit(1); }
if (fs.readFileSync(src).subarray(0, 15).toString() !== 'SQLite format 3') { console.error('فایل انتخابی پایگاه داده SQLite معتبر نیست'); process.exit(1); }
const safety = makeBackup();
closeDb();
for (const ext of ['-wal', '-shm']) if (fs.existsSync(DB_PATH + ext)) fs.rmSync(DB_PATH + ext);
fs.copyFileSync(path.resolve(src), DB_PATH);
console.log(`✅ بازیابی انجام شد. پشتیبان ایمنی از وضعیت قبلی: ${safety.file}`);
