# ۰۹ — گزارش اصلاحات انجام‌شده (Repair Log)

| فایل تغییریافته | شناسه باگ/قابلیت | شرح دقیق تغییر | نتیجه تست |
|---|---|---|---|
| `server/db.js` | MF-02, MF-04 | افزودن مهاجرت نسخه ۲۳ برای ستون‌های `is_counselor`, `counselor_grades_json` و جدول `meeting_resolutions` | پاس (`test-migrations`, `test-counselor`) |
| `server/index.js` | MF-02 | خواندن `is_counselor` و `counselor_grades_json` در `loadUser` | پاس |
| `server/routes/common.js` | MF-02 | افزودن `is_counselor` و `counselor_grades` به پاسخ `/api/me` | پاس (`test-audit-repairs`) |
| `server/routes/counselor.js` | BUG-03, MF-01, MF-02 | افزودن `ensureCounselor(ctx)` و فیلتر `counselorGrades` به همه مسیرهای مشاور؛ پشتیبانی از `grades` در ساخت/ویرایش مشاور | پاس (`test-counselor`, `test-audit-repairs`) |
| `server/routes/student.js` | BUG-06 | شمول معلم-مشاور (`role='teacher' AND is_counselor=1`) در جلسات و برنامه‌های مشاوره دانش‌آموز | پاس (`test-audit-repairs`) |
| `server/routes/manager.js` | BUG-07, MF-02, MF-04 | افزودن `is_counselor`/`counselor_grades` به معلمان و `/api/manager/meta`، پیاده‌سازی `/api/manager/students/export.xlsx` با `.status`/`.locked` صحیح، افزودن CRUD `/api/manager/meetings` | پاس (`smoke`, `test-audit-repairs`) |
| `server/routes/question-bank.js` | BUG-01, BUG-02, BUG-04, BUG-05 | رفع IDOR در `bulk`, `exams/:id`, `submissions`, `grade`, `performance/pages`, `errors.csv`, `question_ids` و فیلتر `t.grade` در آزمون رسمی دانش‌آموز | پاس (`test-question-bank`, `test-audit-repairs`) |
| `server/logic.js` | BUG-09 | ایمن‌سازی `s?.grade` و `s?.class_id` در `audienceMatcher` | پاس (`smoke`) |
| `public/js/manager.js`, `manager-ui.js` | BUG-08, MF-01, MF-02, MF-04 | فرم انتخاب پایه‌های مشاور، فرم معلم-مشاور، صفحه کامل مصوبات جلسات، اتصال دکمه خروجی اکسل به `export.xlsx` | بررسی نحوی بدون خطا |
| `public/js/counselor.js`, `teacher.js`, `teacher-ui.js`, `teacher-minimal.js` | MF-03 | افزودن منوی «میز کار مشاور» و تب‌های پنل مشاور در پنل معلم برای معلمان دارای مجوز | بررسی نحوی بدون خطا |
| `scripts/test-counselor.mjs`, `scripts/test-audit-repairs.mjs` | BUG-10 | به‌روزرسانی تست حفظ ستون‌های مهاجرت و افزودن ۲۵ تست رگرسیون و امنیت | پاس (`61/61` و `25/25`) |
