// The desktop renderer's Tailwind config with content paths that work from this folder.
const path = require('path');
const desktop = require('../desktop/tailwind.config.js');
module.exports = {
  ...desktop,
  content: [
    path.join(__dirname, '../desktop/src/renderer/**/*.{ts,tsx,html}'),
    path.join(__dirname, '../../packages/ui/src/**/*.{ts,tsx}'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
    path.join(__dirname, 'index.html'),
  ],
};
