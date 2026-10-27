import React, { useEffect } from 'react';
import {
  ArrowLeft, Check, X, BookOpen, Search, Zap, Mail,
  Shield, Clock, CreditCard, FileText,
  Layers, Target, Code, Database,
  Monitor, RefreshCw, Lock, ArrowUpRight
} from 'lucide-react';
import { PLANS } from '../content';

/* ─── Static Data ────────────────────────────────────────────── */

const PLATFORM_FEATURES = [
  {
    icon: BookOpen,
    title: 'AI Career Roadmaps',
    desc: 'Structured day-by-day learning curricula generated for any target role — Full-Stack Developer, AI/ML Engineer, Product Manager, and more. Each roadmap breaks into phased milestones with interactive progress tracking.',
  },
  {
    icon: Code,
    title: 'LeetCode Question Bank',
    desc: '428+ company-specific interview problem sets (17,300+ questions) sourced from verified interview reports. Filter by company, difficulty, and topic to practice exactly what top employers ask.',
  },
  {
    icon: Database,
    title: 'CS Textbook & Reference Library',
    desc: '12+ curated computer science textbooks and architecture guides covering data structures, algorithms, system design, networking, and operating systems — available offline inside the app.',
  },
  {
    icon: Target,
    title: '52-Week Activity Streak Heatmap',
    desc: 'GitHub-style contribution grid tracking your daily completed lessons, coding exercises, and learning milestones. Build consistency with visible streaks and weekly progress reports.',
  },
  {
    icon: Search,
    title: 'Direct ATS Job Radar',
    desc: 'Real-time listings scraped directly from employer ATS platforms (Ashby, Greenhouse, Lever, Internshala) — not stale aggregator feeds. Sub-30ms server-side pagination with 18/36/54 items per page.',
  },
  {
    icon: Layers,
    title: 'Anti-Ghost Deduplication',
    desc: 'Every listing is SHA-256 hashed by company + title + apply URL. Zero duplicate or expired ghost postings in your feed — only verified open positions.',
  },
  {
    icon: Zap,
    title: 'OmniForm Auto-Apply Engine',
    desc: 'Multi-pass form solver with >95% field accuracy across Ashby, Greenhouse, Lever, and Internshala portals. Handles React 18 virtual DOM inputs, legal arbitration checkboxes, file attachments, and demographic surveys.',
  },
  {
    icon: Monitor,
    title: 'Parallel Batch Co-Pilot',
    desc: '3–5 headful Chromium tab workers running in parallel for live visual inspection. Review and edit all open applications side-by-side, then submit all with one click.',
  },
  {
    icon: Mail,
    title: 'Verified Recruiter Outreach',
    desc: '4-stage email verification pipeline: RFC 5322 syntax → role/disposable filter → DNS MX record check → SMTP socket ping. Humanized drip engine with 15–25 emails/day cap and randomized delays.',
  },
  {
    icon: Lock,
    title: 'Local-First Data Security',
    desc: 'All candidate data, resumes, and application history stored in an isolated local SQLite database on your machine. No data harvesting, no third-party telemetry, no ad targeting.',
  },
];

const COURSES_AND_LEARNING = [
  {
    title: 'Dynamic AI Curriculum Generation',
    items: [
      'Enter any career goal to generate a multi-phase learning roadmap',
      'Day-by-day sub-topics with milestone completion tracking',
      'Configurable horizons: 1 Month Sprint, 3 Month Standard, 6 Month Mastery',
      'Daily commitment settings: 1 Hour, 2 Hours, or 4+ Hours per day',
    ],
  },
  {
    title: 'Interactive Study Interface',
    items: [
      '2-column layout: concept checklist (left) + verified YouTube tutorials & documentation links (right)',
      'One-click mastery completion toggles for each sub-topic',
      'Automatic caching in local SQLite to prevent regeneration loops',
      'Progress visualization with percentage completion per phase',
    ],
  },
  {
    title: 'Interview Preparation Resources',
    items: [
      '428+ company-specific LeetCode question sets with 17,300+ problems',
      'Filter by company (Google, Amazon, Microsoft, Meta, Stripe, etc.)',
      '12+ curated CS textbooks: algorithms, system design, networking, OS',
      'Opportunity board for research fellowships, hackathons, and grants',
    ],
  },
];

