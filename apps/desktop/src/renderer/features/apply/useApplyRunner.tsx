import React, { useState } from 'react';
import { Button, Dialog, DialogContent, Spinner, useToast } from '@nomadic/ui';
import { getApi, type AppUser, type MasterProfile } from '../../types';
import { CompleteProfileModal } from '../onboarding/CompleteProfileModal';
import { BatchCoPilotReviewModal } from '../../components/BatchCoPilotReviewModal';
import type { BatchAppSnapshot } from '../../utils/batch-copilot-helpers';
import { hasFeatureAccess } from '../../utils/tier-utils';

export interface ApplyTarget { url: string; company?: string; title?: string }

interface Options {
  profile: MasterProfile;
  currentUser?: AppUser | null;
  onLog: (msg: string) => void;
  onOpenUpgrade?: (feature?: string) => void;
  onUpdateProfile?: (p: MasterProfile) => void;
  onSubmitted?: () => void;
}

/**
 * Apply flow: gate (plan, profile, resume) → pre-fill every form → the user reviews → submit.
 * Nothing is ever submitted without the review step; if pre-fill fails the user is told and nothing is sent.
 * (F4 replaces the review modal with the live apply run view.)
 */
export function useApplyRunner({ profile, currentUser, onLog, onOpenUpgrade, onUpdateProfile, onSubmitted }: Options) {
  const { toast } = useToast();
  const [filling, setFilling] = useState<ApplyTarget[] | null>(null);
  const [pending, setPending] = useState<ApplyTarget[] | null>(null);
  const [snapshots, setSnapshots] = useState<BatchAppSnapshot[]>([]);

  const prefill = async (targets: ApplyTarget[]) => {
    const api = getApi();
    if (!api.startBatchCoPilot) {
      toast({ title: 'Apply is not available in this build', tone: 'danger' });
      return;
    }
    setFilling(targets);
    onLog(`[Apply] Pre-filling ${targets.length} application(s) for review`);
    try {
      const res = await api.startBatchCoPilot(targets);
      if (!res?.success || !res.snapshots?.length) throw new Error(res?.error || 'No forms could be filled.');
      setSnapshots(res.snapshots);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onLog(`[Apply] Pre-fill failed: ${msg}`);
      toast({ title: 'Could not prepare the application', description: `${msg} Nothing was submitted.`, tone: 'danger', action: { label: 'Retry', onClick: () => void prefill(targets) } });
    } finally {
      setFilling(null);
    }
  };

  const start = async (targets: ApplyTarget[]) => {
    if (!targets.length) return;
    if (!hasFeatureAccess(currentUser?.tier || currentUser?.subscription_tier, 'pro')) {
      onOpenUpgrade?.('Auto-apply (Pro / Max)');
      return;
    }
    const api = getApi();
    let hasResume = Boolean(profile.resumeFilePath?.trim());
    if (!hasResume) {
      try { hasResume = ((await api.getResumes?.()) ?? []).length > 0; } catch { /* treated as missing */ }
    }
    if (!profile.firstName?.trim() || !profile.phone?.trim() || !hasResume) {
      setPending(targets);
      return;
    }
    await prefill(targets);
  };

  const cancel = async () => {
    try { await getApi().cancelAutonomousApply?.(); } catch { /* best effort */ }
    setFilling(null);
  };

  const submitAll = async (overrides?: Record<string, Record<string, string>>) => {
    const api = getApi();
    if (!api.submitAllBatchCoPilot) return;
    try {
      const res = await api.submitAllBatchCoPilot(overrides);
      if (!res?.success) throw new Error(res?.error || 'Submission failed.');
      toast({ title: `Submitted ${res.applied ?? snapshots.length} application(s)`, description: res.failed ? `${res.failed} failed and were not sent.` : undefined, tone: res.failed ? 'warning' : 'success' });
      onLog(`[Apply] Submitted ${res.applied ?? snapshots.length}, failed ${res.failed ?? 0}`);
      onSubmitted?.();
    } catch (e) {
      toast({ title: 'Submission failed', description: e instanceof Error ? e.message : String(e), tone: 'danger' });
    }
  };

  const element = (
    <>
      <Dialog open={Boolean(filling)} onOpenChange={(o) => { if (!o) void cancel(); }}>
        <DialogContent
          title="Preparing your application"
          description="Nomadic is filling the form. You will review everything before it is sent."
          size="sm"
          footer={<Button variant="secondary" onClick={() => void cancel()}>Cancel</Button>}
        >
          <div className="flex items-center gap-3 text-body text-fg-muted">
            <Spinner />
            <span>
              {filling && filling.length === 1 ? `${filling[0].title ?? 'Role'} at ${filling[0].company ?? 'company'}` : `${filling?.length ?? 0} applications`}
            </span>
          </div>
        </DialogContent>
      </Dialog>
      <CompleteProfileModal
        isOpen={Boolean(pending)}
        onClose={() => setPending(null)}
        profile={profile}
        onSaveProfile={async (updated) => {
          const res: any = await getApi().saveMasterProfile?.(updated as any);
          if (res && res.success === false) throw new Error(res.error || 'Could not save');
          onUpdateProfile?.(updated);
        }}
        onProfileCompleted={() => {
          const t = pending;
          setPending(null);
          if (t) void prefill(t);
        }}
      />
      <BatchCoPilotReviewModal isOpen={snapshots.length > 0} onClose={() => setSnapshots([])} snapshots={snapshots} onSubmitAll={submitAll} onLog={onLog} />
    </>
  );

  return { start, busy: Boolean(filling), element };
}
