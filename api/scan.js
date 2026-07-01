/**
 * Vercel Serverless Function: /api/scan
 *
 * Real website grader powered by Google PageSpeed Insights (Lighthouse).
 * Given a URL, it runs PSI for mobile + desktop and returns normalized
 * category scores, Core Web Vitals, the real top issues, and a derived
 * report model (overall grade + sub-scores) the front-end renders directly.
 *
 *   GET /api/scan?url=example.com           -> mobile + desktop scan
 *
 * Auth: PageSpeed Insights works without a key only at a tiny shared quota
 * (it 429s quickly), so set PAGESPEED_API_KEY (a free Google Cloud API key
 * with the "PageSpeed Insights API" enabled) in the Vercel project env.
 */

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url = normalizeUrl((req.query && req.query.url) || '');
  if (!url) {
    return res.status(400).json({ ok: false, error: 'invalid_url', message: 'Provide a valid website URL.' });
  }

  // Localize the derived report labels (grade, sub-scores, issue cards). The raw
  // PSI data stays language-neutral; only the friendly text depends on lang.
  const lang = ((req.query && req.query.lang) === 'es') ? 'es' : 'en';

  const key = process.env.PAGESPEED_API_KEY || '';

  try {
    // Run both strategies in parallel — wall time is the slower of the two.
    const [mobile, desktop] = await Promise.all([
      runPsi(url, 'mobile', key),
      runPsi(url, 'desktop', key),
    ]);

    const mob = extract(mobile);
    const desk = extract(desktop);
    const report = buildReport(mob, desk, lang);

    // Per-URL results are stable for a while; let the edge cache them so we
    // stay well inside the PSI quota and repeat scans feel instant.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

    return res.status(200).json({
      ok: true,
      url: mob.finalUrl || url,
      requestedUrl: url,
      fetchedAt: new Date().toISOString(),
      mobile: mob,
      desktop: desk,
      report,
    });
  } catch (err) {
    const status = err && err.status;
    if (status === 429) {
      return res.status(429).json({ ok: false, error: 'quota', message: 'The scanner is busy right now. Please try again in a minute.' });
    }
    if (status === 400 || status === 422 || status === 500) {
      // PSI returns these when it cannot load / analyze the page.
      return res.status(422).json({ ok: false, error: 'unreachable', message: "We couldn't analyze that site. Double-check the address and try again." });
    }
    return res.status(502).json({ ok: false, error: 'scan_failed', message: 'The scan failed unexpectedly. Please try again.' });
  }
};

/* ---------- PSI ---------- */

async function runPsi(url, strategy, key) {
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('strategy', strategy);
  ['performance', 'seo', 'accessibility', 'best-practices'].forEach((c) => params.append('category', c));
  if (key) params.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  let resp;
  try {
    resp = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const err = new Error(`PSI ${resp.status}`);
    err.status = resp.status;
    try { err.body = await resp.text(); } catch (e) { /* ignore */ }
    // Surface the real PSI reason in the server logs (bad key, quota, blocked
    // URL, etc.) so scanner outages are diagnosable without guessing.
    try { console.warn(`PSI ${resp.status} (${strategy}) key=${key ? 'set' : 'MISSING'}: ${String(err.body || '').replace(/\s+/g, ' ').slice(0, 300)}`); } catch (e) { /* ignore */ }
    throw err;
  }
  return resp.json();
}

/* ---------- normalize one PSI result ---------- */

function pct(score) {
  return typeof score === 'number' ? Math.round(score * 100) : null;
}

