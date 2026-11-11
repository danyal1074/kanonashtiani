"""موسیقی شاد تیزر «به‌زودی» (رِ ماژور، مناسب کودکان) — کاملاً سنتز شده با numpy (بدون نمونه صوتی خارجی).
خروجی: public/teaser/teaser-music.wav  (سپس با ffmpeg به mp3 تبدیل می‌شود)
زمان‌بندی با public/teaser.html هماهنگ است: BPM=96، هر میزان ۲٫۵ ثانیه، طول کل ۴۳ ثانیه.
"""
import numpy as np, wave, sys, os

SR = 44100
DUR = 43.0
N = int(SR * DUR)
BPM = 96
BEAT = 60 / BPM          # 0.625s
BAR = BEAT * 4           # 2.5s
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)
send = np.zeros(N)  # reverb send (mono)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def add(sig, t0, gain=1.0, pan=0.0, rev=0.0):
    i = int(t0 * SR)
    if i >= N: return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:i+len(sig)] += sig * gain * l * 1.414
    R[i:i+len(sig)] += sig * gain * r * 1.414
    if rev: send[i:i+len(sig)] += sig * gain * rev

def tt(d): return np.arange(int(d * SR)) / SR

def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X * g, len(x))

def saw(freq, d, cutoff=4000, detune=(0,), phase_rand=True):
    t = tt(d); out = np.zeros_like(t)
    for dt in detune:
        f = freq * 2 ** (dt / 1200)
        ph = rng.uniform(0, 2*np.pi) if phase_rand else 0
        k = 1
        while k * f < min(cutoff * 2, 16000) and k < 80:
            amp = 1 / k / (1 + (k * f / cutoff) ** 2)
            out += amp * np.sin(2 * np.pi * k * f * t + ph * k)
            k += 1
    return out / len(detune)

def env_adsr(d, a=0.01, r=0.2, curve=1.0):
    n = int(d * SR); e = np.ones(n)
    na = max(1, int(a * SR)); nr = max(1, min(n, int(r * SR)))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e

# ---------------- drum voices ----------------
def kick(big=False):
    d = 0.9 if big else 0.45; t = tt(d)
    f = 45 + (160 if big else 120) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * (3.5 if big else 7))
    click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.3
    return np.tanh((s + click) * (1.6 if big else 1.3))

def heartbeat():
    t = tt(0.35); f = 40 + 30 * np.exp(-t * 20)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)

def snare(d=0.25):
    t = tt(d)
    n = fft_filter(rng.standard_normal(len(t)), lo=900, hi=9000) * np.exp(-t * 16)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25)
    return n * 0.8 + body * 0.5

def clap():
    t = tt(0.3); n = fft_filter(rng.standard_normal(len(t)), lo=1000, hi=6000)
    e = np.zeros(len(t))
    for o in (0, 0.011, 0.022):
        i = int(o * SR); e[i:] += np.exp(-(t[: len(t) - i]) * (60 if o < 0.02 else 14))
    return n * e * 0.8

def hat(open_=False):
    t = tt(0.25 if open_ else 0.06)
    return fft_filter(rng.standard_normal(len(t)), lo=7000) * np.exp(-t * (14 if open_ else 70))

def tick():
    t = tt(0.04)
    return (np.sin(2*np.pi*3200*t) + 0.5*np.sin(2*np.pi*5100*t)) * np.exp(-t * 160)

def impact(d=3.5):
    t = tt(d)
    f = 30 + 70 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.2)
    noise = fft_filter(rng.standard_normal(len(t)), hi=2500) * np.exp(-t * 4)
    crash = fft_filter(rng.standard_normal(len(t)), lo=4000) * np.exp(-t * 2.2) * 0.35
    return np.tanh(boom * 1.8) + noise * 0.5 + crash

