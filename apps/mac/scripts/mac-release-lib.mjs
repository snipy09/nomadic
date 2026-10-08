// Pure helpers for the macOS release (release-mac.mjs, validate-mac.mjs). No side effects, so they are unit tested
// on any OS (src/__tests__/release-lib.test.ts).

/** Architectures a release ships: one DMG for Apple Silicon, one for Intel. */
export const MAC_ARCHES = ['arm64', 'x64'];

/**
 * Architectures the scripts can build. `universal` (both chips in one app) is experimental and NOT shipped: on
 * 8 Oct 2026 the universal app built and validated but hung at start-up on Apple Silicon and Intel runners, while the
 * arm64 and x64 apps from the same build opened normally (release-mac.yml smoke test).
 */
export const BUILDABLE_ARCHES = ['arm64', 'x64', 'universal'];

/** File name of a release DMG. Must match `build.dmg.artifactName` in apps/mac/package.json. */
export function dmgFileName(version, arch) {
  return `Nomadic-${version}-mac-${arch}.dmg`;
}

/** The architecture in a release DMG's file name, or null when the name is not one. */
export function archFromDmgName(fileName) {
  const m = /^Nomadic-\d+\.\d+\.\d+(?:-[\w.]+)?-mac-(universal|arm64|x64)\.dmg$/.exec(fileName);
  return m ? m[1] : null;
}

/** Mach-O architectures (as `lipo -archs` prints them) every binary in the app must contain. */
export function requiredLipoArchs(arch) {
  if (arch === 'universal') return ['x86_64', 'arm64'];
  if (arch === 'arm64') return ['arm64'];
  if (arch === 'x64') return ['x86_64'];
  throw new Error(`Unknown arch ${arch}`);
}

/** Architectures from `lipo -archs` output ("x86_64 arm64\n"). */
export function parseLipoArchs(output) {
  return output.trim().split(/\s+/).filter(Boolean);
}

/** Required architectures missing from a binary. */
export function missingArchs(arch, lipoOutput) {
  const have = new Set(parseLipoArchs(lipoOutput));
  return requiredLipoArchs(arch).filter((a) => !have.has(a));
}

/**
 * Library paths from `otool -L` output. Library lines are indented; the unindented lines name the binary (once per
 * architecture for a universal binary, "…/Nomadic (architecture arm64):").
 */
export function parseOtoolLibs(output) {
  return output
    .split('\n')
    .filter((line) => /^\s+\S/.test(line))
    .map((line) => line.trim().replace(/\s+\((compatibility|current) version.*\)$/, ''))
    .filter(Boolean);
}

/**
 * A dylib's own install name(s) from `otool -D` output. `otool -L` lists it among the libraries (Electron's libEGL says
 * "./libEGL.dylib"); it is the library's name for itself, not a dependency.
 */
export function parseOtoolIds(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith(':'));
}

/**
 * A linked library that the user's Mac will have: part of macOS, or inside the app bundle. Anything else (Homebrew,
 * /usr/local, a build machine's home folder) is a missing dependency on a clean Mac.
 */
export function isBundledOrSystemLib(lib) {
  return /^(\/System\/Library\/|\/usr\/lib\/|@rpath\/|@executable_path\/|@loader_path\/)/.test(lib);
}

/**
 * Absolute paths of a Mac build machine (a home folder, a CI runner) and the dev server URL, which must not end up in
 * shipped code. "C:/Users/…" is not matched: the app shows it as example text for Windows file paths.
 */
export const DEV_PATH_PATTERNS = [/(?<![A-Za-z]:)\/Users\/[^/"'\s]+\//, /\/Users\/runner\//, /\/home\/runner\//, /localhost:5176/];

/** Files that must never ship in app.asar (relative paths as `asar list` prints them, with a leading slash). */
export function forbiddenAsarEntries(entries) {
  return entries.filter(
    (e) =>
      /(^|\/)\.env(\.|$)/.test(e) ||
      /\.(pem|p12|pfx|key)$/.test(e) ||
      (/^\/out\//.test(e) && e.endsWith('.map')),
  );
}

/** Top-level items allowed in the mounted DMG besides the app and the Applications link (Finder layout files). */
export const DMG_EXTRA_ALLOWED = new Set(['.background', '.DS_Store', '.VolumeIcon.icns', '.fseventsd', '.Trashes']);
