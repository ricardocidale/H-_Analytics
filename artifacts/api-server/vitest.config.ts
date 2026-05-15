import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/report/**/*.test.ts'],
    alias: {
      '@shared': path.resolve(__dirname, '../../lib/shared/src'),
      '@norfolk/shared': path.resolve(__dirname, '../../lib/shared/src'),
      '@server': path.resolve(__dirname, './src'),
      '@workspace/db': path.resolve(__dirname, '../../lib/db/src'),
      '@engine': path.resolve(__dirname, '../../lib/engine/src'),
      '@calc': path.resolve(__dirname, '../../lib/calc/src'),
      '@analytics': path.resolve(__dirname, '../../lib/analytics/src'),
      '@domain': path.resolve(__dirname, '../../lib/domain/src'),
    },
  },
});
