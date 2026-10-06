/**
 * User-like input from inside the page (no Playwright, no trusted events): pointer/mouse
 * sequences, per-key typing, React-safe value setting, file attachment via DataTransfer.
 *
 * Native setters and constructors are captured when the agent loads (document start, before
 * the page's scripts), so pages that patch prototypes or wrap `value` (React's value tracker)
 * cannot interfere with writes.
 */
const valueSetters = new Map<unknown, ((this: Element, v: string) => void) | undefined>([
  [HTMLInputElement.prototype, Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set],
  [HTMLTextAreaElement.prototype, Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set],
  [HTMLSelectElement.prototype, Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set],
]);
const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
const nativeSetTimeout = window.setTimeout.bind(window);
const NativeDataTransfer = window.DataTransfer;
const NativeFile = window.File;

export const sleep = (ms: number) => new Promise<void>((r) => nativeSetTimeout(r, ms));

function protoOf(el: Element): unknown {
  return el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
}

/** Set `value` through the prototype setter, bypassing instance overrides (React value tracker). */
export function setValueRaw(el: Element, v: string): void {
  const set = valueSetters.get(protoOf(el));
  if (set) set.call(el, v);
  else (el as HTMLInputElement).value = v;
}

const FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex], [contenteditable=""], [contenteditable="true"]';

export function scrollIntoViewIfNeeded(el: Element): void {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  if (r.top < 0 || r.left < 0 || r.bottom > vh || r.right > vw) {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { el.scrollIntoView(); }
  }
}

function pointFor(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function mouseInit(el: Element, buttons: number, detail: number): MouseEventInit & PointerEventInit {
  const { x, y } = pointFor(el);
  return { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons, detail, pointerId: 1, pointerType: 'touch', isPrimary: true };
}

/**
 * Tap an element the way a browser dispatches a real tap: pointerdown, mousedown (moves
 * focus unless prevented), pointerup, mouseup, click. Widgets that open on mousedown
 * (react-select) and ones that act on click both respond.
 */
export function userClick(el: Element): void {
  scrollIntoViewIfNeeded(el);
  const Pointer = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Pointer('pointerdown', mouseInit(el, 1, 0)));
  const down = el.dispatchEvent(new MouseEvent('mousedown', mouseInit(el, 1, 1)));
  if (down) {
    const f = el.closest(FOCUSABLE) as HTMLElement | null;
    if (f && f !== document.activeElement && !(f as HTMLInputElement).disabled) f.focus({ preventScroll: true });
  }
  el.dispatchEvent(new Pointer('pointerup', mouseInit(el, 0, 0)));
  el.dispatchEvent(new MouseEvent('mouseup', mouseInit(el, 0, 1)));
  el.dispatchEvent(new MouseEvent('click', mouseInit(el, 0, 1)));
}

/** Desktop's clickLikeUser: click the <label> of a (often hidden) radio/checkbox, else tap the element. */
export function clickLikeUser(el: Element, opts: { preferLabel?: boolean } = {}): void {
  if (opts.preferLabel) {
    const inp = el as HTMLInputElement;
    const root = el.getRootNode() as Document | ShadowRoot;
    const lbl = (inp.id && root.querySelector(`label[for="${CSS.escape(inp.id)}"]`)) || inp.closest('label');
    if (lbl) { (lbl as HTMLElement).click(); return; }
  }
  userClick(el);
}

const KEY_CODES: Record<string, number> = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9, Backspace: 8 };

function keyInit(key: string): KeyboardEventInit & { keyCode: number; which: number; charCode?: number } {
  const keyCode = KEY_CODES[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  return { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, bubbles: true, cancelable: true, composed: true, view: window, keyCode, which: keyCode };
}

/** Press a named key on the focused element. */
export function pressKey(key: string): void {
  const t = (document.activeElement as Element | null) || document.body;
  t.dispatchEvent(new KeyboardEvent('keydown', keyInit(key)));
  t.dispatchEvent(new KeyboardEvent('keyup', keyInit(key)));
}

/** Playwright's fill(): focus, replace the whole value, one `input` event. */
export function fillValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus({ preventScroll: true });
  setValueRaw(el, value);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: value ? 'insertText' : 'deleteContentBackward', data: value || null }));
}

/** Playwright's type(): one key at a time (keydown, keypress, beforeinput, input, keyup). */
export async function typeText(el: HTMLInputElement | HTMLTextAreaElement, text: string, delayMs = 10): Promise<void> {
  el.focus({ preventScroll: true });
  for (const ch of text) {
    const init = keyInit(ch);
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keypress', { ...init, charCode: ch.charCodeAt(0) }));
    const before = el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: ch }));
    if (before) {
      setValueRaw(el, String(el.value ?? '') + ch);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: ch }));
    }
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    await sleep(delayMs);
  }
}

/** React-safe value write: native setter, then input / change / blur. */
export function setNativeValue(el: Element, value: string): void {
  const he = el as HTMLInputElement;
  he.focus({ preventScroll: true });
  setValueRaw(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  he.blur();
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Attach a file to an <input type=file> (what setInputFiles does): set `files`, fire input + change. */
export function attachFile(input: HTMLInputElement, file: { name: string; mimeType: string; base64: string }): void {
  const f = new NativeFile([base64ToBytes(file.base64) as BlobPart], file.name, { type: file.mimeType || 'application/octet-stream', lastModified: Date.now() });
  const dt = new NativeDataTransfer();
  dt.items.add(f);
  if (filesSetter) filesSetter.call(input, dt.files);
  else input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}
