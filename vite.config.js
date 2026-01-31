import { defineConfig } from 'vite';

export default defineConfig({
  // Ensure proper routing for SPA on GitHub Pages
  base: process.env.VITE_BASE_URL || '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
  define: {
    // Pass environment variables to frontend code
    __API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:3002'),
  },
});
