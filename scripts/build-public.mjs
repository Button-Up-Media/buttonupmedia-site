import { cp, mkdir, readdir, rm } from 'fs/promises';
import { spawnSync } from 'child_process';
import path from 'path';

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

    if (path.extname(entry.name).toLowerCase() === '.mp4') {
      await transcodeVideo(sourcePath, targetPath);
      continue;
    }

    await cp(sourcePath, targetPath);
  }
}

async function transcodeVideo(sourcePath, targetPath) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      sourcePath,
      '-vf',
      "scale='min(960,iw)':-2",
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '34',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      targetPath,
    ],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.warn(`Falling back to copy for video: ${sourcePath}`);
    await cp(sourcePath, targetPath);
  }
}
