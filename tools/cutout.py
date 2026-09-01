"""Turn the raw Nano Banana Pro renders into game-ready sprites, and measure
the pitch plate the rest of the page is hung off.

The one character render — the dummy rack — sits on a flat mid-grey backdrop.
This script keys that backdrop out, drops isolated artefacts the model
hallucinated, trims nothing, downscales and writes WebP.

Two keying strategies, because sources differ:

* grey  — the backdrop is achromatic and mid-bright, while the subject is
          saturated (the red plastic) or much brighter. The backdrop predicate
          is flood-filled in from the frame edge, so achromatic parts *inside*
          the subject (the black castors) survive.
* rgba  — the source already carries its alpha and only needs resizing.

It also does two things to the plate, and both matter more than the keying:

**It lengthens the foreground.** The photograph is 16:9 and a phone is not, so
pinning the goal where the composition wants it leaves the image's own bottom
edge well above the ball. `lengthen()` stretches the last rows into more grass,
blurs across the blades, darkens towards the bottom and crossfades the join.

**It measures the goal.** The camera is three-quarter, so the goal is not a
rectangle on screen — it is a quadrilateral, and `find_goal_quad()` finds its
four corners on the file that actually ships. css/game.css hangs the targets,
the ball's ground line and the caption off those four points. They are printed
by this script rather than typed in by hand off a different version of the
image.

An earlier version of this tool also normalised a goalkeeper's ten poses to one
scale, measured off the width of his head. He is gone — the scene is target
practice now — and so is that machinery. It is in the history if a second
character pose ever comes back.

Usage:
    python tools/cutout.py

Input:  raw/_raw-*.png         (kept outside the served tree, git-ignored)
Output: assets/img/*.webp
"""

import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'img')
RAW = os.path.join(ROOT, 'raw')

QUALITY = {}

# The sprite is exported on the FULL uncropped canvas rather than trimmed to
# its own bounding box. css/game.css then places it by a fraction of that
# canvas and js/game.js tests the trajectory against the same fractions, so the
# two agree without either of them knowing how much empty margin the model left
# around the object.
#
# name -> (source, key mode, keep-largest-blob, target height)
#
# keep_largest is off: the rack is five figures bolted to a frame, and while
# they are one connected blob today, a castor photographed clear of the frame
# would not be — and losing a wheel to a tidy-up is a worse failure than
# keeping a speck.
JOBS = {
    'dummies': ('_raw-dummies.png', 'grey', False, 520),
}

# The pitch plate keeps its background; it needs resizing and a longer
# foreground. The goal, the penalty area, the arc and the spot are all painted
# into it in one perspective, and css/game.css hangs everything off where they
# land — which this script measures and prints, so the numbers in the CSS come
# out of the same run that makes the image.
#
# name -> (source, output width, quality, foreground to add, goal search band)
#
# The band is (y0, y1, x0, x1) as fractions of the resized image, and it is
# where the goal is in this particular photograph — see find_goal_quad() for
# why an unbounded search cannot work.
#
# The added foreground is the reason the last field is not zero. The plate is
# 16:9 and a phone is not: pinning the painted goal where the composition wants
# it leaves the photograph's own bottom edge well above the ball, and the ball
# then sits on black. The near grass is almost uniform, so the last rows stretch
# into more of it convincingly — this is the same trick fs-penalty's plate
# needed and for the same reason.
PLATES = {
    'pitch-training': ('_raw-pitch-training.png', 1920, 82, 0.42,
                       (0.40, 0.66, 0.28, 0.72)),
}


def border_ring(shape, width=6):
    ring = np.zeros(shape, bool)
    ring[:width, :] = ring[-width:, :] = True
    ring[:, :width] = ring[:, -width:] = True
    return ring


