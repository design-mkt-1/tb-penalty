# TopBet — Free-Kick Landing Page

A mobile-first, single-screen landing page. The visitor drags the ball to take
a free kick at four prize targets hanging in the goal, curving the drag to bend
the shot. A rack of dummies blocks the first attempt; the second always beats
it, the target it strikes turns over to show what was won, and the TopBet
registration card opens with that bonus already chosen.

Static site: no build step, no runtime dependencies. Open `index.html` through
any static server.

```bash
python -m http.server 8000     # then http://127.0.0.1:8000/
```

It is the sibling of [fs-penalty](https://github.com/design-mkt-1/fs-penalty),
which is a penalty and a different brand. This one shares that project's shell
— the zero-scroll stage, the single effects loop, the registration card's
machinery — and almost nothing else: a free kick has a third dimension a
penalty does not, and the whole of `js/aim.js`, the bend in `js/fx.js` and the
dummy rack in `js/game.js` exist to give the visitor it.

## Layout

```
index.html
css/
  reset.css     normalise
  tokens.css    TopBet palette and type scale, from the brandbook
  stage.css     fluid zero-scroll shell, safe area, landscape layout
  game.css      pitch plate, the goal quad, targets, the rack, ball, tagline
  form.css      registration card
js/
  stage.js      canvas fit, safe-area, soft-keyboard handling
  audio.js      SFX pool, mute toggle
  aim.js        drag -> aim, power and curl, mapped into the goal quad
  fx.js         the trajectory model, ball flight, shadows, motion blur,
                the aim arc, net, shake, confetti
  i18n.js       every visible string, EN / RU / UZ
  game.js       state machine, the rack, the two scripted shots, the prizes
  form.js       tabs, SMS step, bonus picker, validation, success state
  main.js       boot
assets/img/     shipped artwork (WebP) and Figma exports (SVG)
tools/cutout.py     rebuilds assets/img from raw/, and measures the goal
tools/ball_sheet.py renders the ball and its rotation frames outright
tools/sfx.py        renders the confetti burst
```

`raw/` holds the source renders `tools/cutout.py` eats and is **not** committed.
fs-penalty shipped its raw folder and then had to note in its own README that a
public repo serves every byte of it anyway; there is nothing to gain by pushing
tens of megabytes of PNG a visitor can already reconstruct from the WebP.

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
first attempt hits the dummies and the second hits a target, and both are
arranged by moving the ball, not by faking the result:

* **Attempt one.** The trajectory is re-solved so that it genuinely passes
  through the rack's box at the rack's depth — at the point of the rack
  nearest to where the shot was already going, so a shot down the left is
  blocked by the dummy on the left.
* **Attempt two.** The arrival is put on a target, and then the shot is given
  whatever it needs to genuinely clear the rack: more arc if the drag was
  straight, more bend if it was curled, going round on the side the visitor
  asked for.

Which target is **the visitor's choice, and it is the prize**. A drag wins
whichever target is nearest to where it aimed; pressing a target — which Enter
reaches, because each is a real `<button>` — aims at that one. Two carry the
sport bonus and two the casino one, split diagonally so either is reachable
with a comfortable shot. The target struck turns over, stays turned, and the
registration card opens with its bonus already selected.

Pressing the **ball** instead is the "surprise me" shot: random aim, random
curl, and the nearest target takes it.

The attempt counter lives in memory, so a reload restarts the sequence.

## The goal is a quadrilateral

`assets/img/pitch-training.webp` is a training ground at dusk photographed
from a free-kick position off to one side, so the goal on screen is **not a
rectangle**. Both posts are vertical, but the nearer one is taller and their
tops and bases do not line up.

Six numbers describe it, and `python tools/cutout.py` prints all six off the
file it has just written:

```
near post   x .3182   top .2010   base .5117
far post    x .5620   top .2674   base .4625      (fractions of the plate)
```

`css/game.css` places four zero-size markers on those corners; everything else
— the four targets, the ball's ground line, the caption — is bilinear
interpolation between them, and `js/aim.js` reads the markers back rather than
repeating the arithmetic. Re-run the tool against a new plate and paste what it
prints. It was checked by drawing the quad back over the photograph and
confirming it lands on the painted frame.

The mouth comes out very nearly square on screen. That is not an error: a
7.32 × 2.44 m goal is 3:1 seen square on, and this camera is oblique enough
that its width foreshortens to about its height — which is what makes four
targets fit comfortably in it on a phone.

## Reading a shot out of a drag

`js/aim.js` takes three readings from one gesture:

* **aim** — the drag's direction across the goal and its LENGTH up it, both as
  coordinates *in the quad* before they become a screen point, so the aim
  follows the perspective instead of fighting it. Length rather than vertical
  travel, because the two come apart the moment the drag is diagonal, and a
  long drag to the corner should be a shot into the top corner rather than
  into the side netting at knee height.
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
out around the rack and back in.

`js/game.js` samples that same model at the rack's depth to decide whether a
shot has cleared it. There is one model of where the ball goes and everything
asks it; nothing keeps a second opinion.

## Where the rack stands

Its position and height in `css/game.css` are a composition choice, not the
photograph's own perspective, and it is worth being plain about that: placed
truthfully, a wall standing the regulation 9.15 m from the ball would cover the
goal almost completely, and there would be no game. So it is brought forward
and shrunk until the goal is playable — far enough down the plate to be in
front of it, close enough up that the figures still cross the lower part of the
mouth.

Whatever those numbers are, the collision follows them: `js/game.js` reads the
rack's depth off its own rendered feet rather than being told, so moving it in
the CSS moves the block with it.

The rack does **not** jump. It is five plastic figures bolted to a wheeled
steel frame; a jump would be a lie about the object. It rocks back on impact
instead.

## The targets

Drawn in CSS, not rendered as bitmaps. That buys crisp text at any size, real
translation, a focus ring, and a flip that is one transform — none of which a
sprite gives. Each carries its place in the quad (`--u` across, `--v` down) and
its own prize; the four placements live in the stylesheet beside the six
numbers they are derived from.

The prizes are the two real offers on top-bet.com — a **200%** sport bonus on
the first four deposits, and a welcome package plus **150 free spins** on
casino. They carry the percentage and the freespins and no absolute sum,
because the live site quotes the cap per currency: 2 103 RON on the sport
bonus, 1 500 EUR or 1 738.73 USD on the casino package. No single figure is
true everywhere the page might run.

## Rebuilding the artwork

```bash
python tools/cutout.py
```

It keys the flat grey backdrop out of the raw render, drops isolated artefacts
the image model hallucinated, downscales and writes WebP — and it prints the
four fractions of the dummy rack's own canvas that `RACK_BODY` in `js/game.js`
tests the trajectory against. Two things in it are worth knowing:

**The plate's foreground is invented.** The photograph is 16:9 and a phone is
not, so pinning the goal where the composition wants it leaves the image's own
bottom edge well above the ball. `lengthen()` stretches the last rows into more
grass, blurs across the blades, darkens towards the bottom and crossfades the
join.

**Finding the goal is harder than it looks.** The posts are not the widest
white thing in the frame — seen at an angle, the side and back netting reaches
further across than either upright. What separates a post is that it is tall
and continuous, so `find_goal_quad()` looks for the two columns carrying the
longest vertical run of bright pixels. Three details make that work on a dusk
plate and each was arrived at by measuring what the search actually saw: the
mask is widened sideways first, because a two-pixel anti-aliased post fills no
single column; the run tolerates a few dark pixels, because netting crosses the
post and floodlight falls unevenly down it; and the second post is the
*furthest* strong column from the first rather than the strongest, because a
bright fold in the netting can out-run a real upright. A search band per plate
says where in the picture to look — a floodlight pylon is also a tall solid
bright vertical thing, and three times the height of a goalpost.

`assets/audio/` holds six MP3s. Five are clips; `confetti` is rendered from
code by `tools/sfx.py`, so the output is reproducible from the repository and
carries no third-party licence onto a client's landing page. Playback is
unlocked on the first user gesture and the mute state is persisted in
`localStorage`. `audio.js` tolerates a missing file: that one effect simply
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
* The offers and their wording come from the live site rather than the mock:
  `top-bet.com/ru/bonus/rules` and `/ru/bonus/casino/promotions/slot_first_deposit`.

## Known gaps

* The registration card is client-side only. Validation runs, the SMS step is
  simulated and any six digits are accepted, and nothing is ever submitted.
  `SUBMIT` at the top of `js/form.js` is the seam. The offer amount is the
  `(AMOUNT)` placeholder.
* Five outbound URLs are unset and every one of them is a one-line change:
  `HOME_URL`, `LOGIN_URL`, `TERMS_URL` and `PRIVACY_URL` in `js/main.js`, and
  `DESTINATION` in `js/form.js`. Until a seam is filled its anchor carries no
  `href` and so is not a link at all — no tab stop, nothing announced.
* The country picker offers UZ, RU and GB and defaults to `+998`, which is
  what the Figma mock's SMS step and bonus copy assume. The live site quotes
  RON, EUR and USD, so the market is not settled; `COUNTRIES` at the top of
  `js/form.js` is the only place to change it.
* The mock's bonus rows put the slot-machine emoji on the sport bonus and the
  football on the casino one. They are the right way round here.
* Each target's accessible name says which prize it is, which gives it away
  before it is won. That is deliberate: the target decides the bonus, so a
  visitor choosing one by keyboard has to know which is which.
* The UZ and RU strings in `js/i18n.js` are unreviewed.
