/* Demo grader: injects a client-side mock so the REAL grader landing + report
   run against a fake restaurant ("June's Burger Joint") with no backend. The
   pages stay in sync with the live grader because they are generated from the
   built grader pages at build time. Interactive (no auto-drive) + noindex, so
   the demo can be opened and screen-recorded on any device.

   Target headline numbers (tuned): score 36, 10 fixable issues, ranks 4th.     */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const NAME = "June's Burger Joint";
const SITE = 'junesburgerjoint.com';

const MOCK = `
<meta name="robots" content="noindex, nofollow" />
<style>
  /* DEMO: show the full report immediately — no unlock gate, no blur, no popup */
  #sr-gate { display: none !important; }
  #sr-report.locked .sr-blurzone { filter: none !important; pointer-events: auto !important; user-select: auto !important; }
  #sr-pop { display: none !important; }
</style>
<script>
(function () {
  var NAME = ${JSON.stringify(NAME)};
  var SITE = ${JSON.stringify(SITE)};

  // 3 competitors rated ABOVE us -> "You rank 4th of 7"
  var COMPS = [
    { name: 'Patty & Bun',     rating: 4.7, reviews: 1120, placeId: 'c1' },
    { name: 'Smash Republic',  rating: 4.5, reviews: 840,  placeId: 'c2' },
    { name: 'The Char House',  rating: 4.3, reviews: 560,  placeId: 'c3' },
    { name: 'Frontier Diner',  rating: 3.7, reviews: 240,  placeId: 'c4' },
    { name: 'Route 9 Grill',   rating: 3.5, reviews: 130,  placeId: 'c5' },
    { name: 'Corner Stop',     rating: 3.3, reviews: 74,   placeId: 'c6' }
  ];

  var PLACE = {
    placeId: 'demo_junes', name: NAME, website: SITE,
    mapsUrl: null, rating: 3.9, reviews: 34,                    // rating<4 + reviews<50 -> 2 real issues
    address: '58 Main St, Miami, FL', priceLevel: 1,
    location: { lat: 25.77, lng: -80.19 },
    phone: '(305) 555-0183', hasHours: true,
    photosCount: 6, photoRefs: [],                             // <10 -> photos-on-listing issue
    types: ['restaurant', 'food', 'meal_takeaway'],
    reservable: false, dineIn: true, servesDinner: true, takeout: true, delivery: false,
    editorialSummary: null,
    sampleReviews: [                                           // avg 4.3 -> sentiment check passes (kept off the issue list)
      { rating: 5, text: 'Best smash burger in town honestly. Wish the website made it easier to order ahead.' },
      { rating: 4, text: 'Solid burgers and friendly staff. Menu online is hard to find though.' },
      { rating: 4, text: 'Good spot, we come back often.' }
    ]
  };

  var COMP_PLACES = {};
  COMPS.forEach(function (c) { COMP_PLACES[c.placeId] = { placeId: c.placeId, name: c.name, rating: c.rating, reviews: c.reviews, website: c.name.toLowerCase().replace(/[^a-z]/g,'') + '.com', photosCount: 22, types: ['restaurant'] }; });

  var SHOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  var SCAN = {
    ok: true, url: SITE, screenshot: SHOT,
    report: { fieldData: { overall_category: 'FAST' } },       // keep real-world-speed off the list (2 speed issues, not 3)
    mobile: {
      categories: { performance: 24, accessibility: 74, bestPractices: 71, seo: 63 },
      metrics: {
        lcp: { value: 5200, display: '5.2 s' },                // food-photos-show-fast issue + slow-mobile gate
        fcp: { value: 1600, display: '1.6 s' },                // passes
        tbt: { value: 160,  display: '160 ms' },               // passes
        cls: { value: 0.06, display: '0.06' }                  // passes
      },
      failing: []
    },
    desktop: { categories: { performance: 52, accessibility: 80, bestPractices: 78, seo: 70 } }
  };

  // designScore (ux.score) low -> design gate + "fix your website" pitch.
  // Exactly 3 ai-vision/html checks false; everything else true (pass).
  // 10 failing checks, spread to pull Ordering + Findability down so the overall
  // lands ~36: menu, order-button (ordering) + headline, h1-city, meta (findability)
  // + 2 speed (psi) + rating, reviews, listing-photos (places).
  var UX = {
    score: 30, photoScore: 11, reviewSentiment: 'mixed',
    checks: {
      'menu-and-prices-visible': false, 'order-or-reserve-button': false,
      'headline-food-town': false, 'h1-city': false, 'meta-description': false,
      'order-on-own-site': true, 'real-food-photos': true, 'phone-number-visible': true,
      'address-on-site': true, 'hours-on-site': true, 'about-story': true, 'social-links': true,
      'enough-real-text': true, 'faq-section': true, 'photos-are-your-own-food': true,
      'strong-hero': true, 'mobile-layout-looks-right': true, 'appetizing-photo-quality': true,
      'readable-text': true, 'strong-branding': true, 'not-cluttered': true,
      'modern-non-template-design': true, 'own-domain': true, 'title-matches-listing': true,
      'alt-text': true, 'og-tags': true
    },
    findings: [
      { pt: 'No menu or prices anywhere on your homepage', im: 'A hungry guest cannot see what you serve or what it costs, so they leave and order from the burger spot that shows them.' },
      { pt: 'There is no clear "Order" button up top', im: 'A ready-to-buy guest has to hunt for how to order, and most give up in seconds. That order walks to a competitor.' },
      { pt: 'Your site takes 5.2 seconds to show your food on a phone', im: 'More than half of phone visitors leave before a slow page finishes loading. That is lost orders every single night.' }
    ]
  };

  // Modest IG so it does not trigger a social finding (posts <=150, followers >=300)
  // but still scores low next to the big competitors -> pulls the average down.
  var IG = { found: true, handle: 'junesburgerjoint', followers: 320, posts: 120, bio: 'Smash burgers in Miami', links: ['junesburgerjoint.com'], highlights: 2, isBusiness: false, verified: false, latestPostAt: Date.now() - 12 * 86400000, linksToWebsite: true };
  var COMP_IG = { pattyandbun: 41000, smashrepublic: 28500, thecharhouse: 12300 };

  var PREDICTIONS = [{ name: NAME, addr: '58 Main St, Miami, FL', placeId: 'demo_junes' }];

  function reply(obj, delay) { return new Promise(function (res) { setTimeout(function () { res({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); }, delay || 0); }); }
  function param(u, k) { var m = u.match(new RegExp('[?&]' + k + '=([^&]*)')); return m ? decodeURIComponent(m[1]) : ''; }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var u = String(url && url.url ? url.url : url);
    var isPost = !!(opts && String(opts.method || '').toUpperCase() === 'POST');
    if (u.indexOf('/api/places') === 0 && isPost) return reply({ ok: true, ux: UX }, 350);
    if (u.indexOf('/api/scan') === 0) return reply(SCAN, 1800);
    if (u.indexOf('/api/places') === 0) {
      if (u.indexOf('action=autocomplete') > -1) return reply({ ok: true, predictions: PREDICTIONS }, 120);   // always June's
      if (u.indexOf('action=competitors') > -1) return reply({ ok: true, competitors: COMPS }, 200);
      if (u.indexOf('action=details') > -1 || u.indexOf('action=brand') > -1) { var pid = param(u, 'placeId'); return reply({ ok: true, place: COMP_PLACES[pid] || PLACE }, 110); }
      if (u.indexOf('action=social') > -1) {
        if (u.indexOf('discover=1') > -1) {
          var who = (param(u, 'name') || '').toLowerCase();
          var handle = who.indexOf('june') > -1 ? 'junesburgerjoint'
            : who.indexOf('patty') > -1 ? 'pattyandbun'
            : who.indexOf('smash') > -1 ? 'smashrepublic'
            : who.indexOf('char') > -1 ? 'thecharhouse' : '';
          return reply({ ok: true, discover: { instagram: { candidates: handle ? [handle] : [], fromSite: true }, tiktok: { candidates: [], fromSite: false } } }, 130);
        }
        var h = param(u, 'handle');
        if (h === 'junesburgerjoint') return reply({ ok: true, profile: IG }, 150);
        if (COMP_IG[h]) return reply({ ok: true, profile: { found: true, handle: h, followers: COMP_IG[h], posts: 800, bio: '', links: [], highlights: 8, isBusiness: true, verified: true, latestPostAt: Date.now() - 86400000, linksToWebsite: true } }, 150);
        return reply({ ok: true, profile: null }, 80);
      }
    }
    if (u.indexOf('/api/sms') === 0) return reply({ ok: true, verified: true, unlocked: true }, 80);
    return realFetch(url, opts);
  };
})();
</script>`;

export async function generateDemo(outDir) {
  // landing: real grader landing + mock, and send its "start" navigation to the demo report
  let landing = await readFile(path.join(outDir, 'website-grader.html'), 'utf8');
  landing = landing.replace('</head>', MOCK + '\n</head>');
  landing = landing.replace(/"website-grader-report\?"/g, '"grader-demo-report.html?"');   // .html so it resolves locally + on Vercel
  await writeFile(path.join(outDir, 'grader-demo.html'), landing);

  // report: real grader report + mock
  let report = await readFile(path.join(outDir, 'website-grader-report.html'), 'utf8');
  report = report.replace('</head>', MOCK + '\n</head>');
  await writeFile(path.join(outDir, 'grader-demo-report.html'), report);
}
