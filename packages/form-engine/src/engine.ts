/**
 * FormEngine: reader -> classifier -> answerer -> writers -> verifier.
 *
 * `fill()` never submits. `submit()` is a separate, explicit step that refuses to
 * run while required fields are unresolved, walls are present, or the page shows
 * validation errors.
 */
import { EventEmitter } from 'events';
import type { Page } from 'playwright';
import type {
  AnswerContext, Answerer, FieldClassifier, FieldKind, FieldWriter,
  FillReport, FormEngineEvent, FormEngineListener, FormReader, Verifier,
} from './contracts.js';
import { NEXT_RX, SUBMIT_RX, fillForm, fillFormSteps, submitForm, type CoreDeps, type FormDriver, type SubmitOutcome } from './core.js';
import type { MasterProfile } from './profile.js';
import { DomFormReader } from './reader.js';
import { RuleClassifier } from './classifier.js';
import { ProfileAnswerer, type AnswerCache } from './answerer.js';
import { defaultWriters } from './writers/index.js';
import { DomVerifier, pageErrors } from './verifier.js';
import { detectWalls } from './walls.js';
import { DEFAULT_POLICY, type FormPolicy } from './policy.js';
import type { AnswerLlm } from './llm.js';
import { prepareFrame, sleep } from './dom.js';
import { ensureResumeFile } from './resume-pdf.js';
import { findButtonInPage, isConfirmationInPage } from './agent/inpage.js';

export interface FormEngineOptions {
  reader?: FormReader;
  classifier?: FieldClassifier;
  answerer?: Answerer;
  writers?: Map<FieldKind, FieldWriter>;
  verifier?: Verifier;
  policy?: FormPolicy;
  /** LLM for open-ended questions (LlmClient or FormAnswerClient); undefined = Groq when profile.groqApiKey is set; null = disabled. */
  llm?: AnswerLlm | null;
  cache?: AnswerCache;
  onEvent?: FormEngineListener;
  /** Retries for fields that fail verification (default 2). */
  maxRetries?: number;
  resumeDir?: string;
}

export type { SubmitOutcome } from './core.js';
export { mergeReports } from './core.js';

export class FormEngine extends EventEmitter {
  readonly reader: FormReader;
  readonly classifier: FieldClassifier;
  readonly answerer: Answerer;
  readonly writers: Map<FieldKind, FieldWriter>;
  readonly verifier: Verifier;
  private readonly maxRetries: number;

  constructor(private readonly opts: FormEngineOptions = {}) {
    super();
    this.reader = opts.reader || new DomFormReader();
    this.classifier = opts.classifier || new RuleClassifier();
    this.answerer = opts.answerer || new ProfileAnswerer({ policy: opts.policy || DEFAULT_POLICY, llm: opts.llm, cache: opts.cache, resolveResume: (p, generate) => ensureResumeFile(p, generate, opts.resumeDir) });
    this.writers = opts.writers || defaultWriters();
    this.verifier = opts.verifier || new DomVerifier();
    this.maxRetries = opts.maxRetries ?? 2;
    if (opts.onEvent) this.on('event', opts.onEvent);
  }

  private send(ev: FormEngineEvent): void {
    this.emit('event', ev);
    // 'error' on an EventEmitter throws without a listener; only emit the typed channel when someone listens.
    if (ev.type !== 'error' || this.listenerCount('error') > 0) this.emit(ev.type, ev);
  }

  private deps(): CoreDeps {
    return { classifier: this.classifier, answerer: this.answerer, maxRetries: this.maxRetries, send: (ev) => this.send(ev) };
  }

  /** The Playwright page as a FormDriver for the shared core. */
  driver(page: Page): FormDriver {
    return {
      url: () => page.url(),
      detectWalls: () => detectWalls(page),
      read: () => this.reader.read(page),
      canWrite: (kind) => this.writers.has(kind),
      write: (field, answer) => this.writers.get(field.kind)!.write(page, field, answer),
      verify: (outcomes) => this.verifier.verify(page, outcomes),
      clickNext: () => clickNext(page),
      clickSubmit: () => clickSubmit(page),
      isConfirmation: () => isConfirmation(page),
      pageErrors: () => pageErrors(page),
      settle: async () => {
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await sleep(250);
      },
    };
  }

  /** Fill every visible field it can answer. Never clicks submit. */
  fill(page: Page, profile: MasterProfile, ctx: AnswerContext = {}): Promise<FillReport> {
    return fillForm(this.driver(page), this.deps(), profile, ctx);
  }

  /**
   * Fill a multi-step flow: fill the current step, click "Next / Continue", repeat.
   * Stops at walls, at the final step (no next button), or after `maxSteps`.
   */
  fillSteps(page: Page, profile: MasterProfile, opts: { ctx?: AnswerContext; maxSteps?: number } = {}): Promise<FillReport> {
    return fillFormSteps(this.driver(page), this.deps(), profile, opts);
  }

  /** Explicit submission. Blocked while required fields are unresolved. */
  submit(page: Page, report: FillReport, opts: { force?: boolean } = {}): Promise<SubmitOutcome> {
    return submitForm(this.driver(page), this.deps(), report, opts);
  }
}


async function clickButtonMatching(page: Page, rx: RegExp, preferSubmitType: boolean): Promise<boolean> {
  for (const frame of page.frames()) {
    await prepareFrame(frame);
    const handle = await frame.evaluateHandle(findButtonInPage, { src: rx.source, preferSubmit: preferSubmitType }).catch(() => null);
    const el = handle?.asElement();
    if (el) {
      await el.click({ timeout: 2000 }).catch(() => el.evaluate((n: Element) => (n as HTMLElement).click()));
      return true;
    }
  }
  return false;
}

export function clickNext(page: Page): Promise<boolean> {
  return clickButtonMatching(page, NEXT_RX, false);
}

export function clickSubmit(page: Page): Promise<boolean> {
  return clickButtonMatching(page, SUBMIT_RX, true);
}

export async function isConfirmation(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const ok = await frame.evaluate(isConfirmationInPage).catch(() => false);
    if (ok) return true;
  }
  return false;
}
