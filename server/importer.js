// ثبت‌نام گروهی دانش‌آموزان از CSV یا اکسل (xlsx). ستون‌ها هوشمند تشخیص داده می‌شوند:
// اول از روی عنوان ستون (با نام‌های مختلف)، و اگر عنوان نبود یا ناشناخته بود از روی محتوای ستون.
// تنها فیلدهای لازم «نام و نام خانوادگی» و «کد ملی» هستند؛ هر اطلاعات دیگری در فایل بود در پروفایل ثبت می‌شود.
// دانش‌آموزی که قبلاً ثبت شده باشد رد نمی‌شود: کلاس، وضعیت پرداخت و اطلاعات خالی پروفایلش به‌روزرسانی می‌شود.
import zlib from 'node:zlib';
import { all, get, run, tx } from './db.js';
import { hashPasswordAsync, isValidNationalCode, normalizeNationalCode, normalizeIranianMobile, parseBirthDate, clampStr, toEnDigits } from './util.js';
import { markFeePaid } from './logic.js';

export const MAX_ROWS = 20000;

const GRADE_WORDS = [['چهارم', 4], ['پنجم', 5], ['ششم', 6], ['هفتم', 7], ['هشتم', 8], ['نهم', 9], ['چهار', 4], ['پنج', 5], ['شش', 6], ['هفت', 7], ['هشت', 8], ['نه', 9]];
const GIRL_WORDS = ['دختر', 'دخترانه', 'f', 'female', 'زن', 'مونث', 'مؤنث', 'خانم', 'girl'];
const BOY_WORDS = ['پسر', 'پسرانه', 'm', 'male', 'مرد', 'مذکر', 'آقا', 'boy'];

export const FIELD_LABELS = {
  full_name: 'نام و نام خانوادگی', last_name: 'نام خانوادگی (جدا)', national_code: 'کد ملی', parent_phone: 'شماره تماس', phone2: 'شماره تماس دوم',
  grade: 'پایه', class: 'کلاس', gender: 'جنسیت', father_name: 'نام پدر', mother_name: 'نام مادر', school: 'مدرسه', birth: 'تاریخ تولد', address: 'نشانی', fee_paid: 'شهریه / حق عضویت پرداخت‌شده',
};

const norm = (s) => toEnDigits(String(s ?? '')).replace(/[‌‏‎ـ]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const hnorm = (s) => norm(s).replace(/[:()[\]*_\-/\\.,،؛;|]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- خواندن فایل ----------
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

// خواندن فایل zip بدون وابستگی خارجی (فقط ورودی‌های مورد نیاز xlsx)
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('فایل اکسل معتبر نیست (xlsx نیست). فایل را با «Save As ← Excel Workbook (.xlsx)» یا CSV ذخیره کنید');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    files.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
  }
  return files;
}
const unxml = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export function parseXlsx(buf) {
  const files = unzip(buf);
  const text = (n) => files.get(n)?.toString('utf8') || '';
  const shared = [];
  for (const m of text('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    shared.push(unxml([...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  }
  // اولین برگهٔ کتاب
  let sheetName = null;
  const wb = text('xl/workbook.xml'), rels = text('xl/_rels/workbook.xml.rels');
  const first = wb.match(/<sheet\b[^>]*r:id="([^"]+)"/);
  if (first) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((x) => x[0]).find((x) => x.includes(`Id="${first[1]}"`));
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetName = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  if (!sheetName || !files.has(sheetName)) sheetName = [...files.keys()].filter((k) => k.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new Error('برگهٔ داده در فایل اکسل پیدا نشد');
  const rows = [];
  for (const rm of text(sheetName).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cm[1].match(/\br="([A-Z]+\d+)"/)?.[1], t = cm[1].match(/\bt="([^"]+)"/)?.[1], inner = cm[2] || '';
      const idx = ref ? colIndex(ref) : row.length;
      let v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (t === 's') v = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') v = unxml([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else if (v != null) v = unxml(v);
      if (v != null && t !== 's' && t !== 'inlineStr' && t !== 'str' && /^-?\d+\.\d+E\+?\d+$/i.test(v)) v = String(Math.round(Number(v)));
      while (row.length < idx) row.push('');
      row[idx] = v ?? '';
    }
    if (row.some((x) => String(x).trim())) rows.push(row);
  }
  return rows;
}

