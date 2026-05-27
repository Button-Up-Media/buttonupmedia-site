/**
 * Meta Instagram API Service
 * Handles all Instagram Business account operations via Graph API
 */

const { MetaApiClient } = require('./client');
const { META_CONFIG, ENDPOINTS } = require('./config');

class InstagramService {
  constructor(accessToken = null) {
    this.client = new MetaApiClient(accessToken || META_CONFIG.pageAccessToken);
    this.igAccountId = META_CONFIG.instagramAccountId;
  }

  // ─── PROFILE ────────────────────────────────────────────────────────────────

  /**
   * Get Instagram Business account profile info
   */
  async getProfile(igId = null, fields = null) {
    const id = igId || this.igAccountId;
    const defaultFields = [
      'id', 'name', 'username', 'biography', 'followers_count',
      'follows_count', 'media_count', 'profile_picture_url', 'website',
    ];
    return this.client.get(
      ENDPOINTS.instagram.getProfile(id),
      { fields: fields || defaultFields }
    );
  }

  // ─── CONTENT PUBLISHING ─────────────────────────────────────────────────────

  /**
   * Step 1: Create a media container for a single image post
   * @param {string} imageUrl - Publicly accessible image URL (JPEG only)
   * @param {string} [caption] - Post caption
   */
  async createImageContainer(imageUrl, caption = '', options = {}) {
    const id = options.igId || this.igAccountId;
    return this.client.post(ENDPOINTS.instagram.createMediaContainer(id), {
      image_url: imageUrl,
      caption,
      media_type: 'IMAGE',
      ...options.extra,
    });
  }

  /**
   * Step 1: Create a media container for a video/reel
   * @param {string} videoUrl - Publicly accessible video URL
   * @param {string} mediaType - 'VIDEO' or 'REELS'
   * @param {string} [caption] - Post caption
   */
  async createVideoContainer(videoUrl, mediaType = 'REELS', caption = '', options = {}) {
    const id = options.igId || this.igAccountId;
    return this.client.post(ENDPOINTS.instagram.createMediaContainer(id), {
      video_url: videoUrl,
      media_type: mediaType,
      caption,
      ...options.extra,
    });
  }

