// Area page generator for Button Up Media.
// Renders the "Restaurant marketing in {area}" service pages from JSON content:
//   EN  /restaurant-marketing-{id}          -> outDir/areas/{id}.html
//   ES  /es/marketing-restaurantes-{id}     -> outDir/areas-es/{id}.html
// and returns sitemap <url> entries for every page it rendered.
// Source of truth: areas/content/{id}.{en|es}.json (shape documented below).
// Page chrome (consent mode, GTM, fonts, lucide, nav, footer, shared.js) is read
// from about.html / about-es.html at build time, so these pages always match the
// live site; relative asset paths in that chrome are made absolute because area
// pages are served at clean and nested URLs.
//
// Content shape (keys ending in Html may contain <a>, <strong>, <em>; all other
// strings are plain text and get HTML-escaped):
// { id, lang, areaName, metaTitle, metaDescription, eyebrow, h1, answer, heroSub,
//   market: { h2, paragraphsHtml: [], facts?: [{ label, value }] },
//   needs: { h2, items: [{ title, body }] },
//   proof: { h2, items: [{ client, where, service, result, body, href }] },
//   plan: { h2, items: [{ service: social|web|ads|seo, title, bodyHtml }] },
//   shoots: { h2, body }, pricing: { h2, bodyHtml },
//   faqs: [{ q, a }], nearby: [areaId], cta: { h2, body, button } }
// Optional on proof/plan/needs items, facts, market, shoots and pricing:
//   "reviewNote": "what the owner must confirm"  -> renders an
//   <aside class="review-note"> next to that block (never in JSON-LD). Delete the
//   key before launch to remove the note.

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import path from 'path';

const BASE = 'https://www.buttonupmedia.com';
const ORG_ID = `${BASE}/#organization`;
const PHONE = '+17867409499';
const PHONE_DISPLAY = '(786) 740-9499';
const OG_IMAGE = `${BASE}/media/founders-duo.webp`;
const HERO_IMG = { src: '/media/bts-shoot-optimized.avif', width: 1080, height: 1440 };
const HOST_IMG = { src: '/media/author-juan.webp', width: 512, height: 512 };

export const areaPath = (id, lang) => (lang === 'es' ? `/es/marketing-restaurantes-${id}` : `/restaurant-marketing-${id}`);
export const areaUrl = (id, lang) => `${BASE}${areaPath(id, lang)}`;

// Internal URLs a content file may link to (SPEC.md URL list). Anything else is
// reported as a lint warning.
const ALLOWED_PATHS = new Set([
  '/socialmediamarketing', '/es/marketing-redes-sociales',
  '/restaurant-website-design', '/es/diseno-web-restaurantes',
  '/restaurant-advertising', '/es/publicidad-restaurantes',
  '/restaurant-seo', '/es/seo-restaurantes',
  '/case-studies', '/es/casos-de-exito',
  '/social-media-website-grader', '/es/analizador-redes-sociales-web',
  '/about', '/es/nosotros', '/contact', '/es/contacto', '/blog', '/es/blog',
]);
const AREA_IDS = ['miami-beach', 'brickell', 'wynwood', 'coral-gables', 'doral', 'fort-lauderdale'];
for (const id of AREA_IDS) { ALLOWED_PATHS.add(areaPath(id, 'en')); ALLOWED_PATHS.add(areaPath(id, 'es')); }

// When an area has no real proof of its own, show the closest relevant case study.
const FALLBACK_CASE = {
  wynwood: 'shimuja-ramen',
  'fort-lauderdale': 'shimuja-ramen',
  doral: 'the-fatty-crab',
  'miami-beach': 'tonis-sushi-bar',
  brickell: 'shimuja-ramen',
  'coral-gables': 'brewing-buddha',
};
const CASES = {
  'the-fatty-crab': {
    en: { client: 'The Fatty Crab', where: 'Doral', service: 'Organic social', result: '21M+ organic views', body: 'A Cajun seafood boil spot on NW 87th Ave. Organic Instagram and Facebook content built 110K+ followers at 6.5% engagement.' },
    es: { client: 'The Fatty Crab', where: 'Doral', service: 'Redes orgánicas', result: '21M+ vistas orgánicas', body: 'Un restaurante de mariscos cajún en la NW 87th Ave. El contenido orgánico en Instagram y Facebook sumó más de 110K seguidores con 6.5% de interacción.' },
  },
  'shimuja-ramen': {
    en: { client: 'Shimuja Ramen', where: 'Downtown Miami', service: 'Social media', result: '15.4M social views', body: 'A ramen shop that started in Southwest Ranches, ran pop-ups at Baby Jane in Brickell and in Sunset Harbour, and now serves at Julia & Henry\'s food hall.' },
    es: { client: 'Shimuja Ramen', where: 'Downtown Miami', service: 'Redes sociales', result: '15.4M de vistas en redes', body: 'Un ramen que nació en Southwest Ranches, hizo pop-ups en Baby Jane en Brickell y en Sunset Harbour, y hoy sirve en el food hall Julia & Henry\'s.' },
  },
  'tonis-sushi-bar': {
    en: { client: 'Toni\'s Sushi Bar', where: 'South Beach', service: 'Social media', result: 'Chef-led short video', body: 'A family-run sushi bar on Washington Ave since 1987, where the sushi chef is the on-camera star.' },
    es: { client: 'Toni\'s Sushi Bar', where: 'South Beach', service: 'Redes sociales', result: 'Videos cortos con el chef', body: 'Un sushi bar familiar en Washington Ave desde 1987, donde el chef de sushi es la estrella frente a la cámara.' },
  },
  'brewing-buddha': {
    en: { client: 'Brewing Buddha', where: 'Pinecrest', service: 'Organic social', result: '40M organic views', body: 'A quirky coffee shop and art space known for creative lattes. Their butter coffee video was a standout.' },
    es: { client: 'Brewing Buddha', where: 'Pinecrest', service: 'Redes orgánicas', result: '40M de vistas orgánicas', body: 'Una cafetería y galería de arte conocida por sus lattes creativos. Su video del butter coffee fue de los más vistos.' },
  },
  'rusty-pelican': {
    en: { client: 'Rusty Pelican Miami', where: 'Key Biscayne', service: 'Google Ads', result: '7:1 return on ad spend', body: 'A waterfront restaurant on Key Biscayne. In 2025, Google Ads drove 1,007 conversions at $18.95 each.' },
    es: { client: 'Rusty Pelican Miami', where: 'Key Biscayne', service: 'Google Ads', result: 'Retorno de 7 a 1', body: 'Un restaurante frente al agua en Key Biscayne. En 2025, Google Ads generó 1,007 conversiones a $18.95 cada una.' },
  },
};

