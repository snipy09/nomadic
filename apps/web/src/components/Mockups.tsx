import React from 'react';
import {
  Search, BookOpen, Columns3, Mail, Check, Sparkles, MapPin, Clock, Upload, ShieldCheck, Lock, Circle,
} from 'lucide-react';
import { useReveal } from '../lib/motion';

// Sample data for illustration only. Real jobs come from the live feed in the app.
export const SAMPLE_JOBS = [
  { company: 'Linear', role: 'Full-Stack Engineer', location: 'Remote · Global', source: 'Ashby', age: '2h', match: 96, color: '#5e6ad2' },
  { company: 'Stripe', role: 'Backend Engineer, Payments', location: 'Bengaluru · Hybrid', source: 'Greenhouse', age: '5h', match: 93, color: '#635bff' },
  { company: 'Vercel', role: 'Frontend Engineer', location: 'Remote · APAC', source: 'Lever', age: '1d', match: 91, color: '#000000' },
  { company: 'Razorpay', role: 'SDE Intern', location: 'Bengaluru', source: 'Internshala', age: '1d', match: 88, color: '#0c63e4' },
  { company: 'Supabase', role: 'Database Engineer', location: 'Remote · Global', source: 'Ashby', age: '2d', match: 86, color: '#3ecf8e' },
];

function CompanyMark({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[13px] font-semibold text-white"
      style={{ background: color }}
      aria-hidden
    >
      {name[0]}
    </span>
  );
}

function MatchRing({ value }: { value: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-9 w-9 place-items-center" aria-label={`${value}% match`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={r} fill="none" stroke="#0071e3" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <span className="text-[10px] font-semibold">{value}</span>
    </span>
  );
}

export function JobFeedMock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-mist px-3 py-2 text-[12px] text-faint">
        <Search className="h-3.5 w-3.5" />
        <span>Frontend, Full-stack · Remote or Bengaluru · posted this week</span>
      </div>
      <ul className="space-y-2">
        {SAMPLE_JOBS.slice(0, rows).map((j, i) => (
          <li
            key={j.company}
            className="reveal flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white p-3 transition-shadow hover:shadow-md"
            style={{ ['--d' as string]: `${i * 90}ms` }}
          >
            <CompanyMark name={j.company} color={j.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{j.role}</p>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-faint">
                <span className="font-medium text-muted">{j.company}</span>
                <span>·</span>
                <MapPin className="h-3 w-3" />
                {j.location}
              </p>
            </div>
            <span className="hidden rounded-full bg-mist px-2 py-0.5 text-[10px] font-medium text-muted sm:inline">
              {j.source}
            </span>
            <span className="hidden text-[10px] text-faint sm:inline">{j.age}</span>
            <MatchRing value={j.match} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROADMAP = [
  { title: 'HTML, CSS & accessibility', week: 'Weeks 1–4', pct: 100 },
  { title: 'TypeScript & React', week: 'Weeks 5–12', pct: 72 },
  { title: 'Node.js & REST APIs', week: 'Weeks 13–20', pct: 18 },
  { title: 'PostgreSQL & data modelling', week: 'Weeks 21–28', pct: 0 },
  { title: 'System design & interviews', week: 'Weeks 29–52', pct: 0 },
];

export function RoadmapMock() {
  const ref = useReveal<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] text-faint">Target role</p>
          <p className="text-[15px] font-semibold">Full-Stack Engineer</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-faint">Readiness</p>
          <p className="text-[15px] font-semibold text-accent">38%</p>
        </div>
      </div>
      <ol className="space-y-2.5">
        {ROADMAP.map((m, i) => (
          <li key={m.title} className="rounded-xl border border-black/[0.06] p-3">
            <div className="mb-2 flex items-center gap-2.5">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                  m.pct === 100 ? 'bg-accent text-white' : m.pct > 0 ? 'border-2 border-accent' : 'border border-line text-faint'
                }`}
              >
                {m.pct === 100 ? <Check className="h-3 w-3" /> : m.pct === 0 ? <Lock className="h-2.5 w-2.5" /> : null}
              </span>
              <span className={`flex-1 text-[13px] font-medium ${m.pct === 0 ? 'text-faint' : ''}`}>{m.title}</span>
              <span className="text-[10px] text-faint">{m.week}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-mist">
              <div
                className="bar-fill h-full rounded-full bg-gradient-to-r from-accent to-[#7b5cff]"
                style={{ ['--w' as string]: `${m.pct}%`, ['--d' as string]: `${200 + i * 120}ms` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const FIELDS = [
  { label: 'Full name', value: 'Aarav Sharma' },
  { label: 'Email', value: 'aarav.sharma@gmail.com' },
  { label: 'LinkedIn', value: 'linkedin.com/in/aarav-sharma' },
  { label: 'Years of experience', value: '2–3 years' },
  { label: 'Work authorisation', value: 'Yes, authorised to work in India' },
];

export function ApplyFormMock({ dark }: { dark?: boolean }) {
  const ref = useReveal<HTMLDivElement>(0.35);
  let delay = 300;
  return (
    <div ref={ref} className="p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className={`text-[11px] ${dark ? 'text-night-muted' : 'text-faint'}`}>jobs.ashbyhq.com · Linear</p>
          <p className="text-[15px] font-semibold">Apply for Full-Stack Engineer</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent-bright">
          <Sparkles className="h-3 w-3" /> Filling
        </span>
      </div>
      <div className="space-y-3">
        {FIELDS.map((f) => {
          const d = delay;
          delay += f.value.length * 28 + 200;
          return (
            <div key={f.label}>
              <p className={`mb-1 text-[11px] ${dark ? 'text-night-muted' : 'text-faint'}`}>{f.label}</p>
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[13px] ${
                  dark ? 'border-white/10 bg-white/[0.04]' : 'border-black/10 bg-white'
                }`}
              >
                <span
                  className="typing"
                  style={{ ['--ch' as string]: f.value.length, ['--dur' as string]: `${f.value.length * 28}ms`, ['--d' as string]: `${d}ms` }}
                >
                  {f.value}
                </span>
                <Check
                  className="pop h-3.5 w-3.5 shrink-0 text-[#30d158]"
                  style={{ ['--d' as string]: `${d + f.value.length * 28}ms` }}
                />
              </div>
            </div>
          );
        })}
        <div
          className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[12px] ${
            dark ? 'border-white/15 text-night-muted' : 'border-black/15 text-faint'
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="flex-1">Resume_Aarav_Sharma.pdf</span>
          <Check className="pop h-3.5 w-3.5 text-[#30d158]" style={{ ['--d' as string]: `${delay}ms` }} />
        </div>
      </div>
      <div className="pop mt-5 flex items-center justify-between rounded-xl bg-accent px-4 py-3 text-white" style={{ ['--d' as string]: `${delay + 300}ms` }}>
        <span className="text-[13px] font-medium">Ready for your review</span>
        <span className="text-[11px] opacity-80">14 fields · 6.2s</span>
      </div>
    </div>
  );
}

