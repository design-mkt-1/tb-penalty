# TopBet — Free-Kick Landing Page

A mobile-first, single-screen landing page. The visitor drags the ball to take
a free kick, curving the drag to bend the shot; the wall blocks the first
attempt, the second always beats it, and scoring opens the TopBet registration
card.

Static site: no build step, no runtime dependencies. Open `index.html` through
any static server.

```bash
python -m http.server 8000     # then http://127.0.0.1:8000/
```

It is the sibling of [fs-penalty](https://github.com/design-mkt-1/fs-penalty),
which is a penalty and a different brand. This one shares that project's shell
— the zero-scroll stage, the pose animator, the single effects loop — and
almost nothing else: a free kick has a third dimension a penalty does not, and
the whole of `js/aim.js`, the bend in `js/fx.js` and the wall in `js/game.js`
exist to give the visitor it.

## Layout

```
index.html
css/
  reset.css     normalise
  tokens.css    TopBet palette and type scale, from the brandbook
  stage.css     fluid zero-scroll shell, safe area, landscape layout
  game.css      pitch plate, goal geometry, wall, keeper, ball, tagline
  form.css      registration card
js/
  stage.js      canvas fit, safe-area, soft-keyboard handling
  audio.js      SFX pool, mute toggle
  animator.js   CharacterAnimator interface + PoseAnimator
  aim.js        drag -> aim, power and curl
  fx.js         the trajectory model, ball flight, shadows, motion blur,
                the aim arc, net, shake, confetti
  i18n.js       every visible string, EN / RU / UZ
  game.js       state machine, the wall, the two scripted shots
  form.js       tabs, SMS step, bonus picker, validation, success state
  main.js       boot
assets/img/     shipped artwork (WebP) and Figma exports (SVG)
tools/cutout.py     rebuilds assets/img from raw/, and measures the goal
tools/ball_sheet.py renders the ball and its rotation frames outright
tools/sfx.py        renders the confetti burst and the keeper's head drop
```

`raw/` holds the source renders `tools/cutout.py` eats and is **not** committed.
fs-penalty shipped its raw folder and then had to note in its own README that a
public repo serves every byte of it anyway; there is nothing to gain by pushing
40 MB of PNG a visitor can already reconstruct from the WebP.

## The no-scroll rule

The page must never scroll on a phone. That is enforced structurally, not with
patches:

* The stage **is** the viewport. `#viewport` and `#stage` are query containers
  and everything inside sizes itself in `cqw` / `cqh`.
* `html, body` are `position: fixed; overflow: hidden; overscroll-behavior: none`.
* The stage is a flex column: header and ball row are fixed, the pitch is the
  only elastic row, so it absorbs whatever is left over.
* The registration card is an overlay that scrolls *inside itself* when the
  soft keyboard shrinks the visual viewport. A `visualViewport.resize` listener
  re-runs the fit.

## Game rules

Outcome is decided by attempt index, never by where the visitor aimed. The
first attempt is blocked by the wall and the second goes in, and both of those
are arranged by moving the ball, not by faking the result:

* **Attempt one.** The trajectory is re-solved so that it genuinely passes
  through the wall's box at the wall's depth — at the point of the wall
  nearest to where the shot was already going, so a shot down the left is
  blocked by the man on the left.
* **Attempt two.** The arrival is clamped inside the posts, and then the shot
  is given whatever it needs to genuinely clear the wall: more arc if the drag
  was straight, more bend if it was curled, going round on the side the visitor
  asked for.

The attempt counter lives in memory, so a reload restarts the sequence.
Pressing the **ball** — which Enter and Space reach, because it is a real
`<button>` — is the "surprise me" shot: random aim, random curl, same scripted
outcome.

The goal is not a sprite. `assets/img/pitch-freekick.webp` is photographed from
a free-kick position and the goal, the penalty area and the arc are all in it,
in one perspective. `.goal` is that painted goal's box and draws nothing:
`css/game.css` sizes and places it off four fractions that
`python tools/cutout.py` prints, and the keeper, the wall, the caption and the
strike ring are percentages of it.

## Reading a shot out of a drag

`js/aim.js` takes three readings from one gesture:

* **aim** — the drag's direction across the goal and its LENGTH up it. Length
  rather than vertical travel, because the two come apart the moment the drag
  is diagonal, and a long drag to the corner should be a shot into the top
  corner rather than into the side netting at knee height.
* **power** — the same length, which is also how hard it is struck.
* **curl** — the mean perpendicular distance of the sampled path from its own
  chord, over the chord's length. A plain "how far out did you bow, as a
  fraction of how far you went": a straight drag reads zero whatever its length
  or direction, and the sign is the side you bowed to.

The end tangent would have been cheaper and is wrong: a flick ends fast and its
last two samples are noise.

## The trajectory

`js/fx.js` projects the flight through a pinhole camera. One number, `S_END`,
governs both how fast the ball crosses the screen and how small it gets,
because in a real camera those are the same fact — deriving both from it means
they can never disagree.

The bend goes as `t²`: nothing early, everything late, which is what constant
sideways acceleration from spin does and why a curled free kick looks like one.
The subtlety is what the aim then means. The ball is struck `bend` to one side
of the target and the spin brings it back, so the two terms cancel exactly at
the end and **the target is where the ball arrives however hard it is curled**.
Aim and curl come apart, and the flight is the one a free kick actually takes —
out around the wall and back in.

`js/game.js` samples that same model at the wall's depth to decide whether a
shot has cleared it. There is one model of where the ball goes and everything
asks it; nothing keeps a second opinion.

## Where the wall stands

Its position and height in `css/game.css` are a composition choice, not the
photograph's own perspective, and it is worth being plain about that.

The plate is a long-lens shot from about twenty-two metres. Fitting the
penalty-area line and the arc against the goal line puts the horizon at .561 of
the image and squeezes the whole run from six metres to the goal into three
percent of its height. Placed truthfully, a wall standing the regulation 9.15 m
from the ball belongs two percent of the frame below the goal line at 1.82
goal-heights tall — which is to say it would cover the goal almost completely,
and there would be no game. So it is brought forward and shrunk until the goal
is playable.

Whatever those two numbers are, the collision follows them: `js/game.js` reads
the wall's depth off its own rendered feet rather than being told, so moving it
in the CSS moves the block with it.

## Animation

There is no Spine runtime. `animator.js` exposes a small interface —
`play` / `setPose` / `preload` — implemented by `PoseAnimator`, which swaps
discrete pose sprites and translates them with the Web Animations API.

Pose names mirror the reference rig (`idle`, `jump_L1`, `jump_L2`, `jump_R1`,
`jump_R2`, `jump_center`, `jump_center_down`) so a real Spine skeleton can be
dropped in behind the same interface without touching `game.js`. Three more are
not dives: `ready` is the set position and plays through the coil of every one,
and `cheer` and `beaten` are the reactions `PoseAnimator.react()` holds after a
block and after a goal.

The ball is a 24-frame sprite sheet of one revolution of a real sphere,
rendered by `tools/ball_sheet.py` in the brand's own reds. `js/fx.js` picks the
frame from the rotation and draws it in a frame rotated to the direction of
travel, so the spin axis is square to the trajectory and the ball turns over
along its own flight. That direction is differentiated from the path rather
than assumed, because with a bend a constant direction tilts the motion blur
away from the arc the ball is visibly on.

L and R are from the **viewer's** point of view.

## Rebuilding the artwork

```bash
python tools/cutout.py
```

It keys the flat grey backdrop out of the raw renders, drops isolated artefacts
the image model hallucinated, normalises the figures' scale, plants them on a
common ground line, downscales and writes WebP. It also lengthens the pitch
plate's foreground and prints the four fractions `css/game.css` needs. Two
things in it are worth knowing before changing the renders:

**Scale is measured off the head.** Asking an image model for "the same
goalkeeper, same scale, different pose" gets the character and the kit right
and the scale wrong by up to a fifth, and a sprite that changes size when it
swaps is the loudest possible tell that this is a slideshow. Silhouette area
was tried first and it measures the pose, not the camera: a full-stretch dive
covers far more pixels than the same man standing, so it read the dive as
"closer" and shrank it, while a keeper with his arms straight up read as
"further" and was blown up until his gloves left the canvas. This keeper wears
gloves, so the only skin in any pose is his head — and a head's width depends
on nothing but how far away he was drawn. Poses whose heads are turned away
need a line in `ADJUST`; nothing else does.

**Nothing is ever scaled up.** The renders put the figure within a few percent
of the full frame height, so an enlargement crops it, and a sprite cropped by
its own canvas is a defect that survives every later stage silently. The group
is divided through by its own largest factor instead.

**The plate's foreground is invented.** The photograph is 16:9 and a phone is
not, so pinning the goal where the composition wants it leaves the image's own
bottom edge well above the ball. `lengthen()` stretches the last rows into half
again as much grass, blurs across the blades, darkens towards the bottom and
crossfades the join.

`assets/audio/` holds seven MP3s. Five are clips; `confetti` and `slump` are
rendered from code by `tools/sfx.py`, so the output is reproducible from the
repository and carries no third-party licence onto a client's landing page.
Playback is unlocked on the first user gesture and the mute state is persisted
in `localStorage`. `audio.js` tolerates a missing file: that one effect simply
never plays.

## Design sources

* Figma `mAJyDSaXdr9GO72b7FGvI8`, page **TopBet** (`3:255`): brandbook
  (`3:1356`), logo (`3:281`), favicons (`3:1407`) and the Registration Form
  component set (`3:2176`).
* Palette, verbatim from the four named swatches: accent `#D21502`,
  grey `#EEEFF2`, main `#22252A`, background `#040405`.
* **Fira Sans** for the display voice and **Roboto** for the UI, both
  self-hosted and subsetted to latin, latin-ext and cyrillic — which is what
  EN, UZ and RU between them need.

## Known gaps

* The registration card is client-side only. Validation runs, the SMS step is
  simulated and any six digits are accepted, and nothing is ever submitted.
  `SUBMIT` at the top of `js/form.js` is the seam. The offer amount is the
  `(AMOUNT)` placeholder from the design.
* Five outbound URLs are unset and every one of them is a one-line change:
  `HOME_URL`, `LOGIN_URL`, `TERMS_URL` and `PRIVACY_URL` in `js/main.js`, and
  `DESTINATION` in `js/form.js`. Until a seam is filled its anchor carries no
  `href` and so is not a link at all — no tab stop, nothing announced.
* The design disagrees with itself about the country: the default state draws a
  US flag and `+1` while its own copy quotes a bonus in UZS and its SMS step
  shows a `+998` number. The picker offers UZ, RU and GB and defaults to
  `+998`, which is the one the rest of the design supports.
* The design's collapsed bonus field reads "Welcome Freebet 55 0…", a
  campaign-specific label with no counterpart in the open list. It shows the
  selected bonus instead.
* Aiming is by drag only. The ball is the keyboard and screen-reader path and
  fires a random shot; there is no six-panel grid to aim with, by choice.
* The UZ and RU strings in `js/i18n.js` are unreviewed.
