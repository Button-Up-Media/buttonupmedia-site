// Make WebP copies of the blog hero JPGs (full 1600px and an 800px phone size).
// The build swaps blog <img> tags to these when they exist; the JPGs stay for
// og:image and as the fallback if sharp isn't available.
//
// Runs automatically:
//   - at the start of every build (scripts/build-public.mjs), so any post whose
//     WebP copies are missing gets them, locally and on Vercel;
//   - when a post is published (scripts/publish-next.mjs), which also commits
//     the new post's WebP files.
// Manual run:  node scripts/optimize-blog-images.mjs   (skips files that exist)
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

const exists = (p) => stat(p).then(() => true, () => false);

export async function optimizeBlogImages(root = process.cwd()) {
  const dir = path.join(root, 'images', 'blog');
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('optimize-blog-images: sharp not available, blog images stay JPG');
    return { made: 0, files: [] };
  }
  const files = [];
  for (const name of await readdir(dir)) {
    if (!/\.(jpe?g|png)$/i.test(name)) continue;
    const base = name.replace(/\.(jpe?g|png)$/i, '');
    const src = path.join(dir, name);
    const full = path.join(dir, `${base}.webp`);
    const small = path.join(dir, `${base}-800.webp`);
    try {
      if (!(await exists(full))) { await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 72 }).toFile(full); files.push(full); }
      if (!(await exists(small))) { await sharp(src).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 70 }).toFile(small); files.push(small); }
    } catch (err) {
      // One bad source image must never break the build; that post keeps its JPG.
      console.warn(`optimize-blog-images: skipped ${name} (${err.message})`);
    }
  }
  console.log(`optimize-blog-images: ${files.length} WebP files written`);
  return { made: files.length, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await optimizeBlogImages(process.cwd());
}
