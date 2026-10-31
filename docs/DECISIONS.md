# Product decisions (finalized)

| # | Decision | Choice |
|---|---|---|
| 1 | Scraping focus | India-first (Internshala, Naukri, Indian startups); global ATS second |
| 2 | Platform | Windows only at launch; macOS after beta |
| 3 | Pricing | Free / Pro ₹249 / Max ₹599, one config in `packages/config`; ₹99 alpha retired after beta |
| 4 | Hidden behind flags at launch | Outreach, Opportunity Board, Resource Vault, AI Assistant |
| 5 | Learn audience (v1) | Audience is every job seeker (see #10), but content is engineering-first today (PM and design families exist, thin). Tracks today: DSA and problem solving, web (frontend/backend/full stack), data analyst and ML, core CS (OS, DBMS, networks, OOP), placement aptitude and interviews, basic DevOps/cloud |
| 6 | Learn content | Curated, link-checked free resources first; AI-drafted lessons later, reviewed before publish |
| 7 | Coding practice | No code runner at launch (quizzes, questions, external problem links); revisit after beta |
| 8 | Landing page | Keep the existing Vite site (already redesigned and prerendered); finish pricing-from-config, Lighthouse and SEO checks |
| 9 | Analytics | Opt-in only (default, no objection recorded) |
| 10 | Primary user | Anyone job-hunting in India (30 Oct 2026): engineers, managers, product/project managers, analysts, designers; students, freshers and experienced. Supersedes "engineering students only" |
| 11 | Capacity | Solo, no fixed deadline: quality over speed, ship when the bar is met |
| 12 | AI provider | Operator-supplied API key held server-side and proxied (never shipped in the app); per-user limits enforced on the server. Provider/model to be named |
| 13 | Data | Local-first SQLite, Supabase sync of events and account data |
| 14 | Apply mode | Always review before submit; no auto-submit |
| 15 | Limits | Free: limited applies/day and 1 learning track; Pro/Max raise limits; server-enforced |
| 16 | Existing users | No alpha users: skip localStorage/legacy-table migration; delete legacy code outright |
| 17 | Ready assets | Logo and brand colors only. Still needed before release: code-signing cert, Razorpay live account, domain and support email |
| 18 | Product name | "Nomadic" is final; remove all `hirestack` / `jobmaxxer` names |
| 19 | Backend | Supabase for at least the first year; keep data access behind an adapter so a later move is possible |
| 20 | AI provider | Server-side proxy behind a provider interface supporting Google Gemini and Groq; choose per task by cost/quality benchmark |
| 21 | Offline | No offline mode: lessons and feed need a connection; drop offline caching from Step 3B.7 (keep only local DB as a cache/outbox for sync) |
| 22 | Email provider | Resend (from a Supabase Edge Function) for password reset and email verification; needs a sending domain and API key |
| 23 | AI provider | Google Gemini first, via the server-side proxy |
| 24 | Google sign-in | Fix with a server function that verifies the Google token and issues the same login ticket as password sign-in |
| 25 | Roadmap | Core feature: every new user gets a roadmap at the end of onboarding (deterministic planner; LLM only explains/adjusts) |
| 26 | Database | Fresh Supabase project `nomadic` (ap-south-1, free plan); no data carried over |
| 27 | Legal documents | Terms, Privacy Policy and Refund & Cancellation Policy written for the actual product (India, DPDP Act 2023), single source in `packages/config/src/legal.ts`, shown on the website (/terms, /privacy, /refunds) and in the app; acceptance is versioned (`LEGAL_VERSION`). Refunds: none; plans are monthly with no auto-renewal and all payments are final (payment errors such as duplicate charges are returned). Needs lawyer review and real support/grievance mailboxes before launch |
| 28 | Direct submit | Removed the last UI path to direct submission (orphaned HomeView); apply always goes through review |
