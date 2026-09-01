# Picking this up

Read `README.md` first — it carries the architecture, the game rules and the
reasoning. This file is the handoff: what was measured, what was decided, what
was left, and how to check the work.

Say **"start"** and it means read this and continue from *What is next*.

---

## What this became

It started as a head-on free kick over a human wall, with a goalkeeper. The
owner then supplied a FIFA training-mode reference and asked for three changes:
dummies instead of players, four targets on the goal, and a camera from the
side rather than head-on.

The third forced the rest. Every piece of geometry hung off four fractions of a
head-on plate, and a goal seen at an angle is not a rectangle on screen. The
keeper's ten poses were rendered facing the camera and could not survive the
turn, so — with the owner's agreement — he is gone and the scene is target
practice. `js/animator.js` went with him.

## What was measured, and what it is worth

**The goal, as a quadrilateral.** Six numbers, and everything hangs off them:

```
left post   x .2620   top .1971   base .4020
right post  x .5859   top .2391   base .3935
```

`python tools/cutout.py` prints these off the file it ships. They are NOT the
numbers off the raw render — the tool adds 42% more foreground to the bottom,
which moves both vertical fractions. Re-run it against a new plate and paste
what it prints into `css/game.css`. Verified by drawing the quad back over the
photograph and confirming it lands on the painted frame.

Named left and right, by screen x, and not near and far: which post is nearer
flips when the camera crosses the goal's axis, and a depth name would silently
invert the aim on a plate that looked fine.

**The dummy rack inside its own canvas.** x .1620–.8380, y .1654–.8962.
`RACK_BODY` in `js/game.js`, also printed by the tool. The rest of the element
is empty canvas and must not block a shot.

**The mouth's aspect, which is the one ratio to check after a re-shoot.** It is
about 2.3:1 here against the 3:1 of a real goal seen dead on, so the camera sits
only slightly off the axis — the owner asked for "more central, only 5–10
degrees to the right", and this is what that came to. The reference itself reads
nearer 3.5:1, so this plate is still the squarer of the two, and that difference
is why the rack comes out wide (see *Bugs and traps*).

## Decisions already taken

* **No goalkeeper.** Target practice, as in the reference.
* **The targets are the prize.** Two carry the sport bonus and two the casino
  one, split diagonally so either is reachable with a comfortable shot. The one
  struck flips, stays flipped, and the card opens with its bonus preselected.
* **The targets are real buttons.** A pointer user drags the ball and never
  touches one, but the target decides the bonus, so a keyboard user has to be
  able to choose. Four tab stops, and it is the only honest way to give them
  that.
* **Money is multi-currency.** The targets say `200%` and `150 FS` and no
  absolute sum, because top-bet.com quotes the cap per currency — 2 103 RON,
  1 500 EUR, 1 738.73 USD. `(AMOUNT)` stays a placeholder in the card.
* **The rack's placement is a composition choice**, not the photograph's
  perspective, and `css/game.css` says so at length. The collision follows it
  either way.
* **The rack does not jump.** It is bolted to a wheeled frame. It rocks back.

## Bugs and traps worth not reintroducing

* **`cqmin` inside `.target` resolves against `.pitch`.** `.target` is not a
  container, so a "4cqmin" border came out fifteen pixels thick on a
  seventy-pixel target and the four targets rendered as solid red blocks. Every
  size inside a target is a fraction of `--t`, its own side.
* **The goal finder is not a corner finder.** Seen at an angle the widest white
  thing in the frame is the back netting, not a post; a bright fold in the
  netting can out-run a real upright; a floodlight pylon out-runs both. See the
  README for the three fixes. If a new plate reports a goal that looks wrong,
  check the search band in `PLATES` first.
* **The rack must overlap the goal mouth.** Pushed too far down the plate it
  sat entirely below the goal line: the collision still fired, because the
  geometry is real, but the ball stopped in open grass and the block read as a
  bug.
* **The rack's width is not set anywhere — it falls out of its height.**
  `--rack-h` is a multiple of the goal's height and the sprite's aspect turns
  that into a width, so a plate whose mouth reads squarer than the reference's
  produces a rack wider than the goal itself. At 1.13 goal-heights on this plate
  the rack comes to about 120% of the mouth's width where the reference has it
  at 58%, and it covers the lower-right prize. If a re-shoot brings the mouth
  nearer 3:1 this resolves itself; until then it is the known cosmetic gap.
