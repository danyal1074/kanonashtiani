// تولید داده‌های نمونه کامل برای نمایش و تست
// اجرا: npm run seed  (پایگاه داده فعلی پاک و از نو ساخته می‌شود)
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, UPLOAD_DIR, ROOT, all, get, run, tx, closeDb, openDb } from './db.js';
import * as dbm from './db.js';
import { hashPassword, ymd, addDays, weekStart, faWeekday, g2j } from './util.js';

// محافظ: روی پایگاه داده‌ای که کاربر دارد، بدون تأیید صریح اجرا نمی‌شود (جلوگیری از پاک شدن اطلاعات واقعی)
if (get('SELECT COUNT(*) n FROM users').n && !process.argv.includes('--force') && process.env.ROSHD_ALLOW_SEED !== '1') {
  console.error('پایگاه داده اطلاعات دارد و seed همه را پاک می‌کند. اگر مطمئنید: npm run seed -- --force');
  process.exit(1);
}
closeDb();
for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(DB_PATH + ext)) fs.rmSync(DB_PATH + ext);
for (const f of fs.readdirSync(UPLOAD_DIR)) if (f.startsWith('seed-')) fs.rmSync(path.join(UPLOAD_DIR, f));
openDb();

// ---------- تصادفی تکرارپذیر ----------
let seed = 1405;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const fastHash = (pw) => hashPassword(pw, 1024); // در اولین ورود خودکار به هش قوی ارتقا می‌یابد

function nationalCode() {
  for (;;) {
    const d = Array.from({ length: 9 }, () => ri(0, 9));
    const sum = d.reduce((s, x, i) => s + x * (10 - i), 0) % 11;
    const code = d.join('') + (sum < 2 ? sum : 11 - sum);
    if (!get(`SELECT 1 FROM users WHERE national_code=?`, code)) return code;
  }
}
const ncodeFrom = (nine) => { const d = [...nine].map(Number); const s = d.reduce((a, x, i) => a + x * (10 - i), 0) % 11; return nine + (s < 2 ? s : 11 - s); };

const BOYS = ['آرین', 'امیرعلی', 'محمدطاها', 'علیرضا', 'پارسا', 'سپهر', 'آرمان', 'مهدی', 'حسین', 'بردیا', 'رادین', 'کیان', 'ایلیا', 'امیرحسین', 'محمدجواد', 'یاسین', 'هومن', 'سینا', 'نیما', 'عرفان', 'محمدرضا', 'آرشام', 'رضا', 'متین'];
const GIRLS = ['سارا', 'فاطمه', 'زهرا', 'نازنین', 'ریحانه', 'مهسا', 'هستی', 'یسنا', 'آیدا', 'نیایش', 'رها', 'ستایش', 'مریم', 'باران', 'هلیا', 'کوثر', 'الینا', 'آوا', 'ترنم', 'محدثه', 'نرگس', 'فرنیا', 'دینا', 'پرنیا'];
const LAST = ['رضایی', 'محمدی', 'حسینی', 'احمدی', 'کریمی', 'موسوی', 'جعفری', 'صادقی', 'رحیمی', 'نوری', 'هاشمی', 'کاظمی', 'قاسمی', 'عباسی', 'یوسفی', 'اکبری', 'طاهری', 'شریفی', 'زارعی', 'سلیمانی', 'بهرامی', 'فرهادی', 'میرزایی', 'نجفی', 'شکوهی', 'امینی', 'توکلی', 'پاکزاد'];
const SCHOOLS = ['دبستان شهید مطهری', 'دبستان فرهنگ', 'دبستان امام رضا', 'دبیرستان علامه طباطبایی', 'دبیرستان فرزانگان', 'دبیرستان شهید بهشتی', 'مدرسه نمونه دولتی امید', 'مدرسه هوشمند دانش'];
const BOY_AV = ['🦊', '🐼', '🦁', '🐯', '🐨', '🐸', '🐵', '🦉', '🐬', '🚀'];
const GIRL_AV = ['🦄', '🐱', '🐰', '🦋', '🐧', '🐝', '🌸', '🦜', '🐢', '⭐'];
const SUBJECTS_LOW = ['ریاضی', 'علوم', 'فارسی', 'هوش و استعداد'];
const SUBJECTS_HIGH = ['ریاضی', 'علوم', 'فارسی', 'زبان انگلیسی'];
const subjectsOf = (g) => (g <= 6 ? SUBJECTS_LOW : SUBJECTS_HIGH);

