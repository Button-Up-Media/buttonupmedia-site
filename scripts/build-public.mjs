import { cp, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { transform } from 'esbuild';
import { buildBlog } from './build-blog.mjs';

const root = process.cwd();
const outDir = path.join(root, 'public');

const filesToCopy = [
  'index.html',
  'about.html',
  'case-studies.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'gmcp.html',
  'restaurant-advertising.html',
  'restaurant-seo.html',
  'restaurant-website-design.html',
  'services.html',
  'social-media-marketing.html',
  'smm-strategy-call.html',
  'smm-strategy-call-es.html',
  'restaurant-social-media.html',
  'restaurant-social-media-es.html',
  'restaurant-websites.html',
  'restaurant-websites-es.html',
  'restaurant-paid-ads.html',
  'restaurant-paid-ads-es.html',
  'website-grader.html',
  'website-grader-report.html',
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
];

// Assets minified through esbuild on the way into public/.
const filesToMinify = [
  { file: 'shared.css', loader: 'css' },
  { file: 'shared.js', loader: 'js' },
  { file: 'pixel-canvas.js', loader: 'js' },
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
  const linkRe = /<link rel="stylesheet" href="shared\.css(?:\?v=[^"]*)?" \/>/;
  for (const page of ['contact.html', 'contact-es.html', 'smm-strategy-call.html', 'smm-strategy-call-es.html', 'restaurant-social-media.html', 'restaurant-social-media-es.html', 'restaurant-websites.html', 'restaurant-websites-es.html', 'restaurant-paid-ads.html', 'restaurant-paid-ads-es.html', 'website-grader.html', 'website-grader-report.html', 'about.html', 'about-es.html', 'restaurant-website-design.html', 'restaurant-website-design-es.html']) {
    const pagePath = path.join(outDir, page);
    const pageHtml = await readFile(pagePath, 'utf8');
    if (!linkRe.test(pageHtml)) {
      throw new Error(`Expected shared.css <link> not found in ${page}`);
    }
    await writeFile(pagePath, pageHtml.replace(linkRe, () => `<style>${inlinedCss}</style>`));
  }
}

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

// Sitemap: take the hand-maintained source and inject the generated blog URLs
// before the closing tag, so adding a post automatically updates the sitemap.
{
  const sitemapSrc = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
  if (!sitemapSrc.includes('</urlset>')) {
    throw new Error('sitemap.xml missing </urlset>');
  }
  await writeFile(path.join(outDir, 'sitemap.xml'), sitemapSrc.replace('</urlset>', `${blogSitemapEntries}\n</urlset>`));
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
