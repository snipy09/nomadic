/**
 * Renders the showcase in light and dark and saves screenshots to showcase/screenshots/.
 *
 *   npm run showcase:screenshots --workspace packages/ui
 *
 * Uses the Playwright Chromium already on the machine. Set CHROMIUM_PATH to override
 * the executable (defaults to Playwright's own lookup, then /opt/pw-browsers/chromium).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const outDir = here('./screenshots/');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ configFile: here('./vite.config.ts'), server: { port: 5199, strictPort: false }, logLevel: 'warn' });
await server.listen();
const base = server.resolvedUrls.local[0];

const fallback = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(fallback) ? fallback : undefined);
const browser = await chromium.launch({ executablePath });

async function shot(name, { theme, open, fullPage = true, width = 1440, height = 900, action, reducedMotion = 'reduce' }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion, colorScheme: theme });
  const q = new URLSearchParams({ theme, ...(open ? { open } : {}) });
  await page.goto(`${base}?${q}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (fullPage) {
    // The app shell scrolls its <main>; grow the viewport so the whole page is captured.
    const h = await page.evaluate(() => {
      const main = document.querySelector('main');
      return (main?.scrollHeight ?? 900) + 48;
    });
    await page.setViewportSize({ width, height: h });
  }
  if (action) await action(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}${name}.png` });
  await page.close();
  console.log('saved', `${name}.png`);
}

try {
  for (const theme of ['light', 'dark']) {
    await shot(`showcase-${theme}`, { theme });
    await shot(`dialog-${theme}`, { theme, open: 'dialog', fullPage: false });
    await shot(`drawer-${theme}`, { theme, open: 'drawer', fullPage: false });
    await shot(`popovers-${theme}`, {
      theme,
      fullPage: false,
      action: async (page) => {
        await page.locator('#forms').scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: 'Success' }).click();
        await page.getByRole('button', { name: 'With action' }).click();
        await page.locator('#forms').evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.getByRole('combobox', { name: 'Target role' }).click();
        await page.keyboard.type('eng');
      },
    });
  }
} finally {
  await browser.close();
  await server.close();
}