  /**
   * Step 1: Create a media container for a Story
   * @param {string} mediaUrl - Image or video URL
   * @param {boolean} isVideo - Whether the media is a video
   */
  async createStoryContainer(mediaUrl, isVideo = false, options = {}) {
    const id = options.igId || this.igAccountId;
    const body = {
      media_type: 'STORIES',
      ...(isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }),
      ...options.extra,
    };
    return this.client.post(ENDPOINTS.instagram.createMediaContainer(id), body);
  }

  /**
   * Step 1: Create carousel item containers (call for each item)
   */
  async createCarouselItemContainer(mediaUrl, isVideo = false, options = {}) {
    const id = options.igId || this.igAccountId;
    const body = {
      is_carousel_item: true,
      ...(isVideo
        ? { video_url: mediaUrl, media_type: 'VIDEO' }
        : { image_url: mediaUrl, media_type: 'IMAGE' }),
      ...options.extra,
    };
    return this.client.post(ENDPOINTS.instagram.createMediaContainer(id), body);
  }

  /**
   * Step 1b: Create carousel container from item containers
   * @param {Array<string>} childContainerIds - Array of container IDs (max 10)
   * @param {string} caption - Carousel caption
   */
  async createCarouselContainer(childContainerIds, caption = '', options = {}) {
    const id = options.igId || this.igAccountId;
    return this.client.post(ENDPOINTS.instagram.createMediaContainer(id), {
      media_type: 'CAROUSEL',
      children: childContainerIds.join(','),
      caption,
      ...options.extra,
    });
  }

  /**
   * Step 2: Check container status before publishing
   * Returns: EXPIRED, ERROR, FINISHED, IN_PROGRESS, PUBLISHED
   */
  async getContainerStatus(containerId) {
    return this.client.get(
      ENDPOINTS.instagram.getContainerStatus(containerId),
      { fields: ['status_code', 'status'] }
    );
  }

  /**
   * Step 3: Publish a media container
   * @param {string} containerId - The container ID from step 1
   */
  async publishMedia(containerId, igId = null) {
    const id = igId || this.igAccountId;
    return this.client.post(ENDPOINTS.instagram.publishMedia(id), {
      creation_id: containerId,
    });
  }

  /**
   * Full publish workflow: create container, wait for processing, publish
   */
  async publishImage(imageUrl, caption = '', options = {}) {
    // Step 1: Create container
    const container = await this.createImageContainer(imageUrl, caption, options);

    // Step 2: Check status (images are usually instant)
    const status = await this.getContainerStatus(container.id);
    if (status.status_code === 'ERROR') {
      throw new Error(`Container creation failed: ${status.status}`);
    }

    // Step 3: Publish
    return this.publishMedia(container.id, options.igId);
  }

  /**
   * Full publish workflow for video/reel with polling
   */
  async publishVideo(videoUrl, mediaType = 'REELS', caption = '', options = {}) {
    // Step 1: Create container
    const container = await this.createVideoContainer(videoUrl, mediaType, caption, options);

    // Step 2: Poll for processing completion
    const maxAttempts = options.maxPollAttempts || 30;
    const pollInterval = options.pollInterval || 5000; // 5 seconds

    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getContainerStatus(container.id);

      if (status.status_code === 'FINISHED') {
        // Step 3: Publish
        return this.publishMedia(container.id, options.igId);
      }

      if (status.status_code === 'ERROR') {
        throw new Error(`Video processing failed: ${status.status}`);
      }

      if (status.status_code === 'EXPIRED') {
        throw new Error('Container expired before publishing');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Video processing timed out');
  }

  // ─── MEDIA MANAGEMENT ──────────────────────────────────────────────────────

  /**
   * Get recent media from the Instagram account
   */
  async getMedia(igId = null, limit = 25, fields = null) {
    const id = igId || this.igAccountId;
    const defaultFields = [
      'id', 'caption', 'media_type', 'media_url', 'permalink',
      'thumbnail_url', 'timestamp', 'like_count', 'comments_count',
    ];
    return this.client.get(ENDPOINTS.instagram.getMedia(id), {
      fields: fields || defaultFields,
      limit,
    });
  }

  /**
   * Get stories
   */
  async getStories(igId = null) {
    const id = igId || this.igAccountId;
    return this.client.get(ENDPOINTS.instagram.getStories(id), {
      fields: ['id', 'media_type', 'media_url', 'timestamp'],
    });
  }

  // ─── COMMENTS ───────────────────────────────────────────────────────────────

  /**
   * Get comments on a media item
   */
  async getComments(mediaId, limit = 50) {
    return this.client.get(ENDPOINTS.instagram.getComments(mediaId), {
      fields: ['id', 'text', 'username', 'timestamp', 'like_count', 'replies'],
      limit,
    });
  }

  /**
   * Reply to a comment
   */
  async replyToComment(commentId, message) {
    return this.client.post(ENDPOINTS.instagram.replyToComment(commentId), {
      message,
    });
  }

  // ─── INSIGHTS ───────────────────────────────────────────────────────────────

  /**
   * Get Instagram account insights
   * @param {Array} metrics - Metrics to retrieve
   * @param {string} period - 'day', 'week', 'days_28', 'lifetime'
   */
  async getAccountInsights(metrics = null, period = 'day', igId = null) {
    const id = igId || this.igAccountId;
    const defaultMetrics = [
      'impressions',
      'reach',
      'follower_count',
      'profile_views',
      'website_clicks',
    ];
    return this.client.get(ENDPOINTS.instagram.getInsights(id), {
      metric: metrics || defaultMetrics,
      period,
    });
  }

  /**
   * Get media-specific insights
   */
  async getMediaInsights(mediaId, metrics = null) {
    const defaultMetrics = [
      'impressions', 'reach', 'engagement',
      'saved', 'likes', 'comments', 'shares',
    ];
    return this.client.get(`/${mediaId}/insights`, {
      metric: metrics || defaultMetrics,
    });
  }

  // ─── RATE LIMITS ────────────────────────────────────────────────────────────

  /**
   * Check current publishing rate limit
   * Limit: 100 API-published posts within a 24-hour moving period
   */
  async getPublishingLimit(igId = null) {
    const id = igId || this.igAccountId;
    return this.client.get(ENDPOINTS.instagram.getContentPublishingLimit(id), {
      fields: ['quota_usage', 'config'],
    });
  }
}

module.exports = { InstagramService };
