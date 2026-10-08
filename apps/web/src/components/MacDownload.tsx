import { useEffect, useState } from 'react';
import { MAC_DOWNLOAD, macChecksumsPath, macDownloadPath, type MacArch } from '@nomadic/config';
import { detectMac, readGpuRenderer, type MacDetection } from '../mac-download';

const LABELS: Record<MacArch, { chip: string; detail: string }> = {
  arm64: { chip: 'Apple Silicon', detail: 'M1, M2, M3, M4 and later' },
  x64: { chip: 'Intel', detail: 'Intel-based Macs' },
};

/**
 * Mac download: one DMG per chip. When the browser reveals the chip (see mac-download.ts) that file is the main button
 * and the other is a small link; otherwise both are shown as equal buttons. Detection runs only in the browser, so the
 * prerendered page shows both.
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

  const mine = detected?.arch ?? null;
  const other: MacArch | null = mine === 'arm64' ? 'x64' : mine === 'x64' ? 'arm64' : null;
  const button = (arch: MacArch, primary: boolean) => (
    <a
      key={arch}
      href={macDownloadPath(version, arch)}
      className={`inline-flex min-h-16 flex-col justify-center border-2 border-white px-6 py-2 font-bold ${
        primary ? 'bg-white text-ink hover:border-marigold hover:bg-marigold' : 'text-white hover:bg-white/10'
      }`}
    >
      <span className="text-lg">Download for {LABELS[arch].chip}</span>
      <span className={`text-sm font-normal ${primary ? 'text-ink-soft' : 'text-white/80'}`}>
        {LABELS[arch].detail} · v{version}
      </span>
    </a>
  );

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap gap-3">{mine ? button(mine, true) : (['arm64', 'x64'] as const).map((a) => button(a, true))}</div>
      {mine && other && (
        <p className="mt-4 text-white/80">
          Detected: {LABELS[mine].chip}. Not right?{' '}
          <a href={macDownloadPath(version, other)} className="font-bold text-white underline decoration-2 underline-offset-4">
            Download for {LABELS[other].chip}
          </a>
        </p>
      )}
      {detected && !detected.isMac && <p className="mt-4 text-white/80">These downloads are for macOS.</p>}
      <p className="mt-3 text-sm text-white/70">
        macOS {MAC_DOWNLOAD.minimumMacOS} or later. Not sure which chip? Apple menu → About This Mac: "Chip: Apple M…" is
        Apple Silicon, "Processor: Intel" is Intel. ·{' '}
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
