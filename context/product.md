# Product

Last updated: 31 October 2026. What Nomadic is, who it is for, plans and limits, and the product decisions every change must respect.

## What Nomadic is

A **Windows app** (Electron, `apps/desktop`), a **macOS app** (Electron, `apps/mac`, test builds) and an **Android app**
(Capacitor, `apps/android`: everything except Practice, the Projects page, apply and Outreach; job actions say "Auto
apply from desktop" and save the job for the desktop) for **anyone job-hunting in India**: engineers, managers, product
and project managers, analysts, designers, freshers and experienced hires, looking for internships, first jobs or a
move. (Engineering is the deepest content today; Learn works for any role; see "Audience" below.) The computer apps
cover the whole path:

1. **Onboarding** (4–5 short steps) ends with a **learning roadmap for the typed role** (any role; core feature).
2. **Learn (v3, 31 Oct 2026)**: a **roadmap for any role**, not only engineering. Setup is one page: the role
   (free text; suggestion chips across fields only fill the box), the level (Beginner / Some basics / Experienced)
   and an optional note. One AI call (ai-proxy `roadmap_plan`, `tree` format) splits the role into **subjects →
   modules → topics** in study order, with a YouTube search phrase and a "covers" line per topic, and **5 projects**
   for the role. Nomadic says **what** to study, not the material: every topic has its own **YouTube**, **ChatGPT**
   (a prompt about that one topic, also copied to the clipboard) and **Done**. One page: progress, a **Continue**
   card (the next topic with its buttons), subject tabs, modules that open into topic rows, **Edit roadmap** (remove
   or bring back topics and modules, add your own topic), **Change role**. The last tab, **Projects**, shows the 5
   projects with a "Ready x%" bar; one becomes a **fully assisted capstone** (AI `capstone` format: milestones →
   steps, each with a "Done when" check, YouTube, ChatGPT, **Ask Nomadic AI** (role-aware `project_help`) and Done).
   When the AI cannot answer, the 8 built-in software/data/product/design roles fall back to the reviewed library
   in the same layout (its curated projects become the projects). No quizzes, no calendar, no streak in Learn.
   Plan and prototype: `docs/plans/LEARN_V3_PLAN.md`.
   **Projects page**: emptied on 31 Oct 2026 until carefully curated projects arrive; it links to the capstone in
   Learn. (The ~4,100-project library engine still exists in `packages/learning/src/v2/gen` but no screen uses it.)
3. **Practice**: ~1,800 LeetCode-company problems (external links), role questions, timed mock mode, weak topics,
   AI rubric feedback on written answers (Pro/Max).
4. **Job board**: jobs collected by the scraper pipeline, skill-based match % and top missing skills, save, filters.
5. **Apply with review**: fills the real form in the user's own Chrome/Edge/Brave (a separate persistent Nomadic
   profile; see history.md), shows every field with its source and
   confidence, the user edits what needs them and ticks "I reviewed this" per application; only then is it
   submitted. **Nothing is ever submitted without review** (product rule, also in the Terms).
6. **Tracker**: kanban + list of applications, status history, notes, synced.
7. **Settings**: profile (no invented data), resumes, workspace, application answers, portal sign-ins, plan,
   data & privacy (export, delete account, diagnostics), updates (Stable/Beta), crash reports (opt-in), help.
8. **Admin** (role `admin` only, enforced server side): users, plans/status changes with reasons, audit log,
   scraper health, content editing with versions.

Plans: **Free / Pro ₹249 / Max ₹599 per month**, no auto-renewal, **no refunds** (payment errors excepted).
Free: one roadmap (2 AI builds a day; 10 on Pro, 20 on Max), 10 practice/day, 3 applies/day, 10 feed listings, no AI feedback, 10 AI form calls/day.
Pro: 10 applies/day, 30 AI feedback, 40 AI form calls. Max: unlimited applies, 100 feedback, 300 form calls.
Prices and limits live only in `packages/config/src/plans.ts` (SQL copies are parity-tested).

Owner: solo founder, no fixed deadline, quality over speed. Product name "Nomadic" is final (old names hirestack /
jobmaxxer were removed).

## Audience (decided 30 Oct 2026)

- Nomadic is for **everyone looking for a job in India**, not only engineering students: software and data engineers,
  managers, product and project managers, analysts, designers; freshers, students and experienced hires.
- Do not write "engineering students" in copy, prompts, docs or code comments. Say "job seekers".
- Honest gaps (do not claim more than exists): Learn content is engineering-first. `product-manager` and `design`
  role families exist but are thin; there is no project-management / general-management / business track yet. The
  scraper `classify.ts` tags non-engineering titles as `other` and `direct-dom-scraper.ts` keeps only engineering
  titles. The profile has no experience-level-aware flow beyond "years of experience". These are the follow-ups in
  [status-and-roadmap.md](status-and-roadmap.md).

## Product decisions

Summary; the full list with reasons is in [`docs/DECISIONS.md`](../docs/DECISIONS.md).

- India-first job sources; Windows first; the macOS app is in test builds (unsigned DMG); the Android app (7 Oct 2026) has no apply, Practice, Projects or Outreach.
- Hidden behind feature flags (`packages/config/src/features.ts`): Outreach, Opportunity Board, Resource Vault,
  AI Assistant. Enable with `VITE_FEATURES="outreach=on,..."` at build time.
- Learn: Nomadic gives what to study (AI-built roadmap for any role, reviewed library as fallback) and links each
  topic to a YouTube search and a ChatGPT prompt; it does not host study material or quizzes. No code runner.
- Analytics/crash reports opt-in only. No offline mode (local DB is a cache/outbox).
- AI: operator's Gemini key held server side (Supabase Vault) behind the `ai-proxy` Edge Function; never shipped
  in the app; per-user daily limits on the server. Groq is a stub behind the same provider interface.
- Data: local-first SQLite (sql.js) synced to Supabase. **No invented data anywhere** (profiles, salaries, match
  scores, AI answers: unknown stays unknown).
- Email: Resend via the `send-email-code` Edge Function. Google sign-in via the `google-sign-in` Edge Function.
- No alpha users exist: legacy data migrations are not needed; legacy code is deleted outright.
- Legal text is written for India (DPDP Act 2023) and lives in `packages/config/src/legal.ts`.
