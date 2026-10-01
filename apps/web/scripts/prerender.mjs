// Renders every route to static HTML after `vite build`, so search engines and
// link previews get full content and per-page meta without running JavaScript.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const serverDir = path.join(root, 'dist-server');

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const { render, ROUTES, NOT_FOUND, absoluteUrl } = await import(
  pathToFileURL(path.join(serverDir, 'entry-server.js')).href
);

function page(url) {
  const { html, head } = render(url);
  return template.replace('<!--app-head-->', head).replace('<!--app-html-->', html);
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  console.log(`  prerendered ${path.relative(root, file)}`);
}

for (const route of Object.values(ROUTES)) {
  const out = route.path === '/' ? 'index.html' : `${route.path.slice(1)}.html`;
  write(path.join(dist, out), page(route.path));
}
write(path.join(dist, '404.html'), page(NOT_FOUND.path));

const today = new Date().toISOString().slice(0, 10);
const urls = Object.values(ROUTES)
  .filter((r) => !r.noindex)
  .map(
    (r) => `  <url>
    <loc>${absoluteUrl(r.path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
  </url>`,
  )
  .join('\n');
write(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);

fs.rmSync(serverDir, { recursive: true, force: true });
