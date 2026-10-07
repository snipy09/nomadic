import type { UserConfig } from 'vite';

export interface ElectronRendererOptions {
  /** The app folder (apps/desktop, apps/mac). */
  appDir: string;
  platform: 'windows' | 'mac';
  /** Dev server port (5173 Windows, 5176 Mac). */
  port: number;
  contentSecurityPolicy: string;
}

export declare function electronRendererConfig(options: ElectronRendererOptions): UserConfig;
