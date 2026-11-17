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
// Page chrome (consent mode, GTM, fonts, nav, footer, shared.js) is read from
// about.html / about-es.html at build time, the same way build-areas.mjs does,
// so these pages always match the live site. Every asset path is absolute
// because the pages are served at nested URLs. No icon library: the few icons
// are inline SVG.
//
// LAYOUT BY CASE TYPE (c.service). One family (same type, crumbs, label, H1,
// sticky section chips, related cases, closing CTA), three different pages:
//   social -> hero led by a real Reel (or the client's own video), the numbers
//             beside it; then the Reel strip, what made them work, the starting
//             point, what we did, where the numbers come from, the client's words.
//   ads    -> data-led "Wrapped" hero (gold, warm-white and black number blocks
//             from the 3 metrics); then what came back for every $1, a results
//             table, the starting point and what we did.
//   web    -> hero led by the site on a laptop and a phone, a spec row from the
//             metrics; then a walk through the site, the starting point, what we
//             built (steps with screenshots) and the client's words.
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
//   service: "social"|"ads"|"web",            // case type: picks the layout; related cases match on it
//   services: ["ads"],                        // every service this case covers, primary first
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
//   hero: [note]                              // one of:
//     { type: "video",   src: "media/x.mp4", poster, width, height, alt, views?, jump? }
//                         muted loop that plays in view; views: "52.5M" adds a view-count badge;
//                         jump: true adds a "Watch with sound" button that plays the first Reel below
//     { type: "talk" }    the client's own video (quote.video) as the hero, tap to play with sound;
//                         the quote section then shows the words only
//     { type: "image",   src, width, height, alt, chip? }
//     { type: "numbers" } ads: the 3 metrics as gold / warm-white / black blocks
//     { type: "device",  url, desktop: { src, width, height, alt }, mobile: { ... } }   laptop + phone
//   card: { src?, width?, height?, alt?, value, label, place? },   // hub reel card + related card (number block when no src)
//   webCard?: { kicker, title, body, device?: true, image?: { src, width, height, alt } }, // hub Websites card
//   metrics: [ { value, label, meaning, reviewNote? } x3 ],   // hero numbers (social stats, ads blocks, web spec row)
//   situation: { h2?, paragraphs: [] } [note],
//   steps: { h2?, items: [ { title, bodyHtml, figure?: { src, width, height, alt, caption }, reviewNote? } ] },
//   results: null | { h2?, explainHtml?, points?: [text],
//     accounts?: [ { name, period, campaigns, roas, roasLabel?, roasNumber|null, conversions, value, costPer,
//                    spend?, standout? } ],   // ads: the $1 bars + results table AND the hub Google Ads scoreboard
//     timeline?: { h3?, items: [ { when, title, stat, kind?: "before"|"peak"|"now" } ] },   // growth milestones, oldest first
//     disclaimer?: true } [note],
//   quote: null | { h2?, text, name, role, source?, video?: { src, poster, width, height, playLabel } } [note],
//   reels?: { h2, intro, items: [ { src, poster, width, height, views, likes?, title, date, alt, uploaded?, duration? } ] },
//                                             // the client's real videos, tap to play with sound;
//                                             // uploaded (YYYY-MM-DD) + duration (PT42S) also emit VideoObject JSON-LD
//   analysis?: { h2?, intro?, items: [ { stat, title, body } ] },   // social: "What made them work"
//   walkthrough?: { h2?, intro?, items: [ { src, width, height, alt, title, caption } ] },   // web: screens of the site
//   links: [ { href, text } ]                 // service pages etc.; the area page link is added automatically
// }
//
// cases/content/hub.{en|es}.json
// { lang, metaTitle, metaDescription, ogImage, eyebrow, h1, h1Accent?, answer, primaryCta, secondaryCta,
//   wallLabel, wall: [ { slug, src, poster, width, height, chip, alt } ],      // 2-3 hero clips
//   tabsLabel,
//   sections: {
//     social: { tab, h2, intro, order: [slug] },
//     ads:    { tab, h2, intro, roasLineHtml, totals: { h3, items: [{ value, label }] } [note], disclaimer },
//     web:    { tab, h2, intro, order: [slug] } },
//   cta: { h2, body, quote: { text, name, role }, rating } }
// Never show how many clients or ad accounts there are: no counts on tabs or headings.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, readdir, access } from 'fs/promises';
import path from 'path';

const BASE = 'https://www.buttonupmedia.com';
const ORG_ID = `${BASE}/#organization`;
const DEFAULT_OG = '/media/founders-duo.webp';
const SLUGS = ['tonis-sushi-bar', 'the-fatty-crab', 'brewing-buddha', 'shimuja-ramen', 'rusty-pelican', 'private-events', 'woa-cocktails'];
const SERVICES = ['social', 'ads', 'web'];
const HERO_TYPES = ['video', 'talk', 'image', 'numbers', 'device'];
const AREA_IDS = ['miami-beach', 'brickell', 'wynwood', 'coral-gables', 'kendall-pinecrest', 'doral', 'fort-lauderdale'];

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
  en: { 'miami-beach': 'Miami Beach', brickell: 'Brickell & Downtown Miami', wynwood: 'Wynwood', 'coral-gables': 'Coral Gables', 'kendall-pinecrest': 'Kendall & Pinecrest', doral: 'Doral', 'fort-lauderdale': 'Fort Lauderdale & Broward' },
  es: { 'miami-beach': 'Miami Beach', brickell: 'Brickell y Downtown Miami', wynwood: 'Wynwood', 'coral-gables': 'Coral Gables', 'kendall-pinecrest': 'Kendall y Pinecrest', doral: 'Doral', 'fort-lauderdale': 'Fort Lauderdale y Broward' },
};

const T = {
  en: {
    htmlLang: 'en', ogLocale: 'en_US', ogLocaleAlt: 'es_US',
    home: 'Home', homeUrl: `${BASE}/`, hubName: 'Case studies',
    contact: '/contact', grader: '/social-media-website-grader',
    primary: 'Book a free strategy call', graderBtn: 'Try the free grader',
    service: { social: 'Social media', ads: 'Paid ads', web: 'Website' },
    kind: { social: 'Social media case study', ads: 'Paid ads case study', web: 'Website case study' },
    // chip labels in the sticky "On this page" bar
    nav: { reels: 'The Reels', analysis: 'What worked', situation: 'The starting point', steps: 'What we did', results: 'The numbers', dollar: 'For every $1', table: 'Results', walk: 'The site', built: 'What we built', quote: 'In their words' },
    // default section headings (a content file can override with its own h2)
    h2: { analysis: 'What made them work', situation: 'The starting point', steps: 'What we did', results: 'Where the numbers come from', dollar: 'What came back for every $1', table: 'Results by restaurant', walk: 'A look through the site', built: 'What we built', quote: 'What the client says' },
    ids: { reels: 'the-reels', analysis: 'what-the-numbers-say', situation: 'situation', steps: 'what-we-did', results: 'results', dollar: 'for-every-dollar', table: 'results', walk: 'the-site', built: 'what-we-built', quote: 'in-their-words' },
    views: 'views', likes: 'likes', watchSound: 'Watch with sound', playWith: (x) => `Play “${x}” with sound`,
    onPage: 'On this page', allCases: 'All case studies', back: 'Back to all case studies',
    more: 'More case studies', moreSub: "Other restaurants we've worked with.",
    readCase: 'Read the case', standout: 'Highlights:',
    col: { account: 'Restaurant', roas: 'ROAS', conversions: 'Conversions', costPer: 'Cost per conversion', value: 'Conversion value', spend: 'Ad spend' },
    tableCaption: (x) => `Google Ads results for ${x}, 2025`,
    perDollar: {
      base: 'Spent on ads', baseSub: 'The cost, as the starting point', backSr: 'came back in tracked value',
      note: 'The first bar is $1 of ad spend. Each gold bar is the tracked value of the bookings, calls and inquiries that came back for that $1.',
    },
    disclaimer: 'Figures are from restaurant ad accounts we managed in 2025. Individual results vary, and past performance does not guarantee future results.',
    areaLink: (n) => `Restaurant marketing in ${n}`,
    crumbs: 'Breadcrumb', tapSound: 'Tap to play with sound',
    clipLabel: (client, chip) => `${client} case study, ${chip}`,
  },
  es: {
    htmlLang: 'es', ogLocale: 'es_US', ogLocaleAlt: 'en_US',
    home: 'Inicio', homeUrl: `${BASE}/es`, hubName: 'Casos de éxito',
    contact: '/es/contacto', grader: '/es/analizador-redes-sociales-web',
    primary: 'Agende una llamada estratégica gratis', graderBtn: 'Pruebe el analizador gratis',
    service: { social: 'Redes sociales', ads: 'Anuncios pagados', web: 'Sitio web' },
    kind: { social: 'Caso de éxito en redes sociales', ads: 'Caso de éxito en anuncios pagados', web: 'Caso de éxito de sitio web' },
    nav: { reels: 'Los reels', analysis: 'Lo que funcionó', situation: 'El punto de partida', steps: 'Lo que hicimos', results: 'Los números', dollar: 'Por cada $1', table: 'Resultados', walk: 'El sitio', built: 'Lo que construimos', quote: 'En sus palabras' },
    h2: { analysis: 'Lo que los hizo funcionar', situation: 'El punto de partida', steps: 'Lo que hicimos', results: 'De dónde salen los números', dollar: 'Lo que volvió por cada $1', table: 'Resultados por restaurante', walk: 'Un recorrido por el sitio', built: 'Lo que construimos', quote: 'Lo que dice el cliente' },
    ids: { reels: 'los-reels', analysis: 'que-dicen-los-numeros', situation: 'situacion', steps: 'lo-que-hicimos', results: 'resultados', dollar: 'por-cada-dolar', table: 'resultados', walk: 'el-sitio', built: 'lo-que-construimos', quote: 'en-sus-palabras' },
    views: 'vistas', likes: 'me gusta', watchSound: 'Ver con sonido', playWith: (x) => `Reproducir “${x}” con sonido`,
    onPage: 'En esta página', allCases: 'Todos los casos', back: 'Volver a todos los casos de éxito',
    more: 'Más casos de éxito', moreSub: 'Otros restaurantes con los que hemos trabajado.',
    readCase: 'Ver el caso', standout: 'Lo más destacado:',
    col: { account: 'Restaurante', roas: 'ROAS', conversions: 'Conversiones', costPer: 'Costo por conversión', value: 'Valor de conversión', spend: 'Inversión en anuncios' },
    tableCaption: (x) => `Resultados de Google Ads de ${x}, 2025`,
    perDollar: {
      base: 'Invertido en anuncios', baseSub: 'El costo, como punto de partida', backSr: 'volvieron en valor rastreado',
      note: 'La primera barra es $1 invertido en anuncios. Cada barra dorada es el valor rastreado de las reservaciones, llamadas y solicitudes que volvió por ese $1.',
    },
    disclaimer: 'Las cifras provienen de cuentas de anuncios de restaurantes que manejamos en 2025. Los resultados individuales varían y el rendimiento pasado no garantiza resultados futuros.',
    areaLink: (n) => `Marketing para restaurantes en ${n}`,
    crumbs: 'Ruta de navegación', tapSound: 'Toca para verlo con sonido',
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
  chev: svg('<path d="M9 6l6 6-6 6"/>', 2.2),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 2.2),
  sound: svg('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>', 2.1),
};
const note = (o) => (o && typeof o.reviewNote === 'string' && o.reviewNote.trim()
  ? `<aside class="review-note">${/^review:/i.test(o.reviewNote.trim()) ? '' : 'Review: '}${esc(o.reviewNote.trim())}</aside>`
  : '');
