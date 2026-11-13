#!/usr/bin/env node
// Live health check for the Social Media & Website Grader.
//
// The grader quietly lost its restaurant-name search for ~6 weeks in Oct-Nov
// 2026 (the Google Cloud free trial behind the Places API ran out) and nobody
// noticed, because every other part kept working. This probes each backend the
// grader depends on, against production, and says plainly which one is down.
//
//   node scripts/grader-health.mjs          prints a table, exits 1 if anything is down
//   import { checkGrader } from './grader-health.mjs'   used by the weekly report
//
// Cost per run: one Places autocomplete call, one PageSpeed scan (free), one
// social discovery (no paid scrape), one Claude design review (~2 cents).

const BASE = process.env.GRADER_BASE || 'https://www.buttonupmedia.com';
const SAMPLE_SITE = 'https://www.buttonupmedia.com';

async function getJson(url, opts = {}, timeoutMs = 90000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function why(r) {
  if (!r.json) return `HTTP ${r.status}, non-JSON response`;
  const j = r.json;
  return [j.error, j.status, j.detail].filter(Boolean).join(' | ').slice(0, 220) || `HTTP ${r.status}`;
}

async function probe(name, impact, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, impact, ms: Date.now() - t0 };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'timed out' : e.message;
    return { name, ok: false, detail: msg, impact, ms: Date.now() - t0 };
  }
}

export async function checkGrader() {
  let screenshot = null;
  const results = await Promise.all([
    probe('Restaurant name search (Google Places)',
      'Typing a restaurant name returns no suggestions; no Google rating, reviews or competitors in the report',
      async () => {
        const r = await getJson(`${BASE}/api/places?action=autocomplete&q=pizza&lat=25.7617&lng=-80.1918`);
        if (!r.json || r.json.ok !== true) throw new Error(why(r));
        const n = (r.json.predictions || []).length;
        if (!n) throw new Error('ok but zero suggestions');
        return `${n} suggestions`;
      }),
    probe('Website scan (PageSpeed)',
      'No report can be produced at all',
      async () => {
        const r = await getJson(`${BASE}/api/scan?url=${encodeURIComponent(SAMPLE_SITE)}`, {}, 120000);
        if (!r.json || r.json.ok !== true) throw new Error(why(r));
        screenshot = r.json.screenshot || null;
        const perf = r.json.mobile && r.json.mobile.categories && r.json.mobile.categories.performance;
        return `mobile performance ${perf}`;
      }),
    probe('Social discovery',
      'Instagram/TikTok section of the report goes blank',
      async () => {
        const r = await getJson(`${BASE}/api/places?action=social&discover=1&website=${encodeURIComponent(SAMPLE_SITE)}&name=Button%20Up%20Media`);
        if (!r.json || r.json.ok !== true) throw new Error(why(r));
        return 'ok';
      }),
  ]);

  // The AI design review needs the screenshot the scan produced.
  results.push(await probe('AI design review (Claude)',
    'Reports fall back to speed-only scoring and lose the design/photo findings',
    async () => {
      if (!screenshot) throw new Error('skipped: scan returned no screenshot');
      const r = await getJson(`${BASE}/api/places`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ screenshot, name: 'Button Up Media', website: SAMPLE_SITE, url: SAMPLE_SITE, lang: 'en', reviews: [], photoRefs: [] }),
      });
      if (!r.json || r.json.ok !== true) throw new Error(why(r));
      return `design score ${r.json.ux && r.json.ux.score}`;
    }));

  return results;
}

export function renderHealth(results) {
  const down = results.filter((r) => !r.ok);
  const L = [];
  L.push('## Grader health');
  L.push('');
  L.push(down.length
    ? `**${down.length} of ${results.length} grader services are DOWN.** Leads from the grader drop while this is red.`
    : `All ${results.length} grader services are up.`);
  L.push('');
  L.push('| Service | Status | Detail | If down |');
  L.push('|---|---|---|---|');
  for (const r of results) {
    L.push(`| ${r.name} | ${r.ok ? 'up' : '**DOWN**'} | ${String(r.detail).replace(/\|/g, '/')} | ${r.ok ? '' : r.impact} |`);
  }
  if (down.some((r) => /Billing/i.test(r.detail))) {
    L.push('');
    L.push('**Fix:** the Google Cloud billing account behind the grader is not active. In Google Cloud console > Billing (project `bumbot-499020`), activate or link a paid billing account. No deploy needed; re-run `npm run grader:health` to confirm.');
  }
  L.push('');
  return L.join('\n');
}

// macOS banner so a red result is seen even if nobody opens the report.
export async function notifyIfDown(results) {
  const down = results.filter((r) => !r.ok);
  if (!down.length || process.platform !== 'darwin') return;
  const { execFile } = await import('child_process');
  const msg = `${down.map((r) => r.name).join(', ')} down. See reports/latest.md`;
  execFile('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "Button Up grader is broken"`], () => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await checkGrader();
  console.log(renderHealth(results));
  await notifyIfDown(results);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
