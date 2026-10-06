/**
 * FormDriver backed by the in-page agents of a WebView (Android). The shared core
 * (core.ts) runs on top of it exactly as it runs on Playwright on desktop.
 */
import type { FieldKind, FieldOutcome, FormField, VerifyIssue, WriteResult } from '../contracts.js';
import { NEXT_RX, SUBMIT_RX, type Answered, type FormDriver } from '../core.js';
import { sleep } from '../dom.js';
import { isLoginUrl, type Wall } from '../walls.js';
import type { AgentFile, VerifyItem } from '../agent/protocol.js';
import type { AgentChannel } from './channel.js';

const KINDS: FieldKind[] = ['text', 'textarea', 'select', 'combobox', 'radio', 'checkbox', 'date', 'file', 'richtext'];

export interface RemoteDriverOptions {
  /**
   * The file behind a file answer (`answer.value` is what the answerer's `resolveResume` returned).
   * Null when it no longer exists; the field then needs the user.
   */
  loadFile?: (ref: string) => Promise<AgentFile | null>;
}

export class RemoteDriver implements FormDriver {
  /** File names by file reference, for the verifier's "still attached" check. */
  private readonly fileNames = new Map<string, string>();

  constructor(private readonly channel: AgentChannel, private readonly opts: RemoteDriverOptions = {}) {}

  url(): string {
    return this.channel.url();
  }

  async detectWalls(): Promise<Wall[]> {
    const walls = new Set<Wall>();
    if (isLoginUrl(this.url())) walls.add('login');
    for (const f of this.channel.frames()) {
      const found = await this.channel.call(f.id, 'walls', {}).catch(() => [] as string[]);
      found.forEach((w) => walls.add(w as Wall));
    }
    return [...walls];
  }

  async read(): Promise<FormField[]> {
    const fields: FormField[] = [];
    const frames = this.channel.frames();
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const raw = await this.channel.call(frame.id, 'scan', {}).catch(() => []);
      raw.forEach((r, n) => fields.push({ ...r, id: `f${i}_${n}`, frameIndex: i, frameUrl: frame.url, frameId: frame.id }));
    }
    return fields;
  }

  canWrite(kind: FieldKind): boolean {
    return KINDS.includes(kind);
  }

  async write(field: FormField, answer: Answered): Promise<WriteResult> {
    if (!field.frameId) return { fieldId: field.id, ok: false, error: 'field has no frame' };
    let file: AgentFile | undefined;
    if (field.kind === 'file') {
      file = (await this.opts.loadFile?.(answer.value).catch(() => null)) ?? undefined;
      if (file) this.fileNames.set(answer.value, file.name);
    }
    // Only this field and its own answer (or file) go to the frame that owns it.
    return this.channel.call(field.frameId, 'write', { field, answer, file });
  }

  async verify(outcomes: FieldOutcome[]): Promise<{ issues: VerifyIssue[]; pageErrors: string[] }> {
    const byFrame = new Map<string, VerifyItem[]>();
    for (const o of outcomes) {
      const expected = o.write?.actual ?? (o.answer?.status === 'answered' ? o.answer.value : '');
      const fileName = o.field.kind === 'file' && o.answer?.status === 'answered' ? this.fileNames.get(o.answer.value) : undefined;
      const item: VerifyItem = { field: o.field, status: o.status, expected, fileName };
      const key = o.field.frameId || '';
      byFrame.set(key, [...(byFrame.get(key) || []), item]);
    }
    const issues: VerifyIssue[] = [];
    for (const [frameId, items] of byFrame) {
      try {
        issues.push(...(await this.channel.call(frameId, 'verify', { items })));
      } catch {
        // The frame is gone (navigated away): nothing it held can be trusted any more.
        for (const it of items) {
          if (it.status === 'filled') issues.push({ fieldId: it.field.id, kind: 'value_mismatch', message: 'the page changed; field is gone' });
          else if (it.field.required && it.status !== 'skipped') issues.push({ fieldId: it.field.id, kind: 'required_empty', message: 'required field is empty' });
        }
      }
    }
    return { issues, pageErrors: await this.pageErrors() };
  }

  async pageErrors(): Promise<string[]> {
    const out: string[] = [];
    for (const f of this.channel.frames()) out.push(...(await this.channel.call(f.id, 'pageErrors', {}).catch(() => [] as string[])));
    return [...new Set(out)];
  }

  private async clickMatching(rx: RegExp, preferSubmit: boolean): Promise<boolean> {
    for (const f of this.channel.frames()) {
      const clicked = await this.channel.call(f.id, 'clickButton', { src: rx.source, preferSubmit }).catch(() => false);
      if (clicked) return true;
    }
    return false;
  }

  clickNext(): Promise<boolean> {
    return this.clickMatching(NEXT_RX, false);
  }

  clickSubmit(): Promise<boolean> {
    return this.clickMatching(SUBMIT_RX, true);
  }

  async isConfirmation(): Promise<boolean> {
    // A submit usually navigates: let the next document load before reading it.
    await this.channel.waitForTop('interactive', 10_000);
    for (const f of this.channel.frames()) {
      if (await this.channel.call(f.id, 'isConfirmation', {}).catch(() => false)) return true;
    }
    return false;
  }

  async settle(): Promise<void> {
    await sleep(250);
    await this.channel.waitForTop('interactive', 10_000);
    await sleep(250);
  }
}
