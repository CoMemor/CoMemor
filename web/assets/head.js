document.documentElement.classList.add('js');
(function () {
  function enable() {
    var links = document.querySelectorAll('link[data-async-style]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].media !== 'all') links[i].media = 'all';
    }
  }
  var links = document.querySelectorAll('link[data-async-style]');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('load', enable, { once: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enable, { once: true });
  } else {
    enable();
  }
})();
