"""موسیقی تیزر ششم «سرآغاز» — حماسی-الکترونیک و هیجان‌انگیز: آکوردهای سوپرسا با پمپاژ، آرپژ، کیک چهارضرب، رایزر و «دراپ».
کاملاً با numpy سنتز شده. زمان‌بندی با public/teaser6.html هماهنگ است (۱۲۰ BPM، هر صحنه ۴ ثانیه، دراپ در ۲۶، کل ۳۸ ثانیه).
"""
import numpy as np, wave, sys
SR = 44100; DUR = 38.0; N = int(SR * DUR); BEAT = .5; BAR = 2.0
rng = np.random.default_rng(42)
L = np.zeros(N); R = np.zeros(N); send = np.zeros(N)
PL = np.zeros(N); PR = np.zeros(N)            # pumped (side-chained) bus
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def add(sig, t0, g=1.0, pan=0.0, rev=0.0, pump=False):
    i = int(t0 * SR)
    if i >= N or i < 0: return
    sig = sig[: N - i]; l = np.cos((pan + 1) * np.pi / 4) * 1.414; r = np.sin((pan + 1) * np.pi / 4) * 1.414
    (PL if pump else L)[i:i+len(sig)] += sig * g * l; (PR if pump else R)[i:i+len(sig)] += sig * g * r
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

def kick(big=False):
    t = tt(.45); s = np.sin(2*np.pi*np.cumsum(46 + (170 if big else 140) * np.exp(-t * 32))/SR) * np.exp(-t * (5 if big else 8))
    return np.tanh((s + fft_filter(noise(.45), lo=2000) * np.exp(-t * 250) * .4) * 1.6)
def clap():
    t = tt(.3); n = fft_filter(noise(.3), lo=1000, hi=7000); e = np.zeros_like(t)
    for o in (0, .012, .024): i = int(o * SR); e[i:] += np.exp(-t[: len(t) - i] * (70 if o < .02 else 13))
    return n * e * .8
def hat(o=False): t = tt(.18 if o else .05); return fft_filter(noise(len(t) / SR), lo=7500) * np.exp(-t * (16 if o else 85))
def snare(d=.2): t = tt(d); return fft_filter(noise(d), lo=900, hi=9000) * np.exp(-t * 17) + np.sin(2*np.pi*190*t) * np.exp(-t * 25) * .5
def supersaw(ch, d, cutoff=4500): return sum(saw(midi(m), d, cutoff=cutoff, detune=(-18, -7, 0, 7, 18)) for m in ch) * env(d, .01, .08)
def pluck(m, d=.25):
    t = tt(d); s = saw(midi(m), d, cutoff=5000, detune=(-6, 6)); return (s * np.exp(-t * 20) + fft_filter(s, hi=1200) * .4) * np.exp(-t * 8)
def bass(m, d): return np.tanh(saw(midi(m), d, cutoff=420) * 2.4 + np.sin(2*np.pi*midi(m)*tt(d)) * .6) * env(d, .004, .04)
def lead(m, d):
    t = tt(d); vib = 1 + .004 * np.sin(2*np.pi*5.5*t) * np.minimum(1, t / .3); f = midi(m) * vib
    ph = 2*np.pi*np.cumsum(f)/SR; s = sum(np.sin(k * ph) / k * (1 / (1 + (k * midi(m) / 3500) ** 2)) for k in range(1, 30))
    return np.tanh(s * 1.2) * env(d, .02, .1)
def impact(d=4.0):
    t = tt(d); boom = np.sin(2*np.pi*np.cumsum(30 + 80 * np.exp(-t * 5))/SR) * np.exp(-t * 1.3)
    return np.tanh(boom * 2) + fft_filter(noise(d), hi=2500) * np.exp(-t * 4) * .45 + fft_filter(noise(d), lo=4500) * np.exp(-t * 2) * .3
