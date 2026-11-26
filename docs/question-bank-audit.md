# گزارش بررسی پروژه فعلی — بانک سؤالات و موتور آزمون رشد نخبه

این گزارش پیش از طراحی و پیاده‌سازی «بانک سؤالات و موتور آزمون» بر اساس کد واقعی مخزن تهیه شده است.

## ۱. بخش‌های بررسی‌شده
- **معماری سرور و امنیت:** `server/index.js`, `server/db.js`, `server/http.js`, `server/util.js`, `package.json`
- **بخش موجود کتب درسی:** `server/textbooks.json`, `server/routes/textbooks.js`, `server/textbook-store.js`, `server/routes/textbook-exercises.js`, `server/book-pages.js`, `public/js/textbooks.js`, `public/js/textbook-exercises.js`
- **آزمون‌ها و خودسنجی:** `exams`, `exam_attempts`, `exam_results`, `self_exams`, `exam_books` در `server/db.js` و مسیرهای `server/routes/teacher.js`, `server/routes/student.js`, `server/routes/manager.js`
- **رابط کاربری نقش‌ها:** `public/index.html`, `public/js/teacher-ui.js`, `public/js/teacher.js`, `public/js/student.js`, `public/js/elementary.js`, `public/js/manager.js`

## ۲. پاسخ به ۹ پرسش کلیدی دربارهٔ کتب درسی

1. **کتاب‌ها چگونه ثبت و ذخیره می‌شوند؟**
   در وضعیت فعلی، کتاب‌های درسی در SQLite ذخیره نمی‌شوند؛ بلکه فهرست آن‌ها به‌صورت ایستا در فایل `server/textbooks.json` نگهداری می‌شود (فقط ۲ کتاب آزمایشی: `math-4` و `science-9`) و دسترسی به آن‌ها پشت شرط `process.env.ROSHD_DEMO === '1'` قفل شده است. همچنین یک جدول `exam_books` برای کتاب‌های آزمون هوش در `server/db.js` وجود دارد.
2. **آیا فایل PDF کتاب در دیتابیس یا فضای ذخیرهسازی موجود است؟**
   بله، فایل PDF و تصاویر صفحات کتاب در فضای ذخیره‌سازی محلی (`ROSHD_TEXTBOOKS_DIR` یا `DATA_DIR/textbooks/pilot/<book_id>/`) با نام‌های `source.pdf` و `pages/page_<n>.jpg` نگهداری می‌شوند و از طریق مسیرهای احراز هویت‌شده `/api/textbooks/:id/file` و `/api/textbooks/:id/pages/:page` سرو می‌شوند.
3. **آیا کتاب‌ها دارای شناسه یکتا هستند؟**
   بله؛ در `server/textbooks.json` هر کتاب دارای فیلد `id` (مانند `math-4`) و `sha256` است، اما جدول رابطه‌ای در SQLite برای نسخه‌ها و چاپ‌های مختلف وجود ندارد.
4. **آیا فصل‌ها و درس‌ها مشخص شده‌اند؟**
   فصل‌ها (`chapters`) با `number`, `title`, `printed_start`, `printed_end`, `pdf_start` در `textbooks.json` تعریف شده‌اند، اما ساختار **درس‌ها (`lessons`)** درون فصل‌ها هنوز وجود ندارد.
5. **آیا شماره صفحات کتاب قابل تشخیص است؟**
   بله؛ `printed_pages` و `pdf_offset` در سطح کتاب و `printed_start`/`pdf_start` در سطح فصل ذخیره شده‌اند، اما امکان نگاشت یا اصلاح دستی شماره صفحه چاپی در برابر شماره صفحه PDF به‌ازای هر صفحه (`textbook_pages`) و همچنین علامت‌گذاری صفحات غیرآموزشی (جلد، فهرست) وجود ندارد.
6. **آیا نمایشگر PDF وجود دارد؟**
   بله؛ `public/js/textbooks.js` یک کتاب‌خوان صفحه‌به‌صفحه (`tb-viewer`) دارد که تصویر هر صفحه را بر اساس شماره چاپی نمایش می‌دهد، قابلیت بزرگ‌نمایی دارد و لینک دریافت PDF کامل کتاب را نیز ارائه می‌دهد.
7. **آیا ساختار فعلی قابلیت اتصال به بانک سؤال را دارد؟**
   به‌صورت خام خیر؛ `textbook_quizzes` فقط تمرین‌های تولیدی/دستی را به‌صورت یک آرایه JSON بسته ذخیره می‌کند و برای پایه، نسخه کتاب، درس، نوع سؤال استاندارد، دارایی‌های تصویری، تگ‌ها، وضعیت بررسی/انتشار و گزارش پوشش صفحه‌محور طراحی نشده است.
8. **کدام قسمت‌ها باید اصلاح یا تکمیل شوند؟**
   - انتقال فهرست کتب درسی از حالت صرفاً دمو و ایستا به جداول کامل SQLite (`textbooks`, `textbook_editions`, `textbook_chapters`, `textbook_lessons`, `textbook_pages`) همراه با همگام‌سازی خودکار کتاب‌های موجود در `server/textbooks.json`.
   - افزودن مدیریت کتاب، نسخه، فصل، درس، نگاشت صفحه چاپی↔PDF و استثنای صفحات غیرآموزشی.
   - جایگزینی وابستگی به API هوش مصنوعی در موتور آزمون با بانک سؤالات داخلی بدون AI.
   - یکپارچه‌سازی آزمون‌های رسمی معلم از بانک سؤالات با جدول موجود `exams` / `exam_attempts` / `exam_results` برای جلوگیری از ایجاد موتور آزمون تکراری.
9. **چگونه می‌توان بدون ایجاد اطلاعات تکراری، کتاب‌ها را به سؤالات متصل کرد؟**
   با استفاده از `textbooks` + `textbook_editions` به‌عنوان مرجع واحد کتاب و اتصال جدول `questions` از طریق کلیدهای خارجی به `book_id` و `edition_id` و جدول واسط `question_sources` (شامل `chapter_id`, `lesson_id`, `page_number`, `is_primary`). فایل‌های PDF و تصاویر صفحات نیز در همان مسیر امن ذخیره‌سازی کتب باقی می‌مانند.

## ۳. محدودیت‌های فنی پروژه فعلی (تطبیق معماری)
- پروژه **بدون هیچ وابستگی npm خارجی** (`package.json` بدون `dependencies`) و با `node:sqlite` داخلی Node.js کار می‌کند؛ بنابراین پردازش ZIP، XLSX، اعتبارسنجی JSON Schema و رندر فرمول‌های ریاضی (LaTeX) باید با ماژول‌های بومی Node.js (`node:zlib`, `node:crypto`) و جاوااسکریپت/CSS استاندارد بدون افزودن بسته npm پیاده‌سازی شوند.
- اسکریپت `scripts/review.mjs` استفاده از `child_process` یا `eval`/`new Function` را در `server/` ممنوع کرده است؛ تمام پردازش‌ها در `server/` به صورت pure-JS انجام می‌شوند.
