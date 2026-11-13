// Case studies generator for Button Up Media ("results library").
// Renders, from JSON in cases/content/:
//   EN hub   /case-studies                  -> outDir/case-studies.html
//   ES hub   /es/casos-de-exito             -> outDir/case-studies-es.html
//   EN case  /case-studies/{slug}           -> outDir/case-studies/{slug}.html
//   ES case  /es/casos-de-exito/{slug}      -> outDir/casos-de-exito/{slug}.html
// and returns sitemap <url> entries (with hreflang alternates) for every page.
//
// Usage (scripts/build-public.mjs):
//   import { buildCases } from './build-cases.mjs';
//   const caseSitemapEntries = await buildCases(root, outDir);
//   // options: buildCases(root, outDir, { strict: true, includeHubs: false })
//   //   strict      -> lint warnings throw instead of printing
//   //   includeHubs -> false leaves the two hub URLs out of the returned sitemap
//   //                  entries (sitemap.xml already lists them by hand)
//
// Page chrome (consent mode, GTM, fonts, lucide, nav, footer, shared.js) is read
// from about.html / about-es.html at build time, the same way build-areas.mjs
// does, so these pages always match the live site. Every asset path is absolute
// because the pages are served at nested URLs.
//
// ---------------------------------------------------------------------------
// CONTENT SHAPE
// Keys ending in "Html" may contain <a>, <strong>, <em>; every other string is
// plain text and is HTML-escaped. Any object marked [note] accepts an optional
//   "reviewNote": "what the owner must confirm"
// which renders <aside class="review-note">Review: ...</aside> right next to that
// block. Review notes never reach JSON-LD. Delete the key before launch.
//
// cases/content/{slug}.{en|es}.json
// {
//   slug, lang: "en"|"es", order: 1,          // order = position in the library
//   service: "social"|"ads"|"web",            // primary service (related cases match on it)
//   services: ["ads", "web"],                 // every service tag shown, primary first
//   client: "Rusty Pelican",                  // display name (cards, related links)
//   crumb?: "Private events",                 // shorter breadcrumb name (defaults to client)
//   organizations: ["Rusty Pelican Miami"],   // JSON-LD Article.about, one per business
//   metaTitle (<= 60, ends "| Button Up Media"), metaDescription (140-160),
//   ldHeadline,                               // JSON-LD headline: confirmed facts only
//   ogImage?,                                 // absolute path; defaults to the hero media
//   h1, h1Sub,                                // H1 = big client line + smaller second line
//   answer,                                   // answer-first line under the H1 (<= 30 words)
//   descriptor,                               // what the business is ("Cajun seafood boil")
//   area: { name, detail?, page? } | null,    // page = area id (miami-beach, brickell, ...) -> area page link
//   timeframe: "Google Ads, 2025" | null, timeframeReviewNote?,
//   hero: [note]                              // media-first hero, one of:
//     { type: "video",   src: "videos/x.mp4", poster, width, height, alt, chip? }   muted loop, plays in view
//     { type: "image",   src, width, height, alt, chip? }
//     { type: "graphic", kicker, name, sub, big, bigLabel, handle }                 typographic card (no media yet)
//     { type: "logos",   big, bigLabel, logos: [{ src, width, height, alt }] }
//     { type: "device",  url, desktop: { src, width, height, alt }, mobile: { ... } } browser + phone mockup
//   card: { src?, width?, height?, alt?, value, label, place? },   // hub reel card + related card (graphic when no src); place = short location chip
//   webCard?: { kicker, title, body, device?: true, image?: { src, width, height, alt } }, // hub Websites card
//   metrics: [ { value, label, meaning, reviewNote? } x3 ],   // "at a glance" + results tiles
//   situation: { h2?, paragraphs: [] } [note],
//   steps: { h2?, items: [ { title, bodyHtml, figure?: { src, width, height, alt, caption }, reviewNote? } ] },
//   results: null | { h2?, explainHtml?, points?: [text],
//     accounts?: [ { name, period, campaigns, roas, roasLabel?, roasNumber|null, conversions, value, costPer,
//                    spend?, standout? } ],   // ads accounts: case scoreboard AND the hub Google Ads scoreboard
//     disclaimer?: true } [note],
//   quote: null | { h2?, text, name, role, source?, video?: { src, poster, width, height, playLabel } } [note],
//   links: [ { href, text } ]                 // service pages etc.; the area page link is added automatically
// }
//
// cases/content/hub.{en|es}.json
// { lang, metaTitle, metaDescription, ogImage, eyebrow, h1, h1Accent, answer, primaryCta, secondaryCta,
//   wallLabel, wall: [ { slug, src, poster, width, height, chip, alt } ],      // 2-3 hero clips
//   tabsLabel,
//   sections: {
//     social: { tab, h2, intro, order: [slug] },
//     ads:    { tab, h2, intro, roasLineHtml, totals: { h3, items: [{ value, label }] } [note], disclaimer },
//     web:    { tab, h2, intro, order: [slug] } },
//   cta: { h2, body, quote: { text, name, role }, rating } }
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, readdir, access } from 'fs/promises';
import path from 'path';

const BASE = 'https://www.buttonupmedia.com';
const ORG_ID = `${BASE}/#organization`;
const DEFAULT_OG = '/media/founders-duo.webp';
const SLUGS = ['tonis-sushi-bar', 'the-fatty-crab', 'brewing-buddha', 'shimuja-ramen', 'rusty-pelican', 'private-events', 'woa-cocktails'];
const SERVICES = ['social', 'ads', 'web'];
const AREA_IDS = ['miami-beach', 'brickell', 'wynwood', 'coral-gables', 'doral', 'fort-lauderdale'];

export const hubPath = (lang) => (lang === 'es' ? '/es/casos-de-exito' : '/case-studies');
export const casePath = (slug, lang) => `${hubPath(lang)}/${slug}`;
const areaPath = (id, lang) => (lang === 'es' ? `/es/marketing-restaurantes-${id}` : `/restaurant-marketing-${id}`);
const abs = (p) => `${BASE}${p}`;

// shared.js resolves data-video-src by stripping the leading slash and prefixing
// the Bunny CDN on www (or nothing elsewhere). Off the CDN that leaves a path
// relative to the page, which breaks at /case-studies/{slug} and
// /es/casos-de-exito/{slug}. "../../" climbs back to the site root from either
// depth (dot segments clamp at the root), and the CDN URL normalizes the same
// way, so one value works on www, previews, localhost and the local fallback.
const videoSrc = (p) => `../../${String(p).replace(/^(\.\.\/|\/)+/, '')}`;

const ALLOWED_PATHS = new Set([
  '/socialmediamarketing', '/es/marketing-redes-sociales',
  '/restaurant-website-design', '/es/diseno-web-restaurantes',
  '/restaurant-advertising', '/es/publicidad-restaurantes',
  '/restaurant-seo', '/es/seo-restaurantes',
  '/case-studies', '/es/casos-de-exito',
  '/social-media-website-grader', '/es/analizador-redes-sociales-web',
  '/about', '/es/nosotros', '/contact', '/es/contacto', '/blog', '/es/blog',
]);
for (const id of AREA_IDS) { ALLOWED_PATHS.add(areaPath(id, 'en')); ALLOWED_PATHS.add(areaPath(id, 'es')); }
for (const s of SLUGS) { ALLOWED_PATHS.add(casePath(s, 'en')); ALLOWED_PATHS.add(casePath(s, 'es')); }

const AREA_FALLBACK = {
  en: { 'miami-beach': 'Miami Beach', brickell: 'Brickell & Downtown Miami', wynwood: 'Wynwood', 'coral-gables': 'Coral Gables', doral: 'Doral', 'fort-lauderdale': 'Fort Lauderdale & Broward' },
  es: { 'miami-beach': 'Miami Beach', brickell: 'Brickell y Downtown Miami', wynwood: 'Wynwood', 'coral-gables': 'Coral Gables', doral: 'Doral', 'fort-lauderdale': 'Fort Lauderdale y Broward' },
};

const T = {
  en: {
    htmlLang: 'en', ogLocale: 'en_US', ogLocaleAlt: 'es_US',
    home: 'Home', homeUrl: `${BASE}/`, hubName: 'Case studies',
    contact: '/contact', grader: '/social-media-website-grader',
    primary: 'Book a free strategy call', graderBtn: 'Try the free grader',
    service: { social: 'Social media', ads: 'Google Ads', web: 'Website' },
    nav: { situation: 'The situation', steps: 'What we did', results: 'Results', quote: 'In their words' },
    ids: { situation: 'situation', steps: 'what-we-did', results: 'results', quote: 'in-their-words' },
    glance: 'At a glance', onPage: 'On this page', allCases: 'All case studies', back: 'Back to all case studies',
    more: 'More case studies', moreSub: 'Same playbook, different restaurants.',
    readCase: 'Read the case', plain: 'In plain English', standout: 'Standout:', spend: 'Ad spend',
    col: { account: 'Account', roas: 'ROAS', conversions: 'Conversions', costPer: 'Cost per conversion', value: 'Conversion value' },
    count: { social: 'restaurants', ads: 'ad accounts', web: 'websites' },
    disclaimer: 'Figures are from restaurant ad accounts we managed in 2025. Individual results vary, and past performance does not guarantee future results.',
    areaLink: (n) => `Restaurant marketing in ${n}`,
    crumbs: 'Breadcrumb', tapSound: 'Tap to play with sound', caseLabel: 'Case study',
    clipLabel: (client, chip) => `${client} case study, ${chip}`,
  },
  es: {
    htmlLang: 'es', ogLocale: 'es_US', ogLocaleAlt: 'en_US',
    home: 'Inicio', homeUrl: `${BASE}/es`, hubName: 'Casos de éxito',
    contact: '/es/contacto', grader: '/es/analizador-redes-sociales-web',
    primary: 'Agende una llamada estratégica gratis', graderBtn: 'Pruebe el analizador gratis',
    service: { social: 'Redes sociales', ads: 'Google Ads', web: 'Sitio web' },
    nav: { situation: 'La situación', steps: 'Lo que hicimos', results: 'Resultados', quote: 'En sus palabras' },
    ids: { situation: 'situacion', steps: 'lo-que-hicimos', results: 'resultados', quote: 'en-sus-palabras' },
    glance: 'De un vistazo', onPage: 'En esta página', allCases: 'Todos los casos', back: 'Volver a todos los casos de éxito',
    more: 'Más casos de éxito', moreSub: 'El mismo método, otros restaurantes.',
    readCase: 'Ver el caso', plain: 'En pocas palabras', standout: 'Lo más destacado:', spend: 'Inversión en anuncios',
    col: { account: 'Cuenta', roas: 'ROAS', conversions: 'Conversiones', costPer: 'Costo por conversión', value: 'Valor de conversión' },
    count: { social: 'restaurantes', ads: 'cuentas de anuncios', web: 'sitios web' },
    disclaimer: 'Las cifras provienen de cuentas de anuncios de restaurantes que manejamos en 2025. Los resultados individuales varían y el rendimiento pasado no garantiza resultados futuros.',
    areaLink: (n) => `Marketing para restaurantes en ${n}`,
    crumbs: 'Ruta de navegación', tapSound: 'Toca para verlo con sonido', caseLabel: 'Caso de éxito',
    clipLabel: (client, chip) => `Caso de éxito de ${client}, ${chip}`,
  },
};

// ---------- escaping ----------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const ldJson = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const svg = (d, sw = 2) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const ICON = {
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.2),
  back: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>', 2.2),
  pin: svg('<path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
  cal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  store: svg('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>', 2.4),
};
const note = (o) => (o && typeof o.reviewNote === 'string' && o.reviewNote.trim()
  ? `<aside class="review-note">${/^review:/i.test(o.reviewNote.trim()) ? '' : 'Review: '}${esc(o.reviewNote.trim())}</aside>`
  : '');
