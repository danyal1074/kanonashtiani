// ابزارهای مشترک: رمزنگاری، توکن، تاریخ شمسی، فایل
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, UPLOAD_DIR } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------- رمز عبور (scrypt با نمک تصادفی، هرگز متن ساده) ----------
const STRONG_N = 16384;
export function hashPassword(pw, N = STRONG_N) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(pw), salt, 32, { N, r: 8, p: 1 }).toString('base64url');
  return `scrypt$${N}$${salt}$${hash}`;
}
export function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const calc = crypto.scryptSync(String(pw), salt, 32, { N: Number(n), r: 8, p: 1 });
  const want = Buffer.from(hash, 'base64url');
  return want.length === calc.length && crypto.timingSafeEqual(want, calc);
}
export const needsRehash = (stored) => Number(String(stored).split('$')[1]) < STRONG_N;

// نسخه ناهمزمان برای مسیرهای پرتردد (ورود): محاسبه در نخ‌های جداگانه انجام می‌شود تا حلقه رویداد قفل نشود.
// تعداد محاسبه‌های هم‌زمان محدود است تا صف هش، خواندن فایل‌ها و سایر کارها را گرسنه نکند.
const scryptAsync = (pw, salt, N) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 }, (e, k) => (e ? rej(e) : res(k))));
const SCRYPT_SLOTS = Math.max(2, Math.min(6, Number(process.env.UV_THREADPOOL_SIZE || 4) - 1));
let scryptActive = 0;
const scryptQueue = [];
async function scryptLimited(pw, salt, N) {
  if (scryptActive >= SCRYPT_SLOTS) await new Promise((r) => scryptQueue.push(r));
  scryptActive++;
  try { return await scryptAsync(pw, salt, N); } finally { scryptActive--; scryptQueue.shift()?.(); }
}
export async function hashPasswordAsync(pw, N = STRONG_N) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = (await scryptLimited(String(pw), salt, N)).toString('base64url');
  return `scrypt$${N}$${salt}$${hash}`;
}
export async function verifyPasswordAsync(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const calc = await scryptLimited(String(pw), salt, Number(n));
  const want = Buffer.from(hash, 'base64url');
  return want.length === calc.length && crypto.timingSafeEqual(want, calc);
}

// ---------- توکن جلسه (امضای HMAC) ----------
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'));
const SECRET = process.env.ROSHD_SECRET || fs.readFileSync(SECRET_FILE, 'utf8').trim();
const TOKEN_DAYS = 14;

export function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function readToken(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// ---------- تاریخ (منطقه زمانی تهران) ----------
const TZ = 'Asia/Tehran';
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
export const ymd = (d = new Date()) => ymdFmt.format(d);
export const hm = (d = new Date()) => hmFmt.format(d);
export const nowIso = () => new Date().toISOString();
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// روز هفته ایرانی: شنبه=۰ ... جمعه=۶
export function faWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=یکشنبه
  return (d + 1) % 7;
}
export const weekStart = (dateStr = ymd()) => addDays(dateStr, -faWeekday(dateStr));

export function g2j(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * ~~(days / 12053);
  days %= 12053;
  jy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) { jy += ~~((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + ~~(days / 31) : 7 + ~~((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
export function j2g(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097);
  days %= 146097;
  if (days > 36524) { gy += 100 * ~~(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) { gy += ~~((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return [gy, gm, gd];
}
export const jMonthOf = (dateStr) => { const [y, m, d] = dateStr.split('-').map(Number); return g2j(y, m, d); };
export const JMONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

// ---------- فایل‌های بارگذاری‌شده ----------
const ALLOWED = { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  'application/zip': 'zip', 'text/plain': 'txt', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
export function saveUpload(file, maxMb = 8) {
  if (!file || !file.data) return null;
  const m = /^data:([\w/.+-]+);base64,(.+)$/s.exec(file.data);
  if (!m) fail(400, 'فرمت فایل نامعتبر است');
  const ext = ALLOWED[m[1]];
  if (!ext) fail(400, 'نوع فایل مجاز نیست (فقط تصویر، PDF، Word، ZIP یا متن)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxMb * 1024 * 1024) fail(400, `حجم فایل حداکثر ${maxMb} مگابایت است`);
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}

export const randomCode = (len = 10) => {
  const chars = '0123456789';
  return Array.from(crypto.randomBytes(len), (b) => chars[b % 10]).join('');
};

export function isValidNationalCode(code) {
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const check = +code[9];
  const sum = [...code.slice(0, 9)].reduce((s, d, i) => s + +d * (10 - i), 0) % 11;
  return sum < 2 ? check === sum : check === 11 - sum;
}
export const toEnDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const clampStr = (s, n = 500) => String(s ?? '').trim().slice(0, n);

// استانداردسازی شماره همراه ایرانی (پشتیبانی از +98، 0098، بدون صفر، فاصله‌ها و ارقام فارسی)
export function normalizeIranianMobile(phone) {
  let p = toEnDigits(String(phone || '')).replace(/\D/g, '');
  if (p.startsWith('0098')) p = p.slice(4);
  else if (p.startsWith('98')) p = p.slice(2);
  if (p.length === 10 && p.startsWith('9')) p = '0' + p;
  return /^09\d{9}$/.test(p) ? p : null;
}

// استانداردسازی کد ملی (حذف فاصله و خط‌تیره، بازگردانی صفرهای ابتدایی حذف‌شده توسط اکسل)
export function normalizeNationalCode(code) {
  let nc = toEnDigits(String(code || '')).replace(/\D/g, '');
  if (nc.length >= 7 && nc.length < 10) nc = nc.padStart(10, '0');
  return nc;
}

// پارس و اعتبارسنجی تاریخ تولد (پشتیبانی از فرمت‌های YYYY/MM/DD و DD/MM/YYYY، با یا بدون صفر، شمسی یا میلادی)
export function parseBirthDate(v) {
  v = toEnDigits(String(v || '')).replace(/\s+/g, '');
  if (!v) return null;
  let m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(v);
  if (!m) {
    m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(v);
    if (m) m = [, m[3], m[2], m[1]];
  }
  if (!m) throw new Error('تاریخ تولد باید مانند ۱۳۹۳/۰۵/۱۲ یا ۱۳۹۳-۰۵-۱۲ باشد');
  let [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error('تاریخ تولد نامعتبر است');
  if (y < 1700) [y, mo, d] = j2g(y, mo, d);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
