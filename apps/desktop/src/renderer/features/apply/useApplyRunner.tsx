import React, { useEffect, useReducer, useRef } from 'react';
import { useToast } from '@nomadic/ui';
import { getApi, type AppUser, type MasterProfile } from '../../types';
import { CompleteProfileModal } from '../onboarding/CompleteProfileModal';
import { appliesLeftLabel, applyGate } from '../billing/billingLogic';
import { useEntitlements, useInvalidateEntitlements } from '../billing/useEntitlements';
import { ApplyRunView } from './ApplyRunView';
import { buildOverrides, canSubmit, initialRun, reviewedIds, runReducer, type ApplyTarget } from './runModel';

export type { ApplyTarget } from './runModel';

interface Options {
  profile: MasterProfile;
  /** Unused: the plan comes from the server (useEntitlements). Kept for callers. */
  currentUser?: AppUser | null;
  onLog: (msg: string) => void;
  onOpenUpgrade?: (feature?: string) => void;
  onUpdateProfile?: (p: MasterProfile) => void;
  onSubmitted?: () => void;
}

/**
 * Apply flow: gate (server plan + today's remaining applies, profile, resume) -> pre-fill every form (held open, never submitted)
 * -> the apply run view shows live progress and every answer -> the candidate reviews and approves
 * each application -> only approved applications are submitted.
 * There is no path from here to `launchAutonomous` (direct submit).
 */
