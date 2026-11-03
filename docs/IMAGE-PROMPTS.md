# بسته‌ی پرامپت تصویر برای ChatGPT

برای تصویرهایی که پروژه هنوز ندارد. آیکون‌های رابط (۱۳۲ عدد، سه اطلس) و شخصیت‌های پسر دانش‌آموز، معلم زن و مدیر از قبل هست و دوباره ساخته نمی‌شود.

## روش کار

1. **یک گفت‌وگوی جدید در ChatGPT باز کنید** و در همان اول این‌ها را پیوست کنید: `public/img/education-icons-3d.png` و `public/img/education-characters-3d.png`. بنویسید: «این‌ها مرجع سبک هستند؛ همه‌ی تصویرهای بعدی دقیقاً با همین سبک ساخته شود.» این مهم‌ترین کار برای یکدستی است.
2. **بلوک «سبک مشترک» (پایین) را در ابتدای هر پرامپت بچسبانید**، سپس پرامپت همان تصویر را.
3. **هر تصویر را جداگانه بسازید.** اطلس‌ها را (چند آیکون در یک فایل) در یک پیام بخواهید.
4. **زمینه‌ی شفاف:** اگر خروجی زمینه‌ی سفید یا رنگی داشت، پیام بعدی را بنویسید: «همین تصویر را با زمینه‌ی سبز خالص و صاف `#00FF00` دوباره بساز، بقیه‌ی چیزها دقیقاً مثل قبل». من سبز را حذف می‌کنم. این روش مطمئن‌تر از شفافیت مستقیم است.
5. **متن در تصویر نخواهید.** ChatGPT متن فارسی را درست نمی‌نویسد؛ برچسب‌ها را خودم با HTML می‌گذارم. هر پرامپت صریحاً «بدون متن» دارد.
6. فایل‌ها را با **نام دقیق** بالای هر بخش، در `public/img/incoming/` بگذارید و به من بگویید. من برش، فشرده‌سازی (WebP) و اتصال به رابط را انجام می‌دهم.
7. اگر شبکه‌ی خانه‌ی یک اطلس نامنظم شد (آیکون‌ها از خانه بیرون زده یا تعدادشان کم و زیاد بود)، همان پیام را با جمله‌ی «دقیقاً ۶ ستون و ۲ ردیف مساوی، هر آیکون داخل ۷۲٪ مرکزی خانه‌اش» اصلاح کنید.

## سبک مشترک (اول هر پرامپت بچسبانید)

```
STYLE: premium glossy clay-3D educational illustration, rounded soft forms, beveled edges, soft studio lighting with gentle
shadows, friendly and toy-like but not childish, consistent front three-quarter perspective. Palette: emerald green #008E76,
mint #E4F5F2, sunny gold #FFD326, sky blue #0B9EEA, violet #9645ED, coral pink #F24C7B, warm white. Audience: Iranian school
students aged 9 to 15, their parents and teachers. Culturally appropriate, modest, positive. ABSOLUTELY NO TEXT, NO LETTERS,
NO NUMBERS, NO WATERMARK anywhere in the image. Clean bold silhouettes that stay readable when scaled small.
```

---

## اولویت ۱ (بیشترین تأثیر)

### 1) `level-art-3d.png` — هشت سطح رشد
اندازه‌ی کل حدود ۲۰۴۸×۱۰۲۴، **۴ ستون × ۲ ردیف**، خانه‌های مساوی، زمینه شفاف.
```
[STYLE]
One sprite atlas, exactly 4 columns by 2 rows of equal cells, each cell contains ONE illustration centered within its central
72%, generous transparent gutters, no overlap, no grid lines. Eight growth stages of the same small plant in a round terracotta
pot, evolving from humble to cosmic, left to right, top to bottom:
1 a tiny seed just cracked open with a single green sprout; 2 a young sapling with two bright leaves; 3 a plant with a first
pink blossom; 4 a small leafy tree with fruit; 5 a tree whose leaves have golden star-shaped sparkles; 6 a tree with a glowing
shooting star streaking behind it; 7 a tree with a tiny swirling galaxy of stars around its crown; 8 a majestic golden-leafed
tree with a small trophy glowing in the branches. Same pot style in every cell, each stage clearly bigger and richer than the
previous one. Transparent background.
```

