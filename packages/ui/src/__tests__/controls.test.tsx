// @vitest-environment jsdom
import './setup';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from 'lucide-react';
import { Button, Checkbox, Combobox, Field, IconButton, Input, ProgressRing, RadioGroup, Switch, TooltipProvider } from '../index';

describe('Switch', () => {
  it('toggles with click, Space and its label, reporting aria-checked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch label="Auto-apply" description="Apply to new matches" onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Auto-apply' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.getAttribute('aria-describedby')).toBeTruthy();

    await user.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith(true);

    await user.keyboard(' ');
    expect(sw.getAttribute('aria-checked')).toBe('false');

    await user.click(screen.getByText('Auto-apply'));
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('works controlled and respects disabled', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [on, setOn] = React.useState(true);
      return (
        <>
          <Switch aria-label="Notifications" checked={on} onCheckedChange={setOn} />
          <Switch aria-label="Locked" disabled />
          <output>{on ? 'on' : 'off'}</output>
        </>
      );
    }
    render(<Controlled />);
    await user.click(screen.getByRole('switch', { name: 'Notifications' }));
    expect(screen.getByText('off')).toBeTruthy();
    const locked = screen.getByRole('switch', { name: 'Locked' });
    await user.click(locked);
    expect(locked.getAttribute('aria-checked')).toBe('false');
  });
});

describe('Button', () => {
  it('ignores clicks while loading and exposes aria-busy', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick} loading>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Button onClick={onClick}>Save</Button>);
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is keyboard operable with Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe('IconButton', () => {
  it('always has an accessible name and shows its tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <IconButton label="Search" icon={<Search />} shortcut={['Ctrl', 'K']} />
      </TooltipProvider>,
    );
    const btn = screen.getByRole('button', { name: 'Search' });
    await user.tab();
    expect(document.activeElement).toBe(btn);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Search');
    await user.keyboard('{Escape}');
  });
});

describe('Field + Input', () => {
  it('wires label, hint and error to the control', () => {
    const { rerender } = render(
      <Field label="Email" hint="We never share it">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    const hintId = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(hintId)?.textContent).toBe('We never share it');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    rerender(
      <Field label="Email" hint="We never share it" error="Enter a valid email">
        <Input type="email" />
      </Field>,
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid email');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });
});

describe('Checkbox and RadioGroup', () => {
  it('checkbox toggles with Space and label click', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Remote only" />);
    const cb = screen.getByRole('checkbox', { name: 'Remote only' });
    await user.click(screen.getByText('Remote only'));
    expect(cb.getAttribute('aria-checked')).toBe('true');
    cb.focus();
    await user.keyboard(' ');
    expect(cb.getAttribute('aria-checked')).toBe('false');
  });

  it('radio group uses arrow keys to move selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroup
        aria-label="Pace"
        defaultValue="steady"
        onValueChange={onValueChange}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'steady', label: 'Steady' },
          { value: 'intense', label: 'Intense' },
        ]}
      />,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Steady' }));
    // Hold the key: Radix selects on the (deferred) focus while an arrow key is down.
    await user.keyboard('{ArrowDown>}');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Intense' }).getAttribute('aria-checked')).toBe('true'));
    await user.keyboard('{/ArrowDown}');
    expect(onValueChange).toHaveBeenLastCalledWith('intense');
  });
});

describe('Combobox', () => {
  const options = [
    { value: 'fe', label: 'Frontend engineer' },
    { value: 'be', label: 'Backend engineer' },
    { value: 'pm', label: 'Product manager' },
  ];

  it('filters while typing and selects with arrows + Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox aria-label="Role" options={options} onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Role' });
    await user.type(input, 'eng');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Frontend engineer', 'Backend engineer']);

    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('be', options[1]);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect((input as HTMLInputElement).value).toBe('Backend engineer');
  });

  it('Escape closes the list and restores the selected text', async () => {
    const user = userEvent.setup();
    render(<Combobox aria-label="Role" options={options} value="pm" />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('Product manager');
    await user.clear(input);
    await user.type(input, 'xyz');
    expect(screen.getByText('No matches')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('Product manager');
  });
});

describe('ProgressRing', () => {
  it('exposes progressbar semantics', () => {
    render(<ProgressRing label="Profile" value={42} />);
    const bar = screen.getByRole('progressbar', { name: 'Profile' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuetext')).toBe('42%');
  });

  it('omits value attributes when indeterminate', () => {
    render(<ProgressRing label="Syncing" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
  });
});
