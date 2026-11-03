// ثبت‌نام گروهی دانش‌آموزان از CSV (خروجی اکسل). هر سطر مانند فرم ثبت‌نام اعتبارسنجی می‌شود؛
// سطرهای نامعتبر یا تکراری ردیف‌به‌ردیف گزارش می‌شوند و بقیه ثبت می‌شوند.
import { all, get, run, tx } from './db.js';
import { hashPasswordAsync, isValidNationalCode, normalizeNationalCode, normalizeIranianMobile, parseBirthDate, clampStr } from './util.js';

export const MAX_ROWS = 3000;
const GRADES = {
  'چهار': 4, 'چهارم': 4,
  'پنج': 5, 'پنجم': 5,
  'شش': 6, 'ششم': 6,
  'هفت': 7, 'هفتم': 7,
  'هشت': 8, 'هشتم': 8,
  'نه': 9, 'نهم': 9
};

const HEADERS = {
  full_name: ['نام و نام خانوادگی', 'نام و نام‌خانوادگی', 'نام و نام خانوادگی دانش‌آموز', 'نام و نام خانوادگی دانش آموز', 'نام ونام خانوادگی', 'نام', 'نام کامل', 'نام دانش‌آموز', 'نام دانش آموز', 'نام خانوادگی و نام', 'full_name', 'name'],
  national_code: ['کد ملی', 'کدملی', 'شماره ملی', 'شماره ملی دانش‌آموز', 'کدملی دانش‌آموز', 'کد ملی دانش آموز', 'national_code', 'nid'],
  gender: ['جنسیت', 'gender'],
  school: ['مدرسه', 'نام مدرسه', 'school'],
  grade: ['پایه', 'پایه تحصیلی', 'مقطع', 'کلاس/پایه', 'grade'],
  class: ['کلاس', 'نام کلاس', 'کلاس بندی', 'class', 'class_name'],
  birth: ['تاریخ تولد', 'تولد', 'birth_date', 'birth'],
  parent_phone: ['موبایل والدین', 'تلفن والدین', 'شماره والدین', 'موبایل ولی', 'موبایل', 'شماره همراه', 'تلفن همراه', 'شماره موبایل', 'موبایل پدر', 'موبایل مادر', 'تلفن تماس', 'شماره تماس والدین', 'parent_phone', 'mobile'],
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

// اعتبارسنجی یک سطر؛ خروجی: داده تمیز یا پرتاب خطا با پیام فارسی
function cleanRow(raw) {
  const full_name = clampStr(raw.full_name, 80);
  if (!full_name) throw new Error('نام و نام خانوادگی خالی است');

  const nc = normalizeNationalCode(raw.national_code);
  if (!isValidNationalCode(nc)) throw new Error(`کد ملی «${raw.national_code}» معتبر نیست`);

  const phone = normalizeIranianMobile(raw.parent_phone);
  if (!phone) throw new Error(`موبایل والدین «${raw.parent_phone}» معتبر نیست (باید شماره همراه ۱۱ رقمی باشد)`);

  const gradeRaw = norm(raw.grade).replace(/پایه|کلاس|تحصیلی/g, '').trim();
  const grade = GRADES[gradeRaw] || Number(gradeRaw);
  if (![4, 5, 6, 7, 8, 9].includes(grade)) throw new Error(`پایه «${raw.grade}» باید بین چهارم تا نهم باشد`);

  const g = norm(raw.gender);
  const gender = ['دختر', 'f', 'female', 'زن', 'مونث', 'مؤنث'].includes(g) ? 'f' : 'm';

  let birth_date = null;
  if (raw.birth && String(raw.birth).trim()) {
    birth_date = parseBirthDate(raw.birth);
  }

  return { full_name, national_code: nc, parent_phone: phone, grade, gender, class_name: clampStr(raw.class, 30) || 'الف', school: clampStr(raw.school, 100), birth_date, address: clampStr(raw.address, 300) };
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