function extract(data) {
  const lr = (data && data.lighthouseResult) || {};
  const cats = lr.categories || {};
  const audits = lr.audits || {};

  const categories = {
    performance: cats.performance ? pct(cats.performance.score) : null,
    seo: cats.seo ? pct(cats.seo.score) : null,
    accessibility: cats.accessibility ? pct(cats.accessibility.score) : null,
    bestPractices: cats['best-practices'] ? pct(cats['best-practices'].score) : null,
  };

  const metric = (id) => {
    const a = audits[id];
    if (!a) return null;
    return { value: a.numericValue != null ? a.numericValue : null, display: a.displayValue || null, score: a.score };
  };

  const metrics = {
    lcp: metric('largest-contentful-paint'),
    cls: metric('cumulative-layout-shift'),
    fcp: metric('first-contentful-paint'),
    tbt: metric('total-blocking-time'),
    speedIndex: metric('speed-index'),
    interactive: metric('interactive'),
  };

  // Real, actionable items: opportunities (with time savings) + failed audits.
  const opportunities = Object.values(audits)
    .filter((a) => a && a.details && a.details.type === 'opportunity' && a.numericValue > 0)
    .map((a) => ({ id: a.id, title: a.title, savingsMs: Math.round(a.numericValue), score: a.score }))
    .sort((x, y) => y.savingsMs - x.savingsMs);

  const failing = Object.values(audits)
    .filter((a) =>
      a &&
      typeof a.score === 'number' &&
      a.score < 0.9 &&
      (a.scoreDisplayMode === 'binary' || a.scoreDisplayMode === 'numeric' || a.scoreDisplayMode === 'metricSavings'))
    .map((a) => ({ id: a.id, title: a.title, description: a.description, score: a.score, weight: a.weight || 0 }));

  // CrUX field data (real-user) when Google has enough traffic for the origin.
  const le = data.loadingExperience || null;

  return {
    finalUrl: lr.finalUrl || lr.requestedUrl || null,
    categories,
    metrics,
    opportunities,
    failing,
    fieldData: le && le.metrics ? le.overall_category : null,
  };
}

/* ---------- derive the report model the UI renders ---------- */

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Localized labels for the derived report model (grades, ratings, sub-scores).
const LABELS = {
  en: {
    ratingGood: 'Good', ratingFair: 'Fair', ratingPoor: 'Poor',
    gradeExcellent: 'Excellent', gradeGood: 'Good', gradeFair: 'Fair', gradePoor: 'Poor',
    subSpeed: 'Speed & performance', subSeo: 'SEO & visibility', subMobile: 'Mobile & best practices',
    lcpTitle: (s) => `Slow mobile load time (${s}s)`,
    lcpImpact: 'Pages over 2.5 seconds lose more than half their mobile visitors before the menu appears.',
  },
  es: {
    ratingGood: 'Bueno', ratingFair: 'Regular', ratingPoor: 'Deficiente',
    gradeExcellent: 'Excelente', gradeGood: 'Bueno', gradeFair: 'Regular', gradePoor: 'Deficiente',
    subSpeed: 'Velocidad y rendimiento', subSeo: 'SEO y visibilidad', subMobile: 'Móvil y buenas prácticas',
    lcpTitle: (s) => `Carga lenta en el móvil (${s}s)`,
    lcpImpact: 'Las páginas que tardan más de 2.5 segundos pierden a más de la mitad de los visitantes móviles antes de que aparezca el menú.',
  },
};

function ratingFor(p, lang) {
  // p is a 0-100 percentage of the bucket max
  const L = LABELS[lang] || LABELS.en;
  if (p >= 90) return { label: L.ratingGood, color: '#1E7E54' };
  if (p >= 50) return { label: L.ratingFair, color: '#C9820E' };
  return { label: L.ratingPoor, color: '#CF4A3C' };
}

