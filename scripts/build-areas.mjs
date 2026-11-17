// Area pages generator for Button Up Media.
// Renders, from areas/content/*.json:
//   the hub      EN /areas-we-serve                    -> outDir/areas-we-serve.html
//                ES /es/zonas-que-atendemos             -> outDir/areas-es/index.html
//   area briefs  EN /restaurant-marketing-{id}          -> outDir/areas/{id}.html
//                ES /es/marketing-restaurantes-{id}     -> outDir/areas-es/{id}.html
// and returns sitemap <url> entries for every page it rendered.
//
// Page chrome (consent mode, GTM, fonts, lucide, nav, footer, shared.js) is read
// from about.html / about-es.html at build time, so these pages always match the
// live site; relative asset paths in that chrome are made absolute because these
// pages are served at clean and nested URLs.
//
// ---------------------------------------------------------------------------
// Content shapes. Keys ending in Html may contain <a>, <strong>, <em> only; all
// other strings are plain text and get HTML-escaped.
//
// Area brief: areas/content/{id}.{en|es}.json
// { id, lang, areaName, shortName?, metaTitle, metaDescription, eyebrow, h1, answer,
//   card: { insight, proofLine },                 // hub card + map panel
//   heroMedia: {
//     type: "loop" | "testimonial" | "graphic",
//     video?, poster?, width?, height?, focus?,    // loop + testimonial
//     alt, kicker, tag, play?,                     // play = testimonial button text
//     graphic?: { handle, hook?, hookLabel?, big, bigLabel, rows: [{ value, label }], asOf },
//     reviewNote? },
//   snapshot: { h2, facts: [{ label, value }] x3, paragraphsHtml: [] x2 },
//   proof: { h2, case, relation, client, where, service, stat, statLabel,
//            chips?: [], bodyHtml, reviewNote? },
//   steps: { h2, items: [{ title, bodyHtml }] x3 },
//   pricingHtml,
//   faqs: [{ q, a }] x3-4,                         // visible + FAQPage schema
//   faqH2?,
//   nearby: [areaId, areaId],
//   cta: { h2, body, button } }
//
// Hub: areas/content/hub.{en|es}.json
// { id: "hub", lang, metaTitle, metaDescription, eyebrow, h1, answer,
//   glance: { title, cols: [service, ...detail], rows: [{ service, cells: [one per detail col] }], note },
//   listLabel, listH2, listSub, alsoHtml?,      // South Florida neighborhood cards
//   remote?: { label, h2, sub?, items: [{ title, bodyHtml }] },  // optional extra section
//   work: { label, h2, sub?, items: [{ case, name, where, service, line }] },
//   faqH2?, faqs: [{ q, a }],
//   cta: { h2, body, button } }
//
// "reviewNote": "what the owner must confirm" renders an
// <aside class="review-note"> next to that block (never in JSON-LD). Delete the
// key before launch to remove the note.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const BASE = 'https://www.buttonupmedia.com';
const ORG_ID = `${BASE}/#organization`;
const PHONE = '+17867409499';
const PHONE_DISPLAY = '(786) 740-9499';
const OG_IMAGE = `${BASE}/media/founders-duo.webp`;
const HOST_IMG = { src: '/media/author-juan.webp', width: 512, height: 512 };

const AREA_IDS = ['fort-lauderdale', 'miami-beach', 'wynwood', 'doral', 'brickell', 'coral-gables', 'kendall-pinecrest']; // north to south
const CASE_SLUGS = ['tonis-sushi-bar', 'the-fatty-crab', 'brewing-buddha', 'shimuja-ramen', 'rusty-pelican'];

export const areaPath = (id, lang) => (lang === 'es' ? `/es/marketing-restaurantes-${id}` : `/restaurant-marketing-${id}`);
export const areaUrl = (id, lang) => `${BASE}${areaPath(id, lang)}`;
export const hubPath = (lang) => (lang === 'es' ? '/es/zonas-que-atendemos' : '/areas-we-serve');
export const hubUrl = (lang) => `${BASE}${hubPath(lang)}`;
export const casePath = (slug, lang) => (lang === 'es' ? `/es/casos-de-exito/${slug}` : `/case-studies/${slug}`);

// Internal URLs a content file may link to (SPEC.md URL list + case pages + hub).
const ALLOWED_PATHS = new Set([
  '/socialmediamarketing', '/es/marketing-redes-sociales',
  '/restaurant-website-design', '/es/diseno-web-restaurantes',
  '/restaurant-advertising', '/es/publicidad-restaurantes',
  '/restaurant-seo', '/es/seo-restaurantes',
  '/case-studies', '/es/casos-de-exito',
  '/social-media-website-grader', '/es/analizador-redes-sociales-web',
  '/about', '/es/nosotros', '/contact', '/es/contacto', '/blog', '/es/blog',
  hubPath('en'), hubPath('es'),
]);
for (const id of AREA_IDS) { ALLOWED_PATHS.add(areaPath(id, 'en')); ALLOWED_PATHS.add(areaPath(id, 'es')); }
for (const s of CASE_SLUGS) { ALLOWED_PATHS.add(casePath(s, 'en')); ALLOWED_PATHS.add(casePath(s, 'es')); }

const T = {
  en: {
    htmlLang: 'en', ogLocale: 'en_US', ogLocaleAlt: 'es_US',
    home: 'Home', homeUrl: `${BASE}/`, contact: '/contact', grader: '/social-media-website-grader',
    hubName: 'Areas we serve',
    primary: 'Book a free strategy call', graderBtn: 'Get a free report card',
    trust: ['Restaurants, bars and cafes only', 'English and Spanish', '5.0 stars on Google'],
    label: { snapshot: 'How we work here', proof: 'Our work nearby', plan: 'Where we would start', faq: 'FAQ', others: 'Other areas' },
    priceKey: 'What it costs',
    faqH2: (n) => `Questions ${n} owners ask`,
    caseLink: (c) => `Read ${/^the\s/i.test(c) ? '' : 'the '}${c} case study`,
    stepAria: (i) => `Step ${i}`,
    host: 'Juan Hernandez, our co-founder, hosts every strategy call himself.',
    hostAlt: 'Juan Hernandez, co-founder of Button Up Media',
    call: `Call ${PHONE_DISPLAY}`,
    othersAria: 'Other areas we serve',
    allAreas: 'Where we work',
    breadcrumbAria: 'Breadcrumb',
    serviceType: 'Restaurant marketing',
    nearest: 'Closest client',
    readBrief: (n) => `Restaurant marketing in ${n}`,
    caseShort: 'Read the case study',
    closestArea: 'Closest area',
    clientWhere: (w) => `Client, ${w}`,
    playing: 'Playing',
  },
  es: {
    htmlLang: 'es', ogLocale: 'es_US', ogLocaleAlt: 'en_US',
    home: 'Inicio', homeUrl: `${BASE}/es`, contact: '/es/contacto', grader: '/es/analizador-redes-sociales-web',
    hubName: 'Zonas que atendemos',
    primary: 'Agende una llamada estratégica gratis', graderBtn: 'Reciba su reporte gratis',
    trust: ['Solo restaurantes, bares y cafés', 'Inglés y español', '5.0 estrellas en Google'],
    label: { snapshot: 'Cómo trabajamos aquí', proof: 'Nuestro trabajo cerca', plan: 'Por dónde empezaríamos', faq: 'Preguntas', others: 'Otras zonas' },
    priceKey: 'Cuánto cuesta',
    faqH2: (n) => `Preguntas de dueños en ${n}`,
    caseLink: (c) => `Ver el caso de ${c}`,
    stepAria: (i) => `Paso ${i}`,
    host: 'Juan Hernandez, nuestro cofundador, atiende personalmente cada llamada de estrategia.',
    hostAlt: 'Juan Hernandez, cofundador de Button Up Media',
    call: `Llame al ${PHONE_DISPLAY}`,
    othersAria: 'Otras zonas que atendemos',
    allAreas: 'Dónde trabajamos',
    breadcrumbAria: 'Ruta de navegación',
    serviceType: 'Marketing para restaurantes',
    nearest: 'Cliente más cercano',
    readBrief: (n) => `Marketing para restaurantes en ${n}`,
    caseShort: 'Ver el caso',
    closestArea: 'Zona más cercana',
    clientWhere: (w) => `Cliente, ${w}`,
    playing: 'Reproduciendo',
  },
};

