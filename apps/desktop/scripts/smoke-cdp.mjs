// Smoke test for a packaged build started with --remote-debugging-port=<port>: connects over CDP,
// waits until the app window shows text and prints it. Read only: it never clicks, signs in or submits.
// Usage: node apps/desktop/scripts/smoke-cdp.mjs [port]
import { chromium } from 'playwright-core';

const port = process.argv[2] ?? '9333';
const deadline = Date.now() + 90_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let browser = null;
while (!browser) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  } catch (err) {
    if (Date.now() > deadline) {
      console.error(`Could not connect to the app on port ${port}: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    await sleep(1000);
  }
}

let text = '';
while (Date.now() < deadline) {
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('index.html'));
  if (page) {
    text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    if (text.trim().length > 20) break;
  }
  await sleep(1000);
}

await browser.close().catch(() => {});
if (text.trim().length <= 20) {
  console.error('The app window did not show any content within 90 seconds.');
  process.exit(1);
}
console.log('App window text (first 400 characters):');
console.log(text.trim().slice(0, 400));
