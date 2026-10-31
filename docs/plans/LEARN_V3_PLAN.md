# Learn v3: a roadmap for any role

Status: plan (31 Oct 2026), replaces the Today/Plan/lesson-player direction of `LEARN_UX_PLAN.md`. Prototype:
the "Nomadic Learn Prototype" artifact (sample roadmap for "Quant trader").

## What the owner asked for

- No quizzes in Learn.
- The student types any role (not only engineering). AI works out what the role needs and splits it into
  **subjects → modules → topics** (quant trader → Mathematics → Probability → Basic probability).
- Nomadic says **what** to study, not the study material. Every topic has its own **Learn on YouTube**,
  **Learn with ChatGPT** and **Done**. Today one button covers 6–8 points at once, which gives poor results.
- A UX that is not confusing.

## The experience

1. **Setup, two pages.** "Which role do you want to prepare for?" (free text, suggestions) → "Where are you starting
   from?" (Beginner / Some basics / Experienced) + an optional note ("I know Python; more on options") → Build.
   Onboarding's roadmap step uses the same two pages.
2. **Building** (up to a minute): one AI call returns the whole tree.
3. **One Learn page**, no tabs:
   - Role name, counts (subjects, modules, topics), one progress bar ("12 of 86 topics · 14%").
   - **Continue** card: the next not-done topic with YouTube, ChatGPT and Mark done.
   - **Subject tabs** (Mathematics · Programming · Finance and markets · Interview prep), each with its progress.
   - **Modules** as an expandable list (the first unfinished one open), each with a one-line summary and "3/6".
   - **Topic rows**: Done box · title · "covers: …" line · YouTube · ChatGPT.
   - **Edit roadmap**: remove a topic or module, add your own topic (it gets its own buttons too).
     **Change role**: back to setup.
4. **Home**: the Learn card shows the role, progress and the Continue topic with its buttons.

Gone from Learn: quizzes and reviews, the day-by-day calendar (Today, sessions, auto-roll, streak, pace),
the lesson player, the Plan tab. Projects and Practice stay as their own pages.

## Per-topic buttons (the main fix)

- **YouTube**: the AI writes a short search phrase per topic ("conditional probability Bayes theorem explained");
  the link is `youtube.com/results?search_query=<phrase>`.
- **ChatGPT**: a prompt about that one topic: the role, the level, the topic, its module and subject, what it covers,
  then "explain from the basics with an example, show how it is used in <role>, give 3 practice questions". Opened
  with `chatgpt.com/?q=` and also copied to the clipboard (the app can drop the text).

## Data

New roadmap shape (version 3), stored in the existing `roadmap` document (no migration; sync already accepts it):

```
RoleRoadmap { id, version: 3, role (≤80), level, note, source: 'ai' | 'catalog', summary, created_at,
  subjects: [{ id, title, why, modules: [{ id, title, summary, custom?: true,
    topics: [{ id, title, covers (≤160), search (≤80), custom?: true }] }] }] }
```

- Ids are slugs of the titles (`probability/basic-probability`), so a rebuilt roadmap keeps progress on topics with
  the same names.
- Limits: 2–6 subjects, ≤ 8 modules a subject, ≤ 10 topics a module, ≤ 200 topics.
- **Done** = the existing `task_done` event with `item_id: topic:<module>/<topic>` (untick = `payload.undone`), so
  progress syncs through the existing event log. Removed topics are kept in the roadmap as `removed: true`.

## AI

- ai-proxy `roadmap_plan` gets a second payload shape `{ format: 'tree', role, level, note }`, so the existing daily
  roadmap quota applies (free 2, Pro 10, Max 20) and no quota migration is needed.
- Prompt: what someone needs to be hired as <role> in India (entry level unless stated), split into subjects →
  modules → topics in study order, one search phrase and one "covers" line per topic, no links, no invented
  facts about companies or salaries. Structured JSON schema; thinking off; 60 s limit for this request.
- Main process: new IPC `learn-role-roadmap-generate` (role, level, note → validated, normalised tree, saved as a
  draft) and `learn-role-roadmap-save` (the edited tree). Added to the IPC contract, preload, types, the channel-count
  test and the Android host.
- Fallback when the AI cannot answer (offline, preview, quota): the 8 built-in roles are turned into the same tree
  from the reviewed catalogue (DSA/Core CS/Dev/… become subjects, modules stay, topics stay, learn points become
  "covers"). Any other role shows the reason and a retry.

## Old roadmaps

A student with a v2 roadmap sees "Learn has a new layout. Rebuild your <role> roadmap" (one click, same role and
level). Old progress events stay in the log; v2 code that Projects still uses stays.

## Build order

1. `packages/learning`: `RoleRoadmapSchema`, slugs, `normaliseRoleRoadmap`, `catalogRoleRoadmap` (fallback),
   progress (`roleProgress`, `nextTopic`), per-topic YouTube/ChatGPT builders. Tests.
2. ai-proxy: tree prompt, schema, output check, timeout; tests (`ai-proxy.test.ts`).
3. app-core: the two IPC channels, `learn-role.ts` service, read/write of the v3 document; tests.
4. app-ui: setup (2 pages), building state, the Learn page, edit mode, Home card, onboarding step; remove quizzes
   and the session/lesson screens from Learn; tests.
5. Typecheck, lint, tests, three builds, browser check at desktop and phone width; docs.
6. Deploy the ai-proxy change (Edge Function) so AI roadmaps work in the released apps.

## Decisions for the owner

1. Drop the day-by-day calendar (recommended: yes; the topic list and Continue card replace it).
2. Deploy the ai-proxy change myself through the Supabase connector after the build (recommended: yes).
3. Free plan: keep "1 learning track" (one roadmap at a time) and 2 AI builds a day (recommended: yes).
