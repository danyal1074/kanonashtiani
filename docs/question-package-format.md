# استاندارد بستهٔ سؤال رشد (Roshd Question Package v1.0)

## ۱. ساختار فایل ZIP
```text
question-package.zip
├── manifest.json
├── questions.json
└── assets/
    ├── figure-001.png
    ├── figure-002.webp
    └── diagram-003.svg
```
تمام فایل‌های JSON باید با کدگذاری UTF-8 بدون BOM باشند.

## ۲. ساختار `manifest.json`
- `schema_version`: `"1.0"`
- `package_id`: شناسه یکتای بسته (مثلاً `"math6-1405-part01"`)
- `title`: عنوان بسته
- `language`: `"fa-IR"`
- `book`: شامل `book_code`، `title`، `grade` (۴ تا ۹) و `edition`
- `questions_file`: نام فایل سؤالات (معمولاً `"questions.json"`)
- `question_count`: تعداد سؤالات

## ۳. ساختار فایل JSON مستقل
فایل JSON مستقل می‌تواند شیئی شامل `{ "manifest": {...}, "book": {...}, "questions": [...] }` باشد تا بدون ZIP نیز بارگذاری شود.

## ۴. محدودیت‌های امنیتی بسته
- جلوگیری از Zip Slip (مسیرهای `..` یا مطلق رد می‌شوند).
- جلوگیری از Zip Bomb (حداکثر حجم فشرده‌نشده ۵۰ مگابایت، حداکثر ۲۰۰۰ فایل، حداکثر حجم هر تصویر ۵ مگابایت).
- پسوندهای مجاز در `assets/`: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`.
- پاکسازی خودکار SVG از تگ‌های `<script>` و رویدادهای `on*` و آدرس‌های `javascript:`.
