# Paid Media Page — Redesign Brief

Source page: `restaurant-advertising.html` (currently `noindex` + redirected to `/`).
Decision summary: keep the messaging (it's strong), keep the brand frame (nav, footer, colors, fonts, buttons), give the **interior layouts and hero a fresh, data-forward rendition** via Claude's design tool. Audience is a numbers-driven, results-oriented restaurant owner. The single job of the page is to convert that visitor into a booked strategy call.

This page owns **paid ads** (Google, Meta, retargeting, Maps). It is NOT the place for cinematic food video. That lane belongs to the organic Social Media Marketing page, which this page links to in the "Paid vs Organic" section.

---

## 1) The Plan

**Phase A — Generate the rendition (Claude design tool).**
Paste the prompt in Section 2 into Claude's design tool. It produces a standalone HTML/CSS page that is already on-brand (the prompt hands it our exact tokens) with a fresh hero and fresh section layouts. Iterate there until the hero and proof sections feel right.

**Phase B — Reconcile into the repo.**
- Swap the generated nav + footer for our shared components (the prompt tells it to leave clear mount points).
- Keep the page's CSS page-scoped (same pattern the current page uses: one self-contained `<style>` block) so it can't leak into other pages.
- Map any generated color/spacing back onto the `shared.css` variables where practical.

**Phase B (performance pass) — speed without touching the look.**
Every item below is visually neutral; the page should look identical and load faster.
- **Fonts:** drop any Google Fonts CDN the design tool added. Use the site's self-hosted variable woff2 (`@font-face` already lives in `shared.css`). Preload only the two above-the-fold fonts (Plus Jakarta Sans for the hero, Figtree for body) with `crossorigin fetchpriority="high"`; leave Epilogue unpreloaded (below the fold). Keep `font-display: swap` and a system-font fallback so text paints instantly.
- **Images (biggest lever, especially with real photos incoming):** serve each photo as `<picture>` with AVIF + WebP + JPG fallback, responsive `srcset`/`sizes` (e.g. 800 / 1200 / 1800 wide), following the existing `name-1200.avif` naming. The hero image gets `<link rel="preload" as="image">` + `fetchpriority="high"` (it is the LCP). Everything below the fold gets `loading="lazy"` + `decoding="async"`. Every image gets explicit `width`/`height` or `aspect-ratio` so layout shift (CLS) stays at zero. I generate the AVIF/WebP variants at integration.
- **JS / libraries:** inline SVG icons (no Lucide CDN); do scroll reveals + number count-ups with a small IntersectionObserver + CSS transitions (no GSAP / ScrollTrigger). That removes ~70KB of JS and 2-3 render-blocking CDN requests with no visual change. Defer any remaining scripts; gate the pixel-canvas particle scene behind IntersectionObserver + `prefers-reduced-motion`.
- **CSS / render path:** page-specific CSS stays in one `<style>` block (minified by the esbuild build step). `shared.css` stays a cached cross-page `<link>`. Animate only `transform`/`opacity` (GPU-friendly), never layout or box-shadow. Drop preconnects to any CDN we stop using.
- **Build:** the file is already in `filesToCopy`, so CSS/JS minify automatically; no build change needed unless we rename the page.
- **Verify on the preview server:** check the network waterfall (`preview_network`), confirm the hero image preloads and nothing oversized loads, confirm zero layout shift, and spot-check a mobile viewport (`preview_resize`). Targets: fast LCP (preloaded hero + swapped fonts), zero CLS (sized media), minimal JS.

**Phase C — Photography.**
- Replace the 5 broken Unsplash placeholders (the entire Services section is currently running on dead stock URLs).
- Drop the new team / office / client / restaurant photos into the slots defined by the shot list (Section 3). Save them under `photos/Service/Paid Media/` (that folder already exists and is empty), then export optimized `.avif` + `.jpg` into `images/`.

**Phase D — Ship it (make it indexable).**
- Remove `<meta name="robots" content="noindex, nofollow">`.
- Remove the `restaurant-advertising` -> `/` redirect in `vercel.json` (and the `/googleads`, `/google-ads` redirects if we want those to point here).
- Pick a final clean URL (recommend `/paid-media`; `/restaurant-advertising` also works and matches the file).
- Add a rewrite for the clean URL, add the page to `sitemap.xml`, and add it to the nav + footer + the homepage services links.
- Update `<title>`, meta description, canonical, and the Service/FAQ/Breadcrumb schema to the final URL.

**House-style note:** the existing copy uses em dashes throughout. Your house style avoids them. During Phase B finalization we should swap em dashes for commas/periods/parens. I've kept the copy verbatim in the prompt below so the design matches what you approved; we clean punctuation at integration.

**Design principles specific to this page:**
1. **Make the numbers the hero.** 12X ROAS, $3.5M revenue, 72:1 best account. A results-driven buyer should see proof above the fold.
2. **Data-forward visual language** over food photography: dashboards, ROAS counters, tracked-conversion motifs, clean charts.
3. **Photography = credibility, not decoration.** Team-at-work and client-handshake shots answer "are these real people who actually manage this?" That's the trust gap for this buyer.
4. **Skimmable.** Big stats, short proof blocks, a clear yes/no fit-check. This reader scans before they read.
5. **CTA never far away.** The current page repeats "Get Your Free Strategy Call" after most sections. Keep that cadence.

---

## 2) The Prompt (paste into Claude's design tool)

> **Build a single, premium, dark-themed marketing landing page: the "Paid Media for Restaurants" service page for Button Up Media, a restaurant marketing agency in Florida.**
>
> **Audience & goal.** The visitor is a restaurant owner or marketing lead who is numbers-driven and results-oriented. They are evaluating whether to pay an agency to run their Google Ads, Meta (Facebook/Instagram) ads, retargeting, and Maps ads. The ONE goal of this page is to convert them into booking a free strategy call. Lead with proof and data. This page is about PAID advertising, not organic social, so do not lean on food/restaurant video; lean on dashboards, metrics, ROAS, and clean data visualization, supported by real photography of the team at work.
>
> **Brand system — match these exactly (this must feel on-brand, not generic):**
> - Background: warm near-black. Base `#0A0A0A`, raised surfaces `#111111` / `#171717` / `#1E1E1E`.
> - Text: cream `#f6f0e6`; headings `#f8f4ec`; dimmed `rgba(246,240,230,0.72)`; soft/captions `rgba(246,240,230,0.44)`.
> - Accent gold `#E2A84D` (use for eyebrows, key numbers, primary-button glow). Secondary accents: coral `#D06A50`, teal `#45B08C`. Subtle gold wash `rgba(226,168,77,0.14)`.
> - Hairline borders `rgba(255,248,235,0.10)`; faint glass surfaces `rgba(255,255,255,0.035)`.
> - Corner radii 12 / 16 / 22 / 30px. Content max-width ~1180px.
> - Fonts: body = **Figtree**; section headings = **Epilogue** (weight 800, letter-spacing -0.04em); hero display + numeric accents = **Plus Jakarta Sans** (weight 800, letter-spacing -0.05em, tight line-height ~0.96). One word in the hero headline set in a lighter "accent" weight (500) for contrast.
> - Buttons: PRIMARY = pill, gold-to-coral translucent gradient `linear-gradient(135deg, rgba(226,168,77,0.2), rgba(208,106,80,0.18))`, cream text, gold glow on hover. GHOST = transparent, soft text, faint hover fill.
> - Section eyebrow style: tiny (0.68rem) uppercase, letter-spacing 0.12em, gold. Section titles: large Epilogue.
> - Motion: numbers count up on scroll-into-view; sections fade/translate up slightly on reveal; tasteful glass cards with a soft top light and 1-2 blurred gold accent blobs behind premium cards. Keep it refined, not flashy.
>
> **Structure (leave a clear placeholder comment for a sticky top NAV bar and a bottom FOOTER; I will drop in our shared components). Use this section order and this copy verbatim:**
>
> **HERO — you have creative freedom here; make it interesting and data-forward.** Eyebrow: "Paid Marketing". Headline: "Paid Media That Turns Search Intent Into Reservations." (set "Reservations." in the lighter accent weight). Subhead: "When diners are ready to choose where to eat, we make sure your restaurant shows up first. We run Google Ads, Meta ads, and retargeting campaigns built around calls, reservations, online orders, and private-event inquiries." Primary CTA "Get Your Free Strategy Call", secondary ghost link "See $1M+ in Results". Trust row: "No long-term contracts · Full conversion tracking · Built for restaurants only". Build a live-results visual into the hero (a stat dashboard, animated ROAS gauge, or campaign-performance panel) using these animated counters: **$3.5M Revenue Generated · 45,000+ Total Reservations · 12X Average ROAS · $8 Avg. CPA**, with a footnote "2025 Google Ads · 5 Restaurant Properties · <$46K Total Spend". Treat the hero as the strongest proof moment on the page; surprise me with how the numbers are visualized, but keep it credible and legible. Reserve an optional slot for a real photo of the team working on ads.
>
> **2. THE OPPORTUNITY — "Why Paid Media Matters When Diners Are Ready to Choose."** Copy: There are two kinds of restaurant customers: **Browsers** (scrolling social, seeing your brand in passing, maybe thinking about you later) and **Ready-now buyers** (typing "Italian restaurant near me" into Google, checking Maps, comparing options within minutes). "That second customer has intent, urgency, and a decision to make right now." Pull-quote: "Paid media captures the customer who is already choosing where to spend tonight's dinner budget." Then a sub-block "The Shift From Traditional to Trackable": print, radio, and billboards can't show you whether a guest booked a table; paid media tracks the full path from impression to revenue (exactly how much was spent / how many saw the ad / how many clicked and converted / how many reservations or inquiries were generated). Close: "That's not guesswork. That's a measurable revenue channel." Include a photo slot for a candid team-at-work / dashboard-on-screen shot.
>
> **3. THE PROBLEM — "Why Most Restaurant Ads Underperform."** Sub: "The platform usually isn't the problem. The setup is. Most restaurant campaigns fail because they were built to spend money, not to capture guests, event leads, and reservations." Three cards: **The Boosted Post Trap** (no precision targeting / no conversion tracking / no real optimization loop; "It feels active, but it's usually just the platform showing a post to a slightly wider audience."), **The Hands-Off Campaign Problem** (keywords too broad / radius too wide / ad copy too generic / no conversion tracking; "Money drains out daily while no one knows which clicks are actually driving revenue."), **The Generic Agency Problem** ("General agencies run restaurant ads the same way they run roofing or med spa accounts." / don't understand dining search behavior / can't optimize around reservation demand / no seasonal or event playbook). Use line icons.
>
> **4. OUR APPROACH — "How We Build Paid Media That Converts."** Sub: "We don't launch generic campaigns and hope for the best. Every account starts with three questions:" Three numbered blocks: **01 Who is the customer?** (date-night couples / corporate event planners / tourists searching "best seafood near me"; "Each audience gets a different campaign, different keywords, and different creative."), **02 What action do we want them to take?** (book a reservation / submit a private event inquiry / call the restaurant; "Every campaign is built around one conversion action so we know exactly what is working."), **03 What does success look like in dollars?** ("We don't optimize around impressions. We optimize around revenue." / actual dollars generated vs. dollars spent / ROAS reporting every month / full visibility into what's producing results).
>
> **5. WHAT WE DO — "Paid Media Services."** Sub: "Five ad channels. One unified system. Every dollar tracked to an outcome." Five alternating image/text panels, each with a number, a line icon, a heading, a paragraph, and feature tags. Each visual is a photo slot (real team/office/client photography or a clean platform UI mock):
> - **01 Google Ads for Restaurants** — "Captures people with immediate intent. Someone searching 'restaurants near me' is deciding where to eat right now. We put you at the top of that search." Tags: High-intent search, Branded protection, Geo-targeting, Dayparting.
> - **02 Facebook & Instagram Ads** — "Social ads don't capture demand, they create it. We target local audiences by location, dining interests, age, and behavior before they start searching." Tags: Local awareness, Event promos, Retargeting, Lead gen.
> - **03 Local Discovery & Maps Advertising** — "Puts your restaurant at the top of Maps results. For venues that depend on foot traffic, this is one of the highest-ROI channels available." Tags: Maps placement, Local pack, Foot traffic.
> - **04 Retargeting Campaigns** — "Most people don't convert the first time. Retargeting keeps you visible to people who already showed interest, reminding them to come back and book." Tags: Website visitors, Video viewers, Ad engagers.
> - **05 Promotion & Event Campaigns** — "Seasonal events drive some of the strongest conversion rates. We build dedicated campaigns with enough lead time to capture early demand." Tags: Holiday campaigns, Special menus, Private events.
> Close with a centered primary CTA.
>
> **6. HOW WE WORK — "How Restaurant Advertising Works With Button Up Media."** Four-step horizontal process: **01 Audit & Strategy** (understand goals, audit existing campaigns, build a custom strategy around the highest-value opportunities), **02 Campaign Build** (keyword research, audience targeting, ad copy, creative, conversion tracking, landing-page alignment; "Nothing launches until tracking is verified."), **03 Optimization** (monitor daily, adjust bids, pause underperformers, test new variations, shift budget toward the best return), **04 ROI Reporting** (monthly reports: impressions, clicks, conversions, cost per conversion, conversion value, ROAS; "No vanity metrics. Just the numbers that matter."). Centered CTA below.
>
> **7. PROOF — "Proof From Live Restaurant Accounts."** Sub: "These are real results from restaurant campaigns managed by Button Up Media in 2025." A portfolio banner ("2025 Results Across 5 Restaurant Properties"): **$3.5M+ Revenue · 45,000+ Total Reservations · 12X Average ROAS · $8 Avg. CPA**, tagline "For every $1 spent on advertising, our restaurant clients saw an average return of 12X on ad spend." Then two FEATURED case-study cards with a giant ghosted ROAS number behind each:
> - **The Boathouse** (Private Events, Branded Search; May–Dec 2025) — **72:1 ROAS**; 234 Conversions · $520K Conv. Value · $7,157 Ad Spend · $30.58 Cost/Conv. Takeaway: "Highest ROAS in the portfolio. $30.58 per private-event lead is exceptional when each converted event generates thousands in revenue."
> - **The Odyssey** (Dinner Reservations, Private Events; Jun–Dec 2025) — **49:1 ROAS**; 951 Conversions · $337K Conv. Value · $6,802 Ad Spend · $7.15 Cost/Conv. Takeaway: "$7.15 per conversion. Fully scalable. Targeting and optimization are dialed in."
> Then three COMPACT supporting cards:
> - **The Rusty Pelican Miami** (Reservations, Private Events, Seasonal; full year 2025) — 1,007 Conversions · $135K Conv. Value · $18.95 Cost/Conv. · 7:1 ROAS. "Standout: Mother's Day delivered 155 conversions at $3.06. Thanksgiving delivered 252 at $3.70."
> - **The Rusty Pelican Tampa** (Reservations, Private Events, Seasonal; Aug–Dec 2025) — 287 Conversions · $87K Conv. Value · $23.64 Cost/Conv. · 27:1 Private Events ROAS. "Standout: Christmas and Thanksgiving were top performers."
> - **Castaway** (Reservations, Private Events; Mar–Dec 2025) — 140 Conversions · $17K Conv. Value · $5,926 Ad Spend · $42.34 Cost/Conv. "Positive ROAS on both campaigns. Private events are primed for scaling."
>
> **8. INVESTMENT — "How Much Should a Restaurant Spend on Advertising?"** Sub: "Budget determines volume. Efficiency determines return. A poorly managed $5,000 campaign will lose money. A well-optimized $1,500 campaign can generate meaningful ROI." Three tier cards: **Independent / Single Location $1,000–$3,000/mo**, **Multi-Location Group $3,000–$8,000/mo**, **High-Volume / Fine Dining $5,000–$15,000+/mo**. Centered CTA + line: "We'll analyze your market, estimate your keyword costs, and project your ROI before you spend a single dollar."
>
> **9. STRATEGY — "Paid vs. Organic: What Each Channel Does Best."** Sub: "The smartest restaurant marketing strategy uses paid media for immediate revenue while organic channels build the foundation for long-term growth." A comparison table (rows: Speed, Intent, Cost, Control, Best For) comparing Paid Media vs Organic (SEO + Social). Two ghost links below: "Explore Social Media Marketing" and "Explore Restaurant SEO".
>
> **10. FIT CHECK — "Is Paid Media Right for Your Restaurant?"** Two columns. **This is built for you if:** you want more reservations/events/orders soon; you've tried boosting posts or DIY ads with disappointing results; you're spending on ads but don't know your return; you want a team that understands restaurant search behavior; you have seasonal events / private dining / promos that need targeted campaigns; you're an independent, multi-location group, or upscale venue. **This is probably not for you if:** no budget and unwilling to invest at least $1,000/month; you expect results without conversion tracking; you just want someone to "set it up" while you manage it.
>
> **11. FAQ** — "Frequently Asked Questions." Sub: "Everything you need to know about restaurant paid media and working with Button Up Media." Accordion of 8: Do Google Ads work for restaurants? / How much should a restaurant spend on advertising? / What is the best way to advertise a restaurant? / Should restaurants use Facebook Ads or Google Ads? / How do you track restaurant advertising ROI? / What makes restaurant advertising different from other industries? / How quickly will I see results? / Can you manage advertising for multiple locations? (Use the answers from the existing page.)
>
> **12. FINAL CTA — "Ready to Put More Guests on the Books?"** Copy: "Our 2025 portfolio generated over $3.5 million in revenue across five properties. Schedule a free ads audit and we'll show you exactly where the opportunities are." Primary CTA "Get Your Free Strategy Call" + ghost "Call (786) 740-9498". Trust row: No contracts · Full conversion tracking from day one · Your campaigns, your data · Restaurant-only team. Make this a visually rich closing moment (glow, subtle particle/gradient scene) on brand.
>
> **Technical constraints (performance-first, with no visual compromise):**
> - One self-contained HTML file, a single `<style>` block, no external CSS framework.
> - **Icons: inline SVG only.** Do not load an icon font or icon library (no Lucide / Font Awesome CDN).
> - **Animations** (count-ups, scroll reveals, the hero visual): plain vanilla JS with IntersectionObserver + CSS transitions. **Do not use GSAP, ScrollTrigger, or any animation library.** Animate only `transform`/`opacity`, never layout or box-shadow. Respect `prefers-reduced-motion`.
> - **Fonts:** use Figtree (body), Epilogue (headings), Plus Jakarta Sans (hero/numbers), each with a system-font fallback stack (`system-ui, sans-serif`) so text paints instantly, and `font-display: swap`. Loading Google Fonts in the mock is fine; the final build self-hosts them.
> - **Images:** every photo is a placeholder `<img>` with descriptive `alt`, an explicit `width`/`height` or `aspect-ratio` (zero layout shift), `loading="lazy"` + `decoding="async"` below the fold, and eager / high priority for the hero image.
> - Fully responsive (mobile-first, panels stack on small screens). Accessible: semantic headings, sufficient contrast, visible focus states.
> - Leave HTML comments marking where the shared NAV and FOOTER will be injected.
> - Keep the DOM lightweight. Prioritize a fast, legible, premium feel that builds trust with a data-driven buyer.

---

## 3) Photo Shot List

Goal of the photography: prove there are **real, competent people** behind the numbers, and make an ads/data page feel human and trustworthy without drifting into the food-video territory that belongs on the Social page.

General specs for every shot:
- Shoot to match the brand: **dark, warm, moody**, not bright/airy. Gold/amber light sources read perfectly on this background.
- Capture **both orientations** of the key setups: wide 16:9 (hero/banners) and 4:5 or 1:1 (service panels, cards).
- **Candid over posed.** Real screens, real focus, real laptops. Avoid obvious stock-photo energy.
- Leave **negative space** in hero candidates so headline text can sit over the image.
- Screens: it's fine to show Google Ads / Meta Ads Manager / Looker Studio dashboards, but use **your own account data** (or a demo account). Don't show a client's identifiable private data. Charts trending up are the money shot.
- Deliver RAW or high-res; we'll export optimized `.avif` + `.jpg` and store under `photos/Service/Paid Media/` and `images/`.

**Priority A — Hero candidates (most important):**
1. Over-the-shoulder of a team member at a laptop/monitor with a **Google Ads or analytics dashboard** clearly visible (upward-trending line, ROAS, conversions). Warm desk lamp lighting. Wide, lots of negative space on one side.
2. Two team members side by side reviewing a campaign on screen, pointing at a metric. Conveys "a team is actively managing this."
3. A clean macro/detail of a screen showing a results chart or ROAS number, slightly out of focus, for an abstract data-texture hero option.

**Priority B — Services section (5 panels, need 5 distinct visuals):**
4. **Google Ads** — laptop screen with a search-results / Google Ads keyword view; hand on trackpad.
5. **Facebook & Instagram Ads** — phone in hand showing an Instagram/Facebook feed or Ads Manager; or a team member building a social ad on screen.
6. **Maps / Local Discovery** — phone showing Google Maps with a restaurant pin / local pack; ideally outdoors near a restaurant for context.
7. **Retargeting** — abstract "following the customer" concept: a person on a phone, or a screen showing audience/retargeting segments.
8. **Promotions & Events** — a planning moment: calendar/whiteboard with a seasonal campaign mapped out, or the team mid-strategy session.

**Priority C — Trust & credibility (sprinkled through Opportunity, Approach, How We Work):**
9. **Handshake / client meeting** — team member shaking hands with a restaurant owner, or seated consultation across a table. This is the single most valuable trust shot for this buyer.
10. **Whiteboarding / strategy session** — team mapping a campaign or funnel on a glass board or monitor.
11. **Reporting moment** — someone presenting a monthly ROI report (printed or on a screen) to a client.
12. **Working candids** — heads-down focus at desks, dual monitors, the "agency at work" feeling.

**Priority D — Environment & supporting:**
13. **Office establishing shots** — workspace, desks, a branded wall or logo, meeting area. Used as section dividers / background texture.
14. **On-site at a restaurant** — a team member with a laptop/phone inside or outside a client venue (ties ads back to real restaurants). Restaurant exterior **at night, lit** works well as a moody background.
15. **Detail textures** — coffee + laptop, notebook with campaign notes, hands on keyboard. Small accents for cards and dividers.

**Shot count target:** ~15–20 strong selects total. If time is tight, prioritize A (1–3), the handshake (9), and the 5 service visuals (4–8). Those alone replace every broken placeholder and give the hero its options.
