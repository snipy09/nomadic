const path = require('node:path');

/** Mirrors how apps should consume the preset. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../tailwind-preset.cjs')],
  content: [path.join(__dirname, '**/*.{ts,tsx,html}'), path.join(__dirname, '../src/**/*.{ts,tsx}')],
};
