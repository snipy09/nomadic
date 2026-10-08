import type { MacArch } from '@nomadic/config';

/**
 * Which Mac download to suggest. The universal DMG works on every supported Mac, so it is always the main button;
 * when the browser can tell the chip, the smaller single-architecture DMG for it is marked "for this Mac".
 *
 * Browsers do not expose the CPU reliably: Safari and Firefox report "Intel Mac OS X" on Apple Silicon too. Two hints:
 * - Chromium (Chrome, Edge, Brave, Arc): navigator.userAgentData.getHighEntropyValues(['architecture']) → arm / x86.
 * - WebGL renderer: "Apple M1…" means Apple Silicon; "Intel", "AMD" or "Radeon" means an Intel Mac. Safari only says
 *   "Apple GPU", which is not enough, so the answer stays unknown and both files are offered equally.
 */
export type MacDetection = { isMac: boolean; arch: Exclude<MacArch, 'universal'> | null };

export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; platform?: string }>;
  };
}

export function isMacNavigator(nav: NavigatorLike): boolean {
  if (nav.userAgentData?.platform) return nav.userAgentData.platform === 'macOS';
  // iPadOS Safari also says "Macintosh"; it has touch points, a Mac does not.
  return /Macintosh|Mac OS X/.test(nav.userAgent) && !(nav.maxTouchPoints && nav.maxTouchPoints > 1);
}

export function archFromGpuRenderer(renderer: string | null | undefined): MacDetection['arch'] {
  if (!renderer) return null;
  if (/Apple M\d/i.test(renderer)) return 'arm64';
  if (/Intel|AMD|Radeon|NVIDIA|GeForce/i.test(renderer)) return 'x64';
  return null;
}

export function archFromClientHint(architecture: string | undefined): MacDetection['arch'] {
  if (architecture === 'arm') return 'arm64';
  if (architecture === 'x86') return 'x64';
  return null;
}

/** Reads the WebGL renderer string in the browser; null when WebGL or the debug extension is unavailable. */
export function readGpuRenderer(doc: Document = document): string | null {
  try {
    const gl = doc.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch {
    return null;
  }
}

export async function detectMac(nav: NavigatorLike, gpuRenderer: () => string | null): Promise<MacDetection> {
  if (!isMacNavigator(nav)) return { isMac: false, arch: null };
  try {
    const hints = await nav.userAgentData?.getHighEntropyValues?.(['architecture']);
    const fromHint = archFromClientHint(hints?.architecture);
    if (fromHint) return { isMac: true, arch: fromHint };
  } catch {
    // Client hints refused: fall through to the GPU hint.
  }
  return { isMac: true, arch: archFromGpuRenderer(gpuRenderer()) };
}
