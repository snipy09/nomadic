/**
 * How to get from a job page to its application form, per ATS, as plain data.
 * Desktop (packages/automation bots/portal-adapter.ts, Playwright) and Android
 * (remote/apply.ts, in-page agent) both run these steps, so they stay in one place.
 *
 * Selectors are CSS, optionally ending in Playwright's `:has-text("...")` (case-insensitive
 * substring of the element's text), which the in-page agent implements too.
 */
export type PortalId = 'ashby' | 'greenhouse' | 'lever' | 'internshala' | 'workday' | 'generic';

export interface AdapterStep {
  /** Click the first visible element matching one of these selectors (in order). */
  selectors: string[];
  /** Pause after a click (ms). */
  waitMs: number;
}

export interface AdapterSpec {
  id: PortalId;
  /** URL test; the generic adapter matches everything. */
  urlPattern: RegExp | null;
  /** The form is already on screen when one of these is visible (or the URL matches `formUrl`). */
  formVisible: string[];
  formUrl?: RegExp;
  /** Steps that open the form; skipped when the form is already on screen. */
  open: AdapterStep[];
  /** Steps that always run after `open` (e.g. a resume step in front of the questions). */
  after?: AdapterStep[];
  /** Wait for the page to finish loading after the clicks (the click navigates). */
  settleAfterOpen?: boolean;
  /** Wait until any question control is visible (form loads after a click or navigation). */
  waitForForm?: boolean;
  /** Fill step by step through "Next / Save and Continue". */
  multiStep?: boolean;
}

/** Any visible question control (radio and select inputs may be styled, so their labels count too). */
export const ANY_CONTROL = ['form textarea', 'form select', 'form input[type="radio"] + label', 'form label:has(input[type="radio"])', 'form input[type="text"]', 'form input[type="number"]', 'form input[type="file"]', '.select2-container', '.chosen-container'];

const GENERIC_FORM = ['form input[type="email"]', 'form input[type="file"]', 'input[name*="email" i]', 'iframe#grnhse_iframe'];

export const ADAPTER_SPECS: AdapterSpec[] = [
  {
    id: 'ashby',
    urlPattern: /jobs\.ashbyhq\.com/i,
    formVisible: ['#_systemfield_name', '#_systemfield_email', 'form.ashby-application-form input'],
    open: [{ selectors: ['a[role="tab"]:has-text("Application")', 'a:has-text("Apply for this job")', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this role")', 'button:has-text("Apply")'], waitMs: 500 }],
  },
  {
    id: 'greenhouse',
    urlPattern: /greenhouse\.io|gh_jid=/i,
    formVisible: ['#application_form', '#application-form', 'iframe#grnhse_iframe', '#first_name'],
    open: [{ selectors: ['#apply_button', 'a[href*="#app"]', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this job")', 'button:has-text("Apply")'], waitMs: 500 }],
  },
  {
    id: 'lever',
    urlPattern: /jobs\.lever\.co/i,
    formVisible: ['#application-form', 'form[data-qa="application-form"]'],
    open: [{ selectors: ['a.postings-btn[href$="/apply"]', 'a[href$="/apply"]', 'a:has-text("Apply for this job")'], waitMs: 800 }],
    settleAfterOpen: true,
  },
  {
    id: 'internshala',
    urlPattern: /internshala\.com/i,
    formVisible: ['#easy_apply_modal form', '#application_modal form', '.modal.show form', '#application-form', '#cover_letter'],
    formUrl: /\/application\/form\//i,
    open: [{ selectors: ['#easy_apply_button', '#apply_now_button', 'button:has-text("Apply now")', 'a:has-text("Apply now")', '.buttons_container .btn-primary'], waitMs: 600 }],
    // Some postings show a resume step first.
    after: [{ selectors: ['#proceed_to_application', 'button:has-text("Proceed to application")', 'a:has-text("Proceed to application")'], waitMs: 600 }],
    // "Apply now" often navigates to /application/form/...: read only once that page has its questions.
    waitForForm: true,
  },
  {
    id: 'workday',
    urlPattern: /myworkdayjobs\.com|workday\.com/i,
    formVisible: ['[data-automation-id="applyFlowPage"]', '[data-automation-id="signInContent"]'],
    open: [
      { selectors: ['a[data-automation-id="adventureButton"]', 'button:has-text("Apply")', 'a:has-text("Apply")'], waitMs: 800 },
      { selectors: ['a[data-automation-id="applyManually"]', 'button:has-text("Apply Manually")', 'a:has-text("Apply Manually")'], waitMs: 800 },
    ],
    multiStep: true,
  },
  {
    id: 'generic',
    urlPattern: null,
    formVisible: GENERIC_FORM,
    open: [{ selectors: ['button:has-text("Apply now")', 'a:has-text("Apply now")', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this job")', '[data-qa="apply-button"]', '.apply-button'], waitMs: 500 }],
  },
];

export function adapterSpecFor(url: string): AdapterSpec {
  return ADAPTER_SPECS.find((a) => a.urlPattern?.test(url)) || adapterSpecById('generic');
}

export function adapterSpecById(id: string): AdapterSpec {
  return ADAPTER_SPECS.find((a) => a.id === id) || ADAPTER_SPECS.find((a) => a.id === 'generic')!;
}

/** Split `css:has-text("x")` into its CSS part and the text to look for. */
export function splitHasText(selector: string): { css: string; text?: string } {
  const m = selector.match(/^(.*):has-text\((["'])(.*)\2\)$/);
  return m ? { css: m[1] || '*', text: m[3] } : { css: selector };
}
