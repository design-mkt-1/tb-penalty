/* The scene effects layer: everything that moves and is not a character.

   The ball, its ground shadow, its motion blur, the aim arc, the net taking
   the shot and the celebration confetti are all drawn here, on one canvas,
   from one requestAnimationFrame loop. The DOM keeps only what has to stay a
   real element -- the .ball button, which is focusable and announced -- and
   hands the flight over to this file the moment a shot is taken.

   Why a canvas at all: a DOM ball cannot be motion-blurred, and a DOM shadow
   cannot separate from it convincingly. Those two are most of what makes a
   flight read as an object travelling away rather than a sticker shrinking.

   Every hand-tuned distance in here is in the same units js/game.js uses:
   pixels at a 360px goal, multiplied by TBStage.unit(). */
(function () {
  'use strict';

  /* ══ the camera ═══════════════════════════════════════════════

     One number governs both how fast the ball crosses the screen and how
     small it gets, because in a real camera those are the same fact.

     A ball struck at constant speed away from the lens has its depth z grow
     linearly with time. A pinhole projects a lateral offset X at depth z to
     X/z on screen, so screen progress is (t/z) normalised -- strongly
     front-loaded -- and apparent size is 1/z. Deriving both from S_END means
     they can never disagree: at t=1 the ball is exactly on the target at
     exactly S_END of its size, whatever else is retuned.

     0.16. The penalty game this grew from used 0.30 and the head-on free kick
     0.22; the training-ground plate is shot from further out again and from
     one side, so the goal is a third of the frame width it used to be and the
     ball has to arrive correspondingly smaller. The front loading is stronger
     with it -- the ball leaves the boot fast and floats in at the end, which
     is what the long ones look like. */
  var S_END = 0.16;                 // apparent size on the goal line
  var Z_END = 1 / S_END;            // 4.545 -- depth there

  function depth(t)    { return 1 + (Z_END - 1) * t; }
  function progress(t) { return Z_END * t / depth(t); }
  function scaleAt(t)  { return 1 / depth(t); }

  /* ══ one loop for everything ══════════════════════════════════

     There were four near-identical rAF wrappers in the project this is grown
     from, each guarding against a hidden tab, where rAF never fires and would
     otherwise wedge a promise chain forever. That guard lives here once,
     exported as TBFx.next, and every actor shares a single loop, a single
     clear and a single frame of layout work. Keep it that way. */

  var actors = [];
  var spinning = false;
  var last = 0;

  function now() {
    return performance.now();
  }

  function schedule(fn) {
    if (document.hidden) return setTimeout(function () { fn(now()); }, 16);
    return requestAnimationFrame(fn);
  }

  function pump() {
    if (spinning) return;
    spinning = true;
    last = now();
    schedule(beat);
  }

  function beat(stamp) {
    // A hidden tab, or a phone that slept, can hand back a gap of seconds.
    // Clamp it: the actors integrate against dt, and one huge step would
    // teleport the ball through the goal instead of into it.
    var dt = Math.min((stamp - last) / 1000, 0.05);
    last = stamp;

    clear();

    for (var i = 0; i < actors.length; i++) {
      if (actors[i](stamp, dt) === false) { actors.splice(i, 1); i--; }
    }

    if (actors.length) return schedule(beat);
    spinning = false;
    clear();
    live(false);
  }

  /* Run cb on the next frame -- or on a timer if the tab is hidden, where
     requestAnimationFrame never fires at all. game.js, form.js and i18n.js all
     come through here, and none of them keeps a copy. Each of those mounts an
     element at opacity 0 and adds a class one frame later, so a frame that
     never arrives leaves something invisible and open. */
  function next(cb) {
    schedule(function () { cb(); });
  }

  /* An actor is a function (stamp, dt) that draws itself and returns false
     when it is finished. Draw order is insertion order, which is the order
     things are fired in: ball, then net, then confetti. */
  function add(fn) {
    actors.push(fn);
    pump();
  }

  /* ══ canvas and geometry ══════════════════════════════════════ */

  var stage, canvas, ctx, goalEl;

  function box() {
    return stage.getBoundingClientRect();
  }

  /* Stage-local coordinates. The canvas covers #stage and js/stage.js has
     already set the buffer transform, so everything drawn here is in CSS
     pixels measured from the stage's top-left corner. */
  function rect(el) {
    var s = box();
    var r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - s.left,
      y: r.top + r.height / 2 - s.top,
      w: r.width,
      h: r.height,
      left: r.left - s.left,
      top: r.top - s.top,
      right: r.right - s.left,
      bottom: r.bottom - s.top
    };
  }

  function k() {
    return window.TBStage ? TBStage.unit() : 1;
  }

  function clear() {
    if (!ctx) return;
    var s = box();
    ctx.clearRect(0, 0, s.width, s.height);
  }

  function live(on) {
    if (canvas) canvas.classList.toggle('is-live', on !== false);
  }

  function reduced() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Where the near post meets the grass, in stage pixels. The ball's shadow
     travels to here.

     The near-base corner marker, not .goal's own bottom edge. The camera is
     three-quarter now, so the goal mouth is a quadrilateral and .goal is only
     the box the four corner markers hang in — its bottom edge is the bottom of
     the pitch, which would run the shadow off the screen. */
  function goalLine() {
    if (!goalEl) return box().height;
    return goalEl.getBoundingClientRect().bottom - box().top;
  }

  /* ══ the ball bitmap ══════════════════════════════════════════

     One revolution of a real sphere, 24 frames on a 6x4 sheet, rendered by
     tools/ball_sheet.py: the panels are a spherical Voronoi over the 32 face
     centres of a truncated icosahedron, which is what a football is, and the
     shading is a light direction, a specular lobe and a rim sampled off the
     surface normal. assets/img/ball.webp is frame 0 of the same render, so
     the ball on the spot and the ball in flight are the same object.

     Decoded once. drawImage of an ImageBitmap skips the decode path an <img>
     can take, which matters when the trail draws it six times a frame. */

  var BALL_FRAMES = 24;
  var BALL_COLS = 6;
  var BALL_CELL = 176;

  var ballArt = null;
  var ballArtFailed = false;

  function loadBall() {
    var img = new Image();
    img.decoding = 'async';
    /* Without this, a 404 on the sheet is silent and invisible in the worst
       way: ballArt stays null, drawBall returns immediately, and shoot() has
       already hidden the DOM ball — so the flight plays with no ball in it and
       the promise resolves as if nothing were wrong. */
    img.onerror = function () { ballArtFailed = true; };
    img.onload = function () {
      if (!window.createImageBitmap) { ballArt = img; return; }
      createImageBitmap(img).then(
        function (bmp) { ballArt = bmp; },
        function ()    { ballArt = img; }
      );
    };
    img.src = 'assets/img/ball-spin.webp';
  }

  /* r is the RADIUS AS DRAWN -- the resting radius already multiplied by the
     depth scale. Passing the resting radius instead draws a ball that never
     recedes, which is exactly what a flat 2D sticker looks like.

     `spin` is radians of the ball's own rotation and picks the frame; `dir`
     is the direction of travel, and everything is drawn in a frame rotated to
     it. That does two jobs at once: the sheet's spin axis ends up square to
     the trajectory, so the ball turns over along its flight rather than
     rolling sideways, and the squash is along travel rather than along the
     screen axes. */
  function drawBall(x, y, r, spin, sx, sy, dir, alpha) {
    if (!ballArt) return;

    var f = Math.floor(spin / (Math.PI * 2) * BALL_FRAMES) % BALL_FRAMES;
    if (f < 0) f += BALL_FRAMES;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(dir);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.drawImage(ballArt,
                  (f % BALL_COLS) * BALL_CELL,
                  Math.floor(f / BALL_COLS) * BALL_CELL,
                  BALL_CELL, BALL_CELL,
                  -r, -r, r * 2, r * 2);
    ctx.restore();
  }

  /* The ball's shadow tracks its ground point and opens a gap as the ball
     climbs -- the gap is the height cue. */
  function drawShadow(x, groundY, r, s, ballY) {
    var gap = Math.max(groundY - ballY, 0);
    var soft = Math.min(gap / (240 * k()), 1);
    var w = r * 1.7 * s * (1 + soft * 0.35);
    var h = r * 0.40 * s;
    var a = 0.46 * (1 - soft * 0.72);
    if (a <= 0.02 || w < 0.6 || h < 0.4) return;

    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')');
    g.addColorStop(0.62, 'rgba(0,0,0,' + (a * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.save();
    ctx.translate(x, groundY);
    ctx.scale(w, h);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ══ camera shake ════════════════════════════════════════════ */

  function shake(ms, px) {
    if (reduced()) return;
    var pitch = document.querySelector('.pitch');
    if (!pitch) return;
    var amp = px * k();
    var t0 = now();

    add(function (stamp) {
      var t = (stamp - t0) / ms;
      if (t >= 1) {
        pitch.style.setProperty('--shake-x', '0px');
        pitch.style.setProperty('--shake-y', '0px');
        return false;
      }
      var a = amp * (1 - t) * (1 - t);
      var x = a * Math.sin(t * 58);
      var y = a * Math.cos(t * 47) * 0.62;
      pitch.style.setProperty('--shake-x', x.toFixed(2) + 'px');
      pitch.style.setProperty('--shake-y', y.toFixed(2) + 'px');
      return true;
    });
  }

  /* ══ the net taking the shot ══════════════════════════════════

     The net is painted into the pitch plate, so it cannot deform. What can be
     drawn over it is the light a stretched net catches: a bulge that punches
     out on impact and comes back with damped swings, plus short cords
     radiating from the strike point. 520ms, about how long a real net rings. */
  function netBulge(x, y, r) {
    if (reduced()) return;
    var t0 = now();
    var life = 520;
    var reach = r * 6.5;

    add(function (stamp) {
      var t = (stamp - t0) / life;
      if (t >= 1) return false;

      // Punch out fast, then ring down.
      var swing = Math.exp(-4.2 * t) * Math.cos(t * Math.PI * 3.1);
      var open = (1 - Math.exp(-14 * t)) * swing;
      var rad = reach * (0.42 + 0.58 * Math.abs(open));
      var a = 0.34 * Math.exp(-2.6 * t);
      if (a <= 0.01 || rad < 1) return true;

      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(255,255,255,' + (a * 0.42).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * 0.86, 0, 0, Math.PI * 2);
      ctx.fill();

      // The cords. They stretch with the bulge and fade with it.
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 1.25).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, 1.1 * k());
      for (var i = 0; i < 8; i++) {
        var ang = (i / 8) * Math.PI * 2 + 0.2;
        var i0 = rad * 0.30;
        var i1 = rad * (0.72 + 0.28 * Math.abs(open));
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * i0, y + Math.sin(ang) * i0 * 0.86);
        ctx.lineTo(x + Math.cos(ang) * i1, y + Math.sin(ang) * i1 * 0.86);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    });
  }

  /* ══ the trajectory ═══════════════════════════════════════════

     Split out of shoot() so it is a value the rest of the page can hold and
     ask questions of before anything is drawn. js/aim.js builds one every
     frame of a drag to draw the preview arc, and js/game.js samples one at the
     wall's depth to find out whether the shot clears — neither of them wants
     to start an animation to do it, and neither of them may keep its own copy
     of the curve. There is one model of where the ball goes, and it is here.

         from   stage-local point the ball leaves from
         to     stage-local point it ARRIVES at, whatever the bend
         bend   how far out the ball swings on the way, in screen pixels at
                the widest. Positive swings to the viewer's right.
         lift   peak of the arc above the straight line, in world units */
  function flight(from, to, opts) {
    opts = opts || {};
    var K = k();
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var r0 = opts.r || 10;
    var bend = opts.bend || 0;
    var lift = (opts.lift == null ? 58 : opts.lift) * K;

    // The shadow's road: from under the ball to the goal line.
    var ground0 = from.y + r0 * 0.94;
    var ground1 = goalEl ? goalLine() : ground0;

    // Radians of the ball's own rotation over the flight. A struck free kick
    // turns over about seven times a second; the sign is backspin against
    // topspin, not which way a wheel rolls, because the axis is square to the
    // trajectory rather than fixed to the screen.
    var spinRate = 30;

    function at(t) {
      var u = progress(t);
      var s = scaleAt(t);

      // Squash off the boot: a couple of frames of the ball flattened along
      // its own direction of travel. Weight, in the cheapest possible form.
      var punch = Math.max(0, 1 - t / 0.14);
      var sq = punch * punch;

      /* The bend.

         Sideways acceleration from the spin is constant, so the sideways
         displacement in the world goes as t squared: nothing early,
         everything late. That shape is why a curled free kick looks like one —
         a ball that starts bending the moment it is struck reads as a bad aim
         rather than as spin. s / S_END is what turns that world offset into a
         screen one.

         The subtlety is what the aim then means. The first version added the
         t² term on top of a straight line to `to`, so `to` was where the ball
         would have gone WITHOUT spin and the bend moved the arrival — curl the
         shot and it landed somewhere else, which made aiming a guess and put
         the preview's landing ring outside the posts.

         Here the ball is struck `bend` to one side of the target and the spin
         brings it back: the two terms cancel exactly at t = 1, so `to` is
         where it arrives however hard it is curled. Aim and curl come apart,
         and the flight is the one a free kick actually takes — out around the
         wall and back in. */
      return {
        t: t,
        u: u,
        s: s,
        r: r0,
        x: from.x + (dx + bend) * u - bend * t * t * (s / S_END),
        y: from.y + dy * u - lift * 4 * t * (1 - t) * s,
        ground: ground0 + (ground1 - ground0) * u,
        spin: spinRate * u,
        sx: 1 + 0.26 * sq,
        sy: 1 - 0.20 * sq
      };
    }

    /* The direction of travel, differentiated rather than assumed. It used to
       be atan2 of the straight line and constant for the whole flight, which
       was true only while nothing curved: with a bend, a constant direction
       tilts the motion blur and the squash away from the path the ball is
       visibly on. */
    function dirAt(t) {
      var e = 0.008;
      var a = at(Math.max(0, t - e));
      var b = at(Math.min(1, t + e));
      return Math.atan2(b.y - a.y, b.x - a.x);
    }

    return {
      at: at,
      dirAt: dirAt,
      from: from,
      to: to,
      bend: bend,
      lift: lift,
      r: r0
    };
  }

  /* ══ the flight, drawn ════════════════════════════════════════

     Resolves with the ball's state at the moment it stops, which is what
     deflect() carries on from.

     opts.stopAt cuts the flight short, as a save or a block does: the ball
     meets the glove, or the wall, in front of the line rather than reaching
     the net. */
  function shoot(ballEl, path, opts) {
    opts = opts || {};
    var soft = reduced();
    var duration = opts.duration || (soft ? 300 : 760);
    var stopAt = opts.stopAt || 1;
    var r0 = path.r;

    live(true);
    ballEl.classList.remove('is-bobbing');
    ballEl.style.transition = '';
    // Keep the DOM ball if the canvas has nothing to draw in its place.
    if (!ballArtFailed) ballEl.style.opacity = '0';

    /* Real motion blur, not a decorative trail: five samples of the interval
       the ball actually crossed since the last frame. Across a phone-height
       screen the ball moves about 30px per frame, so without this it is a row
       of stamps. */
    function drawTrail(a, c) {
      var span = c - a;
      if (span <= 0) return;
      var head = path.at(c);
      var tail = path.at(a);
      var moved = Math.sqrt(Math.pow(head.x - tail.x, 2) +
                            Math.pow(head.y - tail.y, 2));
      if (moved < r0 * head.s * 0.9) return;

      for (var i = 1; i <= 5; i++) {
        var f = i / 6;
        var mid = a + span * f;
        var p = path.at(mid);
        drawBall(p.x, p.y, r0 * p.s, p.spin, 1, 1, path.dirAt(mid),
                 0.09 + 0.19 * f);
      }
    }

    return new Promise(function (resolve) {
      var t0 = now();
      var prev = 0;

      add(function (stamp) {
        var raw = (stamp - t0) / duration;
        var t = Math.min(raw, stopAt);
        var state = path.at(t);
        var dir = path.dirAt(t);

        if (!soft) drawTrail(prev, t);
        drawShadow(state.x, state.ground, r0, state.s, state.y);
        drawBall(state.x, state.y, r0 * state.s, state.spin,
                 state.sx, state.sy, dir, 1);

        prev = t;

        if (raw < stopAt) return true;
        state.dir = dir;
        resolve(state);
        return false;
      });
    });
  }

  /* ══ the aim arc ══════════════════════════════════════════════

     Drawn while the visitor drags back from the ball. `source` is called once
     a frame and returns the flight to preview, or null to end the preview —
     so aim.js hands over a live reading rather than a snapshot, and the arc
     follows the finger without aim.js touching the canvas or the loop.

     Dots rather than a line, spaced by t: they get further apart where the
     ball is moving fastest, which shows the front-loading of the flight for
     free, and they shrink with depth for the same reason the ball does. */
  function aimArc(source) {
    live(true);
    add(function () {
      var path = source();
      if (!path) return false;

      ctx.save();
      for (var i = 1; i <= 16; i++) {
        var t = i / 17;
        var p = path.at(t);
        ctx.globalAlpha = 0.10 + 0.5 * (1 - t);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.r * p.s * 0.30), 0, Math.PI * 2);
        ctx.fill();
      }

      // The landing mark, so the aim is readable and not merely the direction.
      var end = path.at(1);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#d21502';
      ctx.lineWidth = Math.max(1.5, 2 * k());
      ctx.beginPath();
      ctx.ellipse(end.x, end.y, end.r * end.s * 1.8, end.r * end.s * 1.5,
                  0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return true;
    });
  }

  /* ══ the ball comes back off something ════════════════════════

     Used by both the wall and the glove, because they are the same event: the
     ball reverses towards the camera, so it grows instead of shrinking, falls
     under gravity, bounces once on the grass and leaves the frame. The moment
     of contact is visible because the ball changes direction. Only the sound
     and the sideways sign differ, and both of those are the caller's. */
  function deflect(state, side) {
    var K = k();
    var soft = reduced();
    var life = soft ? 260 : 760;

    var x = state.x, y = state.y, r0 = state.r;
    var dirSign = side || 1;

    var vx = dirSign * 300 * K;            // px per second, outward
    var vy = -170 * K;
    var grav = 1750 * K;
    var floor = state.ground + 140 * K;    // the grass, nearer the camera
    var s = state.s;
    var spin = state.spin;
    var bounced = false;

    return new Promise(function (resolve) {
      var t0 = now();

      add(function (stamp, dt) {
        var t = (stamp - t0) / life;
        if (t >= 1) { resolve(); return false; }

        vy += grav * dt;
        x += vx * dt;
        y += vy * dt;

        // Coming back towards the lens, so the ball grows again.
        s += (0.92 - s) * Math.min(dt * 3.4, 1);
        spin -= dirSign * 13 * dt;

        var r = r0 * s;
        if (!bounced && y + r >= floor && vy > 0) {
          y = floor - r;
          vy = -vy * 0.46;
          vx *= 0.78;
          bounced = true;
        }

        var a = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
        drawShadow(x, Math.max(floor, y + r), r0, s, y);
        // Along the arc it is actually on, so it keeps turning over its own
        // path through the bounce instead of about a fixed screen axis.
        drawBall(x, y, r, spin, 1, 1, Math.atan2(vy, vx), a);
        return true;
      });
    });
  }

  /* ══ into the net ═════════════════════════════════════════════

     A goal used to end with the ball simply not being drawn any more. Here it
     drops down the netting under gravity, damped hard because a net absorbs
     nearly all of it, and fades once the confetti has taken the eye. */
  function intoNet(state) {
    var K = k();
    var x = state.x, y = state.y, s = state.s, spin = state.spin;
    var vy = 60 * K;
    var grav = 950 * K;
    var floor = state.ground;
    var life = 900;

    var t0 = now();
    add(function (stamp, dt) {
      var t = (stamp - t0) / life;
      if (t >= 1) return false;

      vy += grav * dt;
      y += vy * dt;
      s *= 1 - dt * 0.10;
      spin += 2.2 * dt;

      var r = state.r * s;
      if (y + r > floor && vy > 0) { y = floor - r; vy = -vy * 0.24; }

      drawShadow(x, floor, state.r, s, y);
      // Dropping, so the axis is across the fall: it rolls down the netting.
      drawBall(x, y, r, spin, 1, 1, Math.PI / 2,
               t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      return true;
    });
  }

  /* ══ the ball comes back ══════════════════════════════════════ */

  function home(ballEl) {
    return new Promise(function (resolve) {
      ballEl.style.transition = 'opacity .3s ease';
      ballEl.style.opacity = '1';
      setTimeout(function () {
        ballEl.style.transition = '';
        ballEl.classList.add('is-bobbing');
        resolve();
      }, 320);
    });
  }

  /* ══ celebration ══════════════════════════════════════════════ */

  /* The brand's own reds plus white. tokens.css owns these values; they are
     repeated here because a canvas fill cannot read a custom property without
     a getComputedStyle per particle per frame. */
  var BURST_COLOURS = ['#d21502', '#ff453a', '#ff7d6d', '#eeeff2', '#ffffff'];

  /* `origin` is stage-local, like everything else drawn on this canvas. It
     used to be a page-space point that this function converted, which meant
     the one caller had to convert back out of stage space to hand it over. */
  function burst(origin) {
    if (reduced()) return;
    var K = k();
    var ox = origin.x;
    var oy = origin.y;

    var bits = [];
    for (var i = 0; i < 110; i++) {
      var angle = Math.PI * (0.08 + 0.84 * (i / 110)) + Math.PI;   // fan upward
      var speed = (3.4 + (i % 7) * 0.85) * K;
      bits.push({
        x: ox, y: oy,
        vx: Math.cos(angle) * speed * (0.7 + (i % 5) * 0.14),
        vy: Math.sin(angle) * speed,
        size: (4 + (i % 4) * 2.2) * K,
        spin: (i % 2 ? 1 : -1) * (0.1 + (i % 3) * 0.06),
        rot: i,
        colour: BURST_COLOURS[i % BURST_COLOURS.length]
      });
    }

    live(true);
    var t0 = now();
    var life = 1700;

    add(function (stamp) {
      var elapsed = stamp - t0;
      if (elapsed >= life) return false;

      for (var i = 0; i < bits.length; i++) {
        var b = bits[i];
        b.vy += 0.16 * K;         // gravity
        b.vx *= 0.992;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.spin;

        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - elapsed / life);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.colour;
        ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.6);
        ctx.restore();
      }
      return true;
    });
  }

  /* ══ boot ═════════════════════════════════════════════════════ */

  function init() {
    stage = document.getElementById('stage');
    canvas = document.querySelector('.fx');
    goalEl = document.querySelector('.goal__c[data-corner="near-base"]');
    if (canvas) ctx = canvas.getContext('2d');
    loadBall();
  }

  window.TBFx = {
    init: init,
    add: add,
    next: next,
    rect: rect,
    flight: flight,
    shoot: shoot,
    aimArc: aimArc,
    intoNet: intoNet,
    deflect: deflect,
    home: home,
    burst: burst,
    netBulge: netBulge,
    shake: shake,
    reduced: reduced,
    unit: k,
    S_END: S_END
  };
})();
