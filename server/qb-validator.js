// اعتبارسنجی ساختاری و تشخیص تکرار بدون هوش مصنوعی برای ۱۱ نوع سؤال
import crypto from 'node:crypto';
import { isAllowedAsset } from './qb-zip.js';

export const QUESTION_TYPES = [
  'single_choice', 'multiple_choice', 'true_false', 'fill_blank',
  'short_answer', 'descriptive', 'numeric', 'matching',
  'ordering', 'multipart', 'hotspot',
];

export const QUESTION_STATUSES = [
  'draft', 'pending_review', 'approved', 'published', 'rejected', 'archived',
];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeText(str) {
  let s = String(str ?? '');
  for (let i = 0; i < 10; i++) {
    s = s.replaceAll(FA_DIGITS[i], String(i)).replaceAll(AR_DIGITS[i], String(i));
  }
  return s
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/ۀ/g, 'ه')
    .replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function sanitizeHtmlText(str) {
  return String(str ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on[a-z]+\s*=/gi, '')
    .replace(/javascript:/gi, '');
}

export function contentHash(q) {
  const norm = {
    type: q.type,
    stem: normalizeText(q.stem),
    options: Array.isArray(q.options) ? q.options.map((o) => normalizeText(typeof o === 'string' ? o : o?.text)) : [],
    answer: q.answer || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

function trigrams(s) {
  const t = normalizeText(s);
  if (t.length < 3) return new Set(t ? [t] : []);
  const set = new Set();
  for (let i = 0; i <= t.length - 3; i++) set.add(t.slice(i, i + 3));
  return set;
}

export function textSimilarity(a, b) {
  const sa = trigrams(a), sb = trigrams(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function validateQuestion(raw, ctx = {}) {
  const errors = [];
  const q = raw && typeof raw === 'object' ? { ...raw } : {};
  const maxPages = Number(ctx.printedPages || 9999);
  const availableAssets = ctx.availableAssets instanceof Set ? ctx.availableAssets : null;

  if (q.external_id != null && !/^[a-zA-Z0-9_.-]{1,80}$/.test(String(q.external_id))) {
    errors.push({ field: 'external_id', message: 'شناسه خارجی نامعتبر است (فقط حروف، اعداد، خط تیره و نقطه مجاز است)' });
  }
  if (!QUESTION_TYPES.includes(q.type)) {
    errors.push({ field: 'type', message: `نوع سؤال پشتیبانی نمی‌شود: ${q.type || 'خالی'}` });
  }
  q.stem = sanitizeHtmlText(q.stem || '').trim();
  if (!q.stem) {
    errors.push({ field: 'stem', message: 'متن سؤال نمی‌تواند خالی باشد' });
  }

  const diff = Number(q.difficulty ?? 2);
  if (!Number.isInteger(diff) || diff < 1 || diff > 5) {
    errors.push({ field: 'difficulty', message: 'سطح دشواری باید عددی صحیح بین ۱ تا ۵ باشد' });
  }
  q.difficulty = diff;

  const score = Number(q.score ?? 1);
  if (!Number.isFinite(score) || score <= 0 || score > 100) {
    errors.push({ field: 'score', message: 'بارم سؤال باید عددی مثبت باشد' });
  }
  q.score = score;

  const primaryPage = Number(q.source?.primary_page ?? q.primary_page);
  if (!Number.isInteger(primaryPage) || primaryPage < 1 || primaryPage > maxPages) {
    errors.push({ field: 'primary_page', message: `شماره صفحه اصلی (${primaryPage || '—'}) خارج از محدوده کتاب (۱ تا ${maxPages}) است` });
  }
  const pages = Array.isArray(q.source?.pages) ? q.source.pages.map(Number) : (Number.isInteger(primaryPage) ? [primaryPage] : []);
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 1 || p > maxPages) {
      errors.push({ field: 'pages', message: `شماره صفحه مرجع (${p}) خارج از محدوده کتاب است` });
    }
  }

  // بررسی فایل‌های تصویری
  const assets = Array.isArray(q.assets) ? q.assets : [];
  for (const a of assets) {
    const p = String(a?.path || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (!p) { errors.push({ field: 'assets', message: 'مسیر تصویر خالی است' }); continue; }
    if (!isAllowedAsset(p) && !p.startsWith('/api/')) {
      errors.push({ field: 'assets', message: `پسوند تصویر مجاز نیست: ${p}` });
    }
    if (availableAssets && !availableAssets.has(p)) {
      errors.push({ field: 'assets', message: `تصویر ارجاع‌داده‌شده در بسته یافت نشد: ${p}` });
    }
  }

  // بررسی گزینه‌ها و ساختار پاسخ متناسب با نوع سؤال
  const opts = Array.isArray(q.options) ? q.options : [];
  const ans = q.answer && typeof q.answer === 'object' ? q.answer : {};

  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    if (opts.length < 2) errors.push({ field: 'options', message: 'حداقل ۲ گزینه لازم است' });
    const ids = new Set();
    const seenTexts = new Set();
    for (const o of opts) {
      const oid = String(o?.id ?? '');
      const otxt = normalizeText(o?.text ?? '');
      if (!oid) errors.push({ field: 'options', message: 'شناسه گزینه خالی است' });
      if (!otxt && !o?.asset_path) errors.push({ field: 'options', message: `متن گزینه ${oid} خالی است` });
      if (ids.has(oid)) errors.push({ field: 'options', message: `شناسه گزینه تکراری است: ${oid}` });
      if (otxt && seenTexts.has(otxt)) errors.push({ field: 'options', message: `متن گزینه‌ها تکراری است: ${o.text}` });
      ids.add(oid);
      if (otxt) seenTexts.add(otxt);
      if (o?.asset_path && availableAssets && !availableAssets.has(String(o.asset_path).replace(/\\/g, '/'))) {
        errors.push({ field: 'assets', message: `تصویر گزینه ${oid} در بسته یافت نشد: ${o.asset_path}` });
      }
    }
    const corr = Array.isArray(ans.correct_option_ids) ? ans.correct_option_ids.map(String) : [];
    if (q.type === 'single_choice' && corr.length !== 1) {
      errors.push({ field: 'answer', message: 'در سؤال چهارگزینه‌ای تک‌پاسخی دقیقاً یک گزینه صحیح باید مشخص شود' });
    }
    if (q.type === 'multiple_choice' && corr.length < 1) {
      errors.push({ field: 'answer', message: 'حداقل یک گزینه صحیح لازم است' });
    }
    for (const cid of corr) {
      if (!ids.has(cid)) errors.push({ field: 'answer', message: `شناسه پاسخ صحیح (${cid}) در گزینه‌ها وجود ندارد` });
    }
  } else if (q.type === 'true_false') {
    if (typeof ans.value !== 'boolean') errors.push({ field: 'answer', message: 'پاسخ صحیح/غلط باید true یا false باشد' });
  } else if (q.type === 'numeric') {
    if (typeof ans.value !== 'number' || !Number.isFinite(ans.value)) {
      errors.push({ field: 'answer', message: 'پاسخ عددی باید یک عدد معتبر باشد' });
    }
  } else if (q.type === 'fill_blank' || q.type === 'short_answer') {
    const acc = Array.isArray(ans.accepted) ? ans.accepted.filter((x) => String(x || '').trim()) : [];
    if (!acc.length) errors.push({ field: 'answer', message: 'حداقل یک پاسخ قابل قبول وارد کنید' });
  } else if (q.type === 'descriptive') {
    if (!String(ans.model_answer || '').trim()) errors.push({ field: 'answer', message: 'پاسخ نمونه تشریحی خالی است' });
    if (Array.isArray(ans.rubric) && ans.rubric.length) {
      const sum = ans.rubric.reduce((s, r) => s + Number(r?.points || 0), 0);
      if (Math.abs(sum - score) > 0.01) {
        errors.push({ field: 'answer', message: `مجموع بارم‌بندی (${sum}) با نمره سؤال (${score}) برابر نیست` });
      }
    }
  } else if (q.type === 'matching') {
    if (!Array.isArray(ans.pairs) || ans.pairs.length < 2) errors.push({ field: 'answer', message: 'حداقل ۲ جفت وصل‌کردنی لازم است' });
  } else if (q.type === 'ordering') {
    if (!Array.isArray(ans.correct_order) || ans.correct_order.length < 2) errors.push({ field: 'answer', message: 'حداقل ۲ مورد برای مرتب‌سازی لازم است' });
  } else if (q.type === 'multipart') {
    if (!Array.isArray(ans.parts) || ans.parts.length < 2) errors.push({ field: 'answer', message: 'سؤال چندبخشی باید حداقل ۲ بخش داشته باشد' });
  } else if (q.type === 'hotspot') {
    if (!Array.isArray(ans.regions) || !ans.regions.length) errors.push({ field: 'answer', message: 'حداقل یک ناحیه صحیح روی تصویر مشخص کنید' });
  }

  return { valid: errors.length === 0, errors, normalized: q, hash: contentHash(q) };
}

export function mapXlsxRowsToQuestions(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    if (!String(obj.question || '').trim() && !String(obj.external_id || '').trim()) continue;
    const type = String(obj.type || 'single_choice').trim();
    const options = [];
    ['a', 'b', 'c', 'd'].forEach((id, k) => {
      const t = String(obj[`option_${k + 1}`] ?? '').trim();
      if (t) options.push({ id, text: t });
    });

    const rawAns = String(obj.correct_answer ?? '').trim();
    let answer = {};
    if (type === 'single_choice') {
      const idxMap = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', a: 'a', b: 'b', c: 'c', d: 'd' };
      const cid = idxMap[rawAns.toLowerCase()] || rawAns;
      answer = { correct_option_ids: cid ? [cid] : [] };
    } else if (type === 'true_false') {
      answer = { value: ['true', '1', 'صحیح', 'درست'].includes(rawAns.toLowerCase()) };
    } else if (type === 'numeric') {
      const n = Number(normalizeText(rawAns));
      answer = { value: Number.isFinite(n) ? n : NaN, tolerance: 0 };
    } else if (type === 'short_answer' || type === 'fill_blank') {
      answer = { accepted: rawAns.split(/[|،,]/).map((x) => x.trim()).filter(Boolean) };
    } else if (type === 'descriptive') {
      answer = { model_answer: rawAns, rubric: [{ criterion: 'پاسخ کامل', points: Number(obj.score || 1) }] };
    }

    const pages = String(obj.source_pages || obj.primary_page || '')
      .split(/[|،,\s]+/).map((x) => Number(normalizeText(x))).filter((n) => Number.isInteger(n) && n > 0);
    const primaryPage = Number(normalizeText(obj.primary_page)) || pages[0] || 0;

    out.push({
      row_index: i + 1,
      external_id: String(obj.external_id || '').trim() || undefined,
      grade: Number(normalizeText(obj.grade)) || undefined,
      book_code: String(obj.book_code || '').trim() || undefined,
      edition: String(obj.edition || '').trim() || undefined,
      chapter: Number(normalizeText(obj.chapter)) || undefined,
      lesson: String(obj.lesson || '').trim() || undefined,
      source: { primary_page: primaryPage, pages: pages.length ? pages : (primaryPage ? [primaryPage] : []) },
      topic: String(obj.topic || '').trim(),
      type,
      difficulty: Number(normalizeText(obj.difficulty)) || 2,
      stem: String(obj.question || '').trim(),
      options,
      answer,
      explanation: String(obj.explanation || '').trim(),
      score: Number(normalizeText(obj.score)) || 1,
      estimated_time_seconds: Number(normalizeText(obj.estimated_time_seconds)) || 60,
      tags: String(obj.tags || '').split(/[|،,]/).map((x) => x.trim()).filter(Boolean),
    });
  }
  return out;
}
