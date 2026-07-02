import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base zodat de build ook werkt op GitHub Pages of een subpad.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