def grey_background(rgb):
    """Flood the achromatic backdrop in from the frame edge, then take the
    holes the flood could not reach.

    The flood alone is not enough: anything with a limb near its body encloses
    a wedge of backdrop the flood cannot reach from the frame edge, and that
    wedge then survives as a light grey patch stamped on the middle of the
    sprite. The dummy rack is full of them — between each figure's folded arms
    and its chest, and inside every triangle of the frame.

    Deleting every candidate pixel instead of flooding would fix that and take
    any dark achromatic part of the subject with it, which is the bug the flood
    exists to prevent. So the enclosed regions are recovered separately, and
    only those whose mean luma actually matches the backdrop are dropped. A
    black castor sits at luma ~40 against a backdrop at ~170: not close."""
    a = rgb.astype(np.int16)
    chroma = a.max(axis=2) - a.min(axis=2)
    luma = a.mean(axis=2)

    ring = border_ring(rgb.shape[:2])
    lo, hi = luma[ring].min(), luma[ring].max()
    chroma_limit = max(14, int(chroma[ring].max()) + 8)

    candidate = (chroma <= chroma_limit) & (luma >= lo - 24) & (luma <= hi + 24)

    # Pad with a guaranteed-true frame so a single seed reaches the whole edge.
    h, w = candidate.shape
    padded = np.zeros((h + 2, w + 2), np.uint8)
    padded[1:-1, 1:-1] = candidate * 255
    padded[0, :] = padded[-1, :] = padded[:, 0] = padded[:, -1] = 255

    # .copy() is required: an image wrapped straight around a numpy buffer is
    # read-only, and floodfill writes into it silently doing nothing.
    img = Image.fromarray(padded, 'L').copy()
    ImageDraw.floodfill(img, (0, 0), 128, thresh=0)
    filled = np.asarray(img)

    bg = filled[1:-1, 1:-1] == 128
    if not bg.any():
        return bg

    # The holes get their own predicate rather than reusing `candidate`, and a
    # floor rather than a match against the backdrop's mean brightness.
    #
    # An enclosed wedge is backdrop in shadow: the deeper it is buried between
    # a limb and a frame the darker it reads, and the two that survived on the
    # dummy rack came in at luma 127 and 133 against a backdrop averaging 170.
    # A "within 14 of the mean" test rejects those, and widening it far enough
    # to accept them would start accepting parts of the subject. A floor works
    # instead because of what the subject is made of: the plastic is saturated
    # and fails the chroma test outright, and the castors are black at luma ~40
    # — nowhere near 90. Anything achromatic, enclosed, and brighter than that
    # floor is backdrop.
    holes = (chroma <= chroma_limit) & (luma >= 90) & ~bg

    # Erode before looking for them. components() finds regions in raster order
    # and stops after `limit` of them, and the unflooded set is mostly one- and
    # two-pixel fringe specks strung along the whole silhouette edge — thousands
    # of them, every one discovered before the loop reaches a real wedge. Two
    # pixels of erosion deletes the specks and leaves the wedges; the accepted
    # core is then grown back and intersected with the holes to recover its
    # true edge.
    for blob in components(shrink(holes, 2)):
        if blob.sum() < 40:
            continue
        bg |= grow(blob, 4) & holes

    return bg


def grow(mask, size):
    """Dilate a boolean mask by `size` pixels."""
    img = Image.fromarray((mask * 255).astype(np.uint8), 'L').copy()
    img = img.filter(ImageFilter.MaxFilter(size * 2 + 1))
    return np.asarray(img) > 127


def components(mask, limit=40):
    """The connected regions of a boolean mask, largest first.

    `limit` caps how many regions are *discovered*, not how many are returned,
    and discovery runs in raster order — so a mask carrying a cloud of specks
    will spend every slot on them and never reach the region you wanted. Clean
    the mask before calling this, do not raise the limit."""
    arr = (mask * 255).astype(np.uint8)
    found = []
    tag = 250
    while tag > 250 - limit:
        remaining = np.argwhere(arr == 255)
        if remaining.size == 0:
            break
        y, x = remaining[0]
        img = Image.fromarray(arr, 'L').copy()
        ImageDraw.floodfill(img, (int(x), int(y)), tag, thresh=0)
        arr = np.asarray(img).copy()
        found.append(arr == tag)
        tag -= 1
    found.sort(key=lambda b: -b.sum())
    return found