const TODAY = ymd();
const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const toIso = (dateStr, hh, mm = 0) => new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:30`).toISOString();
const atDate = (dateStr, hh = 17, mm = 0) => fmt(new Date(toIso(dateStr, hh, mm))); // ساعت تهران → UTC به قالب SQLite
console.log('⏳ ساخت داده‌های نمونه...');

// ---------- فایل‌های نمونه ----------
const SAMPLES = path.join(ROOT, 'public', 'samples');
fs.mkdirSync(SAMPLES, { recursive: true });
function makePdf(file, lines) {
  const content = ['BT', '/F1 22 Tf', '60 760 Td', ...lines.flatMap((l, i) => [i ? '0 -34 Td' : '', `(${l.replace(/[()\\]/g, '')}) Tj`]).filter(Boolean), 'ET'].join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  fs.writeFileSync(path.join(SAMPLES, file), out);
  return Math.ceil(out.length / 1024);
}
function receiptSvg(name, amount, idx) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560" viewBox="0 0 420 560"><rect width="420" height="560" fill="#f8fafc"/><rect x="20" y="20" width="380" height="520" rx="16" fill="#fff" stroke="#cbd5e1"/>
<text x="210" y="80" font-family="Tahoma" font-size="22" text-anchor="middle" fill="#0f172a">رسید کارت به کارت</text><text x="210" y="120" font-family="Tahoma" font-size="14" text-anchor="middle" fill="#16a34a">تراکنش موفق ✓</text>
<text x="370" y="190" font-family="Tahoma" font-size="15" text-anchor="end" fill="#334155">مبلغ: ${amount.toLocaleString('fa-IR')} ریال</text><text x="370" y="230" font-family="Tahoma" font-size="15" text-anchor="end" fill="#334155">واریزکننده: ${name}</text>
<text x="370" y="270" font-family="Tahoma" font-size="15" text-anchor="end" fill="#334155">شماره پیگیری: ${(482910 + idx * 37).toLocaleString('fa-IR', { useGrouping: false })}</text><text x="370" y="310" font-family="Tahoma" font-size="15" text-anchor="end" fill="#334155">مقصد: ۶۰۳۷-۹۹۱۸-****-۴۵۲۱</text>
<line x1="50" y1="350" x2="370" y2="350" stroke="#e2e8f0" stroke-dasharray="6 6"/><text x="210" y="400" font-family="Tahoma" font-size="13" text-anchor="middle" fill="#94a3b8">نمونه آزمایشی</text></svg>`;
  const name_ = `seed-receipt-${idx}.svg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name_), svg);
  return name_;
}

tx(() => {
  // ---------- کانون‌ها ----------
  run(`INSERT INTO centers (id, name, slug, logo, tagline, about, color, card_number, card_holder, min_daily_study) VALUES (1,?,?,?,?,?,?,?,?,?)`,
    'کانون نخبه‌پروری شهید کاظم آشتیانی', 'ashtiani', '/img/logo-ashtiani.svg', 'جایی برای رشد استعدادهای درخشان',
    'کانون نخبه‌پروری شهید کاظم آشتیانی با بیش از یک دهه تجربه، دانش‌آموزان مستعد پایه‌های چهارم تا نهم را در مسیر رشد علمی، مهارتی و اخلاقی همراهی می‌کند. کلاس‌های تقویتی، المپیاد، آزمون‌های جامع و برنامه‌ریزی مطالعه شخصی‌سازی‌شده از برنامه‌های اصلی کانون است.',
    '#7c3aed', '6037991812344521', 'کانون نخبه‌پروری شهید آشتیانی', 50);
  run(`INSERT INTO centers (id, name, slug, logo, tagline, about, color, card_number, card_holder, min_daily_study) VALUES (2,?,?,?,?,?,?,?,?,?)`,
    'کانون نخبگان فردا', 'farda', '/img/logo-farda.svg', 'آینده را امروز بساز', 'کانون نخبگان فردا؛ نمونه دوم برای نمایش چندکانونی بودن پلتفرم.', '#0ea5e9', '5022291077778888', 'کانون نخبگان فردا', 40);

  run(`INSERT INTO users (center_id, role, username, pass_hash, full_name) VALUES (NULL,'admin','admin',?,?)`, fastHash('123456'), 'پشتیبان سامانه');
  run(`INSERT INTO users (center_id, role, username, mobile, pass_hash, full_name) VALUES (1,'manager','manager','09121112233',?,?)`, fastHash('123456'), 'محمد آشتیانی');
  run(`INSERT INTO users (center_id, role, username, pass_hash, full_name) VALUES (2,'manager','manager2',?,?)`, fastHash('123456'), 'لیلا فرهمند');
});

function buildCenter(centerId, perClass, classNames, teachersDef) {
  const classes = {};
  for (const g of [4, 5, 6, 7, 8, 9]) for (const n of classNames) {
    const r = run('INSERT INTO classes (center_id, grade, name) VALUES (?,?,?)', centerId, g, n);
    classes[`${g}${n}`] = { id: Number(r.lastInsertRowid), grade: g, name: n };
  }
  const teachers = {};
  for (const t of teachersDef) {
    const r = run(`INSERT INTO users (center_id, role, username, mobile, pass_hash, full_name, gender) VALUES (?,?,?,?,?,?,?)`, centerId, 'teacher', t.username, t.mobile, fastHash('123456'), t.name, t.gender);
    teachers[t.username] = Number(r.lastInsertRowid);
  }
  const teacherFor = (g, subj) => teachersDef.find((t) => t.teach.some(([s, gs]) => s === subj && gs.includes(g)));
  for (const c of Object.values(classes)) {
    const subs = subjectsOf(c.grade);
    for (const s of subs) { const t = teacherFor(c.grade, s); if (t) run('INSERT OR IGNORE INTO teacher_classes VALUES (?,?,?)', teachers[t.username], c.id, s); }
    // برنامه هفتگی: کلاس «الف» یکشنبه/سه‌شنبه/پنجشنبه، کلاس «ب» شنبه/دوشنبه/چهارشنبه
    const days = c.name === 'الف' ? [1, 3, 5] : [0, 2, 4];
    const slots = [[subs[0], subs[1]], [subs[2], subs[0]], [subs[3], subs[1]]];
    days.forEach((d, i) => slots[i].forEach((s, j) => {
      const t = teacherFor(c.grade, s);
      run('INSERT INTO schedule (class_id, weekday, start, end, subject, teacher_id, room) VALUES (?,?,?,?,?,?,?)', c.id, d, j ? '17:45' : '16:00', j ? '19:15' : '17:30', s, t ? teachers[t.username] : null, `کلاس ${c.grade}${c.name}`);
    }));
  }
  // دانش‌آموزان
  const students = [];
  for (const c of Object.values(classes)) {
    for (let i = 0; i < perClass; i++) {
      const female = rnd() < 0.5;
      const first = pick(female ? GIRLS : BOYS), last = pick(LAST);
      const by = 2026 - c.grade - 6, bm = ri(1, 12), bd = ri(1, 28);
      const r = run(`INSERT INTO users (center_id, role, national_code, pass_hash, full_name, gender, created_at) VALUES (?,?,?,?,?,?,?)`,
        centerId, 'student', nationalCode(), fastHash('123456'), `${first} ${last}`, female ? 'f' : 'm', '2026-09-15 08:00:00');
      const id = Number(r.lastInsertRowid);
      const phone = '0912' + String(ri(1000000, 9999999));
      run('INSERT INTO students (user_id, school, grade, class_id, birth_date, parent_phone, address, avatar) VALUES (?,?,?,?,?,?,?,?)',
        id, pick(SCHOOLS), c.grade, c.id, `${by}-${String(bm).padStart(2, '0')}-${String(bd).padStart(2, '0')}`, phone, `تهران، خیابان ${pick(['ولیعصر', 'انقلاب', 'آزادی', 'شریعتی', 'پاسداران'])}، کوچه ${ri(1, 30)}، پلاک ${ri(1, 120)}`, pick(female ? GIRL_AV : BOY_AV));
      const pr = run(`INSERT INTO users (center_id, role, mobile, pass_hash, full_name) VALUES (?,?,?,?,?)`, centerId, 'parent', phone, fastHash(phone.slice(-6)), `${pick(['آقای', 'خانم'])} ${last}`);
      run('INSERT INTO parent_children VALUES (?,?)', Number(pr.lastInsertRowid), id);
      students.push({ id, grade: c.grade, class_id: c.id, name: `${first} ${last}`, ability: Object.fromEntries(subjectsOf(c.grade).map((s) => [s, 0.35 + rnd() * 0.6])), diligence: 0.3 + rnd() * 0.7 });
    }
  }
  return { classes, teachers, students };
}

const T1 = [
  { username: 'teacher', name: 'مریم احمدی', gender: 'f', mobile: '09125550001', teach: [['ریاضی', [7, 8, 9]]] },
  { username: 'teacher2', name: 'علی کریمی', gender: 'm', mobile: '09125550002', teach: [['ریاضی', [4, 5, 6]]] },
  { username: 'teacher3', name: 'زهرا حسینی', gender: 'f', mobile: '09125550003', teach: [['علوم', [4, 5, 6, 7, 8, 9]]] },
  { username: 'teacher4', name: 'حسن موسوی', gender: 'm', mobile: '09125550004', teach: [['فارسی', [4, 5, 6, 7, 8, 9]]] },
  { username: 'teacher5', name: 'نیلوفر صادقی', gender: 'f', mobile: '09125550005', teach: [['زبان انگلیسی', [7, 8, 9]]] },
  { username: 'teacher6', name: 'رضا نوری', gender: 'm', mobile: '09125550006', teach: [['هوش و استعداد', [4, 5, 6]]] },
];
const T2 = [{ username: 'farda.teacher', name: 'سمیه رحمانی', gender: 'f', mobile: '09125550101', teach: [['ریاضی', [4, 5, 6, 7, 8, 9]], ['علوم', [4, 5, 6, 7, 8, 9]], ['فارسی', [4, 5, 6, 7, 8, 9]], ['زبان انگلیسی', [7, 8, 9]], ['هوش و استعداد', [4, 5, 6]]] }];

const C1 = tx(() => buildCenter(1, 40, ['الف', 'ب'], T1));
const C2 = tx(() => buildCenter(2, 2, ['الف'], T2));

// ---------- حساب‌های نمایشی ثابت ----------
const demo = tx(() => {
  const c7 = C1.classes['7الف'], c5 = C1.classes['5الف'], c9 = C1.classes['9الف'];
  const [gy, gm, gd] = TODAY.split('-').map(Number);
  const mk = (name, gender, cls, username, nine, birth, avatar) => {
    const r = run(`INSERT INTO users (center_id, role, username, national_code, pass_hash, full_name, gender, created_at) VALUES (1,'student',?,?,?,?,?,?)`, username, ncodeFrom(nine), fastHash('123456'), name, gender, '2026-09-15 08:00:00');
    const id = Number(r.lastInsertRowid);
    run('INSERT INTO students (user_id, school, grade, class_id, birth_date, parent_phone, address, avatar) VALUES (?,?,?,?,?,?,?,?)', id, 'دبیرستان علامه طباطبایی', cls.grade, cls.id, birth, '09120000000', 'تهران، خیابان شریعتی، کوچه بهار، پلاک ۱۲', avatar);
    return id;
  };
  // تولد آرین امروز است تا پیام تبریک نمایش داده شود
  const arian = mk('آرین رضایی', 'm', c7, 'student', '001234567', `${gy - 13}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`, '🚀');
  const sara = mk('سارا رضایی', 'f', c5, 'student5', '001234568', '2015-03-12', '🦄');
  const kian = mk('کیان رضایی', 'm', c9, 'student9', '001234569', '2011-06-02', '🐯');
  const p = run(`INSERT INTO users (center_id, role, mobile, pass_hash, full_name) VALUES (1,'parent','09120000000',?,?)`, fastHash('123456'), 'آقای رضایی');
  for (const s of [arian, sara, kian]) run('INSERT INTO parent_children VALUES (?,?)', Number(p.lastInsertRowid), s);
  const ab = { ریاضی: 0.88, علوم: 0.62, فارسی: 0.75, 'زبان انگلیسی': 0.5, 'هوش و استعداد': 0.8 };
  C1.students.push({ id: arian, grade: 7, class_id: c7.id, name: 'آرین رضایی', ability: ab, diligence: 0.85, demo: true });
  C1.students.push({ id: sara, grade: 5, class_id: c5.id, name: 'سارا رضایی', ability: { ...ab, علوم: 0.9 }, diligence: 0.9, demo: true });
  C1.students.push({ id: kian, grade: 9, class_id: c9.id, name: 'کیان رضایی', ability: ab, diligence: 0.5, demo: true, unpaid: true });
  return { arian, sara, kian, parent: Number(p.lastInsertRowid), c7 };
});

// ---------- بانک سؤال ----------
const fa = (n) => n.toLocaleString('fa-IR', { useGrouping: false });
function mathQ(g) {
  const a = ri(g * 2, g * 9), b = ri(2, g + 6);
  const ops = [
    () => ({ text: `حاصل ${fa(a)} × ${fa(b)} چند است؟`, ans: a * b }),
    () => ({ text: `حاصل ${fa(a * b)} ÷ ${fa(b)} چند است؟`, ans: a }),
    () => ({ text: `حاصل ${fa(a)} + ${fa(b * 13)} − ${fa(b)} چند است؟`, ans: a + b * 12 }),
    () => ({ text: `اگر ${fa(b)} دفتر ${fa(a * b * 100)} تومان باشد، یک دفتر چند تومان است؟`, ans: a * 100 }),
  ];
  const q = pick(ops)();
  const opts = new Set([q.ans]);
  while (opts.size < 4) opts.add(q.ans + pick([-1, 1]) * ri(1, Math.max(3, Math.round(q.ans * 0.2))));
  const arr = [...opts].sort(() => rnd() - 0.5);
  return { text: q.text, options: arr.map(fa), answer: arr.indexOf(q.ans), subject: 'ریاضی' };
}
const BANK = {
  علوم: [
    ['کدام گزینه منبع انرژی تجدیدپذیر است؟', ['زغال‌سنگ', 'نفت', 'انرژی خورشیدی', 'گاز طبیعی'], 2],
    ['واحد اندازه‌گیری نیرو چیست؟', ['ژول', 'نیوتون', 'وات', 'پاسکال'], 1],
    ['گیاهان در فرایند فتوسنتز کدام گاز را جذب می‌کنند؟', ['اکسیژن', 'نیتروژن', 'کربن‌دی‌اکسید', 'هیدروژن'], 2],
    ['آب در دمای چند درجه سانتی‌گراد (در سطح دریا) می‌جوشد؟', ['۸۰', '۹۰', '۱۰۰', '۱۲۰'], 2],
    ['کدام اندام مسئول پمپاژ خون در بدن است؟', ['کبد', 'قلب', 'ریه', 'کلیه'], 1],
    ['نزدیک‌ترین سیاره به خورشید کدام است؟', ['زهره', 'مریخ', 'عطارد', 'زمین'], 2],
    ['کدام ماده رسانای خوب جریان برق است؟', ['چوب', 'مس', 'پلاستیک', 'شیشه'], 1],
    ['کوچک‌ترین واحد سازنده موجودات زنده چیست؟', ['اتم', 'سلول', 'بافت', 'مولکول'], 1],
    ['ماه در حدود چند روز یک‌بار به دور زمین می‌چرخد؟', ['۷', '۱۵', '۲۷', '۳۶۵'], 2],
    ['کدام حالت ماده شکل و حجم معین دارد؟', ['جامد', 'مایع', 'گاز', 'پلاسما'], 0],
  ],
  فارسی: [
    ['مترادف واژه «شکیبا» کدام است؟', ['صبور', 'شجاع', 'دانا', 'مهربان'], 0],
    ['کدام واژه جمع مکسر است؟', ['درختان', 'کتاب‌ها', 'علوم', 'دانشجویان'], 2],
    ['متضاد واژه «فراز» کدام است؟', ['بالا', 'نشیب', 'دور', 'آغاز'], 1],
    ['سراینده «شاهنامه» کیست؟', ['سعدی', 'حافظ', 'فردوسی', 'مولوی'], 2],
    ['در جمله «علی کتاب را خواند» نهاد کدام است؟', ['کتاب', 'خواند', 'علی', 'را'], 2],
    ['کدام کلمه درست نوشته شده است؟', ['ذخیره', 'زخیره', 'ظخیره', 'ضخیره'], 0],
    ['«گلستان» اثر کدام شاعر است؟', ['سعدی', 'نظامی', 'عطار', 'جامی'], 0],
    ['معنی واژه «ایثار» چیست؟', ['خودخواهی', 'از خودگذشتگی', 'شتاب', 'پیروزی'], 1],
  ],
  'زبان انگلیسی': [
    ['Which word is a color?', ['Apple', 'Blue', 'Run', 'Table'], 1],
    ['"I ___ a student."', ['is', 'are', 'am', 'be'], 2],
    ['The opposite of "big" is:', ['tall', 'small', 'long', 'fast'], 1],
    ['How many days are there in a week?', ['five', 'six', 'seven', 'eight'], 2],
    ['"She ___ to school every day."', ['go', 'goes', 'going', 'gone'], 1],
    ['Which one is a fruit?', ['Carrot', 'Banana', 'Potato', 'Onion'], 1],
  ],
  'هوش و استعداد': [
    ['عدد بعدی دنباله ۲، ۴، ۸، ۱۶، ... کدام است؟', ['۲۰', '۲۴', '۳۲', '۱۸'], 2],
    ['کدام شکل با بقیه متفاوت است؟ (مربع، مستطیل، دایره، لوزی)', ['مربع', 'مستطیل', 'دایره', 'لوزی'], 2],
    ['اگر امروز دوشنبه باشد، ۳ روز بعد چه روزی است؟', ['چهارشنبه', 'پنجشنبه', 'جمعه', 'سه‌شنبه'], 1],
    ['عدد بعدی دنباله ۱، ۴، ۹، ۱۶، ... کدام است؟', ['۲۰', '۲۵', '۲۴', '۳۶'], 1],
    ['کدام کلمه با بقیه هم‌گروه نیست؟', ['سیب', 'پرتقال', 'هویج', 'موز'], 2],
    ['۵ ماشین در ۵ دقیقه ۵ قطعه می‌سازند. ۱۰۰ ماشین در چند دقیقه ۱۰۰ قطعه می‌سازند؟', ['۵', '۲۰', '۱۰۰', '۵۰'], 0],
  ],
};
function bankQ(subject, g) {
  if (subject === 'ریاضی') return mathQ(g);
  const [text, options, answer] = pick(BANK[subject]);
  return { text, options, answer, subject };
}
const makeQuestions = (subjects, n, g) => Array.from({ length: n }, (_, i) => bankQ(subjects[i % subjects.length], g));

// ---------- آزمون‌ها، نتایج، امتیاز ----------
function simulateAnswers(qs, st) {
  return qs.map((q) => {
    const p = st.ability[q.subject] ?? 0.6;
    if (rnd() < 0.06) return null;
    return rnd() < p ? q.answer : (q.answer + ri(1, 3)) % 4;
  });
}
function insertResults(examId, title, qs, studentsList, dateStr, source) {
  for (const st of studentsList) {
    const ans = simulateAnswers(qs, st);
    const correct = ans.filter((a, i) => a === qs[i].answer).length, blank = ans.filter((a) => a === null).length;
    const percent = Math.round((correct / qs.length) * 1000) / 10;
    const pts = Math.round(percent / 10) + (percent >= 100 ? 5 : 0);
    const when = atDate(dateStr, ri(16, 20), ri(0, 59));
    run('INSERT INTO exam_results (exam_id, student_id, answers, correct, wrong, blank, percent, points, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      examId, st.id, JSON.stringify(ans), correct, qs.length - correct - blank, blank, percent, pts, source, when);
    if (pts) run('INSERT INTO points (student_id, amount, category, reason, ref, created_at) VALUES (?,?,?,?,?,?)', st.id, pts, 'آزمون', `نتیجه آزمون «${title}» (${percent}٪)`, `exam:${examId}`, when);
  }
}
const teacherOf = (centerTeachers, def, g, s) => centerTeachers[def.find((t) => t.teach.some(([x, gs]) => x === s && gs.includes(g)))?.username];

function seedExams(centerId, C, def) {
  for (const g of [4, 5, 6, 7, 8, 9]) {
    const subs = subjectsOf(g);
    const gs = C.students.filter((s) => s.grade === g);
    const plan = [
      { title: `آزمونک ${subs[0]} - فصل اول`, kind: 'online', subject: subs[0], date: addDays(TODAY, -38), n: 10 },
      { title: `آزمونک ${subs[1]} - مهر`, kind: 'online', subject: subs[1], date: addDays(TODAY, -30), n: 10 },
      { title: `آزمون کاغذی ${subs[2]}`, kind: 'paper', subject: subs[2], date: addDays(TODAY, -21), n: 12 },
      { title: 'آزمون جامع مهر', kind: 'comprehensive', subject: null, date: addDays(TODAY, -15), n: 20 },
      { title: `آزمونک ${subs[0]} - فصل دوم`, kind: 'online', subject: subs[0], date: addDays(TODAY, -8), n: 10 },
      { title: `آزمونک ${subs[3]}`, kind: 'online', subject: subs[3], date: addDays(TODAY, -4), n: 8 },
    ];
    for (const e of plan) {
      const qs = e.kind === 'comprehensive' ? makeQuestions(subs, e.n, g) : makeQuestions([e.subject], e.n, g);
      const author = e.kind === 'comprehensive' ? get(`SELECT id FROM users WHERE center_id=? AND role='manager'`, centerId).id : teacherOf(C.teachers, def, g, e.subject);
      const r = run('INSERT INTO exams (center_id, title, kind, subject, grade, duration_min, questions, exam_date, location, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        centerId, e.title, e.kind, e.subject, g, e.kind === 'comprehensive' ? 90 : 12, JSON.stringify(e.kind === 'online' ? qs : qs.map((q) => ({ answer: q.answer, subject: q.subject }))),
        e.kind === 'comprehensive' ? e.date : null, e.kind === 'comprehensive' ? 'سالن اجتماعات کانون' : null, author, atDate(addDays(e.date, -1), 12));
      insertResults(Number(r.lastInsertRowid), e.title, qs, gs.filter(() => rnd() < 0.93), e.date, e.kind === 'online' ? 'online' : 'scan');
    }
    // آزمون‌های باز (هنوز شرکت نکرده‌اند)
    const open = [
      { title: `آزمون آنلاین ${subs[0]} - مرور هفته`, subject: subs[0], n: 8, dur: 10 },
      { title: `چالش ${subs[1]}`, subject: subs[1], n: 6, dur: 8 },
    ];
    for (const e of open) run('INSERT INTO exams (center_id, title, kind, subject, grade, duration_min, questions, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      centerId, e.title, 'online', e.subject, g, e.dur, JSON.stringify(makeQuestions([e.subject], e.n, g)), teacherOf(C.teachers, def, g, e.subject), atDate(addDays(TODAY, -1), 10));
    // آزمون جامع آینده برای چاپ کارت ورود
    run('INSERT INTO exams (center_id, title, kind, grade, duration_min, questions, exam_date, location, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      centerId, 'آزمون جامع آبان', 'comprehensive', g, 90, JSON.stringify(makeQuestions(subs, 20, g).map((q) => ({ answer: q.answer, subject: q.subject }))),
      addDays(TODAY, 11), 'سالن اجتماعات کانون', get(`SELECT id FROM users WHERE center_id=? AND role='manager'`, centerId).id);
  }
}

function seedActivity(centerId, C, def) {
  const center = get('SELECT min_daily_study FROM centers WHERE id=?', centerId);
  const ws = weekStart(TODAY), lastWs = addDays(ws, -7);
  // برنامه پومودوروی هفتگی (۱۰ پومودورو)
  for (const c of Object.values(C.classes)) {
    const subs = subjectsOf(c.grade);
    for (const w of [lastWs, ws]) [[subs[0], 4], [subs[1], 3], [subs[2], 2], [subs[3], 1]].forEach(([s, n]) =>
      run('INSERT INTO study_plans (class_id, week_start, subject, target, teacher_id) VALUES (?,?,?,?,?)', c.id, w, s, n, teacherOf(C.teachers, def, c.grade, subs[0])));
  }
  for (const st of C.students) {
    const subs = subjectsOf(st.grade);
    // پومودوروها و امتیاز مطالعه (۳۰ روز گذشته + امروز)
    for (let back = 30; back >= 0; back--) {
      const d = addDays(TODAY, -back);
      if (faWeekday(d) === 6 && rnd() < 0.7) continue;
      let n = Math.max(0, Math.round(st.diligence * 5 * rnd() + (rnd() < st.diligence ? 1 : 0)));
      if (back === 0) n = st.demo ? (st.id === demo.arian ? 1 : 0) : Math.min(n, ri(0, 3));
      for (let i = 0; i < n; i++) {
        const s = rnd() < 0.4 ? subs[0] : pick(subs);
        run('INSERT INTO pomodoros (student_id, subject, minutes, date, created_at) VALUES (?,?,?,?,?)', st.id, s, 25, d, atDate(d, 15 + i, ri(0, 59)));
      }
      if (n) run('INSERT INTO points (student_id, amount, category, reason, created_at) VALUES (?,?,?,?,?)', st.id, n * 2, 'ساعت مطالعه', `${n} پومودوروی مطالعه در روز`, atDate(d, 21));
      if (back > 0 && back <= 20 && n * 25 < center.min_daily_study && faWeekday(d) !== 6)
        run('INSERT OR IGNORE INTO points (student_id, amount, category, reason, ref, created_at) VALUES (?,?,?,?,?,?)', st.id, -3, 'مطالعه کم', `مطالعه ${n * 25} دقیقه‌ای (کمتر از حداقل ${center.min_daily_study} دقیقه)`, `lowstudy:${d}`, atDate(d, 23));
    }
  }
  // حضور و غیاب ۴ هفته گذشته
  for (const c of Object.values(C.classes)) {
    const days = new Set(all('SELECT DISTINCT weekday FROM schedule WHERE class_id=?', c.id).map((x) => x.weekday));
    const sts = C.students.filter((s) => s.class_id === c.id);
    const tid = get('SELECT teacher_id FROM schedule WHERE class_id=? LIMIT 1', c.id).teacher_id;
    for (let back = 28; back >= 0; back--) {
      const d = addDays(TODAY, -back);
      if (!days.has(faWeekday(d))) continue;
      // امروز: فقط برای کلاس‌هایی غیر از کلاس‌های معلم نمایشی ثبت شود
      if (back === 0 && c.grade >= 7) continue;
      for (const st of sts) {
        const x = rnd();
        const status = st.demo && back > 0 && back < 10 && st.id === demo.arian && x < 0.15 ? 'absent' : x < 0.05 ? 'absent' : x < 0.08 ? 'excused' : 'present';
        run('INSERT INTO attendance (class_id, student_id, date, status, sms_sent, teacher_id) VALUES (?,?,?,?,?,?)', c.id, st.id, d, status, status === 'absent' && back > 0 ? 1 : 0, tid);
        if (status === 'absent') run('INSERT OR IGNORE INTO points (student_id, amount, category, reason, ref, created_at) VALUES (?,?,?,?,?,?)', st.id, -5, 'غیبت', `غیبت بدون اطلاع در کلاس ${c.name} (${d})`, `abs:${c.id}:${d}`, atDate(d, 19));
      }
    }
  }
  // تکالیف
  const TITLES = {
    ریاضی: ['حل تمرین‌های صفحه ۲۴ تا ۲۶', 'کاربرگ کسرها و اعداد اعشاری', 'مسئله‌های چالشی فصل ۲', 'تمرین الگوها و دنباله‌ها'],
    علوم: ['گزارش آزمایش چگالی', 'پوستر چرخه آب', 'پرسش‌های پایان فصل ۳', 'تحقیق درباره انرژی‌های نو'],
    فارسی: ['انشا: یک روز بارانی', 'املای درس ۵', 'بازنویسی حکایت گلستان', 'معنی واژه‌های درس ۴'],
    'زبان انگلیسی': ['Workbook page 12-13', 'Write 10 sentences about your family', 'Vocabulary Lesson 3'],
    'هوش و استعداد': ['حل ۱۵ معمای تصویری', 'کاربرگ الگویابی', 'تمرین تفکر فضایی'],
  };
  for (const c of Object.values(C.classes)) {
    const subs = subjectsOf(c.grade);
    const sts = C.students.filter((s) => s.class_id === c.id);
    const specs = [[-20, subs[0]], [-14, subs[1]], [-9, subs[2]], [-5, subs[0]], [-2, subs[3]], [1, subs[0]], [3, subs[1]], [6, subs[2]]];
    for (const [off, s] of specs) {
      const deadline = toIso(addDays(TODAY, off), 22);
      const tid = teacherOf(C.teachers, def, c.grade, s);
      const title = pick(TITLES[s]);
      const r = run('INSERT INTO assignments (center_id, class_id, teacher_id, subject, title, description, deadline, reward_points, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        centerId, c.id, tid, s, title, 'پاسخ‌ها را مرتب بنویسید و تصویر واضح یا فایل PDF ارسال کنید.', deadline, pick([5, 5, 8, 10]), atDate(addDays(TODAY, off - 5), 10));
      const aid = Number(r.lastInsertRowid);
      for (const st of sts) {
        const x = rnd();
        if (off > 0) {
          if (x < 0.25 && !st.demo) run('INSERT INTO submissions (assignment_id, student_id, note, late, submitted_at) VALUES (?,?,?,?,?)', aid, st.id, 'انجام شد', 0, atDate(TODAY, 9));
          continue;
        }
        if (x < 0.8 * (0.6 + st.diligence * 0.5)) {
          run('INSERT INTO submissions (assignment_id, student_id, note, late, submitted_at) VALUES (?,?,?,?,?)', aid, st.id, pick(['انجام شد', 'پاسخ‌ها پیوست شد', 'ممنون از توضیحات']), 0, atDate(addDays(TODAY, off - 1), 18));
          run('INSERT INTO points (student_id, amount, category, reason, ref, created_at) VALUES (?,?,?,?,?,?)', st.id, 5, 'تکلیف', `ارسال به‌موقع تکلیف «${title}»`, `asg:${aid}`, atDate(addDays(TODAY, off - 1), 18));
        } else {
          if (x < 0.9) run('INSERT INTO submissions (assignment_id, student_id, note, late, submitted_at) VALUES (?,?,?,?,?)', aid, st.id, 'با تأخیر', 1, atDate(addDays(TODAY, off + 1), 18));
          run('INSERT INTO points (student_id, amount, category, reason, ref, created_at) VALUES (?,?,?,?,?,?)', st.id, -5, 'تکلیف دیرشده', `ارسال‌نکردن به‌موقع تکلیف «${title}»`, `late:${aid}`, atDate(addDays(TODAY, off + 1), 0));
        }
      }
    }
  }
  // پرداخت حق عضویت
  for (const g of [4, 5, 6, 7, 8, 9]) run('INSERT INTO fee_settings (center_id, grade, amount, lock_date) VALUES (?,?,?,?)', centerId, g, g <= 6 ? 3500000 : 4500000, g === 9 ? addDays(TODAY, -5) : addDays(TODAY, 20));
  let idx = 0;
  for (const st of C.students) {
    const amount = st.grade <= 6 ? 3500000 : 4500000;
    const x = rnd();
    if (st.unpaid) continue;
    if (st.id === demo.arian || st.id === demo.sara || (st.grade === 9 ? x < 0.88 : x < 0.62)) {
      const d = addDays(TODAY, -ri(5, 50));
      const r = run(`INSERT INTO payments (student_id, amount, receipt_path, status, created_at, reviewed_at) VALUES (?,?,?,'approved',?,?)`, st.id, amount, receiptSvg(st.name, amount * 10, idx++), atDate(d, 11), atDate(addDays(d, 1), 10));
      run(`INSERT INTO transactions (center_id, type, amount, title, category, date, ref) VALUES (?,?,?,?,?,?,?)`, centerId, 'income', amount, `حق عضویت - ${st.name}`, 'حق عضویت', addDays(d, 1), `pay:${r.lastInsertRowid}`);
    } else if (x < (st.grade === 9 ? 0.93 : 0.74)) {
      run(`INSERT INTO payments (student_id, amount, receipt_path, status, created_at) VALUES (?,?,?,'pending',?)`, st.id, amount, receiptSvg(st.name, amount * 10, idx++), atDate(addDays(TODAY, -ri(0, 3)), 12));
    } else if (x < 0.78) {
      run(`INSERT INTO payments (student_id, amount, receipt_path, status, reject_reason, created_at, reviewed_at) VALUES (?,?,?,'rejected',?,?,?)`, st.id, amount, receiptSvg(st.name, amount * 5, idx++), 'مبلغ واریزی کمتر از حق عضویت است', atDate(addDays(TODAY, -9), 12), atDate(addDays(TODAY, -8), 12));
    }
    if (st.grade === 9 && !get(`SELECT 1 FROM payments WHERE student_id=? AND status='approved'`, st.id))
      run('INSERT OR IGNORE INTO points (student_id, amount, category, reason, ref, created_at) VALUES (?,?,?,?,?,?)', st.id, -20, 'حق عضویت', 'پرداخت نشدن حق عضویت پس از پایان مهلت', `fee:${addDays(TODAY, -5)}`, atDate(addDays(TODAY, -4), 1));
  }
}

tx(() => { seedExams(1, C1, T1); seedExams(2, C2, T2); });
tx(() => { seedActivity(1, C1, T1); seedActivity(2, C2, T2); });

// ---------- اطلاعیه، پیام، مشاوره، فروشگاه، حسابداری ----------
tx(() => {
  const mgr = get(`SELECT id FROM users WHERE username='manager'`).id;
  const t1 = C1.teachers.teacher, t3 = C1.teachers.teacher3;
  const anns = [
    ['all', [], '🎉', 'شروع جشنواره «ستاره‌های مطالعه»', 'از شنبه جشنواره ستاره‌های مطالعه آغاز می‌شود. هر هفته سه نفر برتر هر پایه در زمان مطالعه، جایزه ویژه و نشان طلایی دریافت می‌کنند. با پومودوروهایت در رقابت شرکت کن!', -6],
    ['grade', [7], '📝', 'آزمون جامع آبان پایه هفتم', `آزمون جامع آبان در تاریخ ${addDays(TODAY, 11)} در سالن اجتماعات کانون برگزار می‌شود. کارت ورود به جلسه از دفتر کانون تحویل داده می‌شود. حضور ۱۵ دقیقه قبل از شروع الزامی است.`, -1],
    ['all', [], '🔬', 'بازدید علمی از موزه علوم و فناوری', 'بازدید علمی پایه‌های ششم تا نهم پنجشنبه آینده برگزار می‌شود. فرم رضایت والدین را تا سه‌شنبه تحویل دهید.', 0],
  ];
  for (const [type, val, emoji, title, body, off] of anns) {
    const r = run('INSERT INTO announcements (center_id, title, body, emoji, target_type, target_value, author_id, created_at) VALUES (1,?,?,?,?,?,?,?)', title, body, emoji, type, JSON.stringify(val), mgr, atDate(addDays(TODAY, off), 9));
    const aid = Number(r.lastInsertRowid);
    for (const st of C1.students) if (!st.demo && rnd() < (off < -3 ? 0.85 : 0.4) && (type === 'all' || val.includes(st.grade))) run('INSERT INTO announcement_views (announcement_id, user_id, seen_at) VALUES (?,?,?)', aid, st.id, atDate(addDays(TODAY, off), 15));
  }
  // پیام‌ها
  const mates = C1.students.filter((s) => s.class_id === demo.c7.id && !s.demo).slice(0, 3);
  const msgs = [
    [demo.arian, t1, 'سلام خانم احمدی، برای تمرین ۵ صفحه ۲۶ باید از روش جدولی استفاده کنیم؟', -2],
    [t1, demo.arian, 'سلام آرین جان، بله. اول جدول را کامل کن، بعد الگو را پیدا کن. آفرین به پیگیری‌ات 🌟', -2],
    [demo.arian, t1, 'ممنونم، حل شد!', -1],
    [demo.parent, t1, 'سلام، وقت بخیر. آرین این هفته در ریاضی چطور بوده؟', -3],
    [t1, demo.parent, 'سلام، عملکرد آرین در ریاضی عالی است. فقط در ارسال به‌موقع تکالیف کمی دقت بیشتری لازم دارد.', -3],
    [mates[0].id, demo.arian, 'آرین فردا جزوه علوم رو میاری؟', -1],
    [demo.arian, mates[0].id, 'آره حتماً 👍', -1],
    [t3, demo.arian, 'آرین عزیز، گزارش آزمایش چگالی‌ات را هنوز ندیده‌ام. لطفاً ارسال کن.', 0],
  ];
  for (const [f, t, b, off] of msgs) run('INSERT INTO messages (center_id, from_id, to_id, body, created_at, read_at) VALUES (1,?,?,?,?,?)', f, t, b, atDate(addDays(TODAY, off), 16, ri(0, 59)), off < 0 ? atDate(addDays(TODAY, off), 20) : null);
  run('INSERT INTO counsel_notes (student_id, teacher_id, body, created_at) VALUES (?,?,?,?)', demo.arian, t1, 'آرین در حل مسئله‌های ریاضی خلاق است و پتانسیل خوبی برای المپیاد دارد. پیشنهاد می‌شود در خانه زمان مطالعه علوم و زبان را افزایش دهد و دفتر خطا داشته باشد.', atDate(addDays(TODAY, -10), 18));
  run('INSERT INTO counsel_notes (student_id, teacher_id, body, created_at) VALUES (?,?,?,?)', demo.arian, t3, 'در کلاس علوم مشارکت خوبی دارد؛ اما برای تثبیت مفاهیم به تمرین بیشتر نیاز است.', atDate(addDays(TODAY, -3), 18));
  run('INSERT INTO counsel_notes (student_id, teacher_id, body, created_at) VALUES (?,?,?,?)', demo.sara, C1.teachers.teacher2, 'سارا دانش‌آموزی منظم و دقیق است. در آزمون‌های علوم درخشان بوده است.', atDate(addDays(TODAY, -6), 18));

  // فروشگاه
  const products = [
    ['دوره ویدیویی ریاضی تیزهوشان هفتم', 'video', 'هفتم', 'ریاضی', '۲۴ جلسه آموزش مفهومی و حل تست‌های تیزهوشان با تدریس مریم احمدی', 'در این دوره همه فصل‌های ریاضی پایه هفتم با رویکرد حل مسئله و تفکر خلاق آموزش داده می‌شود.\n• ۲۴ جلسه ویدیویی ۴۵ دقیقه‌ای\n• ۳۰۰ تست طبقه‌بندی‌شده با پاسخ تشریحی\n• دسترسی دائمی و پشتیبانی در پیام‌رسان کانون', 1890000, 20, '🎬', '#7c3aed'],
    ['جزوه طلایی علوم هشتم', 'booklet', 'هشتم', 'علوم', 'خلاصه درس، نکات کلیدی و ۲۰۰ پرسش چهارگزینه‌ای', 'جزوه‌ای جمع‌وجور و رنگی برای مرور سریع قبل از آزمون‌ها.\n• ۱۲۰ صفحه PDF\n• نقشه ذهنی هر فصل\n• پاسخ‌نامه کامل', 290000, 0, '📗', '#16a34a'],
    ['بسته هوش و استعداد چهارم تا ششم', 'booklet', 'چهارم تا ششم', 'هوش', 'معماها و تمرین‌های الگویابی برای آمادگی آزمون تیزهوشان', 'بسته‌ای سرگرم‌کننده از ۴۰۰ پرسش هوش تصویری، کلامی و ریاضی.\n• سطح‌بندی از آسان تا المپیادی\n• پاسخ تشریحی', 420000, 15, '🧩', '#f59e0b'],
    ['دوره ویدیویی زبان انگلیسی پایه', 'video', 'هفتم تا نهم', 'زبان', 'یادگیری مکالمه و گرامر با بازی و داستان', '۳۰ ویدیوی کوتاه و جذاب با تمرین‌های تعاملی برای تقویت مهارت شنیداری و گفتاری.', 1450000, 30, '🗣️', '#0ea5e9'],
    ['جزوه فارسی و نگارش نهم', 'booklet', 'نهم', 'فارسی', 'آرایه‌های ادبی، دستور زبان و نمونه انشاهای برتر', 'جزوه کامل فارسی نهم همراه با ۱۵۰ تست و ۲۰ نمونه انشای برتر دانش‌آموزان کانون.', 250000, 0, '📕', '#e11d48'],
    ['دوره آمادگی المپیاد ریاضی', 'video', 'هشتم و نهم', 'ریاضی', 'ترکیبیات، نظریه اعداد و هندسه برای المپیاد', '۱۸ جلسه کارگاه حل مسئله المپیادی با مسائل سال‌های گذشته و مسئله‌های تألیفی.', 2400000, 10, '🏅', '#9333ea'],
  ];
  for (const p of products) run('INSERT INTO products (center_id, title, kind, grade, description, details, price, discount_percent, cover, color, download_url) VALUES (1,?,?,?,?,?,?,?,?,?,?)', p[0], p[1], p[2], p[4], p[5], p[6], p[7], p[8], p[9], '/samples/shop-sample.pdf');
  run(`INSERT INTO discount_codes (code, center_id, percent) VALUES ('ROSHD10',1,10), ('NOKHBE20',1,20), ('FARDA15',2,15)`);
  run('INSERT INTO products (center_id, title, kind, grade, description, details, price, discount_percent, cover, color) VALUES (2,?,?,?,?,?,?,?,?,?)', 'جزوه ریاضی ششم', 'booklet', 'ششم', 'خلاصه و تمرین', 'جزوه نمونه کانون دوم', 180000, 0, '📘', '#0ea5e9');

  // جزوه و ویدیو
  makePdf('shop-sample.pdf', ['Roshd Elite Platform', 'Purchased content - sample file', 'Thank you for your purchase!']);
  for (const g of [4, 5, 6, 7, 8, 9]) {
    const subs = subjectsOf(g);
    subs.slice(0, 3).forEach((s, i) => {
      const f = `booklet-g${g}-${i + 1}.pdf`;
      const kb = makePdf(f, ['Roshd Elite Platform', `Grade ${g} - Booklet ${i + 1}`, 'Sample study booklet for demo', 'Summary, key points and practice']);
      run('INSERT INTO materials (center_id, grade, subject, title, kind, url, size_kb, created_at) VALUES (1,?,?,?,?,?,?,?)', g, s, `جزوه ${s} - فصل ${['اول', 'دوم', 'سوم'][i]}`, 'pdf', `/samples/${f}`, kb, atDate(addDays(TODAY, -20 + i * 5), 10));
    });
    run('INSERT INTO materials (center_id, grade, subject, title, kind, url, size_kb, created_at) VALUES (1,?,?,?,?,?,?,?)', g, subs[0], `ویدیوی جلسه مرور ${subs[0]}`, 'video', 'https://www.w3schools.com/html/mov_bbb.mp4', 788, atDate(addDays(TODAY, -3), 10));
  }

  // حسابداری: هزینه‌ها و درآمدهای ماه‌های قبل
  for (let m = 6; m >= 0; m--) {
    const base = addDays(TODAY, -m * 30);
    const exps = [['اجاره ساختمان کانون', 'اجاره', 45000000, 1], ['حقوق دبیران', 'حقوق', 96000000, 3], ['قبوض آب، برق و اینترنت', 'قبوض', 6500000 + ri(0, 2000000), 8], ['ملزومات و لوازم‌التحریر', 'ملزومات', 3000000 + ri(0, 4000000), 12]];
    for (const [t, c, a, off] of exps) { const d = addDays(base, -off); if (d <= TODAY) run('INSERT INTO transactions (center_id, type, amount, title, category, date) VALUES (1,?,?,?,?,?)', 'expense', a, t, c, d); }
    if (m >= 2) run('INSERT INTO transactions (center_id, type, amount, title, category, date) VALUES (1,?,?,?,?,?)', 'income', 150000000 + ri(0, 60000000), m >= 4 ? 'شهریه دوره تابستانه' : 'ثبت‌نام اولیه سال تحصیلی', 'شهریه', addDays(base, -5));
  }
  run('INSERT INTO transactions (center_id, type, amount, title, category, date) VALUES (1,?,?,?,?,?)', 'expense', 18500000, 'برگزاری آزمون جامع مهر (چاپ و پذیرایی)', 'آزمون', addDays(TODAY, -15));
  run('INSERT INTO transactions (center_id, type, amount, title, category, date) VALUES (1,?,?,?,?,?)', 'income', 12000000, 'کمک خیرین به صندوق کانون', 'کمک مردمی', addDays(TODAY, -12));
});

// دادهٔ نمونه: آزمون‌های نمونه منتشرشده با کارنامهٔ آزاد هستند (همان وضعیت آزمون‌های قبل از چرخهٔ عمر جدید)
run("UPDATE exams SET status='published', published_at=created_at, results_released_at=created_at WHERE status='draft'");
const counts = get(`SELECT (SELECT COUNT(*) FROM users WHERE role='student') s, (SELECT COUNT(*) FROM users WHERE role='parent') p, (SELECT COUNT(*) FROM exam_results) r, (SELECT COUNT(*) FROM pomodoros) pm, (SELECT COUNT(*) FROM points) pt`);
dbm.db.exec('PRAGMA optimize; VACUUM;');
closeDb();
console.log(`✅ داده نمونه آماده شد: ${counts.s} دانش‌آموز، ${counts.p} والد، ${counts.r} نتیجه آزمون، ${counts.pm} پومودورو، ${counts.pt} ردیف امتیاز`);
console.log(`📅 امروز: ${TODAY} (${g2j(...TODAY.split('-').map(Number)).join('/')})`);
