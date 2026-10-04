import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Receipt } from 'lucide-react';
import { Badge, Button, EmptyState, Skeleton, useToast } from '@nomadic/ui';
import { formatPrice, getPlan } from '@nomadic/config';
import { getApi } from '../../types';
import type { PaymentRecord } from '../../../shared/ipc';
import { formatDate, receiptText } from './billingLogic';

type State =
  | { status: 'loading' }
  | { status: 'ready'; payments: PaymentRecord[] }
  | { status: 'error'; error: string };

const planName = (p: PaymentRecord) => (p.plan === 'lifetime' ? 'Lifetime' : getPlan(p.plan).name);

/** The account's payments from the server, newest first, each with a copyable receipt. Settings > Account. */
export function PaymentHistory({ email }: { email?: string }) {
  const { toast } = useToast();
  const [state, setState] = useState<State>({ status: 'loading' });
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setState({ status: 'loading' });
    const api = getApi();
    if (!api.getPaymentHistory) {
      setState({ status: 'error', error: 'Payment history is available in the desktop app.' });
      return;
    }
    try {
      const res = await api.getPaymentHistory();
      if (id !== reqId.current) return;
      setState(res.success ? { status: 'ready', payments: res.payments } : { status: 'error', error: res.error });
    } catch {
      if (id === reqId.current) setState({ status: 'error', error: 'Could not load your payments.' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copyReceipt = async (p: PaymentRecord) => {
    try {
      await navigator.clipboard.writeText(receiptText(p, email));
      toast({ title: 'Receipt copied', tone: 'success' });
    } catch {
      toast({ title: 'Could not copy the receipt', tone: 'danger' });
    }
  };

  if (state.status === 'loading') return <Skeleton height={56} radius="md" aria-label="Loading payments" />;
  if (state.status === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-3" role="status">
        <p className="mr-auto text-body text-fg-muted">{state.error}</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }
  if (state.payments.length === 0) {
    return <EmptyState size="sm" icon={<Receipt />} title="No payments yet" description="Payments for Pro or Max show up here once Razorpay confirms them." />;
  }
  return (
    <ul className="flex flex-col divide-y divide-line" aria-label="Payments">
      {state.payments.map((p) => (
        <li key={p.paymentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <span className="w-28 text-body text-fg">{formatDate(p.paidAt) ?? '—'}</span>
          <span className="text-body text-fg">{planName(p)}</span>
          <span className="text-body text-fg-muted">{p.amountInr === null ? '—' : formatPrice(p.amountInr)}</span>
          {p.status !== 'captured' && <Badge size="sm" tone={p.status === 'refunded' ? 'neutral' : 'danger'}>{p.status === 'refunded' ? 'Refunded' : 'Failed'}</Badge>}
          <span className="truncate text-caption text-fg-subtle" title="Razorpay payment ID">{p.paymentId}</span>
          <Button className="ml-auto" size="sm" variant="ghost" onClick={() => void copyReceipt(p)} aria-label={`Copy receipt for ${p.paymentId}`}>
            Copy receipt
          </Button>
        </li>
      ))}
    </ul>
  );
}
