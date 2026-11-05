# راهنمای استقرار و پیکربندی سرور (Deployment Guide)

## ۱. ساختار استاندارد استقرار جدید (`roshd.service`)
برای استقرار استاندارد، سرویس تحت کاربر غیرریشه `roshd` با امنیت حداکثری و محدودسازی دسترسی به فایل‌ها تنظیم می‌شود:
- **فایل واحد سیستم‌دی**: `deploy/roshd.service` و `scripts/deploy/roshd.service`
- **کاربر اجرایی**: `roshd` (نه `root`)
- **مسیر پروژه**: `/srv/roshd`
- **مسیرهای مجاز نوشتن**: `/srv/roshd/data` و `/srv/roshd/uploads`
- **محدودیت‌های امنیتی**:
  - `NoNewPrivileges=true`
  - `ProtectSystem=full`
  - `LimitNOFILE=65536`

---

## ۲. سرویس فعال فعلی روی سرور عملیاتی (`kanonashtiani.service`)
روی سرور فعلی با آدرس IP `89.46.217.44` که دامنه `kanonashtiani.ir` به آن اشاره دارد، وضعیت به شرح زیر است:

- **نام سرویس سیستم‌دی**: `kanonashtiani.service`
- **مسیر ریشه برنامه**: `/var/www/kanonashtiani`
- **مسیر داده‌های پایگاه داده**: `/var/www/kanonashtiani/data/roshd.db`
- **مسیر پشتیبان‌ها**: `/var/www/kanonashtiani/data/backups`
- **مسیر بارگذاری‌ها**: `/var/www/kanonashtiani/uploads`
- **دستورات مدیریت سرویس**:
  ```bash
  # مشاهده وضعیت سرویس
  sudo systemctl status kanonashtiani.service

  # راه‌اندازی مجدد پس از استقرار
  sudo systemctl restart kanonashtiani.service

  # مشاهده لاگ‌های جاری
  sudo journalctl -u kanonashtiani.service -f
  ```

---

## ۳. اسکریپت استقرار خودکار (`scripts/deploy_vps.py`)
اسکریپت استقرار برای امنیت بالا بازنویسی شده است:
1. **متغیرهای محیطی اجباری**:
   - `ROSHD_DEPLOY_IP`: آدرس سرور (مثلاً `89.46.217.44`)
   - `ROSHD_DEPLOY_USER`: کاربر اتصال SSH (مثلاً `root` یا `deploy`)
   - `ROSHD_DEPLOY_PASSWORD`: رمز عبور SSH
   - `ROSHD_DEPLOY_KEY`: (اختیاری) مسیر کلید خصوصی SSH
   - `ROSHD_DEPLOY_REF`: شاخه یا تگ مورد نظر (به صورت پیش‌فرض `main`؛ فقط `main` یا تگ‌های نسخه مانند `v1.0.0` مجاز است).
2. **سیاست کلید میزبان**: استفاده از `client.load_system_host_keys()` و `RejectPolicy()` به جای `AutoAddPolicy()`.
3. **پشتیبان‌گیری پیش‌فرض**: قبل از هرگونه `git pull` روی سرور دستور `npm run backup` اجرا می‌شود.
4. **حذف دستورات دستکاری دیتابیس**: عدم اجرای کوئری‌های دستی مانند تغییر رمز کاربران در فرآیند استقرار.

---

## ۴. همگام‌سازی تصاویر صفحات کتب هوش (`data/books/`)
تصاویر استخراج‌شده صفحات کتب هوش و استعداد تحلیلی در پوشه `data/books/` قرار دارند که به دلیل حجم و ماهیت فایل‌های محلی در گیت ردیابی نمی‌شوند (`.gitignore`).

برای فعال بودن نمایش صفحات در بخش استودیوی آزمون کتب هوش روی سرور، باید این پوشه به مسیر داده‌های سرور (`ROSHD_DATA_DIR/books/` یا پیش‌فرض `/var/www/kanonashtiani/data/books/`) منتقل شود:

```bash
# کپی امن پوشه کتب از طریق rsync یا scp از محیط محلی به سرور عملیاتی:
rsync -avz --progress ./data/books/ root@<SERVER_IP>:/var/www/kanonashtiani/data/books/

# یا در استقرار استاندارد roshd:
rsync -avz --progress ./data/books/ roshd@<SERVER_IP>:/srv/roshd/data/books/

# تنظیم دسترسی‌های مناسب روی سرور:
sudo chown -R roshd:roshd /srv/roshd/data/books/
sudo chmod -R 750 /srv/roshd/data/books/
```
پس از انتقال، اندپوینت `GET /api/exam-books/:id/pages/:n` صفحات کتاب را مستقیماً از دایرکتوری امن `ROSHD_DATA_DIR/books/<id>/page_<n>.jpg` با اعتبارسنجی نقش‌های معلم و مدیر لود می‌کند.

---

## ۵. پیکربندی درگاه پیامک (sms.ir / ایده پردازان)

سامانه از درگاه پیامکی `sms.ir` با متد Bulk REST API v1 (`https://api.sms.ir/v1/send/bulk`) برای ارسال پیامک‌های غیبت، اطلاعیه‌ها و پیام‌های گروهی/فردی پشتیبانی می‌کند.

### متغیرهای محیطی مورد نیاز روی سرور:
در فایل محیطی سرویس (یا فایل `/var/www/kanonashtiani/.env`):
```bash
# درگاه پیامک: smsir
ROSHD_SMS_PROVIDER=smsir

# کلید API دریافتی از پنل sms.ir (بخش منوی برنامه‌نویسان / کلید وب‌سرویس):
ROSHD_SMS_API_KEY=your_smsir_api_key_here

# شماره خط ارسال‌کننده اختصاصی یا خدماتی (مثلاً ۳۰۰۰xxxx یا ۹۰۰۰xxxx):
ROSHD_SMS_SENDER=3000xxxx
```

### قابلیت‌ها:
1. **پیامک غیبت دانش‌آموزان (`POST /api/manager/attendance/:id/sms`)**: ارسال خودکار یا تکی اطلاع‌رسانی غیبت به تلفن والدین به تفکیک تاریخ و کلاس.
2. **ارسال پیامک مستقیم و گروهی (`POST /api/manager/sms/send`)**: ارسال پیامک به کل کانون، یک پایه خاص، یک کلاس خاص یا دانش‌آموز خاص با قابلیت انتخاب مخاطب (والدین / دانش‌آموز / هر دو).
3. **ارسال پیامک با اطلاعیه‌ها (`POST /api/manager/announcements` با `send_sms: true`)**: ارسال خودکار متن اطلاعیه به شماره مخاطبان تعیین‌شده.
4. **صندوق پیامک (`/sms-outbox`)**: لاگ کامل وضعیت ارسال پیامک‌ها با قابلیت تلاش مجدد پیام‌های ناموفق.

