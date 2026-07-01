/**
 * Vercel Serverless Function: /api/sms/send
 *
 * Starts a real SMS verification for the report unlock gate using the
 * Twilio Verify API. Twilio generates, stores, rate-limits, and expires the
 * one-time code, so there is no database to run.
 *
 *   POST /api/sms/send   { "phone": "(305) 555-0199" }
 *
 * Auth: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID
 * (from a Twilio Verify Service) in the Vercel project env. When unset this
 * returns { ok:false, error:"not_configured" } so the gate can show a clear
 * fallback instead of pretending to send a code.
 */

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const service = process.env.TWILIO_VERIFY_SERVICE_SID || '';
  if (!sid || !token || !service) {
    return res.status(200).json({ ok: false, error: 'not_configured' });
  }

  const body = parseBody(req);
  const phone = toE164(body.phone);
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'invalid_phone', message: 'Enter a valid mobile number.' });
  }

  // Best-effort abuse guard BEFORE we pay Twilio for a send. This is per warm
  // instance (serverless has no shared memory), so it blunts the common case
  // of one visitor spamming "resend"; Twilio Verify's own per-number limits +
  // Fraud Guard remain the real backstop for distributed abuse.
  const limitMsg = throttle(phone, clientIp(req));
  if (limitMsg) {
    return res.status(429).json({ ok: false, error: 'rate_limited', message: limitMsg });
  }

  try {
    const form = new URLSearchParams({ To: phone, Channel: 'sms' });
    const resp = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // 60200 invalid number, 60203 max attempts, 429 rate limited, etc.
      if (resp.status === 429 || data.code === 60203) {
        return res.status(429).json({ ok: false, error: 'rate_limited', message: 'Too many attempts. Please wait a bit and try again.' });
      }
      if (data.code === 60200 || data.code === 60205 || data.code === 21211) {
        return res.status(400).json({ ok: false, error: 'invalid_phone', message: 'That number could not receive a text. Check it and try again.' });
      }
      return res.status(502).json({ ok: false, error: 'send_failed', message: 'We could not send the code. Please try again.' });
    }

    return res.status(200).json({ ok: true, status: data.status || 'pending', to: maskPhone(phone) });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'send_failed', message: 'We could not send the code. Please try again.' });
  }
};

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

/* ---- best-effort in-memory send throttle (per warm instance) ---- */
const SEND_LOG = new Map(); // key -> [timestamps within the window]
const THROTTLE_WINDOW = 10 * 60 * 1000; // 10 minutes
const PHONE_COOLDOWN = 20 * 1000;        // min gap between codes to one number
const PHONE_MAX = 3;                     // codes per number per window
const IP_MAX = 8;                        // codes per IP per window

function throttle(phone, ip) {
  const now = Date.now();
  const recent = (key) => (SEND_LOG.get(key) || []).filter((t) => now - t < THROTTLE_WINDOW);

  const pKey = 'p:' + phone;
  const pHits = recent(pKey);
  if (pHits.length && now - pHits[pHits.length - 1] < PHONE_COOLDOWN) {
    return 'Please wait a few seconds before requesting another code.';
  }
  if (pHits.length >= PHONE_MAX) {
    return 'Too many codes requested for this number. Please try again later.';
  }

  let iHits = null;
  if (ip) {
    iHits = recent('i:' + ip);
    if (iHits.length >= IP_MAX) {
      return 'Too many requests from your network. Please try again later.';
    }
  }

  pHits.push(now); SEND_LOG.set(pKey, pHits);
  if (ip) { iHits.push(now); SEND_LOG.set('i:' + ip, iHits); }

  // Opportunistic cleanup so the map cannot grow unbounded on a long-lived instance.
  if (SEND_LOG.size > 5000) {
    for (const [k, v] of SEND_LOG) {
      const f = v.filter((t) => now - t < THROTTLE_WINDOW);
      if (f.length) SEND_LOG.set(k, f); else SEND_LOG.delete(k);
    }
  }
  return null;
}

function clientIp(req) {
  const xff = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return xff;
}

/* Normalize to a US/Canada E.164 number. The grader serves US restaurants, so
   we only accept +1 numbers; any other country code is rejected here so the app
   never triggers an expensive international Verify SMS (defense in depth on top
   of Twilio Fraud Guard). */
function toE164(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (s[0] === '+') {
    const digits = s.slice(1).replace(/\D/g, '');
    return (digits.length === 11 && digits[0] === '1') ? '+' + digits : null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

function maskPhone(e164) {
  return e164.replace(/^(\+\d+?)(\d{4})$/, (m, head, tail) => head.replace(/\d/g, '•') + tail);
}
