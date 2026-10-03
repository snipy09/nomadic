/**
 * Nomadic design tokens.
 *
 * One accent (ultramarine, from the brand mark), a cool ink-tinted neutral scale,
 * two type weights (400 / 600), a 4 / 8 pt spacing grid, crisp radii, three
 * elevations and a small motion vocabulary.
 *
 * Colours are exposed to CSS as space-separated RGB channels
 * (`--nm-accent: 35 56 224`) so Tailwind can apply opacity
 * (`bg-accent/20`). `styles.css` holds the same values; a unit test keeps the
 * two in sync.
 */

export type ThemeName = 'light' | 'dark';

export const colorTokenNames = [
  'canvas',
  'surface',
  'surface-raised',
  'surface-sunken',
  'surface-hover',
  'surface-active',
  'line',
  'line-strong',
  'fg',
  'fg-muted',
  'fg-subtle',
  'fg-disabled',
  'accent',
  'accent-hover',
  'accent-active',
  'accent-fg',
  'accent-subtle',
  'accent-subtle-fg',
  'focus',
  'success',
  'success-subtle',
  'success-fg',
  'warning',
  'warning-subtle',
  'warning-fg',
  'danger',
  'danger-subtle',
  'danger-fg',
  'overlay',
] as const;

export type ColorToken = (typeof colorTokenNames)[number];

/** Hex values per theme. */
export const colors: Record<ThemeName, Record<ColorToken, string>> = {
  light: {
    canvas: '#F5F6FA',
    surface: '#FFFFFF',
    'surface-raised': '#FFFFFF',
    'surface-sunken': '#EEF0F6',
    'surface-hover': '#F1F2F7',
    'surface-active': '#E7E9F1',
    line: '#E3E6EF',
    'line-strong': '#CBD0E2',
    fg: '#0A0F2C',
    'fg-muted': '#4A5170',
    'fg-subtle': '#6B7290',
    'fg-disabled': '#A9B0D0',
    accent: '#2338E0',
    'accent-hover': '#1D30C4',
    'accent-active': '#1A2AB0',
    'accent-fg': '#FFFFFF',
    'accent-subtle': '#ECEEFD',
    'accent-subtle-fg': '#1A2AB0',
    focus: '#2338E0',
    success: '#12805C',
    'success-subtle': '#E6F4EE',
    'success-fg': '#0E6B4C',
    warning: '#B86E00',
    'warning-subtle': '#FDF3DC',
    'warning-fg': '#8A5200',
    danger: '#D22C3C',
    'danger-subtle': '#FCEBEC',
    'danger-fg': '#AE1F2E',
    overlay: '#0A0F2C',
  },
  dark: {
    canvas: '#0A0C14',
    surface: '#11131D',
    'surface-raised': '#181B27',
    'surface-sunken': '#0D0F18',
    'surface-hover': '#1C1F2C',
    'surface-active': '#242838',
    line: '#232636',
    'line-strong': '#33374A',
    fg: '#ECEEF6',
    'fg-muted': '#A4AAC2',
    'fg-subtle': '#7A809A',
    'fg-disabled': '#4C5168',
    accent: '#3D51F2',
    'accent-hover': '#5063F5',
    'accent-active': '#3346E0',
    'accent-fg': '#FFFFFF',
    'accent-subtle': '#1A1F44',
    'accent-subtle-fg': '#AEB8FA',
    focus: '#7C8BF7',
    success: '#3CC68A',
    'success-subtle': '#10261E',
    'success-fg': '#6FDCAA',
    warning: '#F2B33D',
    'warning-subtle': '#2A2112',
    'warning-fg': '#F7C96B',
    danger: '#DA3442',
    'danger-subtle': '#2E1418',
    'danger-fg': '#F7868D',
    overlay: '#03040A',
  },
};

/** Brand constants. Marigold is reserved for the logo mark; it is not a UI accent. */
export const brand = {
  ultramarine: '#2338E0',
  ink: '#0A0F2C',
  fog: '#EEF0F6',
  marigold: '#FFC21A',
} as const;

export const fontFamily = {
  sans: ['"Archivo Variable"', 'Archivo', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
  mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', '"Cascadia Code"', 'Menlo', 'Consolas', 'monospace'],
} as const;

/** The only two weights in the system. */
export const fontWeight = { regular: 400, strong: 600 } as const;

/**
 * Type scale, dense desktop first. [size, line-height, letter-spacing].
 * Names avoid Tailwind's defaults so adding the preset never restyles old screens.
 */
export const fontSize = {
  caption: ['11px', '16px', '0.01em'],
  label: ['12px', '16px', '0'],
  body: ['13px', '20px', '-0.003em'],
  'body-lg': ['14px', '22px', '-0.006em'],
  heading: ['16px', '24px', '-0.011em'],
  title: ['20px', '28px', '-0.014em'],
  headline: ['24px', '32px', '-0.018em'],
  display: ['32px', '40px', '-0.022em'],
} as const;

/** 4 / 8 pt grid in px. Matches Tailwind's default spacing (1 unit = 4px). */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Radii in px. Small and crisp to echo the brand's 4px web corners. */
export const radius = {
  sm: 4, // badges, kbd, checkboxes
  md: 6, // buttons, inputs, menu items
  lg: 8, // cards, popovers, tables
  xl: 12, // dialogs, drawers
  full: 9999,
} as const;

export const shadow: Record<ThemeName, { e1: string; e2: string; e3: string }> = {
  light: {
    e1: '0 1px 2px 0 rgb(10 15 44 / 0.05)',
    e2: '0 4px 12px -2px rgb(10 15 44 / 0.10), 0 2px 4px -2px rgb(10 15 44 / 0.06)',
    e3: '0 20px 48px -12px rgb(10 15 44 / 0.25), 0 4px 12px -4px rgb(10 15 44 / 0.08)',
  },
  dark: {
    e1: '0 1px 2px 0 rgb(0 0 0 / 0.35)',
    e2: '0 8px 24px -4px rgb(0 0 0 / 0.55), 0 2px 6px -2px rgb(0 0 0 / 0.40)',
    e3: '0 24px 64px -12px rgb(0 0 0 / 0.70), 0 4px 16px -4px rgb(0 0 0 / 0.50)',
  },
};

/** Motion. Durations collapse and movement is removed under prefers-reduced-motion. */
export const motion = {
  duration: { fast: '120ms', base: '180ms', slow: '260ms' },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    out: 'cubic-bezier(0.2, 0.7, 0.1, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

export const zIndex = {
  sticky: 10,
  dropdown: 40,
  overlay: 50,
  modal: 50,
  toast: 60,
  tooltip: 70,
} as const;

/** Control heights in px for each size. */
export const controlHeight = { sm: 28, md: 32, lg: 36 } as const;

/** `var(--nm-<token>)` helper for inline styles: `rgb(${cssVar('accent')})`. */
export function cssVar(token: ColorToken): string {
  return `var(--nm-${token})`;
}

/** Convert `#RRGGBB` to the `R G B` channel string used by the CSS variables. */
export function hexToChannels(hex: string): string {
  const v = hex.replace('#', '');
  const n = parseInt(v, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export const tokens = { colors, brand, fontFamily, fontWeight, fontSize, space, radius, shadow, motion, zIndex, controlHeight };
