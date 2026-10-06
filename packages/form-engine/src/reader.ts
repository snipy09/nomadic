/**
 * FormReader: normalizes any page (all frames, open shadow roots) into FormField[].
 *
 * Label resolution order: aria-labelledby, <label for>, wrapping <label>,
 * aria-label, fieldset legend, field-container heading (Lever `.application-label`,
 * Ashby `_heading_`, Internshala `.assessment_question` ...), placeholder, name.
 */
import type { Page } from 'playwright';
import type { FormField, FormReader } from './contracts.js';
import { scanFrame, type RawField } from './agent/scan.js';
import { prepareFrame } from './dom.js';

export interface ReaderOptions {
  includeHidden?: boolean;
}

export class DomFormReader implements FormReader {
  constructor(private readonly opts: ReaderOptions = {}) {}

  async read(page: Page): Promise<FormField[]> {
    const frames = page.frames();
    const fields: FormField[] = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (frame.isDetached()) continue;
      await prepareFrame(frame);
      const raw = await frame.evaluate(scanFrame, { includeHidden: !!this.opts.includeHidden }).catch(() => [] as RawField[]);
      raw.forEach((r, n) => fields.push({ ...r, id: `f${i}_${n}`, frameIndex: i, frameUrl: frame.url() }));
    }
    return fields;
  }
}
