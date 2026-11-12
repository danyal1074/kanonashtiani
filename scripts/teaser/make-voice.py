"""گویندگی تیزر هفتم با Piper (موتور متن‌به‌گفتار آفلاین) و انتخاب بهترین «برداشت».
- هر خط public/teaser7/script.json جداگانه ساخته می‌شود: <out_dir>/<id>.wav
- «|» در متن = مکث نمایشی (هر تکه جدا ساخته و با سکوت وصل می‌شود).
- «groups»: چند خط پشت‌سرهم یک جمله‌ی کامل خوانده می‌شوند (لحن طبیعی) و بعد از محل مکث‌ها بریده می‌شوند.
- از هر تکه چند برداشت ساخته می‌شود؛ اگر faster-whisper نصب باشد، هر برداشت بازشناسی و با متن مقایسه می‌شود
  و دقیق‌ترین برداشت (بدون تپق و غلط) انتخاب می‌شود. سپس صدا کمی زیرتر و تندتر می‌شود تا پرانرژی‌تر باشد.
اجرا:  python3 scripts/teaser/make-voice.py MODEL.onnx OUT_DIR [TAKES=6]
گوینده‌ی انسانی: فایل‌های <id>.wav را خودتان در OUT_DIR بگذارید و این مرحله را رد کنید.
"""
import difflib, json, os, re, subprocess, sys, tempfile, wave
import numpy as np
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
model, out_dir = sys.argv[1], sys.argv[2]
TAKES = int(sys.argv[3]) if len(sys.argv) > 3 else 6
LENGTH, PAUSE, PITCH, TEMPO = '1.0', 0.32, 1.045, 1.05
os.makedirs(out_dir, exist_ok=True)
SC = json.load(open(os.path.join(ROOT, 'public/teaser7/script.json'), encoding='utf-8'))
try:
    from faster_whisper import WhisperModel
    ASR = WhisperModel('turbo', device='cpu', compute_type='int8')
except Exception as e:
    ASR = None; print('بدون بازشناسی گفتار (فقط یک برداشت):', e)

def norm(s):
    s = re.sub(r'[ً-ْ‌\s،,.!؟?؛;…«»\-]', '', s)
    for a, b in (('ح', 'ه'), ('ذ', 'ز'), ('ض', 'ز'), ('ظ', 'ز'), ('ث', 'س'), ('ص', 'س'), ('ط', 'ت'), ('غ', 'ق'), ('آ', 'ا'), ('أ', 'ا'), ('إ', 'ا'), ('ؤ', 'و'), ('ي', 'ی'), ('ك', 'ک'), ('ة', 'ه')):
        s = s.replace(a, b)
    return s
def score(x, sr, text):
    if ASR is None: return 0.0
    y = np.interp(np.arange(int(len(x) * 16000 / sr)) * sr / 16000, np.arange(len(x)), x).astype(np.float32)
    segs, _ = ASR.transcribe(y, language='fa', beam_size=5)
    heard = ' '.join(s.text for s in segs)
    return difflib.SequenceMatcher(None, norm(heard), norm(text)).ratio()
def synth_once(text):
    f = tempfile.mktemp(suffix='.wav')
    subprocess.run([sys.executable, '-m', 'piper', '-m', model, '-f', f, '--length-scale', LENGTH, '--noise-scale', '0.667', '--noise-w-scale', '0.8', '--sentence-silence', '0.3'],
                   input=text.encode('utf-8'), check=True, capture_output=True)
    with wave.open(f) as w: sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64) / 32768
    nz = np.nonzero(np.abs(x) > .015)[0]
    return (x[max(0, nz[0] - 200): nz[-1] + 600] if len(nz) else x), sr
def best(text):
    takes = []
    for k in range(TAKES if ASR else 1):
        x, sr = synth_once(text); s = score(x, sr, text); takes.append((s, x, sr))
        if s >= .985: break
    s, x, sr = max(takes, key=lambda z: z[0]); print(f'   {s:.2f} ({len(takes)} برداشت)  {text}'); return x, sr
def save(x, sr, out):
    raw = tempfile.mktemp(suffix='.wav')
    with wave.open(raw, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', f'rubberband=pitch={PITCH}:tempo={TEMPO}:formant=preserved', '-ar', '44100', out], check=True)
def split_at_pauses(x, sr, n):
    """تقسیم یک جمله به n تکه در طولانی‌ترین سکوت‌ها"""
    hop = int(.01 * sr); e = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    quiet = e < .02; runs = []; i = 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]: j += 1
            if i > 5 and j < len(quiet) - 5: runs.append((j - i, (i + j) // 2))
            i = j
        else: i += 1
    cuts = sorted(c for _, c in sorted(runs, reverse=True)[: n - 1])
    b = [0] + [c * hop for c in cuts] + [len(x)]
    return [x[b[k]:b[k + 1]] for k in range(n)]

grouped = {}
for g in SC.get('groups', []):
    print('group', ' + '.join(g['ids']))
    x, sr = best(g['say'])
    for i, part in zip(g['ids'], split_at_pauses(x, sr, len(g['ids']))):
        nz = np.nonzero(np.abs(part) > .015)[0]; part = part[max(0, nz[0] - 200): nz[-1] + 600]
        save(part, sr, os.path.join(out_dir, i + '.wav')); grouped[i] = True
for l in SC['lines']:
    if l['id'] in grouped: continue
    print(l['id'])
    parts = [best(p.strip()) for p in l['say'].split('|')]
    sr = parts[0][1]; gap = np.zeros(int(PAUSE * sr))
    x = np.concatenate([np.concatenate([p, gap]) if i < len(parts) - 1 else p for i, (p, _) in enumerate(parts)])
    save(x, sr, os.path.join(out_dir, l['id'] + '.wav'))
print('done')
