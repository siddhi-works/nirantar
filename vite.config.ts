import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

import { readFileSync } from 'node:fs';

// The same headers Vercel will send (vercel.json), so a production build can be checked locally with `vite preview`.
const sent = Object.fromEntries(
  (JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')).headers[0].headers as { key: string; value: string }[]).map(h => [h.key, h.value]),
);

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  preview: { port: 4173, headers: sent, proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'], environment: 'node' },
});