const dim = (m) => `width="${m.width}" height="${m.height}"`;

// ---------- chrome from about.html / about-es.html (same approach as build-areas.mjs) ----------
function absolutize(html) {
  return html.replace(/(\s(?:src|href)=")(?!https?:|\/|#|mailto:|tel:|data:)/g, '$1/');
}
function extractChrome(html, name) {
  const pick = (re, what) => {
    const m = html.match(re);
    if (!m) throw new Error(`build-cases: could not find the ${what} in ${name}`);
    return m[0];
  };
  const cssVer = (html.match(/href="\/?shared\.css\?v=([^"]+)"/) || [])[1];
  const jsVer = (html.match(/src="\/?shared\.js\?v=([^"]+)"/) || [])[1];
  if (!cssVer) throw new Error(`build-cases: could not find the shared.css version in ${name}`);
  const fonts = html.match(/^[ \t]*<link rel="preload" as="font"[^>]*>[ \t]*$/gm) || [];
  if (!fonts.length) throw new Error(`build-cases: could not find the font preloads in ${name}`);
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

async function loadAreaNames(root) {
  const names = { en: { ...AREA_FALLBACK.en }, es: { ...AREA_FALLBACK.es } };
  for (const id of AREA_IDS) {
    for (const lang of ['en', 'es']) {
      try {
        const c = JSON.parse(await readFile(path.join(root, 'areas', 'content', `${id}.${lang}.json`), 'utf8'));
        if (c && typeof c.areaName === 'string' && c.areaName.trim()) names[lang][id] = c.areaName.trim();
      } catch { /* keep the fallback name */ }
    }
  }
  return names;
}

// ---------- page CSS (one block, .cs- prefixed) ----------
const PAGE_CSS = `
    /* ============================================================
       Case studies: results library (hub) + case files. MOBILE FIRST.
       Extends the shared.css dark system. Page classes are prefixed .cs-
       ============================================================ */
    /* shared.css sets overflow-x:hidden on html and body, which turns body into a
       scroll container and silently disables position:sticky. clip keeps the
       no-sideways-scroll guarantee without that side effect. */
    html, body { overflow-x: clip; }
    @supports not (overflow: clip) { html, body { overflow-x: hidden; } }
    :root { --cs-top: 68px; --cs-bar: 54px; }
    @media (min-width: 701px) { :root { --cs-top: 116px; } }

    .cs-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    .cs-gold { color: var(--gold); }
    .cs-page a:focus-visible, .cs-page button:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .cs-eyebrow { display: inline-flex; align-items: center; gap: 9px; font-family: var(--font-display); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); }
    .cs-eyebrow::before { content: ""; width: 20px; height: 1px; background: var(--gold); opacity: 0.7; }

    /* Review notes (stripped before launch) */
    .review-note { display: block; margin: 12px 0 0; padding: 10px 14px; border: 2px dashed #d4a64a; border-radius: 8px; font-size: 13px; line-height: 1.5; color: var(--text); background: rgba(212,166,74,0.06); font-family: var(--font-body); font-weight: 400; letter-spacing: 0; text-transform: none; text-align: left; }

    .cs-btn { height: 48px; padding: 0 20px; font-size: 0.9375rem; }
    .cs-btn svg { width: 16px; height: 16px; }
    .cs-cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .cs-lede { margin-top: 12px; max-width: 56ch; font-size: 1.0625rem; line-height: 1.55; color: var(--text-dim); }

    .cs-tag { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; background: var(--gold-soft); border: 1px solid rgba(226,168,77,0.3); color: var(--gold); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.04em; }
    .cs-tag.--ads { background: rgba(69,176,140,0.12); border-color: rgba(69,176,140,0.32); color: #6DC4A6; }
    .cs-tag.--web { background: rgba(208,106,80,0.12); border-color: rgba(208,106,80,0.34); color: #E8A08C; }

    /* Sideways rows: edge fade only where there is more to see (JS toggles the classes) */
    [data-cs-scroll] { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    [data-cs-scroll]::-webkit-scrollbar { display: none; }
    [data-cs-scroll].--more-r { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 44px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 44px), transparent); }
    [data-cs-scroll].--more-l { -webkit-mask-image: linear-gradient(90deg, transparent, #000 44px); mask-image: linear-gradient(90deg, transparent, #000 44px); }
    [data-cs-scroll].--more-l.--more-r { -webkit-mask-image: linear-gradient(90deg, transparent, #000 44px, #000 calc(100% - 44px), transparent); mask-image: linear-gradient(90deg, transparent, #000 44px, #000 calc(100% - 44px), transparent); }

    /* Media frames */
    .cs-frame { position: relative; margin: 0; overflow: hidden; border-radius: 18px; border: 1px solid var(--line); background: var(--bg-2); box-shadow: 0 22px 50px rgba(0,0,0,0.45); }
    .cs-frame > img, .cs-frame > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .cs-portrait { aspect-ratio: 9 / 16; }
    .cs-chip { position: absolute; left: 8px; bottom: 8px; z-index: 2; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: rgba(10,10,10,0.72); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border: 1px solid var(--line); font-family: var(--font-hero); font-size: 0.8125rem; font-weight: 800; color: var(--text-head); white-space: nowrap; pointer-events: none; }
    .cs-chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--gold); }

    /* Typographic card (client without media) */
    .cs-frame > .cs-graphic { position: absolute; inset: 0; }
    .cs-graphic { display: flex; flex-direction: column; justify-content: space-between; padding: 14px 12px; background: radial-gradient(circle at 80% 12%, rgba(226,168,77,0.26), transparent 58%), radial-gradient(circle at 0% 100%, rgba(208,106,80,0.18), transparent 55%), var(--bg-2); }
    .cs-graphic-kicker { font-family: var(--font-display); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); line-height: 1.3; }
    .cs-graphic-name { display: block; margin-top: 10px; font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.9rem, 9vw, 4.6rem); line-height: 0.9; letter-spacing: -0.05em; color: transparent; -webkit-text-stroke: 1.3px rgba(226,168,77,0.85); }
    .cs-graphic-sub { display: block; margin-top: 4px; font-family: var(--font-hero); font-weight: 700; font-size: clamp(0.95rem, 3.6vw, 1.6rem); color: var(--text-head); letter-spacing: -0.02em; }
    .cs-graphic-big { display: block; font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.6rem, 7vw, 3.4rem); line-height: 1; letter-spacing: -0.04em; color: var(--text-head); }
    .cs-graphic-label, .cs-graphic-handle { display: block; font-size: 0.8125rem; line-height: 1.35; color: var(--text-dim); margin-top: 4px; }
    .cs-graphic-handle { color: var(--text-soft); }

    /* Logos card */
    .cs-logos { display: flex; flex-direction: column; justify-content: space-between; padding: 14px 12px; background: radial-gradient(circle at 70% 10%, rgba(69,176,140,0.22), transparent 60%), var(--bg-2); }
    .cs-logos-big { font-family: var(--font-hero); font-weight: 800; font-size: clamp(2rem, 9vw, 4.4rem); line-height: 0.95; letter-spacing: -0.05em; color: var(--text-head); }
    .cs-logos-label { display: block; margin-top: 4px; font-size: 0.8125rem; line-height: 1.35; color: var(--text-dim); }
    .cs-logos-wall { display: grid; gap: 8px; padding: 10px; border-radius: 12px; background: #f4eee3; }
    .cs-logos-wall img { display: block; width: 100%; height: auto; max-height: 40px; object-fit: contain; }

    /* Browser + phone mockup */
    .cs-dev { position: relative; }
    .cs-dev-browser { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #111; box-shadow: 0 24px 56px rgba(0,0,0,0.5); }
    .cs-dev-bar { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; background: #161616; border-bottom: 1px solid var(--line-soft); }
    .cs-dev-bar i { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,248,235,0.18); }
    .cs-dev-url { margin-left: 8px; padding: 2px 10px; border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 0.8125rem; color: var(--text-soft); }
    .cs-dev-browser img { display: block; width: 100%; height: auto; }
    .cs-dev-phone { position: relative; overflow: hidden; aspect-ratio: 9 / 19.4; border-radius: 18px; border: 3px solid #262626; background: #000; box-shadow: 0 24px 56px rgba(0,0,0,0.55); }
    .cs-dev-phone img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; }

    /* =====================================================
       HUB
       ===================================================== */
    .cs-hero { padding: 14px 0 26px; }
    .cs-hero h1 { margin-top: 12px; font-family: var(--font-hero); font-weight: 800; font-size: clamp(2rem, 8.6vw, 4rem); line-height: 1.02; letter-spacing: -0.045em; color: var(--text-head); text-wrap: balance; }
    .cs-hero h1 .cs-gold { display: block; }
    .cs-wall { list-style: none; display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 18px -16px 0; padding: 0 16px; }
    .cs-wall li { flex: 0 0 120px; scroll-snap-align: start; scroll-margin-left: 16px; }
    .cs-clip { display: block; border-radius: 16px; transition: transform .25s ease, border-color .25s ease; }
    .cs-clip:hover { transform: translateY(-3px); border-color: rgba(226,168,77,0.4); }
    .cs-clip-meta { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 2; padding: 7px 9px; border-radius: 11px; background: rgba(10,10,10,0.74); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border: 1px solid var(--line); }
    .cs-clip-meta { left: 6px; right: 6px; bottom: 6px; padding: 6px 8px; }
    .cs-clip-meta b { display: block; font-family: var(--font-hero); font-weight: 800; font-size: 1.0625rem; line-height: 1.15; color: var(--text-head); letter-spacing: -0.02em; }
    .cs-clip-meta small { font-family: var(--font-body); font-size: 0.8125rem; font-weight: 600; letter-spacing: 0; color: var(--text); }
    .cs-clip-meta span { display: block; margin-top: 1px; font-size: 0.8125rem; line-height: 1.3; color: var(--text-dim); }

    .cs-lib { position: relative; }
    .cs-tabs-bar { position: sticky; top: var(--cs-top); z-index: 60; margin: 4px -16px 0; padding: 5px 0; background: rgba(10,10,10,0.86); -webkit-backdrop-filter: blur(16px) saturate(1.3); backdrop-filter: blur(16px) saturate(1.3); border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
    html:not(.cs-js) .cs-tabs-bar { display: none; }
    .cs-tabs { position: relative; display: flex; gap: 6px; overflow-x: auto; padding: 0 16px; }
    .cs-tab { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px 0 16px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: var(--text-dim); font-family: var(--font-body); font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: background .2s, border-color .2s, color .2s; white-space: nowrap; }
    .cs-tab:hover { color: var(--text); border-color: rgba(255,248,235,0.2); }
    .cs-tab[aria-selected="true"] { background: var(--gold-soft); border-color: rgba(226,168,77,0.55); color: var(--text-head); }
    .cs-tab-n { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 7px; border-radius: 999px; background: rgba(255,255,255,0.08); font-size: 0.8125rem; font-weight: 700; color: var(--text); }
    .cs-tab[aria-selected="true"] .cs-tab-n { background: var(--gold); color: #120d05; }

    .cs-panel { padding: 30px 0 8px; scroll-margin-top: calc(var(--cs-top) + var(--cs-bar) + 8px); }
    .cs-panel:focus { outline: none; }
    .cs-js .cs-panel[hidden] { display: none; }
    html:not(.cs-js) .cs-panel + .cs-panel { margin-top: 28px; border-top: 1px solid var(--line-soft); }
    .cs-panel-kicker { font-family: var(--font-display); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }
    .cs-panel.--ads .cs-panel-kicker { color: #6DC4A6; }
    .cs-panel.--web .cs-panel-kicker { color: #E8A08C; }
    .cs-panel h2 { margin-top: 8px; font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.6rem, 6.4vw, 2.7rem); line-height: 1.06; letter-spacing: -0.04em; color: var(--text-head); max-width: 22ch; }
    .cs-panel-intro { margin-top: 10px; max-width: 60ch; font-size: 1rem; line-height: 1.6; color: var(--text-dim); }

    /* Social: vertical reel cards */
    .cs-reels { list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 22px; }
    .cs-reel { position: relative; display: block; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 18px; border: 1px solid var(--line); background: var(--bg-2); transition: transform .25s ease, border-color .25s ease; }
    .cs-reel:hover { transform: translateY(-3px); border-color: rgba(226,168,77,0.42); }
    .cs-reel > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cs-reel::after { content: ""; position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(10,10,10,0.4) 0%, rgba(10,10,10,0) 18%, rgba(10,10,10,0) 36%, rgba(10,10,10,0.86) 58%, rgba(10,10,10,0.97) 74%); pointer-events: none; }
    .cs-reel-area { position: absolute; top: 8px; left: 8px; z-index: 2; display: inline-flex; align-items: center; gap: 5px; max-width: calc(100% - 16px); padding: 4px 9px; border-radius: 999px; background: rgba(10,10,10,0.66); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); font-size: 0.8125rem; line-height: 1.3; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cs-reel-area svg { width: 13px; height: 13px; color: var(--gold); flex: none; }
    .cs-reel-foot { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 2; }
    .cs-reel-num { display: block; font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.75rem, 8vw, 2.6rem); line-height: 1; letter-spacing: -0.045em; color: var(--gold); }
    .cs-reel-label { display: block; margin-top: 3px; font-size: 0.8125rem; line-height: 1.3; color: var(--text-dim); }
    .cs-reel-name { display: block; margin-top: 8px; font-family: var(--font-display); font-size: 1rem; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; color: var(--text-head); }
    .cs-reel-go { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 0.8125rem; font-weight: 700; color: var(--gold); }
    .cs-reel-go svg { width: 14px; height: 14px; }
    .cs-reel .cs-graphic { position: absolute; inset: 0; justify-content: flex-start; padding: 44px 14px 14px; border: 0; }
    .cs-reel .cs-graphic-name { font-size: clamp(2.4rem, 12vw, 4.2rem); }

    /* Google Ads: scoreboard */
    .cs-explain { margin-top: 16px; max-width: 70ch; padding: 14px 16px; border: 1px solid var(--line-soft); border-left: 3px solid #45B08C; border-radius: 0 14px 14px 0; background: rgba(69,176,140,0.06); font-size: 1rem; line-height: 1.6; color: var(--text-dim); }
    .cs-explain strong { color: var(--text-head); }
    .cs-board { margin-top: 20px; --cols: minmax(0, 2.1fr) minmax(0, 1.9fr) repeat(3, minmax(0, 1fr)); }
    .cs-board.--links { --cols: minmax(0, 2.1fr) minmax(0, 1.9fr) repeat(3, minmax(0, 1fr)) 132px; }
    .cs-board-head { display: none; }
    .cs-rows { list-style: none; display: grid; gap: 12px; }
    .cs-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 10px; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--bg-1); }
    .cs-row-acct { grid-column: 1 / -1; }
    .cs-row-acct h3 { font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; color: var(--text-head); }
    .cs-row-acct p { margin-top: 3px; font-size: 0.875rem; line-height: 1.45; color: var(--text-soft); }
    .cs-row-roas { grid-column: 1 / -1; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 14px; }
    .cs-row-roas .cs-k { grid-column: 1 / -1; }
    .cs-row-roas b { font-family: var(--font-hero); font-size: 2.25rem; font-weight: 800; line-height: 1.05; letter-spacing: -0.04em; color: var(--text-head); }
    .cs-row-roas b.--word { font-size: 1.5rem; }
    .cs-roas-note { grid-column: 1 / -1; font-size: 0.8125rem; line-height: 1.35; color: var(--text-dim); }
    .cs-bar { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; }
    .cs-bar i { display: block; height: 100%; width: var(--w, 0%); min-width: 6px; border-radius: 999px; background: linear-gradient(90deg, rgba(226,168,77,0.7), var(--gold)); }
    .cs-k { display: block; font-size: 0.8125rem; line-height: 1.3; color: var(--text-soft); }
    .cs-row-stat { display: flex; flex-direction: column; justify-content: space-between; }
    .cs-row-stat b { display: block; margin-top: 3px; font-family: var(--font-hero); font-size: 1.125rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-head); }
    .cs-row-foot { grid-column: 1 / -1; font-size: 1rem; line-height: 1.55; color: var(--text-dim); padding-top: 10px; border-top: 1px solid var(--line-soft); }
    .cs-row-foot b { color: var(--text-head); font-weight: 700; }
    .cs-row-go { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; margin-top: -4px; padding-top: 8px; border-top: 1px solid var(--line-soft); font-size: 0.9375rem; font-weight: 700; color: var(--gold); }
    .cs-totals { margin-top: 26px; padding: 18px 16px; border: 1px solid var(--line); border-radius: 20px; background: linear-gradient(135deg, rgba(69,176,140,0.07), transparent 60%), var(--bg-1); }
    .cs-totals h3 { font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: var(--text-head); }
    .cs-totals ul { list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; margin-top: 14px; }
    .cs-totals b { display: block; font-family: var(--font-hero); font-size: 1.6rem; font-weight: 800; line-height: 1.05; letter-spacing: -0.035em; color: var(--text-head); }
    .cs-totals span { display: block; margin-top: 4px; font-size: 0.8125rem; line-height: 1.35; color: var(--text-dim); }
    .cs-disclaimer { margin-top: 14px; max-width: 80ch; font-size: 0.8125rem; line-height: 1.55; color: var(--text-soft); }

    /* Websites: device cards */
    .cs-sites { list-style: none; display: grid; gap: 16px; margin-top: 22px; }
    .cs-site { display: flex; flex-direction: column; height: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 22px; background: var(--bg-1); transition: transform .25s ease, border-color .25s ease; }
    .cs-site:hover { transform: translateY(-3px); border-color: rgba(208,106,80,0.45); }
    .cs-site-media { position: relative; display: grid; place-items: center; aspect-ratio: 16 / 11; padding: 18px 16px; background: radial-gradient(circle at 62% 38%, rgba(208,106,80,0.18), transparent 62%), var(--bg-2); border-bottom: 1px solid var(--line-soft); }
    .cs-site-media > img { width: 100%; height: auto; }
    .cs-site-media .cs-dev { width: 100%; padding-right: 15%; }
    .cs-site-media .cs-dev-phone { position: absolute; right: 0; bottom: -10%; width: 24%; border-radius: 12px; border-width: 2px; }
    .cs-site-media .cs-dev-bar { height: 20px; padding: 0 8px; gap: 4px; }
    .cs-site-media .cs-dev-bar i { width: 6px; height: 6px; }
    .cs-site-copy { display: flex; flex-direction: column; gap: 6px; padding: 18px 18px 20px; }
    .cs-site-kicker { font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #E8A08C; }
    .cs-site-title { font-family: var(--font-hero); font-size: 1.35rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; color: var(--text-head); }
    .cs-site-body { font-size: 1rem; line-height: 1.55; color: var(--text-dim); }
    .cs-site-go { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 0.9375rem; font-weight: 700; color: var(--gold); }

    /* Closing CTA */
    .cs-close { padding: 48px 0 64px; }
    .cs-close .cta-banner { align-items: center; }
    .cs-close h2 { font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.75rem, 6vw, 2.7rem); line-height: 1.06; letter-spacing: -0.035em; color: var(--text-head); }
    .cs-close .cta-content p { margin-top: 12px; max-width: 56ch; font-size: 1rem; line-height: 1.6; }
    .cs-close .cta-actions { flex-wrap: wrap; }
    .cs-close-proof { font-size: 1rem !important; color: var(--text-dim); }
    .cs-close-proof b { color: var(--gold); }
    .cs-close-proof cite { display: block; margin-top: 4px; font-style: normal; font-size: 0.875rem; color: var(--text-soft); }
    /* The footer lands on an even child of main: keep shared.css's even-section
       ::before from painting a solid box where the footer's soft glow should be. */
    main.page > footer.footer-demo::before { background: radial-gradient(ellipse, rgba(226,168,77,0.04), transparent 70%); opacity: 1; }
    @media (max-width: 600px) {
      .cs-page .footer-bottom { flex-direction: column; align-items: flex-start; gap: 12px; }
      .cs-page .footer-links { flex-wrap: wrap; gap: 4px 18px; }
    }

    /* =====================================================
       CASE FILE
       ===================================================== */
    .cs-crumbs ol { list-style: none; display: flex; align-items: center; font-size: 0.875rem; color: var(--text-soft); }
    .cs-crumbs li { display: inline-flex; align-items: center; flex: none; }
    .cs-crumbs li:last-child { flex: 1 1 auto; min-width: 0; }
    .cs-crumbs li + li::before { content: "/"; margin: 0 8px; color: var(--text-soft); }
    .cs-crumbs a { display: inline-flex; align-items: center; min-height: 44px; color: var(--text-dim); text-decoration: underline; text-decoration-color: rgba(226,168,77,0.45); text-underline-offset: 3px; }
    .cs-crumbs [aria-current] { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .cs-chero { padding: 0 0 8px; }
    .cs-chero-grid { display: grid; grid-template-columns: minmax(0, 1fr) 124px; grid-template-areas: "copy media" "meta meta" "lede lede" "cta cta"; column-gap: 16px; align-items: start; margin-top: 4px; }
    .cs-chero-copy { grid-area: copy; min-width: 0; padding-top: 4px; }
    .cs-chero-media { grid-area: media; min-width: 0; }
    .cs-chero .cs-meta { grid-area: meta; }
    .cs-chero .cs-lede { grid-area: lede; }
    .cs-chero .cs-cta-row { grid-area: cta; }
    .cs-tags { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
    .cs-chero h1 { margin-top: 12px; font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.045em; color: var(--text-head); }
    .cs-h1-name { display: block; font-size: clamp(1.9rem, 8.4vw, 4.4rem); line-height: 0.98; }
    .cs-h1-sub { display: block; margin-top: 10px; font-family: var(--font-display); font-weight: 600; font-size: clamp(1.0625rem, 4.4vw, 1.6rem); line-height: 1.3; letter-spacing: -0.02em; color: var(--text-dim); }
    .cs-meta { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 16px; font-size: 0.875rem; line-height: 1.45; color: var(--text-dim); }
    .cs-meta li { display: inline-flex; align-items: flex-start; gap: 7px; }
    .cs-meta svg { width: 15px; height: 15px; margin-top: 2px; color: var(--gold); flex: none; }
    .cs-meta .review-note { margin-top: 6px; }
    .cs-chero-media .cs-dev-browser { display: none; }
    .cs-hero-notes { grid-column: 1 / -1; }
    @media (max-width: 599px) {
      .cs-chero-media .cs-graphic { padding: 12px 10px; }
      .cs-chero-media .cs-graphic-kicker, .cs-chero-media .cs-graphic-handle { display: none; }
      .cs-chero-media .cs-graphic-name { margin-top: 0; font-size: 2.1rem; }
      .cs-chero-media .cs-graphic-sub { font-size: 0.9375rem; }
      .cs-chero-media .cs-graphic-big { font-size: 1.6rem; }
    }

    .cs-glance { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 24px 0 0; border: 1px solid var(--line); border-radius: 18px; background: var(--bg-1); overflow: hidden; }
    .cs-glance > div { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 6px; padding: 14px 10px 14px 12px; border-left: 1px solid var(--line-soft); min-width: 0; }
    .cs-glance > div:first-child { border-left: 0; }
    .cs-glance dd { margin: 0; font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.25rem, 5.6vw, 2.5rem); line-height: 1.02; letter-spacing: -0.04em; color: var(--gold); overflow-wrap: anywhere; }
    .cs-glance dt { font-size: 0.8125rem; line-height: 1.35; color: var(--text-dim); }

    .cs-body { position: relative; margin-top: 8px; }
    .cs-toc { position: sticky; top: var(--cs-top); z-index: 60; margin: 22px -16px 0; padding: 5px 0; background: rgba(10,10,10,0.86); -webkit-backdrop-filter: blur(16px) saturate(1.3); backdrop-filter: blur(16px) saturate(1.3); border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
    .cs-toc-title, .cs-toc-all { display: none; }
    .cs-toc ul { position: relative; list-style: none; display: flex; gap: 6px; overflow-x: auto; padding: 0 16px; }
    .cs-toc li { flex: 0 0 auto; }
    .cs-toc ul a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 15px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,0.03); font-size: 0.9375rem; font-weight: 600; color: var(--text-dim); white-space: nowrap; transition: color .2s, border-color .2s, background .2s; }
    .cs-toc ul a.--on { background: var(--gold-soft); border-color: rgba(226,168,77,0.55); color: var(--text-head); }

    .cs-sec { padding-top: 40px; scroll-margin-top: calc(var(--cs-top) + var(--cs-bar) + 10px); }
    .cs-sec h2 { font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.55rem, 6vw, 2.25rem); line-height: 1.08; letter-spacing: -0.035em; color: var(--text-head); }
    .cs-sec > p, .cs-sit p { margin-top: 12px; max-width: 64ch; font-size: 1.0625rem; line-height: 1.65; color: var(--text-dim); }
    .cs-sit p:first-of-type { color: var(--text); }
    .cs-sec a:not(.cs-link):not(.btn) { padding: 13px 0; margin: -13px 0; color: var(--text-head); text-decoration: underline; text-decoration-color: rgba(226,168,77,0.5); text-underline-offset: 3px; }

    .cs-steps { list-style: none; margin-top: 18px; }
    .cs-step { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr); column-gap: 14px; padding-bottom: 24px; }
    .cs-step::before { content: ""; position: absolute; left: 21px; top: 50px; bottom: 6px; width: 2px; border-radius: 2px; background: linear-gradient(180deg, rgba(226,168,77,0.45), rgba(226,168,77,0.06)); }
    .cs-step:last-child { padding-bottom: 0; }
    .cs-step:last-child::before { display: none; }
    .cs-step-n { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(226,168,77,0.45); background: var(--gold-soft); font-family: var(--font-hero); font-size: 0.9375rem; font-weight: 800; color: var(--gold); }
    .cs-step h3 { padding-top: 9px; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; line-height: 1.3; letter-spacing: -0.015em; color: var(--text-head); }
    .cs-step p { margin-top: 6px; max-width: 62ch; font-size: 1rem; line-height: 1.6; color: var(--text-dim); }
    .cs-fig { margin: 14px 0 0; max-width: 560px; }
    .cs-fig img { display: block; width: 100%; height: auto; border-radius: 14px; border: 1px solid var(--line-soft); background: var(--bg-2); }
    .cs-fig.--mock img { border: 0; background: radial-gradient(circle at 55% 45%, rgba(226,168,77,0.12), transparent 62%), var(--bg-1); padding: 10px; }
    .cs-fig figcaption { margin-top: 8px; font-size: 0.8125rem; line-height: 1.45; color: var(--text-soft); }

    .cs-tiles { list-style: none; display: grid; gap: 12px; margin-top: 18px; }
    .cs-tile { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 14px; padding: 16px 16px 14px; border: 1px solid var(--line); border-radius: 18px; background: var(--bg-1); }
    .cs-tile > p, .cs-tile > .review-note { grid-column: 1 / -1; }
    .cs-tile b { display: block; font-family: var(--font-hero); font-weight: 800; font-size: clamp(2rem, 9vw, 2.6rem); line-height: 1; letter-spacing: -0.045em; color: var(--gold); }
    .cs-tile-label { display: block; font-family: var(--font-display); font-size: 1rem; font-weight: 700; line-height: 1.35; color: var(--text-head); }
    .cs-tile p { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft); font-size: 1rem; line-height: 1.55; color: var(--text-dim); }
    .cs-plain { display: block; margin-bottom: 3px; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); }
    .cs-points { list-style: none; display: grid; gap: 10px; margin-top: 18px; }
    .cs-points li { position: relative; padding-left: 30px; max-width: 64ch; font-size: 1rem; line-height: 1.6; color: var(--text-dim); }
    .cs-points svg { position: absolute; left: 0; top: 3px; width: 20px; height: 20px; padding: 3px; border-radius: 50%; background: var(--gold-soft); color: var(--gold); }
    .cs-sec .cs-board { margin-top: 18px; }
    .cs-sec > p.cs-explain { margin-top: 16px; font-size: 1rem; line-height: 1.6; }
    .cs-sec > p.cs-disclaimer { margin-top: 14px; font-size: 0.8125rem; line-height: 1.55; color: var(--text-soft); }

    .cs-words { display: grid; gap: 18px; margin-top: 18px; }
    .cs-quote { margin: 0; padding: 20px 20px 18px; border-left: 3px solid var(--gold); border-radius: 0 18px 18px 0; background: linear-gradient(90deg, rgba(226,168,77,0.1), rgba(226,168,77,0.015)); }
    .cs-quote blockquote p { font-family: var(--font-display); font-size: clamp(1.125rem, 4.4vw, 1.35rem); font-weight: 500; line-height: 1.55; letter-spacing: -0.01em; color: var(--text-head); }
    .cs-quote figcaption { margin-top: 12px; font-size: 0.9375rem; line-height: 1.45; color: var(--text-soft); }
    .cs-quote figcaption b { color: var(--text); font-weight: 700; }
    .cs-vid { width: 100%; max-width: 210px; margin: 0 auto; cursor: pointer; background: radial-gradient(circle at 50% 30%, rgba(226,168,77,0.16), transparent 62%), #0d0d0d; }
    .cs-vid > video { z-index: 1; }
    .cs-vid-play { position: absolute; top: 50%; left: 50%; z-index: 3; display: grid; place-items: center; width: 64px; height: 64px; transform: translate(-50%, -50%); border: 0; border-radius: 50%; background: rgba(226,168,77,0.94); box-shadow: 0 8px 32px rgba(202,138,4,0.3); cursor: pointer; transition: transform .25s, opacity .25s; }
    .cs-vid-play::after { content: ""; width: 0; height: 0; margin-left: 4px; border-left: 17px solid #050608; border-top: 11px solid transparent; border-bottom: 11px solid transparent; }
    .cs-vid:hover .cs-vid-play { transform: translate(-50%, -50%) scale(1.06); }
    .cs-vid-cap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; padding: 44px 14px 14px; background: linear-gradient(180deg, transparent, rgba(10,10,10,0.92)); pointer-events: none; transition: opacity .3s; }
    .cs-vid-cap b { display: block; font-family: var(--font-display); font-size: 0.9375rem; color: var(--text-head); }
    .cs-vid-cap span { display: block; margin-top: 2px; font-size: 0.8125rem; color: var(--text-dim); }
    .cs-vid.--playing .cs-vid-play, .cs-vid.--playing .cs-vid-cap { opacity: 0; }

    .cs-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 36px; }
    .cs-link { display: inline-flex; align-items: center; gap: 9px; min-height: 44px; padding: 10px 16px; border-radius: 12px; border: 1px solid var(--line); background: rgba(255,255,255,0.03); font-size: 0.9375rem; font-weight: 600; line-height: 1.3; color: var(--text); transition: border-color .2s, transform .2s; }
    .cs-link:hover { border-color: rgba(226,168,77,0.4); transform: translateY(-1px); }
    .cs-link svg { color: var(--gold); flex: none; }

    .cs-more { margin-top: 56px; padding-top: 40px; border-top: 1px solid var(--line-soft); }
    .cs-more h2 { font-family: var(--font-hero); font-weight: 800; font-size: clamp(1.5rem, 5.6vw, 2.1rem); line-height: 1.1; letter-spacing: -0.035em; color: var(--text-head); }
    .cs-more > p { margin-top: 6px; font-size: 1rem; color: var(--text-dim); }
    .cs-more-grid { list-style: none; display: grid; gap: 12px; margin-top: 18px; }
    .cs-mcard { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 14px; align-items: center; height: 100%; padding: 12px 14px 12px 12px; border: 1px solid var(--line); border-radius: 18px; background: var(--bg-1); transition: transform .25s, border-color .25s; }
    .cs-mcard:hover { transform: translateY(-2px); border-color: rgba(226,168,77,0.4); }
    .cs-mcard-thumb { position: relative; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 12px; background: radial-gradient(circle at 70% 18%, rgba(226,168,77,0.28), transparent 60%), var(--bg-2); display: grid; place-items: center; }
    .cs-mcard-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cs-mcard-thumb b { padding: 0 6px; font-family: var(--font-hero); font-size: 1.15rem; font-weight: 800; letter-spacing: -0.04em; color: var(--text-head); text-align: center; line-height: 1.05; }
    .cs-mcard-tag { font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gold); }
    .cs-mcard-name { display: block; margin-top: 4px; font-family: var(--font-display); font-size: 1.0625rem; font-weight: 700; line-height: 1.25; color: var(--text-head); }
    .cs-mcard-num { display: block; margin-top: 4px; font-size: 0.9375rem; line-height: 1.4; color: var(--text-dim); }
    .cs-mcard-num strong { font-family: var(--font-hero); color: var(--text-head); }
    .cs-mcard-go { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 0.875rem; font-weight: 700; color: var(--gold); }
    .cs-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-top: 14px; font-size: 0.9375rem; font-weight: 700; color: var(--text); }
    .cs-back svg { color: var(--gold); }

    /* ===================== TABLET / DESKTOP ===================== */
    @media (min-width: 600px) {
      .cs-wall li { flex-basis: 164px; }
      .cs-totals ul { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .cs-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .cs-tile { display: block; padding: 18px 18px 16px; }
      .cs-tile-label { margin-top: 8px; }
      .cs-more-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .cs-chero-grid { grid-template-columns: minmax(0, 1fr) 200px; column-gap: 28px; }
      .cs-words.--video { grid-template-columns: 230px minmax(0, 1fr); align-items: center; }
      .cs-words.--video .cs-vid { margin: 0; }
    }
    @media (min-width: 720px) {
      .cs-reels { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    @media (min-width: 701px) {
      .cs-hero { padding-top: 132px; }
      .cs-crumbs { padding-top: 112px; }
      .cs-tabs-bar { margin: 8px 0 0; padding: 0; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border: 0; display: flex; justify-content: center; }
      .cs-tabs { display: inline-flex; padding: 5px; border-radius: 999px; border: 1px solid var(--line); background: rgba(17,17,17,0.86); -webkit-backdrop-filter: blur(16px) saturate(1.3); backdrop-filter: blur(16px) saturate(1.3); box-shadow: 0 14px 40px rgba(0,0,0,0.45); }
      .cs-tab { border-color: transparent; background: transparent; }
      .cs-panel { padding-top: 44px; }
    }
    @media (min-width: 900px) {
      .cs-hero { padding-bottom: 40px; }
      .cs-hero-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 48px; align-items: center; }
      .cs-wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; overflow: visible; margin: 0; padding: 0 0 26px; -webkit-mask-image: none !important; mask-image: none !important; }
      .cs-wall li:nth-child(2) { transform: translateY(26px); }
      .cs-wall li:nth-child(3) { transform: translateY(-10px); }
      .cs-clip-meta { left: 8px; right: 8px; bottom: 8px; padding: 8px 10px; }
      .cs-clip-meta b { font-size: 1.25rem; }
      .cs-reels { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
      .cs-reel-name { font-size: 1.125rem; }
      .cs-board-head { display: grid; grid-template-columns: var(--cols); gap: 14px; padding: 0 22px 10px; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); }
      .cs-rows { gap: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 20px; background: var(--bg-1); }
      .cs-row { grid-template-columns: var(--cols); gap: 6px 14px; align-items: center; padding: 18px 22px; border: 0; border-top: 1px solid var(--line-soft); border-radius: 0; background: transparent; }
      .cs-row:first-child { border-top: 0; }
      .cs-row-acct, .cs-row-roas { grid-column: auto; }
      .cs-row-roas { grid-template-columns: 76px minmax(0, 1fr); }
      .cs-row .cs-k { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
      .cs-row-roas b { font-size: 1.9rem; }
      .cs-row-stat b { margin-top: 0; font-size: 1.125rem; }
      .cs-row-go { grid-column: auto; justify-content: flex-end; margin: 0; padding: 0; border: 0; }
      .cs-row-foot { grid-column: 1 / -1; padding-top: 8px; border-top: 0; }
      .cs-totals { padding: 22px 24px; }
      .cs-sites { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }

      .cs-chero-grid { grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr); grid-template-rows: 1fr auto auto auto auto auto 1fr; grid-template-areas: ". media" "copy media" "meta media" "lede media" "cta media" "notes media" ". media"; column-gap: 56px; }
      .cs-hero-notes { grid-area: notes; }
      .cs-chero-media { justify-self: center; width: 100%; max-width: 320px; }
      .cs-chero.--wide .cs-chero-media { max-width: none; }
      .cs-chero-media .--card { aspect-ratio: 4 / 5; }
      .cs-chero-media .cs-dev { padding-right: 16%; padding-bottom: 8%; }
      .cs-chero-media .cs-dev-browser { display: block; }
      .cs-chero-media .cs-dev-phone { position: absolute; right: 0; bottom: 0; width: 27%; }
      .cs-chero-copy { padding-top: 0; }
      .cs-glance { margin-top: 40px; }
      .cs-glance > div { padding: 20px 22px; gap: 8px; }
      .cs-glance dt { font-size: 0.9375rem; }

      .cs-body { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 56px; align-items: start; margin-top: 16px; }
      .cs-toc { top: calc(var(--cs-top) + 16px); margin: 40px 0 0; padding: 0; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border: 0; }
      .cs-toc-title { display: block; margin-bottom: 10px; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-soft); }
      .cs-toc ul { flex-direction: column; gap: 0; overflow: visible; padding: 0; border-left: 1px solid var(--line); -webkit-mask-image: none !important; mask-image: none !important; }
      .cs-toc ul a { width: 100%; margin-left: -1px; padding: 0 16px; border: 0; border-left: 2px solid transparent; border-radius: 0; background: none; font-size: 0.9375rem; }
      .cs-toc ul a.--on { background: none; border-left-color: var(--gold); color: var(--text-head); }
      .cs-toc-all { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-top: 16px; font-size: 0.9375rem; font-weight: 700; color: var(--gold); }
      .cs-sec { padding-top: 44px; scroll-margin-top: calc(var(--cs-top) + 20px); }
      .cs-close { padding: 72px 0 88px; }
    }
    @media (max-width: 899px) {
      .cs-close .cta-content p { margin-left: auto; margin-right: auto; }
    }
    @media (max-width: 600px) {
      .cs-close .cta-banner { padding: 30px 20px; border-radius: 24px; }
      .cs-close .cta-actions { width: 100%; flex-direction: column; }
      .cs-close .cta-actions .btn { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cs-clip, .cs-reel, .cs-site, .cs-mcard, .cs-link, .cs-tab, .cs-vid-play, .cs-toc ul a { transition: none; }
      .cs-clip:hover, .cs-reel:hover, .cs-site:hover, .cs-mcard:hover, .cs-link:hover { transform: none; }
    }
`;

// ---------- page JS (tabs, in-page nav, sideways rows) ----------
const pageJs = (redirects) => `
    (function () {
      var d = document;
      // Sideways rows: fade only the edge that has more to see.
      function watch(el) {
        function upd() {
          var max = el.scrollWidth - el.clientWidth;
          el.classList.toggle('--more-l', max > 2 && el.scrollLeft > 2);
          el.classList.toggle('--more-r', max > 2 && el.scrollLeft < max - 2);
        }
        el.addEventListener('scroll', upd, { passive: true });
        addEventListener('resize', upd);
        upd();
      }
      [].forEach.call(d.querySelectorAll('[data-cs-scroll]'), watch);
      // Keep an item of a sideways row in view without moving the page.
      function reveal(row, item) {
        if (!row || !item || row.scrollWidth <= row.clientWidth + 2) return;
        var l = item.offsetLeft - 24, r = item.offsetLeft + item.offsetWidth + 24;
        var to = l < row.scrollLeft ? l : r > row.scrollLeft + row.clientWidth ? r - row.clientWidth : null;
        if (to !== null) row.scrollTo({ left: Math.max(0, to), behavior: 'smooth' });
      }

      // Hub: service tabs. The URL hash (#social, #ads, #web) picks the tab and
      // survives reload and back. Old one-page links (#the-fatty-crab) go to the case page.
      var old = ${JSON.stringify(redirects)};
      var list = d.querySelector('.cs-tabs[role="tablist"]');
      if (list) {
        var h = location.hash.slice(1);
        if (old[h]) { location.replace(old[h]); return; }
        var tabs = [].slice.call(list.querySelectorAll('[role="tab"]'));
        var panels = tabs.map(function (t) { return d.getElementById(t.getAttribute('aria-controls')); });
        var ids = panels.map(function (p) { return p.id; });
        var bar = list.parentNode;
        panels.forEach(function (p, i) { p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', tabs[i].id); p.setAttribute('tabindex', '-1'); });
        var select = function (id, scroll) {
          var i = ids.indexOf(id); if (i < 0) i = 0;
          tabs.forEach(function (t, j) {
            var on = j === i;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
            panels[j].hidden = !on;
          });
          reveal(list, tabs[i]);
          if (scroll) {
            var top = panels[i].getBoundingClientRect().top;
            if (top < bar.getBoundingClientRect().bottom || top > innerHeight - 140) panels[i].scrollIntoView({ block: 'start' });
          }
        };
        tabs.forEach(function (t, i) {
          t.addEventListener('click', function () {
            if (location.hash !== '#' + ids[i]) history.pushState(null, '', '#' + ids[i]);
            select(ids[i], true);
          });
        });
        list.addEventListener('keydown', function (e) {
          var i = tabs.indexOf(d.activeElement); if (i < 0) return;
          var k = e.key, n = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : null;
          if (n === null) return;
          e.preventDefault();
          n = (n + tabs.length) % tabs.length;
          tabs[n].focus();
          tabs[n].click();
        });
        var fromUrl = function () { var x = location.hash.slice(1); if (old[x]) { location.replace(old[x]); return; } select(ids.indexOf(x) >= 0 ? x : ids[0], ids.indexOf(x) >= 0); };
        addEventListener('popstate', fromUrl);
        addEventListener('hashchange', fromUrl);
        select(ids.indexOf(h) >= 0 ? h : ids[0], false);
        if (ids.indexOf(h) >= 0) addEventListener('load', function () { panels[ids.indexOf(h)].scrollIntoView({ block: 'start', behavior: 'instant' }); });
      }

      // Case page: in-page nav highlights the section you are reading.
      var toc = d.querySelector('.cs-toc');
      if (toc) {
        var links = [].slice.call(toc.querySelectorAll('ul a[href^="#"]'));
        var secs = links.map(function (a) { return d.getElementById(a.getAttribute('href').slice(1)); });
        var row = toc.querySelector('ul');
        var cur = -1, ticking = false;
        var spy = function () {
          ticking = false;
          var line = toc.getBoundingClientRect().bottom + 40;
          if (innerWidth >= 900) line = innerHeight * 0.35;
          var k = 0;
          secs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= line) k = i; });
          if (innerHeight + scrollY >= d.documentElement.scrollHeight - 4) {
            var last = secs[secs.length - 1];
            if (last && last.getBoundingClientRect().top < innerHeight) k = secs.length - 1;
          }
          if (k === cur) return;
          cur = k;
          links.forEach(function (a, i) {
            a.classList.toggle('--on', i === k);
            if (i === k) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
          });
          reveal(row, links[k].parentNode);
        };
        addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
        addEventListener('resize', spy);
        spy();
      }
    })();
`;

// ---------- validation / lint ----------
const DASH_RE = /[\u2013\u2014]|&mdash;|&ndash;|&#821[12];|&#x201[34];/i;

function validateCase(c, file) {
  const errs = [];
  const str = (v, k) => { if (typeof v !== 'string' || !v.trim()) errs.push(`${k} must be a non-empty string`); };
  const arr = (v, k) => { if (!Array.isArray(v)) { errs.push(`${k} must be an array`); return []; } return v; };
  ['slug', 'lang', 'service', 'client', 'metaTitle', 'metaDescription', 'ldHeadline', 'h1', 'h1Sub', 'answer', 'descriptor'].forEach((k) => str(c[k], k));
  if (!['en', 'es'].includes(c.lang)) errs.push('lang must be "en" or "es"');
  if (!SERVICES.includes(c.service)) errs.push('service must be social|ads|web');
  arr(c.services, 'services').forEach((s, i) => { if (!SERVICES.includes(s)) errs.push(`services[${i}] must be social|ads|web`); });
  arr(c.organizations, 'organizations').forEach((s, i) => str(s, `organizations[${i}]`));
  if (!c.hero || !['video', 'image', 'graphic', 'logos', 'device'].includes(c.hero.type)) errs.push('hero.type must be video|image|graphic|logos|device');
  if (!c.card || typeof c.card.value !== 'string') errs.push('card.value is required');
  const m = arr(c.metrics, 'metrics');
  if (m.length !== 3) errs.push('metrics must have exactly 3 items');
  m.forEach((x, i) => ['value', 'label', 'meaning'].forEach((k) => str(x && x[k], `metrics[${i}].${k}`)));
  arr(c.situation && c.situation.paragraphs, 'situation.paragraphs').forEach((p, i) => str(p, `situation.paragraphs[${i}]`));
  arr(c.steps && c.steps.items, 'steps.items').forEach((s, i) => { str(s && s.title, `steps.items[${i}].title`); str(s && s.bodyHtml, `steps.items[${i}].bodyHtml`); });
  if (c.results) (c.results.accounts || []).forEach((a, i) => ['name', 'period', 'campaigns', 'roas', 'conversions', 'value', 'costPer'].forEach((k) => str(a && a[k], `results.accounts[${i}].${k}`)));
  if (c.quote) ['text', 'name', 'role'].forEach((k) => str(c.quote[k], `quote.${k}`));
  arr(c.links, 'links').forEach((l, i) => { str(l && l.href, `links[${i}].href`); str(l && l.text, `links[${i}].text`); });
  const expect = path.basename(file).match(/^([a-z0-9-]+)\.(en|es)\.json$/);
  if (!expect || c.slug !== expect[1] || c.lang !== expect[2]) errs.push('slug/lang do not match the file name');
  return errs;
}

function lintStrings(obj, lang, warn, prefix = '') {
  const checkHref = (href, k) => {
    if (/^(tel:|mailto:|#)/.test(href)) return;
    const clean = href.replace(/#.*$/, '');
    if (!ALLOWED_PATHS.has(clean)) warn.push(`${k}: link ${href} is not in the SPEC URL list`);
    if ((lang === 'es') !== clean.startsWith('/es/')) warn.push(`${k}: link ${href} points at the wrong language`);
  };
  const walk = (v, k) => {
    if (typeof v === 'string') {
      if (DASH_RE.test(v)) warn.push(`${k}: contains an em/en dash`);
      if (/Html$/.test(k)) {
        const bad = (v.match(/<\/?([a-z0-9]+)/gi) || []).map((t) => t.replace(/[</]/g, '').toLowerCase()).filter((t) => !['a', 'strong', 'em'].includes(t));
        if (bad.length) warn.push(`${k}: tags other than <a>, <strong>, <em>: ${[...new Set(bad)].join(', ')}`);
        for (const href of [...v.matchAll(/href="([^"]*)"/g)].map((x) => x[1])) checkHref(href, k);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${k}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => walk(vv, k ? `${k}.${kk}` : kk));
  };
  walk(obj, prefix);
  return checkHref;
}

function lintCase(c) {
  const warn = [];
  const checkHref = lintStrings(c, c.lang, warn);
  (c.links || []).forEach((l, i) => l && l.href && checkHref(l.href, `links[${i}].href`));
  const words = (s) => stripTags(s).split(/\s+/).filter(Boolean).length;
  if (words(c.answer) > 30) warn.push(`answer is ${words(c.answer)} words (max 30)`);
  if (c.metaDescription.length < 140 || c.metaDescription.length > 160) warn.push(`metaDescription is ${c.metaDescription.length} chars (want 140-160)`);
  if (c.metaTitle.length > 60) warn.push(`metaTitle is ${c.metaTitle.length} chars (want <= 60)`);
  if (!/\| Button Up Media$/.test(c.metaTitle)) warn.push('metaTitle should end with "| Button Up Media"');
  // Unconfirmed numbers stay out of JSON-LD (ldHeadline, metaDescription, organizations).
  const ld = [c.ldHeadline, c.metaDescription, ...(c.organizations || [])].join(' ');
  (c.metrics || []).forEach((m, i) => { if (m && m.reviewNote && ld.includes(m.value)) warn.push(`metrics[${i}].value "${m.value}" has a review note but appears in JSON-LD text`); });
  return warn;
}

function lintHub(h) {
  const warn = [];
  lintStrings(h, h.lang, warn);
  if (h.metaDescription.length < 140 || h.metaDescription.length > 160) warn.push(`metaDescription is ${h.metaDescription.length} chars (want 140-160)`);
  if (h.metaTitle.length > 60) warn.push(`metaTitle is ${h.metaTitle.length} chars (want <= 60)`);
  const words = stripTags(h.answer).split(/\s+/).filter(Boolean).length;
  if (words > 30) warn.push(`answer is ${words} words (max 30)`);
  return warn;
}

// Every local /media, /images, /videos path a content file names must exist.
async function lintAssets(root, obj, label, warn) {
  const paths = new Set();
  const walk = (v, k) => {
    if (typeof v === 'string' && /^(\/|videos\/)(media|images|videos)?/.test(v) && /\.(avif|webp|png|jpe?g|svg|mp4)$/i.test(v)) paths.add(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x));
  };
  walk(obj);
  for (const p of paths) {
    try { await access(path.join(root, p.replace(/^\/+/, ''))); } catch { warn.push(`${label}: asset ${p} does not exist`); }
  }
}

// ---------- shared render helpers ----------
const tagClass = (s) => (s === 'social' ? '' : ` --${s}`);
const areaHref = (c) => (c.area && c.area.page ? areaPath(c.area.page, c.lang) : null);

function headHtml({ t, chrome, title, description, url, enUrl, esUrl, ogImage, schema, preload }) {
  const alternates = [
    enUrl ? `<link rel="alternate" hreflang="en" href="${enUrl}" />` : '',
    esUrl ? `<link rel="alternate" hreflang="es" href="${esUrl}" />` : '',
    `<link rel="alternate" hreflang="x-default" href="${enUrl || esUrl}" />`,
  ].filter(Boolean).join('\n  ');
  const og = abs(ogImage);
  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${chrome.consent}
  ${chrome.gtm}
  <script>document.documentElement.classList.add("cs-js");</script>
  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(description)}" />
  <link rel="icon" type="image/svg+xml" href="/favicon-bum.svg" />
  <link rel="canonical" href="${url}" />
  ${alternates}
  <meta name="theme-color" content="#0b0d10" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="${t.ogLocale}" />
  ${enUrl && esUrl ? `<meta property="og:locale:alternate" content="${t.ogLocaleAlt}" />` : ''}
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${og}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${og}" />
  ${chrome.fonts}
  ${preload ? `<link rel="preload" as="image" href="${preload}" fetchpriority="high" />` : ''}
  ${chrome.lucide}
  <link rel="stylesheet" href="/shared.css?v=${chrome.cssVer}" />
  <script type="application/ld+json">
${ldJson(schema)}
  </script>
  <style>${PAGE_CSS}  </style>
</head>`;
}

function closeCta(hub, t) {
  const q = hub.cta.quote;
  return `    <section class="cs-close" aria-labelledby="cs-close-title">
      <div class="cta-banner">
        <div class="cta-content">
          <h2 id="cs-close-title">${esc(hub.cta.h2)}</h2>
          <p>${esc(hub.cta.body)}</p>
          <p class="cs-close-proof"><b>${esc(hub.cta.rating)}.</b> “${esc(q.text)}” <cite>${esc(q.name)}, ${esc(q.role)}</cite></p>
        </div>
        <div class="cta-actions">
          <a href="${t.contact}" class="btn btn-primary cs-btn">${esc(t.primary)} ${ICON.arrow}</a>
          <a href="${t.grader}" class="btn cs-btn">${esc(t.graderBtn)}</a>
        </div>
      </div>
    </section>`;
}

function pageTail(chrome, redirects) {
  return `
    <!-- FOOTER -->
    ${chrome.footer}
  </main>

  <script>${pageJs(redirects)}  </script>
  <script src="/shared.js?v=${chrome.jsVer}" defer></script>
</body>
</html>
`;
}

// Typographic card for a client with no media yet. compact = reel card version
// (the card footer already shows the number, so only the name block renders).
function graphicCard(g, { compact = false } = {}) {
  return `<div class="cs-graphic" aria-hidden="true">
              <div>
                <span class="cs-graphic-kicker">${esc(g.kicker)}</span>
                <span class="cs-graphic-name">${esc(g.name)}</span>
                <span class="cs-graphic-sub">${esc(g.sub)}</span>
              </div>${compact ? '' : `
              <div>
                <span class="cs-graphic-big">${esc(g.big)}</span>
                <span class="cs-graphic-label">${esc(g.bigLabel)}</span>
                <span class="cs-graphic-handle">${esc(g.handle)}</span>
              </div>`}
            </div>`;
}

function deviceMock(h, { url = true, lazy = true } = {}) {
  const load = lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"';
  return `<div class="cs-dev">
              <div class="cs-dev-browser">
                <div class="cs-dev-bar" aria-hidden="true"><i></i><i></i><i></i>${url && h.url ? `<span class="cs-dev-url">${esc(h.url)}</span>` : ''}</div>
                <img src="${h.desktop.src}" alt="${escAttr(h.desktop.alt)}" ${dim(h.desktop)}${load} />
              </div>
              <div class="cs-dev-phone"><img src="${h.mobile.src}" alt="${escAttr(h.mobile.alt)}" ${dim(h.mobile)}${load} /></div>
            </div>`;
}

// One scoreboard row; used on the hub (with a case link) and on ads case pages.
function scoreRow(a, t, link, max) {
  const pct = typeof a.roasNumber === 'number' && max ? Math.max(4, Math.round((a.roasNumber / max) * 100)) : 0;
  const word = typeof a.roasNumber !== 'number';
  const foot = [a.spend ? `<b>${esc(t.spend)}:</b> ${esc(a.spend)}.` : '', a.standout ? `<b>${esc(t.standout)}</b> ${esc(a.standout)}` : ''].filter(Boolean).join(' ');
  return `<li class="cs-row">
              <div class="cs-row-acct"><h3>${esc(a.name)}</h3><p>${esc(a.campaigns)} · ${esc(a.period)}</p></div>
              <div class="cs-row-roas"><span class="cs-k">${esc(t.col.roas)}</span><b${word ? ' class="--word"' : ''}>${esc(a.roas)}</b>${pct ? `<span class="cs-bar" aria-hidden="true"><i style="--w:${pct}%"></i></span>` : '<span></span>'}${a.roasLabel ? `<span class="cs-roas-note">${esc(a.roasLabel)}</span>` : ''}</div>
              <div class="cs-row-stat"><span class="cs-k">${esc(t.col.conversions)}</span><b>${esc(a.conversions)}</b></div>
              <div class="cs-row-stat"><span class="cs-k">${esc(t.col.costPer)}</span><b>${esc(a.costPer)}</b></div>
              <div class="cs-row-stat"><span class="cs-k">${esc(t.col.value)}</span><b>${esc(a.value)}</b></div>
              ${link ? `<a class="cs-row-go" href="${link.href}">${esc(t.readCase)}<span class="cs-sr">: ${esc(link.client)}</span> ${ICON.arrow}</a>` : ''}
              ${!link && foot ? `<p class="cs-row-foot">${foot}</p>` : ''}
            </li>`;
}

function scoreboard(rows, t, withLinks) {
  const max = Math.max(...rows.map((r) => (typeof r.a.roasNumber === 'number' ? r.a.roasNumber : 0)));
  return `<div class="cs-board${withLinks ? ' --links' : ''}">
            <div class="cs-board-head" aria-hidden="true"><span>${esc(t.col.account)}</span><span>${esc(t.col.roas)}</span><span>${esc(t.col.conversions)}</span><span>${esc(t.col.costPer)}</span><span>${esc(t.col.value)}</span>${withLinks ? '<span></span>' : ''}</div>
            <ol class="cs-rows">
            ${rows.map((r) => scoreRow(r.a, t, withLinks ? r.link : null, max)).join('\n            ')}
            </ol>
          </div>`;
}

// ---------- HUB ----------
function renderHub(hub, cases, chrome, t, alt) {
  const lang = hub.lang;
  const url = abs(hubPath(lang));
  const bySlug = new Map(cases.map((c) => [c.slug, c]));
  const S = hub.sections;

  const h1 = (() => {
    const e = esc(hub.h1); const a = esc(hub.h1Accent || '');
    const i = a ? e.lastIndexOf(a) : -1;
    return i < 0 ? e : `${e.slice(0, i)}<span class="cs-gold">${a}</span>${e.slice(i + a.length)}`;
  })();

  const wall = hub.wall.filter((w) => bySlug.has(w.slug)).map((w, i) => {
    const c = bySlug.get(w.slug);
    return `<li><a class="cs-frame cs-portrait cs-clip" href="${casePath(w.slug, lang)}" aria-label="${escAttr(t.clipLabel(c.client, w.chip))}">
              <video data-video-src="${videoSrc(w.src)}" poster="${w.poster}" ${dim(w)} muted loop playsinline preload="none" aria-hidden="true"></video>
              <span class="cs-clip-meta" aria-hidden="true"><b>${esc(w.chip.split(' ')[0])}<small> ${esc(w.chip.split(' ').slice(1).join(' '))}</small></b><span>${esc(c.client)}</span></span>
            </a></li>`;
  }).join('\n            ');

  // Social reel cards
  const social = (S.social.order || []).filter((s) => bySlug.has(s)).map((s) => {
    const c = bySlug.get(s);
    const k = c.card;
    const media = k.src
      ? `<img src="${k.src}" alt="" ${dim(k)} loading="lazy" decoding="async" />`
      : (c.hero.type === 'graphic' ? graphicCard(c.hero, { compact: true }) : '');
    return `<li><a class="cs-reel" href="${casePath(s, lang)}">
              ${media}
              <span class="cs-reel-area">${ICON.pin}${esc(k.place || (c.area ? c.area.name : c.descriptor))}</span>
              <span class="cs-reel-foot">
                <b class="cs-reel-num">${esc(k.value)}</b>
                <span class="cs-reel-label">${esc(k.label)}</span>
                <strong class="cs-reel-name">${esc(c.client)}</strong>
                <span class="cs-reel-go">${esc(t.readCase)} ${ICON.arrow}</span>
              </span>
            </a></li>`;
  }).join('\n            ');

  // Ads scoreboard: every account from every ads case, best ROAS first
  const adRows = cases
    .filter((c) => c.services.includes('ads') && c.results && c.results.accounts)
    .flatMap((c) => c.results.accounts.map((a) => ({ a, link: { href: casePath(c.slug, lang), client: c.client } })))
    .sort((x, y) => (typeof y.a.roasNumber === 'number' ? y.a.roasNumber : -1) - (typeof x.a.roasNumber === 'number' ? x.a.roasNumber : -1));

  // Website device cards
  const web = (S.web.order || []).filter((s) => bySlug.has(s) && bySlug.get(s).webCard).map((s) => {
    const c = bySlug.get(s);
    const w = c.webCard;
    const media = w.device && c.hero.type === 'device'
      ? deviceMock(c.hero, { url: false })
      : `<img src="${w.image.src}" alt="${escAttr(w.image.alt)}" ${dim(w.image)} loading="lazy" decoding="async" />`;
    return `<li><a class="cs-site" href="${casePath(s, lang)}">
              <span class="cs-site-media">${media}</span>
              <span class="cs-site-copy">
                <span class="cs-site-kicker">${esc(w.kicker)}</span>
                <strong class="cs-site-title">${esc(w.title)}</strong>
                <span class="cs-site-body">${esc(w.body)}</span>
                <span class="cs-site-go">${esc(t.readCase)} ${ICON.arrow}</span>
              </span>
            </a></li>`;
  }).join('\n            ');

  const counts = { social: (S.social.order || []).filter((s) => bySlug.has(s)).length, ads: adRows.length, web: (S.web.order || []).filter((s) => bySlug.has(s) && bySlug.get(s).webCard).length };
  const tab = (id) => `<button type="button" class="cs-tab" role="tab" id="tab-${id}" aria-controls="${id}" aria-selected="${id === 'social' ? 'true' : 'false'}"${id === 'social' ? '' : ' tabindex="-1"'}><span>${esc(S[id].tab)}</span><span class="cs-tab-n">${counts[id]}<span class="cs-sr"> ${esc(t.count[id])}</span></span></button>`;
  const kicker = (id) => `<p class="cs-panel-kicker">${counts[id]} ${esc(t.count[id])}</p>`;

  const ordered = [...cases].sort((a, b) => (a.order || 99) - (b.order || 99));
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [
        { '@type': 'ListItem', position: 1, name: t.home, item: t.homeUrl },
        { '@type': 'ListItem', position: 2, name: t.hubName, item: url },
      ] },
      { '@type': ['Organization', 'ProfessionalService'], '@id': ORG_ID, name: 'Button Up Media', url: `${BASE}/` },
      {
        '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: hub.h1, description: hub.metaDescription, inLanguage: lang,
        about: { '@id': ORG_ID }, publisher: { '@id': ORG_ID }, breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: {
          '@type': 'ItemList', '@id': `${url}#cases`, numberOfItems: ordered.length,
          itemListElement: ordered.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(casePath(c.slug, lang)), name: c.ldHeadline })),
        },
      },
    ],
  };

  const redirects = Object.fromEntries(cases.map((c) => [c.slug, casePath(c.slug, lang)]));
  const firstPoster = hub.wall[0] && hub.wall[0].poster;

  return `${headHtml({ t, chrome, title: hub.metaTitle, description: hub.metaDescription, url, enUrl: lang === 'en' ? url : alt ? abs(hubPath('en')) : null, esUrl: lang === 'es' ? url : alt ? abs(hubPath('es')) : null, ogImage: hub.ogImage || DEFAULT_OG, schema, preload: firstPoster })}
<body>
  ${chrome.gtmNoscript}

  ${chrome.depth}

  ${chrome.nav}

  <main class="page cs-page cs-hubpage">

    <!-- HERO -->
    <section class="cs-hero">
      <div class="cs-hero-grid">
        <div class="cs-hero-copy">
          <p class="cs-eyebrow">${esc(hub.eyebrow)}</p>
          <h1>${h1}</h1>
          <p class="cs-lede">${esc(hub.answer)}</p>
          <div class="cs-cta-row">
            <a href="${t.contact}" class="btn btn-primary cs-btn">${esc(hub.primaryCta)} ${ICON.arrow}</a>
            <a href="${t.grader}" class="btn cs-btn">${esc(hub.secondaryCta)}</a>
          </div>
        </div>
        <ul class="cs-wall" aria-label="${escAttr(hub.wallLabel)}" data-cs-scroll>
            ${wall}
        </ul>
      </div>
    </section>

    <!-- LIBRARY: one tab per service; without JS all three sections show stacked -->
    <section class="cs-lib" aria-label="${escAttr(hub.tabsLabel)}">
      <div class="cs-tabs-bar">
        <div class="cs-tabs" role="tablist" aria-label="${escAttr(hub.tabsLabel)}" data-cs-scroll>
          ${SERVICES.map(tab).join('\n          ')}
        </div>
      </div>

      <div class="cs-panel --social" id="social">
        ${kicker('social')}
        <h2>${esc(S.social.h2)}</h2>
        <p class="cs-panel-intro">${esc(S.social.intro)}</p>
        <ul class="cs-reels">
            ${social}
        </ul>
      </div>

      <div class="cs-panel --ads" id="ads">
        ${kicker('ads')}
        <h2>${esc(S.ads.h2)}</h2>
        <p class="cs-panel-intro">${esc(S.ads.intro)}</p>
        <p class="cs-explain">${S.ads.roasLineHtml}</p>
        ${scoreboard(adRows, t, true)}
        <div class="cs-totals">
          <h3>${esc(S.ads.totals.h3)}</h3>
          <ul>
            ${S.ads.totals.items.map((x) => `<li><b>${esc(x.value)}</b><span>${esc(x.label)}</span></li>`).join('\n            ')}
          </ul>
          ${note(S.ads.totals)}
        </div>
        <p class="cs-disclaimer">${esc(S.ads.disclaimer)}</p>
      </div>

      <div class="cs-panel --web" id="web">
        ${kicker('web')}
        <h2>${esc(S.web.h2)}</h2>
        <p class="cs-panel-intro">${esc(S.web.intro)}</p>
        <ul class="cs-sites">
            ${web}
        </ul>
      </div>
    </section>

    <!-- CLOSING CTA -->
${closeCta(hub, t)}
${pageTail(chrome, redirects)}`;
}

