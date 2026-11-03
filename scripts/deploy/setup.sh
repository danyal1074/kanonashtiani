#!/usr/bin/env bash
# اسکریپت راه‌اندازی خودکار سامانه روی اوبونتو/دبیان
# دامنه: kanonashtiani.ir
set -e

echo "=== ۱. به‌روزرسانی بسته‌ها و نصب پیش‌نیازها ==="
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw

echo "=== ۲. نصب Node.js 24 (مخزن رسمی NodeSource) ==="
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 22 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt install -y nodejs
fi
echo "نسخه Node.js: $(node -v)"

echo "=== ۳. آماده‌سازی مسیر پروژه در /srv/roshd ==="
mkdir -p /srv/roshd /srv/roshd/data /srv/roshd/uploads

echo "=== ۴. تنظیم سرویس Systemd ==="
cp scripts/deploy/roshd.service /etc/systemd/system/roshd.service
systemctl daemon-reload
systemctl enable roshd
systemctl restart roshd

echo "=== ۵. تنظیم وب‌سرور Nginx ==="
cp scripts/deploy/kanonashtiani.ir.conf /etc/nginx/sites-available/kanonashtiani.ir
ln -sf /etc/nginx/sites-available/kanonashtiani.ir /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "=== ۶. باز کردن پورت‌های فایروال ==="
ufw allow 'Nginx Full'
ufw allow OpenSSH
ufw --force enable

echo "=== ۷. دریافت گواهی امنیتی SSL رایگان (HTTPS) ==="
echo "توجه: مطمئن شوید رکورد DNS دامنه kanonashtiani.ir به آی‌پی این سرور متصل شده باشد."
read -p "آیا می‌خواهید گواهی SSL همین الان صادر شود؟ (y/n): " get_ssl
if [[ "$get_ssl" == "y" || "$get_ssl" == "Y" ]]; then
    certbot --nginx -d kanonashtiani.ir -d www.kanonashtiani.ir --non-interactive --agree-tos --register-unsafely-without-email --redirect
    systemctl reload nginx
    echo "✅ پروتکل HTTPS فعال شد!"
fi

echo "=== ۸. تنظیم پشتیبان‌گیری خودکار روزانه (Cron) ==="
(crontab -l 2>/dev/null | grep -v 'roshd'; echo "0 3 * * * cd /srv/roshd && node scripts/backup.js >> /var/log/roshd-backup.log 2>&1") | crontab -

echo ""
echo "🎉 سامانه رشد نخبه با موفقیت برای دامنه kanonashtiani.ir راه‌اندازی شد!"
