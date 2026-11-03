import os
import re
import sys
import time
import paramiko

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# تنظیمات اتصال و استقرار فقط از متغیرهای محیطی خوانده می‌شوند (عدم درج رمز یا آی‌پی در مخزن)
SERVER_IP = os.environ.get('ROSHD_DEPLOY_IP') or os.environ.get('DEPLOY_HOST')
USER = os.environ.get('ROSHD_DEPLOY_USER') or os.environ.get('DEPLOY_USER', 'root')
PASSWORD = os.environ.get('ROSHD_DEPLOY_PASSWORD') or os.environ.get('DEPLOY_PASSWORD')
KEY_PATH = os.environ.get('ROSHD_DEPLOY_KEY') or os.environ.get('DEPLOY_KEY')
PORT = int(os.environ.get('ROSHD_DEPLOY_PORT') or os.environ.get('DEPLOY_PORT', '22'))
REMOTE_PATH = os.environ.get('ROSHD_REMOTE_PATH', '/var/www/kanonashtiani')
DEPLOY_REF = os.environ.get('ROSHD_DEPLOY_REF') or os.environ.get('DEPLOY_REF', 'main')

if not SERVER_IP:
    print("خطا: آدرس سرور در متغیر محیطی ROSHD_DEPLOY_IP یا DEPLOY_HOST تنظیم نشده است.", file=sys.stderr)
    sys.exit(1)

if not PASSWORD and not KEY_PATH:
    print("خطا: برای احراز هویت باید رمز (ROSHD_DEPLOY_PASSWORD) یا مسیر کلید SSH (ROSHD_DEPLOY_KEY) تنظیم شود.", file=sys.stderr)
    sys.exit(1)

# استقرار فقط از شاخه main یا برچسب نسخه مجاز است (نه از شاخه‌های در حال توسعه)
is_main = DEPLOY_REF == 'main'
is_tag = bool(re.match(r'^v\d+(\.\d+)*(-[a-zA-Z0-9.]+)?$', DEPLOY_REF))
if not (is_main or is_tag):
    print(f"خطای امنیتی استقرار: استقرار فقط از شاخه 'main' یا یک تگ نسخه (مانند v1.0.0) مجاز است. مرجع فعلی: {DEPLOY_REF}", file=sys.stderr)
    sys.exit(1)

client = paramiko.SSHClient()
client.load_system_host_keys()
client.set_missing_host_key_policy(paramiko.RejectPolicy())

connect_kwargs = {
    'hostname': SERVER_IP,
    'port': PORT,
    'username': USER,
    'timeout': 25,
    'look_for_keys': False,
    'allow_agent': False
}
if KEY_PATH:
    connect_kwargs['key_filename'] = KEY_PATH
if PASSWORD:
    connect_kwargs['password'] = PASSWORD

for attempt in range(1, 4):
    try:
        print(f"Connecting to {SERVER_IP}:{PORT} (attempt {attempt})...")
        client.connect(**connect_kwargs)
        print("Connected successfully!")
        break
    except Exception as e:
        print(f"Attempt {attempt} failed: {e}")
        time.sleep(3)
else:
    print("Failed to connect after 3 attempts.")
    sys.exit(1)

def run_cmd(cmd):
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("STDERR:", err)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(f"Command failed with exit code: {code}")
    return code

try:
    # ۱. قبل از git pull روی سرور نسخه پشتیبان تهیه شود
    print("\n--- تهیه نسخه پشتیبان پیش از اعمال تغییرات جدید ---")
    run_cmd(f"cd {REMOTE_PATH} && npm run backup")

    # ۲. به‌روزرسانی کدها به مرجع مجاز (main یا تگ نسخه)
    print(f"\n--- دریافت و به‌روزرسانی به مرجع {DEPLOY_REF} ---")
    run_cmd(f"cd {REMOTE_PATH} && git fetch --all --tags")
    if is_tag:
        run_cmd(f"cd {REMOTE_PATH} && git checkout {DEPLOY_REF}")
    else:
        run_cmd(f"cd {REMOTE_PATH} && git checkout main && git pull origin main")

    # ۳. اطمینان از پیش‌نیازهای پایتون
    run_cmd("if [ ! -f /usr/bin/python ]; then ln -s /usr/bin/python3 /usr/bin/python; fi")
    run_cmd("python3 -c 'import fitz; print(\"PyMuPDF is ready:\", fitz.__file__)'")

    # ۴. حذف پوشه ایستا/سیم‌لینک منسوخ شده extracted_pages از وب عمومی
    run_cmd(f"rm -rf {REMOTE_PATH}/public/extracted_pages")

    # ۵. اجرای تست‌های دودی روی سرور
    print("\n--- اجرای تست‌های سلامت و دود سنجی روی سرور ---")
    smoke_status = run_cmd(f"cd {REMOTE_PATH} && npm run smoke")
    if smoke_status != 0:
        print("هشدار: تست‌های smoke با خطا مواجه شدند!")
        sys.exit(1)

    # ۶. راه‌اندازی مجدد سرویس سیستم‌دی
    print("\n--- بازنشانی سرویس و بررسی وضعیت ---")
    run_cmd("systemctl restart kanonashtiani.service")
    run_cmd("systemctl status kanonashtiani.service --no-pager")

    print("\nDeployment completed successfully!")
finally:
    client.close()
