/**
 * Vercel Serverless Function: /api/meta/ads
 * Handles Meta Ads/Marketing API operations
 *
 * GET  /api/meta/ads?action=campaigns       - List campaigns
 * GET  /api/meta/ads?action=adsets          - List ad sets
 * GET  /api/meta/ads?action=ads             - List ads
 * GET  /api/meta/ads?action=creatives       - List creatives
 * GET  /api/meta/ads?action=insights        - Get account insights
 * GET  /api/meta/ads?action=targeting       - Search targeting options
 * POST /api/meta/ads?action=campaign        - Create campaign
 * POST /api/meta/ads?action=adset           - Create ad set
 * POST /api/meta/ads?action=creative        - Create ad creative
 * POST /api/meta/ads?action=ad              - Create ad
 * POST /api/meta/ads?action=full            - Create full ad (campaign→adset→creative→ad)
 * PUT  /api/meta/ads?action=campaign        - Update campaign
 * PUT  /api/meta/ads?action=adset           - Update ad set
 * PUT  /api/meta/ads?action=ad              - Update ad
 * DELETE /api/meta/ads                      - Delete campaign/adset/ad
 */

const { AdsService } = require('../../meta-lib/ads');
const { withErrorHandling, validateRequired, getAccessToken } = require('../../meta-lib/middleware');

module.exports = withErrorHandling(async (req, res) => {
  const token = getAccessToken(req);
  const ads = new AdsService(token);
  const { action, id } = req.query || {};

  switch (req.method) {
    case 'GET': {
      const limit = parseInt(req.query.limit) || 50;

      switch (action) {
        case 'campaigns':
          const campaigns = await ads.getCampaigns(null, limit);
          return res.status(200).json(campaigns);

        case 'campaign':
          if (!id) throw new Error('id query parameter required');
          const campaign = await ads.getCampaign(id);
          return res.status(200).json(campaign);

        case 'adsets':
          const adsets = await ads.getAdSets(null, limit, req.query.campaign_id);
          return res.status(200).json(adsets);

        case 'ads':
          const adsList = await ads.getAds(null, limit);
          return res.status(200).json(adsList);

        case 'creatives':
          const creatives = await ads.getAdCreatives(null, limit);
          return res.status(200).json(creatives);

        case 'insights':
          const insights = await ads.getAccountInsights({
            date_preset: req.query.date_preset || 'last_7d',
            level: req.query.level || 'account',
          });
          return res.status(200).json(insights);

        case 'campaign_insights':
          if (!id) throw new Error('id query parameter required');
          const campInsights = await ads.getCampaignInsights(id, {
            date_preset: req.query.date_preset || 'last_7d',
          });
          return res.status(200).json(campInsights);

        case 'targeting':
          if (!req.query.q) throw new Error('q (search query) is required');
          const targeting = await ads.searchTargeting(
            req.query.q,
            req.query.type || 'adinterest'
          );
          return res.status(200).json(targeting);

        case 'reach':
          if (!req.query.targeting_spec) throw new Error('targeting_spec is required');
          const reach = await ads.getReachEstimate(JSON.parse(req.query.targeting_spec));
          return res.status(200).json(reach);

        case 'audiences':
          const audiences = await ads.getCustomAudiences();
          return res.status(200).json(audiences);

        default:
          return res.status(400).json({
            error: 'Invalid action',
            available_actions: [
              'campaigns', 'campaign', 'adsets', 'ads', 'creatives',
              'insights', 'campaign_insights', 'targeting', 'reach', 'audiences',
            ],
          });
      }
    }

    case 'POST': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      switch (action) {
        case 'campaign':
          validateRequired(body, ['name', 'objective']);
          const newCampaign = await ads.createCampaign(body);
          return res.status(201).json(newCampaign);

        case 'adset':
          validateRequired(body, ['name', 'campaign_id', 'daily_budget', 'targeting', 'start_time']);
          const newAdSet = await ads.createAdSet(body);
          return res.status(201).json(newAdSet);

        case 'creative':
          validateRequired(body, ['name']);
          // Support different creative types
          if (body.type === 'link') {
            validateRequired(body, ['image_hash', 'message', 'link', 'headline']);
            const linkCreative = await ads.createLinkAdCreative(body);
            return res.status(201).json(linkCreative);
          } else if (body.type === 'video') {
            validateRequired(body, ['video_id', 'message']);
            const videoCreative = await ads.createVideoAdCreative(body);
            return res.status(201).json(videoCreative);
          } else if (body.type === 'carousel') {
            validateRequired(body, ['cards', 'message', 'link']);
            const carouselCreative = await ads.createCarouselAdCreative(body);
            return res.status(201).json(carouselCreative);
          } else {
            const genericCreative = await ads.createAdCreative(body);
            return res.status(201).json(genericCreative);
          }

        case 'ad':
          validateRequired(body, ['name', 'adset_id', 'creative']);
          const newAd = await ads.createAd(body);
          return res.status(201).json(newAd);

        case 'full':
          validateRequired(body, [
            'campaignName', 'objective', 'adSetName', 'dailyBudget',
            'targeting', 'startTime', 'imageHash', 'message', 'link', 'adName',
          ]);
          const fullAd = await ads.createFullAd(body);
          return res.status(201).json(fullAd);

        case 'audience':
          validateRequired(body, ['name', 'subtype']);
          const audience = await ads.createCustomAudience(body);
          return res.status(201).json(audience);

        case 'pause_campaign':
          if (!body.id) throw new Error('id is required');
          const paused = await ads.pauseCampaign(body.id);
          return res.status(200).json(paused);

        case 'activate_campaign':
          if (!body.id) throw new Error('id is required');
          const activated = await ads.activateCampaign(body.id);
          return res.status(200).json(activated);

        default:
          return res.status(400).json({
            error: 'Invalid action',
            available_actions: [
              'campaign', 'adset', 'creative', 'ad', 'full',
              'audience', 'pause_campaign', 'activate_campaign',
            ],
          });
      }
    }

    case 'PUT': {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!id && !body.id) throw new Error('id is required');
      const targetId = id || body.id;

      switch (action) {
        case 'campaign':
          const updatedCampaign = await ads.updateCampaign(targetId, body);
          return res.status(200).json(updatedCampaign);

        case 'adset':
          const updatedAdSet = await ads.updateAdSet(targetId, body);
          return res.status(200).json(updatedAdSet);

        case 'ad':
          const updatedAd = await ads.updateAd(targetId, body);
          return res.status(200).json(updatedAd);

        default:
          return res.status(400).json({
            error: 'Specify action: campaign, adset, or ad',
          });
      }
    }

    case 'DELETE': {
      if (!id) throw new Error('id query parameter is required');

      switch (action) {
        case 'campaign':
          return res.status(200).json(await ads.deleteCampaign(id));
        case 'adset':
          return res.status(200).json(await ads.deleteAdSet(id));
        case 'ad':
          return res.status(200).json(await ads.deleteAd(id));
        default:
          return res.status(400).json({
            error: 'Specify action: campaign, adset, or ad',
          });
      }
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});
