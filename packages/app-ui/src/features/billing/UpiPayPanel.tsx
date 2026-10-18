import React, { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button, Card, Field, IconButton, Input, useToast } from '@nomadic/ui';
import { formatPrice, getPlan } from '@nomadic/config';
import type { UpiOrder, UpiPayment } from '@nomadic/app-core/shared/ipc';
import { getApi } from '../../types';
import { isValidUtr, normaliseUtr, qrPath, upiReviewLine } from './upiLogic';

const REVIEW_POLL_MS = 15_000;

export interface UpiPayPanelProps {
  payment: UpiPayment;
  /** Called after the UTR was accepted for review (the dialog then watches the plan). */
  onSubmitted?: () => void;
  onCancel: () => void;
}

/** Pay by UPI: scan the QR (amount and reference filled in), then enter the UTR for review. */
export function UpiPayPanel({ payment, onSubmitted, onCancel }: UpiPayPanelProps) {
  const { toast } = useToast();
  const [order, setOrder] = useState<UpiOrder>(payment.order);
  const [utr, setUtr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qr = useMemo(() => qrPath(payment.intentUrl), [payment.intentUrl]);
  const plan = getPlan(order.plan);
  const inReview = order.status !== 'awaiting_payment';

  // While in review, check the order now and then so a rejection (with its note) shows here.
  useEffect(() => {
    if (order.status !== 'submitted') return;
    const api = getApi();
    if (!api.upiListOrders) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await api.upiListOrders!();
        const found = res.success ? res.orders.find((o) => o.orderId === order.orderId) : undefined;
        if (alive && found && found.status !== order.status) setOrder(found);
      } catch { /* next tick */ }
    };
    const id = window.setInterval(() => void tick(), REVIEW_POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [order.orderId, order.status]);

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ title: `${what} copied`, tone: 'success' }),
      () => toast({ title: `Could not copy the ${what.toLowerCase()}`, tone: 'danger' }),
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUtr(utr)) { setError('Enter the 12-digit UTR from your payment app.'); return; }
    const api = getApi();
    if (!api.upiSubmitUtr) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.upiSubmitUtr(order.orderId, normaliseUtr(utr));
      if (res.success) {
        setOrder({ ...order, status: 'submitted', utr: normaliseUtr(utr), submittedAt: new Date().toISOString() });
        onSubmitted?.();
      } else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the UTR. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const review = upiReviewLine(order);

  return (
    <Card variant="sunken" padding="md" className="flex flex-col gap-4" aria-label="Pay by UPI">
      <div className="flex flex-wrap items-start gap-5">
        {!inReview && (
          <svg
            role="img"
            aria-label={`UPI QR code for ${formatPrice(order.amountInr)} to ${payment.payeeName}`}
            viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
            className="size-44 shrink-0 rounded-md bg-white"
            shapeRendering="crispEdges"
          >
            <path d={qr.d} fill="#000" />
          </svg>
        )}
        <div className="flex min-w-[14rem] flex-1 flex-col gap-2 text-body text-fg">
          <h3 className="text-heading font-strong">Pay {formatPrice(order.amountInr)} for {plan.name} by UPI</h3>
          {order.couponApplied && (
            <p className="text-body text-success-fg">
              Coupon applied: {formatPrice(order.amountInr)} for your first month
              {order.listPriceInr ? `, then ${formatPrice(order.listPriceInr)} a month when you renew` : ''}.
            </p>
          )}
          {!inReview && (
            <p className="text-fg-muted">Scan the code with any UPI app (Google Pay, PhonePe, Paytm, BHIM). The amount and reference are filled in; do not change them.</p>
          )}
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
            <dt className="text-caption text-fg-subtle">Pay to</dt>
            <dd className="flex items-center gap-1">
              <span className="font-mono">{payment.vpa}</span>
              <IconButton size="sm" label="Copy UPI ID" icon={<Copy />} onClick={() => copy(payment.vpa, 'UPI ID')} />
            </dd>
            <dt className="text-caption text-fg-subtle">Name</dt>
            <dd>{payment.payeeName}</dd>
            <dt className="text-caption text-fg-subtle">Amount</dt>
            <dd>{formatPrice(order.amountInr)}</dd>
            <dt className="text-caption text-fg-subtle">Reference</dt>
            <dd className="flex items-center gap-1">
              <span className="font-mono">{order.reference}</span>
              <IconButton size="sm" label="Copy reference" icon={<Copy />} onClick={() => copy(order.reference, 'Reference')} />
            </dd>
          </dl>
          {!inReview && (
            <p className="text-caption text-fg-subtle">Paying by UPI ID instead? Put the reference in the payment note.</p>
          )}
        </div>
      </div>

      {inReview ? (
        <p role="status" className={order.status === 'rejected' ? 'text-body text-danger-fg' : 'text-body text-fg'}>
          {review}{order.utr ? ` UTR ${order.utr}.` : ''}
        </p>
      ) : (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void submit(e)}>
          <Field label="UTR (12 digits)" hint="Shown in your payment app after paying, also called UPI reference number." error={error} className="min-w-[16rem] flex-1">
            <Input
              value={utr}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="e.g. 412345678901"
              onChange={(e) => { setUtr(e.target.value); setError(null); }}
            />
          </Field>
          <Button type="submit" loading={busy}>I have paid</Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        </form>
      )}
    </Card>
  );
}
