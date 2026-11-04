/* Same rule as the other LDB sites: light from 7 am to 7 pm on the visitor's clock, dark otherwise.
   A manual pick lasts for the visit, until the next 7 am / 7 pm switch. Load in <head>. */
(function () {
  var root = document.documentElement, q = /[?&]theme=(light|dark)/.exec(location.search);
  function byHour() { var h = new Date().getHours(); return h >= 7 && h < 19 ? 'light' : 'dark'; }
  function chosen() { if (q) return q[1];
    try { var raw = (sessionStorage.getItem('theme') || '').split('|'); if (raw[0] && raw[1] === byHour()) return raw[0]; sessionStorage.removeItem('theme'); } catch (e) {}
    return null; }
  function apply(t) { var lt = t === 'light', changed = root.classList.contains('lt') !== lt;
    root.classList.toggle('lt', lt); root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = lt ? '#F3F5F4' : '#0B0D0C';
    var b = document.getElementById('themeBtn'); if (b) b.setAttribute('aria-label', lt ? 'Switch to dark' : 'Switch to light');
    if (changed) window.dispatchEvent(new Event('themechange')); }
  apply(chosen() || byHour());
  window.ldbToggleTheme = function () { var next = root.classList.contains('lt') ? 'dark' : 'light';
    try { sessionStorage.setItem('theme', next + '|' + byHour()); } catch (e) {} q = null;
    root.classList.add('theming'); apply(next); setTimeout(function () { root.classList.remove('theming'); }, 700); };
  setInterval(function () { if (!chosen()) apply(byHour()); }, 60000);
})();
