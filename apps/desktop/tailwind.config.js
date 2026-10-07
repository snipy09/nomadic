/** @type {import('tailwindcss').Config} */
const path = require('path');
const { sharedContent, ...base } = require('../../packages/app-ui/tooling/tailwind-base.cjs');

module.exports = {
  ...base,
  content: [path.join(__dirname, 'renderer/**/*.{ts,tsx,html}'), ...sharedContent],
};
