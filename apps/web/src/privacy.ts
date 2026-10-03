// Where data goes, as the Nomadic desktop app and this website actually behave (desktop 1.0.6).
// One source for the home page's privacy band and the privacy policy page.
//
// Checked against the code, not intentions: apps/desktop/src/main/services/{auth,session,cloud-sync,
// profile,applications,oauth}.ts, packages/automation (AI calls), packages/supabase/migrations (what the
// server stores), and this site's index.html / App.tsx. Change this file in the same pull request as any
// change to those data flows.

export const PRIVACY_UPDATED = 'October 2026';
export const SUPPORT_EMAIL = 'support@nomadic.app';

export interface DataHandlingRow {
  title: string;
  items: string[];
}

/** Short version for the home page. */
export const DATA_HANDLING: DataHandlingRow[] = [
  {
    title: 'Kept on your computer',
    items: [
      'A local database with your profile, resumes, application history and notes',
      'Resume files, which never leave your computer',
      'Learning progress and activity history',
    ],
  },
  {
    title: 'Backed up to your account',
    items: [
      'Account email, name, plan and a salted password hash',
      'Your profile, resume text and saved answers, so a reinstall restores them',
      'Tracked applications with notes, and saved job links',
      'Device name, device ID and IP address, to allow one computer at a time',
    ],
  },
  {
    title: 'When you use AI',
    items: [
      'The form question or interview answer, plus the profile details needed to respond',
      'Sent from your computer to Google (Gemini) or Groq',
      'Only when you use an AI feature',
    ],
  },
  {
    title: 'What we never do',
    items: [
      'Sell, rent or share your data with advertisers or data brokers',
      'Submit an application without your review, unless you start autonomous mode (Max)',
      'Run analytics or tracking cookies on this website',
    ],
  },
];

export interface PolicySection {
  heading: string;
  intro?: string;
  items?: string[];
}

/** Full version for /privacy. */
export const PRIVACY_POLICY: PolicySection[] = [
  {
    heading: 'Who we are',
    intro: `Nomadic is made by Nomadic Technologies. This policy covers the Nomadic desktop app and this website. Write to ${SUPPORT_EMAIL} with any question about your data.`,
  },
  {
    heading: 'Kept on your computer',
    intro: 'The app keeps a local database in your user folder. It holds:',
    items: [
      'Your profile: name, contact details, links, work preferences, target role, skills and resume text.',
      'Saved answers to application questions, and answers the app remembers from forms you filled.',
      'Applications you track, with status history and notes, and jobs you saved.',
      'Resume file locations. The files themselves are never uploaded.',
      'Learning progress, custom roadmaps and an activity history.',
      'Personal API keys and an email (SMTP) password, if you enter them. On this computer they are encrypted with your operating system’s key store.',
    ],
  },
  {
    heading: 'Stored on our server',
    intro:
      'Your account lives on our server (hosted by Supabase). Parts of your local data are copied there so they work on a new install or a new computer:',
    items: [
      'Account: email, name, plan, plan expiry, license key and sign-in times. Your password is stored only as a salted bcrypt hash.',
      'Failed sign-in attempts by email address, to lock out password guessing.',
      'Device: the computer’s name, a device ID and your public IP address (looked up through ipify.org), plus a check-in every 45 seconds while you are signed in. This enforces one computer per account.',
      'Profile backup: name, phone number, LinkedIn and GitHub links, sponsorship, expected salary, notice period, target role, skills, resume text and saved application answers.',
      'In the current version the profile backup also includes any personal Groq API key and email (SMTP) password you entered. We are changing this so they stay on your computer only.',
      'Applications you track (company, role, link, status, notes and history), saved job links, and resume names, target roles and file locations.',
    ],
  },
  {
    heading: 'AI features',
    intro:
      'When you use an AI feature, such as answering an open-ended application question, feedback on an interview practice answer or generating a roadmap, the app sends the question or your answer, plus the profile details needed to respond, from your computer to Google (Gemini) or Groq. It uses the API key you entered, or a key built into the app. Nothing is sent to an AI provider when you do not use these features. The providers handle that data under their own terms.',
  },
  {
    heading: 'Applying to jobs',
    intro:
      'Nomadic opens the employer’s application page in a browser on your computer and fills it from your profile. In the normal flow you review every field and nothing is submitted until you confirm. In autonomous mode (Max plan), which you start yourself, it submits forms that are ready without a review step. Whatever you submit goes to that employer and its hiring system, under their privacy policy.',
  },
  {
    heading: 'Sign-in with Google',
    intro: 'If you sign in with Google, Google tells Nomadic your name and email address. We do not receive your Google password.',
  },
  {
    heading: 'Payments',
    intro:
      'Payments are processed by Razorpay. We receive your email address, the amount, the plan and Razorpay’s payment ID, and keep a billing record. We never see or store card or bank details.',
  },
  {
    heading: 'This website',
    intro:
      'This site has no analytics, no tracking and no cookies. Fonts are served from this site, not from a third party. Our host, Vercel, processes standard request logs (such as IP address and browser) to deliver the pages.',
  },
  {
    heading: 'What we never do',
    items: [
      'Sell or rent your data, or share it with advertisers or data brokers.',
      'Use your data for advertising.',
    ],
  },
  {
    heading: 'Your choices',
    items: [
      'Uninstalling the app and deleting its folder removes the local data from that computer.',
      `To get a copy of your account data or to delete your account and its server data, email ${SUPPORT_EMAIL} from your account’s email address.`,
    ],
  },
];
