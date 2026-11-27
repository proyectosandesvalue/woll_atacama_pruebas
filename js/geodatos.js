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
 * Carrusel de capturas reales del chat (/chat).
 * Cambia cada 3,5 s, se pausa al pasar el mouse o al enfocar y respeta
 * prefers-reduced-motion. Los puntos permiten elegir una vista.
 */
(function(){
  var carousel = document.getElementById('chatCarousel');
  if (!carousel) return;

  var slides = Array.prototype.slice.call(carousel.querySelectorAll('.chat-slide'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.chat-dot'));
  var caption = document.getElementById('chatCarouselCaption');
  var toggle = document.getElementById('chatCarouselToggle');
  var labels = ['Chat', 'Mapa', 'Mapa + chat'];
  var intervalMs = 3500;
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
})();
