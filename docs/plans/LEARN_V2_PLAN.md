# Learn v2: detailed plan (draft for owner review)

Status: **proposal, nothing built yet**. Written 4 October 2026 after a research pass over the current Learn code
and comparable products. Section 19 lists the decisions I need from you, and section 20 lists what I need you to send
(project references). After you finalise them, building follows the phases in section 17.

---

## 0. One-screen summary

The student gives four inputs: **target role, duration, weekly hours and study days**. Nomadic then builds a
**personal roadmap** that is:

- **AI-generated but grounded.** The AI picks, orders and weights modules from a reviewed catalogue, and can add a
  few custom modules for targets the catalogue lacks. A deterministic scheduler turns that into dated days.
  If the AI is unavailable, a rules-based planner produces the same shape.
- **Module-wise.** Roadmap → **Modules** → **Topics** (the sub-topics) → **Tasks** (the sub-tasks: learn, solve,
  quiz, build, revise, mock). Every task has a time estimate.
- **Day-wise.** Each study day gets a dated task list that fits the hours the student said they have. It includes
  revision slots, buffer days and mock tests. When a day is missed, the plan re-plans itself and shows the cost
  ("3 days behind: extend to 30 Dec, or add 2 h this weekend").
- **Specific about questions.** Every DSA topic names the exact problems to solve. They are picked from the real
  1,785-problem company dataset already in the app, ranked by how many company lists include them, and boosted for
  the student's target companies. SQL, aptitude and CS-fundamentals topics name their question sets too.
- **Specific about projects.** Modules end with named build milestones, and the roadmap ends with a capstone.
- **Backed by a Project Library.** Projects can be filtered by role, level, hours, stack and skill. Every project
  has a **fully guided, stage-by-stage build**: goal, numbered steps, progressive hints, acceptance checklist and
  an optional GitHub repo check. Finishing a project produces a README template, resume bullets drawn only from the
  student's own inputs, and interview questions about the project.
- **AI-generated projects.** The first library batch is drafted from **your references**, then reviewed. Later,
  Pro/Max users can generate a private guided project from their own idea.

---

## 1. What is wrong with Learn today (findings from the code)

| Area | Today | Problem |
|---|---|---|
| Structure | 102 skills, **one lesson per skill** | `dsa` is a 60 h skill with a single lesson; `system-design` 30 h, one lesson. No modules, topics or tasks. |
| Plan | `planTrack` assigns skills to **weeks** | No days, no dates, no daily task list, no buffer or revision days, no catch-up when a day is missed. |
| Pace | 5 / 10 / 20 h per week; 1 / 3 / 6 months | Too coarse. No study-day choice, no weekday/weekend split, no exam blackouts. |
| Questions | ~1,800 company problems live in **Practice**, not in Learn | Learn never tells the student which problems to solve; `dsa` links to nothing specific. |
| Projects | None | Nothing to build, no portfolio output, no project library. |
| Resources | 29 resources; **69 lessons have none** | Lessons are thin summaries. |
| Content gaps | No OOP, OS, DBMS theory, Computer Networks, Aptitude, language basics (C++/Java) | These are what Indian campus placements test (OA + technical + HR). |
| AI | Not used in Learn (only an unused `applyPlanAdjustment` validator) | No personalisation beyond role weights. |
| Today queue | Due reviews + **one** lesson | Not a real day plan. |

