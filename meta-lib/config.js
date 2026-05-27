/**
 * Meta API Configuration
 * Centralized config for all Meta (Facebook/Instagram/Ads) API interactions
 * App: "Chef Mark" (ID: 1484237219303205)
 */

const META_CONFIG = {
  // App credentials
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,

  // API versioning
  apiVersion: process.env.META_API_VERSION || 'v25.0',

  // Base URLs
  graphApiBase: process.env.META_GRAPH_API_BASE || 'https://graph.facebook.com',
  instagramApiBase: process.env.META_INSTAGRAM_API_BASE || 'https://graph.instagram.com',
  resumableUploadBase: 'https://rupload.facebook.com',

  // Access tokens
  systemUserAccessToken: process.env.META_SYSTEM_USER_ACCESS_TOKEN,
  pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,

  // Business & Account IDs
  businessId: process.env.META_BUSINESS_ID,
  adAccountId: process.env.META_AD_ACCOUNT_ID,
  pageId: process.env.META_PAGE_ID,
  instagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID,

  // Webhook
  webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,

  // Computed URLs
  get graphUrl() {
    return `${this.graphApiBase}/${this.apiVersion}`;
  },
  get instagramUrl() {
    return `${this.instagramApiBase}/${this.apiVersion}`;
  },
};

/**
 * Required permissions for full functionality
 * These must be approved via Meta App Review
 */
const REQUIRED_PERMISSIONS = {
  pages: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_read_user_content',
    'pages_manage_posts',
    'pages_manage_engagement',
    'pages_manage_metadata',
    'pages_manage_ads',
    'pages_messaging',
  ],
  instagram: [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'instagram_manage_messages',
  ],
  ads: [
    'ads_management',
    'ads_read',
    'leads_retrieval',
  ],
  business: [
    'business_management',
    'catalog_management',
  ],
};

/**
 * API Endpoints Reference
 */
const ENDPOINTS = {
  // === PAGES ===
  pages: {
    getInfo: (pageId) => `/${pageId}`,
    getFeed: (pageId) => `/${pageId}/feed`,
    createPost: (pageId) => `/${pageId}/feed`,
    getPublishedPosts: (pageId) => `/${pageId}/published_posts`,
    getInsights: (pageId) => `/${pageId}/insights`,
    getSettings: (pageId) => `/${pageId}/settings`,
    updateSettings: (pageId) => `/${pageId}/settings`,
    getPhotos: (pageId) => `/${pageId}/photos`,
    getVideos: (pageId) => `/${pageId}/videos`,
    getEvents: (pageId) => `/${pageId}/events`,
  },

  // === INSTAGRAM ===
  instagram: {
    getProfile: (igId) => `/${igId}`,
    getMedia: (igId) => `/${igId}/media`,
    createMediaContainer: (igId) => `/${igId}/media`,
    publishMedia: (igId) => `/${igId}/media_publish`,
    getInsights: (igId) => `/${igId}/insights`,
    getStories: (igId) => `/${igId}/stories`,
    getContentPublishingLimit: (igId) => `/${igId}/content_publishing_limit`,
    getComments: (mediaId) => `/${mediaId}/comments`,
    replyToComment: (commentId) => `/${commentId}/replies`,
    getContainerStatus: (containerId) => `/${containerId}`,
  },

  // === ADS / MARKETING ===
  ads: {
    // Campaign management
    getCampaigns: (adAccountId) => `/${adAccountId}/campaigns`,
    createCampaign: (adAccountId) => `/${adAccountId}/campaigns`,
    getCampaign: (campaignId) => `/${campaignId}`,
    updateCampaign: (campaignId) => `/${campaignId}`,
    deleteCampaign: (campaignId) => `/${campaignId}`,

    // Ad Set management
    getAdSets: (adAccountId) => `/${adAccountId}/adsets`,
    createAdSet: (adAccountId) => `/${adAccountId}/adsets`,
    getAdSet: (adSetId) => `/${adSetId}`,
    updateAdSet: (adSetId) => `/${adSetId}`,
    deleteAdSet: (adSetId) => `/${adSetId}`,

    // Ad Creative management
    getAdCreatives: (adAccountId) => `/${adAccountId}/adcreatives`,
    createAdCreative: (adAccountId) => `/${adAccountId}/adcreatives`,
    getAdCreative: (creativeId) => `/${creativeId}`,
    updateAdCreative: (creativeId) => `/${creativeId}`,

    // Ad management
    getAds: (adAccountId) => `/${adAccountId}/ads`,
    createAd: (adAccountId) => `/${adAccountId}/ads`,
    getAd: (adId) => `/${adId}`,
    updateAd: (adId) => `/${adId}`,
    deleteAd: (adId) => `/${adId}`,

    // Insights & Reporting
    getAccountInsights: (adAccountId) => `/${adAccountId}/insights`,
    getCampaignInsights: (campaignId) => `/${campaignId}/insights`,
    getAdSetInsights: (adSetId) => `/${adSetId}/insights`,
    getAdInsights: (adId) => `/${adId}/insights`,

    // Targeting
    getTargetingSearch: () => '/search',
    getTargetingCategories: (adAccountId) => `/${adAccountId}/targetingbrowse`,
    getReachEstimate: (adAccountId) => `/${adAccountId}/reachestimate`,

    // Custom Audiences
    getCustomAudiences: (adAccountId) => `/${adAccountId}/customaudiences`,
    createCustomAudience: (adAccountId) => `/${adAccountId}/customaudiences`,
  },

  // === BUSINESS ===
  business: {
    getInfo: (businessId) => `/${businessId}`,
    getPages: (businessId) => `/${businessId}/owned_pages`,
    getAdAccounts: (businessId) => `/${businessId}/owned_ad_accounts`,
    getInstagramAccounts: (businessId) => `/${businessId}/instagram_accounts`,
    getSystemUsers: (businessId) => `/${businessId}/system_users`,
  },

  // === AUTH ===
  auth: {
    oauthAccessToken: '/oauth/access_token',
    debugToken: '/debug_token',
  },
};

module.exports = { META_CONFIG, REQUIRED_PERMISSIONS, ENDPOINTS };
