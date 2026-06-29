// Blog generator for Button Up Media.
// Renders the EN hub (/blog), ES hub (/es/blog), every post page
// (/blog/{slug}, /es/blog/{slug}), RSS feeds, and returns sitemap <url> entries.
// Source of truth: blog/posts.json (manifest) + blog/content/{id}.{en|es}.json (article bodies).
// Called by scripts/build-public.mjs after the static assets are copied into public/.

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const BASE = 'https://www.buttonupmedia.com';
const CSS_VER = 'nav-mobile-4';
const GTM_ID = 'GTM-WR9TZHT';
const PHONE = '+17867409499';
const PHONE_DISPLAY = '(786) 740-9499';
const PUBLISH_TIME = 'T09:00:00-04:00'; // 9am ET

const AUTHORS = {
  chris: {
    name: 'Christian Paula',
    jobTitleEn: 'Creative Director',
    jobTitleEs: 'Director Creativo',
    photo: '/media/author-chris.webp',
    linkedin: 'https://www.linkedin.com/in/christian-paula-48bb1a263/',
    bioEn: 'Christian Paula is the Creative Director at Button Up Media, a restaurant-focused marketing agency based in Miami, Florida. He leads the content, video, and design work that helps restaurants, bars, and coffee shops stand out and fill seats.',
    bioEs: 'Christian Paula es el Director Creativo de Button Up Media, una agencia de marketing enfocada en restaurantes con sede en Miami, Florida. Lidera el contenido, el video y el diseño que ayudan a restaurantes, bares y cafeterías a destacar y llenar mesas.',
  },
  juan: {
    name: 'Juan Hernandez',
    jobTitleEn: 'Account Manager & Founder',
    jobTitleEs: 'Account Manager y Fundador',
    photo: '/media/author-juan.webp',
    linkedin: 'https://www.linkedin.com/in/onema/',
    bioEn: 'Juan Hernandez is an Account Manager and Founder at Button Up Media, a restaurant-focused marketing agency based in Miami, Florida. He works directly with owners to turn marketing into reservations, orders, and foot traffic.',
    bioEs: 'Juan Hernandez es Account Manager y Fundador de Button Up Media, una agencia de marketing enfocada en restaurantes con sede en Miami, Florida. Trabaja directamente con los dueños para convertir el marketing en reservas, pedidos y clientes.',
  },
};

const CATS = {
  social: { en: 'Social Media', es: 'Redes Sociales', art: '--social' },
  ads: { en: 'Paid Ads', es: 'Publicidad', art: '--ads' },
  web: { en: 'Web Design', es: 'Diseño Web', art: '--web' },
  seo: { en: 'Local SEO', es: 'SEO Local', art: '--seo' },
  strategy: { en: 'Strategy', es: 'Estrategia', art: '--strategy' },
};

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const T = {
  en: {
    home: 'Home', blog: 'Blog', faq: 'Frequently asked questions', takeaways: 'The short version',
    tocTitle: 'Jump to what you need', tocAria: 'On this page',
    fcStrong: 'Want a hand with this?', fcSpan: 'Juan, our founder, will walk you through it on a free 30-minute call. Real person, no jargon, no pressure.', fcBtn: 'Book a free call with Juan',
    keepReading: 'Keep reading', minRead: (n) => `${n} min read`, articles: (n) => `${n} ${n === 1 ? 'article' : 'articles'}`,
    all: 'All', latest: 'Latest articles', featured: 'Featured', latestStory: 'Latest story', read: 'Read the article',
    empty: 'No articles in this category yet. Check back soon.',
    midStrong: 'Want a plan like this for your restaurant?', midSpan: 'Free 30-minute strategy call. No pressure, no jargon.', midBtn: 'Book a Free Strategy Call',
    ctaEyebrow: 'Free, no pressure', call: `Call ${PHONE_DISPLAY}`,
    bandEyebrow: 'Free, no pressure', bandH2: 'Want this handled for you?',
    bandP: 'Book a free strategy call and we will map out exactly how we would help your restaurant stand out. No obligation.', bandBtn: 'Book a Free Strategy Call',
    closing: (c) => `If this was useful and you would rather hand it off, <a href="${c}">book a free strategy call</a> and we will build a plan around your specific restaurant.`,
    heroEyebrow: 'The Button Up Blog',
    heroH1: 'Restaurant marketing that fills seats, <span class="bl-gold">explained.</span>',
    heroSub: 'Playbooks, breakdowns, and honest numbers from the work we do every day for restaurants, bars, and coffee shops across Miami and beyond.',
    blogTitle: 'Blog | Button Up Media, Restaurant Marketing Insights',
    blogDesc: 'Practical restaurant marketing playbooks from Button Up Media: social media, paid ads, websites, and local SEO for restaurants, bars, and coffee shops in Miami and across the US.',
    lang: 'en', htmlLang: 'en', rssLang: 'en-US', contact: '/contact', hub: '/blog',
  },
  es: {
    home: 'Inicio', blog: 'Blog', faq: 'Preguntas frecuentes', takeaways: 'En resumen',
    tocTitle: 'Vaya directo a lo que busca', tocAria: 'En esta página',
    fcStrong: '¿Quiere ayuda con esto?', fcSpan: 'Juan, nuestro fundador, se lo explica en una llamada gratis de 30 minutos. Una persona real, sin tecnicismos y sin compromiso.', fcBtn: 'Agende una llamada gratis con Juan',
    keepReading: 'Sigue leyendo', minRead: (n) => `${n} min de lectura`, articles: (n) => `${n} ${n === 1 ? 'artículo' : 'artículos'}`,
    all: 'Todos', latest: 'Artículos recientes', featured: 'Destacado', latestStory: 'Lo más reciente', read: 'Leer el artículo',
    empty: 'Aún no hay artículos en esta categoría. Vuelva pronto.',
    midStrong: '¿Quiere un plan así para su restaurante?', midSpan: 'Llamada de estrategia gratis de 30 minutos. Sin compromiso.', midBtn: 'Reserve su llamada gratis',
    ctaEyebrow: 'Gratis, sin compromiso', call: `Llame al ${PHONE_DISPLAY}`,
    bandEyebrow: 'Gratis, sin compromiso', bandH2: '¿Quiere que lo hagamos por usted?',
    bandP: 'Reserve una llamada de estrategia gratis y le mostramos exactamente cómo ayudaríamos a su restaurante a destacar. Sin compromiso.', bandBtn: 'Reserve su llamada gratis',
    closing: (c) => `Si esto le fue útil y prefiere delegarlo, <a href="${c}">reserve una llamada de estrategia gratis</a> y armamos un plan a la medida de su restaurante.`,
    heroEyebrow: 'El Blog de Button Up',
    heroH1: 'Marketing de restaurantes que llena mesas, <span class="bl-gold">explicado.</span>',
    heroSub: 'Guías prácticas, análisis y números honestos del trabajo que hacemos cada día para restaurantes, bares y cafeterías en Miami y más allá.',
    blogTitle: 'Blog | Button Up Media, Marketing para Restaurantes',
    blogDesc: 'Guías prácticas de marketing para restaurantes de Button Up Media: redes sociales, publicidad, páginas web y SEO local para restaurantes, bares y cafeterías en Miami y todo EE. UU.',
    lang: 'es', htmlLang: 'es', rssLang: 'es', contact: '/es/contacto', hub: '/es/blog',
  },
};

