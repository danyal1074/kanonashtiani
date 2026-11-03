// راه‌اندازی اولیه روی سرور واقعی (بدون داده نمونه): ساخت کانون، مدیر سامانه و مدیر کانون
//   node scripts/init.mjs --center-name "کانون نخبه‌پروری ..." --slug ashtiani
//        [--admin-user admin] [--admin-pass ...] [--manager-user manager] [--manager-name "نام مدیر"] [--manager-pass ...]
// رمزی که نداده باشید تصادفی ساخته و فقط یک‌بار نمایش داده می‌شود. اجرای دوباره کانون یا حساب موجود را تغییر نمی‌دهد.
import crypto from 'node:crypto';
import { get, run, tx, closeDb } from '../server/db.js';
import { hashPassword } from '../server/util.js';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const randomPass = () => Array.from(crypto.randomBytes(12), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 54]).join('');

const centerName = opt('center-name'), slug = (opt('slug') || '').toLowerCase();
if (!centerName || !/^[a-z0-9-]{3,40}$/.test(slug)) { console.error('استفاده: node scripts/init.mjs --center-name "نام کانون" --slug latin-slug [--manager-name ...]'); process.exit(1); }
if (get('SELECT 1 FROM centers WHERE slug=?', slug)) { console.error(`کانونی با شناسه «${slug}» از قبل وجود دارد؛ چیزی تغییر نکرد.`); process.exit(1); }

const adminUser = opt('admin-user', 'admin'), managerUser = opt('manager-user', 'manager');
let adminPass = opt('admin-pass'), managerPass = opt('manager-pass');
const adminExists = !!get(`SELECT 1 FROM users WHERE role='admin' AND username=?`, adminUser);
if (get(`SELECT 1 FROM users WHERE role='manager' AND username=?`, managerUser)) { console.error(`نام کاربری مدیر «${managerUser}» قبلاً وجود دارد؛ --manager-user دیگری بدهید.`); process.exit(1); }
for (const [n, p] of [['admin-pass', adminPass], ['manager-pass', managerPass]]) if (p && p.length < 8) { console.error(`${n} باید حداقل ۸ کاراکتر باشد`); process.exit(1); }
adminPass ||= randomPass(); managerPass ||= randomPass();

tx(() => {
  const c = run('INSERT INTO centers (name, slug, tagline, color) VALUES (?,?,?,?)', centerName, slug, 'جایی برای رشد استعدادهای درخشان', '#0B5F66');
  const cid = Number(c.lastInsertRowid);
  for (const g of [4, 5, 6, 7, 8, 9]) run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', cid, g, 'الف');
  run(`INSERT INTO users (center_id, role, username, pass_hash, full_name) VALUES (?,?,?,?,?)`, cid, 'manager', managerUser, hashPassword(managerPass), opt('manager-name', 'مدیر کانون'));
  if (!adminExists) run(`INSERT INTO users (center_id, role, username, pass_hash, full_name) VALUES (NULL,'admin',?,?,?)`, adminUser, hashPassword(adminPass), 'مدیر سامانه');
});
console.log(`کانون «${centerName}» ساخته شد.\n`);
console.log('حساب‌ها (این رمزها را همین حالا یادداشت کنید و پس از اولین ورود عوض کنید):');
console.log(`  مدیر کانون:  ${managerUser}   رمز: ${managerPass}`);
console.log(adminExists ? `  مدیر سامانه: «${adminUser}» از قبل وجود داشت و تغییر نکرد` : `  مدیر سامانه: ${adminUser}   رمز: ${adminPass}`);
console.log('\nگام بعد: افزودن معلمان و کلاس‌ها از پنل مدیر، سپس  node scripts/import-students.mjs students.csv --center ' + slug);
closeDb();
