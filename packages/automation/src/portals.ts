import type { Page } from 'playwright';

/** True when the page already shows an application form (several visible text-like inputs). */
async function formLooksOpen(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const fields = Array.from(document.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=search]), textarea, select'));
      const visible = fields.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      });
      return visible.length >= 3;
    })
    .catch(() => false);
}

async function clickFirstVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && (await el.isVisible().catch(() => false))) {
        await el.click({ timeout: 2500 }).catch(() => {});
        return true;
      }
    } catch {
      /* try next selector */
    }
  }
  return false;
}

/**
 * Portal-specific "get to the form" quirks only (no filling, no submitting).
 * Filling is always done by the shared form engine. Returns the page that holds the form
 * (a popup/new tab when the portal opens one).
 */
export async function openPortalApplication(page: Page, url: string): Promise<Page> {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (!host) return page;
  if (await formLooksOpen(page)) return page;

  const ctx = page.context();
  const waitForPopup = () => ctx.waitForEvent('page', { timeout: 1800 }).catch(() => null);
  let target = page;

  if (host.endsWith('internshala.com')) {
    const popup = waitForPopup();
    const clicked = await clickFirstVisible(page, [
      '#apply_now_button', 'button#apply_now_button', 'a#apply_now_button', '.apply_now_button',
      'button:has-text("Apply now")', 'a:has-text("Apply now")', 'button.btn-primary:has-text("Apply")', 'a[href*="/application/form"]',
    ]);
    const opened = await popup;
    if (opened) {
      target = opened;
      await target.waitForLoadState('domcontentloaded').catch(() => {});
    }
    if (clicked) await target.waitForTimeout(700);
    // Internshala shows an intermediate "Proceed to application" step after choosing the resume.
    await clickFirstVisible(target, [
      '#proceed_to_application', 'button:has-text("Proceed to application")', 'a:has-text("Proceed to application")', '.proceed_to_application',
    ]);
    await target.waitForTimeout(400);
  } else if (host.endsWith('lever.co')) {
    if (!new URL(url).pathname.replace(/\/+$/, '').endsWith('/apply')) {
      await clickFirstVisible(page, ['a.postings-btn', 'a[href$="/apply"]', 'a:has-text("Apply for this job")']);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  } else if (host.endsWith('greenhouse.io')) {
    await clickFirstVisible(page, ['#apply_button', 'a#apply_button', 'a[href*="#app"]', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this job")']);
    await page.waitForTimeout(400);
  } else if (host.endsWith('ashbyhq.com')) {
    await clickFirstVisible(page, ['a:has-text("Apply for this job")', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this role")', 'a:has-text("Apply")']);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
  return target;
}
