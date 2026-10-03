import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom gaps used by Radix primitives.
if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;

  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
}
