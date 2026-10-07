/** http / https / child_process / url / ws stand-ins: none of these run on the phone. */
type Handler = (...a: unknown[]) => void;
function failingRequest() {
  const listeners: Record<string, Handler[]> = {};
  const req = {
    on(ev: string, fn: Handler) {
      (listeners[ev] ??= []).push(fn);
      return req;
    },
    end() {},
  };
  // Callers fall back on error (public IP lookup -> 127.0.0.1).
  setTimeout(() => (listeners.error ?? []).forEach((fn) => fn(new Error('not available on Android'))), 0);
  return req;
}
export const get = () => failingRequest();
export const request = () => failingRequest();
export function createServer() {
  throw new Error('Local servers are not available in the Nomadic app for Android.');
}
export function spawn() {
  throw new Error('Processes cannot be started in the Nomadic app for Android.');
}
export const exec = spawn;
export const execFile = spawn;
export function fileURLToPath(u: string | URL): string {
  return new URL(String(u)).pathname;
}
export function pathToFileURL(p: string): URL {
  return new URL(`file://${p}`);
}
export default { get, request, createServer, spawn, exec, execFile, fileURLToPath, pathToFileURL };