* **The goal is not in the middle of the plate.** It sits at .424 of its width,
  so hanging the plate on the stage's centre line hangs the goal left of it — on
  a 390px phone that put the left post 11px from the edge with both left-hand
  prizes half off screen. `--plate-x` corrects it, and *every* plate-anchored
  rule has to add it: `.pitch::before`, `.goal__c`, `.target`, `.dummies-zone`.
  Miss one and that element slides off the photograph.
* **`pickBonus()` used to steal focus unconditionally.** Now that the game
  calls it before the card is shown, an unguarded `focus()` moves focus into a
  hidden dialog. It only acts if the menu was actually open — the same guard
  `pickCountry()` already had.
* `components()` in `tools/cutout.py` finds regions in raster order and stops
  after `limit` of them. Clean the mask; do not raise the limit.
* Deferred hides need a cancellable handle. The bonus and country pickers,
  the language menu, the error line and the sheet all hide themselves on a
  timer after their exit transition; without a handle, a close scheduled by
  `restore()` lands on a menu the visitor has since opened.

## What was verified, and how

Driven in a real browser with the geometry read out of the page. Screenshots
always arrive after a 700 ms flight has finished, so the flight is checked by
instrumenting `TBFx.shoot` and reading the trajectory back.

A trap in the harness, not the page: an automated tab is often `hidden`, and a
hidden tab gets no `requestAnimationFrame` at all. `js/fx.js` already knows this
and falls back to `setTimeout`, but Chrome throttles background timers to about
one a second, so a 700 ms flight takes the better part of a minute. Anything
that `await`s a flight inside a single evaluate will time out and look exactly
like a frozen renderer. Arm a watcher, return immediately, and poll.

* Attempt one stops **inside** the rack's box at the rack's depth — for a drag
  bowed left, bowed right and dead straight, and for a shot fired at each of
  the four targets.
* Attempt two lands **on the aimed target to within a pixel**, for all four in
  turn, having cleared the rack — over the top when the drag was straight, past
  the side when it was curled or when the target sits behind the rack.
* The struck target flips, stays flipped, and closing the card unflips all
  four and resets the attempt counter to 0.
* The card opens with the matching bonus selected, for both prizes, and focus
  stays on the card.
* Ten clicks in a row leave `busy` false and the stage idle.
* `scrollX`/`scrollY` stay 0; nothing visible overflows `#stage` in portrait or
  landscape.
* EN / RU / UZ switch with no missing glyphs and no clipping.
* No console errors and no 404s.

## What is next

1. **Decide about the rack covering the lower-right prize.** All four targets
   are on screen and reachable, but on a phone the rack's figures cross the
   right-hand pair and the lower one is only half readable behind two heads.
   Two ways out, and it is a judgement call, not a bug to grind at: re-render
   the plate with the mouth nearer the reference's 3.5:1, which fixes it
   arithmetically, or drop `--rack-h` below about 0.9 goal-heights and accept
   figures that read slightly shorter than the reference's.
2. **Fill the URLs.** Five one-line changes, listed in the README's *Known
   gaps*. Nothing else has to move.
3. **Have the UZ and RU strings reviewed.** They shipped unreviewed.
4. **Settle the market.** The picker defaults to `+998` while the live site
   quotes RON, EUR and USD. `COUNTRIES` at the top of `js/form.js`.
5. **Get the offer amount** and replace `(AMOUNT)` in `js/i18n.js` — or confirm
   it should stay a placeholder, which is the honest answer if the page runs in
   more than one currency.
6. **Decide whether the form should submit.** `SUBMIT` in `js/form.js` takes
   the contact, the tab it came from, the bonus and the locale.
7. **Look at it on a real phone.** The soft-keyboard path — the card scrolling
   inside itself while the page does not — is the one thing a desktop browser
   cannot honestly test.

## Working on it

`python -m http.server` will happily serve a stale `js/fx.js` against a freshly
edited `css/game.css`; half an hour once went into measuring a bug that had
already been fixed on disk. Use a server that sends `Cache-Control: no-store`,
or hard reload every time.
