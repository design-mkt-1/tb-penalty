/* Reading a shot out of a drag.

   The penalty game this grew from aimed with six buttons laid over the goal,
   which is a fine way to pick a corner and a hopeless way to bend a ball: a
   free kick has a third dimension the buttons cannot express, and it is the
   only interesting one. So the ball is dragged instead, and the drag carries
   three separate readings at once:

     aim    where the drag points, mapped across and up the goal mouth
     power  how far it went, which is how hard it is struck
     curl   how much the drag itself BOWED, and to which side

   The third is the point of the whole thing, and it is worth being precise
   about what is measured. Not the end tangent: a flick ends fast and its last
   two samples are noise. Not the enclosed area on its own either, which says
   the same thing in units nobody can picture. What is measured is the mean
   perpendicular distance of the sampled path from its own chord, divided by
   the chord's length — a plain "how far out did you bow, as a fraction of how
   far you went". A straight drag reads 0 whatever its length or direction,
   which is the property that matters, and the sign is the side you bowed to.

   This module never draws and never decides an outcome. It hands game.js a
   shot and lets fx.js draw the arc. */
(function () {
  'use strict';

  /* Below this the drag is a tap, not an aim, and the shot is the random one
     the keyboard gets. Above this, a drag is deliberate. In CSS pixels before
     the stage unit is applied, because a thumb is the same size on every
     phone. */
  var TAP = 14;

  /* The drag length, as a fraction of the stage's short edge, that counts as
     a full-power shot. Measured against the short edge and not the width so
     that the same thumb travel means the same thing in portrait and in
     landscape; a fraction of the width would make every landscape shot weak. */
  var FULL = 0.34;

  /* How far a fully bowed drag bends the ball, as a fraction of the goal's
     width. A ball that can be bent more than half the goal off line stops
     reading as spin and starts reading as a bug. */
  var MAX_BEND = 0.55;

  var cfg = null;
  var live = null;      // the drag in progress, or null

  function stageBox() {
    return cfg.stage.getBoundingClientRect();
  }

  function shortEdge() {
    var s = stageBox();
    return Math.min(s.width, s.height);
  }

  /* ── the goal, as a quadrilateral ─────────────────────────── */

  /* The goal mouth is read as four corners rather than as a box. On today's
     head-on plate those four happen to form a rectangle, but the camera has
     moved three times over this project and twice landed on a quadrilateral —
     both posts vertical, the nearer one taller, tops and bases not lining up.
     Bilinear interpolation inside four points handles both without knowing
     which it has, so nothing here has to be told what the camera did.

     css/game.css puts four zero-size markers on the corners and this reads them
     back, so the geometry is stated once, in the stylesheet, and measured here
     rather than repeated.

     Re-read on every drag rather than cached. A drag is a few dozen frames and
     four getBoundingClientRect calls are nothing beside them; a cache would
     have to be invalidated on resize, on orientation change and on the soft
     keyboard, and the first one anybody forgot would aim the game at where the
     goal used to be. */
  function quad() {
    var q = {};
    cfg.corners.forEach(function (el) {
      var r = TBFx.rect(el);
      q[el.dataset.corner] = { x: r.x, y: r.y };
    });
    return q;
  }

  /* A point inside that quad, by bilinear interpolation.

     u runs from the near post to the far one, v from the crossbar down to the
     goal line. Interpolating the two posts separately and then between them is
     what keeps a target at the far post correctly smaller and higher than the
     same (u, v) at the near one. */
  function inQuad(q, u, v) {
    var topX = q['left-top'].x + (q['right-top'].x - q['left-top'].x) * u;
    var topY = q['left-top'].y + (q['right-top'].y - q['left-top'].y) * u;
    var baseX = q['left-base'].x + (q['right-base'].x - q['left-base'].x) * u;
    var baseY = q['left-base'].y + (q['right-base'].y - q['left-base'].y) * u;
    return { x: topX + (baseX - topX) * v, y: topY + (baseY - topY) * v };
  }

  /* ── the reading ──────────────────────────────────────────── */

  /* Where in the goal a drag points.

     Sideways is the drag's own horizontal travel, scaled so that a full-power
     drag straight across covers the goal and a little beyond it: the posts
     are not a wall, and a shot allowed to miss is what makes hitting the
     corner worth anything.

     Upwards is the drag's LENGTH, not its vertical travel. Those come apart
     as soon as the drag is diagonal, and length is the one that behaves: a
     long drag to the corner should be a shot into the top corner, not a shot
     into the side netting at knee height. It also means the two readings a
     player has to hold in their head are "which way" and "how far", which is
     what a run-up feels like.

     Both come out as (u, v) in the goal's own coordinates and are only then
     turned into a screen point, so the aim follows the perspective instead of
     fighting it. */
  function target(dx, dy) {
    var reach = shortEdge() * FULL;

    var across = Math.max(-1.35, Math.min(1.35, dx / reach));
    var len = Math.min(1, Math.sqrt(dx * dx + dy * dy) / reach);

    // v = 1 is the goal line and v = 0 the crossbar, so a longer drag is a
    // higher shot. It stops just under the bar rather than over it: sideways,
    // a miss is worth having because it is the visitor's own doing, but a
    // full-power drag is the most deliberate thing they can do and should not
    // be the one that sails over.
    var u = 0.5 + across * 0.5;
    var v = 0.92 - len * 0.84;

    var p = inQuad(quad(), u, v);
    return { x: p.x, y: p.y, power: len, u: u, v: v };
  }

  /* The bow: the mean perpendicular offset of the sampled path from its own
     chord, as a fraction of the chord's length.

     The perpendicular is the chord turned a quarter turn anticlockwise on
     screen, (x, y) -> (-y, x). For a drag pointing straight up the screen the
     chord is (0, -1) and the perpendicular is (1, 0), so a positive reading
     means the path bowed to the viewer's RIGHT — the same sign the bend takes
     in js/fx.js, and the same side the ball ends up curling towards. Draw a
     right-hand bow, get a shot that leaves to the right and comes back. */
  function bow(points) {
    var n = points.length;
    if (n < 3) return 0;

    var a = points[0];
    var b = points[n - 1];
    var cx = b.x - a.x;
    var cy = b.y - a.y;
    var c = Math.sqrt(cx * cx + cy * cy);
    if (c < TAP) return 0;

    var ux = cx / c, uy = cy / c;
    var px = -uy, py = ux;

    var sum = 0;
    for (var i = 1; i < n - 1; i++) {
      sum += (points[i].x - a.x) * px + (points[i].y - a.y) * py;
    }
    var mean = sum / (n - 2);

    // A half-circle bows out by about a third of its chord, and that is as
    // hard as a thumb can reasonably be asked to curve, so a third is 1.
    return Math.max(-1, Math.min(1, (mean / c) / 0.33));
  }

  function read(points) {
    var a = points[0];
    var b = points[points.length - 1];
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var t = target(dx, dy);
    return {
      aim: { x: t.x, y: t.y },
      power: t.power,
      curl: bow(points),
      length: Math.sqrt(dx * dx + dy * dy)
    };
  }

  /* ── a shot, whatever its source ──────────────────────────── */

  /* Turn a reading into the flight fx.js will draw. Kept here rather than in
     game.js because the mapping from "how the visitor moved their thumb" to
     "where the ball goes" is this module's whole job, and game.js is only
     allowed to decide what happens to it. */
  function toFlight(shot, ballEl) {
    var q = quad();
    var mouth = Math.abs(q['right-top'].x - q['left-top'].x);
    var b = TBFx.rect(ballEl);
    return TBFx.flight(
      { x: b.x, y: b.y },
      shot.aim,
      {
        r: b.w / 2,
        bend: shot.curl * mouth * MAX_BEND,
        // A harder strike is a flatter one. The weak shots loop.
        lift: 34 + (1 - shot.power) * 52
      }
    );
  }

  /* The shot the ball button fires when it is pressed rather than dragged:
     an impatient tap, and Enter on the ball. Random aim and random curl, so it
     is a real shot and not a scripted one — the outcome is decided by the
     attempt index in game.js either way. */
  function random() {
    var u = 0.1 + Math.random() * 0.8;
    var v = 0.15 + Math.random() * 0.7;
    var p = inQuad(quad(), u, v);
    return {
      aim: { x: p.x, y: p.y },
      power: 1 - v,
      curl: (Math.random() * 2 - 1) * 0.9,
      length: 0
    };
  }

  /* The shot a keyboard user fires at a target they have chosen. The prize is
     decided by which target the ball hits, so a visitor who cannot drag still
     has to be able to pick one — and the only honest way to give them that is
     to aim the shot at the thing they activated.

     The curl is random, as it is for the tap: they chose a prize, not a
     technique. */
  function atTarget(el, ballEl) {
    var t = TBFx.rect(el);
    var q = quad();
    var top = (q['left-top'].y + q['right-top'].y) / 2;
    var base = (q['left-base'].y + q['right-base'].y) / 2;
    return {
      aim: { x: t.x, y: t.y },
      power: base === top ? 0.6 : Math.max(0, Math.min(1, (base - t.y) / (base - top))),
      curl: (Math.random() * 2 - 1) * 0.6,
      length: 0
    };
  }

  /* ── the drag ─────────────────────────────────────────────── */

  function point(e) {
    var s = stageBox();
    return { x: e.clientX - s.left, y: e.clientY - s.top };
  }

  function start(e) {
    if (!cfg.enabled()) return;
    if (e.button != null && e.button !== 0) return;

    live = { id: e.pointerId, points: [point(e)] };
    cfg.ball.classList.add('is-aiming');

    // Capture, so the drag survives leaving the ball — which every drag does
    // immediately, the ball being about a thumb wide.
    try { cfg.ball.setPointerCapture(e.pointerId); } catch (err) {}

    // The preview reads `live` every frame rather than being handed a
    // snapshot, so it follows the finger without this module drawing anything
    // or knowing when a frame happens.
    TBFx.aimArc(function () {
      if (!live || live.points.length < 2) return null;
      var shot = read(live.points);
      if (shot.length < TAP) return null;
      return toFlight(shot, cfg.ball);
    });
  }

  function move(e) {
    if (!live || e.pointerId !== live.id) return;
    // Only while a drag is up: touch-action on .ball already stops the page
    // panning, and preventDefault on every move of a page that cannot scroll
    // buys nothing.
    live.points.push(point(e));
    // A flick can outrun the sampler; coalesced events fill the gaps in, and
    // the bow is measured off the shape of the path, so the gaps matter.
    if (e.getCoalescedEvents) {
      var all = e.getCoalescedEvents();
      for (var i = 0; i < all.length - 1; i++) live.points.push(point(all[i]));
    }
  }

  function end(e) {
    if (!live || e.pointerId !== live.id) return;
    var points = live.points;
    live = null;
    cfg.ball.classList.remove('is-aiming');
    try { cfg.ball.releasePointerCapture(e.pointerId); } catch (err) {}

    if (!cfg.enabled()) return;

    var shot = points.length > 1 ? read(points) : null;
    cfg.onShoot(shot && shot.length >= TAP ? shot : random());
  }

  function cancel() {
    if (!live) return;
    live = null;
    cfg.ball.classList.remove('is-aiming');
  }

  function init(options) {
    cfg = options;

    cfg.ball.addEventListener('pointerdown', start);
    cfg.ball.addEventListener('pointermove', move);
    cfg.ball.addEventListener('pointerup', end);
    cfg.ball.addEventListener('pointercancel', cancel);

    /* The button's own activation, which is what a keyboard produces. A mouse
       or a touch also fires click after pointerup, and that one has already
       been dealt with above — `detail` is 0 only for a synthetic activation,
       so this is the keyboard and nothing else. Testing for the absence of a
       drag instead would fire twice for every tap. */
    cfg.ball.addEventListener('click', function (e) {
      if (e.detail !== 0) return;
      if (!cfg.enabled()) return;
      cfg.onShoot(random());
    });

    /* The targets. Clicking one shoots at it, which is the pointer shortcut a
       keyboard user gets for free — and the only way either of them chooses a
       prize without dragging. A spent target is pointer-events: none and out
       of the tab order, so it cannot arrive here twice. */
    cfg.targets.forEach(function (el) {
      el.addEventListener('click', function () {
        if (!cfg.enabled()) return;
        cfg.onShoot(atTarget(el, cfg.ball), el);
      });
    });
  }

  window.TBAim = {
    init: init,
    random: random,
    atTarget: atTarget,
    toFlight: toFlight,
    quad: quad,
    inQuad: inQuad,
    MAX_BEND: MAX_BEND
  };
})();