// Plans, prices and features come from packages/config (via content.ts), never typed here.
const SUPPORT_WHATSAPP = '919493833632';

interface PricingPlan {
  name: string;
  price: string;
  period: string;
  desc: string;
  featured?: boolean;
  features: string[];
  cta: string;
  ctaHref: string;
}

const PRICING_PLANS: PricingPlan[] = PLANS.map((p) => {
  const free = p.id === 'free';
  return {
    name: p.name,
    price: p.price,
    period: p.per,
    desc: p.summary,
    featured: p.featured,
    features: p.features,
    cta: free ? 'Download the App' : `Upgrade to ${p.name} (${p.price})`,
    ctaHref: free
      ? '/download'
      : `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Hi, I want to upgrade to Nomadic ${p.name} (${p.price}/mo).`)}`,
  };
});

/* ─── Component ──────────────────────────────────────────────── */

export default function Services() {
  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 font-sans flex flex-col antialiased selection:bg-ink-900 selection:text-white">
      {/* Header */}
      <header className="border-b border-ink-200 bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="font-extrabold text-base tracking-tight flex items-center gap-2.5 text-ink-950">
            <img
              src="/logo-icon.png"
              alt="Nomadic Logo Icon"
              className="h-6 w-6 rounded object-contain shadow-fine"
            />
            Nomadic
          </a>
          <div className="flex items-center gap-4 text-[13px] font-medium text-ink-600">
            <a href="/" className="hidden sm:inline hover:text-ink-950 transition-colors flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Home
            </a>
            <a href="#services-features" className="hidden sm:inline hover:text-ink-950 transition-colors">Features</a>
            <a href="#services-pricing" className="hidden sm:inline hover:text-ink-950 transition-colors">Pricing</a>
            <a
              href="/download"
              className="text-[13px] font-semibold bg-ink-950 hover:bg-black text-white px-4 py-2 rounded-full transition-all shadow-fine active:scale-[0.98]"
            >
              Download Nomadic
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-16 sm:pt-24 pb-12 px-4 sm:px-6 bg-white border-b border-ink-200">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <span className="text-[11px] font-mono font-bold text-ink-500 uppercase tracking-wider">
            Services & Pricing
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-ink-950 leading-tight">
            Everything Nomadic delivers.
          </h1>
          <p className="text-sm sm:text-base text-ink-600 max-w-2xl mx-auto leading-relaxed">
            A complete breakdown of the platform's courses, learning resources, automation capabilities, subscription plans, and policies — all in one place.
          </p>
        </div>
      </section>

      {/* ── 1. About the Service ─────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 bg-ink-50 border-b border-ink-200">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold text-ink-500 uppercase tracking-wider">About the Service</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-950">What is Nomadic?</h2>
          </div>
          <div className="text-sm text-ink-700 leading-relaxed space-y-4">
            <p>
              Nomadic is a desktop software application (Windows, macOS) that consolidates career skill development, real-time job discovery, application form automation, and verified recruiter outreach into a single integrated workspace.
            </p>
            <p>
              The product is delivered as a downloadable desktop application built with Electron 31, React 18, and a local SQLite database. Upon purchasing a subscription, the user receives immediate digital access to the software and all tier-specific features. No physical goods are shipped.
            </p>
            <p>
              <strong>Nature of Service:</strong> Digital software subscription providing career learning tools, job aggregation, application automation, and recruiter contact discovery. The subscription is billed monthly and can be cancelled at any time — cancellation takes effect at the end of the current billing cycle.
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. Platform Features ─────────────────────────────── */}
      <section id="services-features" className="py-16 px-4 sm:px-6 bg-white border-b border-ink-200">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="max-w-2xl space-y-2">
            <span className="text-[11px] font-mono font-bold text-ink-500 uppercase tracking-wider">Platform Features</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-950">
              What you get with Nomadic
            </h2>
            <p className="text-sm text-ink-600">
              Ten core capabilities that cover the full career lifecycle — from learning to landing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLATFORM_FEATURES.map((f) => (
              <div
                key={f.title}
                className="p-5 rounded-xl border border-ink-200 bg-ink-50 space-y-2.5 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <f.icon className="w-4.5 h-4.5 text-ink-950 shrink-0" />
                  <h3 className="text-sm font-bold text-ink-950">{f.title}</h3>
                </div>
                <p className="text-xs text-ink-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Courses & Learning Content ────────────────────── */}
      <section className="py-16 px-4 sm:px-6 bg-ink-50 border-b border-ink-200">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="max-w-2xl space-y-2">
            <span className="text-[11px] font-mono font-bold text-ink-500 uppercase tracking-wider">Courses & Learning</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-950">
              Structured learning, not scattered tutorials
            </h2>
            <p className="text-sm text-ink-600">
              Nomadic generates personalised career curricula and provides verified technical resources — here's exactly what's included.
            </p>
          </div>

          <div className="space-y-6">
            {COURSES_AND_LEARNING.map((section) => (
              <div
                key={section.title}
                className="p-6 rounded-xl border border-ink-200 bg-white shadow-fine space-y-4"
              >
                <h3 className="text-sm font-bold text-ink-950 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 shrink-0" />
                  {section.title}
                </h3>
                <ul className="space-y-2.5">
                  {section.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-xs text-ink-700 leading-relaxed">
                      <Check className="w-3.5 h-3.5 text-ink-950 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Supported Career Tracks */}
          <div className="p-6 rounded-xl border border-ink-200 bg-white shadow-fine space-y-4">
            <h3 className="text-sm font-bold text-ink-950">Supported Career Tracks (examples)</h3>
            <div className="flex flex-wrap gap-2">
              {[
                'Full-Stack Web Developer', 'Frontend Engineer', 'Backend Engineer',
                'AI / ML Engineer', 'Data Scientist', 'DevOps / SRE',
                'Mobile App Developer', 'Product Manager', 'Cybersecurity Analyst',
                'Cloud Architect', 'Blockchain Developer', 'Game Developer',
              ].map((track) => (
                <span
                  key={track}
                  className="px-3 py-1.5 rounded-lg bg-ink-100 text-xs font-medium text-ink-800 border border-ink-200"
                >
                  {track}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Pricing Plans ─────────────────────────────────── */}
      <section id="services-pricing" className="py-16 px-4 sm:px-6 bg-white border-b border-ink-200">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-[11px] font-mono font-bold text-ink-500 uppercase tracking-wider">Pricing</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-950">
              Simple, transparent pricing
            </h2>
            <p className="text-sm text-ink-600">
              Start free forever. Upgrade anytime. Cancel anytime — no lock-in, no hidden fees.
            </p>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`p-8 rounded-3xl flex flex-col justify-between space-y-6 ${
                  plan.featured
                    ? 'border-2 border-ink-950 bg-white shadow-md'
                    : 'border border-ink-200 bg-ink-50'
                }`}
              >
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-ink-950 uppercase tracking-wider">{plan.name}</h3>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-ink-950">{plan.price}</span>
                      <span className="text-xs text-ink-500">{plan.period}</span>
                    </div>
                    <p className="text-xs text-ink-600 mt-1.5">{plan.desc}</p>
                  </div>

                  <ul className="space-y-3 text-xs text-ink-700">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5">
                        <Check className="w-4 h-4 text-ink-950 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href={plan.ctaHref}
                  target={plan.ctaHref.startsWith('http') ? '_blank' : undefined}
                  rel={plan.ctaHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className={`w-full text-center py-3 px-4 rounded-xl text-xs font-semibold transition-colors block shadow-fine ${
                    plan.featured || plan.ctaHref !== '/download'
                      ? 'bg-ink-950 hover:bg-black text-white'
                      : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-950'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          {/* Payment Methods */}
          <div className="max-w-5xl mx-auto p-6 rounded-xl border border-ink-200 bg-ink-50 space-y-3 shadow-fine mt-4">
            <h3 className="text-sm font-bold text-ink-950 flex items-center gap-2">
              <CreditCard className="w-4 h-4 shrink-0" />
              Accepted Payment Methods
            </h3>
            <p className="text-xs text-ink-600 leading-relaxed">
              UPI (Google Pay, PhonePe, Paytm, BHIM) · Debit and Credit Cards (Visa, Mastercard, RuPay) · Net Banking · Wallets.
              All payments are processed securely through RBI-authorised payment aggregators with PCI DSS Level 1 compliance.
              Prices are listed in Indian Rupees (₹ INR) and include applicable taxes.
            </p>
          </div>
        </div>
      </section>

      {/* ── 5. Delivery & Fulfilment ─────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 bg-ink-50 border-b border-ink-200">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold text-ink-500 uppercase tracking-wider">Delivery & Fulfilment</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-950">How you receive the product</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: Monitor,
                title: 'Instant Digital Delivery',
                text: 'Upon successful payment, your subscription is activated immediately. You receive access to download the Nomadic desktop application and all tier-specific features are unlocked within the app.',
              },
              {
                icon: Clock,
                title: 'Activation Timeline',
                text: 'Feature activation is instant — typically within 60 seconds of payment confirmation. If activation is delayed beyond 15 minutes, contact support for manual verification.',
              },
              {
                icon: RefreshCw,
                title: 'Subscription Renewal',
                text: 'Monthly subscriptions renew automatically on the same date each month. You will be notified before each renewal. Cancel anytime — access continues until the end of the paid period.',
              },
              {
                icon: Shield,
                title: 'No Physical Shipping',
                text: 'Nomadic is 100% digital software. No physical goods are manufactured or shipped. The product is delivered electronically via software download and cloud-activated license keys.',
              },
            ].map((item) => (
              <div key={item.title} className="p-5 rounded-xl border border-ink-200 bg-white shadow-fine space-y-2">
                <div className="flex items-center gap-2">
                  <item.icon className="w-4 h-4 text-ink-950 shrink-0" />
                  <h3 className="text-sm font-bold text-ink-950">{item.title}</h3>
                </div>
                <p className="text-xs text-ink-600 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Refund & Cancellation Policy ──────────────────── */}
      <section className="py-16 px-4 sm:px-6 bg-white border-b border-ink-200">
        <div className="max-w-4xl mx-auto space-y-6 flex flex-col items-center">
          <div className="text-center max-w-xl mx-auto space-y-3 pb-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-950">Clear refund terms</h2>
            <p className="text-sm text-ink-600">Please review our full refund and cancellation policy at the link below. It outlines eligibility for the 7-day non-usage refund window and the cancellation process.</p>
          </div>
          
          <a
            href="/refunds"
            className="w-full sm:w-auto text-center py-3 px-6 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-semibold text-ink-950 transition-colors shadow-fine inline-flex items-center justify-center gap-2"
          >
            Read the Refund & Cancellation Policy
            <ArrowUpRight className="w-4 h-4 text-ink-600" />
          </a>
        </div>
      </section>

      {/* ── 7. Contact & Grievance Officer ───────────────────── */}
      <section className="py-16 px-4 sm:px-6 bg-ink-50 border-b border-ink-200">
        <div className="max-w-4xl mx-auto flex flex-col items-center space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-3 pb-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-950">Need assistance?</h2>
            <p className="text-sm text-ink-600">For support, billing inquiries, physical contact details, or to contact our Grievance Officer, please visit our Contact page.</p>
          </div>
          
          <a
            href="/contact"
            className="w-full sm:w-auto text-center py-3 px-6 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-semibold text-ink-950 transition-colors shadow-fine inline-flex items-center justify-center gap-2"
          >
            Go to Contact Page
            <ArrowUpRight className="w-4 h-4 text-ink-600" />
          </a>
        </div>
      </section>

      <footer className="border-t border-ink-200 bg-white py-8 px-6 text-center text-xs text-ink-400">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Nomadic / Desktop Application for All Job Seekers</span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href="/" className="hover:text-ink-950 transition-colors">Home</a>
            <a href="/terms" className="hover:text-ink-950 transition-colors">Terms of Service</a>
            <a href="/privacy" className="hover:text-ink-950 transition-colors">Privacy Policy</a>
            <a href="/refunds" className="hover:text-ink-950 transition-colors">Refund Policy</a>
            <a href="/contact" className="hover:text-ink-950 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
