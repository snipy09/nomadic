import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_HREF, LEGAL_NAME, REGISTERED_ADDRESS, TRADE_NAME } from '@nomadic/config';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { PLANS } from '../content';

const LINK = 'font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra';

const SERVICES: { title: string; text: string }[] = [
  {
    title: 'A learning roadmap for any role',
    text: 'You type the role you want and your level. Nomadic splits the role into subjects, modules and topics to study, each topic with its own YouTube search and ChatGPT prompt, and tracks what you have done.',
  },
  {
    title: 'A guided capstone project',
    text: 'Every roadmap ends with five projects picked for the role. The one you choose becomes a capstone of milestones and steps, each with a "done when" check and AI help, so you end with work to show on a resume.',
  },
  {
    title: 'Practice',
    text: 'About 1,800 company-tagged coding problems, role-based interview questions, timed mock mode, weak-topic tracking and AI feedback on written answers (Pro and Max).',
  },
  {
    title: 'Job board with match score',
    text: 'Openings collected from company hiring pages, each with a match percentage against your skills and the top skills you are missing. Filter, save and compare.',
  },
  {
    title: 'Apply with review',
    text: 'Nomadic fills the application form from your profile in your own browser and shows every field. Nothing is ever submitted without your review: you check and confirm each application.',
  },
  {
    title: 'Application tracker',
    text: 'A board and list of every application with status history and notes, synced to your account.',
  },
];

const STEPS = [
  'Download the Nomadic app for Windows, macOS or Android from the Download page and create a free account.',
  'Use the Free plan as long as you like. When you want higher limits, choose Pro or Max inside the app.',
  'Pay the monthly price in Indian rupees online through our payment gateway partner PayU (UPI, cards, net banking, wallets). You can also pay by UPI directly.',
  'Your plan is activated on your account within minutes of a successful payment. It lasts 30 days and does not renew automatically.',
];

/** Services and pricing: what is sold, for how much (from packages/config), and how payment works. */
export default function Services() {
  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h1 className="wide max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">Services and pricing</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-soft">
          Nomadic is a career app for engineering students and freshers in India. It is software you download, with a
          free plan and two paid monthly plans. Prices are in Indian rupees (INR).
        </p>

        <section aria-labelledby="what" className="mt-14">
          <h2 id="what" className="text-2xl font-bold">What the service includes</h2>
          <dl className="mt-6 border-t-2 border-ink">
            {SERVICES.map((s) => (
              <div key={s.title} className="grid gap-x-6 gap-y-1 border-b border-rule py-5 sm:grid-cols-[14rem_1fr]">
                <dt className="font-bold">{s.title}</dt>
                <dd className="text-ink-soft">{s.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="plans" className="mt-16">
          <h2 id="plans" className="text-2xl font-bold">Plans and prices</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Each paid plan is one payment for 30 days of access. Prices are in INR and include applicable taxes.
          </p>
          <div className="mt-6 grid border-2 border-ink md:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.id} className="border-ink p-5 sm:p-8 md:border-l-2 md:first:border-l-0 [&:not(:first-child)]:border-t-2 md:[&:not(:first-child)]:border-t-0">
                <h3 className="wide text-2xl">{plan.name}</h3>
                <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
                  <span className="wide nums text-4xl">{plan.price}</span>
                  <span className="text-ink-soft">{plan.per}</span>
                </p>
                <p className="mt-3 text-ink-soft">{plan.summary}</p>
                <ul className="mt-5 border-t border-rule">
                  {plan.features.map((f) => (
                    <li key={f} className="border-b border-rule py-2.5 text-ink-soft">{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="payments" className="mt-16 max-w-3xl">
          <h2 id="payments" className="text-2xl font-bold">How payment works</h2>
          <p className="mt-2 text-ink-soft">
            The payment gateway is used for one purpose only: to collect the monthly fee for a Pro or Max plan from
            a user who chooses to upgrade. Nothing else is sold on this website, and the Free plan needs no payment.
          </p>
          <ol className="mt-5 border-t-2 border-ink">
            {STEPS.map((step, i) => (
              <li key={step} className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-b border-rule py-4">
                <span className="nums font-bold text-ultra">{i + 1}.</span>
                <span className="text-ink-soft">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-ink-soft">
            We never see or store your card, UPI PIN or bank login details; the gateway handles them. Nomadic is
            digital: nothing is shipped (see the <a href="/shipping" className={LINK}>Shipping and Delivery Policy</a>).
          </p>
        </section>

        <section aria-labelledby="policies" className="mt-16 max-w-3xl">
          <h2 id="policies" className="text-2xl font-bold">Policies</h2>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-ink-soft">
            <li><a href="/terms" className={LINK}>Terms and Conditions</a></li>
            <li><a href="/privacy" className={LINK}>Privacy Policy</a></li>
            <li><a href="/refunds" className={LINK}>Refund and Cancellation Policy</a>: no auto-renewal; payment errors refunded in 5 to 7 working days</li>
            <li><a href="/shipping" className={LINK}>Shipping and Delivery Policy</a>: digital delivery, plan active within minutes</li>
          </ul>
        </section>

        <section aria-labelledby="who" className="mt-16 max-w-3xl">
          <h2 id="who" className="text-2xl font-bold">Who sells this</h2>
          <p className="mt-2 text-ink-soft">
            This website is operated by <strong className="text-ink">{LEGAL_NAME}</strong>, trading as {TRADE_NAME}.
            {REGISTERED_ADDRESS ? ` Registered address: ${REGISTERED_ADDRESS}.` : ''} Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className={`${LINK} break-all`}>{CONTACT_EMAIL}</a>, phone{' '}
            <a href={CONTACT_PHONE_HREF} className={LINK}>{CONTACT_PHONE}</a>. See{' '}
            <a href="/contact" className={LINK}>Contact</a> and <a href="/about" className={LINK}>About</a>.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