def braam(root=26, d=3.0):
    t = tt(d); s = np.zeros(len(t))
    for m, g in ((root, 1), (root + 12, 0.8), (root + 19, 0.5), (root + 24, 0.3)):
        s += g * saw(midi(m), d, cutoff=1400, detune=(-12, 0, 11))
    # filter "bwaa" envelope: crossfade bright→dark
    dark = fft_filter(s, hi=300)
    w = np.exp(-t * 2.2)
    out = s * w + dark * (1 - w)
    return np.tanh(out * 1.2) * env_adsr(d, a=0.02, r=1.6)

def reverse_swell(d=1.6):
    t = tt(d)
    n = fft_filter(rng.standard_normal(len(t)), lo=500, hi=9000)
    return n * (t / d) ** 3

def riser(d):
    """نویز با فیلتر بازشونده + تن بالارونده (هم‌پوشانی بلوکی)."""
    n = int(d * SR); out = np.zeros(n); blk = 2048; hop = blk // 2
    win = np.hanning(blk); noise = rng.standard_normal(n + blk)
    for i in range(0, n, hop):
        p = i / n; cutoff = 300 * (40 ** p)
        seg = fft_filter(noise[i:i+blk] * win, lo=cutoff * 0.3, hi=cutoff)
        out[i:i+blk] += seg[: len(out[i:i+blk])] * (0.2 + p ** 2)
    t = np.arange(n) / SR
    f = 110 * 2 ** (3.0 * (t / d) ** 1.6)
    tone = np.sin(2*np.pi*np.cumsum(f)/SR) + 0.6*np.sin(2*np.pi*np.cumsum(f*1.5)/SR)
    return out * 0.9 + tone * (t / d) ** 2 * 0.18

def glitch(d=0.18):
    t = tt(d); f = rng.choice([800, 1200, 2400, 400])
    sq = np.sign(np.sin(2*np.pi*f*t)) * 0.3
    bits = np.round(rng.standard_normal(len(t)) * 3) / 6
    gate = (np.floor(t * 60) % 2)
    return (sq + bits) * gate * np.exp(-t * 6)

def pluck(freq, d=0.3):
    t = tt(d)
    s = saw(freq, d, cutoff=3500, phase_rand=False)
    bright = s * np.exp(-t * 18)
    return (bright + fft_filter(s, hi=900) * 0.4) * np.exp(-t * 7)


# ---------------- playful voices ----------------
def bell(freq, d=0.9):
    """گلوکن‌اشپیل/زنگوله"""
    t = tt(d)
    s = np.sin(2*np.pi*freq*t) + .35*np.sin(2*np.pi*freq*2.76*t)*np.exp(-t*9) + .2*np.sin(2*np.pi*freq*5.4*t)*np.exp(-t*16)
    return s * np.exp(-t * 4.5) * np.minimum(1, t / .002)

def knock():
    """تق‌تق روی جعبه کادو (وودبلاک)"""
    t = tt(0.12)
    return (np.sin(2*np.pi*620*t) + .5*np.sin(2*np.pi*1180*t)) * np.exp(-t * 45) + \
           fft_filter(rng.standard_normal(len(t)), lo=1500, hi=5000) * np.exp(-t * 120) * .3

def bloop(up=False, d=0.22):
    t = tt(d); f = (300 + 900 * (t / d) ** 1.2) if up else (900 * np.exp(-t * 9) + 180)
    return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t * 6) * np.minimum(1, t / .003)

def slide_whistle(d=1.6, f0=500, f1=1700):
    t = tt(d); f = f0 * (f1 / f0) ** ((t / d) ** 1.3) * (1 + .012 * np.sin(2*np.pi*6*t))
    s = np.sin(2*np.pi*np.cumsum(f)/SR) + .15*np.sin(4*np.pi*np.cumsum(f)/SR)
    return s * env_adsr(d, a=.05, r=.15) * .7

