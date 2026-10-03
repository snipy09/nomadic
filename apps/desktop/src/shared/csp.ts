// Shared by the main process (response header) and the Vite build (meta tag).

export function devOrigin(devServerUrl?: string): string | null {
  if (!devServerUrl) return null;
  try {
    return new URL(devServerUrl).origin;
  } catch {
    return null;
  }
}

/**
 * The renderer's CSP. Production allows only bundled scripts; network access
 * is limited to what the app talks to (Supabase REST/realtime and Edge Functions,
 * GitHub releases). Model providers are never called from the renderer: AI goes
 * main -> Nomadic AI proxy (Supabase Edge Function). Images may come from any https host (logos, thumbnails),
 * frames only from YouTube embeds. Dev additionally allows the Vite server,
 * its HMR websocket and the inline React-refresh preamble.
 */
export function buildContentSecurityPolicy(devServerUrl?: string): string {
  const dev = devOrigin(devServerUrl);
  const devWs = dev ? dev.replace(/^http/, 'ws') : '';
  const scriptSrc = dev ? `'self' 'unsafe-inline' 'unsafe-eval' ${dev}` : `'self'`;
  const connectSrc = [
    `'self'`,
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.github.com',
    ...(dev ? [dev, devWs] : []),
  ].join(' ');

  return [
    `default-src 'self'${dev ? ` ${dev}` : ''}`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${dev ? ` ${dev}` : ''}`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' data: blob: https:`,
    `connect-src ${connectSrc}`,
    `frame-src https://www.youtube.com https://www.youtube-nocookie.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}
