import { cp, mkdir, rm } from 'fs/promises';
import path from 'path';

const root = process.cwd();
const outDir = path.join(root, 'public');

const filesToCopy = [
  'index.html',
  'about.html',
  'case-studies.html',
  'contact.html',
  'privacy.html',
  'restaurant-advertising.html',
  'restaurant-seo.html',
  'restaurant-website-design.html',
  'services.html',
  'social-media-marketing.html',
  'shared.css',
  'shared.js',
  'website-design-redesign.css',
  'website-design-redesign.js',
  'pixel-canvas.js',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'favicon-bum.svg',
];

const dirsToCopy = ['images', 'videos'];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of filesToCopy) {
  await cp(path.join(root, file), path.join(outDir, file));
}

for (const dir of dirsToCopy) {
  await cp(path.join(root, dir), path.join(outDir, dir), {
    recursive: true,
    filter: (source) => path.basename(source) !== '.DS_Store',
  });
}

console.log(`Built static site into ${outDir}`);
