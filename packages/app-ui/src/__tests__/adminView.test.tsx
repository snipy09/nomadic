// @vitest-environment jsdom
import './radixShims';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { AdminView } from '../features/admin/AdminView';

afterEach(() => { cleanup(); delete (window as any).api; });

const ADMIN = { id: '00000000-0000-0000-0000-00000000000a', email: 'admin@x.co', fullName: 'Admin', role: 'admin', tier: 'max', status: 'active', appsCount: 0, createdAt: '' } as any;
const TARGET = '00000000-0000-0000-0000-00000000000c';

const users = () => [
  { id: TARGET, email: 'target@x.co', fullName: 'Target User', tier: 'pro', role: 'user', status: 'active', expiresAt: null, createdAt: '2026-09-01T00:00:00Z', lastLogin: '2026-10-02T00:00:00Z', appsCount: 3, activeSessions: 1 },
  { id: ADMIN.id, email: 'admin@x.co', fullName: 'Admin', tier: 'max', role: 'admin', status: 'active', expiresAt: null, createdAt: '2026-08-01T00:00:00Z', lastLogin: null, appsCount: 0, activeSessions: 1 },
];

const lesson = { id: 'arrays-intro', skillId: 'arrays', title: 'Intro to arrays', status: 'draft', version: 2, aiDrafted: false, isCore: true, estimatedMinutes: 10, summaryMd: 'Arrays hold items.', keyPoints: ['Index from 0'], resourceIds: [], updatedAt: null };

