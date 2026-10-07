// The desktop renderer's Tailwind config with content paths that work from this folder.
const path = require('path');
const desktop = require('../desktop/tailwind.config.js');
// Touch sizing: the shared controls (Button, Input, Select, IconButton) use the ctl-* sizes; on the phone they are
// 40/44/48 px instead of the desktop's 28/32/36 px, so every tap target is thumb-sized.
const touch = { 'ctl-sm': '40px', 'ctl-md': '44px', 'ctl-lg': '48px' };
module.exports = {
  ...desktop,
  theme: {
    ...desktop.theme,
    extend: {
      ...(desktop.theme && desktop.theme.extend),
      height: { ...((desktop.theme && desktop.theme.extend && desktop.theme.extend.height) || {}), ...touch },
      minHeight: { ...((desktop.theme && desktop.theme.extend && desktop.theme.extend.minHeight) || {}), ...touch },
      width: { ...((desktop.theme && desktop.theme.extend && desktop.theme.extend.width) || {}), ...touch },
      size: { ...((desktop.theme && desktop.theme.extend && desktop.theme.extend.size) || {}), ...touch },
    },
  },
  content: [
    path.join(__dirname, '../desktop/src/renderer/**/*.{ts,tsx,html}'),
    path.join(__dirname, '../../packages/ui/src/**/*.{ts,tsx}'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
    path.join(__dirname, 'index.html'),
  ],
};
