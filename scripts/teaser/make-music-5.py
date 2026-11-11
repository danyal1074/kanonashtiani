"""موسیقی تیزر پنجم «رونمایی» — سینمایی و رسمی: پیانو، زهی‌ها، پالس آرام، اوج و ضربه‌ی پایانی.
کاملاً با numpy سنتز شده. زمان‌بندی با public/teaser5.html هماهنگ است (۹۰ BPM، کل ۴۲ ثانیه، ضربه در ۳۴ ثانیه).
"""
import numpy as np, wave, sys
SR = 44100; DUR = 42.0; N = int(SR * DUR); BEAT = 60 / 90
rng = np.random.default_rng(3)
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
def saw(f, d, cutoff=2000, detune=(0,)):
    t = tt(d); out = np.zeros_like(t)
    for dt in detune:
        ff = f * 2 ** (dt / 1200); ph = rng.uniform(0, 6.28); k = 1
        while k * ff < min(cutoff * 2.5, 14000) and k < 60:
            out += np.sin(2*np.pi*k*ff*t + ph*k) / k / (1 + (k * ff / cutoff) ** 2); k += 1
    return out / len(detune)
def env(d, a=.01, r=.1):
    n = int(d * SR); e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, min(n, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e

def piano(m, d=3.0, vel=1.0):
    f = midi(m); t = tt(d); s = np.zeros_like(t)
    for k, a in ((1, 1), (2, .45), (3, .22), (4, .12), (5, .07), (6, .04)):
        fk = f * k * (1 + .0004 * k * k); s += a * np.sin(2*np.pi*fk*t) * np.exp(-t * (1.1 + k * .55))
    ham = fft_filter(noise(.02), lo=1500) * .05
    s[:len(ham)] += ham
    return s * np.minimum(1, t / .003) * vel
def strings(chord, d, gain=1.0, cutoff=1600):
    s = np.zeros(int(d * SR))
    for m in chord: s += saw(midi(m), d, cutoff=cutoff, detune=(-8, 0, 7))
    return s * env(d, min(1.5, d / 3), min(1.5, d / 3)) * gain
def sub_pulse(f=55, d=.5):
    t = tt(d); return np.sin(2*np.pi*f*t) * np.exp(-t * 7) * np.minimum(1, t / .005)
def tick():
    t = tt(.03); return fft_filter(noise(.03), lo=3000, hi=9000) * np.exp(-t * 150)
def riser(d):
    n = int(d * SR); out = np.zeros(n); blk = 2048; nz = noise(d + .1)
    for i in range(0, n, blk // 2):
        p = i / n; seg = fft_filter(nz[i:i+blk] * np.hanning(blk), lo=200 * (1 + p * 10), hi=600 * (1 + p * 20)); out[i:i+blk] += seg[: len(out[i:i+blk])] * (p ** 2)
    t = np.arange(n) / SR; tone = np.sin(2*np.pi*np.cumsum(110 * 2 ** (2 * (t / d) ** 2))/SR) * (t / d) ** 2 * .3
    return out + tone
def hit(d=6.0):
    t = tt(d); boom = np.sin(2*np.pi*np.cumsum(32 + 50 * np.exp(-t * 4))/SR) * np.exp(-t * .9)
    return np.tanh(boom * 2) * .9 + fft_filter(noise(d), hi=1800) * np.exp(-t * 3) * .35 + fft_filter(noise(d), lo=5000) * np.exp(-t * 1.6) * .15
def reverse_swell(d=2.0):
    t = tt(d); return fft_filter(noise(d), lo=400, hi=8000) * (t / d) ** 4

# chords: Am F C G (formal, hopeful)
AM, F, C, G, Em = [57, 60, 64], [53, 57, 60], [52, 55, 60], [55, 59, 62], [52, 55, 59]
# ---- 0–14: solo piano + soft pad ----
for t0, m, v in ((0.6, 69, .9), (3.0, 64, .7), (5.0, 72, .8), (7.2, 71, .7), (8.4, 67, .6), (10.0, 69, .85), (12.0, 76, .7)):
    add(piano(m, 4.0, v), t0, .35, pan=.1, rev=.5)
for t0, m in ((0.6, 45), (5.0, 41), (10.0, 48)): add(piano(m, 5, .7), t0, .3, pan=-.15, rev=.5)
add(strings([45, 52, 57], 14.0, cutoff=900), 0.5, .05, rev=.6)
# ---- 14–26: five words, pulse begins (2.4s each) ----
prog = [AM, F, C, G, AM]
for i, ch in enumerate(prog):
    t0 = 14 + i * 2.4
    add(strings([m - 12 for m in ch] + [ch[0] + 12], 2.7, gain=1, cutoff=1300 + i * 250), t0, .05 + .006 * i, rev=.5)
    add(piano(ch[0] + 12, 3, .8), t0, .3, rev=.5)
    for k, m in enumerate([ch[1] + 12, ch[2] + 12, ch[0] + 24]):
        add(piano(m, 2, .5), t0 + .6 + k * .6, .2, pan=.3 - k * .3, rev=.5)
    for b in range(4): add(sub_pulse(55 if i % 2 == 0 else 49, .5), t0 + b * .6, .25 + .05 * i)
    for b in range(8): add(tick(), t0 + b * .3, .06 + .02 * i, pan=.3, rev=.2)
# ---- 26–34: reveal of the veiled frame + build ----
add(strings([41, 53, 57, 60, 65], 5.0, cutoff=1800), 26, .07, rev=.6)
add(strings([43, 55, 59, 62, 67], 3.2, cutoff=2600), 31, .08, rev=.6)
for t0, m in ((26, 72), (27.2, 76), (28.4, 77), (29.6, 79)): add(piano(m, 3, .8), t0, .28, rev=.6)
t = 26.0
while t < 34 - .02:
    p = (t - 26) / 8; add(sub_pulse(55, .4), t, .2 + .3 * p); add(tick(), t, .05 + .15 * p, pan=.3)
    t += .6 if p < .5 else .3 if p < .8 else .15
add(riser(5.0), 29.0, .5, rev=.3)
add(reverse_swell(2.0), 32.0, .4, rev=.3)
# ---- 34: hit, then the closing chord ----
add(hit(7.0), 34.0, .9, rev=.6)
add(strings([33, 45, 52, 57, 60, 64], 7.5, cutoff=2200), 34.0, .09, rev=.7)
add(piano(45, 6, 1), 34.0, .4, rev=.6); add(piano(57, 6, .8), 34.0, .3, rev=.6); add(piano(64, 6, .8), 34.0, .25, rev=.6)
for t0, m in ((36.5, 72), (37.7, 71), (38.9, 76)): add(piano(m, 3.5, .7), t0, .22, pan=.15, rev=.7)

def reverb(x, seconds=3.2, seed=1):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = fft_filter(r.standard_normal(n) * np.exp(-t * 6 / seconds), lo=150, hi=6500); ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 1).bit_length(); return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
L += reverb(send, seed=1) * .9; R += reverb(send, seed=2) * .9
mix = np.stack([fft_filter(L, lo=25), fft_filter(R, lo=25)], 1)
mix /= np.max(np.abs(mix)) + 1e-9; mix = np.tanh(mix * 1.2) / np.tanh(1.2)
fade = np.ones(N); fn = int(2.0 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * .93
out = sys.argv[1] if len(sys.argv) > 1 else 'music5.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
