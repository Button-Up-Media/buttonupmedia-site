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

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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
    .filter((p) => p.rating != null && p.user_ratings_total != null)
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
