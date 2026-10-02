export function initSidebarUI(map) {
  // TABS DEL SIDEBAR DERECHO
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = {
    leyenda: document.getElementById('tab-leyenda'),
    graficos: document.getElementById('tab-graficos'),
  };

  function switchTab(tabId) {
    tabButtons.forEach(function (btn) {
      const isActive = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('tab-btn--active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    Object.keys(tabContents).forEach(function (id) {
      if (tabContents[id]) {
        tabContents[id].classList.toggle('active', id === tabId);
      }
    });
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const tabId = btn.getAttribute('data-tab');
      if (tabId && tabContents[tabId]) switchTab(tabId);
    });
  });
  switchTab('leyenda');

  // SIDEBAR INFO (POPUPS ALTERNATIVOS)
  const sidebarInfo = document.getElementById('sidebarInfo');
  const closeSidebarInfoBtn = document.getElementById('closeSidebarInfoBtn');

  if (closeSidebarInfoBtn && sidebarInfo) {
    closeSidebarInfoBtn.addEventListener('click', () => {
      sidebarInfo.classList.remove('active');
    });
  }
  
  if (map) {
    map.on('click', () => {
      if (sidebarInfo && sidebarInfo.classList.contains('active')) {
        sidebarInfo.classList.remove('active');
      }
    });
  }
}
