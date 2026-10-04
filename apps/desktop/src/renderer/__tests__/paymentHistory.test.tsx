// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { PaymentHistory } from '../features/billing/PaymentHistory';
import { receiptText } from '../features/billing/billingLogic';

afterEach(() => { cleanup(); delete (window as any).api; });

const pay = { paymentId: 'pay_ABC', plan: 'max' as const, amountInr: 599, status: 'captured' as const, paidAt: '2026-10-02T10:00:00.000Z' };
const renderIt = () => render(<UIProvider><PaymentHistory email="a@t.in" /></UIProvider>);

describe('PaymentHistory', () => {
  it('lists payments and copies a receipt', async () => {
    (window as any).api = { getPaymentHistory: vi.fn().mockResolvedValue({ success: true, payments: [pay] }) };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderIt();
    expect(await screen.findByText('pay_ABC')).toBeTruthy();
    expect(screen.getByText('Max')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /copy receipt for pay_ABC/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Payment ID: pay_ABC'));
  });

  it('shows the empty state', async () => {
    (window as any).api = { getPaymentHistory: vi.fn().mockResolvedValue({ success: true, payments: [] }) };
    renderIt();
    expect(await screen.findByText('No payments yet')).toBeTruthy();
  });

  it('shows the error with a retry that reloads', async () => {
    const getPaymentHistory = vi.fn().mockResolvedValueOnce({ success: false, code: 'offline', error: 'Could not load your payments.' })
      .mockResolvedValueOnce({ success: true, payments: [pay] });
    (window as any).api = { getPaymentHistory };
    renderIt();
    expect(await screen.findByText('Could not load your payments.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('pay_ABC')).toBeTruthy();
  });
});

describe('receiptText', () => {
  it('states only known facts', () => {
    const text = receiptText({ ...pay, amountInr: null }, undefined, 'Nomadic', 'support@x.in');
    expect(text).toContain('Amount: unknown');
    expect(text).toContain('Account: unknown');
    expect(text).toContain('Plan: Max (30 days)');
    expect(text).toContain('Questions: support@x.in');
  });
});