// ---------- escaping ----------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const escXml = (s) => escAttr(s);
const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const slugify = (s) => stripTags(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'section';

// ---------- shared chrome ----------
function gtmHead() {
  return `  <script>
    (function () {
      var key = "bum-cookie-consent-v1";
      var consent = { ad_storage:"denied", ad_user_data:"denied", ad_personalization:"denied", analytics_storage:"denied", functionality_storage:"granted", personalization_storage:"denied", security_storage:"granted", wait_for_update:500 };
      try { var saved = localStorage.getItem(key); if (saved) { var p = JSON.parse(saved);
        if (p && p.analytics) consent.analytics_storage = "granted";
        if (p && p.marketing && !(navigator && navigator.globalPrivacyControl)) { consent.ad_storage="granted"; consent.ad_user_data="granted"; consent.ad_personalization="granted"; consent.personalization_storage="granted"; } } } catch (e) {}
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
      window.gtag("consent", "default", consent);
    })();
  </script>
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');</script>
  <!-- End Google Tag Manager -->`;
}

function gtmNoscript() {
  return `  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
}

function fontPreloads() {
  return `  <link rel="preload" as="font" type="font/woff2" href="/fonts/plus-jakarta-sans-variable.woff2" crossorigin fetchpriority="high" />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/epilogue-variable.woff2" crossorigin />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/figtree-variable.woff2" crossorigin />`;
}

function depthCanvas() {
  return `  <div class="depth-canvas" aria-hidden="true">
    <div class="mesh-orb" style="--orb-color: var(--gold); width: 520px; height: 520px; top: -6%; right: 4%;"></div>
    <div class="mesh-orb" style="--orb-color: var(--teal); width: 380px; height: 380px; bottom: 24%; left: -8%;"></div>
  </div>`;
}

function nav(lang) {
  if (lang === 'es') {
    return `  <nav class="lib-nav" data-shared-animations="off">
    <a class="lib-nav-brand" href="/es" aria-label="Inicio de Button Up Media">
      <img src="/images/full-logo-dark.png" alt="Button Up Media" width="145" height="48" />
    </a>
    <div class="lib-nav-links">
      <details class="lib-nav-dropdown">
        <summary class="lib-nav-dropdown-trigger">Servicios
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="lib-nav-dropdown-menu" role="menu" aria-label="Servicios">
          <div class="lib-desktop-services">
            <a href="/es/marketing-redes-sociales">Marketing de Redes Sociales</a>
            <a href="/es/diseno-web-restaurantes">Diseño Web</a>
          </div>
          <details class="lib-mobile-services lib-mobile-menu-only">
            <summary class="lib-mobile-services-trigger">Servicios
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </summary>
            <div class="lib-mobile-services-menu" role="menu" aria-label="Servicios">
              <a href="/es/marketing-redes-sociales">Marketing de Redes Sociales</a>
              <a href="/es/diseno-web-restaurantes">Diseño Web</a>
            </div>
          </details>
          <a href="/es/nosotros" class="lib-mobile-menu-only lib-mobile-action --ghost">Nosotros</a>
          <a href="tel:${PHONE}" class="lib-mobile-menu-only lib-mobile-action --ghost">Llámanos</a>
          <a href="/es/contacto" class="lib-mobile-menu-only lib-mobile-action --primary">Agende su llamada de estrategia gratis</a>
        </div>
      </details>
      <a href="/es">Inicio</a>
      <a href="/es/nosotros">Nosotros</a>
      <a class="lib-nav-phone" href="tel:${PHONE}">Llámanos</a>
      <a href="/es/contacto" class="btn btn-primary" style="padding: 0 16px; height: 36px; font-size: 0.76rem;">Agende su llamada de estrategia gratis</a>
    </div>
  </nav>`;
  }
  return `  <nav class="lib-nav" data-shared-animations="off">
    <a class="lib-nav-brand" href="/" aria-label="Button Up Media home">
      <img src="/images/full-logo-dark.png" alt="Button Up Media" width="145" height="48" />
    </a>
    <div class="lib-nav-links">
      <details class="lib-nav-dropdown">
        <summary class="lib-nav-dropdown-trigger">Services
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="lib-nav-dropdown-menu" role="menu" aria-label="Services">
          <div class="lib-desktop-services">
            <a href="/socialmediamarketing">Social Media Marketing</a>
            <a href="/restaurant-advertising">Paid Media</a>
            <a href="/restaurant-website-design">Website</a>
          </div>
          <details class="lib-mobile-services lib-mobile-menu-only">
            <summary class="lib-mobile-services-trigger">Services
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </summary>
            <div class="lib-mobile-services-menu" role="menu" aria-label="Services">
              <a href="/socialmediamarketing">Social Media Marketing</a>
              <a href="/restaurant-advertising">Paid Media</a>
              <a href="/restaurant-website-design">Website</a>
            </div>
          </details>
          <a href="/about" class="lib-mobile-menu-only lib-mobile-action --ghost">About</a>
          <a href="tel:${PHONE}" class="lib-mobile-menu-only lib-mobile-action --ghost">Call Us</a>
          <a href="/contact" class="lib-mobile-menu-only lib-mobile-action --primary">Book Free Strategy Call</a>
        </div>
      </details>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a class="lib-nav-phone" href="tel:${PHONE}">Call Us</a>
      <a href="/contact" class="btn btn-primary" style="padding: 0 16px; height: 36px; font-size: 0.76rem;">Book Free Strategy Call</a>
    </div>
  </nav>`;
}

function footer(lang) {
  if (lang === 'es') {
    return `    <footer class="lib-section footer-demo">
      <div class="footer-grid">
        <div class="footer-brand">
          <strong style="font-family: var(--font-display); font-size: 1rem;">Button Up Media</strong>
          <p>Button Up Media es una agencia de marketing para restaurantes en Florida. Ayudamos a los restaurantes a crecer con redes sociales, diseño web, SEO y publicidad.</p>
        </div>
        <div class="footer-col">
          <h4>Servicios</h4>
          <a href="/es/marketing-redes-sociales">Marketing de Redes Sociales</a>
          <a href="/es/diseno-web-restaurantes">Diseño Web</a>
        </div>
        <div class="footer-col">
          <h4>Ubicaciones</h4>
          <span class="footer-location">Miami</span>
          <span class="footer-location">Fort Lauderdale</span>
          <span class="footer-location">Orlando</span>
          <span class="footer-location">Tampa</span>
        </div>
        <div class="footer-col">
          <h4>Empresa</h4>
          <a href="/es">Inicio</a>
          <a href="/es/nosotros">Nosotros</a>
          <a href="/es/blog">Blog</a>
          <a href="/es/contacto">Contacto</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Button Up Media. Todos los derechos reservados.</p>
        <div class="footer-links">
          <a href="mailto:contact@buttonupmedia.com">contact@buttonupmedia.com</a>
          <a href="tel:${PHONE}">${PHONE_DISPLAY}</a>
          <a href="/privacy">Política de Privacidad</a>
          <a href="/terms">Términos del Servicio</a>
        </div>
      </div>
    </footer>`;
  }
  return `    <footer class="lib-section footer-demo">
      <div class="footer-grid">
        <div class="footer-brand">
          <strong style="font-family: var(--font-display); font-size: 1rem;">Button Up Media</strong>
          <p>Button Up Media is a restaurant marketing agency in Florida. We help restaurants grow with social media, website design, SEO, and advertising.</p>
        </div>
        <div class="footer-col">
          <h4>Services</h4>
          <a href="/socialmediamarketing">Social Media Marketing</a>
          <a href="/restaurant-advertising">Paid Media</a>
          <a href="/restaurant-website-design">Website</a>
        </div>
        <div class="footer-col">
          <h4>Locations</h4>
          <span class="footer-location">Miami</span>
          <span class="footer-location">Fort Lauderdale</span>
          <span class="footer-location">Orlando</span>
          <span class="footer-location">Tampa</span>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/blog">Blog</a>
          <a href="/contact">Contact</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Button Up Media. All rights reserved.</p>
        <div class="footer-links">
          <a href="mailto:contact@buttonupmedia.com">contact@buttonupmedia.com</a>
          <a href="tel:${PHONE}">${PHONE_DISPLAY}</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </div>
      </div>
    </footer>`;
}

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;margin-left:6px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

// Inline "book a call with our founder" nudge. Juan's face makes the agency feel
// human; placed mid-article so a reader who is sold can act without scrolling.
function founderCta(lang) {
  const t = T[lang];
  const j = AUTHORS.juan;
  return `<aside class="bp-foundercta bp-rise">
            <div class="bp-foundercta-photo"><img src="${j.photo}" alt="${escAttr(j.name)}, ${esc(lang === 'es' ? j.jobTitleEs : j.jobTitleEn)}" width="66" height="66" loading="lazy" /></div>
            <div class="bp-foundercta-text"><strong>${esc(t.fcStrong)}</strong><span>${esc(t.fcSpan)}</span></div>
            <a href="${t.contact}" class="btn btn-primary">${esc(t.fcBtn)} ${ARROW}</a>
          </aside>`;
}

// ---------- CSS (from the Claude Design handoff, conformed) ----------
const POST_CSS = `
    .bp-wrap { width: min(calc(100% - 40px), var(--max)); margin: 0 auto; }
    .bp-narrow { width: min(calc(100% - 40px), 720px); margin: 0 auto; }
    .bp-eyebrow { display: inline-flex; align-items: center; gap: 9px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); }
    .bp-gold { color: var(--gold); }
    .bp-rise { transform: translateY(20px); transition: transform .7s cubic-bezier(.22,1,.36,1); will-change: transform; }
    .bp-rise.is-in { transform: none; }
    @media (prefers-reduced-motion: reduce) { .bp-rise { transform: none; transition: none; } }
    .bp-head { padding: clamp(104px, 14vw, 160px) 0 clamp(20px, 3vw, 32px); }
    .bp-crumbs { display: flex; align-items: center; gap: 9px; font-size: 0.78rem; color: var(--text-soft); margin-bottom: 22px; }
    .bp-crumbs a { color: var(--text-soft); transition: color .2s; }
    .bp-crumbs a:hover { color: var(--gold); }
    .bp-crumbs svg { width: 13px; height: 13px; }
    .bp-flag { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: 999px; background: var(--gold-soft); border: 1px solid rgba(226,168,77,0.22); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); }
    .bp-title { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.045em; font-size: clamp(2.1rem, 5.2vw, 3.6rem); line-height: 1.02; margin: 18px 0 0; max-width: 24ch; text-wrap: balance; }
    .bp-standfirst { margin-top: 20px; font-size: clamp(1.06rem, 2.3vw, 1.28rem); line-height: 1.55; color: var(--text-dim); max-width: 60ch; }
    .bp-byline { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 28px; }
    .bp-avatar { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; flex: none; border: 1px solid var(--line); background: var(--bg-3); }
    .bp-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bp-byline-meta { display: flex; flex-direction: column; gap: 2px; }
    .bp-byline-meta strong { font-family: var(--font-display); font-size: 0.9rem; font-weight: 700; color: var(--text-head); }
    .bp-byline-meta span { font-size: 0.76rem; color: var(--text-soft); }
    .bp-byline-dates { display: flex; align-items: center; gap: 9px; font-size: 0.78rem; color: var(--text-soft); margin-left: auto; }
    .bp-byline-dates .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--text-soft); }
    .bp-hero-media { margin: clamp(26px, 4vw, 44px) 0 0; border-radius: 22px; overflow: hidden; border: 1px solid var(--line); aspect-ratio: 16 / 8; position: relative; }
    .bp-hero-art { width: 100%; height: 100%; display: grid; place-items: center; background: linear-gradient(135deg, #3a1f1a, #1a0d0a); }
    .bp-hero-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .bp-body { padding: clamp(36px, 5vw, 60px) 0 clamp(20px, 3vw, 36px); }
    .bp-body > * + * { margin-top: 1.45em; }
    .bp-body p { font-size: 1.08rem; line-height: 1.78; color: var(--text-dim); }
    .bp-body p > strong { color: var(--text); font-weight: 700; }
    .bp-body a { color: var(--gold); text-decoration: underline; text-decoration-color: rgba(226,168,77,0.4); text-underline-offset: 3px; transition: text-decoration-color .2s; }
    .bp-body a:hover { text-decoration-color: var(--gold); }
    .bp-body h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.03em; font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.12; color: var(--text-head); margin-top: 1.9em; scroll-margin-top: 90px; }
    .bp-body h3 { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; font-size: clamp(1.18rem, 2.2vw, 1.4rem); color: var(--text-head); margin-top: 1.6em; }
    .bp-body ul, .bp-body ol { padding-left: 1.3em; }
    .bp-body li { font-size: 1.06rem; line-height: 1.7; color: var(--text-dim); margin-top: 0.55em; }
    .bp-body li::marker { color: var(--gold); }
    .bp-body img { width: 100%; height: auto; border-radius: 16px; border: 1px solid var(--line); display: block; }
    .bp-body figure { margin: 0; }
    .bp-body figcaption { font-size: 0.82rem; color: var(--text-soft); margin-top: 10px; text-align: center; }
    .bp-body hr { border: 0; border-top: 1px solid var(--line-soft); margin: 2.4em 0; }
    .bp-callout { margin: 1.8em 0; padding: 22px 24px; border-radius: 16px; border: 1px solid rgba(226,168,77,0.22); background: linear-gradient(135deg, rgba(226,168,77,0.08), rgba(208,106,80,0.05)); }
    .bp-callout strong { display: block; font-family: var(--font-display); font-size: 0.96rem; color: var(--gold); margin-bottom: 10px; }
    .bp-callout p { font-size: 0.98rem; line-height: 1.65; color: var(--text-dim); margin: 0; }
    .bp-callout ul { margin: 0; padding-left: 1.15em; }
    .bp-callout li { font-size: 0.98rem; line-height: 1.6; color: var(--text-dim); margin-top: 0.4em; }
    .bp-callout li::marker { color: var(--gold); }
    .bp-author { margin: clamp(34px, 5vw, 52px) 0 0; display: grid; grid-template-columns: 1fr; gap: 14px; padding: clamp(24px, 3vw, 32px); border-radius: 20px; border: 1px solid var(--line); background: var(--bg-2); }
    .bp-author-photo { width: 76px; height: 76px; border-radius: 50%; overflow: hidden; border: 1px solid var(--line); background: var(--bg-3); flex: none; }
    .bp-author-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bp-author-top { display: flex; align-items: center; gap: 16px; }
    .bp-author h4 { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: var(--text-head); }
    .bp-author .role { font-size: 0.8rem; color: var(--gold); margin-top: 2px; }
    .bp-author p { font-size: 0.92rem; line-height: 1.6; color: var(--text-dim); margin-top: 4px; }
    .bp-related { padding: clamp(48px, 7vw, 84px) 0 clamp(30px, 4vw, 48px); }
    .bp-related h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.025em; font-size: clamp(1.3rem, 2.4vw, 1.8rem); margin-bottom: 24px; }
    .bp-related-grid { display: grid; grid-template-columns: 1fr; gap: clamp(20px, 2.4vw, 28px); }
    @media (min-width: 720px) { .bp-related-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .bp-rcard { display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; border: 1px solid var(--line); background: var(--bg-2); transition: border-color .3s, transform .3s; }
    .bp-rcard:hover { border-color: rgba(226,168,77,0.28); transform: translateY(-4px); }
    .bp-rcard-media { aspect-ratio: 16 / 9; position: relative; }
    .bp-rcard-flag { position: absolute; top: 12px; left: 12px; z-index: 2; padding: 4px 10px; border-radius: 999px; background: rgba(10,10,10,0.7); backdrop-filter: blur(8px); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); }
    .bp-rcard-body { padding: 16px 18px 18px; }
    .bp-rcard-body h3 { font-family: var(--font-display); font-size: 1rem; font-weight: 700; line-height: 1.2; }
    .bp-rcard-body h3 a { color: var(--text-head); transition: color .2s; }
    .bp-rcard-body h3 a:hover { color: var(--gold); }
    .bp-rcard-body span { display: block; font-size: 0.74rem; color: var(--text-soft); margin-top: 10px; }
    .bp-art { width: 100%; height: 100%; display: grid; place-items: center; position: relative; }
    .bp-art svg { width: 40px; height: 40px; color: rgba(255,248,235,0.32); }
    .bp-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .bp-art.--social { background: linear-gradient(135deg, #2a1a3a, #120b1c); }
    .bp-art.--ads { background: linear-gradient(135deg, rgba(226,168,77,0.24), #1a1206); }
    .bp-art.--web { background: linear-gradient(135deg, #16221e, #0b110e); }
    .bp-art.--seo { background: linear-gradient(135deg, #123040, #08161c); }
    .bp-art.--strategy { background: linear-gradient(135deg, #3a1f1a, #1a0d0a); }
    .bp-midcta { margin: 2.2em 0; border-radius: 18px; padding: 24px 26px; border: 1px solid rgba(226,168,77,0.24); background: linear-gradient(135deg, rgba(226,168,77,0.1), rgba(208,106,80,0.06)), var(--bg-2); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; }
    .bp-midcta-text strong { display: block; font-family: var(--font-display); font-size: 1.16rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-head); }
    .bp-midcta-text span { display: block; font-size: 0.9rem; color: var(--text-dim); margin-top: 4px; }
    .bp-midcta .btn { flex: none; }
    .bp-cta { margin: 0 0 clamp(40px, 6vw, 72px); }
    .bp-cta-inner { border-radius: 24px; position: relative; overflow: hidden; border: 1px solid rgba(226,168,77,0.22); background: linear-gradient(135deg, rgba(226,168,77,0.12), rgba(208,106,80,0.08)), var(--bg-2); padding: clamp(34px, 5vw, 60px); text-align: center; }
    .bp-cta-inner h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.03em; font-size: clamp(1.6rem, 3.4vw, 2.4rem); line-height: 1.05; }
    .bp-cta-inner p { color: var(--text-dim); font-size: 1rem; line-height: 1.6; margin: 14px auto 0; max-width: 48ch; }
    .bp-cta-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 26px; }
    .bp-progress { position: fixed; top: 0; left: 0; height: 3px; width: 0; background: linear-gradient(90deg, var(--gold), var(--coral)); z-index: 60; transition: width .1s linear; }
    /* whole related-card click target */
    .bp-rcard { position: relative; }
    .bp-rcard-body h3 a::after { content: ""; position: absolute; inset: 0; z-index: 1; }
    /* table of contents (quick-answer jump nav) */
    .bp-toc { margin: 1.6em 0 0; padding: 20px 22px; border-radius: 16px; border: 1px solid var(--line); background: var(--bg-2); }
    .bp-toc-title { display: flex; align-items: center; gap: 9px; font-family: var(--font-display); font-size: 0.74rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); margin-bottom: 10px; }
    .bp-toc-title::before { content: ""; width: 20px; height: 1px; background: var(--gold); opacity: 0.7; }
    .bp-toc ol { list-style: none; padding: 0; margin: 0; counter-reset: bptoc; display: grid; gap: 1px; }
    @media (min-width: 640px) { .bp-toc ol { grid-template-columns: 1fr 1fr; gap: 1px 20px; } }
    .bp-toc li { margin: 0; }
    .bp-toc a { display: flex; gap: 11px; align-items: baseline; padding: 9px 10px; border-radius: 10px; color: var(--text-dim); font-size: 0.99rem; line-height: 1.4; text-decoration: none; transition: background .2s, color .2s; }
    .bp-toc a::before { counter-increment: bptoc; content: counter(bptoc); font-variant-numeric: tabular-nums; font-weight: 800; color: var(--gold); font-size: 0.8rem; flex: none; min-width: 1.5em; }
    .bp-toc a:hover { background: var(--gold-soft); color: var(--text-head); }
    /* founder CTA (human, book-a-call nudge) */
    .bp-foundercta { margin: 2.2em 0; padding: 20px 22px; border-radius: 18px; border: 1px solid rgba(226,168,77,0.3); background: linear-gradient(135deg, rgba(226,168,77,0.13), rgba(208,106,80,0.05)), var(--bg-2); display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .bp-foundercta-photo { width: 66px; height: 66px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(226,168,77,0.55); flex: none; }
    .bp-foundercta-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bp-foundercta-text { flex: 1 1 240px; }
    .bp-foundercta-text strong { display: block; font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-head); }
    .bp-foundercta-text span { display: block; font-size: 0.92rem; line-height: 1.5; color: var(--text-dim); margin-top: 3px; }
    .bp-foundercta .btn { flex: none; }
    @media (max-width: 540px) { .bp-foundercta { gap: 14px; } .bp-foundercta .btn { width: 100%; justify-content: center; } }
`;

const HUB_CSS = `
    .bl-wrap { width: min(calc(100% - 40px), var(--max)); margin: 0 auto; }
    .bl-eyebrow { display: inline-flex; align-items: center; gap: 9px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); }
    .bl-eyebrow::before { content: ""; width: 22px; height: 1px; background: var(--gold); opacity: 0.7; }
    .bl-gold { color: var(--gold); }
    .bl-rise { transform: translateY(20px); transition: transform .7s cubic-bezier(.22,1,.36,1); will-change: transform; }
    .bl-rise.is-in { transform: none; }
    @media (prefers-reduced-motion: reduce) { .bl-rise { transform: none; transition: none; } }
    .bl-hero { position: relative; padding: clamp(104px, 14vw, 168px) 0 clamp(28px, 4vw, 44px); }
    .bl-hero h1 { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.045em; font-size: clamp(2.3rem, 6vw, 4.2rem); line-height: 0.99; margin-top: 16px; max-width: 18ch; }
    .bl-hero-sub { max-width: 56ch; margin-top: 18px; font-size: clamp(1.02rem, 2.2vw, 1.18rem); line-height: 1.62; color: var(--text-dim); }
    /* ===== LEAD: big featured (left) + text list (right) ===== */
    .bl-lead { padding: clamp(18px, 2.5vw, 28px) 0 clamp(48px, 7vw, 84px); }
    .bl-lead-grid { display: grid; grid-template-columns: 1fr; gap: clamp(34px, 4vw, 48px); align-items: start; }
    @media (min-width: 900px) { .bl-lead-grid { grid-template-columns: 1.18fr 0.82fr; gap: clamp(40px, 4.5vw, 70px); } }
    .bl-feature { position: relative; display: block; }
    .bl-feature-media { position: relative; aspect-ratio: 16 / 10; border-radius: 20px; overflow: hidden; border: 1px solid var(--line); background: #ece6db; }
    .bl-feature-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .5s cubic-bezier(.22,1,.36,1); }
    .bl-feature:hover .bl-feature-media img { transform: scale(1.03); }
    .bl-feature-flag { position: absolute; top: 16px; left: 16px; z-index: 2; display: inline-flex; align-items: center; gap: 7px; padding: 6px 13px; border-radius: 999px; background: rgba(10,10,10,0.72); backdrop-filter: blur(8px); font-size: 0.66rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); }
    .bl-feature-body { padding-top: clamp(18px, 2.4vw, 24px); }
    .bl-feature h2 { font-family: var(--font-hero); font-weight: 800; letter-spacing: -0.035em; font-size: clamp(1.7rem, 3.4vw, 2.7rem); line-height: 1.04; margin-top: 10px; text-wrap: balance; }
    .bl-feature h2 a { color: var(--text-head); transition: color .2s; }
    .bl-feature:hover h2 a { color: var(--gold); }
    .bl-feature-excerpt { margin-top: 14px; color: var(--text-dim); font-size: clamp(1rem, 1.4vw, 1.08rem); line-height: 1.62; max-width: 56ch; }
    .bl-feature-meta { margin-top: 18px; display: flex; align-items: center; flex-wrap: wrap; gap: 9px; font-size: 0.8rem; color: var(--text-soft); }
    .bl-feature-meta strong { font-family: var(--font-display); font-weight: 700; color: var(--text-head); }
    .bl-feature-meta .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--text-soft); }
    .bl-feature h2 a::after { content: ""; position: absolute; inset: 0; z-index: 1; }
    .bl-list { display: flex; flex-direction: column; }
    .bl-list-head { font-family: var(--font-display); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-head); padding-bottom: 14px; border-bottom: 2px solid var(--gold); }
    .bl-list-item { display: block; padding: 18px 0; border-bottom: 1px solid var(--line-soft); }
    .bl-list-item:last-child { border-bottom: 0; }
    .bl-list-cat { display: block; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--gold); margin-bottom: 7px; }
    .bl-list-item h3 { font-family: var(--font-display); font-size: 1.04rem; font-weight: 700; line-height: 1.26; letter-spacing: -0.01em; color: var(--text-head); transition: color .2s; }
    .bl-list-item:hover h3 { color: var(--gold); }
    .bl-list-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 9px; font-size: 0.76rem; color: var(--text-soft); }
    .bl-list-meta strong { font-weight: 600; color: var(--text-dim); }
    .bl-news { position: relative; margin: 0 0 clamp(40px, 6vw, 72px); }
    .bl-news-inner { border-radius: 24px; overflow: hidden; position: relative; border: 1px solid rgba(226,168,77,0.22); background: linear-gradient(135deg, rgba(226,168,77,0.1), rgba(208,106,80,0.07)), var(--bg-2); padding: clamp(34px, 5vw, 60px); display: grid; grid-template-columns: 1fr; gap: 24px; align-items: center; }
    .bl-news h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.03em; font-size: clamp(1.5rem, 3vw, 2.2rem); line-height: 1.05; }
    .bl-news p { color: var(--text-dim); font-size: 0.96rem; line-height: 1.6; margin-top: 10px; max-width: 46ch; }
    @media (min-width: 820px) { .bl-news-inner { grid-template-columns: 1.1fr 0.9fr; gap: 40px; } .bl-news-inner > div:last-child { justify-self: end; } }
