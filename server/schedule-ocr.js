import { clampStr, toEnDigits } from './util.js';

const WEEKDAY_MAP = [
  [0, ['شنبه']],
  [1, ['یکشنبه', 'یک شنبه', '۱شنبه']],
  [2, ['دوشنبه', '۲شنبه']],
  [3, ['سه‌شنبه', 'سه شنبه', '۳شنبه']],
  [4, ['چهارشنبه', '۴شنبه']],
  [5, ['پنج‌شنبه', 'پنجشنبه', 'پنج شنبه', '۵شنبه']],
  [6, ['جمعه']],
];

function normFa(s) {
  return toEnDigits(String(s || ''))
    .replace(/[‌‏‎]/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTime(t, fallback = '16:00') {
  const m = normFa(t).match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (!m) return fallback;
  const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function matchTeacher(name, teachers = []) {
  const n = normFa(name);
  if (!n) return null;
  const exact = teachers.find((t) => normFa(t.full_name) === n);
  if (exact) return exact.id;
  const partial = teachers.find((t) => normFa(t.full_name).includes(n) || n.includes(normFa(t.full_name)));
  return partial ? partial.id : null;
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) throw new Error('فرمت فایل نامعتبر است (تصویر یا PDF انتخاب کنید)');
  let mime = m[1].toLowerCase().trim();
  if (mime === 'image/jpg' || mime === 'image/pjpeg') mime = 'image/jpeg';
  if (!mime.startsWith('image/') && mime !== 'application/pdf') {
    throw new Error('فقط فایل تصویری (PNG، JPG، WEBP) یا PDF مجاز است');
  }
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (buf.length > 10 * 1024 * 1024) throw new Error('حجم فایل نباید بیشتر از ۱۰ مگابایت باشد');
  return { mime, base64: buf.toString('base64') };
}

async function parseWithGemini({ mime, base64 }, teachers, subjects) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  const prompt = [
    'این تصویر یک برنامه هفتگی کلاسی مدرسه/کانون به زبان فارسی است.',
    'لطفاً تمام جلسات/زنگ‌های موجود در جدول را استخراج کن و فقط یک آرایه JSON معتبر برگردان.',
    'هر عنصر آرایه باید دقیقاً این فیلدها را داشته باشد:',
    '- weekday: عدد ۰ تا ۶ (۰=شنبه، ۱=یکشنبه، ۲=دوشنبه، ۳=سه‌شنبه، ۴=چهارشنبه، ۵=پنج‌شنبه، ۶=جمعه)',
    '- start: ساعت شروع با فرمت HH:MM (اعداد انگلیسی ۲۴ ساعته، مثلاً 16:00 یا 08:30)',
    '- end: ساعت پایان با فرمت HH:MM (اگر مشخص نیست ۹۰ دقیقه بعد از شروع)',
    '- subject: نام درس به فارسی',
    '- teacher_name: نام دبیر اگر در تصویر هست، وگرنه رشته خالی',
    '- room: شماره یا نام کلاس/اتاق اگر هست، وگرنه رشته خالی',
    teachers.length ? `فهرست دبیران کانون: ${teachers.map((t) => t.full_name).join('، ')}` : '',
    subjects.length ? `فهرست دروس رایج: ${subjects.join('، ')}` : '',
    'فقط JSON خالص برگردان بدون هیچ توضیح اضافه‌ای.',
  ].filter(Boolean).join('\n');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`خطای سرویس هوش مصنوعی (${res.status})`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : [];
}

function parsePlainTextSchedule(text, subjects = [], teachers = []) {
  const lines = String(text || '').split(/\r?\n/).map((l) => normFa(l)).filter(Boolean);
  const slots = [];
  let currentWeekday = 0;

  for (const line of lines) {
    for (const [wd, words] of WEEKDAY_MAP) {
      if (words.some((w) => line.includes(w))) {
        currentWeekday = wd;
        break;
      }
    }
    const times = [...line.matchAll(/(\d{1,2}\s*[:.]\s*\d{2})/g)].map((m) => normalizeTime(m[1]));
    const matchedSubj = subjects.find((s) => line.includes(normFa(s)));
    const matchedTeacher = teachers.find((t) => line.includes(normFa(t.full_name)));
    if (!times.length && !matchedSubj) continue;

    const start = times[0] || '16:00';
    let end = times[1];
    if (!end || end <= start) {
      const [h, m] = start.split(':').map(Number);
      const tot = Math.min(23 * 60 + 59, h * 60 + m + 90);
      end = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
    }
    let rest = line
      .replace(/(\d{1,2}\s*[:.]\s*\d{2})/g, ' ')
      .replace(/تا|-|–|ساعت|زنگ/g, ' ');
    for (const [, words] of WEEKDAY_MAP) for (const w of words) rest = rest.replaceAll(w, ' ');
    rest = rest.replace(/\s+/g, ' ').trim();
    const subject = clampStr(matchedSubj || rest, 40);
    if (!subject) continue;
    slots.push({
      weekday: currentWeekday,
      start,
      end,
      subject,
      teacher_name: matchedTeacher ? matchedTeacher.full_name : '',
      room: '',
      kind: 'academic',
    });
  }
  return slots;
}

async function parseWithLocalOcr({ mime, base64 }, teachers, subjects) {
  const url = process.env.ROSHD_OCR_URL || 'http://127.0.0.1:3099/ocr';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mime, base64 }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = String(data?.text || '');
    if (!text.trim()) return { slots: [], rawText: '' };
    return { slots: parsePlainTextSchedule(text, subjects, teachers), rawText: text };
  } catch {
    return null;
  }
}

