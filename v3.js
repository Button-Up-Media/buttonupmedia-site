/* Button Up Media v3: app-style chrome and calm motion. No dependencies.
   - Phone tab bar (Home, Work, Services, Book) with a native-style services sheet
   - Gentle scroll reveals for headings and cards below the first screen
   Everything is progressive: without JS the pages render complete and static. */
(function () {
  var d = document, html = d.documentElement;
  var es = (html.getAttribute('lang') || '').toLowerCase().indexOf('es') === 0;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- copy ----------
  var T = es ? {
    home: 'Inicio', work: 'Casos', services: 'Servicios', book: 'Agendar llamada',
    homeHref: '/es', workHref: '/es/casos-de-exito', bookHref: '/es/contacto',
    sheetTitle: 'Servicios', close: 'Cerrar',
    cta: 'Agende una llamada estratégica gratis',
    items: [
      ['/es/marketing-redes-sociales', 'Marketing en redes sociales', 'Fotos, videos y manejo de sus redes'],
      ['/es/publicidad-restaurantes', 'Publicidad pagada', 'Google Ads y anuncios en Instagram y Facebook'],
      ['/es/diseno-web-restaurantes', 'Sitios web', 'Sitios a la medida, en inglés y español'],
      ['/es/seo-restaurantes', 'SEO y AEO', 'Google, Google Maps y respuestas de IA']
    ],
    toolLabel: 'Herramienta gratis',
    tool: ['/es/analizador-redes-sociales-web', 'Analizador de redes y sitio web', 'Califique su presencia en línea gratis']
  } : {
    home: 'Home', work: 'Work', services: 'Services', book: 'Book a call',
    homeHref: '/', workHref: '/case-studies', bookHref: '/contact',
    sheetTitle: 'Services', close: 'Close',
    cta: 'Book a free strategy call',
    items: [
      ['/socialmediamarketing', 'Social media marketing', 'Photos, videos and running your pages'],
      ['/restaurant-advertising', 'Paid media', 'Google Ads plus Instagram and Facebook ads'],
      ['/restaurant-website-design', 'Websites', 'Custom sites in English and Spanish'],
      ['/restaurant-seo', 'SEO & AEO', 'Google, Google Maps and AI answers']
    ],
    toolLabel: 'Free tool',
    tool: ['/social-media-website-grader', 'Social media and website grader', 'See how your restaurant shows up online']
  };

  var ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    work: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    services: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    book: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>'
  };
  var svg = function (k, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICON[k] + '</svg>';
  };

  // ---------- tab bar + sheet ----------
  function buildTabs() {
    if (d.querySelector('.v3-tabbar')) return;
    var path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
    var isHome = path === '/' || path === '/index' || path === '/es' || path === '/index-es';
    var isWork = /^\/(es\/)?(case-studies|casos-de-exito)(\/|$)/.test(path);
    var isBook = /^\/(es\/)?(contact|contacto)$/.test(path) || path === '/contact-es';

    var bar = d.createElement('nav');
    bar.className = 'v3-tabbar';
    bar.setAttribute('aria-label', es ? 'Navegación rápida' : 'Quick navigation');
    bar.innerHTML =
      '<a class="v3-tab" href="' + T.homeHref + '"' + (isHome ? ' aria-current="page"' : '') + '>' + svg('home') + '<span>' + T.home + '</span></a>' +
      '<a class="v3-tab" href="' + T.workHref + '"' + (isWork ? ' aria-current="page"' : '') + '>' + svg('work') + '<span>' + T.work + '</span></a>' +
      '<button type="button" class="v3-tab" aria-expanded="false" aria-controls="v3-sheet">' + svg('services') + '<span>' + T.services + '</span></button>' +
      '<a class="v3-tab --book" href="' + T.bookHref + '"' + (isBook ? ' aria-current="page"' : '') + '><span class="v3-tab-pill">' + svg('book', 2.2) + '<span>' + T.book + '</span></span></a>';

    var scrim = d.createElement('div');
    scrim.className = 'v3-scrim';
    var sheet = d.createElement('div');
    sheet.className = 'v3-sheet';
    sheet.id = 'v3-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', T.sheetTitle);
    sheet.innerHTML = '<div class="v3-sheet-grab" aria-hidden="true"></div><h2>' + T.sheetTitle + '</h2><ul>' +
      T.items.map(function (it) {
        return '<li><a href="' + it[0] + '"><span>' + it[1] + '<small>' + it[2] + '</small></span>' + svg('chevron', 2) + '</a></li>';
      }).join('') +
      '</ul><p class="v3-sheet-sub">' + T.toolLabel + '</p><ul><li><a href="' + T.tool[0] + '"><span>' + T.tool[1] + '<small>' + T.tool[2] + '</small></span>' + svg('chevron', 2) + '</a></li></ul>' +
      '<a class="btn btn-primary v3-sheet-cta" href="' + T.bookHref + '">' + T.cta + '</a>';

    d.body.appendChild(scrim);
    d.body.appendChild(sheet);
    d.body.appendChild(bar);
    html.classList.add('v3-has-tabs');

    var btn = bar.querySelector('button');
    var open = function () {
      html.classList.add('v3-sheet-open');
      btn.setAttribute('aria-expanded', 'true');
      var first = sheet.querySelector('a');
      setTimeout(function () { if (first) first.focus({ preventScroll: true }); }, 60);
    };
    var close = function (focusBack) {
      html.classList.remove('v3-sheet-open');
      btn.setAttribute('aria-expanded', 'false');
      if (focusBack) btn.focus({ preventScroll: true });
    };
    btn.addEventListener('click', function () { html.classList.contains('v3-sheet-open') ? close(true) : open(); });
    scrim.addEventListener('click', function () { close(true); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && html.classList.contains('v3-sheet-open')) close(true); });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a')) close(false); });
    // swipe the sheet down to dismiss
    var y0 = null;
    sheet.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', function (e) {
      if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) close(false);
      y0 = null;
    }, { passive: true });
  }

  // ---------- reveals ----------
  var REVEAL = [
    'main h2', '.page > section h2', '.lib-section h2',
    '.glass-card', '.feature-card', '.service-card', '.stat-card', '.case-card', '.team-card',
    '.faq-item', '.pain-item', '.process-step', '.v-stack-card',
    '.cs-finding', '.cs-tile', '.cs-step', '.cs-wcard', '.cs-reel', '.cs-site', '.cs-row', '.cs-mcard',
    '.ar-card', '.bl-card'
  ].join(',');
  var SKIP = /(^|[\s_-])(rise|reveal|fade|anim|animate|aos|stagger|in-view)([\s_-]|$)/i;
  var PINNED = '.hscroll-section, .hscroll-panel, .cinema-section, .card-overlay-stack, [data-no-reveal], .v3-sheet, .lib-nav, header';

  function buildReveals() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight || 800;
    var els = [].slice.call(d.querySelectorAll(REVEAL)).filter(function (el) {
      if (el.closest(PINNED)) return false;
      for (var n = el; n && n !== d.body; n = n.parentElement) {
        if (SKIP.test(n.className && n.className.baseVal === undefined ? n.className : '')) return false;
      }
      var r = el.getBoundingClientRect();
      return r.top > vh * 0.92 && r.height > 0;
    });
    if (!els.length) return;
    html.classList.add('v3-motion');
    var groups = new Map();
    els.forEach(function (el) {
      var p = el.parentElement, i = groups.get(p) || 0;
      groups.set(p, i + 1);
      el.style.setProperty('--v3-delay', Math.min(i, 4) * 0.06 + 's');
      el.classList.add('v3-reveal');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
    // printing or saving a PDF should never miss a section
    addEventListener('beforeprint', function () { els.forEach(function (el) { el.classList.add('is-in'); }); });
  }

  function start() {
    buildTabs();
    buildReveals();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
