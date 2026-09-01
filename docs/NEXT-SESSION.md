# Picking this up

Read `README.md` first — it carries the architecture, the game rules and the
reasoning. This file is the handoff: what was measured, what was decided, what
was left, and how to check the work.

Say **"start"** and it means read this and continue from *What is next*.

---

## Where it came from

`fs-penalty` is the same shell around a different game. What was carried over
untouched: `css/reset.css`, `css/stage.css` (plus a landscape rewrite),
`js/stage.js`, `js/audio.js`, `js/animator.js` (retuned, not rewritten),
`tools/sfx.py`, `assets/audio/`, the Pages workflow. Everything else is new or
rewritten. The `FS*` globals are `TB*` here.

## What was measured, and what it is worth

**The goal, on the plate.** Four fractions, and every piece of geometry hangs
off them:

```
left post .3349   right post .6651   crossbar .2269   goal line .3701
width     .3302   height     .1240   (of the plate's WIDTH)
```

`python tools/cutout.py` prints these off the file it has just written. They
are NOT the numbers off the raw render — the tool adds half again as much
foreground to the bottom, which moves both vertical fractions. Re-run it
against a new plate and paste what it prints into `css/game.css`. Do not nudge
them by eye; the whole composition is registered to the photograph through
them, and it was verified by outlining `.goal` in the browser and confirming it
falls exactly on the painted frame.

**The keeper's box.** The sprite canvas is 1147x640 and the standing figure
runs y .256 to .766 of it, so he is .510 of the box tall. A 1.88 m keeper
against a 2.44 m goal is .770 of its height, which makes the box 151% of the
goal's height and 102% of its width, hanging 35.4% of the goal's height below
the goal line to stand him on it. That 1.02 is `KEEPER_W` in `js/animator.js`
and the dive offsets are percentages of it — `css/game.css` and
`js/animator.js` have to agree or every dive lands in the wrong place.

**The wall's men inside their canvas.** x .280 to .719, y .100 to .893.
`WALL_BODY` in `js/game.js`. The rest of the element is empty canvas and must
not block a shot.

## Decisions already taken

* **The scripted outcome stays.** Attempt one is blocked, attempt two scores,
  and neither depends on where the visitor aimed. Both are arranged
  geometrically — see the README — rather than by playing an animation over a
  shot that did something else.
* **Drag-only aiming.** The owner chose drag over "drag plus target zones", so
  there is no six-panel grid. The ball is a real button and is the keyboard and
  screen-reader path; it fires a random shot through the same scripted outcome.
* **The bend leaves the arrival alone.** `to` is where the ball lands however
  hard it is curled. The first version added the bend on top of a straight line
  and the curl moved the landing point, which made aiming a guess and put the
  preview's landing ring outside the posts.
* **The wall's placement is a composition choice.** The plate is a long-lens
  22 m shot with no room between the goal and the camera; placed truthfully the
  wall would cover the goal. `--wall-b` and `--wall-h` in `css/game.css` say so
  at length.
* **`--wall-h` is 1.12 goal-heights, not 1.30.** At 1.30 the men's heads
  finished fifteen pixels under the crossbar, so no arc cleared the wall and
  still passed under the bar: every winning shot had to go round, including one
  struck dead straight. That is the game contradicting its own input.
* **The plate covers, it does not fit.** `--plate-w` uses `max()`, uncapped. A
  px ceiling was tried and brings the black bars back on the widest screens.

## Bugs fixed here that are worth not reintroducing

* `components()` in `tools/cutout.py` discovers regions in raster order and
  stops after `limit` of them. Hand it a mask carrying a cloud of one-pixel
  specks and it spends every slot on them. Clean the mask; do not raise the
  limit.
* The pickers in `js/form.js` hide themselves on a timer after the close
  transition. `restore()` closes both on the way back to the opening state, and
  without a cancellable handle that timer landed on a menu the visitor had
  since opened — leaving it marked open, carrying `.is-open`, and
  `display: none`. Every other deferred hide in the project already guarded
  this: the language menu, the error line, the sheet.
* `tools/ball_sheet.py` wrote `ball_spin.webp` into the current directory under
  a name nothing loads. The page came up with an invisible ball and a 404
  nobody was looking at. It writes into `assets/img/` now.
* `.keeper` had both a `margin-left` and a `translateX(-50%)`, so it was
  centred twice and stood half a goal to the left. `js/animator.js` rewrites
  that transform on every frame of a dive, so the transform is the centring and
  the margin must not exist.

## What was verified, and how

Driven in a real browser, with the geometry read out of the page rather than
eyeballed — screenshots always arrive after a 700 ms flight has finished, so
they cannot be used to check one.

* Attempt one stops **inside** the wall's box at the wall's depth, for a drag
  bowed left, bowed right and dead straight.
* Attempt two lands **inside** the posts every time: a curled drag passes
  outside the wall's edge on the side it was curled towards, a straight drag
  threads the gap between the men's heads and the crossbar with the bend left
  at zero.
* Ten clicks in a row leave `busy` false and the stage idle.
* Escape closes the card, clears `inert`, and resets the attempt counter to 0.
* The phone path strips a typed-in country code once and shows it once.
* EN / RU / UZ switch with no missing glyphs and nothing overflowing the stage;
  `scrollX/scrollY` stay 0.
* Reduced motion completes the whole sequence.

## What is next

1. **Fill the URLs.** Five one-line changes, listed in the README's *Known
   gaps*. Nothing else has to move.
2. **Have the UZ and RU strings reviewed.** They shipped unreviewed.
3. **Get the offer amount** and replace `(AMOUNT)` in `js/i18n.js`.
4. **Confirm the country default.** The design says `+1` in one state and
   `+998` in another; `+998` was chosen. If the campaign is not Uzbekistan,
   `COUNTRIES` at the top of `js/form.js` is the only place to change.
5. **Decide whether the form should submit.** `SUBMIT` in `js/form.js` takes
   the contact, the tab it came from, the bonus and the locale.
6. **Look at it on a real phone.** The soft-keyboard path — the card scrolling
   inside itself while the page does not — is the one thing a desktop browser
   cannot honestly test.

## Working on it

`python -m http.server` will happily serve a stale `js/fx.js` against a freshly
edited `css/game.css`; half an hour went into measuring a bug that had already
been fixed on disk. Use a server that sends `Cache-Control: no-store`, or hard
reload every time.