const T = {
  en: {
    htmlLang: 'en', ogLocale: 'en_US', ogLocaleAlt: 'es_US',
    home: 'Home', homeUrl: `${BASE}/`, contact: '/contact', grader: '/social-media-website-grader', cases: '/case-studies',
    primary: 'Book a free strategy call', graderBtn: 'Get a free report card',
    trust: ['Restaurants, bars and cafes only', 'Bilingual: English and Spanish', '5.0 stars on Google'],
    photoAlt: 'The Button Up Media team filming a content shoot on location at a South Florida restaurant',
    photoTag: 'Our in-house crew on a shoot',
    eyebrow: { market: 'The neighborhood', needs: 'What works here', proof: 'Proof', plan: 'The plan', shoots: 'Shoots and meetings', pricing: 'Pricing', faq: 'FAQ' },
    proofSub: 'Across all our clients: 200M+ organic social views and 50+ restaurants served.',
    caseLink: (c) => `Read ${/^the\s/i.test(c) ? '' : 'the '}${c} case study`,
    closest: 'Closest case study',
    planLabel: { social: 'Social media & content', web: 'Website', ads: 'Google & Meta ads', seo: 'Local SEO & Google' },
    faqH2: 'Frequently asked questions',
    host: 'Juan Hernandez, our founder, hosts every strategy call himself.',
    hostAlt: 'Juan Hernandez, founder of Button Up Media',
    call: `Call ${PHONE_DISPLAY}`,
    nearby: 'Nearby areas we serve', nearbyAria: 'Nearby areas we serve',
    serviceType: 'Restaurant marketing',
  },
  es: {
    htmlLang: 'es', ogLocale: 'es_US', ogLocaleAlt: 'en_US',
    home: 'Inicio', homeUrl: `${BASE}/es`, contact: '/es/contacto', grader: '/es/analizador-redes-sociales-web', cases: '/es/casos-de-exito',
    primary: 'Agende una llamada estratégica gratis', graderBtn: 'Reciba su reporte gratis',
    trust: ['Solo restaurantes, bares y cafés', 'Equipo bilingüe: inglés y español', '5.0 estrellas en Google'],
    photoAlt: 'El equipo de Button Up Media grabando contenido en un restaurante del sur de la Florida',
    photoTag: 'Nuestro equipo grabando en locación',
    eyebrow: { market: 'El barrio', needs: 'Lo que funciona aquí', proof: 'Resultados', plan: 'El plan', shoots: 'Grabaciones y reuniones', pricing: 'Precios', faq: 'Preguntas' },
    proofSub: 'Entre todos nuestros clientes: más de 200M de vistas orgánicas en redes y más de 50 restaurantes atendidos.',
    caseLink: (c) => `Ver el caso de ${c}`,
    closest: 'El caso de éxito más cercano',
    planLabel: { social: 'Redes sociales y contenido', web: 'Página web', ads: 'Anuncios en Google y Meta', seo: 'SEO local y Google' },
    faqH2: 'Preguntas frecuentes',
    host: 'Juan Hernandez, nuestro fundador, atiende personalmente cada llamada de estrategia.',
    hostAlt: 'Juan Hernandez, fundador de Button Up Media',
    call: `Llame al ${PHONE_DISPLAY}`,
    nearby: 'Otras zonas cercanas que atendemos', nearbyAria: 'Otras zonas cercanas que atendemos',
    serviceType: 'Marketing para restaurantes',
  },
};

const PLAN_ICON = { social: 'camera', web: 'monitor-smartphone', ads: 'megaphone', seo: 'map-pin' };

// ---------- escaping ----------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// JSON-LD lives inside <script>; keep "</script>" and friends from closing it early.
const ldJson = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

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
    lucide: pick(/<script defer src="https:\/\/unpkg\.com\/lucide@[^"]+"><\/script>/, 'lucide script'),
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

