export default function Footer() {
  return (
    <footer className="on-dark bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div>
          <a href="#/" className="flex items-center gap-2.5">
            <img src="./logo-icon.png" alt="" className="h-8 w-8 bg-fog object-contain p-0.5" />
            <span className="wide text-lg">Nomadic</span>
          </a>
          <p className="mt-4 max-w-sm text-ink-pale">
            A desktop app for the whole job search.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 font-semibold">
          <a href="#/terms" className="underline decoration-2 underline-offset-4 hover:text-marigold">
            Terms
          </a>
          <a href="#/privacy" className="underline decoration-2 underline-offset-4 hover:text-marigold">
            Privacy
          </a>
          <a
            href="mailto:support@nomadic.app"
            className="underline decoration-2 underline-offset-4 hover:text-marigold"
          >
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