def shaker():
    t = tt(0.07)
    return fft_filter(rng.standard_normal(len(t)), lo=5000, hi=12000) * np.sin(np.pi * t / .07) ** 2

def sparkle(d=1.2, n=10, base=84):
    out = np.zeros(int(d * SR))
    for i in range(n):
        m = base + [0, 4, 7, 12, 16, 19, 24][rng.integers(0, 7)]
        b = bell(midi(m), .5) * (1 - i / n); o = int(i * d / n * .8 * SR)
        out[o:o+len(b)] += b[: len(out) - o]
    return out

def stab(chord, d=0.6):
    """آکورد کوتاه برنجی شاد"""
    s = np.zeros(int(d * SR))
    for m in chord[1:]:
        s += saw(midi(m + 12), d, cutoff=3500, detune=(-8, 0, 8))
    t = tt(d)
    return np.tanh(s * .6) * np.exp(-t * 3.5) * np.minimum(1, t / .01)

def pop_impact(d=2.5):
    """ضربهٔ شاد: کیک بزرگ + سنج + پاپ"""
    t = tt(d)
    boom = np.sin(2*np.pi*np.cumsum(40 + 90*np.exp(-t*14))/SR) * np.exp(-t * 4)
    crash = fft_filter(rng.standard_normal(len(t)), lo=3500) * np.exp(-t * 2.2) * .45
    return np.tanh(boom * 1.5) + crash

# ---------------- harmony (D major) ----------------
CH = {
  'D':  [38, 50, 54, 57, 62], 'A':  [33, 49, 52, 57, 61], 'Bm': [35, 50, 54, 59, 62],
  'G':  [31, 50, 55, 59, 62], 'Em': [40, 52, 55, 59, 64], 'F#m': [42, 49, 54, 57, 61],
}
HINT_PROG = ['D', 'A', 'Bm', 'G', 'D', 'A', 'G']       # bars 3..9 (7.5s–25s)
BUILD_PROG = ['Em', 'A']                               # bars 10..11 (25s–30s)
REVEAL_PROG = ['D', 'G', 'A']                          # bars 13..15 (32.5s–40s)
# ملودی زنگوله: (پله‌ی ۱۶‌ام، نت midi) — یک موتیف بامزه و تکرارشونده
MOTIF = {'D': [(0,74),(2,78),(4,81),(7,78),(8,83),(10,81),(12,78)],
         'A': [(0,73),(2,76),(4,81),(7,76),(8,85),(10,81),(12,76)],
         'Bm':[(0,74),(2,78),(4,83),(7,78),(8,86),(10,83),(12,78)],
         'G': [(0,74),(2,79),(4,83),(7,79),(8,86),(10,83),(12,81),(14,79)],
         'Em':[(0,76),(2,79),(4,83),(6,79),(8,88),(10,83),(12,79),(14,83)],
         'F#m':[(0,73),(4,78),(8,81)]}

def pad(chord, d, gain=0.10, cutoff=2500):
    s = np.zeros(int(d * SR))
    for m in chord[1:]:
        s += saw(midi(m), d, cutoff=cutoff, detune=(-9, 0, 8))
    return s * env_adsr(d, a=0.3, r=0.6) * gain

def bassnote(m, d, cutoff=600):
    b = saw(midi(m), d, cutoff=cutoff) + .6 * np.sin(2*np.pi*midi(m)*tt(d))
    return np.tanh(b * 1.6) * env_adsr(d, a=.004, r=.06)

# ---- 1) intro: light pad + clock ticks + knock-knock on the gift box (0–7.5) ----
intro_pad = pad(CH['D'], 7.5, gain=.05, cutoff=1500) * np.minimum(1, tt(7.5) / 3)
add(intro_pad, 0, 1, rev=.5)
for i in range(12):
    add(tick(), i * BEAT, 0.06 + 0.2 * i / 12, pan=0.4 * (-1) ** i, rev=0.2)
