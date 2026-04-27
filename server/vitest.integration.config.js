import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/integrationSetup.js'],
    include: ['test/**/*.integration.test.js'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run integration tests sequentially to avoid DB race conditions
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
