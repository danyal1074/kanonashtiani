import json, shutil
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent
data = json.loads((root / 'kanoon-mockups-delivery.json').read_text(encoding='utf-8'))
dest = Path('C:/Users/danyal/Downloads/پروژه های انتی گراویتی/سایت کانون/design-mockups-1405-08-12')
dest.mkdir(parents=True, exist_ok=True)
originals = dest / 'originals'
originals.mkdir(exist_ok=True)
for a in data['assets']:
    source = Path(a['source'])
    target = dest / a['file']
    shutil.copy2(source, originals / a['file'])
    with Image.open(source) as im:
        im = ImageOps.pad(im.convert('RGB'), (a['w'], a['h']), method=Image.Resampling.LANCZOS, color='#f4f6fb')
        im.save(target, optimize=True)
    with Image.open(target) as check:
        assert check.size == (a['w'], a['h'])
        check.verify()
    print(a['file'], a['w'], a['h'])
readme = '# ماکاپ‌های طراحی کانون آشتیانی\n\n'
readme += 'ساخته‌شده با ابزار داخلی imagegen بر اساس SOURCE-BRIEF.md و لوگوی رسمی ارسالی.\n\n'
readme += 'لوگوی بدون نوشته: `00-logo-no-text.png` با پس‌زمینه شفاف. لوگوی رسمی جایگزین نشان ستاره و کتاب پیشنهادی بریف شده است.\n\n'
readme += 'فایل‌های شماره‌دار طبق ترتیب پیشنهادی بریف هستند؛ نوار آمار که از ترتیب پیشنهادی جا افتاده بود پیش از موبایل افزوده شده است. نسخه‌های اصلی بدون تغییر در originals نگهداری می‌شوند. خروجی‌های اصلی پوشه در اندازه‌های بریف، با حفظ نسبت تصویر و در صورت نیاز حاشیه، آماده شده‌اند.\n\n'
readme += '## استفاده در کلاد\n\nتصویر منتخب را همراه SOURCE-BRIEF.md و فایل لوگو به کلاد بدهید. از تصویر برای چیدمان و حس بصری استفاده کنید و متن، اعداد، منوها و قواعد رفتاری را از بریف پیاده کنید؛ نوشته‌ها و نمادهای ساخته‌شده در ماکاپ ممکن است خطا داشته باشند. خطوط خاکستری محل متن‌اند و نباید به همین شکل در سایت نهایی بمانند. لوگوی نهایی باید از فایل مستقل استفاده شود.\n\n'
for a in data['assets']:
    readme += f"## {a['file']} — {a['section']}\n\nاندازه: {a['w']} × {a['h']}\n\n{a['note']}\n\n"
(dest / 'README-FA.md').write_text(readme, encoding='utf-8')
prompts = '# Final image prompts\n\nMode: built-in imagegen. Logo is the supplied official mark, with lower calligraphy removed.\n\n'
for a in data['assets']:
    prompts += f"## {a['file']}\n\n{a['prompt']}\n\n"
(dest / 'PROMPTS.md').write_text(prompts, encoding='utf-8')
shutil.copy2(root / 'kanoon-mockups-delivery.json', dest / 'manifest.json')
print('Saved', len(data['assets']), 'mockups')