for i in range(6):                     # knock, knock (همزمان با تکان جعبه)
    t0 = 0.3 + i * 1.25
    add(knock(), t0, .55, pan=-.1, rev=.25); add(knock(), t0 + 0.2, .45, pan=.1, rev=.25)
for t0, m in ((1.0, 81), (1.9, 86), (4.2, 78), (4.8, 81), (6.0, 85)):   # زنگ‌های کنجکاوانه
    add(bell(midi(m)), t0, .22, pan=.3, rev=.5)
add(bloop(up=True), 3.9, .35, pan=-.3, rev=.2)
add(bloop(), 5.55, .35, pan=.3, rev=.2)
add(slide_whistle(1.4, 400, 1500), 7.5 - 1.45, .22, rev=.3)

# ---- 2) hints groove (7.5–25) ----
hint_t0 = 3 * BAR
add(pop_impact(2.0), hint_t0, .45, rev=.3)
add(sparkle(1.0), hint_t0, .25, pan=.2, rev=.5)
for b, name in enumerate(HINT_PROG):
    bt = hint_t0 + b * BAR; ch = CH[name]
    add(pad(ch, BAR + 0.3, gain=0.05), bt, 1, rev=0.5)
    for s16 in range(16):
        st = bt + s16 * BEAT / 4; off = s16 % 4
        if b < 2:
            if s16 in (0, 10): add(kick(), st, 0.7)
        else:
            if s16 in (0, 8, 10): add(kick(), st, 0.7)
        if b >= 1 and s16 in (4, 12): add(clap(), st, 0.5, rev=0.35)
        if off == 2: add(hat(), st, 0.13, pan=0.3)
        if b >= 2 and off in (1, 3): add(shaker(), st, .12, pan=-.35)
        # bouncy bass (root, octave, fifth)
        if off in (0, 2) and s16 not in (2,):
            m = ch[0] + [0, 12, 7, 12][(s16 // 2) % 4]
            add(bassnote(m, BEAT / 2 - .02), st, 0.26)
        # off-beat chord stabs (ukulele-ish skank)
        if b >= 1 and off == 2:
            add(stab(ch, .18), st, .07, pan=.4 * (-1) ** s16, rev=.3)
    # glockenspiel melody
    for s16, m in MOTIF[name]:
        add(bell(midi(m)), bt + s16 * BEAT / 4, .2 + .02 * (b >= 3), pan=-.2, rev=.45)
    add(bloop(up=True, d=.16), bt + .01, .15, pan=rng.uniform(-.6, .6), rev=.2)   # «پاپ» شروع هر سرنخ

# ---- 3) build (25–30) ----
bt0 = 10 * BAR
add(riser(5.0), bt0, 0.3, rev=0.3)
add(slide_whistle(4.8, 350, 2200), bt0 + .1, .16, rev=.3)
for b, name in enumerate(BUILD_PROG):
    bt = bt0 + b * BAR; ch = CH[name]
    add(pad(ch, BAR + 0.2, gain=0.07, cutoff=3500), bt, 1, rev=0.5)
    for s16 in range(16):
        st = bt + s16 * BEAT / 4
        if s16 % 4 == 0 or (b == 1 and s16 % 2 == 0): add(kick(), st, 0.65)
        if s16 % 2 == 0: add(bassnote(ch[0] + 12 * (s16 % 4 == 2), BEAT/2 - .02, 900), st, .24)
        add(shaker(), st, .1, pan=.3)
        m = [ch[2], ch[3], ch[4], ch[3]][s16 % 4] + 24
        add(bell(midi(m), .4), st, .1 + .05 * b, pan=.4 * np.cos(s16), rev=.4)
t = bt0
while t < 30.0 - 0.02:
    p = (t - bt0) / 5.0
    add(snare(0.15), t, 0.1 + 0.3 * p ** 1.5, pan=0.1, rev=0.25)
    t += BEAT / 2 if p < 0.4 else BEAT / 4 if p < 0.75 else BEAT / 8
for g in (26.9, 28.1, 29.2):
    add(bloop(up=True), g, .25, pan=rng.uniform(-.7, .7))

# ---- 4) hit + playful pause (30–32.5) ----
add(pop_impact(2.5), 30.0, .7, rev=.6)
add(stab(CH['A'], 1.2), 30.0, .25, rev=.5)
for i, t0 in enumerate((30.9, 31.15, 31.7, 31.95)):     # جعبه تق‌تق می‌کنه
    add(knock(), t0, .6, pan=(-1) ** i * .2, rev=.3)
add(bloop(up=True, d=.5), 31.95, .3, rev=.3)
add(reverse_swell(1.2), 32.5 - 1.2, .3, rev=.3)

# ---- 5) reveal: confetti party (32.5–40) ----
rt0 = 13 * BAR
add(pop_impact(2.5), rt0, .9, rev=.5)
add(sparkle(2.0, n=18, base=84), rt0, .35, pan=.25, rev=.6)
add(sparkle(2.0, n=14, base=79), rt0 + .1, .3, pan=-.25, rev=.6)
for b, name in enumerate(REVEAL_PROG):
    bt = rt0 + b * BAR; ch = CH[name]
    add(stab(ch, .9), bt, .2, rev=.4)
    add(pad(ch, BAR + 0.4, gain=0.08, cutoff=4000), bt, 1, rev=0.6)
    for s16 in range(16):
        st = bt + s16 * BEAT / 4; off = s16 % 4
        if off == 0 or s16 == 10: add(kick(), st, 0.75)
        if s16 in (4, 12): add(clap(), st, 0.55, rev=0.4)
        if off == 2: add(hat(), st, .14, pan=.3); add(stab(ch, .18), st, .08, pan=-.3, rev=.3)
        if off in (1, 3): add(shaker(), st, .12, pan=-.3)
        if s16 % 2 == 0: add(bassnote(ch[0] + [0, 12, 7, 12][(s16 // 2) % 4], BEAT/2 - .02, 800), st, .27)
    for s16, m in MOTIF[name]:
        add(bell(midi(m + 12)), bt + s16 * BEAT / 4, .2, pan=.2, rev=.45)
        add(bell(midi(m)), bt + s16 * BEAT / 4, .14, pan=-.2, rev=.45)

# ---- 6) final "ta-da!" (40) + tail ----
add(slide_whistle(.9, 600, 1800), 40 - .95, .18, rev=.3)
add(pop_impact(3.0), 40.0, .9, rev=.7)
add(stab(CH['D'], 2.0), 40.0, .32, rev=.6)
add(pad(CH['D'], 3.0, gain=0.08, cutoff=3000), 40.0, 1, rev=0.8)
add(sparkle(2.4, n=16, base=86), 40.0, .32, rev=.7)
for i, m in enumerate((86, 90, 93, 98)):
    add(bell(midi(m), 1.5), 40.15 + i * .12, .22, pan=(i - 1.5) * .3, rev=.6)

# ---------------- reverb + master ----------------
def reverb(x, seconds=2.6, seed=1):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * 3.0 / seconds * 2.3)
    ir = fft_filter(ir, lo=200, hi=7000); ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n; size = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return y

L += reverb(send, seed=1) * 0.9
R += reverb(send, seed=2) * 0.9
mix = np.stack([L, R], 1)
mix = fft_filter(mix[:, 0], lo=25), fft_filter(mix[:, 1], lo=25)
mix = np.stack(mix, 1)
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.5) / np.tanh(1.5)
fade = np.ones(N); fn = int(1.5 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * 0.93

out = sys.argv[1] if len(sys.argv) > 1 else 'public/teaser/teaser-music.wav'
os.makedirs(os.path.dirname(out), exist_ok=True)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out, f'{DUR}s')
