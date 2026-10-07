import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, Kbd } from '@nomadic/ui';
import { getApi } from '../../types';
import { HELP_LINKS, SHORTCUTS } from './helpContent';
import { FeedbackForm } from './FeedbackForm';
import { IS_MOBILE } from '../../platform';

/** In-app Help: keyboard shortcuts, where to read more, and feedback. */
export const HelpView: React.FC = () => (
  <div className="mx-auto flex max-w-3xl flex-col gap-4">
    <header className="flex flex-col gap-1">
      <h1 className="text-headline font-bold text-fg">Help</h1>
      <p className="text-body text-fg-muted">{IS_MOBILE ? 'Links and a direct line to the team.' : 'Shortcuts, links and a direct line to the team.'}</p>
    </header>

    {!IS_MOBILE && <Card>
      <CardHeader title="Keyboard shortcuts" />
      <CardContent>
        <table className="w-full text-left text-body">
          <caption className="sr-only">Keyboard shortcuts</caption>
          <thead>
            <tr className="text-caption text-fg-subtle">
              <th scope="col" className="pb-2 font-normal">Keys</th>
              <th scope="col" className="pb-2 font-normal">Action</th>
              <th scope="col" className="pb-2 font-normal">Where</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={`${s.action}-${s.where}`} className="border-t border-line">
                <td className="py-2 pr-3"><Kbd keys={s.keys} size="sm" /></td>
                <td className="py-2 pr-3 text-fg">{s.action}</td>
                <td className="py-2 text-fg-muted">{s.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>}

    <Card>
      <CardHeader title="Learn more" />
      <CardContent>
        <ul className="flex flex-col gap-2">
          {HELP_LINKS.map((l) => (
            <li key={l.href}>
              <button
                type="button"
                onClick={() => void getApi().openExternalUrl(l.href)}
                className="flex w-full items-start justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 text-left hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="flex flex-col">
                  <span className="text-body font-strong text-fg">{l.label}</span>
                  <span className="text-caption text-fg-muted">{l.description}</span>
                </span>
                <ExternalLink className="mt-1 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>

    <FeedbackForm />
  </div>
);
