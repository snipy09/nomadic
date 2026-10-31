> **Superseded on 31 Oct 2026 by [`LEARN_V3_PLAN.md`](LEARN_V3_PLAN.md).** The phase 1 screens below (Today, Plan,
> lesson player, quizzes) were built on 30 Oct 2026 and removed the next day. Kept for the research and the measurements.

# Learn UX plan: less to think about, more learning

Status: phase 1 built on 30 Oct 2026 (structure, screens, way of learning; see "Built" at the end). Phase 2 (the
content, which modules to include, sample data for AI roadmaps) is next and owner-led. Revision 2 of the plan: Covers the whole Learn system: engine, AI roadmap generation,
content, timeline, screens, other features that depend on Learn, sync, tests. Rule for the build: **keep every stored
format, IPC channel and the ai-proxy contract unchanged**, so no migration, no Edge Function redeploy and no owner
action is needed to ship it.

## 0. How Learn works today (the system)

```
Intake (9 pages)                         packages/app-ui/src/features/learn/IntakeWizard.tsx, intakeSteps.ts
   │  also used by onboarding:           features/onboarding/Onboarding.tsx, MobileOnboarding.tsx
   ▼
learn-roadmap-generate (IPC)             packages/app-core/src/main/services/learn-v2.ts generateRoadmap()
   ├─ buildAiCatalog(): modules for the student's streams + language + role, hours per emphasis, topic ids
   ├─ ai-proxy kind roadmap_plan         packages/supabase/functions/ai-proxy/core.ts buildRoadmapPlanPrompt()
   │     AI returns: module order, emphasis per module, stream %, skip_topics, ≤3 custom modules, 1–2 projects,
   │     a summary and one "why" per module. It never writes content or dates.
   ├─ normaliseAiRoadmap() (ids checked, orderModules() = prerequisites first); unusable → planRoadmapRules()
   ├─ withBoosts(): company problems (paid plans)
   └─ fitRoadmap() → packTasks()         packages/learning/src/v2/scheduler.ts
         one queue per stream, ≤2 streams a day by share deficit, splits long lessons into parts, revision /
         buffer / OA-mock days, fits to 97 % of the time (drops optional → lowers emphasis → "left out")
   ▼
Draft (local learn_state) → Review screen → learn-roadmap-accept → roadmap + schedule docs (sync 027/028)
   ▼
Every day: renderer derives everything from roadmap + schedule + append-only events
   progressOf / buildTodayModel / buildPath / progressModel (features/learn/learnModel.ts, learning/src/v2/path.ts)
   Actions write events (task_done, quiz_passed, problem_attempted, item_answered …) or a new schedule
   (replan, skipToday, doMore, moveEntry → learn-schedule-save). Adjust = ai-proxy roadmap_adjust → diff → replan.
```

Content: bundled in the app (`packages/learning/seed/bundle.json`), so content changes ship with an app release.
54 modules (DSA 21, dev 23, core CS 5, aptitude 3, interview 2) → 420 topics. Per topic: summary (median 344 chars),
6–8 `learn_items` (median 98 chars; 99 % are "Name: details"), 3 `key_points`, problems (must/good/stretch),
quiz items (359 topics have ≥ 2, almost all multiple choice), hands-on tasks (practice 277, build 174). All 420
topics are AI-drafted drafts (owner action "Learn v2 content checks" is still open). Admin only edits v1 lessons.

Other features that read Learn:

