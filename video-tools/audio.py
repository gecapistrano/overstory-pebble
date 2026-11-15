# Builds the soundtrack: voiceover + synthesized SFX synced to the animations + a soft music bed.
import json, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SR = 48000
DUR = 109.0
N = int(DUR * SR)
rng = np.random.default_rng(7)
t_ = lambda d: np.arange(int(d * SR)) / SR

def env(n, a=0.002, d=0.1):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def bell(f, d=1.0, amp=1.0):
    t = t_(d)
    s = sum(w * np.sin(2 * np.pi * f * m * t) * np.exp(-t / (d * k)) for m, w, k in [(1, 1, .35), (2.01, .35, .2), (3.02, .18, .12), (4.1, .08, .08)])
    return amp * s * np.minimum(1, t / .003)

def tap():
    n = int(.05 * SR); t = np.arange(n) / SR
    return .55 * (rng.standard_normal(n) * np.exp(-t / .004) * .5 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t / .012))

def pop(f0=900, f1=480):
    d = .09; t = t_(d); f = np.linspace(f0, f1, len(t)); ph = 2 * np.pi * np.cumsum(f) / SR
    return .5 * np.sin(ph) * env(len(t), .002, .03)

def tick():
    t = t_(.03); return .35 * np.sin(2 * np.pi * 3200 * t) * env(len(t), .001, .006)

def whoosh(d=.6, lo=300, hi=3000, amp=.5, rise=True):
    n = int(d * SR); x = rng.standard_normal(n); out = np.zeros(n); seg = 1024
    for i in range(0, n, seg):
        k = i / n; c = lo + (hi - lo) * (k if rise else 1 - k)
        sos = butter(2, [max(60, c * .6), min(SR / 2 - 100, c * 1.6)], btype="band", fs=SR, output="sos")
        out[i:i + seg] = sosfilt(sos, x[i:i + seg])
    t = np.arange(n) / n
    return amp * out * np.sin(np.pi * t) ** 1.6 * 3

def chime():
    a = bell(1318.5, 1.4, .35); b = bell(1975.5, 1.4, .3)
    o = np.zeros(len(a) + int(.12 * SR)); o[:len(a)] += a; o[int(.12 * SR):] += b; return o
def ding():
    a = bell(1568, .9, .32); b = bell(2093, .9, .26); o = np.zeros(len(a) + int(.09 * SR)); o[:len(a)] += a; o[int(.09 * SR):] += b; return o
def success():
    notes = [1046.5, 1318.5, 1568, 2093]; o = np.zeros(int(2.2 * SR))
    for i, f in enumerate(notes):
        b = bell(f, 1.6, .28); s = int(i * .09 * SR); o[s:s + len(b)] += b[:len(o) - s]
    return o
def micon():
    o = np.zeros(int(.25 * SR)); a = pop(660, 700); b = pop(990, 1040); o[:len(a)] += a; o[int(.09 * SR):int(.09 * SR) + len(b)] += b; return o * .8
def clock():
    o = np.zeros(int(1.6 * SR))
    for i in range(4):
        t = t_(.04); s = np.sin(2 * np.pi * (2400 if i % 2 == 0 else 1900) * t) * env(len(t), .001, .008) * .35
        st = int(i * .4 * SR); o[st:st + len(s)] += s
    return o
def sparkle():
    o = np.zeros(int(1.0 * SR))
    for i, f in enumerate([2637, 3136, 3520, 4186, 3951]):
        b = bell(f, .5, .12); s = int(i * .06 * SR); o[s:s + len(b)] += b[:len(o) - s]
    return o
def thud():
    t = t_(.25); f = np.linspace(140, 55, len(t)); return .7 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), .002, .07)
def pluck(f):
    t = t_(.6); return .25 * (np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)) * env(len(t), .002, .12)

L = np.zeros(N); Rr = np.zeros(N)
def add(sig, at, gain=1.0, pan=0.0):
    s = int(at * SR); e = min(N, s + len(sig)); sig = sig[:e - s] * gain
    L[s:e] += sig * (1 - max(0, pan)); Rr[s:e] += sig * (1 + min(0, pan))

