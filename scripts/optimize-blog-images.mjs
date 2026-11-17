// Make WebP copies of the blog hero JPGs (full 1600px and an 800px phone size).
// The build swaps blog <img> tags to these when they exist; the JPGs stay for
// og:image and as the fallback for any post published before this runs.
//   node scripts/optimize-blog-images.mjs        (skips files that already exist)
import { readdir, stat } from 'fs/promises';
import path from 'path';

const dir = path.join(process.cwd(), 'images', 'blog');
let sharp;
try { sharp = (await import('sharp')).default; } catch { console.log('optimize-blog-images: sharp not available, skipped'); process.exit(0); }

const exists = (p) => stat(p).then(() => true, () => false);
let made = 0;
for (const name of await readdir(dir)) {
  if (!/\.(jpe?g|png)$/i.test(name)) continue;
  const base = name.replace(/\.(jpe?g|png)$/i, '');
  const src = path.join(dir, name);
  const full = path.join(dir, `${base}.webp`);
  const small = path.join(dir, `${base}-800.webp`);
  if (!(await exists(full))) { await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 72 }).toFile(full); made++; }
  if (!(await exists(small))) { await sharp(src).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 70 }).toFile(small); made++; }
}
console.log(`optimize-blog-images: ${made} WebP files written`);
