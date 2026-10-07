import { clipboard, shell } from 'electron';
import type { FeedbackInput, FeedbackResult } from '../../shared/ipc.js';
import { SUPPORT_EMAIL } from '../../shared/support.js';
import { collectDiagnostics, formatDiagnostics } from './diagnostics.js';
import { isCrashReportingActive } from './telemetry.js';
import { log } from './app-context.js';

// Feedback and bug reports (SAAS_PLAN B6). With crash reporting on, the report
// goes to Sentry as user feedback with the diagnostics attached. Otherwise the
// user's email app opens addressed to support, with the report and diagnostics
// in the body (full diagnostics also copied to the clipboard, since mailto
// bodies can be cut short). Nothing is sent without the user pressing send.

const KIND_LABEL: Record<FeedbackInput['kind'], string> = { bug: 'Bug report', idea: 'Idea', question: 'Question' };
// Conservative mailto length so Windows mail handlers do not truncate the link.
const MAILTO_BODY_MAX = 1_800;

export function buildMailto(input: FeedbackInput, diagnostics: string | null, appVersion: string): string {
  const subject = `${KIND_LABEL[input.kind]}: Nomadic ${appVersion}`;
  let body = input.message.trim();
  if (diagnostics) {
    const room = Math.max(0, MAILTO_BODY_MAX - body.length - 80);
    const diag = diagnostics.length > room ? `${diagnostics.slice(0, room)}\n[diagnostics shortened; the full text is on your clipboard]` : diagnostics;
    body += `\n\n---\n${diag}`;
  }
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function sendFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const info = collectDiagnostics();
  const diagnostics = input.includeDiagnostics ? formatDiagnostics(info) : null;

  if (isCrashReportingActive()) {
    try {
      const Sentry = await import('@sentry/electron/main');
      Sentry.captureFeedback(
        {
          message: `[${input.kind}] ${input.message.trim()}`,
          email: input.contactEmail,
          source: 'nomadic-feedback-form',
          tags: { kind: input.kind },
        },
        diagnostics ? { attachments: [{ filename: 'diagnostics.txt', data: diagnostics, contentType: 'text/plain' }] } : undefined
      );
      log(`[Feedback] ${input.kind} sent with crash reporting.`);
      return { success: true, via: 'sentry', note: 'Sent. Thank you.' };
    } catch (err: unknown) {
      log(`[Feedback] Sentry send failed, falling back to email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (diagnostics) clipboard.writeText(diagnostics);
  await shell.openExternal(buildMailto(input, diagnostics, info.appVersion));
  return {
    success: true,
    via: 'email',
    note: diagnostics
      ? `Your email app opened a message to ${SUPPORT_EMAIL}. Press send there. The full diagnostics are also on your clipboard.`
      : `Your email app opened a message to ${SUPPORT_EMAIL}. Press send there.`,
  };
}
