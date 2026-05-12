import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: [
      'src/tests/**/*.test.{ts,tsx}',
      'src/components/**/__tests__/**/*.test.{ts,tsx}',
    ],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@norfolk/shared': path.resolve(__dirname, '../../lib/shared/src'),
      '@shared': path.resolve(__dirname, '../../lib/shared/src'),
      '@engine': path.resolve(__dirname, '../../lib/engine/src'),
      '@calc': path.resolve(__dirname, '../../lib/calc/src'),
      '@analytics': path.resolve(__dirname, '../../lib/analytics/src'),
      '@domain': path.resolve(__dirname, '../../lib/domain/src'),
    },
  },
});
