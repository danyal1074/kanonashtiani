"""آپلود تصاویر کتاب‌ها به سرور با ادامه خودکار پس از قطع اتصال.

اجرا:  python scripts/upload_books.py
رمز SSH سرور هنگام اجرا از شما پرسیده می‌شود (ذخیره یا چاپ نمی‌شود).
فقط فایل‌هایی که روی سرور نیستند یا اندازه‌شان فرق دارد فرستاده می‌شوند؛ هر چند بار قطع شود، دوباره وصل می‌شود.
"""
import getpass
import os
import sys
import time

import paramiko

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HOST = os.environ.get('ROSHD_DEPLOY_IP', '89.46.217.44')
USER = os.environ.get('ROSHD_DEPLOY_USER', 'root')
REMOTE = os.environ.get('ROSHD_REMOTE_BOOKS_DIR', '/var/www/kanonashtiani/data/books')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = os.path.join(ROOT, 'data', 'books')
BOOKS = ('hoosh_6', 'hoosh_8_9')

password = getpass.getpass(f'رمز SSH برای {USER}@{HOST}: ')


def connect():
    c = paramiko.SSHClient()
    c.load_system_host_keys()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=password, timeout=30, look_for_keys=False, allow_agent=False,
              banner_timeout=30, auth_timeout=30)
    c.get_transport().set_keepalive(15)
    return c


client = connect()
print('وصل شد.')

for book in BOOKS:
    local_dir = os.path.join(LOCAL, book)
    remote_dir = f'{REMOTE}/{book}'
    files = sorted(f for f in os.listdir(local_dir) if f.endswith('.jpg'))
    client.exec_command(f"mkdir -p '{remote_dir}'")[1].channel.recv_exit_status()
    sent = 0
    while True:
        try:
            sftp = client.open_sftp()
            have = {a.filename: a.st_size for a in sftp.listdir_attr(remote_dir)}
            todo = [f for f in files if have.get(f) != os.path.getsize(os.path.join(local_dir, f))]
            print(f'{book}: {len(files) - len(todo)}/{len(files)} آماده، {len(todo)} مانده')
            for i, name in enumerate(todo, 1):
                sftp.put(os.path.join(local_dir, name), f'{remote_dir}/{name}')
                sent += 1
                if i % 25 == 0:
                    print(f'  {i}/{len(todo)}')
            sftp.close()
            break
        except Exception as e:
            print(f'اتصال قطع شد ({e}); دوباره وصل می‌شوم...')
            time.sleep(3)
            try:
                client.close()
            except Exception:
                pass
            client = connect()

client.exec_command(f"chmod -R a+rX '{REMOTE}'")[1].channel.recv_exit_status()
print('تمام شد. همهٔ تصاویر روی سرور هستند.')
client.close()
