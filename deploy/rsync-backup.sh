#!/usr/bin/env bash
# نسخه بیرونی از پشتیبان‌ها و فایل‌های بارگذاری‌شده (روی همان سرور بمانند، پشتیبان واقعی نیستند).
# crontab:  30 3 * * *  /srv/roshd/deploy/rsync-backup.sh
set -euo pipefail
DEST="${1:-backup-user@backup-host:/backups/roshd}"
rsync -a --delete /srv/roshd/data/backups/ "$DEST/db/"
rsync -a /srv/roshd/uploads/ "$DEST/uploads/"
