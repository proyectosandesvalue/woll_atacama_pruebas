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
