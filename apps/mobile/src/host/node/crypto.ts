import { sha256 } from './sha256';

/** Node `crypto` subset used by the reused main-process code: randomUUID, randomBytes, createHash('sha256'). */
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const toBase64Url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function randomBytes(n: number) {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(n));
  return { toString: (enc?: string) => (enc === 'base64url' ? toBase64Url(b) : toHex(b)), bytes: b };
}

export function createHash(algorithm: string) {
  if (algorithm.toLowerCase() !== 'sha256') throw new Error(`hash ${algorithm} is not available in the app`);
  const parts: Uint8Array[] = [];
  const api = {
    update(data: string | Uint8Array) {
      parts.push(typeof data === 'string' ? new TextEncoder().encode(data) : data);
      return api;
    },
    digest(enc?: string) {
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of parts) {
        all.set(p, o);
        o += p.length;
      }
      const d = sha256(all);
      return enc === 'base64url' ? toBase64Url(d) : toHex(d);
    },
  };
  return api;
}

export default { randomUUID, randomBytes, createHash };
