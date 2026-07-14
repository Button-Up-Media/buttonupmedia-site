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

  // --- Automated prospect outreach (triggered ~8 min after a lead by the delay
  // automation/cron). Sends ONE tailored intro text FROM Gio's number so he can
  // then follow up as a human. Secret-guarded so only our automation can call it.
  const preBody = parseBody(req);
  if (preBody && preBody.action === 'outreach') return outreachHandler(req, res, preBody);
  // Captcha-based unlock: verify a Cloudflare Turnstile token instead of an SMS
  // code, then collect + deliver the lead. Bots are stopped by the captcha; the
  // number is still captured. Degrades to "not_configured" (frontend unlocks)
  // until TURNSTILE_SECRET is set.
  if (preBody && preBody.action === 'unlock') return unlockHandler(req, res, preBody);

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
      const lead = {
        phone,
        restaurant: body.restaurant || null,
        website: body.website || null,
        score: body.score != null ? body.score : null,
        focus: body.focus || null,               // biggest fix area: website|seo|social|ads
        focusReason: body.focusReason || null,   // plain-language "why" for that fix
        at: new Date().toISOString(),
      };
      // Await delivery so it finishes before the serverless instance freezes
      // (a fire-and-forget fetch after res is not guaranteed to complete).
      await Promise.allSettled([clickupLead(lead), forwardLead(lead), alertOwners(lead)]);
      return res.status(200).json({ ok: true, verified: true });
    }

    return res.status(200).json({ ok: true, verified: false, message: 'That code is not correct. Try again.' });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'check_failed', message: 'We could not verify that code. Please try again.' });
  }
};

function forwardLead(lead) {
  const hook = process.env.LEAD_WEBHOOK_URL || '';
  if (!hook) return Promise.resolve();
  return fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });
}

/* Deliver each lead to ClickUp (needs CLICKUP_TOKEN, a personal API token).
   Does BOTH, independently: a chat ping for the team (CLICKUP_CHANNEL_ID +
   CLICKUP_WORKSPACE_ID) AND a task in CLICKUP_LIST_ID — the task is what the
   8-minute outreach automation triggers on, and its custom fields feed the
   tailored text. Awaited so it finishes before the instance freezes. */
async function clickupLead(lead) {
  const token = process.env.CLICKUP_TOKEN || '';
  if (!token) return;
  await Promise.allSettled([clickupChat(lead, token), clickupTask(lead, token)]);
}

