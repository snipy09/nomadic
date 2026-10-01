/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // SF Pro on Apple devices, Inter (its closest open cousin) everywhere else.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: '#1d1d1f',
        mist: '#f5f5f7',
        line: '#d2d2d7',
        muted: '#6e6e73',
        faint: '#86868b',
        accent: { DEFAULT: '#0071e3', hover: '#0077ed', soft: '#e8f2fd', bright: '#2997ff' },
        night: { DEFAULT: '#000000', card: '#161617', line: '#2a2a2c', text: '#f5f5f7', muted: '#a1a1a6' },
      },
      letterSpacing: {
        display: '-0.035em',
        headline: '-0.025em',
        body: '-0.011em',
      },
      maxWidth: { page: '1120px' },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.28, 0.11, 0.32, 1)',
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        fill: { from: { width: '0%' }, to: { width: 'var(--w)' } },
        caret: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(0.16,1,0.3,1) infinite',
        float: 'float 6s ease-in-out infinite',
        caret: 'caret 1s steps(1) infinite',
      },
    },
  },
  plugins: [],
};