// ---------- CASE PAGE ----------
function heroMedia(c, t) {
  const h = c.hero;
  const chip = h.chip ? `<span class="cs-chip">${esc(h.chip)}</span>` : '';
  if (h.type === 'video') {
    return `<figure class="cs-frame cs-portrait">
              <video data-video-src="${videoSrc(h.src)}" poster="${h.poster}" ${dim(h)} muted loop playsinline preload="none" aria-label="${escAttr(h.alt)}"></video>
              ${chip}
            </figure>`;
  }
  if (h.type === 'image') {
    return `<figure class="cs-frame cs-portrait">
              <img src="${h.src}" alt="${escAttr(h.alt)}" ${dim(h)} fetchpriority="high" decoding="async" />
              ${chip}
            </figure>`;
  }
  if (h.type === 'graphic') return `<div class="cs-frame cs-portrait --card" role="img" aria-label="${escAttr(`${h.name} ${h.sub}: ${h.big} ${h.bigLabel}, ${h.handle}`)}">${graphicCard(h)}</div>`;
  if (h.type === 'logos') {
    return `<div class="cs-frame cs-portrait --card cs-logos">
              <div><span class="cs-logos-big">${esc(h.big)}</span><span class="cs-logos-label">${esc(h.bigLabel)}</span></div>
              <div class="cs-logos-wall">
                ${h.logos.map((l) => `<img src="${l.src}" alt="${escAttr(l.alt)}" ${dim(l)} decoding="async" />`).join('\n                ')}
              </div>
            </div>`;
  }
  return deviceMock(h, { lazy: false });
}

