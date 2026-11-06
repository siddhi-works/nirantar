import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The app talks to the live Nirantar API. Change API_TARGET in .env.local only if the owner tells you to.
const target = process.env.API_TARGET || 'https://nirantar-psi.vercel.app';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target, changeOrigin: true, secure: true,
        configure: proxy => {
          // The API only accepts writes that name its own site, and the cookie it sets is marked Secure (https only).
          proxy.on('proxyReq', req => { req.setHeader('origin', target); });
          proxy.on('proxyRes', res => { const c = res.headers['set-cookie']; if (c) res.headers['set-cookie'] = c.map(s => s.replace(/;\s*secure/gi, '')); });
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
