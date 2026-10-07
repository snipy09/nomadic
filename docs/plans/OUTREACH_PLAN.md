# Outreach plan

Status (5 October 2026, desktop v1.1.0): built behind the `outreach` feature flag. The sidebar shows **Outreach** with a "Soon"
badge and an information screen. The working module appears only in builds made with `VITE_FEATURES="outreach=on"`.
The launch checklist at the end lists what must happen before the flag is turned on for everyone.

## 1. Goal

Help a student reach **people who can get them an interview**. An application through a portal is one way in. A
referral, or a short note to the person hiring, is often a better one. Outreach finds those people from public
hiring posts, helps the student write a short honest message, and keeps track of who was contacted and when to
follow up. The student sends every message from their own account, and only after they have reviewed it.

## 2. Who can refer you

The target is anyone at the company who can move an application forward, not only HR:

| Kind | Who | Why they help | Default ask |
| --- | --- | --- | --- |
| `recruiter` | Recruiters, talent acquisition, HR, people team | They own the pipeline and can put a resume in front of the hiring team | Consider me for this role |
| `hiring_manager` | Engineering managers, team leads, heads of a function, directors | They decide who is interviewed for their team | A short note on fit for their team |
| `employee` | Engineers and other employees, including the people who post "we're hiring" | Most companies run employee referral programmes; a referral usually gets a resume read | Ask for a referral, give them what they need to submit it |
| `founder` | Founders, CEOs, CTOs at startups | At small companies they hire directly | A short note on why this company |
| `alumni` | People from the student's own college who work there | A shared college is the easiest reason to reply | Ask for advice first, a referral if it goes well |
| `team_inbox` | Role addresses such as careers@ or jobs@ | Monitored by the hiring team | Application with resume |

`unknown` is kept when a public post gives an address but does not say who it belongs to. The app never guesses a
kind it cannot see; the student can change it.

Each kind has its own message template (`packages/app-ui/src/features/outreach/outreachLogic.ts`). A
referral request to an employee asks for less of their time than a pitch to a hiring manager, and a note to an
alumnus starts with the college.

## 3. Where contacts come from

Only addresses that a person or company **published themselves for hiring** are collected:

1. **Hacker News "Who is hiring?"** threads (`hn_whos_hiring`). Posters must work at the company. Each comment
   names the company, roles, location and often a contact address. Read through the public Algolia HN API. Only
   posts open to candidates in India (an Indian city, or remote worldwide/APAC) are kept by default.
2. **Job descriptions** already in the `jobs` table (`job_description`). Many listings say "send your resume to
   …". The address, the job link and the sentence around it are kept.
3. **Company career pages** linked from jobs on non-ATS hosts (`company_page`). Fetched slowly (one request per
   second per host), only where robots.txt allows, and only addresses on the company's own domain.

Every contact keeps its **source URL and the sentence it came from**, shown to the student, so they can see why the
address is there.

Never done, by design:

- No LinkedIn scraping, no scraping of any site whose terms forbid it, no logged-in scraping.
- No guessed addresses (`firstname.lastname@company.com` patterns) and no "email finder" APIs.
- No addresses from GitHub profiles, commit metadata or personal websites that were not posted for hiring.
- No SMTP "ping" checks (they look like spam to mail servers). An address is checked for syntax, its domain for a
  mail server (MX record), and that is reported honestly: a working mail server does not prove the mailbox exists.

For LinkedIn and alumni, the app opens a LinkedIn people search (company + the student's college) in the student's
own browser. The student finds people themselves and adds them by hand. Nothing is read from LinkedIn.

## 4. Data

Server (Supabase, migration 027):

- `outreach_contacts`: the shared directory written by the scraper (service role only). Email (unique), name only
  when stated next to the address, company and domain, role title, roles they are hiring for, kind, address type
  (`personal` or `role`), source, source URL and snippet, job URL, location, remote, posted date, MX result,
  first/last seen, active, hidden, report count. Rows not seen for 90 days are marked inactive.
- `outreach_contact_reports`: one report per user per contact (bounced, wrong person, not hiring, asked to stop,
  other). "Asked to stop" hides the contact at once and adds a suppression; three reports from different users
  hide it.
- `outreach_suppressions`: SHA-256 hashes of addresses that asked to be removed. The scraper never writes a
  suppressed address again.
- RPCs: `outreach_list_contacts` (session-checked, 50 rows per page, 500 rows per day per user, search by company,
  text and kind) and `outreach_report_contact`. `outreach_suppress` is service-role only (used for removal
  requests sent to grievance@).

Local (desktop SQLite, local migration 9; never uploaded):

- `outreach_people`: people the student saved from the directory or added by hand (email and/or LinkedIn URL,
  name, company, role, kind, source, notes).
- `outreach_messages`: drafts and sent messages with channel, purpose, subject, body, status
  (draft → ready → sent → replied / no reply / bounced), the hash of the reviewed text, how it was sent, the
  follow-up date and a link to the parent message for follow-ups.

Third-party personal data stays on the student's computer. Only the tracker entry ("Referral request", company,
role) syncs to the account, like any other application.

