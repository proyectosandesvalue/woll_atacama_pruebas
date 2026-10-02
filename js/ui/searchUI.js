import { search } from '../search/index.js';
import { zoomToResult } from '../search/ui.js';
import { showAllResultsOnMap } from '../search/markers.js';
import { appState } from '../store/appState.js';
import { escapeHtml } from '../utils/helpers.js';

export function initSearchUI(map) {
  // CONTROL DE BÚSQUEDA GLOBAL DESKTOP
  const searchInput = document.getElementById('searchInput');
  const searchResultsAnchor = document.getElementById('search-results-anchor');
  let searchDebounceTimer = null;

  // Ocultar controles nativos inmediatamente
  document.querySelectorAll('.leaflet-control-search, .search-control-container').forEach(el => {
    el.style.display = 'none';
  });

  if (searchInput) {
    function renderResults(results) {
      if (!searchResultsAnchor) return;
      searchResultsAnchor.innerHTML = '';
      if (!results || results.length === 0) {
        searchResultsAnchor.style.display = 'none';
        return;
      }
      searchResultsAnchor.style.display = 'block';
      const resultsContainer = document.createElement('div');
      resultsContainer.className = 'global-search-results-container';
      const limitedResults = results.slice(0, 10);
      
      limitedResults.forEach(function (result) {
        const resultItem = document.createElement('div');
        resultItem.className = 'global-search-result-item';
        const icon = result.isMetadata ? '📂' : '📍';
        const isLayerLoaded = appState.layers?.loaded?.has(result.capaName);
        const statusHtml = !result.isMetadata && !isLayerLoaded
          ? '<span class="result-status-badge">inactiva</span>'
          : '';
        resultItem.innerHTML = `
          <div class="result-item-main">
            <span class="result-item-icon">${icon}</span>
            <span class="result-item-title">${escapeHtml(result.displayName || result.nombreCapa || result.capaName)}</span>
            ${statusHtml}
          </div>
          <div class="result-item-subtitle">${escapeHtml(result.nombreCapa || result.capaName || '')}</div>
        `;
        resultItem.addEventListener('click', async function () {
          searchResultsAnchor.style.display = 'none';
          searchInput.value = '';
          if (typeof zoomToResult === 'function') {
            await zoomToResult(result, map, true);
          }
        });
        resultsContainer.appendChild(resultItem);
      });

      if (results.length > 10) {
        const moreItem = document.createElement('div');
        moreItem.className = 'global-search-more-results';
        moreItem.innerHTML = `<small>+${results.length - 10} resultados más. Refina tu búsqueda.</small>`;
        resultsContainer.appendChild(moreItem);
      }
      searchResultsAnchor.appendChild(resultsContainer);
    }

    searchInput.addEventListener('input', function (e) {
      const query = e.target.value.trim();
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      if (query.length < 2) {
        if (searchResultsAnchor) searchResultsAnchor.style.display = 'none';
        return;
      }
      searchDebounceTimer = setTimeout(async function () {
        let results = null;
        if (typeof search === 'function') {
          results = await search(query);
        }
        if (results) renderResults(results);
        else if (searchResultsAnchor) searchResultsAnchor.style.display = 'none';
      }, 300);
    });

    searchInput.addEventListener('keypress', async function (e) {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query.length >= 2) {
          let results = null;
          if (typeof search === 'function') {
            results = await search(query);
          }
          if (results && results.length > 0 && typeof showAllResultsOnMap === 'function') {
            showAllResultsOnMap(results);
          }
        }
      }
    });

    document.addEventListener('click', function (e) {
      if (searchResultsAnchor &&
        !searchInput.contains(e.target) &&
        !searchResultsAnchor.contains(e.target)) {
        searchResultsAnchor.style.display = 'none';
      }
    });
  }

  // BÚSQUEDA MOBILE
  const mobileSearchBtn = document.getElementById('mobileSearchBtn');
  const mobileSearchOverlay = document.getElementById('mobileSearchOverlay');
  const mobileSearchInput = document.getElementById('mobileSearchInput');
  const mobileSearchCloseBtn = document.getElementById('mobileSearchCloseBtn');
  const mobileSearchResultsAnchor = document.getElementById('mobile-search-results-anchor');

  function openMobileSearch() {
    if (!mobileSearchOverlay) return;
    const sidebarLeft = document.getElementById('sidebarLeft');
    if (sidebarLeft) sidebarLeft.style.transform = 'translateX(-100%)';
    mobileSearchOverlay.classList.add('open');
    mobileSearchOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => mobileSearchInput?.focus(), 120);
  }

  function closeMobileSearch() {
    if (!mobileSearchOverlay) return;
    mobileSearchOverlay.classList.remove('open');
    mobileSearchOverlay.setAttribute('aria-hidden', 'true');
    if (mobileSearchInput) mobileSearchInput.value = '';
    if (mobileSearchResultsAnchor) mobileSearchResultsAnchor.innerHTML = '';
  }

  mobileSearchBtn?.addEventListener('click', openMobileSearch);
  mobileSearchCloseBtn?.addEventListener('click', closeMobileSearch);

  if (mobileSearchInput && mobileSearchResultsAnchor) {
    function renderMobileResults(results) {
      mobileSearchResultsAnchor.innerHTML = '';
      if (!results || results.length === 0) {
        mobileSearchResultsAnchor.style.display = 'none';
        return;
      }
      mobileSearchResultsAnchor.style.display = 'block';
      const container = document.createElement('div');
      container.className = 'global-search-results-container';

      results.slice(0, 10).forEach(function (result) {
        const item = document.createElement('div');
        item.className = 'global-search-result-item';
        const icon = result.isMetadata ? '📂' : '📍';
        const isLayerLoaded = appState.layers?.loaded?.has(result.capaName);
        const statusHtml = !result.isMetadata && !isLayerLoaded
          ? '<span class="result-status-badge">inactiva</span>' : '';
        const name = escapeHtml(result.displayName || result.nombreCapa || result.capaName || '');
        const subtitle = escapeHtml(result.nombreCapa || result.capaName || '');
        item.innerHTML = `
          <div class="result-item-main">
            <span class="result-item-icon">${icon}</span>
            <span class="result-item-title">${name}</span>
            ${statusHtml}
          </div>
          <div class="result-item-subtitle">${subtitle}</div>
        `;
        item.addEventListener('click', async function () {
          closeMobileSearch();
          if (typeof zoomToResult === 'function') {
            await zoomToResult(result, map, true);
          }
        });
        container.appendChild(item);
      });

      if (results.length > 10) {
        const more = document.createElement('div');
        more.className = 'global-search-more-results';
        more.innerHTML = `<small>+${results.length - 10} resultados más. Refina tu búsqueda.</small>`;
        container.appendChild(more);
      }
      mobileSearchResultsAnchor.appendChild(container);
    }

    let mobileDebounce = null;
    mobileSearchInput.addEventListener('input', function (e) {
      const query = e.target.value.trim();
      if (mobileDebounce) clearTimeout(mobileDebounce);
      if (query.length < 2) {
        mobileSearchResultsAnchor.style.display = 'none';
        mobileSearchResultsAnchor.innerHTML = '';
        return;
      }
      mobileDebounce = setTimeout(async function () {
        if (typeof search === 'function') {
          const results = await search(query);
          renderMobileResults(results);
        }
      }, 300);
    });
  }
}