export async function extractScheduleFromImage(dataUrl, { teachers = [], subjects = [] } = {}) {
  const file = parseDataUrl(dataUrl);
  let rawSlots = null;
  let engine = 'none';
  let note = '';

  try {
    const geminiSlots = await parseWithGemini(file, teachers, subjects);
    if (geminiSlots) {
      rawSlots = geminiSlots;
      engine = 'gemini';
    }
  } catch (e) {
    note = e.message;
  }

  if (!rawSlots) {
    const local = await parseWithLocalOcr(file, teachers, subjects);
    if (local) {
      rawSlots = local.slots;
      engine = 'tesseract';
      if (!rawSlots.length && !note) {
        note = 'تصویر خوانده شد اما ساختار جدول کاملاً مشخص نبود؛ می‌توانید ردیف‌ها را در جدول زیر تکمیل یا اصلاح و یکجا ثبت کنید.';
      }
    } else {
      rawSlots = [];
      if (!note) {
        note = 'سرویس تشخیص تصویر در دسترس نیست؛ می‌توانید ردیف‌های برنامه را در جدول زیر به صورت یکجا وارد و تایید کنید.';
      }
    }
  } else if (!rawSlots.length && !note) {
    note = 'جلسه‌ای از تصویر تشخیص داده نشد؛ لطفاً تصویر واضح‌تری انتخاب کنید یا ردیف‌ها را دستی اضافه کنید.';
  }

  const slots = rawSlots.map((s) => {
    const wd = Number(s.weekday);
    const weekday = wd >= 0 && wd <= 6 ? wd : 0;
    const start = normalizeTime(s.start, '16:00');
    let end = normalizeTime(s.end, '');
    if (!end || end <= start) {
      const [h, m] = start.split(':').map(Number);
      const tot = Math.min(23 * 60 + 59, h * 60 + m + 90);
      end = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
    }
    return {
      weekday,
      start,
      end,
      subject: clampStr(s.subject || '', 40),
      teacher_id: matchTeacher(s.teacher_name, teachers),
      teacher_name: clampStr(s.teacher_name || '', 50),
      room: clampStr(s.room || '', 30),
      kind: 'academic',
    };
  }).filter((s) => s.subject);

  return { engine, slots, note };
}