// ---------- page CSS (one block, .ar- prefixed) ----------
const PAGE_CSS = `
    /* ============================================================
       Area pages ("Restaurant marketing in {area}"). Mobile-first;
       extends the shared.css dark system. Sections keep left/right
       padding untouched so even-numbered sections stay full-bleed.
       ============================================================ */
    .ar-wrap { width: min(calc(100% - 8px), var(--max)); margin: 0 auto; }
    .ar-eyebrow { display: inline-flex; align-items: center; gap: 9px; font-family: var(--font-display); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); }
    .ar-eyebrow::before { content: ""; width: 20px; height: 1px; background: var(--gold); opacity: 0.7; }
    .ar-gold { color: var(--gold); }
    .ar-rise { transform: translateY(18px); transition: transform .7s cubic-bezier(.22,1,.36,1); will-change: transform; }
    .ar-rise.is-in { transform: none; }
    @media (prefers-reduced-motion: reduce) { .ar-rise { transform: none; transition: none; } }

    main.page .ar-sec { --ar-pad: clamp(56px, 7.5vw, 100px); padding-top: var(--ar-pad); padding-bottom: var(--ar-pad); }
    /* a section followed by an overlay card gets extra room for the 40px overlap */
    main.page .ar-sec.--lap { padding-bottom: calc(var(--ar-pad) + 40px); }
    main.page .ar-sec.--end { padding-bottom: clamp(40px, 5vw, 64px); }
    main.page .card-overlay.ar-sec { margin-top: -40px; }
    .ar-h2 { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.035em; font-size: clamp(1.7rem, 4.4vw, 2.7rem); line-height: 1.08; margin-top: 12px; color: var(--text-head); max-width: 26ch; text-wrap: balance; }
    .ar-sec-head { max-width: 64ch; }
    .ar-sec-sub { margin-top: 14px; color: var(--text-dim); font-size: 1rem; line-height: 1.65; max-width: 60ch; }
    .ar-prose p { color: var(--text-dim); font-size: 1.03rem; line-height: 1.75; max-width: 66ch; }
    .ar-prose p + p { margin-top: 1em; }
    .ar-prose strong, .ar-card strong { color: var(--text); font-weight: 700; }
    .ar-prose a, .ar-card p a, .ar-panel p a { color: var(--gold); text-decoration: underline; text-decoration-color: rgba(226,168,77,0.4); text-underline-offset: 3px; transition: text-decoration-color .2s; }
    .ar-prose a:hover, .ar-card p a:hover, .ar-panel p a:hover { text-decoration-color: var(--gold); }
    .ar-btn.btn { height: auto; min-height: 44px; padding: 11px 20px; line-height: 1.25; text-align: center; }
    .ar-btn svg { width: 15px; height: 15px; flex: none; }

    /* ---------- HERO ---------- */
    main.page .ar-hero { padding-top: 132px; padding-bottom: calc(clamp(40px, 6vw, 72px) + 40px); }
    .ar-hero-grid { display: grid; grid-template-columns: 1fr; gap: 30px; align-items: center; }
    .ar-hero .ar-eyebrow svg { width: 13px; height: 13px; }
    .ar-hero h1 { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.045em; font-size: clamp(2.1rem, 5.6vw, 3.7rem); line-height: 1.02; margin-top: 14px; max-width: 17ch; text-wrap: balance; }
    .ar-lede { margin-top: 16px; max-width: 46ch; font-size: clamp(1.05rem, 2.3vw, 1.24rem); line-height: 1.55; font-weight: 500; color: var(--text); }
    .ar-hero-sub { margin-top: 10px; max-width: 52ch; font-size: clamp(0.95rem, 1.9vw, 1.03rem); line-height: 1.6; color: var(--text-dim); }
    .ar-hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
    .ar-hero-trust { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 22px; }
    .ar-hero-trust li { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 600; color: var(--text-soft); }
    .ar-hero-trust svg { width: 15px; height: 15px; color: var(--teal); flex: none; }
    .ar-hero-photo { position: relative; margin: 0; border-radius: var(--r-xl); overflow: hidden; border: 1px solid var(--line-soft); box-shadow: 0 30px 70px rgba(0,0,0,0.5); aspect-ratio: 16 / 11; background: var(--bg-2); }
    .ar-hero-photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 38%; display: block; }
    .ar-hero-photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 55%, rgba(8,8,8,0.6)); pointer-events: none; }
    .ar-photo-tag { position: absolute; left: 14px; bottom: 13px; z-index: 2; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: rgba(10,10,10,0.6); backdrop-filter: blur(8px); border: 1px solid var(--line); font-size: 0.72rem; font-weight: 600; color: var(--text); }
    .ar-photo-tag .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--teal); }

    /* ---------- MARKET ---------- */
    .ar-market-grid { display: grid; grid-template-columns: 1fr; gap: 28px; margin-top: 24px; }
    .ar-facts { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; align-content: start; }
    .ar-fact { padding: 15px 16px; border: 1px solid var(--line-soft); border-radius: var(--r-md); background: var(--surface); }
    .ar-fact span { display: block; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-soft); }
    .ar-fact strong { display: block; margin-top: 5px; font-family: var(--font-display); font-weight: 700; font-size: 0.98rem; line-height: 1.3; letter-spacing: -0.01em; color: var(--text-head); }

    /* ---------- CARDS (needs, plan) ---------- */
    .ar-grid { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 30px; }
    .ar-card { padding: 24px 22px; border: 1px solid var(--line-soft); border-radius: var(--r-lg); background: var(--surface); transition: transform .25s, border-color .25s; }
    .ar-card:hover { transform: translateY(-3px); border-color: rgba(226,168,77,0.28); }
    .ar-num { font-family: var(--font-hero); font-weight: 800; font-size: 0.86rem; color: var(--gold); letter-spacing: 0; }
    .ar-card h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.25; color: var(--text-head); margin: 10px 0 8px; }
    .ar-card p { font-size: 0.93rem; line-height: 1.62; color: var(--text-dim); }
    .ar-ic { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--gold-soft); border: 1px solid rgba(226,168,77,0.28); color: var(--gold); margin-bottom: 14px; }
    .ar-ic svg { width: 21px; height: 21px; }
    .ar-plan-label { display: block; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-soft); }
    .ar-plan h3 { margin-top: 6px; }

    /* ---------- PROOF ---------- */
    .ar-proof-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 30px; }
    .ar-proof-grid.--single { max-width: 640px; }
    .ar-proof { position: relative; display: flex; flex-direction: column; padding: 26px 24px 22px; border: 1px solid var(--line-soft); border-radius: var(--r-lg); background: linear-gradient(160deg, rgba(226,168,77,0.08), transparent 55%), var(--surface); transition: transform .25s, border-color .25s; }
    .ar-proof:hover { transform: translateY(-3px); border-color: rgba(226,168,77,0.3); }
    .ar-proof-kicker { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 12px; }
    .ar-proof-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
    .ar-tag { display: inline-flex; padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(226,168,77,0.3); background: var(--gold-soft); color: var(--gold); font-size: 0.66rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .ar-where { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; color: var(--text-soft); }
    .ar-where svg { width: 14px; height: 14px; }
    .ar-proof-result { margin-top: 18px; font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.55rem, 3.2vw, 2.1rem); letter-spacing: -0.03em; line-height: 1.08; color: var(--gold); }
    .ar-proof h3 { margin-top: 8px; font-family: var(--font-display); font-size: 1.12rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text-head); }
    .ar-proof-body { margin-top: 10px; font-size: 0.93rem; line-height: 1.62; color: var(--text-dim); }
    .ar-proof-link { margin-top: auto; padding-top: 18px; display: inline-flex; align-items: center; gap: 7px; font-size: 0.88rem; font-weight: 700; color: var(--text-head); transition: color .2s; }
    .ar-proof-link svg { width: 15px; height: 15px; color: var(--gold); transition: transform .2s; }
    .ar-proof-link:hover { color: var(--gold); }
    .ar-proof-link:hover svg { transform: translateX(3px); }

    /* ---------- SHOOTS + PRICING ---------- */
    .ar-duo { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .ar-panel { padding: clamp(26px, 3.4vw, 40px); border: 1px solid var(--line-soft); border-radius: var(--r-lg); background: var(--surface); }
    .ar-panel.--gold { border-color: rgba(226,168,77,0.24); background: linear-gradient(135deg, rgba(226,168,77,0.1), rgba(208,106,80,0.05)), var(--bg-2); }
    .ar-panel .ar-h2 { font-size: clamp(1.45rem, 3vw, 1.95rem); }
    .ar-panel p { margin-top: 14px; color: var(--text-dim); font-size: 0.98rem; line-height: 1.7; }
    .ar-panel strong { color: var(--text); }

    /* ---------- FAQ ---------- */
    .ar-faq { margin-top: 30px; max-width: 880px; border-top: 1px solid var(--line-soft); }
    .ar-faq details { border-bottom: 1px solid var(--line-soft); }
    .ar-faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 16px; padding: 22px 4px; }
    .ar-faq summary::-webkit-details-marker { display: none; }
    .ar-faq summary:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; border-radius: 8px; }
    .ar-faq-n { flex: none; min-width: 24px; font-family: var(--font-hero); font-weight: 800; font-size: 0.88rem; color: var(--gold); }
    .ar-faq summary h3 { flex: 1; font-family: var(--font-display); font-weight: 700; font-size: clamp(1.02rem, 2vw, 1.16rem); line-height: 1.35; letter-spacing: -0.01em; color: var(--text-head); }
    .ar-faq-ic { flex: none; width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(226,168,77,0.4); display: grid; place-items: center; color: var(--gold); transition: transform .3s, background .25s; }
    .ar-faq-ic svg { width: 15px; height: 15px; }
    .ar-faq details[open] .ar-faq-ic { transform: rotate(45deg); background: var(--gold-soft); }
    .ar-faq-a { padding: 0 4px 24px 44px; }
    .ar-faq-a p { color: var(--text-dim); font-size: 0.97rem; line-height: 1.7; max-width: 68ch; }

    /* ---------- FINAL CTA + NEARBY ---------- */
    .ar-cta.cta-banner { padding: clamp(30px, 5vw, 56px) clamp(20px, 5vw, 56px); }
    .ar-cta h2 { font-family: var(--font-display); font-size: clamp(1.45rem, 2.6vw, 1.95rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.12; margin-bottom: 8px; }
    .ar-cta .cta-content p { font-size: 0.95rem; line-height: 1.6; color: var(--text-dim); max-width: 54ch; }
    .ar-cta .cta-actions { flex-wrap: wrap; }
    .ar-host { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .ar-host img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(226,168,77,0.55); flex: none; }
    .ar-host span { font-size: 0.85rem; line-height: 1.4; color: var(--text-dim); text-align: left; }
    .ar-nearby { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 10px; margin-top: 28px; }
    .ar-nearby-label { width: 100%; text-align: center; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 2px; }
    .ar-nearby a { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line-soft); background: var(--surface); font-size: 0.84rem; font-weight: 600; color: var(--text-dim); transition: color .2s, border-color .2s; }
    .ar-nearby a svg { width: 13px; height: 13px; color: var(--gold); }
    .ar-nearby a:hover { color: var(--gold); border-color: rgba(226,168,77,0.3); }

    /* Owner review notes (stripped before launch) */
    .review-note { display: block; margin: 12px 0 0; padding: 10px 14px; border: 2px dashed #d4a64a; border-radius: 8px; font-size: 13px; line-height: 1.5; color: #f6f0e6; background: rgba(212,166,74,0.06); }

    /* ===================== PHONE ===================== */
    @media (max-width: 700px) {
      main.page .ar-hero { padding-top: 22px; }
    }
    @media (max-width: 719px) {
      main.page .card-overlay.ar-sec, main.page .card-overlay.ar-sec::after { border-radius: 36px 36px 0 0; }
    }
    @media (max-width: 600px) {
      .ar-faq summary { gap: 12px; padding: 18px 2px; }
      .ar-faq-a { padding-left: 2px; }
    }
    @media (max-width: 768px) {
      .ar-cta .cta-actions { width: 100%; }
      .ar-cta .cta-actions .btn { flex: 1 1 100%; }
    }
    @media (max-width: 900px) {
      .ar-host { justify-content: center; }
      .ar-cta .cta-content p { margin: 0 auto; }
    }

    /* ===================== TABLET / DESKTOP ===================== */
    @media (min-width: 720px) {
      .ar-wrap { width: min(calc(100% - 48px), var(--max)); }
      .ar-grid.--2, .ar-grid.--3, .ar-plan-grid { grid-template-columns: 1fr 1fr; }
      .ar-proof-grid.--multi { grid-template-columns: 1fr 1fr; }
    }
    @media (min-width: 900px) {
      .ar-market-grid { grid-template-columns: 1.35fr 0.65fr; gap: clamp(36px, 5vw, 64px); align-items: start; }
      .ar-facts { grid-template-columns: 1fr; }
      .ar-duo { grid-template-columns: 1fr 1fr; gap: 20px; }
    }
    @media (min-width: 960px) {
      .ar-hero-grid { grid-template-columns: 1.12fr 0.88fr; gap: clamp(36px, 5vw, 64px); }
      .ar-hero-photo { aspect-ratio: 4 / 5; }
    }
    @media (min-width: 1000px) {
      .ar-grid.--3 { grid-template-columns: repeat(3, 1fr); }
      .ar-proof-grid.--three { grid-template-columns: repeat(3, 1fr); }
    }
`;

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

