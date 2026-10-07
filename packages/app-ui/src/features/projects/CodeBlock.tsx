import React from 'react';
import { Copy } from 'lucide-react';
import { IconButton, useToast } from '@nomadic/ui';

/** Starter code or commands for a step, with a copy button. */
export function CodeBlock({ code, label }: { code: string; label: string }) {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: 'Copied', tone: 'success' });
    } catch {
      toast({ title: 'Could not copy', tone: 'danger' });
    }
  };
  return (
    <div className="group relative mt-2 overflow-hidden rounded-lg border border-line bg-surface-sunken">
      <pre className="max-h-96 overflow-auto p-3 pr-12 font-mono text-caption leading-5 text-fg" aria-label={label} tabIndex={0}>
        <code>{code}</code>
      </pre>
      <IconButton size="sm" variant="ghost" className="absolute right-1.5 top-1.5" label="Copy code" icon={<Copy />} onClick={() => void copy()} />
    </div>
  );
}

