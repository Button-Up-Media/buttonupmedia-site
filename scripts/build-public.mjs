import { cp, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { transform } from 'esbuild';
import { buildBlog } from './build-blog.mjs';
import { buildAreas } from './build-areas.mjs';
import { buildCases } from './build-cases.mjs';
import { generateDemo } from './demo-mock.mjs';

const root = process.cwd();
// BUILD_OUT lets parallel previews build into their own folder (default public/).
const outDir = path.join(root, process.env.BUILD_OUT || 'public');

const filesToCopy = [
  'index.html',
  'about.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'gmcp.html',
  'restaurant-advertising.html',
  'restaurant-seo.html',
  'restaurant-seo-es.html',
  'restaurant-website-design.html',
  'social-media-marketing.html',
  'thank-you.html',
  'thank-you-es.html',
  'website-grader.html',
  'website-grader-report.html',
  'website-grader-es.html',
  'website-grader-report-es.html',
  'website-offer.html',
  'socialmediamarketing-offer.html',
  'index-es.html',
  'social-media-marketing-es.html',
  'restaurant-website-design-es.html',
  'restaurant-advertising-es.html',
  'contact-es.html',
  'about-es.html',
  'robots.txt',
  'llms.txt',
  'favicon-bum.svg',
  'google1836ba38076ac9c6.html',
  'b214247b4ea57ca1e9e3f7523c0985db.txt', // IndexNow key (scripts/indexnow.mjs)
];

// Assets minified through esbuild on the way into public/.
const filesToMinify = [
  { file: 'shared.css', loader: 'css' },
  { file: 'shared.js', loader: 'js' },
  { file: 'pixel-canvas.js', loader: 'js' },
  { file: 'v3.css', loader: 'css' },
  { file: 'v3.js', loader: 'js' },
];

const dirsToCopy = ['images', 'videos', 'fonts', 'media'];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of filesToCopy) {
  await cp(path.join(root, file), path.join(outDir, file));
}

for (const { file, loader } of filesToMinify) {
  const source = await readFile(path.join(root, file), 'utf8');
  const result = await transform(source, { loader, minify: true, legalComments: 'none' });
  await writeFile(path.join(outDir, file), result.code);
}

// Inline shared.css into pages where it is the only render-blocking stylesheet,
// so first paint never waits on that request. The source of truth stays in
// shared.css and every other page keeps the cached <link>; only these production
// builds swap that one <link> for an inline <style> at the same position, so the
// cascade is unchanged.
{
  const cssSource = await readFile(path.join(root, 'shared.css'), 'utf8');
  const { code: inlinedCss } = await transform(cssSource, { loader: 'css', minify: true, legalComments: 'none' });
  // Match any cache-busting version (?v=...) so bumping it never breaks the build.
  const linkRe = /<link rel="stylesheet" href="\/?shared\.css(?:\?v=[^"]*)?" \/>/;
  for (const page of ['contact.html', 'contact-es.html', 'website-grader.html', 'website-grader-report.html', 'website-grader-es.html', 'website-grader-report-es.html', 'website-offer.html', 'socialmediamarketing-offer.html', 'about.html', 'about-es.html', 'restaurant-website-design.html', 'restaurant-website-design-es.html']) {
    const pagePath = path.join(outDir, page);
    const pageHtml = await readFile(pagePath, 'utf8');
    if (!linkRe.test(pageHtml)) {
      throw new Error(`Expected shared.css <link> not found in ${page}`);
    }
    await writeFile(pagePath, pageHtml.replace(linkRe, () => `<style>${inlinedCss}</style>`));
  }
}

// Demo grader (noindex): the real grader landing + report with a client-side
// mock for "June's Burger Joint", generated from the finished grader pages so
// it always matches the live grader. Recordable on any device.
await generateDemo(outDir);

for (const dir of dirsToCopy) {
  if (dir === 'videos') {
    await copyVideos(path.join(root, dir), path.join(outDir, dir));
    continue;
  }

  await cp(path.join(root, dir), path.join(outDir, dir), {
    recursive: true,
    filter: (source) => path.basename(source) !== '.DS_Store',
  });
}

