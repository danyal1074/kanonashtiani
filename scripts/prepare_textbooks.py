import os, shutil, json, hashlib, pymupdf

SRC = r"c:\Users\danyal\Downloads\کتاب درسی"
OUT_LIB = os.path.join("data", "textbooks", "library")
os.makedirs(OUT_LIB, exist_ok=True)

BOOKS = [
  {
    "id": "math-4", "book_code": "MATH-04", "title": "ریاضی چهارم", "subject_key": "ریاضی", "grade": 4,
    "pdf": "ریاضی چهارم.pdf", "cover": "C405.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "اعداد و الگوها", "printed_start": 1, "printed_end": 22},
      {"number": 2, "title": "کسر", "printed_start": 23, "printed_end": 44},
      {"number": 3, "title": "ضرب و تقسیم", "printed_start": 45, "printed_end": 74},
      {"number": 4, "title": "اندازه‌گیری", "printed_start": 75, "printed_end": 96},
      {"number": 5, "title": "عدد مخلوط و عدد اعشاری", "printed_start": 97, "printed_end": 118},
      {"number": 6, "title": "شکل‌های هندسی", "printed_start": 119, "printed_end": 140},
      {"number": 7, "title": "آمار و احتمال", "printed_start": 141, "printed_end": 154},
    ]
  },
  {
    "id": "math-5", "book_code": "MATH-05", "title": "ریاضی پنجم", "subject_key": "ریاضی", "grade": 5,
    "pdf": "ریاضی پنجم.pdf", "cover": "C505-New.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "عددنویسی و الگوها", "printed_start": 1, "printed_end": 24},
      {"number": 2, "title": "کسر", "printed_start": 25, "printed_end": 52},
      {"number": 3, "title": "نسبت، تناسب و درصد", "printed_start": 53, "printed_end": 78},
      {"number": 4, "title": "تقارن و چندضلعی‌ها", "printed_start": 79, "printed_end": 106},
      {"number": 5, "title": "عددهای اعشاری", "printed_start": 107, "printed_end": 134},
      {"number": 6, "title": "اندازه‌گیری", "printed_start": 135, "printed_end": 168},
      {"number": 7, "title": "آمار و احتمال", "printed_start": 169, "printed_end": 200},
    ]
  },
  {
    "id": "math-6", "book_code": "MATH-06", "title": "ریاضی ششم", "subject_key": "ریاضی", "grade": 6,
    "pdf": "ریاضی ششم.pdf", "cover": "C605.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "عدد و الگوهای عددی", "printed_start": 1, "printed_end": 22},
      {"number": 2, "title": "کسر", "printed_start": 23, "printed_end": 42},
      {"number": 3, "title": "اعداد اعشاری", "printed_start": 43, "printed_end": 62},
      {"number": 4, "title": "تقارن و مختصات", "printed_start": 63, "printed_end": 86},
      {"number": 5, "title": "اندازه‌گیری", "printed_start": 87, "printed_end": 108},
      {"number": 6, "title": "تناسب و درصد", "printed_start": 109, "printed_end": 130},
      {"number": 7, "title": "تقریب", "printed_start": 131, "printed_end": 146},
    ]
  },
  {
    "id": "math-7", "book_code": "MATH-07", "title": "ریاضی هفتم", "subject_key": "ریاضی", "grade": 7,
    "pdf": "ریاضی هفتم.pdf", "cover": "C705.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "راهبردهای حل مسئله", "printed_start": 1, "printed_end": 12},
      {"number": 2, "title": "عددهای صحیح", "printed_start": 13, "printed_end": 28},
      {"number": 3, "title": "جبر و معادله", "printed_start": 29, "printed_end": 42},
      {"number": 4, "title": "هندسه و استدلال", "printed_start": 43, "printed_end": 58},
      {"number": 5, "title": "شمارنده‌ها و اعداد اول", "printed_start": 59, "printed_end": 72},
      {"number": 6, "title": "سطح و حجم", "printed_start": 73, "printed_end": 86},
      {"number": 7, "title": "توان و جذر", "printed_start": 87, "printed_end": 100},
      {"number": 8, "title": "بردار و مختصات", "printed_start": 101, "printed_end": 114},
      {"number": 9, "title": "آمار و احتمال", "printed_start": 115, "printed_end": 129},
    ]
  },
  {
    "id": "math-8", "book_code": "MATH-08", "title": "ریاضی هشتم", "subject_key": "ریاضی", "grade": 8,
    "pdf": "ریاضی هشتم.pdf", "cover": "C805.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "عددهای صحیح و گویا", "printed_start": 1, "printed_end": 18},
      {"number": 2, "title": "عددهای اول", "printed_start": 19, "printed_end": 34},
      {"number": 3, "title": "چندضلعی‌ها", "printed_start": 35, "printed_end": 52},
      {"number": 4, "title": "جبر و معادله", "printed_start": 53, "printed_end": 70},
      {"number": 5, "title": "بردار و مختصات", "printed_start": 71, "printed_end": 88},
      {"number": 6, "title": "مثلث", "printed_start": 89, "printed_end": 106},
      {"number": 7, "title": "توان و جذر", "printed_start": 107, "printed_end": 124},
      {"number": 8, "title": "آمار و احتمال", "printed_start": 125, "printed_end": 138},
      {"number": 9, "title": "دایره", "printed_start": 139, "printed_end": 154},
    ]
  },
  {
    "id": "math-9", "book_code": "MATH-09", "title": "ریاضی نهم", "subject_key": "ریاضی", "grade": 9,
    "pdf": "ریاضی نهم.pdf", "cover": "C905.jpg", "pdf_offset": 8,
    "chapters": [
      {"number": 1, "title": "مجموعه‌ها", "printed_start": 1, "printed_end": 17},
      {"number": 2, "title": "عددهای حقیقی", "printed_start": 18, "printed_end": 35},
      {"number": 3, "title": "استدلال و اثبات در هندسه", "printed_start": 36, "printed_end": 54},
      {"number": 4, "title": "توان و ریشه", "printed_start": 55, "printed_end": 72},
      {"number": 5, "title": "عبارت‌های جبری", "printed_start": 73, "printed_end": 94},
      {"number": 6, "title": "خط و معادله‌های خطی", "printed_start": 95, "printed_end": 112},
      {"number": 7, "title": "عبارت‌های گویا", "printed_start": 113, "printed_end": 129},
      {"number": 8, "title": "حجم و مساحت", "printed_start": 130, "printed_end": 144},
    ]
  },
  {
    "id": "science-4", "book_code": "SCI-04", "title": "علوم چهارم", "subject_key": "علوم", "grade": 4,
    "pdf": "علوم چهارم.pdf", "cover": "C406.jpg", "pdf_offset": 8,
    "chapters": [
      {"number": 1, "title": "زنگ علوم", "printed_start": 1, "printed_end": 8},
      {"number": 2, "title": "مخلوط‌ها در زندگی", "printed_start": 9, "printed_end": 18},
      {"number": 3, "title": "انرژی، نیاز هر روز ما", "printed_start": 19, "printed_end": 28},
      {"number": 4, "title": "انرژی الکتریکی", "printed_start": 29, "printed_end": 38},
      {"number": 5, "title": "گرما و ماده", "printed_start": 39, "printed_end": 48},
      {"number": 6, "title": "سنگ‌ها", "printed_start": 49, "printed_end": 58},
      {"number": 7, "title": "آهن‌ربا در زندگی", "printed_start": 59, "printed_end": 68},
      {"number": 8, "title": "آسمان در شب", "printed_start": 69, "printed_end": 78},
      {"number": 9, "title": "بدن ما (۱)", "printed_start": 79, "printed_end": 88},
      {"number": 10, "title": "بدن ما (۲)", "printed_start": 89, "printed_end": 98},
      {"number": 11, "title": "بی‌مهره‌ها", "printed_start": 99, "printed_end": 108},
      {"number": 12, "title": "گوناگونی گیاهان", "printed_start": 109, "printed_end": 114},
      {"number": 13, "title": "زیستگاه", "printed_start": 115, "printed_end": 120},
    ]
  },
  {
    "id": "science-5", "book_code": "SCI-05", "title": "علوم پنجم", "subject_key": "علوم", "grade": 5,
    "pdf": "علوم پنجم.pdf", "cover": "C506.jpg", "pdf_offset": 8,
    "chapters": [
      {"number": 1, "title": "زنگ علوم", "printed_start": 1, "printed_end": 8},
      {"number": 2, "title": "ماده تغییر می‌کند", "printed_start": 9, "printed_end": 18},
      {"number": 3, "title": "رنگین‌کمان", "printed_start": 19, "printed_end": 28},
      {"number": 4, "title": "برگی از تاریخ زمین", "printed_start": 29, "printed_end": 36},
      {"number": 5, "title": "حرکت هم‌چنان ادامه دارد", "printed_start": 37, "printed_end": 46},
      {"number": 6, "title": "چه خبر (۱)", "printed_start": 47, "printed_end": 54},
      {"number": 7, "title": "چه خبر (۲)", "printed_start": 55, "printed_end": 62},
      {"number": 8, "title": "کارها آسان می‌شود (۱)", "printed_start": 63, "printed_end": 70},
      {"number": 9, "title": "کارها آسان می‌شود (۲)", "printed_start": 71, "printed_end": 78},
      {"number": 10, "title": "خاک باارزش", "printed_start": 79, "printed_end": 86},
      {"number": 11, "title": "بکار و بخور", "printed_start": 87, "printed_end": 94},
      {"number": 12, "title": "از ریشه تا برگ", "printed_start": 95, "printed_end": 104},
    ]
  },
  {
    "id": "science-6", "book_code": "SCI-06", "title": "علوم ششم", "subject_key": "علوم", "grade": 6,
    "pdf": "علوم ششم.pdf", "cover": "C606.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "زنگ علوم", "printed_start": 1, "printed_end": 8},
      {"number": 2, "title": "سرگذشت دفتر من", "printed_start": 9, "printed_end": 16},
      {"number": 3, "title": "کارخانه کاغذسازی", "printed_start": 17, "printed_end": 24},
      {"number": 4, "title": "سفر به اعماق زمین", "printed_start": 25, "printed_end": 32},
      {"number": 5, "title": "زمین پویا", "printed_start": 33, "printed_end": 40},
      {"number": 6, "title": "ورزش و نیرو (۱)", "printed_start": 41, "printed_end": 48},
      {"number": 7, "title": "ورزش و نیرو (۲)", "printed_start": 49, "printed_end": 56},
      {"number": 8, "title": "طراحی کنیم و بسازیم", "printed_start": 57, "printed_end": 64},
      {"number": 9, "title": "سفر انرژی", "printed_start": 65, "printed_end": 72},
      {"number": 10, "title": "خیلی کوچک، خیلی بزرگ", "printed_start": 73, "printed_end": 80},
      {"number": 11, "title": "شگفتی‌های برگ", "printed_start": 81, "printed_end": 88},
      {"number": 12, "title": "جنگل برای کیست؟", "printed_start": 89, "printed_end": 96},
      {"number": 13, "title": "سالم بمانیم", "printed_start": 97, "printed_end": 106},
    ]
  },
  {
    "id": "science-7", "book_code": "SCI-07", "title": "علوم هفتم", "subject_key": "علوم", "grade": 7,
    "pdf": "علوم هفتم.pdf", "cover": "C706.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "تجربه و تفکر", "printed_start": 1, "printed_end": 10},
      {"number": 2, "title": "اندازه‌گیری در علوم و ابزارهای آن", "printed_start": 11, "printed_end": 20},
      {"number": 3, "title": "اتم‌ها، الفبای مواد", "printed_start": 21, "printed_end": 30},
      {"number": 4, "title": "مواد پیرامون ما", "printed_start": 31, "printed_end": 40},
      {"number": 5, "title": "از معدن تا خانه", "printed_start": 41, "printed_end": 48},
      {"number": 6, "title": "سفر آب روی زمین", "printed_start": 49, "printed_end": 58},
      {"number": 7, "title": "سفر آب در درون زمین", "printed_start": 59, "printed_end": 66},
      {"number": 8, "title": "انرژی و تبدیل‌های آن", "printed_start": 67, "printed_end": 76},
      {"number": 9, "title": "منابع انرژی", "printed_start": 77, "printed_end": 86},
      {"number": 10, "title": "گرما و بهینه‌سازی مصرف انرژی", "printed_start": 87, "printed_end": 96},
      {"number": 11, "title": "یاخته و سازمان‌بندی آن", "printed_start": 97, "printed_end": 104},
      {"number": 12, "title": "سفره سلامت", "printed_start": 105, "printed_end": 114},
      {"number": 13, "title": "سفر غذا", "printed_start": 115, "printed_end": 122},
      {"number": 14, "title": "گردش مواد", "printed_start": 123, "printed_end": 130},
      {"number": 15, "title": "تبادل با محیط", "printed_start": 131, "printed_end": 138},
    ]
  },
  {
    "id": "science-8", "book_code": "SCI-08", "title": "علوم هشتم", "subject_key": "علوم", "grade": 8,
    "pdf": "علوم هشتم.pdf", "cover": "C806.jpg", "pdf_offset": 6,
    "chapters": [
      {"number": 1, "title": "مخلوط و جداسازی مواد", "printed_start": 1, "printed_end": 12},
      {"number": 2, "title": "تغییرات شیمیایی در خدمت زندگی", "printed_start": 13, "printed_end": 22},
      {"number": 3, "title": "از درون اتم چه خبر", "printed_start": 23, "printed_end": 32},
      {"number": 4, "title": "تنظیم عصبی", "printed_start": 33, "printed_end": 42},
      {"number": 5, "title": "حس و حرکت", "printed_start": 43, "printed_end": 52},
      {"number": 6, "title": "تنظیم هورمونی", "printed_start": 53, "printed_end": 60},
      {"number": 7, "title": "الفبای زیست‌فناوری", "printed_start": 61, "printed_end": 68},
      {"number": 8, "title": "تولیدمثل در جانداران", "printed_start": 69, "printed_end": 78},
      {"number": 9, "title": "الکتریسیته", "printed_start": 79, "printed_end": 90},
      {"number": 10, "title": "مغناطیس", "printed_start": 91, "printed_end": 100},
      {"number": 11, "title": "کانی‌ها", "printed_start": 101, "printed_end": 110},
      {"number": 12, "title": "سنگ‌ها", "printed_start": 111, "printed_end": 120},
      {"number": 13, "title": "هوازدگی", "printed_start": 121, "printed_end": 128},
      {"number": 14, "title": "نور و ویژگی‌های آن", "printed_start": 129, "printed_end": 138},
      {"number": 15, "title": "شکست نور", "printed_start": 139, "printed_end": 146},
    ]
  },
  {
    "id": "science-9", "book_code": "SCI-09", "title": "علوم نهم", "subject_key": "علوم", "grade": 9,
    "pdf": "علوم نهم.pdf", "cover": "C906.jpg", "pdf_offset": 8,
    "chapters": [
      {"number": 1, "title": "مواد و نقش آنها در زندگی", "printed_start": 1, "printed_end": 12},
      {"number": 2, "title": "رفتار اتم‌ها با یکدیگر", "printed_start": 13, "printed_end": 24},
      {"number": 3, "title": "به دنبال محیطی بهتر برای زندگی", "printed_start": 25, "printed_end": 38},
      {"number": 4, "title": "حرکت چیست", "printed_start": 39, "printed_end": 50},
      {"number": 5, "title": "نیرو", "printed_start": 51, "printed_end": 62},
      {"number": 6, "title": "زمین‌ساخت ورقه‌ای", "printed_start": 63, "printed_end": 72},
      {"number": 7, "title": "آثاری از گذشتهٔ زمین", "printed_start": 73, "printed_end": 82},
      {"number": 8, "title": "فشار و آثار آن", "printed_start": 83, "printed_end": 94},
      {"number": 9, "title": "ماشین‌ها", "printed_start": 95, "printed_end": 106},
      {"number": 10, "title": "نگاهی به فضا", "printed_start": 107, "printed_end": 120},
      {"number": 11, "title": "گوناگونی جانداران", "printed_start": 121, "printed_end": 130},
      {"number": 12, "title": "دنیای گیاهان", "printed_start": 131, "printed_end": 142},
      {"number": 13, "title": "جانوران بی‌مهره", "printed_start": 143, "printed_end": 154},
      {"number": 14, "title": "جانوران مهره‌دار", "printed_start": 155, "printed_end": 166},
      {"number": 15, "title": "باهم زیستن", "printed_start": 167, "printed_end": 176},
    ]
  },
]