Worth keeping: the skill graph (prerequisites, topological sort), the append-only event log, mastery, SM-2 reviews,
streaks, the heatmap, readiness and job match (Learn mastery already feeds the feed's match score), the
`ai-proxy` path with server quotas, and the content status flow (draft → review → published, with versions and audit).

---

## 2. What comparable products do (research)

| Product | Pattern worth taking | Gap we fill |
|---|---|---|
| **Striver A2Z / TUF** | ~20 DSA modules, ~95 sections, ~495 problems, ~6 months; learn → solve → revise; brute → better → optimal per problem | One fixed sheet for everyone; no dates; no dev/CS-core integration |
| **TUF Planly** | Intake → weekly sprints → daily tasks, time tracking, re-planning missed days | DSA-centric |
| **roadmap.sh** | Role roadmaps; **project library** by difficulty with requirement specs; AI Tutor creates roadmaps, courses and quizzes from a prompt | Projects are specs only, not guided; AI output is ungrounded (no verified links or problems) |
| **CodeCrafters** | Projects split into **small ordered stages**, each with instructions and an automated test; extensions add stages | Paid, a few projects only, no roadmap |
| **The Odin Project** | Curriculum of lessons + assignments + projects per section | Web dev only, no scheduling |
| **NeetCode** | Problems grouped by pattern with a prerequisite tree | No schedule, no projects |

Nomadic v2 combines the A2Z-style hierarchy, Planly-style day planning, roadmap.sh-style library filters and
CodeCrafters-style stages, all personalised by AI and grounded in data we can verify.

---

## 3. Principles (product rules that shape every choice below)

1. **No invented data.** The AI chooses from the catalogue. Problems come only from the real dataset (real links),
   and resources only from the link-checked resources table. Custom AI modules carry an "AI-generated, not reviewed"
   label and no links. Resume bullets use only numbers the student typed.
2. **The AI plans, code schedules.** The AI decides *what* and *in which order and weight*. Deterministic code
   decides *which day*, because hour arithmetic and calendar logic must be exact, testable and stable.
3. **Stable days.** Past days are frozen. Future days change only on an explicit re-plan (missed day, pace change,
   adjustment), never on every app launch.
4. **Small steps.** No task over 60 minutes. Project stages take 1 to 3 hours and break into steps of 10 to 30
   minutes.
5. **Honest feasibility.** If the goal does not fit the hours, the student is told exactly what gets left out,
   before the roadmap is accepted.
6. **Works without AI.** A rules-based plan takes over when the AI is unavailable, the quota is used up, or the
   student is offline at generation time.
7. **Usual app rules.** Every screen has loading, empty and error states, works with the keyboard only, and fits
   1024 px. IPC inputs are zod-validated. Local-first, then synced.

---

## 4. The student journey, end to end

Example: a 3rd-year CSE student targeting a **Full-stack** placement in **12 weeks**, with **1 h on weekdays and
2.5 h on Saturday and Sunday** (10 h/week), knows basic C++, and targets Amazon, Flipkart and Zoho.

1. **Intake** (5 steps, about 2 minutes; section 6). A live feasibility bar shows "Needs ~210 h for full coverage; you
   have ~120 h in 12 weeks".
2. **Generate.** About 10 seconds. The AI returns module choices, stream ratios (DSA 45%, Dev 35%, Core CS 15%,
   Aptitude 5%), emphasis per module, two projects, a summary and warnings.
3. **Review the roadmap** before accepting it: a 12-week timeline of modules with hours and a one-line reason for each
   ("Sliding window: common in Amazon OA lists"). The student can remove or reorder modules, swap a project, change
   the pace, or "Regenerate with a note" (free text). A "Left out because of time" list shows what did not fit.
4. **Accept.** The scheduler writes 84 dated days. Today opens on Day 1.
5. **Daily use.** Today shows the day's tasks: tick them off, open a problem in the browser, mark it solved, take a
   quiz, do a project step. Unfinished tasks move to the next free slot automatically. Buffer days absorb small slips.
6. **Weekly.** The last study day of the week is lighter and includes a revision block. After each DSA module there is
   a timed module check. In the last third, a full OA-style mock runs every 2 weeks.
7. **Projects.** After "REST APIs" the plan schedules Stages 1 to 3 of the chosen backend project. The capstone takes
   the last 2 weeks.
8. **Adjust any time.** For example: "I have mid-sems 10 to 17 Nov", "more DP", or "switch to 15 h/week". The AI
   proposes a change, the student sees the before/after, accepts it, and future days re-plan.
9. **Outcome.** Readiness by module, problems solved by difficulty and topic, hours done against the plan, project
   portfolio, and the job feed's match % rising as modules are mastered.

---

## 5. Structure: Roadmap → Module → Topic → Task

```
Roadmap (one per student per role, versioned)
└── Module          e.g. "DSA · Sliding Window & Two Pointers"   stream: dsa   ~9 h   prereqs: Arrays, Hashing
    └── Topic       e.g. "Variable-size window"                   ~2.5 h  (the sub-topic)
        └── Task    the sub-tasks, each with minutes and a kind:
            • learn     read/watch: lesson text + 1–3 checked resources        15–30 min
            • solve     one named problem (e.g. "Longest Substring Without
                        Repeating Characters", Medium)                          20/40/60 min by difficulty
            • quiz      3–5 checked questions (existing QuizForm)               10 min
            • build     one project stage step                                  30–60 min
            • revise    spaced-repetition review or re-solve                    10–20 min
            • mock      timed module test / OA mock                             45–90 min
            • read      CS-core notes + MCQs (OS, DBMS, CN, OOP)                20–40 min
```

**Streams.** Every module belongs to one stream: `dsa`, `core_cs` (OOP, DBMS+SQL, OS, CN, system design),
`dev` (role track: frontend, backend, devops, data and so on), `aptitude`, `interview`. The roadmap sets a ratio per
stream, and the scheduler mixes streams within a week instead of doing 6 weeks of DSA and then 6 weeks of
development. This matches how students prepare.

**Emphasis** (set by the AI or the rules, editable by the student) controls depth:

| Emphasis | Topics included | Problems per topic | Quiz |
|---|---|---|---|
| light | core topics only | "must" problems | 1 |
| standard | core + standard topics | must + good | 1 |
| deep | all topics | must + good + stretch, + company boost | 2 |

**Link to skills.** Each module and topic lists `skill_ids` from the existing 102-skill graph. Mastery, readiness and
job match keep working: finishing a module's tasks and checks adds mastery evidence to its skills.

---

## 6. Intake (Learn goal setup, and the onboarding roadmap step)

| Step | Fields | Notes |
|---|---|---|
| 1. Goal | Target role (8 families + "Other: type it"); aim: campus placement / internship / off-campus job / switch | Prefilled from onboarding and profile |
| 2. Time | Duration: presets 4 / 8 / 12 / 16 / 24 / 36 / 52 weeks **or** an end date; study days (Mon–Sun chips); minutes per weekday and per weekend day (two sliders, 30 min steps, 0.5–8 h) | Shows total hours live |
| 3. Blackouts (optional) | Exam weeks, trips (date ranges) | Scheduler skips them |
| 4. Level | Self-rating per stream (new / some / comfortable) **or** a 10-question quick check; DSA language (C++ / Java / Python / JavaScript); skills already known (from profile, editable) | Language picks resources and starter code |
| 5. Targets (optional) | Target companies (searchable, from the 428 companies in the dataset); free-text "anything else" (max 500 chars) | Companies boost problem picks; free text goes to the AI |

**Feasibility preview** (deterministic, before any AI call):
*"Full coverage for Full-stack needs ~210 h. You have ~120 h. We'll cover the core of every module and leave out
stretch topics. Want full coverage? Pick 20 weeks, or 17.5 h/week."*

Onboarding uses a short version (steps 1, 2 and 4, with defaults) so it stays quick. The rest can be edited in Learn.

---

## 7. AI roadmap generation

### 7.1 Flow
```
renderer intake → main learnRoadmapGenerate (zod) → ai-proxy kind "roadmap_plan"
  → consume_ai_quota(roadmap_plan) → Gemini JSON-schema call → output checks → (refund on failure)
→ main validates against the bundled catalogue → normalises → returns draft roadmap
→ renderer shows the review screen → accept → scheduler → save locally → sync
```

### 7.2 What the AI receives (about 8–10k tokens)
- The intake (role, aim, weeks, minutes per day, study days, blackouts, level per stream, language, known skills,
  target companies, free text).
- A compact catalogue for the relevant streams: module id, title, stream, hours at each emphasis, hard prerequisites
  and level. Topic ids and titles are included only for modules of the chosen role (about 300 lines).
- Library projects for the role: id, title, level, hours, skills.
- The rules: use only the given ids, respect the hour budget, explain choices in ≤ 160 characters, no links.

### 7.3 What the AI returns (JSON schema, enforced by Gemini `responseSchema`)
```jsonc
{
  "summary": "≤ 400 chars, shown at the top of the roadmap",
  "streams": { "dsa": 45, "dev": 35, "core_cs": 15, "aptitude": 5, "interview": 0 },   // sums to 100
  "modules": [
    { "id": "dsa.sliding-window", "emphasis": "deep", "skip_topics": [], "why": "≤ 160 chars" }
  ],
  "custom_modules": [            // max 3; only when the catalogue has nothing for the target
    { "title": "Flutter basics", "stream": "dev",
      "topics": [ { "title": "Widgets and layout", "tasks": [ { "kind": "learn", "title": "…", "minutes": 30 } ] } ] }
  ],
  "projects": [ { "id": "proj.placement-tracker-api", "after_module": "be.rest-apis", "why": "…" } ],
  "warnings": [ "12 weeks is tight for DP at deep emphasis; set to standard." ]
}
```

### 7.4 Validation and repair (in main, pure functions, fully unit-tested)
- Unknown module, topic or project ids are dropped, with a warning shown to the student.
- Missing hard prerequisites are added automatically (marked "added: needed for X").
- Order: topological sort over prerequisites, with the AI's order as the tie-breaker.
- Stream ratios are clamped to 0–100 and renormalised. Custom modules are capped at 3 modules × 8 topics × 6 tasks,
  with minutes clamped to 10–60.
- Text is trimmed to length caps, URLs and emails are stripped, and banned phrases are checked (the same output
  checks style as `ai-proxy`).
- If the result is still invalid or empty, the rules plan is used and the student is told "Built with the standard
  planner".

### 7.5 Rules-based fallback (no AI)
Modules are chosen from role templates (role → modules with default emphasis, from `role_skills` weights) and the
student's level. Stream ratios come from the role template. The hour budget is filled by priority (core first),
then the result goes through the same scheduler. It is free and always available.

### 7.6 Adjusting a roadmap ("roadmap_adjust")
The student types a change. The AI receives the current roadmap summary, progress and the instruction, and returns a
**diff** in the same vocabulary: add, remove or emphasis changes, stream ratio changes, blackout dates, pace change,
project swap. The app shows before/after (hours, end date, what moves) and applies it only on Accept. Days already
done are never touched.

### 7.7 Cost and limits
One generation is about 10k input and 2–4k output tokens on `gemini-2.5-flash` with thinking off. Limits are in
section 15, and the server enforces them through `consume_ai_quota` like the existing kinds.

---

## 8. Day-wise scheduler (deterministic)

### 8.1 Inputs
Ordered task list (modules → topics → tasks), each task with `minutes`, `stream`, `optional`, `splittable`;
the calendar (start date, end date, study days, minutes per weekday, blackouts); and policies:

| Policy | Default |
|---|---|
| Review reserve | 10–15 min every study day for SM-2 reviews (only when reviews are due; otherwise freed) |
| Weekly revision | Last study day of each week: 50% of its time is revision of that week's topics |
| Buffer | 1 buffer day per 14 days (or 8% of capacity), placed at the end of each fortnight |
| Module check | A timed mock after every DSA module (30–45 min) |
| OA mocks | In the last third of the plan, one OA-style mock every 2 weeks (90 min, a weekend day) |
| Stream mixing | Each day takes tasks from at most 2 streams; weekly minutes follow the stream ratios ± 10% |
| Task size | Never split a task under 30 min; problem sets become one task per problem |
| Day fit | A day may run over by 10 minutes at most; otherwise the task moves to the next day |

### 8.2 Packing algorithm
1. Capacity per date = minutes for that weekday, minus reserves. Blackouts and non-study days have 0.
2. Keep one queue per stream, in topological order.
3. For each study day: choose the 1–2 streams most behind their target share for the week, and pull tasks in order
   from those queues until the day is full (hard prerequisites across streams are respected).
4. Insert weekly revision, module checks, OA mocks and buffer days according to the policies.
5. If tasks remain after the end date (over budget): drop `optional` tasks first (stretch problems, optional topics),
   then lower `deep` to `standard` and `standard` to `light` on the lowest-priority modules. Show the student
   **exactly** what was left out. Core tasks are never dropped silently.

Output: `ScheduleDay[] = { date, minutes_planned, tasks: [{task_id, minutes, stream}], kind: study|revision|buffer|mock|off }`.

### 8.3 Re-planning
- **Missed or unfinished tasks** (detected on the first open of a day): they move to the next free capacity, using
  buffer days first. Done days stay frozen. Shown as "2 tasks moved from yesterday".
- **Behind beyond the buffer**: a banner with three one-click options, each with its computed effect:
  extend the end date to X, add N h on the coming weekend, or leave out these K optional tasks.
- **Ahead**: "Do more today" pulls the next task from tomorrow.
- **Personal pace factor**: actual time per task (from done timestamps, or the optional timer) gives a per-student
  factor between 0.6× and 1.8× after 10 tasks. Future estimates are scaled by it, so the plan becomes realistic
  after a week of use.
- **Pace, duration or blackout change**: re-plan from today forward.

### 8.4 Example (the student from section 4, week 3)

| Day | Time | Tasks |
|---|---|---|
| Mon 19 Oct | 60 min | DSA · Sliding window: *learn* fixed vs variable window (20) · *solve* Longest Substring Without Repeating Characters, Medium (40) |
| Tue 20 Oct | 60 min | DSA: *solve* Longest Repeating Character Replacement, Medium (40) · *revise* 2 cards (10) · *quiz* sliding window (10) |
| Wed 21 Oct | 60 min | Core CS · DBMS: *read* Normalisation 1NF–3NF + 8 MCQs (20) · *solve* SQL: Second Highest Salary, Medium (40) |
| Thu 22 Oct | 60 min | Dev · Backend: *learn* REST resource design (30) · *build* Project "Placement Tracker API" stage 1, steps 1–2 (30) |
| Fri 23 Oct | — | off (study days Mon–Thu, Sat, Sun) |
| Sat 24 Oct | 150 min | DSA: *solve* Max Consecutive Ones III (40) · *solve* Minimum Window Substring, Hard (60) · *build* stage 1, steps 3–4 (50) |
| Sun 25 Oct | 150 min | **Revision day**: re-solve 2 problems from the week (60) · DBMS recap quiz (15) · *mock* Sliding-window module check, 3 problems (45) · *revise* REST notes (30) |

(The problem names above are real entries in `leetcode-companies.json`.)

---

## 9. Questions to solve

### 9.1 DSA (LeetCode company dataset, 1,785 unique problems: 398 easy, 978 medium, 409 hard)
- **Curated per topic.** Each catalogue topic stores a reviewed list of problem refs (`lc:<slug>`) in three tiers:
  `must`, `good` and `stretch`. A build-time check fails if a ref is not in the dataset. Curation starts from the
  dataset's topic tags (Array 1,027, String 429, Hash Table 405, DP 279, Binary Search 163, DFS 160, Two Pointers 131,
  Tree 117, BFS 115, Stack 99, Database 81, Sliding Window 66, Backtracking 57, Graph 47, Linked List 46, Heap 34,
  Union-Find 24, Trie 8, …), ranked by how many company lists include each problem. Target size: about 400 DSA
  problems across 18 modules, comparable to the A2Z or NeetCode 250 scale, but chosen by us from our data.
