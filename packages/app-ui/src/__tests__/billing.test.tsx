// @vitest-environment jsdom
import './radixShims';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { PLANS, formatPrice } from '@nomadic/config';
import { UpgradeDialog } from '../features/billing/UpgradeDialog';
import { PlanStatus } from '../features/billing/PlanStatus';
import { useEntitlements } from '../features/billing/useEntitlements';
import { appliesLeftLabel, applyGate, feedLimit, renewalLine } from '../features/billing/billingLogic';
import { QueryWrapper, entitlements, freeEntitlements } from './entitlementsFixture';

afterEach(() => { cleanup(); delete (window as any).api; });

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    getEntitlements: vi.fn().mockResolvedValue({ success: true, entitlements: freeEntitlements() }),
    startCheckout: vi.fn().mockResolvedValue({ success: true }),
    openExternalUrl: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const wrap = (ui: React.ReactNode) => render(<QueryWrapper><UIProvider>{ui}</UIProvider></QueryWrapper>);

describe('billing logic', () => {
  it('uses the server listing limit and falls back to Free when unknown', () => {
    expect(feedLimit('ready', entitlements())).toBeNull();
    expect(feedLimit('ready', freeEntitlements())).toBe(10);
    expect(feedLimit('unknown', null)).toBe(10);
    expect(feedLimit('loading', null)).toBe(10);
  });

  it('gates apply runs on server state and never allows when unknown', () => {
    expect(applyGate('ready', freeEntitlements())).toEqual({ kind: 'allowed', remaining: 3 });
    expect(applyGate('ready', freeEntitlements({ appliesRemaining: 0 }))).toEqual({ kind: 'limit_reached', limit: 3 });
    expect(applyGate('ready', entitlements({ accountStatus: 'suspended' })).kind).toBe('suspended');
    expect(applyGate('unknown', null, 'offline')).toEqual({ kind: 'unknown', error: 'offline' });
    expect(applyGate('ready', entitlements({ plan: 'max', appliesRemaining: null, limits: { ...entitlements().limits, appliesPerDay: null } }))).toEqual({ kind: 'allowed', remaining: null });
  });

  it('labels remaining applies and the renewal date', () => {
    expect(appliesLeftLabel(freeEntitlements({ appliesRemaining: 2 }))).toBe('2 of 3 applications left today');
    expect(appliesLeftLabel(entitlements({ limits: { ...entitlements().limits, appliesPerDay: null } }))).toBe('Unlimited applications');
    const now = new Date('2026-10-03T10:00:00Z');
    expect(renewalLine(entitlements(), now)).toMatch(/^Paid until 2 Nov 2026\./);
    expect(renewalLine(entitlements({ expiresAt: '2026-10-05T10:00:00Z' }), now)).toMatch(/2 days left/);
    expect(renewalLine(entitlements({ plan: 'free', accountStatus: 'expired', expiresAt: '2026-09-01T10:00:00Z' }), now)).toMatch(/^Pro ended on 1 Sept? 2026\. You are on the Free plan\./);
  });
});

function HookProbe() {
  const e = useEntitlements();
  return (
    <div>
      <span data-testid="status">{e.status}</span>
      <span data-testid="plan">{e.entitlements?.plan ?? '-'}</span>
      <span data-testid="error">{e.error ?? ''}</span>
      <button type="button" onClick={() => void e.refresh()}>refresh</button>
    </div>
  );
}

describe('useEntitlements', () => {
  it('loads the plan from the server and refreshes without main\'s cache', async () => {
    const api = mockApi();
    wrap(<HookProbe />);
    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('plan').textContent).toBe('free');
    api.getEntitlements.mockResolvedValue({ success: true, entitlements: entitlements() });
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toBe('pro'));
    expect(api.getEntitlements).toHaveBeenLastCalledWith({ fresh: true });
  });

  it('reports unknown (not a plan) when the server cannot be reached', async () => {
    mockApi({ getEntitlements: vi.fn().mockResolvedValue({ success: false, code: 'offline', error: 'Could not reach Nomadic.' }) });
    wrap(<HookProbe />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unknown'));
    expect(screen.getByTestId('plan').textContent).toBe('-');
    expect(screen.getByTestId('error').textContent).toBe('Could not reach Nomadic.');
  });

  it('is unknown when this build has no entitlements API', async () => {
    (window as any).api = {};
    wrap(<HookProbe />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unknown'));
  });
});

