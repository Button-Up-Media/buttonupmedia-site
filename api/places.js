/**
 * Vercel Serverless Function: /api/places
 *
 * Turns a restaurant NAME into the real data the grader needs:
 *   - autocomplete: live restaurant suggestions as the owner types
 *   - details:      the selected place's website, rating, address, location
 *   - competitors:  nearby restaurants (real names + real star ratings)
 *
 *   GET /api/places?action=autocomplete&q=fatty+crab
 *   GET /api/places?action=details&placeId=ChIJ...
 *   GET /api/places?action=competitors&placeId=ChIJ...
 *
 * Auth: set GOOGLE_PLACES_API_KEY (a Google Cloud key with the "Places API"
 * enabled, billing on) in the Vercel project env. When it is missing every
 * action returns { ok:false, error:"not_configured" } so the front-end can
 * fall back to a plain URL scan without breaking.
 */

const BASE = 'https://maps.googleapis.com/maps/api/place';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // POST = the AI design review (folded in here to stay under the serverless
  // function cap; see uxReview). GET = the Places lookups below.
  if (req.method === 'POST') {
    return uxReview(req, res);
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.PAGESPEED_API_KEY || '';
  if (!key) {
    return res.status(200).json({ ok: false, error: 'not_configured' });
  }

  // Best-effort per-IP throttle (per warm instance). Google marks the Places
  // "requests per day" quota non-adjustable, so this is the practical cap on a
  // script hammering autocomplete. Generous enough for real typing + scans.
  if (throttle(clientIp(req))) {
    return res.status(429).json({ ok: false, error: 'rate_limited', message: 'Too many requests. Please slow down.' });
  }

  const action = (req.query && req.query.action) || '';

  try {
    if (action === 'autocomplete') {
      return await autocomplete(req, res, key);
    }
    if (action === 'details') {
      return await details(req, res, key);
    }
    if (action === 'competitors') {
      return await competitors(req, res, key);
    }
    if (action === 'social') {
      return await social(req, res);
    }
    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'places_failed', message: 'Place lookup failed.' });
  }
};

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---- best-effort in-memory per-IP throttle (per warm instance) ---- */
const HITS = new Map(); // ip -> [timestamps within the window]
const THROTTLE_WINDOW = 60 * 1000; // 1 minute
const IP_MAX = 80;                  // Places calls per IP per minute

function throttle(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (HITS.get(ip) || []).filter((t) => now - t < THROTTLE_WINDOW);
  if (hits.length >= IP_MAX) return true;
  hits.push(now);
  HITS.set(ip, hits);
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) {
      const f = v.filter((t) => now - t < THROTTLE_WINDOW);
      if (f.length) HITS.set(k, f); else HITS.delete(k);
    }
  }
  return false;
}

function clientIp(req) {
  return String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
}

/* Where to bias restaurant suggestions. Prefer precise browser coordinates
   (lat/lng from the geolocation prompt), then fall back to Vercel's IP-based
   geolocation headers (the searcher's approximate city). Returns "lat,lng" or
   null. IMPORTANT: with no bias, Google's autocomplete biases to the REQUESTING
   SERVER's location (Vercel iad1 = Virginia), which buried every non-Virginia
   restaurant. Biasing to the user fixes that. */
function biasLocation(req) {
  const q = req.query || {};
  const lat = parseFloat(q.lat), lng = parseFloat(q.lng);
  if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return lat + ',' + lng;
  }
  const h = req.headers || {};
  const ilat = parseFloat(h['x-vercel-ip-latitude']);
  const ilng = parseFloat(h['x-vercel-ip-longitude']);
  if (isFinite(ilat) && isFinite(ilng)) return ilat + ',' + ilng;
  return null;
}

async function autocomplete(req, res, key) {
  const q = String((req.query && req.query.q) || '').trim();
  if (q.length < 2) {
    return res.status(200).json({ ok: true, predictions: [] });
  }
  const params = new URLSearchParams({ input: q, types: 'establishment', key });
  // US restaurants only (this tool is nationwide US; drop foreign results).
  params.set('components', 'country:us');
  // Prioritize restaurants near the searcher, so a local spot outranks a more
  // prominent same-named business elsewhere in the country.
  const loc = biasLocation(req);
  if (loc) { params.set('location', loc); params.set('radius', '60000'); }

  const data = await getJson(`${BASE}/autocomplete/json?${params.toString()}`);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return res.status(502).json({ ok: false, error: 'places_status', status: data.status });
  }
  const predictions = (data.predictions || []).slice(0, 8).map((p) => ({
    placeId: p.place_id,
    name: (p.structured_formatting && p.structured_formatting.main_text) || p.description,
    addr: (p.structured_formatting && p.structured_formatting.secondary_text) || '',
  }));
  // Results are location-specific now, so keep them out of the shared edge cache.
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.status(200).json({ ok: true, predictions });
}

