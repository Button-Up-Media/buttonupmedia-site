/**
 * Vercel Serverless Function: /api/meta/instagram
 * Handles Instagram Business account operations
 *
 * GET  /api/meta/instagram                     - Get IG profile
 * GET  /api/meta/instagram?action=media        - Get recent media
 * GET  /api/meta/instagram?action=stories      - Get stories
 * GET  /api/meta/instagram?action=insights     - Get account insights
 * GET  /api/meta/instagram?action=limit        - Get publishing rate limit
 * POST /api/meta/instagram?action=image        - Publish an image
 * POST /api/meta/instagram?action=video        - Publish a video/reel
 * POST /api/meta/instagram?action=story        - Publish a story
 * POST /api/meta/instagram?action=carousel     - Publish a carousel
 */

const { InstagramService } = require('../../meta-lib/instagram');
const { withErrorHandling, validateRequired, getAccessToken } = require('../../meta-lib/middleware');

module.exports = withErrorHandling(async (req, res) => {
  const token = getAccessToken(req);
  const instagram = new InstagramService(token);
  const { action, media_id } = req.query || {};

  switch (req.method) {
    case 'GET': {
      switch (action) {
        case 'media':
          const media = await instagram.getMedia(
            req.query.ig_id,
            parseInt(req.query.limit) || 25
          );
          return res.status(200).json(media);

        case 'stories':
          const stories = await instagram.getStories(req.query.ig_id);
          return res.status(200).json(stories);

        case 'insights':
          const metrics = req.query.metrics ? req.query.metrics.split(',') : null;
          const period = req.query.period || 'day';
          const insights = await instagram.getAccountInsights(metrics, period, req.query.ig_id);
          return res.status(200).json(insights);

        case 'media_insights':
          if (!media_id) throw new Error('media_id is required');
          const mediaInsights = await instagram.getMediaInsights(media_id);
          return res.status(200).json(mediaInsights);

        case 'comments':
          if (!media_id) throw new Error('media_id is required');
          const comments = await instagram.getComments(media_id);
          return res.status(200).json(comments);

        case 'limit':
          const limit = await instagram.getPublishingLimit(req.query.ig_id);
          return res.status(200).json(limit);

        case 'container_status':
          if (!req.query.container_id) throw new Error('container_id is required');
          const status = await instagram.getContainerStatus(req.query.container_id);
          return res.status(200).json(status);

        default:
          const profile = await instagram.getProfile(req.query.ig_id);
          return res.status(200).json(profile);
      }
    }

    case 'POST': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      switch (action) {
        case 'image':
          validateRequired(body, ['image_url']);
          const image = await instagram.publishImage(
            body.image_url,
            body.caption || '',
            { igId: body.ig_id }
          );
          return res.status(201).json(image);

        case 'video':
          validateRequired(body, ['video_url']);
          const video = await instagram.publishVideo(
            body.video_url,
            body.media_type || 'REELS',
            body.caption || '',
            { igId: body.ig_id, maxPollAttempts: body.max_poll || 30 }
          );
          return res.status(201).json(video);

        case 'story':
          validateRequired(body, ['media_url']);
          const storyContainer = await instagram.createStoryContainer(
            body.media_url,
            body.is_video || false,
            { igId: body.ig_id }
          );
          // Publish the story
          const story = await instagram.publishMedia(storyContainer.id, body.ig_id);
          return res.status(201).json(story);

        case 'carousel':
          validateRequired(body, ['items', 'caption']);
          // Create containers for each item
          const childIds = [];
          for (const item of body.items) {
            const child = await instagram.createCarouselItemContainer(
              item.url,
              item.is_video || false,
              { igId: body.ig_id }
            );
            childIds.push(child.id);
          }
          // Create carousel container
          const carouselContainer = await instagram.createCarouselContainer(
            childIds,
            body.caption,
            { igId: body.ig_id }
          );
          // Publish carousel
          const carousel = await instagram.publishMedia(carouselContainer.id, body.ig_id);
          return res.status(201).json(carousel);

        case 'reply':
          validateRequired(body, ['comment_id', 'message']);
          const reply = await instagram.replyToComment(body.comment_id, body.message);
          return res.status(201).json(reply);

        default:
          return res.status(400).json({
            error: 'Invalid action',
            message: 'Specify action: image, video, story, carousel, or reply',
          });
      }
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});