## 5. Channels

- **Email through the student's own SMTP account** (e.g. a Gmail app password). The password is stored in the OS
  keychain and never uploaded. At most 20 messages a day and one a minute; one at a time.
- **Open in Gmail** or **open in the mail app** (mailto): Nomadic fills the compose window; the student presses
  Send and marks it as sent.
- **LinkedIn**: the note (300 characters at most) is copied to the clipboard and the profile opens in the browser;
  the student sends it and marks it as sent.

There is no automated browser sending, no bulk sending and no sequences that send by themselves.

## 6. Review rule

A message can be sent only when its status is `ready`, which the student sets by ticking **"I reviewed this"**. The
hash of recipient, subject and body is stored at that moment. Any edit after that puts the message back to draft.
The send step checks the hash again in the main process. Placeholders such as `[Name]` block the tick.

## 7. AI drafts

`ai-proxy` kind `outreach_email`: the candidate's own profile facts, the recipient's kind, name, role and company,
the job title, the channel and the purpose. The model writes a subject and body using only those facts, returns
null when they are not enough, and placeholders are rejected. Drafts are never sent or saved without the student.
Daily limits per plan: Free 3, Pro 25, Max 100 (`aiOutreachDraftsPerDay` in `packages/config/src/plans.ts`,
`ai_outreach_limits` in SQL, parity-tested). Templates work without AI on every plan.

## 8. Follow-ups and tracker

When a message is marked sent, a tracker entry is created (mode `outreach`, shown as "Referral request") and a
follow-up is due after 7 days. One follow-up per message; after that the thread is left alone. Replies are marked
by the student (Nomadic does not read their inbox).

## 9. Scraper operation

```
npm run scrape:contacts                       # dry run, all sources, prints what it found
npm run scrape:contacts -- --publish          # writes to Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
npm run scrape:contacts -- --sources hn --months 2 --summary-dir reports
```

Options: `--sources hn,jobs,pages`, `--months N` (HN threads, default 2), `--region india|all`, `--max-pages N`
(career pages, default 40), `--summary-dir DIR`, `--json FILE`. A run prints per-source counts (fetched, found,
kept, outside region, invalid, suppressed, no mail server) and expires contacts not seen for 90 days.

## 10. Legal and privacy (India, DPDP Act 2023)

- Contacts are personal data that the person made public for hiring (s.3(c)(ii) excludes personal data made
  publicly available by the person). Nomadic still keeps the source of every address, honours removal requests
  and never sells or exports the directory.
- Messages are sent by the student from their own account; the student is responsible for what they send. The
  Terms need an acceptable-use clause for Outreach (no spam, no harassment, no bulk sending, honest messages).
- Removal: anyone can ask grievance@ to be removed; the operator runs `outreach_suppress`, which deletes the row
  and blocks the address for good.

## 11. Launch checklist (before `outreach=on` for everyone)

1. Lawyer review of the Outreach acceptable-use clause; add it to `packages/config/src/legal.ts`.
2. Real grievance@ mailbox (also needed for the app in general).
3. Run `npm run scrape:contacts -- --publish` and review a sample of contacts by hand.
4. Owner paste: `DROP TABLE public.hr_contacts;` (legacy, empty).
5. Test on a real account: save a person, draft with a template and with AI, tick review, open in Gmail, mark
   sent, see the tracker entry and the follow-up, report a contact.
6. Decide whether Outreach is on every plan or Pro and Max only (today: every plan, AI drafts limited per plan).
