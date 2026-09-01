"""Render a football spinning about one axis, as a sprite sheet.

The ball used to be a single still: it scaled down as it flew and never
turned, which reads as a sticker being dragged rather than a ball being
struck. These frames are a real sphere -- the panels are a spherical Voronoi
over the 32 face centres of a truncated icosahedron, which is what a football
is, and the shading is a light direction, a specular lobe and a rim, sampled
per pixel off the surface normal.

The spin axis is vertical in the frame, so the panels travel across it. At
draw time js/fx.js rotates the whole frame to the direction of flight, which
turns that into a ball turning over along its own trajectory, whichever way
the shot goes.
"""
import numpy as np
from PIL import Image

FRAMES = 24          # one revolution
SIZE   = 176         # per frame, px
COLS   = 6

# The brand's ball. White with the accent red on the pentagons and the deep
# red under it — the same two steps as --red-500 and --red-700 in
# css/tokens.css, so the ball belongs to the page rather than merely sitting
# on it. The seam is the brand's near-black.
WHITE  = np.array([242, 242, 240], float)
ACCENT = np.array([210,  21,   2], float)   # --red-500, the accent
DEEP   = np.array([125,  14,   1], float)   # --red-700, the shadowed step
SEAM   = np.array([ 34,  37,  42], float)   # --ink-650, "main 22252A"

def face_centres():
    """The 32 face centres of a truncated icosahedron.

    A football's 12 pentagons sit on the vertices of an icosahedron and its 20
    hexagons on that icosahedron's face centres, so the nearest-centre regions
    of those 32 points on the sphere are exactly the panels.
    """
    p = (1 + 5 ** 0.5) / 2
    verts = []
    for s1 in (-1, 1):
        for s2 in (-1, 1):
            verts += [(0, s1, s2 * p), (s1, s2 * p, 0), (s2 * p, 0, s1)]
    verts = np.unique(np.round(np.array(verts, float), 6), axis=0)
    verts /= np.linalg.norm(verts, axis=1)[:, None]      # 12 pentagons

    # Icosahedron faces: every triple of vertices mutually at the short edge.
    edge = np.min([np.linalg.norm(verts[0] - v) for v in verts[1:]])
    faces = []
    n = len(verts)
    for i in range(n):
        for j in range(i + 1, n):
            if np.linalg.norm(verts[i] - verts[j]) > edge * 1.1: continue
            for k in range(j + 1, n):
                if np.linalg.norm(verts[i] - verts[k]) > edge * 1.1: continue
                if np.linalg.norm(verts[j] - verts[k]) > edge * 1.1: continue
                c = verts[i] + verts[j] + verts[k]
                faces.append(c / np.linalg.norm(c))
    faces = np.array(faces)                               # 20 hexagons
    return verts, faces

PENT, HEX = face_centres()
CENTRES = np.vstack([PENT, HEX])

# Six pentagons in the accent red and six in the deeper step, split by the sign
# of z so the two land on opposite caps and every view shows both of them.
COLOUR = np.zeros((len(CENTRES), 3))
order = np.argsort(PENT[:, 2])
for rank, idx in enumerate(order):
    COLOUR[idx] = ACCENT if rank % 2 == 0 else DEEP
COLOUR[len(PENT):] = WHITE

def rot_y(a):
    """Spin about the vertical axis of the frame, so the panels travel across
    it. js/fx.js rotates the frame to the direction of flight, which turns
    that into a ball turning over along its own trajectory."""
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

def render(angle):
    g = (np.arange(SIZE) + 0.5) / SIZE * 2 - 1
    x, y = np.meshgrid(g, -g)
    r2 = x * x + y * y
    inside = r2 <= 1.0
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    n = np.stack([x, y, z], axis=-1)                       # surface normal

    # Into texture space: undo the ball's own rotation.
    tex = n.reshape(-1, 3) @ rot_y(angle)
    d = tex @ CENTRES.T                                    # cosine to each centre
    best = np.argmax(d, axis=1)
    top2 = np.partition(d, -2, axis=1)
    gap = top2[:, -1] - top2[:, -2]                        # distance to the seam

    base = COLOUR[best].reshape(SIZE, SIZE, 3)
    seam = np.clip(gap.reshape(SIZE, SIZE) / 0.045, 0, 1)[..., None]
    base = SEAM + (base - SEAM) * seam

    light = np.array([-0.45, 0.62, 0.64]); light /= np.linalg.norm(light)
    lam = np.clip((n * light).sum(-1), 0, 1)[..., None]
    half = light + np.array([0, 0, 1.0]); half /= np.linalg.norm(half)
    spec = np.clip((n * half).sum(-1), 0, 1)[..., None] ** 46
    rim  = (1 - z[..., None]) ** 3

    rgb = base * (0.30 + 0.78 * lam) + 255 * spec * 0.85 + np.array([70, 90, 120]) * rim * 0.5
    rgb = np.clip(rgb, 0, 255)

    # One pixel of coverage falloff at the silhouette, so the edge is not a
    # staircase when the ball is drawn at 124px.
    a = np.clip((1 - np.sqrt(r2)) * SIZE / 1.6, 0, 1) * inside
    out = np.dstack([rgb, a * 255]).astype('uint8')
    return Image.fromarray(out, 'RGBA')

import os

# Write where the page reads. This used to drop ball_spin.webp and
# ball_still.webp into whatever directory the script happened to be run from,
# under names nothing loads, and leave someone to rename and move them by hand.
# The one time that was forgotten the page came up with an invisible ball, a
# 404 nobody was looking at, and a flight that played with nothing in it —
# js/fx.js has a guard for exactly that and it is not a substitute for the
# tool putting the file in the right place.
IMG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'assets', 'img')
SHEET = os.path.join(IMG, 'ball-spin.webp')
STILL = os.path.join(IMG, 'ball.webp')

rows = -(-FRAMES // COLS)
sheet = Image.new('RGBA', (COLS * SIZE, rows * SIZE), (0, 0, 0, 0))
for i in range(FRAMES):
    f = render(i / FRAMES * 2 * np.pi)
    sheet.paste(f, ((i % COLS) * SIZE, (i // COLS) * SIZE))
    if i == 0:
        # Frame 0 of the same render, so the ball on the spot and the ball in
        # flight are the same object.
        f.resize((384, 384), Image.LANCZOS).save(STILL, 'WEBP',
                                                 quality=92, method=6)
sheet.save(SHEET, 'WEBP', quality=88, method=6)

print('ball-spin.webp', sheet.size, os.path.getsize(SHEET), 'bytes')
print('ball.webp     ', os.path.getsize(STILL), 'bytes')
