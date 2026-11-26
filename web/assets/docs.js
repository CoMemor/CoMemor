(function () {
  'use strict';

  var burger = document.getElementById('burger');
  function menu(open) {
    document.body.classList.toggle('menu-open', open);
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger) {
    burger.addEventListener('click', function () {
      menu(!document.body.classList.contains('menu-open'));
    });
  }
  document.querySelectorAll('#mmenu a').forEach(function (a) {
    a.addEventListener('click', function () { menu(false); });
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') menu(false);
  });

  var nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 24);
    }, { passive: true });
  }

  var yrEl = document.getElementById('yr');
  if (yrEl) yrEl.textContent = String(new Date().getFullYear());

  document.querySelectorAll('.code-copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var block = btn.closest('.code-block');
      var codeEl = block ? block.querySelector('pre code') : null;
      if (!codeEl || !navigator.clipboard) return;
      navigator.clipboard.writeText(codeEl.innerText).then(function () {
        var originalText = btn.innerText;
        btn.innerText = 'Copied!';
        btn.style.background = 'rgba(30,142,62,.3)';
        setTimeout(function () {
          btn.innerText = originalText;
          btn.style.background = '';
        }, 1800);
      }).catch(function () {});
    });
  });

  fetch('https://api.github.com/repos/PrasannaSaiS/CoMemor')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.stargazers_count !== undefined) {
        var el = document.getElementById('gh-stars');
        if (el) el.textContent = d.stargazers_count >= 1000 ? (d.stargazers_count / 1000).toFixed(1) + 'k' : String(d.stargazers_count);
      }
    }).catch(function () {});
})();
