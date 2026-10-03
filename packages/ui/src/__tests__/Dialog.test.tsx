// @vitest-environment jsdom
import './setup';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Drawer, DrawerContent, DrawerTrigger, Input } from '../index';

function Example({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <>
      <button type="button">Outside</button>
      <Dialog onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button>Open dialog</Button>
        </DialogTrigger>
        <DialogContent
          title="Rename project"
          description="Names are visible to your team."
          footer={
            <>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button variant="primary">Save</Button>
            </>
          }
        >
          <Input aria-label="Project name" defaultValue="Nomadic" />
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens with an accessible name/description and moves focus inside', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const dialog = await screen.findByRole('dialog', { name: 'Rename project' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Names are visible to your team.').id).toBe(dialog.getAttribute('aria-describedby'));
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('traps focus: Tab and Shift+Tab cycle within the dialog', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog');

    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(screen.getByRole('button', { name: 'Outside', hidden: true })).not.toBe(document.activeElement);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes from the corner close button', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Drawer', () => {
  it('is a modal dialog that closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger asChild>
          <Button>Review</Button>
        </DrawerTrigger>
        <DrawerContent title="Application review">
          <Button>Approve</Button>
        </DrawerContent>
      </Drawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Review' }));
    const drawer = await screen.findByRole('dialog', { name: 'Application review' });
    expect(drawer.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
