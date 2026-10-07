/** POSIX `path` subset. */
export const sep = '/';
export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join('/'));
}
export function normalize(p: string): string {
  const abs = p.startsWith('/');
  const out: string[] = [];
  for (const seg of p.split(/[\\/]+/)) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return (abs ? '/' : '') + out.join('/');
}
export const resolve = (...parts: string[]) => join('/', ...parts);
export const dirname = (p: string) => p.replace(/[\\/][^\\/]*$/, '') || '/';
export function basename(p: string, ext?: string): string {
  const b = p.split(/[\\/]/).pop() ?? '';
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
}
export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
}
export const isAbsolute = (p: string) => p.startsWith('/');
export default { sep, join, normalize, resolve, dirname, basename, extname, isAbsolute };
