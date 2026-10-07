/** What the Help screen lists. Every shortcut here is implemented in the app; every link exists. */
import { RELEASES_URL, SUPPORT_EMAIL, WEBSITE_URL } from '@nomadic/app-core/shared/support';

export interface Shortcut {
  keys: string[];
  action: string;
  where: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl', 'K'], action: 'Open search and commands', where: 'Anywhere (⌘ K on macOS)' },
  { keys: ['G', 'H'], action: 'Go to Home', where: 'Anywhere outside a text field' },
  { keys: ['G', 'L'], action: 'Go to Learn (P Practice, R Projects)', where: 'Anywhere outside a text field' },
  { keys: ['G', 'J'], action: 'Go to Job board (A Applications, W Answers)', where: 'Anywhere outside a text field' },
  { keys: ['G', 'S'], action: 'Go to Settings', where: 'Anywhere outside a text field' },
  { keys: ['['], action: 'Collapse or expand the sidebar', where: 'Anywhere outside a text field' },
  { keys: ['↑', '↓'], action: 'Move between results', where: 'Search and commands' },
  { keys: ['Home', 'End'], action: 'First or last result', where: 'Search and commands' },
  { keys: ['Enter'], action: 'Run the selected command', where: 'Search and commands' },
  { keys: ['↑', '↓'], action: 'Move between applications', where: 'Apply review list' },
  { keys: ['Esc'], action: 'Close a dialog or menu', where: 'Dialogs and menus' },
  { keys: ['Tab'], action: 'Move to the next control', where: 'Everywhere' },
];

export interface HelpLink {
  label: string;
  description: string;
  href: string;
}

export const HELP_LINKS: HelpLink[] = [
  { label: 'Nomadic website', description: 'Plans, privacy and downloads.', href: WEBSITE_URL },
  { label: 'Release notes', description: 'What changed in each version.', href: RELEASES_URL },
  { label: `Email ${SUPPORT_EMAIL}`, description: 'Questions about your account or billing.', href: `mailto:${SUPPORT_EMAIL}` },
];
