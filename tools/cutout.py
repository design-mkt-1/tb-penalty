"""Turn the raw Nano Banana Pro renders into game-ready sprites.

Each raw character render sits on a flat mid-grey backdrop. This script keys
that backdrop out, drops isolated artefacts the model hallucinated (a stray
boot, a stray ball), normalises the figure's scale, plants it on a common
ground line, downscales and writes WebP.

Two keying strategies, because the sources differ:

* grey  — the backdrop is achromatic and mid-bright, while the subject is
          either saturated (the red kit, the gloves) or much brighter (white
          boots). The backdrop predicate is flood-filled in from the frame
          edge, so achromatic parts *inside* the subject (black shorts, black
          socks, black boots) survive.
* rgba  — the source already carries its alpha and only needs resizing.

Why the normalise pass exists
-----------------------------
fs-penalty could export its keeper poses straight off the render because every
pose came out of one camera at one scale. These do not: asking an image model
for "the same goalkeeper, same scale, different pose" gets the character and
the kit right and the scale wrong by up to a fifth. A sprite that changes size
when it swaps is the single loudest tell that this is a slideshow rather than
an animation, so the size is taken away from the model and computed here.

The invariant is the silhouette's *area*. A full-body figure covers roughly the
same number of pixels whether it is standing or diving — far more stable than
bounding-box height, which a dive turns on its side, or width, which arms
open and close. Scale is then sqrt(reference area / this area), because area
goes as the square of height.

The anchor is the bottom of the subject's bounding box, laid on one ground
line for every pose. A dive's lowest point is its trailing boot rather than a
planted foot, so a high dive comes out standing on the grass — that is what
POSES[..].y in js/animator.js is for, and it is the one seam where a pose is
allowed an exception. Nothing here guesses at it.

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

# Character sprites are exported on the FULL uncropped canvas. Every raw render
# shares one frame, so keeping the canvas keeps every pose in one coordinate
# space: swapping the sprite cannot make the character jump in position.
# Trimming each pose to its own bounding box would destroy that, because a
# sprawling low dive and an upright idle have wildly different boxes.
#
# name -> (source, key mode, keep-largest-blob, normalise group, target height)
#
# The normalise group names which figures are measured against each other. The
# keeper is one group and the wall another: they are different subjects at
# different distances and there is nothing to gain by making them agree.
JOBS = {
    'keeper-ready':            ('_raw-keeper-ready.png',            'grey', True, 'keeper', 640),
    'keeper-idle':             ('_raw-keeper-idle.png',             'grey', True, 'keeper', 640),
    'keeper-jump_L1':          ('_raw-keeper-jump_L1.png',          'grey', True, 'keeper', 640),
    'keeper-jump_R2':          ('_raw-keeper-jump_R2.png',          'grey', True, 'keeper', 640),
    'keeper-jump_center':      ('_raw-keeper-jump_center.png',      'grey', True, 'keeper', 640),
    'keeper-jump_center_down': ('_raw-keeper-jump_center_down.png', 'grey', True, 'keeper', 640),
    'keeper-cheer':            ('_raw-keeper-cheer.png',            'grey', True, 'keeper', 640),
    'keeper-beaten':           ('_raw-keeper-beaten.png',           'grey', True, 'keeper', 640),

    # The wall is four figures, so keep_largest would throw three of them away.
    'wall-idle':               ('_raw-wall-idle.png',               'grey', False, 'wall', 460),
    'wall-jump':               ('_raw-wall-jump.png',               'grey', False, 'wall', 460),
}

# The pose each group is measured against, and what it is measured by.
#
#   face  the width of the exposed-skin region. The goalkeeper wears gloves,
#         so the only skin in any of his poses is his head, and a head's width
#         on the sensor depends on nothing but how far away the model drew
#         him. This is the invariant that works.
#   area  the silhouette's pixel count, scale = sqrt(ratio). The fallback, and
#         all the wall can use: four heads are not one blob, and picking one of
#         them out is more machinery than a two-pose group is worth.
#
# Area was the first thing tried on the keeper and it is worth saying why it
# failed, because it sounds reasonable: a sprawling full-stretch dive covers
# far more pixels than the same man standing, so the invariant read the dive as
# "closer" and shrank it, while jump_center — arms straight up, a thin vertical
# silhouette — read as "further" and was blown up 40% until his gloves left the
# top of the canvas. Measured against the head, jump_L1 turned out to be drawn
# nearly twice the size of jump_center. The area figure was not noisy; it was
# measuring the pose.
REFERENCE = {
    'keeper': ('keeper-ready', 'face'),
    'wall':   ('wall-idle',    'area'),
}

# Per-pose correction on top of the measured invariant, for the poses the
# invariant cannot read straight. Kept explicit and tiny: if this table starts
# growing, the renders are the problem, not the maths.
#
# jump_center_down is a keeper scooping a ball off the turf with his head down
# and turned away, so the camera sees his head at an angle and reads it 40%
# narrower than it is. Everything else here faces forward within a few degrees
# and lands inside the ±8% that head rotation costs anyway.
#
# 1.67 is 40/24: the head width the other seven poses converge on, over the
# width this one measured before the correction.
ADJUST = {
    'keeper-jump_center_down': 1.67,
}

# Sprites produced by mirroring another sprite rather than by generation.
# The kit carries no asymmetric mark, so the flip is invisible.
# L and R are from the VIEWER's point of view.
MIRRORS = {
    'keeper-jump_L2': 'keeper-jump_R2',
    'keeper-jump_R1': 'keeper-jump_L1',
}

# The pitch plate keeps its background; it needs resizing and a longer
# foreground. The goal, the penalty area, the arc and the spot are all painted
# into it in one perspective, and css/game.css hangs everything off where they
# land — which this script measures and prints, so the numbers in the CSS come
# out of the same run that makes the image.
#
# name -> (source, output width, quality, how much foreground to add)
#
# The added foreground is the reason the last field is not zero. The plate is
# 16:9 and a phone is not: pinning the painted goal where the composition wants
# it leaves the photograph's own bottom edge well above the ball, and the ball
# then sits on black. The near grass is almost uniform, so the last rows stretch
# into more of it convincingly — this is the same trick fs-penalty's plate
# needed and for the same reason.
PLATES = {
    'pitch-freekick': ('_raw-pitch-freekick.png', 1920, 82, 0.55),
}


def border_ring(shape, width=6):
    ring = np.zeros(shape, bool)
    ring[:width, :] = ring[-width:, :] = True
    ring[:, :width] = ring[:, -width:] = True
    return ring


def grey_background(rgb):
    """Flood the achromatic backdrop in from the frame edge, then take the
    holes the flood could not reach.

    The flood alone is not enough here and it was not a safe assumption on
    fs-penalty either — it only happened not to bite, because that keeper
    stood with his arms away from his body in every pose. This one hangs his
    arms by his sides in `idle` and rests his hands on his hips in `beaten`,
    which encloses a wedge of backdrop between the arm and the torso. The edge
    flood cannot reach an enclosed wedge, so it survived as a light grey patch
    stamped on the middle of the sprite.

    Deleting every candidate pixel instead of flooding would fix that and take
    the black shorts with it, which is the bug the flood exists to prevent. So
    the enclosed regions are recovered separately, and only those whose mean
    luma actually matches the backdrop are dropped. The kit is charcoal at
    luma ~60 against a backdrop at ~170: the test is not close."""
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

    reference = float(luma[bg].mean())
    holes = candidate & ~bg

    # Erode before looking for the wedges. components() finds regions in raster
    # order and stops after `limit` of them, and the unflooded set is mostly
    # one- and two-pixel fringe specks strung along the whole silhouette edge —
    # thousands of them, every one discovered before the loop ever reaches an
    # arm. Two pixels of erosion deletes the specks outright and leaves the
    # wedges, which are tens of thousands of pixels each; the accepted core is
    # then grown back and intersected with the holes to recover its true edge.
    for blob in components(shrink(holes, 2)):
        if blob.sum() < 200:
            continue
        patch = grow(blob, 4) & holes
        if abs(float(luma[patch].mean()) - reference) <= 14:
            bg |= patch

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


def face(img):
    """Width of the largest exposed-skin region, in pixels, or 0 if none.

    The goalkeeper wears gloves, so the only skin anywhere in his poses is his
    head. Its width therefore varies with one thing — how far away the model
    drew him — which is exactly the thing this pipeline has to take back off
    the renders. Head yaw narrows it, so a pose with the head turned away needs
    an entry in ADJUST; nothing else does."""
    a = np.asarray(img)
    rgb = a[..., :3].astype(np.int16)
    solid = a[..., 3] > 8
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    skin = solid & (r > g) & (g > b) & (r - b > 22) & (r - b < 105) & (r > 70) & (r < 245)

    # Erode first. components() discovers regions in raster order and stops
    # after `limit` of them, so without this the specks of skin-coloured
    # fringing along the top of the sprite use up every slot and the face —
    # lower down the frame — is never reached at all. That is what made this
    # report 1px on jump_R2 and 8px on ready while getting idle right.
    skin = shrink(skin, 2)
    blobs = components(skin, limit=8)
    if not blobs:
        return 0
    ys, xs = np.where(blobs[0])
    return int(xs.max() - xs.min() + 1)


def key(source, mode, keep_largest):
    """Read a raw render and return it as RGBA with the backdrop removed."""
    src = Image.open(os.path.join(RAW, source))

    if mode == 'rgba':
        return src.convert('RGBA')

    rgb = np.asarray(src.convert('RGB'))
    bg = grey_background(rgb)
    fg = ~bg

    if keep_largest:
        # White boots are ringed by neutral pixels, and the flood eats through
        # that ring far enough to sever a boot from its sock — the boot then
        # looks like a stray artefact and gets dropped. Find the blob on a
        # slightly grown foreground so those bridges survive, then intersect
        # back with the tight mask to keep the edge crisp.
        loose = ~shrink(bg, 3)
        fg = largest_blob(loose) & fg

    alpha = Image.fromarray((fg * 255).astype(np.uint8), 'L')
    # A sub-pixel soften kills the stair-stepping the hard mask leaves behind.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))

    out = Image.fromarray(rgb).convert('RGBA')
    out.putalpha(alpha)
    return out


def measure(img):
    """Silhouette area, bounding box and head width of a keyed render."""
    alpha = np.asarray(img)[..., 3] > 8
    return int(alpha.sum()), img.getbbox(), face(img)


def normalise(img, scale, ground):
    """Resize the subject by `scale` and plant its bounding-box bottom on
    `ground`, keeping the canvas and the subject's horizontal centre.

    The whole canvas is scaled rather than a crop of the subject, so a pose
    that the model drew off to one side stays off to that side — the character
    is meant to move across the goal, and throwing that away would centre every
    dive on the spot the keeper started from."""
    w, h = img.size
    if abs(scale - 1.0) > 1e-3:
        big = img.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                         Image.LANCZOS)
    else:
        big = img

    box = big.getbbox()
    if not box:
        return img

    # Where the subject wants to be, and where it is.
    dx = (w - big.width) // 2
    dy = ground - box[3]

    # Never let the anchor push the figure off its own canvas. jump_center is
    # a keeper who has left the ground, so his lowest point is a boot in
    # mid-air; planting that boot on the grass lifted his raised gloves clean
    # out of the frame. Placement is recoverable later — POSES[..].y in
    # js/animator.js exists for exactly that — but a sprite cropped by its own
    # canvas is gone for good and looks like a rendering bug for the rest of
    # the project's life.
    dy = max(-box[1], min(dy, h - 1 - box[3]))

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(big, (dx, dy), big)
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


def find_goal(img):
    """Locate the painted goal and return it as fractions of the plate.

    css/game.css hangs the goal box, the keeper, the wall and the caption off
    these four numbers, so they are measured here — on the file that actually
    ships, after the resize and the added foreground — rather than typed in by
    hand off a different version of the image.

    The frame is the brightest near-white structure in the middle of the
    picture. The net is white too but far dimmer, and the floodlights are
    brighter still but live in the top corners, outside the band searched."""
    a = np.asarray(img).astype(int)
    h, w = a.shape[:2]
    luma = a.mean(axis=2)
    chroma = a.max(axis=2) - a.min(axis=2)

    band = np.zeros_like(luma, bool)
    band[int(h * 0.12):int(h * 0.62), int(w * 0.20):int(w * 0.80)] = True
    bright = band & (luma > 175) & (chroma < 34)
    if not bright.any():
        return None

    # The crossbar is the row carrying the widest run of it.
    bar = int(np.argmax(bright.sum(axis=1)))
    strip = bright[max(0, bar - 4):bar + 5]
    xs = np.where(strip.any(axis=0))[0]
    if not xs.size:
        return None
    left, right = int(xs.min()), int(xs.max())

    def foot(x):
        """Walk DOWN a post from the crossbar to the first sustained gap.

        Taking the lowest bright pixel in the column instead finds the painted
        penalty-area line on the grass a couple of hundred pixels below the
        net, and reports the goal as half again as tall as it is."""
        col = bright[:, max(0, x - 3):x + 4].any(axis=1)
        gap = 0
        for y in range(bar + 6, h):
            if col[y]:
                gap = 0
            else:
                gap += 1
                if gap >= 12:
                    return y - gap
        return h - 1

    base = max(foot(left + 4), foot(right - 4))
    return {
        'left':   left / w,
        'right':  right / w,
        'top':    bar / h,
        'base':   base / h,
        'w':      (right - left) / w,
        'h_of_w': (base - bar) / w,
    }


def main():
    # ── key everything first, so a group can be measured before it is written
    keyed = {}
    for name, (source, mode, keep, group, height) in JOBS.items():
        path = os.path.join(RAW, source)
        if not os.path.exists(path):
            print('skip (missing source):', name)
            continue
        keyed[name] = key(source, mode, keep)

    stats = {n: measure(im) for n, im in keyed.items()}

    # Scale every pose against its group's reference, then divide the whole
    # group through by its own largest factor so the biggest pose comes out at
    # 1.0 and nothing is ever enlarged.
    #
    # This is not tidiness. These renders put the figure within a few percent
    # of the full frame height, so a pose scaled up by the 40% the area
    # invariant asked for on jump_center pushed his raised gloves clean off the
    # top of the canvas — and a sprite cropped by its own frame is a defect
    # that survives every later stage silently. Normalising downwards cannot
    # crop anything, and costs only resampling.
    factor = {}
    for name in keyed:
        group = JOBS[name][3]
        ref, how = REFERENCE.get(group, (None, 'area'))
        area, _, head = stats[name]
        raw = 1.0
        if ref in stats:
            ref_area, _, ref_head = stats[ref]
            if how == 'face' and head and ref_head:
                raw = ref_head / head
            elif area:
                raw = (ref_area / area) ** 0.5
        factor[name] = raw * ADJUST.get(name, 1.0)

    ceiling = {}
    for name in keyed:
        group = JOBS[name][3]
        ceiling[group] = max(ceiling.get(group, 0), factor[name])

    made = {}
    for name, (source, mode, keep, group, height) in JOBS.items():
        if name not in keyed:
            continue
        scale = factor[name] / ceiling[group]

        # The ground line comes from the reference pose after its own scaling,
        # so every figure in the group stands on one line whatever the group
        # was divided through by.
        ref, how = REFERENCE.get(group, (None, 'area'))
        if ref in stats:
            ref_box = stats[ref][1]
            centre = keyed[ref].size[1] / 2
            ground = round(centre + (ref_box[3] - centre) * factor[ref] / ceiling[group])
        else:
            ground = stats[name][1][3]

        img = normalise(keyed[name], scale, ground)
        dst, img = save(name, img, height)
        made[name] = dst

        after_area, after_box, after_face = measure(img)
        # Only meaningful where the group is normalised by it: for the wall the
        # largest skin blob is whichever two faces happened to touch.
        head = ('%3dpx' % after_face) if how == 'face' else '   --'
        print('%-24s %sx%-5s x%.3f  face %s  y %s-%s x %s-%s  %5.0f KB'
              % (name, img.width, img.height, scale, head,
                 after_box[1], after_box[3], after_box[0], after_box[2],
                 os.path.getsize(dst) / 1024))

    for name, base in MIRRORS.items():
        if base not in made:
            print('skip (missing base):', name)
            continue
        img = Image.open(made[base]).transpose(Image.FLIP_LEFT_RIGHT)
        dst = os.path.join(IMG, name + '.webp')
        img.save(dst, 'WEBP', quality=90, method=6)
        print('%-24s mirrored from %-22s %5.0f KB'
              % (name, base, os.path.getsize(dst) / 1024))

    for name, (source, width, quality, extend) in PLATES.items():
        path = os.path.join(RAW, source)
        if not os.path.exists(path):
            print('skip (missing source):', name)
            continue
        img = Image.open(path).convert('RGB')
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)

        # Measured before the foreground is added; see the note below.
        goal = find_goal(img)
        if extend:
            img = lengthen(img, extend)
            if goal:
                # Everything is appended below the goal, so only the vertical
                # fractions move, and they move by exactly the growth. Measuring
                # after the extension instead put the search window over the
                # penalty arc, which is a longer bright run than the crossbar —
                # the goal came back 0.0026 of the plate tall.
                for edge in ('top', 'base'):
                    goal[edge] /= (1 + extend)
        dst = os.path.join(IMG, name + '.webp')
        img.save(dst, 'WEBP', quality=quality, method=6)
        print('%-24s %sx%-5s %30s %5.0f KB'
              % (name, img.width, img.height, '', os.path.getsize(dst) / 1024))
        if goal:
            print('    painted goal, as fractions of the plate — css/game.css:')
            print('      left post %.4f   right post %.4f' % (goal['left'], goal['right']))
            print('      crossbar  %.4f   goal line  %.4f' % (goal['top'], goal['base']))
            print('      width     %.4f   height     %.4f   (of plate width)'
                  % (goal['w'], goal['h_of_w']))


if __name__ == '__main__':
    main()