- **Ordering inside a topic:** easy → medium → hard, then by company count. The first problem of each pattern is a
  "pattern intro" with a learn step before it.
- **Company boost.** For each target company, the topic adds up to 2 extra problems that are tagged with the topic
  and appear on that company's list (ranked by frequency), labelled "On Amazon's list".
- **Dedup.** Each problem appears once in a roadmap, under its first topic.
- **Premium problems.** The dataset has no paid-only flag. The curation script checks this once, offline, and paid
  problems are excluded from `must` and `good` (they can stay as `stretch`, marked "LeetCode Premium").
- **Per-problem tracking.** Status (todo / attempted / solved / solved with hint), time taken, notes and "re-solve
  later". Solved problems enter SM-2 as **re-solve reviews** at growing intervals; "needed a hint" brings the review
  sooner.
- **Verification.** Self-reported, as today. Optional (decision 19.6): connect a LeetCode username and read recent
  accepted submissions from LeetCode's public profile data. That only covers the last ~20, so it is a convenience,
  not proof.

### 9.2 SQL
The dataset's 81 `Database` problems (for example Second Highest Salary, Department Top Three Salaries) go to the
DBMS+SQL module, plus a short set of authored SQL quiz items.

### 9.3 CS core (OOP, DBMS, OS, CN, system design basics)
Each topic has a `read` task (lesson notes) and 5–10 MCQs (the existing quiz item format). Target about 500 MCQs,
AI-drafted and reviewed. Example topics: process vs thread, scheduling, deadlocks, paging; ACID, indexing,
normalisation, transactions; OSI/TCP-IP, TCP vs UDP, HTTP/HTTPS, DNS; the four OOP pillars, SOLID, common design
patterns.

