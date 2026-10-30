/**
 * Public downloads on the website (apps/web Download page, /downloads/* redirects in vercel.json and apps/web/vercel.json).
 * The files are GitHub release assets in the public repo `snipy09/nomadic-releases` (tags `win-v<version>`,
 * `mac-v<version>`, `android-v<version>`); the site redirects to them so a click starts the download at once.
 *
 * Set a `version` only after that release's files are uploaded (RELEASES.md); while it is null the site shows "coming
 * soon" for that platform.
 *
 * Windows: a zip holding only the installer `Nomadic Setup.exe` (scripts/windows/make-release.ps1). It is not code-signed, so Windows SmartScreen asks once
 * ("More info" → "Run anyway") for an exe extracted from a browser download; the PowerShell one-line installer
 * (apps/web/public/install/windows.ps1) avoids that, and only a code-signing certificate removes it for the zip.
 * macOS: free distribution, no Apple Developer Program. Builds are ad-hoc signed, not notarized, so macOS asks once to
 * allow a DMG opened from the browser; the Terminal one-line installer (apps/web/public/install/mac.sh) avoids that.
 * Android: a sideloaded APK (not on the Play Store); the user allows "Install unknown apps" once.
 */
/** Apple Silicon (arm64) and Intel (x64). A universal build is not shipped (MAC_RELEASE.md). */
export type MacArch = 'arm64' | 'x64';

export const MAC_DOWNLOAD: { version: string | null; minimumMacOS: string } = {
  version: '1.4.0',
  minimumMacOS: '11 Big Sur',
};

export const WINDOWS_DOWNLOAD: { version: string | null; minimumWindows: string } = {
  version: '1.5.0',
  minimumWindows: '10 (64-bit)',
};

export const ANDROID_DOWNLOAD: { version: string | null; minimumAndroid: string } = {
  version: '1.6.0',
  minimumAndroid: '7.0',
};

/** True when at least one platform can be downloaded. */
export function downloadsOpen(): boolean {
  return Boolean(MAC_DOWNLOAD.version || WINDOWS_DOWNLOAD.version || ANDROID_DOWNLOAD.version);
}

/** File name of a release DMG. Must match `build.dmg.artifactName` in apps/mac/package.json. */
export function macDmgFileName(version: string, arch: MacArch): string {
  return `Nomadic-${version}-mac-${arch}.dmg`;
}

/** Website path of a release DMG; vercel.json redirects /downloads/* to where the files are hosted. */
export function macDownloadPath(version: string, arch: MacArch): string {
  return `/downloads/${macDmgFileName(version, arch)}`;
}

/** Website path of the SHA-256 checksums for a Mac release. */
export function macChecksumsPath(version: string): string {
  return `/downloads/Nomadic-${version}-mac-SHA256SUMS.txt`;
}

/** File name of the Windows zip (scripts/windows/make-release.ps1 writes it). */
export function windowsZipFileName(version: string): string {
  return `Nomadic-${version}-windows-x64.zip`;
}

export function windowsDownloadPath(version: string): string {
  return `/downloads/${windowsZipFileName(version)}`;
}

export function windowsChecksumsPath(version: string): string {
  return `/downloads/Nomadic-${version}-windows-SHA256SUMS.txt`;
}

export function androidApkFileName(version: string): string {
  return `Nomadic-${version}-android.apk`;
}

export function androidDownloadPath(version: string): string {
  return `/downloads/${androidApkFileName(version)}`;
}

export function androidChecksumsPath(version: string): string {
  return `/downloads/Nomadic-${version}-android-SHA256SUMS.txt`;
}

/** Mac one-line installer served by the site (apps/web/public/install/mac.sh). */
export const MAC_INSTALL_SCRIPT_PATH = '/install/mac.sh';

/** Windows one-line installer served by the site (apps/web/public/install/windows.ps1), run with `irm … | iex`. */
export const WINDOWS_INSTALL_SCRIPT_PATH = '/install/windows.ps1';
