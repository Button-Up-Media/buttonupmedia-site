/**
 * Meta Graph API Client
 * Core HTTP client for all Meta API interactions
 */

const crypto = require('crypto');
const { META_CONFIG, ENDPOINTS } = require('./config');

class MetaApiClient {
  constructor(accessToken = null) {
    this.accessToken = accessToken || META_CONFIG.systemUserAccessToken;
    this.baseUrl = META_CONFIG.graphUrl;
  }

  /**
   * Generate appsecret_proof for secure API calls
   * HMAC-SHA256 hash of access token using app secret as key
   */
  generateAppSecretProof(token = null) {
    const tokenToSign = token || this.accessToken;
    if (!tokenToSign || !META_CONFIG.appSecret) {
      return null;
    }
    return crypto
      .createHmac('sha256', META_CONFIG.appSecret)
      .update(tokenToSign)
      .digest('hex');
  }

  /**
   * Build full URL with base and endpoint
   */
  buildUrl(endpoint, useInstagramBase = false) {
    const base = useInstagramBase ? META_CONFIG.instagramUrl : this.baseUrl;
    return `${base}${endpoint}`;
  }

  /**
   * Make authenticated GET request to Graph API
   */
  async get(endpoint, params = {}, options = {}) {
    const url = new URL(this.buildUrl(endpoint, options.useInstagramBase));

    // Add access token and appsecret_proof
    url.searchParams.set('access_token', this.accessToken);
    const proof = this.generateAppSecretProof();
    if (proof) {
      url.searchParams.set('appsecret_proof', proof);
    }

    // Add additional params
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, Array.isArray(value) ? value.join(',') : value);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return this.handleResponse(response);
  }

  /**
   * Make authenticated POST request to Graph API
   */
  async post(endpoint, body = {}, options = {}) {
    const url = new URL(this.buildUrl(endpoint, options.useInstagramBase));

    // Add access token and appsecret_proof to body
    const requestBody = {
      ...body,
      access_token: this.accessToken,
    };

    const proof = this.generateAppSecretProof();
    if (proof) {
      requestBody.appsecret_proof = proof;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    return this.handleResponse(response);
  }

  /**
   * Make authenticated DELETE request to Graph API
   */
  async delete(endpoint, params = {}) {
    const url = new URL(this.buildUrl(endpoint));

    url.searchParams.set('access_token', this.accessToken);
    const proof = this.generateAppSecretProof();
    if (proof) {
      url.searchParams.set('appsecret_proof', proof);
    }

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return this.handleResponse(response);
  }

  /**
   * Handle API response and errors
   */
  async handleResponse(response) {
    const data = await response.json();

    if (!response.ok || data.error) {
      const error = data.error || {};
      throw new MetaApiError({
        message: error.message || 'Unknown Meta API error',
        type: error.type || 'UnknownError',
        code: error.code || response.status,
        subcode: error.error_subcode,
        fbTraceId: error.fbtrace_id,
      });
    }

    return data;
  }

  /**
   * Debug an access token to check its validity and permissions
   */
  async debugToken(tokenToDebug = null) {
    const token = tokenToDebug || this.accessToken;
    const appToken = `${META_CONFIG.appId}|${META_CONFIG.appSecret}`;

    const url = new URL(`${this.baseUrl}/debug_token`);
    url.searchParams.set('input_token', token);
    url.searchParams.set('access_token', appToken);

    const response = await fetch(url.toString());
    return this.handleResponse(response);
  }

  /**
   * Get an app access token (for server-to-server calls)
   */
  async getAppAccessToken() {
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set('client_id', META_CONFIG.appId);
    url.searchParams.set('client_secret', META_CONFIG.appSecret);
    url.searchParams.set('grant_type', 'client_credentials');

    const response = await fetch(url.toString());
    return this.handleResponse(response);
  }

  /**
   * Exchange short-lived token for long-lived token
   */
  async exchangeToken(shortLivedToken) {
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', META_CONFIG.appId);
    url.searchParams.set('client_secret', META_CONFIG.appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    const response = await fetch(url.toString());
    return this.handleResponse(response);
  }

  /**
   * Refresh an expiring system user token
   */
  async refreshSystemUserToken(currentToken) {
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', META_CONFIG.appId);
    url.searchParams.set('client_secret', META_CONFIG.appSecret);
    url.searchParams.set('set_token_expires_in_60_days', 'true');
    url.searchParams.set('fb_exchange_token', currentToken);

    const response = await fetch(url.toString());
    return this.handleResponse(response);
  }
}

/**
 * Custom error class for Meta API errors
 */
class MetaApiError extends Error {
  constructor({ message, type, code, subcode, fbTraceId }) {
    super(message);
    this.name = 'MetaApiError';
    this.type = type;
    this.code = code;
    this.subcode = subcode;
    this.fbTraceId = fbTraceId;
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      type: this.type,
      code: this.code,
      subcode: this.subcode,
      fbTraceId: this.fbTraceId,
    };
  }
}

module.exports = { MetaApiClient, MetaApiError };
