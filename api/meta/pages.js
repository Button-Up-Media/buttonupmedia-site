/**
 * Vercel Serverless Function: /api/meta/pages
 * Handles Facebook Page operations
 *
 * GET  /api/meta/pages              - Get page info
 * GET  /api/meta/pages?action=posts - Get page posts
 * GET  /api/meta/pages?action=insights - Get page insights
 * POST /api/meta/pages              - Create a post
 * POST /api/meta/pages?action=schedule - Schedule a post
 * PUT  /api/meta/pages              - Update a post
 * DELETE /api/meta/pages            - Delete a post
 */

const { PagesService } = require('./lib/pages');
const { withErrorHandling, validateRequired, getAccessToken } = require('./lib/middleware');

module.exports = withErrorHandling(async (req, res) => {
  const token = getAccessToken(req);
  const pages = new PagesService(token);
  const { action, page_id, post_id } = req.query || {};

  switch (req.method) {
    case 'GET': {
      switch (action) {
        case 'posts':
          const posts = await pages.getPosts(page_id, parseInt(req.query.limit) || 25);
          return res.status(200).json(posts);

        case 'insights':
          const metrics = req.query.metrics ? req.query.metrics.split(',') : null;
          const period = req.query.period || 'day';
          const insights = await pages.getInsights(metrics, period, page_id);
          return res.status(200).json(insights);

        case 'comments':
          if (!post_id) throw new Error('post_id is required for comments');
          const comments = await pages.getComments(post_id);
          return res.status(200).json(comments);

        case 'settings':
          const settings = await pages.getSettings(page_id);
          return res.status(200).json(settings);

        default:
          const pageInfo = await pages.getPageInfo(page_id);
          return res.status(200).json(pageInfo);
      }
    }

    case 'POST': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      switch (action) {
        case 'schedule':
          validateRequired(body, ['message', 'publish_time']);
          const scheduled = await pages.schedulePost(
            body.message,
            body.publish_time,
            { link: body.link, picture: body.picture }
          );
          return res.status(201).json(scheduled);

        case 'photo':
          validateRequired(body, ['url']);
          const photo = await pages.uploadPhoto({
            url: body.url,
            caption: body.caption || '',
          }, page_id);
          return res.status(201).json(photo);

        case 'comment':
          validateRequired(body, ['post_id', 'message']);
          const reply = await pages.replyToComment(body.post_id, body.message);
          return res.status(201).json(reply);

        default:
          validateRequired(body, ['message']);
          const post = await pages.createPost({
            message: body.message,
            link: body.link,
            picture: body.picture,
            published: body.published !== false,
          }, page_id);
          return res.status(201).json(post);
      }
    }

    case 'PUT': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!post_id && !body.post_id) throw new Error('post_id is required');
      const updated = await pages.updatePost(post_id || body.post_id, {
        message: body.message,
      });
      return res.status(200).json(updated);
    }

    case 'DELETE': {
      if (!post_id) throw new Error('post_id query parameter is required');
      const deleted = await pages.deletePost(post_id);
      return res.status(200).json(deleted);
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});
