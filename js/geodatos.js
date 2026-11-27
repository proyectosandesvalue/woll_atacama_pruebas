/**
 * geodatos.js — Interacción de la portada Geodatos del VPS.
 * Menú móvil. La FAQ usa <details> nativo y no requiere JS.
 */

(function(){
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    const setMenu = (open) => {
      menu.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    burger.addEventListener('click', function(e) {
      e.stopPropagation();
      setMenu(!menu.classList.contains('open'));
    });
    menu.addEventListener('click', function(e) {
      if (e.target.tagName === 'A') setMenu(false);
    });
    document.addEventListener('click', function(e) {
      if (!menu.contains(e.target) && !burger.contains(e.target)) setMenu(false);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        setMenu(false);
        burger.focus();
      }
    });
  }
})();

/**
 * Carruseles de capturas reales de la portada (chat y geoportal).
 * Cambian cada 3,5 s, permiten pausar/reanudar y respetan
 * prefers-reduced-motion. Los puntos eligen una vista manualmente.
 */
(function(){
  function initCarousel(root, shell, labels, intervalMs) {
    if (!root || !shell) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-slide]'));
    var dots = Array.prototype.slice.call(shell.querySelectorAll('.chat-dot'));
    var caption = shell.querySelector('.chat-carousel-caption');
    var toggle = shell.querySelector('.chat-carousel-toggle');
    var current = 0;
    var timer = null;
    var paused = false;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function render(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function(slide, i) {
        var active = i === current;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach(function(dot, i) {
        var active = i === current;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      if (caption) {
        caption.textContent = labels[current] + ' · ' + (current + 1) + ' de ' + slides.length;
      }
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function start() {
      if (reduceMotion || paused || document.hidden) return;
      stop();
      timer = setInterval(function() { render(current + 1); }, intervalMs);
    }

    function select(index) {
      render(index);
      start();
    }

    dots.forEach(function(dot, i) {
      dot.addEventListener('click', function() { select(i); });
    });

    if (toggle) {
      toggle.addEventListener('click', function() {
        paused = !paused;
        toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
        toggle.setAttribute('aria-label', paused ? 'Reanudar recorrido' : 'Pausar recorrido');
        if (paused) stop();
        else start();
      });
    }

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) stop();
      else start();
    });

    render(0);
    if (!reduceMotion) start();
  }

  var chatCarousel = document.getElementById('chatCarousel');
  if (chatCarousel) {
    initCarousel(
      chatCarousel,
      chatCarousel.closest('.chat-carousel-shell'),
      ['Chat', 'Mapa', 'Mapa + chat'],
      3500
    );
  }

  var geoCarousel = document.getElementById('geoCarousel');
  if (geoCarousel) {
    initCarousel(
      geoCarousel,
      geoCarousel.closest('.geo-carousel-shell'),
      ['Mapa y capas', 'Tabla de atributos', 'Filtros'],
      3500
    );
  }
})();
