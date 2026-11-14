// Populates a DEMO server (never production) with sample content for the new features via the real API.
const B = process.env.DEMO_BASE || 'http://127.0.0.1:3001';
async function login(role, identifier) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, identifier, password: '123456' }) });
  if (!r.ok) throw new Error(`login ${role}: ${await r.text()}`);
  return r.headers.get('set-cookie').split(';')[0];
}
const call = async (ck, method, path, body) => {
  const r = await fetch(B + path, { method, headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(d)}`);
  return d;
};
const m = await login('manager', 'manager');
const meta = await call(m, 'GET', '/api/manager/meta');
const c = await call(m, 'POST', '/api/manager/counselors', { username: 'counselor', full_name: 'سمیرا کاظمی', password: '123456' });
const g7 = meta.classes.filter((x) => x.grade === 7).map((x) => x.id);
await call(m, 'PUT', `/api/manager/counselors/${c.id}/classes`, { class_ids: g7 });
for (const [category, title, unit_price] of [['buffet', 'ساندویچ مرغ', 85000], ['buffet', 'آب‌میوه', 25000], ['buffet', 'کیک', 30000], ['service', 'کلاس رفع اشکال ریاضی', 400000], ['service', 'اردوی علمی', 1200000]])
  await call(m, 'POST', '/api/manager/charge-items', { category, title, unit_price });

const t = await login('teacher', 'teacher');
const book = await call(t, 'POST', '/api/bank/books', { grade: 7, subject: 'ریاضی', title: 'ریاضی هفتم' });
const ch = await call(t, 'POST', `/api/bank/books/${book.id}/chapters`, { title: 'فصل ۱: راهبردهای حل مسئله' });
const topics = [];
for (const title of ['الگویابی', 'حذف حالت‌های نامطلوب']) topics.push((await call(t, 'POST', `/api/bank/chapters/${ch.id}/topics`, { title })).id);
const Q = [
  ['در الگوی ۲، ۵، ۸، ۱۱، … جملهٔ دهم کدام است؟', ['۲۹', '۳۰', '۳۱', '۳۲'], 0, 'هر جمله ۳ واحد بیشتر است: ۲ + ۹×۳ = ۲۹', 'easy', 0],
  ['در الگوی ۱، ۴، ۹، ۱۶، … جملهٔ بعدی چیست؟', ['۲۰', '۲۴', '۲۵', '۳۶'], 2, 'جمله‌ها مربع اعداد طبیعی‌اند: ۵² = ۲۵', 'easy', 0],
  ['اگر با چوب‌کبریت مربع‌های پشت‌سرهم بسازیم، برای ۶ مربع چند چوب لازم است؟', ['۱۸', '۱۹', '۲۰', '۲۴'], 1, 'اولی ۴ چوب و هر مربع بعدی ۳ چوب: ۴ + ۵×۳ = ۱۹', 'medium', 0],
  ['جملهٔ عمومی الگوی ۳، ۷، ۱۱، ۱۵ کدام است؟', ['۴n−۱', '۴n+۱', '۳n+۴', 'n+۴'], 0, 'اختلاف ۴ است و جملهٔ اول ۳: ۴n−۱', 'medium', 0],
  ['چند عدد دورقمی وجود دارد که رقم یکان آن از رقم دهگانش بزرگ‌تر باشد؟', ['۳۶', '۴۵', '۴۰', '۲۸'], 0, 'برای دهگان ۱ تا ۸ به ترتیب ۸، ۷، … ۱ حالت: جمع = ۳۶', 'hard', 1],
  ['عددی سه‌رقمی بین ۱۰۰ و ۲۰۰ است، بر ۵ بخش‌پذیر و رقم دهگانش ۰ است. چند حالت دارد؟', ['۱', '۲', '۳', '۴'], 1, '۱۰۰ و ۱۰۵', 'easy', 1],
  ['از بین اعداد ۱ تا ۲۰ چند عدد نه بر ۲ بخش‌پذیرند و نه بر ۳؟', ['۶', '۷', '۸', '۹'], 1, '۱، ۵، ۷، ۱۱، ۱۳، ۱۷، ۱۹', 'medium', 1],
  ['علی سه پیراهن و دو شلوار دارد. با حذف ترکیب پیراهن قرمز و شلوار سبز، چند ترکیب می‌ماند؟', ['۴', '۵', '۶', '۷'], 1, '۳×۲ = ۶ منهای ۱ = ۵', 'easy', 1],
];
for (const [text, options, correct_option, explanation, difficulty, ti] of Q)
  await call(t, 'POST', '/api/bank/questions', { grade: 7, subject: 'ریاضی', topic_id: topics[ti], text, options, correct_option, explanation, difficulty, source_page: 10 + ti * 6, status: 'published' });
await call(t, 'POST', '/api/bank/questions', { grade: 7, subject: 'ریاضی', topic_id: topics[0], text: 'نمونهٔ پیش‌نویس: جملهٔ پنجم الگوی ۱، ۳، ۵ چیست؟', options: ['۷', '۸', '۹', '۱۰'], correct_option: 2, explanation: '۱ + ۴×۲', difficulty: 'easy', status: 'review' });
const ex = await call(t, 'GET', '/api/teacher/exams');
console.log(JSON.stringify({ counselor: c.id, counselor_classes: g7.length, book: book.id, questions: Q.length + 1, teacher_exams: ex.length }));
