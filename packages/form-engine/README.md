# @job-automator/form-engine

One form-filling pipeline for every ATS:

```
Profile -> FormReader -> FieldClassifier -> Answerer -> FieldWriter -> Verifier
           (all frames,   (rules + alias    (profile ->    (one writer    (re-read, errors,
            open shadow    dictionary;       custom/cache   per field      retry failed
            DOM, labels)   no LLM)           -> policy ->   kind)          fields, max 2)
                                             1 LLM call)
```

`FormEngine.fill(page, profile)` returns a `FillReport` and **never submits**.
`FormEngine.submit(page, report)` is a separate call and refuses to run while a
required field is unresolved, a wall (login / CAPTCHA / email verification) is
present, or the page shows required fields empty.

## Usage

```ts
import { FormEngine, parseProfile } from '@job-automator/form-engine';

const engine = new FormEngine({ onEvent: (e) => console.log(e) });
const report = await engine.fill(page, parseProfile(raw));       // or engine.fillSteps(page, profile) for multi-step flows
if (report.readyToSubmit) await engine.submit(page, report);    // explicit, blocked when anything required is missing
```

In the app, use the ATS adapters in `packages/automation/src/bots/portal-adapter.ts`
(`runPortalAdapter`, `adapterFor(url)`), or `AutoApplyEngine.submitApplication`
which runs navigate -> adapter -> fill -> review -> submit.

## Modules

| File | Role |
|---|---|
| `profile.ts` | `MasterProfile` + zod schema (`validateProfile`, `parseProfile`). Re-exported by `packages/automation/src/auto-apply-engine.ts`. |
| `contracts.ts` | `FormField`, `FieldKind`, `FormReader`, `FieldClassifier`, `Answerer`, `FieldWriter`, `Verifier`, `FillReport`, events. |
| `reader.ts` | `DomFormReader`: inputs, textareas, selects, contenteditable, `role=combobox`, listbox buttons, radio/checkbox groups, Yes/No button groups; label from aria-labelledby, `<label for>`, wrapping label, aria-label, legend, field-container heading, placeholder. |
| `classifier.ts` | `RuleClassifier`: question rules, then attribute aliases (`aliases.ts`). |
| `answerer.ts` | `ProfileAnswerer`: profile facts, then `customAnswers` / `cachedAnswers` / cache by question fingerprint, then policy, then one batched LLM call for open-ended prose only. Unknown facts -> `needs_user`. |
| `policy.ts` | **Reviewable** decisions for arbitration, certification, privacy consent, marketing opt-in, EEO self-identification, generated resume. Never model output. |
| `writers/*` | `TextWriter` (React value setter + input/change/blur, keyboard fallback), `SelectWriter`, `ComboboxWriter` (react-select, typeahead, Workday portal listbox), `RadioWriter` (label click for opacity:0 inputs, button groups), `CheckboxWriter` (both directions, groups), `DateWriter` (ISO / placeholder format), `FileWriter` (+ `resume-pdf.ts` injector), `RichTextWriter`. Every writer reads the value back. |
| `verifier.ts` | Re-reads values, collects field validation messages, flags required-empty fields. |
| `walls.ts` | Login / CAPTCHA / email-verification detection. |
| `engine.ts` | `FormEngine` (EventEmitter), `fillSteps`, `submit`. |

## Progress events

`FormEngine` emits every event on `'event'` (and on its own type, except `'error'`
which is only emitted on its channel when a listener exists), and calls
`options.onEvent`. Shape (`FormEngineEvent` in `contracts.ts`):

```ts
type FormEngineEvent =
  | { type: 'field_filled'; fieldId: string; label: string; kind: FieldKind; value: string; source: 'profile' | 'custom' | 'cache' | 'policy' | 'llm' | 'derived'; attempt: number }
  | { type: 'needs_user'; fieldId?: string; label?: string; reason: string; required?: boolean; wall?: 'login' | 'captcha' | 'email_verification' }
  | { type: 'error'; fieldId?: string; label?: string; message: string }
  | { type: 'status'; phase: 'reading' | 'classifying' | 'answering' | 'writing' | 'verifying' | 'done' | 'submitting' | 'submitted'; message: string };
```

- `field_filled.value` is the written value (file inputs report only the file name).
- `needs_user` without `fieldId` is page-level (a wall, or a blocked submit).
- An `error` for a field is followed by a retry; if the field still fails a required
  field produces `needs_user` with the reason.

### Desktop subscription

`AutoApplyEngine.submitApplication(url, profile, onProgress)` keeps its signature.
With the new engine each `AutoApplyStatusEvent` passed to `onProgress` carries the
original engine event in `formEvent`, and the closing event carries the `report`.
`ApplyResult` gains `needsUser` (label, reason, required) and `report`.
For a global feed (e.g. the apply-run view), subscribe once:

```ts
AutoApplyEngine.formEvents.on('event', ({ url, event }) => mainWindow.webContents.send('form-engine-event', { url, event }));
```

## Feature flag

`NOMADIC_FORM_ENGINE=old` routed the bots and `AutoApplyEngine` through the
legacy solver chain during Step 1.6. The benchmark gate passed
(`packages/form-bench/results/new-engine.md`), so Step 1.7 deleted the legacy
solvers (`fast-batch-filler`, `form-filler`, `deterministic-form-solver`,
`omni-form-solver`, `ai-fallback`) and the flag. The last commit containing them
is `14b3480`.

## Tests and benchmark

- `npx vitest run packages/form-engine` (DOM tests need Chromium; they are skipped when it cannot launch).
- `npm run bench:forms -- --engine=new [--llm=mock|none]` (see `packages/form-bench`).
- `npx tsx packages/form-bench/src/recall.ts` reports FormReader field-detection recall.
