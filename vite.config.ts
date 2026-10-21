import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: (id) => (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id) ? 'react' : undefined) },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
