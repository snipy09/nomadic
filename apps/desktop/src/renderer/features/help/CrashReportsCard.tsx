import React from 'react';
import { Card, CardContent, CardHeader, Switch } from '@nomadic/ui';
import { useTelemetry } from './useSupport';

/** Opt-in crash reports (off by default). */
export const CrashReportsCard: React.FC = () => {
  const t = useTelemetry();
  if (!t.state && !t.error) return null;
  const unavailable = t.state ? !t.state.available : false;
  return (
    <Card>
      <CardHeader
        title="Crash reports"
        description="Send error reports so problems get fixed faster. Reports contain the error and app version only: no profile data, answers, emails or file names."
      />
      <CardContent className="flex flex-col gap-2">
        {t.state && (
          <Switch
            checked={t.state.crashReports}
            onCheckedChange={(v) => void t.setEnabled(v === true)}
            disabled={t.saving || unavailable}
            label="Send anonymous crash reports"
            description={unavailable ? 'Not available in this build.' : t.state.crashReports && t.state.active ? 'On. Reports from the app window start after the next restart.' : 'Off.'}
            labelPosition="start"
          />
        )}
        {t.error && <p role="alert" className="text-body text-danger-fg">{t.error}</p>}
      </CardContent>
    </Card>
  );
};
