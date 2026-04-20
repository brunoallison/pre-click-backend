import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    pool: 'forks',
    // Testes E2E rodam sequencialmente para evitar conflitos de porta/container
    fileParallelism: false,
    setupFiles: ['test/e2e/setup.ts'],
  },
});
