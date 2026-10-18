import { PLANS as CONFIG_PLANS, formatPrice, pricingSentence, ANDROID_DOWNLOAD, MAC_DOWNLOAD, WINDOWS_DOWNLOAD } from '@nomadic/config';

/** Platforms with a public release, in order: e.g. ['Windows', 'macOS']. Driven by packages/config downloads.ts. */
export function releasedPlatforms(): string[] {
  return [
    WINDOWS_DOWNLOAD.version && 'Windows',
    MAC_DOWNLOAD.version && 'macOS',
    ANDROID_DOWNLOAD.version && 'Android',
  ].filter((p): p is string => Boolean(p));
}

/** One sentence for the hero and closing call: which platforms can be downloaded now. */
export function platformLine(): string {
  const p = releasedPlatforms();
  if (p.length === 0) return 'Public downloads are not open yet.';
  const list = p.length === 1 ? p[0] : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
  const android = ANDROID_DOWNLOAD.version ? '' : ' Android is coming soon.';
  return `Free to download for ${list}.${android}`;
}
// All sample data on the site is invented. Company names, people and domains are fictional.

export type StageId = 'learn' | 'find' | 'apply' | 'track';

export const STAGES: { id: StageId; label: string }[] = [
  { id: 'learn', label: 'Learn' },
  { id: 'find', label: 'Find' },
  { id: 'apply', label: 'Apply' },
  { id: 'track', label: 'Track' },
];

export type RoadmapStatus = 'done' | 'active' | 'next' | 'later';

export interface RoadmapNode {
  id: string;
  /** "Week 1", shown above the title, as on the app's path. */
  level: string;
  title: string;
  status: RoadmapStatus;
  progress: number;
  description: string;
  /** The week's study days, one topic each. */
  skills: string[];
}

/** A sample Frontend Engineer roadmap, shaped like the app's path: weeks of dated study days. */
export const ROADMAP: RoadmapNode[] = [
  {
    id: 'week-1',
    level: 'Week 1',
    title: 'Complexity and web foundations',
    status: 'done',
    progress: 100,
    description:
      'Big-O from first principles, then semantic HTML and the box model. Every topic ends with a short quiz that comes back as a spaced review.',
    skills: ['Time and space complexity', 'Complexity practice', 'Semantic HTML', 'CSS layout'],
  },
  {
    id: 'week-2',
    level: 'Week 2',
    title: 'Arrays and JavaScript',
    status: 'active',
    progress: 60,
    description:
      'Prefix sums and two pointers on named LeetCode problems, alongside closures, the event loop and modules in JavaScript.',
    skills: ['Prefix sums', 'Two pointers', 'Closures and scope', 'The event loop'],
  },
  {
    id: 'week-3',
    level: 'Week 3',
    title: 'Hashing and React',
    status: 'next',
    progress: 0,
    description:
      'Hash maps for counting and lookups, then components, props, state and effects in React.',
    skills: ['Hash maps', 'Components and props', 'State and effects', 'Revision day'],
  },
  {
    id: 'week-4',
    level: 'Week 4',
    title: 'Portfolio project',
    status: 'later',
    progress: 0,
    description:
      'Build a responsive portfolio site stage by stage, with starter code, hints and checks, then a timed online-assessment mock.',
    skills: ['Project: layout stage', 'Project: content stage', 'Project: deploy stage', 'OA mock test'],
  },
  {
    id: 'week-5',
    level: 'Week 5',
    title: 'Strings and TypeScript',
    status: 'later',
    progress: 0,
    description:
      'Sliding windows and string problems, and types, generics and narrowing in TypeScript.',
    skills: ['Sliding window', 'String problems', 'TypeScript basics', 'Generics'],
  },
];

export const ROADMAP_STATUS_LABEL: Record<RoadmapStatus, string> = {
  done: 'Done',
  active: 'In progress',
  next: 'Up next',
  later: 'Later',
};

export interface Job {
  id: string;
  company: string;
  role: string;
  where: string;
  source: string;
  posted: string;
  match: number;
  skills: string;
}

