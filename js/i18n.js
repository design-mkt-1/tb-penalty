/* Three locales, no dependencies, same shape as the other modules.

   Every visible string lives in STRINGS below rather than in the markup or
   in game.js/form.js, so adding a fourth language is one more object and
   nothing else. Nodes opt in with data-i18n="key"; attributes with
   data-i18n-attr="attr:key" (semicolon-separated for more than one).

   Uzbek is written in Latin script for this market, so there is no RTL work.
   The apostrophe in oʻ and gʻ is U+02BB, which the latin subset of the Fira
   Sans cut carries -- see the @font-face block in css/tokens.css. */
(function () {
  'use strict';

  var LANGS = ['uz', 'ru', 'en'];
  var FALLBACK = 'en';
  var STORE_KEY = 'tb-lang';

  /* \n means a real line break in the rendered text -- only the tagline uses
     it, and it is the reason the markup no longer carries a <br>. */
  var STRINGS = {
    en: {
      'title':            'TopBet — Hit the target and win!',
      'hdr.sound':        'Toggle sound',
      'hdr.lang':         'Language',
      'tagline':          'Hit the target\nand win!',
      'ball.shoot':       'Take the free kick',
      'hint.swipe':       'Drag from the ball to aim. Curve your drag to bend the shot.',
      'targets.label':    'Prize targets',
      /* The accessible name of each target names its prize. That gives it away
         before it is won, and it has to: the target decides which bonus the
         visitor gets, so somebody choosing one by keyboard has to know which
         is which. */
      'target.sport':     'Shoot at the 200% sport bonus',
      'target.casino':    'Shoot at the 150 free spins',
      'prize.sport.value':  '200%',
      'prize.sport.name':   'sport',
      'prize.casino.value': '150 FS',
      'prize.casino.name':  'casino',
      'msg.blocked':      'The dummies got it! One more',
      'msg.prize.sport':  'Target! 200% sport bonus',
      'msg.prize.casino': 'Target! 150 free spins',
      'promo.sport':      'sport',
      'promo.bonus':      'bonus',
      /* (AMOUNT) is the campaign placeholder the design ships with, and it
         stays one: top-bet.com quotes this cap per currency — 2 103 RON on the
         sport bonus, 1 500 EUR or 1 738.73 USD on the casino package — so no
         single figure is true everywhere the page might run. */
      'promo.sub':        'or up to (AMOUNT) + 150 FS',
      'tabs.label':       'Sign up with',
      'tab.phone':        'Phone Number',
      'tab.email':        'Email Address',
      'field.country':    'Country code',
      'field.phone':      '90 123 45 67',
      'field.email':      'you@example.com',
      'field.bonus':      'Choose Welcome Bonus',
      'err.phone':        'Invalid phone number',
      'err.email':        'Invalid email address',
      'err.code':         'Wrong code',
      'code.lede':        'Enter the 6-digit code we sent by SMS to',
      'code.label':       'SMS code',
      'code.again':       'Resend in',
      'code.seconds':     's',
      'code.resend':      'Resend',
      /* The two real offers on top-bet.com. The football and the slot machine
         are the right way round here; the Figma mock has them swapped. */
      'bonus.sport.title':  '⚽ Sport Bonus (200%)',
      'bonus.sport.sub':    '200% on your first four deposits',
      'bonus.casino.title': '🎰 Casino Bonus (+150 FS)',
      'bonus.casino.sub':   'Welcome package plus 150 free spins',
      'terms.lede':       'By tapping Create Account, you agree to our',
      'terms.tos':        'Terms of Service',
      'terms.and':        '&',
      'terms.privacy':    'Privacy Policy',
      'terms.age':        '. Must be 21+.',
      'cta.create':       'Create Account',
      'cta.verify':       'Verify',
      'cta.website':      'Go to website',
      'foot.have':        'Already have an account?',
      'foot.login':       'Log in',
      'done.title':       'Registration Successful!',
      'done.sub':         'Your account has been successfully created.',
      'done.phone':       'Phone',
      'done.email':       'Email',
      'done.password':    'Password'
    },

    uz: {
      'title':            'TopBet — Nishonga uring va yuting!',
      'hdr.sound':        'Ovozni yoqish yoki oʻchirish',
      'hdr.lang':         'Til',
      'tagline':          'Nishonga uring\nva yuting!',
      'ball.shoot':       'Jarima zarbasini urish',
      'hint.swipe':       'Nishonga olish uchun toʻpni torting. Zarbani burish uchun harakatni egib torting.',
      'targets.label':    'Sovrinli nishonlar',
      'target.sport':     '200% sport bonusi nishoniga urish',
      'target.casino':    '150 bepul aylanish nishoniga urish',
      'prize.sport.value':  '200%',
      'prize.sport.name':   'sport',
      'prize.casino.value': '150 FS',
      'prize.casino.name':  'kazino',
      'msg.blocked':      'Manekenlar toʻsdi! Yana bir marta',
      'msg.prize.sport':  'Nishon! 200% sport bonusi',
      'msg.prize.casino': 'Nishon! 150 bepul aylanish',
      'promo.sport':      'sport',
      'promo.bonus':      'bonus',
      'promo.sub':        'yoki (AMOUNT) gacha + 150 FS',
      'tabs.label':       'Roʻyxatdan oʻtish usuli',
      'tab.phone':        'Telefon raqami',
      'tab.email':        'Email manzili',
      'field.country':    'Mamlakat kodi',
      'field.phone':      '90 123 45 67',
      'field.email':      'siz@example.com',
      'field.bonus':      'Xush kelibsiz bonusini tanlang',
      'err.phone':        'Telefon raqami notoʻgʻri',
      'err.email':        'Email manzili notoʻgʻri',
      'err.code':         'Kod notoʻgʻri',
      'code.lede':        'SMS orqali yuborilgan 6 xonali kodni kiriting:',
      'code.label':       'SMS kodi',
      'code.again':       'Qayta yuborish:',
      'code.seconds':     's',
      'code.resend':      'Qayta yuborish',
      'bonus.sport.title':  '⚽ Sport bonusi (200%)',
      'bonus.sport.sub':    'Dastlabki toʻrtta depozitga 200%',
      'bonus.casino.title': '🎰 Kazino bonusi (+150 FS)',
      'bonus.casino.sub':   'Xush kelibsiz paketi va 150 bepul aylanish',
      'terms.lede':       'Akkaunt yaratish tugmasini bosish orqali siz',
      'terms.tos':        'Foydalanish shartlari',
      'terms.and':        'va',
      'terms.privacy':    'Maxfiylik siyosatiga',
      'terms.age':        ' rozilik bildirasiz. 21+ yosh.',
      'cta.create':       'Akkaunt yaratish',
      'cta.verify':       'Tasdiqlash',
      'cta.website':      'Saytga oʻtish',
      'foot.have':        'Akkauntingiz bormi?',
      'foot.login':       'Kirish',
      'done.title':       'Roʻyxatdan oʻtdingiz!',
      'done.sub':         'Akkauntingiz muvaffaqiyatli yaratildi.',
      'done.phone':       'Telefon',
      'done.email':       'Email',
      'done.password':    'Parol'
    },

    ru: {
      'title':            'TopBet — Попади в мишень и выиграй!',
      'hdr.sound':        'Включить или выключить звук',
      'hdr.lang':         'Язык',
      'tagline':          'Попади в мишень\nи выиграй!',
      'ball.shoot':       'Пробить штрафной',
      'hint.swipe':       'Тяните от мяча, чтобы прицелиться. Изогните движение, чтобы закрутить удар.',
      'targets.label':    'Мишени с призами',
      'target.sport':     'Удар по мишени «200% бонус на спорт»',
      'target.casino':    'Удар по мишени «150 фриспинов»',
      'prize.sport.value':  '200%',
      'prize.sport.name':   'спорт',
      'prize.casino.value': '150 FS',
      'prize.casino.name':  'казино',
      'msg.blocked':      'Манекены отбили! Ещё попытка',
      'msg.prize.sport':  'В мишень! 200% бонус на спорт',
      'msg.prize.casino': 'В мишень! 150 фриспинов',
      'promo.sport':      'спорт',
      'promo.bonus':      'бонус',
      'promo.sub':        'или до (AMOUNT) + 150 FS',
      'tabs.label':       'Способ регистрации',
      'tab.phone':        'Номер телефона',
      'tab.email':        'Адрес почты',
      'field.country':    'Код страны',
      'field.phone':      '90 123 45 67',
      'field.email':      'vy@example.com',
      'field.bonus':      'Выберите приветственный бонус',
      'err.phone':        'Неверный номер телефона',
      'err.email':        'Неверный адрес почты',
      'err.code':         'Неверный код',
      'code.lede':        'Введите 6-значный код из SMS, отправленного на',
      'code.label':       'Код из SMS',
      'code.again':       'Отправить снова через',
      'code.seconds':     'с',
      'code.resend':      'Отправить снова',
      'bonus.sport.title':  '⚽ Бонус на спорт (200%)',
      'bonus.sport.sub':    '200% за первые четыре депозита',
      'bonus.casino.title': '🎰 Бонус казино (+150 FS)',
      'bonus.casino.sub':   'Приветственный пакет и 150 фриспинов',
      'terms.lede':       'Нажимая «Создать аккаунт», вы принимаете',
      'terms.tos':        'Условия использования',
      'terms.and':        'и',
      'terms.privacy':    'Политику конфиденциальности',
      'terms.age':        '. Только 21+.',
      'cta.create':       'Создать аккаунт',
      'cta.verify':       'Подтвердить',
      'cta.website':      'Перейти на сайт',
      'foot.have':        'Уже есть аккаунт?',
      'foot.login':       'Войти',
      'done.title':       'Регистрация успешна!',
      'done.sub':         'Ваш аккаунт успешно создан.',
      'done.phone':       'Телефон',
      'done.email':       'Почта',
      'done.password':    'Пароль'
    }
  };

  /* Shown inside the menu, so each language names itself. Never translated. */
  var ENDONYM = { uz: 'Oʻzbekcha', ru: 'Русский', en: 'English' };

  var lang = FALLBACK;
  var watchers = [];
  var btn, menu, options;
  var hideTimer = 0;

  /* Must match the exit transition on .lang-menu in css/game.css. */
  var EXIT_MS = 120;

  /* ── strings ──────────────────────────────────────────────── */

  function t(key) {
    var table = STRINGS[lang];
    var value = table && table[key];
    if (value == null) value = STRINGS[FALLBACK][key];
    return value == null ? key : value;
  }

  function setText(el, value) {
    if (value.indexOf('\n') < 0) { el.textContent = value; return; }
    el.textContent = '';
    value.split('\n').forEach(function (line, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
  }

  /* Re-render one subtree. form.js calls it with the done step after it
     swaps the account label between phone and email. */
  function apply(root) {
    root = root || document;

    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (el) {
      setText(el, t(el.getAttribute('data-i18n')));
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-attr]'), function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var bits = pair.split(':');
        if (bits.length === 2) el.setAttribute(bits[0].trim(), t(bits[1].trim()));
      });
    });

    document.documentElement.lang = lang;
  }

  function set(next) {
    if (LANGS.indexOf(next) < 0 || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, next); } catch (e) { /* private mode */ }
    apply();
    syncSelector();
    watchers.forEach(function (fn) { fn(next); });
  }

  /* Saved choice wins, then the browser's own language, then English. */
  function detect() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* private mode */ }
    if (LANGS.indexOf(saved) >= 0) return saved;
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    return LANGS.indexOf(nav) >= 0 ? nav : FALLBACK;
  }

  /* ── selector ─────────────────────────────────────────────── */

  /* A listbox, not a dialog: focus moves along the options with the arrow
     keys instead of being trapped, so this deliberately does not reuse the
     Tab trap in form.js -- that pattern is for modals. */

  function isOpen() {
    return btn.getAttribute('aria-expanded') === 'true';
  }

  /* reset.css forces [hidden] to display:none !important, so the menu cannot
     transition its own display. Unhide first, let one frame pass, then add
     the class the transition runs on -- the same two-step as form.js. */
  function openMenu(focusIndex) {
    clearTimeout(hideTimer);
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    TBFx.next(function () { menu.classList.add('is-open'); });

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('pointerdown', onPointerDown, true);

    var i = typeof focusIndex === 'number' ? focusIndex : LANGS.indexOf(lang);
    options[Math.max(0, i)].focus({ preventScroll: true });
  }

  function closeMenu(restoreFocus) {
    if (!isOpen()) return;
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');

    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);

    // Focus has to leave before the menu is taken out of the layout, or the
    // browser drops it on <body> and the next Tab starts from the top.
    if (restoreFocus !== false) btn.focus({ preventScroll: true });
    else if (menu.contains(document.activeElement)) document.activeElement.blur();

    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { menu.hidden = true; }, EXIT_MS);
  }

  function move(step) {
    var here = options.indexOf(document.activeElement);
    var next = (here + step + options.length) % options.length;
    options[next].focus({ preventScroll: true });
  }

  function onKeydown(ev) {
    switch (ev.key) {
      case 'Escape':    ev.preventDefault(); closeMenu(); break;
      case 'ArrowDown': ev.preventDefault(); move(1); break;
      case 'ArrowUp':   ev.preventDefault(); move(-1); break;
      case 'Home':      ev.preventDefault(); options[0].focus({ preventScroll: true }); break;
      case 'End':       ev.preventDefault(); options[options.length - 1].focus({ preventScroll: true }); break;
      case 'Enter':
      case ' ':
        if (options.indexOf(document.activeElement) >= 0) {
          ev.preventDefault();
          choose(document.activeElement);
        }
        break;
      case 'Tab':
        /* Hand focus back to the trigger and let the Tab carry on from there,
           forwards or backwards. Closing with `false` blurred instead, which
           is the exact failure the comment in closeMenu warns about: the next
           Tab restarted from the top of the page. */
        closeMenu();
        break;
    }
  }

  function onPointerDown(ev) {
    if (!menu.contains(ev.target) && ev.target !== btn) closeMenu(false);
  }

  function choose(option) {
    set(option.getAttribute('data-lang'));
    closeMenu();
  }

  function syncSelector() {
    if (!btn) return;
    btn.querySelector('.lang__code').textContent = lang.toUpperCase();

    // The trigger carries a globe now, the way the design draws it, so there
    // is no flag on it to keep in step with the choice -- only the code and
    // which row shows its tick.
    options.forEach(function (o) {
      o.setAttribute('aria-selected',
                     String(o.getAttribute('data-lang') === lang));
    });
  }

  function wireSelector() {
    btn = document.querySelector('.lang');
    menu = document.querySelector('.lang-menu');
    if (!btn || !menu) return;

    options = Array.prototype.slice.call(menu.querySelectorAll('[data-lang]'));
    options.forEach(function (o) {
      var code = o.getAttribute('data-lang');
      o.querySelector('.lang-opt__name').textContent = ENDONYM[code] || code;
      o.addEventListener('click', function () { choose(o); });
    });

    btn.addEventListener('click', function () {
      if (isOpen()) closeMenu(); else openMenu();
    });

    // Opening straight onto an end of the list is the expected shortcut.
    btn.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); openMenu(0); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); openMenu(options.length - 1); }
    });

    syncSelector();
  }

  /* ── boot ─────────────────────────────────────────────────── */

  function init() {
    lang = detect();
    apply();
    wireSelector();
  }

  window.TBI18n = {
    init: init,
    t: t,
    set: set,
    apply: apply,
    langs: LANGS,
    current: function () { return lang; },
    onChange: function (fn) { watchers.push(fn); }
  };
})();
