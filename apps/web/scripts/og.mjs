// Builds one 1200x630 share card per page at build time (called by prerender.mjs).
// Text comes from PAGES[id].og in src/seo.ts; the home card carries the prices from packages/config.
// Fonts: static subsets of Archivo (SIL OFL 1.1, see og-fonts/OFL.txt), so output is identical on any machine.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = fileURLToPath(new URL('.', import.meta.url));
const FONTS = [resolve(here, 'og-fonts/Archivo-Wide-ExtraBold.ttf'), resolve(here, 'og-fonts/Archivo-SemiBold.ttf')];

const W = 1200;
const H = 630;
const PAD = 80;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word wrap by an average glyph width; conservative so lines never touch the edge. */
export function wrap(text, fontSize, widthFactor, maxWidth) {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * widthFactor)));
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function headingLayout(text) {
  // Shrink until the heading fits in three lines.
  for (const size of [88, 76, 64, 56]) {
    const lines = wrap(text, size, 0.74, W - PAD * 2);
    if (lines.length <= 3) return { size, lines };
  }
  return { size: 56, lines: wrap(text, 56, 0.74, W - PAD * 2).slice(0, 3) };
}

// The Nomadic wordmark, as drawn by the site's preloader (index.html).
const LOGO = `
  <g transform="translate(${PAD} 64) scale(0.62)">
    <g transform="translate(-18 -23)">
      <path d="M24 29H50V99H24Z" fill="#fff"/>
      <path d="M78 29H104V99H78Z" fill="#fff"/>
      <path d="M24 29H50L104 99H78Z" fill="#FFC21A"/>
      <g transform="translate(128 99)" fill="none" stroke="#fff" stroke-width="14">
        <path d="M7 0V-44M37 0V-22A15 15 0 0 0 7 -22"/>
        <circle cx="72" cy="-22" r="15"/>
        <path d="M107 0V-44M137 0V-22A15 15 0 0 0 107 -22M167 0V-22A15 15 0 0 0 137 -22"/>
        <circle cx="202" cy="-22" r="15"/>
        <path d="M217 0V-44"/>
        <circle cx="252" cy="-22" r="15"/>
        <path d="M267 0V-70"/>
        <path d="M288 0V-44"/>
        <path d="M335.15 -32.04A15 15 0 1 0 335.15 -11.96"/>
        <circle cx="288" cy="-59" r="8" fill="#FFC21A" stroke="none"/>
      </g>
    </g>
  </g>`;

export function cardSvg({ heading, sub, site }) {
  const { size, lines } = headingLayout(heading);
  const lineHeight = Math.round(size * 1.08);
  const subLines = wrap(sub, 32, 0.5, W - PAD * 2).slice(0, 2);
  const headingTop = 160 + size;
  // Directly under the heading, or pinned near the bottom for short headings.
  const subTop = Math.max(headingTop + (lines.length - 1) * lineHeight + 70, H - PAD - 10 - (subLines.length - 1) * 42);
  const tspans = lines.map((l, i) => `<tspan x="${PAD}" y="${headingTop + i * lineHeight}">${esc(l)}</tspan>`).join('');
  const subSpans = subLines.map((l, i) => `<tspan x="${PAD}" y="${subTop + i * 42}">${esc(l)}</tspan>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0A0F2C"/>
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="#FFC21A"/>
  ${LOGO}
  <text font-family="Archivo" font-weight="800" font-stretch="expanded" font-size="${size}" fill="#FFFFFF">${tspans}</text>
  <text font-family="Archivo" font-weight="600" font-size="32" fill="#FFC21A">${subSpans}</text>
  <text x="${W - PAD}" y="76" text-anchor="end" font-family="Archivo" font-weight="600" font-size="24" fill="#A9B0D0">${esc(site)}</text>
</svg>`;
}

export function renderPng(svg) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Archivo' },
  });
  return r.render().asPng();
}

/** Writes dist/og/<id>.png for every page except the 404 (which reuses the home card). */
export async function writeOgImages(pages, distDir, site) {
  const outDir = resolve(distDir, 'og');
  await mkdir(outDir, { recursive: true });
  const host = new URL(site).host;
  for (const [id, page] of Object.entries(pages)) {
    if (id === 'notfound') continue;
    const png = renderPng(cardSvg({ heading: page.og.heading, sub: page.og.sub, site: host }));
    await writeFile(resolve(outDir, `${id}.png`), png);
    console.log(`og image   ${id.padEnd(9)} -> og/${id}.png (${(png.length / 1024).toFixed(1)} kB)`);
  }
}