function buildReport(mob, desk, lang) {
  const L = LABELS[lang] || LABELS.en;
  const c = mob.categories;
  // Fall back to desktop for any category mobile couldn't score.
  const perf = c.performance != null ? c.performance : desk.categories.performance;
  const seo = c.seo != null ? c.seo : desk.categories.seo;
  const bp = c.bestPractices != null ? c.bestPractices : desk.categories.bestPractices;
  const acc = c.accessibility != null ? c.accessibility : desk.categories.accessibility;

  const perfP = perf == null ? 0 : perf;
  const seoP = seo == null ? 0 : seo;
  const bpAccP = Math.round(((bp == null ? 0 : bp) + (acc == null ? 0 : acc)) / 2);

  // Three sub-scores mirror the report layout (40 / 40 / 20 = 100).
  const subs = [
    makeSub('speed', L.subSpeed, perfP, 40, lang),
    makeSub('seo', L.subSeo, seoP, 40, lang),
    makeSub('mobile', L.subMobile, bpAccP, 20, lang),
  ];

  const overall = clamp(subs.reduce((sum, s) => sum + s.points, 0), 0, 100);

  let grade;
  if (overall >= 90) grade = { label: L.gradeExcellent, color: '#1E7E54' };
  else if (overall >= 70) grade = { label: L.gradeGood, color: '#1E7E54' };
  else if (overall >= 50) grade = { label: L.gradeFair, color: '#C9820E' };
  else grade = { label: L.gradePoor, color: '#CF4A3C' };

  const issues = buildIssues(mob, desk, lang);

  return {
    overall,
    grade: grade.label,
    gradeColor: grade.color,
    subs,
    issues,
    issueCount: issues.length,
    fieldData: mob.fieldData || desk.fieldData || null,
  };
}

function makeSub(key, label, percent, max, lang) {
  const points = Math.round((clamp(percent, 0, 100) / 100) * max);
  const r = ratingFor(percent, lang);
  return { key, label, points, max, percent: Math.round(percent), rating: r.label, color: r.color };
}

/* Map real Lighthouse audits to restaurant-owner-friendly problem cards. */
const ISSUE_LABELS = {
  'largest-contentful-paint': { pt: 'Slow to show your main content', im: 'Over half of mobile guests leave before a slow page finishes loading, that is lost orders every night.' },
  'speed-index': { pt: 'Page feels slow to load', im: 'A sluggish first impression sends hungry guests to a competitor that loads faster.' },
  'total-blocking-time': { pt: 'Page is unresponsive while loading', im: 'Taps and scrolls lag, so guests give up before they reach your menu.' },
  'interactive': { pt: 'Takes too long before guests can tap', im: 'If the page is not usable quickly, visitors bounce instead of booking.' },
  'cumulative-layout-shift': { pt: 'Content jumps around as it loads', im: 'Buttons that move under a thumb cause misclicks and frustration on mobile.' },
  'uses-optimized-images': { pt: 'Photos are heavier than they need to be', im: 'Oversized images slow the page and burn through mobile data before your food even appears.' },
  'modern-image-formats': { pt: 'Photos use outdated, heavy formats', im: 'Modern formats load your food photos far faster on a phone.' },
  'uses-responsive-images': { pt: 'Images are not sized for phones', im: 'Sending desktop-sized photos to phones wastes load time guests will not wait for.' },
  'render-blocking-resources': { pt: 'Code blocks the page from showing', im: 'Render-blocking scripts and styles delay the first thing guests see.' },
  'unused-css-rules': { pt: 'Unused styling bloats the page', im: 'Dead code makes every visit slower than it should be.' },
  'unused-javascript': { pt: 'Unused code bloats the page', im: 'Extra JavaScript slows the page down for no benefit to your guests.' },
  'unminified-css': { pt: 'Styling code is not optimized', im: 'Unminified files are larger and slower to download.' },
  'unminified-javascript': { pt: 'Scripts are not optimized', im: 'Unminified scripts add weight that slows the page on mobile.' },
  'server-response-time': { pt: 'Your server is slow to respond', im: 'A slow first byte delays everything else on the page.' },
  'meta-description': { pt: 'Missing or weak meta description', im: 'Google shows this under your name in search, a blank one costs you clicks.' },
  'document-title': { pt: 'Title is missing your main keyword', im: 'A strong title is one of the biggest factors in where you rank for "near me" searches.' },
  'is-crawlable': { pt: 'Pages are blocked from Google', im: 'If search engines cannot crawl you, you will not show up for hungry locals at all.' },
  'hreflang': { pt: 'Language targeting is not set up', im: 'Without it, Google may serve the wrong language to Miami guests searching in Spanish.' },
  'http-status-code': { pt: 'Pages return errors to Google', im: 'Error pages get dropped from search results entirely.' },
  'tap-targets': { pt: 'Buttons are too small to tap', im: 'Cramped tap targets make booking on a phone frustrating, so guests give up.' },
  'viewport': { pt: 'Not built for mobile screens', im: 'Without a mobile viewport, your site is nearly unusable on the phones most guests use.' },
  'color-contrast': { pt: 'Low color contrast hurts readability', im: 'Hard-to-read text loses guests, and Google counts it against your experience score.' },
  'image-alt': { pt: 'Photos are missing descriptions', im: 'Alt text helps Google understand your photos and helps you rank in image search.' },
  'link-text': { pt: 'Vague link text ("click here")', im: 'Descriptive links help both guests and Google understand your pages.' },
  'crawlable-anchors': { pt: 'Some links are not crawlable', im: 'Google cannot follow these links, so those pages may never get indexed.' },
};

