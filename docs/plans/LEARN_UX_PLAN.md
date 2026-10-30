# Learn UX plan: less to think about, more learning

Status: plan, not built (30 Oct 2026). Scope: `packages/app-ui/src/features/learn/` (all three apps), one engine fix in
`packages/learning/src/v2`. No migration, no IPC change, no new content.

## 1. What is confusing today (measured, not guessed)

Sample plan used for the numbers: Full-stack, campus, 12 weeks, 90 min weekdays / 150 min weekends, every stream on
(rules planner + scheduler from the seed bundle).

| # | Problem | Evidence |
|---|---|---|
| 1 | No clear "what do I do now". Learn opens on the Path (84 day nodes); starting takes node → popover → Start. The "Start today" card is `hidden xl:flex`, so it is missing under 1280 px and on Android. | `LearnView.tsx:118`, `PathScreen.tsx:107` |
| 2 | "Learn" does not teach in the app. A lesson is 7–8 dense one-liners ("Subarray sum k: map prefix -> count starting with {0: 1}; …") plus "Learn from YouTube / ChatGPT"; the instruction is "Study the points below until you could explain each one without notes". | `DayTaskList.tsx:74`, seed topics |
| 3 | Too much context switching. Per study day: 3.2 tasks, 2.4 topics, 2.2 streams on average (max 6 / 4 / 3). Day 1 = Time complexity + HTML + Fizz Buzz + Palindrome Number. | sample run |
| 4 | Prerequisite order bug: "C++ basics for problem solving" lands on day 7, LeetCode problems start on day 1. | sample run |
| 5 | Two ways to finish the same thing, and one does nothing visible. Topic page "Solved" writes `problem_attempted`: the Today task stays unticked and the page's own Status column stays "—". | `TopicScreen.tsx:51,175`, `progressV2.ts:19` |
| 6 | Same content twice: "What to learn" inline on Today and again on the Topic page (plus summary, Remember, problem table, quiz). | `DayTaskList.tsx`, `TopicScreen.tsx` |
| 7 | ~22 controls on Today for a 4-task day (checkbox, action, "What to learn", YouTube, ChatGPT per lesson; Do more; Can't study; Start review; 3 pace chips; 3 tabs) and up to 3 stacked banners. | `TodayScreen.tsx` |
| 8 | ~20 terms before learning anything: path, week, day, module, topic, task, part, stream, lesson, quiz, review, re-solve, mock, module check, weekly revision, catch-up day, pace, forecast, shortfall, re-plan, get ahead. | copy across screens |
| 9 | Repeated numbers: streak in 3 places, forecast in 3, roadmap % in 2; Progress lists all 36 modules as bars. | Path sidebar, Today, Progress |
| 10 | Planner settings shown every day: "I am faster / As planned / I need more time", "Use my measured pace (1.3×)". | `TodayScreen.tsx:248` |
| 11 | Reviews (the best-evidenced activity) sit below the task list, are not counted in the Today badge, easy to skip. Quizzes are separate tasks, can be ticked without taking them, and "Take quiz" opens a long page with the quiz at the bottom. | `TodayScreen.tsx:198`, `TopicScreen.tsx:205` |
| 12 | Heavy setup: 9 intake pages, then a review screen listing 36 modules, projects and left-out tasks. | `intakeSteps.ts`, `ReviewScreen.tsx` |

## 2. Research → rules for this redesign

| Finding | Rule here |
|---|---|
| Cognitive load theory / Mayer: cutting extraneous material (coherence, d≈0.70), signalling (d≈0.46), no redundancy (d≈0.87); managing essential load by user-paced segments (d≈0.70) and naming concepts first (pre-training, d≈0.46). Effects are largest for novices. | One idea per screen, user-paced. Show each concept's name before the details. Nothing on screen that is not the current step. Never show the same content in two places. |
| Worked-example effect and fading (Sweller; Renkl, Atkinson); expertise reversal. | Order per topic: understand → see it → try it. Keep "I already know this" so strong students skip. |
| Retrieval practice beats re-reading (Roediger & Karpicke 2006; Rowland 2014 meta-analysis). Spacing beats massing (expanding-interval details are mixed). | Quiz inside the lesson, right after the points. Due reviews open the session as a 3–5 min warm-up. Keep SM-2 but never expose it. |
| Self-explanation prompts help (Chi 1994; meta-analyses small–moderate). | One optional "say it in one line" prompt per lesson, not per point. |
| Progressive disclosure: the common path visible, the rest one step away; never hide the primary action. | One primary button per screen. Settings, details and rare actions behind one click. |
| Fewer options → faster decisions (Hick's law; strong for simple choices, a heuristic for complex ones). Duolingo moved to a single path to "decrease confusion" and fold in timed reviews (self-reported better outcomes; users disliked losing choice). | Default to "the next thing", keep an escape hatch: any day can be opened, done early or moved. |
| Goal-gradient (Kivetz 2006): effort rises near a goal, fades when it looks far. | Show progress for today and this week, not "9% of 84 days". |
| Streaks: evidence for engagement, thin for learning; rigid streaks can cause guilt. | One small streak chip, nowhere else. |

## 3. New structure

Two tabs instead of three tabs + six hidden screens, plus a focus-mode lesson player.

```
Learn
├── Today   (default landing)      ← what to do now
├── Plan                           ← this week, the roadmap, progress, settings
└── Lesson player (focus mode)     ← opened from Today or Plan; replaces Topic page + inline "What to learn"
```

Words the student sees: **Today, Plan, Week, Day, Lesson, Practice, Check, Review, Project, Mock test**. Module, stream,
part, pace, forecast, shortfall and re-plan disappear from the main screens (Plan → Details and Plan settings only, in
plain words: "On track", "Behind by 2 h", "Fix my plan").

### 3.1 Today

```
┌───────────────────────────────────────────────────────────────┐
│ Week 2 · Day 3                                     🔥 4 days  │
│ Prefix sums                                                   │
│ ▓▓▓▓▓▓▓░░░░░░░  1 of 4 done · 55 min left                     │
├───────────────────────────────────────────────────────────────┤
│  NEXT UP                                                      │
│  Lesson · Prefix sums · 30 min                                │
│  8 short points, then a 2-question check                      │
│                                         [ Start lesson  → ]   │
├───────────────────────────────────────────────────────────────┤
│ ✓ Warm-up review · 3 questions                         3 min  │
│ ○ Lesson: Prefix sums  (check included)               30 min  │
│ ○ Practice: Find Pivot Index · Easy                   20 min  │
│ ○ Practice: Subarray Sum Equals K · Medium            40 min  │
├───────────────────────────────────────────────────────────────┤
│ Can't study today · Do more today                             │
└───────────────────────────────────────────────────────────────┘
```

- Session order, always the same: warm-up review (due items, max 5) → lesson(s) → practice → project/mock.
- "Next up" = first unfinished step, one button. Clicking a row opens that step; rows have no inline controls except
  the status circle.
- A topic's lesson and its check on the same day are one row; a check that falls on a later day shows as
  "Review: Prefix sums · 5 min".
- At most one banner, by priority: plan no longer fits → missed work → day complete. Each has one button ("Fix my
  plan" opens a sheet with the extend / weekends / leave-out options; "Move missed work" re-plans).
- Day complete: "Day done. Next: Thursday · Sliding window" + "Do more today".
- Pace chips, measured pace, forecast and the second streak move out (Plan settings / Plan).
- Empty and edge states keep their current wording (plan starts soon, ended, catch-up day, rest day).

### 3.2 Lesson player (focus mode)

Same component on desktop, Mac and Android; full width of the Learn area, Esc or "×" to leave, resumes where left.

```
 ×  Prefix sums                     ●●●○○○○○○○  3 / 10
┌───────────────────────────────────────────────────────────────┐
│ Subarray sum k                                                │
│ Keep a map prefix → count, starting with {0: 1}. At each      │
│ index add count[prefix - k], then record prefix.              │
│                                                               │
│ Stuck on this point?  ▶ YouTube   💬 ChatGPT                   │
└───────────────────────────────────────────────────────────────┘
 [ ← Back ]                                        [ Got it → ]
```

Steps, built only from existing fields (no new content):

1. **Intro**: `summary_md` + "You will learn:" the names of the points (the bold "Name:" part of each `learn_items`
   line) + time. "I already know this" lives here (skips to the check).
2. **One point per screen** (`learn_items`, or `key_points` when a topic has none). The YouTube / ChatGPT links move
   here, small and secondary, with the point in the search/prompt. For split lessons only that part's points show,
   with "Part 1 of 2 · the rest is on Thursday".
3. **Remember**: `key_points` as a 3-line recap (when the topic has both lists).
4. **Check**: the topic's quiz items, one per screen, instant feedback. Pass (80 %) ticks the check task; misses go to
   reviews as today. Free-plan daily limit shows here with the existing upgrade copy.
5. **Practice** (when today has problems for this topic): each problem as a card: difficulty, "Open on LeetCode", then
   one choice: **Solved · Solved with a hint · Not yet**. Solved / hint ticks the Today task and feeds re-solve
   reviews in one event (fixes problem 5). Notes and "re-solve later" stay as a small link on the card.
6. **Done**: "Lesson done" + "Next: Practice · Find Pivot Index" button (continues the session) or "Back to Today".

Keyboard: → / Enter next, ← back, Esc close. Reduced motion respected. Position kept per entry in local prefs (no sync,
no migration).

The current Topic page is removed; "Browse a topic" from Plan opens the same player in review mode (all points,
no ticking).

### 3.3 Plan

```
This week                                                Week 2 of 12
 Mon ✓ Arrays basics   Tue ✓ Two pointers   Wed ● Prefix sums
 Thu ○ Sliding window  Fri ○ HTML forms      Sat ○ Revision   Sun –
──────────────────────────────────────────────────────────────────
Roadmap                                         On track · ends 27 Dec
 ✓ Week 1  Basics & web foundations            7/7 days
 ● Week 2  Arrays & web foundations            2/6 days   (expanded)
 ○ Week 3  Hashing & CSS layout
 …
──────────────────────────────────────────────────────────────────
Progress   18 % of the plan · 14 problems solved · 9 h studied
           [activity heatmap]                     Details ›
──────────────────────────────────────────────────────────────────
[ Plan settings ]   (adjust with AI, time per day, study days, end date,
                     "tasks take me less / as planned / more time", new roadmap)
```

- Clicking a day opens a side sheet (bottom sheet on Android) with that day's steps: open, do early, move to another
  day. Replaces the separate Day screen.
- The winding trail, per-week popovers, "Week guide" toggles and the duplicated sidebar stats go. Week titles and the
  trophy mark for a finished week stay as small marks on the week row.
- Details (one click): by area and by module bars (today's Progress tab content).

### 3.4 Setup (intake + review)

- Intake 9 pages → 6: Role (pre-filled from profile), Goal, Deadline, Study time (days + weekday/weekend minutes on one
  page), Level, DSA language. Focus (streams) and Extras (exam weeks, trips, companies) become optional rows on the
  summary page ("Covers: everything · Change"). Onboarding's roadmap step uses the same pages.
- Review: headline numbers (weeks, study days, hours), week 1 day by day, one line per area. Modules, projects and
  left-out work under "See everything". Primary: "Start my plan". Adjust and regenerate stay.

### 3.5 Home

Home's Learn card button goes straight to the next step in the lesson player ("Continue: Prefix sums"), not to the Path.

## 4. Engine changes (`packages/learning/src/v2`)

1. Language basics first: when DSA is on, the `lang.<language>` module is scheduled before the first `solve` task
   (fixes problem 4). Test in `v2-content.test.ts` for every role × aim.
2. Day cohesion: the scheduler prefers ≤ 2 topics and ≤ 2 streams per study day when capacity allows; a topic's
   learn task and its first problems land on the same day. Target: ≥ 90 % of study days within the limit for every
   role × aim fixture. Saved schedules are untouched; the rule applies on the next re-plan or new roadmap.

## 5. Targets

| Measure | Now | Target |
|---|---|---|
| Clicks from opening Learn to the first point of today's lesson | 2 (+ leave the app) | 1 |
| Interactive controls on Today (4-task day) | ~22 | ≤ 8 |
| Places showing streak / forecast | 3 / 3 | 1 / 1 |
| Terms on the main screens | ~20 | 10 |
| Ways to mark a problem solved | 2 (one broken) | 1 |
| Topics / streams per study day (sample plan, max) | 4 / 3 | 2 / 2 |
| Intake pages | 9 | 6 |

## 6. Build order

1. **Phase 1, Today + lesson player + one completion path** (biggest win, UI only): `learnModel.ts` gets pure
   `sessionSteps()` / `nextStep()` / `lessonSteps()` with unit tests; new `LessonPlayer.tsx`, rewritten
   `TodayScreen.tsx`; `DayTaskList.tsx`, `TopicScreen.tsx`, `DayScreen.tsx` removed or folded in; Topic "Solved"
   writes `task_done` with quality. Learn opens on Today.
2. **Phase 2, Plan tab**: `PlanScreen.tsx` (week strip, week list, progress summary, settings drawer, day sheet)
   replaces `PathScreen.tsx` and `ProgressScreen.tsx`; pace controls move into settings.
3. **Phase 3, setup**: intake 9 → 6, review screen collapsed.
4. **Phase 4, engine**: language-first and day cohesion with fixture tests.

Each phase: typecheck, lint, tests, three app builds, `context/history.md` + `apps/*/CONTEXT.md` updated.

## 7. Not in scope / needs the owner

- In-app explanations beyond the existing points (worked examples, an "Explain this point" AI action): needs reviewed
  content or an ai-proxy kind with a plan limit; not built until the owner decides.
- Removing the Duolingo-style trail is a reversal of the v1.2.0 choice; the plan assumes the owner agrees (the trail
  is the main source of problems 1 and 9).
