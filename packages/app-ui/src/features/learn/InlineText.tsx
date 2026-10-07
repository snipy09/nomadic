import React from 'react';

/**
 * Renders the small markdown subset used in lesson and quiz text: **bold** and
 * `code`. Text only; links are never rendered from content (they come from the
 * curated resource list).
 */
export function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-strong text-fg">{p.slice(2, -2)}</strong>
        ) : p.startsWith('`') && p.endsWith('`') ? (
          <code key={i} className="rounded bg-surface-active px-1 font-mono text-[0.92em]">{p.slice(1, -1)}</code>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}