### 2) `mascot-roshd.png` — شخصیت «رشد» (نهال بامزه) با پنج حالت
اندازه‌ی کل حدود ۲۵۶۰×۵۱۲، **۵ ستون × ۱ ردیف**.
```
[STYLE]
A sprite sheet, exactly 5 columns by 1 row of equal square cells, transparent background. The SAME cute mascot in all five
cells: a friendly little sprout character with a round emerald-green body, two small leaves on top like hair, big kind eyes,
tiny smile, standing in a small gold-and-terracotta pot, no arms needed. Five expressions/poses in order: 1 happy waving;
2 thinking with a small lightbulb above; 3 celebrating with sparkles and tiny confetti; 4 sleepy with closed eyes and a small
cloud; 5 encouraging with a glowing thumbs-up leaf. Character fully inside its cell with transparent margins, consistent size
and colors across the five poses.
```

### 3) `education-characters-2-3d.png` — شخصیت‌های تکمیلی (دختر دانش‌آموز، مادر، پدر)
اندازه‌ی کل حدود ۱۹۴۲×۸۰۹، **۳ ستون**، همان قالب اطلس شخصیت‌های فعلی.
```
[STYLE]
Match the attached character atlas exactly (same rendering, same proportions, waist-up, equal columns, transparent background).
Three NEW characters: column 1: a cheerful Iranian schoolgirl about 12 years old, modest school clothing with a light
headscarf, holding a book and a pencil, small backpack strap on shoulder; column 2: a warm Iranian mother, modest clothing
and headscarf, holding a smartphone, gentle proud smile; column 3: a kind Iranian father, short dark hair, smart casual
shirt, holding a school report folder, friendly smile. Waist-up, studio lighting, no text, transparent background.
```
> اگر پوشش دختر دانش‌آموز برای کاربران شما باید فرق کند (مثلاً بدون روسری)، همین جمله را در پرامپت عوض کنید.

### 4) `badges-3d.png` — ۱۲ نشان و افتخار
اندازه‌ی کل حدود ۱۵۳۶×۱۱۵۲، **۴ ستون × ۳ ردیف**.
```
[STYLE]
One sprite atlas, exactly 4 columns by 3 rows of equal cells, 12 achievement badges/medals, each a glossy round or shield
medal with a ribbon, a distinct central symbol and a distinct color theme, centered in its cell within the central 72%,
transparent gutters, no text. Order left to right, top to bottom: 1 stopwatch (first study session, turquoise); 2 flame
(7-day study streak, orange); 3 bullseye target with arrow (perfect 100% exam, red and gold); 4 checked clipboard (always-on-time
homework, green); 5 birthday cake with a star (birthday star, pink); 6 trophy cup (top of the week, gold); 7 calendar with a
check (perfect attendance, blue); 8 lightning bolt (mental-math champion, yellow); 9 telescope (observatory explorer, indigo);
10 crown on a graduation cap (elite level, purple and gold); 11 winding path with a flag (learning path completed, emerald);
12 two hands clasped around a heart (helps friends, coral).
```

### 5) `empty-states-3d.png` — حالت‌های خالی و خطا
اندازه‌ی کل حدود ۱۸۰۰×۸۰۰، **۳ ستون × ۲ ردیف**، خانه‌های تقریباً ۶۰۰×۴۰۰.
```
[STYLE]
One illustration sheet, exactly 3 columns by 2 rows of equal cells, each cell a small friendly scene object centered within
its central 78%, transparent background, no text, no frames. Order: 1 a relaxed open notebook with a big green check and a
pencil resting on it (no homework left); 2 an empty speech-bubble pair with a small paper plane flying away (no messages);
3 a neat stack of exam papers with a magnifier and a small question mark made of shapes, no letters (no exams yet); 4 a
rising bar chart with a small flag at the top (no results yet); 5 a megaphone on a small stand with a tiny sleeping moon
(no announcements); 6 a large friendly golden padlock beside a small credit card (locked panel, payment needed).
```

