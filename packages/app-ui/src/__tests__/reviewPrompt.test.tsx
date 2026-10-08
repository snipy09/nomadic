// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { ReviewDialog } from '../features/review/ReviewDialog';
import { ASK_DELAY_MS, snoozeOver, snoozeUntil, susScore } from '../features/review/reviewLogic';
import { prefs } from '../store/preferences';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  delete (window as any).api;
});

function mockApi(due: boolean, submit = vi.fn().mockResolvedValue({ success: true })) {
  const api = { appReviewStatus: vi.fn().mockResolvedValue({ due }), appReviewSubmit: submit };
  (window as any).api = api;
  return api;
}

async function renderAndWait(email = 'asha@example.com', enabled = true) {
  vi.useFakeTimers();
  render(<UIProvider><ReviewDialog email={email} enabled={enabled} /></UIProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(ASK_DELAY_MS); });
  vi.useRealTimers();
}

describe('reviewLogic', () => {
  it('scores the System Usability Scale', () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([4, 2, 4, 2, 4, 2, 4, 1, 4, 2])).toBe(77.5);
  });

  it('snoozes for a few days', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    expect(snoozeOver(null, now)).toBe(true);
    expect(snoozeOver(snoozeUntil(now), now)).toBe(false);
    expect(snoozeOver(snoozeUntil(now), new Date('2026-10-11T10:00:01Z'))).toBe(true);
    expect(snoozeOver('not a date', now)).toBe(true);
  });
});

describe('ReviewDialog', () => {
  it('stays hidden when the review is not due', async () => {
    const api = mockApi(false);
    await renderAndWait();
    await waitFor(() => expect(api.appReviewStatus).toHaveBeenCalled());
    expect(screen.queryByText('How is Nomadic going?')).toBeNull();
  });

  it('does not ask while snoozed or while disabled', async () => {
    const api = mockApi(true);
    prefs.setReviewSnoozedUntil('asha@example.com', new Date(Date.now() + 86_400_000).toISOString());
    await renderAndWait();
    cleanup();
    await renderAndWait('ravi@example.com', false);
    expect(api.appReviewStatus).not.toHaveBeenCalled();
  });

  it('asks after the delay, collects both steps and sends the answers', async () => {
    const api = mockApi(true);
    await renderAndWait();
    expect(await screen.findByText('How is Nomadic going?')).toBeTruthy();
    const user = userEvent.setup();

    const next = screen.getByRole('button', { name: 'Next' });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    const recommend = screen.getByRole('radiogroup', { name: /recommend Nomadic, 0 to 10/ });
    await user.click(recommend.querySelectorAll('[role="radio"]')[9] as HTMLElement);
    await user.type(screen.getByLabelText(/best thing/), 'Job matches');
    await user.click(next);

    await user.click(screen.getByRole('button', { name: 'Send review' }));
    expect(api.appReviewSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText('Pick an answer.')).toHaveLength(10);

    for (const group of screen.getAllByRole('radiogroup')) {
      await user.click(group.querySelectorAll('[role="radio"]')[3] as HTMLElement);
    }
    await user.click(screen.getByRole('button', { name: 'Send review' }));
    await waitFor(() => expect(api.appReviewSubmit).toHaveBeenCalledTimes(1));
    expect(api.appReviewSubmit).toHaveBeenCalledWith({
      platform: 'windows',
      sus: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      recommend: 9,
      best: 'Job matches',
      frustrating: undefined,
    });
    expect(await screen.findByText('Thank you')).toBeTruthy();
  });

  it('"Not now" closes and snoozes on this device', async () => {
    mockApi(true);
    await renderAndWait();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('How is Nomadic going?')).toBeNull();
    expect(snoozeOver(prefs.getReviewSnoozedUntil('asha@example.com'), new Date())).toBe(false);
  });

  it('shows the server error and keeps the answers', async () => {
    mockApi(true, vi.fn().mockResolvedValue({ success: false, error: 'You have already sent a review. Thank you.' }));
    await renderAndWait();
    const user = userEvent.setup();
    const recommend = await screen.findByRole('radiogroup', { name: /recommend Nomadic/ });
    await user.click(recommend.querySelectorAll('[role="radio"]')[5] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    for (const group of screen.getAllByRole('radiogroup')) {
      await user.click(group.querySelectorAll('[role="radio"]')[0] as HTMLElement);
    }
    await user.click(screen.getByRole('button', { name: 'Send review' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already sent');
    expect(screen.getByRole('button', { name: 'Send review' })).toBeTruthy();
  });
});
