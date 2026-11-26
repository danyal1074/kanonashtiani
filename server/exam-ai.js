// سرویس هوش مصنوعی برای طرح سؤال و استخراج آزمون متنی از صفحات کتاب
import fs from 'node:fs';
import { resolveBookPage } from './book-pages.js';

const GRADE_NAMES = { 4: 'چهارم', 5: 'پنجم', 6: 'ششم', 7: 'هفتم', 8: 'هشتم', 9: 'نهم' };
const DIFF_NAMES = { easy: 'آسان', medium: 'متوسط', hard: 'چالشی و تیزهوشان' };

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function normalizeQuestions(arr, defaultSubject) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const q of arr) {
    const text = String(q?.text || '').trim();
    const rawOpts = Array.isArray(q?.options) ? q.options.map((o) => String(o || '').trim()) : [];
    const ans = Number(q?.answer);
    if (!text || rawOpts.length < 4 || rawOpts.slice(0, 4).some((o) => !o)) continue;
    out.push({
      text: text.slice(0, 1000),
      options: rawOpts.slice(0, 4).map((o) => o.slice(0, 300)),
      answer: Number.isInteger(ans) && ans >= 0 && ans <= 3 ? ans : 0,
      subject: String(q?.subject || defaultSubject || 'هوش و استعداد').trim().slice(0, 40),
      ...(q?.sourcePage ? { sourcePage: Number(q.sourcePage) } : {}),
    });
  }
  return out;
}

async function callGeminiJson(parts, timeoutMs = 45_000) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('کلید سرویس هوش مصنوعی (GEMINI_API_KEY) در سرور تنظیم نشده است.');
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.25 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`خطای ارتباط با سرویس هوش مصنوعی (کد ${res.status})`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

export async function generateExamQuestions({ subject = 'ریاضی', grade = 6, topic = '', count = 5, difficulty = 'medium' }) {
  const n = Math.max(1, Math.min(20, Number(count) || 5));
  const gradeLabel = GRADE_NAMES[Number(grade)] || String(grade);
  const diffLabel = DIFF_NAMES[difficulty] || 'متوسط';
  const topicText = String(topic || '').trim();

  const prompt = [
    `تو یک طراح سؤال حرفه‌ای مدارس تیزهوشان و کانون آموزشی در ایران هستی.`,
    `لطفاً دقیقاً ${n} سؤال چهارگزینه‌ای استاندارد به زبان فارسی برای درس «${subject}» پایهٔ «${gradeLabel}» طراحی کن.`,
    topicText ? `مبحث و موضوع مورد نظر معلم: «${topicText}»` : `موضوعات کلیدی و مهم کتاب درسی «${subject}» پایهٔ «${gradeLabel}»`,
    `سطح دشواری: ${diffLabel}.`,
    `سؤال‌ها باید کاملاً بدون نیاز به شکل یا تصویر باشند (فقط متنی و قابل حل در آزمون آنلاین).`,
    `خروجی باید فقط یک آرایه JSON معتبر باشد با ساختار زیر برای هر سؤال:`,
    `[{"text": "متن کامل سؤال به فارسی", "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"], "answer": 0}]`,
    `فیلد answer باید اندیس گزینهٔ صحیح (عدد ۰، ۱، ۲ یا ۳) باشد. هیچ توضیح اضافه یا مارک‌داون ننویس.`,
  ].join('\n');

  const parsed = await callGeminiJson([{ text: prompt }]);
  const questions = normalizeQuestions(parsed, subject);
  if (!questions.length) throw new Error('هوش مصنوعی نتوانست سؤالی تولید کند؛ لطفاً دوباره تلاش کنید.');
  return questions;
}

export async function extractTextExamFromBookPages({ bookId, pages, subject = 'هوش و استعداد', maxQuestions = 15 }) {
  const cleanPages = [...new Set((pages || []).map(Number).filter((p) => Number.isInteger(p) && p > 0))].slice(0, 6);
  if (!cleanPages.length) throw new Error('هیچ صفحه‌ای برای استخراج انتخاب نشده است.');

  const parts = [];
  const loadedPages = [];
  for (const p of cleanPages) {
    const file = resolveBookPage(bookId, p);
    if (!file) continue;
    const b64 = fs.readFileSync(file).toString('base64');
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
    loadedPages.push(p);
  }
  if (!loadedPages.length) {
    throw new Error('تصویر صفحات انتخاب‌شده روی سرور یافت نشد.');
  }

  const prompt = [
    `تصاویر پیوست مربوط به صفحات ${loadedPages.join('، ')} از کتاب هوش کمپلکس / استعداد تحلیلی است.`,
    `مأموریت مهم: فقط سؤال‌های **کاملاً متنی** (سؤال‌هایی که هیچ شکل، تصویر، جدول تصویری، نمودار یا طرح هندسی برای فهم سؤال یا گزینه‌ها ندارند) را استخراج کن.`,
    `هر سؤالی که برای پاسخ‌دادن به آن دانش‌آموز نیاز به دیدن شکل، تصویر یا الگوی گرافیکی دارد را **کاملاً نادیده بگیر و استخراج نکن**.`,
    `برای هر سؤال متنی استخراج‌شده:`,
    `- متن دقیق سؤال را به فارسی بنویس.`,
    `- هر ۴ گزینه را به ترتیب بنویس (اگر در صفحه گزینه‌ها با ۱/۲/۳/۴ یا الف/ب/ج/د مشخص شده‌اند، فقط متن گزینه‌ها را بگذار).`,
    `- گزینهٔ صحیح را با حل دقیق خودت به صورت عدد ۰ تا ۳ در فیلد answer مشخص کن (۰=گزینه اول، ۱=دوم، ۲=سوم، ۳=چهارم).`,
    `- شماره صفحه را در sourcePage بگذار.`,
    `حداکثر ${Math.max(1, Math.min(25, Number(maxQuestions) || 15))} سؤال استخراج کن.`,
    `خروجی فقط JSON خالص به شکل زیر باشد:`,
    `[{"text": "...", "options": ["...", "...", "...", "..."], "answer": 0, "sourcePage": ${loadedPages[0]}}]`,
    `اگر هیچ سؤال کاملاً متنی (بدون شکل) در این صفحات نبود، آرایه خالی [] برگردان.`,
  ].join('\n');

  const parsed = await callGeminiJson([{ text: prompt }, ...parts], 60_000);
  const questions = normalizeQuestions(parsed, subject);
  return { questions, pagesScanned: loadedPages };
}