describe('UpgradeDialog', () => {
  it('renders every plan and price from packages/config and marks the current plan', async () => {
    mockApi();
    wrap(<UpgradeDialog open onOpenChange={() => {}} feature="Full job board" />);
    const dialog = await screen.findByRole('dialog', { name: /upgrade for full job board/i });
    const list = within(dialog).getByRole('list', { name: 'Plans' });
    for (const p of PLANS) {
      expect(within(list).getByRole('heading', { name: p.name })).toBeTruthy();
      expect(within(list).getByText(formatPrice(p.priceInr))).toBeTruthy();
      for (const f of p.features) expect(within(list).getByText(f)).toBeTruthy();
    }
    expect(await within(list).findByText('Current plan')).toBeTruthy();
    expect(within(list).getByRole('button', { name: /upgrade to pro/i })).toBeTruthy();
    expect(within(list).getByRole('button', { name: /upgrade to max/i })).toBeTruthy();
  });

  it('opens Razorpay checkout and confirms once the server shows the new plan', async () => {
    const api = mockApi();
    wrap(<UpgradeDialog open onOpenChange={() => {}} />);
    await screen.findByText('Current plan');
    await userEvent.click(screen.getByRole('button', { name: /upgrade to pro/i }));
    expect(api.startCheckout).toHaveBeenCalledWith('pro');
    expect(await screen.findByText(/finish the payment in your browser/i)).toBeTruthy();
    // The webhook has upgraded the account on the server.
    api.getEntitlements.mockResolvedValue({ success: true, entitlements: entitlements() });
    await userEvent.click(screen.getByRole('button', { name: /check now/i }));
    expect(await screen.findByText(/payment confirmed\. you are on pro/i)).toBeTruthy();
  });

  it('does not offer a lower plan to a paid user, and offers renewal of the current one', async () => {
    mockApi({ getEntitlements: vi.fn().mockResolvedValue({ success: true, entitlements: entitlements({ plan: 'max' }) }) });
    wrap(<UpgradeDialog open onOpenChange={() => {}} />);
    await screen.findByText('Current plan');
    expect(screen.queryByRole('button', { name: /upgrade to pro/i })).toBeNull();
    expect(screen.getByRole('button', { name: /renew for another month/i })).toBeTruthy();
  });

  it('falls back to the manual route when checkout is not configured', async () => {
    const api = mockApi({ startCheckout: vi.fn().mockResolvedValue({ success: false, notConfigured: true, error: 'x' }) });
    wrap(<UpgradeDialog open onOpenChange={() => {}} email="asha@x.in" />);
    await screen.findByText('Current plan');
    await userEvent.click(screen.getByRole('button', { name: /upgrade to max/i }));
    await userEvent.click(await screen.findByRole('button', { name: /message on whatsapp/i }));
    const url = api.openExternalUrl.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/wa\.me\//);
    expect(decodeURIComponent(url)).toContain('Max (₹599/month)');
    expect(decodeURIComponent(url)).toContain('asha@x.in');
  });
});

describe('PlanStatus', () => {
  it('shows plan, renewal date and usage from the server', async () => {
    mockApi({ getEntitlements: vi.fn().mockResolvedValue({ success: true, entitlements: entitlements() }) });
    const onUpgrade = vi.fn();
    wrap(<PlanStatus onUpgrade={onUpgrade} />);
    expect(await screen.findByText(/paid until 2 nov 2026/i)).toBeTruthy();
    expect(screen.getByText('8 of 10 applications left today')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /renew or change plan/i }));
    expect(onUpgrade).toHaveBeenCalled();
  });

  it('offers a retry instead of guessing a plan when offline', async () => {
    const api = mockApi({ getEntitlements: vi.fn().mockResolvedValue({ success: false, code: 'offline', error: 'Could not reach Nomadic.' }) });
    wrap(<PlanStatus />);
    expect(await screen.findByText('Could not reach Nomadic.')).toBeTruthy();
    api.getEntitlements.mockResolvedValue({ success: true, entitlements: freeEntitlements() });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('3 of 3 applications left today')).toBeTruthy();
  });
});
