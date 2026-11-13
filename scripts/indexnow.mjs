// IndexNow: tell Bing (and Yandex, Seznam, Naver) the moment pages are added or
// changed, so they are crawled in hours instead of weeks. ChatGPT search and
// Copilot lean on Bing's index, so this is the cheapest AEO lever we have.
//
//   node scripts/indexnow.mjs                 submit every URL in the live sitemap
//   node scripts/indexnow.mjs <url> [<url>]   submit specific URLs
//   node scripts/indexnow.mjs --wait <url>    poll until <url> returns 200 (deploy
//                                             finished), then submit (max ~5 min)
//
// The key file ({KEY}.txt at the site root) proves we own the host. No account needed.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'www.buttonupmedia.com';
const BASE = `https://${HOST}`;

const keyFile = (await readdir(root)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('ERROR\tno IndexNow key file at repo root'); process.exit(1); }
const key = keyFile.replace('.txt', '');

let args = process.argv.slice(2);
const wait = args[0] === '--wait';
if (wait) args = args.slice(1);

async function sitemapUrls() {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

let urls = args.length ? args : await sitemapUrls();
urls = [...new Set(urls)].filter((u) => u.startsWith(BASE));
if (!urls.length) { console.error('ERROR\tno URLs to submit'); process.exit(1); }

if (wait) {
  const target = urls[0];
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) {
    const r = await fetch(target, { method: 'GET', redirect: 'manual' }).catch(() => null);
    ok = !!r && r.status === 200;
    if (!ok) await new Promise((r2) => setTimeout(r2, 10000));
  }
  if (!ok) { console.error(`ERROR\t${target} never returned 200; not submitting`); process.exit(1); }
}

// IndexNow accepts up to 10,000 URLs per call.
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `${BASE}/${keyFile}`, urlList: urls.slice(0, 10000) }),
});
// 200 = accepted, 202 = accepted pending key check. Anything else is a real error.
if (res.status === 200 || res.status === 202) {
  console.log(`INDEXNOW\t${res.status}\t${urls.length} URL(s) submitted`);
} else {
  console.error(`ERROR\tIndexNow ${res.status} ${await res.text().catch(() => '')}`);
  process.exit(1);
}
