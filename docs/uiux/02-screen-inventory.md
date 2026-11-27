# فهرست کامل صفحات و نقش‌ها (Screen Inventory) — پلتفرم رشد نخبه

**تاریخ:** ۱۴۰۵/۰۹/۰۶ (2026-11-27)

---

## ۱. صفحات عمومی و احراز هویت
| مسیر (Hash Route) | ماژول | توضیح |
|---|---|---|
| `#/login` | `login.js` | صفحه ورود با انتخاب نقش (دانش‌آموز، معلم، مشاور، مدیر کانون، مدیر سامانه)، انتخاب کانون و باکس دمو |
| `#/c/:slug` | `shop.js` | صفحه عمومی کانون و فروشگاه محصولات آموزشی |
| `#/p/:id` | `shop.js` | جزئیات محصول فروشگاه |
| `#/cart/:slug` | `shop.js` | سبد خرید و ثبت سفارش |

---

## ۲. پنل مدیر سامانه (`admin` — `public/js/admin.js`)
| مسیر | عنوان صفحه |
|---|---|
| `#/home` | داشبورد کانون آشتیانی و آمار کل سامانه |
| `#/managers` | مدیریت حساب‌های مدیر کانون |
| `#/users` | جستجو، بازنشانی رمز، فعال/غیرفعال و ورود به‌جای کاربر |
| `#/backup` | پشتیبان‌گیری و بازیابی پایگاه داده |
| `#/account` | حساب کاربری و تغییر رمز عبور |

---

## ۳. پنل مدیر کانون (`manager` — `public/js/manager.js` + `admin-dashboard.js`)
| مسیر | عنوان صفحه |
|---|---|
| `#/home` | داشبورد مدیریت کانون |
| `#/students` | مدیریت دانش‌آموزان (لیست، ثبت، ویرایش، خروجی CSV، ورود گروهی) |
| `#/staff` | معلمان، کلاس‌ها و برنامه |
| `#/counselors` | مدیریت مشاوران |
| `#/meetings` | مصوبات جلسات |
| `#/timetable` | برنامه هفتگی کانون |
| `#/fees` | حق عضویت و بررسی رسیدها |
| `#/announcements` | اطلاعیه‌رسانی |
| `#/accounting` | حسابداری (درآمد/هزینه) |
| `#/invoices` | فاکتورهای دوره‌ای |
| `#/sms-outbox` | صندوق پیامک |
| `#/barpa` / `#/barpa/:id` | کارنامه‌های برپا |
| `#/hoosh-studio` | استودیوی هوش کمپلکس |
| `#/att-log` | لاگ تغییر حضور |
| `#/comprehensive` / `#/comprehensive/:id` | آزمون جامع کانون |
| `#/exam-center` / `#/exam-center/:tab` | مرکز آزمون |
| `#/question-bank` / `#/question-bank/:tab` / `#/qb-books/:id` | بانک سؤالات و کتاب‌ها |
| `#/performance` | عملکرد دانش‌آموزان |
| `#/shop` | مدیریت فروشگاه |
| `#/messages` / `#/messages/:id` | پیام‌رسان داخلی |
| `#/settings` | تنظیمات کانون |
| `#/account` | حساب کاربری |

---