export const JOBS: Job[] = [
  { id: 'arcline', company: 'Arcline', role: 'Frontend Developer Intern', where: 'Bengaluru', source: 'Ashby', posted: '2 days ago', match: 92, skills: 'React, JavaScript, CSS' },
  { id: 'meridian', company: 'Meridian Labs', role: 'Software Engineer I', where: 'Hyderabad', source: 'Greenhouse', posted: '1 day ago', match: 88, skills: 'TypeScript, Node.js, SQL' },
  { id: 'tidewater', company: 'Tidewater', role: 'React Developer', where: 'Remote, India', source: 'Lever', posted: '3 days ago', match: 85, skills: 'React, TypeScript, testing' },
  { id: 'kestrel', company: 'Kestrel Data', role: 'Data Analyst Intern', where: 'Pune', source: 'Careers page', posted: 'Today', match: 71, skills: 'SQL, Excel, Python' },
  { id: 'fernwood', company: 'Fernwood', role: 'Software Engineering Intern', where: 'Bengaluru', source: 'Internshala', posted: '4 days ago', match: 80, skills: 'JavaScript, React' },
  { id: 'lumen', company: 'Lumen Works', role: 'Backend Engineer, Graduate', where: 'Gurugram', source: 'Greenhouse', posted: '5 days ago', match: 64, skills: 'Java, Spring, SQL' },
  { id: 'halcyon', company: 'Halcyon', role: 'Full-Stack Developer', where: 'Chennai', source: 'Lever', posted: '6 days ago', match: 77, skills: 'React, Node.js, MongoDB' },
  { id: 'northgate', company: 'Northgate', role: 'SDE Intern, Summer 2027', where: 'Remote, India', source: 'Ashby', posted: '1 week ago', match: 82, skills: 'DSA, Java or C++' },
];

export const JOB_SOURCES = ['All', 'Ashby', 'Greenhouse', 'Lever', 'Internshala', 'Careers page'];

export const APPLY_FORM_TITLE = 'Frontend Developer Intern at Arcline';

/** Where each filled value came from, as the app's review screen shows it. */
export type FieldSource = 'Profile' | 'Resume' | 'Your answer' | 'AI draft';

export const APPLY_FIELDS: { label: string; value: string; source: FieldSource }[] = [
  { label: 'Full name', value: 'Riya Sharma', source: 'Profile' },
  { label: 'Email', value: 'riya.sharma@example.com', source: 'Profile' },
  { label: 'Phone', value: '+91 90000 00000', source: 'Profile' },
  { label: 'Resume', value: 'riya-sharma-frontend.pdf', source: 'Resume' },
  { label: 'Graduation year', value: '2027', source: 'Your answer' },
  { label: 'Why this role', value: 'I build accessible React interfaces and want to…', source: 'AI draft' },
];

/** Common questions answered once on the Answers page and reused on every form. */
export const SAVED_ANSWERS: { q: string; a: string }[] = [
  { q: 'Notice period', a: 'Available from June 2027' },
  { q: 'Degree and branch', a: 'B.Tech, Computer Science' },
  { q: 'CGPA', a: '8.4 / 10' },
  { q: 'Willing to relocate?', a: 'Yes, anywhere in India' },
];

export const BOARD_STAGES = ['Needs action', 'Applied', 'Interviewing', 'Offer'];

export interface BoardCard {
  id: string;
  company: string;
  role: string;
  stage: number;
  note: string;
}

export const BOARD_START: BoardCard[] = [
  { id: 'fernwood', company: 'Fernwood', role: 'Software Engineering Intern', stage: 0, note: 'Form paused at a CAPTCHA' },
  { id: 'arcline', company: 'Arcline', role: 'Frontend Developer Intern', stage: 1, note: 'Reviewed and submitted' },
  { id: 'kestrel', company: 'Kestrel Data', role: 'Data Analyst Intern', stage: 1, note: 'Follow up on Friday' },
  { id: 'northgate', company: 'Northgate', role: 'SDE Intern', stage: 1, note: 'Online assessment due in 3 days' },
  { id: 'meridian', company: 'Meridian Labs', role: 'Software Engineer I', stage: 2, note: 'Interview tomorrow, 2:00 PM' },
  { id: 'halcyon', company: 'Halcyon', role: 'Full-Stack Developer', stage: 3, note: 'Offer letter to review' },
];

export interface Plan {
  id: string;
  name: string;
  price: string;
  per: string;
  summary: string;
  features: string[];
  featured?: boolean;
}

// Prices and plan features come from the shared config (packages/config), the single source of truth.
export const PLANS: Plan[] = CONFIG_PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  price: formatPrice(p.priceInr),
  per: p.priceInr === 0 ? 'no card needed' : 'per month',
  summary: p.summary,
  features: [...p.features],
  featured: p.featured,
}));

export const PAID_PRICES = CONFIG_PLANS.filter((p) => p.priceInr > 0).map((p) => formatPrice(p.priceInr));

