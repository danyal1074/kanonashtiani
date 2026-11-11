"""موسیقی تیزر دوم «دفترچه‌ی راز» — ماریمبا، پیتزیکاتو، سوت و صدای مداد/ورق (سل ماژور، ۱۲۰ BPM).
کاملاً با numpy سنتز شده. زمان‌بندی با public/teaser2.html هماهنگ است (هر میزان ۲ ثانیه، کل ۳۸ ثانیه).
"""
import numpy as np, wave, sys, os

SR = 44100; DUR = 38.0; N = int(SR * DUR)
BEAT = 0.5; BAR = 2.0
rng = np.random.default_rng(11)
L = np.zeros(N); R = np.zeros(N); send = np.zeros(N)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def add(sig, t0, gain=1.0, pan=0.0, rev=0.0):
    i = int(t0 * SR)
    if i >= N or i < 0: return
    sig = sig[: N - i]; l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:i+len(sig)] += sig * gain * l * 1.414; R[i:i+len(sig)] += sig * gain * r * 1.414
    if rev: send[i:i+len(sig)] += sig * gain * rev
def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X * g, len(x))
def noise(d): return rng.standard_normal(int(d * SR))

# ---------- voices ----------
def marimba(f, d=0.6):
    t = tt(d)
    s = np.sin(2*np.pi*f*t) + .3*np.sin(2*np.pi*4*f*t)*np.exp(-t*35) + .12*np.sin(2*np.pi*9.9*f*t)*np.exp(-t*70)
    return s * np.exp(-t * 8) * np.minimum(1, t / .001)
def pizz(f, d=0.3):
    t = tt(d); s = np.zeros_like(t)
    for k in range(1, 14): s += np.sin(2*np.pi*k*f*t) / k * np.exp(-t * (10 + k * 4))
    return s * np.minimum(1, t / .003)
def whistle(f, d):
    t = tt(d); vib = 1 + .006 * np.sin(2*np.pi*5.5*t) * np.minimum(1, t / .25)
    s = np.sin(2*np.pi*np.cumsum(f * vib)/SR) + .05 * fft_filter(noise(d), lo=f, hi=f * 2.5)
    a = int(.03 * SR); r = int(min(.08, d / 3) * SR); e = np.ones(len(t)); e[:a] = np.linspace(0, 1, a); e[-r:] = np.linspace(1, 0, r)
    return s * e
def tuba(f, d=0.4):
    t = tt(d); s = np.sin(2*np.pi*f*t) + .5*np.sin(4*np.pi*f*t) + .25*np.sin(6*np.pi*f*t)
    return np.tanh(s * 1.2) * np.minimum(1, t / .02) * np.exp(-t * 4)
def kick():
    t = tt(.3); f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t * 10)
def snap():
    t = tt(.12); return fft_filter(noise(.12), lo=1800, hi=6000) * np.exp(-t * 55) * 1.3
def shaker():
    t = tt(.07); return fft_filter(noise(.07), lo=5000, hi=12000) * np.sin(np.pi * t / .07) ** 2
def tamb():
    t = tt(.18); return fft_filter(noise(.18), lo=6000) * np.exp(-t * 22) + .2*np.sin(2*np.pi*5200*t)*np.exp(-t*30)
def snare(d=.15):
    t = tt(d); return fft_filter(noise(d), lo=900, hi=8000) * np.exp(-t * 18) + .4*np.sin(2*np.pi*190*t)*np.exp(-t*25)
def scribble(d):
    t = tt(d); am = np.abs(np.sin(2*np.pi*np.cumsum(9 + 7 * rng.random(len(t)) * 0 + 4*np.sin(2*np.pi*.7*t))/SR))
    return fft_filter(noise(d), lo=2500, hi=7000) * (.3 + am) * np.minimum(1, t / .05) * np.minimum(1, (d - t) / .05)