`;

// Light, editorial theme for the blog. Scoped to .page so the dark brand nav
// pill is untouched. Flattens the gold-glow gradients and removes the mesh orbs
// for a cleaner, less "stock-AI" reading experience.
// Light header for blog pages. The nav lives OUTSIDE .page, so these rules are
// unscoped; they only land on blog pages because they ship in the blog's inline
// <style>. The brand uses a pre-blackened logo asset (full-logo-dark.png) rather
// than a CSS filter: the white wordmark is a raster-in-SVG with an internal mask,
// and stacking filter: brightness(0) on top made iOS Safari rasterize it at 1x
// and upscale, smearing the logo on mobile. A flat dark PNG renders crisply.
// The hamburger bars/chevron follow the trigger's currentColor, set dark below.
const NAV_LIGHT_CSS = `
    .lib-nav { background: rgba(255,255,255,0.82); border-color: rgba(28,24,18,0.10); box-shadow: 0 6px 24px rgba(20,16,9,0.07); }
    .lib-nav-links a { color: #4a443b; }
    .lib-nav-links a:hover { color: #1d1a15; background: rgba(20,16,9,0.05); }
    .lib-nav-phone { color: #1d1a15; border-color: rgba(28,24,18,0.18); background: rgba(20,16,9,0.03); }
    .lib-nav-phone:hover { border-color: rgba(226,168,77,0.5); background: rgba(226,168,77,0.12); color: #9a6410; }
    .lib-nav-dropdown-trigger { color: #1d1a15; border-color: rgba(28,24,18,0.16); background: rgba(20,16,9,0.03); }
    .lib-nav-dropdown-menu { background: rgba(255,255,255,0.98); border-color: rgba(28,24,18,0.12); box-shadow: 0 24px 50px rgba(20,16,9,0.16); }
    .lib-nav-dropdown-menu a { color: #1d1a15; }
    .lib-nav-dropdown-menu a:hover { background: rgba(226,168,77,0.14); color: #9a6410; }
    .lib-nav .btn-primary { background: #E2A84D; border-color: #E2A84D; color: #1c1407; }
    .lib-nav .btn-primary:hover { box-shadow: 0 8px 24px rgba(226,168,77,0.34); }
    .lib-nav-links > .lib-lang-switch-mobile, .lib-nav-links > .lib-nav-call-mobile { color: #1d1a15; border-color: rgba(28,24,18,0.16); background: rgba(20,16,9,0.03); }
    .lib-nav-links > .lib-lang-switch-mobile:hover, .lib-nav-links > .lib-nav-call-mobile:hover { border-color: rgba(226,168,77,0.5); background: rgba(226,168,77,0.12); color: #9a6410; }
    .lib-mobile-services-trigger { color: #1d1a15; border-color: rgba(28,24,18,0.12); background: rgba(20,16,9,0.03); }
    .lib-mobile-services-menu a { color: #1d1a15; }
    .lib-mobile-action.--ghost { color: #1d1a15; border-color: rgba(28,24,18,0.16); background: rgba(20,16,9,0.03); }
    .lib-mobile-action.--primary { background: #E2A84D; border-color: #E2A84D; color: #1c1407; }
`;

const LIGHT_CSS = `
    body { background: #fbfaf6; }
    main.page {
      --bg-0:#fbfaf6; --bg-1:#f5f2ea; --bg-2:#ffffff; --bg-3:#f1ede5; --surface:#f6f3ee;
      --line:rgba(28,24,18,0.14); --line-soft:rgba(28,24,18,0.08);
      --text:#1d1a15; --text-head:#120e08; --text-dim:rgba(29,26,21,0.84); --text-soft:rgba(29,26,21,0.56);
      --gold-soft:rgba(226,168,77,0.16);
      color: var(--text);
    }
    .page .btn { background:#ffffff; border-color:rgba(28,24,18,0.2); color:var(--text); }
    .page .btn:hover { border-color:rgba(28,24,18,0.36); }
    .page .btn-primary { background:var(--gold); border-color:var(--gold); color:#1c1407; }
    .page .btn-primary:hover { box-shadow:0 10px 26px rgba(226,168,77,0.34); }
    .page .footer-demo { border-top:1px solid var(--line); margin-top:48px; }
    .page .footer-demo::before { display:none; }
    .page .footer-col a:hover, .page .footer-links a:hover { color:#9a6410; }
    /* flatten gold-glow boxes into clean cream cards */
    .page .bp-cta-inner, .page .bl-news-inner, .page .bp-midcta, .page .bp-callout { background:#faf6ee; border:1px solid var(--line); }
    /* content cards read on white */
    .page .bp-rcard, .page .bp-author { background:#ffffff; }
    .page .bp-hero-art { background:#ece6db; }
    /* editorial links: dark text, gold underline */
    .page .bp-body a { color:var(--text-head); text-decoration-color:rgba(226,168,77,0.7); }
    .page .bp-body a:hover { color:#9a6410; text-decoration-color:var(--gold); }
`;

// ---------- date / reading helpers ----------
function fmtDate(dateStr, lang) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return lang === 'es' ? `${d} ${MONTHS_ES[m - 1]} ${y}` : `${MONTHS_EN[m - 1]} ${d}, ${y}`;
}
function rfc822(dateStr) {
  return new Date(`${dateStr}${PUBLISH_TIME}`).toUTCString();
}
function readingTime(content) {
  const words = content.wordCount || stripTags(
    (content.intro || '') + ' ' + (content.sections || []).map((s) => s.html).join(' ')
  ).split(/\s+/).length;
  return Math.max(3, Math.round(words / 200));
}

// ---------- per-post derived view ----------
function postView(post, lang, content) {
  const t = T[lang];
  const slug = post[lang].slug;
  const url = lang === 'es' ? `${BASE}/es/blog/${slug}` : `${BASE}/blog/${slug}`;
  const cat = CATS[post.category] || CATS.strategy;
  return {
    post, lang, content, slug, url,
    path: lang === 'es' ? `/es/blog/${slug}` : `/blog/${slug}`,
    title: content.h1,
    excerpt: content.metaDescription,
    catLabel: cat[lang], catArt: cat.art,
    hero: post.hero, heroAlt: post.heroAlt,
    date: post.date, dateFmt: fmtDate(post.date, lang),
    read: t.minRead(readingTime(content)),
    author: AUTHORS[post.author],
  };
}

// ---------- post page ----------
function renderPost(view, allViews) {
  const { lang, content, url, title, catLabel, catArt, hero, heroAlt, dateFmt, read, author } = view;
  const t = T[lang];
  const role = lang === 'es' ? author.jobTitleEs : author.jobTitleEn;
  const bio = lang === 'es' ? author.bioEs : author.bioEn;
  const enUrl = `${BASE}/blog/${view.post.en.slug}`;
  const esUrl = `${BASE}/es/blog/${view.post.es.slug}`;
  const metaTitle = `${content.metaTitle} | Button Up Media`;

  const takeaways = (content.keyTakeaways || []).length
    ? `<div class="bp-callout"><strong>${t.takeaways}</strong><ul>${content.keyTakeaways.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
    : '';

  const midCta = `<div class="bp-midcta"><div class="bp-midcta-text"><strong>${esc(t.midStrong)}</strong><span>${esc(t.midSpan)}</span></div><a href="${t.contact}" class="btn btn-primary">${esc(t.midBtn)} ${ARROW}</a></div>`;

  // Anchor every section so the table of contents and "quick answer" links work,
  // and AI assistants can deep-link to a specific step. Dedupe collided slugs.
  const secs = content.sections || [];
  const usedIds = new Set();
  const ids = secs.map((s) => {
    let id = slugify(s.h2); let n = 2;
    while (usedIds.has(id)) id = `${slugify(s.h2)}-${n++}`;
    usedIds.add(id); return id;
  });
  const hasFaq = (content.faqs || []).length > 0;

  // Two inline CTAs spaced through the article: the founder (with photo) early,
  // a lighter text nudge later. Both stay out of the way but keep "work with us"
  // present. The big closing CTA still lives at the end of the page.
  const lateIdx = secs.length >= 6 ? Math.min(secs.length - 2, Math.round(secs.length * 0.68)) : -1;
  const sections = secs.map((s, i) => {
    let block = `<h2 id="${ids[i]}">${esc(s.h2)}</h2>\n${s.html}`;
    if (i === 1) block += '\n' + founderCta(lang);
    else if (i === lateIdx) block += '\n' + midCta;
    return block;
  }).join('\n');

  const tocItems = secs.map((s, i) => `<li><a href="#${ids[i]}">${esc(s.h2)}</a></li>`);
  if (hasFaq) tocItems.push(`<li><a href="#faq">${esc(t.faq)}</a></li>`);
  const toc = secs.length >= 3
    ? `<nav class="bp-toc bp-rise" aria-label="${escAttr(t.tocAria)}"><p class="bp-toc-title">${esc(t.tocTitle)}</p><ol>${tocItems.join('')}</ol></nav>`
    : '';

  const faq = hasFaq
    ? `<h2 id="faq">${t.faq}</h2>\n${content.faqs.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${f.a}</p>`).join('\n')}`
    : '';

  const related = allViews.filter((v) => v.lang === lang && v.slug !== view.slug).slice(0, 3);
  const relatedHtml = related.length ? `
    <section class="bp-related"><div class="bp-wrap">
      <h2 class="bp-rise">${t.keepReading}</h2>
      <div class="bp-related-grid">
        ${related.map((r) => `<article class="bp-rcard bp-rise">
          <div class="bp-rcard-media"><span class="bp-rcard-flag">${esc(r.catLabel)}</span><div class="bp-art ${r.catArt}"><img src="${r.hero}" alt="${escAttr(r.heroAlt)}" loading="lazy" /></div></div>
          <div class="bp-rcard-body"><h3><a href="${r.path}">${esc(r.title)}</a></h3><span>${esc(r.read)}</span></div>
        </article>`).join('\n        ')}
      </div>
    </div></section>` : '';

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting', '@id': `${url}#article`, mainEntityOfPage: url,
        headline: content.h1, description: content.metaDescription, image: `${BASE}${hero}`,
        datePublished: `${view.date}${PUBLISH_TIME}`, dateModified: `${view.date}${PUBLISH_TIME}`,
        inLanguage: lang, articleSection: catLabel, wordCount: content.wordCount || undefined,
        keywords: content.targetKeyword || undefined,
        author: { '@type': 'Person', name: author.name, jobTitle: role, url: author.linkedin, sameAs: [author.linkedin], image: `${BASE}${author.photo}`, worksFor: { '@type': 'Organization', name: 'Button Up Media', url: `${BASE}/` } },
        publisher: { '@type': 'Organization', name: 'Button Up Media', url: `${BASE}/`, logo: { '@type': 'ImageObject', url: `${BASE}/favicon-bum.svg` } },
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: t.home, item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: t.blog, item: `${BASE}${t.hub}` },
          { '@type': 'ListItem', position: 3, name: content.h1, item: url },
        ],
      },
      (content.faqs || []).length ? {
        '@type': 'FAQPage', mainEntity: content.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) } })),
      } : null,
    ].filter(Boolean),
  });

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${gtmHead()}
  <title>${esc(metaTitle)}</title>
  <meta name="description" content="${escAttr(content.metaDescription)}" />
  <link rel="icon" type="image/svg+xml" href="/favicon-bum.svg" />
  <link rel="canonical" href="${url}" />
  <link rel="alternate" hreflang="en" href="${enUrl}" />
  <link rel="alternate" hreflang="es" href="${esUrl}" />
  <link rel="alternate" hreflang="x-default" href="${enUrl}" />
  <meta name="theme-color" content="#ffffff" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escAttr(content.metaTitle)}" />
  <meta property="og:description" content="${escAttr(content.metaDescription)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${BASE}${hero}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(content.metaTitle)}" />
  <meta name="twitter:description" content="${escAttr(content.metaDescription)}" />
  <meta name="twitter:image" content="${BASE}${hero}" />
${fontPreloads()}
  <link rel="preload" as="image" href="${hero}" fetchpriority="high" />
  <script defer src="https://unpkg.com/lucide@1.17.0/dist/umd/lucide.min.js"></script>
  <link rel="stylesheet" href="/shared.css?v=${CSS_VER}" />
  <script type="application/ld+json">${schema}</script>
  <style>${NAV_LIGHT_CSS}${LIGHT_CSS}${POST_CSS}</style>
</head>
<body>
${gtmNoscript()}
  <div class="bp-progress" id="bp-progress" aria-hidden="true"></div>
${nav(lang)}
  <main class="page">
    <article>
      <header class="bp-head">
        <div class="bp-narrow">
          <nav class="bp-crumbs bp-rise" aria-label="Breadcrumb">
            <a href="${t.hub}">${t.blog}</a>
            ${CHEVRON}
            <span>${esc(catLabel)}</span>
          </nav>
          <span class="bp-flag bp-rise">${esc(catLabel)}</span>
          <h1 class="bp-title bp-rise">${esc(content.h1)}</h1>
          <p class="bp-standfirst bp-rise">${esc(content.directAnswer)}</p>
          <div class="bp-byline bp-rise">
            <div class="bp-avatar"><img src="${author.photo}" alt="${escAttr(author.name)}" width="44" height="44" /></div>
            <div class="bp-byline-meta">
              <strong>${esc(author.name)}</strong>
              <span>${esc(role)}, Button Up Media</span>
            </div>
            <div class="bp-byline-dates"><span>${dateFmt}</span><span class="dot"></span><span>${esc(read)}</span></div>
          </div>
        </div>
        <div class="bp-narrow">
          <div class="bp-hero-media bp-rise">
            <div class="bp-hero-art"><img src="${hero}" alt="${escAttr(heroAlt)}" width="1600" height="900" fetchpriority="high" /></div>
          </div>
        </div>
      </header>
      <div class="bp-body">
        <div class="bp-narrow">
          ${takeaways}
          ${toc}
          ${content.intro || ''}
          ${sections}
          ${faq}
          <hr />
          <p>${t.closing(t.contact)}</p>
        </div>
        <div class="bp-narrow">
          <div class="bp-author bp-rise">
            <div class="bp-author-top">
              <div class="bp-author-photo"><img src="${author.photo}" alt="${escAttr(author.name)}" width="76" height="76" /></div>
              <div>
                <h4>${esc(author.name)}</h4>
                <div class="role">${esc(role)}, Button Up Media</div>
              </div>
            </div>
            <p>${esc(bio)}</p>
          </div>
        </div>
      </div>
    </article>
${relatedHtml}
    <section class="bp-wrap">
      <div class="bp-cta">
        <div class="bp-cta-inner bp-rise">
          <span class="bp-eyebrow" style="justify-content:center;">${esc(t.ctaEyebrow)}</span>
          <h2 style="margin-top:12px;">${esc(content.ctaHeading)}</h2>
          <p>${esc(content.ctaBody)}</p>
          <div class="bp-cta-actions">
            <a href="${content.ctaButtonUrl || t.contact}" class="btn btn-primary">${esc(content.ctaButtonText)}</a>
            <a href="tel:${PHONE}" class="btn">${esc(t.call)}</a>
          </div>
        </div>
      </div>
    </section>
${footer(lang)}
  </main>
  <script defer src="/shared.js?v=${CSS_VER}"></script>
  <script>
    (function () {
      var bar = document.getElementById('bp-progress'); var article = document.querySelector('article');
      if (!bar || !article) return;
      var update = function () { var rect = article.getBoundingClientRect(); var total = article.offsetHeight - innerHeight; var scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1)); bar.style.width = (total > 0 ? (scrolled / total) * 100 : 0) + '%'; };
      addEventListener('scroll', update, { passive: true }); addEventListener('resize', update); update();
    })();
    (function () {
      var els = [].slice.call(document.querySelectorAll('.bp-rise'));
      if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
      var io = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
      els.forEach(function (e) { var r = e.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) e.classList.add('is-in'); else io.observe(e); });
      setTimeout(function () { els.forEach(function (e) { e.classList.add('is-in'); }); }, 1500);
    })();
  </script>
</body>
</html>`;
}

// ---------- hub page ----------
function renderHub(lang, views) {
  const t = T[lang];
  const hubUrl = `${BASE}${t.hub}`;
  const featured = views[0];
  const rest = views.slice(1);

  const listItem = (v) => `<a class="bl-list-item bl-rise" href="${v.path}">
            <span class="bl-list-cat">${esc(v.catLabel)}</span>
            <h3>${esc(v.title)}</h3>
            <div class="bl-list-meta"><strong>${esc(v.author.name)}</strong><span>${v.dateFmt}</span></div>
          </a>`;

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Blog', '@id': `${hubUrl}#blog`, url: hubUrl, name: t.blogTitle, description: t.blogDesc, inLanguage: lang,
        publisher: { '@type': 'Organization', name: 'Button Up Media', url: `${BASE}/`, logo: { '@type': 'ImageObject', url: `${BASE}/favicon-bum.svg` } },
        blogPost: views.map((v) => ({ '@type': 'BlogPosting', headline: v.title, url: v.url, datePublished: `${v.date}${PUBLISH_TIME}`, image: `${BASE}${v.hero}`, author: { '@type': 'Person', name: v.author.name } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: t.home, item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: t.blog, item: hubUrl },
      ] },
    ],
  });

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${gtmHead()}
  <title>${esc(t.blogTitle)}</title>
  <meta name="description" content="${escAttr(t.blogDesc)}" />
  <link rel="icon" type="image/svg+xml" href="/favicon-bum.svg" />
  <link rel="canonical" href="${hubUrl}" />
  <link rel="alternate" hreflang="en" href="${BASE}/blog" />
  <link rel="alternate" hreflang="es" href="${BASE}/es/blog" />
  <link rel="alternate" hreflang="x-default" href="${BASE}/blog" />
  <link rel="alternate" type="application/rss+xml" title="Button Up Media Blog" href="${t.hub}/rss.xml" />
  <meta name="theme-color" content="#ffffff" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escAttr(t.blogTitle)}" />
  <meta property="og:description" content="${escAttr(t.blogDesc)}" />
  <meta property="og:url" content="${hubUrl}" />
  <meta property="og:image" content="${BASE}${featured.hero}" />
  <meta name="twitter:card" content="summary_large_image" />
${fontPreloads()}
  <script defer src="https://unpkg.com/lucide@1.17.0/dist/umd/lucide.min.js"></script>
  <link rel="stylesheet" href="/shared.css?v=${CSS_VER}" />
  <script type="application/ld+json">${schema}</script>
  <style>${NAV_LIGHT_CSS}${LIGHT_CSS}${HUB_CSS}</style>
</head>
<body>
${gtmNoscript()}
${nav(lang)}
  <main class="page">
    <section class="bl-hero"><div class="bl-wrap">
      <span class="bl-eyebrow bl-rise">${esc(t.heroEyebrow)}</span>
      <h1 class="bl-rise">${t.heroH1}</h1>
      <p class="bl-hero-sub bl-rise">${esc(t.heroSub)}</p>
    </div></section>

    <section class="bl-lead"><div class="bl-wrap">
      <div class="bl-lead-grid">
        <article class="bl-feature bl-rise">
          <div class="bl-feature-media"><span class="bl-feature-flag">${esc(t.featured)} &middot; ${esc(featured.catLabel)}</span><img src="${featured.hero}" alt="${escAttr(featured.heroAlt)}" fetchpriority="high" /></div>
          <div class="bl-feature-body">
            <span class="bl-eyebrow">${esc(t.latestStory)}</span>
            <h2><a href="${featured.path}">${esc(featured.title)}</a></h2>
            <p class="bl-feature-excerpt">${esc(featured.excerpt)}</p>
            <div class="bl-feature-meta"><strong>${esc(featured.author.name)}</strong><span class="dot"></span><span>${featured.dateFmt}</span><span class="dot"></span><span>${esc(featured.read)}</span></div>
          </div>
        </article>
        <aside class="bl-list" aria-label="${escAttr(t.latest)}">
          <div class="bl-list-head bl-rise">${esc(t.latest)}</div>
          ${rest.map(listItem).join('\n          ')}
        </aside>
      </div>
    </div></section>

    <section class="bl-wrap">
      <div class="bl-news">
        <div class="bl-news-inner bl-rise">
          <div>
            <span class="bl-eyebrow">${esc(t.bandEyebrow)}</span>
            <h2>${esc(t.bandH2)}</h2>
            <p>${esc(t.bandP)}</p>
          </div>
          <div><a href="${t.contact}" class="btn btn-primary">${esc(t.bandBtn)} ${ARROW}</a></div>
        </div>
      </div>
    </section>
${footer(lang)}
  </main>
  <script defer src="/shared.js?v=${CSS_VER}"></script>
  <script>
    (function () {
      var els = [].slice.call(document.querySelectorAll('.bl-rise'));
      if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
      var io = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
      els.forEach(function (e) { var r = e.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) e.classList.add('is-in'); else io.observe(e); });
      setTimeout(function () { els.forEach(function (e) { e.classList.add('is-in'); }); }, 1500);
    })();
  </script>
</body>
</html>`;
}

// ---------- RSS ----------
function renderRss(lang, views) {
  const t = T[lang];
  const hubUrl = `${BASE}${t.hub}`;
  const items = views.map((v) => `    <item>
      <title>${escXml(v.title)}</title>
      <link>${v.url}</link>
      <guid isPermaLink="true">${v.url}</guid>
      <pubDate>${rfc822(v.date)}</pubDate>
      <description>${escXml(v.excerpt)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(t.blogTitle)}</title>
    <link>${hubUrl}</link>
    <description>${escXml(t.blogDesc)}</description>
    <language>${t.rssLang}</language>
${items}
  </channel>
</rss>`;
}

// ---------- sitemap entries ----------
function sitemapEntries(allPosts) {
  const hub = (loc, alt, prio) => `  <url>
    <loc>${loc}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${BASE}/blog"/>
    <xhtml:link rel="alternate" hreflang="es" href="${BASE}/es/blog"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/blog"/>
    <changefreq>daily</changefreq>
    <priority>${prio}</priority>
  </url>`;
  const post = (loc, enUrl, esUrl, date) => `  <url>
    <loc>${loc}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>
    <xhtml:link rel="alternate" hreflang="es" href="${esUrl}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}"/>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  const out = [hub(`${BASE}/blog`, true, '0.8'), hub(`${BASE}/es/blog`, true, '0.7')];
  for (const p of allPosts) {
    const enUrl = `${BASE}/blog/${p.en.slug}`;
    const esUrl = `${BASE}/es/blog/${p.es.slug}`;
    out.push(post(enUrl, enUrl, esUrl, p.date));
    out.push(post(esUrl, enUrl, esUrl, p.date));
  }
  return out.join('\n');
}

