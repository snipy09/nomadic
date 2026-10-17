# Installing Nomadic on a Mac

Nomadic for Mac runs on **macOS 11 Big Sur or later**, on Apple Silicon (M1 and later) and Intel Macs.

## Which file

| File | For |
|---|---|
| `Nomadic-<version>-mac-arm64.dmg` | Apple Silicon Macs (M1, M2, M3, M4…) |
| `Nomadic-<version>-mac-x64.dmg` | Intel Macs |

To check your Mac: Apple menu → **About This Mac**. "Chip: Apple M…" is Apple Silicon; "Processor: Intel…" is Intel.
The website picks the right file when your browser tells it the chip. (The Intel file also runs on Apple Silicon
through Rosetta 2, but slower; use the Apple Silicon file there.)

## Install

1. Download the DMG.
2. Open it. A window shows Nomadic and the Applications folder.
3. Drag **Nomadic** onto **Applications**.
4. Eject the "Nomadic" disk in the Finder sidebar (optional) and delete the DMG.
5. Open **Nomadic** from Applications (or Launchpad / Spotlight).

## The first time you open it

Nomadic is distributed without Apple's paid notarization service, so macOS cannot check it with Apple and asks you to
confirm it once. This is the standard macOS process for apps downloaded from a developer's website.

1. Open Nomadic from Applications. macOS says it cannot verify the app ("Nomadic" Not Opened). Click **Done**
   (on older macOS: **OK** or **Cancel**). Do not click Move to Trash.
2. Open **System Settings → Privacy & Security** (Apple menu → System Settings).
3. Scroll down to **Security**. Next to "Nomadic was blocked to protect your Mac", click **Open Anyway**.
4. Confirm with **Open Anyway** (or **Open**) and enter your Mac password or use Touch ID.

Nomadic now opens, and from then on it opens normally like any other app. The Open Anyway button appears for about an
hour after step 1; if you do not see it, open Nomadic again and go back to Privacy & Security.

On macOS 11 or 12 the place is called **System Preferences → Security & Privacy → General**, with the same
**Open Anyway** button.

You do not need to turn off any macOS security setting or use Terminal.

## Updating

Download the new DMG and drag Nomadic onto Applications again, choosing **Replace**. Your data stays in
`~/Library/Application Support/Nomadic`. macOS may ask you to confirm the new version once, the same way.

## If something goes wrong

- **"Nomadic is damaged and can't be opened"**: the download was incomplete or altered. Delete it, download again from
  the Nomadic website, and compare the SHA-256 with the published checksum file (`shasum -a 256 <file>.dmg`). If it
  still happens, email us.
- **No Open Anyway button**: open Nomadic from Applications once more, then check Privacy & Security again.
- **Keychain prompt on first sign-in**: Nomadic stores your sign-in securely in the macOS Keychain. Click
  **Always Allow**.

Uninstall: drag Nomadic from Applications to the Bin. To remove its data too, delete
`~/Library/Application Support/Nomadic`.
