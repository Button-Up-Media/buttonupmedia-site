/**
 * Vercel Serverless Function: /api/meta/webhook
 * Handles Meta webhook verification and event processing
 *
 * GET  /api/meta/webhook - Webhook verification (Meta sends challenge)
 * POST /api/meta/webhook - Receive webhook events
 */

const { META_CONFIG } = require('./lib/config');
const { CORS_HEADERS } = require('./lib/middleware');

module.exports = async (req, res) => {
  // Set headers
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  switch (req.method) {
    // ─── WEBHOOK VERIFICATION ───────────────────────────────────────────────
    case 'GET': {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      // Verify the webhook subscription
      if (mode === 'subscribe' && token === META_CONFIG.webhookVerifyToken) {
        console.log('[Webhook] Verification successful');
        return res.status(200).send(challenge);
      }

      console.warn('[Webhook] Verification failed - token mismatch');
      return res.status(403).json({ error: 'Verification failed' });
    }

    // ─── RECEIVE WEBHOOK EVENTS ─────────────────────────────────────────────
    case 'POST': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      console.log('[Webhook] Received event:', JSON.stringify(body, null, 2));

      // Process different webhook object types
      const { object, entry } = body;

      if (!entry || !Array.isArray(entry)) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      for (const event of entry) {
        switch (object) {
          case 'page':
            await handlePageEvent(event);
            break;
          case 'instagram':
            await handleInstagramEvent(event);
            break;
          case 'ad_account':
            await handleAdAccountEvent(event);
            break;
          default:
            console.log(`[Webhook] Unhandled object type: ${object}`);
        }
      }

      // Always respond 200 to acknowledge receipt
      return res.status(200).json({ received: true });
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// ─── EVENT HANDLERS ──────────────────���──────────────────────────────────────

async function handlePageEvent(event) {
  const { id, time, messaging, changes, feed } = event;
  console.log(`[Webhook:Page] Event for page ${id} at ${time}`);

  // Handle messaging events (Messenger)
  if (messaging) {
    for (const msg of messaging) {
      if (msg.message) {
        console.log(`[Webhook:Page] New message from ${msg.sender.id}: ${msg.message.text}`);
        // TODO: Integrate with your messaging handler
      }
    }
  }

  // Handle feed changes (new posts, comments, reactions)
  if (changes) {
    for (const change of changes) {
      console.log(`[Webhook:Page] Feed change: ${change.field} - ${change.value?.verb || 'unknown'}`);
      // TODO: Process feed changes
    }
  }
}

async function handleInstagramEvent(event) {
  const { id, time, changes } = event;
  console.log(`[Webhook:Instagram] Event for account ${id} at ${time}`);

  if (changes) {
    for (const change of changes) {
      switch (change.field) {
        case 'comments':
          console.log(`[Webhook:Instagram] New comment: ${JSON.stringify(change.value)}`);
          // TODO: Handle new comments
          break;
        case 'mentions':
          console.log(`[Webhook:Instagram] New mention: ${JSON.stringify(change.value)}`);
          // TODO: Handle mentions
          break;
        case 'messages':
          console.log(`[Webhook:Instagram] New DM: ${JSON.stringify(change.value)}`);
          // TODO: Handle Instagram DMs
          break;
        default:
          console.log(`[Webhook:Instagram] Unhandled field: ${change.field}`);
      }
    }
  }
}

async function handleAdAccountEvent(event) {
  const { id, time, changes } = event;
  console.log(`[Webhook:Ads] Event for ad account ${id} at ${time}`);

  if (changes) {
    for (const change of changes) {
      console.log(`[Webhook:Ads] Change: ${change.field} = ${JSON.stringify(change.value)}`);
      // TODO: Handle ad status changes, budget alerts, etc.
    }
  }
}