| Feature | What it uses | Effect of this plan |
|---|---|---|
| Home (`features/home/HomeView.tsx`, `useLearnSummary.ts`) | buildPath, buildTodayModel; button opens Learn with intent `today` / `path` | Intents become `today` / `plan`; button goes to the next step |
| Job match (`features/feed/match.ts`, `useLearnedMastery.ts`) | progress → mastery | none (same events) |
| Projects (`features/projects/*`) | catalog, `TopicScreen` for linked topics, ProjectBuild | ProjectsView must switch to the new topic view |
| Onboarding (desktop + mobile) | IntakePage, INTAKE_STEPS, draft helpers | same pages as the new intake |
| Practice | v1 learning engine | none |
| App shell (`App.tsx`) | LearnView `initialTab` from `tabIntent` | accept old values `path` / `progress` → `plan` |
| Android | same screens, `IS_MOBILE` branches, bottom nav Learn | sheets open from the bottom; projects stay desktop-only |
| Tests | `learnView.test.tsx`, `learnModel.test.ts`, `learnLinks.test.ts`, `learnLibrary.test.ts`, `heatmapLogic.test.ts`, app-core `learn-v2.test.ts`, learning v2 tests | rewritten / extended per phase |
| Docs | `context/product.md` ("Duolingo-style path"), `context/history.md`, `apps/*/CONTEXT.md`, `index.css` bob animation | updated |

## 1. What is confusing today (measured)

Sample plan: Full-stack, campus, 12 weeks, 90 min weekdays / 150 min weekends, every stream on.

| # | Problem | Evidence |
|---|---|---|
| 1 | No clear "what do I do now": Learn opens on the Path (84 day nodes); starting = node → popover → Start; the "Start today" card is `hidden xl:flex` (missing under 1280 px and on Android). | `LearnView.tsx:118`, `PathScreen.tsx:107` |
| 2 | Learn does not teach in the app: a lesson is 6–8 dense one-liners + "Learn from YouTube / ChatGPT"; the instruction is "Study the points below until you could explain each one without notes". | `DayTaskList.tsx:74` |
| 3 | No stated focus for a day: up to 4 cards of different kinds and subjects with equal weight (Day 1: Time complexity + HTML + Fizz Buzz + Palindrome). The scheduler already caps a day at 2 subjects; the problem is presentation, not the mix. | sample run, `packTasks()` |
| 4 | Order bug: "C++ basics for problem solving" lands on day 7, LeetCode problems start on day 1 (`lang.*` and `dsa.basics` are both order 0 with no edge between them). | sample run, seed modules |
| 5 | Topic page "Solved" writes `problem_attempted`: the Today task stays unticked and the page's own Status column stays "—". | `TopicScreen.tsx:51,175`, `progressV2.ts:19` |
| 6 | Same content twice: "What to learn" inline on Today and again on the Topic page. | `DayTaskList.tsx`, `TopicScreen.tsx` |
| 7 | ~22 controls on Today for a 4-task day and up to 3 stacked banners. | `TodayScreen.tsx` |
| 8 | ~20 terms on the main screens (module, stream, part, pace, forecast, shortfall, re-plan …). | copy |
| 9 | Streak, forecast, roadmap % repeated (3 / 3 / 2 places); Progress lists all modules as bars. | Path, Today, Progress |
| 10 | Planner settings on Today every day (pace chips, measured pace). | `TodayScreen.tsx:248` |
| 11 | Reviews below the task list; quizzes are separate tasks that can be ticked without taking them; "Take quiz" opens a long page with the quiz at the bottom. | `TodayScreen.tsx:198`, `TopicScreen.tsx:205` |
| 12 | Rigid calendar: every missed day turns orange on the Path and raises "N tasks from earlier days not done. Re-plan"; nothing moves until the student presses Re-plan. | `PathScreen.tsx` DayNode, `TodayScreen.tsx:137` |
| 13 | Streak counts calendar days: a student who planned Mon–Sat loses the streak every Sunday. | `learning/src/progress.ts:37` |
| 14 | Heavy setup: 9 intake pages, then a review screen listing every module, project and left-out task. | `intakeSteps.ts`, `ReviewScreen.tsx` |

## 2. Research → rules

