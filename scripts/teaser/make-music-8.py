"""موسیقی تیزر هشتم — هیجانی و ضرب‌دار (۱۲۸ BPM، دو مینور): بیلدآپ، «دراپ» با کیک چهارضرب، بیس ۸۰۸، آکوردهای پمپ‌شونده،
هی‌هت‌های تند ترپ، ملودی قلاب‌دار، سکوت یک‌ضربی پیش از هر دراپ. کاملاً با numpy سنتز شده.
زمان‌بندی با public/teaser8.html هماهنگ است: هر میزان ۱٫۸۷۵ ثانیه، دراپ‌ها در ۹٫۳۷۵ و ۲۲٫۵، پایان ۳۲ ثانیه.
"""
import numpy as np, wave, sys
SR = 44100; DUR = 32.0; N = int(SR * DUR); B = 60 / 128; BAR = 4 * B
rng = np.random.default_rng(128)
L = np.zeros(N); R = np.zeros(N); PL = np.zeros(N); PR = np.zeros(N); send = np.zeros(N)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def bt(bar, beat=0.0): return bar * BAR + beat * B
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
def env(d, a=.005, r=.06):
    n = int(d * SR); e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, min(n, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e

# ---- drums ----
def kick(hard=True):
    t = tt(.4); s = np.sin(2*np.pi*np.cumsum(48 + 190 * np.exp(-t * 38))/SR) * np.exp(-t * 7)
    click = fft_filter(noise(.4), lo=2500) * np.exp(-t * 300) * .5
    return np.tanh((s + click) * (2.2 if hard else 1.5))
def clap():
    t = tt(.3); n = fft_filter(noise(.3), lo=1000, hi=8000); e = np.zeros_like(t)
    for o in (0, .01, .02): i = int(o * SR); e[i:] += np.exp(-t[: len(t) - i] * (80 if o < .02 else 15))
    return n * e
def snare(d=.18): t = tt(d); return fft_filter(noise(d), lo=1000, hi=9000) * np.exp(-t * 20) + np.sin(2*np.pi*200*t) * np.exp(-t * 28) * .6
def hat(o=False): t = tt(.16 if o else .04); return fft_filter(noise(len(t) / SR), lo=8000) * np.exp(-t * (18 if o else 110))
def b808(m, d, glide_from=None):
    t = tt(d); f0 = midi(m); f = f0 * np.ones_like(t)
    if glide_from: f = f0 + (midi(glide_from) - f0) * np.exp(-t * 18)
    s = np.sin(2*np.pi*np.cumsum(f)/SR)
    return np.tanh(s * 2.4) * env(d, .003, .05) * (0.7 + .3 * np.exp(-t * 3))
# ---- synths ----
def supersaw(ch, d, cutoff=5000): return sum(saw(midi(m), d, cutoff=cutoff, detune=(-20, -8, 0, 8, 20)) for m in ch) * env(d, .004, .05)
def stab(ch, d=.2): t = tt(d); return supersaw(ch, d, cutoff=7000) * np.exp(-t * 6)
def pluck(m, d=.22): t = tt(d); s = saw(midi(m), d, cutoff=6000, detune=(-7, 7)); return (s * np.exp(-t * 22) + fft_filter(s, hi=1400) * .35) * np.exp(-t * 9)
def lead(m, d, bend=0):
    t = tt(d); f = midi(m) * (1 + .005 * np.sin(2*np.pi*6*t) * np.minimum(1, t / .2))
    if bend: f = f * 2 ** ((bend * np.exp(-t * 25)) / 12)
    ph = 2*np.pi*np.cumsum(f)/SR; s = sum(np.sin(k * ph) / k / (1 + (k * midi(m) / 4500) ** 2) for k in range(1, 32))
    s2 = sum(np.sin(k * ph * 1.006 + 1) / k / (1 + (k * midi(m) / 4500) ** 2) for k in range(1, 32))
    return np.tanh((s + s2) * .9) * env(d, .006, .05)
def chop(m, d=.18):
    """«های!» ساختگی (فرمانت آ) برای هیجان"""
    t = tt(d); f = midi(m); ph = 2*np.pi*f*t; s = np.zeros_like(t)
    for k in range(1, 40):
        fk = k * f; g = sum(a * np.exp(-((fk - F) / bw) ** 2) for F, bw, a in ((800, 120, 1), (1200, 150, .6), (2600, 300, .25)))
        s += g * np.sin(k * ph)
    return s * env(d, .01, .06) * np.exp(-t * 4)
def impact(d=3.0):
    t = tt(d); boom = np.sin(2*np.pi*np.cumsum(32 + 90 * np.exp(-t * 6))/SR) * np.exp(-t * 1.6)
    return np.tanh(boom * 2.2) + fft_filter(noise(d), hi=3000) * np.exp(-t * 5) * .5 + fft_filter(noise(d), lo=5000) * np.exp(-t * 2.2) * .35
def riser(d):
    n = int(d * SR); out = np.zeros(n); blk = 2048; nz = noise(d + .1)
    for i in range(0, n, blk // 2):
        p = i / n; seg = fft_filter(nz[i:i+blk] * np.hanning(blk), lo=300 * (1 + p * 10), hi=1000 * (1 + p * 12)); out[i:i+blk] += seg[: len(out[i:i+blk])] * (.1 + p ** 2)
    t = np.arange(n) / SR; return out + np.sin(2*np.pi*np.cumsum(200 * 2 ** (3 * (t / d) ** 1.4))/SR) * (t / d) ** 2 * .3
def downlifter(d=1.2): t = tt(d); return fft_filter(noise(d), lo=200, hi=6000) * np.exp(-t * 3) * .7
def rev_cym(d=1.0): t = tt(d); return fft_filter(noise(d), lo=4000) * (t / d) ** 3

# harmony: Cm Ab Eb Bb
CH = [[60, 63, 67], [56, 60, 63], [55, 58, 63], [58, 62, 65]]
ROOT = [36, 32, 39, 34]
HOOK = [(0, 79, .5), (.5, 79, .5), (1, 82, .75), (2, 79, .5), (2.5, 77, .5), (3, 75, 1)]   # beat, midi, beats
HOOK2 = [(0, 75, .5), (.5, 77, .5), (1, 79, .75), (2, 84, .5), (2.5, 82, .5), (3, 79, 1)]

def drop_bar(bar, k, lvl=1.0, hook=True, trap=True):
    t0 = bt(bar); ch = CH[k % 4]; r = ROOT[k % 4]
    add(supersaw([m + 12 for m in ch], BAR, cutoff=6500), t0, .045 * lvl, rev=.25, pump=True)
    for b in range(4):
        add(kick(), bt(bar, b), .75 * lvl)
        if b in (1, 3): add(clap(), bt(bar, b), .5 * lvl, rev=.2); add(snare(), bt(bar, b), .25 * lvl)
        add(hat(True), bt(bar, b + .5), .12 * lvl, pan=.25)
    # 808 pattern (syncopated)
    for bb, ln, gl in ((0, .75, None), (.75, .5, r + 12), (1.5, 1.0, None), (2.75, .5, None), (3.25, .75, r + 7)):
        add(b808(r, ln * B, gl), bt(bar, bb), .5 * lvl)
    # chord stabs on the off-beats
    for bb in (.5, 1.5, 2.25, 3.5): add(stab([m + 12 for m in ch]), bt(bar, bb), .05 * lvl, rev=.25)
    # trap hats: 16ths with a 32nd roll at the end of the bar
    if trap:
        for s in range(16):
            if s >= 14 and bar % 2: 
                for q in range(2): add(hat(), bt(bar, s / 4 + q / 8), .07 * lvl, pan=-.3)
            else: add(hat(), bt(bar, s / 4), (.09 if s % 2 else .05) * lvl, pan=-.3)
    if hook:
        for b0, m, ln in (HOOK if k % 2 == 0 else HOOK2):
            add(lead(m, ln * B * .95, bend=-2 if ln > .6 else 0), bt(bar, b0), .1 * lvl, pan=.1, rev=.3)
            add(lead(m - 12, ln * B * .95), bt(bar, b0), .05 * lvl, rev=.3)
    add(chop(72 + (k % 2) * 3), bt(bar, 3.5), .06 * lvl, rev=.4)

# ---- intro bars 0–1 ----
for bar in range(2):
    ch = CH[bar]; t0 = bt(bar)
    add(fft_filter(supersaw([m + 12 for m in ch], BAR + .1, cutoff=2500), hi=700 + 600 * bar), t0, .06, rev=.5)
    for s in range(16): add(fft_filter(pluck(ch[s % 3] + 24), hi=2500 + bar * 2500), bt(bar, s / 4), .07, pan=.4 * np.sin(s), rev=.4)
    add(kick(False), t0, .4); add(kick(False), bt(bar, 2), .3)
add(riser(BAR * 2), 0, .25, rev=.2)
add(impact(2.0), bt(2), .5, rev=.4); add(rev_cym(1.0), bt(2) - 1.0, .4)
# ---- bars 2–3: groove ----
for bar in range(2, 4):
    k = bar - 2; ch = CH[k]; t0 = bt(bar)
    add(supersaw([m + 12 for m in ch], BAR, cutoff=3500), t0, .045, rev=.3, pump=True)
    for b in range(4):
        add(kick(), bt(bar, b), .65)
        if b in (1, 3): add(clap(), bt(bar, b), .45, rev=.25)
        add(hat(), bt(bar, b + .5), .12, pan=.25)
        add(b808(ROOT[k], B * .45), bt(bar, b + .5), .35)
    for s in range(16): add(pluck(ch[s % 3] + 24), bt(bar, s / 4), .07, pan=.4 * np.sin(s), rev=.35)
# ---- bar 4: build (roll + riser) and one silent beat ----
add(riser(BAR), bt(4), .5, rev=.3)
t = bt(4)
while t < bt(4, 3.5) - .01:
    p = (t - bt(4)) / (3.5 * B); add(snare(.12), t, .15 + .45 * p ** 1.5, rev=.2); t += B / 2 if p < .35 else B / 4 if p < .7 else B / 8
add(chop(79, .35), bt(4, 3.5), .2, rev=.5)                                           # «هِی!»
# ---- bars 5–8: DROP 1 ----
for i, bar in enumerate(range(5, 9)):
    drop_bar(bar, i); add(impact(1.6), bt(bar), .35 if i else .9, rev=.4)
# ---- bars 9–10: «از دبستان تا متوسطه» (lighter groove) ----
for i, bar in enumerate(range(9, 11)):
    drop_bar(bar, i, lvl=.8, hook=False, trap=False)
    for s in range(16): add(pluck(CH[i][s % 3] + 24), bt(bar, s / 4), .07, pan=.4 * np.sin(s), rev=.35)
add(impact(1.6), bt(9), .45, rev=.4); add(impact(1.6), bt(10), .45, rev=.4)
# ---- bar 11: breakdown + riser, silent last half beat ----
add(fft_filter(supersaw([m + 12 for m in CH[3]], BAR, cutoff=4000), hi=1500), bt(11), .07, rev=.5)
add(riser(BAR), bt(11), .55, rev=.3)
t = bt(11, 1)
while t < bt(11, 3.5) - .01:
    p = (t - bt(11, 1)) / (2.5 * B); add(snare(.12), t, .15 + .45 * p ** 1.5, rev=.2); t += B / 2 if p < .3 else B / 4 if p < .65 else B / 8
add(downlifter(), bt(11) - .2, .2)
# ---- bars 12–13: DROP 2 ----
for i, bar in enumerate(range(12, 14)):
    drop_bar(bar, i, lvl=1.12); add(impact(1.8), bt(bar), 1.0 if i == 0 else .4, rev=.5)
# ---- bars 14–16: outro «به‌زودی» ----
add(impact(4.0), bt(14), 1.0, rev=.6)
add(supersaw([60, 63, 67, 72], 4.0, cutoff=4500) * np.exp(-tt(4.0) * .5), bt(14), .07, rev=.6)
add(b808(36, 2.0), bt(14), .55)
for s in range(16): add(pluck([72, 75, 79, 84][s % 4], .3), bt(14, s / 4), .08 * (1 - s / 20), pan=.4 * np.sin(s), rev=.5)
for b in range(4): add(kick(), bt(15, b), .5 - b * .08); add(hat(True), bt(15, b + .5), .1)
add(stab([60, 63, 67, 72], .5), bt(15), .08, rev=.5)
add(rev_cym(.9), bt(16) - .9, .35)
add(impact(2.5), bt(16), .8, rev=.6); add(stab([48, 55, 60, 63, 67], 1.2), bt(16), .1, rev=.6)

# pump + silences + mix
tN = np.arange(N) / SR; pump = 1 - .8 * np.exp(-(tN % B) * 10)
L += PL * pump; R += PR * pump
def reverb(x, seconds=1.8, seed=1):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = fft_filter(r.standard_normal(n) * np.exp(-t * 6 / seconds), lo=250, hi=8000); ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 1).bit_length(); return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
L += reverb(send, seed=1) * .75; R += reverb(send, seed=2) * .75
for a, b in ((bt(4, 3.75), bt(5)), (bt(11, 3.5), bt(12))):
    g = (tN >= a) & (tN < b); L[g] *= .02; R[g] *= .02
mix = np.stack([fft_filter(L, lo=30), fft_filter(R, lo=30)], 1)
mix /= np.max(np.abs(mix)) + 1e-9; mix = np.tanh(mix * 2.0) / np.tanh(2.0)
fade = np.ones(N); fn = int(1.2 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * .94
out = sys.argv[1] if len(sys.argv) > 1 else 'music8.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
