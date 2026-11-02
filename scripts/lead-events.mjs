// The one list of events that represent a real person doing something we care
// about. Imported by both scripts/tracking-setup.mjs (which forwards them to
// GA4) and scripts/report.mjs (which checks whether they actually fired), so the
// setup and the audit can never drift apart.
//
// Enumerated from the source, not from memory: the `event:` literals in the page
// HTML plus the helper-style push("name") call sites in shared.js. If you add a
// new event to the tracker, add it here and re-run:
//   node scripts/tracking-setup.mjs --publish
//
// bum_consent_update is deliberately absent. It is internal consent plumbing,
// not a lead, and forwarding it would put noise in every report.
export const LEAD_EVENTS = [
  'booking_complete',
  'booking_cta_click',
  'calendar_open_newtab',
  'calendly_loaded',
  'email_click',
  'grader_cta_click',
  'grader_popup_book',
  'grader_popup_shown',
  'grader_scan_start',
  'phone_call_click',
  'report_unlocked',
  'website_consult_booked',
];

// The subset that counts as a conversion. Deliberately narrow: marking a CTA
// click as a key event would make every report flatter the site.
export const KEY_EVENTS = [
  'booking_complete',
  'website_consult_booked',
  'phone_call_click',
  'email_click',
  'report_unlocked',
];

// Context the tracker attaches to each event. Without these forwarded, GA4 shows
// that a lead happened but not which page, post or CTA earned it.
export const EVENT_PARAMS = ['cta_location', 'link_location', 'post_slug', 'post_category', 'post_lang'];
