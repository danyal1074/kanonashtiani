// سامانه آزمون‌های خودسنجی هوشمند دانش‌آموز (Self-Assessment Exam Engine)
import { all, get } from './db.js';

export const CURATED_QUESTIONS = [
  // هوش و استعداد تحلیلی
  {
    text: 'در دنباله اعداد ۲، ۶، ۱۲، ۲۰، ۳۰، ... عدد بعدی کدام است؟',
    options: ['۴۰', '۴۲', '۴۴', '۴۸'],
    answer: 1,
    subject: 'هوش و استعداد',
    explanation: 'اختلاف اعداد متوالی به ترتیب ۴، ۶، ۸، ۱۰ است؛ بنابراین اختلاف بعدی ۱۲ خواهد بود: ۳۰ + ۱۲ = ۴۲.'
  },
  {
    text: 'اگر ساعت ۳:۳۰ باشد، زاویه بین عقربه ساعت‌شمار و دقیقه‌شمار چند درجه است؟',
    options: ['۷۰ درجه', '۷۵ درجه', '۸۰ درجه', '۸۵ درجه'],
    answer: 1,
    subject: 'هوش و استعداد',
    explanation: 'در ساعت ۳:۳۰ عقربه دقیقه روی ۶ (۱۸۰ درجه) و عقربه ساعت بین ۳ و ۴ یعنی ۱۰۵ درجه است. اختلاف: ۱۸۰ - ۱۰۵ = ۷۵ درجه.'
  },
  {
    text: 'کدام کلمه با سایر گزینه‌ها تناسب معنایی کمتری دارد؟',
    options: ['عالم', 'معلوم', 'تعلیم', 'علامت'],
    answer: 3,
    subject: 'هوش و استعداد',
    explanation: 'واژه‌های عالم، معلوم و تعلیم از ریشه «ع-ل-م» به معنای دانش و آگاهی هستند، ولی علامت به معنی نشانه است.'
  },
  {
    text: 'نسبت مساحت مربعی با ضلع ۴ به مساحت مربعی با ضلع ۸ برابر است با:',
    options: ['۱ به ۲', '۱ به ۴', '۱ به ۸', '۱ به ۱۶'],
    answer: 1,
    subject: 'هوش و استعداد',
    explanation: 'مساحت مربع اول ۴×۴=۱۶ و دومی ۸×۸=۶۴ است. نسبت ۱۶ به ۶۴ برابر با ۱/۴ می‌باشد.'
  },
  {
    text: 'اگر ۳ گربه در ۳ دقیقه ۳ موش بگیرند، ۱۰۰ گربه در ۱۰۰ دقیقه چند موش می‌گیرند؟',
    options: ['۱۰۰', '۳۰۰', '۱۰۰۰', '۳۳۳۳'],
    answer: 3,
    subject: 'هوش و استعداد',
    explanation: 'هر گربه در ۳ دقیقه ۱ موش می‌گیرد. در ۱۰۰ دقیقه هر گربه ۳۳.۳ موش و ۱۰۰ گربه حدود ۳۳۳۳ موش می‌گیرند.'
  },

  // ریاضی
  {
    text: 'اگر مساحت مربعی ۶۴ سانتی‌متر مربع باشد، محیط آن چند سانتی‌متر است؟',
    options: ['۲۴', '۳۲', '۱۶', '۴۸'],
    answer: 1,
    subject: 'ریاضی',
    explanation: 'طول ضلع مربع ۸ است (۸ × ۸ = ۶۴). محیط مربع: ۴ × ۸ = ۳۲ سانتی‌متر.'
  },
  {
    text: 'کوچک‌ترین مضرب مشترک (ک.م.م) دو عدد ۱۲ و ۱۸ کدام است؟',
    options: ['۲۴', '۳۶', '۵۴', '۷۲'],
    answer: 1,
    subject: 'ریاضی',
    explanation: 'مضرب‌های ۱۲: ۱۲، ۲۴، ۳۶، ۴۸ ... و مضرب‌های ۱۸: ۱۸، ۳۶، ۵۴ ... کوچک‌ترین مضرب مشترک ۳۶ است.'
  },
  {
    text: 'حاصل عبارت (۵ - ۸) × (۳ + ۴) کدام است؟',
    options: ['۲۱', '-۲۱', '-۳۵', '۳۵'],
    answer: 1,
    subject: 'ریاضی',
    explanation: '(۵ - ۸) = -۳ و (۳ + ۴) = ۷ ؛ بنابراین (-۳) × ۷ = -۲۱.'
  },
  {
    text: 'مجموع زوایای داخلی یک پنج‌ضلعی محدب چند درجه است؟',
    options: ['۳۶۰', '۴۵۰', '۵۴۰', '۷۲۰'],
    answer: 2,
    subject: 'ریاضی',
    explanation: 'فرمول مجموع زوایا: ۱۸۰ × (n - ۲) که برای پنج‌ضلعی ۱۸۰ × ۳ = ۵۴۰ درجه است.'
  },

  // علوم تجربی
  {
    text: 'کدام گزینه نمونه‌ای از یک تغییر شیمیایی است؟',
    options: ['ذوب یخ', 'تبخیر آب', 'سوختن چوب', 'خرد کردن کاغذ'],
    answer: 2,
    subject: 'علوم تجربی',
    explanation: 'سوختن چوب همراه با تولید مواد جدید (گاز دی‌اکسید کربن، آب و خاکستر) بوده و یک تغییر شیمیایی است.'
  },
  {
    text: 'اندام اصلی تنفس در گیاهان که روزنه‌های هوایی دارد کدام است؟',
    options: ['ریشه', 'ساقه', 'برگ', 'گل'],
    answer: 2,
    subject: 'علوم تجربی',
    explanation: 'بیشترین تبادل گازهای تنفسی و فتوسنتز از طریق روزنه‌های موجود در برگ‌ها انجام می‌شود.'
  },
  {
    text: 'یکای اندازه‌گیری نیرو در سیستم بین‌المللی (SI) چیست؟',
    options: ['ژول', 'پاسکال', 'نیوتون', 'وات'],
    answer: 2,
    subject: 'علوم تجربی',
    explanation: 'یکای استاندارد اندازه‌گیری نیرو نیوتون (N) است.'
  },

  // فارسی و ادبیات
  {
    text: 'در بیت «ابر آمد و باز بر سر سبزه گریست / بی باده گلرنگ نمی‌شاید زیست» چه آرایه‌ای به کار رفته است؟',
    options: ['تشبیه', 'تشخیص (جان‌بخشی)', 'کنایه', 'تضاد'],
    answer: 1,
    subject: 'فارسی',
    explanation: 'نسبت دادن گریستن به ابر آرایه تشخیص (جان‌بخشی به اشیاء) است.'
  },
  {
    text: 'کدام دسته از کلمات همگی جمع مکسر هستند؟',
    options: ['دانش‌آموزان، معلمان', 'کتاب‌ها، دفترها', 'علما، کتب، مدارس', 'دوستان، یاران'],
    answer: 2,
    subject: 'فارسی',
    explanation: 'کلمات علما (جمع عالم)، کتب (جمع کتاب) و مدارس (جمع مدرسه) همگی جمع مکسر عربی هستند.'
  }
];

