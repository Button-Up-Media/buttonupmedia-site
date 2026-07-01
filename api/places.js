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

  const key = process.env.GOOGLE_PLACES_API_KEY || '';
  if (!key) {
    return res.status(200).json({ ok: false, error: 'not_configured' });
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

async function autocomplete(req, res, key) {
  const q = String((req.query && req.query.q) || '').trim();
  if (q.length < 2) {
    return res.status(200).json({ ok: true, predictions: [] });
  }
  const params = new URLSearchParams({ input: q, types: 'establishment', key });
  const data = await getJson(`${BASE}/autocomplete/json?${params.toString()}`);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return res.status(502).json({ ok: false, error: 'places_status', status: data.status });
  }
  const predictions = (data.predictions || []).slice(0, 6).map((p) => ({
    placeId: p.place_id,
    name: (p.structured_formatting && p.structured_formatting.main_text) || p.description,
    addr: (p.structured_formatting && p.structured_formatting.secondary_text) || '',
  }));
  // Predictions can be cached briefly per query.
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
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