const STAGES = [
  { name: 'Saved', items: [['Figma', 'Product Engineer'], ['Notion', 'Full-Stack Dev']] },
  { name: 'Applied', items: [['Linear', 'Full-Stack Engineer'], ['Supabase', 'Database Eng.']] },
  { name: 'Interview', items: [['Stripe', 'System design · Thu 2 PM']] },
  { name: 'Offer', items: [['Razorpay', 'Offer under review']] },
];

export function TrackerMock() {
  return (
    <div className="no-scrollbar overflow-x-auto p-4 sm:p-5">
      <div className="grid min-w-[480px] grid-cols-4 gap-2.5">
        {STAGES.map((s, si) => (
          <div key={s.name} className="rounded-xl bg-mist p-2.5">
            <p className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold">
              {s.name}
              <span className="font-normal text-faint">{s.items.length}</span>
            </p>
            <div className="space-y-2">
              {s.items.map(([c, r], i) => (
                <div
                  key={c}
                  className="reveal rounded-lg bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  style={{ ['--d' as string]: `${si * 120 + i * 80}ms` }}
                >
                  <p className="text-[12px] font-semibold">{c}</p>
                  <p className="text-[10px] text-faint">{r}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CONTACTS = [
  { initials: 'PR', name: 'Priya R.', role: 'Technical Recruiter', company: 'Stripe', status: 'Deliverable' },
  { initials: 'JM', name: 'James M.', role: 'Engineering Talent Partner', company: 'Linear', status: 'Deliverable' },
  { initials: 'AK', name: 'Ananya K.', role: 'Head of Talent', company: 'Razorpay', status: 'Deliverable' },
];

export function OutreachMock() {
  return (
    <div className="space-y-2 p-4 sm:p-5">
      {CONTACTS.map((c, i) => (
        <div
          key={c.name}
          className="reveal flex items-center gap-3 rounded-xl border border-black/[0.06] p-3"
          style={{ ['--d' as string]: `${i * 100}ms` }}
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#e8f2fd] to-[#efe9ff] text-[11px] font-semibold text-accent">
            {c.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{c.name}</p>
            <p className="truncate text-[11px] text-faint">
              {c.role} · {c.company}
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-[#e9f9ee] px-2 py-0.5 text-[10px] font-medium text-[#1a7f37]">
            <ShieldCheck className="h-3 w-3" /> {c.status}
          </span>
        </div>
      ))}
    </div>
  );
}

const SIDEBAR = [
  { icon: Search, label: 'Job feed', meta: '1,284' },
  { icon: BookOpen, label: 'Learn', meta: '72%' },
  { icon: Columns3, label: 'Tracker', meta: '14' },
  { icon: Mail, label: 'Outreach', meta: '25' },
];

/** The full app window shown in the hero. */
export function HeroAppMock() {
  return (
    <div className="grid min-h-[340px] grid-cols-1 sm:min-h-[420px] md:grid-cols-[200px_1fr]">
      <aside className="hidden border-r border-black/[0.06] bg-[#fbfbfd] p-3 md:block">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">Workspace</p>
        <ul className="space-y-0.5">
          {SIDEBAR.map(({ icon: Icon, label, meta }, i) => (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] ${
                i === 0 ? 'bg-black/[0.05] font-medium' : 'text-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="flex-1">{label}</span>
              <span className="text-[10px] text-faint">{meta}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl border border-black/[0.06] bg-white p-3">
          <p className="text-[11px] font-semibold">Today</p>
          <div className="mt-2 space-y-1.5 text-[10px] text-muted">
            <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-[#30d158]" /> 12 applications sent</p>
            <p className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-accent" /> 3 waiting for review</p>
            <p className="flex items-center gap-1.5"><Circle className="h-3 w-3 text-faint" /> React hooks quiz</p>
          </div>
        </div>
      </aside>
      <div>
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3">
          <p className="text-[14px] font-semibold">Live job feed</p>
          <span className="flex items-center gap-1.5 text-[11px] text-faint">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-[#30d158]" />
              <span className="relative h-2 w-2 rounded-full bg-[#30d158]" />
            </span>
            Updated just now
          </span>
        </div>
        <JobFeedMock rows={4} />
      </div>
    </div>
  );
}