def shrink(mask, size):
    """Erode a boolean mask by `size` pixels."""
    img = Image.fromarray((mask * 255).astype(np.uint8), 'L').copy()
    img = img.filter(ImageFilter.MinFilter(size * 2 + 1))
    return np.asarray(img) > 127


def largest_blob(fg):
    """Keep only the biggest connected run of foreground.

    The model occasionally leaves a spare boot or a spare ball floating in the
    frame; those are separate blobs and get dropped here.
    """
    blobs = components(fg)
    return blobs[0] if blobs else fg


def key(source, mode, keep_largest):
    """Read a raw render and return it as RGBA with the backdrop removed."""
    src = Image.open(os.path.join(RAW, source))

    if mode == 'rgba':
        return src.convert('RGBA')

    rgb = np.asarray(src.convert('RGB'))
    bg = grey_background(rgb)
    fg = ~bg

    if keep_largest:
        # A thin bright feature ringed by neutral pixels can be severed from
        # the body by the flood eating through that ring, and then looks like a
        # stray artefact and gets dropped. Find the blob on a slightly grown
        # foreground so those bridges survive, then intersect back with the
        # tight mask to keep the edge crisp.
        loose = ~shrink(bg, 3)
        fg = largest_blob(loose) & fg

    alpha = Image.fromarray((fg * 255).astype(np.uint8), 'L')
    # A sub-pixel soften kills the stair-stepping the hard mask leaves behind.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))

    out = Image.fromarray(rgb).convert('RGBA')
    out.putalpha(alpha)
    return out


def save(name, img, height):
    if height and img.height != height:
        scale = height / img.height
        img = img.resize((max(1, round(img.width * scale)), height), Image.LANCZOS)

    dst = os.path.join(IMG, name + '.webp')
    img.save(dst, 'WEBP', quality=QUALITY.get(name, 90), method=6)
    return dst, img


def lengthen(img, extend):
    """Add `extend` of the image's own height to the bottom, stretched out of
    its last rows.

    The foreground of this plate is close-up grass under floodlight: nearly
    uniform, with mowing stripes running away from the camera. Stretching it
    smears the stripes lengthwise, which is what perspective does to them
    anyway, so the join does not read as one. A darkening ramp over the added
    part does the rest — it is the bottom of the frame, furthest from the
    lights, and the page's own vignette is heading the same way."""
    w, h = img.size
    extra = round(h * extend)
    if extra < 1:
        return img

    # Taken from a band rather than the single last row: one row of noise
    # stretched over hundreds of pixels is a set of vertical streaks.
    band = img.crop((0, h - max(8, round(h * 0.12)), w, h))
    band = band.resize((w, extra), Image.LANCZOS)

    # Stretching a band by eight times leaves the blades of grass drawn out
    # into ribbons. A blur across them, and none along them, turns the ribbons
    # back into an out-of-focus foreground — which is what the bottom of a
    # long-lens frame looks like anyway.
    band = band.filter(ImageFilter.GaussianBlur(2.2))

    # Darken towards the bottom of the frame. It is furthest from the
    # floodlights and the page's own vignette is heading the same way, so this
    # is the cheapest possible way to stop anyone reading the smear.
    shade = Image.new('L', (1, extra))
    for y in range(extra):
        t = y / max(1, extra - 1)
        shade.putpixel((0, y), int(255 * (1 - 0.72 * t * t)))
    band = Image.composite(band, Image.new('RGB', (w, extra)),
                           shade.resize((w, extra)))

    out = Image.new('RGB', (w, h + extra))
    out.paste(img, (0, 0))
    out.paste(band, (0, h))

    # And blend the join. A hard paste leaves a horizontal edge exactly where
    # the photograph stops, which is the one thing that would give the whole
    # trick away.
    seam = max(4, round(extra * 0.22))
    top = img.crop((0, h - seam, w, h))
    fade = Image.new('L', (1, seam))
    for y in range(seam):
        fade.putpixel((0, y), int(255 * (1 - y / max(1, seam - 1))))
    out.paste(Image.composite(top, out.crop((0, h, w, h + seam)),
                              fade.resize((w, seam))), (0, h))
    return out


