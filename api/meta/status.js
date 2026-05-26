/**
 * Vercel Serverless Function: /api/meta/status
 * Health check and configuration status endpoint
 *
 * GET /api/meta/status - Returns current configuration status
 */

const { META_CONFIG, REQUIRED_PERMISSIONS } = require('./lib/config');
const { MetaApiClient } = require('./lib/client');
const { withErrorHandling } = require('./lib/middleware');

module.exports = withErrorHandling(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const status = {
    app: {
      name: 'Chef Mark',
      id: META_CONFIG.appId,
      api_version: META_CONFIG.apiVersion,
      graph_url: META_CONFIG.graphUrl,
    },
    configuration: {
      app_id: !!META_CONFIG.appId,
      app_secret: !!META_CONFIG.appSecret,
      system_user_token: !!META_CONFIG.systemUserAccessToken,
      page_access_token: !!META_CONFIG.pageAccessToken,
      business_id: !!META_CONFIG.businessId,
      ad_account_id: !!META_CONFIG.adAccountId,
      page_id: !!META_CONFIG.pageId,
      instagram_account_id: !!META_CONFIG.instagramAccountId,
      webhook_verify_token: !!META_CONFIG.webhookVerifyToken,
    },
    endpoints: {
      auth: '/api/meta/auth',
      pages: '/api/meta/pages',
      instagram: '/api/meta/instagram',
      ads: '/api/meta/ads',
      webhook: '/api/meta/webhook',
      status: '/api/meta/status',
    },
    required_permissions: REQUIRED_PERMISSIONS,
  };

  // Optionally test app token if credentials are available
  if (META_CONFIG.appId && META_CONFIG.appSecret) {
    try {
      const client = new MetaApiClient();
      const appToken = await client.getAppAccessToken();
      status.app_token_valid = true;
    } catch (error) {
      status.app_token_valid = false;
      status.app_token_error = error.message;
    }
  }

  return res.status(200).json(status);
});
