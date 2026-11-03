#!/usr/bin/env bash
# بررسی خودکار ست شدن DNS زیردامنه panel و صدور گواهی SSL
IP=$(dig +short panel.kanonashtiani.ir @8.8.8.8 | tail -n1)
if [ "$IP" = "89.46.217.44" ]; then
    echo "$(date): DNS resolved to 89.46.217.44. Requesting SSL certificate for panel.kanonashtiani.ir..."
    certbot --nginx -d panel.kanonashtiani.ir --non-interactive --agree-tos --register-unsafely-without-email --redirect
    systemctl reload nginx
    # حذف خودکار اسکریپت از کران‌جاب بعد از موفقیت
    (crontab -l 2>/dev/null | grep -v 'auto-ssl.sh') | crontab -
    echo "$(date): SSL setup completed successfully."
else
    echo "$(date): DNS for panel.kanonashtiani.ir not yet propagated (current IP: $IP). Waiting for Irnic batch update..."
fi
