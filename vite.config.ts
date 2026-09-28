import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/',
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3040',
        changeOrigin: true,
        // The client module is /api.ts. Do not send that file to Express.
        bypass(req) {
          const path = String(req.url || '').split('?')[0];
          if (/\.[a-z0-9]+$/i.test(path)) return path;
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
