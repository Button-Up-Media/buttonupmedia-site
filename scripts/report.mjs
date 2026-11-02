// Organic performance report for buttonupmedia.com.
//
// Pulls GA4 (traffic + leads) and Search Console (queries + rankings), compares
// the window against the one before it, and writes a report that answers the
// questions we actually care about:
//   - Are organic leads up or down, and from which channel?
//   - Is AI-assistant traffic (ChatGPT, Claude, Gemini, Perplexity) growing or dying?
//   - Is the blog producing leads, or just readers? Which posts specifically?
//   - Which search queries are we winning, losing, or sitting just off page one for?
//
// Usage:
//   node scripts/report.mjs                 28-day window vs the prior 28 days
//   node scripts/report.mjs --days 7        weekly
//   node scripts/report.mjs --days 90       quarterly
//   node scripts/report.mjs --json          print the raw snapshot as JSON
//
// Writes: reports/latest.md, reports/latest.json, reports/history/<date>.json
// Credentials: see scripts/google-auth.mjs (uses your gcloud login, no key files).
import { writeFile, mkdir, readFile, readdir } from 'fs/promises';
import path from 'path';
import { googleFetch, hasScope, AuthError, AUTH_COMMAND } from './google-auth.mjs';
import { LEAD_EVENTS } from './lead-events.mjs';

const SITE = 'buttonupmedia.com';
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'reports');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DAYS = Math.max(1, parseInt(flag('days', '28'), 10) || 28);
const AS_JSON = argv.includes('--json');

// Search Console finalizes data about 3 days back; GA4 about 1. Use the later
// lag for both so the two halves of the report describe the same period.
const LAG_DAYS = 3;

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

const curEnd = daysAgo(LAG_DAYS);
const curStart = daysAgo(LAG_DAYS + DAYS - 1);
const prevEnd = daysAgo(LAG_DAYS + DAYS);
const prevStart = daysAgo(LAG_DAYS + DAYS * 2 - 1);

const WINDOW = { start: iso(curStart), end: iso(curEnd) };
const PRIOR = { start: iso(prevStart), end: iso(prevEnd) };

// ---------- AI assistant referrers ----------
// Traffic from an AI assistant arrives as a plain referral, so GA4 buckets it
// under "Referral" and it is invisible unless we name the hosts explicitly.
const AI_SOURCES = [
  ['ChatGPT', ['chatgpt.com', 'chat.openai.com', 'openai.com', 'oai.azure.com']],
  ['Claude', ['claude.ai', 'anthropic.com']],
  ['Gemini', ['gemini.google.com', 'bard.google.com']],
  ['Perplexity', ['perplexity.ai']],
  ['Copilot', ['copilot.microsoft.com', 'bing.com/chat', 'edgeservices.bing.com']],
  ['Other AI', ['you.com', 'poe.com', 'grok.com', 'x.ai', 'deepseek.com', 'mistral.ai', 'phind.com', 'meta.ai', 'duckduckgo.com/aichat']],
];

const classifyAi = (source) => {
  const s = String(source || '').toLowerCase();
  for (const [label, hosts] of AI_SOURCES) {
    if (hosts.some((h) => s.includes(h))) return label;
  }
  return null;
};

// ---------- property discovery ----------
// The Data API needs the numeric property id, not the G- measurement id, so
// look it up rather than hardcoding a number that would silently rot.
async function findGa4Property() {
  const res = await googleFetch(
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
    { label: 'GA4 Admin API' }
  );
  const all = (res.accountSummaries || []).flatMap((a) =>
    (a.propertySummaries || []).map((p) => ({
      id: String(p.property || '').replace('properties/', ''),
      name: p.displayName,
      account: a.displayName,
    }))
  );
  if (!all.length) {
    throw new AuthError(
      'No GA4 properties are visible to this Google account.\n' +
        'Sign in as the account that owns the Button Up Media GA4 property:\n\n  ' +
        AUTH_COMMAND +
        '\n'
    );
  }
  const match =
    all.find((p) => /button\s*up/i.test(p.name)) ||
    all.find((p) => /buttonupmedia/i.test(p.name)) ||
    all.find((p) => new RegExp(SITE.replace('.', '\\.'), 'i').test(p.name));
  if (match) return match;
  if (all.length === 1) return all[0];
  throw new Error(
    'Could not tell which GA4 property belongs to the site. Visible properties:\n' +
      all.map((p) => `  ${p.id}  ${p.name} (${p.account})`).join('\n') +
      '\nSet the right one with:  GA4_PROPERTY_ID=<id> node scripts/report.mjs'
  );
}