const dim = (m) => `width="${m.width}" height="${m.height}"`;
const pad2 = (i) => String(i + 1).padStart(2, '0');

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
// v3.css loads after this and supplies the tokens, Figtree, buttons, top bar,
// phone tab bar and reveals. Rules here follow DESIGN-V3: flat surfaces with
// hairlines, no glows or gradient washes (a scrim on a real video is the only
// gradient), gold only for the booking button, key numbers and active states.
// Note: v3.css forces p/li/dd/blockquote to 16px on phones unless the class
// name contains stat/note/label/meta/caption...; big numbers in <dd> therefore
// use a "-stat" class, and big quote/lead text sits in an inner <span>.
const PAGE_CSS = `
    /* ============================================================
       Case studies: hub + case pages. MOBILE FIRST. Classes are .cs-
       ============================================================ */
    html, body { overflow-x: clip; }
    @supports not (overflow: clip) { html, body { overflow-x: hidden; } }
    :root {
      --cs-top: 64px;
      --cs-ink: #140e04;
      --cs-warm: #f6f0e6;
      --cs-dim: rgba(246,240,230,0.72);
      --cs-soft: rgba(246,240,230,0.6);
      --cs-hair: rgba(255,255,255,0.08);
      --cs-hair-2: rgba(255,255,255,0.14);
      --cs-e1: #141416;
      --cs-e2: #1b1b1e;
      --cs-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .cs-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    .cs-page a:focus-visible, .cs-page button:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .review-note { display: block; margin: 12px 0 0; padding: 10px 14px; border: 2px dashed #d4a64a; border-radius: 8px; font-size: 13px; line-height: 1.5; color: var(--text); font-weight: 400; text-align: left; }

    /* quiet label above a hero H1 (sentence case, no pill, no glow) */
    .cs-kind { display: block; font-size: 0.9375rem; font-weight: 600; line-height: 1.3; letter-spacing: -0.005em; color: var(--cs-soft); }
    .cs-btn { height: 48px; padding: 0 22px; font-size: 0.9375rem; }
    .cs-btn svg { width: 16px; height: 16px; }
    .cs-cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    .cs-lede { margin-top: 16px; max-width: 54ch; font-size: 1.0625rem; line-height: 1.6; color: rgba(246,240,230,0.86); }
    .cs-meta { margin-top: 18px; font-size: 0.9375rem; line-height: 1.5; color: var(--cs-soft); }

    /* sideways rows: fade only the edge that has more to see (JS toggles the classes) */
    [data-cs-scroll] { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    [data-cs-scroll]::-webkit-scrollbar { display: none; }
    [data-cs-scroll].--more-r { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 40px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 40px), transparent); }
    [data-cs-scroll].--more-l { -webkit-mask-image: linear-gradient(90deg, transparent, #000 40px); mask-image: linear-gradient(90deg, transparent, #000 40px); }
    [data-cs-scroll].--more-l.--more-r { -webkit-mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent); mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent); }

    /* media frames */
    .cs-frame { position: relative; margin: 0; overflow: hidden; border-radius: 18px; border: 1px solid var(--cs-hair); background: var(--cs-e2); }
    .cs-frame > img, .cs-frame > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .cs-portrait { aspect-ratio: 9 / 16; }
    .cs-chip { position: absolute; left: 8px; bottom: 8px; z-index: 2; padding: 5px 10px; border-radius: 999px; background: rgba(12,12,14,0.7); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); font-size: 0.8125rem; font-weight: 700; color: var(--text-head); white-space: nowrap; pointer-events: none; }

    /* browser + phone frames (website case, hub website card, screenshots) */
    .cs-browser { position: relative; overflow: hidden; border-radius: 12px; border: 1px solid var(--cs-hair-2); background: #0e0e10; box-shadow: 0 24px 60px rgba(0,0,0,0.45); }
    .cs-browser-bar { display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; background: #18181b; border-bottom: 1px solid var(--cs-hair); }
    .cs-browser-bar i { flex: none; width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.18); }
    .cs-browser-url { margin: 0 auto; padding: 1px 12px; border-radius: 7px; background: rgba(255,255,255,0.06); font-size: 0.75rem; line-height: 1.5; color: var(--cs-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cs-browser img { display: block; width: 100%; height: auto; }
    .cs-show { position: relative; padding: 0 22% 8% 0; }
    .cs-phone { position: absolute; right: 0; bottom: 0; width: 28%; aspect-ratio: 690 / 1484; overflow: hidden; border-radius: 16px; border: 3px solid #222226; background: #000; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
    .cs-phone img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; }
    @media (min-width: 700px) {
      .cs-browser { border-radius: 16px; }
      .cs-browser-bar { height: 34px; gap: 7px; padding: 0 14px; }
      .cs-browser-bar i { width: 10px; height: 10px; }
      .cs-browser-url { font-size: 0.8125rem; padding: 3px 16px; }
      .cs-browser.--sm .cs-browser-bar { height: 26px; gap: 6px; padding: 0 12px; }
      .cs-browser.--sm .cs-browser-bar i { width: 8px; height: 8px; }
      .cs-show { padding: 0 16% 6% 0; }
      .cs-phone { width: 23%; border-radius: 28px; border-width: 6px; }
    }

    /* video cards: tap to play with sound (shared.js .hp2-vid-card) */
    .cs-vid, .cs-wvid { cursor: pointer; background: #0d0d0d; }
    .cs-vid > video, .cs-wvid > video { z-index: 1; }
    .cs-vid-play { position: absolute; top: 50%; left: 50%; z-index: 3; display: grid; place-items: center; width: 60px; height: 60px; transform: translate(-50%, -50%); border: 0; border-radius: 50%; background: rgba(255,255,255,0.92); cursor: pointer; transition: transform .25s var(--cs-ease), opacity .25s ease; }
    .cs-vid-play::after { content: ""; width: 0; height: 0; margin-left: 4px; border-left: 16px solid var(--cs-ink); border-top: 10px solid transparent; border-bottom: 10px solid transparent; }
    .cs-vid-cap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; padding: 48px 14px 14px; background: linear-gradient(180deg, transparent, rgba(0,0,0,0.82)); pointer-events: none; transition: opacity .3s ease; }
    .cs-vid-cap b { display: block; font-size: 0.9375rem; font-weight: 700; color: var(--text-head); }
    .cs-vid-cap span { display: block; margin-top: 2px; font-size: 0.8125rem; color: var(--cs-dim); }
    .cs-vid.--playing .cs-vid-play, .cs-vid.--playing .cs-vid-cap, .cs-wvid.--playing .cs-vid-play { opacity: 0; }
    @media (hover: hover) {
      .cs-vid:hover .cs-vid-play, .cs-wvid:hover .cs-vid-play { transform: translate(-50%, -50%) scale(1.06); }
    }
    .cs-wviews { position: absolute; left: 8px; top: 8px; z-index: 2; display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px 5px 8px; border-radius: 999px; background: rgba(12,12,14,0.68); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); font-size: 0.8125rem; line-height: 1.2; color: var(--cs-dim); white-space: nowrap; pointer-events: none; }
    .cs-wviews svg { width: 15px; height: 15px; flex: none; color: var(--text); }
    .cs-wviews b { font-size: 0.9375rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-head); }
    .cs-wcard.--top .cs-wviews { background: var(--gold); color: rgba(20,14,4,0.78); }
    .cs-wcard.--top .cs-wviews svg, .cs-wcard.--top .cs-wviews b { color: var(--cs-ink); }
    .cs-wbar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; height: 3px; background: rgba(255,255,255,0.16); opacity: 0; transition: opacity .25s ease; pointer-events: none; }
    .cs-wbar i { display: block; height: 100%; background: var(--gold); transform: scaleX(0); transform-origin: left center; }
    .cs-wvid.--playing .cs-wbar { opacity: 1; }

    /* =====================================================
       HUB
       ===================================================== */
    .cs-hero { padding: 8px 0 28px; }
    .cs-hero h1 { margin-top: 10px; font-weight: 800; font-size: clamp(2.4rem, 9.4vw, 4.5rem); line-height: 1; letter-spacing: -0.045em; color: var(--text-head); text-wrap: balance; }
    .cs-wall { list-style: none; display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 24px -16px 0; padding: 0 16px; }
    .cs-wall li { flex: 0 0 132px; scroll-snap-align: start; scroll-margin-left: 16px; }
    .cs-clip { display: block; border-radius: 18px; transition: transform .35s var(--cs-ease); }
    .cs-clip-meta { position: absolute; left: 6px; right: 6px; bottom: 6px; z-index: 2; padding: 7px 9px; border-radius: 12px; background: rgba(12,12,14,0.72); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
    .cs-clip-meta b { display: block; font-weight: 800; font-size: 1.0625rem; line-height: 1.15; color: var(--text-head); letter-spacing: -0.02em; }
    .cs-clip-meta small { font-size: 0.8125rem; font-weight: 600; color: var(--text); }
    .cs-clip-meta span { display: block; margin-top: 1px; font-size: 0.8125rem; line-height: 1.3; color: var(--cs-dim); }

    .cs-lib { position: relative; }
    .cs-tabs-bar { position: sticky; top: var(--cs-top); z-index: 60; margin: 4px -16px 0; padding: 6px 0; background: rgba(11,11,12,0.82); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); border-top: 1px solid var(--cs-hair); border-bottom: 1px solid var(--cs-hair); }
    html:not(.cs-js) .cs-tabs-bar { display: none; }
    .cs-tabs { position: relative; display: flex; gap: 4px; overflow-x: auto; padding: 0 16px; }
    .cs-tab { flex: 0 0 auto; display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; border: 0; background: transparent; color: var(--cs-dim); font-family: var(--font-body); font-size: 0.9375rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .18s ease, color .18s ease; }
    .cs-tab:hover { color: var(--text-head); }
    .cs-tab[aria-selected="true"] { background: rgba(255,255,255,0.12); color: var(--text-head); }

    .cs-panel { padding: 40px 0 8px; scroll-margin-top: 64px; }
    .cs-panel:focus { outline: none; }
    .cs-js .cs-panel[hidden] { display: none; }
    html:not(.cs-js) .cs-panel + .cs-panel { margin-top: 28px; border-top: 1px solid var(--cs-hair); }
    .cs-panel h2 { font-weight: 800; font-size: clamp(1.85rem, 6.6vw, 2.75rem); line-height: 1.05; letter-spacing: -0.04em; color: var(--text-head); max-width: 22ch; text-wrap: balance; }
    .cs-panel-intro { margin-top: 12px; max-width: 60ch; font-size: 1.0625rem; line-height: 1.6; color: var(--cs-dim); }

    /* social: vertical reel cards (real video covers carry a scrim for legibility) */
    .cs-reels { list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }
    .cs-reel { position: relative; display: block; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 22px; border: 1px solid var(--cs-hair); background: var(--cs-e2); }
    .cs-reel > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cs-reel::after { content: ""; position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.78) 68%, rgba(0,0,0,0.92)); pointer-events: none; }
    .cs-reel-area { position: absolute; top: 8px; left: 8px; z-index: 2; max-width: calc(100% - 16px); padding: 4px 10px; border-radius: 999px; background: rgba(12,12,14,0.66); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font-size: 0.8125rem; line-height: 1.3; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cs-reel-foot { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 2; }
    .cs-reel-num { display: block; font-weight: 800; font-size: clamp(1.75rem, 8vw, 2.6rem); line-height: 1; letter-spacing: -0.045em; color: var(--gold); }
    .cs-reel-label { display: block; margin-top: 3px; font-size: 0.8125rem; line-height: 1.3; color: var(--cs-dim); }
    .cs-reel-name { display: block; margin-top: 8px; font-size: 1rem; font-weight: 700; line-height: 1.25; color: var(--text-head); }
    .cs-reel-go { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 0.8125rem; font-weight: 700; color: var(--gold); }
    .cs-reel-go svg { width: 14px; height: 14px; }

    /* paid ads: scoreboard */
    .cs-explain { margin-top: 14px; max-width: 70ch; font-size: 1rem; line-height: 1.6; color: var(--cs-dim); }
    .cs-explain strong { color: var(--text-head); }
    .cs-board { margin-top: 24px; --cols: minmax(0, 2.1fr) minmax(0, 1.9fr) repeat(3, minmax(0, 1fr)); }
    .cs-board.--links { --cols: minmax(0, 2.1fr) minmax(0, 1.9fr) repeat(3, minmax(0, 1fr)) 132px; }
    .cs-board-head { display: none; }
    .cs-rows { list-style: none; display: grid; gap: 0; border-top: 1px solid var(--cs-hair); }
    .cs-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 10px; padding: 20px 0; border-bottom: 1px solid var(--cs-hair); }
    .cs-row-acct { grid-column: 1 / -1; }
    .cs-row-acct h3 { font-size: 1.125rem; font-weight: 700; line-height: 1.25; letter-spacing: -0.015em; color: var(--text-head); }
    .cs-row-acct p { margin-top: 3px; font-size: 0.875rem; line-height: 1.45; color: var(--cs-soft); }
    .cs-row-roas { grid-column: 1 / -1; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 14px; }
    .cs-row-roas .cs-k { grid-column: 1 / -1; }
    .cs-row-roas b { font-size: 2.25rem; font-weight: 800; line-height: 1.05; letter-spacing: -0.04em; color: var(--gold); }
    .cs-row-roas b.--word { font-size: 1.5rem; color: var(--text-head); }
    .cs-roas-note { grid-column: 1 / -1; font-size: 0.8125rem; line-height: 1.35; color: var(--cs-soft); }
    .cs-bar { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; }
    .cs-bar i { display: block; height: 100%; width: var(--w, 0%); min-width: 6px; border-radius: 999px; background: var(--gold); }
    .cs-k { display: block; font-size: 0.8125rem; line-height: 1.3; color: var(--cs-soft); }
    .cs-row-stat { display: flex; flex-direction: column; justify-content: space-between; }
    .cs-row-stat b { display: block; margin-top: 3px; font-size: 1.125rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-head); font-variant-numeric: tabular-nums; }
    .cs-row-go { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; font-size: 0.9375rem; font-weight: 700; color: var(--gold); }
    .cs-disclaimer { margin-top: 16px; max-width: 80ch; font-size: 0.8125rem; line-height: 1.55; color: var(--cs-soft); }
    .cs-totals { margin-top: 40px; }
    .cs-totals h3 { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-head); }

    /* websites: one wide card */
    .cs-sites { list-style: none; display: grid; gap: 16px; margin-top: 24px; }
    .cs-site { display: grid; overflow: hidden; border: 1px solid var(--cs-hair); border-radius: 28px; background: var(--cs-e1); }
    .cs-site-media { display: block; padding: 24px 18px 28px; background: var(--cs-e2); border-bottom: 1px solid var(--cs-hair); }
    .cs-site-media > img { width: 100%; height: auto; }
    .cs-site-copy { display: flex; flex-direction: column; gap: 8px; padding: 22px 22px 24px; }
    .cs-site-kicker { font-size: 0.875rem; font-weight: 600; color: var(--cs-soft); }
    .cs-site-title { font-size: 1.5rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.035em; color: var(--text-head); }
    .cs-site-body { font-size: 1rem; line-height: 1.6; color: var(--cs-dim); }
    .cs-site-go { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 0.9375rem; font-weight: 700; color: var(--gold); }

    /* closing CTA: flat panel (shared.css .cta-banner glows switched off) */
    .cs-close { padding: 72px 0 72px; }
    .cs-close .cta-banner { align-items: center; background: var(--cs-e1); border: 1px solid var(--cs-hair); border-radius: 32px; }
    .cs-close .cta-banner::before, .cs-close .cta-banner::after { display: none; animation: none; }
    .cs-close h2 { font-weight: 800; font-size: clamp(1.75rem, 6vw, 2.7rem); line-height: 1.06; letter-spacing: -0.04em; color: var(--text-head); }
    .cs-close .cta-content p { margin-top: 12px; max-width: 56ch; font-size: 1rem; line-height: 1.6; }
    .cs-close .cta-actions { flex-wrap: wrap; }
    .cs-close-proof { color: var(--cs-dim); }
    .cs-close-proof b { color: var(--gold); }
    .cs-close-proof cite { display: block; margin-top: 4px; font-style: normal; font-size: 0.875rem; color: var(--cs-soft); }
    main.page > footer.footer-demo::before { display: none; }
    @media (max-width: 600px) {
      .cs-page .footer-bottom { flex-direction: column; align-items: flex-start; gap: 12px; }
      .cs-page .footer-links { flex-wrap: wrap; gap: 4px 18px; }
    }

    /* =====================================================
       CASE PAGE: shared parts
       ===================================================== */
    .cs-crumbs ol { list-style: none; display: flex; align-items: center; font-size: 0.875rem; color: var(--cs-soft); }
    .cs-crumbs li { display: inline-flex; align-items: center; flex: none; }
    .cs-crumbs li:last-child { flex: 1 1 auto; min-width: 0; }
    .cs-crumbs li + li::before { content: "/"; margin: 0 8px; }
    .cs-crumbs a { display: inline-flex; align-items: center; min-height: 44px; color: var(--cs-dim); text-decoration: underline; text-decoration-color: rgba(246,240,230,0.3); text-underline-offset: 3px; }
    .cs-crumbs [aria-current] { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .cs-chero { padding-top: 4px; }
    .cs-chero h1 { margin-top: 10px; font-weight: 800; letter-spacing: -0.045em; color: var(--text-head); }
    .cs-h1-name { display: block; font-size: clamp(2.5rem, 10.5vw, 5.25rem); line-height: 0.96; }
    .cs-h1-sub { display: block; margin-top: 12px; font-weight: 650; font-size: clamp(1.125rem, 4.4vw, 1.625rem); line-height: 1.25; letter-spacing: -0.025em; color: var(--cs-dim); text-wrap: balance; }
    .cs-hero-notes { margin-top: 12px; }

    /* sticky section chips: a full-width bar on phones, a floating pill on desktop */
    .cs-toc { position: sticky; top: var(--cs-top); z-index: 60; margin: 48px -16px 0; padding: 6px 0; background: rgba(11,11,12,0.82); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); border-top: 1px solid var(--cs-hair); border-bottom: 1px solid var(--cs-hair); }
    .cs-toc ul { list-style: none; display: flex; gap: 4px; overflow-x: auto; padding: 0 16px; }
    .cs-toc li { flex: 0 0 auto; }
    .cs-toc a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; font-size: 0.9375rem; font-weight: 600; color: var(--cs-dim); white-space: nowrap; transition: background .18s ease, color .18s ease; }
    .cs-toc a:hover { color: var(--text-head); }
    .cs-toc a.--on { background: rgba(255,255,255,0.12); color: var(--text-head); }

    /* margin (not padding) so a section starts at its heading: a chip tap lands the
       heading just under the chips (html already has scroll-padding for the top bar) */
    .cs-sec { margin-top: 72px; scroll-margin-top: 72px; }
    .cs-sec-head h2 { font-weight: 800; font-size: clamp(1.85rem, 6.8vw, 3rem); line-height: 1.04; letter-spacing: -0.04em; color: var(--text-head); max-width: 20ch; text-wrap: balance; }
    .cs-sec-head p { margin-top: 12px; max-width: 60ch; font-size: 1.0625rem; line-height: 1.6; color: var(--cs-dim); }
    .cs-sec-head p strong { color: var(--text-head); }
    .cs-sec a:not(.cs-link):not(.btn) { color: var(--text-head); text-decoration: underline; text-decoration-color: rgba(226,168,77,0.6); text-underline-offset: 3px; }
    .cs-note { margin-top: 22px; max-width: 70ch; font-size: 0.9375rem; line-height: 1.55; color: var(--cs-soft); }
    .cs-note strong { color: var(--text); }

    /* the starting point: a lead line, then plain paragraphs */
    .cs-story { margin-top: 22px; max-width: 62ch; }
    .cs-story p { margin-top: 14px; font-size: 1.0625rem; line-height: 1.65; color: var(--cs-dim); }
    .cs-story p:first-child { margin-top: 0; }
    .cs-story-lead > span { display: block; font-size: clamp(1.25rem, 2.6vw, 1.625rem); line-height: 1.45; font-weight: 600; letter-spacing: -0.015em; color: var(--text-head); }

    /* what we did: a list with hairline dividers */
    .cs-steps { list-style: none; margin-top: 28px; border-top: 1px solid var(--cs-hair); }
    .cs-step { display: grid; grid-template-columns: 34px minmax(0, 1fr); column-gap: 10px; padding: 22px 0; border-bottom: 1px solid var(--cs-hair); }
    .cs-step-n { font-size: 0.9375rem; font-weight: 700; line-height: 1.45; color: var(--cs-soft); font-variant-numeric: tabular-nums; }
    .cs-step h3 { font-size: 1.125rem; font-weight: 700; line-height: 1.35; letter-spacing: -0.015em; color: var(--text-head); }
    .cs-step-body { grid-column: 2; }
    .cs-step-body > p { margin-top: 6px; max-width: 60ch; font-size: 1rem; line-height: 1.6; color: var(--cs-dim); }
    .cs-fig { margin: 16px 0 0; max-width: 560px; }
    .cs-fig img { display: block; width: 100%; height: auto; border-radius: 18px; border: 1px solid var(--cs-hair); background: var(--cs-e2); }
    .cs-fig.--portrait { max-width: 240px; }
    .cs-fig figcaption { margin-top: 8px; font-size: 0.875rem; line-height: 1.45; color: var(--cs-soft); }

    /* links to service pages */
    .cs-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 64px; }
    .cs-link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--cs-hair-2); background: rgba(255,255,255,0.04); font-size: 0.9375rem; font-weight: 600; line-height: 1.3; color: var(--text); transition: background .18s ease; }
    .cs-link:hover { background: rgba(255,255,255,0.08); }
    .cs-link svg { flex: none; color: var(--cs-soft); }

    /* the client's words */
    .cs-say { display: grid; gap: 28px; margin-top: 28px; }
    .cs-pull { margin: 0; max-width: 46ch; }
    .cs-pull blockquote { margin: 0; }
    .cs-pull-text { display: block; font-size: clamp(1.3rem, 4.8vw, 2rem); line-height: 1.38; font-weight: 600; letter-spacing: -0.02em; color: var(--text-head); text-wrap: pretty; }
    .cs-pull figcaption { margin-top: 18px; font-size: 0.9375rem; line-height: 1.5; color: var(--cs-soft); }
    .cs-pull figcaption b { color: var(--text); font-weight: 700; }
    .cs-say .cs-vid { width: 100%; max-width: 260px; }
    .cs-say:not(.--video) .cs-pull { max-width: 860px; }

    /* related cases: list rows with a chevron */
    .cs-more { margin-top: 96px; padding-top: 56px; border-top: 1px solid var(--cs-hair); }
    .cs-more h2 { font-weight: 800; font-size: clamp(1.6rem, 5.6vw, 2.25rem); line-height: 1.1; letter-spacing: -0.04em; color: var(--text-head); }
    .cs-more > p { margin-top: 6px; font-size: 1rem; color: var(--cs-dim); }
    .cs-more-grid { list-style: none; display: grid; gap: 12px; margin-top: 22px; }
    .cs-mcard { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 16px; align-items: center; height: 100%; padding: 12px 18px 12px 12px; border: 1px solid var(--cs-hair); border-radius: 22px; background: var(--cs-e1); transition: transform .35s var(--cs-ease), border-color .25s ease; }
    .cs-mcard-thumb { position: relative; display: grid; place-items: center; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 14px; background: var(--cs-e2); }
    .cs-mcard-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cs-mcard-thumb.--num { background: var(--gold); color: var(--cs-ink); }
    .cs-mcard-thumb.--num b { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
    .cs-mcard-tag { display: block; font-size: 0.8125rem; font-weight: 600; color: var(--cs-soft); }
    .cs-mcard-name { display: block; margin-top: 2px; font-size: 1.0625rem; font-weight: 700; line-height: 1.25; color: var(--text-head); }
    .cs-mcard-num { display: block; margin-top: 4px; font-size: 0.9375rem; line-height: 1.4; color: var(--cs-dim); }
    .cs-mcard-num strong { color: var(--text-head); }
    .cs-mcard > svg { width: 18px; height: 18px; color: var(--cs-soft); }
    .cs-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-top: 16px; font-size: 0.9375rem; font-weight: 700; color: var(--text); }
    .cs-back svg { color: var(--cs-soft); }

    /* =====================================================
       SOCIAL: led by the real Reels
       ===================================================== */
    .cs-sh { display: grid; grid-template-columns: minmax(0, 44fr) minmax(0, 56fr); grid-template-areas: "copy copy" "media stats"; column-gap: 16px; }
    .cs-sh-copy { grid-area: copy; min-width: 0; }
    .cs-sh-media { grid-area: media; min-width: 0; margin-top: 30px; }
    .cs-sh-media .cs-frame { box-shadow: 0 24px 60px rgba(0,0,0,0.45); }
    .cs-sh-stats { grid-area: stats; display: flex; flex-direction: column; justify-content: space-between; margin: 30px 0 0; }
    .cs-sh-stats > div { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 4px; padding: 12px 0; border-top: 1px solid var(--cs-hair); }
    .cs-sh-stats > div:first-child { padding-top: 0; border-top: 0; }
    .cs-sh-stats dt { font-size: 0.875rem; line-height: 1.35; color: var(--cs-dim); }
    .cs-sh-stat { margin: 0; font-weight: 800; font-size: clamp(1.6rem, 7.4vw, 2.1rem); line-height: 1; letter-spacing: -0.045em; color: var(--gold); }
    .cs-wviews.--hero { left: 6px; top: 6px; padding: 4px 8px 4px 6px; gap: 4px; }
    .cs-wviews.--hero b { font-size: 0.875rem; }
    .cs-wviews.--hero > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .cs-hero-sound { position: absolute; right: 8px; bottom: 8px; z-index: 3; display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: rgba(16,16,18,0.7); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); color: var(--text-head); transition: transform .2s var(--cs-ease); }
    .cs-hero-sound svg { width: 20px; height: 20px; }
    .cs-hero-sound span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .cs-hero-sound:active { transform: scale(0.97); }
    @media (max-width: 599px) {
      .cs-sh-media .cs-vid-cap { padding: 32px 10px 10px; }
      .cs-sh-media .cs-vid-cap b { font-size: 0.8125rem; line-height: 1.3; }
      .cs-sh-media .cs-vid-cap span { display: none; }
      .cs-sh-media .cs-vid-play { width: 52px; height: 52px; }
    }

    .cs-sec.--split .cs-sec-head p { max-width: 52ch; }
    .cs-reel-row { list-style: none; display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-left: 16px; margin: 26px -16px 0; padding: 0 16px 4px; }
    .cs-wcard { flex: 0 0 min(62%, 250px); min-width: 0; scroll-snap-align: start; }
    .cs-wmeta { padding: 12px 2px 0; }
    .cs-wmeta h3 { font-size: 1.0625rem; font-weight: 700; line-height: 1.3; letter-spacing: -0.015em; color: var(--text-head); }
    .cs-wmeta-note { margin-top: 3px; font-size: 0.875rem; line-height: 1.4; color: var(--cs-soft); }

    .cs-why { list-style: none; margin-top: 28px; border-top: 1px solid var(--cs-hair); }
    .cs-why li { display: grid; gap: 8px; padding: 24px 0; border-bottom: 1px solid var(--cs-hair); }
    .cs-why-stat { font-weight: 800; font-size: clamp(2.4rem, 11vw, 3.5rem); line-height: 1; letter-spacing: -0.05em; color: var(--gold); }
    .cs-why h3 { font-size: 1.1875rem; font-weight: 700; line-height: 1.35; letter-spacing: -0.015em; color: var(--text-head); }
    .cs-why li p { margin-top: 6px; max-width: 62ch; font-size: 1rem; line-height: 1.6; color: var(--cs-dim); }

    .cs-facts { margin: 28px 0 0; border-top: 1px solid var(--cs-hair); }
    .cs-fact { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "stat" "label" "note"; row-gap: 4px; padding: 22px 0; border-bottom: 1px solid var(--cs-hair); }
    .cs-fact dt { grid-area: label; margin-top: 6px; font-size: 1.0625rem; font-weight: 700; line-height: 1.35; color: var(--text-head); }
    .cs-fact-stat { grid-area: stat; margin: 0; font-weight: 800; font-size: clamp(2.2rem, 10vw, 3.25rem); line-height: 1; letter-spacing: -0.05em; color: var(--text-head); }
    .cs-fact-note { grid-area: note; margin: 0; max-width: 62ch; font-size: 1rem; line-height: 1.6; color: var(--cs-dim); }
    .cs-growth { margin-top: 56px; }
    .cs-growth-h { font-size: 1.375rem; font-weight: 700; line-height: 1.3; letter-spacing: -0.025em; color: var(--text-head); }
    .cs-timeline { list-style: none; position: relative; margin-top: 16px; padding-left: 26px; max-width: 760px; }
    .cs-timeline::before { content: ""; position: absolute; left: 5px; top: 22px; bottom: 26px; width: 1px; background: var(--cs-hair-2); }
    .cs-tl { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 2px; padding: 14px 0; border-bottom: 1px solid var(--cs-hair); }
    .cs-tl:last-child { border-bottom: 0; }
    .cs-tl::before { content: ""; position: absolute; left: -26px; top: 19px; width: 11px; height: 11px; box-sizing: border-box; border-radius: 50%; border: 2px solid rgba(246,240,230,0.5); background: #0b0b0c; }
    .cs-tl.--peak::before, .cs-tl.--now::before { background: var(--gold); border-color: var(--gold); }
    .cs-tl-when { font-size: 0.875rem; font-weight: 600; color: var(--cs-soft); }
    .cs-tl-what { font-size: 1rem; line-height: 1.5; color: var(--text); }
    .cs-tl-stat { font-weight: 800; font-size: 1.25rem; line-height: 1.2; letter-spacing: -0.02em; color: var(--text-head); }
    .cs-tl.--peak .cs-tl-stat, .cs-tl.--now .cs-tl-stat { font-size: 1.625rem; letter-spacing: -0.035em; color: var(--gold); }
    .cs-points { list-style: none; margin-top: 28px; max-width: 64ch; }
    .cs-points li { position: relative; padding-left: 20px; font-size: 1.0625rem; line-height: 1.6; color: var(--text); }
    .cs-points li + li { margin-top: 10px; }
    .cs-points li::before { content: ""; position: absolute; left: 2px; top: 0.68em; width: 6px; height: 6px; border-radius: 50%; background: var(--gold); }

    /* =====================================================
       PAID ADS: data first ("Wrapped" number blocks)
       ===================================================== */
    .cs-wr { display: grid; gap: 12px; margin: 36px 0 0; }
    .cs-wr-block { display: flex; flex-direction: column; min-height: 220px; padding: 24px 22px 24px; border-radius: 28px; }
    .cs-wr-block > dt { order: 2; margin-top: auto; padding-top: 24px; font-size: 1.0625rem; font-weight: 700; line-height: 1.3; letter-spacing: -0.01em; }
    .cs-wr-stat { order: 1; margin: 0; font-weight: 800; font-size: clamp(3.5rem, 17vw, 5.25rem); line-height: 0.9; letter-spacing: -0.06em; font-variant-numeric: tabular-nums; }
    .cs-wr-note { order: 3; margin: 6px 0 0; max-width: 46ch; font-size: 0.9375rem; line-height: 1.5; }
    .cs-wr-block.--gold { min-height: 300px; background: var(--gold); color: var(--cs-ink); }
    .cs-wr-block.--gold .cs-wr-stat { font-size: clamp(5.5rem, 31vw, 12rem); }
    .cs-wr-block.--warm { background: var(--cs-warm); color: var(--cs-ink); }
    .cs-wr-block.--gold .cs-wr-note, .cs-wr-block.--warm .cs-wr-note { color: rgba(20,14,4,0.74); }
    .cs-wr-block.--black { background: #000; color: var(--text-head); box-shadow: inset 0 0 0 1px var(--cs-hair-2); }
    .cs-wr-block.--black .cs-wr-stat { color: var(--gold); }
    .cs-wr-block.--black .cs-wr-note { color: var(--cs-dim); }
    .cs-ah-side { min-width: 0; }
    /* hub: the combined totals as four smaller blocks */
    .cs-wr.--totals { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
    .cs-wr.--totals .cs-wr-block { min-height: 168px; padding: 18px 16px; border-radius: 22px; }
    .cs-wr.--totals .cs-wr-stat, .cs-wr.--totals .cs-wr-block.--gold .cs-wr-stat { font-size: clamp(1.9rem, 8.6vw, 3.25rem); }
    .cs-wr.--totals .cs-wr-block > dt { padding-top: 16px; font-size: 0.9375rem; font-weight: 600; }

    .cs-dollar { list-style: none; display: grid; gap: 22px; margin-top: 32px; max-width: 980px; }
    .cs-dl { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name val" "bar bar"; gap: 10px 16px; align-items: end; }
    .cs-dl-name { grid-area: name; font-size: 1.0625rem; font-weight: 700; line-height: 1.3; color: var(--text-head); }
    .cs-dl-name small { display: block; margin-top: 2px; font-size: 0.875rem; font-weight: 500; color: var(--cs-soft); }
    .cs-dl-val { grid-area: val; font-weight: 800; font-size: clamp(1.9rem, 8vw, 2.75rem); line-height: 1; letter-spacing: -0.045em; color: var(--gold); font-variant-numeric: tabular-nums; }
    .cs-dl-bar { grid-area: bar; display: block; height: 14px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
    .cs-dl-bar i { display: block; height: 100%; width: var(--w); min-width: 10px; border-radius: 999px; background: var(--gold); }
    .cs-dl.--base .cs-dl-val { color: var(--text-head); }
    .cs-dl.--base .cs-dl-bar i { background: var(--cs-warm); }

    .cs-table { width: 100%; margin-top: 28px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .cs-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .cs-table tbody { display: block; border-top: 1px solid var(--cs-hair); }
    .cs-tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 22px 0 20px; border-bottom: 1px solid var(--cs-hair); }
    .cs-tr > th, .cs-tr > td { display: block; padding: 0; text-align: left; font-size: 1.125rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-head); }
    .cs-tr > td::before { content: attr(data-label); display: block; margin-bottom: 3px; font-size: 0.8125rem; font-weight: 600; letter-spacing: 0; color: var(--cs-soft); }
    .cs-tr > .cs-td-acct, .cs-tr > .cs-td-roas { grid-column: 1 / -1; }
    .cs-td-acct { font-size: 1.1875rem !important; font-weight: 700 !important; }
    .cs-td-acct small, .cs-td-roas small { display: block; margin-top: 3px; font-size: 0.875rem; font-weight: 500; letter-spacing: 0; color: var(--cs-soft); }
    .cs-td-roas b { font-size: 2.5rem; font-weight: 800; line-height: 1; letter-spacing: -0.045em; color: var(--gold); }
    .cs-td-roas b.--word { font-size: 1.5rem; color: var(--text-head); }
    .cs-tr-note { display: block; padding: 0 0 20px; border-bottom: 1px solid var(--cs-hair); }
    .cs-tr-note td { display: block; font-size: 1rem; line-height: 1.55; color: var(--cs-dim); }
    .cs-tr-note b { color: var(--text-head); }
    .cs-tr.--has-note { border-bottom: 0; }

    /* =====================================================
       WEBSITE: led by the site itself
       ===================================================== */
    .cs-chero.--web .cs-show { margin-top: 36px; }
    .cs-spec { margin: 40px 0 0; border-top: 1px solid var(--cs-hair); }
    .cs-spec > div { display: grid; grid-template-columns: 8rem minmax(0, 1fr); grid-template-areas: "stat label" "stat note"; column-gap: 16px; row-gap: 2px; padding: 18px 0; border-bottom: 1px solid var(--cs-hair); }
    .cs-spec dt { grid-area: label; font-size: 1rem; font-weight: 700; line-height: 1.35; color: var(--text-head); }
    .cs-spec-stat { grid-area: stat; margin: 0; font-weight: 800; font-size: 1.9rem; line-height: 1; letter-spacing: -0.045em; color: var(--text-head); white-space: nowrap; }
    .cs-spec-note { grid-area: note; margin: 0; font-size: 0.9375rem; line-height: 1.5; color: var(--cs-dim); }

    .cs-walk { list-style: none; display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-left: 16px; margin: 28px -16px 0; padding: 0 16px 6px; }
    .cs-walk > li { flex: 0 0 86%; min-width: 0; scroll-snap-align: start; }
    .cs-walk figure { margin: 0; }
    .cs-walk .cs-browser { box-shadow: none; }
    .cs-walk figcaption { margin-top: 12px; font-size: 0.9375rem; line-height: 1.5; color: var(--cs-dim); }
    .cs-walk figcaption b { display: block; font-size: 1rem; font-weight: 700; color: var(--text-head); }

    .cs-built { list-style: none; display: grid; gap: 44px; margin-top: 32px; }
    .cs-built-item { display: grid; gap: 18px; }
    .cs-built-text { max-width: 56ch; }
    .cs-built-text h3 { margin-top: 4px; font-size: 1.3125rem; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: var(--text-head); }
    .cs-built-text > p { margin-top: 8px; font-size: 1.0625rem; line-height: 1.6; color: var(--cs-dim); }
    .cs-built-fig { margin: 0; min-width: 0; }
    .cs-built-fig .cs-browser { box-shadow: none; }
    .cs-built-fig figcaption { margin-top: 10px; font-size: 0.875rem; line-height: 1.45; color: var(--cs-soft); }

    /* ===================== TABLET / DESKTOP ===================== */
    @media (min-width: 600px) {
      .cs-wall li { flex-basis: 164px; }
      .cs-more-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .cs-sh { grid-template-columns: minmax(0, 220px) minmax(0, 1fr); column-gap: 28px; }
      .cs-sh-stats { justify-content: center; }
      .cs-wviews.--hero { left: 10px; top: 10px; padding: 6px 11px 6px 9px; gap: 5px; }
      .cs-wviews.--hero b { font-size: 1rem; }
      .cs-wviews.--hero > span { position: static; width: auto; height: auto; overflow: visible; clip: auto; }
      .cs-hero-sound { left: 50%; right: auto; bottom: 14px; display: inline-flex; align-items: center; gap: 8px; width: auto; min-height: 44px; height: auto; padding: 0 18px 0 15px; transform: translateX(-50%); font-size: 0.9375rem; font-weight: 650; white-space: nowrap; }
      .cs-hero-sound span { position: static; width: auto; height: auto; overflow: visible; clip: auto; }
      .cs-hero-sound:active { transform: translateX(-50%) scale(0.97); }
      .cs-wr-block.--warm, .cs-wr-block.--black { min-height: 240px; }
    }
    @media (min-width: 700px) {
      .cs-reels { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    @media (min-width: 701px) {
      .cs-hero { padding-top: 112px; }
      .cs-crumbs { padding-top: 88px; }
      .cs-tabs-bar { margin: 8px 0 0; padding: 0; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border: 0; display: flex; justify-content: center; top: calc(var(--cs-top) + 12px); pointer-events: none; }
      .cs-tabs { pointer-events: auto; display: inline-flex; padding: 5px; border-radius: 999px; border: 1px solid var(--cs-hair-2); background: rgba(24,24,27,0.88); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); }
      .cs-panel { padding-top: 56px; }
    }
    @media (min-width: 701px) and (max-width: 899px) {
      .cs-toc { margin-left: -24px; margin-right: -24px; }
      .cs-toc ul { padding: 0 24px; }
      .cs-reel-row, .cs-walk { margin-left: -24px; margin-right: -24px; padding-left: 24px; padding-right: 24px; scroll-padding-left: 24px; }
      .cs-wcard { flex-basis: 34%; }
      .cs-walk > li { flex-basis: 70%; }
    }
    @media (min-width: 760px) {
      .cs-say.--video { grid-template-columns: 260px minmax(0, 1fr); gap: 56px; align-items: center; }
      .cs-why li { grid-template-columns: 220px minmax(0, 1fr); gap: 32px; padding: 30px 0; align-items: baseline; }
      .cs-fact { grid-template-columns: 220px minmax(0, 1fr); grid-template-areas: "stat label" "stat note"; column-gap: 32px; padding: 28px 0; }
      .cs-fact dt { margin-top: 0; }
      .cs-table { display: table; }
      .cs-table thead { position: static; width: auto; height: auto; overflow: visible; clip: auto; white-space: normal; display: table-header-group; }
      .cs-table tbody { display: table-row-group; border: 0; }
      .cs-table thead th { padding: 0 14px 12px 0; border-bottom: 1px solid var(--cs-hair-2); text-align: left; font-size: 0.8125rem; font-weight: 650; line-height: 1.3; color: var(--cs-soft); vertical-align: bottom; }
      .cs-tr { display: table-row; padding: 0; border: 0; }
      .cs-tr > th, .cs-tr > td { display: table-cell; padding: 22px 14px 22px 0; border-bottom: 1px solid var(--cs-hair); vertical-align: top; }
      .cs-tr > td::before { content: none; }
      .cs-tr.--has-note > th, .cs-tr.--has-note > td { border-bottom: 0; padding-bottom: 10px; }
      .cs-tr-note { display: table-row; padding: 0; border: 0; }
      .cs-tr-note td { display: table-cell; padding: 0 0 22px; border-bottom: 1px solid var(--cs-hair); }
      .cs-td-roas b { font-size: 2rem; }
      .cs-dl { grid-template-columns: 260px minmax(0, 1fr) 96px; grid-template-areas: "name bar val"; gap: 24px; align-items: center; }
      .cs-dl-val { text-align: right; font-size: 2.25rem; }
    }
    @media (min-width: 900px) {
      .cs-hero { padding-bottom: 40px; }
      .cs-hero-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 56px; align-items: center; }
      .cs-wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; overflow: visible; margin: 0; padding: 0; -webkit-mask-image: none !important; mask-image: none !important; }
      .cs-clip-meta { left: 8px; right: 8px; bottom: 8px; padding: 8px 10px; }
      .cs-clip-meta b { font-size: 1.25rem; }
      .cs-reels { gap: 16px; }
      .cs-reel-name { font-size: 1.125rem; }
      .cs-board-head { display: grid; grid-template-columns: var(--cols); gap: 14px; padding: 0 0 12px; font-size: 0.8125rem; font-weight: 650; color: var(--cs-soft); }
      .cs-rows { border-top: 1px solid var(--cs-hair-2); }
      .cs-row { grid-template-columns: var(--cols); gap: 6px 14px; align-items: center; padding: 22px 0; }
      .cs-row-acct, .cs-row-roas { grid-column: auto; }
      .cs-row-roas { grid-template-columns: 76px minmax(0, 1fr); }
      .cs-row .cs-k { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
      .cs-row-roas b { font-size: 1.9rem; }
      .cs-row-stat b { margin-top: 0; }
      .cs-row-go { grid-column: auto; justify-content: flex-end; }
      .cs-site { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
      .cs-site-media { padding: 40px 36px; border-bottom: 0; border-right: 1px solid var(--cs-hair); }
      .cs-site-copy { justify-content: center; padding: 40px; }
      .cs-site-title { font-size: 2rem; }

      .cs-sec { margin-top: 112px; scroll-margin-top: 84px; }
      .cs-sec.--split .cs-sec-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 48px; }
      .cs-sec.--split .cs-sec-head p { max-width: 40ch; margin: 0 0 6px; }
      .cs-toc { top: calc(var(--cs-top) + 12px); margin: 72px 0 0; padding: 0; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border: 0; display: flex; justify-content: center; pointer-events: none; }
      .cs-toc ul { pointer-events: auto; display: inline-flex; padding: 5px; border-radius: 999px; border: 1px solid var(--cs-hair-2); background: rgba(24,24,27,0.88); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); overflow: visible; -webkit-mask-image: none !important; mask-image: none !important; }
      .cs-step { grid-template-columns: 56px minmax(0, 5fr) minmax(0, 7fr); column-gap: 24px; padding: 28px 0; }
      .cs-step-body { grid-column: 3; }
      .cs-step-body > p { margin-top: 0; }
      .cs-close { padding: 112px 0 96px; }
      .cs-more { margin-top: 120px; padding-top: 72px; }

      /* social hero: copy and numbers beside the Reel */
      .cs-sh { grid-template-columns: minmax(0, 1fr) 340px; grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "copy media" "stats media"; column-gap: 80px; }
      .cs-sh-copy { align-self: center; padding-top: 12px; }
      .cs-sh-media { margin-top: 0; }
      .cs-sh-media .cs-frame { border-radius: 28px; }
      .cs-sh-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 44px; border-top: 1px solid var(--cs-hair); }
      .cs-sh-stats > div, .cs-sh-stats > div:first-child { justify-content: flex-end; padding: 22px 20px 0 0; border-top: 0; }
      .cs-sh-stats > div + div { padding-left: 22px; border-left: 1px solid var(--cs-hair); }
      .cs-sh-stats dt { font-size: 0.9375rem; }
      .cs-sh-stat { font-size: 2.75rem; }
      .cs-reel-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; overflow: visible; margin: 40px 0 0; padding: 0; -webkit-mask-image: none !important; mask-image: none !important; }

      /* ads hero: an editorial header, then the number blocks */
      .cs-ah { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); column-gap: 64px; align-items: end; }
      .cs-ah-side .cs-lede { margin-top: 0; }
      .cs-wr { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; margin-top: 56px; }
      .cs-wr-block { min-height: 250px; padding: 30px 32px; border-radius: 32px; }
      .cs-wr-block.--gold { grid-row: 1 / span 2; min-height: 516px; padding: 40px; }
      .cs-wr-block.--gold .cs-wr-stat { font-size: clamp(8rem, 15vw, 13rem); }
      .cs-wr-stat { font-size: 5rem; }
      .cs-wr-block.--gold > dt { font-size: 1.25rem; }
      .cs-wr-block.--gold .cs-wr-note { font-size: 1.0625rem; }
      .cs-wr.--totals { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 20px; }
      .cs-wr.--totals .cs-wr-block, .cs-wr.--totals .cs-wr-block.--gold { grid-row: auto; min-height: 200px; padding: 24px; border-radius: 26px; }
      .cs-wr.--totals .cs-wr-stat, .cs-wr.--totals .cs-wr-block.--gold .cs-wr-stat { font-size: 3.25rem; }
      .cs-wr.--totals .cs-wr-block.--gold > dt { font-size: 0.9375rem; }

      /* website hero: centered copy, the site below it */
      .cs-wh-copy { max-width: 860px; margin: 0 auto; text-align: center; }
      .cs-wh-copy .cs-lede { margin-left: auto; margin-right: auto; }
      .cs-wh-copy .cs-cta-row { justify-content: center; }
      .cs-chero.--web .cs-show { max-width: 1080px; margin: 64px auto 0; }
      .cs-spec { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 72px; border-bottom: 1px solid var(--cs-hair); }
      .cs-spec > div { display: flex; flex-direction: column; gap: 6px; padding: 28px 32px 30px 0; border-bottom: 0; }
      .cs-spec > div + div { padding-left: 32px; border-left: 1px solid var(--cs-hair); }
      .cs-spec-stat { order: -1; margin-bottom: 10px; font-size: 3.25rem; }
      .cs-walk { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 44px 28px; overflow: visible; margin: 40px 0 0; padding: 0; -webkit-mask-image: none !important; mask-image: none !important; }
      .cs-built { gap: 80px; margin-top: 48px; }
      .cs-built-item.--fig { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 56px; align-items: center; }
      .cs-built-item.--fig.--flip { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
      .cs-built-item.--fig.--flip .cs-built-text { order: 2; }
    }
    @media (hover: hover) {
      .cs-clip:hover, .cs-mcard:hover { transform: translateY(-3px); }
      .cs-mcard:hover { border-color: var(--cs-hair-2); }
    }
    @media (max-width: 899px) {
      .cs-close .cta-content p { margin-left: auto; margin-right: auto; }
    }
    @media (max-width: 600px) {
      .cs-close .cta-banner { padding: 30px 20px; border-radius: 24px; }
      .cs-close .cta-actions { width: 100%; flex-direction: column; }
      .cs-close .cta-actions .btn { width: 100%; height: auto; min-height: 52px; padding-top: 10px; padding-bottom: 10px; text-align: center; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cs-clip, .cs-mcard, .cs-link, .cs-tab, .cs-vid-play, .cs-toc a, .cs-hero-sound { transition: none; }
      .cs-clip:hover, .cs-mcard:hover { transform: none; }
    }
`;