async function details(req, res, key) {
  const placeId = String((req.query && req.query.placeId) || '').trim();
  if (!placeId) return res.status(400).json({ ok: false, error: 'missing_place_id' });

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'name,website,url,rating,user_ratings_total,formatted_address,geometry,price_level,types,formatted_phone_number,opening_hours,photos,reviews,editorial_summary,reservable,dine_in,serves_dinner,takeout,delivery',
    key,
  });
  const data = await getJson(`${BASE}/details/json?${params.toString()}`);
  if (data.status !== 'OK' || !data.result) {
    return res.status(502).json({ ok: false, error: 'places_status', status: data.status });
  }
  const r = data.result;
  // Up to 5 sample reviews (rating + short text) so the report can gauge recent
  // sentiment. Google does not expose owner responses or all reviews here.
  const sampleReviews = Array.isArray(r.reviews)
    ? r.reviews.slice(0, 5).map((v) => ({
        rating: v.rating != null ? v.rating : null,
        text: String(v.text || '').replace(/\s+/g, ' ').slice(0, 300),
      }))
    : [];
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  return res.status(200).json({
    ok: true,
    place: {
      placeId,
      name: r.name || null,
      website: r.website || null,
      mapsUrl: r.url || null,
      rating: r.rating != null ? r.rating : null,
      reviews: r.user_ratings_total != null ? r.user_ratings_total : null,
      address: r.formatted_address || null,
      priceLevel: r.price_level != null ? r.price_level : null,
      location: r.geometry && r.geometry.location ? r.geometry.location : null,
      phone: r.formatted_phone_number || null,
      hasHours: !!(r.opening_hours && Array.isArray(r.opening_hours.weekday_text) && r.opening_hours.weekday_text.length),
      photosCount: Array.isArray(r.photos) ? r.photos.length : 0,
      photoRefs: Array.isArray(r.photos) ? r.photos.slice(0, 3).map((p) => p.photo_reference).filter(Boolean) : [],
      types: Array.isArray(r.types) ? r.types : [],
      editorialSummary: (r.editorial_summary && r.editorial_summary.overview) || null,
      // reliable reservation/service signals from Google (not a guess)
      reservable: (r.reservable === true || r.reservable === false) ? r.reservable : null,
      dineIn: (r.dine_in === true || r.dine_in === false) ? r.dine_in : null,
      servesDinner: (r.serves_dinner === true || r.serves_dinner === false) ? r.serves_dinner : null,
      takeout: (r.takeout === true || r.takeout === false) ? r.takeout : null,
      delivery: (r.delivery === true || r.delivery === false) ? r.delivery : null,
      sampleReviews: sampleReviews,
    },
  });
}

async function competitors(req, res, key) {
  const placeId = String((req.query && req.query.placeId) || '').trim();
  if (!placeId) return res.status(400).json({ ok: false, error: 'missing_place_id' });

  // Need the subject's location, name + types first.
  const dParams = new URLSearchParams({ place_id: placeId, fields: 'name,geometry,types', key });
  const d = await getJson(`${BASE}/details/json?${dParams.toString()}`);
  if (d.status !== 'OK' || !d.result || !d.result.geometry) {
    return res.status(502).json({ ok: false, error: 'places_status', status: d.status });
  }
  const loc = d.result.geometry.location;
  const selfName = (d.result.name || '').toLowerCase();
  const cuisine = cuisineOf(d.result.name, d.result.types);

  // A real competitor is a nearby spot with a SIMILAR cuisine, not just the
  // closest restaurant (a ramen shop competes with ramen shops, not McDonald's).
  // Google has no cuisine field, so we bias the search with a cuisine keyword
  // derived from the name/types, then keep only same-cuisine-looking results.
  const nParams = new URLSearchParams({ location: `${loc.lat},${loc.lng}`, rankby: 'distance', type: 'restaurant', key });
  if (cuisine) nParams.set('keyword', cuisine);
  const n = await getJson(`${BASE}/nearbysearch/json?${nParams.toString()}`);
  if (n.status !== 'OK' && n.status !== 'ZERO_RESULTS') {
    return res.status(502).json({ ok: false, error: 'places_status', status: n.status });
  }

  let list = (n.results || [])
    .filter((p) => p.place_id !== placeId && (p.name || '').toLowerCase() !== selfName)
    // a meaningful review base = real competition (a 5.0 from 3 reviews is not)
    .filter((p) => p.rating != null && p.user_ratings_total != null && p.user_ratings_total >= 40);

  // When we know the cuisine, drop results that clearly are not it (the keyword
  // biases but does not guarantee), matching on the name or a cuisine type.
  if (cuisine) {
    const strict = list.filter((p) => cuisineOf(p.name, p.types) === cuisine);
    if (strict.length >= 2) list = strict;
  }

  list = list
    .map((p) => ({ placeId: p.place_id, name: p.name, rating: p.rating, reviews: p.user_ratings_total }))
    .sort((a, b) => (b.rating - a.rating) || (b.reviews - a.reviews))
    .slice(0, 8);

  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  return res.status(200).json({ ok: true, cuisine: cuisine, competitors: list });
}

