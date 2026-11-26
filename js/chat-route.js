/**
 * Marca la ruta /chat antes de que el navegador pinte el cuerpo.
 *
 * Se carga de forma bloqueante justo después de <body> para que
 * chat-immersive.css se aplique desde el primer frame. Sin esto, el
 * navegador alcanza a pintar el visor (mapa y header) mientras se
 * evalúa el módulo del shell inmersivo.
 *
 * En /visor no hace nada: la clase la sigue agregando el shell.
 */
(function () {
  if (window.location.pathname === "/chat") {
    document.body.classList.add("chat-immersive");
  }
})();
