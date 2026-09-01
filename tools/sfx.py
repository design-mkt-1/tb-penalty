"""Render the sound effect the page was missing.

Five of the six moments that make a noise already had a file. One did not: the
confetti burst that follows a target being hit. It is written here rather than
sourced, for the same reason tools/ball_sheet.py draws the ball -- the output
is reproducible from the repository, carries no third-party licence onto a
commercial landing page, and can be re-tuned by editing a number instead of
finding another clip that nearly fits.

    python tools/sfx.py

Deterministic: every random draw comes from a seeded generator, so a rerun
writes byte-identical files and a diff means somebody changed the recipe.

Requires numpy (already needed by ball_sheet.py) and lameenc for the MP3
write -- `pip install lameenc`. Neither is needed to run the site.
"""
import numpy as np
import lameenc

SR = 44100
BITRATE = 128            # matches the five files already in assets/audio/
OUT = "assets/audio/"


# ── helpers ──────────────────────────────────────────────────────

def seconds(t):
    return int(SR * t)


def shape(x, lo=None, hi=None, order=4):
    """Filter in the frequency domain.

    One-pole magnitudes applied to the spectrum, which needs no filter state
    and no scipy. lo is a high-pass corner, hi a low-pass corner, both in Hz.

    order is what makes it usable on noise. A single pole rolls off 6dB an
    octave, and against a flat spectrum that is barely a filter at all: the
    first cut of this file asked for a 7kHz low-pass on the confetti and got
    a burst whose energy still centred on 9.8kHz, which is hiss rather than
    paper. Four cascaded poles is 24dB an octave and actually removes what it
    was pointed at. Measure the centroid after changing this, not the corner.
    """
    spec = np.fft.rfft(x)
    freq = np.fft.rfftfreq(len(x), 1.0 / SR)
    gain = np.ones_like(freq)
    if lo:
        gain *= (freq / np.sqrt(freq ** 2 + lo ** 2)) ** order
    if hi:
        gain *= (hi / np.sqrt(freq ** 2 + hi ** 2)) ** order
    return np.fft.irfft(spec * gain, n=len(x))


def decay(n, tau, attack=0.002):
    """Fast attack, exponential fall. tau is the time to 1/e, in seconds."""
    t = np.arange(n) / SR
    rise = np.clip(t / max(attack, 1e-6), 0, 1)
    return rise * np.exp(-t / tau)


def normalise(x, peak):
    top = np.max(np.abs(x))
    return x * (peak / top) if top > 0 else x


def fade_out(x, t=0.02):
    """A buffer that stops mid-swing clicks. Always end on silence."""
    n = min(seconds(t), len(x))
    x[-n:] *= np.linspace(1, 0, n)
    return x


def write(name, x):
    x = fade_out(normalise(x, 0.89))
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")

    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    mp3 = enc.encode(pcm.tobytes()) + enc.flush()

    path = OUT + name + ".mp3"
    with open(path, "wb") as f:
        f.write(mp3)
    print("%-14s %5.2fs  %6d bytes" % (path, len(x) / SR, len(mp3)))


# ── confetti ─────────────────────────────────────────────────────

def confetti(rng):
    """The burst, then the paper coming down.

    Three layers. The pop is the cannon going off and is over in a tenth of a
    second. The sparkle is thirty short high pings scattered across the first
    half, which is what reads as *paper* rather than as a snare hit. The
    flutter is band-passed noise breathing under all of it while the bits
    fall, and it is the layer that decides how long the sound feels.

    Timed against js/game.js, which fires TBFx.burst 180ms after the ball
    crosses the line and holds the celebrate state for 1500ms.
    """
    n = seconds(0.85)
    out = np.zeros(n)

    # The pop: broadband, gone almost immediately, no low end to fight cheer.
    pop = _noise(n, rng) * decay(n, 0.035, attack=0.0008)
    out += shape(pop, lo=500, hi=3400) * 0.85

    # The sparkle: short pings, high and randomly placed, each its own decay.
    for _ in range(30):
        at = seconds(rng.uniform(0.01, 0.45))
        length = seconds(rng.uniform(0.02, 0.06))
        if at + length > n:
            continue
        freq = rng.uniform(2600, 6200)
        t = np.arange(length) / SR
        ping = np.sin(2 * np.pi * freq * t) * decay(length, 0.012, attack=0.0004)
        out[at:at + length] += ping * rng.uniform(0.06, 0.16)

    # The flutter: the fall. Amplitude wobbles so it is paper, not a hiss.
    flutter = _noise(n, rng)
    wobble = 1 + 0.6 * normalise(shape(_noise(n, rng), hi=14, order=2), 1.0)
    flutter *= wobble * np.exp(-np.arange(n) / SR / 0.30)
    out += shape(flutter, lo=1400, hi=5200) * 0.30

    return out


def _noise(n, rng):
    return rng.standard_normal(n)


# ── ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    write("confetti", confetti(np.random.default_rng(20260831)))