### 9.4 Aptitude (for mass recruiters: TCS NQT, Infosys, Wipro, Accenture, Capgemini, Cognizant)
Quant (percentages, profit/loss, ratios, time-speed-distance, time and work, P&C, probability, number system),
logical (series, coding-decoding, blood relations, seating, syllogisms, data sufficiency) and verbal (reading
comprehension, sentence correction). There is **no dataset for this today**: about 600 MCQs and fill-ins must be
drafted by AI and reviewed. The stream is on by default for campus aims and off for off-campus or switch aims.

### 9.5 Dev tracks
Practice is mostly `build` tasks (project steps) plus quizzes on concepts.

---

## 10. Projects

### 10.1 Projects inside the roadmap
- **Milestone projects.** A dev module can end with the first N stages of a library project (for example after
  "REST APIs": stages 1–3 of *Placement Tracker API*). The next dev module continues with the later stages, so one
  project grows across the roadmap.
- **Capstone.** The last 15–20% of the plan's dev time goes to finishing and deploying one project.
- **Choice.** At roadmap review, the student picks 1 of the 3 suggested projects per slot, or any library project of
  the same level and stack.
- Project stages are scheduled like other tasks, but their steps keep their order and are never mixed across days in
  a way that breaks a stage.

### 10.2 Project Library (new Learn section)
- **Browse.** Grid or list. Filters: role, level (Beginner / Intermediate / Advanced), hours (< 10, 10–25, 25–50,
  50+), stack (React, Node, Spring Boot, Django, Flutter and so on), skills, "fits my roadmap". Search. Sort by
  "best for my target" (skills that are missing from the student's top jobs come first, using the feed's
  missing-skills data).