// ---------- تشخیص هوشمند ستون‌ها ----------
const PHONE_H = /موبایل|تلفن|همراه|تماس|mobile|phone|\btel\b|واتس|شماره\s*(دوم|دیگر|ثانویه|2)/;
const RULES = [
  ['national_code', /کد\s*ملی|کدملی|شماره\s*ملی|^ملی$|national|\bnid\b|کد\s*شناسایی/],
  ['full_name', /نام\s*و\s*نام\s*خانوادگی|نام\s*ونام|نام\s*کامل|نام\s*و\s*فامیل|نام\s*خانوادگی\s*و\s*نام|full\s*name|^name$|^نام$|^نام\s*(دانش\s*آموز|شاگرد|و)$|^دانش\s*آموز$|^اسم$|نام\s*دانش\s*آموز/],
  ['last_name', /نام\s*خانوادگی|فامیل|family|last\s*name|surname/],
  ['phone', PHONE_H],
  ['father_name', /پدر|father/],
  ['mother_name', /مادر|mother/],
  ['fee_paid', /شهریه|پرداخت|عضویت|تسویه|وصول|\bfee\b|paid|حق\s*ماهیانه/],
  ['gender', /جنس|gender|\bsex\b/],
  ['school', /مدرسه|school|آموزشگاه|دبستان|دبیرستان/],
  ['birth', /تولد|birth/],
  ['address', /نشانی|آدرس|address|سکونت|محل\s*زندگی/],
  ['grade', /پایه|مقطع|grade|سال\s*تحصیلی/],
  ['class', /کلاس|class|گروه|شعبه/],
];
const classifyHeader = (h) => { const n = hnorm(h); if (!n) return null; for (const [k, re] of RULES) if (re.test(n)) return k; return null; };

function parseGrade(s) {
  const n = norm(s).replace(/پایه|تحصیلی/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  for (const [w, g] of GRADE_WORDS) if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(n)) return { grade: g, rest: n.replace(w, '').replace(/کلاس/g, '').trim() };
  const m = n.match(/(^|\D)([4-9])(\D|$)/);
  if (m && !/\d{2,}/.test(n)) return { grade: Number(m[2]), rest: n.replace(m[2], '').replace(/کلاس/g, '').trim() };
  return null;
}
const genderOf = (s) => { const g = norm(s); if (!g) return null; if (GIRL_WORDS.includes(g) || /دختر/.test(g)) return 'f'; if (BOY_WORDS.includes(g) || /پسر/.test(g)) return 'm'; return null; };
const PAID_RE = /پرداخت|تسویه|بله|بلی|\byes\b|\bpaid\b|true|^1$|✓|✔|داده|اوکی|\bok\b|تمام|کامل/;
const UNPAID_RE = /نشده|نکرده|نداده|خیر|^نه$|بدهکار|\bno\b|^0$|^n$|false|✗|×|ندارد|معوق/;
function paidOf(v) {
  const s = norm(v);
  if (!s) return null;
  if (UNPAID_RE.test(s)) return false;
  if (PAID_RE.test(s)) return true;
  const num = Number(s.replace(/[٬,\s]/g, ''));
  if (Number.isFinite(num)) return num > 0;
  return null;
}
const looksBirth = (v) => /^\d{2,4}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{1,4}$/.test(toEnDigits(String(v).trim()));

