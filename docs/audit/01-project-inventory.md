# ۰۱ — فهرست کامل پروژه (Project Inventory)

تاریخ ممیزی: ۱۴۰۵/۰۹/۰۶ (۲۰۲۶-۱۱-۲۷)  
شاخه کاری: `full-system-audit-repair` (منشعب از `ag/legacy-features` شامل تغییرات ثبت‌نشدهٔ جاری)

## ۱. فناوری‌ها و ساختار کلی
- **زمان اجرا:** Node.js (ES Modules, `>=22.13`)، بدون وابستگی خارجی npm در زمان اجرا (`node:sqlite`, `node:http`, `node:crypto`, `node:zlib`).
- **پایگاه داده:** SQLite داخلی Node (`server/db.js`) با حالت WAL، مهاجرت‌های نسخه‌دار (`PRAGMA user_version = 23`).
- **فرانت‌اند:** SPA بدون بیلد (Vanilla JS ES Modules در `public/js/`، CSS ماژولار در `public/css/`، PWA با `sw.js` و `manifest.webmanifest`).
- **پشتیبانی رسانه‌ای/اسکریپت:** اسکریپت‌های Python برای آماده‌سازی کتب درسی و استقرار VPS (`scripts/`).

## ۲. ماژول‌های بک‌اند (`server/`)
| فایل | نقش |
|---|---|
| `server/index.js` | سرور HTTP، مسیریاب، احراز هویت با کوکی HMAC، CSRF/Origin، CSP، Rate Limit، کارهای زمان‌بندی‌شده |
| `server/db.js` | طرح پایگاه داده و ۲۳ نسخه مهاجرت |
| `server/logic.js` | امتیاز، سطح، رتبه، حق عضویت و قفل پنل، اطلاعیه‌ها، مسیر یادگیری، جریمه خودکار |
| `server/util.js` | هش رمز (`scrypt`)، توکن، تاریخ شمسی/تهران، بارگذاری فایل، نرمال‌سازی کد ملی و موبایل |
| `server/http.js` | کلاس `Router`، پارس بدنه JSON، سرو فایل، کوکی و IP |
| `server/importer.js` | ثبت‌نام گروهی دانش‌آموزان از CSV |
| `server/sms.js` | ارسال پیامک (شبیه‌ساز، کاوه‌نگار، sms.ir، وب‌هوک) با صندوق خروجی `sms_outbox` |
| `server/classroom.js` | همگام‌سازی اختیاری با سیستم کلاس آنلاین بیرونی |
| `server/self_exam.js` | آزمون خودسنجی سریع |
| `server/qb-engine.js`, `qb-validator.js`, `qb-xlsx.js`, `qb-zip.js`, `qb-builtin-seed.js` | موتور بانک سؤالات، اعتبارسنجی، پکیج ZIP/XLSX، تولید آزمون و تصحیح |
| `server/book-pages.js`, `textbook-store.js`, `textbook-ai.js` | مدیریت صفحات کتب درسی و تمرین صفحه با هوش مصنوعی/موک |
| `server/backup.js`, `metrics.js`, `ratelimit.js`, `env.js`, `schedule-ocr.js`, `exam-ai.js`, `seed.js` | پشتیبان‌گیری، پایش، محدودیت نرخ، OCR برنامه هفتگی، بذر داده نمونه |

### مسیرهای API (`server/routes/`)
- `common.js`: ورود/خروج، `/api/me`، تغییر رمز، تغییر ظاهر، پروفایل، اطلاعیه‌ها، پیام‌رسان، فروشگاه، کتب هوش و کارنامه برپا
- `admin.js`: مدیریت کانون‌ها، کاربران، بازنشانی رمز، مشاهده‌به‌جای کاربر، پشتیبان‌گیری/بازیابی
- `manager.js`: داشبورد مدیر، کلاس‌ها، دانش‌آموزان (تکی، گروهی CSV، خروجی Excel، کارت ورود)، معلمان، برنامه هفتگی، حق عضویت و فاکتور، حسابداری، آزمون جامع، مصوبات جلسات، پیامک
- `teacher.js`: داشبورد معلم، حضور و غیاب، تکالیف، آزمون‌های کلاسی و OMR، نمرات مستمر، مسیر یادگیری، یادداشت مشاوره‌ای، برنامه مطالعه، محتوا
- `student.js`: داشبورد دانش‌آموز، تکالیف، آزمون آنلاین، نتایج، پومودورو، مسیر یادگیری، بازی، پرداخت، خودسنجی، فاکتورها
- `counselor.js`: پنل مشاور مستقل و معلم-مشاور (دانش‌آموزان، مطالعه، گزارش‌ها، برنامه‌های هفتگی، جلسات، یادداشت‌های خصوصی) + مدیریت مشاوران توسط مدیر/ادمین
- `textbooks.js`: فهرست کتب درسی، صفحات، فایل PDF، یادداشت‌های دانش‌آموز/معلم روی صفحات
- `textbook-exercises.js`: تمرین‌های مبتنی بر صفحه کتاب درسی
- `question-bank.js`: بانک سؤالات، ایمپورت گروهی ZIP/XLSX، بازبینی/تأیید سؤال، ساخت آزمون از بانک سؤال و آزمون‌دهی دانش‌آموز

## ۳. ماژول‌های فرانت‌اند (`public/js/`)
- هسته و ورود: `app.js`, `core.js`, `login.js`, `common.js`, `icons.js`, `pwa.js`
- پنل‌ها: `student.js` (+ `elementary.js`, `student-variant.js`, `student-design.js`, `reference-ui.js`), `teacher.js` (+ `teacher-ui.js`, `teacher-minimal.js`), `manager.js` (+ `manager-ui.js`, `manager-ui-classic.js`), `counselor.js`, `admin.js` (+ `admin-dashboard.js`, `admin-charts.js`)
- ماژول‌های مشترک و تخصصی: `qb-teacher.js`, `qb-student.js`, `qb-math.js`, `textbooks.js`, `textbook-exercises.js`, `messenger.js`, `timetable.js`, `omr.js`, `shop.js`, `games.js`, `online-classes.js`, `profile-photo.js`, `legacy.js`

## ۴. مجموعه آزمون‌های موجود (`scripts/`)
- `smoke.mjs` (۲۰۰ بررسی پایه و یکپارچگی)
- `test-counselor.mjs`, `test-classroom.mjs`, `test-messenger.mjs`, `test-migrations.mjs`
- `test-textbooks.mjs`, `test-textbook-exercises.mjs`, `test-question-bank.mjs`
- `test-teacher-look.mjs`, `test-profile-photo.mjs`, `loadtest.mjs`
