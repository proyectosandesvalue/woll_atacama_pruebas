export function initMapUI(map) {
  // COORDENADAS EN TIEMPO REAL
  const coordLat = document.getElementById('coordLat');
  const coordLng = document.getElementById('coordLng');
  const coordZoom = document.getElementById('coordZoom');

  function updateCoords() {
    try {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (coordLat) coordLat.textContent = 'Lat: ' + center.lat.toFixed(5);
      if (coordLng) coordLng.textContent = 'Lng: ' + center.lng.toFixed(5);
      if (coordZoom) coordZoom.textContent = 'Zoom: ' + zoom;
    } catch (e) { /* silencioso */ }
  }
  
  if (map) {
    map.on('moveend', updateCoords);
    map.on('zoomend', updateCoords);
    updateCoords();
  }

  // BOTONES DEL MAPA
  document.getElementById('zoomInBtn')?.addEventListener('click', () => map.zoomIn());
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => map.zoomOut());
  document.getElementById('locateBtn')?.addEventListener('click', () => map.locate({ setView: true, maxZoom: 15 }));
  document.getElementById('rotate3dBtn')?.addEventListener('click', () => alert('Función 3D en desarrollo.'));

  // FONT SIZE POPUPS
  const decreaseFontSizeBtn = document.getElementById('decreaseFontSizeBtn');
  const increaseFontSizeBtn = document.getElementById('increaseFontSizeBtn');
  let currentPopupFontSize = 0.75; // rem inicial

  if (decreaseFontSizeBtn && increaseFontSizeBtn) {
    decreaseFontSizeBtn.addEventListener('click', () => {
      if (currentPopupFontSize > 0.55) {
        currentPopupFontSize -= 0.05;
        document.documentElement.style.setProperty('--popup-font-size', `${currentPopupFontSize}rem`);
      }
    });
    increaseFontSizeBtn.addEventListener('click', () => {
      if (currentPopupFontSize < 1.1) {
        currentPopupFontSize += 0.05;
        document.documentElement.style.setProperty('--popup-font-size', `${currentPopupFontSize}rem`);
      }
    });
  }
}

export function initModalUI() {
  // MODAL DE BIENVENIDA
  const welcomeModal = document.getElementById('welcomeModal');
  const welcomeModalBtn = document.getElementById('welcomeModalBtn');
  const closeModalBtns = document.querySelectorAll('#welcomeModalClose, #welcomeModalCloseFooter');
  const hasSeenWelcome = localStorage.getItem('woll-welcome-seen');
  
  if (!hasSeenWelcome && welcomeModal?.showModal) {
    welcomeModal.showModal();
    localStorage.setItem('woll-welcome-seen', 'true');
  }
  
  welcomeModalBtn?.addEventListener('click', () => {
    if (welcomeModal.showModal) welcomeModal.showModal();
  });
  
  closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (welcomeModal.close) welcomeModal.close();
    });
  });
}
