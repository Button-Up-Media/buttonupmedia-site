/**
 * Meta Marketing/Ads API Service
 * Handles campaign creation, ad set management, creative building, and optimization
 */

const { MetaApiClient } = require('./client');
const { META_CONFIG, ENDPOINTS } = require('./config');

class AdsService {
  constructor(accessToken = null) {
    this.client = new MetaApiClient(accessToken || META_CONFIG.systemUserAccessToken);
    this.adAccountId = META_CONFIG.adAccountId;
  }

  // ─── CAMPAIGNS ──────────────────────────────────────────────────────────────

  /**
   * Create a new ad campaign
   * @param {Object} campaignData
   * @param {string} campaignData.name - Campaign name
   * @param {string} campaignData.objective - Campaign objective
   *   Options: AWARENESS, TRAFFIC, ENGAGEMENT, LEADS, APP_PROMOTION, SALES
   * @param {string} [campaignData.status] - ACTIVE, PAUSED (default: PAUSED)
   * @param {Object} [campaignData.special_ad_categories] - Array of special categories
   * @param {Object} [campaignData.daily_budget] - Daily budget in cents
   * @param {Object} [campaignData.lifetime_budget] - Lifetime budget in cents
   */
  async createCampaign(campaignData) {
    const payload = {
      name: campaignData.name,
      objective: campaignData.objective,
      status: campaignData.status || 'PAUSED',
      special_ad_categories: campaignData.special_ad_categories || [],
      ...campaignData,
    };
    return this.client.post(ENDPOINTS.ads.createCampaign(this.adAccountId), payload);
  }

  /**
   * Get all campaigns for the ad account
   */
  async getCampaigns(fields = null, limit = 50) {
    const defaultFields = [
      'id', 'name', 'objective', 'status', 'daily_budget',
      'lifetime_budget', 'start_time', 'stop_time', 'created_time',
      'updated_time', 'buying_type', 'bid_strategy',
    ];
    return this.client.get(ENDPOINTS.ads.getCampaigns(this.adAccountId), {
      fields: fields || defaultFields,
      limit,
    });
  }

  /**
   * Get a specific campaign
   */
  async getCampaign(campaignId, fields = null) {
    const defaultFields = [
      'id', 'name', 'objective', 'status', 'daily_budget',
      'lifetime_budget', 'start_time', 'stop_time',
      'budget_remaining', 'spend_cap',
    ];
    return this.client.get(ENDPOINTS.ads.getCampaign(campaignId), {
      fields: fields || defaultFields,
    });
  }

  /**
   * Update a campaign
   */
  async updateCampaign(campaignId, updates) {
    return this.client.post(ENDPOINTS.ads.updateCampaign(campaignId), updates);
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId) {
    return this.updateCampaign(campaignId, { status: 'PAUSED' });
  }