// خروجی: { idx: {field: ستون}, how: {field: 'header'|'content'}, headers, start }
function detectColumns(table) {
  const width = Math.max(1, ...table.slice(0, 50).map((r) => r.length));
  // ردیف عنوان: ردیفی (از ده ردیف اول) که بیشترین عنوان آشنا را دارد
  let best = { row: -1, score: 0 };
  for (let r = 0; r < Math.min(10, table.length); r++) {
    const score = new Set(table[r].map(classifyHeader).filter(Boolean)).size;
    if (score > best.score) best = { row: r, score };
  }
  const idx = {}, how = {}, used = new Set();
  let headers, start = 0;
  const row0IsData = table[0].some((c) => isValidNationalCode(normalizeNationalCode(c)));
  if (best.score >= 2 || (best.score === 1 && !row0IsData)) {
    headers = table[best.row].map((h) => String(h ?? '').trim());
    start = best.row + 1;
    const phones = [];
    headers.forEach((h, i) => {
      const k = classifyHeader(h);
      if (!k) return;
      if (k === 'phone') { phones.push(i); return; }
      if (k in idx) return;
      idx[k] = i; how[k] = 'header'; used.add(i);
    });
    // چند ستون تلفن: ستونی که «دوم/ثابت/منزل» دارد شماره دوم است
    const second = phones.filter((i) => /دوم|2|ثابت|منزل|دیگر|ثانویه|اضطراری/.test(hnorm(headers[i])));
    const firsts = phones.filter((i) => !second.includes(i));
    const main = firsts[0] ?? second[0];
    if (main !== undefined) { idx.parent_phone = main; how.parent_phone = 'header'; used.add(main); }
    const sec = second.find((i) => i !== main) ?? firsts.find((i) => i !== main);
    if (sec !== undefined) { idx.phone2 = sec; how.phone2 = 'header'; used.add(sec); }
  } else {
    headers = Array.from({ length: width }, (_, i) => `ستون ${i + 1}`);
  }
  // تشخیص از روی محتوا برای فیلدهای ناشناخته
  const sample = table.slice(start, start + 300);
  const colVals = (i) => sample.map((r) => String(r[i] ?? '').trim()).filter(Boolean);
  const ratio = (i, f) => { const v = colVals(i); return v.length ? v.filter(f).length / v.length : 0; };
  const pick = (field, f, min) => {
    if (field in idx) return;
    let bi = -1, bs = 0;
    for (let i = 0; i < width; i++) { if (used.has(i)) continue; const s = ratio(i, f); if (s > bs) { bs = s; bi = i; } }
    if (bi >= 0 && bs >= min) { idx[field] = bi; how[field] = 'content'; used.add(bi); }
  };
  pick('national_code', (v) => isValidNationalCode(normalizeNationalCode(v)), 0.6);
  pick('parent_phone', (v) => !!normalizeIranianMobile(v), 0.6);
  pick('gender', (v) => genderOf(v) !== null, 0.7);
  pick('grade', (v) => !!parseGrade(v), 0.7);
  pick('birth', looksBirth, 0.6);
  pick('fee_paid', (v) => paidOf(v) !== null && !/^\d{5,}$/.test(toEnDigits(v).trim()), 0.6);
  pick('full_name', (v) => /^[^\d]{4,}$/.test(v) && /\s/.test(v.trim()), 0.7);
  return { idx, how, headers, start };
}

// ---------- پاک‌سازی یک سطر ----------
const serialToDate = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

function cleanRow(raw, defaults) {
  const full_name = clampStr([raw.full_name, raw.last_name].filter((x) => String(x ?? '').trim()).join(' '), 80);
  if (!full_name) throw new Error('نام و نام خانوادگی خالی است');
  const nc = normalizeNationalCode(raw.national_code);
  if (!isValidNationalCode(nc)) throw new Error(`کد ملی «${raw.national_code ?? ''}» معتبر نیست`);

  const warns = [];
  const phoneRaw = String(raw.parent_phone ?? '').trim();
  const parent_phone = phoneRaw ? normalizeIranianMobile(phoneRaw) : null;
  if (phoneRaw && !parent_phone) warns.push('شماره تماس معتبر نبود و ثبت نشد');
  const p2raw = String(raw.phone2 ?? '').trim();
  const phone2 = p2raw ? (normalizeIranianMobile(p2raw) || toEnDigits(p2raw).replace(/\D/g, '').slice(0, 15) || null) : null;

  // پایه و کلاس: پایه از ستون پایه، یا از ستون کلاس («هفتم الف»)، یا پایهٔ پیش‌فرضی که مدیر انتخاب کرده
  let gp = parseGrade(raw.grade);
  const cg = parseGrade(raw.class);
  let classText = cg ? cg.rest : norm(raw.class);
  if (!gp && cg) gp = cg;
  if (!classText && gp?.rest) classText = gp.rest;
  const grade = gp?.grade || defaults.grade || null;
  if (![4, 5, 6, 7, 8, 9].includes(grade)) throw new Error(String(raw.grade || raw.class || '').trim() ? `پایه «${raw.grade || raw.class}» شناخته نشد (چهارم تا نهم)` : 'پایه مشخص نیست');
  const class_name = clampStr(classText, 30) || null;

  let gender = genderOf(raw.gender) || genderOf(raw.class);
  let genderGuessed = false;
  if (!gender) { gender = defaults.gender || 'm'; genderGuessed = !defaults.gender; }

  let birth_date = null;
  const braw = toEnDigits(String(raw.birth ?? '').trim());
  if (braw) {
    try { birth_date = parseBirthDate(/^\d{5}$/.test(braw) ? serialToDate(Number(braw)) : braw); } catch { warns.push('تاریخ تولد معتبر نبود'); }
  }
  return {
    full_name, national_code: nc, parent_phone, phone2, grade, gender, genderGuessed, warns,
    class_name, father_name: clampStr(raw.father_name, 80) || null, mother_name: clampStr(raw.mother_name, 80) || null,
    school: clampStr(raw.school, 100) || null, birth_date, address: clampStr(raw.address, 300) || null,
    fee_paid: paidOf(raw.fee_paid),
  };
}

