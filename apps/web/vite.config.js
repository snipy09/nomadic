import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute base: pages live at real paths (/download, /privacy), so relative asset URLs would break.
export default defineConfig({
  plugins: [react()],
  base: '/',
});
