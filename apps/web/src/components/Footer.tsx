import Logo from './Logo';

const LINK ='inline-flex min-h-11 items-center underline decoration-2 underline-offset-4 hover:text-marigold';

export default function Footer() {
  return (
    <footer className="on-dark bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div>
          <a href="/" aria-label="Nomadic home" className="inline-flex min-h-11 items-center">
            <Logo tone="dark" className="h-8" />
          </a>
          <p className="mt-3 max-w-sm text-ink-pale">
            A desktop app for the whole job search.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-1 font-semibold">
          <a href="/terms" className={LINK}>
            Terms
          </a>
          <a href="/privacy" className={LINK}>
            Privacy
          </a>
          <a href="/refunds" className={LINK}>
            Refunds
          </a>
          <a href="mailto:support@nomadic.app" className={`${LINK} break-all`}>
            support@nomadic.app
          </a>
        </nav>
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-4 py-5 text-sm text-ink-pale sm:px-6">
          © 2026 Nomadic Technologies. All sample companies, people and listings on this site are fictional.
        </p>
      </div>
    </footer>
  );
}
