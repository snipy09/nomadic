import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PLANS as CONFIG_PLANS, formatPrice, pricingSentence } from '@nomadic/config';
import { PLANS } from '../content';
import { jsonLd } from '../jsonld';
import { PAGES, headTags, ogImageFor } from '../seo';
import { PRIVACY } from '@nomadic/config';
import { DATA_HANDLING } from '../content';
// @ts-expect-error plain ESM build script without type declarations
import { cardSvg, wrap } from '../../scripts/og.mjs';

const SRC = resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('pricing is defined once (packages/config)', () => {
  it('renders the config plans and prices', () => {
    expect(PLANS.map((p) => [p.id, p.price])).toEqual(CONFIG_PLANS.map((p) => [p.id, formatPrice(p.priceInr)]));
  });

  it('has no hard-coded rupee amounts in the site source', () => {
    const offenders = sourceFiles(SRC).filter((f) => /₹\s?\d/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('puts the same prices in the JSON-LD offers', () => {
    const graph = (jsonLd('home') as { '@graph': Array<Record<string, unknown>> })['@graph'];
    const app = graph.find((n) => n['@type'] === 'SoftwareApplication') as { offers: Array<{ name: string; price: string; priceCurrency: string }> };
    expect(app.offers.map((o) => [o.name, Number(o.price), o.priceCurrency])).toEqual(CONFIG_PLANS.map((p) => [p.name, p.priceInr, 'INR']));
  });

  it('puts the config pricing sentence on the home share card', () => {
    expect(PAGES.home.og.sub).toBe(pricingSentence());
  });
});

describe('share cards and head tags', () => {
  it('points every indexable page at its own generated image', () => {
    for (const id of ['home', 'download', 'terms', 'privacy'] as const) {
      expect(headTags(id)).toContain(`content="${ogImageFor(id)}"`);
    }
    expect(ogImageFor('notfound')).toBe(ogImageFor('home'));
  });

  it('wraps text without exceeding the line budget', () => {
    const lines: string[] = wrap('Your whole job search, in one window.', 88, 0.74, 1040);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(Math.floor(1040 / (88 * 0.74)));
  });

  it('escapes text in the card SVG', () => {
    expect(cardSvg({ heading: 'A <b> & C', sub: 'x', site: 'example.org' })).toContain('A &lt;b&gt; &amp; C');
  });
});

describe('privacy content', () => {
  it('has the home band and the shared policy', () => {
    expect(DATA_HANDLING.length).toBeGreaterThan(0);
    expect(PRIVACY.sections.map((s) => s.title)).toEqual(expect.arrayContaining(['What we collect', 'Where your data is stored', 'Who we share it with', 'Your rights']));
  });

  it('does not repeat claims the app contradicts', () => {
    const text = JSON.stringify([DATA_HANDLING, PRIVACY]).toLowerCase();
    // Profiles, resumes and applications ARE synced to the account; AI goes through our server.
    expect(text).not.toContain('never store your resume text');
    expect(text).not.toContain('your own groq or gemini key');
    expect(text).toContain('resumes');
  });
});
