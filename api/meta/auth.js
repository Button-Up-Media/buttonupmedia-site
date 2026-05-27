/**
 * Vercel Serverless Function: /api/meta/auth
 * Handles Meta OAuth flow and token management
 *
 * GET  /api/meta/auth?action=login_url     - Get OAuth login URL
 * GET  /api/meta/auth?action=callback      - OAuth callback (exchange code for token)
 * GET  /api/meta/auth?action=debug         - Debug/validate an access token
 * POST /api/meta/auth?action=exchange      - Exchange short-lived for long-lived token
 * POST /api/meta/auth?action=refresh       - Refresh a system user token
 * POST /api/meta/auth?action=page_token    - Get Page access token from user token
 */

const { MetaApiClient } = require('../../meta-lib/client');
const { META_CONFIG, REQUIRED_PERMISSIONS } = require('../../meta-lib/config');
const { withErrorHandling, validateRequired } = require('../../meta-lib/middleware');

module.exports = withErrorHandling(async (req, res) => {
  const { action } = req.query || {};
  const client = new MetaApiClient();

  switch (req.method) {
    case 'GET': {
      switch (action) {
        // Generate OAuth login URL for user authorization
        case 'login_url': {
          const redirectUri = req.query.redirect_uri || `${req.headers.origin || 'https://localhost:3000'}/api/meta/auth?action=callback`;
          const scope = req.query.scope || getAllPermissions();

          const loginUrl = new URL('https://www.facebook.com/v25.0/dialog/oauth');
          loginUrl.searchParams.set('client_id', META_CONFIG.appId);
          loginUrl.searchParams.set('redirect_uri', redirectUri);
          loginUrl.searchParams.set('scope', scope);
          loginUrl.searchParams.set('response_type', 'code');
          loginUrl.searchParams.set('state', generateState());

          return res.status(200).json({
            login_url: loginUrl.toString(),
            redirect_uri: redirectUri,
            requested_permissions: scope.split(','),
          });
        }

        // OAuth callback - exchange code for access token
        case 'callback': {
          const { code, state, error, error_description } = req.query;

          if (error) {
            return res.status(400).json({
              error: 'OAuth Error',
              message: error_description || error,
            });
          }

          if (!code) {
            return res.status(400).json({ error: 'Missing authorization code' });
          }

          const redirectUri = `${req.headers.origin || req.headers.referer?.replace(/\?.*$/, '') || 'https://localhost:3000'}/api/meta/auth?action=callback`;

          // Exchange code for access token
          const tokenUrl = new URL(`${META_CONFIG.graphUrl}/oauth/access_token`);
          tokenUrl.searchParams.set('client_id', META_CONFIG.appId);
          tokenUrl.searchParams.set('client_secret', META_CONFIG.appSecret);
          tokenUrl.searchParams.set('redirect_uri', redirectUri);
          tokenUrl.searchParams.set('code', code);

          const tokenResponse = await fetch(tokenUrl.toString());
          const tokenData = await tokenResponse.json();

          if (tokenData.error) {
            return res.status(400).json(tokenData);
          }

          return res.status(200).json({
            access_token: tokenData.access_token,
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in,
            message: 'Exchange this for a long-lived token using POST /api/meta/auth?action=exchange',
          });
        }

        // Debug/validate a token
        case 'debug': {
          const tokenToDebug = req.query.token;
          if (!tokenToDebug) {
            return res.status(400).json({ error: 'token query parameter required' });
          }
          const debugInfo = await client.debugToken(tokenToDebug);
          return res.status(200).json(debugInfo);
        }

        // Get app access token
        case 'app_token': {
          const appToken = await client.getAppAccessToken();
          return res.status(200).json(appToken);
        }

        // Health check / status
        case 'status': {
          return res.status(200).json({
            app_id: META_CONFIG.appId,
            api_version: META_CONFIG.apiVersion,
            configured: {
              app_secret: !!META_CONFIG.appSecret,
              system_user_token: !!META_CONFIG.systemUserAccessToken,
              page_access_token: !!META_CONFIG.pageAccessToken,
              business_id: !!META_CONFIG.businessId,
              ad_account_id: !!META_CONFIG.adAccountId,
              page_id: !!META_CONFIG.pageId,
              instagram_account_id: !!META_CONFIG.instagramAccountId,
            },
            required_permissions: REQUIRED_PERMISSIONS,
          });
        }

        default:
          return res.status(400).json({
            error: 'Invalid action',
            available_actions: ['login_url', 'callback', 'debug', 'app_token', 'status'],
          });
      }
    }

    case 'POST': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      switch (action) {
        // Exchange short-lived token for long-lived token (60 days)
        case 'exchange': {
          validateRequired(body, ['access_token']);
          const longLived = await client.exchangeToken(body.access_token);
          return res.status(200).json({
            ...longLived,
            message: 'Long-lived token generated (valid for ~60 days)',
          });
        }

        // Refresh a system user token
        case 'refresh': {
          validateRequired(body, ['access_token']);
          const refreshed = await client.refreshSystemUserToken(body.access_token);
          return res.status(200).json({
            ...refreshed,
            message: 'Token refreshed (valid for 60 days)',
          });
        }

        // Get Page access token from a user token
        case 'page_token': {
          validateRequired(body, ['user_access_token']);
          const pageClient = new MetaApiClient(body.user_access_token);
          const pageId = body.page_id || META_CONFIG.pageId;

          if (!pageId) {
            return res.status(400).json({ error: 'page_id is required' });
          }

          const pageData = await pageClient.get(`/${pageId}`, {
            fields: ['access_token', 'name', 'id'],
          });

          return res.status(200).json({
            page_id: pageData.id,
            page_name: pageData.name,
            page_access_token: pageData.access_token,
            message: 'Store this page access token in your environment variables as META_PAGE_ACCESS_TOKEN',
          });
        }

        default:
          return res.status(400).json({
            error: 'Invalid action',
            available_actions: ['exchange', 'refresh', 'page_token'],
          });
      }
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getAllPermissions() {
  return Object.values(REQUIRED_PERMISSIONS).flat().join(',');
}

function generateState() {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}
