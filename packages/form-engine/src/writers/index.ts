import type { FieldKind, FieldWriter } from '../contracts.js';
import { TextWriter } from './text.js';
import { SelectWriter } from './select.js';
import { ComboboxWriter } from './combobox.js';
import { RadioWriter } from './radio.js';
import { CheckboxWriter } from './checkbox.js';
import { DateWriter } from './date.js';
import { FileWriter } from './file.js';
import { RichTextWriter } from './richtext.js';

export { TextWriter, SelectWriter, ComboboxWriter, RadioWriter, CheckboxWriter, DateWriter, FileWriter, RichTextWriter };
export { readFieldValue, valuesMatch } from './common.js';
export { parseDate, formatDate } from './date.js';

export function defaultWriters(): Map<FieldKind, FieldWriter> {
  const map = new Map<FieldKind, FieldWriter>();
  for (const w of [new TextWriter(), new SelectWriter(), new ComboboxWriter(), new RadioWriter(), new CheckboxWriter(), new DateWriter(), new FileWriter(), new RichTextWriter()]) {
    for (const k of w.kinds) map.set(k, w);
  }
  return map;
}
