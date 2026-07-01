/**
 * Vercel Serverless Function: /api/sms/check
 *
 * Verifies the SMS one-time code via Twilio Verify. On success it optionally
 * forwards the captured lead (phone + restaurant + score) to LEAD_WEBHOOK_URL
 * if that env var is set, so the lead reaches your CRM/Sheet/Zapier without a
 * database here.
 *
 *   POST /api/sms/check   { "phone": "...", "code": "123456", "restaurant": "...", "score": 38, "website": "..." }
 *
 * Auth: same TWILIO_* env vars as /api/sms/send.
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
  const code = String(body.code || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ ok: false, error: 'invalid_phone' });
  if (code.length < 4) return res.status(400).json({ ok: false, error: 'invalid_code', message: 'Enter the code we texted you.' });

  try {
    const form = new URLSearchParams({ To: phone, Code: code });
    const resp = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await resp.json().catch(() => ({}));

    if (resp.status === 404 || data.code === 20404) {
      // No pending verification (expired or never sent).
      return res.status(410).json({ ok: false, error: 'expired', message: 'That code expired. Request a new one.' });
    }
    if (!resp.ok) {
      return res.status(502).json({ ok: false, error: 'check_failed', message: 'We could not verify that code. Please try again.' });
    }

    if (data.status === 'approved') {
      // Fire-and-forget lead forwarding; never block the unlock on it.
      forwardLead({
        phone,
        restaurant: body.restaurant || null,
        website: body.website || null,
        score: body.score != null ? body.score : null,
        at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, verified: true });
    }

    return res.status(200).json({ ok: true, verified: false, message: 'That code is not correct. Try again.' });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'check_failed', message: 'We could not verify that code. Please try again.' });
  }
};

function forwardLead(lead) {
  const hook = process.env.LEAD_WEBHOOK_URL || '';
  if (!hook) return;
  try {
    fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    }).catch(() => {});
  } catch (e) { /* ignore */ }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

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
