// js/ui/help.js
// UI de la página de ayuda (help.html)
// - Tema claro/oscuro
// - Navegación entre secciones
// - Barra de progreso + back to top
// - FAQ expandible
// - Búsqueda con resaltado

// ── Theme ──
const html = document.documentElement;
const saved = localStorage.getItem('woll-theme') || 'dark';
html.setAttribute('data-theme', saved);
const themeIcon = document.getElementById('themeIconHelp');
if (themeIcon) themeIcon.textContent = saved === 'dark' ? 'light_mode' : 'dark_mode';
document.getElementById('themeToggleHelp')?.addEventListener('click', () => {
    const cur = html.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('woll-theme', next);
    if (themeIcon) themeIcon.textContent = next === 'dark' ? 'light_mode' : 'dark_mode';
});

// ── Nav scroll ──
function scrollToSection(id, el) {
    const target = document.getElementById(id);
    if (!target) return;
    const contentWrapper = document.getElementById('helpContentWrapper');
    if (!contentWrapper) return;
    contentWrapper.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
    document.querySelectorAll('.help-nav-link').forEach(l => l.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('helpNav')?.classList.remove('mobile-open');
}

// Exponer para los onclick inline del HTML
window.scrollToSection = scrollToSection;

// ── Active section on scroll ──
const contentWrapper = document.getElementById('helpContentWrapper');
const sections = ['intro', 'interfaz', 'dimensiones', 'navegacion', 'capas-base', 'leyenda', 'buscador', 'popups', 'tabla-atributos', 'descargas', 'cluster-heatmap', 'personalizacion', 'mobile', 'faq'];
const navLinks = document.querySelectorAll('.help-nav-link');

if (contentWrapper) {
    contentWrapper.addEventListener('scroll', () => {
        const scrollTop = contentWrapper.scrollTop;
        const total = contentWrapper.scrollHeight - contentWrapper.clientHeight;
        const pct = total > 0 ? (scrollTop / total) * 100 : 0;

        const progressBar = document.getElementById('progressBar');
        if (progressBar) progressBar.style.width = pct + '%';

        const backToTopBtn = document.getElementById('backToTop');
        if (backToTopBtn) {
            if (scrollTop > 300) backToTopBtn.classList.add('visible');
            else backToTopBtn.classList.remove('visible');
        }

        let current = sections[0];
        for (const id of sections) {
            const el = document.getElementById(id);
            if (el && el.offsetTop - 60 <= scrollTop) current = id;
        }
        navLinks.forEach(l => {
            l.classList.toggle('active', l.dataset.target === current);
        });
    });
}

function scrollToTop() {
    const contentWrapper = document.getElementById('helpContentWrapper');
    if (contentWrapper) contentWrapper.scrollTo({ top: 0, behavior: 'smooth' });
}
window.scrollToTop = scrollToTop;

// ── FAQ toggle ──
function toggleFaq(item) {
    item.classList.toggle('open');
}
window.toggleFaq = toggleFaq;

// ── Search within help ──
const searchInput = document.getElementById('helpSearch');
const searchCountEl = document.getElementById('searchCount');
const searchPrevBtn = document.getElementById('searchPrev');
const searchNextBtn = document.getElementById('searchNext');
let searchMarks = [];
let searchIndex = -1;

function removeHighlights(container) {
    container.querySelectorAll('mark').forEach(mark => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
}

function highlightTextNodes(el, query) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (['SCRIPT', 'STYLE', 'MARK'].includes(node.parentNode.nodeName)) continue;
        if (node.textContent.toLowerCase().includes(query)) textNodes.push(node);
    }
    textNodes.forEach(textNode => {
        const text = textNode.textContent;
        const lower = text.toLowerCase();
        const frag = document.createDocumentFragment();
        let lastIndex = 0, idx;
        while ((idx = lower.indexOf(query, lastIndex)) !== -1) {
            if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
            const mark = document.createElement('mark');
            mark.textContent = text.slice(idx, idx + query.length);
            frag.appendChild(mark);
            lastIndex = idx + query.length;
        }
        if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        textNode.parentNode.replaceChild(frag, textNode);
    });
}

function updateSearchUI() {
    if (!searchCountEl || !searchPrevBtn || !searchNextBtn) return;
    const total = searchMarks.length;
    if (total === 0) {
        searchCountEl.textContent = '';
        searchPrevBtn.disabled = true;
        searchNextBtn.disabled = true;
    } else {
        searchCountEl.textContent = `${searchIndex + 1} de ${total}`;
        searchPrevBtn.disabled = false;
        searchNextBtn.disabled = false;
    }
}

function goToMark(idx) {
    if (searchMarks.length === 0) return;
    if (searchIndex >= 0 && searchMarks[searchIndex]) {
        searchMarks[searchIndex].classList.remove('search-current');
    }
    searchIndex = (idx + searchMarks.length) % searchMarks.length;
    const current = searchMarks[searchIndex];
    current.classList.add('search-current');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateSearchUI();
}

searchPrevBtn?.addEventListener('click', () => goToMark(searchIndex - 1));
searchNextBtn?.addEventListener('click', () => goToMark(searchIndex + 1));

searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchMarks.length > 0) {
        e.preventDefault();
        goToMark(e.shiftKey ? searchIndex - 1 : searchIndex + 1);
    }
});

searchInput?.addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();
    searchMarks = [];
    searchIndex = -1;
    if (searchCountEl) searchCountEl.textContent = '';
    if (searchPrevBtn) searchPrevBtn.disabled = true;
    if (searchNextBtn) searchNextBtn.disabled = true;

    document.querySelectorAll('.help-subsection, .faq-item, .help-section, .help-hero').forEach(el => {
        el.classList.remove('search-hidden');
        removeHighlights(el);
    });

    if (!query) return;

    document.querySelectorAll('.help-subsection, .faq-item').forEach(el => {
        const matches = el.textContent.toLowerCase().includes(query);
        if (matches) {
            el.classList.remove('search-hidden');
            highlightTextNodes(el, query);
            if (el.classList.contains('faq-item')) el.classList.add('open');
        } else {
            el.classList.add('search-hidden');
            if (el.classList.contains('faq-item')) el.classList.remove('open');
        }
    });

    document.querySelectorAll('.help-section').forEach(section => {
        const children = section.querySelectorAll('.help-subsection, .faq-item');
        if (children.length === 0) return;
        const allHidden = Array.from(children).every(c => c.classList.contains('search-hidden'));
        section.classList.toggle('search-hidden', allHidden);
    });

    const hero = document.querySelector('.help-hero');
    if (hero) {
        const heroMatches = hero.textContent.toLowerCase().includes(query);
        hero.classList.toggle('search-hidden', !heroMatches);
        if (heroMatches) highlightTextNodes(hero, query);
    }

    searchMarks = Array.from(document.querySelectorAll('mark'));
    if (searchMarks.length > 0) {
        searchIndex = -1;
        goToMark(0);
    } else {
        if (searchCountEl) searchCountEl.textContent = 'Sin resultados';
    }
});

document.getElementById('mobileNavBtn')?.addEventListener('click', () => {
    document.getElementById('helpNav')?.classList.toggle('mobile-open');
});
document.addEventListener('click', (e) => {
    const nav = document.getElementById('helpNav');
    const btn = document.getElementById('mobileNavBtn');
    if (!nav || !btn) return;
    if (!nav.contains(e.target) && !btn.contains(e.target)) {
        nav.classList.remove('mobile-open');
    }
});