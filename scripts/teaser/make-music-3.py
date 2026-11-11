"""موسیقی تیزر سوم «ماجراجویی بزرگ» — چیپ‌تیون (موج پالس/مثلثی/نویز) با افکت‌های بازی.
کاملاً با numpy سنتز شده. زمان‌بندی با public/teaser3.html هماهنگ است (۱۲۰ BPM، هر میزان ۲ ثانیه، کل ۳۸ ثانیه).
"""
import numpy as np, wave, sys

SR = 44100; DUR = 38.0; N = int(SR * DUR); BEAT = .5
rng = np.random.default_rng(5)
L = np.zeros(N); R = np.zeros(N)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def add(sig, t0, g=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N or i < 0: return
    sig = sig[: N - i]; L[i:i+len(sig)] += sig * g * (1 - max(0, pan)); R[i:i+len(sig)] += sig * g * (1 + min(0, pan))

def pulse_f(fcurve, duty=.5):
    """پالس محدود-باند با فرکانس متغیر (جمع هارمونیک‌ها)"""
    ph = 2 * np.pi * np.cumsum(fcurve) / SR; out = np.zeros_like(ph); fmax = np.max(fcurve)
    for k in range(1, int(11000 / fmax) + 1):
        out += np.sin(np.pi * k * duty) / k * np.cos(k * ph)
    return out * 1.2
def pulse(f, d, duty=.5, decay=0.0):
    t = tt(d); s = pulse_f(np.full(len(t), f), duty)
    e = np.ones(len(t)); a = int(.003 * SR); r = int(.012 * SR); e[:a] = np.linspace(0, 1, a); e[-r:] = np.linspace(1, 0, r)
    return s * e * (np.exp(-t * decay) if decay else 1)
def tri(f, d):
    t = tt(d); s = np.zeros_like(t)
    for k in range(1, 16, 2): s += ((-1) ** ((k - 1) // 2)) / k ** 2 * np.sin(2*np.pi*k*f*t)
    e = np.ones(len(t)); r = int(.01 * SR); e[-r:] = np.linspace(1, 0, r); return s * e * .9
def nz(d, decay, lo_cut=0):
    x = rng.standard_normal(int(d * SR))
    # crude "NES" noise: sample & hold for a gritty texture
    hold = 2 if lo_cut else 6
    x = np.repeat(x[::hold], hold)[: int(d * SR)]
    return x * np.exp(-tt(d) * decay)
def kick():
    t = tt(.18); f = 40 + 160 * np.exp(-t * 35)
    return np.sign(np.sin(2*np.pi*np.cumsum(f)/SR)) * .5 * np.exp(-t * 18)
def snare(): return nz(.14, 22, 1) * .5
def hat(): return nz(.04, 90, 1) * .25

# ---- sfx ----
def coin():  return np.concatenate([pulse(midi(83), .07, .5), pulse(midi(88), .35, .5, decay=8)])
def jump():  t = tt(.25); return pulse_f(midi(60) * 2 ** (t / .25 * 1.2), .25) * np.exp(-t * 6) * .8
def bump():  t = tt(.12); return tri(110, .12) * np.exp(-t * 20) * 1.5
def powerup(base=72):
    return np.concatenate([pulse(midi(base + s), .05, .25) for s in (0, 4, 7, 12, 16, 19, 24)])
def beep(m, d=.18): return pulse(midi(m), d, .5, decay=4)
def blip(m): return pulse(midi(m), .09, .25, decay=10)
def rumble(d): t = tt(d); return nz(d, 0) * .4 * np.sin(np.pi * t / d) * (.6 + .4 * np.sin(2*np.pi*14*t))
def firework(): t = tt(.6); return nz(.6, 6, 1) * .5 + np.concatenate([np.zeros(0), tri(220, .6) * np.exp(-t * 12)]) * .3

# ---- harmony (C major) ----
CH = {'C': [48, 60, 64, 67], 'Am': [45, 57, 60, 64], 'F': [41, 53, 57, 60], 'G': [43, 55, 59, 62], 'Em': [40, 55, 59, 64]}
MEL = {'C': [72, 0, 76, 79, 84, 0, 79, 76], 'Am': [76, 0, 72, 76, 81, 0, 76, 72],
       'F': [77, 0, 81, 84, 81, 79, 77, 76], 'G': [79, 0, 83, 86, 83, 0, 79, 74], 'Em': [76, 79, 83, 79, 76, 0, 71, 0]}
def bar(bt, name, lead=True, drums=True, arp=True, lvl=1.0):
    ch = CH[name]
    for e in range(8):
        st = bt + e * BEAT / 2
        add(tri(midi(ch[0] - 12 + (12 if e % 2 else 0)), .23), st, .5 * lvl)
        if drums:
            if e in (0, 4): add(kick(), st, .6 * lvl)
            if e in (2, 6): add(snare(), st, .55 * lvl)
            add(hat(), st, .5 * lvl, pan=.2)
        if lead and MEL[name][e]:
            ln = .22 if (e + 1 < 8 and MEL[name][e + 1]) or e == 7 else .47
            add(pulse(midi(MEL[name][e]), ln, .25), st, .13 * lvl, pan=-.1)
    if arp:
        for s in range(32):
            add(pulse(midi(ch[1:][s % 3] + 12), .06, .125), bt + s * .0625, .045 * lvl, pan=.3)

# ---- 0–6: title + insert coin + countdown ----
for b, name in enumerate(['C', 'Am']):
    bar(b * 2, name, lead=False, drums=False, lvl=.8)
add(coin(), 1.0, .35)
title = [(2.0, 72, .2), (2.25, 76, .2), (2.5, 79, .2), (2.75, 84, .45), (3.25, 83, .2), (3.5, 84, .45)]
for t0, m, d in title: add(pulse(midi(m), d, .5), t0, .16)
for i, m in enumerate([60, 60, 60]): add(beep(m), 4.0 + i * .5, .3)
add(beep(72, .4), 5.5, .32)

# ---- 6–26: running level (bars C Am F G …) ----
PROG = ['C', 'Am', 'F', 'G'] * 2 + ['C', 'Am']
for b, name in enumerate(PROG): bar(6 + b * 2, name)
for i in range(5):
    th = 6 + 4 * i + 1.5
    add(jump(), th - .35, .3); add(bump(), th, .5); add(powerup(72 + (i % 2) * 5), th + .05, .14, pan=.2)
    for tc in (th + 1.1, th + 1.5): add(coin(), tc, .22, pan=-.2)

# ---- 26–30: door ----
bar(26, 'F', lvl=.9); bar(28, 'G', lead=False, drums=False, lvl=.7)
for i in range(5): add(blip(72 + i * 4), 28.0 + i * .3, .3, pan=(i - 2) * .2)
add(rumble(1.0), 29.0, .5)
for i in range(8): add(blip(84 + (i % 2) * 7), 29.55 + i * .055, .18)

# ---- 30–36: reveal fanfare ----
fan = [(30.0, 72, .15), (30.15, 72, .15), (30.3, 72, .15), (30.45, 76, .45), (30.95, 79, .2), (31.2, 84, .7)]
for t0, m, d in fan:
    add(pulse(midi(m), d, .5), t0, .2); add(pulse(midi(m - 12), d, .25), t0, .1)
for t0 in (30.0, 32.0, 34.0): add(firework(), t0, .5, pan=rng.uniform(-.5, .5))
for b, name in enumerate(['F', 'G', 'C']): bar(32 + b * 2, name, lvl=1.05) if b < 2 else bar(32 + b * 2, 'Em', lvl=1.05)
# ---- 36–38: "level clear" jingle ----
clear = [(36.0, 72), (36.12, 76), (36.24, 79), (36.36, 84), (36.48, 88), (36.6, 91)]
for t0, m in clear: add(pulse(midi(m), .11, .5), t0, .18)
add(pulse(midi(96), .9, .5, decay=3), 36.72, .2)
add(tri(midi(36), 1.0), 36.72, .5)

mix = np.stack([L, R], 1); mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
fade = np.ones(N); fn = int(.8 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None] * .92
out = sys.argv[1] if len(sys.argv) > 1 else 'music3.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
