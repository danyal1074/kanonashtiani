// پشتیبان‌گیری از پایگاه داده (قابل اجرا در زمان‌بند سرور): npm run backup
import { makeBackup } from '../server/routes/admin.js';
import { closeDb } from '../server/db.js';

const b = makeBackup();
closeDb();
console.log(`✅ پشتیبان ساخته شد: ${b.file}`);
