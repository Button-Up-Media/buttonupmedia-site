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
      const lead = {
        phone,
        restaurant: body.restaurant || null,
        website: body.website || null,
        score: body.score != null ? body.score : null,
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

/* Notify the team of each lead in ClickUp. Needs CLICKUP_TOKEN (a personal
   API token). Prefers a Chat message to CLICKUP_CHANNEL_ID (with
   CLICKUP_WORKSPACE_ID; CLICKUP_FOLLOWERS = comma-separated user IDs to
   ping); falls back to creating a task in CLICKUP_LIST_ID. Returns a promise
   the handler awaits so it completes before the instance freezes. */
async function clickupLead(lead) {
  const token = process.env.CLICKUP_TOKEN || '';
  if (!token) return;

  const channelId = process.env.CLICKUP_CHANNEL_ID || '';
  const workspaceId = process.env.CLICKUP_WORKSPACE_ID || '';
  const listId = process.env.CLICKUP_LIST_ID || '';

  // Preferred: a chat message to the team channel.
  if (channelId && workspaceId) {
    const content = [
      '🌐 **New website grader lead**',
      '• **Restaurant:** ' + (lead.restaurant || 'Unknown'),
      '• **Phone:** ' + (lead.phone || ''),
      lead.score != null ? '• **Score:** ' + lead.score + ' / 100' : '',
      lead.website ? '• **Site:** ' + lead.website : '',
    ].filter(Boolean).join('\n');
    const payload = { type: 'message', content_format: 'text/md', content: content };
    const followers = String(process.env.CLICKUP_FOLLOWERS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (followers.length) payload.followers = followers;
    try {
      const r = await fetch('https://api.clickup.com/api/v3/workspaces/' + encodeURIComponent(workspaceId) +
            '/chat/channels/' + encodeURIComponent(channelId) + '/messages', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) return; // chat message posted
    } catch (e) { /* fall through to the task fallback */ }
  }

  // Fallback: create a task (the v2 API works reliably with a personal token),
  // so a lead is never silently lost if the chat post fails.
  if (!listId) return;
  const name = 'Lead: ' + (lead.restaurant || 'Unknown restaurant') +
    (lead.score != null ? ' (' + lead.score + '/100)' : '');
  const desc = [
    '- **Phone:** ' + (lead.phone || ''),
    '- **Restaurant:** ' + (lead.restaurant || ''),
    lead.website ? '- **Website:** ' + lead.website : '',
    lead.score != null ? '- **Score:** ' + lead.score + ' / 100' : '',
    '- **Received:** ' + (lead.at || ''),
    '- **Source:** website-grader',
  ].filter(Boolean).join('\n');
  await fetch('https://api.clickup.com/api/v2/list/' + encodeURIComponent(listId) + '/task', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, markdown_description: desc }),
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
    'New website grader lead: ' + (lead.restaurant || 'Unknown restaurant') +
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
