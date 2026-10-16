// electron-builder afterPack hook for macOS builds without an Apple Developer ID.
//
// electron-builder 24 skips signing when no certificate is found, and the packed app then has a
// broken signature (renaming the executable and editing Info.plist invalidate Electron's own
// ad-hoc one). Apple Silicon refuses to run that ("Nomadic is damaged"). An ad-hoc signature
// makes it start; Gatekeeper still asks the user to allow it once (System Settings → Privacy &
// Security → Open Anyway). An ad-hoc signature is not a Developer ID signature and is not
// notarized. Skipped when a real signing identity is configured (CSC_LINK/CSC_NAME).
//
// Universal builds: electron-builder packs an x64 and an arm64 app into "<dir>-x64-temp" /
// "<dir>-arm64-temp", calls this hook for each, merges them with @electron/universal and calls
// this hook again for the merged app. The temp apps must stay unsigned: their _CodeSignature
// files differ per architecture and the merge refuses differing non-binary files. Only the final
// app is signed.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;
  if (/-(x64|arm64)-temp$/.test(context.appOutDir)) return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing  app=${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
};