# ---- SFX cue sheet (seconds) ----
C = [
 (whoosh(.9, 200, 1600, .35), 0.05), (pop(700, 420), .55), (pop(880, 500), 1.0, .5), (pop(880, 500), 2.25, .5), (whoosh(1.0, 400, 4000, .45), 5.6),
 (tap(), 8.0), (micon(), 8.1),
 (whoosh(.5, 600, 2500, .25), 17.3),
 *[(pop(950 - i * 40, 520), 18.95 + i * .55, .55) for i in range(6)],
 (sparkle(), 21.9, .5),
 *[(tick(), w + .15) for w in [23.1, 23.7, 24.3, 24.9, 25.5]],
 (whoosh(.8, 500, 3500, .45), 26.0), (chime(), 27.0),
 (whoosh(.6, 500, 2500, .25), 28.7, .6), (whoosh(.6, 500, 2500, .25), 29.6, .6),
 (whoosh(1.5, 300, 2500, .25), 31.9),
 *[(pop(1000 + i * 30, 560), 32.45 + i * .24, .55) for i in range(6)],
 (whoosh(.6, 500, 3000, .35), 34.3), (micon(), 34.75), (chime(), 37.4), (tap(), 39.4),
 *[(pop(820, 480), 42.05 + i * .2, .45) for i in range(4)],
 (ding(), 44.8), (tap(), 46.15), (sparkle(), 46.35, .7), (whoosh(.7, 400, 2500, .35), 46.9), (pop(), 47.5, .5),
 (tap(), 50.4), (whoosh(.7, 300, 2000, .35), 50.6), (pop(), 50.9, .5), (tap(), 54.75), (whoosh(.4, 600, 2600, .3), 55.05), (tap(), 56.0), (whoosh(.5, 800, 5000, .4), 56.1),
 (whoosh(1.5, 300, 3000, .4), 57.1), (pop(), 57.4, .4), (ding(), 58.6), (whoosh(.7, 400, 2200, .3), 59.5),
 *[(pop(800 + i * 60, 450), 60.6 + i * .4, .4) for i in range(3)],
 *[(tick(), 63.0 + i * .6, 1.4) for i in range(4)], (tap(), 65.7), (success(), 66.0, .9),
 (tap(), 67.0), (whoosh(.4, 600, 2600, .3), 67.2), (tap(), 68.4), (whoosh(.5, 800, 5000, .4), 68.5), (ding(), 69.4), (tap(), 71.15), (pop(), 71.35, .5),
 (clock(), 73.4, 1.0), (tap(), 76.75), (whoosh(.8, 800, 5000, .45), 76.95), (ding(), 77.8), (tap(), 79.15), (pop(), 79.35, .5),
 (pop(600, 400), 80.2, .5), (success(), 80.8, 1.0), (whoosh(.9, 300, 2500, .35), 81.9),
 *[(whoosh(.4, 500, 2200, .2), 82.6 + i * .22) for i in range(4)], *[(pop(900 + i * 80, 500), 83.8 + i * .3, .6) for i in range(4)],
 (whoosh(1.0, 300, 2500, .4), 88.0), *[(pop(1000, 560), a, .5) for a in [89.4, 90.3, 91.2]], (whoosh(1.2, 400, 1800, .3), 92.8),
 (tap(), 96.55), (chime(), 96.75),
 (whoosh(.6, 2500, 400, .35, False), 101.0), (thud(), 101.7, .9), *[(pluck(f), 101.5 + i * .07, .8) for i, f in enumerate([523.3, 659.3, 784, 1046.5, 784, 1046.5])],
 (chime(), 102.5, .8), (sparkle(), 103.7, .5),
]
for c in C:
    sig, at = c[0], c[1]; g = c[2] if len(c) > 2 else 1.0
    add(sig, at, g * .8, pan=((at * 7) % 3 - 1) * .15)

# ---- voiceover ----
VO = {"hook": 1.0, "tap": 7.2, "think": 17.6, "vibe": 31.5, "lang": 41.5, "pick": 49.6, "agent": 57.0, "nudge": 73.6, "dash": 88.5, "end": 101.9}
vo = np.zeros(N)
for k, at in VO.items():
    x, sr = sf.read(f"vo/{k}.wav")
    if x.ndim > 1: x = x.mean(1)
    x = resample_poly(x, SR, sr)
    s = int(at * SR); vo[s:s + len(x)] += x[:N - s]
vo *= .95 / (np.abs(vo).max() + 1e-9)

# ---- music bed: warm pad + soft plucks, 100 bpm ----
def note(m): return 440 * 2 ** ((m - 69) / 12)
chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]]  # Cmaj7 Am7 Fmaj7 G
bar = 2.4; mus = np.zeros(N)
tt = np.arange(N) / SR
for ci in range(int(DUR / (bar * 2)) + 1):
    ch = chords[ci % 4]; st = ci * bar * 2; d = bar * 2 + .6
    s = int(st * SR); n = min(N - s, int(d * SR))
    if n <= 0: break
    t = np.arange(n) / SR
    e = np.minimum(1, t / .8) * np.minimum(1, (d - t) / .8)
    pad = sum(np.sin(2 * np.pi * note(m) * t + i) * .5 + np.sin(2 * np.pi * note(m) * 1.003 * t) * .35 + .12 * np.sin(4 * np.pi * note(m) * t) for i, m in enumerate(ch))
    mus[s:s + n] += pad * e * .05
    for j in range(16):  # eighth-note arpeggio
        f = note(ch[j % 4] + 24); ps = s + int(j * .3 * SR); p = pluck(f) * .35
        if ps >= N: break
        e2 = min(N, ps + len(p)); mus[ps:e2] += p[:e2 - ps]
sos = butter(2, 2600, btype="low", fs=SR, output="sos"); mus = sosfilt(sos, mus)
mus *= np.minimum(1, tt / 1.5) * np.clip((DUR - tt) / 2.0, 0, 1)
# duck under the voice
venv = np.abs(vo); k = int(.25 * SR); venv = np.convolve(venv, np.ones(k) / k, mode="same"); duck = 1 - .55 * np.clip(venv / (venv.max() * .25), 0, 1)
mus = mus * duck / (np.abs(mus).max() + 1e-9) * .22

Lm = L * .55 + vo + mus; Rm = Rr * .55 + vo + mus
mix = np.stack([Lm, Rm], 1)
mix /= max(1, np.abs(mix).max() / .95)
sf.write("soundtrack.wav", mix.astype(np.float32), SR)
print("ok", mix.shape, np.abs(mix).max())