## ۴. پنل معلم (`teacher` — `public/js/teacher.js` + `teacher-ui.js` / `teacher-minimal.js`)
| مسیر | عنوان صفحه |
|---|---|
| `#/home` | داشبورد معلم |
| `#/classes` | کلاس‌های من |
| `#/assignments` / `#/assignments/report` | تکالیف و گزارش ارسال |
| `#/exams` / `#/exams/:id` | آزمون‌ها و جزئیات آزمون |
| `#/exam-center` / `#/exam-center/:tab` | مرکز آزمون |
| `#/question-bank` / `#/question-bank/:tab` / `#/qb-books/:id` | بانک سؤالات |
| `#/hoosh-studio` | استودیوی هوش |
| `#/attendance` / `#/attendance/:id` | حضور و غیاب |
| `#/att-log` | لاگ تغییر حضور |
| `#/reports` | گزارش‌ها |
| `#/students` / `#/students/:id` | فهرست و پرونده دانش‌آموزان |
| `#/timetable` | برنامه هفتگی من |
| `#/plans` | تقویم و برنامه |
| `#/materials` | محتوای آموزشی |
| `#/textbooks` / `#/textbooks/:id` / `#/textbooks/:id/practice` | کتاب‌های درسی و تمرین |
| `#/textbook-attempts/:id` / `#/textbook-quizzes/:id` / `#/textbook-papers` / `#/textbook-papers/:id` | آزمونک‌ها و برگه‌های کتاب درسی |
| `#/messages` / `#/messages/:id` | ارتباطات |
| `#/announcements` | اطلاعیه‌ها |
| `#/more` | موارد بیشتر |
| `#/account` | حساب کاربری |

---

## ۵. پنل مشاور (`counselor` — `public/js/counselor.js`)
| مسیر | عنوان صفحه |
|---|---|
| `#/home` | داشبورد مشاور |
| `#/students` / `#/students/:id` | دانش‌آموزان من و پرونده جزئیات دانش‌آموز |
| `#/study` | پومودورو و مطالعه |
| `#/exams` | آزمون‌ها |
| `#/progress` | وضعیت تحصیلی |
| `#/plans` | برنامه‌ریزی و پیگیری هفتگی |
| `#/reports` | گزارش‌های تحلیلی |
| `#/sessions` | جلسات مشاوره |
| `#/messages` / `#/messages/:id` | پیام‌ها |
| `#/announcements` | اطلاعیه‌ها |
| `#/more` | موارد بیشتر (موبایل) |
| `#/account` | تنظیمات و حساب کاربری |
| `#/teacher-panel` | نمای معلم (در صورت دسترسی) |

---

## ۶. پنل دانش‌آموز (`student` — `public/js/student.js` + `elementary.js` + `student-design.js`)
*(شامل دو نمای متوسطه `student-secondary` و دبستان `student-elementary` برای پایه‌های ۴ تا ۶)*
| مسیر | عنوان صفحه |
|---|---|
| `#/home` | داشبورد دانش‌آموز |
| `#/lessons` | درس‌ها |
| `#/schedule` | برنامه هفتگی |
| `#/library` | کتابخانه |
| `#/textbooks` / `#/textbooks/:id` / `#/textbooks/:id/practice` | کتاب‌های درسی (دمو) و تمرین |
| `#/textbook-attempts/:id` / `#/textbook-papers` / `#/textbook-papers/:id` | تمرین‌ها و برگه‌های کتاب |
| `#/classes` | کلاس آنلاین |
| `#/assignments` | تکالیف |
| `#/exams` / `#/exam/:id` / `#/exam-center` | آزمون‌ها و اجرای آزمون |
| `#/qb-builder` / `#/qb-exam/:id` / `#/qb-report/:id` / `#/qb-pages` | ساخت آزمون از بانک سؤال |
| `#/self-exams` / `#/self-exam/:id` | آزمون خودسنجی |
| `#/results` / `#/results/:id` / `#/barpa/:id` | کارنامه و نتایج |
| `#/study` | مطالعه و پومودورو |
| `#/path` | مسیر یادگیری هوشمند |
| `#/games` / `#/games/math` / `#/games/story` | بازی و داستان آموزشی |
| `#/challenges` | چالش‌ها |
| `#/roadmap` | نقشه راه رشد |
| `#/records` | فاکتورها و کارنامه‌ها |
| `#/my-class` / `#/teachers` / `#/attendance` | کلاس من، معلمان و حضور |
| `#/counselor` | مشاور تحصیلی |
| `#/messages` / `#/messages/:id` | پیام‌ها |
| `#/announcements` | اطلاعیه‌ها |
| `#/profile` / `#/account` | پروفایل من و حساب کاربری |
| `#/payment` | حق عضویت و پرداخت |
| `#/shop` | فروشگاه کانون |
| `#/more` | موارد بیشتر |
