#!/bin/bash
# Nomadic for Mac: one-line installer.
#   curl -fsSL https://nomadicai.vercel.app/install/mac.sh | bash
# Downloads the DMG for this Mac's chip, checks its SHA-256, copies Nomadic.app into Applications and opens it.
# Nothing else on the Mac is changed. VERSION must match MAC_DOWNLOAD.version in packages/config/src/downloads.ts.
set -euo pipefail

VERSION="1.6.0"
SITE="https://nomadicai.vercel.app"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS."
major="$(sw_vers -productVersion | cut -d. -f1)"
[ "$major" -ge 11 ] 2>/dev/null || fail "Nomadic needs macOS 11 Big Sur or later."

# Apple Silicon Macs report arm64, also when this shell runs under Rosetta.
if [ "$(uname -m)" = "arm64" ] || [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
  ARCH="arm64"; CHIP="Apple Silicon"
else
  ARCH="x64"; CHIP="Intel"
fi
DMG="Nomadic-$VERSION-mac-$ARCH.dmg"

work="$(mktemp -d)"
mnt="$work/mnt"
cleanup() { hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

say "Downloading Nomadic $VERSION for $CHIP..."
curl -fL --retry 3 --progress-bar -o "$work/$DMG" "$SITE/downloads/$DMG" || fail "download failed. Check your internet connection and try again."
curl -fsSL --retry 3 -o "$work/SUMS.txt" "$SITE/downloads/Nomadic-$VERSION-mac-SHA256SUMS.txt" || fail "could not download the checksums."

expected="$(grep " $DMG\$" "$work/SUMS.txt" | awk '{print $1}')"
actual="$(shasum -a 256 "$work/$DMG" | awk '{print $1}')"
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the download is damaged (checksum mismatch). Run the command again."
say "Checksum OK."

mkdir -p "$mnt"
hdiutil attach "$work/$DMG" -nobrowse -readonly -noautoopen -mountpoint "$mnt" -quiet || fail "could not open the DMG."
[ -d "$mnt/Nomadic.app" ] || fail "Nomadic.app is missing from the DMG."

# Close a running copy so it can be replaced.
osascript -e 'tell application "Nomadic" to quit' >/dev/null 2>&1 || true
sleep 1

DEST="/Applications"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi
rm -rf "$DEST/Nomadic.app"
ditto "$mnt/Nomadic.app" "$DEST/Nomadic.app" || fail "could not copy Nomadic into $DEST."
# The file came through curl, not a browser, so it has no download quarantine; clear it anyway in case of an old copy.
xattr -dr com.apple.quarantine "$DEST/Nomadic.app" 2>/dev/null || true

say "Installed in $DEST. Opening Nomadic..."
open "$DEST/Nomadic.app"