def find_goal_quad(img, band):
    """Locate the painted goal and return its four corners as fractions.

    `band` is (y0, y1, x0, x1) as fractions of the image: where to look. It is
    not tuning — it is the answer to a real ambiguity. A floodlight pylon is
    also a tall solid vertical bright thing and can be three times the height
    of a goalpost, so an unbounded search returns a pylon every time. The band
    says "the goal is in this part of the picture", which is a fact about the
    photograph, and the four numbers that come out are then measured rather
    than assumed.

    If a mast stands directly behind an upright, the two merge into one column
    run whose top is the mast's. Start the band's y0 at the crossbar and the
    mast is excluded — that is what the band is for, and it is why there is no
    automatic crossbar detector here. One was written and removed: a crossbar
    is white, long and horizontal, and so is a painted touchline. It clamped
    the goal to twenty pixels tall on the first plate that had bright grass.

    The camera is three-quarter, so the goal is not a rectangle on screen. Its
    mouth is a quadrilateral: the two posts are still vertical, but one is
    nearer than the other, so they differ in height and their tops and bases
    do not line up. css/game.css hangs the targets, the ball's ground line and
    the caption off these four points.

    Finding them by the extremes of the bright pixels does not work here and it
    is worth saying why. Seen at an angle, the goal's widest white thing is not
    a post — it is the side and back netting running away behind the near post,
    which reaches further across the frame than either upright. An extremes
    finder locks onto that and reports a goal half again as wide as it is.

    What separates a post from netting is that a post is TALL and continuous.
    So the search is for the two columns carrying the longest vertical run of
    bright pixels: netting is a mesh, the crossbar is horizontal and
    contributes almost nothing vertically, and the second post is taken outside
    a window around the first so one upright cannot be found twice.

    Two details are what make it work on a dusk plate rather than a daylight
    one, and both were arrived at by measuring what the search actually saw:

    * The mask is widened sideways first. A post is two or three pixels across
      at this size and anti-aliased, so no single column is solidly bright and
      an exact-column scan finds nothing at all — the longest run in the whole
      goal came back as eight pixels.
    * The run tolerates a few dark pixels inside it. A real post has netting
      crossing it and floodlight falling unevenly down it; requiring an
      unbroken run measures the lighting, not the post."""
    a = np.asarray(img).astype(int)
    h, w = a.shape[:2]
    luma = a.mean(axis=2)
    chroma = a.max(axis=2) - a.min(axis=2)

    y0, y1, x0, x1 = (int(h * band[0]), int(h * band[1]),
                      int(w * band[2]), int(w * band[3]))
    window = np.zeros_like(luma, bool)
    window[y0:y1, x0:x1] = True
    bright = window & (luma > 100) & (chroma < 60)
    if not bright.any():
        return None
    bright = grow(bright, 2) & window

    gap_allowed = 3

    def longest(col):
        """Longest run down one column, tolerating `gap_allowed` dark pixels."""
        best = best_s = best_e = 0
        start = last = None
        gap = 0
        for y in range(y0, y1):
            if col[y]:
                if start is None:
                    start = y
                last = y
                gap = 0
            elif start is not None:
                gap += 1
                if gap > gap_allowed:
                    if last - start + 1 > best:
                        best, best_s, best_e = last - start + 1, start, last
                    start = None
                    gap = 0
        if start is not None and last - start + 1 > best:
            best, best_s, best_e = last - start + 1, start, last
        return best, best_s, best_e

    runs = np.zeros(w, int)
    tops = np.zeros(w, int)
    bases = np.zeros(w, int)
    for x in range(x0, x1):
        runs[x], tops[x], bases[x] = longest(bright[:, x])

    first = int(np.argmax(runs))
    if runs[first] < 20:
        return None

    # The second post is the FURTHEST strong column from the first, not the
    # strongest one left.
    #
    # Strongest was tried and it does not work: the netting hangs in bright
    # vertical folds, and grown and gap-tolerant a fold can out-run a real
    # upright. Taking the strongest put the far post a quarter of the way
    # across the mouth and reported a goal half its true width. Distance is the
    # discriminator that survives, because the two things being looked for are
    # by construction at the two ends of a band drawn around the goal — and a
    # fold is always somewhere between them.
    #
    # "Strong" is measured against the first post rather than as an absolute:
    # the far post is shorter, being further away, but not by half.
    masked = runs.copy()
    guard = max(8, (x1 - x0) // 8)
    masked[max(0, first - guard):first + guard + 1] = 0
    ok = np.where(masked >= runs[first] * 0.55)[0]
    if not ok.size:
        return None
    second = int(ok[np.argmax(np.abs(ok - first))])

    # Reported LEFT and RIGHT by where they are on screen, not near and far by
    # depth.
    #
    # Depth is the tempting name — one post is closer than the other and that
    # is why it is taller — but it is the wrong one to publish, because which
    # side is nearer flips the moment the camera moves across the goal's axis.
    # Everything downstream would then have to know which way round today's
    # plate is: the aim would map a rightward drag to the left of the goal, and
    # the targets would swap sides, silently, on a plate that looked fine.
    #
    # Nothing downstream needs to know about depth anyway. The perspective is
    # already carried by each post having its own top and base — the taller one
    # is the nearer one, and interpolating between them reproduces that whether
    # it is on the left or the right.
    a_post = (first, tops[first], bases[first])
    b_post = (second, tops[second], bases[second])
    left, right = sorted((a_post, b_post), key=lambda p: p[0])

    return {
        'left':  (left[0] / w, left[1] / h, left[2] / h),
        'right': (right[0] / w, right[1] / h, right[2] / h),
    }


def main():
    for name, (source, mode, keep, height) in JOBS.items():
        path = os.path.join(RAW, source)
        if not os.path.exists(path):
            print('skip (missing source):', name)
            continue
        img = key(source, mode, keep)
        dst, img = save(name, img, height)

        box = img.getbbox()
        w, h = img.size
        print('%-16s %sx%-5s  object y %.4f-%.4f  x %.4f-%.4f  %5.0f KB'
              % (name, w, h, box[1] / h, box[3] / h, box[0] / w, box[2] / w,
                 os.path.getsize(dst) / 1024))
        print('      those four fractions are DUMMY_BODY in js/game.js: the '
              'object inside its own canvas.')

    for name, (source, width, quality, extend, band) in PLATES.items():
        path = os.path.join(RAW, source)
        if not os.path.exists(path):
            print('skip (missing source):', name)
            continue
        img = Image.open(path).convert('RGB')
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)

        # Measured before the foreground is added, so the band above is a band
        # of the photograph rather than of the photograph plus the invented
        # grass under it.
        goal = find_goal_quad(img, band)
        if extend:
            img = lengthen(img, extend)
            if goal and goal is not None:
                # Everything is appended below the goal, so only the vertical
                # fractions move, and they move by exactly the growth.
                for post in ('left', 'right'):
                    x, top, base = goal[post]
                    goal[post] = (x, top / (1 + extend), base / (1 + extend))

        dst = os.path.join(IMG, name + '.webp')
        img.save(dst, 'WEBP', quality=quality, method=6)
        print('%-16s %sx%-5s %38s %5.0f KB'
              % (name, img.width, img.height, '', os.path.getsize(dst) / 1024))
        if goal:
            print('    painted goal, as fractions of the plate — css/game.css:')
            print('      --goal-left:  %.4f  top %.4f  base %.4f' % goal['left'])
            print('      --goal-right: %.4f  top %.4f  base %.4f' % goal['right'])


if __name__ == '__main__':
    main()
