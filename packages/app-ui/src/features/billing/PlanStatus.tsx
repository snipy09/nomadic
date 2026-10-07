import React from 'react';
import { Badge, Button, Skeleton } from '@nomadic/ui';
import { formatPrice, getPlan } from '@nomadic/config';
import { appliesLeftLabel, renewalLine } from './billingLogic';
import { useEntitlements } from './useEntitlements';

/** Plan, renewal/expiry and today's usage, from the server. Used in Settings > Account. */
export function PlanStatus({ onUpgrade }: { onUpgrade?: () => void }) {
  const { status, entitlements: ent, error, refresh } = useEntitlements();

  if (status === 'loading') return <Skeleton height={64} radius="md" aria-label="Loading plan" />;
  if (status === 'unknown' || !ent) {
    return (
      <div className="flex flex-wrap items-center gap-3" role="status">
        <p className="mr-auto text-body text-fg-muted">{error || 'Could not load your plan.'}</p>
        <Button variant="secondary" size="sm" onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }

  const plan = getPlan(ent.plan);
  const tracks = ent.limits.learnTracks === null ? 'Unlimited learning tracks' : `${ent.usage.learnTracksActive} of ${ent.limits.learnTracks} learning track${ent.limits.learnTracks === 1 ? '' : 's'} in use`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ent.plan === 'free' ? 'neutral' : 'accent'}>{plan.name}</Badge>
        {plan.priceInr > 0 && <span className="text-caption text-fg-subtle">{formatPrice(plan.priceInr)} / month</span>}
        {ent.accountStatus !== 'active' && <Badge tone={ent.accountStatus === 'suspended' ? 'danger' : 'warning'}>{ent.accountStatus === 'suspended' ? 'Suspended' : 'Expired'}</Badge>}
      </div>
      <p className="text-body text-fg">{renewalLine(ent)}</p>
      <ul className="flex flex-col gap-1 text-caption text-fg-muted">
        <li>{appliesLeftLabel(ent)}</li>
        <li>{tracks}</li>
      </ul>
      {onUpgrade && (
        <div><Button size="sm" variant={ent.plan === 'free' ? 'primary' : 'secondary'} onClick={onUpgrade}>{ent.plan === 'free' ? 'See plans' : 'Renew or change plan'}</Button></div>
      )}
    </div>
  );
}