| Finding | Rule here |
|---|---|
| Mayer: cut extraneous material (coherence d≈0.70), signal what matters (d≈0.46), no redundancy (d≈0.87); user-paced segments (d≈0.70); name concepts first (pre-training d≈0.46). Largest for novices. | One small segment per screen, user-paced; show the names of the points before the details; never the same content twice; nothing on screen that is not the current step. |
| Worked examples then fading (Sweller; Renkl, Atkinson); expertise reversal. | Understand → see it → try it per topic; keep "I already know this". |
| Retrieval beats re-reading (Roediger & Karpicke 2006; Rowland 2014); spacing beats massing. | Check at the end of the lesson; the scheduled quiz on a later day becomes a short review; due reviews open each session. |
| Self-explanation prompts help (Chi 1994; small–moderate in meta-analyses). | One optional "say it in one line" per lesson. |
| Progressive disclosure; never hide the primary action. | One primary button per screen; settings and details one click away. |
| Fewer options, faster decisions (Hick: strong for simple choices, a heuristic beyond). Duolingo's single path aimed to "decrease confusion"; users disliked losing choice. | Default to the next step; any day can still be opened, done early or moved. |
| Goal-gradient (Kivetz 2006): effort rises near a goal, fades when it looks far. | Show today and this week, not "9 % of 84 days". |
| **Timeline**: self-paced MOOCs complete less (MIT supply-chain MOOC: completion −6 %, pass −10 % when self-paced; other studies mixed). External, spaced deadlines beat one final deadline (Ariely & Wertenbroch 2002, though a recent replication failed). If-then plans ("when and where") help (Gollwitzer & Sheeran 2006, d≈0.65). One slip often makes people drop the whole goal ("what-the-hell" effect); built-in "emergency reserve" days raise persistence after a miss (Sharif & Shu 2021; one small null replication). | Keep the end date and weekly targets; stop treating each dated day as a promise. Missed work moves forward by itself; catch-up days are the reserve; the student is asked only when the end date is at risk. |
| Streaks: evidence for engagement, thin for learning; rigid streaks cause guilt. | One streak chip, counted over the student's own study days (rest days never break it). |

## 3. Timeline: keep it, but make it forgiving

| Option | For | Against |
|---|---|---|
| A. Strict dated days (today) | Clear deadline, forecast | Every miss is a red mark + a manual Re-plan; guilt → drop-off; most UI complexity (missed, shortfall, re-plan, move) |
| B. No dates, just "next lesson" | Simplest, no guilt | Campus drives have fixed dates; self-paced completes less; no way to tell if the student will be ready |
| **C. Sequence first, dates as a projection (recommended)** | Keeps the deadline and weekly rhythm, removes missed-day failure states | Small engine work (auto-roll, weekly target, study-day streak) |

Option C, concretely (same data model, same scheduler):

