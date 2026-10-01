/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Archivo', 'system-ui', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        ultra: { DEFAULT: '#2338E0', light: '#A3AEF8', deep: '#1A2AB0' },
        ink: { DEFAULT: '#0A0F2C', soft: '#4A5170', pale: '#A9B0D0' },
        fog: '#EEF0F6',
        rule: '#CBD0E2',
        marigold: '#FFC21A',
      },
      borderRadius: {
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
};
