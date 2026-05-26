/**
 * Meta API - Main Export
 * Convenience module that exports all services
 */

const { META_CONFIG, REQUIRED_PERMISSIONS, ENDPOINTS } = require('./config');
const { MetaApiClient, MetaApiError } = require('./client');
const { PagesService } = require('./pages');
const { InstagramService } = require('./instagram');
const { AdsService } = require('./ads');
const { withErrorHandling, validateRequired, getAccessToken, CORS_HEADERS } = require('./middleware');

module.exports = {
  // Configuration
  META_CONFIG,
  REQUIRED_PERMISSIONS,
  ENDPOINTS,

  // Core client
  MetaApiClient,
  MetaApiError,

  // Service classes
  PagesService,
  InstagramService,
  AdsService,

  // Middleware
  withErrorHandling,
  validateRequired,
  getAccessToken,
  CORS_HEADERS,
};
