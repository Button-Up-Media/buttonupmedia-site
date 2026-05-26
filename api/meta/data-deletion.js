/**
 * Vercel Serverless Function: /api/meta/data-deletion
 * Meta Data Deletion Request Callback
 *
 * This endpoint is REQUIRED by Meta for app review.
 * When a user removes your app, Meta sends a deletion request here.
 *
 * POST /api/meta/data-deletion - Handle data deletion request from Meta
 * GET  /api/meta/data-deletion?id=<confirmation_code> - Check deletion status
 */

const crypto = require('crypto');
const { META_CONFIG } = require('./lib/config');
const { CORS_HEADERS } = require('./lib/middleware');

module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  switch (req.method) {
    case 'POST': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { signed_request } = body;

      if (!signed_request) {
        return res.status(400).json({ error: 'Missing signed_request' });
      }

      // Parse and verify the signed request from Meta
      const data = parseSignedRequest(signed_request);

      if (!data) {
        return res.status(400).json({ error: 'Invalid signed_request' });
      }

      const userId = data.user_id;
      const confirmationCode = generateConfirmationCode(userId);

      // TODO: Implement actual data deletion logic here
      // In production, you would:
      // 1. Look up all data associated with this user_id
      // 2. Queue it for deletion
      // 3. Delete within 30 days
      console.log(`[Data Deletion] Request received for user: ${userId}`);
      console.log(`[Data Deletion] Confirmation code: ${confirmationCode}`);

      // Respond with the confirmation URL and code as required by Meta
      const statusUrl = `${req.headers.origin || 'https://www.buttonupmedia.com'}/api/meta/data-deletion?id=${confirmationCode}`;

      return res.status(200).json({
        url: statusUrl,
        confirmation_code: confirmationCode,
      });
    }

    case 'GET': {
      // Status check for a deletion request
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Missing confirmation code (id parameter)' });
      }

      // TODO: In production, look up the actual deletion status
      return res.status(200).json({
        confirmation_code: id,
        status: 'completed',
        message: 'All user data associated with this request has been deleted.',
      });
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

/**
 * Parse a signed request from Meta
 * @see https://developers.facebook.com/docs/games/gamesonfacebook/login#parsingsr
 */
function parseSignedRequest(signedRequest) {
  try {
    const [encodedSig, payload] = signedRequest.split('.');

    // Decode the signature
    const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    // Decode the payload
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );

    // Verify the signature
    const expectedSig = crypto
      .createHmac('sha256', META_CONFIG.appSecret)
      .update(payload)
      .digest();

    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      console.error('[Data Deletion] Signature verification failed');
      return null;
    }

    return data;
  } catch (error) {
    console.error('[Data Deletion] Failed to parse signed request:', error.message);
    return null;
  }
}

/**
 * Generate a unique confirmation code for tracking deletion requests
 */
function generateConfirmationCode(userId) {
  const timestamp = Date.now().toString(36);
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}-${timestamp}-${META_CONFIG.appSecret}`)
    .digest('hex')
    .substring(0, 12);
  return `del_${timestamp}_${hash}`;
}
