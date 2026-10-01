import React from 'react';
import {
  Route, Code2, BookMarked, Layers, Filter, Gauge, RefreshCcw, Eye, Zap, HardDrive, Cloud, Ban, Cpu, KeyRound,
} from 'lucide-react';
import { Reveal } from '../components/Reveal';
import { AppWindow } from '../components/Chrome';
import { ApplyFormMock, JobFeedMock, OutreachMock, RoadmapMock, TrackerMock } from '../components/Mockups';
import { useScrollProgress } from '../lib/motion';

function SectionIntro({
  eyebrow,
  title,
  lead,
  dark,
  eyebrowClass = 'text-accent',
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  dark?: boolean;
  eyebrowClass?: string;
}) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <p className={`t-eyebrow mb-3 ${eyebrowClass}`}>{eyebrow}</p>
      <h2 className="t-display">{title}</h2>
      <p className={`t-lead mx-auto mt-5 max-w-2xl ${dark ? '!text-night-muted' : ''}`}>{lead}</p>
    </Reveal>
  );
}

function Point({ icon: Icon, title, text, dark }: { icon: typeof Route; title: string; text: string; dark?: boolean }) {
  return (
    <div>
      <Icon className={`mb-3 h-7 w-7 ${dark ? 'text-accent-bright' : 'text-accent'}`} strokeWidth={1.6} />
      <h3 className="text-[17px] font-semibold tracking-headline">{title}</h3>
      <p className={`mt-1.5 text-[15px] leading-relaxed ${dark ? 'text-night-muted' : 'text-muted'}`}>{text}</p>
    </div>
  );
}

