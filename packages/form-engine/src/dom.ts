/**
 * Frame / shadow-DOM helpers shared by the reader, writers and verifier.
 */
import type { ElementHandle, Frame, Page } from 'playwright';
import type { FormField } from './contracts.js';

const NAME_SHIM = 'window.__name = window.__name || ((f) => f);';

/**
 * Some TS toolchains (tsx, esbuild keepNames) wrap functions in `__name(...)`;
 * functions serialized into the page then reference a helper that does not
 * exist there. Install a no-op shim in the frame before evaluating.
 */
export async function prepareFrame(frame: Frame): Promise<void> {
  await frame.evaluate(NAME_SHIM).catch(() => {});
}

export function frameAt(page: Page, index: number): Frame | null {
  const frames = page.frames();
  return frames[index] || null;
}

/** Resolve an element inside a frame, walking open shadow roots. */
export async function resolveElement(
  page: Page,
  frameIndex: number,
  selector: string,
  shadowHostPath?: string[]
): Promise<ElementHandle<Element> | null> {
  const frame = frameAt(page, frameIndex);
  if (!frame) return null;
  await prepareFrame(frame);
  const handle = await frame
    .evaluateHandle(({ sel, hosts }) => {
      let root: Document | ShadowRoot = document;
      for (const h of hosts) {
        const host: Element | null = root.querySelector(h);
        if (!host || !host.shadowRoot) return null;
        root = host.shadowRoot;
      }
      return root.querySelector(sel);
    }, { sel: selector, hosts: shadowHostPath || [] })
    .catch(() => null);
  if (!handle) return null;
  const el = handle.asElement();
  if (!el) {
    await handle.dispose().catch(() => {});
    return null;
  }
  return el as ElementHandle<Element>;
}

export function resolveField(page: Page, field: FormField, selector = field.selector): Promise<ElementHandle<Element> | null> {
  return resolveElement(page, field.frameIndex, selector, field.shadowHostPath);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Normalize text for comparisons. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[*✱✳]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.:?]+$/, '')
    .trim();
}
