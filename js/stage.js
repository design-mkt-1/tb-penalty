/* Keeps the page from ever scrolling, and keeps the effects canvas the same
   size as the stage.

   There used to be a scale() here: a fixed 390x844 canvas shrunk with a
   transform. The stage is now the viewport itself and css/stage.css sizes
   everything against it, so the only thing left to do in JS is the canvas,
   whose drawing buffer cannot be set from CSS. */
(function () {
  'use strict';

  /* The reference composition. game.js scales its hand-tuned distances by the
     ratio between the goal it actually got and the 360px goal they were
     written against. */
  var GOAL_REF = 360;

  var stage = document.getElementById('stage');
  var fx = document.querySelector('.fx');

  /* Cap the buffer at 2x: past that the scene costs more to draw than it
     gains, and a 3x phone would allocate four times the pixels for nothing. */
  function ratio() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  function fit() {
    if (!fx || !stage) return;
    var r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;

    var k = ratio();
    var w = Math.round(r.width * k);
    var h = Math.round(r.height * k);
    if (fx.width === w && fx.height === h) return;

    fx.width = w;
    fx.height = h;
    // Draw in CSS pixels; the buffer scale is handled once, here.
    fx.getContext('2d').setTransform(k, 0, 0, k, 0, 0);
  }

  /* The width of the goal MOUTH as rendered, over the width it was designed
     at. Everything in game.js that used to be a stage-logical pixel is a
     multiple of this instead.

     Measured off the two base corner markers, NOT off .goal — .goal is
     `inset: 0` on .pitch, so its box is the whole pitch. This function used
     to measure that, which silently made every k()-scaled effect (arc lift,
     deflections, gravity, confetti, shake) track the VIEWPORT's width
     instead of the goal's: k came out ~4 on a 1440px laptop against ~1 on a
     phone, and the flight physics behaved differently per device. The
     markers are what js/aim.js already measures its drags against, so the
     two now agree about what "the goal" is. */
  function unit() {
    var l = document.querySelector('.goal__c[data-corner="left-base"]');
    var r = document.querySelector('.goal__c[data-corner="right-base"]');
    if (!l || !r) return 1;
    var w = r.getBoundingClientRect().left - l.getBoundingClientRect().left;
    return w > 0 ? w / GOAL_REF : 1;
  }

  var raf = 0;
  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () { raf = 0; fit(); });
  }

  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);

  // The soft keyboard shrinks the visual viewport rather than firing resize
  // on some browsers; re-fit from that signal too.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }

  // Belt and braces: if anything ever manages to scroll the document, undo it.
  window.addEventListener('scroll', function () {
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  }, { passive: true });

  fit();
  window.TBStage = { fit: fit, unit: unit, ratio: ratio };
})();
