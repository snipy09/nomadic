import { CSSProperties, KeyboardEvent, ReactNode, useEffect, useState } from 'react';
import {
  ANDROID_DOWNLOAD,
  CONTACT_EMAIL,
  MAC_DOWNLOAD,
  MAC_INSTALL_SCRIPT_PATH,
  WINDOWS_DOWNLOAD,
  WINDOWS_INSTALL_SCRIPT_PATH,
  androidChecksumsPath,
  androidDownloadPath,
  macChecksumsPath,
  windowsChecksumsPath,
  windowsDownloadPath,
} from '@nomadic/config';
import { ArrowDown, Check, Copy, Download as DownloadIcon, Laptop, Monitor, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import ComingSoon from '../components/ComingSoon';
import MacDownload from '../components/MacDownload';
import { SITE } from '../seo';
import { platformLine } from '../content';
import { PLATFORMS, detectPlatform, isPlatform, type Platform } from '../platform';
import { prefersReducedMotion } from '../hooks';

const delay = (ms: number) => ({ '--d': `${ms}ms` } as CSSProperties);

const MAC_COMMAND = `curl -fsSL ${SITE}${MAC_INSTALL_SCRIPT_PATH} | bash`;
const WINDOWS_COMMAND = `irm ${SITE}${WINDOWS_INSTALL_SCRIPT_PATH} | iex`;

const linkClass = 'font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra';

const INFO: Record<Platform, { name: string; icon: LucideIcon; version: string | null; requirement: string }> = {
  windows: {
    name: 'Windows',
    icon: Monitor,
    version: WINDOWS_DOWNLOAD.version,
    requirement: `Windows ${WINDOWS_DOWNLOAD.minimumWindows} or Windows 11`,
  },
  mac: { name: 'Mac', icon: Laptop, version: MAC_DOWNLOAD.version, requirement: `macOS ${MAC_DOWNLOAD.minimumMacOS} or later` },
  android: { name: 'Android', icon: Smartphone, version: ANDROID_DOWNLOAD.version, requirement: `Android ${ANDROID_DOWNLOAD.minimumAndroid} or later` },
};

const CHECKSUMS: Record<Platform, (version: string) => string> = {
  windows: windowsChecksumsPath,
  mac: macChecksumsPath,
  android: androidChecksumsPath,
};

/* ---------- Platform cards (hero) ---------- */

function PrimaryDownload({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <a
      href={href}
      className="flex min-h-14 w-full items-center justify-between gap-3 border-2 border-ink bg-ink px-4 py-2 font-bold text-white hover:border-ultra hover:bg-ultra"
    >
      <span className="flex flex-col">
        <span>{label}</span>
        <span className="text-sm font-normal text-white/75">{detail}</span>
      </span>
      <DownloadIcon aria-hidden className="h-5 w-5 shrink-0" />
    </a>
  );
}

function PlatformCard({ platform, mine, onSteps, index }: { platform: Platform; mine: boolean; onSteps: (p: Platform) => void; index: number }) {
  const { name, icon: Icon, version, requirement } = INFO[platform];

  let action: ReactNode;
  if (!version) action = <ComingSoon size="md" label="Download" block />;
  else if (platform === 'windows') action = <PrimaryDownload href={windowsDownloadPath(version)} label="Download for Windows" detail="64-bit zip" />;
  else if (platform === 'android') action = <PrimaryDownload href={androidDownloadPath(version)} label="Download for Android" detail="APK" />;
  else action = <MacDownload version={version} />;

  return (
    <article
      aria-labelledby={`card-${platform}`}
      className={`anim-window relative flex min-w-0 flex-col bg-white p-5 text-ink sm:p-6 ${mine ? 'outline outline-4 outline-marigold' : ''}`}
      style={delay(380 + index * 110)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center bg-fog">
          <Icon aria-hidden className="h-6 w-6" strokeWidth={2.25} />
        </span>
        {mine && <span className="bg-marigold px-2 py-1 text-xs font-bold uppercase tracking-wider">Your device</span>}
      </div>
      <h2 id={`card-${platform}`} className="wide mt-5 text-3xl">
        {name}
      </h2>
      <p className="mt-2 text-ink-soft">
        {version && <span className="nums font-bold text-ink">v{version} · </span>}
        {requirement}
      </p>

      <div className="mt-6 flex-1">{action}</div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-fog pt-4 text-sm">
        <a
          href={`#${platform}`}
          onClick={(event) => {
            event.preventDefault();
            onSteps(platform);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 font-bold hover:text-ultra"
        >
          Install steps
          <ArrowDown aria-hidden className="h-4 w-4" />
        </a>
        {version && (
          <a href={CHECKSUMS[platform](version)} className="inline-flex min-h-11 items-center gap-1.5 text-ink-soft hover:text-ultra">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            SHA-256
          </a>
        )}
      </div>
    </article>
  );
}

/* ---------- Install guide ---------- */

function Steps({ children, start = 1 }: { children: ReactNode[]; start?: number }) {
  return (
    <ol className="space-y-3">
      {children.map((child, i) => (
        <li key={i} className="flex gap-4 border-2 border-fog bg-white p-4 sm:p-5">
          <span aria-hidden className="nums flex h-9 w-9 shrink-0 items-center justify-center bg-marigold font-bold">
            {start + i}
          </span>
          <span className="min-w-0 self-center text-lg leading-snug">{child}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-l-4 border-ultra bg-fog p-5">
      <h4 className="font-bold">{title}</h4>
      <div className="mt-2 text-ink-soft">{children}</div>
    </div>
  );
}

function CopyCommand({ command, shell = 'Terminal', prompt = '$ ' }: { command: string; shell?: string; prompt?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(command)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };
  return (
    <div className="on-dark bg-ink text-white">
      <div className="flex items-center justify-between border-b border-white/15 px-4 py-2 text-sm text-ink-pale">
        <span>{shell}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-9 items-center gap-1.5 px-2 font-bold text-white hover:text-marigold"
          aria-label={copied ? 'Command copied' : 'Copy command'}
        >
          {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <code className="block overflow-x-auto whitespace-nowrap px-4 py-4 font-mono text-sm">
        <span aria-hidden className="select-none text-marigold">{prompt}</span>
        {command}
      </code>
    </div>
  );
}

function WindowsGuide() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <div className="min-w-0">
        <h3 className="text-xl font-bold">
          Easiest: one command <span className="ml-1 bg-marigold px-2 py-0.5 align-middle text-xs uppercase tracking-wider">Recommended</span>
        </h3>
        <p className="mt-2 text-ink-soft">
          Open <b className="text-ink">PowerShell</b> (Start menu: type PowerShell), paste this line and press Enter. It downloads
          Nomadic, checks it, installs it silently (Start menu and Desktop shortcuts) and opens it. No clicks, no blue SmartScreen
          box.
        </p>
        <div className="mt-4">
          <CopyCommand command={WINDOWS_COMMAND} shell="PowerShell" prompt="PS> " />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          <a href={WINDOWS_INSTALL_SCRIPT_PATH} className={linkClass}>
            Read the script
          </a>{' '}
          before you run it, if you like.
        </p>

        <h3 className="mt-10 text-xl font-bold">Or use the zip</h3>
        <div className="mt-4">
          <Steps>
            {[
              <>Open the downloaded zip, click <b>Extract all</b>, then <b>Extract</b>.</>,
              <>Double-click <b>Nomadic Setup.exe</b> (the only file in the zip).</>,
              <>
                If a blue &quot;Windows protected your PC&quot; box appears, click <b>More info</b>, then <b>Run anyway</b>. Windows asks
                only the first time.
              </>,
              <>
                Follow the installer. It adds Start menu and Desktop shortcuts and opens Nomadic when it finishes.
              </>,
            ]}
          </Steps>
        </div>
      </div>
      <div className="space-y-4">
        <Note title="Why the blue box">
          Nomadic is not yet signed with a paid code-signing certificate, so SmartScreen warns about files downloaded in a browser. The
          PowerShell command skips it. With the zip, run the installer after extracting, not from inside the zip.
        </Note>
        <Note title="Updating">Run the command again, or run the installer from the new zip. Your data stays.</Note>
        <Note title="Uninstalling">Settings → Apps → Installed apps → Nomadic → Uninstall.</Note>
      </div>
    </div>
  );
}

function MacGuide() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <div className="min-w-0">
        <h3 className="text-xl font-bold">
          Easiest: one command <span className="ml-1 bg-marigold px-2 py-0.5 align-middle text-xs uppercase tracking-wider">Recommended</span>
        </h3>
        <p className="mt-2 text-ink-soft">
          Open <b className="text-ink">Terminal</b> (Spotlight: Cmd + Space, type Terminal), paste this line and press Return. It picks the
          right file for your chip, checks it, installs Nomadic into Applications and opens it. No security prompts.
        </p>
        <div className="mt-4">
          <CopyCommand command={MAC_COMMAND} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          <a href={MAC_INSTALL_SCRIPT_PATH} className={linkClass}>
            Read the script
          </a>{' '}
          before you run it, if you like.
        </p>

        <h3 className="mt-10 text-xl font-bold">Or install the DMG</h3>
        <div className="mt-4">
          <Steps>
            {[
              <>Open the downloaded DMG.</>,
              <>Drag Nomadic onto the Applications folder.</>,
              <>Open Nomadic from Applications.</>,
              <>
                If macOS says it cannot verify Nomadic, click <b>Done</b>. Open <b>System Settings → Privacy &amp; Security</b>, scroll down
                and click <b>Open Anyway</b> next to the Nomadic message.
              </>,
              <>
                Click <b>Open Anyway</b> again and enter your Mac password. From then on Nomadic opens normally.
              </>,
            ]}
          </Steps>
        </div>
      </div>
      <div className="space-y-4">
        <Note title="Which chip do I have?">
          Apple menu → About This Mac: &quot;Chip: Apple M…&quot; is Apple Silicon, &quot;Processor: Intel&quot; is Intel.
        </Note>
        <Note title="Why the extra step">
          Nomadic for Mac is distributed without Apple&apos;s paid notarization service, so macOS asks you to confirm once. You never
          need to turn off macOS security. The Terminal command skips these steps.
        </Note>
      </div>
    </div>
  );
}

function AndroidGuide() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <Steps>
        {[
          <>Open this page on your phone in Chrome and tap <b>Download for Android</b>.</>,
          <>When the download finishes, tap <b>Open</b> (or open it from <b>Files → Downloads</b>).</>,
          <>
            If Android says your phone is not allowed to install unknown apps, tap <b>Settings</b>, turn on <b>Allow from this source</b>{' '}
            for Chrome, then go back.
          </>,
          <>Tap <b>Install</b>.</>,
          <>
            If Play Protect warns about an unknown app, tap <b>More details</b> → <b>Install anyway</b>. It asks only the first time.
          </>,
          <>Open Nomadic. You can turn <b>Allow from this source</b> off again afterwards.</>,
        ]}
      </Steps>
      <div className="space-y-4">
        {!ANDROID_DOWNLOAD.version && (
          <Note title="Coming soon">The Android app is coming soon. These are the steps for when it is here.</Note>
        )}
        <Note title="Not on the Play Store">The app is installed from this site, not the Play Store.</Note>
      </div>
    </div>
  );
}

const GUIDES: Record<Platform, () => JSX.Element> = { windows: WindowsGuide, mac: MacGuide, android: AndroidGuide };

function InstallGuide({ tab, onTab }: { tab: Platform; onTab: (p: Platform, focus?: boolean) => void }) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = PLATFORMS.indexOf(tab);
    const next =
      event.key === 'ArrowRight' ? PLATFORMS[(i + 1) % PLATFORMS.length]
      : event.key === 'ArrowLeft' ? PLATFORMS[(i + PLATFORMS.length - 1) % PLATFORMS.length]
      : event.key === 'Home' ? PLATFORMS[0]
      : event.key === 'End' ? PLATFORMS[PLATFORMS.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    onTab(next, true);
  };

  return (
    <section id="install" aria-labelledby="install-title" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <h2 id="install-title" className="wide text-[clamp(1.75rem,4.2vw,3.25rem)]">
          How to install
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Nomadic is new and not yet code-signed for Windows or notarized by Apple, so each system asks you to confirm once. On Windows
          and Mac, one command skips that; the steps below show exactly what to do.
        </p>

        <div role="tablist" aria-label="Platform" onKeyDown={onKey} className="mt-10 inline-flex max-w-full border-2 border-ink">
          {PLATFORMS.map((p) => {
            const { name, icon: Icon } = INFO[p];
            const active = p === tab;
            return (
              <button
                key={p}
                id={`tab-${p}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={p}
                tabIndex={active ? 0 : -1}
                onClick={() => onTab(p)}
                className={`inline-flex min-h-12 items-center gap-2 px-3 font-bold transition-colors duration-150 sm:px-5 ${
                  active ? 'bg-ink text-white' : 'text-ink hover:bg-fog'
                }`}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {name}
              </button>
            );
          })}
        </div>

        {PLATFORMS.map((p) => {
          const Guide = GUIDES[p];
          return (
            <div key={p} id={p} role="tabpanel" aria-labelledby={`tab-${p}`} hidden={p !== tab} tabIndex={0} className="mt-8 focus-visible:outline-offset-8">
              <Guide />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Page ---------- */

export default function Download() {
  const [tab, setTab] = useState<Platform>('windows');
  const [mine, setMine] = useState<Platform | null>(null);
  const scrollToGuide = () => {
    document.getElementById('install')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  const selectTab = (p: Platform, focus = false) => {
    setTab(p);
    if (window.location.hash !== `#${p}`) window.history.replaceState(null, '', `#${p}`);
    if (focus) document.getElementById(`tab-${p}`)?.focus();
  };

  // After the first render (which matches the prerendered HTML): suggest this device, or open the tab the link asked for.
  useEffect(() => {
    const detected = detectPlatform(navigator as Navigator & Parameters<typeof detectPlatform>[0]);
    setMine(detected);
    const fromHash = window.location.hash.slice(1);
    if (isPlatform(fromHash)) {
      setTab(fromHash);
      window.requestAnimationFrame(scrollToGuide);
    } else if (detected) setTab(detected);

    const onHash = () => {
      const h = window.location.hash.slice(1);
      if (isPlatform(h)) {
        setTab(h);
        window.requestAnimationFrame(scrollToGuide);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const showSteps = (p: Platform) => {
    selectTab(p);
    window.requestAnimationFrame(scrollToGuide);
  };

  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main>
        <section className="on-dark overflow-hidden bg-ultra text-white">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 md:pb-24 md:pt-20">
            <h1 className="wide text-[clamp(2.25rem,6.5vw,5rem)]">
              <span className="line-mask block">
                <span className="anim-rise block" style={delay(0)}>
                  Download Nomadic
                </span>
              </span>
            </h1>
            <p className="anim-fade mt-6 max-w-xl text-xl text-white/90" style={delay(250)}>
              {platformLine()} The download starts as soon as you click.
            </p>

            <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-5 md:mt-14 lg:grid-cols-3">
              {PLATFORMS.map((p, i) => (
                <PlatformCard key={p} platform={p} mine={p === mine} onSteps={showSteps} index={i} />
              ))}
            </div>

            <p className="anim-fade mt-8 flex items-start gap-2 text-white/85" style={delay(800)}>
              <ShieldCheck aria-hidden className="mt-1 h-5 w-5 shrink-0" />
              <span>
                Free to download. Every file comes with a SHA-256 checksum so you can check it was not changed on the way.
              </span>
            </p>
          </div>
        </section>

        <InstallGuide tab={tab} onTab={selectTab} />

        <section className="on-dark bg-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="wide text-[clamp(1.5rem,3vw,2.25rem)]">Stuck on a step?</h2>
              <p className="mt-3 max-w-xl text-ink-pale">Write to us and say which computer or phone you use.</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex min-h-12 items-center border-2 border-white bg-white px-5 font-bold text-ink hover:border-marigold hover:bg-marigold"
              >
                {CONTACT_EMAIL}
              </a>
              <a href="/" className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-marigold">
                Back to the site
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
