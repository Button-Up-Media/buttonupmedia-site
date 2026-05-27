/**
 * Shared middleware for Meta API serverless functions
 * Handles CORS, error handling, and request validation
 */

const { MetaApiError } = require('./client');
const { META_CONFIG } = require('./config');

/**
 * CORS headers for API responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Meta-Token',
  'Content-Type': 'application/json',
};

/**
 * Wrap a handler with error handling and CORS
 */
function withErrorHandling(handler) {
  return async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    // Set CORS headers
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    try {
      // Validate config
      if (!META_CONFIG.appId || !META_CONFIG.appSecret) {
        return res.status(500).json({
          error: 'Configuration Error',
          message: 'META_APP_ID and META_APP_SECRET must be configured',
        });
      }

      await handler(req, res);
    } catch (error) {
      console.error('[Meta API Error]', error);

      if (error instanceof MetaApiError) {
        return res.status(error.code >= 100 ? 400 : 500).json(error.toJSON());
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'An unexpected error occurred',
      });
    }
  };
}

/**
 * Validate required fields in request body
 */
function validateRequired(body, requiredFields) {
  const missing = requiredFields.filter(field => !body[field]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Extract access token from request headers or query
 */
function getAccessToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check custom header
  if (req.headers['x-meta-token']) {
    return req.headers['x-meta-token'];
  }

  // Check query parameter
  if (req.query && req.query.access_token) {
    return req.query.access_token;
  }

  return null;
}

module.exports = {
  CORS_HEADERS,
  withErrorHandling,
  validateRequired,
  getAccessToken,
};
