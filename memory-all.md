# Memory All

Living continuity file for the Button Up Media site repo.

Purpose:
- Preserve full project context across chat windows.
- Record the current codebase map, page map, shared assets, and external dependencies.
- Capture active design decisions and the latest implementation state.
- Be updated at the end of each task so the repo has a single source of truth for continuity.

Last updated:
- 2026-05-26

## How To Use

- Read this file first when resuming work in a new chat.
- Update it after finishing a task, before wrapping up.
- Keep entries concrete and current.
- Prefer absolute file paths when referring to files in notes or summaries.

## Current Project Snapshot

- Repo: `/Users/christianbusiness/buttonupmedia-site`
- Site type: static marketing site for Button Up Media.
- Primary audience: restaurant and food and beverage businesses.
- Main work pattern: edit HTML pages directly, keep preview files in sync, and checkpoint meaningful milestones to git.
- Local preview server: `http://127.0.0.1:8000/`

## Active Design State

- The restaurant website design page is actively being refined.
- Current preview URL:
  - `http://127.0.0.1:8000/.tmp-restaurant-website-design-preview.html`
- Cache-busted preview backup:
  - `http://127.0.0.1:8000/.tmp-restaurant-website-design-preview-v2.html`
- The live hidden page remains non-indexable and is treated as the source page for the preview copy.
- The restaurant website design page now has mobile-only hero copy: `Restaurant Website Design`, `A better website for your restaurant.`, and a concise menu/reservations/orders/search support line.
- The desktop hero keeps the original headline, supporting copy, and `See Package Options` CTA label; mobile swaps the secondary CTA label to `View Packages`.
- On mobile, the hero proof artboard keeps the desktop stack positions, scales the full composition down, hides the `Client | Rusty Pelican` pill, disables parallax transforms, and removes the mobile kicker dot so the category line reads cleaner.
- On mobile, the hero background now fades in more smoothly behind the fixed header and the hero gets a bit more bottom breathing room so the next section does not crowd the graphic stack.
- The current preview files remain usable as local preview surfaces and do not need to carry the live-page redirect.
- The Pricing and Add-Ons content has been combined into one section.
- The Process section has been optimized for desktop scroll and hides the sticky card on mobile.
- The Problem section no longer shows the green “What should happen” solution callouts.
- The Problem tab strip is horizontal-only now: it keeps `overflow-x: auto` for the pills but blocks vertical overflow so the tab row itself does not scroll vertically.
- The cookie consent banner wording now says `Got it` and `Opt out` instead of `Accept All` and `Reject All`, while keeping the existing consent storage behavior unchanged.

## Recent Decisions

- Use the preview file as the working surface during edits, then sync the live hidden page.
- Keep hidden pages `noindex, nofollow`.
- Merge related pricing content into one section instead of splitting it across multiple blocks.
- Keep the pricing section compact: Standard and Premium should read quickly in one screen view, and add-ons should stay visually integrated and text-light.
- Keep only one primary CTA inside the pricing section; use a single section-level button instead of repeating package-level `Get Started` buttons.
- Bottom-of-page CTA cards should match the homepage bottom CTA treatment exactly: the same centered gold-on-black card language, dotted/mesh background treatment, button styling, and hierarchy.
- The restaurant website design page footer CTA now mirrors the homepage CTA pattern directly using the same `hp2-cta-scene` structure and scroll entrance animation.
- Preview copies of the restaurant website design page should not include the meta refresh redirect to `index.html`; that redirect belongs only in the hidden live source if needed.
- The Our Process section no longer uses the sticky progress card; instead, the section uses a lightly darkened optimized background image with the timeline layered over it.
- The SEO section should read like a fast-glance set of info cards on mobile first: left-aligned, compact, and not button-like.
- The SEO section is now implemented as compact left-aligned info rows with shorter copy so it reads like a quick-glance mobile-first checklist instead of centered button-like cards.
- On mobile, tighten the transition between the "How They Decide" quote and the Pricing section so there is no excessive blank space.
- On mobile, the Premium / Most Popular pricing card should appear before Standard so the featured option is seen first in the stack.
- Optimize the process timeline for desktop scrolling and simplify it on mobile.
- Keep the site visually bold but reduce clutter in sections that read better when simplified.
- Keep mobile as the primary design lens, with desktop as the enhancement layer.
- Prefer bottom-sheet consent experiences over floating corner icons when a privacy banner is needed.
- When a graphic stack appears in a hero, optimize it for scale, overlap, and legibility first, then embellish for larger screens. On mobile, prefer the graphic-first composition if it keeps the stack readable and visible above any persistent UI like consent banners. For complex hero graphics, lock the artboard positions first, then scale the whole composition down across breakpoints instead of re-laying out the layers independently.

## Repo Structure Index

### Root Pages

- [`/Users/christianbusiness/buttonupmedia-site/index.html`](index.html)
  - Main homepage.
- [`/Users/christianbusiness/buttonupmedia-site/about.html`](about.html)
  - About page.
- [`/Users/christianbusiness/buttonupmedia-site/services.html`](services.html)
  - Services hub / service overview page.
- [`/Users/christianbusiness/buttonupmedia-site/contact.html`](contact.html)
  - Contact / booking page.
- [`/Users/christianbusiness/buttonupmedia-site/case-studies.html`](case-studies.html)
  - Case studies / proof page.
- [`/Users/christianbusiness/buttonupmedia-site/social-media-marketing.html`](social-media-marketing.html)
  - Social media marketing service page.
