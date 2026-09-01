/* Boot. Wires the mute button, unlocks audio on the first gesture,
   and hands control to the game. */
(function () {
  'use strict';

  /* The four outbound links the client has not supplied yet. None of the
     anchors carries an href in the markup, so until a seam is filled it is not
     a link at all: no tab stop, nothing announced as a link, and no click.
     That is the point — href="#" would offer a link that goes nowhere and drop
     a bare fragment into the address bar of a page that is not allowed to
     scroll.

     Filling any of them is a one-line change and needs nothing else. The fifth
     URL, behind "Go to website", is DESTINATION at the top of js/form.js. */
  var HOME_URL    = null;   // e.g. 'https://topbet.example/'
  var LOGIN_URL   = null;   // e.g. 'https://topbet.example/login'
  var TERMS_URL   = null;   // e.g. 'https://topbet.example/terms'
  var PRIVACY_URL = null;   // e.g. 'https://topbet.example/privacy'

  function link(sel, url) {
    if (!url) return;
    var a = document.querySelector(sel);
    if (a) a.setAttribute('href', url);
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    /* All four init() calls share this callback, so anything that throws up
       here takes the whole page down with it. The mute button is a convenience;
       the game is not. */
    var muteBtn = document.querySelector('.mute');
    if (muteBtn) {
      muteBtn.setAttribute('aria-pressed', String(TBAudio.isMuted()));
      muteBtn.addEventListener('click', function () { TBAudio.toggle(); });
    }

    // Audio can only start inside a user gesture.
    var unlock = function () {
      TBAudio.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });

    // The card is in the DOM from the start, only hidden, so all of these
    // resolve here.
    link('.hdr__logo', HOME_URL);
    link('.card .foot a', LOGIN_URL);
    link('.terms__tos', TERMS_URL);
    link('.terms__privacy', PRIVACY_URL);

    TBI18n.init();
    TBForm.init();
    TBGame.init();
    TBStage.fit();
  });
})();