// ---------- entry point ----------
export async function buildBlog(root, outDir) {
  const manifest = JSON.parse(await readFile(path.join(root, 'blog', 'posts.json'), 'utf8'));
  const contentDir = path.join(root, 'blog', 'content');

  const loaded = [];
  for (const post of manifest) {
    const en = JSON.parse(await readFile(path.join(contentDir, `${post.id}.en.json`), 'utf8'));
    const es = JSON.parse(await readFile(path.join(contentDir, `${post.id}.es.json`), 'utf8'));
    loaded.push({ post, en, es });
  }

  const enViews = loaded.map(({ post, en }) => postView(post, 'en', en));
  const esViews = loaded.map(({ post, es }) => postView(post, 'es', es));

  await mkdir(path.join(outDir, 'blog'), { recursive: true });
  await mkdir(path.join(outDir, 'blog-es'), { recursive: true });

  for (const v of enViews) await writeFile(path.join(outDir, 'blog', `${v.slug}.html`), renderPost(v, enViews));
  for (const v of esViews) await writeFile(path.join(outDir, 'blog-es', `${v.slug}.html`), renderPost(v, esViews));

  await writeFile(path.join(outDir, 'blog.html'), renderHub('en', enViews));
  await writeFile(path.join(outDir, 'blog-es.html'), renderHub('es', esViews));
  await writeFile(path.join(outDir, 'blog', 'rss.xml'), renderRss('en', enViews));
  await writeFile(path.join(outDir, 'blog-es', 'rss.xml'), renderRss('es', esViews));

  console.log(`Built blog: ${loaded.length} posts x2 languages, 2 hubs, 2 feeds`);
  return sitemapEntries(manifest);
}
