import { isMacNavigator, type NavigatorLike } from './mac-download';

/** The platforms the download page offers, in page order. */
export type Platform = 'windows' | 'mac' | 'android';

export const PLATFORMS: readonly Platform[] = ['windows', 'mac', 'android'];

export function isPlatform(value: string | null | undefined): value is Platform {
  return PLATFORMS.includes(value as Platform);
}

/**
 * Which download to suggest for this browser; null for anything else (iPhone, iPad, unknown). Android is checked first
 * because some Android browsers report a desktop-like platform, and an iPad's Safari says "Macintosh" (isMacNavigator
 * rules it out by its touch points).
 */
export function detectPlatform(nav: NavigatorLike): Platform | null {
  const hinted = nav.userAgentData?.platform;
  if (hinted === 'Android' || /Android/i.test(nav.userAgent)) return 'android';
  if (hinted === 'Windows' || (!hinted && /Windows NT/i.test(nav.userAgent))) return 'windows';
  if (isMacNavigator(nav) && !/iPhone|iPad|iPod/.test(nav.userAgent)) return 'mac';
  return null;
}