catalog = []
for b in BOOKS:
    bdir = os.path.join(OUT_LIB, b["id"])
    pdir = os.path.join(bdir, "pages")
    os.makedirs(pdir, exist_ok=True)
    src_pdf = os.path.join(SRC, b["pdf"])
    dst_pdf = os.path.join(bdir, "source.pdf")
    if not os.path.exists(dst_pdf):
        shutil.copy2(src_pdf, dst_pdf)
    src_cov = os.path.join(SRC, b["cover"])
    dst_cov = os.path.join(bdir, "cover.jpg")
    if os.path.exists(src_cov) and not os.path.exists(dst_cov):
        shutil.copy2(src_cov, dst_cov)

    doc = pymupdf.open(dst_pdf)
    total_pdf = len(doc)
    printed_pages = max(1, total_pdf - b["pdf_offset"])
    # اطمینان از اینکه آخرین فصل از printed_pages بیشتر نباشد
    for ch in b["chapters"]:
        if ch["printed_end"] > printed_pages:
            ch["printed_end"] = printed_pages
        ch["pdf_start"] = ch["printed_start"] + b["pdf_offset"]

    # رندر صفحات به JPG برای ورق‌زن سریع
    rendered = 0
    for p in range(1, printed_pages + 1):
        pdf_idx = p + b["pdf_offset"] - 1
        if 0 <= pdf_idx < total_pdf:
            out_img = os.path.join(pdir, f"page_{p}.jpg")
            if not os.path.exists(out_img):
                pix = doc[pdf_idx].get_pixmap(dpi=105)
                pix.save(out_img, jpg_quality=78)
                rendered += 1
    doc.close()

    h = hashlib.sha256(open(dst_pdf, "rb").read()).hexdigest()
    catalog.append({
        "id": b["id"],
        "book_code": b["book_code"],
        "title": b["title"],
        "subject_key": b["subject_key"],
        "grade": b["grade"],
        "printed_pages": printed_pages,
        "pdf_offset": b["pdf_offset"],
        "sha256": h,
        "chapters": b["chapters"],
    })
    print(f"{b['id']}: {printed_pages} printed pages ({total_pdf} pdf), newly rendered={rendered}")

with open(os.path.join("server", "textbooks-library.json"), "w", encoding="utf-8") as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2)
print("Saved server/textbooks-library.json with", len(catalog), "books.")
