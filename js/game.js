/* The scripted free kick.

   The first attempt always hits the dummy rack, the second always hits a
   target. What the visitor's drag decides is where the ball is aimed, how hard
   it is struck, which way it bends — and, on the second attempt, which of the
   four prizes they win.

   Neither outcome is faked. The rack has a real box on screen and a real depth
   along the flight, both derived from where css/game.css puts it, and a shot
   is blocked when the trajectory is inside that box at that depth. So the
   first attempt is arranged by moving the ball's target until it genuinely
   crosses the rack, not by playing a block over a shot that missed; and the
   second is arranged by lifting or bending it until it genuinely clears. If
   the CSS moves the rack, both keep working. */
(function () {
  'use strict';

  var stage, ball, msg, goal, hit, rack, rackZone, pitch, targets;
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

  /* ══ the dummy rack ═══════════════════════════════════════════ */

  /* Where the five figures actually are inside the sprite's canvas, as
     fractions of it. tools/cutout.py exports the object on its full uncropped
     canvas and prints exactly these four numbers; the rest of the element is
     empty. Testing the element's own box instead would make the rack half
     again as wide as it looks, so a ball threading the gap beside it would be
     stopped by nothing at all. Re-run the tool after changing the render and
     paste what it reports. */
  var RACK_BODY = { left: 0.1620, right: 0.8380, top: 0.1654, bottom: 0.8962 };

  /* The clearance a shot needs over or around the rack before it counts as
     having beaten it, as a fraction of the rack's height. Zero would let the
     winning shot shave the top dummy's head, which reads as a graphics glitch
     rather than as a goal. */
  var CLEAR = 0.14;

  /* The rack's box on screen: the figures, not the canvas around them. */
  function rackBox() {
    var r = TBFx.rect(rack);
    return {
      left: r.left + r.w * RACK_BODY.left,
      right: r.left + r.w * RACK_BODY.right,
      top: r.top + r.h * RACK_BODY.top,
      bottom: r.top + r.h * RACK_BODY.bottom,
      h: r.h * (RACK_BODY.bottom - RACK_BODY.top)
    };
  }

  /* Where the rack stands along the flight.

     Not a constant. `t` in a flight runs from the ball to its target, and the
     ball's ground track runs from under the ball to the goal line in the same
     parameter, so an object standing on the grass has a `t` that can be read
     off its own feet — invert the camera's progress curve and there it is.
     Written as a number instead, it would have to be re-tuned by hand every
     time the CSS nudged the rack, and nothing would say so when it was not. */
  function rackDepth(path) {
    var box = rackBox();
    var g0 = path.at(0).ground;
    var g1 = path.at(1).ground;
    if (g1 === g0) return 0.4;

    var u = (box.bottom - g0) / (g1 - g0);
    u = Math.max(0.05, Math.min(0.92, u));

    // u = Z*t / (1 + (Z-1)t)  inverted for t.
    var Z = 1 / TBFx.S_END;
    return u / (Z - u * (Z - 1));
  }

  function hitsRack(path, t, box) {
    var p = path.at(t);
    return p.x > box.left && p.x < box.right && p.y > box.top;
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

  /* ── attempt one: into the rack ───────────────────────────── */

  /* Whatever was aimed at, the ball ends up in the dummies. The point it is
     sent to is the point of the rack nearest to where the shot was already
     going, so a shot down the left is blocked by the dummy on the left: the
     visitor's aim still decides everything except the result. */
  function intoRack(path, t) {
    var box = rackBox();
    if (hitsRack(path, t, box)) return path;

    var p = path.at(t);
    var inset = (box.right - box.left) * 0.12;
    var x = Math.max(box.left + inset, Math.min(box.right - inset, p.x));
    var y = Math.max(box.top + box.h * 0.18,
                     Math.min(box.bottom - box.h * 0.12, p.y));
    return retarget(path, { x: x, y: y }, t);
  }

  /* ── attempt two: onto a target ───────────────────────────── */

  /* The winning shot arrives on a target, because the target is the prize.
     First put the arrival on it, then buy whatever clearance the rack needs
     without moving that arrival again. */
  function ontoTarget(path, t, curl, targetEl) {
    var aim = TBFx.rect(targetEl);
    aim = { x: aim.x, y: aim.y };

    var K = TBFx.unit();
    var over = TBFx.flight(path.from, aim,
                           { r: path.r, bend: path.bend, lift: path.lift / K });
    var box = rackBox();
    if (!hitsRack(over, t, box)) return over;

    var p = over.at(t);
    var margin = box.h * CLEAR;

    /* Over the top, and tried first when the drag was not curled — because a
       ball that swerves for someone who struck it straight is the game
       contradicting its own input. Raising the arc does not move either end of
       it, so the arrival survives untouched.

       The ceiling is what stops a shot at a low target from becoming a lob:
       past it, going round is the better lie. */
    var need = (p.y - (box.top - margin)) / (4 * t * (1 - t) * p.s);
    var lift = (path.lift / K) + Math.max(0, need) / K;
    var straight = curl == null || Math.abs(curl) < 0.35;
    if (straight && lift < 320) {
      var high = TBFx.flight(path.from, aim,
                             { r: path.r, bend: path.bend, lift: lift });
      if (!hitsRack(high, t, box)) return high;
    }

    /* Round the outside, on the side the visitor curled towards — or, if they
       did not curl, the side the target is on. The arrival is already fixed by
       the model, so this only has to solve for how much bend puts the ball
       clear of the rack as it passes:

         x(t) = from.x + A·u + bend·(u - t²·s/S_END)     A = aim.x - from.x

       which is linear in bend, and the bracket is positive for any obstacle
       short of the goal line. */
    var side = straight
      ? (aim.x < (box.left + box.right) / 2 ? -1 : 1)
      : ((curl || 0) < 0 ? -1 : 1);
    var edge = side < 0 ? box.left - margin : box.right + margin;
    var A = aim.x - path.from.x;
    var denom = p.u - t * t * (p.s / TBFx.S_END);
    if (Math.abs(denom) > 1e-4) {
      var bend = (edge - path.from.x - A * p.u) / denom;
      var span = box.right - box.left;
      var capped = Math.max(-span * 2.2, Math.min(span * 2.2, bend));
      var round = TBFx.flight(path.from, aim,
                              { r: path.r, bend: capped, lift: path.lift / K });
      if (!hitsRack(round, t, box)) return round;
    }

    // Nothing curled far enough: go over it after all, however high that is.
    return TBFx.flight(path.from, aim,
                       { r: path.r, bend: path.bend, lift: lift });
  }

  /* Which target a shot is going to win. The one nearest to where the visitor
     actually aimed, so the prize is theirs rather than the game's — and never
     one that has already been knocked over. */
  function nearestTarget(aim) {
    var best = null;
    var bestD = Infinity;
    targets.forEach(function (el) {
      if (el.hasAttribute('data-spent')) return;
      var r = TBFx.rect(el);
      var d = Math.pow(r.x - aim.x, 2) + Math.pow(r.y - aim.y, 2);
      if (d < bestD) { bestD = d; best = el; }
    });
    return best;
  }

  /* ══ the scene ════════════════════════════════════════════════ */

  /* Restart a one-shot CSS animation. Removing the class is not enough on its
     own -- the style has to be recomputed in between, which reading a layout
     property forces. Cheap enough here: a visitor fires it twice a visit. */
  function fx(el, vars) {
    el.classList.remove('is-live');
    void el.offsetWidth;
    if (vars) Object.keys(vars).forEach(function (k) { el.style.setProperty(k, vars[k]); });
    el.classList.add('is-live');
  }

  /* The strike point, as a share of the pitch. Off the pitch and not the goal,
     because a blocked shot strikes the rack and that is nowhere near the goal
     mouth. */
  function mark(point) {
    var p = TBFx.rect(pitch);
    fx(hit, {
      '--hit-x': ((point.x - p.left) / p.w * 100).toFixed(1) + '%',
      '--hit-y': ((point.y - p.top) / p.h * 100).toFixed(1) + '%'
    });
  }

  /* The rack takes the shot. It is bolted to a wheeled frame, so it rocks back
     and settles rather than jumping — five plastic figures on castors do not
     leave the ground. */
  function rockRack() {
    if (TBFx.reduced()) return;
    var lift = TBFx.rect(rack).h * 0.02;
    rack.animate([
      { transform: 'rotate(0deg) translateY(0)' },
      { transform: 'rotate(-2.4deg) translateY(' + (-lift).toFixed(1) + 'px)', offset: 0.18 },
      { transform: 'rotate(1.4deg) translateY(0)', offset: 0.46 },
      { transform: 'rotate(-0.5deg) translateY(0)', offset: 0.72 },
      { transform: 'rotate(0deg) translateY(0)' }
    ], { duration: 900, easing: 'cubic-bezier(.2,.9,.3,1)' });
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

  /* `chosen` is set when the shot came from pressing a target rather than from
     dragging the ball — a keyboard user picking their prize. */
  function shoot(shot, chosen) {
    if (busy) return;
    busy = true;
    attempt += 1;

    var scores = attempt >= 2;
    var aimed = TBAim.toFlight(shot, ball);
    var t = rackDepth(aimed);

    var target = null;
    var path;
    if (scores) {
      target = chosen && !chosen.hasAttribute('data-spent')
        ? chosen
        : nearestTarget(shot.aim);
      path = target ? ontoTarget(aimed, t, shot.curl, target) : aimed;
    } else {
      path = intoRack(aimed, t);
    }

    stage.dataset.state = 'shooting';
    ball.classList.add('is-armed');
    TBAudio.play('kick', 0.9);

    if (!scores) {
      return TBFx.shoot(ball, path, { duration: 700, stopAt: t })
        .then(function (state) {
          mark(state);
          rockRack();
          TBAudio.play('save', 0.9);
          TBFx.shake(260, 4);
          // Off the rack: it comes back roughly the way it came.
          var box = rackBox();
          return TBFx.deflect(state, state.x < (box.left + box.right) / 2 ? -1 : 1);
        })
        .then(function () {
          say(TBI18n.t('msg.blocked'), 1900);
          ball.classList.remove('is-armed');
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
        var bonus = target ? target.dataset.bonus : 'sport';
        mark(state);
        TBAudio.play('net', 0.8);
        TBAudio.play('cheer', 0.7);
        TBFx.netBulge(state.x, state.y, state.r * state.s);
        TBFx.shake(320, 5);
        TBFx.intoNet(state);
        stage.dataset.state = 'celebrate';

        // The target turns over and stays turned: it has been won and is out
        // of the game. Marked before the confetti so the prize is already
        // showing when the eye comes back to it.
        if (target) target.setAttribute('data-spent', '');

        // A beat, then the confetti. 110 bits out of the strike point cover
        // the net bulge completely, and the bulge is over inside 520ms --
        // fired together, the net was never seen at all. The gap also reads
        // as a crowd taking a moment to realise.
        later(function () {
          TBFx.burst(state);
          // With the burst, not with the hit: the 180ms gap is the whole
          // point of the delay, and a pop on the impact would close it.
          TBAudio.play('confetti', 0.55);
        }, 180);

        say(TBI18n.t('msg.prize.' + bonus), 1500);
        return wait(1600).then(function () { return bonus; });
      })
      .then(function (bonus) {
        ball.classList.remove('is-armed');
        stage.dataset.state = 'form';
        busy = false;
        // The prize the visitor knocked over is the bonus the card opens on.
        window.TBForm.open({ bonus: bonus });
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
     data-state="form", which holds .ball and the targets at
     pointer-events:none (css/game.css), `attempt` is still past the end of the
     scripted sequence, and one target is still lying face up with its prize
     showing. All three have to be undone together, or the page is dead behind
     a card nobody can see. */
  function reset() {
    clearTimers();
    clearTimeout(msgTimer);
    clearTimeout(msgHideTimer);
    msg.classList.remove('is-visible');
    msg.hidden = true;

    ball.classList.remove('is-armed');
    hit.classList.remove('is-live');
    targets.forEach(function (el) { el.removeAttribute('data-spent'); });

    attempt = 0;
    busy = false;

    stage.dataset.state = 'idle';
    return TBFx.home(ball);
  }

  /* ── boot ─────────────────────────────────────────────────── */

  function init() {
    stage    = document.getElementById('stage');
    pitch    = document.querySelector('.pitch');
    ball     = document.querySelector('.ball');
    goal     = document.querySelector('.goal');
    rack     = document.querySelector('.dummies');
    rackZone = document.querySelector('.dummies-zone');
    hit      = document.querySelector('.hit');
    msg      = document.querySelector('.msg');
    targets  = Array.prototype.slice.call(document.querySelectorAll('.target'));

    TBFx.init();

    ball.classList.add('is-bobbing');
    stage.dataset.state = 'idle';

    TBAim.init({
      ball: ball,
      stage: stage,
      goal: goal,
      corners: Array.prototype.slice.call(document.querySelectorAll('.goal__c')),
      targets: targets,
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