async function clickupChat(lead, token) {
  const channelId = process.env.CLICKUP_CHANNEL_ID || '';
  const workspaceId = process.env.CLICKUP_WORKSPACE_ID || '';
  if (!channelId || !workspaceId) return;
  const content = [
    '🌐 **New Restaurant Marketing Report Card lead**',
    '• **Restaurant:** ' + (lead.restaurant || 'Unknown'),
    '• **Phone:** ' + (lead.phone || ''),
    lead.score != null ? '• **Score:** ' + lead.score + ' / 100' : '',
    lead.focus ? '• **Biggest fix:** ' + lead.focus + (lead.focusReason ? ' — ' + lead.focusReason : '') : '',
    lead.website ? '• **Site:** ' + lead.website : '',
  ].filter(Boolean).join('\n');
  const payload = { type: 'message', content_format: 'text/md', content: content };
  const followers = String(process.env.CLICKUP_FOLLOWERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (followers.length) payload.followers = followers;
  await fetch('https://api.clickup.com/api/v3/workspaces/' + encodeURIComponent(workspaceId) +
        '/chat/channels/' + encodeURIComponent(channelId) + '/messages', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function clickupTask(lead, token) {
  const listId = process.env.CLICKUP_LIST_ID || '';
  if (!listId) return;
  // Populate any matching Text custom fields (create them named Phone / Restaurant
  // / Score / Focus / Website on the list) so the ClickUp automation can merge
  // them into the outreach webhook. Missing fields are simply skipped.
  let customFields = [];
  try {
    const fr = await fetch('https://api.clickup.com/api/v2/list/' + encodeURIComponent(listId) + '/field', { headers: { Authorization: token } });
    if (fr.ok) {
      const fj = await fr.json().catch(() => ({}));
      const byName = {};
      (fj.fields || []).forEach((f) => { byName[String(f.name || '').trim().toLowerCase()] = f; });
      const setF = (n, v) => { const f = byName[n]; if (f && v != null && v !== '') customFields.push({ id: f.id, value: String(v) }); };
      setF('phone', lead.phone); setF('restaurant', lead.restaurant); setF('score', lead.score); setF('focus', lead.focus); setF('website', lead.website);
    }
  } catch (e) { /* custom fields are optional */ }
  const name = 'Lead: ' + (lead.restaurant || 'Unknown restaurant') + (lead.score != null ? ' (' + lead.score + '/100)' : '');
  const desc = [
    '- **Phone:** ' + (lead.phone || ''),
    '- **Restaurant:** ' + (lead.restaurant || ''),
    lead.website ? '- **Website:** ' + lead.website : '',
    lead.score != null ? '- **Score:** ' + lead.score + ' / 100' : '',
    lead.focus ? '- **Biggest fix:** ' + lead.focus + (lead.focusReason ? ' — ' + lead.focusReason : '') : '',
    '- **Received:** ' + (lead.at || ''),
    '- **Source:** website-grader',
  ].filter(Boolean).join('\n');
  const bodyObj = { name: name, markdown_description: desc };
  if (customFields.length) bodyObj.custom_fields = customFields;
  await fetch('https://api.clickup.com/api/v2/list/' + encodeURIComponent(listId) + '/task', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  });
}

/* Text a lead notification to the owner number(s) in TWILIO_ALERT_TO
   (comma-separated E.164). Needs a sender: TWILIO_MESSAGING_SERVICE_SID
   or TWILIO_FROM_NUMBER. Returns a promise the handler awaits. OFF unless
   TWILIO_ALERT_TO is set. */
function alertOwners(lead) {
  const to = String(process.env.TWILIO_ALERT_TO || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length) return Promise.resolve();

  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.TWILIO_FROM_NUMBER || '';
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
  if (!sid || !token || (!from && !service)) return Promise.resolve();

  const body =
    'New Restaurant Marketing Report Card lead: ' + (lead.restaurant || 'Unknown restaurant') +
    '\nPhone: ' + (lead.phone || '') +
    (lead.score != null ? '\nScore: ' + lead.score + '/100' : '') +
    (lead.website ? '\nSite: ' + lead.website : '');
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');

  return Promise.all(to.map((dest) => {
    const form = new URLSearchParams();
    form.set('To', dest);
    form.set('Body', body);
    if (service) form.set('MessagingServiceSid', service);
    else form.set('From', from);
    return fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  }));
}

/* ---- Automated first-touch outreach to the prospect, sent FROM Gio's number
   so replies land with him and he can keep the conversation human. One text,
   tailored to their biggest fix. Secret-guarded; graceful when unconfigured. ---- */
const OUTREACH_FOCUS = {
  website: 'Your website is holding you back and quietly costing you orders.',
  seo: "You're hard for hungry locals to find on Google right now.",
  social: "Your social media isn't bringing people in the way it could.",
  ads: "You're just not getting enough new customers through the door yet.",
  _default: 'There are a few quick wins that would bring you more customers.',
};
async function outreachHandler(req, res, body) {
  const secret = process.env.OUTREACH_SECRET || '';
  const provided = body.secret || (req.headers && req.headers['x-outreach-secret']) || '';
  if (!secret || provided !== secret) return res.status(403).json({ ok: false, error: 'forbidden' });
  const phone = toE164(body.phone);
  if (!phone) return res.status(400).json({ ok: false, error: 'invalid_phone' });
  const r = await sendOutreach({ phone: phone, restaurant: body.restaurant, score: body.score, focus: body.focus });
  return res.status(r.ok || r.error === 'not_configured' ? 200 : 502).json(r);
}
async function sendOutreach(lead) {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.GIO_SMS_FROM || '';   // Gio's Twilio number (E.164)
  if (!sid || !token || !from) return { ok: false, error: 'not_configured' };
  const line = OUTREACH_FOCUS[String(lead.focus || '').toLowerCase()] || OUTREACH_FOCUS._default;
  const rest = lead.restaurant ? String(lead.restaurant).trim() : 'your restaurant';
  const scoreBit = (lead.score != null && lead.score !== '') ? (' and it scored ' + lead.score + '/100') : '';
  const bodyText =
    'You just ran ' + rest + ' through our free Restaurant Marketing Report Card' + scoreBit +
    ". Hi, I'm Gio from Button Up Media. " + line +
    " I'd love to show you exactly how to fix it, no charge. Do you have 15 min this week for a quick call? (Reply STOP to opt out.)";
  const auth = 'Basic ' + Buffer.from(sid + ':' + token).toString('base64');
  const form = new URLSearchParams();
  form.set('To', lead.phone);
  form.set('From', from);
  form.set('Body', bodyText);
  try {
    const resp = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
    });
    if (!resp.ok) { const d = await resp.json().catch(() => ({})); return { ok: false, error: 'send_failed', code: d.code }; }
    return { ok: true, sent: true };
  } catch (e) {
    return { ok: false, error: 'send_failed' };
  }
}

/* Captcha unlock: verify the Cloudflare Turnstile token, then collect + deliver
   the lead. Graceful not_configured (so the gate keeps working) until the secret
   is set. */
async function unlockHandler(req, res, body) {
  const secret = process.env.TURNSTILE_SECRET || '';
  if (!secret) return res.status(200).json({ ok: false, error: 'not_configured' });
  const phone = toE164(body.phone);
  if (!phone) return res.status(400).json({ ok: false, error: 'invalid_phone', message: 'Enter a valid mobile number.' });
  const token = String(body.token || '').trim();
  // The widget can be blocked by an ad/privacy blocker or fail to load; the
  // client flags that so we never lock a real lead out over a captcha that
  // could not render. Verify any real token; only allow an empty one when the
  // client reports the captcha was unavailable.
  const captchaUnavailable = body.captchaUnavailable === true;
  if (token) {
    let passed = false;
    try {
      const form = new URLSearchParams();
      form.set('secret', secret);
      form.set('response', token);
      const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
      });
      const data = await resp.json().catch(() => ({}));
      passed = !!data.success;
    } catch (e) { passed = false; }
    if (!passed) return res.status(403).json({ ok: false, error: 'captcha_failed', message: 'That check did not pass. Please try again.' });
  } else if (!captchaUnavailable) {
    return res.status(400).json({ ok: false, error: 'captcha_missing', message: 'Please complete the quick check.' });
  }

  const lead = {
    phone: phone,
    restaurant: body.restaurant || null,
    website: body.website || null,
    score: body.score != null ? body.score : null,
    focus: body.focus || null,
    focusReason: body.focusReason || null,
    at: new Date().toISOString(),
  };
  await Promise.allSettled([clickupLead(lead), forwardLead(lead), alertOwners(lead)]);
  return res.status(200).json({ ok: true, verified: !!token, unlocked: true });
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
    // US/Canada only (+1), matching /api/sms/send so a verify check lines up
    // with what we were willing to text.
    const digits = s.slice(1).replace(/\D/g, '');
    return (digits.length === 11 && digits[0] === '1') ? '+' + digits : null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}