- The plan is an ordered list of **sessions** (today's schedule days). Today shows the next session, whatever its date.
- **Auto-roll**: when Learn opens and earlier days have unfinished work, `replan()` runs and saves (as the Re-plan
  button does now). Toast: "Moved 3 unfinished tasks forward · Undo". No "missed" state anywhere.
- **Only one question, only when it matters**: if auto-roll leaves work that no longer fits before the end date, one
  banner "Your plan no longer fits by 27 Dec" → sheet with the existing options (extend, more weekend time, leave out
  optional tasks).
- **Weekly target** is the commitment: "4 of 6 sessions this week". Doing more pulls the next session in (existing
  `doMore`).
- **Catch-up days** (existing buffer days: the last study day of every two weeks, left empty and used by re-planning
  only when needed) are presented as reserve days: "Reserve day: Sat 14 Nov".
- **End date** stays exact; other dates are shown as estimates ("Thu"), never as deadlines.
- **Streak** counts consecutive planned study days with activity; non-study days and reserve days are skipped.
- If-then plan: intake's study-time page asks "Which days, and roughly when?"; the time is shown on Today
  ("Your study time: 7 pm"). No reminders in this plan.

## 4. Screens

Two tabs instead of three tabs + six hidden screens, plus a focus-mode lesson player.

```
Learn
├── Today   (default)       ← the next session
├── Plan                    ← this week, the roadmap, progress, plan settings
└── Lesson player           ← from Today, Plan, Home or a project; replaces Topic page and inline "What to learn"
```

Words on the main screens: **Today, Plan, Week, Session, Lesson, Practice, Check, Review, Project, Mock test, Reserve
day**. Module, stream, part, pace, forecast, shortfall and re-plan appear only in Plan → Details / Plan settings, in
plain words ("On track", "Behind by 2 h", "Fix my plan").

### 4.1 Today

```
┌───────────────────────────────────────────────────────────────┐
│ Week 2 · Session 3 of 6                  🔥 4   · 7 pm usual  │
│ Prefix sums  + HTML forms                                     │
│ ▓▓▓▓▓▓▓░░░░░░░  1 of 4 done · 55 min left                     │
├───────────────────────────────────────────────────────────────┤
│  NEXT UP                                                      │
│  Lesson · Prefix sums · 30 min                                │
│  8 points in 3 short steps, then a 2-question check           │
│                                         [ Start lesson  → ]   │
├───────────────────────────────────────────────────────────────┤
│ ✓ Warm-up review · 3 questions                         3 min  │
│ ○ Lesson: Prefix sums                                 30 min  │
│ ○ Practice: Find Pivot Index · Easy                   20 min  │
│ ○ Lesson: HTML forms                                  35 min  │
├───────────────────────────────────────────────────────────────┤
│ Can't study today · Do more today                             │
└───────────────────────────────────────────────────────────────┘
```

- The day has a **main focus** (the path's day title = the largest topic) and at most one side topic, shown as
  "Prefix sums + HTML forms" (fixes problem 3 without changing the mix).
- Fixed order: warm-up review (due items, max 5) → main lesson → its practice → side lesson → project / mock.
- "Next up" = first unfinished step, one button. Rows open their step; the only inline control is the status circle.
- A topic's quiz on the same day is part of its lesson row; on a later day it shows as "Review: HTML basics · 5 min".
- One banner at most (plan no longer fits → day done). Missed work never shows (auto-roll).
- Pace, measured pace, forecast and the second streak move to Plan.
- Edge states keep their wording (plan starts soon, ended, reserve day, rest day).

### 4.2 Lesson player (focus mode)

Same component on Windows, Mac and Android; Esc / "×" leaves; resumes where left (position in local storage per entry
key; no sync, no migration).

```
 ×  Prefix sums                              ● ● ○ ○ ○   step 2 of 5
┌───────────────────────────────────────────────────────────────┐
│ 4  Subarray sum k                                             │
│    Keep a map prefix → count, starting with {0: 1}; at each   │
│    index add count[prefix - k], then record prefix.           │
│ 5  Divisible by k                                             │
│    Count equal prefix remainders; normalise negatives with    │
│    ((p % k) + k) % k.                                         │
│ 6  Equal 0s and 1s                                            │
│    Treat 0 as -1 and find the longest zero-sum subarray …     │
│                                                               │
│ Stuck?  ▶ YouTube   💬 ChatGPT     (for the points above)      │
└───────────────────────────────────────────────────────────────┘
 [ ← Back ]                                        [ Got it → ]
```

Built only from existing fields:

1. **Intro**: summary + "You will learn:" the names (the "Name:" part of each point) + time. "I already know this"
   here (jumps to the check).
2. **Points, 2–3 per screen** (median point is 98 chars, so one per screen would be mostly empty; 6–8 points →
   3 screens). Split lessons show only that part's points and "Part 1 of 2 · the rest is in your next session".
   YouTube / ChatGPT links per screen, with those points in the search / prompt.
3. **Remember**: the 3 `key_points` as a recap.
4. **Check**: quiz items one per screen with instant feedback; 80 % ticks the quiz task (existing `quiz_passed`);
   misses go to reviews; free-plan limit shown here with the existing copy.
5. **Practice** (problems of this topic in today's session): difficulty, "Open on LeetCode", then **Solved · Solved
   with a hint · Not yet**. Solved writes the existing `task_done` (with quality) so Today ticks and re-solve reviews
   work from one event (fixes problem 5). Note / "re-solve later" as a small link.
6. **Done**: "Next: Practice · Find Pivot Index" (continues the session) or "Back to Today".

Keyboard → / Enter, ←, Esc; reduced motion respected. **Reference mode** (from Plan or a project): all points on one
scrolling page, the check and problems below, nothing ticks except the check and Solved. This replaces `TopicScreen`
everywhere, including `ProjectsView`.

### 4.3 Plan

```
This week   4 of 6 sessions · reserve day Sat                     Week 2 of 12
 Mon ✓ Arrays basics   Tue ✓ Two pointers   Wed ● Prefix sums
 Thu ○ Sliding window  Fri ○ HTML forms      Sat ○ Reserve        Sun – rest
──────────────────────────────────────────────────────────────────
Roadmap                                         On track · ends 27 Dec
 ✓ Week 1  Basics & web foundations            7/7 sessions  🏆
 ● Week 2  Arrays & web foundations            2/6 sessions   (expanded: sessions)
 ○ Week 3  Hashing & CSS layout
 …
──────────────────────────────────────────────────────────────────
Progress   18 % of the plan · 14 problems solved · 9 h studied   [heatmap]   Details ›
──────────────────────────────────────────────────────────────────
[ Plan settings ]  change with AI · study days and time · end date ·
                   "tasks take me less / as planned / more time" · new roadmap
```

- A session opens a side sheet (bottom sheet on Android): its steps, start / do early, move to another day.
  Replaces `DayScreen`.
- The winding trail, popovers and "Week guide" toggles go; week titles and the trophy stay as marks on the row.
- Details: by area and by module (today's Progress content).

### 4.4 Setup

- Intake 9 → 6 pages: Role (pre-filled), Goal, End date, Study days and time ("which days, roughly when"), Level,
  DSA language. Focus and Extras become optional rows on the summary page. Onboarding uses the same pages.
- Review: weeks, sessions, hours; the AI summary (2–3 sentences, already returned); week 1 session by session;
  "See everything" for modules (with the AI's "why"), projects, left-out work. Primary: "Start my plan".

### 4.5 Home

The Learn card's button opens the next step in the lesson player ("Continue: Prefix sums").

## 5. Engine and AI changes

All in `packages/learning/src/v2` (pure, tested) unless noted. The ai-proxy prompt and schema stay as they are.

1. **Language first**: `orderModules()` gets an implicit edge "every DSA module without a language depends on
   `lang.<intake.language>`" when that module is in the plan. Applies to both the AI path (`normaliseAiRoadmap`) and
   the rules planner, so the AI cannot get it wrong either. Test for every role × aim × language.
2. **Auto-roll**: pure `rollForward(schedule, roadmap, done, today)` = `replan(..., templates: 'keep')` only when
   earlier days have unfinished entries; returns moved count and shortfall. Deterministic, so two devices produce the
   same schedule.
3. **Weekly target and reserve days**: pure helpers over the schedule (sessions planned / done this week, the next
   unused buffer day).
4. **Study-day streak**: `planStreak(events, schedule, today)` skipping non-study and reserve days; Home and Learn
   use it. The old `streak()` stays for v1 / Practice.
5. **Session model**: `sessionSteps(day, progress)` and `nextStep()` in `learnModel.ts`: main focus, order, quiz
   merged into the lesson row, review label for later quizzes.
6. **Lesson model**: `lessonSteps(topic, entry, today's problems)`: intro, point screens (2–3 points, part slicing),
   recap, check, practice.

Not changed: stream shares, the 2-subjects-a-day cap, fitting, AI module choice, adjust (`roadmap_adjust`), boosts,
projects, events, IPC, SQLite `learn_state`, Supabase 027/028/029.

## 6. Build order (each phase ships on its own, all three apps)

1. **Engine** (phase 5.1–5.6 helpers + tests). No UI change yet; existing screens keep working.
2. **Lesson player + one completion path**: `LessonPlayer.tsx` (focus + reference modes); TopicScreen replaced in
   Learn and Projects; Solved writes `task_done`.
3. **Today**: rewritten `TodayScreen.tsx` on `sessionSteps`; auto-roll on open with Undo; default tab Today;
   `DayTaskList.tsx` retired.
4. **Plan**: `PlanScreen.tsx` (week strip, week rows, progress summary, settings drawer, session sheet) replaces
   `PathScreen.tsx`, `ProgressScreen.tsx`, `DayScreen.tsx`; intents `path` / `progress` map to `plan`; Home button.
5. **Setup**: intake 9 → 6 (desktop + mobile onboarding), review collapsed.

Each phase: `npm run typecheck && npm run lint && npm test`, the three app builds, a renderer check of the changed
screens at 1280 px and phone width, and `context/history.md`, `context/product.md`, `apps/*/CONTEXT.md` updated.

## 7. Targets

| Measure | Now | Target |
|---|---|---|
| Clicks from opening Learn to the first point of today's lesson | 2 (+ leave the app) | 1 |
| Controls on Today (4-task day) | ~22 | ≤ 8 |
| Failure states for a missed day | orange node + banner + manual Re-plan | none (auto-roll; one question only if the end date breaks) |
| Streak broken by a planned rest day | yes | no |
| Places showing streak / forecast | 3 / 3 | 1 / 1 |
| Terms on the main screens | ~20 | 11 |
| Ways to mark a problem solved | 2 (one broken) | 1 |
| Language basics before the first DSA problem | no | yes, every role × aim × language |
| Intake pages | 9 | 6 |

## 8. Risks

- **Removing the trail reverses the v1.2.0 choice**: assumed agreed (owner said Learn is confusing; the trail drives
  problems 1, 9 and 12).
- **Auto-roll writes the schedule without a click**: it is the student's own plan (not a submission), the result is
  the same as the Re-plan button, it shows a toast with Undo, and it never drops or adds work.
- **Old schedules**: nothing is rewritten; the language-first order applies to new roadmaps and "Change my plan".
- **Content is still thin** (one-line points): the player makes it easier to read, not deeper. Real explanations
  need reviewed content or an AI "Explain this point" (ai-proxy kind + plan limit + redeploy); not in this plan.
- **Tests**: `learnView.test.tsx` is written against today's screens and gets rewritten with them.

Sources: Mayer multimedia principles; Sweller / Renkl worked examples; Roediger & Karpicke 2006; Rowland 2014;
Chi 1994; Kivetz 2006; Gollwitzer & Sheeran 2006; Ariely & Wertenbroch 2002 (+ replication); Sharif & Shu 2021;
MIT supply-chain MOOC self-pacing thesis (Bilal); Duolingo path redesign coverage.

## Built (phase 1, 30 Oct 2026)

- Engine: language-first order, `rollForward`, `pullNextDay`, `planStreak` (5.1–5.4).
- Session and lesson models (`sessionModel.ts`, 5.5–5.6); lesson player and reference view; Today; Plan with week
  strip, week rows, progress, plan settings (dates and time, task estimates, change with AI, new roadmap) and the
  session sheet; warm-up review; setup with six walked pages and the collapsed review; Home goes straight to the next
  step.
- Deferred on purpose: the study-time-of-day question (needs a new stored intake field), AI "explain this point".
- Found while building: the default 12-week full-stack plan has ~93 h of time for ~403 h of catalogue, so ~109 h is
  left out. Plan shows it with a link to Plan settings; the real fix is phase 2 (content scope and module choice).
