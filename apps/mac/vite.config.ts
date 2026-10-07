import path from 'path';
import { defineConfig } from 'vite';
import { electronRendererConfig } from '../../packages/app-ui/build/electron-renderer.mjs';
import { buildContentSecurityPolicy } from '../../packages/app-core/src/shared/csp';

// macOS renderer: the shared UI (packages/app-ui) with VITE_PLATFORM=mac, entry renderer/main.tsx.
export default defineConfig(
  electronRendererConfig({ appDir: path.resolve(__dirname), platform: 'mac', port: 5176, contentSecurityPolicy: buildContentSecurityPolicy() })
);
