import Nav from '../components/Nav';
import Footer from '../components/Footer';

export default function NotFound() {
  return (
    <>
      <Nav variant="page" />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 md:pt-24">
        <h1 className="wide text-[clamp(2.75rem,10vw,6.5rem)]">
          <span className="block">This page</span>
          <span className="block">is not here.</span>
        </h1>
        <p className="mt-8 max-w-prose text-lg text-ink-soft">
          The link may be old, or the address may have a typo. The home page has everything Nomadic does,
          and the download page has the Windows and Mac downloads.
        </p>
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 font-semibold">
          <a href="/" className="inline-flex min-h-11 items-center underline decoration-2 underline-offset-4 hover:text-ultra">
            Go to the home page
          </a>
          <a
            href="/download"
            className="inline-flex min-h-11 items-center underline decoration-2 underline-offset-4 hover:text-ultra"
          >
            See the download page
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
