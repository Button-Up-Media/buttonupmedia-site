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

/* Normalize US/CA numbers to E.164; pass through other already-+ numbers. */
function toE164(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (s[0] === '+') {
    const digits = s.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

function maskPhone(e164) {
  return e164.replace(/^(\+\d+?)(\d{4})$/, (m, head, tail) => head.replace(/\d/g, '•') + tail);
}