// ---------- validation / lint ----------
const DASH_RE = /[\u2013\u2014]|&mdash;|&ndash;|&#821[12];|&#x201[34];/i;

function validateShape(c, file) {
  const errs = [];
  const str = (v, k) => { if (typeof v !== 'string' || !v.trim()) errs.push(`${k} must be a non-empty string`); };
  const arr = (v, k) => { if (!Array.isArray(v)) errs.push(`${k} must be an array`); return Array.isArray(v) ? v : []; };
  const obj = (v, k) => { if (!v || typeof v !== 'object' || Array.isArray(v)) { errs.push(`${k} must be an object`); return {}; } return v; };
  ['id', 'lang', 'areaName', 'metaTitle', 'metaDescription', 'eyebrow', 'h1', 'answer', 'heroSub'].forEach((k) => str(c[k], k));
  if (c.lang && !['en', 'es'].includes(c.lang)) errs.push('lang must be "en" or "es"');
  const m = obj(c.market, 'market'); str(m.h2, 'market.h2');
  arr(m.paragraphsHtml, 'market.paragraphsHtml').forEach((p, i) => str(p, `market.paragraphsHtml[${i}]`));
  if (m.facts !== undefined) arr(m.facts, 'market.facts').forEach((f, i) => { str(f && f.label, `market.facts[${i}].label`); str(f && f.value, `market.facts[${i}].value`); });
  const n = obj(c.needs, 'needs'); str(n.h2, 'needs.h2');
  arr(n.items, 'needs.items').forEach((it, i) => { str(it && it.title, `needs.items[${i}].title`); str(it && it.body, `needs.items[${i}].body`); });
  const p = obj(c.proof, 'proof'); str(p.h2, 'proof.h2');
  arr(p.items, 'proof.items').forEach((it, i) => ['client', 'where', 'service', 'result', 'body', 'href'].forEach((k) => str(it && it[k], `proof.items[${i}].${k}`)));
  const pl = obj(c.plan, 'plan'); str(pl.h2, 'plan.h2');
  arr(pl.items, 'plan.items').forEach((it, i) => {
    if (!it || !PLAN_ICON[it.service]) errs.push(`plan.items[${i}].service must be social|web|ads|seo`);
    str(it && it.title, `plan.items[${i}].title`); str(it && it.bodyHtml, `plan.items[${i}].bodyHtml`);
  });
  const s = obj(c.shoots, 'shoots'); str(s.h2, 'shoots.h2'); str(s.body, 'shoots.body');
  const pr = obj(c.pricing, 'pricing'); str(pr.h2, 'pricing.h2'); str(pr.bodyHtml, 'pricing.bodyHtml');
  arr(c.faqs, 'faqs').forEach((f, i) => { str(f && f.q, `faqs[${i}].q`); str(f && f.a, `faqs[${i}].a`); });
  arr(c.nearby, 'nearby').forEach((x, i) => str(x, `nearby[${i}]`));
  const ct = obj(c.cta, 'cta'); ['h2', 'body', 'button'].forEach((k) => str(ct[k], `cta.${k}`));
  const expect = path.basename(file).match(/^([a-z0-9-]+)\.(en|es)\.json$/);
  if (!expect) errs.push('file name must be {id}.{en|es}.json');
  else if (c.id !== expect[1] || c.lang !== expect[2]) errs.push(`id/lang (${c.id}/${c.lang}) do not match the file name`);
  return errs;
}

