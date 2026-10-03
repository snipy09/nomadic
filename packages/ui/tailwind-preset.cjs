/**
 * Tailwind 3 preset for @nomadic/ui.
 *
 *   // tailwind.config.js
 *   presets: [require('@nomadic/ui/tailwind-preset')],
 *   content: [..., '../../packages/ui/src/**\/*.{ts,tsx}'],
 *
 * Everything lives under `extend` with names that do not collide with
 * Tailwind defaults, so adding the preset never restyles existing screens.
 * Colours resolve to the CSS variables in `src/styles.css`, which flip for
 * dark mode, so components need no `dark:` variants.
 *
 * Values mirror src/tokens.ts (checked by tokens.test.ts).
 */

const c = (name) => `rgb(var(--nm-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        canvas: c('canvas'),
        surface: {
          DEFAULT: c('surface'),
          raised: c('surface-raised'),
          sunken: c('surface-sunken'),
          hover: c('surface-hover'),
          active: c('surface-active'),
        },
        line: {
          DEFAULT: c('line'),
          strong: c('line-strong'),
        },
        fg: {
          DEFAULT: c('fg'),
          muted: c('fg-muted'),
          subtle: c('fg-subtle'),
          disabled: c('fg-disabled'),
        },
        accent: {
          DEFAULT: c('accent'),
          hover: c('accent-hover'),
          active: c('accent-active'),
          fg: c('accent-fg'),
          subtle: c('accent-subtle'),
          'subtle-fg': c('accent-subtle-fg'),
        },
        focus: c('focus'),
        success: { DEFAULT: c('success'), subtle: c('success-subtle'), fg: c('success-fg') },
        warning: { DEFAULT: c('warning'), subtle: c('warning-subtle'), fg: c('warning-fg') },
        danger: { DEFAULT: c('danger'), subtle: c('danger-subtle'), fg: c('danger-fg') },
        overlay: c('overlay'),
      },
      fontFamily: {
        sans: ['"Archivo Variable"', 'Archivo', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', '"Cascadia Code"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        caption: ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        label: ['12px', { lineHeight: '16px', letterSpacing: '0' }],
        body: ['13px', { lineHeight: '20px', letterSpacing: '-0.003em' }],
        'body-lg': ['14px', { lineHeight: '22px', letterSpacing: '-0.006em' }],
        heading: ['16px', { lineHeight: '24px', letterSpacing: '-0.011em' }],
        title: ['20px', { lineHeight: '28px', letterSpacing: '-0.014em' }],
        headline: ['24px', { lineHeight: '32px', letterSpacing: '-0.018em' }],
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.022em' }],
      },
      fontWeight: {
        regular: '400',
        strong: '600',
      },
      // Radii use Tailwind's defaults: rounded (4px) badges/kbd, rounded-md (6px) controls,
      // rounded-lg (8px) cards/popovers, rounded-xl (12px) dialogs/drawers.
      boxShadow: {
        e1: 'var(--nm-shadow-e1)',
        e2: 'var(--nm-shadow-e2)',
        e3: 'var(--nm-shadow-e3)',
      },
      height: { 'ctl-sm': '28px', 'ctl-md': '32px', 'ctl-lg': '36px' },
      minHeight: { 'ctl-sm': '28px', 'ctl-md': '32px', 'ctl-lg': '36px' },
      width: { 'ctl-sm': '28px', 'ctl-md': '32px', 'ctl-lg': '36px' },
      size: { 'ctl-sm': '28px', 'ctl-md': '32px', 'ctl-lg': '36px' },
      zIndex: { sticky: '10', dropdown: '40', overlay: '50', modal: '50', toast: '60', tooltip: '70' },
      transitionDuration: {
        fast: 'var(--nm-dur-fast)',
        base: 'var(--nm-dur-base)',
        slow: 'var(--nm-dur-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--nm-ease-standard)',
        out: 'var(--nm-ease-out)',
        in: 'var(--nm-ease-in)',
      },
      keyframes: {
        'nm-fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'nm-fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'nm-pop-in': {
          from: { opacity: '0', transform: 'translateY(var(--nm-motion-shift)) scale(var(--nm-motion-scale))' },
          to: { opacity: '1', transform: 'none' },
        },
        'nm-pop-out': {
          from: { opacity: '1', transform: 'none' },
          to: { opacity: '0', transform: 'scale(var(--nm-motion-scale))' },
        },
        'nm-drawer-in-right': { from: { transform: 'translateX(var(--nm-motion-drawer))', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'nm-drawer-out-right': { from: { transform: 'none', opacity: '1' }, to: { transform: 'translateX(var(--nm-motion-drawer))', opacity: '0' } },
        'nm-drawer-in-left': { from: { transform: 'translateX(calc(var(--nm-motion-drawer) * -1))', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'nm-drawer-out-left': { from: { transform: 'none', opacity: '1' }, to: { transform: 'translateX(calc(var(--nm-motion-drawer) * -1))', opacity: '0' } },
        'nm-toast-in': {
          from: { opacity: '0', transform: 'translateY(calc(var(--nm-motion-shift) * 2))' },
          to: { opacity: '1', transform: 'none' },
        },
        'nm-toast-out': { from: { opacity: '1' }, to: { opacity: '0', transform: 'scale(var(--nm-motion-scale))' } },
        'nm-spin': { to: { transform: 'rotate(360deg)' } },
        'nm-shimmer': { from: { backgroundPosition: '150% 0' }, to: { backgroundPosition: '-50% 0' } },
      },
      animation: {
        'nm-fade-in': 'nm-fade-in var(--nm-dur-base) var(--nm-ease-out) both',
        'nm-fade-out': 'nm-fade-out var(--nm-dur-fast) var(--nm-ease-in) both',
        'nm-pop-in': 'nm-pop-in var(--nm-dur-base) var(--nm-ease-out) both',
        'nm-pop-out': 'nm-pop-out var(--nm-dur-fast) var(--nm-ease-in) both',
        'nm-drawer-in-right': 'nm-drawer-in-right var(--nm-dur-slow) var(--nm-ease-out) both',
        'nm-drawer-out-right': 'nm-drawer-out-right var(--nm-dur-base) var(--nm-ease-in) both',
        'nm-drawer-in-left': 'nm-drawer-in-left var(--nm-dur-slow) var(--nm-ease-out) both',
        'nm-drawer-out-left': 'nm-drawer-out-left var(--nm-dur-base) var(--nm-ease-in) both',
        'nm-toast-in': 'nm-toast-in var(--nm-dur-slow) var(--nm-ease-out) both',
        'nm-toast-out': 'nm-toast-out var(--nm-dur-fast) var(--nm-ease-in) both',
        'nm-spin': 'nm-spin var(--nm-motion-spin) linear infinite',
        'nm-shimmer': 'nm-shimmer 1.6s linear infinite',
      },
    },
  },
};