  /**
   * Activate a campaign
   */
  async activateCampaign(campaignId) {
    return this.updateCampaign(campaignId, { status: 'ACTIVE' });
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(campaignId) {
    return this.client.delete(ENDPOINTS.ads.deleteCampaign(campaignId));
  }

  // ─── AD SETS ────────────────────────────────────────────────────────────────

  /**
   * Create an ad set within a campaign
   * @param {Object} adSetData
   * @param {string} adSetData.name - Ad set name
   * @param {string} adSetData.campaign_id - Parent campaign ID
   * @param {number} adSetData.daily_budget - Daily budget in cents (e.g., 5000 = $50)
   * @param {string} adSetData.billing_event - IMPRESSIONS, LINK_CLICKS, etc.
   * @param {string} adSetData.optimization_goal - REACH, LINK_CLICKS, IMPRESSIONS, etc.
   * @param {Object} adSetData.targeting - Targeting specification
   * @param {string} adSetData.start_time - ISO 8601 start time
   * @param {string} [adSetData.end_time] - ISO 8601 end time
   * @param {string} [adSetData.status] - ACTIVE or PAUSED
   */
  async createAdSet(adSetData) {
    const payload = {
      status: 'PAUSED',
      ...adSetData,
    };
    return this.client.post(ENDPOINTS.ads.createAdSet(this.adAccountId), payload);
  }

  /**
   * Get all ad sets for the account
   */
  async getAdSets(fields = null, limit = 50, campaignId = null) {
    const defaultFields = [
      'id', 'name', 'campaign_id', 'status', 'daily_budget',
      'lifetime_budget', 'start_time', 'end_time', 'targeting',
      'optimization_goal', 'billing_event', 'bid_amount',
    ];
    const params = {
      fields: fields || defaultFields,
      limit,
    };
    if (campaignId) {
      params.filtering = JSON.stringify([{
        field: 'campaign.id',
        operator: 'EQUAL',
        value: campaignId,
      }]);
    }
    return this.client.get(ENDPOINTS.ads.getAdSets(this.adAccountId), params);
  }

  /**
   * Update an ad set
   */
  async updateAdSet(adSetId, updates) {
    return this.client.post(ENDPOINTS.ads.updateAdSet(adSetId), updates);
  }

  /**
   * Delete an ad set
   */
  async deleteAdSet(adSetId) {
    return this.client.delete(ENDPOINTS.ads.deleteAdSet(adSetId));
  }

  // ─── AD CREATIVES ───────────────────────────────────────────────────────────

  /**
   * Create an ad creative
   * @param {Object} creativeData
   * @param {string} creativeData.name - Creative name
   * @param {Object} creativeData.object_story_spec - The story spec for the ad
   */
  async createAdCreative(creativeData) {
    return this.client.post(ENDPOINTS.ads.createAdCreative(this.adAccountId), creativeData);
  }

  /**
   * Create a link ad creative (most common for traffic/conversions)
   */
  async createLinkAdCreative({ name, pageId, imageHash, message, link, headline, description, callToAction }) {
    const creative = {
      name,
      object_story_spec: {
        page_id: pageId || META_CONFIG.pageId,
        link_data: {
          image_hash: imageHash,
          link,
          message,
          name: headline,
          description,
          call_to_action: callToAction ? {
            type: callToAction,
            value: { link },
          } : undefined,
        },
      },
    };
    return this.createAdCreative(creative);
  }

  /**
   * Create a video ad creative
   */
  async createVideoAdCreative({ name, pageId, videoId, message, title, description, thumbnailUrl, callToAction, link }) {
    const creative = {
      name,
      object_story_spec: {
        page_id: pageId || META_CONFIG.pageId,
        video_data: {
          video_id: videoId,
          message,
          title,
          description,
          image_url: thumbnailUrl,
          call_to_action: callToAction ? {
            type: callToAction,
            value: { link },
          } : undefined,
        },
      },
    };
    return this.createAdCreative(creative);
  }

  /**
   * Create a carousel ad creative
   */
  async createCarouselAdCreative({ name, pageId, cards, message, link }) {
    const creative = {
      name,
      object_story_spec: {
        page_id: pageId || META_CONFIG.pageId,
        link_data: {
          message,
          link,
          child_attachments: cards.map(card => ({
            link: card.link || link,
            image_hash: card.imageHash,
            name: card.headline,
            description: card.description,
            call_to_action: card.callToAction ? {
              type: card.callToAction,
              value: { link: card.link || link },
            } : undefined,
          })),
        },
      },
    };
    return this.createAdCreative(creative);
  }

  /**
   * Get ad creatives
   */
  async getAdCreatives(fields = null, limit = 50) {
    const defaultFields = [
      'id', 'name', 'title', 'body', 'object_story_spec',
      'thumbnail_url', 'status', 'effective_object_story_id',
    ];
    return this.client.get(ENDPOINTS.ads.getAdCreatives(this.adAccountId), {
      fields: fields || defaultFields,
      limit,
    });
  }

  // ─── ADS ────────────────────────────────────────────────────────────────────

  /**
   * Create an ad (combines ad set + creative)
   * @param {Object} adData
   * @param {string} adData.name - Ad name
   * @param {string} adData.adset_id - Ad set to place the ad in
   * @param {string} adData.creative - Creative object {creative_id: "..."}
   * @param {string} [adData.status] - ACTIVE or PAUSED
   */
  async createAd(adData) {
    const payload = {
      status: 'PAUSED',
      ...adData,
    };
    return this.client.post(ENDPOINTS.ads.createAd(this.adAccountId), payload);
  }

  /**
   * Get all ads
   */
  async getAds(fields = null, limit = 50) {
    const defaultFields = [
      'id', 'name', 'adset_id', 'campaign_id', 'status',
      'creative', 'created_time', 'updated_time',
      'effective_status', 'configured_status',
    ];
    return this.client.get(ENDPOINTS.ads.getAds(this.adAccountId), {
      fields: fields || defaultFields,
      limit,
    });
  }

  /**
   * Update an ad
   */
  async updateAd(adId, updates) {
    return this.client.post(ENDPOINTS.ads.updateAd(adId), updates);
  }

  /**
   * Delete an ad
   */
  async deleteAd(adId) {
    return this.client.delete(ENDPOINTS.ads.deleteAd(adId));
  }

  // ─── INSIGHTS & REPORTING ──────────────────────────────────────────────────

  /**
   * Get ad account level insights
   * @param {Object} params
   * @param {string} params.date_preset - last_7d, last_30d, this_month, etc.
   * @param {Array} params.fields - Metrics to retrieve
   */
  async getAccountInsights(params = {}) {
    const defaultFields = [
      'impressions', 'reach', 'spend', 'clicks', 'cpc',
      'cpm', 'ctr', 'actions', 'cost_per_action_type',
      'conversions', 'cost_per_conversion',
    ];
    return this.client.get(ENDPOINTS.ads.getAccountInsights(this.adAccountId), {
      fields: params.fields || defaultFields,
      date_preset: params.date_preset || 'last_7d',
      level: params.level || 'account',
      ...params,
    });
  }

  /**
   * Get campaign-level insights
   */
  async getCampaignInsights(campaignId, params = {}) {
    const defaultFields = [
      'campaign_name', 'impressions', 'reach', 'spend',
      'clicks', 'cpc', 'cpm', 'ctr', 'actions',
    ];
    return this.client.get(ENDPOINTS.ads.getCampaignInsights(campaignId), {
      fields: params.fields || defaultFields,
      date_preset: params.date_preset || 'last_7d',
      ...params,
    });
  }

  /**
   * Get ad set level insights
   */
  async getAdSetInsights(adSetId, params = {}) {
    return this.client.get(ENDPOINTS.ads.getAdSetInsights(adSetId), {
      fields: params.fields || ['impressions', 'reach', 'spend', 'clicks', 'cpc', 'ctr'],
      date_preset: params.date_preset || 'last_7d',
      ...params,
    });
  }

  // ─── TARGETING ──────────────────────────────────────────────────────────────

  /**
   * Search targeting options (interests, behaviors, demographics)
   */
  async searchTargeting(query, type = 'adinterest') {
    return this.client.get(ENDPOINTS.ads.getTargetingSearch(), {
      type,
      q: query,
    });
  }

  /**
   * Browse targeting categories
   */
  async browseTargeting(type = 'adinterest') {
    return this.client.get(ENDPOINTS.ads.getTargetingCategories(this.adAccountId), {
      type,
    });
  }

  /**
   * Get reach estimate for targeting
   */
  async getReachEstimate(targetingSpec) {
    return this.client.get(ENDPOINTS.ads.getReachEstimate(this.adAccountId), {
      targeting_spec: JSON.stringify(targetingSpec),
    });
  }

  // ─── CUSTOM AUDIENCES ──────────────────────────────────────────────────────

  /**
   * Create a custom audience
   */
  async createCustomAudience({ name, description, subtype, rule }) {
    return this.client.post(ENDPOINTS.ads.createCustomAudience(this.adAccountId), {
      name,
      description,
      subtype: subtype || 'CUSTOM',
      rule,
    });
  }

  /**
   * Get custom audiences
   */
  async getCustomAudiences(fields = null) {
    const defaultFields = ['id', 'name', 'description', 'approximate_count', 'subtype', 'time_created'];
    return this.client.get(ENDPOINTS.ads.getCustomAudiences(this.adAccountId), {
      fields: fields || defaultFields,
    });
  }

  // ─── HELPER: FULL AD CREATION WORKFLOW ─────────────────────────────────────

  /**
   * Create a complete ad from scratch (campaign → ad set → creative → ad)
   * This is the most common workflow for programmatic ad creation
   */
  async createFullAd({
    campaignName,
    objective,
    adSetName,
    dailyBudget,
    targeting,
    startTime,
    endTime,
    creativeName,
    imageHash,
    message,
    headline,
    description,
    link,
    callToAction,
    adName,
  }) {
    // Step 1: Create Campaign
    const campaign = await this.createCampaign({
      name: campaignName,
      objective,
      status: 'PAUSED',
    });

    // Step 2: Create Ad Set
    const adSet = await this.createAdSet({
      name: adSetName,
      campaign_id: campaign.id,
      daily_budget: dailyBudget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: this.getOptimizationGoal(objective),
      targeting,
      start_time: startTime,
      end_time: endTime,
      status: 'PAUSED',
    });

    // Step 3: Create Ad Creative
    const creative = await this.createLinkAdCreative({
      name: creativeName,
      imageHash,
      message,
      headline,
      description,
      link,
      callToAction,
    });

    // Step 4: Create Ad
    const ad = await this.createAd({
      name: adName,
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    });

    return {
      campaign,
      adSet,
      creative,
      ad,
    };
  }

  /**
   * Map campaign objective to optimization goal
   */
  getOptimizationGoal(objective) {
    const mapping = {
      AWARENESS: 'REACH',
      TRAFFIC: 'LINK_CLICKS',
      ENGAGEMENT: 'POST_ENGAGEMENT',
      LEADS: 'LEAD_GENERATION',
      APP_PROMOTION: 'APP_INSTALLS',
      SALES: 'OFFSITE_CONVERSIONS',
    };
    return mapping[objective] || 'IMPRESSIONS';
  }
}

module.exports = { AdsService };
