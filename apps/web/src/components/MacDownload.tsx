import { useEffect, useState } from 'react';
import { macDownloadPath, type MacArch } from '@nomadic/config';
import { Download } from 'lucide-react';
import { detectMac, readGpuRenderer, type MacDetection } from '../mac-download';

export const MAC_CHIPS: Record<MacArch, { chip: string; detail: string }> = {
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
      className={`group flex min-h-14 w-full items-center justify-between gap-3 border-2 px-4 py-2 font-bold ${
        primary ? 'border-ink bg-ink text-white hover:border-ultra hover:bg-ultra' : 'border-ink text-ink hover:bg-fog'
      }`}
    >
      <span className="flex flex-col">
        <span>{MAC_CHIPS[arch].chip}</span>
        <span className={`text-sm font-normal ${primary ? 'text-white/75' : 'text-ink-soft'}`}>{MAC_CHIPS[arch].detail}</span>
      </span>
      <Download aria-hidden className="h-5 w-5 shrink-0" />
    </a>
  );

  return (
    <div>
      <div className="flex flex-col gap-2">
        {mine ? button(mine, true) : (['arm64', 'x64'] as const).map((a, i) => button(a, i === 0))}
      </div>
      {mine && other && (
        <p className="mt-3 text-sm text-ink-soft">
          Detected {MAC_CHIPS[mine].chip}.{' '}
          <a href={macDownloadPath(version, other)} className="font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra">
            Get the {MAC_CHIPS[other].chip} file
          </a>
        </p>
      )}
    </div>
  );
}
