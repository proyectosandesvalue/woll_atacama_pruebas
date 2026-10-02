export function initMobileUI(map) {
  // SIDEBARS MÓVIL (OVERLAY)
  const mobileLeftBtn = document.getElementById('mobileLeftSidebarBtn');
  const mobileRightBtn = document.getElementById('mobileRightSidebarBtn');
  const closeLeftBtn = document.getElementById('closeLeftSidebarBtn');
  const closeRightBtn = document.getElementById('closeRightSidebarBtn');
  const sidebarLeft = document.getElementById('sidebarLeft');
  const rightSidebar = document.getElementById('sidebarRight');

  function isMobile() { return window.innerWidth < 769; }

  function toggleSidebar(sidebarId, show) {
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return;
    const offX = sidebarId === 'sidebarLeft' ? 'translateX(-100%)' : 'translateX(100%)';
    if (show === undefined) {
      const visible = sidebar.style.transform !== offX;
      sidebar.style.transform = visible ? offX : 'none';
    } else {
      sidebar.style.transform = show ? 'none' : offX;
    }
  }

  function handleMobileSidebars() {
    if (isMobile()) {
      if (sidebarLeft && !sidebarLeft.style.transform) sidebarLeft.style.transform = 'translateX(-100%)';
      if (rightSidebar && !rightSidebar.style.transform) rightSidebar.style.transform = 'translateX(100%)';
    } else {
      if (sidebarLeft) sidebarLeft.style.transform = '';
      if (rightSidebar) rightSidebar.style.transform = '';
    }
  }

  window.addEventListener('resize', handleMobileSidebars);
  handleMobileSidebars();

  // Botones de la navbar: en móvil abren/cierran el overlay; en desktop
  // colapsan/expanden la columna del grid (sidebar izquierdo 0→300px,
  // sidebar derecho 300→0px) con la misma animación.
  mobileLeftBtn?.addEventListener('click', () => {
    if (isMobile()) toggleSidebar('sidebarLeft');
    else {
      sidebarLeft?.classList.toggle('collapsed');
      setTimeout(() => map.invalidateSize(), 300);
    }
  });
  mobileRightBtn?.addEventListener('click', () => {
    if (isMobile()) toggleSidebar('sidebarRight');
    else {
      rightSidebar?.classList.toggle('collapsed');
      setTimeout(() => map.invalidateSize(), 300);
    }
  });
  closeLeftBtn?.addEventListener('click', () => { if (isMobile()) toggleSidebar('sidebarLeft', false); });
  closeRightBtn?.addEventListener('click', () => { if (isMobile()) toggleSidebar('sidebarRight', false); });

  document.addEventListener('click', function (e) {
    if (!isMobile()) return;
    if (sidebarLeft && sidebarLeft.style.transform !== 'translateX(-100%)' && !sidebarLeft.contains(e.target) && !mobileLeftBtn.contains(e.target)) {
      toggleSidebar('sidebarLeft', false);
    }
    if (rightSidebar && rightSidebar.style.transform !== 'translateX(100%)' && !rightSidebar.contains(e.target) && !mobileRightBtn.contains(e.target)) {
      toggleSidebar('sidebarRight', false);
    }
  });

  // TECLA ESCAPE GLOBAL (MÓVIL & BUSCADOR)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const mobileSearchOverlay = document.getElementById('mobileSearchOverlay');
      if (mobileSearchOverlay) {
          mobileSearchOverlay.classList.remove('open');
          mobileSearchOverlay.setAttribute('aria-hidden', 'true');
      }

      if (isMobile()) {
        toggleSidebar('sidebarLeft', false);
        toggleSidebar('sidebarRight', false);
      }

      const sidebarInfo = document.getElementById('sidebarInfo');
      if (sidebarInfo && sidebarInfo.classList.contains('active')) {
        sidebarInfo.classList.remove('active');
      }
    }
  });
}