const UPI_ORDER = '00000000-0000-0000-0000-0000000000f1';
const upiOrder = () => ({ orderId: UPI_ORDER, userId: TARGET, email: 'target@x.co', fullName: 'Target User', plan: 'pro', amountInr: 249, reference: 'NMD-7K3Q9X', utr: '412345678901', status: 'submitted', createdAt: '2026-10-17T10:00:00Z', submittedAt: '2026-10-17T10:05:00Z', reviewedAt: null, reviewNote: null });

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    adminListUsers: vi.fn().mockResolvedValue({ ok: true, data: { users: users(), total: 2 } }),
    adminSetUserPlan: vi.fn().mockResolvedValue({ ok: true, data: { auditId: 1 } }),
    adminSetUserStatus: vi.fn().mockResolvedValue({ ok: true, data: { auditId: 2, sessionsEnded: 1 } }),
    adminListAudit: vi.fn().mockResolvedValue({ ok: true, data: { entries: [], hasMore: false } }),
    adminScrapeHealth: vi.fn().mockResolvedValue({ ok: true, data: { since: '2026-09-26T00:00:00Z', runs: [], sources: [], activeJobsBySource: {} } }),
    adminListContent: vi.fn().mockResolvedValue({ ok: true, data: { kind: 'lessons', items: [lesson] } }),
    adminUpdateLesson: vi.fn().mockResolvedValue({ ok: true, data: { auditId: 3, version: 3 } }),
    adminSetResourceStatus: vi.fn(),
    adminContentHistory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    adminListUpiOrders: vi.fn().mockResolvedValue({ ok: true, data: [upiOrder()] }),
    adminReviewUpiOrder: vi.fn().mockResolvedValue({ ok: true, data: { auditId: 4, status: 'approved', tier: 'pro', expiresAt: '2026-11-17T00:00:00Z' } }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderAdmin = (user: any = ADMIN) => render(<UIProvider><AdminView currentUser={user} /></UIProvider>);

describe('AdminView', () => {
  it('shows nothing admin-related to a non-admin and makes no calls', () => {
    const api = mockApi();
    renderAdmin({ ...ADMIN, role: 'user' });
    expect(screen.getByText('Admin access required')).toBeTruthy();
    expect(api.adminListUsers).not.toHaveBeenCalled();
  });

  it('lists users from the server and searches on submit', async () => {
    const api = mockApi();
    renderAdmin();
    expect(await screen.findByText('Target User')).toBeTruthy();
    expect(api.adminListUsers).toHaveBeenLastCalledWith({ query: undefined, status: undefined, tier: undefined, limit: 50, offset: 0 });
    await userEvent.type(screen.getByRole('textbox', { name: /search users/i }), 'target{Enter}');
    await waitFor(() => expect(api.adminListUsers).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'target', offset: 0 })));
  });

  it('shows the server refusal with a retry', async () => {
    const api = mockApi({ adminListUsers: vi.fn().mockResolvedValue({ ok: false, code: 'forbidden', error: 'This account does not have admin access.' }) });
    renderAdmin();
    expect(await screen.findByText(/does not have admin access/i)).toBeTruthy();
    api.adminListUsers.mockResolvedValue({ ok: true, data: { users: users(), total: 2 } });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Target User')).toBeTruthy();
  });

  it('suspends a user only after confirmation with a reason, and refreshes', async () => {
    const api = mockApi();
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage target@x.co' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suspend account' });
    // Reason is required; nothing is sent without it.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    expect(await within(dialog).findByText(/at least 3 characters/i)).toBeTruthy();
    expect(api.adminSetUserStatus).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /reason/i }), 'Chargeback, ticket 7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    await waitFor(() => expect(api.adminSetUserStatus).toHaveBeenCalledWith({ targetId: TARGET, status: 'suspended', reason: 'Chargeback, ticket 7' }));
    await waitFor(() => expect(api.adminListUsers).toHaveBeenCalledTimes(2));
  });

  it('keeps the dialog open and shows the server error when a change is refused', async () => {
    mockApi({ adminSetUserStatus: vi.fn().mockResolvedValue({ ok: false, code: 'cannot_change_self', error: 'You cannot change your own account.' }) });
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage target@x.co' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suspend account' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /reason/i }), 'Testing refusal');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    expect(await within(dialog).findByText('You cannot change your own account.')).toBeTruthy();
  });

  it('does not offer changes on the admin\'s own account', async () => {
    mockApi();
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage admin@x.co' }));
    expect(await screen.findByText(/This is your own account/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suspend account' })).toBe(null);
  });

  it('shows audit entries in plain language', async () => {
    mockApi({
      adminListAudit: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          entries: [{ id: 9, actorId: ADMIN.id, actorEmail: 'admin@x.co', action: 'user.plan_changed', targetType: 'user', targetId: TARGET, targetLabel: 'target@x.co', reason: 'Paid by transfer', before: { tier: 'trial', expires_at: null }, after: { tier: 'pro', expires_at: null }, createdAt: new Date().toISOString() }],
          hasMore: false,
        },
      }),
    });
    renderAdmin();
    await userEvent.click(screen.getByRole('tab', { name: /audit log/i }));
    expect(await screen.findByText('Changed plan')).toBeTruthy();
    expect(screen.getByText('Free trial to Pro')).toBeTruthy();
    expect(screen.getByText('Paid by transfer')).toBeTruthy();
  });

  it('approves a UPI payment only after confirmation with a reason, and refreshes the queue', async () => {
    const api = mockApi();
    renderAdmin();
    await userEvent.click(screen.getByRole('tab', { name: /payments/i }));
    expect(await screen.findByText('412345678901')).toBeTruthy();
    expect(api.adminListUpiOrders).toHaveBeenLastCalledWith({ status: 'submitted' });
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve payment' });
    expect(within(dialog).getByText('NMD-7K3Q9X')).toBeTruthy();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /reason/i }), 'UTR on HDFC statement');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and activate plan' }));
    await waitFor(() => expect(api.adminReviewUpiOrder).toHaveBeenCalledWith({ orderId: UPI_ORDER, decision: 'approve', reason: 'UTR on HDFC statement' }));
    await waitFor(() => expect(api.adminListUpiOrders).toHaveBeenCalledTimes(2));
  });

  it('shows an empty payments queue', async () => {
    mockApi({ adminListUpiOrders: vi.fn().mockResolvedValue({ ok: true, data: [] }) });
    renderAdmin();
    await userEvent.click(screen.getByRole('tab', { name: /payments/i }));
    expect(await screen.findByText('No payments waiting for review')).toBeTruthy();
  });

  it('shows scraper health with failing sources first and an empty state', async () => {
    const api = mockApi({
      adminScrapeHealth: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          since: '2026-09-26T00:00:00Z',
          runs: [{ id: 'r1', runId: 'x', source: 'internshala', tier: 1, status: 'error', startedAt: '2026-10-03T10:00:00Z', finishedAt: '2026-10-03T10:00:01Z', durationMs: 500, fetched: 0, valid: 0, invalid: 0, duplicates: 0, linkFailed: 0, upserted: 0, expired: 0, error: 'HTTP 503', alert: null, published: true }],
          sources: [
            { source: 'naukri', runs: 3, failures: 0, lastRunAt: '2026-10-03T09:00:00Z', lastStatus: 'ok', lastOkAt: '2026-10-03T09:00:00Z', lastError: null, fetched: 90, upserted: 80, linkFailed: 0, avgDurationMs: 1000 },
            { source: 'internshala', runs: 2, failures: 1, lastRunAt: '2026-10-03T10:00:00Z', lastStatus: 'error', lastOkAt: '2026-10-02T10:00:00Z', lastError: 'HTTP 503', fetched: 50, upserted: 40, linkFailed: 1, avgDurationMs: 800 },
          ],
          activeJobsBySource: { naukri: 120, internshala: 30 },
        },
      }),
    });
    renderAdmin();
    await userEvent.click(screen.getByRole('tab', { name: /scraper health/i }));
    const sources = await screen.findByRole('table', { name: 'Sources' });
    const rows = within(sources).getAllByRole('row');
    expect(within(rows[1]).getByText('internshala')).toBeTruthy();
    expect(within(rows[1]).getByText('Failing')).toBeTruthy();
    expect(within(rows[2]).getByText('Healthy')).toBeTruthy();

    api.adminScrapeHealth.mockResolvedValue({ ok: true, data: { since: 'x', runs: [], sources: [], activeJobsBySource: {} } });
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(await screen.findByText(/no scraper runs in this window/i)).toBeTruthy();
  });

  it('edits a lesson with a version check, a reason, and no links', async () => {
    const api = mockApi();
    renderAdmin();
    await userEvent.click(screen.getByRole('tab', { name: /content/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Intro to arrays' }));
    const text = await screen.findByRole('textbox', { name: /lesson text/i });

    await userEvent.clear(text);
    await userEvent.type(text, 'Read more at https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Review and save' }));
    expect(await screen.findByText(/cannot contain links/i)).toBeTruthy();

    await userEvent.clear(text);
    await userEvent.type(text, 'Arrays store items in order.');
    await userEvent.click(screen.getByRole('button', { name: 'Review and save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save lesson' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /reason/i }), 'Clearer wording');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save as version 3' }));
    await waitFor(() => expect(api.adminUpdateLesson).toHaveBeenCalledWith({
      id: 'arrays-intro', expectedVersion: 2, title: 'Intro to arrays', summaryMd: 'Arrays store items in order.',
      keyPoints: ['Index from 0'], status: 'draft', reason: 'Clearer wording',
    }));
  });

  it('never offers to add or generate resources', async () => {
    mockApi({
      adminListContent: vi.fn().mockImplementation(async (q: any) => q.kind === 'resources'
        ? { ok: true, data: { kind: 'resources', items: [{ id: 'r1', title: 'MDN Arrays', url: 'https://developer.mozilla.org/x', provider: 'MDN', type: 'doc', status: 'broken', version: 1, skillIds: ['arrays'], lastChecked: '2026-10-01T00:00:00Z', httpStatus: 404, failCount: 2, source: 'seed', updatedAt: null }] } }
        : { ok: true, data: { kind: q.kind, items: [] } }),
    });
    renderAdmin();
    await userEvent.click(screen.getByRole('tab', { name: /content/i }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Resources' }));
    expect(await screen.findByText('MDN Arrays')).toBeTruthy();
    expect(screen.getByText(/HTTP 404/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add|generate|new resource/i })).toBe(null);
    expect(screen.getByRole('button', { name: 'Change status of MDN Arrays' })).toBeTruthy();
  });
});
