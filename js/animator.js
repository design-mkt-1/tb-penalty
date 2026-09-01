/* Character animation behind a narrow interface.
   PoseAnimator ships now: discrete pose sprites + transforms.
   A SpineAnimator with the same three methods can replace it later without
   touching game.js — pose names mirror the reference rig deliberately. */
(function () {
  'use strict';

  /* Where the keeper ends up for each pose, as a share of his own box.
     L/R are from the viewer's point of view, matching the panel columns.
     The sprite already carries the body angle, so these are pure translations
     that carry the character across to the panel he is covering.

     Percentages, not pixels: translate() resolves them against the element's
     own size, and css/game.css sizes the keeper as a share of the goal. So a
     dive lands on the same panel whether the goal renders 260px wide or 560.

     They were rescaled when the goal became the painted one. A percentage of
     the keeper's own box is only a fixed distance across the goal while the
     box keeps its proportion to it, and it did not: the box went from 30.6%
     of the goal's width to 22.95%, and from 45.7% of the width in height to
     34.2%. The dives kept their numbers and so travelled a quarter less far
     across a goal that had got wider -- his glove reached 69.9% of the way
     across for a shot into a panel centred at 81.7%.

     Restored by measurement, not by feel: the old composition put the glove
     of jump_R2 at 76.5% against a panel centre of 80.5%, four points short,
     which is what a dive should look like. Getting back to four points short
     of the new centre wants the horizontal numbers at 1.81x. The vertical
     ones only wanted 1.07: the goal got flatter as it got wider, so the rows
     shrank almost as much as the keeper's travel did. The numbers are the old stage pixels over the 110x164 box they
     were measured in -- -46px of 110 is -41.82%. */
  var POSES = {
    idle:             { x:      0, y:      0, scale: 1 },
    jump_L1:          { x:    -34, y:      3, scale: 1 },  // low  left
    jump_L2:          { x:    -39, y:    -13, scale: 1 },  // high left
    jump_R1:          { x:     34, y:      3, scale: 1 },  // low  right
    jump_R2:          { x:     39, y:    -13, scale: 1 },  // high right
    jump_center:      { x:      0, y:  -22.5, scale: 1 },  // high centre
    jump_center_down: { x:      0, y:      2, scale: 1 },  // low  centre

    /* Three poses that are not dives. They are drawn where they belong on the
       shared canvas -- crouched, standing, slumped -- so none of them needs a
       translation; the tween only has to arrive on them. */
    ready:            { x:      0, y:      0, scale: 1 },  // set, pre-shot
    cheer:            { x:      0, y:      0, scale: 1 },  // saved it
    beaten:           { x:      0, y:      0, scale: 1 }   // conceded
  };

  /* Where those numbers come from, so the next person to move the goal can
     redo them instead of nudging them.

     A translate percentage resolves against the element's own size, and
     css/game.css sizes .keeper as a share of the goal, so a dive lands on the
     same part of the goal whatever size the goal renders at. The share is
     KEEPER_W below, and it is a hair over one goal width — not because the man
     is that wide, but because tools/cutout.py exports every pose on one
     uncropped 1147x640 canvas so that swapping a sprite cannot move the
     character. The figure occupies about half of that canvas; the rest is the
     room a full-stretch dive needs.

     So: reaching a point 40% of the goal's width from its centre is
     0.40 / KEEPER_W of the keeper's own box, which is the 39 on jump_L2 and
     jump_R2. The low dives stop a little shorter, at 34. Vertically the box is
     1.51 goal-heights tall, so lifting a body a third of the way up the goal
     is 13% of it.

     jump_center carries an extra -12.5 on top of its lift, and that is not a
     tuning: cutout.py plants every pose's lowest pixel on one ground line, and
     a keeper leaping straight up has his boots in the air, so the pose that
     would have been cropped by the top of its own canvas was left sitting
     lower than the rest. The comment there says the placement is recoverable
     here. This is here. */
  var KEEPER_W = 1.02;   // .keeper box width, in goal widths — see css/game.css

  /* Which file each pose shows. Kept here rather than only in CSS so
     preload() has something real to fetch.

     jump_center_down used to borrow the idle figure and be told apart by a
     deeper crouch in the tween, which meant a low save down the middle was an
     upright keeper nudged downwards. It has its own render now, kneeling. */
  /* The other two boxes the keeper's numbers have to be converted into: his
     shadow and the dust his landing throws up are separate elements with their
     own widths, also set in css/game.css as shares of the goal. A pose offset
     of p.x% of the keeper is p.x * KEEPER_W / that width. */
  var SHADOW_W = 0.30;
  var DUST_W = 0.26;

  var SPRITES = {
    idle:             'assets/img/keeper-idle.webp',
    jump_L1:          'assets/img/keeper-jump_L1.webp',
    jump_L2:          'assets/img/keeper-jump_L2.webp',
    jump_R1:          'assets/img/keeper-jump_R1.webp',
    jump_R2:          'assets/img/keeper-jump_R2.webp',
    jump_center:      'assets/img/keeper-jump_center.webp',
    jump_center_down: 'assets/img/keeper-jump_center_down.webp',
    ready:            'assets/img/keeper-ready.webp',
    cheer:            'assets/img/keeper-cheer.webp',
    beaten:           'assets/img/keeper-beaten.webp'
  };

  /* The panel grid, column then row. */
  var CELL_XY = {
    tl: [0, 0], tc: [1, 0], tr: [2, 0],
    bl: [0, 1], bc: [1, 1], br: [2, 1]
  };

  /* Which dive covers which panel. Must stay injective — one pose per cell —
     because WRONG_WAY below relies on it to guarantee a different pose. */
  var COVERS = {
    tl: 'jump_L2', tc: 'jump_center',      tr: 'jump_R2',
    bl: 'jump_L1', bc: 'jump_center_down', br: 'jump_R1'
  };

  /* Where the keeper goes when he guesses wrong: the dive that covers the
     furthest cell from the one the ball is heading for.

     This is derived rather than written out by hand. The hand-written table it
     replaces mapped bc to jump_center_down — which is bc's own cover — so a
     goal into the bottom-centre panel sent the keeper to exactly where the
     ball was going, and the shot read as a save. Deriving it makes that class
     of collision impossible: the furthest cell is never the cell itself, and
     COVERS is injective, so the pose always differs. */
  var WRONG_WAY = (function () {
    var out = {};
    Object.keys(CELL_XY).forEach(function (cell) {
      var here = CELL_XY[cell];
      var best = null;
      var bestDistance = -1;
      Object.keys(CELL_XY).forEach(function (other) {
        if (other === cell) return;
        var there = CELL_XY[other];
        var dx = there[0] - here[0];
        var dy = there[1] - here[1];
        var distance = dx * dx + dy * dy;
        if (distance > bestDistance) {
          bestDistance = distance;
          best = other;
        }
      });
      out[cell] = COVERS[best];
    });
    return out;
  })();

  /* The shape of a dive, in one place.

     game.js needs two of these numbers — it fires the landing plume off
     `land` and the dive itself off `duration`. It used to carry its own
     copies (`90 + 540 * 0.84`), so retuning the dive here silently
     desynchronised the dust. Read them, do not restate them. */
  var TIMING = {
    duration: 560,   // ms, full speed
    soft:     200,   // ms, prefers-reduced-motion
    coil:     0.18,  // weight is in the legs, sprite is the set position
    swap:     0.22,  // the feet leave: the pose sprite changes on this frame
    launch:   0.44,  // most of the travel is done, body stretched thin
    hang:     0.76,  // the top of the arc, where a dive appears to float
    land:     0.90   // body meets the grass; the plume fires on this frame
  };

  function PoseAnimator(el, shadow) {
    this.el = el;
    this.shadow = shadow || null;
    this.pose = 'idle';
    this.anim = null;
    this.shadowAnim = null;
    this.poseTimer = 0;
    this.holdTimer = 0;
  }

  /* Pose sprites are plain CSS background-images on [data-pose]; the browser
     fetches them on first use, which puts the fetch inside the first dive.

     The previous version created a probe element and read
     getComputedStyle(probe).backgroundImage. That returns the url string
     without ever asking for the bytes, so it warmed nothing. An Image whose
     src is set does fetch, and lands the file in the HTTP cache under the
     same URL the stylesheet will ask for. */
  PoseAnimator.prototype.preload = function () {
    var seen = {};
    Object.keys(SPRITES).forEach(function (name) {
      var url = SPRITES[name];
      if (seen[url]) return;
      seen[url] = 1;
      var img = new Image();
      img.decoding = 'async';
      img.src = url;
    });
  };

  PoseAnimator.prototype.setPose = function (name) {
    if (!POSES[name]) return;
    this.pose = name;
    this.el.setAttribute('data-pose', name);
  };

  /* The project curve, the same one in --ease-out and in form.css. */
  var EASE = 'cubic-bezier(.2,.9,.3,1)';

  /* Launch and landing are the fast parts; the hang between them is slow.
     Using the project curve on every frame made all five accelerate the same
     way, which is what made six sprites read as one picture sliding. */
  var EASE_IN = 'cubic-bezier(.55,.06,.68,.19)';   // into the launch
  var EASE_LIN = 'linear';                          // through the air

  function reduced() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* One keyframe of the dive.

     k     how far along the travel to the pose destination
     lift  extra height above that line, in percent of the keeper's own box,
           positive meaning up — this is what turns a slide into an arc
     roll  body rotation in degrees, signed by the direction of the dive
     sx/sy squash and stretch about `origin`
     origin where the scaling happens: the feet while he is on the ground,
           the middle of the body while he is not. Leaving it on the feet is
           what made an airborne keeper read as growing out of the turf. */
  function frame(p, k, lift, roll, sx, sy, origin) {
    var dir = p.x === 0 ? 0 : (p.x > 0 ? 1 : -1);
    return {
      transform:
        'translateX(-50%) ' +
        'translate(' + (p.x * k).toFixed(2) + '%,' +
                       (p.y * k - lift).toFixed(2) + '%) ' +
        'rotate(' + (roll * dir).toFixed(2) + 'deg) ' +
        'scale(' + p.scale + ') scaleX(' + sx + ') scaleY(' + sy + ')',
      transformOrigin: origin
    };
  }

  var FEET = '50% 100%';
  var HIPS = '50% 74%';
  var BODY = '50% 60%';

  /* Six sprites, one dive.

     What carries it is the shape of the tween. A real dive is: weight drops
     into the legs, the feet leave the ground fast, the body floats through
     an arc — this is the part a still photograph cannot show and the part
     the old five-frame version had no room for, since it put the launch at
     58% and the landing at 84% — then it hits the grass hard and settles.

     Three things do the floating: the extra lift above the straight line,
     the body rotation, and moving the scaling origin off the feet while he
     is airborne. */
  PoseAnimator.prototype.play = function (name, opts) {
    opts = opts || {};
    var p = POSES[name] || POSES.idle;
    var el = this.el;
    var self = this;
    var soft = reduced();

    // The global reduced-motion rule in reset.css only reaches CSS
    // animations; a Web Animations tween has to be cut here.
    var duration = opts.duration || (soft ? TIMING.soft : TIMING.duration);

    /* Only read layout when a dive is genuinely being interrupted. On the
       normal path there is no running animation, the underlying value is the
       plain CSS transform, and an implicit from-keyframe picks it up without
       forcing a synchronous layout in the same frame as the click. */
    var from = this.anim ? getComputedStyle(el).transform : null;

    if (this.anim) this.anim.cancel();
    if (this.shadowAnim) this.shadowAnim.cancel();
    clearTimeout(this.poseTimer);
    clearTimeout(this.holdTimer);
    el.classList.remove('is-idling');

    var frames;
    if (soft) {
      this.setPose(name);
      frames = [
        from ? { transform: from } : {},
        frame(p, 1, 0, 0, 1, 1, FEET)
      ];
    } else {
      // Two sprites, not one, before he even leaves the ground: the set
      // position through the coil, then the dive as the feet leave. The coil
      // used to be played on the idle figure, so the first third of every
      // dive was a man standing still being squashed.
      if (name !== 'idle') this.setPose('ready');
      this.poseTimer = setTimeout(function () { self.setPose(name); },
                                  duration * TIMING.swap);

      // A dive into the middle has nowhere to lean, so it buys its read from
      // a deeper crouch instead.
      var flat = p.x === 0;
      var lean = flat ? 0 : (p.x > 0 ? -3.5 : 3.5);
      var crouchY = flat ? 7.5 : 5.5;
      var crouchX = flat ? 1.12 : 1.09;
      var crouchS = flat ? 0.84 : 0.87;

      var head = from ? { transform: from, offset: 0, easing: EASE }
                      : { offset: 0, easing: EASE };

      frames = [
        head,

        // Coil. Weight drops into the legs and the body leans away from the
        // dive, so the launch has something to spring out of.
        {
          transform: 'translateX(-50%) translate(' + lean + '%,' + crouchY + '%) ' +
                     'rotate(0deg) scale(1) scaleX(' + crouchX + ') scaleY(' + crouchS + ')',
          transformOrigin: FEET,
          offset: TIMING.coil,
          easing: EASE_IN        // accelerate out of the crouch: explosive
        },

        // Launch. Most of the travel happens here, stretched thin along the
        // direction of flight, rotating into the dive.
        Object.assign(frame(p, 0.62, 5, 9, 0.94, 1.10, HIPS),
                      { offset: TIMING.launch, easing: EASE_LIN }),

        // Hang. Linear in, linear out: constant speed through the air is
        // what makes it look like a body in flight rather than a tween.
        Object.assign(frame(p, 0.93, 7.5, 12, 1.0, 1.02, BODY),
                      { offset: TIMING.hang, easing: EASE_IN }),

        // Land. Past the mark, and squashed by the impact.
        Object.assign(frame(p, 1.05, 0, 4, 1.06, 0.94, FEET),
                      { offset: TIMING.land, easing: EASE }),

        // Settle onto it.
        Object.assign(frame(p, 1, 0, 0, 1, 1, FEET), { offset: 1 })
      ];
    }

    // linear on the effect, not EASE: an iteration easing is applied on top of
    // the per-keyframe ones, and a curve this strong crushes the whole dive
    // into the first fifth of its time. The shaping belongs on the frames.
    this.anim = el.animate(frames, {
      duration: duration,
      easing: 'linear',
      fill: 'forwards'
    });

    this.playShadow(p, duration, soft);

    if (opts.onComplete) this.anim.onfinish = opts.onComplete;
    return this.anim;
  };

  /* The two reactions the dive sprites could never carry: he celebrates a
     save, and he stands beaten after a goal. Both are their own render, so
     the tween only has to arrive on them and give them some weight -- up onto
     the toes for the fists, a sink onto the heels for the head drop.

     `hold` is how long he stays there before standing back up. game.js sizes
     it to the beat it has: 900ms while the miss message is up, 1200 while the
     confetti falls. */
  PoseAnimator.prototype.react = function (name, opts) {
    opts = opts || {};
    var el = this.el;
    var self = this;
    var p = POSES[name] || POSES.idle;
    var soft = reduced();
    var duration = soft ? TIMING.soft : 420;

    if (this.anim) this.anim.cancel();
    if (this.shadowAnim) this.shadowAnim.cancel();
    clearTimeout(this.poseTimer);
    clearTimeout(this.holdTimer);
    el.classList.remove('is-idling');
    this.setPose(name);

    var frames = soft
      ? [{}, frame(p, 1, 0, 0, 1, 1, FEET)]
      : name === 'cheer'
        // Onto the toes and back down: the pull of the fists has to go
        // somewhere, and a celebration that only changes picture is a jump cut.
        ? [Object.assign(frame(p, 1, 0, 0, 1.05, 0.94, FEET), { offset: 0, easing: EASE_IN }),
           Object.assign(frame(p, 1, 3.4, 0, 0.97, 1.06, FEET), { offset: 0.32, easing: EASE }),
           Object.assign(frame(p, 1, 0, 0, 1, 1, FEET), { offset: 1, easing: EASE })]
        // Beaten: the weight arrives after he does, so he sinks rather than
        // lands. Slower and shallower than the celebration, deliberately.
        : [Object.assign(frame(p, 1, 2.6, 0, 1, 1, FEET), { offset: 0, easing: EASE }),
           Object.assign(frame(p, 1, -0.8, 0, 1.02, 0.98, FEET), { offset: 0.6, easing: EASE }),
           Object.assign(frame(p, 1, 0, 0, 1, 1, FEET), { offset: 1, easing: EASE })];

    this.anim = el.animate(frames, {
      duration: duration,
      easing: 'linear',
      fill: 'forwards'
    });

    this.playShadow(p, duration, soft);

    this.holdTimer = setTimeout(function () { self.reset(); },
                                duration + (opts.hold || 1200));
    return this.anim;
  };

  /* The keeper's own shadow, on its own element so it can shrink and fade
     independently of the body. It is the second half of the height cue the
     ball gets from TBFx.drawShadow: a diver whose shadow stays the same size
     never looks like he left the ground.

     Offsets are percentages of the shadow's own box, and the keeper's numbers
     are percentages of his — so they have to be converted, in the ratio of the
     two widths. Same conversion landing() does for the dust plume. */
  var SHADOW_K = KEEPER_W / SHADOW_W;

  PoseAnimator.prototype.playShadow = function (p, duration, soft) {
    if (!this.shadow) return;

    function sf(k, scale, alpha) {
      return {
        transform: 'translateX(-50%) translateX(' +
                   (p.x * SHADOW_K * k).toFixed(2) + '%) scale(' + scale + ')',
        opacity: String(alpha)
      };
    }

    var frames = soft
      ? [{}, sf(1, 1, 0.42)]
      : [
          { offset: 0, easing: EASE },
          Object.assign(sf(0, 1.14, 0.5),     { offset: TIMING.coil,   easing: EASE_IN }),
          Object.assign(sf(0.62, 0.68, 0.24), { offset: TIMING.launch, easing: EASE_LIN }),
          Object.assign(sf(0.93, 0.56, 0.16), { offset: TIMING.hang,   easing: EASE_IN }),
          Object.assign(sf(1.05, 1.12, 0.5),  { offset: TIMING.land,   easing: EASE }),
          Object.assign(sf(1, 1, 0.42),       { offset: 1 })
        ];

    this.shadowAnim = this.shadow.animate(frames, {
      duration: duration,
      easing: 'linear',
      fill: 'forwards'
    });
  };

  /* Where the keeper's feet land, as a share of the dust plume's own width.
     game.js uses this to put the puff under him instead of under the middle
     of the goal. */
  PoseAnimator.prototype.landing = function (name) {
    var p = POSES[name] || POSES.idle;
    return (p.x * KEEPER_W / DUST_W).toFixed(1) + '%';
  };

  /* Where the dive meets the grass, and when.

     Half the poses never come back down: jump_L2, jump_R2 and jump_center all
     end above the standing line, which is what a negative POSES[..].y means.
     game.js used to fire the dust plume and a landing shake on `land` for
     every dive, so a keeper still a body-height in the air puffed grass at
     the goal line and shook the camera for an impact that never happened.

     The contact a high dive really has is the push-off, on `swap`, under
     where he was standing -- so that is the frame, that is the place, and it
     is softer than a body hitting the ground. */
  PoseAnimator.prototype.impact = function (name) {
    var p = POSES[name] || POSES.idle;
    var airborne = p.y < 0;
    return {
      at:    airborne ? TIMING.swap : TIMING.land,
      x:     airborne ? '0%' : this.landing(name),
      force: airborne ? 1.6 : 2.6
    };
  };

  PoseAnimator.prototype.reset = function (opts) {
    var el = this.el;
    var self = this;
    return this.play('idle', {
      duration: (opts && opts.duration) || 520,
      onComplete: function () {
        // Hand the transform back to CSS so the idle bob can resume.
        clearTimeout(self.poseTimer);
        clearTimeout(self.holdTimer);
        if (self.anim) { self.anim.cancel(); self.anim = null; }
        if (self.shadowAnim) { self.shadowAnim.cancel(); self.shadowAnim = null; }
        el.classList.add('is-idling');
        if (opts && opts.onComplete) opts.onComplete();
      }
    });
  };

  window.TBAnimator = {
    PoseAnimator: PoseAnimator,
    POSES: POSES,
    SPRITES: SPRITES,
    COVERS: COVERS,
    WRONG_WAY: WRONG_WAY,
    TIMING: TIMING
  };
})();
