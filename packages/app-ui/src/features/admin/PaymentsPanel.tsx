import React, { useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import {
  Badge, Button, EmptyState, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useToast,
} from '@nomadic/ui';
import { formatPrice, getPlan } from '@nomadic/config';
import { getApi } from '../../types';
import type { AdminUpiOrder, AdminUpiStatus } from '@nomadic/app-core/shared/admin';
import { formatDateTime, formatRelative } from './adminLogic';
import { AdminErrorState, ConfirmChangeDialog, LoadingRows } from './shared';
import { useAdminQuery } from './useAdminQuery';

type StatusFilter = 'all' | AdminUpiStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'submitted', label: 'Waiting for review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'awaiting_payment', label: 'Not paid yet' },
  { value: 'all', label: 'All' },
];

const STATUS: Record<AdminUpiStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' }> = {
  awaiting_payment: { label: 'Not paid yet', tone: 'neutral' },
  submitted: { label: 'Review', tone: 'accent' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

type Pending = { order: AdminUpiOrder; decision: 'approve' | 'reject' } | null;

/**
 * UPI direct payments (035). Approve only after the UTR, amount and reference appear on the
 * bank statement of the UPI ID; approval activates the plan for 30 days on the server.
 */
export function PaymentsPanel() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<StatusFilter>('submitted');
  const [pending, setPending] = useState<Pending>(null);
  const q = useAdminQuery(() => getApi().adminListUpiOrders({ status: filter === 'all' ? undefined : filter }), filter);
  const orders = q.data ?? [];

  const confirm = async (reason: string): Promise<string | null> => {
    if (!pending) return null;
    try {
      const res = await getApi().adminReviewUpiOrder({ orderId: pending.order.orderId, decision: pending.decision, reason });
      if (!res.ok) return res.error;
      toast({
        title: pending.decision === 'approve' ? `Approved: ${pending.order.email ?? 'user'} is on ${getPlan(pending.order.plan).name}` : 'Payment rejected',
        tone: pending.decision === 'approve' ? 'success' : 'neutral',
      });
      q.refresh();
      return null;
    } catch {
      return 'Could not reach the server. Try again.';
    }
  };

  let body: React.ReactNode;
  if (q.error) body = <AdminErrorState title="Could not load payments" error={q.error} code={q.code} onRetry={q.refresh} />;
  else if (q.loading && !q.data) body = <LoadingRows label="Loading payments" />;
  else if (orders.length === 0) {
    body = (
      <EmptyState
        bordered
        icon={<CreditCard />}
        title={filter === 'submitted' ? 'No payments waiting for review' : 'No payments here'}
        description="When a user pays by UPI and enters the UTR, the payment shows here for you to check against the bank statement."
      />
    );
  } else {
    body = (
      <Table aria-label="UPI payments">
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>UTR</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const when = o.submittedAt ?? o.createdAt;
            return (
              <TableRow key={o.orderId}>
                <TableCell className="max-w-[220px]">
                  <div className="truncate">{o.email ?? 'Unknown'}</div>
                  {o.fullName && <div className="truncate text-caption text-fg-subtle">{o.fullName}</div>}
                </TableCell>
                <TableCell>{getPlan(o.plan).name}</TableCell>
                <TableCell className="whitespace-nowrap">{formatPrice(o.amountInr)}</TableCell>
                <TableCell className="font-mono whitespace-nowrap">{o.reference}</TableCell>
                <TableCell className="font-mono whitespace-nowrap">{o.utr ?? <span className="text-fg-subtle">None</span>}</TableCell>
                <TableCell muted className="whitespace-nowrap">
                  {when ? <time dateTime={when} title={formatDateTime(when)}>{formatRelative(when)}</time> : 'Unknown'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge tone={STATUS[o.status].tone} size="sm">{STATUS[o.status].label}</Badge>
                  {o.reviewNote && <div className="max-w-[200px] truncate text-caption text-fg-subtle" title={o.reviewNote}>{o.reviewNote}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {o.status === 'submitted' && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setPending({ order: o, decision: 'approve' })}>Approve</Button>
                      <Button size="sm" variant="secondary" onClick={() => setPending({ order: o, decision: 'reject' })}>Reject</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const p = pending;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-body text-fg-muted">
          UPI payments. Approve only when the UTR, amount and reference match a credit on your bank statement.
        </p>
        <Select aria-label="Filter payments" value={filter} onValueChange={(v) => setFilter(v as StatusFilter)} options={FILTERS} />
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} loading={q.loading && !!q.data} onClick={q.refresh}>Refresh</Button>
      </div>
      {body}
      <ConfirmChangeDialog
        open={p !== null}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title={p?.decision === 'approve' ? 'Approve payment' : 'Reject payment'}
        confirmLabel={p?.decision === 'approve' ? 'Approve and activate plan' : 'Reject payment'}
        danger={p?.decision === 'reject'}
        summary={p && (
          <>
            {p.decision === 'approve' ? 'Activate' : 'Do not activate'} {getPlan(p.order.plan).name} for {p.order.email ?? 'this user'}:{' '}
            {formatPrice(p.order.amountInr)}, reference <span className="font-mono">{p.order.reference}</span>, UTR{' '}
            <span className="font-mono">{p.order.utr ?? 'none'}</span>.
            {p.decision === 'reject' && ' The reason is shown to the user.'}
          </>
        )}
        onConfirm={confirm}
      />
    </div>
  );
}