// Derive a cuisine keyword from a restaurant's name (and Google types when they
// carry a cuisine, e.g. "pizza_restaurant"). Returns null when nothing obvious.
const CUISINE_TERMS = [
  'pizza', 'pizzeria', 'sushi', 'ramen', 'poke', 'taco', 'taqueria', 'burrito', 'burger', 'bbq', 'barbecue',
  'thai', 'italian', 'mexican', 'chinese', 'japanese', 'korean', 'indian', 'mediterranean', 'greek', 'french',
  'peruvian', 'cuban', 'colombian', 'venezuelan', 'spanish', 'vietnamese', 'pho', 'noodle', 'dumpling', 'dim sum',
  'seafood', 'crab', 'lobster', 'oyster', 'ceviche', 'steakhouse', 'steak', 'deli', 'bakery', 'donut', 'bagel',
  'wings', 'fried chicken', 'sandwich', 'arepa', 'empanada', 'falafel', 'shawarma', 'kebab', 'gyro', 'hibachi',
  'teriyaki', 'curry', 'tapas', 'vegan', 'gelato', 'ice cream', 'creperie', 'crepe', 'cajun', 'creole', 'soul food',
];
function cuisineOf(name, types) {
  const n = (name || '').toLowerCase();
  for (const w of CUISINE_TERMS) { if (n.indexOf(w) !== -1) return (w === 'pizzeria' ? 'pizza' : w === 'taqueria' ? 'taco' : w); }
  for (const t of (types || [])) {
    const m = /^([a-z]+)_restaurant$/.exec(t); // Google's cuisine types, when present
    if (m && m[1] !== 'fast' && m[1] !== 'fine') return m[1];
  }
  return null;
}

/* ============================================================================
 * AI design review (POST /api/places). PageSpeed measures speed/SEO but is
 * blind to whether a restaurant site is any good to a hungry customer (real
 * food photos, clean design, an obvious menu + order button, or a generic
 * template with stock photos and off-site ordering). This takes the screenshot
 * /api/scan already captured and asks Claude to grade the customer experience
 * harshly, returning a design score + plain-language findings the report folds
 * in. Lives here (not its own function) to stay under the serverless cap.
 * Auth: ANTHROPIC_API_KEY; graceful not_configured when unset.
 * ==========================================================================*/

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