/* Spanish (LatAm) versions of the friendly problem cards. Keys match ISSUE_LABELS. */
const ISSUE_LABELS_ES = {
  'largest-contentful-paint': { pt: 'Tarda en mostrar tu contenido principal', im: 'Más de la mitad de los clientes en el móvil se van antes de que una página lenta termine de cargar, y eso son pedidos perdidos cada noche.' },
  'speed-index': { pt: 'La página se siente lenta al cargar', im: 'Una primera impresión lenta manda a los clientes con hambre a un competidor que carga más rápido.' },
  'total-blocking-time': { pt: 'La página no responde mientras carga', im: 'Los toques y el desplazamiento se traban, así que los clientes se rinden antes de llegar al menú.' },
  'interactive': { pt: 'Tarda demasiado antes de que el cliente pueda tocar', im: 'Si la página no se puede usar rápido, la gente se va en vez de reservar.' },
  'cumulative-layout-shift': { pt: 'El contenido se mueve mientras carga', im: 'Los botones que se mueven bajo el dedo provocan toques equivocados y frustración en el móvil.' },
  'uses-optimized-images': { pt: 'Las fotos pesan más de lo necesario', im: 'Las imágenes muy grandes hacen lenta la página y consumen los datos del móvil antes de que aparezca tu comida.' },
  'modern-image-formats': { pt: 'Las fotos usan formatos viejos y pesados', im: 'Los formatos modernos cargan las fotos de tu comida mucho más rápido en el teléfono.' },
  'uses-responsive-images': { pt: 'Las imágenes no están adaptadas al teléfono', im: 'Enviar fotos de tamaño de escritorio a los teléfonos desperdicia un tiempo de carga que los clientes no van a esperar.' },
  'render-blocking-resources': { pt: 'El código impide que la página se muestre', im: 'Los scripts y estilos que bloquean el renderizado retrasan lo primero que ve el cliente.' },
  'unused-css-rules': { pt: 'Estilos sin usar recargan la página', im: 'El código que no se usa hace cada visita más lenta de lo que debería.' },
  'unused-javascript': { pt: 'Código sin usar recarga la página', im: 'El JavaScript de más hace lenta la página sin ningún beneficio para tus clientes.' },
  'unminified-css': { pt: 'El código de estilos no está optimizado', im: 'Los archivos sin minificar son más grandes y más lentos de descargar.' },
  'unminified-javascript': { pt: 'Los scripts no están optimizados', im: 'Los scripts sin minificar agregan peso que hace lenta la página en el móvil.' },
  'server-response-time': { pt: 'Tu servidor tarda en responder', im: 'Un primer byte lento retrasa todo lo demás en la página.' },
  'meta-description': { pt: 'Falta la meta descripción o es débil', im: 'Google la muestra debajo de tu nombre en la búsqueda, y dejarla en blanco te cuesta clics.' },
  'document-title': { pt: 'Al título le falta tu palabra clave principal', im: 'Un buen título es uno de los factores más importantes para saber en qué posición apareces en las búsquedas "cerca de mí".' },
  'is-crawlable': { pt: 'Las páginas están bloqueadas para Google', im: 'Si los buscadores no te pueden rastrear, no vas a aparecer para los clientes locales con hambre.' },
  'hreflang': { pt: 'No está configurado el idioma de destino', im: 'Sin esto, Google puede mostrarle el idioma equivocado a los clientes que buscan en español.' },
  'http-status-code': { pt: 'Las páginas devuelven errores a Google', im: 'Las páginas con error se eliminan por completo de los resultados de búsqueda.' },
  'tap-targets': { pt: 'Los botones son muy pequeños para tocar', im: 'Los botones apretados hacen que reservar desde el teléfono sea frustrante, y los clientes se rinden.' },
  'viewport': { pt: 'No está hecha para pantallas de móvil', im: 'Sin una configuración móvil, tu sitio es casi imposible de usar en los teléfonos que usa la mayoría de los clientes.' },
  'color-contrast': { pt: 'El bajo contraste dificulta la lectura', im: 'El texto difícil de leer pierde clientes, y Google lo cuenta en contra de tu puntaje de experiencia.' },
  'image-alt': { pt: 'A las fotos les faltan descripciones', im: 'El texto alternativo ayuda a Google a entender tus fotos y a que aparezcas en la búsqueda de imágenes.' },
  'link-text': { pt: 'Texto de enlace vago ("clic aquí")', im: 'Los enlaces descriptivos ayudan tanto a los clientes como a Google a entender tus páginas.' },
  'crawlable-anchors': { pt: 'Algunos enlaces no se pueden rastrear', im: 'Google no puede seguir estos enlaces, así que esas páginas quizás nunca se indexen.' },
};

