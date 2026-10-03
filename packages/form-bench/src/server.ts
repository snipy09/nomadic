/**
 * Minimal static server for fixtures. Two instances run on different ports so a
 * fixture can embed a cross-origin iframe via the `{{ORIGIN_B}}` placeholder.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export interface FixtureServers {
  originA: string;
  originB: string;
  close(): Promise<void>;
}

function serve(root: string, getOriginB: () => string): http.Server {
  return http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
      const file = path.normalize(path.join(root, urlPath));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      let body: Buffer | string = fs.readFileSync(file);
      if (ext === '.html') body = body.toString('utf8').split('{{ORIGIN_B}}').join(getOriginB());
      res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
}

export async function startFixtureServers(root: string): Promise<FixtureServers> {
  const abs = path.resolve(root);
  let originB = '';
  const a = serve(abs, () => originB);
  const b = serve(abs, () => originB);
  await new Promise<void>((r) => a.listen(0, '127.0.0.1', () => r()));
  await new Promise<void>((r) => b.listen(0, '127.0.0.1', () => r()));
  const originA = `http://127.0.0.1:${(a.address() as AddressInfo).port}`;
  // "localhost" vs "127.0.0.1" makes the iframe cross-origin (different host).
  originB = `http://localhost:${(b.address() as AddressInfo).port}`;
  return {
    originA,
    originB,
    close: () => Promise.all([a, b].map((s) => new Promise<void>((r) => s.close(() => r())))).then(() => undefined),
  };
}
