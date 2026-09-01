/* Small SFX pool. Silent until the first user gesture, mute state persisted.
   Missing files are tolerated: a sound that fails to load simply never plays. */
(function () {
  'use strict';

  var KEY = 'tb-muted';
  /* confetti and slump are rendered by tools/sfx.py rather than sourced; the
     other five are clips. Every entry here is played from somewhere. */
  var FILES = {
    kick:    'assets/audio/kick.mp3',
    save:    'assets/audio/save.mp3',
    net:     'assets/audio/net.mp3',
    cheer:   'assets/audio/cheer.mp3',
    whistle: 'assets/audio/whistle.mp3',
    confetti:'assets/audio/confetti.mp3',
    slump:   'assets/audio/slump.mp3'
  };

  var pool = {};
  var unlocked = false;

  /* Guarded the same way js/i18n.js guards its own two calls. Unguarded, a
     storage that throws — private mode, or an iframe with third-party storage
     blocked, and this is a landing page — kills this IIFE at parse time. Then
     window.TBAudio never exists, main.js throws on the line after it, and
     TBI18n, TBForm, TBGame and TBStage never initialise: the page is a dead
     picture with nothing in the console to say why. */
  var muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }

  function load() {
    Object.keys(FILES).forEach(function (name) {
      var a = new Audio();
      /* 'none' until the first gesture. The seven files are 159 kB that cannot
         make a sound before someone taps, so none of it belongs in the page
         load; unlock() raises this to 'auto' and primes, which is what
         actually starts the fetch. */
      a.preload = 'none';
      a.src = FILES[name];
      a.addEventListener('error', function () { pool[name] = null; });
      pool[name] = a;
    });
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Priming each element inside the gesture is what buys us playback later.
    Object.keys(pool).forEach(function (name) {
      var a = pool[name];
      if (!a) return;
      a.preload = 'auto';
      a.muted = true;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    });
  }

  function play(name, volume) {
    if (muted || !unlocked) return;
    var src = pool[name];
    if (!src) return;
    var node = src.cloneNode();
    node.volume = typeof volume === 'number' ? volume : 1;
    var p = node.play();
    if (p && p.catch) p.catch(function () {});
  }

  function setMuted(next) {
    muted = !!next;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* private mode */ }
    document.querySelectorAll('.mute').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(muted));
    });
  }

  load();

  window.TBAudio = {
    unlock: unlock,
    play: play,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    toggle: function () { setMuted(!muted); }
  };
})();
