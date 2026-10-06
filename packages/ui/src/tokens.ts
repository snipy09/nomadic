/**
 * Nomadic design tokens.
 *
 * Apple design language: system neutrals, the SF Pro type stack (Inter where SF is not
 * installed), large continuous-looking radii, soft layered shadows and spring-like motion.
 * One tint colour (ultramarine, from the brand mark); weights 400 / 600, 700 for large titles.
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
/** Hex values per theme: Apple system neutrals (#F5F5F7 canvas, #1D1D1F text), the brand ultramarine as the tint colour. */
export const colors: Record<ThemeName, Record<ColorToken, string>> = {
  light: {
    canvas: '#F5F5F7',
    surface: '#FFFFFF',
    'surface-raised': '#FFFFFF',
    'surface-sunken': '#EFEFF2',
    'surface-hover': '#F0F0F3',
    'surface-active': '#E6E6EB',
    line: '#E3E3E8',
    'line-strong': '#D1D1D6',
    fg: '#1D1D1F',
    'fg-muted': '#5E5E63',
    'fg-subtle': '#6E6E73',
    'fg-disabled': '#C7C7CC',
    accent: '#2338E0',
    'accent-hover': '#1D30C4',
    'accent-active': '#1A2AB0',
    'accent-fg': '#FFFFFF',
    'accent-subtle': '#ECEEFD',
    'accent-subtle-fg': '#1A2AB0',
    focus: '#2338E0',
    success: '#28A745',
    'success-subtle': '#E3F5E8',
    'success-fg': '#1B7A34',
    warning: '#F59300',
    'warning-subtle': '#FFF1DE',
    'warning-fg': '#9A4A00',
    danger: '#FF3B30',
    'danger-subtle': '#FFEBEA',
    'danger-fg': '#C0001A',
    overlay: '#000000',
  },
  dark: {
    canvas: '#000000',
    surface: '#1C1C1E',
    'surface-raised': '#323235',
    'surface-sunken': '#151517',
    'surface-hover': '#2A2A2D',
    'surface-active': '#3A3A3C',
    line: '#2E2E31',
    'line-strong': '#48484A',
    fg: '#F5F5F7',
    'fg-muted': '#AEAEB2',
    'fg-subtle': '#98989D',
    'fg-disabled': '#5A5A5E',
    accent: '#3D51F2',
    'accent-hover': '#5466F5',
    'accent-active': '#3346E0',
    'accent-fg': '#FFFFFF',
    'accent-subtle': '#1E2348',
    'accent-subtle-fg': '#B4BDFB',
    focus: '#7C8BF7',
    success: '#30D158',
    'success-subtle': '#0F2A17',
    'success-fg': '#4CD964',
    warning: '#FF9F0A',
    'warning-subtle': '#2E2108',
    'warning-fg': '#FFB340',
    danger: '#FF453A',
    'danger-subtle': '#3A1311',
    'danger-fg': '#FF6961',
    overlay: '#000000',
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
  sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Inter Variable"', 'Inter', '"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
  mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', '"Cascadia Code"', 'Menlo', 'Consolas', 'monospace'],
} as const;

/** Regular and semibold everywhere; bold only for large titles, as in Apple's type ramp. */
export const fontWeight = { regular: 400, strong: 600, bold: 700 } as const;

/**
 * Type scale, dense desktop first. [size, line-height, letter-spacing].
 * Names avoid Tailwind's defaults so adding the preset never restyles old screens.
 */
export const fontSize = {
  caption: ['11px', '16px', '0.006em'],
  label: ['12px', '16px', '-0.002em'],
  body: ['13px', '20px', '-0.006em'],
  'body-lg': ['14px', '20px', '-0.01em'],
  heading: ['15px', '22px', '-0.012em'],
  title: ['22px', '28px', '-0.02em'],
  headline: ['26px', '32px', '-0.022em'],
  display: ['34px', '41px', '-0.026em'],
} as const

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

/** Radii in px, Apple-like: generous and soft. Mapped onto Tailwind's rounded-* scale by the preset. */
export const radius = {
  sm: 6, // badges, kbd, checkboxes
  md: 8, // buttons, inputs, menu items
  lg: 12, // cards, popovers, tables
  xl: 16, // dialogs, drawers
  full: 9999,
} as const;

export const shadow: Record<ThemeName, { e1: string; e2: string; e3: string }> = {
  light: {
    e1: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.04)',
    e2: '0 6px 20px -4px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.05)',
    e3: '0 24px 60px -12px rgb(0 0 0 / 0.22), 0 8px 20px -6px rgb(0 0 0 / 0.08), 0 0 0 0.5px rgb(0 0 0 / 0.06)',
  },
  dark: {
    e1: '0 1px 2px 0 rgb(0 0 0 / 0.5)',
    e2: '0 8px 24px -4px rgb(0 0 0 / 0.6), 0 0 0 0.5px rgb(255 255 255 / 0.06)',
    e3: '0 24px 64px -12px rgb(0 0 0 / 0.75), 0 0 0 0.5px rgb(255 255 255 / 0.08)',
  },
};

/** Motion. Durations collapse and movement is removed under prefers-reduced-motion. */
export const motion = {
  duration: { fast: '120ms', base: '180ms', slow: '260ms' },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
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