export interface DataHandlingRow {
  title: string;
  items: string[];
}

/** Privacy and data-handling facts shown on the home page. Keep in sync with the privacy policy. */
export const DATA_HANDLING: DataHandlingRow[] = [
  {
    title: 'Stored on your computer',
    items: [
      'Your profile, resumes, saved jobs and application history, in the app\'s local database',
      'Works from your own browser: Nomadic never asks for your job-portal passwords',
    ],
  },
  {
    title: 'Synced to your account (Supabase, Mumbai)',
    items: [
      'Account email, name and a salted password hash; plan status',
      'Your profile, resumes, saved jobs, applications and learning progress, so they survive a reinstall',
      'Session token, device identifier and IP address, to keep one active device',
    ],
  },
  {
    title: 'What the AI sees',
    items: [
      'Only when you use an AI feature, through our own server: no API key needed from you',
      'Only what the request needs, such as a form question with the relevant profile fields',
      'Not used by us to train AI models',
    ],
  },
  {
    title: 'What we never do',
    items: [
      'Sell, rent or share your data with advertisers or data brokers',
      'Submit an application you have not reviewed and confirmed',
      'See your card or bank details (you pay from your own UPI app)',
    ],
  },
];

export const SIGNUP = {
  label: 'Get an email when something big ships',
  placeholder: 'you@example.com',
  button: 'Notify me',
  sending: 'Adding you',
  done: 'You are on the list. We will email you only when something big ships.',
  invalid: 'Enter a full email address, like you@example.com.',
  failed: 'That did not go through. Check your connection and try again.',
  note: 'A few emails a year at most. No spam, and we never share your address.',
};

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Nomadic?',
    a: 'Nomadic is a desktop app for Indian engineering students and freshers that covers the whole job search. It plans what to learn for your target role day by day, finds openings, fills in application forms for you to review and keeps track of every application, all in one place.',
  },
  {
    q: 'How does it work?',
    a: 'Answer a few questions about the role you want and the time you have, and Nomadic builds a week-by-week roadmap of study days with lessons, named LeetCode problems, quizzes and guided projects. It matches openings from company hiring pages to your skills, fills each application form from your saved details for you to review, and logs every application on your board.',
  },
  {
    q: 'Can I download it yet?',
    a: `Yes. Open the download page: Windows is a zip you extract and run, macOS has a one-line Terminal installer or a DMG${
      ANDROID_DOWNLOAD.version ? ', Android is an APK you install from the site' : ''
    }, and each comes with a short install guide.`,
  },
  {
    q: 'Which operating systems does it run on?',
    a: `Windows 10 and 11 (64-bit) and macOS 11 Big Sur or later, on both Apple Silicon and Intel Macs. ${
      ANDROID_DOWNLOAD.version ? `Android ${ANDROID_DOWNLOAD.minimumAndroid} or later on phones.` : 'An Android app is on the way.'
    }`,
  },
  {
    q: 'Can Nomadic apply to jobs for me?',
    a: 'It does the typing, not the deciding. Nomadic opens the real form in your own browser, fills every field it can from your profile, resume and saved answers, and shows where each value came from. You edit what needs it and tick "I reviewed this"; only then is the application submitted. Nothing is ever submitted without your review, on any plan.',
  },
  {
    q: 'Where do the job listings come from?',
    a: 'Directly from hiring sources: Greenhouse, Lever, Ashby, Internshala and supported company career pages, filtered to roles open to candidates in India.',
  },
  {
    q: 'What can I learn with it?',
    a: 'Roadmaps for frontend, backend, full-stack, data, machine learning, product, design and DevOps roles, with DSA, core CS and aptitude mixed in. Practice has around 1,800 company-tagged coding problems and interview questions, and the Projects library has about 4,100 guided projects with starter code, hints and checks.',
  },
  {
    q: 'Where is my data stored?',
    a: 'On your computer first: your profile, resumes, saved jobs, applications and learning progress live in a local database. They also sync to your account on servers in Mumbai, so they survive a reinstall. The privacy section above lists exactly what goes where.',
  },
  {
    q: 'Can I use it only for learning, or only for job hunting?',
    a: 'Yes to both. Pick a learning-only or job-search-only workspace during setup, and change it any time in Settings.',
  },
  {
    q: 'What do the plans cost?',
    a: `${pricingSentence()} Upgrade inside the app and pay from any UPI app; your plan is switched on after the payment is checked.`,
  },
];
