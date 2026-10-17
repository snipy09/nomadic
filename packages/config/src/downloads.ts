/**
 * Public downloads on the website (apps/web Download page, /downloads/* redirects in apps/web/vercel.json).
 *
 * macOS: free distribution, no Apple Developer Program. Builds are ad-hoc signed, not Developer ID signed and not
 * notarized, so macOS asks once to allow the app (deploy/mac/MAC_INSTALL.md). Set `version` only after the DMGs for that version
 * are uploaded (deploy/mac/MAC_RELEASE.md); while it is null the site keeps showing "coming soon".
 */
/** Apple Silicon (arm64) and Intel (x64). A universal build is not shipped (deploy/mac/MAC_RELEASE.md). */
export type MacArch = 'arm64' | 'x64';

export const MAC_DOWNLOAD: { version: string | null; minimumMacOS: string } = {
  version: null,
  minimumMacOS: '11 Big Sur',
};

/** File name of a release DMG. Must match `build.dmg.artifactName` in apps/mac/package.json. */
export function macDmgFileName(version: string, arch: MacArch): string {
  return `Nomadic-${version}-mac-${arch}.dmg`;
}

/** Website path of a release DMG; apps/web/vercel.json redirects /downloads/* to where the files are hosted. */
export function macDownloadPath(version: string, arch: MacArch): string {
  return `/downloads/${macDmgFileName(version, arch)}`;
}

/** Website path of the SHA-256 checksums for a Mac release. */
export function macChecksumsPath(version: string): string {
  return `/downloads/Nomadic-${version}-mac-SHA256SUMS.txt`;
}
