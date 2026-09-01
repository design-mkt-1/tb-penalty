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

**And then the camera came back in front.** Two renders were spent on the
angled view and neither got close: put beside the reference at the same frame
size, the goal measured 2.3:1 against the reference's 3.5:1 (measured on a
grid — the finder cannot read that screenshot), the rack covered 82% of the
mouth against its 53%, the ball sat at the rack's feet instead of a long stretch
of grass away, and only three of the four prizes could be picked out. The owner
called it — the angle was too hard to hit — and head-on removes the whole class
of failure rather than patching it: a real goal is exactly 3:1 seen square on,
so there is one number to check and it cannot be argued with.

**And then the camera went up.** Head-on at ball height fixed the geometry but
the picture still read as a band of grass seen edge-on. The owner asked for the
view from above, for the mannequins to be made properly, and for the scene to be
symmetric. So: a plate shot from high and well back, where the pitch reads as a
surface with its mowing stripes running away; a re-rendered rack with the figures
bolted to the rail and no faces; and the target columns made actually symmetric.

Nothing in the game changed for any of it. The geometry is six fractions and
four corner markers, and `js/aim.js` interpolates inside whatever shape it
reads, so four cameras have cost four plates and some numbers — no logic.

## What was measured, and what it is worth

**The goal, as a quadrilateral.** Six numbers, and everything hangs off them:

```
left post   x .4035   top .2804   base .3563
right post  x .5914   top .2740   base .3647
```

`python tools/cutout.py` prints these off the file it ships. They are NOT the
numbers off the raw render — the tool adds 42% more foreground to the bottom,
which moves both vertical fractions. Re-run it against a new plate and paste
what it prints into `css/game.css`. Verified by drawing the quad back over the
photograph and confirming it lands on the painted frame.

Named left and right, by screen x, and not near and far: which post is nearer
flips when the camera crosses the goal's axis, and a depth name would silently
invert the aim on a plate that looked fine.

The two posts agree to within .009 — the plate is head-on. They are still
six numbers rather than four, because `js/aim.js` interpolates inside whatever
shape the four markers describe and a rectangle is simply the case where they
line up. Collapsing them would have to be undone the next time the camera moves.

**The dummy rack inside its own canvas.** x .1663–.8315, y .1442–.8538.
`RACK_BODY` in `js/game.js`, also printed by the tool. The rest of the element
is empty canvas and must not block a shot.

**The mouth's aspect, which is the one ratio to check after a re-shoot.**
481 × 169 px in the photograph, and **3.12:1** once the corner markers render,
against the 3:1 of a real goal seen dead on. That is the acceptance test for a
render: the two angled plates measured 1:1 and 2.3:1, and neither failure stayed
in the photograph (see *Bugs and traps*).

**What the rack's width came to.** 54% of the mouth, measured off the rendered
element — the reference's own figure. It is now pinned directly rather than left
to fall out of the height, which is what let it reach 82% and cover a prize.

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
* **The rack's width used to fall out of its height, and that hid a prize.**
  The sprite's aspect turns one into the other, so a height of 1.13 goal-heights
  gave a body 1.87 goal-heights wide — 65% of a 2.88:1 mouth, 82% of a 2.3:1
  one, where it covered a prize outright. The width is pinned directly now, at
  .54 of the mouth, and the height follows. Keep it that way: width decides
  whether a prize is coverable, and a wrong height is at least visible.
* **The rack's standoff has to move when the aspect does.** A higher camera
  shortens the mouth, so `--rack-foot` in goal-heights becomes a shorter drop on
  screen. The reference's .78 left the figures' heads nine pixels above the goal
  line on this plate — a wall the ball sails over. .55 now. This is the number
  that decides whether there is a game, and nothing warns you about it.
* **Three cameras, and the same lesson each time.** Head-on was where this
  started; it was moved to a three-quarter view to match a FIFA reference, came
  back at 1:1, was re-shot at 2.3:1, and has now come back to head-on. Compare
  a render against the reference *at the same frame size and in numbers* before
  building on it — the two angled plates both looked plausible in isolation and
  neither survived being measured.
* **The goal need not be in the middle of the plate.** On the current head-on
  render it is, at .4975, so `--plate-x` computes to a quarter of a percent and does
  nothing. On the plate before it the goal sat at .424, and hanging the
  photograph on the stage's centre line put the left post 11px from a 390px
  phone's edge with both left-hand prizes half off screen. Do not delete
  `--plate-x` because today's render does not need it, and remember that *every*
  plate-anchored rule has to add it. There are five: `.pitch::before`,
  `.goal__c`, `.target`, `.dummies-zone` and `.msg`. Miss one and that element
  slides off the photograph — `.msg` was in fact missed when the shift was first
  added, and went unnoticed only because the next plate happened to be centred.
* **Target size is a fit constraint, not taste, and it moves with the camera.**
  Two rows have to live inside the mouth's height, which is 1/aspect of its
  width. At 3.12:1 that is .32, so `--t` is .115. The .14 that suited the last
  plate left four pixels of air and the targets touched the bar and the line;
  the .18 before that did not fit at all.
* **Numbers tuned for an old plate do not announce themselves.** The right-hand
  target column sat at u .85 against the left's .12 — .15 in from one post and
  .12 from the other — for two plates, because the angled composition had needed
  the far side pulled in. Nine pixels of asymmetry on a 299px goal: it survived
  review and the owner caught it. On any re-shoot, re-derive every number that
  was ever justified by the old camera.
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

A second one, and it produced a convincing false bug twice: **if the globals you
set up come back `undefined`, the evaluate is not looking at the page you
instrumented.** Both times it read a state that seemed to say a click on one
target had knocked over another — a real bug, if it had been real. Re-arm and
re-run instead of trusting that reading. The way to settle it for good is ground
truth rather than inference: a capturing `click` listener on each target plus a
`MutationObserver` on `data-spent`, which prints the click-to-spend mapping and
the attempt number with it, and showed the game behaving correctly all along.

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

1. **Fill the URLs.** Five one-line changes, listed in the README's *Known
   gaps*. Nothing else has to move.
2. **Have the UZ and RU strings reviewed.** They shipped unreviewed.
3. **Settle the market.** The picker defaults to `+998` while the live site
   quotes RON, EUR and USD. `COUNTRIES` at the top of `js/form.js`.
4. **Get the offer amount** and replace `(AMOUNT)` in `js/i18n.js` — or confirm
   it should stay a placeholder, which is the honest answer if the page runs in
   more than one currency.
5. **Decide whether the form should submit.** `SUBMIT` in `js/form.js` takes
   the contact, the tab it came from, the bonus and the locale.
6. **Look at it on a real phone.** The soft-keyboard path — the card scrolling
   inside itself while the page does not — is the one thing a desktop browser
   cannot honestly test.

## Working on it

`python -m http.server` will happily serve a stale `js/fx.js` against a freshly
edited `css/game.css`; half an hour once went into measuring a bug that had
already been fixed on disk. Use a server that sends `Cache-Control: no-store`,
or hard reload every time.
