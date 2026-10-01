// Single source of truth for everything the marketing site says about the
// product: URLs, plans, FAQs. Pricing here must match
// apps/desktop/src/renderer/utils/tier-utils.ts.

export const SITE = {
  name: 'Nomadic',
  legalName: 'Nomadic Technologies',
  url: 'https://nomadicai.vercel.app',
  tagline: 'Learn the skills. Find the jobs. Apply in a fraction of the time.',
  description:
    'Nomadic is a desktop app for your job search: AI career roadmaps, 428+ company LeetCode sets, a live feed of jobs from Greenhouse, Lever and Ashby, and assisted auto-apply that fills applications for you.',
  ogImage: '/og.png',
  themeColor: '#000000',
  version: '1.0.6',
  supportEmail: 'support@nomadic.app',
  whatsapp: 'https://wa.me/919493833632',
  github: 'https://github.com/snipy09/JobMaxxer',
  platforms: ['Windows', 'macOS', 'Linux'],
} as const;

const wa = (text: string) => `${SITE.whatsapp}?text=${encodeURIComponent(text)}`;

export const ALPHA = {
  price: 99,
  seats: 100,
  preRegisterUrl: wa(
    'Hi Nomadic team, I want to pre-register for the Nomadic closed alpha (₹99). Please reserve my spot.',
  ),
  preRegisterWithEmail: (email: string) =>
    wa(`Hi Nomadic team, I'm pre-registering for the Nomadic closed alpha (₹99). My email: ${email}`),
};

export interface Plan {
  id: 'free' | 'pro' | 'max';
  name: string;
  price: number;
  period: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string; external?: boolean };
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    blurb: 'Try the workspace and see how it fits.',
    features: [
      '1 interactive roadmap preview',
      'Top 10 curated direct jobs',
      '3 company LeetCode sets',
      '2 core CS textbooks',
      'Local-first profile storage',
    ],
    cta: { label: 'Join the alpha', href: '/download' },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 249,
    period: 'month',
    blurb: 'Everything you need to learn and apply with intent.',
    features: [
      'All 52-week AI roadmaps',
      '428+ company LeetCode sets',
      '12+ CS textbook library',
      'Full direct-ATS job feed',
      'Assisted auto-apply, 50 a week',
      '25 verified recruiter leads a week',
      '5 tailored resumes',
    ],
    cta: {
      label: 'Get Pro',
      href: wa('Hi, I want to upgrade to Nomadic Pro (₹249/mo).'),
      external: true,
    },
  },
  {
    id: 'max',
    name: 'Max',
    price: 599,
    period: 'month',
    blurb: 'Hands-off applying for a serious search.',
    featured: true,
    features: [
      'Everything in Pro',
      'Unlimited autonomous auto-apply',
      'Unlimited recruiter outreach',
      'Priority 15-minute job radar',
      'Priority form solver and cloud sync',
    ],
    cta: {
      label: 'Get Max',
      href: wa('Hi, I want to upgrade to Nomadic Max (₹599/mo).'),
      external: true,
    },
  },
];

export const ATS_SOURCES = [
  'Greenhouse',
  'Lever',
  'Ashby',
  'Internshala',
  'SmartRecruiters',
  'Workable',
  'Remotive',
  'Company career pages',
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Nomadic?',
    a: 'Nomadic is a desktop app that brings your whole job search into one place: a learning roadmap for your target role, a feed of jobs pulled straight from company hiring systems, assisted auto-apply, an application tracker and recruiter outreach.',
  },
  {
    q: 'How does Nomadic auto-apply work?',
    a: 'You build your profile and resume once. When you apply, Nomadic opens the application in a real browser on your computer and fills the fields from your profile: contact details, education, experience, dropdowns, checkboxes and file uploads. In semi-automatic mode you review every form before it is submitted. In autonomous mode (Max), supported forms are submitted for you based on your criteria.',
  },
  {
    q: 'Which job sites does Nomadic support?',
    a: 'Nomadic finds jobs directly on Greenhouse, Lever, Ashby, Internshala and supported company career pages, plus curated sources like Remotive. Auto-apply works best on Greenhouse, Lever, Ashby and Internshala. Portals that need a login, captcha or email verification hand control back to you.',
  },
  {
    q: 'Is my data private?',
    a: 'Your profile, resumes, notes and application history are stored in a local SQLite database on your computer. Only what your account needs (email, name, plan, licence, device lock and saved job links) syncs to our servers. When you use an AI feature, the relevant profile details, resume text and job description are sent to the AI provider to generate the answer. We never sell your data.',
  },
  {
    q: 'Which operating systems are supported?',
    a: 'Nomadic is a native desktop app for Windows, macOS and Linux. The closed alpha ships on Windows first.',
  },
  {
    q: 'Can I use Nomadic only for learning, or only for job search?',
    a: 'Yes, either works. The Learn workspace (roadmaps, LeetCode company sets, textbooks, interview prep) is useful on its own, and so is the job feed and tracker if your skills are already ready.',
  },
  {
    q: 'How much does Nomadic cost?',
    a: 'There is a free plan. Pro is ₹249 a month and Max is ₹599 a month. Right now you can pre-register for the closed alpha for a one-time ₹99, which includes full Max access during the alpha.',
  },
  {
    q: 'Does Nomadic guarantee interviews or offers?',
    a: 'No. Nomadic saves you time and helps you apply to more relevant roles with a stronger profile. Hiring decisions are always made by the companies.',
  },
];
