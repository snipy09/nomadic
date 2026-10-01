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
  level: string;
  title: string;
  status: RoadmapStatus;
  progress: number;
  description: string;
  skills: string[];
}

export const ROADMAP: RoadmapNode[] = [
  {
    id: 'html-css',
    level: 'Foundations',
    title: 'HTML and CSS',
    status: 'done',
    progress: 100,
    description:
      'Semantic document structure, flexbox and grid layouts, responsive design and accessibility basics.',
    skills: ['Semantic HTML', 'CSS Grid', 'Flexbox', 'Accessibility'],
  },
  {
    id: 'react',
    level: 'Practice',
    title: 'React',
    status: 'active',
    progress: 85,
    description:
      'Components, state management, custom hooks, rendering and client-side routing, built through small practice projects.',
    skills: ['Component architecture', 'Custom hooks', 'State management', 'TypeScript'],
  },
  {
    id: 'backend',
    level: 'Practice',
    title: 'Backend APIs',
    status: 'next',
    progress: 0,
    description:
      'REST design, asynchronous handlers, HTTP verbs, middleware and request validation.',
    skills: ['Node.js', 'Express', 'API routing', 'Auth handlers'],
  },
  {
    id: 'postgres',
    level: 'Projects',
    title: 'PostgreSQL',
    status: 'later',
    progress: 0,
    description:
      'Relational modeling, transactions, indexing and query tuning, applied in a project with a real schema.',
    skills: ['SQL schemas', 'Indexes', 'Foreign keys', 'Query tuning'],
  },
  {
    id: 'production',
    level: 'Interview ready',
    title: 'Production and CI/CD',
    status: 'later',
    progress: 0,
    description:
      'Containers, automated test pipelines, GitHub Actions, cloud deployment and monitoring.',
    skills: ['Docker', 'GitHub Actions', 'Deployment', 'Monitoring'],
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
  { id: 'arcline', company: 'Arcline', role: 'Full-Stack Software Engineer', where: 'Remote, global', source: 'Ashby', posted: '2 days ago', match: 96, skills: 'TypeScript, React, Node.js' },
  { id: 'meridian', company: 'Meridian Labs', role: 'Backend Platform Engineer', where: 'Remote, US', source: 'Greenhouse', posted: '1 day ago', match: 94, skills: 'PostgreSQL, APIs, distributed systems' },
  { id: 'tidewater', company: 'Tidewater', role: 'Frontend Systems Engineer', where: 'Remote, US and EU', source: 'Lever', posted: '3 days ago', match: 92, skills: 'Next.js, React, performance' },
  { id: 'kestrel', company: 'Kestrel Data', role: 'Database and Infrastructure Specialist', where: 'Remote, global', source: 'Careers page', posted: 'Just now', match: 90, skills: 'PostgreSQL, Docker, Go' },
  { id: 'fernwood', company: 'Fernwood', role: 'Software Engineering Intern', where: 'Bengaluru', source: 'Internshala', posted: '4 days ago', match: 88, skills: 'JavaScript, React' },
  { id: 'lumen', company: 'Lumen Works', role: 'Platform Engineer', where: 'Remote, EU', source: 'Greenhouse', posted: '5 days ago', match: 85, skills: 'Kubernetes, Go, CI/CD' },
  { id: 'halcyon', company: 'Halcyon', role: 'Desktop App Engineer', where: 'Remote, global', source: 'Lever', posted: '6 days ago', match: 83, skills: 'Electron, TypeScript' },
  { id: 'northgate', company: 'Northgate', role: 'Full-Stack Developer', where: 'Remote, global', source: 'Ashby', posted: '1 week ago', match: 81, skills: 'React, Node.js, SQL' },
];

export const JOB_SOURCES = ['All', 'Ashby', 'Greenhouse', 'Lever', 'Internshala', 'Careers page'];

export const APPLY_FORM_TITLE = 'Full-Stack Software Engineer at Arcline';

export const APPLY_FIELDS: { label: string; value: string }[] = [
  { label: 'Full name', value: 'Sam Rivera' },
  { label: 'Email', value: 'sam.rivera@example.com' },
  { label: 'Phone', value: '+91 90000 00000' },
  { label: 'Resume', value: 'sam-rivera-fullstack.pdf' },
  { label: 'Portfolio', value: 'portfolio.example.com' },
  { label: 'Why this role', value: 'Saved answer: I build production React and Node apps.' },
];

export const AUTO_QUEUE: { company: string; role: string }[] = [
  { company: 'Arcline', role: 'Full-Stack Software Engineer' },
  { company: 'Meridian Labs', role: 'Backend Platform Engineer' },
  { company: 'Tidewater', role: 'Frontend Systems Engineer' },
  { company: 'Kestrel Data', role: 'Database and Infrastructure Specialist' },
  { company: 'Northgate', role: 'Full-Stack Developer' },
];

export const OUTREACH: { role: string; company: string; domain: string }[] = [
  { role: 'Technical Recruiting Lead', company: 'Arcline', domain: 'arcline.example' },
  { role: 'Engineering Talent Partner', company: 'Meridian Labs', domain: 'meridianlabs.example' },
  { role: 'Head of People and Hiring', company: 'Tidewater', domain: 'tidewater.example' },
  { role: 'Senior Technical Recruiter', company: 'Kestrel Data', domain: 'kestrel.example' },
];

export const BOARD_STAGES = ['Saved', 'Applied', 'Assessment', 'Interview', 'Offer'];

export interface BoardCard {
  id: string;
  company: string;
  role: string;
  stage: number;
  note: string;
}

export const BOARD_START: BoardCard[] = [
  { id: 'fernwood', company: 'Fernwood', role: 'Product Systems Engineer', stage: 0, note: 'Saved from a careers page' },
  { id: 'lumen', company: 'Lumen Works', role: 'Full-Stack Developer', stage: 0, note: 'Saved from Greenhouse' },
  { id: 'northgate', company: 'Northgate', role: 'Platform Engineer', stage: 0, note: 'Saved from Ashby' },
  { id: 'arcline', company: 'Arcline', role: 'Full-Stack Engineer', stage: 1, note: 'Submitted through Ashby' },
  { id: 'kestrel', company: 'Kestrel Data', role: 'Infrastructure Specialist', stage: 1, note: 'Submitted on the careers page' },
  { id: 'tidewater', company: 'Tidewater', role: 'Frontend Engineer', stage: 2, note: 'Due in 3 days' },
  { id: 'meridian', company: 'Meridian Labs', role: 'Backend Platform Engineer', stage: 3, note: 'Tomorrow, 2:00 PM' },
  { id: 'halcyon', company: 'Halcyon', role: 'Desktop App Engineer', stage: 4, note: 'Offer under review' },
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

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    per: 'no card needed',
    summary: 'See how the pieces fit together.',
    features: [
      '1 interactive roadmap preview',
      'Top 10 curated direct jobs',
      'Top 3 company LeetCode sets',
      '2 core CS textbooks',
      'Local-first candidate storage',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹249',
    per: 'per month',
    summary: 'The full toolkit, with you approving each application.',
    featured: true,
    features: [
      'All 52-week AI roadmaps',
      '428+ company LeetCode sets (17.3k questions)',
      'Full library of 12+ CS textbooks',
      'Direct ATS radar with 18, 36 and 54 page navigation',
      'Semi-auto apply, 50 applications a week',
      '25 verified recruiter contacts a week and 5 resumes',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    price: '₹599',
    per: 'per month',
    summary: 'Everything in Pro, with Nomadic running the repetitive work.',
    features: [
      'Everything in Pro',
      'Autonomous auto-apply, unlimited',
      'Unlimited background recruiter outreach',
      'Priority 15-minute ATS radar streaming',
      'Highest priority solver and cloud sync',
    ],
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Nomadic?',
    a: 'Nomadic is a desktop app that covers the whole job search. It teaches the skills for your target role, finds openings, fills in application forms and keeps track of every application, all in one place.',
  },
  {
    q: 'How does it work?',
    a: 'Choose a target role and work through a roadmap of practice milestones. Nomadic then matches openings from company hiring sources to your profile, uses your saved details to fill in the repetitive parts of each application, and logs every application on your board.',
  },
  {
    q: 'Can I download it yet?',
    a: 'Not yet. Public downloads are coming soon, and the download page will carry the installer when it is ready.',
  },
  {
    q: 'Which operating systems does it run on?',
    a: 'Nomadic is a native desktop app for Windows, macOS and Linux.',
  },
  {
    q: 'Can Nomadic apply to jobs for me?',
    a: 'It can handle the repetitive parts. In semi-automatic mode it fills in your saved details and you review each application before it goes out. In autonomous mode, available on Max, it works through applications that match your saved criteria. What it can do depends on the job portal and your settings.',
  },
  {
    q: 'Where do the job listings come from?',
    a: 'Directly from hiring sources: Greenhouse, Lever, Ashby, Internshala and supported company career pages.',
  },
  {
    q: 'Where is my data stored?',
    a: 'On your computer. Your profile, resumes, notes and application history live in a local SQLite database. Only your account ID, plan status and bookmarked job links sync to our server so your plan keeps working.',
  },
  {
    q: 'Can I use it only for learning, or only for job hunting?',
    a: 'Yes to both. The learning roadmaps work on their own, and so do job discovery, application tracking and automation if your skills and portfolio are already in place.',
  },
  {
    q: 'What do the plans cost?',
    a: 'Free costs ₹0. Pro is ₹249 a month and Max is ₹599 a month. Plans open when the download does.',
  },
];
