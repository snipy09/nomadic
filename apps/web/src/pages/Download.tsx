import { CSSProperties, ReactNode, useState } from 'react';
import {
  ANDROID_DOWNLOAD,
  CONTACT_EMAIL,
  MAC_DOWNLOAD,
  MAC_INSTALL_SCRIPT_PATH,
  WINDOWS_DOWNLOAD,
  androidChecksumsPath,
  androidDownloadPath,
  windowsChecksumsPath,
  windowsDownloadPath,
} from '@nomadic/config';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import ComingSoon from '../components/ComingSoon';
import MacDownload, { MacInstallSteps } from '../components/MacDownload';
import { SITE } from '../seo';
import { platformLine } from '../content';

const delay = (ms: number) => ({ '--d': `${ms}ms` } as CSSProperties);

const MAC_COMMAND = `curl -fsSL ${SITE}${MAC_INSTALL_SCRIPT_PATH} | bash`;

const linkClass = 'font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra';

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-6 max-w-2xl list-decimal space-y-3 pl-6 text-lg">{children}</ol>;
}

function PlatformSection({ id, title, children, tone = 'white' }: { id: string; title: string; children: ReactNode; tone?: 'white' | 'fog' }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={tone === 'fog' ? 'bg-fog' : 'bg-white'}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <h2 id={`${id}-title`} className="wide max-w-3xl text-[clamp(1.5rem,3.6vw,2.75rem)]">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function CopyCommand({ command }: { command: string }) {
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
    <div className="mt-4 flex max-w-2xl flex-col gap-2 border-2 border-white sm:flex-row sm:items-stretch">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-sm">{command}</code>
      <button
        type="button"
        onClick={copy}
        className="min-h-11 border-t-2 border-white px-4 font-bold hover:bg-white hover:text-ink sm:border-l-2 sm:border-t-0"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function Download() {
  const win = WINDOWS_DOWNLOAD.version;
  const mac = MAC_DOWNLOAD.version;
  const android = ANDROID_DOWNLOAD.version;

  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main>
        <section className="on-dark bg-ultra text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-28">
            <h1 className="wide text-[clamp(2.25rem,6.5vw,5rem)]">
              <span className="line-mask block">
                <span className="anim-rise block" style={delay(0)}>
                  Download Nomadic
                </span>
              </span>
            </h1>
            <p className="anim-fade mt-8 max-w-xl text-xl text-white/90" style={delay(300)}>
              {platformLine()} Pick your computer below; the download starts as soon as you click.
            </p>
            <nav aria-label="Platforms" className="anim-fade mt-8 flex flex-wrap gap-3" style={delay(450)}>
              {[
                { href: '#windows', label: 'Windows' },
                { href: '#mac', label: 'Mac' },
                { href: '#android', label: 'Android' },
              ].map((p) => (
                <a key={p.href} href={p.href} className="inline-flex min-h-12 items-center border-2 border-white px-5 font-bold hover:bg-white hover:text-ink">
                  {p.label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <PlatformSection id="windows" title="Windows">
          {win ? (
            <>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href={windowsDownloadPath(win)}
                  className="inline-flex min-h-16 flex-col justify-center border-2 border-ink bg-ink px-6 py-2 font-bold text-white hover:border-ultra hover:bg-ultra"
                >
                  <span className="text-lg">Download for Windows</span>
                  <span className="text-sm font-normal text-white/80">64-bit zip · v{win}</span>
                </a>
                <a href={windowsChecksumsPath(win)} className={linkClass}>
                  SHA-256
                </a>
              </div>
              <p className="mt-3 text-ink-soft">Windows {WINDOWS_DOWNLOAD.minimumWindows} or Windows 11. No installer, no admin rights needed.</p>
              <Steps>
                <li>Open the downloaded zip, click <b>Extract all</b>, then <b>Extract</b>.</li>
                <li>
                  Double-click <b>Nomadic.exe</b> (the only file in the zip). The first start takes a few seconds.
                </li>
                <li>
                  If a blue &quot;Windows protected your PC&quot; box appears, click <b>More info</b>, then <b>Run anyway</b>. Windows asks only
                  the first time.
                </li>
                <li>
                  Optional: right-click <b>Nomadic.exe</b> → <b>Show more options</b> → <b>Send to</b> → <b>Desktop (create shortcut)</b>.
                </li>
              </Steps>
              <p className="mt-6 max-w-2xl text-ink-soft">
                Why the blue box: Nomadic is new and not yet signed with a paid code-signing certificate, so SmartScreen does not know
                it yet. Run it after extracting, not from inside the zip. To update, replace Nomadic.exe with the one from the new zip;
                your data stays in your Windows account.
              </p>
            </>
          ) : (
            <div className="mt-8">
              <ComingSoon size="lg" />
            </div>
          )}
        </PlatformSection>

        <section id="mac" aria-labelledby="mac-title" className="on-dark bg-ink text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <h2 id="mac-title" className="wide max-w-3xl text-[clamp(1.5rem,3.6vw,2.75rem)]">
              Mac
            </h2>
            {mac ? (
              <>
                <h3 className="mt-8 text-xl font-bold">Easiest: one command</h3>
                <p className="mt-2 max-w-2xl text-white/80">
                  Open <b>Terminal</b> (Spotlight: Cmd + Space, type Terminal), paste this line and press Return. It picks the right
                  file for your chip, checks it, installs Nomadic into Applications and opens it. No security prompts.
                </p>
                <CopyCommand command={MAC_COMMAND} />
                <p className="mt-2 text-sm text-white/70">
                  <a href={MAC_INSTALL_SCRIPT_PATH} className="underline underline-offset-4">
                    Read the script
                  </a>{' '}
                  before you run it, if you like.
                </p>

                <h3 className="mt-10 text-xl font-bold">Or download the DMG</h3>
                <div className="mt-4">
                  <MacDownload version={mac} />
                </div>
              </>
            ) : (
              <div className="mt-8">
                <ComingSoon tone="dark" size="lg" />
              </div>
            )}
          </div>
        </section>
        {mac && <MacInstallSteps />}

        <PlatformSection id="android" title="Android" tone="fog">
          {android ? (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href={androidDownloadPath(android)}
                className="inline-flex min-h-16 flex-col justify-center border-2 border-ink bg-ink px-6 py-2 font-bold text-white hover:border-ultra hover:bg-ultra"
              >
                <span className="text-lg">Download for Android</span>
                <span className="text-sm font-normal text-white/80">APK · v{android}</span>
              </a>
              <a href={androidChecksumsPath(android)} className={linkClass}>
                SHA-256
              </a>
            </div>
          ) : (
            <>
              <p className="mt-4 max-w-2xl text-lg text-ink-soft">The Android app is coming soon. These are the steps for when it is here.</p>
              <div className="mt-6">
                <ComingSoon size="lg" />
              </div>
            </>
          )}
          <p className="mt-6 text-ink-soft">Android {ANDROID_DOWNLOAD.minimumAndroid} or later. The app is installed from this site, not the Play Store.</p>
          <Steps>
            <li>Open this page on your phone in Chrome and tap <b>Download for Android</b>.</li>
            <li>When the download finishes, tap <b>Open</b> (or open it from <b>Files → Downloads</b>).</li>
            <li>
              If Android says your phone is not allowed to install unknown apps, tap <b>Settings</b>, turn on <b>Allow from this source</b>{' '}
              for Chrome, then go back.
            </li>
            <li>Tap <b>Install</b>.</li>
            <li>
              If Play Protect warns about an unknown app, tap <b>More details</b> → <b>Install anyway</b>. It asks only the first time.
            </li>
            <li>Open Nomadic. You can turn <b>Allow from this source</b> off again afterwards.</li>
          </Steps>
        </PlatformSection>

        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <p className="max-w-xl text-ink-soft">
              Stuck on a step? Write to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                {CONTACT_EMAIL}
              </a>{' '}
              and say which computer you use.
            </p>
            <a href="/" className="mt-6 inline-block font-bold underline decoration-2 underline-offset-4 hover:text-ultra">
              Back to the site
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
