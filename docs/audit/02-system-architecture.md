# ۰۲ — معماری سامانه و ماتریس نقش‌ها (System Architecture)

## ۱. نقش‌های کاربری واقعی در کد و پایگاه داده
در جدول `users` ستون `role` می‌تواند یکی از مقادیر زیر باشد:
1. **`admin` (مدیر سامانه / پشتیبانی):** دسترسی سراسری به همه کانون‌ها، ساخت کانون و مدیر، مدیریت همه کاربران، مشاهده‌به‌جای هر کاربر، پشتیبان‌گیری و بازیابی کل دیتابیس.
2. **`manager` (مدیر کانون):** محدود به `center_id` خودش. مدیریت دانش‌آموزان، کلاس‌ها، معلمان، مشاوران، برنامه هفتگی، شهریه/فاکتور/رسید، حسابداری، اطلاعیه‌ها، فروشگاه، آزمون جامع، مصوبات جلسات، و پیامک.
3. **`teacher` (معلم):** محدود به `center_id` و کلاس‌های تخصیص‌یافته در `teacher_classes`. همچنین در صورت `is_counselor = 1` دسترسی به پنل مشاور (محدود به پایه‌های `counselor_grades_json`) نیز فعال می‌شود.
4. **`counselor` (مشاور مستقل):** محدود به `center_id` و پایه‌های `counselor_grades_json` (در صورت خالی بودن، همه پایه‌های کانون). دسترسی به پایش مطالعه، نمرات/آزمون‌ها، برنامه هفتگی، جلسات مشاوره و یادداشت‌های خصوصی.
5. **`student` (دانش‌آموز):** محدود به `center_id`، پایه و کلاس خودش. شامل جریان‌های اجباری تغییر رمز در اولین ورود (`must_change_password`) و قفل پنل در صورت بدهی حق عضویت (`423`).
6. **`parent` (منسوخ / حذف‌شده در نسخه فعلی):** در تاریخچه گیت (`1c13893`) حذف شده و در `server/index.js` مسدود است (`user.role === 'parent' return {}`), اما برخی کدهای مرده در `common.js`, `public/js/parent.js` باقی مانده‌اند.

## ۲. جریان احراز هویت و کنترل دسترسی
```
Request (/api/*)
  ├─ Rate Limit (per-user or per-IP)
  ├─ CSRF / Origin & Content-Type JSON check (for non-GET)
  ├─ loadUser(req): HMAC cookie -> revoked_tokens -> users row (pv hash check)
  ├─ route.auth !== false && !user  -> 401
  ├─ route.roles && !includes(user.role) -> 403
  ├─ student && !allowLocked && feeStatus.locked -> 423
  └─ route.handler(ctx)
```
**نکته بحرانی کشف‌شده در فاز ۱:** بررسی `must_change_password` در `server/index.js` در نسخه فعلی گم شده است (در `db.js` و `common.js` ستون وجود دارد، اما در `handle()` مسدودسازی `428` اعمال نمی‌شود). همچنین در `counselor.js` چندین مسیر بررسی `ensureCounselor(ctx)` و فیلتر `counselorGrades` را ندارند.

## ۳. پایگاه داده و یکپارچگی
- موتور: `node:sqlite` با `WAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
- ۲۳ مهاجرت در `migrations`؛ داده‌های تاریخی در `points`, `exam_results`, `qb_exam_attempts`, `payments`, `fee_invoices`, `counselor_sessions`, `counselor_plans` نگهداری می‌شوند.
