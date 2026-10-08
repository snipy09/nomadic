import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_HREF, LEGAL_NAME } from '@nomadic/config';
import Nav from '../components/Nav';
import Footer from '../components/Footer';

const LINK = 'font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra break-all';

/** Contact details from @nomadic/config, the same source the legal pages and footer use. */
export default function Contact() {
  const rows = [
    { label: 'Operated by', value: <span className="font-bold text-ink">{LEGAL_NAME} (operating as Nomadic)</span> },
    { label: 'Email', value: <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>{CONTACT_EMAIL}</a> },
    { label: 'Phone', value: <a href={CONTACT_PHONE_HREF} className={LINK}>{CONTACT_PHONE}</a> },
  ];

  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h1 className="wide max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">Contact us</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-soft">
          Questions about the app, your account, a payment or a grievance: write or call us.
        </p>

        <dl className="mt-12 max-w-3xl border-t-2 border-ink">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-x-6 gap-y-1 border-b border-rule py-6 sm:grid-cols-[10rem_1fr]">
              <dt className="font-bold">{row.label}</dt>
              <dd className="text-ink-soft">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 max-w-3xl space-y-3 text-ink-soft">
          <p>
            For a payment question, include your account email and the payment reference. Grievances are acknowledged
            within 48 hours and we aim to resolve them within 30 days.
          </p>
          <p>
            See also the{' '}
            <a href="/terms" className={LINK}>Terms and Conditions</a>,{' '}
            <a href="/privacy" className={LINK}>Privacy Policy</a> and{' '}
            <a href="/refunds" className={LINK}>Refund and Cancellation Policy</a>.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