// ---------- page JS (tabs, section chips, sideways rows, videos) ----------
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

      // Case page: the sticky section chips highlight the section you are reading.
      var toc = d.querySelector('.cs-toc');
      if (toc) {
        var row = toc.querySelector('ul');
        var links = [].slice.call(row.querySelectorAll('a[href^="#"]'));
        var secs = links.map(function (a) { return d.getElementById(a.getAttribute('href').slice(1)); });
        var cur = -2, ticking = false;
        var spy = function () {
          ticking = false;
          var line = row.getBoundingClientRect().bottom + 48;
          var k = -1;
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
          if (k >= 0) reveal(row, links[k].parentNode);
        };
        addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
        addEventListener('resize', spy);
        spy();
      }

      // Muted loops (social hero, hub clip wall): poster first. Start only after
      // the page has loaded and gone idle, never with reduced motion or data
      // saver, and only while at least a quarter is on screen.
      var loopVids = [].slice.call(d.querySelectorAll('video[data-cs-loop]'));
      var conn = navigator.connection || navigator.webkitConnection;
      var lite = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
      if (loopVids.length && !lite && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var armLoops = function () {
          loopVids.forEach(function (v) {
            var go = function () {
              if (window.ensureLazyVideoSource) window.ensureLazyVideoSource(v);
              else if (!v.getAttribute('src')) { v.src = v.getAttribute('data-video-src'); }
              var p = v.play(); if (p && p.catch) p.catch(function () {});
            };
            if (!('IntersectionObserver' in window)) { go(); return; }
            new IntersectionObserver(function (es) {
              es.forEach(function (e) { if (e.intersectionRatio >= 0.25) go(); else if (!v.paused) v.pause(); });
            }, { threshold: [0, 0.25] }).observe(v);
          });
        };
        var idle = function () { if ('requestIdleCallback' in window) requestIdleCallback(armLoops, { timeout: 1500 }); else setTimeout(armLoops, 600); };
        if (d.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
      }

      // Reels strip: progress bar while a reel plays, stop a reel once it is
      // scrolled away, and the hero button starts the first reel with sound.
      var reels = [].slice.call(d.querySelectorAll('.cs-wvid'));
      // A stopped reel goes back to its cover image. shared.js rewinds stopped
      // videos, which would otherwise load and show the raw first frame.
      var rest = function (card) {
        var v = card.querySelector('video'), bar = card.querySelector('.cs-wbar i');
        if (!v || !v.getAttribute('src') || card.classList.contains('--playing')) return;
        v.removeAttribute('src'); v.load();
        if (bar) bar.style.transform = 'scaleX(0)';
      };
      reels.forEach(function (card) {
        var v = card.querySelector('video'), bar = card.querySelector('.cs-wbar i');
        if (!v || !bar) return;
        var paint = function () { bar.style.transform = 'scaleX(' + (v.duration ? Math.min(1, v.currentTime / v.duration) : 0) + ')'; };
        v.addEventListener('timeupdate', paint);
        v.addEventListener('seeked', paint);
        v.addEventListener('play', function () { reels.forEach(function (o) { if (o !== card && o.querySelector('video').paused) rest(o); }); });
        v.addEventListener('pause', function () { setTimeout(function () { rest(card); }, 0); });
      });
      if (reels.length && 'IntersectionObserver' in window) {
        var away = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            var c = e.target, was = c._csIn;
            c._csIn = e.intersectionRatio >= 0.2;
            if (was && !c._csIn && c.classList.contains('--playing')) c.click();
          });
        }, { threshold: [0, 0.2] });
        reels.forEach(function (c) { away.observe(c); });
      }
      var jump = d.querySelector('[data-cs-play-first]');
      if (jump && reels.length) {
        jump.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation(); // shared.js stops every reel on any click outside one
          var first = reels[0], sec = d.getElementById(jump.getAttribute('href').slice(1));
          if (!first.classList.contains('--playing')) first.click();
          (sec || first).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        });
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
  if (!c.hero || !HERO_TYPES.includes(c.hero.type)) errs.push(`hero.type must be ${HERO_TYPES.join('|')}`);
  if (c.hero && c.hero.type === 'talk' && !(c.quote && c.quote.video)) errs.push('hero.type "talk" needs quote.video');
  if (c.hero && c.hero.type === 'device') ['desktop', 'mobile'].forEach((k) => { if (!c.hero[k] || !c.hero[k].src) errs.push(`hero.${k}.src is required`); });
  if (!c.card || typeof c.card.value !== 'string') errs.push('card.value is required');
  const m = arr(c.metrics, 'metrics');
  if (m.length !== 3) errs.push('metrics must have exactly 3 items');
  m.forEach((x, i) => ['value', 'label', 'meaning'].forEach((k) => str(x && x[k], `metrics[${i}].${k}`)));
  arr(c.situation && c.situation.paragraphs, 'situation.paragraphs').forEach((p, i) => str(p, `situation.paragraphs[${i}]`));
  arr(c.steps && c.steps.items, 'steps.items').forEach((s, i) => { str(s && s.title, `steps.items[${i}].title`); str(s && s.bodyHtml, `steps.items[${i}].bodyHtml`); });
  if (c.results) (c.results.accounts || []).forEach((a, i) => ['name', 'period', 'campaigns', 'roas', 'conversions', 'value', 'costPer'].forEach((k) => str(a && a[k], `results.accounts[${i}].${k}`)));
  if (c.results && c.results.timeline) arr(c.results.timeline.items, 'results.timeline.items').forEach((x, i) => {
    ['when', 'title', 'stat'].forEach((k) => str(x && x[k], `results.timeline.items[${i}].${k}`));
    if (x && x.kind && !['before', 'peak', 'now'].includes(x.kind)) errs.push(`results.timeline.items[${i}].kind must be before|peak|now`);
  });
  if (c.reels) {
    str(c.reels.h2, 'reels.h2'); str(c.reels.intro, 'reels.intro');
    arr(c.reels.items, 'reels.items').forEach((x, i) => ['src', 'poster', 'views', 'title', 'date', 'alt'].forEach((k) => str(x && x[k], `reels.items[${i}].${k}`)));
  }
  if (c.hero && c.hero.jump && !c.reels) errs.push('hero.jump needs a reels section to play');
  if (c.reels) c.reels.items.forEach((x, i) => {
    if (x.uploaded && !/^\d{4}-\d{2}-\d{2}$/.test(x.uploaded)) errs.push(`reels.items[${i}].uploaded must be YYYY-MM-DD`);
    if (x.duration && !/^PT\d+S$/.test(x.duration)) errs.push(`reels.items[${i}].duration must look like PT42S`);
  });
  if (c.analysis) arr(c.analysis.items, 'analysis.items').forEach((x, i) => ['stat', 'title', 'body'].forEach((k) => str(x && x[k], `analysis.items[${i}].${k}`)));
  if (c.walkthrough) arr(c.walkthrough.items, 'walkthrough.items').forEach((x, i) => {
    ['src', 'alt', 'title', 'caption'].forEach((k) => str(x && x[k], `walkthrough.items[${i}].${k}`));
    if (!x || !x.width || !x.height) errs.push(`walkthrough.items[${i}] needs width and height`);
  });
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
  if (c.service === 'ads' && c.services.some((s) => s !== 'ads')) warn.push('an ads case lists services other than ads: only show work we actually do for this client');
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
  const walk = (v) => {
    if (typeof v === 'string' && /^(\/|videos\/|media\/)(media|images|videos)?/.test(v) && /\.(avif|webp|png|jpe?g|svg|mp4)$/i.test(v)) paths.add(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x));
  };
  walk(obj);
  for (const p of paths) {
    try { await access(path.join(root, p.replace(/^\/+/, ''))); } catch { warn.push(`${label}: asset ${p} does not exist`); }
  }
}

