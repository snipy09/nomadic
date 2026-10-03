// @vitest-environment jsdom
import './setup';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../index';

function Example({ manual }: { manual?: boolean }) {
  return (
    <Tabs defaultValue="feed" activationMode={manual ? 'manual' : 'automatic'}>
      <TabsList aria-label="Sections">
        <TabsTrigger value="feed">Feed</TabsTrigger>
        <TabsTrigger value="saved" count={4}>
          Saved
        </TabsTrigger>
        <TabsTrigger value="archived" disabled>
          Archived
        </TabsTrigger>
        <TabsTrigger value="applied">Applied</TabsTrigger>
      </TabsList>
      <TabsContent value="feed">Feed panel</TabsContent>
      <TabsContent value="saved">Saved panel</TabsContent>
      <TabsContent value="archived">Archived panel</TabsContent>
      <TabsContent value="applied">Applied panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('exposes tablist/tab/tabpanel roles with selection state', () => {
    render(<Example />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy();
    const feed = screen.getByRole('tab', { name: 'Feed' });
    expect(feed.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toBe('Feed panel');
    expect(panel.getAttribute('aria-labelledby')).toBe(feed.id);
  });

  it('moves with arrow keys, skips disabled tabs, wraps, and supports Home/End', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Feed' }));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Saved/ }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Saved panel');

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Applied' }));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Feed' }));

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Applied' }));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Feed' }));
  });

  it('Tab key leaves the tablist and lands on the active panel', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tabpanel'));
  });

  it('manual activation needs Enter/Space', async () => {
    const user = userEvent.setup();
    render(<Example manual />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tabpanel').textContent).toBe('Feed panel');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tabpanel').textContent).toBe('Saved panel');
  });
});
