/* The scripted free kick.

   The first attempt always hits the wall, the second always goes in. What the
   visitor's drag decides is where the ball is aimed, how hard it is struck and
   which way it bends — never whether it scores.

   The wall is not a prop and the block is not a cut. The wall element has a
   real box on screen and a real depth along the flight, both derived from
   where css/game.css puts it, and a shot is blocked when the trajectory is
   inside that box at that depth. So the first attempt is arranged by moving
   the ball's target until it genuinely crosses the wall, not by playing a
   block animation over a shot that missed; and the second is arranged by
   lifting or bending it until it genuinely clears, not by switching the
   collision off. If the CSS moves the wall, both keep working. */
(function () {
  'use strict';

  var stage, ball, keeper, msg, anim, goal, dust, hit, wall;
  var attempt = 0;
  var busy = false;
  var msgTimer = 0;
  var msgHideTimer = 0;

  /* Every timer shoot() starts, so reset() can cancel them. `busy` makes them
     unreachable along the normal path, but reset() is also called from
     form.js when the visitor presses Escape — that is, from outside this
     state machine, in the middle of a sequence. */
  var timers = [];

  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  function wait(ms) {
    return new Promise(function (r) { later(r, ms); });
  }

  /* ══ the wall ═════════════════════════════════════════════════ */

  /* How far the wall jumps, as a fraction of its own height. One number,
     used both by the animation that lifts the sprite and by the box the
     trajectory is tested against — the alternative is a wall that is drawn
     in one place and blocks in another. */
  var WALL_JUMP = 0.17;

  /* The clearance a shot needs over or around the jumped wall before it counts
     as having beaten it, in fractions of the wall's height. Zero would let the
     winning shot shave the top man's hair, which reads as a graphics glitch
     rather than as a goal. */
  var CLEAR = 0.14;

  /* Where the wall stands along the flight.

     Not a constant. `t` in a flight runs from the ball to the goal, and the
     ball's ground track runs from under the ball to the goal line in the same
     parameter, so a wall standing on the grass has a `t` that can be read off
     its own feet — invert the camera's progress curve and there it is. Written
     as a number instead, it would have to be re-tuned by hand every time the
     CSS nudged the wall, and nothing would say so when it was not. */
  function wallDepth(path) {
    var w = TBFx.rect(wall);
    // Their boots, not the bottom of the canvas they are exported on: the
    // depth is where the men are standing.
    var feet = w.top + w.h * WALL_BODY.bottom;
    var g0 = path.at(0).ground;
    var g1 = path.at(1).ground;
    if (g1 === g0) return 0.4;

    var u = (feet - g0) / (g1 - g0);
    u = Math.max(0.05, Math.min(0.92, u));

    // u = Z*t / (1 + (Z-1)t)  inverted for t.
    var Z = 1 / TBFx.S_END;
    return u / (Z - u * (Z - 1));
  }

  /* Where the four men actually are inside the sprite's canvas, as fractions
     of it. tools/cutout.py exports every pose on one uncropped canvas so a
     swap cannot move them, which means most of the element is empty — the
     canvas is 824 wide and the men occupy x 231 to 592 of it, y 46 to 411 of
     460. Testing the element's own box instead makes the wall two thirds
     wider than it looks and taller than the men are, so a ball threading the
     gap outside them is stopped by nothing at all.

     These come from the bounding box cutout.py prints. Re-run it after
     changing the renders and paste what it reports. */
  var WALL_BODY = { left: 0.280, right: 0.719, top: 0.100, bottom: 0.893 };

  /* The wall's box at the moment the ball reaches it: the men, on screen,
     lifted by the jump they are in the middle of. */
  function wallBox() {
    var w = TBFx.rect(wall);
    var h = w.h * (WALL_BODY.bottom - WALL_BODY.top);
    var lift = h * WALL_JUMP;
    return {
      left: w.left + w.w * WALL_BODY.left,
      right: w.left + w.w * WALL_BODY.right,
      top: w.top + w.h * WALL_BODY.top - lift,
      bottom: w.top + w.h * WALL_BODY.bottom - lift,
      h: h
    };
  }

  function hitsWall(path, t, boxed) {
    var p = path.at(t);
    return p.x > boxed.left && p.x < boxed.right && p.y > boxed.top;
  }

  /* Rebuild a flight that keeps its bend and lift but arrives somewhere else.
     Solving for the target rather than nudging it by trial keeps one model of
     the curve — the one in js/fx.js — and no second opinion about it. */
  function retarget(path, point, t) {
    var p = path.at(t);
    var s = p.s;
    var u = p.u;
    if (!u) return path;

    var lift = path.lift;
    var bend = path.bend;
    // Inverted straight out of at() in js/fx.js — one model of the curve, and
    // this is its inverse, not a second opinion about it.
    var dx = (point.x - path.from.x - bend * (u - t * t * (s / TBFx.S_END))) / u;
    var dy = (point.y - path.from.y + lift * 4 * t * (1 - t) * s) / u;

    return TBFx.flight(path.from,
                       { x: path.from.x + dx, y: path.from.y + dy },
                       { r: path.r, bend: bend, lift: lift / TBFx.unit() });
  }

  /* ── attempt one: into the wall ───────────────────────────── */

  /* Whatever was aimed at, the ball ends up in the wall. The point it is sent
     to is the point of the wall nearest to where the shot was already going,
     so a shot down the left is blocked by the man on the left: the visitor's
     aim still decides everything except the result. */
  function intoWall(path, t) {
    var box = wallBox();
    if (hitsWall(path, t, box)) return path;

    var p = path.at(t);
    var inset = (box.right - box.left) * 0.12;
    var x = Math.max(box.left + inset, Math.min(box.right - inset, p.x));
    var y = Math.max(box.top + box.h * 0.18,
                     Math.min(box.bottom - box.h * 0.1, p.y));
    return retarget(path, { x: x, y: y }, t);
  }

  /* ── attempt two: over it or round it ─────────────────────── */

  /* First put the arrival inside the posts — a winning shot has to be on
     target before anything else is decided about it — then buy the clearance
     the wall needs, without moving the arrival again. */
  function beatWall(path, t, curl) {
    var g = TBFx.rect(goal);
    var inset = g.w * 0.09;
    var aim = {
      x: Math.max(g.left + inset, Math.min(g.right - inset, path.to.x)),
      y: Math.max(g.top + g.h * 0.14, Math.min(g.bottom - g.h * 0.12, path.to.y))
    };

    var K = TBFx.unit();
    var over = TBFx.flight(path.from, aim,
                           { r: path.r, bend: path.bend, lift: path.lift / K });
    var box = wallBox();
    if (!hitsWall(over, t, box)) return over;

    var p = over.at(t);
    var margin = box.h * CLEAR;

    /* Over the top, and tried first when the drag was not curled — because a
       ball that swerves for someone who struck it straight is the game
       contradicting its own input. Raising the arc does not move either end of
       it, so the arrival survives untouched.

       The ceiling is what stops a shot aimed at the bottom corner from
       becoming a lob: past it, going round is the better lie. */
    var need = (p.y - (box.top - margin)) / (4 * t * (1 - t) * p.s);
    var lift = (path.lift / K) + Math.max(0, need) / K;
    var straight = curl == null || Math.abs(curl) < 0.35;
    if (straight && lift < 320) {
      var over2 = TBFx.flight(path.from, aim,
                              { r: path.r, bend: path.bend, lift: lift });
      if (!hitsWall(over2, t, box)) return over2;
    }

    /* Round the outside, on the side the visitor curled towards. The arrival
       is already fixed by the model — bending cannot move it — so this only
       has to solve for how much bend puts the ball outside the wall as it
       passes:

         x(t) = from.x + A·u + bend·(u - t²·s/S_END)     A = aim.x - from.x

       which is linear in bend, and the bracket is positive for any wall short
       of the goal line. */
    /* Which side to pass. The curl if there was one, because that is what the
       visitor asked for; otherwise the side they aimed at, so a shot dragged
       towards the left post does not swerve away to the right. */
    var side = straight
      ? (aim.x < (box.left + box.right) / 2 ? -1 : 1)
      : ((curl || 0) < 0 ? -1 : 1);
    var edge = side < 0 ? box.left - margin : box.right + margin;
    var A = aim.x - path.from.x;
    var denom = p.u - t * t * (p.s / TBFx.S_END);
    if (Math.abs(denom) > 1e-4) {
      var bend = (edge - path.from.x - A * p.u) / denom;
      var capped = Math.max(-g.w * 1.1, Math.min(g.w * 1.1, bend));
      var round = TBFx.flight(path.from, aim,
                              { r: path.r, bend: capped, lift: path.lift / K });
      if (!hitsWall(round, t, box)) return round;
    }

    // Nothing curled far enough: go over it after all, however high that is.
    return TBFx.flight(path.from, aim,
                       { r: path.r, bend: path.bend, lift: lift });
  }

  /* ══ geometry helpers ═════════════════════════════════════════ */

  /* Which of the six cells the ball is heading for, so the keeper has a dive
     to pick. The aim is a continuous point now rather than one of six buttons,
     so it is bucketed here; js/animator.js keeps its cell names and its
     COVERS / WRONG_WAY tables untouched. */
  function cellFor(aim) {
    var g = TBFx.rect(goal);
    var col = aim.x < g.left + g.w / 3 ? 'l'
            : aim.x > g.left + g.w * 2 / 3 ? 'r' : 'c';
    var row = aim.y < g.top + g.h * 0.5 ? 't' : 'b';
    return row + col;
  }

  /* Which way the ball comes off. Off the wall it is pushed back roughly the
     way it came; off a glove the keeper's dive throws it further out. */
  function sideOf(x) {
    var g = TBFx.rect(goal);
    return x < g.x ? -1 : 1;
  }

  /* ── impact ───────────────────────────────────────────────── */

  /* Restart a one-shot CSS animation. Removing the class is not enough on its
     own -- the style has to be recomputed in between, which reading a layout
     property forces. Cheap enough here: a visitor fires it twice a visit. */
  function fx(el, vars) {
    el.classList.remove('is-live');
    void el.offsetWidth;
    if (vars) Object.keys(vars).forEach(function (k) { el.style.setProperty(k, vars[k]); });
    el.classList.add('is-live');
  }

  /* The strike point, as a share of the goal box, so the ring lands where the
     ball hit whatever size the goal renders at. */
  function mark(point) {
    var g = TBFx.rect(goal);
    fx(hit, {
      '--hit-x': ((point.x - g.left) / g.w * 100).toFixed(1) + '%',
      '--hit-y': ((point.y - g.top) / g.h * 100).toFixed(1) + '%'
    });
  }

  function jumpWall() {
    wall.dataset.pose = 'jump';
    // The men's own height, not the canvas's — the same quantity wallBox()
    // lifts the collision by, so what is drawn and what blocks agree.
    var box = wallBox();
    var lift = -(box.h * WALL_JUMP);
    if (TBFx.reduced()) {
      later(function () { wall.dataset.pose = 'idle'; }, 420);
      return;
    }
    wall.animate([
      { transform: 'translateX(-50%) translateY(0)' },
      { transform: 'translateX(-50%) translateY(' + lift.toFixed(1) + 'px)', offset: 0.42 },
      { transform: 'translateX(-50%) translateY(' + (lift * 0.9).toFixed(1) + 'px)', offset: 0.6 },
      { transform: 'translateX(-50%) translateY(0)' }
    ], { duration: 820, easing: 'cubic-bezier(.2,.9,.3,1)' });
    later(function () { wall.dataset.pose = 'idle'; }, 800);
  }

  /* ── messages ─────────────────────────────────────────────── */

  function say(text, ms) {
    clearTimeout(msgTimer);
    clearTimeout(msgHideTimer);
    /* Unhide before writing, not after. .msg is role="status": a hidden
       element is not in the accessibility tree, so a text change made while it
       is still hidden can go unannounced entirely. */
    msg.hidden = false;
    msg.textContent = text;
    TBFx.next(function () { msg.classList.add('is-visible'); });
    msgTimer = setTimeout(function () {
      msg.classList.remove('is-visible');
      /* Held as well: clearTimeout(msgTimer) cannot reach a timer that timer
         started, so a second message inside the 260ms exit would be unhidden
         and then hidden again by the first message's tail. */
      msgHideTimer = setTimeout(function () { msg.hidden = true; }, 260);
    }, ms || 1600);
  }

  /* ══ the two scripted shots ═══════════════════════════════════ */

  function shoot(shot) {
    if (busy) return;
    busy = true;
    attempt += 1;

    var scores = attempt >= 2;
    var T = TBAnimator.TIMING;
    var aimed = TBAim.toFlight(shot, ball);
    var t = wallDepth(aimed);
    var path = scores ? beatWall(aimed, t, shot.curl) : intoWall(aimed, t);

    var cell = cellFor(path.to);
    var dive = scores ? TBAnimator.WRONG_WAY[cell] : TBAnimator.COVERS[cell];

    stage.dataset.state = 'shooting';
    ball.classList.add('is-armed');
    TBAudio.play('kick', 0.9);
    jumpWall();

    // The keeper commits before the ball arrives, as he would in a real free
    // kick: he is reading the strike, not the flight.
    later(function () { anim.play(dive); }, 90);

    // The plume and the jolt are the impact a still sprite cannot show. Which
    // frame carries that impact depends on the dive, so the animator is asked
    // rather than told: a high dive never lands, and its only contact with the
    // grass is the push-off.
    var impact = anim.impact(dive);
    later(function () {
      fx(dust, { '--dust-x': impact.x });
      TBFx.shake(220, impact.force);
    }, 90 + T.duration * impact.at);

    if (!scores) {
      return TBFx.shoot(ball, path, { duration: 700, stopAt: t })
        .then(function (state) {
          mark(state);
          TBAudio.play('save', 0.9);
          TBFx.shake(260, 4);
          // Off the wall, not off a glove: it comes back the way it came.
          return TBFx.deflect(state, -sideOf(state.x) || 1);
        })
        .then(function () {
          say(TBI18n.t('msg.wall'), 1900);
          ball.classList.remove('is-armed');
          // He gets to enjoy it. react() stands him back up on its own once
          // the hold is over, so nothing else has to reset him here.
          anim.react('cheer', { hold: 900 });
          return TBFx.home(ball);
        })
        .then(function () {
          stage.dataset.state = 'idle';
          busy = false;
        })
        .catch(recover);
    }

    TBFx.shoot(ball, path, { duration: 760 })
      .then(function (state) {
        mark(state);
        TBAudio.play('net', 0.8);
        TBAudio.play('cheer', 0.7);
        TBFx.netBulge(state.x, state.y, state.r * state.s);
        TBFx.shake(320, 5);
        TBFx.intoNet(state);
        stage.dataset.state = 'celebrate';
        // A beat, then the confetti. 110 bits out of the strike point cover
        // the net bulge completely, and the bulge is over inside 520ms --
        // fired together, the net was never seen at all. The gap also reads
        // as a crowd taking a moment to realise.
        later(function () {
          TBFx.burst(state);
          // With the burst, not with the goal: the 180ms gap is the whole
          // point of the delay, and a pop on the goal would close it.
          TBAudio.play('confetti', 0.55);
        }, 180);
        // He is still in the air when the ball crosses the line. Let him land
        // before he reacts to it.
        later(function () {
          anim.react('beaten', { hold: 1200 });
          // Quiet: this one plays under net, cheer and the confetti, and is
          // meant to be felt rather than picked out. See tools/sfx.py.
          TBAudio.play('slump', 0.5);
        }, 320);
        say(TBI18n.t('msg.goal'), 1400);
        return wait(1500);
      })
      .then(function () {
        ball.classList.remove('is-armed');
        stage.dataset.state = 'form';
        busy = false;
        window.TBForm.open();
      })
      .catch(recover);
  }

  /* Nothing above is allowed to leave the page locked. `busy` is the only
     latch, so an exception inside a .then would strand it at true with no
     trace at all: the ball dead, nothing in the console to say why. */
  function recover(err) {
    if (window.console && console.error) {
      console.error('[tb-penalty] the shot sequence failed', err);
    }
    ball.classList.remove('is-armed');
    busy = false;
    stage.dataset.state = 'idle';
  }

  /* ── back to the start ────────────────────────────────────── */

  /* Called when the registration card closes. The stage is still carrying
     data-state="form", which holds .ball at pointer-events:none (css/game.css),
     and `attempt` is still past the end of the scripted sequence — so without
     this the page is dead, and clearing only the state would make the next
     shot score instantly. Both have to be undone together. */
  function reset() {
    clearTimers();
    clearTimeout(msgTimer);
    clearTimeout(msgHideTimer);
    msg.classList.remove('is-visible');
    msg.hidden = true;

    ball.classList.remove('is-armed');
    dust.classList.remove('is-live');
    hit.classList.remove('is-live');
    wall.dataset.pose = 'idle';

    attempt = 0;
    busy = false;

    anim.reset();
    stage.dataset.state = 'idle';
    return TBFx.home(ball);
  }

  /* ── boot ─────────────────────────────────────────────────── */

  function init() {
    stage    = document.getElementById('stage');
    ball     = document.querySelector('.ball');
    keeper   = document.querySelector('.keeper');
    goal     = document.querySelector('.goal');
    wall     = document.querySelector('.wall');
    dust     = document.querySelector('.dust');
    hit      = document.querySelector('.hit');
    msg      = document.querySelector('.msg');

    TBFx.init();
    anim = new TBAnimator.PoseAnimator(keeper,
                                       document.querySelector('.keeper-shadow'));
    /* Dive sprites that nothing needs until the first shot. The one pose on
       screen, keeper-idle, comes from css/game.css and is already loading.
       Warm the rest when the browser is idle, or on the first gesture,
       whichever comes first — a shot cannot start before that gesture, so the
       sprites are never late. */
    var warmed = false;
    var warm = function () {
      if (warmed) return;
      warmed = true;
      anim.preload();
      var jump = new Image();
      jump.decoding = 'async';
      jump.src = 'assets/img/wall-jump.webp';
    };
    if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 3000 });
    else setTimeout(warm, 1200);
    window.addEventListener('pointerdown', warm, { once: true });

    keeper.classList.add('is-idling');
    ball.classList.add('is-bobbing');
    stage.dataset.state = 'idle';

    TBAim.init({
      ball: ball,
      stage: stage,
      goal: goal,
      enabled: function () { return !busy && stage.dataset.state === 'idle'; },
      onShoot: shoot
    });
  }

  window.TBGame = {
    init: init,
    reset: reset,
    attempt: function () { return attempt; }
  };
})();