function relatedCases(c, all) {
  const others = all.filter((x) => x.slug !== c.slug).sort((a, b) => (a.order || 99) - (b.order || 99));
  const same = others.filter((x) => x.service === c.service || x.services.includes(c.service));
  return [...same, ...others.filter((x) => !same.includes(x))].slice(0, 2);
}

function renderCase(c, all, hub, chrome, t, areaNames, alt) {
  const lang = c.lang;
  const url = abs(casePath(c.slug, lang));
  const hubUrl = abs(hubPath(lang));
  const ids = t.ids;
  const hasResults = true; // metric tiles always render
  const sections = [
    ['situation', true],
    ['steps', true],
    ['results', hasResults],
    ['quote', !!c.quote],
  ].filter(([, on]) => on).map(([k]) => k);

  const tags = c.services.map((s) => `<li class="cs-tag${tagClass(s)}">${esc(t.service[s])}</li>`).join('');
  const meta = [
    c.area ? `<li>${ICON.pin}<span>${esc(c.area.name)}${c.area.detail ? ` (${esc(c.area.detail)})` : ''}</span></li>` : '',
    `<li>${ICON.store}<span>${esc(c.descriptor)}</span></li>`,
    c.timeframe ? `<li>${ICON.cal}<span>${esc(c.timeframe)}</span></li>` : '',
  ].filter(Boolean).join('\n            ');

  const glance = c.metrics.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join('\n          ');

  const steps = c.steps.items.map((s, i) => `<li class="cs-step">
                <span class="cs-step-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>${esc(s.title)}</h3>
                  <p>${s.bodyHtml}</p>
                  ${s.figure ? `<figure class="cs-fig${/mockup/.test(s.figure.src) ? ' --mock' : ''}"><img src="${s.figure.src}" alt="${escAttr(s.figure.alt)}" ${dim(s.figure)} loading="lazy" decoding="async" />${s.figure.caption ? `<figcaption>${esc(s.figure.caption)}</figcaption>` : ''}</figure>` : ''}
                  ${note(s)}
                </div>
              </li>`).join('\n              ');

  const r = c.results || {};
  const tiles = c.metrics.map((m) => `<li class="cs-tile">
                <b>${esc(m.value)}</b>
                <span class="cs-tile-label">${esc(m.label)}</span>
                <p><span class="cs-plain">${esc(t.plain)}</span>${esc(m.meaning)}</p>
                ${note(m)}
              </li>`).join('\n              ');
  const accounts = (r.accounts || []).length ? scoreboard(r.accounts.map((a) => ({ a })), t, false) : '';
  const points = (r.points || []).length
    ? `<ul class="cs-points">${r.points.map((p) => `<li>${ICON.check}${esc(p)}</li>`).join('')}</ul>`
    : '';

  const q = c.quote;
  const quote = q ? `<div class="cs-words${q.video ? ' --video' : ''}">
              ${q.video ? `<div class="cs-frame cs-portrait cs-vid hp2-vid-card" data-audio-managed="true">
                <video data-video-src="${videoSrc(q.video.src)}" poster="${q.video.poster}" ${dim(q.video)} playsinline preload="none"></video>
                <button type="button" class="cs-vid-play" aria-label="${escAttr(q.video.playLabel)}"></button>
                <div class="cs-vid-cap"><b>${esc(q.name)}</b><span>${esc(t.tapSound)}</span></div>
              </div>` : ''}
              <figure class="cs-quote">
                <blockquote><p>“${esc(q.text)}”</p></blockquote>
                <figcaption><b>${esc(q.name)}</b>, ${esc(q.role)}${q.source ? ` (${esc(q.source)})` : ''}</figcaption>
                ${note(q)}
              </figure>
            </div>` : '';

  const aHref = areaHref(c);
  const links = [
    ...c.links,
    ...(aHref ? [{ href: aHref, text: t.areaLink(areaNames[lang][c.area.page] || c.area.name) }] : []),
  ].map((l) => `<a class="cs-link" href="${l.href}">${esc(l.text)} ${ICON.arrow}</a>`).join('\n            ');

  const related = relatedCases(c, all).map((x) => {
    const k = x.card;
    const thumb = k.src ? `<img src="${k.src}" alt="" ${dim(k)} loading="lazy" decoding="async" />` : `<b>${esc(k.value)}</b>`;
    return `<li><a class="cs-mcard" href="${casePath(x.slug, lang)}">
              <span class="cs-mcard-thumb">${thumb}</span>
              <span>
                <span class="cs-mcard-tag">${esc(t.service[x.service])}</span>
                <span class="cs-mcard-name">${esc(x.client)}</span>
                <span class="cs-mcard-num"><strong>${esc(k.value)}</strong> ${esc(k.label)}</span>
                <span class="cs-mcard-go">${esc(t.readCase)} ${ICON.arrow}</span>
              </span>
            </a></li>`;
  }).join('\n          ');

  const orgs = c.organizations.map((n) => ({ '@type': 'Organization', name: n }));
  const ogImage = c.ogImage || (c.hero.type === 'video' ? c.hero.poster : c.hero.type === 'image' && !/\.avif$/.test(c.hero.src) ? c.hero.src : c.hero.type === 'device' ? c.hero.desktop.src : (c.card && c.card.src && !/\.avif$/.test(c.card.src) ? c.card.src : DEFAULT_OG));
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [
        { '@type': 'ListItem', position: 1, name: t.home, item: t.homeUrl },
        { '@type': 'ListItem', position: 2, name: t.hubName, item: hubUrl },
        { '@type': 'ListItem', position: 3, name: c.crumb || c.client, item: url },
      ] },
      { '@type': ['Organization', 'ProfessionalService'], '@id': ORG_ID, name: 'Button Up Media', url: `${BASE}/` },
      {
        '@type': 'Article', '@id': `${url}#article`, headline: c.ldHeadline, description: c.metaDescription, inLanguage: lang,
        url, mainEntityOfPage: url, image: abs(ogImage),
        about: orgs.length === 1 ? orgs[0] : orgs,
        author: { '@id': ORG_ID }, publisher: { '@id': ORG_ID },
        isPartOf: { '@id': `${hubUrl}#webpage` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  const preload = c.hero.type === 'video' ? c.hero.poster : null;
  const heroNotes = [note(c.hero), c.timeframeReviewNote ? note({ reviewNote: `${c.timeframe}: ${c.timeframeReviewNote}` }) : ''].join('');
  const wide = c.hero.type === 'device';
  const sec = (k, inner) => `            <section class="cs-sec" id="${ids[k]}" aria-labelledby="${ids[k]}-h">
              <h2 id="${ids[k]}-h">${esc((c[k] && c[k].h2) || t.nav[k])}</h2>
${inner}
            </section>`;

  return `${headHtml({ t, chrome, title: c.metaTitle, description: c.metaDescription, url, enUrl: lang === 'en' ? url : alt ? abs(casePath(c.slug, 'en')) : null, esUrl: lang === 'es' ? url : alt ? abs(casePath(c.slug, 'es')) : null, ogImage, schema, preload })}
<body>
  ${chrome.gtmNoscript}

  ${chrome.depth}

  ${chrome.nav}

  <main class="page cs-page cs-casepage">

    <nav class="cs-crumbs" aria-label="${escAttr(t.crumbs)}">
      <ol>
        <li><a href="${hubPath(lang)}">${esc(t.hubName)}</a></li>
        <li><span aria-current="page">${esc(c.crumb || c.client)}</span></li>
      </ol>
    </nav>

    <!-- HERO: the case file -->
    <section class="cs-chero${wide ? ' --wide' : ''}">
      <div class="cs-chero-grid">
        <div class="cs-chero-copy">
          <ul class="cs-tags" aria-label="${escAttr(t.caseLabel)}">${tags}</ul>
          <h1><span class="cs-h1-name">${esc(c.h1)}</span><span class="cs-sr">: </span><span class="cs-h1-sub">${esc(c.h1Sub)}</span></h1>
        </div>
        <div class="cs-chero-media">
            ${heroMedia(c, t)}
        </div>
        <ul class="cs-meta">
            ${meta}
        </ul>
        <p class="cs-lede">${esc(c.answer)}</p>
        <div class="cs-cta-row">
          <a href="${t.contact}" class="btn btn-primary cs-btn">${esc(t.primary)} ${ICON.arrow}</a>
        </div>${heroNotes ? `
        <div class="cs-hero-notes">${heroNotes}</div>` : ''}
      </div>
      <dl class="cs-glance" aria-label="${escAttr(t.glance)}">
          ${glance}
      </dl>
    </section>

    <div class="cs-body">
      <nav class="cs-toc" aria-label="${escAttr(t.onPage)}">
        <p class="cs-toc-title">${esc(t.onPage)}</p>
        <ul data-cs-scroll>
          ${sections.map((k) => `<li><a href="#${ids[k]}">${esc(t.nav[k])}</a></li>`).join('\n          ')}
        </ul>
        <a class="cs-toc-all" href="${hubPath(lang)}">${ICON.back} ${esc(t.allCases)}</a>
      </nav>

      <div class="cs-content">
${sec('situation', `              <div class="cs-sit">${c.situation.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
              ${note(c.situation)}`)}
${sec('steps', `              <ol class="cs-steps">
              ${steps}
              </ol>`)}
${sec('results', `              <ul class="cs-tiles">
              ${tiles}
              </ul>
              ${r.explainHtml ? `<p class="cs-explain">${r.explainHtml}</p>` : ''}
              ${accounts}
              ${points}
              ${note(r)}
              ${r.disclaimer ? `<p class="cs-disclaimer">${esc(t.disclaimer)}</p>` : ''}`)}
${q ? sec('quote', `              ${quote}`) : ''}
          <div class="cs-links">
            ${links}
          </div>
      </div>
    </div>

    <section class="cs-more" aria-labelledby="cs-more-h">
      <h2 id="cs-more-h">${esc(t.more)}</h2>
      <p>${esc(t.moreSub)}</p>
      <ul class="cs-more-grid">
          ${related}
      </ul>
      <a class="cs-back" href="${hubPath(lang)}">${ICON.back} ${esc(t.back)}</a>
    </section>

    <!-- CLOSING CTA -->
${closeCta(hub, t)}
${pageTail(chrome, {})}`;
}

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// ---------- entry point ----------
export async function buildCases(root, outDir, { strict = false, includeHubs = true } = {}) {
  const contentDir = path.join(root, 'cases', 'content');
  let files = [];
  try {
    files = (await readdir(contentDir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') { console.warn('build-cases: no cases/content directory, skipping case studies'); return ''; }
    throw err;
  }

  const problems = [];
  const hubs = {};
  const cases = { en: [], es: [] };
  for (const f of files) {
    let c;
    try { c = JSON.parse(await readFile(path.join(contentDir, f), 'utf8')); } catch (err) { problems.push(`${f}: invalid JSON (${err.message}), skipped`); continue; }
    if (/^hub\.(en|es)\.json$/.test(f)) {
      lintHub(c).forEach((w) => problems.push(`${f}: ${w}`));
      await lintAssets(root, c, f, problems);
      hubs[c.lang] = c;
      continue;
    }
    const errs = validateCase(c, f);
    if (errs.length) { problems.push(`${f}: skipped, ${errs.join('; ')}`); continue; }
    lintCase(c).forEach((w) => problems.push(`${f}: ${w}`));
    await lintAssets(root, c, f, problems);
    cases[c.lang].push(c);
  }
  for (const lang of ['en', 'es']) if (cases[lang].length && !hubs[lang]) problems.push(`hub.${lang}.json is missing, ${lang} pages skipped`);
  if (problems.length) {
    const msg = `build-cases:\n  ${problems.join('\n  ')}`;
    if (strict) throw new Error(msg);
    console.warn(msg);
  }

  const [chrome, areaNames] = await Promise.all([loadChrome(root), loadAreaNames(root)]);
  await mkdir(path.join(outDir, 'case-studies'), { recursive: true });
  await mkdir(path.join(outDir, 'casos-de-exito'), { recursive: true });

  const has = (slug, lang) => cases[lang].some((c) => c.slug === slug);
  const lastmod = todayET();
  const entries = [];
  const entry = (enP, esP, lang) => {
    const loc = abs(lang === 'en' ? enP : esP);
    const alts = enP && esP ? `
    <xhtml:link rel="alternate" hreflang="en" href="${abs(enP)}"/>
    <xhtml:link rel="alternate" hreflang="es" href="${abs(esP)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(enP)}"/>` : '';
    return `  <url>
    <loc>${loc}</loc>${alts}
    <lastmod>${lastmod}</lastmod>
  </url>`;
  };
  const write = async (rel, html, key) => {
    if (DASH_RE.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ''))) {
      const msg = `build-cases: rendered ${key} contains an em/en dash`;
      if (strict) throw new Error(msg);
      console.warn(msg);
    }
    await writeFile(path.join(outDir, rel), html);
  };

  const written = [];
  for (const lang of ['en', 'es']) {
    if (!hubs[lang] || !cases[lang].length) continue;
    const t = T[lang];
    const other = lang === 'en' ? 'es' : 'en';
    const list = [...cases[lang]].sort((a, b) => (a.order || 99) - (b.order || 99));
    const hubAlt = !!hubs[other] && cases[other].length > 0;
    await write(lang === 'en' ? 'case-studies.html' : 'case-studies-es.html', renderHub(hubs[lang], list, chrome[lang], t, hubAlt), `hub.${lang}`);
    if (includeHubs) entries.push(entry(hubAlt || lang === 'en' ? hubPath('en') : null, hubAlt || lang === 'es' ? hubPath('es') : null, lang));
    written.push(hubPath(lang));
    for (const c of list) {
      const alt = has(c.slug, other);
      await write(path.join(lang === 'en' ? 'case-studies' : 'casos-de-exito', `${c.slug}.html`), renderCase(c, list, hubs[lang], chrome[lang], t, areaNames, alt), `${c.slug}.${lang}`);
      entries.push(entry(alt || lang === 'en' ? casePath(c.slug, 'en') : null, alt || lang === 'es' ? casePath(c.slug, 'es') : null, lang));
      written.push(casePath(c.slug, lang));
    }
  }

  console.log(`Built case studies: ${written.length} pages`);
  return entries.join('\n');
}
