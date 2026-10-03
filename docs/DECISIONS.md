# Product decisions (finalized)

| # | Decision | Choice |
|---|---|---|
| 1 | Scraping focus | India-first (Internshala, Naukri, Indian startups); global ATS second |
| 2 | Platform | Windows only at launch; macOS after beta |
| 3 | Pricing | Free / Pro ₹249 / Max ₹599, one config in `packages/config`; ₹99 alpha retired after beta |
| 4 | Hidden behind flags at launch | Outreach, Opportunity Board, Resource Vault, AI Assistant |
| 5 | Learn audience (v1) | Engineering students; tracks: DSA and problem solving, web (frontend/backend/full stack), data analyst and ML, core CS (OS, DBMS, networks, OOP), placement aptitude and interviews, basic DevOps/cloud |
| 6 | Learn content | Curated, link-checked free resources first; AI-drafted lessons later, reviewed before publish |
| 7 | Coding practice | No code runner at launch (quizzes, questions, external problem links); revisit after beta |
| 8 | Landing page | Keep the existing Vite site (already redesigned and prerendered); finish pricing-from-config, Lighthouse and SEO checks |
| 9 | Analytics | Opt-in only (default, no objection recorded) |
| 10 | Primary user | Indian engineering students (placements and internships) |
| 11 | Capacity | Solo, no fixed deadline: quality over speed, ship when the bar is met |
| 12 | AI provider | Operator-supplied API key held server-side and proxied (never shipped in the app); per-user limits enforced on the server. Provider/model to be named |
| 13 | Data | Local-first SQLite, Supabase sync of events and account data |
| 14 | Apply mode | Always review before submit; no auto-submit |
| 15 | Limits | Free: limited applies/day and 1 learning track; Pro/Max raise limits; server-enforced |
| 16 | Existing users | No alpha users: skip localStorage/legacy-table migration; delete legacy code outright |
| 17 | Ready assets | Logo and brand colors only. Still needed before release: code-signing cert, Razorpay live account, domain and support email |
