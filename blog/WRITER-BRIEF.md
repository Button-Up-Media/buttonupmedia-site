# Blog writer brief (focus shift, 2026-11-13)

Read this before writing or queuing any post. It overrides older guidance where they conflict.

## Why the shift
The blog gets traffic, but mostly from do-it-yourself readers and people outside Florida. Restaurant owners who book calls search for help, prices and proof. Organic visits from Florida halved in October while total organic held, so we are attracting readers, not buyers. From now on the blog's job is to bring in owners who are deciding whether to hire help, and hand them to a service page, a case study or the grader.

## The mix
- About 70% buyer-intent posts: costs and budgets ("how much does X cost"), hiring decisions (agency vs freelancer vs in-house, red flags, what an agency does), comparisons, "is X worth it", case-study breakdowns (how a real client result happened), and Spanish-first topics for Miami.
- About 30% authority posts (how-tos), only when they answer something a buyer asks right before hiring (Google profile, reviews, AI answers). Skip pure inspiration listicles (reel ideas, post ideas, caption ideas).
- Pick from blog/ideas.json in priority order: unwritten P1 first. Ideas with "status": "written" already have content.

## Every post must
1. Link to the most relevant service page in the body, where a reader would naturally want it (not in a link list): /socialmediamarketing, /restaurant-website-design, /restaurant-advertising, /restaurant-seo (ES: /es/marketing-redes-sociales, /es/diseno-web-restaurantes, /es/publicidad-restaurantes, /es/seo-restaurantes).
2. Cite a real result when one fits, linking the case page itself: /case-studies/{slug} (ES /es/casos-de-exito/{slug}) for tonis-sushi-bar, the-fatty-crab, brewing-buddha, shimuja-ramen, rusty-pelican, private-events, woa-cocktails. Use only numbers published on that page.
3. Keep the grader mid-CTA (build-blog.mjs adds it) and the founder CTA. Do not add extra "book a call" blocks.
4. Follow the existing style rules: beginner-friendly, click-by-click where it is a how-to, no em or en dashes, ES register (usted in CTAs, tú in body), no invented statistics. Real outside statistics are fine when they help explain something.
5. For our combined views, write "200 million combined organic views across our clients" (ES: "200 millones de vistas orgánicas combinadas entre nuestros clientes"). Never "20 million".

## Voice
Write the way a normal person talks to a restaurant owner: plain, specific, warm, full sentences. If it sounds like AI, rewrite it.
- No filler openers ("The good news", "The real question", "Here is the honest answer", "The truth is", "The bottom line", "full stop", "spoiler", "That is the whole game"). Just state the point.
- No "not X, it's Y" contrasts ("That spot is not bought, it is earned"). Say it directly: "Map pack spots are earned through your profile, reviews and website."
- No slogans or fragment pairs ("3 restaurants, one team", "one team that talks to itself", "Real restaurants. Real numbers."), and no "unlock", "elevate" or "seamless" as filler.
- No rhetorical questions as headings or CTA openers ("Sound familiar?", "Want more guests?"). Real how-to and what-is question H2s are fine (they help AEO). The closing CTA heading is a plain statement, like "Get help with your Google listing".
- No generalizations about a neighborhood or its guests (tourists, crowds, seasons, nationalities, who speaks Spanish). Use a conditional ("If many of your guests search in Spanish...") or a real fact (an address, a client result).
- Positioning: we work with restaurants, bars and cafes anywhere in the US, with the same services and the same quality of work everywhere, and we film at the restaurant wherever it is. The only location fact is "headquartered in Miami, FL"; don't explain what that means for service. Keep "local to you". Never "a small Miami team" or "everything in-house". The SEO service is "SEO and AEO".
- Never draw a line between South Florida and anywhere else: no "our own crew in South Florida" vs "our network elsewhere", no "done remotely", no "team members in other states", no "outside South Florida" sections or FAQs, and don't describe our service area as Miami or South Florida ("we do this for Miami restaurants"). ES: no "fuera del sur de la Florida", "a distancia", "nuestra red de videógrafos". Naming South Florida neighborhoods as local examples is fine.
- Don't say anything we don't know.

## Local posts
- Six neighborhoods now have real area service pages: Miami Beach, Brickell & Downtown, Wynwood, Coral Gables, Doral, Fort Lauderdale (/restaurant-marketing-{area}, ES /es/marketing-restaurantes-{area}). Do NOT write "restaurant marketing in {area}" posts for those six; it makes two of our pages compete for one search. Link to the area page instead when a post mentions the area (hub: /areas-we-serve, ES /es/zonas-que-atendemos).
- New city posts are fine only for areas without an area page (Aventura, Hialeah, Boca Raton, Delray, West Palm Beach), and only with real local detail.

## Cadence
Unchanged: Tuesday and Friday, 9am ET, published by the scheduled task from blog/calendar.json. Keep at least four posts "ready".
