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
    photo: '/media/team-chris.webp',
    linkedin: 'https://www.linkedin.com/in/christian-paula-48bb1a263/',
    bioEn: 'Christian Paula is the Creative Director at Button Up Media, a restaurant-focused marketing agency based in Miami, Florida. He leads the content, video, and design work that helps restaurants, bars, and coffee shops stand out and fill seats.',
    bioEs: 'Christian Paula es el Director Creativo de Button Up Media, una agencia de marketing enfocada en restaurantes con sede en Miami, Florida. Lidera el contenido, el video y el diseño que ayudan a restaurantes, bares y cafeterías a destacar y llenar mesas.',
  },
  juan: {
    name: 'Juan Hernandez',
    jobTitleEn: 'Account Manager & Founder',
    jobTitleEs: 'Account Manager y Fundador',
    photo: '/media/team-juan.webp',
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
      <img src="/images/full-logo.svg" alt="Button Up Media" width="145" height="45" />
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
      <img src="/images/full-logo.svg" alt="Button Up Media" width="145" height="45" />
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
    .bp-body img { width: 100%; border-radius: 16px; border: 1px solid var(--line); display: block; }
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
    .bl-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
    .bl-chip { appearance: none; cursor: pointer; font-family: var(--font-body); display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--text-soft); font-size: 0.82rem; font-weight: 600; transition: color .2s, border-color .2s, background .2s, transform .2s; }
    .bl-chip:hover { color: var(--text); border-color: rgba(255,248,235,0.2); transform: translateY(-1px); }
    .bl-chip.--active { color: var(--gold); border-color: rgba(226,168,77,0.4); background: var(--gold-soft); }
    .bl-featured { display: grid; grid-template-columns: 1fr; gap: 0; margin-top: 38px; border-radius: 22px; overflow: hidden; border: 1px solid var(--line); background: var(--bg-2); transition: border-color .3s, transform .3s; }
    .bl-featured:hover { border-color: rgba(226,168,77,0.28); transform: translateY(-3px); }
    .bl-featured-media { position: relative; min-height: clamp(220px, 38vw, 380px); overflow: hidden; }
    .bl-featured-body { padding: clamp(26px, 4vw, 46px); display: flex; flex-direction: column; justify-content: center; }
    .bl-featured-flag { position: absolute; top: 18px; left: 18px; z-index: 2; display: inline-flex; align-items: center; gap: 7px; padding: 6px 13px; border-radius: 999px; background: rgba(10,10,10,0.7); backdrop-filter: blur(8px); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); }
    .bl-featured-body h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.03em; font-size: clamp(1.5rem, 3vw, 2.4rem); line-height: 1.04; margin: 14px 0; text-wrap: balance; }
    .bl-featured-body h2 a { color: var(--text-head); transition: color .2s; }
    .bl-featured-body h2 a:hover { color: var(--gold); }
    .bl-featured-body p { color: var(--text-dim); font-size: 0.98rem; line-height: 1.62; max-width: 52ch; }
    @media (min-width: 880px) { .bl-featured { grid-template-columns: 1.05fr 0.95fr; } }
    .bl-section { padding: clamp(48px, 7vw, 84px) 0; }
    .bl-grid-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 26px; }
    .bl-grid-head h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.025em; font-size: clamp(1.3rem, 2.4vw, 1.85rem); }
    .bl-grid { display: grid; grid-template-columns: 1fr; gap: clamp(20px, 2.4vw, 30px); }
    @media (min-width: 620px) { .bl-grid { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 980px) { .bl-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .bl-card { display: flex; flex-direction: column; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); background: var(--bg-2); transition: border-color .3s, transform .3s; }
    .bl-card.is-hidden { display: none; }
    .bl-card:hover { border-color: rgba(226,168,77,0.28); transform: translateY(-4px); }
    .bl-card-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
    .bl-card-flag { position: absolute; top: 14px; left: 14px; z-index: 2; display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: rgba(10,10,10,0.7); backdrop-filter: blur(8px); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--gold); }
    .bl-card-body { padding: 20px 22px 22px; display: flex; flex-direction: column; flex: 1; }
    .bl-card-body h3 { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; font-size: 1.16rem; line-height: 1.18; margin-bottom: 9px; }
    .bl-card-body h3 a { color: var(--text-head); transition: color .2s; }
    .bl-card-body h3 a:hover { color: var(--gold); }
    .bl-card-body p { color: var(--text-dim); font-size: 0.88rem; line-height: 1.55; }
    .bl-card-meta { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line-soft); display: flex; align-items: center; gap: 10px; font-size: 0.74rem; color: var(--text-soft); }
    .bl-card-meta .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--text-soft); }
    .bl-art { width: 100%; height: 100%; display: grid; place-items: center; position: relative; }
    .bl-art svg { width: 46px; height: 46px; color: rgba(255,248,235,0.34); position: relative; z-index: 1; }
    .bl-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .bl-art.--social { background: linear-gradient(135deg, #2a1a3a, #120b1c); }
    .bl-art.--ads { background: linear-gradient(135deg, rgba(226,168,77,0.24), #1a1206); }
    .bl-art.--web { background: linear-gradient(135deg, #16221e, #0b110e); }
    .bl-art.--seo { background: linear-gradient(135deg, #123040, #08161c); }
    .bl-art.--strategy { background: linear-gradient(135deg, #3a1f1a, #1a0d0a); }
    .bl-news { position: relative; margin: 0 0 clamp(40px, 6vw, 72px); }
    .bl-news-inner { border-radius: 24px; overflow: hidden; position: relative; border: 1px solid rgba(226,168,77,0.22); background: linear-gradient(135deg, rgba(226,168,77,0.1), rgba(208,106,80,0.07)), var(--bg-2); padding: clamp(34px, 5vw, 60px); display: grid; grid-template-columns: 1fr; gap: 24px; align-items: center; }
    .bl-news h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -0.03em; font-size: clamp(1.5rem, 3vw, 2.2rem); line-height: 1.05; }
    .bl-news p { color: var(--text-dim); font-size: 0.96rem; line-height: 1.6; margin-top: 10px; max-width: 46ch; }
    @media (min-width: 820px) { .bl-news-inner { grid-template-columns: 1.1fr 0.9fr; gap: 40px; } .bl-news-inner > div:last-child { justify-self: end; } }
`;

// Light, editorial theme for the blog. Scoped to .page so the dark brand nav
// pill is untouched. Flattens the gold-glow gradients and removes the mesh orbs
// for a cleaner, less "stock-AI" reading experience.
const LIGHT_CSS = `
    body { background: #ffffff; }
    main.page {
      --bg-0:#ffffff; --bg-1:#faf8f4; --bg-2:#ffffff; --bg-3:#f1ede5; --surface:#f6f3ee;
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
    .page .bl-featured, .page .bl-card, .page .bp-rcard, .page .bp-author { background:#fbf9f5; }
    .page .bp-hero-art, .page .bl-art { background:#ece6db; }
    /* editorial links: dark text, gold underline */
    .page .bp-body a { color:var(--text-head); text-decoration-color:rgba(226,168,77,0.7); }
    .page .bp-body a:hover { color:#9a6410; text-decoration-color:var(--gold); }
    /* category chips */
    .page .bl-chip { background:#ffffff; }
    .page .bl-chip:hover { border-color:rgba(28,24,18,0.28); color:var(--text); }
    .page .bl-chip.--active { color:#9a6410; background:var(--gold-soft); border-color:rgba(226,168,77,0.5); }
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

  const sections = (content.sections || []).map((s, i) =>
    `<h2>${esc(s.h2)}</h2>\n${s.html}${i === 1 ? '\n' + midCta : ''}`
  ).join('\n');

  const faq = (content.faqs || []).length
    ? `<h2>${t.faq}</h2>\n${content.faqs.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${f.a}</p>`).join('\n')}`
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
  <style>${LIGHT_CSS}${POST_CSS}</style>
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
  const grid = views.slice(1);
  const presentCats = [...new Set(views.map((v) => v.post.category))];
  const chips = presentCats.map((k) => `<button class="bl-chip" data-filter="${k}">${esc((CATS[k] || CATS.strategy)[lang])}</button>`).join('\n          ');

  const card = (v) => `<article class="bl-card bl-rise" data-cat="${v.post.category}">
            <div class="bl-card-media"><span class="bl-card-flag">${esc(v.catLabel)}</span><div class="bl-art ${v.catArt}"><img src="${v.hero}" alt="${escAttr(v.heroAlt)}" loading="lazy" /></div></div>
            <div class="bl-card-body">
              <h3><a href="${v.path}">${esc(v.title)}</a></h3>
              <p>${esc(v.excerpt)}</p>
              <div class="bl-card-meta"><span>${v.dateFmt}</span><span class="dot"></span><span>${esc(v.read)}</span></div>
            </div>
          </article>`;

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
  <style>${LIGHT_CSS}${HUB_CSS}</style>
</head>
<body>
${gtmNoscript()}
${nav(lang)}
  <main class="page">
    <section class="bl-hero"><div class="bl-wrap">
      <span class="bl-eyebrow bl-rise">${esc(t.heroEyebrow)}</span>
      <h1 class="bl-rise">${t.heroH1}</h1>
      <p class="bl-hero-sub bl-rise">${esc(t.heroSub)}</p>
      <div class="bl-filters bl-rise" role="tablist" aria-label="Filter posts by category">
        <button class="bl-chip --active" data-filter="all">${esc(t.all)}</button>
          ${chips}
      </div>
    </div></section>

    <section class="bl-wrap" aria-label="${escAttr(t.featured)}">
      <article class="bl-featured bl-rise" data-cat="${featured.post.category}">
        <div class="bl-featured-media"><span class="bl-featured-flag">${esc(t.featured)} &middot; ${esc(featured.catLabel)}</span><div class="bl-art ${featured.catArt}"><img src="${featured.hero}" alt="${escAttr(featured.heroAlt)}" fetchpriority="high" /></div></div>
        <div class="bl-featured-body">
          <span class="bl-eyebrow">${esc(t.latestStory)}</span>
          <h2><a href="${featured.path}">${esc(featured.title)}</a></h2>
          <p>${esc(featured.excerpt)}</p>
          <div class="bl-card-meta" style="border:0;padding:0;margin-top:18px;"><span>${featured.dateFmt}</span><span class="dot"></span><span>${esc(featured.read)}</span></div>
          <a href="${featured.path}" class="btn btn-primary" style="margin-top:22px;align-self:flex-start;">${esc(t.read)} ${ARROW}</a>
        </div>
      </article>
    </section>

    <section class="bl-section"><div class="bl-wrap">
      <div class="bl-grid-head bl-rise">
        <h2>${esc(t.latest)}</h2>
        <span style="font-size:0.82rem;color:var(--text-soft);" id="bl-count">${esc(t.articles(grid.length))}</span>
      </div>
      <div class="bl-grid" id="bl-grid">
        ${grid.map(card).join('\n        ')}
      </div>
      <div class="bl-rise" id="bl-empty" style="display:none; text-align:center; padding:40px 0; color:var(--text-soft);">${esc(t.empty)}</div>
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
      var chips = [].slice.call(document.querySelectorAll('.bl-chip'));
      var cards = [].slice.call(document.querySelectorAll('#bl-grid .bl-card'));
      var count = document.getElementById('bl-count'); var empty = document.getElementById('bl-empty');
      var one = ${JSON.stringify(t.articles(1))}, many = function (n) { return n + ${JSON.stringify(' ' + t.articles(2).split(' ').slice(1).join(' '))}; };
      chips.forEach(function (chip) { chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('--active'); }); chip.classList.add('--active');
        var f = chip.getAttribute('data-filter'); var shown = 0;
        cards.forEach(function (card) { var match = f === 'all' || card.getAttribute('data-cat') === f; card.classList.toggle('is-hidden', !match); if (match) shown++; });
        if (count) count.textContent = shown === 1 ? one : many(shown);
        if (empty) empty.style.display = shown === 0 ? 'block' : 'none';
      }); });
    })();
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
