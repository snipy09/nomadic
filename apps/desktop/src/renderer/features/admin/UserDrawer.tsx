import React, { useEffect, useState } from 'react';
import { Badge, Button, Drawer, DrawerContent, Field, Input, Select, useToast } from '@nomadic/ui';
import { getApi } from '../../types';
import type { AdminAssignableTier, AdminUserRow } from '../../../shared/admin';
import {
  PLAN_OPTIONS, expiryLabel, formatDate, formatDateTime, fromDateInput, tierLabel, toDateInput, validatePlanChange,
} from './adminLogic';
import { AuditList } from './AuditPanel';
import { ConfirmChangeDialog } from './shared';
import { useAdminQuery } from './useAdminQuery';
import { IS_MOBILE } from '../../platform';

interface UserDrawerProps {
  user: AdminUserRow | null;
  /** The signed-in admin's id: their own account can't be changed here. */
  selfId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const isAssignable = (t: string): t is AdminAssignableTier => PLAN_OPTIONS.some((o) => o.value === t);

export function UserDrawer({ user, selfId, onClose, onChanged }: UserDrawerProps) {
  return (
    <Drawer open={user !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      {user && <UserDrawerBody user={user} selfId={selfId} onChanged={onChanged} />}
    </Drawer>
  );
}

function UserDrawerBody({ user, selfId, onChanged }: { user: AdminUserRow; selfId: string | null; onChanged: () => void }) {
  const { toast } = useToast();
  const isSelf = selfId !== null && String(selfId) === user.id;
  const [tier, setTier] = useState<AdminAssignableTier>(isAssignable(user.tier) ? user.tier : 'pro');
  const [expiry, setExpiry] = useState(toDateInput(user.expiresAt));
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'plan' | 'status' | null>(null);

  useEffect(() => {
    setTier(isAssignable(user.tier) ? user.tier : 'pro');
    setExpiry(toDateInput(user.expiresAt));
    setPlanError(null);
  }, [user.id, user.tier, user.expiresAt]);

  const history = useAdminQuery(
    () => getApi().adminListAudit({ targetType: 'user', targetId: user.id, limit: 10 }),
    `${user.id}:${user.tier}:${user.status}:${user.expiresAt}`,
  );

  const newExpiryIso = tier === 'lifetime' ? null : fromDateInput(expiry);
  const planUnchanged = tier === user.tier && toDateInput(newExpiryIso) === toDateInput(user.expiresAt);
  const suspend = user.status === 'active';
  const exp = expiryLabel(user.expiresAt);

  const reviewPlan = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePlanChange(tier, expiry);
    setPlanError(err);
    if (!err) setConfirm('plan');
  };

  const confirmPlan = async (reason: string) => {
    const res = await getApi().adminSetUserPlan({ targetId: user.id, tier, expiresAt: newExpiryIso, reason });
    if (!res.ok) return res.error;
    toast({ title: 'Plan changed', description: `${user.email} is now on ${tierLabel(tier)}.`, tone: 'success' });
    onChanged();
    return null;
  };

  const confirmStatus = async (reason: string) => {
    const res = await getApi().adminSetUserStatus({ targetId: user.id, status: suspend ? 'suspended' : 'active', reason });
    if (!res.ok) return res.error;
    toast({
      title: suspend ? 'Account suspended' : 'Account reactivated',
      description: suspend && res.data.sessionsEnded > 0 ? `${user.email} was signed out of ${res.data.sessionsEnded} device(s).` : user.email,
      tone: 'success',
    });
    onChanged();
    return null;
  };

  return (
    <DrawerContent side={IS_MOBILE ? 'bottom' : undefined}
      title={user.fullName || user.email}
      description={user.email}
      size="lg"
      headerExtra={<Badge tone={user.status === 'suspended' ? 'danger' : 'success'} dot>{user.status === 'suspended' ? 'Suspended' : 'Active'}</Badge>}
    >
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-fg-subtle">User ID</dt><dd className="break-all font-mono text-caption text-fg">{user.id}</dd>
          <dt className="text-fg-subtle">Role</dt><dd className="text-fg">{user.role === 'admin' ? 'Admin' : 'User'}</dd>
          <dt className="text-fg-subtle">Plan</dt><dd className="text-fg">{tierLabel(user.tier)} <span className="text-fg-muted">({exp.text})</span></dd>
          <dt className="text-fg-subtle">Joined</dt><dd className="text-fg">{formatDate(user.createdAt)}</dd>
          <dt className="text-fg-subtle">Last sign-in</dt><dd className="text-fg">{formatDateTime(user.lastLogin)}</dd>
          <dt className="text-fg-subtle">Signed-in devices</dt><dd className="text-fg">{user.activeSessions}</dd>
          <dt className="text-fg-subtle">Applications</dt><dd className="text-fg">{user.appsCount}</dd>
        </dl>

        {isSelf ? (
          <p className="rounded-md border border-line bg-surface-sunken p-3 text-body text-fg-muted">
            This is your own account. Another admin has to change its plan or status.
          </p>
        ) : (
          <>
            <section aria-labelledby="admin-plan-heading" className="flex flex-col gap-3">
              <h3 id="admin-plan-heading" className="text-heading font-strong text-fg">Plan</h3>
              <form onSubmit={reviewPlan} className="flex flex-col gap-3" noValidate>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plan">
                    <Select value={tier} onValueChange={(v) => { if (isAssignable(v)) setTier(v); }} options={PLAN_OPTIONS} />
                  </Field>
                  <Field label="Expires on" hint={tier === 'lifetime' ? 'Lifetime never expires.' : 'Leave empty for no expiry.'} error={planError}>
                    <Input type="date" value={tier === 'lifetime' ? '' : expiry} disabled={tier === 'lifetime'} onChange={(e) => setExpiry(e.target.value)} />
                  </Field>
                </div>
                <div>
                  <Button type="submit" disabled={planUnchanged}>Review plan change</Button>
                </div>
              </form>
            </section>

            <section aria-labelledby="admin-access-heading" className="flex flex-col gap-3">
              <h3 id="admin-access-heading" className="text-heading font-strong text-fg">Access</h3>
              <p className="text-body text-fg-muted">
                {suspend
                  ? 'Suspending blocks sign-in and signs the user out of every device.'
                  : 'Reactivating lets the user sign in again.'}
              </p>
              <div>
                <Button variant={suspend ? 'danger' : 'primary'} onClick={() => setConfirm('status')}>
                  {suspend ? 'Suspend account' : 'Reactivate account'}
                </Button>
              </div>
            </section>
          </>
        )}

        <section aria-labelledby="admin-history-heading" className="flex flex-col gap-3">
          <h3 id="admin-history-heading" className="text-heading font-strong text-fg">Recent changes</h3>
          <AuditList query={history} compact emptyText="No admin changes to this account yet." />
        </section>
      </div>

      <ConfirmChangeDialog
        open={confirm === 'plan'}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Change plan"
        confirmLabel="Change plan"
        summary={
          <ul className="flex flex-col gap-1">
            <li><span className="text-fg-subtle">Account:</span> {user.email}</li>
            <li><span className="text-fg-subtle">Plan:</span> {tierLabel(user.tier)} to <strong className="font-strong">{tierLabel(tier)}</strong></li>
            <li><span className="text-fg-subtle">Expiry:</span> {user.expiresAt ? formatDate(user.expiresAt) : 'none'} to <strong className="font-strong">{newExpiryIso ? formatDate(newExpiryIso) : 'none'}</strong></li>
          </ul>
        }
        onConfirm={confirmPlan}
      />
      <ConfirmChangeDialog
        open={confirm === 'status'}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={suspend ? 'Suspend account' : 'Reactivate account'}
        confirmLabel={suspend ? 'Suspend account' : 'Reactivate account'}
        danger={suspend}
        summary={
          suspend
            ? <p><strong className="font-strong">{user.email}</strong> will be signed out of {user.activeSessions} device(s) and cannot sign in until reactivated.</p>
            : <p><strong className="font-strong">{user.email}</strong> will be able to sign in again.</p>
        }
        onConfirm={confirmStatus}
      />
    </DrawerContent>
  );
}
