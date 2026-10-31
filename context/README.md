# Nomadic project context

Everything a person or an AI assistant needs to work on this repo, kept current. Start here.
Last updated: 31 October 2026.

## Read in this order

1. [working-with-owner.md](working-with-owner.md): how the owner wants work done (short instructions, finish end to
   end, concise reports, what never to do).
2. [product.md](product.md): what Nomadic is, plans and limits, product decisions.
3. [architecture.md](architecture.md): repo layout, **where each kind of change goes**, key flows.
4. [conventions.md](conventions.md): code rules, IPC/migration checklists, what to run before pushing.
5. [status-and-roadmap.md](status-and-roadmap.md): what is built, test status, owner actions, code follow-ups.
6. The app you are changing: [apps/desktop/CONTEXT.md](../apps/desktop/CONTEXT.md) (Windows),
   [apps/mac/CONTEXT.md](../apps/mac/CONTEXT.md), [apps/android/CONTEXT.md](../apps/android/CONTEXT.md).

Reference when needed:

- [infrastructure.md](infrastructure.md): Supabase project, migrations applied, Edge Functions, secrets, accounts.
- [security.md](security.md): RLS, RPC allow-list, sessions, secrets.
- [build-test-deploy.md](build-test-deploy.md): commands, CI workflows, packaging, web deploy, smoke tests.
- [scrapers.md](scrapers.md): what fills the database and the Desktop scraper folder.
- [history.md](history.md): what was built when, with file names (useful when touching an older area).
- Deeper documents stay in [`docs/`](../docs/README.md): decisions, feature list, guides, plans, security cleanup.

## Nomadic in five lines

- A career app for students in India: a learning roadmap for any role (subjects → modules → topics, each with YouTube
  and ChatGPT, ending in 5 projects and a guided capstone), practice, job board with match %, apply with
  review (nothing is submitted without the user ticking it), tracker, outreach (behind a flag), admin.
- Three apps on shared code: Windows (`apps/desktop`), macOS (`apps/mac`, test builds), Android (`apps/android`, no
  apply/practice/projects/outreach) + the website (`apps/web`).
- Shared code: `packages/app-ui` (screens), `packages/app-core` (Electron main process + IPC contract), `packages/ui`
  (design system), `packages/config` (prices, flags, legal), plus learning, form engine, automation, scrapers, supabase.
- Backend: Supabase project `nomadic` (Mumbai); every client call is a session-checked RPC; AI only through the
  `ai-proxy` Edge Function; data published by the laptop scrapers.
- Plans: Free / Pro ₹249 / Max ₹599 a month (`packages/config/src/plans.ts`). No invented data anywhere.

## Keeping this folder current

When something important changes, update the file it belongs to (and `history.md` for a finished piece of work), and
the "Last updated" line. `CLAUDE.md` at the repo root only points here; keep facts in this folder, not there.
