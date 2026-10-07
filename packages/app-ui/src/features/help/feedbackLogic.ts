/** Pure helpers for the feedback form. No React, no IPC. */
import type { FeedbackKind } from '../../types';

export const MIN_FEEDBACK_LENGTH = 10;
export const MAX_FEEDBACK_LENGTH = 5000;

export interface FeedbackForm {
  kind: FeedbackKind;
  message: string;
  contactEmail: string;
  includeDiagnostics: boolean;
}

export type FeedbackErrors = Partial<Record<'message' | 'contactEmail', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFeedback(f: FeedbackForm): FeedbackErrors {
  const e: FeedbackErrors = {};
  const msg = f.message.trim();
  if (msg.length < MIN_FEEDBACK_LENGTH) e.message = `Tell us a little more (at least ${MIN_FEEDBACK_LENGTH} characters).`;
  else if (msg.length > MAX_FEEDBACK_LENGTH) e.message = `Keep it under ${MAX_FEEDBACK_LENGTH} characters.`;
  if (f.contactEmail.trim() && !EMAIL.test(f.contactEmail.trim())) e.contactEmail = 'Enter a valid email, or leave it empty.';
  return e;
}

export const KIND_OPTIONS: Array<{ value: FeedbackKind; label: string; placeholder: string }> = [
  { value: 'bug', label: 'Something is broken', placeholder: 'What did you do, what happened, and what did you expect?' },
  { value: 'idea', label: 'Idea or request', placeholder: 'What would make Nomadic more useful for you?' },
  { value: 'question', label: 'Question', placeholder: 'What do you want to know?' },
];