// ---------- shared render helpers ----------
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

// A browser window (and optionally a phone) around real screenshots of a site.
function browserFrame(img, { url = '', lazy = true, small = false } = {}) {
  const load = lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high" decoding="async"';
  return `<div class="cs-browser${small ? ' --sm' : ''}">
                <div class="cs-browser-bar" aria-hidden="true"><i></i><i></i><i></i>${url ? `<span class="cs-browser-url">${esc(url)}</span>` : ''}</div>
                <img src="${img.src}" alt="${escAttr(img.alt)}" ${dim(img)}${load} />
              </div>`;
}
function deviceShow(h, { url = true, lazy = true } = {}) {
  return `<div class="cs-show">
              ${browserFrame(h.desktop, { url: url ? h.url : '', lazy })}
              <div class="cs-phone"><img src="${h.mobile.src}" alt="${escAttr(h.mobile.alt)}" ${dim(h.mobile)} loading="${lazy ? 'lazy' : 'eager'}" decoding="async" /></div>
            </div>`;
}

// Number blocks: gold with ink, warm white with ink, black with gold.
const WR = ['--gold', '--warm', '--black', '--black'];
function wrapped(items, { cls = '', label = '' } = {}) {
  return `<dl class="cs-wr${cls ? ` ${cls}` : ''}"${label ? ` aria-label="${escAttr(label)}"` : ''}>
          ${items.map((m, i) => `<div class="cs-wr-block ${WR[i] || '--black'}">
            <dt>${esc(m.label)}</dt>
            <dd class="cs-wr-stat">${esc(m.value)}</dd>${m.meaning ? `
            <dd class="cs-wr-note">${esc(m.meaning)}</dd>` : ''}${note(m)}
          </div>`).join('\n          ')}
        </dl>`;
}

