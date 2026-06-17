import { cp, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { transform } from 'esbuild';

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
  'index-es.html',
  'social-media-marketing-es.html',
  'restaurant-website-design-es.html',
  'contact-es.html',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'favicon-bum.svg',
  'google1836ba38076ac9c6.html',
];

// Assets minified through esbuild on the way into public/.
const filesToMinify = [
  { file: 'shared.css', loader: 'css' },
  { file: 'shared.js', loader: 'js' },
  { file: 'website-design-redesign.js', loader: 'js' },
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

// Inline the page-specific redesign CSS into the restaurant page so it is not a
// render-blocking request that stalls the hero paint. The source of truth stays
// in website-design-redesign.css and the raw/dev HTML keeps its <link>; only the
// production build swaps that <link> for an inline <style> at the same position,
// so the cascade is unchanged.
{
  const cssSource = await readFile(path.join(root, 'website-design-redesign.css'), 'utf8');
  const { code: inlinedCss } = await transform(cssSource, { loader: 'css', minify: true, legalComments: 'none' });
  const linkTag = '<link rel="stylesheet" href="website-design-redesign.css" />';
  for (const page of ['restaurant-website-design.html', 'restaurant-website-design-es.html']) {
    const pagePath = path.join(outDir, page);
    const pageHtml = await readFile(pagePath, 'utf8');
    if (!pageHtml.includes(linkTag)) {
      throw new Error(`Expected redesign CSS <link> not found in ${page}`);
    }
    await writeFile(pagePath, pageHtml.replace(linkTag, `<style>${inlinedCss}</style>`));
  }
}

// Inline shared.css into pages where it is the only render-blocking stylesheet,
// so first paint never waits on that request. The source of truth stays in
// shared.css and every other page keeps the cached <link>; only these production
// builds swap that one <link> for an inline <style> at the same position, so the
// cascade is unchanged.
{
  const cssSource = await readFile(path.join(root, 'shared.css'), 'utf8');
  const { code: inlinedCss } = await transform(cssSource, { loader: 'css', minify: true, legalComments: 'none' });
  const linkTag = '<link rel="stylesheet" href="shared.css?v=nav-mobile-2" />';
  for (const page of ['contact.html', 'contact-es.html', 'smm-strategy-call.html', 'smm-strategy-call-es.html']) {
    const pagePath = path.join(outDir, page);
    const pageHtml = await readFile(pagePath, 'utf8');
    if (!pageHtml.includes(linkTag)) {
      throw new Error(`Expected shared.css <link> not found in ${page}`);
    }
    await writeFile(pagePath, pageHtml.replace(linkTag, `<style>${inlinedCss}</style>`));
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