- [`/Users/christianbusiness/buttonupmedia-site/restaurant-advertising.html`](restaurant-advertising.html)
  - Hidden restaurant advertising page, non-indexable.
- [`/Users/christianbusiness/buttonupmedia-site/restaurant-seo.html`](restaurant-seo.html)
  - Restaurant SEO service page.
- [`/Users/christianbusiness/buttonupmedia-site/restaurant-website-design.html`](restaurant-website-design.html)
  - Hidden restaurant website design / website services page source.

### Preview Files

- [`/Users/christianbusiness/buttonupmedia-site/.tmp-google-ads-preview.html`](.tmp-google-ads-preview.html)
  - Temporary paid media preview.
- [`/Users/christianbusiness/buttonupmedia-site/.tmp-restaurant-website-design-preview.html`](.tmp-restaurant-website-design-preview.html)
  - Temporary preview for the restaurant website design page.

### Shared Assets

- [`/Users/christianbusiness/buttonupmedia-site/shared.css`](shared.css)
  - Shared site-wide styles, navigation, layout, and reusable components.
- [`/Users/christianbusiness/buttonupmedia-site/shared.js`](shared.js)
  - Shared JavaScript for nav behavior, GSAP-driven shared animations, and general site enhancements.
- [`/Users/christianbusiness/buttonupmedia-site/pixel-canvas.js`](pixel-canvas.js)
  - Pixel canvas effect used in CTA sections.
- [`/Users/christianbusiness/buttonupmedia-site/website-design-redesign.css`](website-design-redesign.css)
  - Page-specific styles for the restaurant website design page.
- [`/Users/christianbusiness/buttonupmedia-site/website-design-redesign.js`](website-design-redesign.js)
  - Page-specific hero parallax behavior for the restaurant website design page.

### Media Assets

- [`/Users/christianbusiness/buttonupmedia-site/images/website-design/rusty-pelican-desktop.png`](images/website-design/rusty-pelican-desktop.png)
  - Desktop hero asset for the restaurant website design page.
- [`/Users/christianbusiness/buttonupmedia-site/images/website-design/rusty-pelican-mobile.png`](images/website-design/rusty-pelican-mobile.png)
  - Mobile hero asset for the restaurant website design page.

## Page Map

### Homepage and Core Pages

- Home: `index.html`
- About: `about.html`
- Services: `services.html`
- Contact: `contact.html`
- Case Studies: `case-studies.html`

### Service Pages

- Social Media Marketing: `social-media-marketing.html`
- Restaurant Advertising: `restaurant-advertising.html`
- Restaurant SEO: `restaurant-seo.html`
- Restaurant Website Design: `restaurant-website-design.html`

### Temporary Preview Pages

- Paid media preview: `.tmp-google-ads-preview.html`
- Website design preview: `.tmp-restaurant-website-design-preview.html`

## Restaurant Website Design Page Structure

Current flow in [`restaurant-website-design.html`](restaurant-website-design.html):

1. Hero
2. The Problem
3. How They Decide
4. Pricing
5. Add-ons
6. Our Process
7. Why SEO Matters
8. FAQ
9. Final CTA
10. Footer

Important implementation notes:
- Hero parallax uses Rusty Pelican screenshots and floating result cards.
- The process section is a 4-step timeline with a desktop sticky progress card.
- The mobile view hides the sticky process card entirely.
- Pricing and add-ons are combined into one section.
- Problem section keeps the problem descriptions and bullets only.

## External Dependencies / API Surface

### Third-Party Libraries Loaded In Pages

- Lucide Icons
  - Script: `https://unpkg.com/lucide@latest/dist/umd/lucide.min.js`
  - Used for inline SVG icons throughout the pages.
- GSAP
  - Script: `https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js`
  - Used for entrance animations, counters, and scroll behaviors.
- GSAP ScrollTrigger
  - Script: `https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/ScrollTrigger.min.js`
  - Used for scroll-triggered animations and progress-driven sections.
- Google Fonts
  - Families used: `Plus Jakarta Sans`, `Epilogue`, `Figtree`
  - Used across the brand site typography system.

### Internal JS Responsibilities

- [`shared.js`](shared.js)
  - Lucide initialization.
  - Mobile nav open/close behavior.
  - Shared GSAP entrances and counters.
  - Shared site animation helpers.
- [`website-design-redesign.js`](website-design-redesign.js)
  - Mouse-follow hero parallax for the restaurant website design page.
  - Hero layers respond to pointer movement across the full hero section.

## Workflow Rules

- Keep preview files aligned with the corresponding hidden source page when editing.
- Prefer small, meaningful git checkpoints after major content or layout changes.
- Do not overwrite unrelated user changes.
- When a section is simplified or removed, verify both the live source and the preview copy.
- For this repo, memory updates should be treated as part of finishing a task.

## Recent Git Checkpoints

- `aaccf05` - Update restaurant website services copy
- `faa9652` - Remove problem solution callouts
- `0fddcde` - Combine pricing and add-ons sections
- `9650cb8` - Optimize process timeline layout
- `0e1a183` - Expand hero parallax to full section

## Open Watchouts

- The site still contains legacy CSS and JS helpers from older sections that may no longer be visible on the page.
- Review `shared.js` and page-specific scripts carefully before deleting any old helpers, because some are still used on other pages.
- Keep hidden pages non-indexable unless explicitly asked to publish them.

## Suggested Update Template

When a task finishes, append:
- What changed
- Which files changed
- Any new previews or hidden-page syncs
- Any important decisions made
- Any new git commit hashes
- Any open risks or follow-up work
