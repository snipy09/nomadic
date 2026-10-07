# Home feed, company follows and notifications: step-wise plan

Status: plan (7 Oct 2026). Nothing here is built yet. Next free Supabase migration: 031.

## 0. Scope and assumptions

- **Goal**: Home becomes a feed of hiring news and events ("Google opens SDE roles this weekend", "Oracle hiring
  Nov–Jan for x roles", "XYZ hackathon in Bengaluru on 14 Nov"), people like and follow companies to get more about
  them, and a notification module (feed + Learn) delivers 20+ items a day.
- **Surfaces**: one shared engine (data, ranking, notifications) used by the desktop Home and the phone app
  (`apps/mobile`, Capacitor, Android first, iOS-style UI). The desktop Home keeps the "Get set up" checklist as a
  collapsible card above the feed.
- **Apply is out of scope.** No apply engine work in this plan. On the phone every job card shows
  **"Auto apply from desktop"**: tapping it adds the job to a synced "Apply on desktop" queue (a tracker row with
  status `queued_desktop`); the desktop shows the queue on Home and runs the existing apply-with-review there.
  `packages/capacitor-apply-browser` stays unused by the phone app for now.
- **No invented data** (product rule). Every feed item has a `source_url`, `source_name` and `verified_at`. Dates,
  roles and cities come only from the source; unknown stays unknown ("Dates not announced"). "This weekend" appears
  only when the source gives the date.

## 1. Facts the plan is built on

- Notification fatigue: 3–6 pushes a week make ~40% of users turn push off, 1 a week ~10%
  ([Braze](https://www.braze.com/blog/opt-out-of-push-notifications-why-users-do-it/),
  [Business of Apps](https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/)).
  Android opt-in median is ~81% vs iOS ~51%. **So 20+ a day must mean 20+ inbox items, not 20+ phone pushes.**
  Pushes are capped (default 4/day, the user can raise it to 10 or lower it to 0) and the rest are bundled.
- Data volume: only **328 active jobs** are live (4 Oct run) and the scheduled scraper is blocked on missing GitHub
  secrets. 20 relevant items a day per user is not reachable without daily scraping plus event sources. Step 1 fixes
  the supply first.
- Hackathon sources: Devfolio, Unstop, MLH, Devpost and HackerEarth list India events; none offers a documented
  public API for third parties (an Apify aggregator scrapes all six). Use their public listing pages or feeds only
  where their terms allow, and an admin curation queue for the rest.
- One device: `register_device_session` keeps one active device. A phone sign-in would sign the desktop out. This
  must change before the phone app ships (step 7).

## 2. Feed item types

| Type | Example | Source | Expiry |
|---|---|---|---|
| `hiring_burst` | "Google posted 14 SDE / SWE intern roles in the last 48 h" | computed from `jobs` (count by company + role family) | 7 days |
| `hiring_window` | "Oracle hiring Nov 2026 – Jan 2027 for Associate SE, QA" | company careers / campus pages, admin-reviewed | window end |
| `drive_opens` | "Amazon SDE-1 applications open Sat 10 Oct" | careers page with a date, admin-reviewed | open date + 7 d |
| `hackathon` | "HackXYZ, Bengaluru, 14–15 Nov, register by 5 Nov" | Devfolio / Unstop / MLH / Devpost / HackerEarth, admin queue | end date |
| `deadline` | "Registration for HackXYZ closes tomorrow" | derived from a saved item | deadline |
| `learning` | "Day 12: Prefix sums, 3 tasks, 9 reviews due" | Learn v2 state (local) | end of day |
| `tracker` | "Follow up with Razorpay today" | tracker follow-ups | end of day |

`hiring_burst` items are pure aggregation of real rows, so they need no review. Every other server item goes through
the existing Admin content screen (`draft → published`, versions, audit log) before anyone sees it.

## 3. Steps

Each step ends green: `npx tsc --noEmit -p apps/desktop`, `npm test`, desktop build. Sizes: S ≈ 1–2 days, M ≈ 3–5,
L ≈ 1–2 weeks (solo).

### Step 1. Data supply (M) — scraper built 7 Oct 2026
Built: `packages/scrapers/src/feed` + migration 031 (`companies`, `company_openings`, `company_hiring_snapshots`,
`hackathons`); see `docs/SCRAPER_LAPTOP.md` "Feed". Left: first live run on the laptop, fix failing boards, admin
form for hiring windows. The original notes for this step follow.
- Owner: set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` repo secrets so `scrape.yml` runs daily. Without it the
  feed is thin; this is the main blocker.
- Add company identity: `companies` table (031): `slug`, `name`, `domain`, `logo_url`, `careers_url`, `hq_city`,
  `about` (from the company's own page, nullable). Backfill from `jobs.company` with a normaliser in
  `packages/scrapers/src/pipeline/` (strip "Pvt Ltd", aliases like "Amazon Development Centre" → amazon); jobs get
  `company_slug`.
- New `packages/scrapers/src/events/` pipeline (same shape as `contacts/`): sources `devfolio`, `unstop`, `mlh`,
  `devpost`, `hackerearth`; zod `EventSchema` (title, organiser, city or `online`, start, end, reg_deadline, url,
  eligibility, prize text as given); dedupe by url + title hash; writes `events` with `status='draft'`. Check each
  site's terms before enabling it; drop any source that forbids it.
- Hiring windows: no reliable automatic source. Admin form "Add hiring window" (company, roles, start, end, source
  link required). Optional helper: a careers-page watcher that flags changes for review, never publishes alone.
- Tests: normaliser fixtures, event parser fixtures per source, "no row without source_url" check.

### Step 2. Feed backend (M)
- 032 `feed_items`: `id`, `type`, `company_slug?`, `event_id?`, `title`, `body`, `roles text[]`, `city?`,
  `starts_at?`, `ends_at?`, `source_url`, `source_name`, `verified_at`, `status`, `expires_at`, `created_at`.
  RLS: read published, unexpired only (like active jobs). Writes service role / admin RPCs only.
- `hiring_burst` generator: SQL function run by `pg_cron` every 3 h over `jobs` (≥ 5 new roles for one company in
  48 h, grouped by role family from the skill catalogue). Idempotent per company per day.
- Client RPC `feed_page(session…, cursor, filter)` returns items + the user's like/save state; session-checked,
  added to the allow-list (section 5 of CLAUDE.md).
- Ranking (pure, in `packages/learning` or a new `packages/feed`, unit-tested): score = followed company (+3) +
  role match with the user's target role (+2) + city match (+1) + skill match (from `features/feed/match.ts`) +
  freshness decay (half-life 48 h) + deadline soon (+2 within 72 h); hide expired and hidden. Deterministic, no AI.

### Step 3. Likes, saves, follows and company pages (M)
- 033 `user_company_follows` (follow = "save company", drives alerts), `user_feed_reactions` (`like` on an item,
  `save` on an item), RPCs `feed_react`, `company_follow`, `company_unfollow`, `follows_pull`. Synced like 026
  (union on pull, local-only uploaded).
- Like is a light signal (+1 ranking for that company and type). Follow is explicit: more items, alerts, company page.
- Company page: header (logo, name, careers link), "Open roles" (live jobs with match %), "Hiring windows" (past and
  upcoming, with sources), "Events" (hackathons they host or sponsor), "Prepare" (Learn topics and LeetCode problems
  tagged with the company from the existing ~1,800 company problems), followers count only if ≥ 20 (privacy).
  Fields with no data are not shown.
- Onboarding: one new page "Pick companies to follow" (search + 12 suggestions by target role), skippable.

### Step 4. Home feed UI on desktop (M)
- `features/home/`: `FeedList`, `FeedCard` (one per type), `feedLogic.ts`, `useFeed.ts` (paged, stale-safe,
  optimistic like/save with rollback). Segments: **For you / Following / Hackathons / Saved**.
- Card actions: Like, Save, Hide ("Not interested"), Open source, Add to calendar (`.ics` for events and windows).
- Checklist becomes a collapsible card; today's learning and due follow-ups stay as the first two cards.
- States: skeleton, empty ("Follow a few companies to fill your feed" + button), error with Retry, offline cache.
- Keyboard: J/K move, L like, S save, H hide, Enter open; works at 1024 px.

### Step 5. Notification module (L)
- 034 `notifications` (`user_id`, `kind`, `feed_item_id?`, `title`, `body`, `deep_link`, `priority 0–2`,
  `created_at`, `read_at`, `pushed_at`), `notification_prefs` (per kind on/off, push cap/day, quiet hours, digest
  time), `push_tokens` (device, platform, token). RPCs: `notif_pull`, `notif_mark_read`, `notif_prefs_set`,
  `push_token_register`.
- Kinds and expected daily volume for an active user who follows ~8 companies:

  | Kind | Per day |
  |---|---|
  | New matching roles at followed companies (bundled per company) | 4–8 |
  | Hiring window / drive opens or closes in 3 days | 1–3 |
  | Hackathon in your city / registration closes | 1–3 |
  | Learn: today's plan (morning), reviews due, streak at risk (evening), quiz result | 3–4 |
  | Tracker: follow-ups due, status changes | 1–3 |
  | Weekly-ish: projects nudge, roadmap re-plan suggestion | 0–1 |
  | **Total inbox** | **~12–22**, 20+ for heavy followers |

  If supply runs dry, do not pad with filler; 20+ depends on step 1.
- Generator: Edge Function `notify-build` on `pg_cron` every 30 min creates rows from new feed items and follows;
  Learn and tracker notifications are built **locally** from local state (Learn state lives on the device) so they
  work without a server round trip.
- Delivery rules (pure, unit-tested `notificationPolicy.ts`): priority 2 (deadline < 24 h, drive opens today) may
  push; priority 1 pushes until the daily cap; priority 0 inbox only. Quiet hours 22:00–08:00 IST by default. Same
  company within 2 h → one bundled push ("Google: 6 new roles"). Max 1 Learn push in the morning, 1 in the evening.
- Channels: in-app inbox (bell in the sidebar with a count; iOS-style grouped stacks by day and company), desktop OS
  notifications via Electron `Notification` (this also closes the "OS notification for due follow-ups" follow-up),
  phone push in step 7. Optional daily digest email via Resend (needs owner action 5, `email_from`).
- Settings → Notifications: per-kind toggles, push cap slider, quiet hours, digest time, "Send a test".
- Telemetry (opt-in only): opened/dismissed per kind, to tune caps. No third-party trackers.

### Step 6. iOS-inspired UI pass (S–M)
Desktop already uses the Apple design language (1.4.0). For the feed, inbox and phone app follow Apple HIG:
- Large titles that collapse on scroll; grouped inset lists; segmented control for feed filters.
- Cards: 16 px radius, system grey fills, one accent colour, no gradients or glass (anti-slop rule).
- Swipe actions on list rows (right: Save, left: Hide), long-press context menu (Like, Follow company, Share, Hide).
- Bottom sheets with medium/large detents for item details and filters (phone); drawer on desktop.
- Phone tab bar: **Home, Learn, Jobs, Tracker, Inbox**; Profile behind the avatar in the large title.
- Haptics (`@capacitor/haptics`) on like/save/follow; `prefers-reduced-motion` respected; 44 pt touch targets;
  Dynamic Type via rem sizes; dark mode from the system.
- Reuse `@nomadic/ui` tokens; add `SegmentedControl`, `SwipeRow`, `Sheet`, `LargeTitleHeader`, `InboxStack` there with
  tests.

### Step 7. Phone app shell (L)
- Owner decision first: change the one-device rule to **one desktop + one phone** (`register_device_session` keyed by
  platform). New migration; security checklist updated.
- `apps/mobile`: Capacitor 8, reuses the renderer. The renderer calls `window.api` (Electron main) today, so add
  `MobileApi` implementing `NomadicApi` directly over Supabase RPCs, with local storage (IndexedDB) for Learn state
  and the notification cache. Channels the phone does not need (apply, outreach SMTP, browser sign-ins) return a
  typed "Available on desktop" error and the UI shows **"Auto apply from desktop"**.
- Push: Firebase Cloud Messaging via `@capacitor/push-notifications`; Android 13+ asks `POST_NOTIFICATIONS` after the
  user follows their first company (not at launch: asking in context gets higher opt-in). FCM service-account key in
  Vault; Edge Function `notify-push` sends via FCM HTTP v1. iOS later (APNs needs an Apple developer account).
- Build/test in CI only (assistant containers cannot reach dl.google.com): extend `android-apply.yml` into an
  `android-app.yml` that builds the APK and runs a smoke test on the emulator.
- Billing decision before Play Store: Play Billing vs user choice billing for Pro/Max (open, see ANDROID_APPLY.md).

### Step 8. Plans and limits (S)
- Feed, follows and inbox are free (they drive retention). Limits in `packages/config/src/plans.ts` only: Free
  follows 10 companies, Pro 50, Max unlimited; push cap is user-controlled on every plan. SQL copies parity-tested.

### Step 9. Launch checklist (S)
- Owner pastes 031–035, sets FCM key in Vault, deploys `notify-build` / `notify-push`.
- Seed: 50 companies with careers URLs, 20 hiring windows, current hackathons, all reviewed in Admin.
- Live check with the owner account only: follow 8 companies, confirm 12+ inbox items in 24 h, push cap held, quiet
  hours held, no item without a source link.
- Update CLAUDE.md, `docs/FEATURES.md`, `docs/DECISIONS.md`, web copy (`site.test.ts` product claims).

## 4. Order and dependencies

1 → 2 → 3 → 4 gives a working desktop feed. 5 can start after 2 (local Learn/tracker notifications need nothing from
the server). 6 runs alongside 4. 7 needs the device-rule decision and 5. Rough total: 8–11 weeks solo.

## 5. Risks

- **Thin data** (biggest): no daily scraping = empty feed and no 20/day. Fix step 1 first.
- **Scraping terms**: event sites may forbid scraping; fall back to admin curation, never to guessed data.
- **Push fatigue**: the research above says heavy pushing loses ~40% of push users; keep caps and bundling.
- **Hiring windows go stale**: every window shows its source and "verified on" date; expired ones disappear.
- **Free Supabase plan**: pg_cron every 30 min and Edge Function calls fit the free quota for early users; recheck
  at ~1,000 daily users.
