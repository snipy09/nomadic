// Runs after the client and SSR builds. Writes one static HTML file per route, so crawlers and
// slow connections get real content and per-page tags before any JavaScript runs.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(web, 'dist');
const ssrDir = resolve(web, 'dist-ssr');

const server = await import(pathToFileURL(resolve(ssrDir, 'entry-server.js')).href);
const template = await readFile(resolve(dist, 'index.html'), 'utf8');

const HEAD_MARK = '<!--seo-head-->';
const ROOT_MARK = '<div id="root"></div>';
if (!template.includes(HEAD_MARK) || !template.includes(ROOT_MARK)) {
  throw new Error('dist/index.html is missing the seo-head or root marker.');
}

// Vercel serves these through cleanUrls: /download is answered by download.html.
const FILES = {
  home: 'index.html',
  download: 'download.html',
  terms: 'terms.html',
  privacy: 'privacy.html',
  notfound: '404.html',
};

const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

for (const [id, file] of Object.entries(FILES)) {
  const page = server.PAGES[id];
  const ld = server.jsonLd(id);
  const head = [server.headTags(id)];
  if (ld) head.push(`<script type="application/ld+json" id="ld-json">${safeJson(ld)}</script>`);

  const body = server.render(page.path);
  // Function replacers: page text can contain "$", which String.replace would treat as a pattern.
  const html = template
    .replace(HEAD_MARK, () => head.join('\n    '))
    .replace(ROOT_MARK, () => `<div id="root">${body}</div>`);

  await writeFile(resolve(dist, file), html);
  console.log(`prerendered ${page.path.padEnd(10)} -> ${file} (${(html.length / 1024).toFixed(1)} kB)`);
}

const urls = Object.entries(server.PAGES)
  .filter(([, page]) => page.index)
  .map(
    ([, page]) =>
      `  <url>\n    <loc>https://nomadicai.vercel.app${page.path}</loc>\n    <lastmod>${page.updated}</lastmod>\n    <priority>${page.priority}</priority>\n  </url>`,
  )
  .join('\n');

await writeFile(
  resolve(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log('wrote sitemap.xml');

await rm(ssrDir, { recursive: true, force: true });
