/* COLLAB — shared theme controller
   Two independent, persisted axes:
   1. Light / Dark   (class: theme-dark)
   2. Palette A/B/C/D (class: theme-b | theme-c | theme-d ; A = no class)
      A chartreuse · B périwinkle · C rosé-wine · D sage-grey
   Defaults: light + Palette A. */
(function () {
  var THEME = 'collab-theme';
  var PAL   = 'collab-palette';
  var PALS  = ['a', 'b', 'c', 'd'];

  function curPal() {
    if (document.body.classList.contains('theme-b')) return 'b';
    if (document.body.classList.contains('theme-c')) return 'c';
    if (document.body.classList.contains('theme-d')) return 'd';
    return 'a';
  }

  try {
    if (localStorage.getItem(THEME) === 'dark') document.body.classList.add('theme-dark');
    var p = localStorage.getItem(PAL);
    if (p && p !== 'a' && PALS.indexOf(p) !== -1) document.body.classList.add('theme-' + p);
  } catch (e) {}

  function setTheme(dark) {
    document.body.classList.toggle('theme-dark', dark);
    try { localStorage.setItem(THEME, dark ? 'dark' : 'light'); } catch (e) {}
  }
  function setPalette(name) {
    document.body.classList.remove('theme-b', 'theme-c', 'theme-d');
    if (name !== 'a') document.body.classList.add('theme-' + name);
    try { localStorage.setItem(PAL, name); } catch (e) {}
    syncActive();
  }
  function syncActive() {
    var p = curPal();
    document.querySelectorAll('.pal-opt').forEach(function (el) {
      el.classList.toggle('on', el.getAttribute('data-pal') === p);
    });
  }

  function wire() {
    document.querySelectorAll('.theme-ctl').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTheme(!document.body.classList.contains('theme-dark'));
      });
    });
    document.querySelectorAll('.pal-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPalette(btn.getAttribute('data-pal'));
      });
    });
    syncActive();
  }
  if (document.readyState !== 'loading') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
