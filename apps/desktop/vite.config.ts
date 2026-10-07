import path from 'path';
import { defineConfig } from 'vite';
import { electronRendererConfig } from '../../packages/app-ui/tooling/electron-renderer.mjs';
import { buildContentSecurityPolicy } from '../../packages/app-core/src/shared/csp';

// Windows renderer: the shared UI (packages/app-ui) with VITE_PLATFORM=windows, entry renderer/main.tsx.
export default defineConfig(
  electronRendererConfig({ appDir: path.resolve(__dirname), platform: 'windows', port: 5173, contentSecurityPolicy: buildContentSecurityPolicy() })
);
