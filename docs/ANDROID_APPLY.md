# Apply with review on Android

Status (6 Oct 2026): engine, agent and Capacitor plugin are built and tested. The Android app shell
(`apps/mobile`, Capacitor) does not exist yet. When it does, it uses the API below; nothing in the
apply path has to be rebuilt.

## Why not the desktop approach

Desktop apply drives the user's Chrome with Playwright. Android has no Playwright and no way for an
app to automate Chrome. The app therefore loads the application page in **its own WebView** and
runs a small script (the *agent*) inside every frame of that page. The engine logic stays in the
app and talks to the agent through messages.

```
App JS (Capacitor WebView)                      Apply WebView (ApplyBrowserController)
  fillApplication / submitReviewed                every frame: nomadicBridge + agent (document start)
  shared core (core.ts) + RemoteDriver              scan / write / verify / walls / click
  AgentChannel ── postMessage(frameId, req) ──▶     JavaScriptReplyProxy ─▶ agent
               ◀── 'message' events (JSON) ───     WebMessageListener ◀─ agent replies
```

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Shared core | `packages/form-engine/src/core.ts` | walls → read → classify → answer → write → verify/retry → report; submit gate; review edits (`applyReviewedValues`, `outcomeKey`). Desktop `FormEngine` runs on it too. |
| Agent | `packages/form-engine/src/agent/` | In-page scanner (`scan.ts`, same as desktop's reader), writers for every field kind with user-like DOM input (`input.ts`, `writers.ts`), shared page checks (`inpage.ts`), message handling (`agent.ts`). Built into `bundle.generated.ts` (`npm run build:agent -w @job-automator/form-engine`; a test fails when it is stale). |
| ATS steps | `packages/form-engine/src/adapters.ts` | How to open the form on Ashby, Greenhouse, Lever, Internshala, Workday and generic pages. Data, used by desktop and Android. |
| Remote engine | `packages/form-engine/src/remote/` | `AgentChannel` (frames, routing, timeouts, frame-gone handling), `RemoteDriver`, `fillApplication`, `submitReviewed`. Browser-safe entry: `remote/index.ts`. |
| Plugin | `packages/capacitor-apply-browser/` | Capacitor 8 plugin `ApplyBrowser`: Java `ApplyBrowserController` (WebView, injection, bridge) + `ApplyBrowserPlugin`; TS wrapper `openApplyBrowser`, `pluginTransport`. |

## Using it in the app

```ts
import { ApplyBrowser, openApplyBrowser } from '@nomadic/capacitor-apply-browser';
import { fillApplication, submitReviewed } from '@job-automator/form-engine/src/remote';

const session = await openApplyBrowser(ApplyBrowser, job.url, { title: job.company });
const result = await fillApplication(session.channel, {
  profile,                       // MasterProfile from the account
  ctx: { jobTitle: job.title, company: job.company },
  llm: aiProxyFormAnswers,       // FormAnswerClient over ai-proxy `form_answers` (null = no model)
  cache,                         // remembered answers
  resolveResume: (p) => p.resumes?.find((r) => r.isDefault)?.filePath ?? null,
  loadFile: (ref) => readResumeAsBase64(ref),
  onEvent,                       // live field events for the progress screen
});
// result.status: ready | needs_user | login | captcha | email_verification | no_form | cancelled | error
await ApplyBrowser.hide();                       // review screen: every field, its source, edits
// ... the candidate edits and ticks "I reviewed this"
await ApplyBrowser.show();                       // they see the submission (and any CAPTCHA)
const sent = await submitReviewed(result.handle!, overrides, { reviewed: true });
await session.close();
```

- Fill **while the WebView is shown** (`open` shows it). Hidden pages get throttled timers, which
  would slow every write.
- `login`, `captcha` or `email_verification`: show the WebView, let the candidate clear it, then
  call `fillApplication` again on the same session.
- `blocked` event with `google_sign_in`: Google refuses OAuth inside embedded WebViews. Tell the
  candidate to use email sign-in on that portal, or open the job in Chrome (no autofill there).
- `closed` with `crashed`: the page's renderer died; the app keeps running. Open and fill again.
- Quotas: call the server's `consume_apply_quota` right before `submitReviewed`, as on desktop.

## Rules kept from desktop

- Nothing is submitted without review: `submitReviewed` refuses unless `reviewed === true`, writes
  the candidate's edits first, re-checks walls and required fields on the live page, and refuses
  rather than guesses.
- No invented data: the same answerer, policy and classifier as desktop. Question fingerprints are
  identical (pure SHA-1 matches Node `crypto`), so remembered answers carry over.
- The page only gets what it needs: each frame receives requests about its own fields, and the
  resume file only goes with the write for the upload field that asked for it.

## Security notes

- Bridge object and agent are visible to the page's own scripts. That is acceptable: they can
  only act on that page's own form. Frame ids are random and bound to the frame that announced
  them (the controller drops messages for an id from a different frame); which frame is the top
  one comes from the WebView, not from the page.
- The agent uses no `eval`, `new Function` or inline scripts (checked when bundling) and works
  under a CSP without `unsafe-eval` (tested). It captures native setters at document start, before
  page scripts can patch them.
- The WebView: no file or content access, no mixed content, Safe Browsing on, camera, microphone
  and location requests denied, popups stay in the same view, non-web links are not opened.
- Cookies persist, so portal sign-ins carry over between applications (like the desktop browser
  profile).

## Verification

| Check | Command / place | Result (6 Oct 2026) |
|---|---|---|
| Desktop engine unchanged | `npm run bench:forms -- --engine=new` | 196/196, 0 wrong, 0 submits |
| Android path in Chromium (Pixel 7, CSP, no Playwright input) | `npm run bench:forms -- --engine=agent` → `packages/form-bench/results/agent-engine.md` | 196/196, 0 wrong, 0 submits, walls 1/1 |
| Agent tests | `packages/form-engine/src/__tests__/agent.test.ts` | channel routing, bundle freshness, browser-safe imports, CSP, cross-origin iframe, review gate, Workday steps, login wall |
| Plugin wrapper | `packages/capacitor-apply-browser/src/__tests__/plugin.test.ts` | listener before load, routing, refusals |
| Real Android WebView | `.github/workflows/android-apply.yml` (emulator API 34 and 35): `AgentFixturesTest` fills all 22 fixtures through `ApplyBrowserController`, two origins, CSP | see the workflow run |
| Harness without an emulator | `npm run build:android-test -w @nomadic/capacitor-apply-browser` then `npx tsx packages/capacitor-apply-browser/android-test-harness/simulate.ts` | PASS |

## Limits

- Real portals change. The fixtures copy real ATS behaviour (React value trackers, react-select,
  Workday portals, select2, typeaheads, shadow DOM, cross-origin iframes), but only a live run
  proves a given portal. As on desktop, the review screen shows every field before anything is sent.
- Events are untrusted (`isTrusted` false). No fixture or known ATS form checks this; a site that
  does would need a native tap fallback (dispatching a real `MotionEvent` at the element), which the
  protocol leaves room for but which is not built.
- Old phones whose "Android System WebView" was never updated (before about version 87) are not
  supported; `isSupported()` says so and the app should ask the user to update it from the Play Store.
