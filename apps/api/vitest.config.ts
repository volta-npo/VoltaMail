import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@email-automation/database': fileURLToPath(
        new URL('../../packages/database/src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