function buildIssues(mob, desk, lang) {
  const out = [];
  const seen = new Set();
  const L = LABELS[lang] || LABELS.en;
  const labelMap = lang === 'es' ? ISSUE_LABELS_ES : ISSUE_LABELS;

  const push = (id, fallbackTitle, fallbackDesc) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const friendly = labelMap[id];
    if (friendly) {
      out.push({ pt: friendly.pt, im: friendly.im });
    } else if (fallbackTitle) {
      out.push({ pt: fallbackTitle, im: fallbackDesc ? stripMd(fallbackDesc) : '' });
    }
  };

  // 1) Lead with a concrete LCP callout when mobile load is genuinely slow.
  const lcp = mob.metrics.lcp;
  if (lcp && lcp.value != null && lcp.value > 2500) {
    const secs = (lcp.value / 1000).toFixed(1);
    out.push({ pt: L.lcpTitle(secs), im: L.lcpImpact });
    seen.add('largest-contentful-paint');
  }

  // 2) Highest-impact opportunities (by real time savings), then failed audits
  //    (by Lighthouse weight). Mobile first, desktop as a backstop.
  const ranked = []
    .concat(mob.opportunities.map((o) => ({ id: o.id, w: o.savingsMs / 100 })))
    .concat(mob.failing.map((f) => ({ id: f.id, w: f.weight, title: f.title, desc: f.description })))
    .concat(desk.failing.map((f) => ({ id: f.id, w: f.weight, title: f.title, desc: f.description })))
    .sort((a, b) => (b.w || 0) - (a.w || 0));

  for (const item of ranked) {
    if (out.length >= 6) break;
    push(item.id, item.title, item.desc);
  }

  return out.slice(0, 6);
}

function stripMd(s) {
  // Lighthouse descriptions contain markdown links + a [Learn more] tail.
  return String(s)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s*\[Learn more[^\]]*\][^.]*\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- url helpers ---------- */

function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  u = u.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname || parsed.hostname.indexOf('.') === -1) return null;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // Block obvious non-public hosts.
    const h = parsed.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return null;
    return parsed.toString();
  } catch (e) {
    return null;
  }
}
