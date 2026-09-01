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
near post   x .3182   top .2010   base .5117
far post    x .5620   top .2674   base .4625
```

`python tools/cutout.py` prints these off the file it ships. They are NOT the
numbers off the raw render — the tool adds 42% more foreground to the bottom,
which moves both vertical fractions. Re-run it against a new plate and paste
what it prints into `css/game.css`. Verified by drawing the quad back over the
photograph and confirming it lands on the painted frame.

**The dummy rack inside its own canvas.** x .2275–.7639, y .0808–.9538.
`RACK_BODY` in `js/game.js`, also printed by the tool. The rest of the element
is empty canvas and must not block a shot.

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
