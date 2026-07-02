/**
 * Vercel Serverless Function: /api/ux
 *
 * The "can the scanner actually SEE the site" endpoint. PageSpeed measures
 * speed/SEO but is blind to whether a restaurant site is any good to a hungry
 * customer (real food photos, clean design, an obvious menu + order button, or
 * a generic template with stock photos and off-site ordering). This takes the
 * screenshot /api/scan already captured and asks Claude to grade the customer
 * experience harshly, returning a design/experience score + plain-language
 * findings the report folds in.
 *
 *   POST /api/ux   { "screenshot": "data:image/jpeg;base64,...", "name": "...", "website": "...", "lang": "es"? }
 *
 * Auth: set ANTHROPIC_API_KEY in the Vercel env. When unset this returns
 * { ok:false, error:"not_configured" } so the report simply omits the design
 * score instead of breaking.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) {
    return res.status(200).json({ ok: false, error: 'not_configured' });
  }

  const body = parseBody(req);
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
            { type: 'text', text: prompt(name, website, lang) },
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

    const score = clamp(Math.round(parsed.score), 0, 100);
    const ux = {
      score,
      rating: ratingFor(score, parsed.rating, lang),
      summary: str(parsed.summary, 240),
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.slice(0, 4).map((f) => ({ pt: str(f && f.title, 90), im: str(f && f.impact, 200) })).filter((f) => f.pt)
        : [],
      flags: normalizeFlags(parsed.flags),
    };

    // Design of a page is stable for a while; let the edge cache it.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ ok: true, ux });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'ux_failed' });
  }
};

function prompt(name, website, lang) {
  const langLine = lang === 'es'
    ? 'Write every string (summary, findings) in Latin American Spanish that a restaurant owner who is NOT a marketer will understand. No jargon, no em-dashes.'
    : 'Write every string (summary, findings) in plain English that a restaurant owner who is NOT a marketer will understand. No jargon, no em-dashes.';
  return [
    "You are a blunt restaurant-marketing expert grading a restaurant's WEBSITE from a screenshot, as a hungry customer deciding whether to order or visit. Be STRICT and skeptical: most small-restaurant sites are mediocre.",
    '',
    'Business: ' + name + (website ? ' (' + website + ')' : ''),
    '',
    'Score the customer experience 0-100. Heavily PENALIZE: generic website-builder/template look, stock photos instead of the restaurant\'s own food, no appetizing food photography, cluttered or dated design, unclear or missing menu, no obvious way to order or book, ordering that dumps to a clunky third-party page, weak or missing branding, poor mobile layout, walls of text. REWARD only genuinely strong sites: real appetizing food photos, clean modern design, an obvious menu and an order/reserve button, clear branding.',
    '',
    'Anchor: a plain template site with no real food photos and third-party ordering should score about 45-60, not higher. Reserve 85+ for sites that clearly look professionally designed and appetizing.',
    '',
    'Respond with ONLY this JSON and nothing else:',
    '{"score": <int 0-100>, "rating": "Poor"|"Fair"|"Good"|"Excellent", "summary": "<one blunt sentence for the owner>", "findings": [{"title":"<short issue, no jargon>","impact":"<one sentence: why it loses customers>"}], "flags": {"realFoodPhotos": <bool>, "onlineOrdering": <bool>, "clearMenu": <bool>, "modernDesign": <bool>, "strongBranding": <bool>}}',
    'findings: 2-4 items, worst first; use [] only if the site is genuinely excellent.',
    langLine,
  ].join('\n');
}

function ratingFor(score, given, lang) {
  const es = { Poor: 'Deficiente', Fair: 'Regular', Good: 'Bueno', Excellent: 'Excelente' };
  let r = given;
  if (r !== 'Poor' && r !== 'Fair' && r !== 'Good' && r !== 'Excellent') {
    r = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';
  }
  return lang === 'es' ? (es[r] || r) : r;
}

function normalizeFlags(f) {
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
  // Cap the payload so a malformed request cannot push a huge body upstream.
  if (m[2].length > 6 * 1024 * 1024) return null;
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

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

function str(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
