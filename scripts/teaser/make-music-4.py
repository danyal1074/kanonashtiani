"""موسیقی تیزر چهارم «قهرمان‌های کانون» — سرود حماسی و شاد ابرقهرمانی (۱۶۰ BPM، دو ماژور میکسولیدین).
کاملاً با numpy سنتز شده. زمان‌بندی با public/teaser4.html هماهنگ است (هر میزان ۱٫۵ ثانیه، هر قدرت ۳ ثانیه، کل ۴۳ ثانیه).
"""
import numpy as np, wave, sys

SR = 44100; DUR = 43.0; N = int(SR * DUR); BEAT = .375; BAR = 1.5
rng = np.random.default_rng(21)
L = np.zeros(N); R = np.zeros(N); send = np.zeros(N)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def add(sig, t0, g=1.0, pan=0.0, rev=0.0):
    i = int(t0 * SR)
    if i >= N or i < 0: return
    sig = sig[: N - i]; l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:i+len(sig)] += sig * g * l * 1.414; R[i:i+len(sig)] += sig * g * r * 1.414
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
        while k * ff < min(cutoff * 2.5, 15000) and k < 60:
            out += np.sin(2*np.pi*k*ff*t + ph*k) / k / (1 + (k * ff / cutoff) ** 2); k += 1
    return out / len(detune)
