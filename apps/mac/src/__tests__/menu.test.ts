import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

describe('macOS menu', () => {
  it('has the app, Edit, View, Window and Help menus, so Cmd shortcuts work', async () => {
    const { macMenuTemplate } = await import('../menu');
    const menu = macMenuTemplate('Nomadic');
    expect(menu.map((m) => m.label ?? m.role)).toEqual(['Nomadic', 'editMenu', 'View', 'windowMenu', 'help']);
    const appMenu = menu[0].submenu as { role?: string }[];
    expect(appMenu.map((i) => i.role).filter(Boolean)).toEqual(['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit']);
  });
});