async function uxReview(req, res) {
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) {
    return res.status(200).json({ ok: false, error: 'not_configured' });
  }

  const body = parsePostBody(req);
  const img = parseDataUri(body.screenshot);
  if (!img) {
    return res.status(400).json({ ok: false, error: 'invalid_image' });
  }

  const lang = body.lang === 'es' ? 'es' : 'en';
  const name = String(body.name || '').slice(0, 120) || 'this restaurant';
  const website = String(body.website || '').slice(0, 200);
  const url = String(body.url || website || '').slice(0, 300);
  const reviews = Array.isArray(body.reviews)
    ? body.reviews.slice(0, 5).map((r) => ({ rating: r && r.rating, text: uxStr(r && r.text, 260) })).filter((r) => r.text)
    : [];
  const model = process.env.UX_MODEL || 'claude-sonnet-4-6';
  const placesKey = process.env.GOOGLE_PLACES_API_KEY || process.env.PAGESPEED_API_KEY || '';

  // Read the page HTML too, so the AI can grade content/SEO checks (menu, hours,
  // address, About, off-site ordering, title, H1, meta, alt text) it cannot see
  // from a screenshot alone. Best-effort; degrades to screenshot-only.
  let html = '';
  if (url) { try { html = await fetchHtml(url); } catch (e) { html = ''; } }

  // Pull a few Google Business Profile photos so the food-photography grade
  // reflects the real photos customers see on Google, not just the homepage.
  const photoRefs = Array.isArray(body.photoRefs) ? body.photoRefs.slice(0, 3) : [];
  const gPhotos = [];
  if (photoRefs.length && placesKey) {
    const fetched = await Promise.all(photoRefs.map((ref) => fetchGooglePhoto(ref, placesKey)));
    fetched.forEach((p) => { if (p) gPhotos.push(p); });
  }

  const content = [
    { type: 'text', text: 'SITE SCREENSHOT (mobile homepage):' },
    { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
  ];
  gPhotos.forEach((p, i) => {
    content.push({ type: 'text', text: 'GOOGLE LISTING PHOTO ' + (i + 1) + ':' });
    content.push({ type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } });
  });
  content.push({ type: 'text', text: uxPrompt(name, website, lang, html, reviews, gPhotos.length) });

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1900,
        messages: [{ role: 'user', content: content }],
      }),
    });

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).replace(/\s+/g, ' ').slice(0, 200); } catch (e) { /* ignore */ }
      try { console.warn(`UX ${resp.status}: ${detail}`); } catch (e) { /* ignore */ }
      return res.status(502).json({ ok: false, error: 'ux_failed' });
    }

    const data = await resp.json();
    const text = (data && data.content && data.content[0] && data.content[0].text) || '';
    const parsed = extractJson(text);
    if (!parsed || typeof parsed.designScore !== 'number') {
      return res.status(502).json({ ok: false, error: 'ux_unparsable' });
    }

    const score = uxClamp(Math.round(parsed.designScore), 0, 100);
    const checks = {};
    if (parsed.checks && typeof parsed.checks === 'object') {
      Object.keys(parsed.checks).forEach((k) => { checks[k] = parsed.checks[k] === true; });
    }
    const photoScore = (typeof parsed.photoScore === 'number') ? uxClamp(Math.round(parsed.photoScore), 0, 100) : null;
    const sentiment = ['positive', 'mixed', 'negative'].indexOf(String(parsed.reviewSentiment || '').toLowerCase()) >= 0
      ? String(parsed.reviewSentiment).toLowerCase() : null;
    const ux = {
      score,
      photoScore: photoScore,
      reviewSentiment: reviews.length ? sentiment : null,
      reviewNote: reviews.length ? uxStr(parsed.reviewNote, 200) : null,
      sitLike: (parsed.sitDown === true || parsed.sitDown === false) ? parsed.sitDown : null,
      rating: uxRating(score, null, lang),
      summary: uxStr(parsed.summary, 240),
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.slice(0, 4).map((f) => ({ pt: uxStr(f && f.title, 90), im: uxStr(f && f.impact, 200) })).filter((f) => f.pt)
        : [],
      checks: checks,
      htmlRead: !!html,
    };

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ ok: true, ux });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'ux_failed' });
  }
}