---

## اولویت ۲

### 6) `login-hero-3d.png` — تصویر صفحه ورود
اندازه ۱۶۰۰×۱۲۰۰، یک تصویر، زمینه شفاف.
```
[STYLE]
A single wide hero illustration: a diverse group of five Iranian students (two girls, three boys, ages 9 to 14, modest
clothing) and one friendly teacher gathered happily around a very large open book from which a glowing emerald-and-gold
seedling is growing upward like a tree, small floating stars, pencils and a tiny trophy around them. Composition leaves the
top-right quarter relatively calm. Transparent background, no text.
```

### 7) `story-scenes-3d.png` — صحنه‌های داستان «راز رصدخانه» (۱۲ صحنه)
اندازه‌ی کل حدود ۲۴۰۰×۲۰۰۰، **۳ ستون × ۴ ردیف**، هر صحنه یک قاب ۱۶:۹ با لبه‌های گرد و پس‌زمینه‌ی کامل (غیرشفاف).
```
[STYLE]
One sheet, exactly 3 columns by 4 rows of equal 16:9 rounded-corner scene cards, each a complete small night/indoor scene with
its own full background (not transparent), no text, no characters' faces needed. Two child heroes (a boy and a girl in
jackets with headlamps) appear small where relevant. Scenes in order: 1 a mountain observatory dome under a starry sky;
2 the back of the building with an owl on a branch; 3 a glowing keypad door with abstract number-like shapes; 4 a red
flashing alarm panel; 5 a grand hall with a huge silent telescope; 6 a cozy library with a solar-system poster; 7 a
basement electrical room with a cut wire; 8 a dark room with a dead lamp; 9 the telescope dome opening to the night sky;
10 a view of the full moon through a telescope; 11 the Orion constellation with three stars in a row; 12 a spectacular
meteor shower over the observatory with the two heroes cheering.
```

### 8) `product-covers-3d.png` — جلد محصولات فروشگاه
اندازه‌ی کل حدود ۱۸۰۰×۱۲۰۰، **۳ ستون × ۲ ردیف**، هر کدام مربع با گوشه‌ی گرد و پس‌زمینه‌ی رنگی خودش.
```
[STYLE]
One sheet, exactly 3 columns by 2 rows of equal square rounded-corner course-cover tiles, each with its own saturated gradient
background and ONE large central 3D object, no text. Order: 1 math: a glowing 3D geometric solid with a protractor and
ruler (violet); 2 science: a glass flask with a bubbling green potion and an atom orbit (green); 3 Persian literature: an open
ornate book with a quill and a stylized rose (warm orange); 4 English: two speech bubbles and a globe (blue); 5 IQ puzzles:
a colorful interlocking puzzle cube and a lightbulb (coral); 6 math olympiad: a gold medal over a stack of geometric shapes
(gold and indigo).
```

---

## اولویت ۳

### 9) `og-background.png` — پس‌زمینه‌ی اشتراک‌گذاری (OG)
اندازه ۱۲۰۰×۶۳۰، یک تصویر، غیرشفاف. لوگوی کانون را خودم رویش می‌گذارم.
```
[STYLE]
A wide 1200x630 soft mint-to-emerald gradient background with gentle 3D clay decorations at the right and left edges only:
small stars, pencils, a leafy sprout, an open book. The center 50% stays empty and calm for a logo and title. No text.
```

---

## تحویل
- نام‌ها دقیق باشد و فایل‌ها در `public/img/incoming/` بیایند.
- بعد از هر دسته به من بگویید (مثلاً «اولویت ۱ آماده است»). من خروجی را بررسی، اندازه و فرمت را بهینه، و در رابط وصل می‌کنم، و اگر خانه‌ای نامنظم بود دقیق می‌گویم کدام را دوباره بخواهید.
- اگر شخصیت یا سبکی به نظر شما نامناسب بود، پیش از ساخت بقیه خبر بدهید تا یکدستی خراب نشود.
