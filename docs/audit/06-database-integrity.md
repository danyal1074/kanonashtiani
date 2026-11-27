# ۰۶ — گزارش یکپارچگی پایگاه داده (Database Integrity Report)

- **موتور و تنظیمات:** SQLite (`node:sqlite`) با `WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `PRAGMA optimize`.
- **مهاجرت‌ها:** ۲۳ نسخه مهاجرت تراکنشی در `server/db.js`. مهاجرت نسخه ۲۳ برای افزودن `users.is_counselor`, `users.counselor_grades_json` و جدول `meeting_resolutions` با بررسی ستون (`PRAGMA table_info`) و بدون دست‌زدن به داده‌های موجود اضافه شد.
- **آزمون حفظ داده‌ها:**
  - `scripts/test-migrations.mjs` (ارتقای دیتابیس خالی، پشتیبان واقعی با حفظ رکوردها، و رول‌بک در خطا): **پاس**.
  - `scripts/test-counselor.mjs` (`migrationPreservesData` روی کل جدول‌های `users`, `students`, `points`, `messages`, `teacher_classes`, `exams`, `exam_results`, `pomodoros` + `PRAGMA foreign_key_check`): **پاس**.
- **نکته حفظ داده‌ها:** هیچ جدولی حذف نشده و هیچ رکورد تاریخی کاربر، نمره یا پرداخت تغییر نیافته است.
