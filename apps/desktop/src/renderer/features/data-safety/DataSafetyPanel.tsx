import React, { useState } from 'react';
import { ClipboardCopy, Download, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, Skeleton } from '@nomadic/ui';
import { describeHealth, formatBackupLine, formatBytes } from './dataSafetyLogic';
import { useAccountDeletion, useAccountExport, useCopyDiagnostics, useDataHealth, type ActionState } from './useDataSafety';
import { DeleteAccountDialog } from './DeleteAccountDialog';

interface DataSafetyPanelProps {
  accountEmail?: string | null;
  /** Called after the server confirmed deletion and local data was wiped. */
  onAccountDeleted: () => void;
}

const ActionMessage: React.FC<{ state: ActionState }> = ({ state }) =>
  state.message ? (
    <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-body text-danger-fg' : 'text-body text-fg-muted'}>
      {state.message}
    </p>
  ) : null;

/** Data & privacy: local database health, diagnostics, export and account deletion. */
export const DataSafetyPanel: React.FC<DataSafetyPanelProps> = ({ accountEmail, onAccountDeleted }) => {
  const health = useDataHealth();
  const diagnostics = useCopyDiagnostics();
  const exporter = useAccountExport();
  const deletion = useAccountDeletion(onAccountDeleted);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const summary = describeHealth(health.health);

  return (
    <>
      <Card>
        <CardHeader title="Data on this computer" description="Checked every time Nomadic starts." />
        <CardContent>
          {health.loading ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading local data status">
              <Skeleton width={192} height={20} />
              <Skeleton width="100%" height={14} />
            </div>
          ) : health.error ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p role="alert" className="text-body text-danger-fg">{health.error}</p>
              <Button size="sm" variant="secondary" onClick={health.refresh}>Try again</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={summary.tone}>{summary.title}</Badge>
              </div>
              <p className="text-body text-fg-muted">{summary.detail}</p>
              <p className="text-caption text-fg-subtle">
                Size {formatBytes(health.sizeBytes)}. {formatBackupLine(health.backups, health.latestBackupAt)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Diagnostics" description="Versions, database status and recent log lines, with emails, tokens and names removed. Nothing is sent anywhere." />
        <CardContent className="flex flex-col gap-3">
          <div>
            <Button variant="secondary" leftIcon={<ClipboardCopy />} loading={diagnostics.state.status === 'busy'} loadingText="Collecting…" onClick={() => void diagnostics.copy()}>
              Copy diagnostics
            </Button>
          </div>
          <ActionMessage state={diagnostics.state} />
          {diagnostics.text && (
            <details className="rounded-md border border-line bg-surface-sunken p-3">
              <summary className="cursor-default text-label text-fg">Show what was copied</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-caption text-fg-muted">{diagnostics.text}</pre>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Export your data" description="One JSON file with your account, applications, resumes, learning progress and settings. Passwords and API keys are never included." />
        <CardContent className="flex flex-col gap-3">
          <div>
            <Button variant="secondary" leftIcon={<Download />} loading={exporter.state.status === 'busy'} loadingText="Exporting…" onClick={() => void exporter.exportData()}>
              Export data
            </Button>
          </div>
          <ActionMessage state={exporter.state} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Delete account" description="Permanently deletes your account on the server and all Nomadic data on this computer." />
        <CardContent>
          <Button variant="danger" leftIcon={<Trash2 />} onClick={() => { deletion.reset(); setDeleteOpen(true); }}>
            Delete account…
          </Button>
        </CardContent>
      </Card>

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        accountEmail={accountEmail}
        busy={deletion.busy}
        error={deletion.error}
        onConfirm={deletion.remove}
      />
    </>
  );
};
