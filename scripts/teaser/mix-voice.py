"""میکس گویندگی + موسیقی تیزر هفتم.
هر خط در زمان t از script.json قرار می‌گیرد؛ اگر از جای خودش بلندتر باشد، بدون تغییر زیر و بمی کمی تند می‌شود (حداکثر ۱٫۳ برابر).
موسیقی زیر صدای گوینده پایین می‌آید (داکینگ) و صدای گوینده پردازش می‌شود (فیلتر، حضور، فشرده‌سازی، کمی ریورب).
اجرا: python3 scripts/teaser/mix-voice.py MUSIC.wav VOICE_DIR OUT.mp3
"""
import json, os, subprocess, sys, tempfile, wave
import numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
music_path, vdir, out = sys.argv[1:4]
SC = json.load(open(os.path.join(ROOT, 'public/teaser7/script.json'), encoding='utf-8'))
SR = 44100

def read(path):
    with wave.open(path) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), '<i2').astype(np.float64) / 32768
    x = x.reshape(-1, ch).mean(1) if ch > 1 else x
    if sr != SR: x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x)
    return x
def fft_filter(x, lo=None, hi=None, bell=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if bell: fc, gain, q = bell; g *= 1 + (10 ** (gain / 20) - 1) * np.exp(-((np.log2(np.maximum(f, 1) / fc)) * q) ** 2)
    return np.fft.irfft(X * g, len(x))
def tempo(path, factor):
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-filter:a', f'atempo={factor:.3f}', '-ar', str(SR), '-ac', '1', tmp], check=True)
    return read(tmp)

with wave.open(music_path) as w:
    m = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64).reshape(-1, 2) / 32768
N = len(m); voice = np.zeros(N)
for l in SC['lines']:
    p = os.path.join(vdir, l['id'] + '.wav')
    if not os.path.exists(p): print('missing', l['id']); continue
    v = read(p); nz = np.nonzero(np.abs(v) > .01)[0]
    if len(nz): v = v[max(0, nz[0] - 400): nz[-1] + 2000]                      # trim silence
    slot = (l['end'] - l['t'] - .15) * SR
    if len(v) > slot:
        f = min(1.3, len(v) / slot); v = tempo(p, f); nz = np.nonzero(np.abs(v) > .01)[0]
        if len(nz): v = v[max(0, nz[0] - 400): nz[-1] + 2000]
        print(f"{l['id']}: sped up ×{f:.2f}")
    # voice processing: rumble cut, warmth, presence, de-harsh, gentle compression, normalize
    v = fft_filter(v, lo=90, hi=12000, bell=(180, 2.0, 1.2)); v = fft_filter(v, bell=(3200, 4.0, 1.0))
    v = v / (np.max(np.abs(v)) + 1e-9); v = np.tanh(v * 2.2) / np.tanh(2.2)
    i = int(l['t'] * SR); v = v[: N - i]; voice[i:i + len(v)] += v
# small room on the voice
n = int(.9 * SR); t = np.arange(n) / SR; rng = np.random.default_rng(5)
ir = fft_filter(rng.standard_normal(n) * np.exp(-t * 7), lo=300, hi=6000); ir /= np.sqrt(np.sum(ir ** 2))
size = 1 << (N + n).bit_length(); wet = np.fft.irfft(np.fft.rfft(voice, size) * np.fft.rfft(ir, size), size)[:N]
vox = voice + wet * .12
# ducking envelope from voice level
lvl = np.abs(voice); k = int(.25 * SR); env = np.convolve(lvl, np.ones(k) / k, 'same'); env = np.clip(env / (env.max() + 1e-9) * 6, 0, 1)
duck = 1 - .62 * env
mix = m * duck[:, None] + vox[:, None] * .85
mix /= np.max(np.abs(mix)) + 1e-9; mix *= .95
tmpw = tempfile.mktemp(suffix='.wav')
with wave.open(tmpw, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmpw, '-b:a', '192k', out], check=True)
print('wrote', out)
