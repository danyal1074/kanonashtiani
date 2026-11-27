# گزارش بررسی و ممیزی مرکز آزمون رشد نخبه (`docs/exam-center-audit.md`)

این گزارش پیش از یکپارچه‌سازی امکانات آزمون، تست‌زنی، بانک سؤالات، کارنامه و کتب درسی در قالب **«مرکز آزمون رشد»** تهیه شده است.

## ۱. وضعیت فعلی ماژول‌ها و مسیرهای مرتبط با آزمون

| قابلیت فعلی | محل فعلی (فرانت‌اند / بک‌اند) | وضعیت عملکرد | وابستگی‌ها | محل جدید در مرکز آزمون | روش انتقال و ریسک |
|---|---|---|---|---|---|
| آزمون‌های آنلاین و کاغذی معلم | `public/js/teacher.js` (`#/exams`) + `server/routes/teacher.js` | فعال (`exams`, `exam_attempts`, `exam_results`) | `classes`, `students`, `omr.js` | مرکز آزمون معلم ← آزمون‌های من / ساخت آزمون | حفظ مسیر `#/exams` به‌صورت ریدایرکت و نمایش مشترک |
| آزمون خودسنجی دانش‌آموز | `public/js/student.js` (`#/self-exams`) + `server/self_exam.js` | فعال (`self_exams`) | `student.js`, `points` | مرکز آزمون دانش‌آموز ← تمرین سریع / آزمون‌های من | حفظ APIهای `self_exams` و ادغام در تاریخچه |
| آزمون جامع کانون | `public/js/manager.js` (`#/comprehensive`) + `server/routes/manager.js` | فعال (`kind='comprehensive'`) | `exams`, `omr.js` | مرکز آزمون مدیر / آزمون‌های من دانش‌آموز | یکپارچه‌سازی بدون حذف داده‌های قبلی |
| کارنامه‌های برپا و استودیوی هوش | `public/js/legacy.js` (`#/barpa`, `#/hoosh-studio`) | فعال | `comprehensive_exam_reports`, `exam_books` | مرکز آزمون (تب ابزارهای تکمیلی) | ریدایرکت و حفظ کامل جداول و داده‌ها |
| بانک سؤالات و موتور آزمون | `public/js/qb-teacher.js`, `public/js/qb-student.js`, `server/routes/question-bank.js` | فعال (`questions`, `qb_exams`, `qb_exam_attempts`) | `textbooks`, `qb-zip.js`, `qb-xlsx.js`, `qb-validator.js`, `qb-engine.js` | هسته مرکزی «مرکز آزمون رشد» | تبدیل به موتور واحد و حذف منوهای پراکنده |
| کتب درسی و تمرین صفحه | `public/js/textbooks.js`, `server/routes/textbooks.js`, `server/routes/textbook-exercises.js` | فعال (محدود به ۲ کتاب دمو) | `textbooks.json`, `DATA_DIR/textbooks` | کتاب‌های درسی یکپارچه (همه ۱۲ کتاب + ورق‌زن + یادداشت) | ارتقا به ۱۲ کتاب واقعی پایه ۴ تا ۹ و اتصال مستقیم به آزمونساز فصلی |
| عملکرد مشاور | `public/js/counselor.js`, `server/routes/counselor.js` | فعال | `counselor_sessions`, `counselor_plans` | حفظ پنل مشاور + افزودن محدوده پایه‌های مجاز و نقش معلم-مشاور | افزودن `counselor_grades_json` و `is_counselor` بدون شکستن دسترسی‌ها |

## ۲. نتیجه‌گیری معماری
- **یکپارچه‌سازی منوها:** در پنل دانش‌آموز، معلم و مدیر یک ورودی واحد با عنوان **«مرکز آزمون»** قرار می‌گیرد و مسیرهای قدیمی (`#/exams`, `#/self-exams`, `#/question-bank`, `#/qb-builder`, `#/comprehensive`, `#/barpa`) بدون خطا به بخش‌های متناظر هدایت یا درون مرکز آزمون نمایش داده می‌شوند.
- **حفظ کامل داده‌ها:** هیچ جدول قدیمی حذف نمی‌شود و داده‌های قبلی `exams`، `self_exams`، `comprehensive_exam_reports` و `qb_exams` همگی در فهرست آزمون‌ها و کارنامه‌ها قابل مشاهده می‌مانند.
