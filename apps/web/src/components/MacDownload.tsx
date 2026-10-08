import { useEffect, useState } from 'react';
import { MAC_DOWNLOAD, macChecksumsPath, macDownloadPath, type MacArch } from '@nomadic/config';
import { detectMac, readGpuRenderer, type MacDetection } from '../mac-download';

const LABELS: Record<Exclude<MacArch, 'universal'>, string> = {
  arm64: 'Apple Silicon (M1 or later)',
  x64: 'Intel',
};

/**
 * Mac download: the universal DMG is the main button (runs on every supported Mac). The single-architecture DMGs are
 * smaller; the one matching this Mac is marked when the browser can tell (see mac-download.ts). Detection runs only in
 * the browser, so the prerendered page shows both options.
 */
export default function MacDownload({ version }: { version: string }) {
  const [detected, setDetected] = useState<MacDetection | null>(null);

  useEffect(() => {
    let live = true;
    detectMac(navigator as Navigator & Parameters<typeof detectMac>[0], () => readGpuRenderer())
      .then((d) => live && setDetected(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="max-w-xl">
      <a
        href={macDownloadPath(version, 'universal')}
        className="inline-flex min-h-16 items-center gap-4 border-2 border-white bg-white px-6 text-lg font-bold text-ink hover:bg-marigold hover:border-marigold"
      >
        Download for Mac
        <span className="text-sm font-normal text-ink-soft">v{version} · Apple Silicon and Intel</span>
      </a>
      <p className="mt-4 text-white/80">
        Smaller download for one chip:{' '}
        {(['arm64', 'x64'] as const).map((arch, i) => (
          <span key={arch}>
            {i > 0 && ' · '}
            <a href={macDownloadPath(version, arch)} className="font-bold text-white underline decoration-2 underline-offset-4">
              {LABELS[arch]}
            </a>
            {detected?.arch === arch && <span className="text-marigold"> (this Mac)</span>}
          </span>
        ))}
      </p>
      {detected && !detected.isMac && <p className="mt-2 text-white/80">This download is for macOS.</p>}
      <p className="mt-2 text-sm text-white/70">
        macOS {MAC_DOWNLOAD.minimumMacOS} or later. Not sure which chip? Apple menu → About This Mac. ·{' '}
        <a href={macChecksumsPath(version)} className="underline underline-offset-4">
          SHA-256
        </a>
      </p>
    </div>
  );
}

/** First-launch steps. Nomadic for Mac is not notarized by Apple, so macOS asks once to allow it. */
export function MacInstallSteps() {
  return (
    <section aria-labelledby="mac-install-title" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <h2 id="mac-install-title" className="wide max-w-3xl text-[clamp(1.5rem,3.6vw,2.75rem)]">
          Installing on a Mac
        </h2>
        <ol className="mt-8 max-w-2xl list-decimal space-y-3 pl-6 text-lg">
          <li>Open the downloaded DMG.</li>
          <li>Drag Nomadic onto the Applications folder.</li>
          <li>Open Nomadic from Applications.</li>
          <li>
            If macOS says it cannot verify Nomadic, click <b>Done</b>. Open <b>System Settings → Privacy &amp; Security</b>,
            scroll down and click <b>Open Anyway</b> next to the Nomadic message.
          </li>
          <li>
            Click <b>Open Anyway</b> again and enter your Mac password. From then on Nomadic opens normally.
          </li>
        </ol>
        <p className="mt-6 max-w-2xl text-ink-soft">
          Why the extra step: Nomadic for Mac is distributed without Apple&apos;s paid notarization service, so macOS asks
          you to confirm once. You never need to turn off macOS security or use Terminal.
        </p>
      </div>
    </section>
  );
}