// Generate the blog (EN /blog + ES /es/blog hubs, post pages, RSS feeds) and
// collect its sitemap entries.
const blogSitemapEntries = await buildBlog(root, outDir);
const areaSitemapEntries = await buildAreas(root, outDir);
const caseSitemapEntries = await buildCases(root, outDir);

// Sitemap: take the hand-maintained source and inject the generated blog URLs
// before the closing tag, so adding a post automatically updates the sitemap.
{
  const sitemapSrc = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
  if (!sitemapSrc.includes('</urlset>')) {
    throw new Error('sitemap.xml missing </urlset>');
  }
  await writeFile(path.join(outDir, 'sitemap.xml'), sitemapSrc.replace('</urlset>', `${blogSitemapEntries}\n${areaSitemapEntries}\n${caseSitemapEntries}\n</urlset>`));
}

// v3 design layer: loaded LAST on every indexable page so it wins the cascade.
// Noindex ad landing pages and the self-themed grader tool keep their current look. Blog pages get the light
// reading mode (html.v3-light). The version is a content hash, so a changed
// v3.css/v3.js is never served stale from a browser or CDN cache.
{
  const v3Version = createHash('sha1')
    .update(await readFile(path.join(root, 'v3.css')))
    .update(await readFile(path.join(root, 'v3.js')))
    .digest('hex').slice(0, 10);
  const isBlog = (rel) => /^(blog|blog-es)(\/|\.html$)/.test(rel);
  let injected = 0;
  const walkHtml = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walkHtml(full); continue; }
      if (!entry.name.endsWith('.html')) continue;
      let html = await readFile(full, 'utf8');
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      // grader-demo.html is the noindex demo copy of the grader landing; it must
      // look exactly like the real landing, so it gets v3 too.
      // Noindex pages that are part of the regular site still get v3: the demo copy
      // of the grader landing and the post-booking thank-you pages.
      const V3_NOINDEX = ['grader-demo.html', 'thank-you.html', 'thank-you-es.html'];
      const noindex = /<meta name="robots" content="noindex/i.test(html) && !V3_NOINDEX.includes(rel);
      if (!html.includes('</head>') || noindex || html.includes('/v3.css')) continue;
      // The grader reports (and their demo) ship their own focused tool layout and
      // theme. The grader landing pages are regular site pages and get v3.
      if (/^(website-grader-report|grader-demo-report)/.test(rel)) continue;
      if (isBlog(rel)) html = html.replace(/<html lang="([^"]+)"/, '<html lang="$1" class="v3-light"');
      // v3 sets every heading and paragraph in Figtree: don't spend the first
      // round trips on the two retired faces, and make sure Figtree is warm.
      html = html.replace(/\s*<link rel="preload" as="font" type="font\/woff2" href="\/fonts\/(?:plus-jakarta-sans|epilogue)-variable\.woff2"[^>]*>/g, '');
      if (!html.includes('/fonts/figtree-variable.woff2" crossorigin')) {
        html = html.replace('</head>', '  <link rel="preload" as="font" type="font/woff2" href="/fonts/figtree-variable.woff2" crossorigin />\n</head>');
      }
      html = html.replace('</head>', `  <link rel="stylesheet" href="/v3.css?v=${v3Version}" />\n</head>`);
      html = html.replace('</body>', `  <script src="/v3.js?v=${v3Version}" defer></script>\n</body>`);
      await writeFile(full, html);
      injected += 1;
    }
  };
  await walkHtml(outDir);
  console.log(`v3 design layer on ${injected} pages (v=${v3Version})`);
}

console.log(`Built static site into ${outDir}`);

async function copyVideos(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  await walkAndProcess(sourceDir, targetDir);
}

async function walkAndProcess(currentSourceDir, currentTargetDir) {
  await mkdir(currentTargetDir, { recursive: true });
  const entries = await readdir(currentSourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;

    const sourcePath = path.join(currentSourceDir, entry.name);
    const targetPath = path.join(currentTargetDir, entry.name);

    if (entry.isDirectory()) {
      await walkAndProcess(sourcePath, targetPath);
      continue;
    }

    await cp(sourcePath, targetPath);
  }
}