// input: رشتهٔ CSV یا {csv, xlsx_b64}. dryRun: فقط بررسی و گزارش، بدون ثبت.
export async function importStudents(centerId, input, { dryRun = false, defaults = {} } = {}) {
  let table;
  if (typeof input === 'string') table = parseCsv(input);
  else if (input?.xlsx_b64) table = parseXlsx(Buffer.from(String(input.xlsx_b64), 'base64'));
  else table = parseCsv(input?.csv || '');
  if (table.length < 1) throw new Error('فایل خالی است');
  const { idx, how, headers, start } = detectColumns(table);
  if (!('national_code' in idx)) throw new Error('ستون کد ملی پیدا نشد. ستونی با عنوان «کد ملی» یا ستونی که کد ملی ۱۰ رقمی دارد لازم است');
  if (!('full_name' in idx)) throw new Error('ستون نام و نام خانوادگی پیدا نشد. ستونی با عنوان «نام و نام خانوادگی» لازم است');
  const dataRows = table.slice(start);
  if (dataRows.length > MAX_ROWS) throw new Error(`حداکثر ${MAX_ROWS} ردیف در هر بار`);
  const mapping = Object.entries(idx).map(([field, i]) => ({ field, label: FIELD_LABELS[field], header: headers[i], how: how[field] }));
  const mappedCols = new Set(Object.values(idx));
  const unmapped = headers.filter((h, i) => h && !mappedCols.has(i));

  const errors = [], news = [], updates = [], seen = new Set();
  let genderGuessed = 0;
  dataRows.forEach((cells, i) => {
    const line = start + i + 1;
    const raw = Object.fromEntries(Object.entries(idx).map(([k, c]) => [k, cells[c]]));
    try {
      const d = cleanRow(raw, defaults);
      if (seen.has(d.national_code)) throw new Error(`کد ملی ${d.national_code} در همین فایل تکراری است`);
      seen.add(d.national_code);
      const ex = get(`SELECT u.id, u.center_id, s.grade, s.class_id FROM users u JOIN students s ON s.user_id=u.id WHERE u.role='student' AND u.national_code=?`, d.national_code);
      if (ex) {
        if (ex.center_id !== centerId) throw new Error('این کد ملی در کانون دیگری ثبت شده است');
        updates.push({ ...d, uid: ex.id, ex, line });
      } else { if (d.genderGuessed) genderGuessed++; news.push({ ...d, line }); }
      d.warns.forEach((w) => errors.push({ line, name: d.full_name, message: w, warning: true }));
    } catch (e) { errors.push({ line, name: clampStr(raw.full_name, 40), message: e.message }); }
  });

  const summary = {
    total: dataRows.length, valid: news.length, will_update: updates.length, errors, error_count: errors.filter((e) => !e.warning).length, mapping, unmapped,
    gender_guessed: genderGuessed, created: 0, updated: 0, classes_created: 0, fee_paid_recorded: 0, fee_paid_unset: 0, dry_run: dryRun,
    paid_in_file: [...news, ...updates].filter((d) => d.fee_paid === true).length,
  };
  if (dryRun || (!news.length && !updates.length)) return summary;

  // هش رمز (ناهمزمان و موازی با سقف) پیش از تراکنش
  const hashes = new Map();
  for (let i = 0; i < news.length; i += 24) await Promise.all(news.slice(i, i + 24).map((g) => hashPasswordAsync(g.national_code, undefined, { bulk: true }).then((h) => hashes.set(g.national_code, h))));

  tx(() => {
    const classIds = new Map(all('SELECT id, grade, name FROM classes WHERE center_id=?', centerId).map((c) => [`${c.grade}|${c.name}`, c.id]));
    const classFor = (grade, name) => {
      const key = `${grade}|${name}`;
      let cid = classIds.get(key);
      if (!cid) { cid = Number(run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', centerId, grade, name).lastInsertRowid); classIds.set(key, cid); summary.classes_created++; }
      return cid;
    };
    const markPaid = (uid) => {
      const r = markFeePaid(centerId, uid);
      if (r?.result === 'paid') summary.fee_paid_recorded++;
      else if (r?.result === 'unset') { summary.fee_paid_recorded++; summary.fee_paid_unset++; }
      return r?.result === 'paid' || r?.result === 'unset';
    };
    for (const d of news) {
      const cid = classFor(d.grade, d.class_name || 'الف');
      const uid = Number(run(`INSERT INTO users (center_id, role, national_code, pass_hash, full_name, gender, must_change_password) VALUES (?,?,?,?,?,?,1)`, centerId, 'student', d.national_code, hashes.get(d.national_code), d.full_name, d.gender).lastInsertRowid);
      run('INSERT INTO students (user_id, school, grade, class_id, birth_date, parent_phone, address, avatar, profile_done, father_name, mother_name, phone2) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)', uid, d.school, d.grade, cid, d.birth_date, d.parent_phone, d.address, 'sprout', d.father_name, d.mother_name, d.phone2);
      if (d.fee_paid === true) markPaid(uid);
      summary.created++;
    }
    for (const d of updates) {
      let changed = false;
      const set = [], vals = [];
      // کلاس: فقط اگر فایل کلاس داشته باشد یا پایه تغییر کرده باشد
      if (d.class_name || d.grade !== d.ex.grade) {
        const cid = classFor(d.grade, d.class_name || get('SELECT name FROM classes WHERE id=?', d.ex.class_id)?.name || 'الف');
        if (cid !== d.ex.class_id || d.grade !== d.ex.grade) { set.push('class_id=?', 'grade=?'); vals.push(cid, d.grade); changed = true; }
      }
      // اطلاعات خالی پروفایل پر می‌شود؛ مقدار قبلیِ پرشده دست نمی‌خورد
      const cur = get('SELECT school, birth_date, parent_phone, address, father_name, mother_name, phone2 FROM students WHERE user_id=?', d.uid);
      for (const k of ['school', 'birth_date', 'parent_phone', 'address', 'father_name', 'mother_name', 'phone2']) if (d[k] && !String(cur[k] ?? '').trim()) { set.push(`${k}=?`); vals.push(d[k]); changed = true; }
      if (set.length) run(`UPDATE students SET ${set.join(', ')} WHERE user_id=?`, ...vals, d.uid);
      if (d.fee_paid === true && markPaid(d.uid)) changed = true;
      if (changed) summary.updated++;
    }
  });
  return summary;
}

export const CSV_TEMPLATE = '﻿نام و نام خانوادگی,کد ملی,شماره تماس,پایه,جنسیت,کلاس,نام پدر,نام مادر,مدرسه,تاریخ تولد,نشانی,شماره تماس دوم,شهریه این ماه\n"علی رضایی",0012345679,09121234567,چهارم,پسر,الف,محمد,زهرا,دبستان نمونه,1393/05/12,"تهران، خیابان نمونه",09351112233,پرداخت شده\n"سارا احمدی",0499370899,09123334455,نهم,دختر,,,,,,,,\n';