// Non-fatal content checks (SPEC.md rules). Reported as warnings, or thrown in strict mode.
function lint(c) {
  const warn = [];
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
  const checkHref = (href, k) => {
    if (/^(tel:|mailto:)/.test(href)) return;
    const clean = href.replace(/#.*$/, '');
    if (!ALLOWED_PATHS.has(clean)) warn.push(`${k}: link ${href} is not in the SPEC URL list`);
    const isEs = clean.startsWith('/es/');
    if ((c.lang === 'es') !== isEs) warn.push(`${k}: link ${href} points at the wrong language`);
  };
  walk(c, '');
  (c.proof && c.proof.items || []).forEach((it, i) => it && it.href && checkHref(it.href, `proof.items[${i}].href`));
  const words = (s) => stripTags(s).split(/\s+/).filter(Boolean).length;
  if (words(c.answer) > 30) warn.push(`answer is ${words(c.answer)} words (max 30)`);
  if ((c.metaDescription || '').length < 140 || (c.metaDescription || '').length > 160) warn.push(`metaDescription is ${(c.metaDescription || '').length} chars (want 140-160)`);
  if ((c.metaTitle || '').length > 60) warn.push(`metaTitle is ${(c.metaTitle || '').length} chars (want <= 60)`);
  if (!/\| Button Up Media$/.test(c.metaTitle || '')) warn.push('metaTitle should end with "| Button Up Media"');
  const faqN = (c.faqs || []).length;
  if (faqN < 4 || faqN > 6) warn.push(`faqs has ${faqN} questions (want 4-6)`);
  if ((c.nearby || []).length > 3) warn.push('nearby has more than 3 areas (only the first 3 render)');
  if (c.lang === 'es' && c.cta && c.cta.button !== 'Agende una llamada estratégica gratis') warn.push('cta.button should be "Agende una llamada estratégica gratis"');
  return warn;
}

// ---------- rendering helpers ----------
const note = (o) => (o && typeof o.reviewNote === 'string' && o.reviewNote.trim()
  ? `<aside class="review-note">${/^review:/i.test(o.reviewNote.trim()) ? '' : 'Review: '}${esc(o.reviewNote.trim())}</aside>`
  : '');
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const pad2 = (n) => String(n).padStart(2, '0');

function highlightArea(h1, areaName) {
  const e = esc(h1);
  const a = esc(areaName);
  const i = e.lastIndexOf(a);
  return i < 0 ? e : `${e.slice(0, i)}<span class="ar-gold">${a}</span>${e.slice(i + a.length)}`;
}

function proofCards(c, t) {
  let items = (c.proof.items || []).map((it) => ({ ...it, closest: false }));
  if (!items.length) {
    const key = FALLBACK_CASE[c.id] || 'shimuja-ramen';
    const fb = CASES[key] && CASES[key][c.lang];
    if (fb) items = [{ ...fb, href: `${t.cases}#${key}`, closest: true }];
  }
  const cls = items.length === 1 ? '--single' : items.length >= 3 ? '--multi --three' : '--multi';
  const cards = items.map((it) => `<article class="ar-proof ar-rise">
            ${it.closest ? `<p class="ar-proof-kicker">${esc(t.closest)}</p>` : ''}
            <div class="ar-proof-meta"><span class="ar-tag">${esc(it.service)}</span><span class="ar-where">${icon('map-pin')}${esc(it.where)}</span></div>
            <p class="ar-proof-result">${esc(it.result)}</p>
            <h3>${esc(it.client)}</h3>
            <p class="ar-proof-body">${esc(it.body)}</p>
            ${note(it)}
            <a class="ar-proof-link" href="${escAttr(it.href)}">${esc(t.caseLink(it.client))} ${ARROW}</a>
          </article>`).join('\n          ');
  return `<div class="ar-proof-grid ${cls}">
          ${cards}
        </div>`;
}

function renderPage(c, chrome, available) {
  const t = T[c.lang];
  const url = areaUrl(c.id, c.lang);
  const enAvail = available.has(`${c.id}.en`);
  const esAvail = available.has(`${c.id}.es`);
  const enUrl = areaUrl(c.id, 'en');
  const esUrl = areaUrl(c.id, 'es');
  const xDefault = enAvail ? enUrl : esUrl;
  const alternates = [
    enAvail ? `<link rel="alternate" hreflang="en" href="${enUrl}" />` : '',
    esAvail ? `<link rel="alternate" hreflang="es" href="${esUrl}" />` : '',
    `<link rel="alternate" hreflang="x-default" href="${xDefault}" />`,
  ].filter(Boolean).join('\n  ');

  const facts = (c.market.facts || []).length
    ? `<ul class="ar-facts ar-rise">
            ${c.market.facts.map((f) => `<li class="ar-fact"><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong>${note(f)}</li>`).join('\n            ')}
          </ul>`
    : '';

  const needsN = c.needs.items.length;
  const needsCls = needsN === 3 || needsN >= 5 ? '--3' : '--2';
  const needs = c.needs.items.map((it, i) => `<div class="ar-card ar-rise">
            <span class="ar-num">${pad2(i + 1)}</span>
            <h3>${esc(it.title)}</h3>
            <p>${esc(it.body)}</p>
            ${note(it)}
          </div>`).join('\n          ');

  const plan = c.plan.items.map((it) => `<div class="ar-card ar-plan ar-rise">
            <div class="ar-ic">${icon(PLAN_ICON[it.service])}</div>
            <span class="ar-plan-label">${esc(t.planLabel[it.service])}</span>
            <h3>${esc(it.title)}</h3>
            <p>${it.bodyHtml}</p>
            ${note(it)}
          </div>`).join('\n          ');

  const faqs = c.faqs.map((f, i) => `<details>
            <summary><span class="ar-faq-n">${pad2(i + 1)}</span><h3>${esc(f.q)}</h3><span class="ar-faq-ic">${PLUS}</span></summary>
            <div class="ar-faq-a"><p>${esc(f.a)}</p></div>
          </details>`).join('\n          ');

  const nearby = (c.nearby || [])
    .filter((id) => id !== c.id && available.has(`${id}.${c.lang}`))
    .slice(0, 3)
    .map((id) => `<a href="${areaPath(id, c.lang)}">${icon('map-pin')}${esc(available.get(`${id}.${c.lang}`).areaName)}</a>`);
  const nearbyHtml = nearby.length
    ? `<nav class="ar-nearby ar-rise" aria-label="${escAttr(t.nearbyAria)}">
          <span class="ar-nearby-label">${esc(t.nearby)}</span>
          ${nearby.join('\n          ')}
        </nav>`
    : '';

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t.home, item: t.homeUrl },
          { '@type': 'ListItem', position: 2, name: c.h1, item: url },
        ],
      },
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

  const sec = (cls, id, inner) => `    <section class="${cls} ar-sec"${id ? ` id="${id}"` : ''}>
      <div class="ar-wrap">
${inner}
      </div>
    </section>`;

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
  ${(c.lang === 'en' ? esAvail : enAvail) ? `<meta property="og:locale:alternate" content="${t.ogLocaleAlt}" />` : ''}
  <meta property="og:title" content="${escAttr(c.metaTitle)}" />
  <meta property="og:description" content="${escAttr(c.metaDescription)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(c.metaTitle)}" />
  <meta name="twitter:description" content="${escAttr(c.metaDescription)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  ${chrome.fonts}
  <link rel="preload" as="image" type="image/avif" media="(min-width: 960px)" href="${HERO_IMG.src}" fetchpriority="high" />
  ${chrome.lucide}
  <link rel="stylesheet" href="/shared.css?v=${chrome.cssVer}" />
  <script type="application/ld+json">
