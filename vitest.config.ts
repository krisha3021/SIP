import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Tests run outside React Server Components; resolve the marker package to its no-op entry.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/finance/**/*.test.ts', 'tests/data/**/*.test.ts', 'tests/components/**/*.test.tsx', 'tests/api/**/*.test.ts', 'tests/security/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
