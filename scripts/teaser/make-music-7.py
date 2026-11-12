"""موسیقی تیزر هفتم «آغاز تازه» — بستر تریلری برای گویندگی: پیانوی تعلیق، استاکاتوی زهی، طبل‌های بزرگ،
ضربه روی هر واژه‌ی کلیدی، سکوت پیش از اوج و ضربه‌ی پایانی. زمان‌ها از public/teaser7/script.json خوانده می‌شود.
"""
import numpy as np, wave, sys, json, os
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SC = json.load(open(os.path.join(ROOT, 'public/teaser7/script.json'), encoding='utf-8'))
SR = 44100; DUR = float(SC['duration']); N = int(SR * DUR)
HITS = [l['t'] for l in SC['lines'] if l.get('hit')]            # 12.8 15 17.2 19.4 28.2 34.2
rng = np.random.default_rng(77)
L = np.zeros(N); R = np.zeros(N); send = np.zeros(N)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def add(sig, t0, g=1.0, pan=0.0, rev=0.0):
    i = int(t0 * SR)
    if i >= N or i < 0: return
    sig = sig[: N - i]; l = np.cos((pan + 1) * np.pi / 4) * 1.414; r = np.sin((pan + 1) * np.pi / 4) * 1.414
    L[i:i+len(sig)] += sig * g * l; R[i:i+len(sig)] += sig * g * r
    if rev: send[i:i+len(sig)] += sig * g * rev
def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X * g, len(x))
def noise(d): return rng.standard_normal(int(d * SR))
def saw(f, d, cutoff=3000, detune=(0,)):
    t = tt(d); out = np.zeros_like(t)
    for dt in detune:
        ff = f * 2 ** (dt / 1200); ph = rng.uniform(0, 6.28); k = 1
        while k * ff < min(cutoff * 2.5, 15000) and k < 70:
            out += np.sin(2*np.pi*k*ff*t + ph*k) / k / (1 + (k * ff / cutoff) ** 2); k += 1
    return out / np.sqrt(len(detune))