${ldJson(schema)}
  </script>
  <style>${PAGE_CSS}  </style>
</head>
<body>
  ${chrome.gtmNoscript}

  ${chrome.depth}

  ${chrome.nav}

  <main class="page">

    <!-- HERO -->
    <section class="lib-section ar-hero">
      <div class="ar-wrap">
        <div class="ar-hero-grid">
          <div class="ar-hero-copy">
            <span class="ar-eyebrow ar-rise">${esc(c.eyebrow)}</span>
            <h1 class="ar-rise">${highlightArea(c.h1, c.areaName)}</h1>
            <p class="ar-lede ar-rise">${esc(c.answer)}</p>
            <p class="ar-hero-sub ar-rise">${esc(c.heroSub)}</p>
            <div class="ar-hero-ctas ar-rise">
              <a href="${t.contact}" class="btn btn-primary ar-btn">${esc(t.primary)} ${ARROW}</a>
              <a href="${t.grader}" class="btn ar-btn">${esc(t.graderBtn)}</a>
            </div>
            <ul class="ar-hero-trust ar-rise">
              ${t.trust.map((x) => `<li>${CHECK}${esc(x)}</li>`).join('\n              ')}
            </ul>
          </div>
          <figure class="ar-hero-photo ar-rise">
            <img src="${HERO_IMG.src}" alt="${escAttr(t.photoAlt)}" width="${HERO_IMG.width}" height="${HERO_IMG.height}" decoding="async" />
            <figcaption class="ar-photo-tag"><span class="dot"></span>${esc(t.photoTag)}</figcaption>
          </figure>
        </div>
      </div>
    </section>

    <!-- MARKET -->
