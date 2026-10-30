# Product

Last updated: 30 October 2026. What Nomadic is, who it is for, plans and limits, and the product decisions every change must respect.

## What Nomadic is

A **Windows app** (Electron, `apps/desktop`), a **macOS app** (Electron, `apps/mac`, test builds) and an **Android app**
(Capacitor, `apps/android`: everything except Practice, Projects, apply and Outreach; job actions say "Auto apply from
desktop" and save the job for the desktop) for **Indian engineering students** looking for placements, internships and
first jobs. The computer apps cover the whole path:

1. **Onboarding** (4–5 short steps) ends with a **personal learning roadmap** (core feature).
2. **Learn (v2)**: an intake of six questions, one per page (role, goal, duration, schedule, level, DSA language;
   what to cover and extras are optional rows on the summary) → a roadmap of modules → day-sized topics → tasks,
   picked by AI from the reviewed catalogue (rules planner as fallback) and fitted into dated days by a deterministic
   scheduler (language basics before any DSA problem; reserve, revision and OA-mock days; pace factor). Two tabs:
   **Today** (the next study session in a fixed order: warm-up review → main lesson → its practice → side topic →
   project / tests, with one "Next up" button) and **Plan** (this week's sessions, the roadmap week by week,
   progress, plan settings). Lessons open in a focus-mode **lesson player**: intro with the names of the points,
   the points 2–3 per screen (YouTube / ChatGPT for the points on screen), a recap, the check (quiz), today's
   practice ("Solved" / "Solved with a hint" is the only way a problem is ticked), then the next step. Missed work
   moves forward by itself (with Undo); the student is asked only when work no longer fits the end date. The streak
   counts only planned study days. No external resources are shown in Learn beyond LeetCode and the search links.
   UX plan and research: `docs/plans/LEARN_UX_PLAN.md`.
   **Projects** (sidebar, under Practice): a library of ~4,100 fully guided projects (12 curated + 4,085 generated
   idea × stack × level: 80 app ideas on 5 frontend, 6 backend, 5 full-stack, 3 mobile, 3 CLI and 3 DevOps stacks;
   40 datasets on 3 data and 2 ML stacks), each with stages, steps with starter code, hints, acceptance checks, an
   optional GitHub repo check, a finish kit and "Stuck? Ask Nomadic AI" help per stage (ai-proxy `project_help`;
   when the daily limit is hit the question waits and is asked again automatically after the midnight IST reset).
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
Free: 1 learning track, 10 practice/day, 3 applies/day, 10 feed listings, no AI feedback, 10 AI form calls/day.
Pro: 10 applies/day, 30 AI feedback, 40 AI form calls. Max: unlimited applies, 100 feedback, 300 form calls.
Prices and limits live only in `packages/config/src/plans.ts` (SQL copies are parity-tested).

Owner: solo founder, no fixed deadline, quality over speed. Product name "Nomadic" is final (old names hirestack /
jobmaxxer were removed).

## Product decisions

Summary; the full list with reasons is in [`docs/DECISIONS.md`](../docs/DECISIONS.md).

- India-first job sources; Windows first; the macOS app is in test builds (unsigned DMG); the Android app (7 Oct 2026) has no apply, Practice, Projects or Outreach.
- Hidden behind feature flags (`packages/config/src/features.ts`): Outreach, Opportunity Board, Resource Vault,
  AI Assistant. Enable with `VITE_FEATURES="outreach=on,..."` at build time.
- Learn: curated, link-checked free resources; AI-drafted lessons only after review. No code runner at launch.
- Analytics/crash reports opt-in only. No offline mode (local DB is a cache/outbox).
- AI: operator's Gemini key held server side (Supabase Vault) behind the `ai-proxy` Edge Function; never shipped
  in the app; per-user daily limits on the server. Groq is a stub behind the same provider interface.
- Data: local-first SQLite (sql.js) synced to Supabase. **No invented data anywhere** (profiles, salaries, match
  scores, AI answers: unknown stays unknown).
- Email: Resend via the `send-email-code` Edge Function. Google sign-in via the `google-sign-in` Edge Function.
- No alpha users exist: legacy data migrations are not needed; legacy code is deleted outright.
- Legal text is written for India (DPDP Act 2023) and lives in `packages/config/src/legal.ts`.
