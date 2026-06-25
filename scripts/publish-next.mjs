// Phase 2 publisher. Promotes the next "ready" catalog post to live:
// adds it to blog/posts.json (newest first), marks the calendar entry published,
// rebuilds, commits, and pushes to main (Vercel deploys).
// Pure + deterministic: no AI at publish time, the content is already written + gated.
//
// Usage:
//   node scripts/publish-next.mjs --dry   (show what would publish, no changes)
//   node scripts/publish-next.mjs         (publish for real)
//
// Output (last line, tab-separated for easy parsing by the scheduler):
//   PUBLISHED\t<title>\t<url>     on success
//   EMPTY                          when the catalog has no ready posts
//   ERROR\t<reason>               on a problem
import { readFile, writeFile, access } from 'fs/promises';
import { execSync } from 'child_process';

const root = process.cwd();
const DRY = process.argv.includes('--dry');
const BASE = 'https://www.buttonupmedia.com';

function todayET() {
  // The scheduler runs on this Mac (America/New_York), so local date == ET date.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const fail = (reason) => { console.log(`ERROR\t${reason}`); process.exit(1); };

const cal = JSON.parse(await readFile('blog/calendar.json', 'utf8'));
const next = cal.queue.find((e) => e.status === 'ready');
if (!next) { console.log('EMPTY'); process.exit(0); }

// Sanity: content (EN + ES) and the hero image must exist before we publish.
for (const lang of ['en', 'es']) {
  if (!(await exists(`blog/content/${next.id}.${lang}.json`))) fail(`missing blog/content/${next.id}.${lang}.json`);
}
if (!(await exists(`images/blog/${next.id}.jpg`))) fail(`missing images/blog/${next.id}.jpg`);

const content = JSON.parse(await readFile(`blog/content/${next.id}.en.json`, 'utf8'));
const title = content.h1 || (next.en && next.en.title) || next.id;
const url = `${BASE}/blog/${next.en.slug}`;
const date = todayET();

if (DRY) { console.log(`DRY\tWould publish: ${title}\t${url}\t(date ${date})`); process.exit(0); }

// Promote: newest post goes to the top of posts.json so it becomes the featured article.
const posts = JSON.parse(await readFile('blog/posts.json', 'utf8'));
if (posts.some((p) => p.id === next.id)) fail(`${next.id} already in posts.json`);
posts.unshift({
  id: next.id, category: next.category, author: next.author, date,
  hero: `/images/blog/${next.id}.jpg`, heroAlt: next.heroAlt || '',
  en: { slug: next.en.slug }, es: { slug: next.es.slug },
});
next.status = 'published';
next.publishedDate = date;

await writeFile('blog/posts.json', JSON.stringify(posts, null, 2));
await writeFile('blog/calendar.json', JSON.stringify(cal, null, 2));

// Build, then commit ONLY the two manifest files (leaves any unrelated working-tree changes alone).
try {
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
  execSync('git add blog/posts.json blog/calendar.json', { cwd: root, stdio: 'inherit' });
  execSync(`git commit -q -m ${JSON.stringify('Publish blog post: ' + next.id)}`, { cwd: root, stdio: 'inherit' });
  execSync('git push origin main', { cwd: root, stdio: 'inherit' });
} catch (e) {
  fail(`build/commit/push failed: ${e.message}`);
}

console.log(`PUBLISHED\t${title}\t${url}`);