${sec('card-overlay --dark lib-section', 'market', `        <div class="ar-sec-head ar-rise">
          <span class="ar-eyebrow">${esc(t.eyebrow.market)}</span>
          <h2 class="ar-h2">${esc(c.market.h2)}</h2>
        </div>
        <div class="ar-market-grid">
          <div class="ar-prose ar-rise">
            ${c.market.paragraphsHtml.map((p) => `<p>${p}</p>`).join('\n            ')}
            ${note(c.market)}
          </div>
          ${facts}
        </div>`)}

    <!-- WHAT WORKS HERE -->
${sec('lib-section', 'what-works', `        <div class="ar-sec-head ar-rise">
          <span class="ar-eyebrow">${esc(t.eyebrow.needs)}</span>
          <h2 class="ar-h2">${esc(c.needs.h2)}</h2>
        </div>
        <div class="ar-grid ${needsCls}">
          ${needs}
        </div>`)}

    <!-- PROOF -->
${sec('lib-section --lap', 'proof', `        <div class="ar-sec-head ar-rise">
          <span class="ar-eyebrow">${esc(t.eyebrow.proof)}</span>
          <h2 class="ar-h2">${esc(c.proof.h2)}</h2>
          <p class="ar-sec-sub">${esc(t.proofSub)}</p>
        </div>
        ${proofCards(c, t)}`)}

    <!-- PLAN -->
