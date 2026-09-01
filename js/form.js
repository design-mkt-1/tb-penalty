/* Registration card behaviour. Client-side only: no request is ever sent, and
   no code is ever really checked.

   Three steps rather than the penalty game's two, because the design has an
   SMS step: contact, then the six-digit code if the contact was a phone, then
   the success screen. Email skips the middle one — there is nothing to send a
   code to that the visitor is not already reading.

   The card claims role="dialog" aria-modal="true" in the markup, so it has to
   behave like one: focus moves in on open, Tab stays inside, Escape closes,
   and focus goes back where it came from. */
(function () {
  'use strict';

  /* IT will replace this with the real signup URL. While it is null the
     "Go to website" button reloads the page, which is the safe stand-in.
     Pointing it at the real destination is a one-line change. */
  var DESTINATION = null;   // e.g. 'https://topbet.example/signup?utm=freekick'

  /* The card has never sent anything anywhere, and this is where it would.
     SUBMIT receives what the visitor actually chose -- the contact, which tab
     it came from, and the bonus -- and null leaves the behaviour exactly as it
     is. IT replaces the body; nothing else in this file has to change.

     It is called after the done screen is already up, and inside a try, so a
     hook that throws cannot strand the visitor on a form that has stopped
     responding. Same reason game.js catches around the shot sequence. */
  var SUBMIT = null;   // e.g. function (data) { navigator.sendBeacon('/signup', JSON.stringify(data)); }

  /* The countries the picker offers. Three, because the page speaks three
     languages and these are their markets.

     The design draws a US flag and +1 in the default state while its own copy
     quotes a bonus in UZS and its SMS step shows a +998 number, so the two
     disagree in the source. +998 is the one the rest of the design supports,
     so it is the default here; see the note in README.md. */
  var COUNTRIES = [
    { code: 'uz', dial: '+998', flag: 'flag-uz', name: 'Oʻzbekiston', digits: 9 },
    { code: 'ru', dial: '+7',   flag: 'flag-ru', name: 'Россия',      digits: 10 },
    { code: 'gb', dial: '+44',  flag: 'flag-gb', name: 'United Kingdom', digits: 10 }
  ];

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
                  'select:not([disabled]),textarea:not([disabled]),' +
                  '[tabindex]:not([tabindex="-1"])';

  var sheet, card, stepForm, stepDone, tabs, phoneInput, emailInput;
  var cta, bonusBtn, bonusMenu, bonusValue, bonusOpts;
  var countryBtn, countryMenu, codeBoxes, codeTo, codeLeft, resendBtn;

  var mode = 'phone';         // which tab
  var stage = 'contact';      // 'contact' | 'code'
  /* What validate() made of what was typed: a national number with any
     country code already stripped, or an email. Kept because the success
     screen and the SUBMIT hook both need it after the code step, by which
     point validate() is answering about the code instead. */
  var contact = null;
  var country = COUNTRIES[0];
  var bonus = 'sport';
  var lastFocus = null;
  var closing = false;
  var tick = 0;

  function field(name) {
    return card.querySelector('.field[data-for="' + name + '"]');
  }

  /* Swap the KEY and re-render, never the text: a later language change
     re-renders from the key, so writing the English string straight in would
     freeze that element in English for the rest of the visit. */
  function relabel(el, key) {
    el.setAttribute('data-i18n', key);
    TBI18n.apply(el.parentNode || el);
  }

  /* ── tabs ─────────────────────────────────────────────────── */

  function setTab(next) {
    if (next === mode) return;
    mode = next;
    tabs.forEach(function (t) {
      var on = t.dataset.tab === next;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    // Switching tabs abandons a code in progress: the number it was sent to is
    // no longer the contact being registered.
    setStage('contact');
    ['phone', 'email'].forEach(function (name) {
      var f = field(name);
      f.hidden = name !== next;
      clearError(f);
    });
  }

  /* ── the SMS step ─────────────────────────────────────────── */

  function setStage(next) {
    stage = next;
    var code = field('code');
    var contact = field(mode);

    code.hidden = next !== 'code';
    contact.hidden = next === 'code';
    relabel(cta, next === 'code' ? 'cta.verify' : 'cta.create');

    if (next !== 'code') {
      clearInterval(tick);
      clearError(code);
      codeBoxes.forEach(function (b) { b.value = ''; });
    }
  }

  /* 59 seconds, from the design. Nothing is resent because nothing was sent;
     the button restarts the clock so the state is reachable and reviewable. */
  function countdown() {
    var left = 59;
    clearInterval(tick);
    resendBtn.disabled = true;
    card.querySelector('.code__timer').hidden = false;
    codeLeft.textContent = String(left);
    tick = setInterval(function () {
      left -= 1;
      codeLeft.textContent = String(Math.max(0, left));
      if (left > 0) return;
      clearInterval(tick);
      resendBtn.disabled = false;
      card.querySelector('.code__timer').hidden = true;
    }, 1000);
  }

  function codeValue() {
    return codeBoxes.map(function (b) { return b.value.trim(); }).join('');
  }

  /* Type a digit and move on; backspace on an empty box steps back. Paste is
     handled because a phone's autofill delivers all six characters into the
     first box in one input event, and without spreading them the visitor would
     see "123456" in box one and five empty boxes. */
  function wireCode() {
    codeBoxes.forEach(function (box, i) {
      box.addEventListener('input', function () {
        var digits = box.value.replace(/\D/g, '');
        if (digits.length > 1) {
          digits.split('').forEach(function (d, n) {
            if (codeBoxes[i + n]) codeBoxes[i + n].value = d;
          });
          var last = Math.min(i + digits.length, codeBoxes.length - 1);
          codeBoxes[last].focus({ preventScroll: true });
        } else {
          box.value = digits;
          if (digits && codeBoxes[i + 1]) codeBoxes[i + 1].focus({ preventScroll: true });
        }
        clearError(field('code'));
      });

      box.addEventListener('keydown', function (ev) {
        if (ev.key === 'Backspace' && !box.value && codeBoxes[i - 1]) {
          ev.preventDefault();
          codeBoxes[i - 1].value = '';
          codeBoxes[i - 1].focus({ preventScroll: true });
        }
        if (ev.key === 'ArrowLeft' && codeBoxes[i - 1]) codeBoxes[i - 1].focus({ preventScroll: true });
        if (ev.key === 'ArrowRight' && codeBoxes[i + 1]) codeBoxes[i + 1].focus({ preventScroll: true });
      });
    });

    resendBtn.addEventListener('click', countdown);
  }

  /* ── errors ───────────────────────────────────────────────── */

  /* The error line fades rather than appearing. A plain `hidden` toggle snaps
     22px of card into existence with nothing to explain the movement.

     Two steps, because reset.css forces [hidden] to display:none !important
     and display cannot be transitioned: unhide one frame ahead of the class
     going on, and take the class off one transition ahead of hiding. The
     language menu and the card itself both do this already. */
  var ERR_OUT = 160;
  var errTimers = {};

  function clearError(f) {
    if (!f) return;
    f.classList.remove('is-invalid');
    Array.prototype.forEach.call(f.querySelectorAll('input'), function (input) {
      input.removeAttribute('aria-invalid');
    });
    var e = f.querySelector('.err');
    if (!e || e.hidden) return;
    e.classList.remove('is-shown');
    clearTimeout(errTimers[e.id]);
    errTimers[e.id] = setTimeout(function () { e.hidden = true; }, ERR_OUT);
  }

  function showError(f) {
    f.classList.add('is-invalid');
    /* The red ring is only half the message. aria-invalid states it, and the
       focus move is what makes aria-describedby read the error out: nothing
       announces a message that arrives while focus sits on the dialog. */
    var input = f.querySelector('input');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus({ preventScroll: true });
    }
    var e = f.querySelector('.err');
    if (!e) return;
    clearTimeout(errTimers[e.id]);
    e.hidden = false;
    TBFx.next(function () { e.classList.add('is-shown'); });
  }

  /* ── validation ───────────────────────────────────────────── */

  function validate() {
    if (stage === 'code') {
      var code = codeValue();
      // Any six digits. There is no server to disagree with, and pretending
      // otherwise would mean inventing a "correct" code nobody was sent.
      if (/^\d{6}$/.test(code)) { clearError(field('code')); return code; }
      showError(field('code'));
      return null;
    }

    var f = field(mode);
    var input = f.querySelector('input');
    var value = input.value.trim();
    var ok, out;

    if (mode === 'phone') {
      // Digits only once separators are stripped, 7 to 15 of them (E.164).
      var digits = value.replace(/[^\d]/g, '');
      ok = digits.length >= 7 && digits.length <= 15 && !/[a-z]/i.test(value);
      /* The dial code is fixed by the picker and put back on the done screen,
         so a number typed with its country code has to lose it here or it is
         shown twice — "+998 +998901234567". Strip only when the national
         number would still be long enough on its own: a national number may
         itself begin with the dial code's digits. */
      var dial = country.dial.replace('+', '');
      out = digits.length > country.digits && digits.indexOf(dial) === 0
        ? digits.slice(dial.length)
        : digits;
    } else {
      ok = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value);
      out = value;
    }

    if (ok) clearError(f); else showError(f);
    return ok ? out : null;
  }

  function submit(ev) {
    ev.preventDefault();
    var value = validate();
    if (!value) return;

    // On the code step `value` is the code, and `contact` is already what was
    // typed two steps ago. Everywhere else it is the contact itself.
    if (stage !== 'code') contact = value;

    // A phone goes through the code step first; email has nowhere to send one.
    if (mode === 'phone' && stage === 'contact') {
      codeTo.textContent = country.dial + ' ' + contact;
      setStage('code');
      countdown();
      TBFx.next(function () { codeBoxes[0].focus({ preventScroll: true }); });
      return;
    }

    finish();
  }

  function finish() {
    /* validate() already stripped a typed-in country code, so the dial code
       is simply put back on. Re-deriving it here from the raw field instead —
       with a regex that took the first one to three digits off whatever was
       in it — turned 901234567 into 234567 on the success screen. */
    var shown = mode === 'phone' ? country.dial + ' ' + contact : contact;

    relabel(stepDone.querySelector('.done__key'),
            mode === 'phone' ? 'done.phone' : 'done.email');
    stepDone.querySelector('.done__id').textContent = shown;

    clearInterval(tick);
    stepForm.hidden = true;
    stepDone.hidden = false;
    // #promo-title lives inside the step just hidden, so the dialog would be
    // left naming an element nobody can reach. Move the name with the step.
    card.setAttribute('aria-labelledby', 'done-title');
    card.scrollTop = 0;
    TBAudio.play('whistle', 0.5);

    /* Last, and guarded: the visitor is already on the done screen, so a hook
       that throws costs a delivery rather than the card. */
    if (SUBMIT) {
      try {
        SUBMIT({
          via: mode,
          contact: shown,
          bonus: bonus,
          lang: document.documentElement.lang || null
        });
      } catch (err) {
        console.error('[tb-penalty] the submit hook failed', err);
      }
    }
  }

  /* ── the two listboxes ────────────────────────────────────── */

  /* The bonus picker and the country picker are the same control twice: a
     button that shows the choice and a listbox that offers the rest. Neither
     can be a <select> — the design's open state is two lines of title and
     description with a radio, and a native option carries one string.

     They share this much: unhide a frame before the class the transition runs
     on, close on Escape, close on a pointer outside, and put focus back on the
     button. Same two-step and the same reasons as the language menu. */
  /* reset.css forces [hidden] to display:none !important, so a menu cannot
     transition its own display: it is unhidden one frame before the class the
     transition runs on, and re-hidden one transition after the class comes
     off. That second step is a timer, and the timer has to be cancellable —
     restore() closes both pickers on the way back to the opening state, and
     without this its 140ms hide landed on a menu the visitor had opened in
     the meantime. The menu was then marked open, carried .is-open, and was
     display:none. The language selector already guards this; so does the
     error line. */
  var hideTimers = new WeakMap();

  function pickerOpen(btn, menu, on) {
    clearTimeout(hideTimers.get(menu));
    btn.setAttribute('aria-expanded', String(on));
    if (on) {
      menu.hidden = false;
      TBFx.next(function () { menu.classList.add('is-open'); });
      document.addEventListener('pointerdown', outside, true);
    } else {
      menu.classList.remove('is-open');
      document.removeEventListener('pointerdown', outside, true);
      hideTimers.set(menu, setTimeout(function () { menu.hidden = true; }, 140));
    }
  }

  function outside(ev) {
    [[bonusBtn, bonusMenu], [countryBtn, countryMenu]].forEach(function (pair) {
      if (pair[0].getAttribute('aria-expanded') !== 'true') return;
      if (pair[1].contains(ev.target) || pair[0].contains(ev.target)) return;
      pickerOpen(pair[0], pair[1], false);
    });
  }

  function pickBonus(value) {
    bonus = value;
    bonusOpts.forEach(function (o) {
      var on = o.dataset.value === value;
      o.classList.toggle('is-picked', on);
      o.setAttribute('aria-selected', String(on));
    });
    relabel(bonusValue, 'bonus.' + value + '.title');
    pickerOpen(bonusBtn, bonusMenu, false);
    bonusBtn.focus({ preventScroll: true });
  }

  function buildCountries() {
    COUNTRIES.forEach(function (c) {
      var li = document.createElement('li');
      li.className = 'country-opt';
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.dataset.code = c.code;
      li.innerHTML =
        '<img src="assets/img/icons/' + c.flag + '.svg" alt="" width="22" height="16">' +
        '<span class="country-opt__name"></span>' +
        '<span class="country-opt__dial"></span>';
      li.querySelector('.country-opt__name').textContent = c.name;
      li.querySelector('.country-opt__dial').textContent = c.dial;
      li.addEventListener('click', function () { pickCountry(c); });
      countryMenu.appendChild(li);
    });
    pickCountry(country);
  }

  function pickCountry(c) {
    country = c;
    countryBtn.querySelector('.country__flag').src = 'assets/img/icons/' + c.flag + '.svg';
    countryBtn.querySelector('.country__dial').textContent = c.dial;
    Array.prototype.forEach.call(countryMenu.children, function (li) {
      li.setAttribute('aria-selected', String(li.dataset.code === c.code));
    });
    if (countryBtn.getAttribute('aria-expanded') === 'true') {
      pickerOpen(countryBtn, countryMenu, false);
      countryBtn.focus({ preventScroll: true });
    }
  }

  /* ── focus containment ────────────────────────────────────── */

  /* Only what is genuinely on screen: the email field is hidden while the
     phone tab is active, the code step is hidden until it is reached, and one
     of the two card steps is always hidden. */
  function focusables() {
    return Array.prototype.filter.call(
      card.querySelectorAll(FOCUSABLE),
      function (el) { return el.getClientRects().length > 0; }
    );
  }

  /* Every focus() call passes preventScroll: the page must never scroll, and
     the browser's default scroll-into-view would break that on its own. */
  function onKeydown(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      // A picker eats the first Escape; the card takes the second.
      if (bonusBtn.getAttribute('aria-expanded') === 'true') {
        pickerOpen(bonusBtn, bonusMenu, false);
        bonusBtn.focus({ preventScroll: true });
        return;
      }
      if (countryBtn.getAttribute('aria-expanded') === 'true') {
        pickerOpen(countryBtn, countryMenu, false);
        countryBtn.focus({ preventScroll: true });
        return;
      }
      close();
      return;
    }
    if (ev.key !== 'Tab') return;

    var list = focusables();
    if (!list.length) return;

    var first = list[0];
    var last = list[list.length - 1];

    if (!card.contains(document.activeElement)) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  /* ── open / close ─────────────────────────────────────────── */

  /* Tab is trapped, but a screen reader's virtual cursor is not: without this
     it browses the header, the pitch and the ball behind a dialog that claims
     aria-modal. inert takes them out of the accessibility tree and out of
     hit-testing in one attribute. Everything under #stage except the sheet
     itself, which is where the card lives. */
  function background(off) {
    Array.prototype.forEach.call(sheet.parentNode.children, function (el) {
      if (el === sheet) return;
      if (off) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }

  function open() {
    if (!sheet.hidden) return;
    lastFocus = document.activeElement;
    closing = false;

    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    background(true);
    document.addEventListener('keydown', onKeydown, true);

    TBFx.next(function () {
      sheet.classList.add('is-open');
      // The card itself, not the first field: on a phone, focusing a text
      // input pops the soft keyboard the instant the goal is scored.
      card.focus({ preventScroll: true });
    });
  }

  /* onDone runs once the card is fully gone. "Go to website" passes the
     navigation; Escape passes nothing and simply hands the pitch back. */
  function close(onDone) {
    if (closing || sheet.hidden) return;
    closing = true;

    sheet.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown, true);

    setTimeout(function () {
      sheet.hidden = true;
      sheet.setAttribute('aria-hidden', 'true');
      closing = false;
      restore();

      // Before the focus restore below: focus() cannot land inside inert.
      background(false);

      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      lastFocus = null;

      // The stage still carries data-state="form", which holds .ball at
      // pointer-events:none, and the attempt counter is still past the end of
      // the scripted sequence. Hand both back to the game, or the page stays
      // dead behind a card nobody can see.
      if (window.TBGame && TBGame.reset) TBGame.reset();

      if (typeof onDone === 'function') onDone();
    }, 280);
  }

  /* Back to the opening state, so a second visit does not start on the success
     screen with the previous answer still sitting in the field. */
  function restore() {
    clearInterval(tick);
    stepDone.hidden = true;
    stepForm.hidden = false;
    card.setAttribute('aria-labelledby', 'promo-title');
    phoneInput.value = '';
    emailInput.value = '';
    contact = null;
    pickBonus('sport');
    pickCountry(COUNTRIES[0]);
    mode = 'email';          // so setTab('phone') below is not a no-op
    setTab('phone');
    setStage('contact');
    card.scrollTop = 0;
  }

  function go() {
    if (DESTINATION) window.location.assign(DESTINATION);
    else window.location.reload();
  }

  /* ── boot ─────────────────────────────────────────────────── */

  function init() {
    sheet    = document.querySelector('.sheet');
    card     = sheet.querySelector('.card');
    stepForm = card.querySelector('[data-step="form"]');
    stepDone = card.querySelector('[data-step="done"]');
    tabs     = Array.prototype.slice.call(card.querySelectorAll('.tab'));
    cta      = stepForm.querySelector('.cta');

    phoneInput = card.querySelector('#tb-phone');
    emailInput = card.querySelector('#tb-email');

    bonusBtn   = card.querySelector('.bonus__toggle');
    bonusMenu  = card.querySelector('.bonus__menu');
    bonusValue = card.querySelector('.bonus__value');
    bonusOpts  = Array.prototype.slice.call(card.querySelectorAll('.bonus__opt'));

    countryBtn  = card.querySelector('.country');
    countryMenu = card.querySelector('.country-menu');

    codeBoxes = Array.prototype.slice.call(card.querySelectorAll('.code__box'));
    codeTo    = card.querySelector('.code__to');
    codeLeft  = card.querySelector('.code__left');
    resendBtn = card.querySelector('.code__resend');

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { setTab(t.dataset.tab); });
    });

    [phoneInput, emailInput].forEach(function (input) {
      input.addEventListener('input', function () {
        clearError(input.closest('.field'));
      });
    });

    bonusBtn.addEventListener('click', function () {
      pickerOpen(bonusBtn, bonusMenu,
                 bonusBtn.getAttribute('aria-expanded') !== 'true');
    });
    bonusOpts.forEach(function (o) {
      o.addEventListener('click', function () { pickBonus(o.dataset.value); });
    });

    countryBtn.addEventListener('click', function () {
      pickerOpen(countryBtn, countryMenu,
                 countryBtn.getAttribute('aria-expanded') !== 'true');
    });
    buildCountries();
    wireCode();

    card.addEventListener('submit', submit);

    card.querySelector('[data-action="close"]')
        .addEventListener('click', function () { close(go); });

    // The soft keyboard changes the usable height; re-fit the stage around it.
    card.addEventListener('focusin', function () { TBStage.fit(); });
    card.addEventListener('focusout', function () { TBStage.fit(); });
  }

  window.TBForm = { init: init, open: open, close: close };
})();