async function findSearchConsoleSite() {
  // Search Console is optional: without the scope we still render the GA4 half.
  if (!(await hasScope('https://www.googleapis.com/auth/webmasters.readonly'))) return null;
  const res = await googleFetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    label: 'Search Console API',
  });
  const sites = (res.siteEntry || []).map((s) => s.siteUrl);
  if (!sites.length) return null;
  // Prefer the domain property: it covers www, apex and every subdomain at once.
  return (
    sites.find((s) => s === `sc-domain:${SITE}`) ||
    sites.find((s) => s.includes(SITE) && s.startsWith('sc-domain:')) ||
    sites.find((s) => s === `https://www.${SITE}/`) ||
    sites.find((s) => s.includes(SITE)) ||
    sites[0]
  );
}

// ---------- GA4 ----------
const ORGANIC_CHANNELS = ['Organic Search', 'Organic Social', 'Organic Video', 'Referral', 'Direct'];

async function ga4(propertyId, body, label) {
  return googleFetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    body,
    label: `GA4 ${label}`,
  });
}

// GA4 renamed "conversions" to "keyEvents". Probe once so an older property
// still reports leads instead of erroring the whole run.
let LEAD_METRIC = 'keyEvents';
async function resolveLeadMetric(propertyId) {
  try {
    await ga4(
      propertyId,
      { dateRanges: [{ startDate: WINDOW.start, endDate: WINDOW.end }], metrics: [{ name: 'keyEvents' }], limit: 1 },
      'metric probe'
    );
    LEAD_METRIC = 'keyEvents';
  } catch {
    LEAD_METRIC = 'conversions';
  }
}

const rows = (res) =>
  (res.rows || []).map((r) => ({
    keys: (r.dimensionValues || []).map((d) => d.value),
    vals: (r.metricValues || []).map((m) => Number(m.value) || 0),
  }));

const range = (w) => ({ startDate: w.start, endDate: w.end });

async function channelReport(propertyId, w) {
  const res = await ga4(
    propertyId,
    {
      dateRanges: [range(w)],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: LEAD_METRIC }, { name: 'totalUsers' }],
      limit: 50,
    },
    'channels'
  );
  const out = {};
  for (const r of rows(res)) {
    out[r.keys[0] || '(none)'] = { sessions: r.vals[0], leads: r.vals[1], users: r.vals[2] };
  }
  return out;
}

async function sourceReport(propertyId, w) {
  const res = await ga4(
    propertyId,
    {
      dateRanges: [range(w)],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }, { name: LEAD_METRIC }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 300,
    },
    'sources'
  );
  return rows(res).map((r) => ({ source: r.keys[0] || '(direct)', sessions: r.vals[0], leads: r.vals[1] }));
}

async function landingPageReport(propertyId, w) {
  const res = await ga4(
    propertyId,
    {
      dateRanges: [range(w)],
      dimensions: [{ name: 'landingPage' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: LEAD_METRIC }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 500,
    },
    'landing pages'
  );
  return rows(res).map((r) => ({
    page: r.keys[0] || '(not set)',
    channel: r.keys[1] || '(none)',
    sessions: r.vals[0],
    leads: r.vals[1],
  }));
}

async function eventReport(propertyId, w) {
  const res = await ga4(
    propertyId,
    {
      dateRanges: [range(w)],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 200,
    },
    'events'
  );
  const out = {};
  for (const r of rows(res)) out[r.keys[0]] = r.vals[0];
  return out;
}

// ---------- Search Console ----------
async function gscQuery(site, w, dimensions, rowLimit = 500) {
  const res = await googleFetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      body: { startDate: w.start, endDate: w.end, dimensions, rowLimit, dataState: 'final' },
      label: `Search Console ${dimensions.join('+')}`,
    }
  );
  return (res.rows || []).map((r) => ({
    keys: r.keys,
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  }));
}