def env(d, a=.01, r=.1):
    n = int(d * SR); e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, min(n, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e

# ---- voices ----
def brass(m, d, bright=2600):
    t = tt(d); s = saw(midi(m), d, cutoff=bright, detune=(-7, 0, 7))
    dark = fft_filter(s, hi=bright * .35); w = np.minimum(1, t / .06)   # «بوااا» : تیره → روشن
    return np.tanh((dark * (1 - w) + s * w) * 1.3) * env(d, .02, .08)
def strings(m, d): return saw(midi(m), d, cutoff=2500, detune=(-10, 0, 9)) * env(d, .005, .05)
def bass(m, d): return np.tanh(saw(midi(m), d, cutoff=500) * 2.2) * env(d, .004, .04)
def kick():
    t = tt(.35); return np.tanh(np.sin(2*np.pi*np.cumsum(45 + 130*np.exp(-t*30))/SR) * np.exp(-t * 8) * 1.4)
def snare():
    t = tt(.22); return fft_filter(noise(.22), lo=1000, hi=9000) * np.exp(-t * 15) * .9 + np.sin(2*np.pi*200*t) * np.exp(-t * 22) * .5
def hat(o=False):
    t = tt(.2 if o else .05); return fft_filter(noise(len(t) / SR), lo=7000) * np.exp(-t * (15 if o else 80))
def tom(f):
    t = tt(.4); return np.sin(2*np.pi*np.cumsum(f * (1 + .6*np.exp(-t*20)))/SR) * np.exp(-t * 7) + fft_filter(noise(.4), hi=2500) * np.exp(-t * 30) * .3
def timpani(m):
    t = tt(1.2); f = midi(m)
    return (np.sin(2*np.pi*f*t) + .4*np.sin(2*np.pi*f*1.5*t) + .2*np.sin(2*np.pi*f*1.98*t)) * np.exp(-t * 3.5) + fft_filter(noise(1.2), hi=900) * np.exp(-t * 25) * .5
def crash(d=2.0): t = tt(d); return fft_filter(noise(d), lo=3500) * np.exp(-t * 2.2) * .7
def whoosh(d=.35):
    t = tt(d); n = noise(d); out = np.zeros_like(n); blk = 1024
    for i in range(0, len(n), blk // 2):
        p = i / len(n); seg = fft_filter(n[i:i+blk] * np.hanning(len(n[i:i+blk])), lo=300 + 2500 * p, hi=1200 + 7000 * p); out[i:i+len(seg)] += seg
    return out * np.sin(np.pi * t / d) ** 1.5 * 1.4
def pow_hit():
    t = tt(.9); boom = np.sin(2*np.pi*np.cumsum(38 + 120*np.exp(-t*18))/SR) * np.exp(-t * 5)
    return np.tanh(boom * 2) + fft_filter(noise(.9), lo=200, hi=6000) * np.exp(-t * 14) * .7
def siren(d=1.4):
    t = tt(d); f = 700 + 250 * np.sin(2*np.pi*1.4*t)
    return np.sign(np.sin(2*np.pi*np.cumsum(f)/SR)) * .25 * env(d, .05, .2) + np.sin(2*np.pi*np.cumsum(f)/SR) * .3 * env(d, .05, .2)

# ---- harmony (C mixolydian heroic: C Bb F C / C Bb F G) ----
CH = {'C': [36, 60, 64, 67], 'Bb': [34, 58, 62, 65], 'F': [41, 60, 65, 69], 'G': [43, 59, 62, 67], 'Am': [45, 60, 64, 69], 'Ab': [44, 60, 63, 68]}
# heroic theme (beat offset, midi, beats) — per 2-bar phrase
THEME = [[(0, 67, 1.5), (1.5, 72, .5), (2, 72, 1), (3, 74, .5), (3.5, 76, .5), (4, 77, 1.5), (5.5, 76, .5), (6, 74, 2)],
         [(0, 76, 1), (1, 74, .5), (1.5, 72, 1.5), (3, 70, 1), (4, 69, 1.5), (5.5, 70, .5), (6, 72, 2)]]
def groove_bar(bt, name, lvl=1.0, drums=True):
    ch = CH[name]
    for e in range(8):                     # 8ths
        st = bt + e * BEAT / 2
        add(bass(ch[0] + (12 if e % 4 == 3 else 0), BEAT / 2 - .01), st, .3 * lvl)
        for m in ch[1:]: add(strings(m - (0 if e % 2 else 12), BEAT / 2 - .02), st, .03 * lvl, pan=.3, rev=.2)
        if drums:
            if e % 2 == 0: add(kick(), st, .6 * lvl)
            if e in (2, 6): add(snare(), st, .5 * lvl, rev=.25)
            add(hat(e == 7), st, .12 * lvl, pan=.25)

# ---- intro 0–6 ----
add(siren(1.4), 0.05, .35, rev=.2)
for i in range(4): add(timpani(36), i * BAR, .45, rev=.3)
call = [(1.5, 67, .3), (1.875, 67, .3), (2.25, 72, 1.1)]           # «تا-تا-تااام»
for t0, m, d in call:
    for o in (0, -12, 4): add(brass(m + o, d), t0, .16, rev=.4)
add(crash(), 2.25, .35, rev=.3)
add(brass(65, 1.4), 3.0, .14, rev=.4); add(brass(70, 1.4), 3.0, .12, rev=.4); add(brass(74, 1.4), 3.0, .1, rev=.4)
t = 4.5
while t < 6 - .01:                                              # tom roll
    p = (t - 4.5) / 1.5; add(tom(120 - 50 * p), t, .25 + .4 * p, pan=.3 - .6 * p, rev=.2); t += .1875 if p < .5 else .09375
add(whoosh(.4), 6 - .38, .4)

# ---- features 6–30: 8 × (2 bars) ----
PROG = [('C', 'Bb'), ('F', 'C'), ('C', 'Bb'), ('F', 'G'), ('Am', 'F'), ('C', 'G'), ('Ab', 'Bb'), ('F', 'G')]
for k, (c1, c2) in enumerate(PROG):
    f0 = 6 + k * 3
    add(pow_hit(), f0, .55, rev=.3); add(crash(1.2), f0, .25, rev=.2)
    groove_bar(f0, c1); groove_bar(f0 + BAR, c2)
    for b0, m, ln in THEME[k % 2]:
        root_shift = {'C': 0, 'F': 0, 'Am': 0, 'Ab': -4, 'Bb': 0}.get(c1, 0) if k == 6 else 0
        add(brass(m + root_shift, ln * BEAT * .95), f0 + b0 * BEAT, .13, pan=-.15, rev=.35)
    if k < 7: add(whoosh(.35), f0 + 3 - .33, .35, pan=(-1) ** k * .4)

# ---- montage 30–33: stab on every beat ----
for i in range(8):
    st = 30 + i * BEAT
    for m in CH['C' if i < 4 else 'Bb'][1:]: add(brass(m, .2), st, .1, rev=.3)
    add(tom(140 - i * 10), st, .4, rev=.2); add(kick(), st, .5)
add(whoosh(.5), 33 - .48, .45)

# ---- reveal 33–42 ----
add(pow_hit(), 33, .8, rev=.5); add(crash(3.0), 33, .45, rev=.4); add(timpani(36), 33, .6, rev=.4)
REV = ['C', 'Bb', 'F', 'C', 'F', 'G']
for b, name in enumerate(REV): groove_bar(33 + b * BAR, name, lvl=1.1)
for ph in range(3):
    for b0, m, ln in THEME[ph % 2]:
        add(brass(m, ln * BEAT * .95), 33 + ph * 3 + b0 * BEAT, .15, rev=.4)
        add(brass(m - 12, ln * BEAT * .95), 33 + ph * 3 + b0 * BEAT, .08, rev=.4)
# ---- final hit 42 ----
for m in (48, 55, 60, 64, 67, 72): add(brass(m, 1.0), 42, .12, rev=.6)
add(pow_hit(), 42, .7, rev=.6); add(crash(1.0), 42, .4, rev=.5); add(timpani(36), 42, .6, rev=.5)

def reverb(x, seconds=2.0, seed=1):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = fft_filter(r.standard_normal(n) * np.exp(-t * 6 / seconds), lo=200, hi=7000); ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 1).bit_length(); return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
L += reverb(send, seed=1) * .8; R += reverb(send, seed=2) * .8
mix = np.stack([fft_filter(L, lo=30), fft_filter(R, lo=30)], 1)
mix /= np.max(np.abs(mix)) + 1e-9; mix = np.tanh(mix * 1.6) / np.tanh(1.6)
fade = np.ones(N); fn = int(.9 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * .93
out = sys.argv[1] if len(sys.argv) > 1 else 'music4.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