export function buildSelfExamQuestions({ subject = null, count = 5, grade = null }) {
  const pool = [];

  // امنیت: سؤال‌های آزمون‌های رسمی (جدول exams) هرگز وارد خودسنجی نمی‌شوند؛ در غیر این صورت
  // کلید آزمون‌های آینده و آزمون‌های کانون‌های دیگر به دانش‌آموز نشت می‌کرد.
  // ۲) افزودن سوالات برگزیده
  for (const q of CURATED_QUESTIONS) {
    if (!subject || subject === 'عمومی' || q.subject === subject) {
      pool.push(q);
    }
  }

  // در صورتی که مبحث خاصی سوال نداشت، از کل استخر استفاده شود
  const candidatePool = pool.length >= count ? pool : CURATED_QUESTIONS;

  // شافل و انتخاب تعداد درخواستی
  const shuffled = candidatePool.slice().sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length)).map((q, idx) => ({
    id: idx + 1,
    text: q.text,
    q: q.text,
    options: q.options,
    answer: q.answer,
    correct: q.answer,
    subject: q.subject,
    explanation: q.explanation || 'پاسخ صحیح گزینه شماره ' + (Number(q.answer) + 1) + ' می‌باشد.'
  }));

  return selected;
}

export function sanitizeQuestionsForStudent(questions) {
  return questions.map((q) => ({
    id: q.id,
    text: q.text || q.q,
    q: q.text || q.q,
    options: q.options,
    subject: q.subject
  }));
}

export function evaluateSelfExam(questions, studentAnswers = {}, negativeMarking = false) {
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;

  const analysis = questions.map((q, idx) => {
    // دانش‌آموز ممکن است با کلید عددی یا رشته‌ای فرستاده باشد: answers[q.id] یا answers[idx]
    let chosen = studentAnswers[q.id] !== undefined ? studentAnswers[q.id] : studentAnswers[idx];
    if (chosen !== undefined && chosen !== null && chosen !== '') {
      chosen = Number(chosen);
    } else {
      chosen = null;
    }

    const expected = Number(q.answer ?? q.correct ?? 0);
    const isBlank = chosen === null || isNaN(chosen);
    const isCorrect = !isBlank && chosen === expected;

    if (isBlank) {
      blankCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
    }

    return {
      id: q.id,
      text: q.text || q.q,
      options: q.options,
      chosen,
      correct: expected,
      is_correct: isCorrect,
      is_blank: isBlank,
      explanation: q.explanation
    };
  });

  const total = questions.length || 1;
  const answeredCount = correctCount + wrongCount;
  let score = correctCount;
  if (negativeMarking) {
    score = Math.max(0, correctCount - (wrongCount / 3));
  }
  const percentage = Math.max(0, Math.min(100, Math.round((score / total) * 100)));

  let pointsAwarded = 0;
  // شرط امتیاز فقط در صورتی است که حداقل نصف سؤالات پاسخ داده شده باشند
  if (answeredCount >= Math.ceil(total / 2)) {
    pointsAwarded = 3;
    if (percentage >= 80) pointsAwarded += 2;
  }

  return {
    total,
    correctCount,
    wrongCount,
    blankCount,
    score: Number(score.toFixed(2)),
    percentage,
    pointsAwarded,
    analysis
  };
}
