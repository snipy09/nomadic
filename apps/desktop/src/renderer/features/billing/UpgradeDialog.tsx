import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, MessageSquare } from 'lucide-react';
import { Badge, Button, Card, Dialog, DialogContent, useToast } from '@nomadic/ui';
import { PLANS, formatPrice, getPlan, type PlanId } from '@nomadic/config';
import { getApi } from '../../types';
import { planRank } from './billingLogic';
import { useEntitlements } from './useEntitlements';

// Manual upgrade route, used only when this build has no Razorpay checkout page configured.
const SUPPORT_WHATSAPP = '919493833632';

export interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the user tried to do, e.g. "Full job board". */
  feature?: string;
  /** Account email, used only for the manual upgrade message. */
  email?: string;
}

type Checkout =
  | { state: 'idle' }
  | { state: 'opening'; plan: PlanId }
  | { state: 'waiting'; plan: PlanId; fromPlan: PlanId | null; fromExpiry: string | null }
  | { state: 'manual'; plan: PlanId }
  | { state: 'done'; plan: PlanId };

const POLL_MS = 4_000;

/** Plans from packages/config with Razorpay checkout; the plan switches as soon as the server confirms payment. */
export function UpgradeDialog({ open, onOpenChange, feature, email }: UpgradeDialogProps) {
  const { toast } = useToast();
  const [checkout, setCheckout] = useState<Checkout>({ state: 'idle' });
  const waiting = checkout.state === 'waiting';
  const ent = useEntitlements({ pollMs: open && waiting ? POLL_MS : false });
  const current: PlanId | null = ent.status === 'ready' && ent.entitlements ? ent.entitlements.plan : null;
  const expiry = ent.entitlements?.expiresAt ?? null;

  useEffect(() => { if (!open) setCheckout({ state: 'idle' }); }, [open]);

  // Payment landed (webhook -> server plan or expiry change): confirm and stop polling.
  useEffect(() => {
    if (checkout.state !== 'waiting' || !current) return;
    const changed = current !== checkout.fromPlan || expiry !== checkout.fromExpiry;
    if (changed && planRank(current) >= planRank(checkout.plan)) {
      setCheckout({ state: 'done', plan: checkout.plan });
      toast({ title: `You are on ${getPlan(checkout.plan).name} now`, tone: 'success' });
    }
  }, [checkout, current, expiry, toast]);

  const startCheckout = async (plan: Exclude<PlanId, 'free'>) => {
    const api = getApi();
    setCheckout({ state: 'opening', plan });
    try {
      const res = api.startCheckout ? await api.startCheckout(plan) : { success: false, notConfigured: true };
      if (res.success) setCheckout({ state: 'waiting', plan, fromPlan: current, fromExpiry: expiry });
      else if ('notConfigured' in res && res.notConfigured) setCheckout({ state: 'manual', plan });
      else {
        setCheckout({ state: 'idle' });
        toast({ title: 'Could not open checkout', description: ('error' in res && res.error) || undefined, tone: 'danger' });
      }
    } catch (e) {
      setCheckout({ state: 'idle' });
      toast({ title: 'Could not open checkout', description: e instanceof Error ? e.message : undefined, tone: 'danger' });
    }
  };

  const openWhatsApp = (plan: PlanId) => {
    const p = getPlan(plan);
    const text = encodeURIComponent(`Hi, I want to upgrade to Nomadic ${p.name} (${formatPrice(p.priceInr)}/month). My account email is ${email || '(not signed in)'}.`);
    void getApi().openExternalUrl?.(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        title={feature ? `Upgrade for ${feature}` : 'Plans'}
        description="Prices in Indian rupees, billed monthly. Your plan changes as soon as the payment is confirmed."
        footer={<Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>}
      >
        <div className="flex flex-col gap-4">
          {checkout.state === 'waiting' && (
            <Card variant="sunken" padding="sm" role="status" className="text-body text-fg">
              Finish the payment in your browser. This window updates by itself once Razorpay confirms it.
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => void ent.refresh()}>Check now</Button>
            </Card>
          )}
          {checkout.state === 'done' && (
            <Card variant="sunken" padding="sm" role="status" className="text-body text-success-fg">
              Payment confirmed. You are on {getPlan(checkout.plan).name}.
            </Card>
          )}
          {checkout.state === 'manual' && (
            <Card variant="sunken" padding="sm" role="status" className="flex flex-wrap items-center gap-3 text-body text-fg">
              <span className="mr-auto">Online checkout is not set up in this build. Message us and we will activate {getPlan(checkout.plan).name} on your account.</span>
              <Button size="sm" leftIcon={<MessageSquare />} onClick={() => openWhatsApp(checkout.plan)}>Message on WhatsApp</Button>
            </Card>
          )}
          {ent.status === 'unknown' && (
            <p className="text-caption text-fg-subtle">Could not load your current plan. You can still upgrade; your plan updates once you are back online.</p>
          )}

          <ul className="grid gap-3 md:grid-cols-3" aria-label="Plans">
            {PLANS.map((plan) => {
              const isCurrent = current === plan.id;
              const included = current !== null && planRank(plan.id) < planRank(current);
              const busy = checkout.state === 'opening' && checkout.plan === plan.id;
              return (
                <li key={plan.id} className="flex">
                  <Card variant={plan.featured ? 'raised' : 'outline'} selected={isCurrent} padding="md" className="flex w-full flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-heading font-strong text-fg">{plan.name}</h3>
                      {isCurrent && <Badge tone="accent">Current plan</Badge>}
                      {!isCurrent && plan.featured && <Badge tone="neutral">Most popular</Badge>}
                    </div>
                    <div>
                      <span className="text-title font-strong text-fg">{formatPrice(plan.priceInr)}</span>
                      <span className="text-caption text-fg-subtle"> / month</span>
                    </div>
                    <p className="text-caption text-fg-muted">{plan.summary}</p>
                    <ul className="flex flex-1 flex-col gap-1.5" aria-label={`${plan.name} includes`}>
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-body text-fg">
                          <Check className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden="true" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.id !== 'free' && !included && (
                      <Button
                        variant={plan.featured && !isCurrent ? 'primary' : 'secondary'}
                        rightIcon={<ExternalLink />}
                        loading={busy}
                        disabled={checkout.state === 'opening' || waiting}
                        onClick={() => void startCheckout(plan.id as Exclude<PlanId, 'free'>)}
                      >
                        {isCurrent ? 'Renew for another month' : `Upgrade to ${plan.name}`}
                      </Button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="text-caption text-fg-subtle">
            Payments are handled by Razorpay. Paying again before your paid period ends adds another month.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