function uxPrompt(name, website, lang, html, reviews, gPhotoCount) {
  const langLine = lang === 'es'
    ? 'Write the summary and findings strings in Latin American Spanish that a restaurant owner who is NOT a marketer understands. Check ids stay in English. No jargon, no em-dashes.'
    : 'Write the summary and findings strings in plain English a restaurant owner who is NOT a marketer understands. No jargon, no em-dashes.';
  const CHECKS = [
    // [see] = judge from the SCREENSHOT, [html] = judge from the HTML
    '[see] menu-and-prices-visible: the menu and prices are easy to find from the homepage',
    '[see] order-or-reserve-button: a clear Order or Book/Reserve button is visible near the top',
    '[see] real-food-photos: the homepage shows real, appetizing photos of the food',
    '[see] photos-are-your-own-food: the food photos look like this restaurant\'s own, not generic stock',
    '[see] strong-hero: a strong, attention-grabbing first screen',
    '[see] mobile-layout-looks-right: the layout looks good on a phone, not squished or cut off',
    '[see] appetizing-photo-quality: the food photos look appetizing (bright, sharp, not dark or blurry)',
    '[see] modern-non-template-design: the design looks modern, not a cheap cookie-cutter template',
    '[see] readable-text: text is easy to read at a glance (good size and contrast)',
    '[see] strong-branding: clear branding (logo, consistent look) that reads as a real restaurant',
    '[see] not-cluttered: clean, uncluttered layout with room to breathe',
    '[html] order-on-own-site: customers can order on THIS site, not only pushed to a third-party ordering app or domain',
    '[html] phone-number-visible: a phone number appears on the page (a tel: link or a visible number)',
    '[html] address-on-site: a street address appears on the page',
    '[html] hours-on-site: opening hours appear on the page',
    '[html] about-story: there is a real About or Our Story section',
    '[html] enough-real-text: the page has a meaningful amount of real text, not just images',
    '[html] social-links: there are links to Instagram and/or Facebook',
    '[html] faq-section: there is an FAQ or common-questions section',
    '[html] own-domain: the site is on the restaurant\'s OWN custom domain, not a free builder subdomain (wixsite.com, godaddysites.com, square.site, etc.) or a facebook.com page',
    '[html] headline-food-town: the <title> tag names the food or cuisine and the city or area',
    '[html] h1-city: an <h1> heading mentions the city or neighborhood',
    '[html] meta-description: a non-empty <meta name="description"> exists',
    '[html] title-matches-listing: the <title> or site name matches the business name "' + name + '"',
    '[html] alt-text: images have descriptive alt attributes',
    '[html] og-tags: Open Graph tags (og:title and og:image) exist for nice link sharing',
  ];
  return [
    'You are a blunt restaurant-marketing expert building a report card for a restaurant\'s homepage, judging it as a hungry customer deciding whether to order or visit. Be STRICT and skeptical.',
    '',
    'Business name: ' + name + (website ? '\nWebsite: ' + website : ''),
    '',
    'You are given the page SCREENSHOT (a mobile view) and its HTML below. Do these things:',
    '1) Give a strict designScore 0-100 for how good the site LOOKS and how USEFUL it is to a hungry customer (real appetizing food photos, modern non-template design, easy to use, a real reason to stay, clean layout, strong branding). Be harsh: a generic cookie-cutter template that gives a visitor little reason to stay, or a basically useless site (just a background image and an off-site order button, no real content) scores 25-45. A decent-but-forgettable site scores 50-65. Reserve 80+ ONLY for genuinely professional, appetizing, easy-to-use sites.',
    '2) Give a strict photoScore 0-100 rating the food photography across BOTH the site screenshot AND the ' + (gPhotoCount || 0) + ' Google listing photo(s) shown above. Judge how appetizing and high quality the food looks. Real, authentic photos (including genuine customer phone photos) are GOOD and beat obvious stock or AI-generated images. But award 80+ ONLY when photos are genuinely appetizing AND professional grade (great light, composition, freshness). Real-but-amateur photos of decent food land ~55-70. No real food photos, or clearly stock/AI, under 30. In findings, if the photos are authentic but not professional, say that (a photographer would help), rather than calling them fake.',
    '3) sitDown: true if this looks like a sit-down / dine-in restaurant where reservations make sense; false if it is fast-casual, counter-service, takeout, a cafe, bakery, food truck or quick bite.',
    (reviews && reviews.length)
      ? '4) reviewSentiment: read the recent customer reviews below and answer "positive", "mixed" or "negative" based on RECENT complaints (cold food, slow or rude service, cleanliness, wrong orders). If negative or mixed, put the single main recurring complaint in reviewNote in plain owner language; otherwise leave reviewNote empty.'
      : '4) reviewSentiment: return "positive" and an empty reviewNote (no reviews were provided).',
    '5) Grade every check below as true (pass) or false (fail). Use the SCREENSHOT for [see] checks and the HTML for [html] checks. When unsure or the evidence is missing, mark it false.',
    '',
    'CHECKS (return every id in "checks"):',
    CHECKS.join('\n'),
    (reviews && reviews.length) ? ('\nRECENT REVIEWS:\n' + reviews.map((r) => '- ' + (r.rating != null ? r.rating + ' stars: ' : '') + r.text).join('\n')) : '',
    '',
    'Respond with ONLY this JSON and nothing else:',
    '{"designScore": <int 0-100>, "photoScore": <int 0-100>, "sitDown": <true|false>, "reviewSentiment": "<positive|mixed|negative>", "reviewNote": "<main recent complaint, or empty>", "summary": "<one blunt sentence for the owner>", "findings": [{"title":"<short failed item, no jargon>","impact":"<one sentence: how it loses customers>"}], "checks": {"<id>": <true|false>, ... every id above ...}}',
    'findings: the 2-4 worst FAILED checks, worst first, in plain owner language.',
    langLine,
    '',
    'HTML (may be truncated):',
    html ? html : '(the page HTML could not be fetched; grade the [html] checks conservatively as false unless the screenshot clearly shows otherwise)',
  ].join('\n');
}

function uxRating(score, given, lang) {
  const es = { Poor: 'Deficiente', Fair: 'Regular', Good: 'Bueno', Excellent: 'Excelente' };
  let r = given;
  if (r !== 'Poor' && r !== 'Fair' && r !== 'Good' && r !== 'Excellent') {
    r = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';
  }
  return lang === 'es' ? (es[r] || r) : r;
}

function uxFlags(f) {
  f = f && typeof f === 'object' ? f : {};
  const b = (v) => v === true;
  return {
    realFoodPhotos: b(f.realFoodPhotos),
    onlineOrdering: b(f.onlineOrdering),
    clearMenu: b(f.clearMenu),
    modernDesign: b(f.modernDesign),
    strongBranding: b(f.strongBranding),
  };
}

/* Fetch a page's HTML for the content/SEO checks. Strips script/style noise and
   caps the size so we send Claude signal, not megabytes. Best-effort. */