// ---------- shaping ----------
const BLOG_RE = /^\/(es\/)?blog(\/|$)/;
// Pages that exist to sell a service, as opposed to the blog or utility pages.
const MONEY_RE =
  /^\/(es\/)?(|services|servicios|socialmediamarketing|marketing-redes-sociales|restaurant-website-design|diseno-web-restaurantes|restaurant-advertising|publicidad-restaurantes|restaurant-seo|case-studies|casos-de-exito|contact|contacto|about|nosotros|social-media-website-grader|analizador-redes-sociales-web)\/?$/;

const sum = (list, k) => list.reduce((a, b) => a + (b[k] || 0), 0);
const pct = (now, before) => {
  if (!before) return now ? null : 0;
  return ((now - before) / before) * 100;
};

function rollupAi(sources) {
  const buckets = {};
  for (const s of sources) {
    const label = classifyAi(s.source);
    if (!label) continue;
    buckets[label] = buckets[label] || { sessions: 0, leads: 0, hosts: [] };
    buckets[label].sessions += s.sessions;
    buckets[label].leads += s.leads;
    buckets[label].hosts.push(s.source);
  }
  return buckets;
}

async function collect(propertyId, site) {
  const [channelsNow, channelsPrev, sourcesNow, sourcesPrev, landingNow, landingPrev, eventsNow] =
    await Promise.all([
      channelReport(propertyId, WINDOW),
      channelReport(propertyId, PRIOR),
      sourceReport(propertyId, WINDOW),
      sourceReport(propertyId, PRIOR),
      landingPageReport(propertyId, WINDOW),
      landingPageReport(propertyId, PRIOR),
      eventReport(propertyId, WINDOW),
    ]);

  const [queriesNow, queriesPrev, pagesNow] = site
    ? await Promise.all([
        gscQuery(site, WINDOW, ['query']),
        gscQuery(site, PRIOR, ['query']),
        gscQuery(site, WINDOW, ['page']),
      ])
    : [null, null, null];

  return {
    meta: {
      generated: new Date().toISOString(),
      window: WINDOW,
      prior: PRIOR,
      days: DAYS,
      ga4Property: propertyId,
      searchConsoleSite: site || '(not authorized)',
      leadMetric: LEAD_METRIC,
    },
    ga4: {
      channels: { now: channelsNow, prior: channelsPrev },
      sources: { now: sourcesNow, prior: sourcesPrev },
      ai: { now: rollupAi(sourcesNow), prior: rollupAi(sourcesPrev) },
      landing: { now: landingNow, prior: landingPrev },
      events: eventsNow,
    },
    gsc: site ? { queries: { now: queriesNow, prior: queriesPrev }, pages: pagesNow } : null,
  };
}

// ---------- rendering ----------
const n = (v) => (v == null ? '-' : v.toLocaleString('en-US'));
const delta = (now, before) => {
  const p = pct(now, before);
  if (p == null) return 'new';
  const arrow = p > 1 ? 'up' : p < -1 ? 'down' : 'flat';
  return `${arrow} ${p >= 0 ? '+' : ''}${p.toFixed(0)}% (was ${n(before)})`;
};

