import { Check } from 'lucide-react';
import { PLANS } from '../content';
import ComingSoon from './ComingSoon';

export default function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <h2 id="pricing-title" className="wide max-w-4xl text-[clamp(1.75rem,4.6vw,3.5rem)]">
          Free to start. ₹249 or ₹599 a month for more.
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-ink-soft">
          Prices are in Indian rupees. Plans open when the download does.
        </p>

        <div className="mt-12 grid border-2 border-ink md:grid-cols-3">
          {PLANS.map((plan) => {
            const dark = plan.featured;
            return (
              <div
                key={plan.id}
                className={`flex flex-col p-6 sm:p-8 md:border-l-2 md:border-ink md:first:border-l-0 ${
                  dark ? 'on-dark bg-ultra text-white' : 'bg-white'
                } ${plan.id !== 'free' ? 'border-t-2 border-ink md:border-t-0' : ''}`}
              >
                <h3 className="wide text-2xl">{plan.name}</h3>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="wide nums text-5xl">{plan.price}</span>
                  <span className={dark ? 'text-white/85' : 'text-ink-soft'}>{plan.per}</span>
                </p>
                <p className={`mt-3 min-h-[3.5rem] ${dark ? 'text-white/90' : 'text-ink-soft'}`}>{plan.summary}</p>

                <ul className={`mt-6 flex-1 border-t ${dark ? 'border-white/30' : 'border-rule'}`}>
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex gap-3 border-b py-3 ${dark ? 'border-white/30' : 'border-rule'}`}
                    >
                      <Check
                        aria-hidden
                        strokeWidth={3}
                        className={`mt-1 h-4 w-4 shrink-0 ${dark ? 'text-marigold' : 'text-ultra'}`}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <ComingSoon
                  block
                  tone={dark ? 'dark' : 'light'}
                  label={`Get ${plan.name}`}
                  className="mt-8"
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