def page_flip(d=.4):
    t = tt(d); n = noise(d); out = np.zeros_like(n); blk = 1024
    for i in range(0, len(n), blk // 2):
        p = i / len(n); seg = fft_filter(n[i:i+blk] * np.hanning(len(n[i:i+blk])), lo=600, hi=1500 + 6000 * p)
        out[i:i+len(seg)] += seg
    return out * (t / d) ** 1.5 * np.exp(-np.maximum(0, t - d * .8) * 40) * 1.2
def shh(d=.7):
    t = tt(d); return fft_filter(noise(d), lo=2500, hi=8000) * np.sin(np.pi * t / d) ** .7
def bell(f, d=1.0):
    t = tt(d); return (np.sin(2*np.pi*f*t) + .3*np.sin(2*np.pi*f*2.76*t)*np.exp(-t*8)) * np.exp(-t * 4) * np.minimum(1, t / .002)
def click():
    t = tt(.05); return (np.sin(2*np.pi*2400*t) + fft_filter(noise(.05), lo=2000) * .5) * np.exp(-t * 120)
def brass(chord, d=1.2):
    t = tt(d); s = np.zeros_like(t)
    for m in chord:
        f = midi(m)
        for k in range(1, 12): s += np.sin(2*np.pi*k*f*t + k) / k * np.exp(-t * k * .6)
    return np.tanh(s * .35) * np.minimum(1, t / .015) * np.exp(-t * 1.6)
def cymbal(d=2.0):
    t = tt(d); return fft_filter(noise(d), lo=4000) * np.exp(-t * 2.4)

# ---------- harmony (G major) ----------
CH = {'G': [43, 59, 62, 67], 'Em': [40, 59, 64, 67], 'C': [36, 60, 64, 67], 'D': [38, 57, 62, 66],
      'Am': [45, 60, 64, 69], 'D7': [38, 57, 60, 66]}
TONES = {'G': [67, 71, 74, 79], 'Em': [64, 67, 71, 76], 'C': [64, 67, 72, 76], 'D': [66, 69, 74, 78], 'Am': [64, 69, 72, 76], 'D7': [66, 69, 72, 74]}
RIDDLE_PROG = [('G', 'Em'), ('C', 'D'), ('G', 'Em'), ('C', 'D'), ('Am', 'D')]
# whistle tune (8th position, tone index, length in 8ths) — two bars
TUNE_A = [(0, 2, 1), (1, 1, 1), (2, 0, 2), (4, 1, 1), (5, 2, 1), (6, 3, 2)]
TUNE_B = [(0, 3, 1), (1, 2, 1), (2, 1, 1), (3, 2, 1), (4, 1, 3), (7, 0, 1)]

def groove_bar(bt, name, level=1.0, tune=None, mar16=False):
    ch = CH[name]; tn = TONES[name]
    for b8 in range(8):
        st = bt + b8 * BEAT / 2
        if b8 in (0, 4): add(kick(), st, .55 * level); add(tuba(midi(ch[0]), .45), st, .32 * level)
        if b8 in (2, 6):
            add(snap(), st, .4 * level, pan=.2, rev=.2)
            for m in ch[1:]: add(pizz(midi(m), .2), st, .07 * level, pan=-.2, rev=.2)
            add(tuba(midi(ch[0] + 7), .3), st, .18 * level)
        add(shaker(), st, .1 * level, pan=.35)
        m = tn[[0, 1, 2, 3, 2, 1, 2, 3][b8]]
        add(marimba(midi(m)), st, .16 * level, pan=-.3, rev=.3)
        if mar16: add(marimba(midi(tn[[3, 2, 1, 2][b8 % 4]] + 12), .3), st + BEAT / 4, .1 * level, pan=.3, rev=.3)
    if tune:
        for p8, ti, ln in tune:
            add(whistle(midi(tn[ti] + 12), ln * BEAT / 2 * .95), bt + p8 * BEAT / 2, .14 * level, pan=.1, rev=.45)

# ---- intro 0–6: sneaky tiptoe pizzicato ----
sneak = [55, 0, 58, 0, 57, 0, 56, 0, 55, 0, 58, 0, 62, 0, 61, 0, 55, 0, 58, 0, 57, 0, 62, 66]
for i, m in enumerate(sneak):
    st = i * BEAT / 2
    if m: add(pizz(midi(m), .25), st, .3, pan=-.15, rev=.25)
    if i % 2 == 0: add(pizz(midi(43 if (i // 4) % 2 == 0 else 38), .3), st, .35, rev=.15)
add(scribble(1.7), .25, .22, pan=.2, rev=.1)            # lock being drawn
add(shh(.8), 2.0, .5, rev=.3)                           # «شششش!»
add(bell(midi(83)), 4.0, .2, rev=.4)
add(bell(midi(86)), 4.4, .2, rev=.4)
add(page_flip(), 6.0 - .35, .5, pan=.2)

# ---- riddles 6–26 ----
for r, (c1, c2) in enumerate(RIDDLE_PROG):
    t0 = 6 + r * 4
    groove_bar(t0, c1, level=1.0 if r else .85, tune=TUNE_A if r % 2 == 0 else TUNE_B)
    groove_bar(t0 + BAR, c2, level=1.0 if r else .85, tune=None if r < 1 else (TUNE_B if r % 2 == 0 else TUNE_A))
    add(scribble(1.8), t0 + .3, .12, pan=.3, rev=.1)
    add(bell(midi(79)), t0 + 2.6, .22, pan=-.3, rev=.4); add(bell(midi(86)), t0 + 2.75, .2, pan=.3, rev=.4)   # «؟» stamp
    add(page_flip(), t0 + 4 - .35, .45, pan=.2)

# ---- build 26–30 ----
for b, name in enumerate(['Am', 'D7']):
    bt = 26 + b * BAR; groove_bar(bt, name, level=1.0, mar16=True)
t = 26.0
while t < 30 - .02:
    p = (t - 26) / 4; add(snare(), t, .08 + .3 * p ** 1.6, rev=.2)
    t += BEAT / 2 if p < .5 else BEAT / 4 if p < .85 else BEAT / 8
tw = tt(3.6); fw = midi(67) * 2 ** (1.0 * (tw / 3.6) ** 1.4)
add(np.sin(2*np.pi*np.cumsum(fw)/SR) * np.minimum(1, tw / .2) * .9, 26.3, .1, rev=.4)   # whistle slide up
for k in range(4): add(click(), 29.1 + k * .2, .35)                                    # lock jiggling
add(click(), 29.85, .6); add(click(), 29.92, .5)

# ---- reveal 30–36 ----
add(cymbal(2.5), 30, .45, rev=.4)
add(brass([55, 59, 62, 67, 71], 1.6), 30, .3, rev=.5)
add(page_flip(.3), 30.0, .4)
for i, m in enumerate([79, 83, 86, 91]): add(bell(midi(m)), 30.05 + i * .08, .18, pan=(i - 1.5) * .3, rev=.5)
for b, name in enumerate(['G', 'C', 'D']):
    bt = 30 + b * BAR
    groove_bar(bt, name, level=1.1, tune=TUNE_A if b != 1 else TUNE_B, mar16=True)
    for b8 in range(8): add(tamb(), bt + b8 * BEAT / 2 + BEAT / 4, .12, pan=-.3)
# ---- ending 36–38 ----
for i, m in enumerate([67, 71, 74, 79, 83, 86]): add(marimba(midi(m), .5), 35.55 + i * .07, .2, pan=(i - 2.5) * .2, rev=.3)
add(brass([43, 55, 59, 62, 67], 2.2), 36, .38, rev=.6)
add(kick(), 36, .7); add(cymbal(2.0), 36, .4, rev=.5)
add(bell(midi(91), 1.5), 36.1, .2, rev=.6)

# ---------- mix ----------
def reverb(x, seconds=1.8, seed=1):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = fft_filter(r.standard_normal(n) * np.exp(-t * 5.5 / seconds), lo=200, hi=7000); ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
L += reverb(send, seed=1) * .8; R += reverb(send, seed=2) * .8
mix = np.stack([fft_filter(L, lo=30), fft_filter(R, lo=30)], 1)
mix /= np.max(np.abs(mix)) + 1e-9; mix = np.tanh(mix * 1.4) / np.tanh(1.4)
fade = np.ones(N); fn = int(1.2 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * .93
out = sys.argv[1] if len(sys.argv) > 1 else 'music2.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
