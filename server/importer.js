// ثبت‌نام گروهی دانش‌آموزان از CSV (خروجی اکسل). هر سطر مانند فرم ثبت‌نام اعتبارسنجی می‌شود؛
// سطرهای نامعتبر یا تکراری ردیف‌به‌ردیف گزارش می‌شوند و بقیه ثبت می‌شوند.
import { all, get, run, tx } from './db.js';
import { hashPasswordAsync, isValidNationalCode, toEnDigits, clampStr, j2g } from './util.js';

export const MAX_ROWS = 3000;
const GRADES = { 'چهارم': 4, 'پنجم': 5, 'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9 };

const HEADERS = {
  full_name: ['نام و نام خانوادگی', 'نام و نام‌خانوادگی', 'نام', 'نام کامل', 'full_name', 'name'],
  national_code: ['کد ملی', 'کدملی', 'national_code', 'nid'],
  gender: ['جنسیت', 'gender'],
  school: ['مدرسه', 'school'],
  grade: ['پایه', 'grade'],
  class: ['کلاس', 'class', 'class_name'],
  birth: ['تاریخ تولد', 'تولد', 'birth_date', 'birth'],
  parent_phone: ['موبایل والدین', 'تلفن والدین', 'شماره والدین', 'موبایل ولی', 'parent_phone', 'mobile'],
  address: ['نشانی', 'آدرس', 'address'],
};
const norm = (s) => String(s ?? '').replace(/[‌‏‎]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();

// تجزیه CSV با پشتیبانی از گیومه، BOM و جداکننده , ; یا tab
export function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function mapColumns(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    const n = norm(h);
    for (const [key, names] of Object.entries(HEADERS)) if (names.some((x) => norm(x) === n)) idx[key] = i;
  });
  return idx;
}

