#!/usr/bin/env bash
# استقرار نسخهٔ دمو روی demo.kanonashtiani.ir — کاملاً جدا از سامانهٔ اصلی.
#   مسیر: /srv/roshd-demo  •  پورت داخلی: 3001  •  سرویس: roshd-demo  •  دیتابیس جدا با دادهٔ نمونه
# سامانهٔ اصلی (/srv/roshd، پورت 3000، سرویس roshd) و دیتابیس آن لمس نمی‌شوند.
#
# اجرا روی سرور (با کاربر root):
#   curl -fsSL https://raw.githubusercontent.com/danyal1074/kanonashtiani/claude/zealous-noether-ywiqoi/scripts/deploy/demo/deploy-demo.sh -o /tmp/deploy-demo.sh
#   bash /tmp/deploy-demo.sh                 # اولین بار یا به‌روزرسانی (دادهٔ دمو حفظ می‌شود)
#   RESEED=1 bash /tmp/deploy-demo.sh        # بازسازی دادهٔ نمونهٔ دمو از صفر
set -euo pipefail

REPO="${REPO:-https://github.com/danyal1074/kanonashtiani.git}"
BRANCH="${BRANCH:-claude/zealous-noether-ywiqoi}"
DOMAIN="${DOMAIN:-demo.kanonashtiani.ir}"
APP=/srv/roshd-demo
PORT=3001

[[ $EUID -eq 0 ]] || { echo "با کاربر root اجرا کنید"; exit 1; }
[[ "$APP" != "/srv/roshd" ]] || { echo "مسیر دمو نباید مسیر سامانهٔ اصلی باشد"; exit 1; }
command -v node >/dev/null && [[ $(node -v | cut -d. -f1 | tr -d v) -ge 22 ]] || { echo "Node.js 22+ لازم است (scripts/deploy/setup.sh)"; exit 1; }

echo "=== ۱. دریافت کد شاخهٔ $BRANCH ==="
id -u roshd &>/dev/null || useradd -r -s /usr/sbin/nologin -d /srv/roshd -M roshd
mkdir -p "$APP/data" "$APP/uploads"
if [[ -d "$APP/app/.git" ]]; then
  git -C "$APP/app" fetch --depth 1 origin "$BRANCH"
  git -C "$APP/app" checkout -q -B demo FETCH_HEAD
else
  git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$APP/app"
fi
echo "نسخه: $(git -C "$APP/app" log -1 --format='%h %s')"

echo "=== ۲. پشتیبان دادهٔ دمو (در صورت وجود) ==="
if [[ -f "$APP/data/roshd.db" ]]; then
  ts=$(date +%Y%m%d-%H%M%S)
  node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$APP/data/roshd.db');d.exec(\"VACUUM INTO '$APP/data/backup-$ts.db'\")"
  echo "پشتیبان: $APP/data/backup-$ts.db"
fi

echo "=== ۳. دادهٔ نمونه ==="
chown -R roshd:roshd "$APP"
if [[ ! -f "$APP/data/roshd.db" || "${RESEED:-0}" == "1" ]]; then
  systemctl stop roshd-demo 2>/dev/null || true
  (cd "$APP/app" && sudo -u roshd env ROSHD_DATA_DIR="$APP/data" ROSHD_UPLOAD_DIR="$APP/uploads" node server/seed.js)
  SEEDED=1
fi

echo "=== ۴. سرویس roshd-demo ==="
cat > /etc/systemd/system/roshd-demo.service <<EOF
[Unit]
Description=Roshd Elite Platform — DEMO ($DOMAIN)
After=network.target

[Service]
WorkingDirectory=$APP/app
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
User=roshd
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=ROSHD_HOST=127.0.0.1
Environment=ROSHD_TRUST_PROXY=1
Environment=ROSHD_COOKIE_SECURE=1
Environment=ROSHD_DATA_DIR=$APP/data
Environment=ROSHD_UPLOAD_DIR=$APP/uploads
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$APP/data $APP/uploads

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q roshd-demo
systemctl restart roshd-demo
for i in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 1; done
curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null || { journalctl -u roshd-demo -n 40 --no-pager; echo "سرویس دمو بالا نیامد"; exit 1; }

if [[ "${SEEDED:-0}" == "1" ]]; then
  echo "=== ۴ب. نمونه‌محتوای قابلیت‌های جدید (مشاور، بوفه، بانک سؤال) ==="
  (cd "$APP/app" && DEMO_BASE="http://127.0.0.1:$PORT" node scripts/deploy/demo/demo-content.mjs) || echo "هشدار: نمونه‌محتوا ساخته نشد (دمو بدون آن هم کار می‌کند)"
fi

echo "=== ۵. Nginx و گواهی SSL ==="
cat > "/etc/nginx/sites-available/$DOMAIN" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        add_header X-Robots-Tag "noindex, nofollow" always;
        client_max_body_size 50M;
        proxy_read_timeout 300s;
    }
}
EOF
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl reload nginx
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect \
    || echo "هشدار: گواهی صادر نشد؛ رکورد DNS دامنهٔ $DOMAIN را بررسی و دوباره اجرا کنید"
else
  certbot --nginx -d "$DOMAIN" --non-interactive --reinstall --redirect >/dev/null 2>&1 || true
fi
systemctl reload nginx

echo ""
echo "✅ دمو آماده است: https://$DOMAIN  (رمز همهٔ حساب‌های نمونه: 123456)"
echo "   سامانهٔ اصلی دست‌نخورده ماند: $(systemctl is-active roshd 2>/dev/null || echo 'نصب نیست')"
