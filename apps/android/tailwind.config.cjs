// The shared Tailwind settings (packages/app-ui/build/tailwind-base.cjs) plus the phone's touch sizes.
const path = require('path');
const { sharedContent, ...base } = require('../../packages/app-ui/build/tailwind-base.cjs');
// Touch sizing: the shared controls (Button, Input, Select, IconButton) use the ctl-* sizes; on the phone they are
// 40/44/48 px instead of the desktop's 28/32/36 px, so every tap target is thumb-sized.
const touch = { 'ctl-sm': '40px', 'ctl-md': '44px', 'ctl-lg': '48px' };
module.exports = {
  ...base,
  theme: {
    ...base.theme,
    extend: { ...base.theme.extend, height: touch, minHeight: touch, width: touch, size: touch },
  },
  content: [...sharedContent, path.join(__dirname, 'src/**/*.{ts,tsx}'), path.join(__dirname, 'index.html')],
};
