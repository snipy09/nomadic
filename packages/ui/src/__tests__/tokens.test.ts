import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colorTokenNames, colors, fontSize, hexToChannels } from '../tokens';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const css = readFileSync(here('../styles.css'), 'utf8');
const require = createRequire(import.meta.url);
const preset = require('../../tailwind-preset.cjs');

/** Pull `--nm-*` declarations out of the first block matching `selector {`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `selector ${selector}`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--nm-([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe('design tokens', () => {
  it('styles.css light/dark variables match tokens.ts', () => {
    const light = block("[data-theme='light']");
    const dark = block(':root.dark');
    const media = block("  :root:not([data-theme='light']):not(.light)");
    for (const name of colorTokenNames) {
      expect(light[name], `light ${name}`).toBe(hexToChannels(colors.light[name]));
      expect(dark[name], `dark ${name}`).toBe(hexToChannels(colors.dark[name]));
      expect(media[name], `media ${name}`).toBe(hexToChannels(colors.dark[name]));
    }
  });

  it('Tailwind preset exposes every colour token', () => {
    const c = preset.theme.extend.colors;
    const flat = new Set<string>();
    for (const [k, v] of Object.entries(c)) {
      if (typeof v === 'string') flat.add(v);
      else for (const vv of Object.values(v as Record<string, string>)) flat.add(vv);
      void k;
    }
    for (const name of colorTokenNames) {
      expect(flat.has(`rgb(var(--nm-${name}) / <alpha-value>)`), name).toBe(true);
    }
  });

  it('Tailwind preset type scale matches tokens.ts', () => {
    const fs = preset.theme.extend.fontSize as Record<string, [string, { lineHeight: string; letterSpacing: string }]>;
    for (const [name, [size, lh, ls]] of Object.entries(fontSize)) {
      expect(fs[name]).toEqual([size, { lineHeight: lh, letterSpacing: ls }]);
    }
  });

  it('accent text has AA contrast on surfaces in both themes', () => {
    const lum = (hex: string) => {
      const [r, g, b] = hexToChannels(hex).split(' ').map((n) => {
        const c = Number(n) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const t of ['light', 'dark'] as const) {
      const p = colors[t];
      expect(ratio(p['accent-fg'], p.accent), `${t} accent button`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.fg, p.surface), `${t} fg`).toBeGreaterThanOrEqual(7);
      expect(ratio(p['fg-muted'], p.surface), `${t} fg-muted`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p['fg-subtle'], p.surface), `${t} fg-subtle`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p['accent-subtle-fg'], p['accent-subtle']), `${t} accent subtle`).toBeGreaterThanOrEqual(4.5);
      for (const s of ['success', 'warning', 'danger'] as const) {
        expect(ratio(p[`${s}-fg`], p[`${s}-subtle`]), `${t} ${s} badge`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
