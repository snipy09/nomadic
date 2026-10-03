import React, { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

/** Error message for an auth form. Takes focus when it appears so screen readers announce it. */
export const FormAlert: React.FC<{ message: string | null }> = ({ message }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg outline-none"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
};