${sec('card-overlay --dark lib-section', 'plan', `        <div class="ar-sec-head ar-rise">
          <span class="ar-eyebrow">${esc(t.eyebrow.plan)}</span>
          <h2 class="ar-h2">${esc(c.plan.h2)}</h2>
        </div>
        <div class="ar-grid ar-plan-grid">
          ${plan}
        </div>`)}

    <!-- SHOOTS + PRICING -->
${sec('lib-section --lap', '', `        <div class="ar-duo">
          <div class="ar-panel ar-rise" id="shoots">
            <span class="ar-eyebrow">${esc(t.eyebrow.shoots)}</span>
            <h2 class="ar-h2">${esc(c.shoots.h2)}</h2>
            <p>${esc(c.shoots.body)}</p>
            ${note(c.shoots)}
          </div>
          <div class="ar-panel --gold ar-rise" id="pricing">
            <span class="ar-eyebrow">${esc(t.eyebrow.pricing)}</span>
            <h2 class="ar-h2">${esc(c.pricing.h2)}</h2>
            <p>${c.pricing.bodyHtml}</p>
            ${note(c.pricing)}
          </div>
        </div>`)}

    <!-- FAQ -->
${sec('card-overlay --dark lib-section', 'faq', `        <div class="ar-sec-head ar-rise">
          <span class="ar-eyebrow">${esc(t.eyebrow.faq)}</span>
          <h2 class="ar-h2">${esc(t.faqH2)}</h2>
        </div>
        <div class="ar-faq ar-rise">
          ${faqs}
        </div>`)}

    <!-- CTA -->
${sec('lib-section --end', 'book', `        <div class="cta-banner ar-cta ar-rise">
          <div class="cta-content">
            <div class="ar-host"><img src="${HOST_IMG.src}" alt="${escAttr(t.hostAlt)}" width="${HOST_IMG.width}" height="${HOST_IMG.height}" loading="lazy" /><span>${esc(t.host)}</span></div>
            <h2>${esc(c.cta.h2)}</h2>
            <p>${esc(c.cta.body)}</p>
          </div>
          <div class="cta-actions">
            <a href="${t.contact}" class="btn btn-primary ar-btn">${esc(c.cta.button)}</a>
            <a href="tel:${PHONE}" class="btn ar-btn">${esc(t.call)}</a>
          </div>
        </div>
        ${nearbyHtml}`)}

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

// ---------- entry point ----------
// buildAreas(root, outDir[, { strict }]) renders every valid areas/content/*.json
// and returns the sitemap <url> entries for the pages it wrote. Invalid files are
// skipped with a warning; lint issues (dashes, off-list links, meta lengths) are
// warnings unless strict is true, in which case they throw.
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
    lint(c).forEach((w) => problems.push(`${f}: ${w}`));
    available.set(`${c.id}.${c.lang}`, c);
  }
  if (problems.length) {
    const msg = `build-areas:\n  ${problems.join('\n  ')}`;
    if (strict) throw new Error(msg);
    console.warn(msg);
  }

  const chrome = await loadChrome(root);
  await mkdir(path.join(outDir, 'areas'), { recursive: true });
  await mkdir(path.join(outDir, 'areas-es'), { recursive: true });

  const lastmod = todayET();
  const entries = [];
  const order = (k) => { const [id, lang] = [k.slice(0, k.lastIndexOf('.')), k.slice(k.lastIndexOf('.') + 1)]; const i = AREA_IDS.indexOf(id); return `${i < 0 ? 99 : String(i).padStart(2, '0')}-${id}-${lang}`; };
  for (const key of [...available.keys()].sort((a, b) => order(a).localeCompare(order(b)))) {
    const c = available.get(key);
    const html = renderPage(c, chrome[c.lang], available);
    if (DASH_RE.test(html)) {
      const msg = `build-areas: rendered ${key} contains an em/en dash`;
      if (strict) throw new Error(msg);
      console.warn(msg);
    }
    const dir = c.lang === 'es' ? 'areas-es' : 'areas';
    await writeFile(path.join(outDir, dir, `${c.id}.html`), html);
    entries.push(`  <url>
    <loc>${areaUrl(c.id, c.lang)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`);
  }

  console.log(`Built area pages: ${entries.length} (${[...available.keys()].join(', ')})`);
  return entries.join('\n');
}
