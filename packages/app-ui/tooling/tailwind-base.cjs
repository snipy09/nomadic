// Tailwind settings every Nomadic app shares (apps/desktop, apps/mac, apps/android): the @nomadic/ui preset, class
// dark mode and the two legacy colour scales still used by older screens. Each app's tailwind config spreads this and
// adds its own content paths (and, on Android, touch sizes).
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

module.exports = {
  presets: [require('@nomadic/ui/tailwind-preset')],
  darkMode: 'class',
  /** The shared UI and design system; apps append their own renderer files. */
  sharedContent: [path.join(root, 'packages/app-ui/src/**/*.{ts,tsx}'), path.join(root, 'packages/ui/src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      // Font families come from the @nomadic/ui preset (SF Pro on macOS, bundled Inter elsewhere).
      colors: {
        powder: {
          50: '#f0f7ff',
          100: '#e0f0fe',
          200: '#bae2fd',
          300: '#7cc9fa',
          400: '#38bdf8',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#082f49',
          950: '#041827',
        },
        brand: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
    },
  },
};