- **Project page.** Pitch (what you build and why recruiters care), what you will learn (skills), prerequisites
  (modules, each with a done/not-done tick), stack options, stage overview with hours, an example final result
  (described in text; screenshots only when we have real ones), and buttons "Start project" / "Add to my roadmap".
- **My projects.** In progress, done, repo link, stage progress.

### 10.3 Guided build: the stage format
Every project has 5–12 **stages**. Each stage has:

| Part | Content |
|---|---|
| Goal | One sentence: what works at the end of this stage |
| Concepts | Linked catalogue topics (opens the lesson) |
| Steps | 3–8 numbered steps of 10–30 min, each with instructions; a code sketch where it helps (in the student's stack) |
| Hints | 1–3 per stage, revealed one at a time ("Show hint 1"), so help is optional |
| Acceptance checklist | 3–6 testable criteria ("POST /applications returns 201 with the created row") that the student ticks |
| Repo check (optional) | Machine-checkable rules: required files or paths, commits after the stage started, README sections |
| Self-check questions | 2–3 "explain why" questions that prepare for interviews |
| Commit suggestion | e.g. `feat: add applications CRUD` |
| Resources | Link-checked resource ids only |

**Example stage (illustrative only; real content will come from your references):**
*Placement Tracker API, stage 2 of 8: "Applications CRUD" (~2 h)*
1. Create the `Application` model: company, role, status (enum), applied_on, notes.
2. Add a migration and run it.
3. Implement `GET /applications` and `POST /applications` with validation.
4. Implement `PATCH /applications/:id` and `DELETE /applications/:id`.
5. Add 4 tests (one per route).

Hint 1: validate the body before touching the database. Hint 2: return 404 for an unknown id, not 500.
Acceptance: all routes respond as specified; invalid status → 400; tests pass; README lists the routes.
Repo check: `src/**/application*`, `tests/**`, a README containing "## API", ≥ 1 commit after the stage start.

### 10.4 Verification levels

| Level | How | Cost | When |
|---|---|---|---|
| L0 Checklist | Student ticks acceptance criteria | none | Phase 5, every project |
| L1 Repo check | Main process reads the **public** GitHub repo with the GitHub REST API (no token, 60 requests/hour from the student's IP): repo exists, commits after the stage start, required paths exist, README sections | none | Phase 5 |
| L2 Starter repo + tests | For 3–5 flagship projects, a public starter template with a test suite per stage (CodeCrafters style). The student runs `npm test -- stage-3`, or GitHub Actions runs it and the app reads the check status | content work | Phase 6 |
| L3 AI review | Pro/Max: the app sends selected repo files (size-capped) and the stage criteria to ai-proxy `project_review`, which returns pass / needs work per criterion with feedback | AI quota | Phase 6 |

### 10.5 Finishing a project
- A **README template** filled with the student's project name, stack and the features they ticked.
- A **deploy checklist** for the stack (Vercel, Render, Railway and similar free tiers; text only).
- A **resume bullet builder**: verbs and structure are suggested, but any number (users, latency, records) must be
  typed by the student, otherwise the bullet has no number. One click adds it to the profile's resume answers.
- **Interview questions** about the project (from the stages' self-check questions).
- `stage_done` and `project_done` events add mastery evidence to the project's skills, which feeds readiness and
  job match.

---

## 11. AI-generated projects

### 11.1 First library batch, from your references (Phase 5)
1. You send references (section 20): links, a list of ideas, example projects you like, or the format you prefer.
2. I draft each project in the stage format (section 10.3) into `packages/learning/scripts/seed-source/projects/`.
   The text is original; references are used for ideas and structure, never copied. Each draft has `ai_drafted: true`,
   `status: draft` and a `source_reference` note.
3. A build check validates it: zod schema, stage and step counts, minutes, resource ids exist, no URLs in body text,
   repo-check rules are well formed.
4. You review in Admin → Content (new editors for projects and stages) and publish. Until published, drafts show with
   an "AI-drafted, under review" label (decision 19.8).
5. Suggested launch size: **24 projects** (3 per role family × 8), or **12** if we start with the SDE roles only.

### 11.2 In-app "Generate a project from my idea" (Phase 6, Pro/Max)
The student describes an idea, stack and level. ai-proxy `project_generate` returns the same stage schema. The app
validates it and saves it as a **private** project labelled "AI-generated for you, not reviewed". It has no
resource links, only catalogue topic links. Admins can promote a good one into the library after review.

---

## 12. Content catalogue (the biggest piece of work)

### 12.1 Modules by stream

| Stream | Modules | Topics (approx.) |
|---|---|---|
| Language (pick one) | C++ for DSA · Java for DSA · Python for DSA (STL / Collections / built-ins) | 10 each |
| DSA (18) | Basics & complexity · Arrays · Hashing · Strings · Two pointers & sliding window · Binary search · Sorting · Recursion & backtracking · Linked list · Stack & queue (monotonic) · Trees · BST · Heaps · Greedy · Graphs (BFS/DFS, topo, shortest paths, MST, DSU) · DP (1D, grid, subsequences, strings, LIS, partitions, stocks) · Tries · Bits & math | ~140 |
| Core CS (5) | OOP · DBMS + SQL · Operating Systems · Computer Networks · System design basics (LLD + intro HLD) | ~60 |
| Aptitude (3) | Quant · Logical reasoning · Verbal | ~30 |
| Dev: Frontend (8) | HTML/CSS · JavaScript · TypeScript · React · State & data fetching · Testing · Performance & a11y · Deploy | ~60 |
| Dev: Backend (8) | Node/Express **or** Java/Spring Boot **or** Python/Django · REST · Databases & ORM · Auth · Caching & queues · Testing · Docker basics · Deploy | ~60 |
| Dev: Full-stack | A subset of Frontend + Backend chosen by the planner | — |
| Dev: DevOps (8) | Linux · Git · Networking · Docker · CI/CD · Cloud (AWS basics) · Kubernetes · IaC & monitoring | ~60 |
| Dev: Data Analyst (7) | Excel · SQL · Python & pandas · Statistics · Visualisation · Power BI/Tableau · Case studies | ~50 |
| Dev: Data/ML (8) | Math for ML · Python stack · Classical ML · Evaluation · Deep learning · NLP or CV · MLOps basics · Case studies | ~60 |
| Dev: Product (6) | Product sense · Metrics · PRDs · Prioritisation · Case interviews · Tools | ~35 |
| Dev: Design (6) | Fundamentals · Figma · UX research · UI patterns · Prototyping · Portfolio | ~35 |
| Interview (2) | Resume & projects · HR / behavioural, OA strategy, mock interviews | ~15 |

**Total: about 85 modules, 650 topics, 2,600 tasks**, about 400 curated DSA problems + 81 SQL, about 500 CS MCQs,
about 600 aptitude items, and 24 projects.

### 12.2 What each topic needs
A short lesson (summary, key points, **no URLs**; the current `Lesson` shape), 1–3 resources (real free sources
such as MDN, freeCodeCamp, CS50, NPTEL, GeeksforGeeks and known YouTube teachers; all link-checked), the task list
with minutes, a quiz (3–5 items) and, for DSA and SQL, the problem refs. Tasks are mostly templated from these
parts, so authoring effort goes into lessons, quizzes and curation.

### 12.3 Production pipeline
1. Outline: module and topic list per stream, with prerequisites and hours. You skim it, about 1 page per stream.
2. Draft per module (AI-drafted in session, as with the current seed), stored as TypeScript seed sources in
   `packages/learning/scripts/seed-source/` and built into the bundle.
3. Checks: zod schemas, ids unique, prerequisites acyclic, problem refs exist in the dataset, paid-only problems
   kept out of must/good, hour totals within 10% of the module estimate, no URLs in lesson text, link checker over
   resources.
4. Seed SQL for Supabase content tables, using the same dollar-quoted paste files as today.
5. Review and publish in Admin. Order: DSA → core CS → aptitude → Full-stack/Frontend/Backend → other roles.

---

## 13. Screens

Learn tab navigation: **Today · Roadmap · Projects · Progress**, plus the intake and roadmap review flows.

1. **Intake**: the 5 steps from section 6, with the live feasibility bar.
2. **Generating**: a progress state; it can be cancelled.
3. **Roadmap review**: summary, timeline by week, module cards (hours, emphasis, why), "Left out" list, project
   picks, edit controls, Regenerate with a note, Accept.
4. **Today**: "Day 16 of 84 · Tue 20 Oct · 60 min planned", task list grouped by stream, each task with its
   time, a checkbox and an Open button (lesson, problem link, quiz, project step). Behind/ahead banner, streak,
   "Do more today", "Can't study today" (moves the day).
5. **Week**: 7 columns with each day's tasks and minutes. "Move to…" menu per task (works from the keyboard),
   with buffer, revision and mock days marked.
6. **Roadmap (module tree)**: stream filter. Module → topics → tasks accordion with progress bars, hours left and
   the expected finish date per module.
7. **Topic page**: lesson, resources, named problem table (difficulty, company count, "On Amazon's list", status,
   notes, open), quiz, "I already know this" test-out (the existing placement flow).
8. **Project Library**: filters, cards, search.
9. **Project page**: brief, prerequisites, stages overview, Start / Add to roadmap.
10. **Guided build**: stage stepper on the left. On the right: goal, numbered steps with ticks, hints revealed one
    at a time, acceptance checklist, repo URL + "Check repo", self-check questions, "Mark stage done". The final
    stage adds the README, deploy, resume bullets and interview questions.
11. **Progress**: readiness by module and stream, problems by difficulty and topic, hours done vs planned, on-track
    forecast, the existing heatmap.
12. **Adjust roadmap**: free-text box → diff preview → Accept.
13. **Admin**: editors for modules, topics, tasks and projects/stages (reusing the versioned content editor), and an
    AI-draft review queue.

```
┌ Today ─────────────────────────────── Day 16 of 84 · Tue 20 Oct · 60 min ┐
│ ⚠ 1 task moved from yesterday                                              │
│ DSA · Sliding window                                                      │
│  [ ] Solve  Longest Repeating Character Replacement   Medium · 40m  Open ↗ │
│  [ ] Quiz   Sliding window check                       10m           Start │
│ Revise                                                                    │
│  [ ] 2 review cards                                    10m           Start │
│ ─────────────────────────────────────────────────────────────────────── │
│ Streak 6 · On track · finish 27 Dec       [Do more today] [Can't today]   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Data model and code changes

### 14.1 Content types (`packages/learning/src/types.ts`, zod)
```ts
LearnModule  { id, title, summary, stream, role_families[], level 1–5, prerequisites: {module_id, kind: hard|soft}[],
               skill_ids[], hours: {light, standard, deep}, status, version, ai_drafted }
LearnTopic   { id, module_id, order, title, summary, tier: core|standard|optional, minutes, skill_ids[], lesson_id }
TopicTask    { id, topic_id, order, kind: learn|solve|quiz|build|revise|mock|read, title, minutes,
               resource_ids[], problem_ref?: 'lc:<slug>', problem_tier?: must|good|stretch,
               practice_item_ids[], optional }
Project      { id, slug, title, pitch, role_families[], level: beginner|intermediate|advanced, hours,
               skill_ids[], stacks[], prerequisites: module_id[], stages: ProjectStage[], finish: {...},
               status, version, ai_drafted, source_reference? }
ProjectStage { id, order, title, goal, topic_ids[], steps: {title, detail_md, minutes}[], hints[],
               acceptance: {id, text}[], repo_rules?: {paths[], readme_sections[], min_commits}, self_check[],
               commit_suggestion, resource_ids[] }
```
`ContentBundleSchema` gains `modules`, `topics`, `tasks` and `projects`. Skills, lessons, practice items and
resources stay. Lessons become per-topic (about 650) instead of per-skill.

### 14.2 Student state
```ts
Roadmap      { id, track_id(role), intake: Intake, source: 'ai'|'rules', summary, streams,
               modules: {module_id, emphasis, skip_topics[], why, custom?}[], projects: {project_id, after_module}[],
               warnings[], created_at, accepted_at, version }
Schedule     { roadmap_id, generated_at, pace_factor, days: ScheduleDay[] }      // past days frozen
UserProject  { project_id, status, repo_url?, started_at, stage_progress }       // progress also comes from events
```
New `LearningEvent` types: `task_done`, `task_skipped`, `task_moved`, `problem_attempted`, `stage_done`,
`project_started`, `project_done`, `roadmap_accepted`. The existing `problem_solved`, `quiz_*` and `review_done`
are reused. Events stay the source of truth for progress, and mastery rules gain task, stage and project evidence.

### 14.3 Pure engine modules (new, in `packages/learning/src/`)
`catalog.ts` (lookups, topo order) · `intake.ts` (feasibility) · `roadmap.ts` (rules planner, AI-output validation
and repair, diff apply) · `scheduler.ts` (packing, reserves, buffers, re-plan, pace factor) · `problems.ts` (tier
selection, company boost, dedup) · `projects.ts` (stage progress, repo-rule evaluation input) · `progressV2.ts`
(module and stream readiness, forecast). All of them are deterministic and get heavy unit tests (target 150+).

### 14.4 Desktop
- **Local SQLite** (new `LOCAL_MIGRATIONS` entries 9+): `learn_roadmaps`, `learn_schedule_days`, `learn_projects`
  (repo URL, notes), `learn_problem_notes`, plus outbox rows for sync. Old v1 track rows are cleared (there are no
  users).
- **Main services**: `services/learning-v2.ts` (roadmap CRUD, schedule persistence, sync),
  `services/github-check.ts` (public repo checks with timeouts and rate-limit handling), and `ai-proxy.ts` gains the
  new kinds.
- **IPC** (zod in `ipc/schemas.ts`; update `shared/ipc.ts`, `preload.ts`, `renderer/types.ts`, the channel count
  test): `learnRoadmapGet`, `learnRoadmapGenerate`, `learnRoadmapAccept`, `learnRoadmapAdjust`,
  `learnScheduleReplan`, `learnProjectSave`, `learnProjectCheckRepo`, `learnProblemNoteSave`; Phase 6 adds
  `learnProjectReview` and `learnProjectGenerate`. Events keep using `learningRecordEvents`.
- **Renderer**: `features/learn/` is rebuilt (intake, roadmapReview, today, week, roadmapTree, topic, progress), with
  a new `features/projects/` (library, detail, guidedBuild), each as a logic module + data hook + small components,
  following the feature-folder convention.

### 14.5 Supabase (next migration is 027)
- **027 Learn v2 content**: `learn_modules`, `learn_topics`, `learn_tasks`, `learn_projects`, `learn_project_stages`.
  RLS gives read-only access to published rows (like current content), with admin edit RPCs and `content_versions`
  history.
- **028 Learn v2 student state**: `user_roadmaps`, `user_schedules` (jsonb days), `user_projects`; new event types
  allowed in `learning_record_events`; session-checked RPCs `learning_save_roadmap`, `learning_pull_roadmap`,
  `learning_save_schedule`, `learning_save_project` (granted explicitly and added to the allow-list).
- **029 AI kinds**: metrics and limits for `roadmap_plan`, `roadmap_adjust`, `project_generate` and
  `project_review` in `ai_limits()`. `plans.ts` gains the matching fields, and the parity test is extended.
- `ai-proxy/core.ts`: prompt, JSON schema, input parse and output checks for each new kind. The Edge Function is
  redeployed.

---

## 15. Plans and limits (proposal; prices unchanged)

| | Free | Pro ₹249 | Max ₹599 |
|---|---|---|---|
| Active roadmaps | 1 | unlimited | unlimited |
| AI roadmap generations / day | 2 | 10 | 20 |
| AI roadmap adjustments / day | 2 | 15 | 40 |
| Rules planner, day plan, re-plan | ✓ | ✓ | ✓ |
| DSA/SQL problem lists (external links) | ✓ full | ✓ | ✓ |
| In-app quiz/practice items per day | 10 (as today) | unlimited | unlimited |
| Company boost in problem picks | — | ✓ | ✓ |
| Project Library | Beginner projects, 1 active | all, 3 active | all, unlimited |
| GitHub repo check | ✓ | ✓ | ✓ |
| AI project generation / day | — | 3 | 10 |
| AI stage review / day | — | 10 | 40 |

Free stays useful (a full AI roadmap and a full day plan). The paid value is depth, projects and AI help.

---

## 16. What happens to Learn v1

There are no alpha users, so v1 is **replaced outright**. Removed: `PathScreen`, `GoalSetup`, the v1 `planTrack`
week planner (its horizon and daily-hours types) and v1-only logic in `learnLogic.ts`. Kept and reused: the skill
graph, SM-2, the event log and mastery, streaks, `ActivityHeatmap`, `QuizForm`, the lesson renderer, readiness,
`jobMatch` and `tagSkills`. The onboarding roadmap step switches to the short intake.

---

## 17. Build phases (each phase ends with typecheck, tests, build, a packaged app and a push to `main`)

| Phase | Delivers | Size |
|---|---|---|
| **1. Engine** | New zod types; catalogue format; scheduler (packing, reserves, buffers, mocks, over-budget trimming, re-plan, pace factor); feasibility; problem picker; rules planner; AI-output validator and diff apply. 150+ unit tests. No UI change yet. | M |
| **2. Core content I** | Outlines for every stream (for your skim). Full DSA (18 modules, ~140 topics, ~400 problems with paid-only check), language modules, OOP/DBMS+SQL/OS/CN lessons + MCQs. Validation scripts. | L |
| **3. AI roadmap** | Intake UI, ai-proxy `roadmap_plan` + `roadmap_adjust`, migrations 027–029, `plans.ts` limits, roadmap review screen, fallback path, onboarding step. | M |
| **4. Daily learning UI** | Today, Week, Roadmap tree, Topic page, Progress; v1 removed; local migrations; sync RPCs; packaged smoke test over CDP. | L |
| **5. Projects** | Project Library, project page, guided build, L0 checklist + L1 GitHub repo check, finish outputs; first batch of projects from **your references**; admin editors and review queue. | L |
| **6. AI projects + rest of content** | `project_generate` and `project_review`; aptitude bank; remaining role tracks; L2 starter repos for 3–5 flagship projects; published-content pull from Supabase so content updates don't need an app release. | L |

Phases 1 and 2 can run in parallel. A usable product exists after Phase 4 (DSA + core CS + Full-stack day plans).
Projects follow in Phase 5.

**Testing per phase:** unit tests for every pure module; component tests for each screen (loading, empty, error,
keyboard); IPC schema tests; SQL rehearsal on local PostgreSQL before applying migrations; an ai-proxy test with a
fake provider for each new kind (valid, invalid, oversized and URL-containing outputs); a packaged-app smoke test.

---

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Content volume (~650 topics) and review load | Phase it (DSA + core CS first); templated tasks; strict build checks; show drafts with an "under review" label |
| Time estimates wrong | Personal pace factor after 10 tasks; buffer days; one-click re-plan |
| AI returns poor or invalid plans | Catalogue-only ids, repair rules, deterministic scheduler, rules fallback, quota refund on failure |
| LeetCode paid-only or changed problems | Offline paid-only check; link checker; problems are refs, so swapping one is a data change |
| Students fall behind and quit | Buffer days, small tasks, "Can't study today", honest options when behind, streak only counts study days |
| AI cost | Flash model with thinking off; module-level output (not task-level); daily limits per plan |
| GitHub API limits | 60 requests/hour per IP is enough for manual checks; cache results; clear error when limited |
| Copyright from references | Original text only; references used for ideas and structure; no copying from paid courses |

---

## 19. Decisions I need from you (my recommendation first)

1. **AI roadmap style.** *Recommended:* AI picks and orders from the reviewed catalogue, with up to 3 custom modules.
   Alternative: fully free-form AI roadmaps (roadmap.sh style), which are faster to build but cannot guarantee real
   problems or links.
2. **Streams for SDE roles.** *Recommended:* DSA + core CS + dev + aptitude (aptitude on for campus aims only).
3. **DSA languages.** *Recommended:* C++, Java and Python at launch; JavaScript later.
4. **Problem sources.** *Recommended:* LeetCode dataset only at launch (real links already in the app). GeeksforGeeks
   or Codeforces would need curated links.
5. **Weekly time input.** *Recommended:* two sliders (weekday and weekend minutes) plus study-day chips.
   Alternative: one hours/week number.
6. **LeetCode username sync.** *Recommended:* later (Phase 6+), self-report first.
7. **Project verification.** *Recommended:* checklist + GitHub repo check in Phase 5; AI review and test-backed
   starter repos in Phase 6.
8. **Draft content visibility.** *Recommended:* show AI-drafted content with an "under review" label (as today) so
   the app is usable before every lesson is reviewed. Alternative: show only published content.
9. **Free plan gating.** *Recommended:* the table in section 15.
10. **Launch project count.** *Recommended:* 12 SDE projects first (Frontend, Backend, Full-stack, DevOps), then 12
    for the other roles.
11. **Replace v1 outright.** *Recommended:* yes (no users to migrate).

---

## 20. What I need you to send

- **Project references**, in any form: links (roadmap.sh projects, GitHub repos, blog posts, YouTube build-alongs),
  a list of project ideas, or one or two "I want them to look like this" examples. For each, tell me if it is
  "must include" or "inspiration only".
- Optional: any DSA sheet or course you want the curation to feel like (we build our own list from our data;
  this only guides depth and order), and any companies or college placement patterns you want covered first.
