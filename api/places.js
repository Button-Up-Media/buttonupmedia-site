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
    fields: 'name,website,url,rating,user_ratings_total,formatted_address,geometry,price_level,types',
    key,
  });
  const data = await getJson(`${BASE}/details/json?${params.toString()}`);
  if (data.status !== 'OK' || !data.result) {
    return res.status(502).json({ ok: false, error: 'places_status', status: data.status });
  }
  const r = data.result;
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
    },
  });
}

async function competitors(req, res, key) {
  const placeId = String((req.query && req.query.placeId) || '').trim();
  if (!placeId) return res.status(400).json({ ok: false, error: 'missing_place_id' });

  // Need the subject's location + name first.
  const dParams = new URLSearchParams({ place_id: placeId, fields: 'name,geometry', key });
  const d = await getJson(`${BASE}/details/json?${dParams.toString()}`);
  if (d.status !== 'OK' || !d.result || !d.result.geometry) {
    return res.status(502).json({ ok: false, error: 'places_status', status: d.status });
  }
  const loc = d.result.geometry.location;
  const selfName = (d.result.name || '').toLowerCase();

  const nParams = new URLSearchParams({
    location: `${loc.lat},${loc.lng}`,
    rankby: 'distance',
    type: 'restaurant',
    key,
  });
  const n = await getJson(`${BASE}/nearbysearch/json?${nParams.toString()}`);
  if (n.status !== 'OK' && n.status !== 'ZERO_RESULTS') {
    return res.status(502).json({ ok: false, error: 'places_status', status: n.status });
  }

  const list = (n.results || [])
    .filter((p) => p.place_id !== placeId && (p.name || '').toLowerCase() !== selfName)
    // Only count places with a meaningful review base as real competition; a
    // 5.0 from 3 reviews should not outrank an established spot.
    .filter((p) => p.rating != null && p.user_ratings_total != null && p.user_ratings_total >= 40)
    .map((p) => ({
      placeId: p.place_id,
      name: p.name,
      rating: p.rating,
      reviews: p.user_ratings_total,
    }))
    // Rank competitors the way a guest sees "best nearby": rating, then volume.
    .sort((a, b) => (b.rating - a.rating) || (b.reviews - a.reviews))
    .slice(0, 8);

  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  return res.status(200).json({ ok: true, competitors: list });
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
  const model = process.env.UX_MODEL || 'claude-sonnet-4-6';

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
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
            { type: 'text', text: uxPrompt(name, website, lang) },
          ],
        }],
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
    if (!parsed || typeof parsed.score !== 'number') {
      return res.status(502).json({ ok: false, error: 'ux_unparsable' });
    }

    const score = uxClamp(Math.round(parsed.score), 0, 100);
    const ux = {
      score,
      rating: uxRating(score, parsed.rating, lang),
      summary: uxStr(parsed.summary, 240),
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.slice(0, 4).map((f) => ({ pt: uxStr(f && f.title, 90), im: uxStr(f && f.impact, 200) })).filter((f) => f.pt)
        : [],
      flags: uxFlags(parsed.flags),
    };

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ ok: true, ux });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'ux_failed' });
  }
}

function uxPrompt(name, website, lang) {
  const langLine = lang === 'es'
    ? 'Write every string (summary, findings) in Latin American Spanish that a restaurant owner who is NOT a marketer will understand. No jargon, no em-dashes.'
    : 'Write every string (summary, findings) in plain English that a restaurant owner who is NOT a marketer will understand. No jargon, no em-dashes.';
  return [
    "You are a blunt restaurant-marketing expert grading a restaurant's WEBSITE from a screenshot, as a hungry customer deciding whether to order or visit. Be STRICT and skeptical: most small-restaurant sites are mediocre.",
    '',
    'Business: ' + name + (website ? ' (' + website + ')' : ''),
    '',
    "Score the customer experience 0-100. Heavily PENALIZE: generic website-builder/template look, stock photos instead of the restaurant's own food, no appetizing food photography, cluttered or dated design, unclear or missing menu, no obvious way to order or book, ordering that dumps to a clunky third-party page, weak or missing branding, poor mobile layout, walls of text. REWARD only genuinely strong sites: real appetizing food photos, clean modern design, an obvious menu and an order/reserve button, clear branding.",
    '',
    'Anchor: a plain template site with no real food photos and third-party ordering should score about 45-60, not higher. Reserve 85+ for sites that clearly look professionally designed and appetizing.',
    '',
    'Respond with ONLY this JSON and nothing else:',
    '{"score": <int 0-100>, "rating": "Poor"|"Fair"|"Good"|"Excellent", "summary": "<one blunt sentence for the owner>", "findings": [{"title":"<short issue, no jargon>","impact":"<one sentence: why it loses customers>"}], "flags": {"realFoodPhotos": <bool>, "onlineOrdering": <bool>, "clearMenu": <bool>, "modernDesign": <bool>, "strongBranding": <bool>}}',
    'findings: 2-4 items, worst first; use [] only if the site is genuinely excellent.',
    langLine,
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