// ---------- escaping ----------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// JSON-LD lives inside <script>; keep "</script>" and friends from closing it early.
const ldJson = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// ---------- inline icons (no lucide dependency for page content) ----------
const svg = (body, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const I = {
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  pin: svg('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  route: svg('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
  tag: svg('<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.2v13.6L19 12z" fill="currentColor"/></svg>',
  ig: svg('<rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none"/>'),
  globe: svg('<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5s-1.3 6.9-3.9 9.5c-2.6-2.6-3.9-5.8-3.9-9.5s1.3-6.9 3.9-9.5Z"/>'),
  camera: svg('<path d="M14.5 4h-5L7.5 6.5H4a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 4 19.5h16a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 20 6.5h-3.5Z"/><circle cx="12" cy="12.5" r="3.5"/>'),
  tap: svg('<path d="M9 9V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M12 11.5V10a1.5 1.5 0 0 1 3 0v2"/><path d="M15 12v-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.8-2.4L4.2 15a1.6 1.6 0 0 1 2.4-2.1L9 15V9"/>'),
};

// ---------- chrome from about.html / about-es.html ----------
function absolutize(html) {
  return html.replace(/(\s(?:src|href)=")(?!https?:|\/|#|mailto:|tel:|data:)/g, '$1/');
}

function extractChrome(html, name) {
  const pick = (re, what) => {
    const m = html.match(re);
    if (!m) throw new Error(`build-areas: could not find the ${what} in ${name}`);
    return m[0];
  };
  const cssVer = (html.match(/href="\/?shared\.css\?v=([^"]+)"/) || [])[1];
  const jsVer = (html.match(/src="\/?shared\.js\?v=([^"]+)"/) || [])[1];
  if (!cssVer) throw new Error(`build-areas: could not find the shared.css version in ${name}`);
  const fonts = html.match(/^[ \t]*<link rel="preload" as="font"[^>]*>[ \t]*$/gm) || [];
  if (!fonts.length) throw new Error(`build-areas: could not find the font preloads in ${name}`);
  return {
    consent: pick(/<script>\s*\(function \(\) \{\s*var key = "bum-cookie-consent-v1";[\s\S]*?<\/script>/, 'consent-mode script'),
    gtm: pick(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/, 'GTM snippet'),
    gtmNoscript: pick(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/, 'GTM noscript'),
    fonts: fonts.map((l) => absolutize(l.trim())).join('\n  '),
    depth: pick(/<div class="depth-canvas"[\s\S]*?<\/div>\s*<\/div>/, 'depth canvas'),
    nav: absolutize(pick(/<nav class="lib-nav"[\s\S]*?<\/nav>/, 'nav')),
    footer: absolutize(pick(/<footer class="lib-section footer-demo">[\s\S]*?<\/footer>/, 'footer')),
    cssVer,
    jsVer: jsVer || cssVer,
  };
}

async function loadChrome(root) {
  const [en, es] = await Promise.all([
    readFile(path.join(root, 'about.html'), 'utf8'),
    readFile(path.join(root, 'about-es.html'), 'utf8'),
  ]);
  return { en: extractChrome(en, 'about.html'), es: extractChrome(es, 'about-es.html') };
}

// ---------- CSS (one <style> block per page, .ar- prefixed) ----------
const BASE_CSS = `
    /* ============================================================
       Areas hub + neighborhood briefs. Mobile-first, extends the
       shared.css dark system. Sections keep left/right padding untouched so
       even-numbered sections stay full-bleed.
       ============================================================ */
    .ar-wrap { width: 100%; max-width: var(--max); margin: 0 auto; }
    .ar-gold { color: var(--gold); }
    .ar-label { display: inline-flex; align-items: center; gap: 10px; font-family: var(--font-display); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); }
    .ar-label::before { content: ""; width: 11px; height: 11px; border-radius: 50%; border: 3px solid var(--gold); box-sizing: border-box; flex: none; }
    .ar-h2 { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.035em; font-size: clamp(1.6rem, 4.3vw, 2.5rem); line-height: 1.1; margin-top: 12px; color: var(--text-head); max-width: 24ch; text-wrap: balance; }
    .ar-sub { margin-top: 12px; color: var(--text-dim); font-size: 1rem; line-height: 1.6; max-width: 60ch; }
    .ar-btn.btn { height: auto; min-height: 48px; padding: 12px 20px; line-height: 1.25; text-align: center; font-size: 0.95rem; }
    .ar-btn svg { width: 16px; height: 16px; flex: none; }
    .ar-dot { width: 13px; height: 13px; border-radius: 50%; border: 3px solid var(--gold); background: var(--bg-0); box-sizing: border-box; flex: none; }
    .ar-dot.--fill { background: var(--text-head); }
    .ar-copy-link, .ar-rich a { color: var(--gold); text-decoration: underline; text-decoration-color: rgba(226,168,77,0.45); text-underline-offset: 3px; transition: text-decoration-color .2s; }
    .ar-copy-link:hover, .ar-rich a:hover { text-decoration-color: var(--gold); }
    .ar-rich strong { color: var(--text); font-weight: 700; }
    .ar-rise { transform: translateY(16px); transition: transform .7s cubic-bezier(.22,1,.36,1); }
    .ar-rise.is-in { transform: none; }
    @media (prefers-reduced-motion: reduce) { .ar-rise { transform: none; transition: none; } }

    main.page .ar-sec { --ar-pad: clamp(56px, 8vw, 104px); padding-top: var(--ar-pad); padding-bottom: var(--ar-pad); }
    main.page .ar-sec.--lap { padding-bottom: calc(var(--ar-pad) + 40px); }
    main.page .ar-sec.--end { padding-bottom: clamp(40px, 5vw, 64px); }
    main.page .card-overlay.ar-sec { margin-top: -40px; }
    main.page .ar-sec, .ar-acard { scroll-margin-top: 84px; }

    .ar-ctas { display: flex; flex-wrap: wrap; gap: 10px 12px; margin-top: 22px; }
    .ar-trust { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 18px 0 0; padding: 0; }
    .ar-trust li { display: inline-flex; align-items: center; gap: 7px; font-size: 0.8125rem; font-weight: 600; color: var(--text-dim); }
    .ar-trust svg { width: 14px; height: 14px; color: var(--teal); flex: none; }
    .ar-lede { margin-top: 16px; max-width: 46ch; font-size: clamp(1.06rem, 2.2vw, 1.2rem); line-height: 1.55; font-weight: 500; color: var(--text); }

    /* ---------- FINAL CTA ---------- */
    .ar-cta.cta-banner { padding: clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px); }
    .ar-cta h2 { font-family: var(--font-display); font-size: clamp(1.45rem, 2.6vw, 1.95rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.12; margin-bottom: 8px; }
    .ar-cta .cta-content p { font-size: 1rem; line-height: 1.6; color: var(--text-dim); max-width: 54ch; }
    .ar-cta .cta-actions { flex-wrap: wrap; }
    .ar-host { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .ar-host img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(226,168,77,0.55); flex: none; }
    .ar-host span { font-size: 0.875rem; line-height: 1.45; color: var(--text-dim); text-align: left; }

    /* Owner review notes (stripped before launch) */
    .review-note { display: block; margin: 12px 0 0; padding: 10px 14px; border: 2px dashed #d4a64a; border-radius: 8px; font-size: 13px; line-height: 1.5; color: #f6f0e6; background: rgba(212,166,74,0.06); }

    @media (max-width: 719px) {
      main.page .card-overlay.ar-sec, main.page .card-overlay.ar-sec::after { border-radius: 32px 32px 0 0; }
    }
    @media (max-width: 768px) {
      .ar-cta .cta-actions { width: 100%; }
      .ar-cta .cta-actions .btn { flex: 1 1 100%; }
    }
    @media (max-width: 900px) {
      .ar-host { justify-content: center; }
      .ar-cta .cta-content p { margin: 0 auto; }
    }
`;

const AREA_FAQ_CSS = `
    /* ---------- FAQ ---------- */
    .ar-faq { margin-top: 24px; max-width: 860px; border-top: 1px solid var(--line-soft); }
    .ar-faq details { border-bottom: 1px solid var(--line-soft); }
    .ar-faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 60px; padding: 14px 2px; }
    .ar-faq summary::-webkit-details-marker { display: none; }
    .ar-faq summary:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; border-radius: 8px; }
    .ar-faq summary h3 { font-family: var(--font-display); font-weight: 700; font-size: clamp(1.02rem, 2vw, 1.14rem); line-height: 1.35; letter-spacing: -0.01em; color: var(--text-head); }
    .ar-faq-ic { flex: none; width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(226,168,77,0.4); display: grid; place-items: center; color: var(--gold); transition: transform .3s, background .25s; }
    .ar-faq-ic svg { width: 15px; height: 15px; }
    .ar-faq details[open] .ar-faq-ic { transform: rotate(45deg); background: var(--gold-soft); }
    .ar-faq-a { padding: 0 2px 20px; }
    .ar-faq-a p { color: var(--text-dim); font-size: 1rem; line-height: 1.7; max-width: 66ch; }

`;

const AREA_CSS = `
    /* ---------- BRIEF HERO ---------- */
    main.page .ar-hero { padding-top: 128px; padding-bottom: calc(clamp(44px, 6vw, 80px) + 40px); }
    .ar-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; }
    .ar-route ol { list-style: none; display: flex; flex-wrap: wrap; align-items: center; margin: 0; padding: 0; }
    .ar-route li { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 0.875rem; font-weight: 600; color: var(--text-head); }
    .ar-route li + li::before { content: ""; width: 28px; height: 4px; border-radius: 2px; background: var(--gold); margin-right: 0; }
    .ar-route a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding-right: 2px; color: var(--text-dim); text-decoration: underline; text-decoration-color: rgba(246,240,230,0.25); text-underline-offset: 4px; transition: color .2s; }
    .ar-route a:hover { color: var(--gold); }
    .ar-hero h1 { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.045em; font-size: clamp(2.05rem, 5.6vw, 3.6rem); line-height: 1.03; margin-top: 8px; max-width: 16ch; text-wrap: balance; }

    .ar-media { position: relative; width: 100%; max-width: 440px; }
    .ar-media-frame { position: relative; margin: 0; aspect-ratio: 1 / 1; border-radius: var(--r-xl); overflow: hidden; background: var(--bg-2); border: 1px solid var(--line); box-shadow: 0 30px 70px rgba(0,0,0,0.5); }
    .ar-media-el { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: var(--focus, 50% 50%); display: block; background: var(--bg-2); }
    .ar-media-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8,8,8,0) 46%, rgba(8,8,8,0.84)); pointer-events: none; z-index: 1; transition: opacity .3s; }
    .ar-media-cap { position: absolute; left: 16px; right: 16px; bottom: 14px; z-index: 2; display: flex; flex-direction: column; gap: 2px; pointer-events: none; transition: opacity .3s; }
    .ar-media-kicker { font-family: var(--font-display); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }
    .ar-media-tag { font-size: 0.95rem; font-weight: 600; line-height: 1.35; color: var(--text-head); }
    .ar-play { align-self: flex-start; margin-bottom: 10px; pointer-events: auto; display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 20px 8px 8px; border-radius: 999px; border: 1px solid rgba(255,248,235,0.22); background: rgba(10,10,10,0.62); backdrop-filter: blur(10px); color: var(--text-head); font: 600 0.95rem/1.2 var(--font-body); cursor: pointer; max-width: 100%; text-align: left; transition: background .2s, transform .2s; }
    .ar-play:hover { background: rgba(10,10,10,0.8); }
    .ar-play:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .ar-play-ic { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #141414; flex: none; }
    .ar-play-ic svg { width: 18px; height: 18px; margin-left: 2px; }
    .ar-media.is-playing .ar-play, .ar-media.is-playing .ar-media-cap, .ar-media.is-playing .ar-media-shade { opacity: 0; pointer-events: none; visibility: hidden; }
    .ar-media.is-playing .ar-media-el { object-fit: contain; background: #000; }

    /* Designed stat card (no client media in the repo yet) */
    .ar-media.--graphic .ar-media-frame { aspect-ratio: auto; display: flex; flex-direction: column; background: radial-gradient(120% 90% at 100% 0%, rgba(226,168,77,0.26), transparent 55%), radial-gradient(90% 80% at 0% 100%, rgba(208,106,80,0.2), transparent 60%), #121110; }
    .ar-media.--graphic .ar-media-frame::after { content: ""; position: absolute; right: -46px; top: -46px; width: 190px; height: 190px; border-radius: 50%; border: 18px solid rgba(226,168,77,0.07); pointer-events: none; }
    .ar-ig { position: relative; flex: 1; display: flex; flex-direction: column; padding: 20px 20px 4px; }
    .ar-ig-handle { display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; color: var(--text-head); }
    .ar-ig-handle svg { width: 20px; height: 20px; color: var(--gold); }
    .ar-ig-hook { margin: 16px 0 0; padding: 12px 14px; max-width: 30ch; border-radius: 14px 14px 14px 4px; background: rgba(255,248,235,0.07); border: 1px solid var(--line); }
    .ar-ig-hook span { display: block; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); }
    .ar-ig-hook q { display: block; margin-top: 3px; font-size: 1rem; line-height: 1.45; font-weight: 600; color: var(--text-head); quotes: "“" "”" "‘" "’"; }
    .ar-ig-big { margin-top: 18px; }
    .ar-ig-big strong { display: block; font-family: var(--font-hero); font-weight: 800; font-size: clamp(3.4rem, 15vw, 5.2rem); line-height: 0.92; letter-spacing: -0.05em; color: var(--gold); }
    .ar-ig-big span { display: block; margin-top: 6px; font-size: 1rem; font-weight: 600; color: var(--text-head); }
    .ar-ig-rows { display: flex; flex-wrap: wrap; gap: 10px 26px; margin: 14px 0 0; }
    .ar-ig-rows div { display: flex; flex-direction: column-reverse; }
    .ar-ig-rows dt { font-size: 0.8125rem; color: var(--text-dim); }
    .ar-ig-rows dd { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: 1.2rem; color: var(--text-head); }
    .ar-ig-asof { margin-top: 10px; font-size: 0.8125rem; color: var(--text-dim); }
    .ar-media.--graphic .ar-media-shade { display: none; }
    .ar-media.--graphic .ar-media-cap { position: relative; left: auto; right: auto; bottom: auto; padding: 14px 20px 18px; margin-top: 12px; border-top: 1px solid var(--line-soft); }

    /* ---------- SNAPSHOT ---------- */
    .ar-facts { margin: 26px 0 0; display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid var(--line); border-top: 3px solid var(--gold); border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(226,168,77,0.07), rgba(226,168,77,0) 70%), var(--bg-1); overflow: hidden; }
    .ar-fact { padding: 14px 18px 15px; display: grid; gap: 3px; }
    .ar-fact + .ar-fact { border-top: 1px solid var(--line-soft); }
    .ar-fact dt { font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); }
    .ar-fact dd { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 1.06rem; line-height: 1.35; color: var(--text-head); }
    .ar-snap-text { display: grid; gap: 14px; margin-top: 24px; }
    .ar-snap-text p { color: var(--text-dim); font-size: 1rem; line-height: 1.7; max-width: 62ch; }
    .ar-snap-text em { color: var(--text); }

    /* ---------- PROOF ---------- */
    .ar-proof { margin-top: 28px; display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid rgba(226,168,77,0.24); border-radius: var(--r-xl); overflow: hidden; background: var(--bg-1); }
    .ar-proof-stat { position: relative; padding: 26px 22px 22px; display: flex; flex-direction: column; justify-content: center; gap: 8px; background: radial-gradient(120% 120% at 0% 0%, rgba(226,168,77,0.2), transparent 62%), var(--bg-2); border-bottom: 1px solid var(--line-soft); }
    .ar-proof-stat strong { font-family: var(--font-hero); font-weight: 800; font-size: clamp(3rem, 11vw, 4.8rem); line-height: 0.95; letter-spacing: -0.05em; color: var(--gold); }
    .ar-proof-stat span { font-size: 1rem; line-height: 1.45; color: var(--text); max-width: 24ch; }
    .ar-proof-body { padding: 22px 22px 26px; }
    .ar-rel { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; background: var(--gold-soft); border: 1px solid rgba(226,168,77,0.3); color: var(--gold); font-size: 0.8125rem; font-weight: 700; line-height: 1.3; }
    .ar-rel svg { width: 14px; height: 14px; flex: none; }
    .ar-proof h3 { margin-top: 14px; font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; color: var(--text-head); }
    .ar-proof-meta { margin-top: 4px; font-size: 0.875rem; color: var(--text-dim); }
    .ar-proof-text { margin-top: 12px; font-size: 1rem; line-height: 1.65; color: var(--text-dim); max-width: 60ch; }
    .ar-chips { list-style: none; padding: 0; margin: 16px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .ar-chips li { padding: 7px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); font-size: 0.875rem; font-weight: 600; color: var(--text); }
    .ar-proof .ar-btn { margin-top: 20px; }

    /* ---------- FIRST STEPS (route) ---------- */
    .ar-steps { list-style: none; margin: 30px 0 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); position: relative; }
    .ar-step { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 16px; padding-bottom: 28px; }
    .ar-step:last-child { padding-bottom: 0; }
    .ar-step::before { content: ""; position: absolute; left: 20px; top: 40px; bottom: -4px; width: 4px; border-radius: 2px; background: var(--gold); }
    .ar-step:last-child::before { display: none; }
    .ar-step-n { position: relative; z-index: 1; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; border: 4px solid var(--gold); background: var(--bg-0); box-sizing: border-box; font-family: var(--font-hero); font-weight: 800; font-size: 1rem; color: var(--text-head); }
    .ar-step h3 { margin-top: 9px; font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; line-height: 1.3; letter-spacing: -0.01em; color: var(--text-head); }
    .ar-step p { margin-top: 8px; font-size: 1rem; line-height: 1.65; color: var(--text-dim); }
    .ar-price { margin-top: 34px; display: flex; align-items: flex-start; gap: 14px; padding: 18px 20px; border-radius: var(--r-lg); border: 1px solid rgba(226,168,77,0.28); background: linear-gradient(135deg, rgba(226,168,77,0.12), rgba(208,106,80,0.06)), var(--bg-1); }
    .ar-price > svg { width: 22px; height: 22px; color: var(--gold); flex: none; margin-top: 2px; }
    .ar-price p { font-size: 1rem; line-height: 1.6; color: var(--text-dim); }
    .ar-price b { display: block; margin-bottom: 2px; font-family: var(--font-display); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }

    /* ---------- OTHER AREAS ---------- */
    .ar-others { margin-top: 36px; text-align: center; }
    .ar-others-label { font-family: var(--font-display); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); }
    .ar-others ul { list-style: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 12px 0 0; padding: 0; }
    .ar-others a { display: inline-flex; align-items: center; gap: 9px; min-height: 48px; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); font-size: 1rem; font-weight: 600; color: var(--text); transition: border-color .2s, color .2s; }
    .ar-others a:hover { border-color: rgba(226,168,77,0.4); color: var(--gold); }
    .ar-others a.--hub { border-color: rgba(226,168,77,0.35); background: var(--gold-soft); color: var(--gold); }
    .ar-others a.--hub svg { width: 16px; height: 16px; }

    /* ===================== PHONE ===================== */
    @media (max-width: 700px) {
      main.page .ar-hero { padding-top: 14px; }
    }
    @media (max-width: 420px) {
      .ar-ctas .ar-btn { flex: 1 1 100%; }
    }

    /* ===================== TABLET / DESKTOP ===================== */
    @media (min-width: 760px) {
      .ar-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .ar-fact { padding: 20px 22px; }
      .ar-fact + .ar-fact { border-top: 0; border-left: 1px solid var(--line-soft); }
    }
    @media (min-width: 820px) {
      .ar-proof { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.4fr); }
      .ar-proof-stat { border-bottom: 0; border-right: 1px solid var(--line-soft); padding: 40px 34px; }
      .ar-proof-body { padding: 34px 38px 36px; }
    }
    @media (min-width: 900px) {
      .ar-snap-text { grid-template-columns: 1fr 1fr; gap: 40px; }
      .ar-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; }
      .ar-steps::before { content: ""; position: absolute; left: 22px; right: calc((100% - 56px) / 3 - 22px); top: 20px; height: 4px; border-radius: 2px; background: var(--gold); }
      .ar-step { grid-template-columns: minmax(0, 1fr); gap: 6px; padding-bottom: 0; align-content: start; }
      .ar-step::before { display: none; }
      .ar-step h3 { margin-top: 12px; }
    }
    @media (min-width: 720px) {
      .ar-ig-big strong { font-size: clamp(2.7rem, 6vw, 4.5rem); }
      .ar-hero-grid { grid-template-columns: minmax(0, 1fr) clamp(236px, 30vw, 318px); gap: clamp(32px, 6vw, 96px); align-items: center; }
      .ar-media { max-width: none; }
      .ar-media-frame { aspect-ratio: 9 / 16; }
      .ar-media-el { object-position: 50% 50%; }
    }
    @media (min-width: 960px) {
      .ar-ig { padding: 28px 26px 4px; }
      .ar-ig-big { margin-top: auto; }
      .ar-media.--graphic .ar-media-cap { padding: 16px 26px 22px; }
    }
`;

const HUB_CSS = `
    /* ---------- HUB HERO + AT-A-GLANCE TABLE ---------- */
    main.page .ar-hub-hero { padding-top: 124px; padding-bottom: calc(clamp(40px, 6vw, 72px) + 40px); }
    .ar-hub-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 30px; }
    .ar-hub-hero h1 { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.045em; font-size: clamp(2.05rem, 5.4vw, 3.4rem); line-height: 1.04; margin-top: 12px; max-width: 18ch; text-wrap: balance; }
    .ar-glance { margin: 0; padding: 20px 18px 18px; border-radius: var(--r-xl); border: 1px solid var(--line); background: var(--bg-1); }
    .ar-glance-title { font-family: var(--font-display); font-size: 1.06rem; font-weight: 800; letter-spacing: -0.01em; color: var(--text-head); }
    .ar-gl { width: 100%; margin-top: 12px; border-collapse: collapse; table-layout: fixed; }
    .ar-gl th, .ar-gl td { padding: 12px 6px; text-align: left; vertical-align: top; border-top: 1px solid var(--line-soft); font-size: 0.9375rem; line-height: 1.35; }
    .ar-gl thead th { border-top: 0; padding-top: 4px; font-size: 0.8125rem; font-weight: 700; color: var(--text-dim); }
    .ar-gl thead th:first-child { padding-left: 0; }
    .ar-gl tbody th { width: 38%; padding-left: 0; font-weight: 700; color: var(--text-head); }
    .ar-gl td { color: var(--text); }
    .ar-gl td svg { display: block; width: 18px; height: 18px; margin-bottom: 4px; color: var(--gold); }
    .ar-glance-note { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line-soft); font-size: 0.9375rem; line-height: 1.55; color: var(--text-dim); }

    /* ---------- NEIGHBORHOOD CARDS ---------- */
    .ar-acards { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 28px; }
    .ar-acard { position: relative; display: flex; flex-direction: column; padding: 22px 20px 12px; border-radius: var(--r-lg); border: 1px solid var(--line-soft); background: var(--surface); transition: border-color .25s; }
    .ar-acard:hover { border-color: rgba(226,168,77,0.4); }
    .ar-ac-where { font-size: 0.8125rem; font-weight: 600; color: var(--text-dim); }
    .ar-acard h3 { margin-top: 4px; font-family: var(--font-display); font-weight: 800; font-size: 1.3rem; letter-spacing: -0.02em; line-height: 1.2; color: var(--text-head); }
    .ar-ac-insight { margin-top: 8px; font-size: 1rem; line-height: 1.6; color: var(--text-dim); }
    .ar-ac-rows { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 12px; }
    .ar-ac-rows li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; font-size: 1rem; line-height: 1.5; color: var(--text); }
    .ar-ac-rows svg { width: 18px; height: 18px; color: var(--gold); margin-top: 3px; }
    .ar-ac-rows b { display: block; font-size: 0.8125rem; font-weight: 600; color: var(--text-dim); }
    .ar-ac-links { margin-top: auto; padding-top: 10px; display: flex; flex-wrap: wrap; gap: 0 18px; }
    .ar-ac-link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 0.95rem; font-weight: 700; color: var(--gold); }
    .ar-ac-link svg { width: 16px; height: 16px; transition: transform .2s; }
    .ar-ac-link:hover svg { transform: translateX(3px); }
    .ar-also { margin-top: 18px; font-size: 1rem; line-height: 1.6; color: var(--text-dim); max-width: 62ch; }

    /* ---------- OPTIONAL EXTRA SECTION (cards) ---------- */
    .ar-modes { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 28px; }
    .ar-mode { padding: 24px 22px; border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--bg-1); }
    .ar-mode-ic { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--gold-soft); color: var(--gold); }
    .ar-mode-ic svg { width: 22px; height: 22px; }
    .ar-mode h3 { margin-top: 14px; font-family: var(--font-display); font-size: 1.2rem; font-weight: 800; letter-spacing: -0.015em; line-height: 1.25; color: var(--text-head); }
    .ar-mode p { margin-top: 8px; font-size: 1rem; line-height: 1.65; color: var(--text-dim); }

    /* ---------- CLIENT WORK BY LOCATION ---------- */
    .ar-work { list-style: none; margin: 26px 0 0; padding: 0; border-top: 1px solid var(--line-soft); max-width: 900px; }
    .ar-work li { border-bottom: 1px solid var(--line-soft); }
    .ar-work a { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 16px; padding: 16px 2px; color: inherit; text-decoration: none; }
    .ar-work-name { font-family: var(--font-display); font-size: 1.06rem; font-weight: 800; letter-spacing: -0.01em; color: var(--text-head); }
    .ar-work-meta { grid-column: 1; font-size: 0.875rem; font-weight: 600; color: var(--gold); }
    .ar-work-line { grid-column: 1; font-size: 0.9375rem; line-height: 1.5; color: var(--text-dim); }
    .ar-work-go { grid-column: 2; grid-row: 1 / span 3; width: 36px; height: 36px; border-radius: 999px; display: grid; place-items: center; background: rgba(255,255,255,0.06); color: var(--text-head); transition: transform .2s; }
    .ar-work-go svg { width: 16px; height: 16px; }
    .ar-work a:hover .ar-work-name { color: var(--gold); }
    .ar-work a:hover .ar-work-go { transform: translateX(3px); }

    @media (max-width: 700px) {
      main.page .ar-hub-hero { padding-top: 16px; }
      .ar-gl th, .ar-gl td { padding: 11px 4px; font-size: 0.875rem; }
      .ar-gl tbody th { padding-left: 0; }
    }
    @media (min-width: 700px) {
      .ar-acards, .ar-modes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (min-width: 960px) {
      main.page .ar-hub-hero { padding-top: 150px; }
      .ar-hub-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 480px); column-gap: clamp(40px, 6vw, 80px); align-items: center; }
      .ar-glance { padding: 26px 24px 22px; }
    }
    @media (min-width: 1060px) {
      .ar-acards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
`;

// ---------- page scripts ----------
const REVEAL_JS = `
    (function () {
      var els = [].slice.call(document.querySelectorAll('.ar-rise'));
      var inView = function (e) { var r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
      if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        els.forEach(function (e) { e.classList.add('is-in'); }); return;
      }
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
      els.forEach(function (e) { if (inView(e)) e.classList.add('is-in'); else io.observe(e); });
      setTimeout(function () { els.forEach(function (e) { e.classList.add('is-in'); }); }, 1500);
    })();
`;

// Loop clips: poster first; after the page has loaded (and only without
// reduced motion or data saver) the clip is handed to shared.js's lazy loader
// (data-video-src: Bunny CDN on production, local fallback) and plays muted
// while in view. Testimonials download nothing until the visitor taps play,
// then play with sound (shared.js playLazyVideoWithAudio). Their figure is
// data-audio-managed so shared.js never autoplays them.
const MEDIA_JS = `
    (function () {
      var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      var conn = navigator.connection || navigator.webkitConnection;
      var lite = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
      var local = function (v) {
        v.addEventListener('error', function () {
          var src = v.currentSrc || v.getAttribute('src') || '';
          if (/^https?:/.test(src) && src.indexOf(location.origin) !== 0 && !v.dataset.arLocal) { v.dataset.arLocal = '1'; v.src = v.dataset.arSrc; v.load(); }
        });
      };
      var load = function (v) {
        if (v.getAttribute('src')) return;
        v.dataset.videoSrc = v.dataset.arSrc;
        if (window.ensureLazyVideoSource) window.ensureLazyVideoSource(v);
        else { v.src = v.dataset.arSrc; v.load(); }
      };
      var loops = [].slice.call(document.querySelectorAll('.ar-media.--loop video[data-ar-src]'));
      var start = function (v) { load(v); var p = v.play(); if (p && p.catch) p.catch(function () {}); };
      var arm = function () {
        loops.forEach(function (v) {
          local(v);
          if (!('IntersectionObserver' in window)) { start(v); return; }
          new IntersectionObserver(function (ents) {
            ents.forEach(function (en) { if (en.isIntersecting) start(v); else if (!v.paused) v.pause(); });
          }, { threshold: 0.25 }).observe(v);
        });
      };
      if (loops.length && !reduce && !lite) {
        var defer = function () { if ('requestIdleCallback' in window) requestIdleCallback(arm, { timeout: 2500 }); else setTimeout(arm, 1200); };
        if (document.readyState === 'complete') defer(); else addEventListener('load', defer, { once: true });
      }
      [].slice.call(document.querySelectorAll('.ar-play')).forEach(function (btn) {
        var fig = btn.closest('.ar-media'); var v = fig && fig.querySelector('video');
        if (!v) return;
        local(v);
        var stop = function () { fig.classList.remove('is-playing'); v.controls = false; };
        btn.addEventListener('click', function () {
          fig.classList.add('is-playing'); v.controls = true;
          load(v);
          var go = window.playLazyVideoWithAudio
            ? window.playLazyVideoWithAudio(v, 0.9)
            : (function () { v.muted = false; return v.play(); })();
          if (go && go.then) go.then(function (ok) { if (ok === false) stop(); }, stop);
          v.focus({ preventScroll: true });
        });
        v.addEventListener('ended', stop);
      });
    })();
`;

// ---------- validation / lint ----------
const DASH_RE = /[\u2013\u2014]|&mdash;|&ndash;|&#821[12];|&#x201[34];/i;

function checker() {
  const errs = [];
  const str = (v, k) => { if (typeof v !== 'string' || !v.trim()) errs.push(`${k} must be a non-empty string`); };
  const arr = (v, k) => { if (!Array.isArray(v)) { errs.push(`${k} must be an array`); return []; } return v; };
  const obj = (v, k) => { if (!v || typeof v !== 'object' || Array.isArray(v)) { errs.push(`${k} must be an object`); return {}; } return v; };
  return { errs, str, arr, obj };
}

function validateArea(c) {
  const { errs, str, arr, obj } = checker();
  ['areaName', 'metaTitle', 'metaDescription', 'eyebrow', 'h1', 'answer', 'pricingHtml'].forEach((k) => str(c[k], k));
  const card = obj(c.card, 'card'); str(card.insight, 'card.insight'); str(card.proofLine, 'card.proofLine');
  const m = obj(c.heroMedia, 'heroMedia');
  if (!['loop', 'testimonial', 'graphic'].includes(m.type)) errs.push('heroMedia.type must be loop|testimonial|graphic');
  ['alt', 'kicker', 'tag'].forEach((k) => str(m[k], `heroMedia.${k}`));
  if (m.type === 'loop' || m.type === 'testimonial') {
    ['video', 'poster'].forEach((k) => str(m[k], `heroMedia.${k}`));
    if (!Number.isFinite(m.width) || !Number.isFinite(m.height)) errs.push('heroMedia.width/height must be numbers');
  }
  if (m.type === 'testimonial') str(m.play, 'heroMedia.play');
  if (m.type === 'graphic') {
    const g = obj(m.graphic, 'heroMedia.graphic');
    ['handle', 'big', 'bigLabel', 'asOf'].forEach((k) => str(g[k], `heroMedia.graphic.${k}`));
    arr(g.rows, 'heroMedia.graphic.rows').forEach((r, i) => { str(r && r.value, `heroMedia.graphic.rows[${i}].value`); str(r && r.label, `heroMedia.graphic.rows[${i}].label`); });
  }
  const s = obj(c.snapshot, 'snapshot'); str(s.h2, 'snapshot.h2');
  arr(s.facts, 'snapshot.facts').forEach((f, i) => { str(f && f.label, `snapshot.facts[${i}].label`); str(f && f.value, `snapshot.facts[${i}].value`); });
  arr(s.paragraphsHtml, 'snapshot.paragraphsHtml').forEach((p, i) => str(p, `snapshot.paragraphsHtml[${i}]`));
  const p = obj(c.proof, 'proof');
  ['h2', 'case', 'relation', 'client', 'where', 'service', 'stat', 'statLabel', 'bodyHtml'].forEach((k) => str(p[k], `proof.${k}`));
  if (p.case && !CASE_SLUGS.includes(p.case)) errs.push(`proof.case "${p.case}" is not a known case study (${CASE_SLUGS.join(', ')})`);
  if (p.chips !== undefined) arr(p.chips, 'proof.chips').forEach((x, i) => str(x, `proof.chips[${i}]`));
  const st = obj(c.steps, 'steps'); str(st.h2, 'steps.h2');
  arr(st.items, 'steps.items').forEach((it, i) => { str(it && it.title, `steps.items[${i}].title`); str(it && it.bodyHtml, `steps.items[${i}].bodyHtml`); });
  arr(c.faqs, 'faqs').forEach((f, i) => { str(f && f.q, `faqs[${i}].q`); str(f && f.a, `faqs[${i}].a`); });
  arr(c.nearby, 'nearby').forEach((x, i) => str(x, `nearby[${i}]`));
  const ct = obj(c.cta, 'cta'); ['h2', 'body', 'button'].forEach((k) => str(ct[k], `cta.${k}`));
  return errs;
}

function validateHub(h) {
  const { errs, str, arr, obj } = checker();
  ['metaTitle', 'metaDescription', 'eyebrow', 'h1', 'answer', 'listH2', 'listSub'].forEach((k) => str(h[k], k));
  const g = obj(h.glance, 'glance'); str(g.title, 'glance.title'); str(g.note, 'glance.note');
  const nCols = arr(g.cols, 'glance.cols').length;
  if (nCols < 2 || nCols > 3) errs.push('glance.cols must have 2 or 3 headings');
  arr(g.rows, 'glance.rows').forEach((r, i) => {
    str(r && r.service, `glance.rows[${i}].service`);
    if (!r || !Array.isArray(r.cells) || r.cells.length !== nCols - 1) errs.push(`glance.rows[${i}].cells must have ${nCols - 1} entries`);
    else r.cells.forEach((x, j) => str(x, `glance.rows[${i}].cells[${j}]`));
  });
  if (h.remote !== undefined) {
    const rm = obj(h.remote, 'remote'); str(rm.label, 'remote.label'); str(rm.h2, 'remote.h2');
    arr(rm.items, 'remote.items').forEach((it, i) => { str(it && it.title, `remote.items[${i}].title`); str(it && it.bodyHtml, `remote.items[${i}].bodyHtml`); });
  }
  const w = obj(h.work, 'work'); str(w.label, 'work.label'); str(w.h2, 'work.h2');
  arr(w.items, 'work.items').forEach((s, i) => {
    ['case', 'name', 'where', 'service', 'line'].forEach((k) => str(s && s[k], `work.items[${i}].${k}`));
    if (s && s.case && !CASE_SLUGS.includes(s.case)) errs.push(`work.items[${i}].case "${s.case}" is not a known case study`);
  });
  arr(h.faqs, 'faqs').forEach((f, i) => { str(f && f.q, `faqs[${i}].q`); str(f && f.a, `faqs[${i}].a`); });
  const ct = obj(h.cta, 'cta'); ['h2', 'body', 'button'].forEach((k) => str(ct[k], `cta.${k}`));
  return errs;
}

function validateShape(c, file) {
  const errs = [];
  const expect = path.basename(file).match(/^([a-z0-9-]+)\.(en|es)\.json$/);
  if (!expect) errs.push('file name must be {id}.{en|es}.json');
  else if (c.id !== expect[1] || c.lang !== expect[2]) errs.push(`id/lang (${c.id}/${c.lang}) do not match the file name`);
  if (!['en', 'es'].includes(c.lang)) errs.push('lang must be "en" or "es"');
  if (c.id === 'hub') errs.push(...validateHub(c));
  else {
    if (!AREA_IDS.includes(c.id)) errs.push(`id "${c.id}" is not one of ${AREA_IDS.join(', ')}`);
    errs.push(...validateArea(c));
  }
  return errs;
}

// Non-fatal content checks (SPEC.md rules). Reported as warnings, or thrown in strict mode.
function lint(c, root) {
  const warn = [];
  const checkHref = (href, k) => {
    if (/^(tel:|mailto:)/.test(href)) return;
    const clean = href.replace(/#.*$/, '');
    if (!ALLOWED_PATHS.has(clean)) warn.push(`${k}: link ${href} is not in the URL list`);
    if ((c.lang === 'es') !== clean.startsWith('/es/')) warn.push(`${k}: link ${href} points at the wrong language`);
  };
  const walk = (v, k) => {
    if (typeof v === 'string') {
      if (DASH_RE.test(v)) warn.push(`${k}: contains an em/en dash`);
      if (/Html$|Html\[\d+\]$/.test(k)) {
        const bad = (v.match(/<\/?([a-z0-9]+)/gi) || []).map((t) => t.replace(/[</]/g, '').toLowerCase()).filter((t) => !['a', 'strong', 'em'].includes(t));
        if (bad.length) warn.push(`${k}: tags other than <a>, <strong>, <em>: ${[...new Set(bad)].join(', ')}`);
      }
      for (const href of [...v.matchAll(/href="([^"]*)"/g)].map((x) => x[1])) checkHref(href, k);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${k}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => walk(vv, k ? `${k}.${kk}` : kk));
  };
  walk(c, '');
  const words = (s) => stripTags(s).split(/\s+/).filter(Boolean).length;
  if (words(c.answer) > 30) warn.push(`answer is ${words(c.answer)} words (max 30)`);
  const md = (c.metaDescription || '').length;
  if (md < 140 || md > 160) warn.push(`metaDescription is ${md} chars (want 140-160)`);
  if ((c.metaTitle || '').length > 60) warn.push(`metaTitle is ${(c.metaTitle || '').length} chars (want <= 60)`);
  if (!/\| Button Up Media$/.test(c.metaTitle || '')) warn.push('metaTitle should end with "| Button Up Media"');
  const wantBtn = c.lang === 'es' ? 'Agende una llamada estratégica gratis' : 'Book a free strategy call';
  if (c.cta && c.cta.button !== wantBtn) warn.push(`cta.button should be "${wantBtn}"`);
  if (c.id === 'hub') return warn;
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  if (n(c.snapshot && c.snapshot.facts) !== 3) warn.push(`snapshot.facts has ${n(c.snapshot && c.snapshot.facts)} items (want 3)`);
  if (n(c.snapshot && c.snapshot.paragraphsHtml) !== 2) warn.push(`snapshot.paragraphsHtml has ${n(c.snapshot && c.snapshot.paragraphsHtml)} items (want 2)`);
  if (n(c.steps && c.steps.items) !== 3) warn.push(`steps.items has ${n(c.steps && c.steps.items)} items (want 3)`);
  if (n(c.faqs) < 3 || n(c.faqs) > 4) warn.push(`faqs has ${n(c.faqs)} questions (want 3-4)`);
  if (n(c.nearby) !== 2) warn.push(`nearby has ${n(c.nearby)} areas (want 2)`);
  if (words(c.card && c.card.insight) > 24) warn.push(`card.insight is ${words(c.card.insight)} words (want a 2-line insight, <= 24)`);
  const m = c.heroMedia || {};
  for (const k of ['video', 'poster']) {
    if (m[k] && !existsSync(path.join(root, m[k]))) warn.push(`heroMedia.${k} ${m[k]} does not exist in the repo`);
    if (m[k] && !/^\/(videos|media|images)\//.test(m[k])) warn.push(`heroMedia.${k} must be an absolute /videos, /media or /images path`);
  }
  if (m.poster === '/media/bts-shoot-optimized.avif') warn.push('heroMedia.poster: do not reuse the round-1 team photo as a hero');
  return warn;
}

// ---------- rendering helpers ----------
const note = (o) => (o && typeof o.reviewNote === 'string' && o.reviewNote.trim()
  ? `<aside class="review-note">${/^review:/i.test(o.reviewNote.trim()) ? '' : 'Review: '}${esc(o.reviewNote.trim())}</aside>`
  : '');
const shortOf = (c) => c.shortName || c.areaName;

function highlightArea(h1, areaName) {
  const e = esc(h1);
  const a = esc(areaName);
  const i = e.lastIndexOf(a);
  return i < 0 ? e : `${e.slice(0, i)}<span class="ar-gold">${a}</span>${e.slice(i + a.length)}`;
}

// Map labels that may wrap on phones: keep the last two words together so a
// three-word name breaks as "Toni's / Sushi Bar", never one word per line.
function wrapLabel(text, wrap) {
  const words = String(text).split(' ');
  if (!wrap || words.length < 3) return esc(text);
  return esc(words.slice(0, -2).join(' ')) + ' ' + esc(words.slice(-2).join('\u00a0')).replace(/\u00a0/g, '&nbsp;');
}

function alternatesFor(enUrl, esUrl, enAvail, esAvail) {
  return [
    enAvail ? `<link rel="alternate" hreflang="en" href="${enUrl}" />` : '',
    esAvail ? `<link rel="alternate" hreflang="es" href="${esUrl}" />` : '',
    `<link rel="alternate" hreflang="x-default" href="${enAvail ? enUrl : esUrl}" />`,
  ].filter(Boolean).join('\n  ');
}

function renderHead({ c, t, chrome, url, alternates, hasAlt, schema, css, preload = '' }) {
  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${chrome.consent}
  ${chrome.gtm}
  <title>${esc(c.metaTitle)}</title>
  <meta name="description" content="${escAttr(c.metaDescription)}" />
  <link rel="icon" type="image/svg+xml" href="/favicon-bum.svg" />
  <link rel="canonical" href="${url}" />
  ${alternates}
  <meta name="theme-color" content="#0b0d10" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="${t.ogLocale}" />
  ${hasAlt ? `<meta property="og:locale:alternate" content="${t.ogLocaleAlt}" />` : ''}
  <meta property="og:title" content="${escAttr(c.metaTitle)}" />
  <meta property="og:description" content="${escAttr(c.metaDescription)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(c.metaTitle)}" />
  <meta name="twitter:description" content="${escAttr(c.metaDescription)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  ${chrome.fonts}
  ${preload}
  <link rel="stylesheet" href="/shared.css?v=${chrome.cssVer}" />
  <script type="application/ld+json">
${ldJson(schema)}
  </script>
  <style>${css}  </style>
</head>`;
}

function renderCta(cta, t, extra = '') {
  return `<div class="cta-banner ar-cta ar-rise">
          <div class="cta-content">
            <div class="ar-host"><img src="${HOST_IMG.src}" alt="${escAttr(t.hostAlt)}" width="${HOST_IMG.width}" height="${HOST_IMG.height}" loading="lazy" decoding="async" /><span>${esc(t.host)}</span></div>
            <h2>${esc(cta.h2)}</h2>
            <p>${esc(cta.body)}</p>
          </div>
          <div class="cta-actions">
            <a href="${t.contact}" class="btn btn-primary ar-btn">${esc(cta.button)} ${I.arrow}</a>
            <a href="tel:${PHONE}" class="btn ar-btn">${esc(t.call)}</a>
          </div>
        </div>${extra}`;
}

// <div.ar-media> (grid item, may hold a review note) > <figure.ar-media-frame>
// with the clip or card and one <figcaption> as its last child. A testimonial's
// play button sits in the caption stack so it never covers a face or the text.
function renderMedia(m, t) {
  const capText = `<span class="ar-media-kicker">${esc(m.kicker)}</span><span class="ar-media-tag">${esc(m.tag)}</span>`;
  const focus = m.focus ? ` style="--focus: ${escAttr(m.focus)}"` : '';
  if (m.type === 'graphic') {
    const g = m.graphic;
    return `<div class="ar-media --graphic">
            <figure class="ar-media-frame">
              <div class="ar-ig">
                <p class="ar-ig-handle">${I.ig}${esc(g.handle)}</p>
                ${g.hook ? `<p class="ar-ig-hook"><span>${esc(g.hookLabel || '')}</span><q>${esc(g.hook)}</q></p>` : ''}
                <p class="ar-ig-big"><strong>${esc(g.big)}</strong><span>${esc(g.bigLabel)}</span></p>
                <dl class="ar-ig-rows">
                  ${g.rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('\n                  ')}
                </dl>
                <p class="ar-ig-asof">${esc(g.asOf)}</p>
              </div>
              <figcaption class="ar-media-cap">${capText}</figcaption>
            </figure>
            ${note(m)}
          </div>`;
  }
  if (m.type === 'testimonial') {
    return `<div class="ar-media --talk" data-audio-managed="true">
            <figure class="ar-media-frame">
              <video class="ar-media-el" data-ar-src="${escAttr(m.video)}" poster="${escAttr(m.poster)}" width="${m.width}" height="${m.height}" playsinline preload="none" aria-label="${escAttr(m.alt)}"${focus}></video>
              <div class="ar-media-shade" aria-hidden="true"></div>
              <figcaption class="ar-media-cap"><button type="button" class="ar-play"><span class="ar-play-ic">${I.play}</span><span>${esc(m.play)}</span></button>${capText}</figcaption>
            </figure>
            ${note(m)}
          </div>`;
  }
  return `<div class="ar-media --loop">
            <figure class="ar-media-frame">
              <video class="ar-media-el" data-ar-src="${escAttr(m.video)}" poster="${escAttr(m.poster)}" width="${m.width}" height="${m.height}" muted loop playsinline preload="none" aria-label="${escAttr(m.alt)}"${focus}></video>
              <div class="ar-media-shade" aria-hidden="true"></div>
              <figcaption class="ar-media-cap">${capText}</figcaption>
            </figure>
            ${note(m)}
          </div>`;
}

const sec = (cls, id, inner) => `    <section class="${cls} ar-sec"${id ? ` id="${id}"` : ''}>
      <div class="ar-wrap">
${inner}
      </div>
    </section>`;

// ---------- area brief ----------
function renderArea(c, chrome, available) {
  const t = T[c.lang];
  const url = areaUrl(c.id, c.lang);
  const enAvail = available.has(`${c.id}.en`);
  const esAvail = available.has(`${c.id}.es`);
  const short = shortOf(c);
  const m = c.heroMedia;
  const hasHub = available.has(`hub.${c.lang}`);

  const facts = c.snapshot.facts.map((f) => `<div class="ar-fact"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('\n            ');
  const p = c.proof;
  const chips = (p.chips || []).length ? `<ul class="ar-chips">${p.chips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const steps = c.steps.items.map((it, i) => `<li class="ar-step ar-rise">
            <span class="ar-step-n" aria-hidden="true">${i + 1}</span>
            <div>
              <h3><span class="ar-sr">${esc(t.stepAria(i + 1))}: </span>${esc(it.title)}</h3>
              <p class="ar-rich">${it.bodyHtml}</p>
              ${note(it)}
            </div>
          </li>`).join('\n          ');
  const faqs = c.faqs.map((f) => `<details>
            <summary><h3>${esc(f.q)}</h3><span class="ar-faq-ic">${I.plus}</span></summary>
            <div class="ar-faq-a"><p>${esc(f.a)}</p></div>
          </details>`).join('\n          ');

  const others = [
    `<li><a class="--hub" href="${hubPath(c.lang)}">${I.route}${esc(t.allAreas)}</a></li>`,
    ...(c.nearby || [])
      .filter((id) => id !== c.id && available.has(`${id}.${c.lang}`))
      .slice(0, 2)
      .map((id) => `<li><a href="${areaPath(id, c.lang)}"><span class="ar-dot" aria-hidden="true"></span>${esc(shortOf(available.get(`${id}.${c.lang}`)))}</a></li>`),
  ];

  const crumbs = [
    { '@type': 'ListItem', position: 1, name: t.home, item: t.homeUrl },
    ...(hasHub ? [{ '@type': 'ListItem', position: 2, name: t.hubName, item: hubUrl(c.lang) }] : []),
  ];
  crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: c.h1, item: url });
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: crumbs },
      { '@type': ['Organization', 'ProfessionalService'], '@id': ORG_ID, name: 'Button Up Media', url: `${BASE}/` },
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        name: c.h1,
        serviceType: t.serviceType,
        description: c.answer,
        url,
        areaServed: { '@type': 'Place', name: c.areaName },
        provider: { '@id': ORG_ID },
      },
      c.faqs.length ? {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: c.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      } : null,
    ].filter(Boolean),
  };

  const poster = m.poster ? `<link rel="preload" as="image" href="${escAttr(m.poster)}"${/\.avif$/.test(m.poster) ? ' type="image/avif"' : /\.webp$/.test(m.poster) ? ' type="image/webp"' : ''} fetchpriority="high" />` : '';
  const head = renderHead({
    c, t, chrome, url,
    alternates: alternatesFor(areaUrl(c.id, 'en'), areaUrl(c.id, 'es'), enAvail, esAvail),
    hasAlt: c.lang === 'en' ? esAvail : enAvail,
    schema, css: BASE_CSS + AREA_FAQ_CSS + AREA_CSS + '\n    .ar-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }\n', preload: poster,
  });

  return `${head}
<body>
  ${chrome.gtmNoscript}

  ${chrome.depth}

  ${chrome.nav}

  <main class="page">

    <!-- HERO: neighborhood brief -->
    <section class="lib-section ar-hero">
      <div class="ar-wrap">
        <div class="ar-hero-grid">
          <div class="ar-hero-copy">
            <nav class="ar-route" aria-label="${escAttr(t.breadcrumbAria)}">
              <ol>
                <li><a href="${hubPath(c.lang)}"><span class="ar-dot" aria-hidden="true"></span>${esc(t.hubName)}</a></li>
                <li aria-current="page"><span class="ar-dot --fill" aria-hidden="true"></span>${esc(c.eyebrow)}</li>
              </ol>
            </nav>
            <h1>${highlightArea(c.h1, c.areaName)}</h1>
            <p class="ar-lede">${esc(c.answer)}</p>
            <div class="ar-ctas">
              <a href="${t.contact}" class="btn btn-primary ar-btn">${esc(t.primary)} ${I.arrow}</a>
              <a href="${t.grader}" class="btn ar-btn">${esc(t.graderBtn)}</a>
            </div>
            <ul class="ar-trust">
              ${t.trust.map((x) => `<li>${I.check}${esc(x)}</li>`).join('\n              ')}
            </ul>
          </div>
          ${renderMedia(m, t)}
        </div>
      </div>
    </section>

    <!-- SNAPSHOT -->
${sec('card-overlay --dark lib-section', 'snapshot', `        <p class="ar-label">${esc(t.label.snapshot)}</p>
        <h2 class="ar-h2">${esc(c.snapshot.h2)}</h2>
        <dl class="ar-facts ar-rise">
            ${facts}
        </dl>
        <div class="ar-snap-text ar-rich ar-rise">
          ${c.snapshot.paragraphsHtml.map((x) => `<p>${x}</p>`).join('\n          ')}
        </div>
        ${note(c.snapshot)}`)}

    <!-- PROOF NEARBY -->
${sec('lib-section --lap', 'proof', `        <p class="ar-label">${esc(t.label.proof)}</p>
        <h2 class="ar-h2">${esc(p.h2)}</h2>
        <article class="ar-proof ar-rise">
          <div class="ar-proof-stat"><strong>${esc(p.stat)}</strong><span>${esc(p.statLabel)}</span></div>
          <div class="ar-proof-body">
            <p class="ar-rel">${I.pin}${esc(p.relation)}</p>
            <h3>${esc(p.client)}</h3>
            <p class="ar-proof-meta">${esc(p.where)} · ${esc(p.service)}</p>
            <p class="ar-proof-text ar-rich">${p.bodyHtml}</p>
            ${chips}
            ${note(p)}
            <a class="btn ar-btn" href="${casePath(p.case, c.lang)}">${esc(t.caseLink(p.client))} ${I.arrow}</a>
          </div>
        </article>`)}

    <!-- WHAT WE'D DO FIRST + PRICE -->
${sec('card-overlay --dark lib-section', 'first-steps', `        <p class="ar-label">${esc(t.label.plan)}</p>
        <h2 class="ar-h2">${esc(c.steps.h2)}</h2>
        <ol class="ar-steps">
          ${steps}
        </ol>
        <div class="ar-price ar-rise">${I.tag}<p class="ar-rich"><b>${esc(t.priceKey)}</b>${c.pricingHtml}</p></div>`)}

    <!-- FAQ -->
${sec('lib-section', 'faq', `        <p class="ar-label">${esc(t.label.faq)}</p>
        <h2 class="ar-h2">${esc(c.faqH2 || t.faqH2(short))}</h2>
        <div class="ar-faq ar-rise">
          ${faqs}
        </div>`)}

    <!-- CTA + OTHER AREAS -->
${sec('lib-section --end', 'book', `        ${renderCta(c.cta, t, `
        <nav class="ar-others ar-rise" aria-label="${escAttr(t.othersAria)}">
          <p class="ar-others-label">${esc(t.label.others)}</p>
          <ul>
            ${others.join('\n            ')}
          </ul>
        </nav>`)}`)}

    <!-- FOOTER -->
    ${chrome.footer}
  </main>

  <script>${REVEAL_JS}${MEDIA_JS}  </script>
  <script src="/shared.js?v=${chrome.jsVer}" defer></script>
</body>
</html>
`;
}

// ---------- hub ----------
function renderHub(h, chrome, available) {
  const t = T[h.lang];
  const url = hubUrl(h.lang);
  const areas = AREA_IDS.filter((id) => available.has(`${id}.${h.lang}`)).map((id) => available.get(`${id}.${h.lang}`));
  const g = h.glance;

  const glance = `<figure class="ar-glance ar-rise">
          <figcaption class="ar-glance-title">${esc(g.title)}</figcaption>
          <table class="ar-gl">
            <thead><tr>${g.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>
              ${g.rows.map((r) => `<tr><th scope="row">${esc(r.service)}</th>${r.cells.map((x) => `<td>${I.check}${esc(x)}</td>`).join('')}</tr>`).join('\n              ')}
            </tbody>
          </table>
          <p class="ar-glance-note">${esc(g.note)}</p>
        </figure>`;

  const cards = areas.map((a) => `<a class="ar-acard ar-rise" id="area-${a.id}" href="${areaPath(a.id, h.lang)}">
            <p class="ar-ac-where">${esc(a.eyebrow)}</p>
            <h3>${esc(shortOf(a))}</h3>
            <p class="ar-ac-insight">${esc(a.card.insight)}</p>
            <ul class="ar-ac-rows">
              <li>${I.pin}<span><b>${esc(t.nearest)}</b>${esc(a.card.proofLine)}</span></li>
            </ul>
            <span class="ar-ac-links"><span class="ar-ac-link">${esc(t.readBrief(shortOf(a)))} ${I.arrow}</span></span>
          </a>`).join('\n          ');

  const modeIcons = [I.camera, I.globe];
  const modes = (h.remote ? h.remote.items : []).map((it, i) => `<article class="ar-mode ar-rise">
            <span class="ar-mode-ic">${modeIcons[i % modeIcons.length]}</span>
            <h3>${esc(it.title)}</h3>
            <p class="ar-rich">${it.bodyHtml}</p>
          </article>`).join('\n          ');

  const work = h.work.items.map((w) => `<li><a href="${casePath(w.case, h.lang)}">
            <span class="ar-work-name">${esc(w.name)}</span>
            <span class="ar-work-meta">${esc(w.where)} · ${esc(w.service)}</span>
            <span class="ar-work-line">${esc(w.line)}</span>
            <span class="ar-work-go" aria-hidden="true">${I.arrow}</span>
          </a></li>`).join('\n          ');

  const faqs = (h.faqs || []).map((f) => `<details>
            <summary><h3>${esc(f.q)}</h3><span class="ar-faq-ic">${I.plus}</span></summary>
            <div class="ar-faq-a"><p>${esc(f.a)}</p></div>
          </details>`).join('\n          ');

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t.home, item: t.homeUrl },
          { '@type': 'ListItem', position: 2, name: t.hubName, item: url },
        ],
      },
      { '@type': ['Organization', 'ProfessionalService'], '@id': ORG_ID, name: 'Button Up Media', url: `${BASE}/` },
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        url,
        name: h.h1,
        description: h.answer,
        inLanguage: h.lang,
        publisher: { '@id': ORG_ID },
        mainEntity: { '@id': `${url}#areas` },
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#areas`,
        name: h.listH2,
        numberOfItems: areas.length,
        itemListElement: areas.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.h1, url: areaUrl(a.id, h.lang) })),
      },
      (h.faqs || []).length ? {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: h.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      } : null,
    ].filter(Boolean),
  };

  const head = renderHead({
    c: h, t, chrome, url,
    alternates: alternatesFor(hubUrl('en'), hubUrl('es'), available.has('hub.en'), available.has('hub.es')),
    hasAlt: available.has(h.lang === 'en' ? 'hub.es' : 'hub.en'),
    schema, css: BASE_CSS + AREA_FAQ_CSS + HUB_CSS,
  });

  return `${head}
<body>
  ${chrome.gtmNoscript}

  ${chrome.depth}

  ${chrome.nav}

  <main class="page">

    <!-- HERO + WHAT WE OFFER WHERE -->
    <section class="lib-section ar-hub-hero">
      <div class="ar-wrap ar-hub-grid">
        <div class="ar-hub-copy">
          <p class="ar-label">${esc(h.eyebrow)}</p>
          <h1>${esc(h.h1)}</h1>
          <p class="ar-lede">${esc(h.answer)}</p>
          <div class="ar-ctas">
            <a href="${t.contact}" class="btn btn-primary ar-btn">${esc(t.primary)} ${I.arrow}</a>
            <a href="${t.grader}" class="btn ar-btn">${esc(t.graderBtn)}</a>
          </div>
          <ul class="ar-trust">
            ${t.trust.map((x) => `<li>${I.check}${esc(x)}</li>`).join('\n            ')}
          </ul>
        </div>
        ${glance}
      </div>
    </section>

    <!-- NEIGHBORHOOD PAGES -->
${sec('card-overlay --dark lib-section --lap', 'areas', `        <p class="ar-label">${esc(h.listLabel || h.eyebrow)}</p>
        <h2 class="ar-h2">${esc(h.listH2)}</h2>
        <p class="ar-sub">${esc(h.listSub)}</p>
        <div class="ar-acards">
          ${cards}
        </div>
        ${h.alsoHtml ? `<p class="ar-also ar-rich">${h.alsoHtml}</p>` : ''}`)}

${h.remote ? sec('lib-section', 'outside', `        <p class="ar-label">${esc(h.remote.label)}</p>
        <h2 class="ar-h2">${esc(h.remote.h2)}</h2>
        ${h.remote.sub ? `<p class="ar-sub">${esc(h.remote.sub)}</p>` : ''}
        <div class="ar-modes">
          ${modes}
        </div>`) : ''}

    <!-- CLIENT WORK BY LOCATION -->
${sec('card-overlay --dark lib-section --lap', 'work', `        <p class="ar-label">${esc(h.work.label)}</p>
        <h2 class="ar-h2">${esc(h.work.h2)}</h2>
        ${h.work.sub ? `<p class="ar-sub">${esc(h.work.sub)}</p>` : ''}
        <ul class="ar-work">
          ${work}
        </ul>`)}

    <!-- FAQ -->
${faqs ? sec('lib-section', 'faq', `        <p class="ar-label">${esc(t.label.faq)}</p>
        <h2 class="ar-h2">${esc(h.faqH2 || t.label.faq)}</h2>
        <div class="ar-faq ar-rise">
          ${faqs}
        </div>`) : ''}

    <!-- CTA -->
${sec('lib-section --end', 'book', `        ${renderCta(h.cta, t)}`)}

    <!-- FOOTER -->
    ${chrome.footer}
  </main>

  <script>${REVEAL_JS}  </script>
  <script src="/shared.js?v=${chrome.jsVer}" defer></script>
</body>
</html>
`;
}

function todayET() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Visible words in <main> minus the shared footer, scripts and review notes.
export function visibleWords(html) {
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0]
    .replace(/<footer[\s\S]*?<\/footer>/, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<template[\s\S]*?<\/template>/g, ' ')
    .replace(/<aside class="review-note">[\s\S]*?<\/aside>/g, ' ')
    .replace(/<span class="ar-sr">[\s\S]*?<\/span>/g, ' ')
    ;
  return stripTags(main).replace(/&[a-z]+;|&#\d+;/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ---------- entry point ----------
// buildAreas(root, outDir[, { strict }]) renders every valid areas/content/*.json
// (area briefs + the hub) and returns the sitemap <url> entries for the pages it
// wrote. Invalid files are skipped with a warning; lint issues (dashes, off-list
// links, meta lengths, word counts) are warnings unless strict is true, in which
// case they throw.
export async function buildAreas(root, outDir, { strict = false } = {}) {
  const contentDir = path.join(root, 'areas', 'content');
  let files = [];
  try {
    files = (await readdir(contentDir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') { console.warn('build-areas: no areas/content directory, skipping area pages'); return ''; }
    throw err;
  }

  const available = new Map();
  const problems = [];
  for (const f of files) {
    let c;
    try {
      c = JSON.parse(await readFile(path.join(contentDir, f), 'utf8'));
    } catch (err) {
      problems.push(`${f}: invalid JSON (${err.message}), skipped`);
      continue;
    }
    const errs = validateShape(c, f);
    if (errs.length) { problems.push(`${f}: skipped, ${errs.join('; ')}`); continue; }
    lint(c, root).forEach((w) => problems.push(`${f}: ${w}`));
    available.set(`${c.id}.${c.lang}`, c);
  }

  const chrome = await loadChrome(root);
  await mkdir(path.join(outDir, 'areas'), { recursive: true });
  await mkdir(path.join(outDir, 'areas-es'), { recursive: true });

  const lastmod = todayET();
  const entries = [];
  const written = [];
  const entry = (loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`;
  const emit = async (key, html, file, loc, wordRange) => {
    if (DASH_RE.test(html)) problems.push(`rendered ${key} contains an em/en dash`);
    const w = visibleWords(html);
    if (wordRange && (w < wordRange[0] || w > wordRange[1])) problems.push(`rendered ${key} has ${w} visible words (want ${wordRange[0]}-${wordRange[1]})`);
    await writeFile(file, html);
    entries.push(entry(loc));
    written.push(`${key} (${w} words)`);
  };

  for (const lang of ['en', 'es']) {
    const h = available.get(`hub.${lang}`);
    if (!h) continue;
    const file = lang === 'es' ? path.join(outDir, 'areas-es', 'index.html') : path.join(outDir, 'areas-we-serve.html');
    await emit(`hub.${lang}`, renderHub(h, chrome[lang], available), file, hubUrl(lang));
  }
  for (const lang of ['en', 'es']) {
    for (const id of AREA_IDS) {
      const c = available.get(`${id}.${lang}`);
      if (!c) continue;
      const dir = lang === 'es' ? 'areas-es' : 'areas';
      await emit(`${id}.${lang}`, renderArea(c, chrome[lang], available), path.join(outDir, dir, `${id}.html`), areaUrl(id, lang), [500, 700]);
    }
  }

  if (problems.length) {
    const msg = `build-areas:\n  ${problems.join('\n  ')}`;
    if (strict) throw new Error(msg);
    console.warn(msg);
  }
  console.log(`Built area pages: ${written.length} (${written.join(', ')})`);
  return entries.join('\n');
}
