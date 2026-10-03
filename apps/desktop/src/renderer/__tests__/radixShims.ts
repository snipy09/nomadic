// jsdom gaps used by Radix primitives (Checkbox, RadioGroup, Dialog). Import before rendering.
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
