// Bundles this app's Electron main process (src/main.ts) and the shared preload into out/main.
// Shared build rules: packages/app-core/tooling/electron-main.mjs.
import path from 'path';
import { fileURLToPath } from 'url';
import { buildElectronMain } from '../../packages/app-core/tooling/electron-main.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));

buildElectronMain({ appDir, entry: path.join(appDir, 'src/main.ts'), watch: process.argv.includes('--watch') }).catch((err) => {
  console.error('[build-main]', err);
  process.exit(1);
});