async function fetchHtml(url) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ButtonUpGrader/1.0; +https://www.buttonupmedia.com)' },
    });
    if (!resp.ok) return '';
    let text = await resp.text();
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/[ \t]+/g, ' ');
    return text.slice(0, 55000);
  } finally {
    clearTimeout(timer);
  }
}

// Fetch one Google Business Profile photo as base64 for the vision review.
async function fetchGooglePhoto(ref, key) {
  const url = BASE + '/photo?maxwidth=800&photo_reference=' + encodeURIComponent(ref) + '&key=' + key;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(ct)) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length || buf.length > 4 * 1024 * 1024) return null;
    return { mediaType: ct, data: buf.toString('base64') };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================================
   SOCIAL AUDIT (best-effort, public data). Reads a restaurant's public
   Instagram + TikTok follower/post counts. Everything degrades to
   { found:false } on any block/timeout so it can never break the report.
   ========================================================================== */
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

// Apify runs purpose-built scrapers through residential IPs, so it works from
// a server where direct requests get the datacenter-IP login wall. Pay-per-use.
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
async function apifyProfile(actor, input) {
  if (!APIFY_TOKEN) return null;
  const url = 'https://api.apify.com/v2/acts/' + actor + '/run-sync-get-dataset-items?token=' + encodeURIComponent(APIFY_TOKEN) + '&maxItems=1';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
    if (!resp.ok) return null;
    const items = await resp.json();
    return Array.isArray(items) && items.length ? items[0] : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function firstNum(obj, keys) {
  for (const k of keys) { if (obj && obj[k] != null && typeof obj[k] !== 'object') { const n = Number(obj[k]); if (!isNaN(n)) return n; } }
  return null;
}
// newest timestamp (ms epoch) across an IG profile's recent posts, for recency
function latestPostTs(it) {
  const arr = [].concat(it.latestPosts || [], it.latestIgtvVideos || []);
  let best = null;
  for (const p of arr) {
    if (!p) continue;
    const ts = p.timestamp || p.takenAt || p.taken_at || p.time;
    if (ts == null) continue;
    const ms = (typeof ts === 'number') ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
    if (!isNaN(ms) && (best == null || ms > best)) best = ms;
  }
  return best;
}

async function fetchRaw(url, cap) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': IPHONE_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!resp.ok) return { ok: false, status: resp.status, text: '' };
    const text = await resp.text();
    return { ok: true, status: resp.status, text: text.slice(0, cap || 250000) };
  } catch (e) {
    return { ok: false, status: 0, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

function socialNum(s) {
  if (s == null) return null;
  s = String(s).replace(/,/g, '').trim();
  const m = s.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(n * mult);
}

function discoverHandles(html) {
  const ig = new Set(), tt = new Set();
  const IG_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'about', 'developer', 'legal', 'directory', 'sharer', 'embed']);
  let m;
  const igRe = /instagram\.com\/([A-Za-z0-9_.]{2,30})/gi;
  while ((m = igRe.exec(html))) {
    const h = m[1].toLowerCase().replace(/\.$/, '');
    if (!IG_SKIP.has(h) && !/\.(png|jpe?g|gif|css|js|svg)$/.test(h)) ig.add(h);
  }
  const ttRe = /tiktok\.com\/@([A-Za-z0-9_.]{2,30})/gi;
  while ((m = ttRe.exec(html))) tt.add(m[1].toLowerCase().replace(/\.$/, ''));
  return { ig: [...ig].slice(0, 3), tt: [...tt].slice(0, 3) };
}

