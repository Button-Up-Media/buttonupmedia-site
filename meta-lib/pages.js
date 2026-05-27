/**
 * Meta Pages API Service
 * Handles all Facebook Page management operations
 */

const { MetaApiClient } = require('./client');
const { META_CONFIG, ENDPOINTS } = require('./config');

class PagesService {
  constructor(pageAccessToken = null) {
    this.client = new MetaApiClient(pageAccessToken || META_CONFIG.pageAccessToken);
    this.pageId = META_CONFIG.pageId;
  }

  // ─── PAGE INFO ──────────────────────────────────────────────────────────────

  /**
   * Get Page information and metadata
   */
  async getPageInfo(pageId = null, fields = null) {
    const id = pageId || this.pageId;
    const defaultFields = [
      'id', 'name', 'about', 'category', 'fan_count',
      'followers_count', 'link', 'picture', 'cover',
      'description', 'website', 'phone', 'hours',
      'location', 'single_line_address', 'verification_status',
    ];
    return this.client.get(
      ENDPOINTS.pages.getInfo(id),
      { fields: fields || defaultFields }
    );
  }

  // ─── POSTS ──────────────────────────────────────────────────────────────────

  /**
   * Create a new post on the Page
   * @param {Object} postData - Post content
   * @param {string} postData.message - Post text content
   * @param {string} [postData.link] - URL to share
   * @param {string} [postData.picture] - Image URL (for link posts)
   * @param {boolean} [postData.published] - Whether to publish immediately (default: true)
   * @param {string} [postData.scheduled_publish_time] - Unix timestamp for scheduling
   */
  async createPost(postData, pageId = null) {
    const id = pageId || this.pageId;
    return this.client.post(ENDPOINTS.pages.createPost(id), postData);
  }

  /**
   * Create a scheduled post
   */
  async schedulePost(message, publishTime, options = {}) {
    return this.createPost({
      message,
      published: false,
      scheduled_publish_time: Math.floor(new Date(publishTime).getTime() / 1000),
      ...options,
    });
  }

  /**
   * Get published posts from the Page
   */
  async getPosts(pageId = null, limit = 25, fields = null) {
    const id = pageId || this.pageId;
    const defaultFields = [
      'id', 'message', 'created_time', 'type', 'permalink_url',
      'shares', 'likes.summary(true)', 'comments.summary(true)',
      'attachments', 'is_published',
    ];
    return this.client.get(ENDPOINTS.pages.getPublishedPosts(id), {
      fields: fields || defaultFields,
      limit,
    });
  }

  /**
   * Update an existing post
   */
  async updatePost(postId, updates) {
    return this.client.post(`/${postId}`, updates);
  }

  /**
   * Delete a post
   */
  async deletePost(postId) {
    return this.client.delete(`/${postId}`);
  }

  // ─── PHOTOS & VIDEOS ───────────────────────────────────────────────────────

  /**
   * Upload a photo to the Page
   */
  async uploadPhoto(photoData, pageId = null) {
    const id = pageId || this.pageId;
    return this.client.post(ENDPOINTS.pages.getPhotos(id), photoData);
  }

  /**
   * Upload a video to the Page
   */
  async uploadVideo(videoData, pageId = null) {
    const id = pageId || this.pageId;
    return this.client.post(ENDPOINTS.pages.getVideos(id), videoData);
  }

  // ─── ENGAGEMENT ─────────────────────────────────────────────────────────────

  /**
   * Get comments on a post
   */
  async getComments(postId, limit = 50) {
    return this.client.get(`/${postId}/comments`, {
      fields: ['id', 'message', 'from', 'created_time', 'like_count'],
      limit,
    });
  }

  /**
   * Reply to a comment
   */
  async replyToComment(commentId, message) {
    return this.client.post(`/${commentId}/comments`, { message });
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId) {
    return this.client.delete(`/${commentId}`);
  }

  // ─── INSIGHTS ───────────────────────────────────────────────────────────────

  /**
   * Get Page insights/analytics
   * @param {Array} metrics - Metrics to retrieve
   * @param {string} period - 'day', 'week', 'days_28', 'month', 'lifetime'
   */
  async getInsights(metrics = null, period = 'day', pageId = null) {
    const id = pageId || this.pageId;
    const defaultMetrics = [
      'page_impressions',
      'page_impressions_unique',
      'page_engaged_users',
      'page_post_engagements',
      'page_fans',
      'page_fan_adds',
      'page_views_total',
      'page_actions_post_reactions_total',
    ];
    return this.client.get(ENDPOINTS.pages.getInsights(id), {
      metric: metrics || defaultMetrics,
      period,
    });
  }

  // ─── SETTINGS ───────────────────────────────────────────────────────────────

  /**
   * Get Page settings
   */
  async getSettings(pageId = null) {
    const id = pageId || this.pageId;
    return this.client.get(ENDPOINTS.pages.getSettings(id));
  }

  /**
   * Update Page settings
   */
  async updateSettings(settings, pageId = null) {
    const id = pageId || this.pageId;
    return this.client.post(ENDPOINTS.pages.updateSettings(id), settings);
  }
}

module.exports = { PagesService };
