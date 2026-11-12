"""گویندگی تیزر هفتم با Piper (موتور متن‌به‌گفتار آفلاین).
هر خط public/teaser7/script.json را جداگانه می‌سازد: <out_dir>/<id>.wav
پیش‌نیاز:  pip install piper-tts  و یک مدل فارسی (مثلاً fa_IR-gyro-medium.onnx + .onnx.json)
اجرا:      python3 scripts/teaser/make-voice.py MODEL.onnx OUT_DIR [length_scale]
اگر گوینده‌ی انسانی دارید، به‌جای این اسکریپت فایل‌های <id>.wav را خودتان در OUT_DIR بگذارید.
"""
import json, os, subprocess, sys
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
model, out_dir = sys.argv[1], sys.argv[2]
length_scale = sys.argv[3] if len(sys.argv) > 3 else '0.92'      # کمی تندتر = پرانرژی‌تر
os.makedirs(out_dir, exist_ok=True)
lines = json.load(open(os.path.join(ROOT, 'public/teaser7/script.json'), encoding='utf-8'))['lines']
for l in lines:
    out = os.path.join(out_dir, l['id'] + '.wav')
    subprocess.run([sys.executable, '-m', 'piper', '-m', model, '-f', out, '--length-scale', length_scale,
                    '--noise-scale', '0.75', '--noise-w-scale', '0.9'], input=l['say'].encode('utf-8'), check=True)
    print('voice', l['id'], l['say'])