export function Learn() {
  return (
    <section id="learn" className="bg-mist py-24 sm:py-32">
      <div className="container-page">
        <SectionIntro
          eyebrow="Learn"
          title={<>Know exactly what<br className="hidden sm:block" /> to learn next.</>}
          lead="Pick the role you want. Nomadic builds a week-by-week roadmap around it, with company interview sets and textbooks to match, and tracks how ready you are."
        />
        <div className="mt-16 grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          <Reveal scale>
            <AppWindow title="Learn — Full-Stack Engineer">
              <RoadmapMock />
            </AppWindow>
          </Reveal>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-1">
            <Reveal delay={100}><Point icon={Route} title="52-week AI roadmaps" text="A paced plan for your target role, from fundamentals to interview-ready, that adjusts to how much time you have." /></Reveal>
            <Reveal delay={200}><Point icon={Code2} title="428+ company LeetCode sets" text="Practise the questions Google, Amazon, Microsoft and hundreds of others actually ask, filtered by difficulty and topic." /></Reveal>
            <Reveal delay={300}><Point icon={BookMarked} title="CS textbook library" text="12+ hand-picked books and cheat sheets for DSA, operating systems, networks and system design." /></Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Discover() {
  return (
    <section id="discover" className="py-24 sm:py-32">
      <div className="container-page">
        <SectionIntro
          eyebrow="Find jobs"
          title={<>Fresh jobs, straight<br className="hidden sm:block" /> from the source.</>}
          lead="Nomadic reads openings directly from Greenhouse, Lever, Ashby, Internshala and company career pages. No reposts, no expired listings from aggregators, no recruiter spam."
        />
        <Reveal scale className="mx-auto mt-16 max-w-4xl">
          <AppWindow title="Job feed — 1,284 open roles match your profile">
            <JobFeedMock rows={5} />
          </AppWindow>
        </Reveal>
        <div className="mx-auto mt-16 grid max-w-5xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}><Point icon={Layers} title="Deduplicated" text="One listing per job, even when it is posted in five places." /></Reveal>
          <Reveal delay={100}><Point icon={Gauge} title="Match score" text="Every role is scored against your skills and roadmap." /></Reveal>
          <Reveal delay={200}><Point icon={Filter} title="Smart filters" text="Role, location, remote, internship or full-time, posted date." /></Reveal>
          <Reveal delay={300}><Point icon={RefreshCcw} title="Always fresh" text="The feed refreshes through the day. Max checks every 15 minutes." /></Reveal>
        </div>
      </div>
    </section>
  );
}

export function Apply() {
  return (
    <section id="apply" data-theme="dark" className="bg-night py-24 text-night-text sm:py-32">
      <div className="container-page">
        <SectionIntro
          dark
          eyebrow="Auto apply"
          eyebrowClass="text-accent-bright"
          title={<>Fill it in once.<br /><span className="gradient-text-night">Never again.</span></>}
          lead="Nomadic opens each application in a real browser on your computer and fills it from your profile: text fields, dropdowns, checkboxes, screening questions and your resume."
        />
        <div className="mt-16 grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-5 lg:order-1">
            <Reveal className="rounded-[28px] bg-night-card p-7 ring-1 ring-white/10">
              <Eye className="mb-4 h-7 w-7 text-accent-bright" strokeWidth={1.6} />
              <p className="text-[13px] font-medium text-night-muted">Pro · Semi-automatic</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-headline">You review, then send.</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-night-muted">
                Nomadic fills every form and stops before submitting. Check the answers, tweak anything, and send it
                yourself. Up to 50 a week.
              </p>
            </Reveal>
            <Reveal delay={120} className="rounded-[28px] bg-night-card p-7 ring-1 ring-white/10">
              <Zap className="mb-4 h-7 w-7 text-[#ffd60a]" strokeWidth={1.6} />
              <p className="text-[13px] font-medium text-night-muted">Max · Autonomous</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-headline">Set your criteria. Let it run.</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-night-muted">
                For supported portals, Nomadic applies to roles that match your rules in the background. Anything it
                is unsure about comes back to you.
              </p>
            </Reveal>
          </div>
          <Reveal scale className="lg:order-2">
            <AppWindow dark title="Auto apply — jobs.ashbyhq.com">
              <ApplyFormMock dark />
            </AppWindow>
          </Reveal>
        </div>
        <Reveal className="mx-auto mt-14 max-w-3xl text-center text-[13px] leading-relaxed text-night-muted">
          Works on Greenhouse, Lever, Ashby and Internshala today. When a portal needs a login, captcha or email
          code, Nomadic pauses and hands control to you.
        </Reveal>
      </div>
    </section>
  );
}

export function Track() {
  return (
    <section id="track" className="bg-mist py-24 sm:py-32">
      <div className="container-page">
        <SectionIntro
          eyebrow="Track & reach out"
          title={<>Every application.<br className="hidden sm:block" /> Every conversation.</>}
          lead="A board that updates itself as you apply, plus verified recruiter contacts so your application reaches a person, not just a portal."
        />
        <div className="mt-16 grid gap-5 lg:grid-cols-5">
          <Reveal className="card overflow-hidden bg-white lg:col-span-3">
            <div className="p-7 pb-0 sm:p-9 sm:pb-0">
              <h3 className="t-title">Application tracker</h3>
              <p className="mt-2 max-w-md text-[15px] text-muted">
                Saved, applied, interviewing, offer. Deadlines and interview times in one board.
              </p>
            </div>
            <div className="mt-6 px-4 pb-4 sm:px-6 sm:pb-6">
              <TrackerMock />
            </div>
          </Reveal>
          <Reveal delay={120} className="card overflow-hidden bg-white lg:col-span-2">
            <div className="p-7 pb-0 sm:p-9 sm:pb-0">
              <h3 className="t-title">Recruiter outreach</h3>
              <p className="mt-2 text-[15px] text-muted">
                Find hiring contacts, check the email is real before you write, and send from your own inbox.
              </p>
            </div>
            <div className="mt-4 px-2 pb-4 sm:px-4">
              <OutreachMock />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { n: '1', title: 'Pick your goal', text: 'Choose the role you are aiming for and how much time you have each week.' },
  { n: '2', title: 'Build your profile', text: 'Add your resume, skills and answers once. Nomadic reuses them everywhere.' },
  { n: '3', title: 'Learn and apply', text: 'Follow your roadmap while Nomadic finds matching jobs and fills the forms.' },
  { n: '4', title: 'Follow through', text: 'Track every stage, prepare for interviews and reach out to recruiters.' },
];

export function HowItWorks() {
  const ref = useScrollProgress<HTMLDivElement>();
  return (
    <section className="py-24 sm:py-32">
      <div className="container-page">
        <SectionIntro
          eyebrow="How it works"
          title="From goal to offer in four steps."
          lead="Set up takes about ten minutes. After that, Nomadic does the repetitive work."
        />
        <div ref={ref} className="relative mx-auto mt-16 max-w-5xl">
          {/* progress line that draws as you scroll */}
          <div aria-hidden className="absolute left-0 right-0 top-6 hidden h-px bg-line lg:block">
            <div
              className="h-full origin-left bg-accent"
              style={{ transform: 'scaleX(clamp(0, calc((var(--p, 0) - 0.25) * 2.5), 1))' }}
            />
          </div>
          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 120} className="relative">
                <span className="relative z-10 grid h-12 w-12 place-items-center rounded-full bg-ink text-lg font-semibold text-white ring-8 ring-white">
                  {s.n}
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-headline">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

const DATA_ROWS = [
  { icon: HardDrive, where: 'On your computer', what: 'Profile, resumes, answers, notes, application history, email drafts' },
  { icon: Cloud, where: 'In your account', what: 'Email, name, plan, licence and device lock, plus saved job links' },
  { icon: Cpu, where: 'Sent to AI', what: 'Profile details, resume text and the job description, only when you use an AI feature such as answering a screening question, scoring a match or writing a cover letter' },
  { icon: Ban, where: 'Never', what: 'Sold, rented or shared with advertisers or data brokers' },
];

export function Privacy() {
  return (
    <section id="privacy" data-theme="dark" className="bg-night py-24 text-night-text sm:py-32">
      <div className="container-page">
        <SectionIntro
          dark
          eyebrow="Privacy"
          eyebrowClass="text-accent-bright"
          title={<>Your career data<br className="hidden sm:block" /> stays yours.</>}
          lead="Nomadic is a desktop app, not a cloud scraper. Automation runs in a browser on your machine, and your profile lives in a local database you control."
        />
        <Reveal className="mx-auto mt-16 max-w-4xl overflow-hidden rounded-[28px] bg-night-card ring-1 ring-white/10">
          <ul className="divide-y divide-white/10">
            {DATA_ROWS.map(({ icon: Icon, where, what }) => (
              <li key={where} className="flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
                <span className="flex w-56 shrink-0 items-center gap-3 text-[17px] font-semibold">
                  <Icon className="h-5 w-5 text-accent-bright" strokeWidth={1.7} />
                  {where}
                </span>
                <span className="text-[15px] leading-relaxed text-night-muted">{what}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="mt-8 flex items-center justify-center gap-2 text-[13px] text-night-muted">
          <KeyRound className="h-4 w-4" /> One licence per device. Your portal logins never leave your computer.
        </Reveal>
      </div>
    </section>
  );
}
