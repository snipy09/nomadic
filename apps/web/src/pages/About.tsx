import { LEGAL_NAME, TRADE_NAME } from '@nomadic/config';
import Nav from '../components/Nav';
import Footer from '../components/Footer';

const LINK = 'font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra';

/** About page: who runs Nomadic and what it does. Facts only; no invented numbers or claims. */
export default function About() {
  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h1 className="wide max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">About Nomadic</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-soft">
          Nomadic is a career app for job seekers in India, from freshers to experienced hires, built to take the whole job search
          to one place.
        </p>

        <div className="mt-12 max-w-3xl space-y-10">
          <section aria-labelledby="problem">
            <h2 id="problem" className="text-2xl font-bold">Why it exists</h2>
            <p className="mt-2 text-ink-soft">
              A student preparing for placements juggles a study plan, practice sites, job boards, long application
              forms and a spreadsheet of what was applied where. Nomadic puts these in one app so the time goes into
              learning and applying, not into managing tabs.
            </p>
          </section>

          <section aria-labelledby="does">
            <h2 id="does" className="text-2xl font-bold">What it does</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Builds a personal day-by-day learning roadmap from your target role and available time.</li>
              <li>Offers guided projects and company-tagged practice with feedback.</li>
              <li>Lists openings from company hiring pages with a match score against your skills.</li>
              <li>Fills application forms for you to review. Nothing is submitted until you confirm it.</li>
              <li>Tracks every application on one board.</li>
            </ul>
            <p className="mt-3 text-ink-soft">
              The app is free to download for Windows, macOS and Android, with a free plan and paid monthly plans.
              See <a href="/services" className={LINK}>Services and pricing</a>.
            </p>
          </section>

          <section aria-labelledby="principles">
            <h2 id="principles" className="text-2xl font-bold">How we work</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
              <li>You stay in control: every application is reviewed by you before it is sent.</li>
              <li>No invented data: if something is unknown, the app says so instead of guessing.</li>
              <li>Your data is kept first on your own computer and synced to your account in India. See the <a href="/privacy" className={LINK}>Privacy Policy</a>.</li>
            </ul>
          </section>

          <section aria-labelledby="operator">
            <h2 id="operator" className="text-2xl font-bold">Who runs it</h2>
            <p className="mt-2 text-ink-soft">
              Nomadic is run by <strong className="text-ink">{LEGAL_NAME}</strong>, trading as {TRADE_NAME}, a sole
              proprietorship in India. Find our address, email and phone on the <a href="/contact" className={LINK}>Contact</a> page.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
