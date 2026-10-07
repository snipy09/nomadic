export declare const DEFAULT_SUPABASE_URL: string;
export declare const DEFAULT_SUPABASE_ANON_KEY: string;

export declare function buildElectronMain(options: {
  /** The app folder (apps/desktop, apps/mac). */
  appDir: string;
  /** The app's Electron entry (src/main.ts). */
  entry: string;
  watch?: boolean;
}): Promise<void>;