def braam(root, d=3.0):
    t = tt(d); s = sum(g * saw(midi(m), d, cutoff=1500, detune=(-12, 0, 11)) for m, g in ((root, 1), (root + 12, .8), (root + 19, .5)))
    w = np.exp(-t * 1.8); return np.tanh((s * w + fft_filter(s, hi=280) * (1 - w)) * 1.3) * env(d, .02, 1.2)
def whoosh(d=.6):
    t = tt(d); n = noise(d); out = np.zeros_like(n); blk = 1024
    for i in range(0, len(n), blk // 2):
        p = i / len(n); seg = fft_filter(n[i:i+blk] * np.hanning(len(n[i:i+blk])), lo=300 + 3000 * p, hi=1500 + 8000 * p); out[i:i+len(seg)] += seg
    return out * np.sin(np.pi * t / d) ** 2 * 1.3
def riser(d):
    n = int(d * SR); out = np.zeros(n); blk = 2048; nz = noise(d + .1)
    for i in range(0, n, blk // 2):
        p = i / n; seg = fft_filter(nz[i:i+blk] * np.hanning(blk), lo=300 * (1 + p * 8), hi=900 * (1 + p * 14)); out[i:i+blk] += seg[: len(out[i:i+blk])] * (.15 + p ** 2)
    t = np.arange(n) / SR; return out + np.sin(2*np.pi*np.cumsum(220 * 2 ** (2.2 * (t / d) ** 1.5))/SR) * (t / d) ** 2 * .25
def reverse_swell(d=1.5): t = tt(d); return fft_filter(noise(d), lo=500, hi=9000) * (t / d) ** 4
def shimmer(m, d=2.5):
    t = tt(d); return (np.sin(2*np.pi*midi(m)*t) + .4*np.sin(2*np.pi*midi(m)*2.01*t)) * np.exp(-t * 2) * np.minimum(1, t / .002)

CH = {'Dm': [50, 53, 57, 62], 'Bb': [46, 50, 53, 58], 'F': [45, 48, 53, 57], 'C': [43, 48, 52, 55], 'Gm': [43, 46, 50, 55], 'A': [45, 49, 52, 57]}
ROOT = {'Dm': 38, 'Bb': 34, 'F': 41, 'C': 36, 'Gm': 31, 'A': 33}
PROG = ['Dm', 'Bb', 'F', 'C']
MEL = {'Dm': [(0, 74, 1), (1, 77, 1), (2, 81, 1.5), (3.5, 79, .5)], 'Bb': [(0, 77, 1), (1, 74, 1), (2, 77, 2)],
       'F': [(0, 72, 1), (1, 77, 1), (2, 81, 1.5), (3.5, 84, .5)], 'C': [(0, 83, .5), (.5, 81, .5), (1, 79, 1), (2, 76, 2)]}

def groove(bt, name, lvl=1.0, clapon=True, mel=False, arp=True, hats16=False):
    ch = CH[name]; r = ROOT[name]
    add(supersaw([m + 12 for m in ch[1:]], BAR, cutoff=2500 + 2500 * lvl), bt, .05 * lvl, rev=.3, pump=True)
    for b in range(4):
        st = bt + b * BEAT
        add(kick(), st, .7 * lvl)
        if clapon and b in (1, 3): add(clap(), st, .5 * lvl, rev=.25)
        add(hat(), st + BEAT / 2, .2 * lvl, pan=.3); add(bass(r, BEAT / 2 - .02), st + BEAT / 2, .3 * lvl)
        if hats16: add(hat(), st + BEAT / 4, .09 * lvl, pan=-.3); add(hat(), st + 3 * BEAT / 4, .09 * lvl, pan=-.3)
    if arp:
        for s in range(16):
            m = [ch[1], ch[2], ch[3], ch[2] + 12][s % 4] + 12
            add(pluck(m), bt + s * BEAT / 4, .07 * lvl, pan=.45 * np.sin(s * 1.3), rev=.35)
    if mel:
        for b0, m, ln in MEL[name]:
            add(lead(m, ln * BEAT * .95), bt + b0 * BEAT, .1 * lvl, rev=.4); add(lead(m - 12, ln * BEAT * .95), bt + b0 * BEAT, .05 * lvl, rev=.4)

# ---- 0–4: intro ----
add(supersaw([62, 65, 69], 4.2, cutoff=900) * np.minimum(1, tt(4.2) / 2.5), 0, .05, rev=.6)
for i in range(4): add(kick() * .6, .2 + i * 1.0, .35); add(kick() * .4, .45 + i * 1.0, .2)          # heartbeat
for i, m in enumerate([74, 77, 81, 86]): add(shimmer(m), .5 + i * .9, .08, pan=(i - 1.5) * .3, rev=.6)
add(reverse_swell(1.6), 4 - 1.6, .4, rev=.3)
# ---- 4–20: scenes 1–4 (8 bars) ----
for b in range(8):
    name = PROG[b % 4]; bt = 4 + b * BAR
    groove(bt, name, lvl=.75 + .03 * b, clapon=b >= 1, mel=b >= 4, hats16=b >= 4)
for s in (4, 8, 12, 16): add(impact(2.0), s, .25, rev=.3); add(whoosh(.6), s - .55, .3, pan=.3)
# ---- 20–24: build (Gm A) ----
for b, name in enumerate(['Gm', 'A']):
    groove(20 + b * BAR, name, lvl=1.0, mel=False, hats16=True)
add(whoosh(.6), 20 - .55, .35)
# ---- 24–26: riser + roll, silence at 25.75 ----
add(riser(1.9), 24.0, .55, rev=.3)
t = 24.0
while t < 25.75:
    p = (t - 24) / 1.75; add(snare(.15), t, .15 + .4 * p ** 1.5, rev=.2); t += .25 if p < .4 else .125 if p < .75 else .0625
add(supersaw([57, 61, 64], 1.75, cutoff=6000) * np.linspace(.2, 1, int(1.75 * SR)), 24.0, .05, rev=.4)
# ---- 26: DROP (26–34) ----
add(impact(5.0), 26.0, .9, rev=.6); add(braam(38, 3.0), 26.0, .35, rev=.5)
for b in range(4):
    name = PROG[b]; bt = 26 + b * BAR
    groove(bt, name, lvl=1.15, mel=True, hats16=True)
    add(kick(big=True), bt, .5)
add(impact(2.5), 30.0, .4, rev=.5); add(whoosh(.6), 30 - .55, .3)
# ---- 34: final ----
add(reverse_swell(1.2), 34 - 1.2, .4, rev=.3)
add(impact(4.0), 34.0, .95, rev=.7); add(braam(38, 3.5), 34.0, .4, rev=.6)
add(supersaw([62, 65, 69, 74], 4.0, cutoff=3000) * np.exp(-tt(4.0) * .6), 34.0, .06, rev=.7)
for i, m in enumerate([86, 89, 93, 98]): add(shimmer(m, 3), 34.2 + i * .15, .07, pan=(i - 1.5) * .3, rev=.7)

# side-chain pump on the pad bus
tN = np.arange(N) / SR; ph = (tN % BEAT); pump = 1 - .75 * np.exp(-ph * 9)
pump[tN < 4] = 1; pump[(tN >= 24) & (tN < 26)] = 1; pump[tN >= 34] = 1
L += PL * pump; R += PR * pump
def reverb(x, seconds=2.4, seed=1):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = fft_filter(r.standard_normal(n) * np.exp(-t * 6 / seconds), lo=200, hi=7000); ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 1).bit_length(); return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
L += reverb(send, seed=1) * .8; R += reverb(send, seed=2) * .8
# short silence right before the drop
gap = (tN >= 25.75) & (tN < 26.0); L[gap] *= .05; R[gap] *= .05
mix = np.stack([fft_filter(L, lo=28), fft_filter(R, lo=28)], 1)
mix /= np.max(np.abs(mix)) + 1e-9; mix = np.tanh(mix * 1.7) / np.tanh(1.7)
fade = np.ones(N); fn = int(1.5 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * .93
out = sys.argv[1] if len(sys.argv) > 1 else 'music6.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