function render(snap) {
  const { ga4, gsc, meta } = snap;
  const L = [];
  const p = (s = '') => L.push(s);

  p(`# Organic performance report`);
  p();
  p(`**Window:** ${meta.window.start} to ${meta.window.end} (${meta.days} days)`);
  p(`**Compared against:** ${meta.prior.start} to ${meta.prior.end}`);
  p(`**Generated:** ${meta.generated.slice(0, 16).replace('T', ' ')} UTC`);
  p();

  // --- headline ---
  const chNow = ga4.channels.now;
  const chPrev = ga4.channels.prior;
  const totalNow = Object.values(chNow).reduce((a, b) => a + b.sessions, 0);
  const totalPrev = Object.values(chPrev).reduce((a, b) => a + b.sessions, 0);
  const leadsNow = Object.values(chNow).reduce((a, b) => a + b.leads, 0);
  const leadsPrev = Object.values(chPrev).reduce((a, b) => a + b.leads, 0);

  p(`## The headline`);
  p();
  p(`| | This window | Change |`);
  p(`|---|---|---|`);
  p(`| Sessions, all channels | ${n(totalNow)} | ${delta(totalNow, totalPrev)} |`);
  p(`| Leads (key events), all channels | ${n(leadsNow)} | ${delta(leadsNow, leadsPrev)} |`);
  const org = chNow['Organic Search'] || { sessions: 0, leads: 0 };
  const orgPrev = chPrev['Organic Search'] || { sessions: 0, leads: 0 };
  p(`| Organic search sessions | ${n(org.sessions)} | ${delta(org.sessions, orgPrev.sessions)} |`);
  p(`| Organic search leads | ${n(org.leads)} | ${delta(org.leads, orgPrev.leads)} |`);
  p();

  // --- channels ---
  p(`## Where traffic and leads came from`);
  p();
  p(`| Channel | Sessions | Change | Leads | Lead rate |`);
  p(`|---|---|---|---|---|`);
  for (const [name, v] of Object.entries(chNow).sort((a, b) => b[1].sessions - a[1].sessions)) {
    const prev = chPrev[name] || { sessions: 0, leads: 0 };
    const rate = v.sessions ? ((v.leads / v.sessions) * 100).toFixed(1) + '%' : '-';
    p(`| ${name} | ${n(v.sessions)} | ${delta(v.sessions, prev.sessions)} | ${n(v.leads)} | ${rate} |`);
  }
  p();

  // --- AI assistants ---
  p(`## AI assistant traffic (ChatGPT, Claude, Gemini, Perplexity)`);
  p();
  p(`This is the channel that drove a lot of early leads, so it gets its own section.`);
  p(`GA4 files these under "Referral", which is why they are invisible in the default reports.`);
  p();
  const aiNow = ga4.ai.now;
  const aiPrev = ga4.ai.prior;
  const aiKeys = [...new Set([...Object.keys(aiNow), ...Object.keys(aiPrev)])];
  if (!aiKeys.length) {
    p(`**No AI assistant referrals recorded in either window.**`);
    p();
    p(`Either the traffic genuinely stopped, or these visits are arriving without a referrer`);
    p(`and landing in Direct. Check the Direct row above before concluding the channel died.`);
  } else {
    const aiTotalNow = aiKeys.reduce((a, k) => a + (aiNow[k] ? aiNow[k].sessions : 0), 0);
    const aiTotalPrev = aiKeys.reduce((a, k) => a + (aiPrev[k] ? aiPrev[k].sessions : 0), 0);
    p(`| Assistant | Sessions | Change | Leads |`);
    p(`|---|---|---|---|`);
    for (const k of aiKeys.sort((a, b) => (aiNow[b] ? aiNow[b].sessions : 0) - (aiNow[a] ? aiNow[a].sessions : 0))) {
      const cur = aiNow[k] || { sessions: 0, leads: 0 };
      const old = aiPrev[k] || { sessions: 0, leads: 0 };
      p(`| ${k} | ${n(cur.sessions)} | ${delta(cur.sessions, old.sessions)} | ${n(cur.leads)} |`);
    }
    p(`| **Total AI** | **${n(aiTotalNow)}** | **${delta(aiTotalNow, aiTotalPrev)}** | |`);
  }
  p();

  // --- blog vs money pages ---
  const organicOnly = (list) => list.filter((r) => r.channel === 'Organic Search');
  const blogNow = organicOnly(ga4.landing.now).filter((r) => BLOG_RE.test(r.page));
  const blogPrev = organicOnly(ga4.landing.prior).filter((r) => BLOG_RE.test(r.page));
  const moneyNow = organicOnly(ga4.landing.now).filter((r) => MONEY_RE.test(r.page));
  const moneyPrev = organicOnly(ga4.landing.prior).filter((r) => MONEY_RE.test(r.page));

  p(`## Is the blog working?`);
  p();
  p(`Organic sessions that *landed* on a blog post, versus organic sessions that landed on a service page.`);
  p();
  p(`| Landing on | Sessions | Change | Leads | Lead rate |`);
  p(`|---|---|---|---|---|`);
  const bS = sum(blogNow, 'sessions'), bL = sum(blogNow, 'leads');
  const mS = sum(moneyNow, 'sessions'), mL = sum(moneyNow, 'leads');
  p(`| Blog posts | ${n(bS)} | ${delta(bS, sum(blogPrev, 'sessions'))} | ${n(bL)} | ${bS ? ((bL / bS) * 100).toFixed(1) + '%' : '-'} |`);
  p(`| Service pages | ${n(mS)} | ${delta(mS, sum(moneyPrev, 'sessions'))} | ${n(mL)} | ${mS ? ((mL / mS) * 100).toFixed(1) + '%' : '-'} |`);
  p();
  if (bS && mS) {
    const br = bL / bS, mr = mL / mS;
    if (br === 0 && bL === 0) {
      p(`**Read:** the blog brought ${n(bS)} organic sessions and zero recorded leads this window.`);
      p(`Blog readers who later convert may be credited to another landing page, so treat this as`);
      p(`"no direct lead attribution" rather than proof the blog never contributes.`);
    } else if (mr > br * 2) {
      p(`**Read:** service pages convert about ${(mr / br).toFixed(1)}x better than blog posts per session.`);
      p(`The blog brings volume; the service pages bring leads.`);
    } else {
      p(`**Read:** blog and service pages convert at broadly comparable rates.`);
    }
  }
  p();

  p(`### Top blog posts by organic sessions`);
  p();
  if (!blogNow.length) {
    p(`No organic blog landings recorded.`);
  } else {
    p(`| Post | Sessions | Leads |`);
    p(`|---|---|---|`);
    for (const r of blogNow.slice(0, 20)) p(`| ${r.page} | ${n(r.sessions)} | ${n(r.leads)} |`);
    const earners = blogNow.filter((r) => r.leads > 0);
    p();
    p(earners.length
      ? `**${earners.length} of ${blogNow.length} blog posts produced at least one lead.**`
      : `**No individual blog post was credited with a lead this window.**`);
  }
  p();

  p(`### Service pages by organic sessions`);
  p();
  if (!moneyNow.length) {
    p(`No organic service-page landings recorded.`);
  } else {
    p(`| Page | Sessions | Leads |`);
    p(`|---|---|---|`);
    for (const r of moneyNow.slice(0, 20)) p(`| ${r.page} | ${n(r.sessions)} | ${n(r.leads)} |`);
  }
  p();

  // --- events ---
  p(`## Conversion events recorded`);
  p();
  const WATCH = LEAD_EVENTS;
  p(`| Event | Count |`);
  p(`|---|---|`);
  for (const e of WATCH) p(`| ${e} | ${e in ga4.events ? n(ga4.events[e]) : 'NOT FIRING'} |`);
  const silent = WATCH.filter((e) => !(e in ga4.events));
  p();
  if (silent.length) {
    p(`**${silent.length} tracked events recorded nothing this window:** ${silent.join(', ')}.`);
    p(`An event that never fires is either broken or on a page nobody reaches.`);
  }
  p();

  // --- search console ---
  p(`## What people searched to find us`);
  p();
  if (!gsc) {
    p(`**Not available yet.** Search Console needs one extra permission that these`);
    p(`credentials do not have. Run this once and re-run the report to unlock`);
    p(`queries, rankings, and the "just off page one" opportunities:`);
    p();
    p('```bash');
    p(AUTH_COMMAND);
    p('```');
    p();
    p(`---`);
    p();
    p(`Report generated by \`node scripts/report.mjs --days ${meta.days}\``);
    p(`GA4 property ${meta.ga4Property} | Search Console not authorized`);
    return L.join('\n');
  }
  const qNow = gsc.queries.now;
  const qPrev = new Map(gsc.queries.prior.map((r) => [r.keys[0], r]));
  const totalClicks = sum(qNow, 'clicks');
  const totalImpr = sum(qNow, 'impressions');
  const priorClicks = sum(gsc.queries.prior, 'clicks');
  p(`**Total clicks from Google:** ${n(totalClicks)} (${delta(totalClicks, priorClicks)})`);
  p(`**Total impressions:** ${n(totalImpr)}`);
  p();
  p(`### Top queries by clicks`);
  p();
  p(`| Query | Clicks | Change | Impressions | Avg position |`);
  p(`|---|---|---|---|---|`);
  for (const r of qNow.slice(0, 25)) {
    const old = qPrev.get(r.keys[0]);
    p(`| ${r.keys[0]} | ${n(r.clicks)} | ${old ? delta(r.clicks, old.clicks) : 'new'} | ${n(r.impressions)} | ${r.position.toFixed(1)} |`);
  }
  p();

  // Biggest losers: where the slowdown actually shows up.
  const movers = gsc.queries.prior
    .map((old) => {
      const cur = qNow.find((r) => r.keys[0] === old.keys[0]);
      return { query: old.keys[0], before: old.clicks, after: cur ? cur.clicks : 0, pos: cur ? cur.position : null, posBefore: old.position };
    })
    .filter((m) => m.before >= 3)
    .sort((a, b) => a.after - a.before - (b.after - b.before));

  p(`### Queries that lost the most clicks`);
  p();
  p(`This is where a slowdown shows up first.`);
  p();
  const losers = movers.filter((m) => m.after < m.before).slice(0, 15);
  if (!losers.length) {
    p(`No query lost meaningful clicks.`);
  } else {
    p(`| Query | Was | Now | Lost | Position then to now |`);
    p(`|---|---|---|---|---|`);
    for (const m of losers) {
      p(`| ${m.query} | ${n(m.before)} | ${n(m.after)} | ${n(m.before - m.after)} | ${m.posBefore.toFixed(1)} to ${m.pos == null ? 'gone' : m.pos.toFixed(1)} |`);
    }
  }
  p();

  p(`### Queries that gained the most clicks`);
  p();
  const winners = [...movers].reverse().filter((m) => m.after > m.before).slice(0, 10);
  if (!winners.length) {
    p(`No query gained meaningful clicks.`);
  } else {
    p(`| Query | Was | Now | Gained |`);
    p(`|---|---|---|---|`);
    for (const m of winners) p(`| ${m.query} | ${n(m.before)} | ${n(m.after)} | +${n(m.after - m.before)} |`);
  }
  p();

  // Striking distance: already visible, not yet clicked. Cheapest wins available.
  const striking = qNow
    .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);
  p(`### Just off page one (the cheapest wins available)`);
  p();
  p(`Queries where Google already shows us between position 5 and 20 with real impression volume.`);
  p(`Moving these up a few spots is far cheaper than ranking something new.`);
  p();
  if (!striking.length) {
    p(`Nothing in striking distance with meaningful volume.`);
  } else {
    p(`| Query | Position | Impressions | Clicks | CTR |`);
    p(`|---|---|---|---|---|`);
    for (const r of striking) {
      p(`| ${r.keys[0]} | ${r.position.toFixed(1)} | ${n(r.impressions)} | ${n(r.clicks)} | ${(r.ctr * 100).toFixed(1)}% |`);
    }
  }
  p();

  p(`### Top pages in Google`);
  p();
  p(`| Page | Clicks | Impressions | Avg position |`);
  p(`|---|---|---|---|`);
  for (const r of gsc.pages.slice(0, 20)) {
    p(`| ${r.keys[0].replace(`https://www.${SITE}`, '')} | ${n(r.clicks)} | ${n(r.impressions)} | ${r.position.toFixed(1)} |`);
  }
  p();

  p(`---`);
  p();
  p(`Report generated by \`node scripts/report.mjs --days ${meta.days}\``);
  p(`GA4 property ${meta.ga4Property} | Search Console ${meta.searchConsoleSite}`);

  return L.join('\n');
}