function guessHandles(name) {
  if (!name) return [];
  const base = name.toLowerCase().replace(/['’.]/g, '').replace(/&/g, 'and');
  const words = base.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const generic = new Set(['restaurant', 'pizzeria', 'cafe', 'kitchen', 'grill', 'bar', 'and', 'the', 'co', 'inc', 'llc']);
  const core = words.filter((w) => !generic.has(w));
  const joined = (core.length ? core : words).join('');
  const out = new Set([joined, words.join(''), (core.length ? core : words).join('_')]);
  ['inc', 'official', 'restaurant', 'eats', 'miami', 'fl'].forEach((sfx) => out.add(joined + sfx));
  return [...out].filter((h) => h.length >= 3 && h.length <= 30).slice(0, 6);
}

function socialHost(u) {
  try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
}
// does a profile's bio link back to the restaurant's own website? (the reliable
// way to pick the right account out of many same-named ones)
function linksToWebsite(links, website) {
  const w = socialHost(website);
  if (!w) return false;
  const core = w.split('.')[0];
  return (links || []).some((u) => { const h = socialHost(u); return h && (h === w || (core.length > 4 && h.indexOf(core) !== -1)); });
}
// Find a handle via web search (Apify Google-search actor; reuses APIFY_TOKEN).
async function searchHandles(query) {
  if (!APIFY_TOKEN) return { ig: [], tt: [] };
  const item = await apifyProfile('apify~google-search-scraper', { queries: query, resultsPerPage: 10, maxPagesPerQuery: 1, countryCode: 'us', saveHtml: false });
  const results = (item && (item.organicResults || item.results)) || [];
  const urls = results.map((r) => (r && (r.url || r.link)) || '').filter(Boolean);
  return discoverHandles(urls.join('\n'));
}

async function scrapeInstagram(handle) {
  // 1) Apify (works from a server); 2) direct read (residential IP only)
  if (APIFY_TOKEN) {
    const it = await apifyProfile('apify~instagram-profile-scraper', { usernames: [handle] });
    if (it) {
      const followers = firstNum(it, ['followersCount', 'followers', 'followerCount']);
      const posts = firstNum(it, ['postsCount', 'mediaCount']);
      if (followers != null || posts != null) {
        const links = [];
        (it.externalUrls || []).forEach((u) => { const v = (u && (u.url || u.href)) || (typeof u === 'string' ? u : null); if (v) links.push(v); });
        if (it.externalUrl && links.indexOf(it.externalUrl) === -1) links.push(it.externalUrl);
        return {
          handle: handle, found: true, followers: followers, posts: posts,
          following: firstNum(it, ['followsCount', 'followingCount']),
          displayName: it.fullName || it.name || null,
          bio: it.biography || '',
          links: links,
          highlights: firstNum(it, ['highlightReelCount']),
          latestPostAt: latestPostTs(it),
          private: !!it.private, verified: !!it.verified,
          isBusiness: !!it.isBusinessAccount, category: it.businessCategoryName || null,
          profilePic: it.profilePicUrl || null,
          via: 'apify', _raw: it,
        };
      }
    }
  }
  const r = await fetchRaw('https://www.instagram.com/' + handle + '/', 200000);
  if (!r.ok) return { handle: handle, found: false };
  const og = r.text.match(/content=["']([^"']*?Followers[^"']*?)["']/i);
  if (!og) return { handle: handle, found: false };
  const s = og[1];
  const f = s.match(/([\d,.]+\s*[KMB]?)\s*Followers/i);
  const p = s.match(/([\d,.]+\s*[KMB]?)\s*Posts/i);
  const nameM = s.match(/from\s+(.+?)\s*\(@/i);
  return {
    handle: handle, found: true,
    followers: socialNum(f && f[1]), followersText: f ? f[1].trim() : null,
    posts: socialNum(p && p[1]),
    displayName: nameM ? nameM[1].trim() : null,
  };
}

async function scrapeTiktok(handle) {
  if (APIFY_TOKEN) {
    const it = await apifyProfile('clockworks~tiktok-scraper', { profiles: [handle], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false });
    if (it) {
      const meta = it.authorMeta || it.author || it;
      const followers = firstNum(meta, ['fans', 'followerCount', 'followers']);
      const videos = firstNum(meta, ['video', 'videoCount', 'videos']);
      const likes = firstNum(meta, ['heart', 'heartCount', 'likes', 'diggCount']);
      if (followers != null) {
        return { handle: handle, found: true, followers: followers, videos: videos, likes: likes, avgLikes: (likes && videos) ? Math.round(likes / videos) : null, via: 'apify', _raw: it };
      }
    }
  }
  const r = await fetchRaw('https://www.tiktok.com/@' + handle, 400000);
  if (!r.ok) return { handle: handle, found: false };
  const f = r.text.match(/"followerCount":(\d+)/);
  const v = r.text.match(/"videoCount":(\d+)/);
  const h = r.text.match(/"heartCount":(\d+)/);
  // require a real profile signal (followers + at least one video) so a challenge
  // page or a wrong-guess handle doesn't return garbage like "14 followers, 0 videos"
  if (!f || !v || +v[1] < 1) return { handle: handle, found: false };
  const followers = +f[1];
  const videos = +v[1];
  const likes = h ? +h[1] : null;
  return {
    handle: handle, found: true,
    followers: followers, videos: videos, likes: likes,
    avgLikes: (likes && videos) ? Math.round(likes / videos) : null,
  };
}

/* The social action has two modes so each request is at most ONE Apify run
   (Apify runs are slow; batching IG+TikTok+guesses into one call blew the
   function timeout). The report page orchestrates them:
     1) ?action=social&discover=1&website=&name=  -> fast, no scraping: returns
        the handle linked on their site + guess candidates from the name.
     2) ?action=social&platform=ig|tt&handle=X     -> one profile's real stats.
   So the frontend discovers, confirms a guessed handle with the user, then
   fires the per-profile scrapes (restaurant + competitors) in parallel. */
// Each profile scrape is a paid Apify run, so cache results (competitors and
// re-scans reuse them) and cap the paid calls harder than the free Places ones.
const SOCIAL_CACHE = new Map(); // "platform:handle" -> { t, data }
const SOCIAL_TTL = 20 * 60 * 1000;
const SOCIAL_HITS = new Map();  // ip -> [timestamps]
const SOCIAL_IP_MAX = 20;       // paid scrapes per IP per minute
function socialThrottle(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (SOCIAL_HITS.get(ip) || []).filter((t) => now - t < 60000);
  if (hits.length >= SOCIAL_IP_MAX) return true;
  hits.push(now); SOCIAL_HITS.set(ip, hits);
  if (SOCIAL_HITS.size > 5000) { for (const [k, v] of SOCIAL_HITS) { const f = v.filter((t) => now - t < 60000); if (f.length) SOCIAL_HITS.set(k, f); else SOCIAL_HITS.delete(k); } }
  return false;
}

async function social(req, res) {
  const q = req.query || {};
  try {
    if (q.searchdebug) {
      const item = await apifyProfile('apify~google-search-scraper', { queries: String(q.searchdebug), resultsPerPage: 10, maxPagesPerQuery: 1, countryCode: 'us' });
      const arr = (item && (item.organicResults || item.results)) || [];
      return res.status(200).json({ ok: true, gotItem: !!item, itemKeys: item ? Object.keys(item).slice(0, 25) : null, organicCount: arr.length, sampleUrls: arr.slice(0, 5).map((r) => r && (r.url || r.link)) });
    }
    // ---- mode 2: scrape a single profile (the building block) ----
    const platform = (q.platform || '').toLowerCase();
    const handle = (q.handle || '').trim().replace(/^@/, '');
    if (platform && handle) {
      if (!/^[A-Za-z0-9_.]{2,30}$/.test(handle)) return res.status(400).json({ ok: false, error: 'bad_handle' });
      const website = (q.website || '').trim();
      const key = platform + ':' + handle.toLowerCase();
      const cached = SOCIAL_CACHE.get(key);
      let profile;
      if (cached && Date.now() - cached.t < SOCIAL_TTL) {
        profile = cached.data;
      } else {
        if (socialThrottle(clientIp(req))) return res.status(429).json({ ok: false, error: 'rate_limited' });
        if (platform === 'ig' || platform === 'instagram') profile = await scrapeInstagram(handle);
        else if (platform === 'tt' || platform === 'tiktok') profile = await scrapeTiktok(handle);
        else return res.status(400).json({ ok: false, error: 'bad_platform' });
        if (profile) delete profile._raw;
        if (profile && profile.found) SOCIAL_CACHE.set(key, { t: Date.now(), data: profile });
      }
      // confirm this is the right account: does its bio link back to their site?
      if (profile && profile.found && website) profile.linksToWebsite = linksToWebsite(profile.links, website);
      return res.status(200).json({ ok: true, platform: platform, profile: profile, cached: !!cached });
    }

    // ---- mode 1: discovery: site links first, then a web search ----
    const website = (q.website || '').trim();
    const name = (q.name || '').trim();
    let ig = [], tt = [], searched = false;
    if (website) {
      const site = await fetchRaw(website, 250000);
      const d = discoverHandles(site.text || '');
      ig = d.ig; tt = d.tt;
    }
    // If the site didn't link a handle, search the web for it (Apify Google
    // actor). The report then scrapes the top candidate and confirms it links
    // back to the website, which picks the right one out of many same-named accounts.
    if ((!ig.length || !tt.length) && name && q.search !== '0') {
      const s = await searchHandles(name + ' Instagram TikTok');
      searched = true;
      if (!ig.length) ig = s.ig;
      if (!tt.length && s.tt.length) tt = s.tt;
    }
    return res.status(200).json({
      ok: true,
      searched: searched,
      discover: {
        instagram: { linked: ig[0] || null, candidates: ig.slice(0, 3), guesses: ig.length ? [] : guessHandles(name) },
        tiktok: { linked: tt[0] || null, candidates: tt.slice(0, 3), guesses: tt.length ? [] : guessHandles(name) },
      },
    });
  } catch (e) {
    return res.status(200).json({ ok: true, error: true });
  }
}

function parseDataUri(s) {
  s = String(s || '');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return null;
  if (m[2].length > 6 * 1024 * 1024) return null; // cap payload
  return { mediaType: m[1], data: m[2] };
}

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a !== -1 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { /* ignore */ }
  }
  return null;
}

function parsePostBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

function uxStr(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function uxClamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