function parseBirth(v) {
  v = toEnDigits(String(v || '')).trim();
  if (!v) return null;
  const m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(v);
  if (!m) throw new Error('تاریخ تولد باید مانند ۱۳۹۳/۰۵/۱۲ باشد');
  let [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error('تاریخ تولد نامعتبر است');
  if (y < 1700) [y, mo, d] = j2g(y, mo, d);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// اعتبارسنجی یک سطر؛ خروجی: داده تمیز یا پرتاب خطا با پیام فارسی
function cleanRow(raw) {
  const full_name = clampStr(raw.full_name, 80);
  if (!full_name) throw new Error('نام و نام خانوادگی خالی است');
  let nc = toEnDigits(String(raw.national_code ?? '')).replace(/\D/g, '');
  if (nc.length >= 8 && nc.length < 10) nc = nc.padStart(10, '0'); // اکسل صفرهای ابتدای کد ملی را حذف می‌کند
  if (!isValidNationalCode(nc)) throw new Error(`کد ملی «${raw.national_code}» معتبر نیست`);
  let phone = toEnDigits(String(raw.parent_phone ?? '')).replace(/\D/g, '');
  if (phone.length === 10 && phone.startsWith('9')) phone = '0' + phone;
  if (!/^09\d{9}$/.test(phone)) throw new Error(`موبایل والدین «${raw.parent_phone}» معتبر نیست`);
  const gradeRaw = toEnDigits(String(raw.grade ?? '')).replace(/پایه/g, '').trim();
  const grade = GRADES[gradeRaw] || Number(gradeRaw);
  if (![4, 5, 6, 7, 8, 9].includes(grade)) throw new Error(`پایه «${raw.grade}» باید بین چهارم تا نهم باشد`);
  const g = norm(raw.gender);
  const gender = ['دختر', 'f', 'female', 'زن', 'مونث'].includes(g) ? 'f' : 'm';
  return { full_name, national_code: nc, parent_phone: phone, grade, gender, class_name: clampStr(raw.class, 30) || 'الف', school: clampStr(raw.school, 100), birth_date: parseBirth(raw.birth), address: clampStr(raw.address, 300) };
}

// rows: آرایه سطرها (اولین سطر عنوان ستون‌ها). dryRun: فقط بررسی، بدون ثبت.
export async function importStudents(centerId, csvText, { dryRun = false } = {}) {
  const table = parseCsv(csvText);
  if (table.length < 2) throw new Error('فایل خالی است یا سطر عنوان ندارد');
  if (table.length - 1 > MAX_ROWS) throw new Error(`حداکثر ${MAX_ROWS} دانش‌آموز در هر بار`);
  const col = mapColumns(table[0]);
  const missing = ['full_name', 'national_code', 'grade', 'parent_phone'].filter((k) => !(k in col));
  if (missing.length) throw new Error(`ستون‌های لازم پیدا نشد: ${missing.map((k) => HEADERS[k][0]).join('، ')}`);

  const errors = [], good = [], seen = new Set();
  let skippedExisting = 0;
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const raw = Object.fromEntries(Object.keys(col).map((k) => [k, cells[col[k]]]));
    try {
      const d = cleanRow(raw);
      if (seen.has(d.national_code)) throw new Error(`کد ملی ${d.national_code} در همین فایل تکراری است`);
      seen.add(d.national_code);
      if (get(`SELECT 1 FROM users WHERE role='student' AND national_code=?`, d.national_code)) { skippedExisting++; errors.push({ line, name: d.full_name, message: 'قبلاً ثبت شده بود (رد شد)' }); return; }
      good.push({ ...d, line });
    } catch (e) { errors.push({ line, name: clampStr(raw.full_name, 40), message: e.message }); }
  });

  const summary = { total: table.length - 1, valid: good.length, skipped_existing: skippedExisting, errors, created: 0, parents_created: 0, classes_created: 0, dry_run: dryRun };
  if (dryRun || !good.length) return summary;

  // هش رمز (ناهمزمان و موازی با سقف) پیش از تراکنش
  const parentPhones = [...new Set(good.map((g) => g.parent_phone))].filter((p) => !get(`SELECT 1 FROM users WHERE role='parent' AND mobile=?`, p));
  const studentHash = new Map(), parentHash = new Map();
  const jobs = [...good.map((g) => () => hashPasswordAsync(g.national_code).then((h) => studentHash.set(g.national_code, h))), ...parentPhones.map((p) => () => hashPasswordAsync(p.slice(-6)).then((h) => parentHash.set(p, h)))];
  for (let i = 0; i < jobs.length; i += 24) await Promise.all(jobs.slice(i, i + 24).map((j) => j()));

  tx(() => {
    const classIds = new Map(all('SELECT id, grade, name FROM classes WHERE center_id=?', centerId).map((c) => [`${c.grade}|${c.name}`, c.id]));
    for (const d of good) {
      const key = `${d.grade}|${d.class_name}`;
      let cid = classIds.get(key);
      if (!cid) { cid = Number(run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', centerId, d.grade, d.class_name).lastInsertRowid); classIds.set(key, cid); summary.classes_created++; }
      const uid = Number(run(`INSERT INTO users (center_id, role, national_code, pass_hash, full_name, gender) VALUES (?,?,?,?,?,?)`, centerId, 'student', d.national_code, studentHash.get(d.national_code), d.full_name, d.gender).lastInsertRowid);
      run('INSERT INTO students (user_id, school, grade, class_id, birth_date, parent_phone, address, avatar) VALUES (?,?,?,?,?,?,?,?)', uid, d.school, d.grade, cid, d.birth_date, d.parent_phone, d.address, 'sprout');
      let p = get(`SELECT id FROM users WHERE role='parent' AND mobile=?`, d.parent_phone);
      if (!p) { p = { id: Number(run(`INSERT INTO users (center_id, role, mobile, pass_hash, full_name) VALUES (?,?,?,?,?)`, centerId, 'parent', d.parent_phone, parentHash.get(d.parent_phone), `ولیِ ${d.full_name}`).lastInsertRowid) }; summary.parents_created++; }
      run('INSERT OR IGNORE INTO parent_children (parent_id, student_id) VALUES (?,?)', p.id, uid);
      summary.created++;
    }
  });
  return summary;
}

export const CSV_TEMPLATE = '﻿نام و نام خانوادگی,کد ملی,جنسیت,مدرسه,پایه,کلاس,تاریخ تولد,موبایل والدین,نشانی\n"علی رضایی",0012345679,پسر,دبستان نمونه,هفتم,الف,1392/05/12,09121234567,"تهران، خیابان نمونه"\n';
