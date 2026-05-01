import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@server': path.resolve(__dirname, './src'),
    },
  },
});
