import paramiko
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

SERVER_IP = '89.46.217.44'
USER = 'root'
PASSWORD = 'tHvlla30dagZlpF8'
REMOTE_PATH = '/var/www/kanonashtiani'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

for attempt in range(1, 4):
    try:
        print(f"Connecting to {SERVER_IP} (attempt {attempt})...")
        client.connect(SERVER_IP, port=22, username=USER, password=PASSWORD, timeout=25, look_for_keys=False, allow_agent=False)
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
    return stdout.channel.recv_exit_status()

# 1. Symlink extracted_pages if not present
run_cmd(f"if [ ! -d '{REMOTE_PATH}/public/extracted_pages' ]; then ln -s /var/www/roshd/backend/public/extracted_pages {REMOTE_PATH}/public/extracted_pages; echo 'Symlinked extracted_pages'; fi")
run_cmd(f"ls -ld {REMOTE_PATH}/public/extracted_pages")

# 2. Git fetch and checkout/pull
run_cmd(f"cd {REMOTE_PATH} && git fetch origin && git checkout ag/legacy-features && git pull origin ag/legacy-features")

# 3. Ensure PyMuPDF is installed and python symlink exists
run_cmd("if [ ! -f /usr/bin/python ]; then ln -s /usr/bin/python3 /usr/bin/python; fi")
run_cmd("python3 -c 'import fitz; print(\"PyMuPDF is ready:\", fitz.__file__)'")

# 4. Copy sample PDF to data/barpa_sample.pdf on server if not present
run_cmd(f"mkdir -p {REMOTE_PATH}/data && if [ ! -f '{REMOTE_PATH}/data/barpa_sample.pdf' ] && [ -f '/var/www/roshd/uploads/barpa_sample.pdf' ]; then cp /var/www/roshd/uploads/barpa_sample.pdf {REMOTE_PATH}/data/barpa_sample.pdf; echo 'Copied sample PDF'; fi")

# 5. Run smoke test on server
run_cmd(f"cd {REMOTE_PATH} && node scripts/smoke.mjs")

# 6. Restart systemd service
run_cmd("systemctl restart kanonashtiani.service")
run_cmd("systemctl status kanonashtiani.service --no-pager")

client.close()
print("\nDeployment completed successfully!")