// ---------- main ----------
async function main() {
  const [property, site] = await Promise.all([
    process.env.GA4_PROPERTY_ID
      ? Promise.resolve({ id: process.env.GA4_PROPERTY_ID, name: 'from GA4_PROPERTY_ID' })
      : findGa4Property(),
    findSearchConsoleSite(),
  ]);

  console.error(`GA4 property: ${property.id} (${property.name})`);
  console.error(`Search Console: ${site || 'NOT AUTHORIZED (GA4-only report)'}`);
  console.error(`Window: ${WINDOW.start} to ${WINDOW.end} vs ${PRIOR.start} to ${PRIOR.end}`);

  await resolveLeadMetric(property.id);
  const snap = await collect(property.id, site);

  if (AS_JSON) {
    console.log(JSON.stringify(snap, null, 2));
    return;
  }

  const md = render(snap);
  await mkdir(path.join(OUT_DIR, 'history'), { recursive: true });
  await writeFile(path.join(OUT_DIR, 'latest.md'), md);
  await writeFile(path.join(OUT_DIR, 'latest.json'), JSON.stringify(snap, null, 2));
  await writeFile(path.join(OUT_DIR, 'history', `${WINDOW.end}-${DAYS}d.json`), JSON.stringify(snap, null, 2));

  console.log(md);
  console.error(`\nWrote reports/latest.md and reports/history/${WINDOW.end}-${DAYS}d.json`);
}

main().catch((err) => {
  if (err instanceof AuthError) {
    console.error(`\n${err.message}`);
    process.exit(2);
  }
  console.error(`\nReport failed: ${err.message}`);
  process.exit(1);
});