export function useApplyRunner({ profile, onLog, onOpenUpgrade, onUpdateProfile, onSubmitted }: Options) {
  const { toast } = useToast();
  const ent = useEntitlements();
  const invalidateEntitlements = useInvalidateEntitlements();
  const [run, dispatch] = useReducer(runReducer, initialRun);
  const [pending, setPending] = React.useState<ApplyTarget[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const runRef = useRef(run);
  runRef.current = run;
  // Bumped on cancel so late responses from a stopped run are ignored.
  const runId = useRef(0);

  const active = open && (run.stage === 'filling' || run.stage === 'review' || run.stage === 'submitting');
  useEffect(() => {
    if (!active) return;
    const api = getApi();
    const off = api.onAutoApplyProgress?.((event) => dispatch({ type: 'progress', event }));
    return () => { off?.(); };
  }, [active]);

  const prefill = async (targets: ApplyTarget[]) => {
    const api = getApi();
    if (!api.startBatchCoPilot) {
      toast({ title: 'Apply is not available in this build', tone: 'danger' });
      return;
    }
    const id = ++runId.current;
    dispatch({ type: 'start', targets });
    setOpen(true);
    onLog(`[Apply] Preparing ${targets.length} application(s) for review`);
    try {
      const res = await api.startBatchCoPilot(targets);
      if (id !== runId.current) return;
      if (!res?.success) throw new Error(res?.error || 'No forms could be prepared.');
      dispatch({ type: 'fillDone', snapshots: res.snapshots ?? [], cancelled: res.cancelled });
    } catch (e) {
      if (id !== runId.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      onLog(`[Apply] Preparing failed: ${msg}`);
      dispatch({ type: 'fillDone', error: `${msg} Nothing was submitted.` });
    }
  };

  const start = async (targets: ApplyTarget[]) => {
    if (!targets.length) return;
    // Client-side gate is only a courtesy; the server counts every submission (consume_apply_quota).
    const gate = applyGate(ent.status, ent.entitlements, ent.error ?? undefined);
    if (gate.kind === 'loading' || gate.kind === 'unknown') {
      toast({ title: 'Could not check your plan', description: 'Applying needs a connection to Nomadic. Check your connection and try again.', tone: 'warning' });
      void ent.refresh();
      return;
    }
    if (gate.kind === 'suspended') {
      toast({ title: 'This account is suspended', description: 'Contact support.', tone: 'danger' });
      return;
    }
    if (gate.kind === 'limit_reached') {
      toast({ title: 'Daily apply limit reached', description: `Your plan allows ${gate.limit} a day. It resets at midnight.`, tone: 'warning' });
      onOpenUpgrade?.('More applications per day');
      return;
    }
    if (gate.remaining !== null && targets.length > gate.remaining) {
      toast({
        title: `${gate.remaining} application${gate.remaining === 1 ? '' : 's'} left today`,
        description: `You can prepare all ${targets.length}, but only ${gate.remaining} can be submitted today.`,
        tone: 'warning',
      });
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

  const retry = async (url: string) => {
    const api = getApi();
    const app = runRef.current.apps.find((a) => a.url === url);
    if (!app || !api.startBatchCoPilot || runRef.current.stage !== 'review') return;
    const id = runId.current;
    dispatch({ type: 'retryStart', url });
    try {
      const res = await api.startBatchCoPilot([app.target], { keep: true });
      if (id !== runId.current) return;
      const snapshot = res?.snapshots?.find((s) => s.applyUrl === url);
      dispatch({ type: 'retryDone', url, snapshot, error: snapshot ? undefined : res?.error || 'This form could not be prepared.' });
    } catch (e) {
      if (id !== runId.current) return;
      dispatch({ type: 'retryDone', url, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const cancel = async () => {
    const stage = runRef.current.stage;
    runId.current++;
    dispatch({ type: 'cancel' });
    setOpen(false);
    try { await getApi().cancelAutonomousApply?.(); } catch { /* best effort */ }
    onLog('[Apply] Run cancelled by you');
    if (stage === 'submitting') {
      toast({ title: 'Stopped', description: 'Applications not yet sent were not submitted. Any already sent cannot be withdrawn here.', tone: 'warning' });
    } else {
      toast({ title: 'Apply cancelled', description: 'Nothing was submitted.', tone: 'neutral' });
    }
  };

  /** The only path to submission: requires the candidate's explicit review of each application. */
  const submit = async () => {
    const state = runRef.current;
    if (!canSubmit(state)) return;
    const api = getApi();
    if (!api.submitAllBatchCoPilot) return;
    const ids = reviewedIds(state);
    const overrides = buildOverrides(state, ids);
    const id = runId.current;
    dispatch({ type: 'submitStart', ids });
    onLog(`[Apply] Submitting ${ids.length} reviewed application(s)`);
    try {
      const res = await api.submitAllBatchCoPilot(overrides, ids);
      if (id !== runId.current) return;
      dispatch({ type: 'submitDone', result: res ?? { success: false, error: 'No response' }, ids });
      invalidateEntitlements();
      if (!res?.success) throw new Error(res?.error || 'Submission failed.');
      const applied = res.applied ?? 0;
      toast({
        title: applied ? `Submitted ${applied} application${applied === 1 ? '' : 's'}` : 'Nothing was submitted',
        description: res.limitReached
          ? `Daily apply limit reached. ${res.failed ?? 0} not sent; they stay in your list for tomorrow or after an upgrade.`
          : res.error ?? (res.failed ? `${res.failed} could not be sent. See the run for details.` : undefined),
        tone: res.failed || !applied ? 'warning' : 'success',
      });
      if (res.limitReached) onOpenUpgrade?.('More applications per day');
      onLog(`[Apply] Submitted ${applied}, not sent ${res.failed ?? 0}`);
      if (applied) onSubmitted?.();
    } catch (e) {
      if (id !== runId.current) return;
      toast({ title: 'Submission failed', description: e instanceof Error ? e.message : String(e), tone: 'danger' });
    }
  };

  const element = (
    <>
      <ApplyRunView
        open={open && run.stage !== 'cancelled'}
        state={run}
        onEdit={(url, key, value) => dispatch({ type: 'edit', url, key, value })}
        onApprove={(url, approved) => dispatch({ type: 'approve', url, approved })}
        onSkip={(url, skipped) => dispatch({ type: 'skip', url, skipped })}
        onRetry={(url) => void retry(url)}
        onSubmit={() => void submit()}
        onCancel={() => void cancel()}
        onClose={() => setOpen(false)}
        quotaNote={appliesLeftLabel(ent.entitlements) ?? (ent.status === 'unknown' ? 'Could not check your apply limit' : undefined)}
      />
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
    </>
  );

  return { start, busy: open && (run.stage === 'filling' || run.stage === 'submitting'), element };
}
