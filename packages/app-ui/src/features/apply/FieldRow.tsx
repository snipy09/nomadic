import React, { useState } from 'react';
import { Badge, Button, Checkbox, Field, Input, Select, Textarea, cn } from '@nomadic/ui';
import type { BatchSnapshotField } from '@nomadic/app-core/shared/ipc';
import { SOURCE_LABEL, confidenceLabel } from './runModel';

interface FieldRowProps {
  field: BatchSnapshotField;
  value: string;
  edited: boolean;
  /** The engine could not answer or write this field: show the editor straight away. */
  needsYou: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function displayValue(f: BatchSnapshotField, value: string): string {
  if (f.fieldType === 'checkbox' && !f.multiple) return value === 'true' ? 'Checked' : 'Not checked';
  if (f.multiple) return value.split('|').filter(Boolean).join(', ');
  return value;
}

function Editor({ field, value, onChange, disabled, autoFocus }: { field: BatchSnapshotField; value: string; onChange: (v: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  const label = field.label;
  if (field.fieldType === 'checkbox' && !field.multiple) {
    return <Checkbox label={label} autoFocus={autoFocus} checked={value === 'true'} disabled={disabled} onCheckedChange={(c) => onChange(c === true ? 'true' : 'false')} />;
  }
  const choice = ['select', 'radio', 'combobox'].includes(field.fieldType) && (field.options?.length ?? 0) > 0 && !field.multiple;
  const hint = field.multiple ? 'Separate choices with |' : field.reason;
  return (
    <Field label={label} required={field.required} hint={hint}>
      {choice ? (
        <Select
          value={value || undefined}
          onValueChange={onChange}
          disabled={disabled}
          placeholder="Choose an answer"
          options={[...new Set(field.options)].map((o) => ({ value: o, label: o }))}
        />
      ) : field.fieldType === 'textarea' || field.fieldType === 'richtext' ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} autoResize disabled={disabled} autoFocus={autoFocus} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} autoFocus={autoFocus} />
      )}
    </Field>
  );
}

/** One form question: what was written, where it came from, and an inline editor. */
export function FieldRow({ field, value, edited, needsYou, disabled, onChange }: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const isFile = field.fieldType === 'file';
  const showEditor = !isFile && (needsYou || editing);
  const confidence = confidenceLabel(field.confidence);

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-md border px-3 py-2.5',
        needsYou ? 'border-warning/50 bg-warning-subtle/40' : 'border-line bg-surface',
      )}
      data-field-status={field.status}
    >
      {showEditor ? (
        <Editor field={field} value={value} onChange={onChange} disabled={disabled} autoFocus={editing} />
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-caption text-fg-muted">
              {field.label}
              {field.required && <span className="ml-0.5 text-danger" aria-label="required">*</span>}
            </span>
            <span className={cn('whitespace-pre-line break-words text-body', value ? 'text-fg' : 'text-fg-subtle')}>
              {value ? displayValue(field, value) : field.status === 'skipped' ? 'Left as the portal had it' : 'Empty'}
            </span>
          </div>
          {!isFile && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={disabled} aria-label={`Edit ${field.label}`}>
              Edit
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {needsYou && <Badge tone="warning" size="sm">{field.status === 'failed' ? 'Could not fill' : 'Needs you'}</Badge>}
        {edited && <Badge tone="accent" size="sm">Edited by you</Badge>}
        {!edited && field.source && <Badge tone={field.source === 'llm' ? 'warning' : 'neutral'} size="sm">{SOURCE_LABEL[field.source]}</Badge>}
        {confidence && <span className="text-caption text-fg-subtle">{confidence}</span>}
        {needsYou && field.reason && !showEditor && <span className="text-caption text-fg-muted">{field.reason}</span>}
      </div>
    </li>
  );
}
