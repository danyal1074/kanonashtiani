// ثبت‌نام گروهی دانش‌آموزان از فایل CSV (خروجی اکسل، UTF-8)
//   node scripts/import-students.mjs students.csv --center ashtiani [--dry-run]
// ستون‌ها: نام و نام خانوادگی، کد ملی، جنسیت، مدرسه، پایه، کلاس، تاریخ تولد، موبایل والدین، نشانی
// نمونه فایل: node scripts/import-students.mjs --template > students.csv
import fs from 'node:fs';
import { get, closeDb } from '../server/db.js';
import { importStudents, CSV_TEMPLATE } from '../server/importer.js';

const args = process.argv.slice(2);
if (args.includes('--template')) { process.stdout.write(CSV_TEMPLATE); process.exit(0); }
const file = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--center') + 1]);
const slug = args[args.indexOf('--center') + 1];
if (!file || args.indexOf('--center') < 0 || !slug) { console.error('استفاده: node scripts/import-students.mjs <students.csv> --center <slug> [--dry-run]'); process.exit(1); }
const center = get('SELECT id, name FROM centers WHERE slug=?', slug);
if (!center) { console.error(`کانونی با شناسه «${slug}» پیدا نشد`); process.exit(1); }
const r = await importStudents(center.id, fs.readFileSync(file, 'utf8'), { dryRun: args.includes('--dry-run') });
console.log(`${r.dry_run ? '[بررسی آزمایشی] ' : ''}کانون: ${center.name}\nکل سطرها: ${r.total} | معتبر: ${r.valid} | ثبت‌شده: ${r.created} | والد جدید: ${r.parents_created} | کلاس جدید: ${r.classes_created} | تکراری: ${r.skipped_existing}`);
for (const e of r.errors) console.log(`  سطر ${e.line} (${e.name}): ${e.message}`);
closeDb();
process.exit(r.errors.length > r.skipped_existing ? 2 : 0);