// One scoreboard row; used on the hub (with a case link).
function scoreRow(a, t, link, max) {
  const pct = typeof a.roasNumber === 'number' && max ? Math.max(4, Math.round((a.roasNumber / max) * 100)) : 0;
  const word = typeof a.roasNumber !== 'number';
  return `<li class="cs-row">
              <div class="cs-row-acct"><h3>${esc(a.name)}</h3><p>${esc(a.campaigns)} · ${esc(a.period)}</p></div>
              <div class="cs-row-roas"><span class="cs-k">${esc(t.col.roas)}</span><b${word ? ' class="--word"' : ''}>${esc(a.roas)}</b>${pct ? `<span class="cs-bar" aria-hidden="true"><i style="--w:${pct}%"></i></span>` : '<span></span>'}${a.roasLabel ? `<span class="cs-roas-note">${esc(a.roasLabel)}</span>` : ''}</div>
              <div class="cs-row-stat"><span class="cs-k">${esc(t.col.conversions)}</span><b>${esc(a.conversions)}</b></div>
              <div class="cs-row-stat"><span class="cs-k">${esc(t.col.costPer)}</span><b>${esc(a.costPer)}</b></div>
              <div class="cs-row-stat"><span class="cs-k">${esc(t.col.value)}</span><b>${esc(a.value)}</b></div>
              ${link ? `<a class="cs-row-go" href="${link.href}">${esc(t.readCase)}<span class="cs-sr">: ${esc(link.client)}</span> ${ICON.arrow}</a>` : ''}
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

  const wall = hub.wall.filter((w) => bySlug.has(w.slug)).map((w) => {
    const c = bySlug.get(w.slug);
    return `<li><a class="cs-frame cs-portrait cs-clip" href="${casePath(w.slug, lang)}" aria-label="${escAttr(t.clipLabel(c.client, w.chip))}" data-audio-managed="true">
              <video data-video-src="${videoSrc(w.src)}" data-cs-loop poster="${w.poster}" ${dim(w)} muted loop playsinline preload="none" aria-hidden="true"></video>
              <span class="cs-clip-meta" aria-hidden="true"><b>${esc(w.chip.split(' ')[0])}<small> ${esc(w.chip.split(' ').slice(1).join(' '))}</small></b><span>${esc(c.client)}</span></span>
            </a></li>`;
  }).join('\n            ');

  // Social reel cards (real video covers)
  const social = (S.social.order || []).filter((s) => bySlug.has(s)).map((s) => {
    const c = bySlug.get(s);
    const k = c.card;
    const media = k.src ? `<img src="${k.src}" alt="" ${dim(k)} loading="lazy" decoding="async" />` : '';
    return `<li><a class="cs-reel" href="${casePath(s, lang)}">
              ${media}
              <span class="cs-reel-area">${esc(k.place || (c.area ? c.area.name : c.descriptor))}</span>
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
    .filter((c) => c.service === 'ads' && c.results && c.results.accounts)
    .flatMap((c) => c.results.accounts.map((a) => ({ a, link: { href: casePath(c.slug, lang), client: c.client } })))
    .sort((x, y) => (typeof y.a.roasNumber === 'number' ? y.a.roasNumber : -1) - (typeof x.a.roasNumber === 'number' ? x.a.roasNumber : -1));

  // Website cards (only real website work)
  const web = (S.web.order || []).filter((s) => bySlug.has(s) && bySlug.get(s).webCard && bySlug.get(s).services.includes('web')).map((s) => {
    const c = bySlug.get(s);
    const w = c.webCard;
    const media = w.device && c.hero.type === 'device'
      ? deviceShow(c.hero, { url: true })
      : `<img src="${w.image.src}" alt="${escAttr(w.image.alt)}" ${dim(w.image)} loading="lazy" decoding="async" />`;
    return `<li><a class="cs-site" href="${casePath(s, lang)}">
              <div class="cs-site-media">${media}</div>
              <span class="cs-site-copy">
                <span class="cs-site-kicker">${esc(w.kicker)}</span>
                <strong class="cs-site-title">${esc(w.title)}</strong>
                <span class="cs-site-body">${esc(w.body)}</span>
                <span class="cs-site-go">${esc(t.readCase)} ${ICON.arrow}</span>
              </span>
            </a></li>`;
  }).join('\n            ');

  // No counts on tabs: never show how many clients or ad accounts there are.
  const tab = (id) => `<button type="button" class="cs-tab" role="tab" id="tab-${id}" aria-controls="${id}" aria-selected="${id === 'social' ? 'true' : 'false'}"${id === 'social' ? '' : ' tabindex="-1"'}>${esc(S[id].tab)}</button>`;

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
          <p class="cs-kind">${esc(hub.eyebrow)}</p>
          <h1>${esc(hub.h1)}</h1>
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
        <h2>${esc(S.social.h2)}</h2>
        <p class="cs-panel-intro">${esc(S.social.intro)}</p>
        <ul class="cs-reels">
            ${social}
        </ul>
      </div>

      <div class="cs-panel --ads" id="ads">
        <h2>${esc(S.ads.h2)}</h2>
        <p class="cs-panel-intro">${esc(S.ads.intro)}</p>
        <p class="cs-explain">${S.ads.roasLineHtml}</p>
        ${scoreboard(adRows, t, true)}
        <div class="cs-totals">
          <h3>${esc(S.ads.totals.h3)}</h3>
          ${wrapped(S.ads.totals.items, { cls: '--totals' })}
          ${note(S.ads.totals)}
        </div>
        <p class="cs-disclaimer">${esc(S.ads.disclaimer)}</p>
      </div>

      <div class="cs-panel --web" id="web">
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
function relatedCases(c, all) {
  const others = all.filter((x) => x.slug !== c.slug).sort((a, b) => (a.order || 99) - (b.order || 99));
  const same = others.filter((x) => x.service === c.service || x.services.includes(c.service));
  return [...same, ...others.filter((x) => !same.includes(x))].slice(0, 2);
}

// Hero pieces every case type shares.
function heroCopy(c, t, { meta = true } = {}) {
  const items = [
    c.area ? `${esc(c.area.name)}${c.area.detail ? ` (${esc(c.area.detail)})` : ''}` : '',
    esc(c.descriptor),
    c.timeframe ? esc(c.timeframe) : '',
  ].filter(Boolean);
  return {
    label: `<p class="cs-kind">${esc(t.kind[c.service])}</p>`,
    h1: `<h1><span class="cs-h1-name">${esc(c.h1)}</span><span class="cs-sr">: </span><span class="cs-h1-sub">${esc(c.h1Sub)}</span></h1>`,
    lede: `<p class="cs-lede">${esc(c.answer)}</p>`,
    cta: `<div class="cs-cta-row">
            <a href="${t.contact}" class="btn btn-primary cs-btn">${esc(t.primary)} ${ICON.arrow}</a>
          </div>`,
    // the dot stays on the line of the item before it, so a wrap never starts with a dot
    meta: meta ? `<p class="cs-meta">${items.join('&nbsp;&nbsp;&middot;&nbsp; ')}</p>` : '',
  };
}

// The hero video for social cases: a muted loop of a real Reel, or the
// client's own video (talk) that plays with sound on tap.
function socialMedia(c, t) {
  const h = c.hero;
  if (h.type === 'talk') {
    const v = c.quote.video;
    return `<figure class="cs-frame cs-portrait cs-vid hp2-vid-card" data-audio-managed="true">
              <video data-video-src="${videoSrc(v.src)}" poster="${v.poster}" ${dim(v)} playsinline preload="none"></video>
              <button type="button" class="cs-vid-play" aria-label="${escAttr(v.playLabel)}"></button>
              <figcaption class="cs-vid-cap"><b>${esc(c.quote.name)}</b><span>${esc(t.tapSound)}</span></figcaption>
            </figure>`;
  }
  if (h.type === 'image') {
    return `<figure class="cs-frame cs-portrait">
              <img src="${h.src}" alt="${escAttr(h.alt)}" ${dim(h)} fetchpriority="high" decoding="async" />
              ${h.chip ? `<span class="cs-chip">${esc(h.chip)}</span>` : ''}
            </figure>`;
  }
  const badge = h.views ? `<span class="cs-wviews --hero">${ICON.eye}<b>${esc(h.views)}</b><span>${esc(t.views)}</span></span>` : '';
  const jump = h.jump && c.reels
    ? `<a class="cs-hero-sound" href="#${t.ids.reels}" data-cs-play-first aria-label="${escAttr(t.playWith(c.reels.items[0].title))}">${ICON.sound}<span>${esc(t.watchSound)}</span></a>`
    : '';
  return `<figure class="cs-frame cs-portrait" data-audio-managed="true">
              <video data-video-src="${videoSrc(h.src)}" data-cs-loop poster="${h.poster}" ${dim(h)} muted loop playsinline preload="none" aria-label="${escAttr(h.alt)}"></video>
              ${badge}${jump ? `\n              ${jump}` : ''}
            </figure>`;
}

function renderHero(c, t) {
  const k = heroCopy(c, t);
  const notes = [note(c.hero), c.timeframeReviewNote ? note({ reviewNote: `${c.timeframe}: ${c.timeframeReviewNote}` }) : ''].join('');
  const notesHtml = notes ? `\n      <div class="cs-hero-notes">${notes}</div>` : '';

  if (c.service === 'ads') {
    return `    <section class="cs-chero --ads">
      <div class="cs-ah">
        <div class="cs-ah-main">
          ${k.label}
          ${k.h1}
        </div>
        <div class="cs-ah-side">
          ${k.lede}
          ${k.cta}
          ${k.meta}
        </div>
      </div>
      ${wrapped(c.metrics)}${notesHtml}
    </section>`;
  }

  if (c.service === 'web') {
    const h = c.hero;
    const show = h.type === 'device'
      ? deviceShow(h, { lazy: false })
      : `<figure class="cs-frame"><img src="${h.src}" alt="${escAttr(h.alt)}" ${dim(h)} fetchpriority="high" decoding="async" /></figure>`;
    return `    <section class="cs-chero --web">
      <div class="cs-wh-copy">
        ${k.label}
        ${k.h1}
        ${k.lede}
        ${k.cta}
        ${k.meta}
      </div>
      ${show}
      <dl class="cs-spec">
        ${c.metrics.map((m) => `<div>
          <dt>${esc(m.label)}</dt>
          <dd class="cs-spec-stat">${esc(m.value)}</dd>
          <dd class="cs-spec-note">${esc(m.meaning)}</dd>${note(m)}
        </div>`).join('\n        ')}
      </dl>${notesHtml}
    </section>`;
  }

  return `    <section class="cs-chero --social">
      <div class="cs-sh">
        <div class="cs-sh-copy">
          ${k.label}
          ${k.h1}
          ${k.lede}
          ${k.cta}
          ${k.meta}
        </div>
        <div class="cs-sh-media">
            ${socialMedia(c, t)}
        </div>
        <dl class="cs-sh-stats">
          ${c.metrics.map((m) => `<div><dt>${esc(m.label)}</dt><dd class="cs-sh-stat">${esc(m.value)}</dd></div>`).join('\n          ')}
        </dl>
      </div>${notesHtml}
    </section>`;
}

function renderCase(c, all, hub, chrome, t, areaNames, alt) {
  const lang = c.lang;
  const url = abs(casePath(c.slug, lang));
  const hubUrl = abs(hubPath(lang));
  const ids = t.ids;
  const type = c.service;
  const r = c.results || {};
  const accounts = r.accounts || [];
  const numeric = accounts.filter((a) => typeof a.roasNumber === 'number');
  const q = c.quote;

  // ----- section builders -----
  const own = { analysis: c.analysis, situation: c.situation, steps: c.steps, built: c.steps, results: c.results, quote: c.quote, walk: c.walkthrough };
  const h2 = (k) => esc((own[k] && own[k].h2) || (k === 'reels' ? c.reels.h2 : t.h2[k]));
  const sec = (k, inner, { intro = '', cls = '' } = {}) => `
    <section class="cs-sec${cls ? ` ${cls}` : ''}" id="${ids[k]}" aria-labelledby="${ids[k]}-h">
      <div class="cs-sec-head">
        <h2 id="${ids[k]}-h">${h2(k)}</h2>${intro ? `
        <p>${intro}</p>` : ''}
      </div>
${inner}
    </section>`;

  const reelsSec = () => sec('reels', `      <ol class="cs-reel-row" data-cs-scroll>
        ${c.reels.items.map((x, i) => `<li class="cs-wcard${i === 0 ? ' --top' : ''}">
          <div class="cs-frame cs-portrait cs-wvid hp2-vid-card" data-audio-managed="true">
            <video data-video-src="${videoSrc(x.src)}" poster="${x.poster}" ${dim(x)} playsinline preload="none" aria-label="${escAttr(x.alt)}"></video>
            <span class="cs-wviews">${ICON.eye}<b>${esc(x.views)}</b><span>${esc(t.views)}</span></span>
            <button type="button" class="cs-vid-play" aria-label="${escAttr(t.playWith(x.title))}"></button>
            <span class="cs-wbar" aria-hidden="true"><i></i></span>
          </div>
          <div class="cs-wmeta">
            <h3>${esc(x.title)}</h3>
            <p class="cs-wmeta-note">${esc(x.date)}${x.likes ? ` · ${esc(x.likes)} ${esc(t.likes)}` : ''}</p>
          </div>
        </li>`).join('\n        ')}
      </ol>`, { intro: esc(c.reels.intro), cls: '--split' });

  const analysisSec = () => sec('analysis', `      <ol class="cs-why">
        ${c.analysis.items.map((x) => `<li>
          <b class="cs-why-stat">${esc(x.stat)}</b>
          <div>
            <h3>${esc(x.title)}</h3>
            <p>${esc(x.body)}</p>
          </div>
        </li>`).join('\n        ')}
      </ol>`, { intro: c.analysis.intro ? esc(c.analysis.intro) : '' });

  const situationSec = () => {
    const [first, ...rest] = c.situation.paragraphs;
    return sec('situation', `      <div class="cs-story">
        <p class="cs-story-lead"><span>${esc(first)}</span></p>${rest.map((p) => `
        <p>${esc(p)}</p>`).join('')}
      </div>
      ${note(c.situation)}`);
  };

  const fig = (f, cls = 'cs-fig') => `<figure class="${cls}${f.height > f.width ? ' --portrait' : ''}"><img src="${f.src}" alt="${escAttr(f.alt)}" ${dim(f)} loading="lazy" decoding="async" />${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}</figure>`;
  const stepsSec = () => sec('steps', `      <ol class="cs-steps">
        ${c.steps.items.map((s, i) => `<li class="cs-step">
          <span class="cs-step-n" aria-hidden="true">${pad2(i)}</span>
          <h3>${esc(s.title)}</h3>
          <div class="cs-step-body">
            <p>${s.bodyHtml}</p>${s.figure ? `
            ${fig(s.figure)}` : ''}${note(s)}
          </div>
        </li>`).join('\n        ')}
      </ol>`);

  const builtSec = () => {
    let figs = 0;
    return sec('built', `      <ol class="cs-built">
        ${c.steps.items.map((s, i) => {
          const f = s.figure;
          const flip = f ? figs++ % 2 === 1 : false;
          return `<li class="cs-built-item${f ? ' --fig' : ''}${flip ? ' --flip' : ''}">
          <div class="cs-built-text">
            <span class="cs-step-n" aria-hidden="true">${pad2(i)}</span>
            <h3>${esc(s.title)}</h3>
            <p>${s.bodyHtml}</p>${note(s)}
          </div>${f ? `
          <figure class="cs-built-fig">
            ${browserFrame(f, { small: true })}${f.caption ? `
            <figcaption>${esc(f.caption)}</figcaption>` : ''}
          </figure>` : ''}
        </li>`;
        }).join('\n        ')}
      </ol>`);
  };

  const walkSec = () => sec('walk', `      <ul class="cs-walk" data-cs-scroll>
        ${c.walkthrough.items.map((x) => `<li>
          <figure>
            ${browserFrame(x, { small: true })}
            <figcaption><b>${esc(x.title)}</b>${esc(x.caption)}</figcaption>
          </figure>
        </li>`).join('\n        ')}
      </ul>`, { intro: c.walkthrough.intro ? esc(c.walkthrough.intro) : '' });

  const resultsSec = () => {
    const tl = r.timeline && (r.timeline.items || []).length ? `
      <div class="cs-growth">
        ${r.timeline.h3 ? `<h3 class="cs-growth-h">${esc(r.timeline.h3)}</h3>` : ''}
        <ol class="cs-timeline">
          ${r.timeline.items.map((x) => `<li class="cs-tl${x.kind ? ` --${x.kind}` : ''}"><span class="cs-tl-when">${esc(x.when)}</span><span class="cs-tl-what">${esc(x.title)}</span><b class="cs-tl-stat">${esc(x.stat)}</b></li>`).join('\n          ')}
        </ol>
      </div>` : '';
    const points = (r.points || []).length ? `
      <ul class="cs-points">${r.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    return sec('results', `      <dl class="cs-facts">
        ${c.metrics.map((m) => `<div class="cs-fact">
          <dt>${esc(m.label)}</dt>
          <dd class="cs-fact-stat">${esc(m.value)}</dd>
          <dd class="cs-fact-note">${esc(m.meaning)}</dd>${note(m)}
        </div>`).join('\n        ')}
      </dl>${tl}${points}${r.explainHtml ? `
      <p class="cs-note">${r.explainHtml}</p>` : ''}
      ${note(r)}`);
  };

  const dollarSec = () => {
    const max = Math.max(...numeric.map((a) => a.roasNumber));
    const w = (n) => `${Math.max(0.5, (n / max) * 100).toFixed(2)}%`;
    return sec('dollar', `      <ul class="cs-dollar">
        <li class="cs-dl --base">
          <span class="cs-dl-name">${esc(t.perDollar.base)}<small>${esc(t.perDollar.baseSub)}</small></span>
          <span class="cs-dl-bar" aria-hidden="true"><i style="--w:${w(1)}"></i></span>
          <b class="cs-dl-val">$1</b>
        </li>
        ${numeric.map((a) => `<li class="cs-dl">
          <span class="cs-dl-name">${esc(a.name)}<small>${esc(a.roasLabel || a.campaigns)} · ${esc(a.period)}</small></span>
          <span class="cs-dl-bar" aria-hidden="true"><i style="--w:${w(a.roasNumber)}"></i></span>
          <b class="cs-dl-val">$${a.roasNumber}<span class="cs-sr"> ${esc(t.perDollar.backSr)}</span></b>
        </li>`).join('\n        ')}
      </ul>
      <p class="cs-note">${esc(t.perDollar.note)}</p>`, { intro: r.explainHtml || '' });
  };

  const tableSec = () => {
    const hasSpend = accounts.some((a) => a.spend);
    const cols = 5 + (hasSpend ? 1 : 0);
    const rows = accounts.map((a) => {
      const word = typeof a.roasNumber !== 'number';
      const cell = (k, v) => `<td data-label="${escAttr(t.col[k])}">${esc(v)}</td>`;
      return `<tr class="cs-tr${a.standout ? ' --has-note' : ''}">
            <th scope="row" class="cs-td-acct">${esc(a.name)}<small>${esc(a.campaigns)} · ${esc(a.period)}</small></th>
            <td class="cs-td-roas" data-label="${escAttr(t.col.roas)}"><b${word ? ' class="--word"' : ''}>${esc(a.roas)}</b>${a.roasLabel ? `<small>${esc(a.roasLabel)}</small>` : ''}</td>
            ${cell('conversions', a.conversions)}
            ${cell('costPer', a.costPer)}
            ${cell('value', a.value)}${hasSpend ? `
            ${cell('spend', a.spend || '')}` : ''}
          </tr>${a.standout ? `
          <tr class="cs-tr-note"><td colspan="${cols}"><b>${esc(t.standout)}</b> ${esc(a.standout)}</td></tr>` : ''}`;
    }).join('\n          ');
    return sec('table', `      <table class="cs-table">
        <caption class="cs-sr">${esc(t.tableCaption(c.crumb || c.client))}</caption>
        <thead>
          <tr><th scope="col">${esc(t.col.account)}</th><th scope="col">${esc(t.col.roas)}</th><th scope="col">${esc(t.col.conversions)}</th><th scope="col">${esc(t.col.costPer)}</th><th scope="col">${esc(t.col.value)}</th>${hasSpend ? `<th scope="col">${esc(t.col.spend)}</th>` : ''}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      ${r.disclaimer ? `<p class="cs-disclaimer">${esc(t.disclaimer)}</p>` : ''}
      ${note(r)}`);
  };

  const quoteSec = () => {
    const showVideo = q.video && c.hero.type !== 'talk';
    return sec('quote', `      <div class="cs-say${showVideo ? ' --video' : ''}">${showVideo ? `
        <div class="cs-frame cs-portrait cs-vid hp2-vid-card" data-audio-managed="true">
          <video data-video-src="${videoSrc(q.video.src)}" poster="${q.video.poster}" ${dim(q.video)} playsinline preload="none"></video>
          <button type="button" class="cs-vid-play" aria-label="${escAttr(q.video.playLabel)}"></button>
          <div class="cs-vid-cap"><b>${esc(q.name)}</b><span>${esc(t.tapSound)}</span></div>
        </div>` : ''}
        <figure class="cs-pull">
          <blockquote><span class="cs-pull-text">“${esc(q.text)}”</span></blockquote>
          <figcaption><b>${esc(q.name)}</b>, ${esc(q.role)}${q.source ? ` (${esc(q.source)})` : ''}</figcaption>
          ${note(q)}
        </figure>
      </div>`);
  };

  // ----- order of sections by case type -----
  const plan = type === 'ads'
    ? [['dollar', numeric.length > 0, dollarSec], ['table', accounts.length > 0, tableSec], ['situation', true, situationSec], ['steps', true, stepsSec]]
    : type === 'web'
      ? [['walk', !!c.walkthrough, walkSec], ['situation', true, situationSec], ['built', true, builtSec], ['quote', !!q, quoteSec]]
      : [['reels', !!c.reels, reelsSec], ['analysis', !!c.analysis, analysisSec], ['situation', true, situationSec], ['steps', true, stepsSec], ['results', true, resultsSec], ['quote', !!q, quoteSec]];
  const sections = plan.filter(([, on]) => on);

  const aHref = areaHref(c);
  const links = [
    ...c.links,
    ...(aHref ? [{ href: aHref, text: t.areaLink(areaNames[lang][c.area.page] || c.area.name) }] : []),
  ].map((l) => `<a class="cs-link" href="${l.href}">${esc(l.text)} ${ICON.arrow}</a>`).join('\n      ');

  const related = relatedCases(c, all).map((x) => {
    const k = x.card;
    const thumb = k.src && x.service !== 'ads'
      ? `<span class="cs-mcard-thumb"><img src="${k.src}" alt="" ${dim(k)} loading="lazy" decoding="async" /></span>`
      : `<span class="cs-mcard-thumb --num"><b>${esc(k.value)}</b></span>`;
    return `<li><a class="cs-mcard" href="${casePath(x.slug, lang)}">
            ${thumb}
            <span>
              <span class="cs-mcard-tag">${esc(t.service[x.service])}</span>
              <span class="cs-mcard-name">${esc(x.client)}</span>
              <span class="cs-mcard-num"><strong>${esc(k.value)}</strong> ${esc(k.label)}</span>
            </span>
            ${ICON.chev}
          </a></li>`;
  }).join('\n        ');

  const h = c.hero;
  const orgs = c.organizations.map((n) => ({ '@type': 'Organization', name: n }));
  const ogImage = c.ogImage || (
    h.type === 'video' ? h.poster
      : h.type === 'talk' ? c.quote.video.poster
        : h.type === 'image' && !/\.avif$/.test(h.src) ? h.src
          : h.type === 'device' ? h.desktop.src
            : (c.card && c.card.src && !/\.avif$/.test(c.card.src) && type !== 'ads' ? c.card.src : DEFAULT_OG));
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
      ...(c.reels ? c.reels.items.filter((x) => x.uploaded).map((x, i) => ({
        '@type': 'VideoObject', '@id': `${url}#video-${i + 1}`,
        name: `${c.client}: ${x.title}`,
        description: `${x.alt}. ${x.views} ${t.views} on Instagram${x.likes ? `, ${x.likes} ${t.likes}` : ''}.`,
        thumbnailUrl: abs(x.poster), contentUrl: abs(`/${String(x.src).replace(/^(\.\.\/|\/)+/, '')}`),
        uploadDate: x.uploaded, ...(x.duration ? { duration: x.duration } : {}),
        inLanguage: lang, isPartOf: { '@id': `${url}#article` },
      })) : []),
    ],
  };

  const preload = h.type === 'video' ? h.poster : h.type === 'talk' ? c.quote.video.poster : h.type === 'device' ? h.desktop.src : h.type === 'image' ? h.src : null;

  return `${headHtml({ t, chrome, title: c.metaTitle, description: c.metaDescription, url, enUrl: lang === 'en' ? url : alt ? abs(casePath(c.slug, 'en')) : null, esUrl: lang === 'es' ? url : alt ? abs(casePath(c.slug, 'es')) : null, ogImage, schema, preload })}
<body>
  ${chrome.gtmNoscript}

  ${chrome.depth}

  ${chrome.nav}

  <main class="page cs-page cs-casepage cs-type-${type}">

    <nav class="cs-crumbs" aria-label="${escAttr(t.crumbs)}">
      <ol>
        <li><a href="${hubPath(lang)}">${esc(t.hubName)}</a></li>
        <li><span aria-current="page">${esc(c.crumb || c.client)}</span></li>
      </ol>
    </nav>

    <!-- HERO (${type}) -->
${renderHero(c, t)}

    <nav class="cs-toc" aria-label="${escAttr(t.onPage)}">
      <ul data-cs-scroll>
        ${sections.map(([k]) => `<li><a href="#${ids[k]}">${esc(t.nav[k])}</a></li>`).join('\n        ')}
      </ul>
    </nav>
${sections.map(([, , fn]) => fn()).join('\n')}

    <div class="cs-links">
      ${links}
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