def env(d, a=.01, r=.1):
    n = int(d * SR); e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, min(n, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e
def piano(m, d=2.5, v=1.0):
    f = midi(m); t = tt(d); s = sum(a * np.sin(2*np.pi*f*k*t) * np.exp(-t * (1.3 + k * .6)) for k, a in ((1, 1), (2, .4), (3, .2), (4, .1)))
    return s * np.minimum(1, t / .003) * v
def stacc(m, d=.14): return saw(midi(m), d, cutoff=3200, detune=(-8, 0, 8)) * env(d, .004, .06)
def pad(ch, d, cutoff=1400): return sum(saw(midi(m), d, cutoff=cutoff, detune=(-9, 0, 9)) for m in ch) * env(d, min(1.2, d / 3), min(1.2, d / 3))
def kick(big=False):
    t = tt(.6); s = np.sin(2*np.pi*np.cumsum(40 + (150 if big else 110) * np.exp(-t * 28))/SR) * np.exp(-t * (4 if big else 7))
    return np.tanh(s * 1.7)
def tom(f=90): t = tt(.6); return np.sin(2*np.pi*np.cumsum(f * (1 + .5 * np.exp(-t * 18)))/SR) * np.exp(-t * 6) + fft_filter(noise(.6), hi=2000) * np.exp(-t * 28) * .3
def snare(d=.2): t = tt(d); return fft_filter(noise(d), lo=900, hi=9000) * np.exp(-t * 17) + np.sin(2*np.pi*190*t) * np.exp(-t * 25) * .5
def tick(): t = tt(.03); return fft_filter(noise(.03), lo=3000, hi=9000) * np.exp(-t * 150)
def impact(d=4.0):
    t = tt(d); boom = np.sin(2*np.pi*np.cumsum(30 + 80 * np.exp(-t * 5))/SR) * np.exp(-t * 1.4)
    return np.tanh(boom * 2) + fft_filter(noise(d), hi=2500) * np.exp(-t * 4) * .45 + fft_filter(noise(d), lo=4500) * np.exp(-t * 2) * .3
def braam(root, d=2.5):
    t = tt(d); s = sum(g * saw(midi(m), d, cutoff=1500, detune=(-12, 0, 11)) for m, g in ((root, 1), (root + 12, .8), (root + 19, .5)))
    w = np.exp(-t * 2); return np.tanh((s * w + fft_filter(s, hi=280) * (1 - w)) * 1.3) * env(d, .02, 1.0)
def whoosh(d=.5):
    t = tt(d); n = noise(d); out = np.zeros_like(n); blk = 1024
    for i in range(0, len(n), blk // 2):
        p = i / len(n); seg = fft_filter(n[i:i+blk] * np.hanning(len(n[i:i+blk])), lo=300 + 3000 * p, hi=1500 + 8000 * p); out[i:i+len(seg)] += seg
    return out * np.sin(np.pi * t / d) ** 2 * 1.3
def riser(d):
    n = int(d * SR); out = np.zeros(n); blk = 2048; nz = noise(d + .1)
    for i in range(0, n, blk // 2):
        p = i / n; seg = fft_filter(nz[i:i+blk] * np.hanning(blk), lo=300 * (1 + p * 8), hi=900 * (1 + p * 14)); out[i:i+blk] += seg[: len(out[i:i+blk])] * (.15 + p ** 2)
    t = np.arange(n) / SR; return out + np.sin(2*np.pi*np.cumsum(180 * 2 ** (2.4 * (t / d) ** 1.5))/SR) * (t / d) ** 2 * .25
def rev_swell(d=1.2): t = tt(d); return fft_filter(noise(d), lo=500, hi=9000) * (t / d) ** 4

BEAT = .6   # 100 BPM
# ---- 0–12.6: question section: piano ostinato + low pad + ticks ----
add(pad([38, 45, 50], 12.8, cutoff=700), 0.3, .05, rev=.6)
osti = [62, 69, 65, 69]
for i in range(20):
    add(piano(osti[i % 4] + (0 if i < 8 else 2 if i < 14 else 3), 1.6, .7), .8 + i * BEAT, .14, pan=.2 * ((-1) ** i), rev=.5)
for i in range(21): add(tick(), .8 + i * BEAT, .05 + .1 * i / 21, pan=.3, rev=.2)
add(pad([46, 53, 58], 4.4, cutoff=1100), 8.2, .045, rev=.6)
add(rev_swell(1.4), 12.8 - 1.4, .35, rev=.3)
# ---- 12.8–25.2: four keywords + «همه در یک‌جا» ----
CH = [[50, 57, 62], [46, 53, 58], [43, 50, 55], [45, 52, 57]]   # Dm Bb Gm A
for k, h in enumerate(HITS[:4]):
    add(impact(2.2), h, .55, rev=.4); add(braam([38, 34, 31, 33][k], 2.1), h, .25, rev=.4); add(whoosh(.45), h - .42, .3, pan=(-1) ** k * .3)
    add(pad(CH[k], 2.3, cutoff=1800), h, .05, rev=.5)
    for b in range(int(2.2 / (BEAT / 2))):
        st = h + b * BEAT / 2
        add(stacc(CH[k][b % 3] + 12), st, .06, pan=.3 * np.sin(b), rev=.25)
        if b % 2 == 0: add(tom(80 + (b % 4) * 15), st + BEAT / 4, .25, rev=.2)
t0 = 21.8
for b in range(int((25.2 - t0) / (BEAT / 2))):
    st = t0 + b * BEAT / 2; ch = [[53, 57, 60], [50, 53, 57]][b // 6 % 2]
    add(stacc(ch[b % 3] + 12), st, .07, rev=.25); add(stacc(ch[b % 3]), st, .05, rev=.25)
    if b % 2 == 0: add(kick(), st, .55)
    if b % 4 == 2: add(snare(), st, .35, rev=.3)
add(pad([41, 48, 53, 57], 3.6, cutoff=2400), t0, .06, rev=.6)
add(impact(2.0), t0, .35, rev=.4)
# ---- 25.2–28.2: «و حالا…» riser, roll, silence ----
add(riser(2.5), 25.2, .5, rev=.3)
t = 25.4
while t < 27.7:
    p = (t - 25.4) / 2.3; add(snare(.15), t, .12 + .4 * p ** 1.5, rev=.2); t += .3 if p < .4 else .15 if p < .75 else .075
# ---- 28.2: big hit + epic section ----
add(impact(5.0), 28.2, 1.0, rev=.6); add(braam(38, 3.0), 28.2, .4, rev=.5)
EPIC = [[50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 53, 57]]
for k, ch in enumerate(EPIC):
    st0 = 28.2 + k * 1.2
    add(pad(ch, 1.4, cutoff=3200), st0, .07, rev=.5)
    for b in range(4):
        st = st0 + b * .3; add(stacc(ch[b % 4] + 12), st, .08, rev=.25)
        if b % 2 == 0: add(kick(big=b == 0), st, .6); add(tom(70 + b * 10), st + .15, .3)
add(pad([45, 52, 57, 61], 2.5, cutoff=1600), 31.5, .05, rev=.6)          # suspense under the center's name
add(rev_swell(1.4), 34.2 - 1.4, .45, rev=.3)
# ---- 34.2: final hit ----
add(impact(4.8), 34.2, 1.0, rev=.7); add(braam(38, 4.0), 34.2, .45, rev=.6)
add(pad([50, 57, 62, 65, 69], 4.8, cutoff=2600) * np.exp(-tt(4.8) * .5), 34.2, .07, rev=.7)
for i, m in enumerate([74, 77, 81, 86]): add(piano(m, 3, .8), 34.5 + i * .25, .14, pan=(i - 1.5) * .3, rev=.7)

def reverb(x, seconds=2.6, seed=1):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = fft_filter(r.standard_normal(n) * np.exp(-t * 6 / seconds), lo=200, hi=7000); ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 1).bit_length(); return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
L += reverb(send, seed=1) * .85; R += reverb(send, seed=2) * .85
tN = np.arange(N) / SR; gap = (tN >= 27.7) & (tN < 28.2); L[gap] *= .03; R[gap] *= .03
mix = np.stack([fft_filter(L, lo=28), fft_filter(R, lo=28)], 1)
mix /= np.max(np.abs(mix)) + 1e-9; mix = np.tanh(mix * 1.5) / np.tanh(1.5)
fade = np.ones(N); fn = int(1.5 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * .93
out = sys.argv[1] if len(sys.argv) > 1 else 'music7.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
